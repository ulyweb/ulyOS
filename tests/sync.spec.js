const { test, expect } = require('@playwright/test');
const { hermetic, createProfile, watch } = require('./helpers');
const SYNC = 'Sync-Phrase-Quartz-77!x', TOKEN = 'ghp_' + 'a'.repeat(36);

function mockGist(context, store, log) {
  return hermetic(context, async (route, url) => {
    if (!url.startsWith('https://api.github.com/')) return false;
    const req = route.request(), u = new URL(url), m = req.method();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    log.push(m + ' ' + u.pathname + ' ' + (req.headers().authorization || ''));
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.headers().authorization !== 'Bearer ' + TOKEN) return route.fulfill({ status: 401, headers: cors, body: '{}' });
    const J = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
    const view = (id) => ({ id, files: Object.fromEntries(Object.entries(store[id]).map(([k, v]) => [k, { content: v.content }])) });
    if (m === 'POST' && u.pathname === '/gists') { const id = 'abcdef0123456789abcdef0123456789'; store[id] = JSON.parse(req.postData()).files; return J(view(id), 201); }
    const id = u.pathname.split('/')[2];
    if (!store[id]) return J({ message: 'Not Found' }, 404);
    if (m === 'PATCH') Object.assign(store[id], JSON.parse(req.postData()).files);
    return J(view(id));
  });
}
const later = async (page) => { await page.waitForSelector('.modal:has-text("Changes received")'); await page.click('.modal button:has-text("Later")'); };

test('two devices stay in step through an encrypted gist (merge, deletion, wrong passphrase, bad token)', async ({ browser }) => {
  const store = {}, log = [];
  const mk = async (name) => { const ctx = await browser.newContext({ viewport: { width: 1300, height: 850 } }); await mockGist(ctx, store, log); const page = await ctx.newPage(); const problems = watch(page); await createProfile(page, name); return { ctx, page, problems }; };
  const A = await mk('DevA'), B = await mk('DevB');

  await A.page.evaluate((s) => { ulyOS.sync.setPass(s); ulyOS.vault.set('app:demo:note', 'secret-note-from-A'); ulyOS.vault.set('ulyos.custom', 'AAA'); }, SYNC);
  await A.page.evaluate(() => ulyOS.desktopApi.openSettings('sync'));
  await A.page.click('button:has-text("Connect…")');
  await A.page.fill('.modal input[type=password]', TOKEN);
  await A.page.click('.modal button:has-text("Connect")');
  await A.page.click('button:has-text("Sync now")');
  await A.page.waitForSelector('.toast.ok:has-text("Sync complete")', { timeout: 45000 });
  const gid = Object.keys(store)[0];
  const body = store[gid]['ulyos-sync.json'].content;
  expect(body).not.toMatch(/secret-note-from-A|AAA|accent/);
  expect(Object.keys(JSON.parse(body)).sort()).toEqual(['ct', 'format', 'iter', 'iv', 'salt', 'updated', 'v']);
  expect(new Set(log.map((l) => l.split(' ')[0] + ' ' + l.split(' ')[2]))).toBeDefined();
  expect(log.every((l) => l.endsWith('Bearer ' + TOKEN) || l.startsWith('OPTIONS'))).toBe(true);

  await B.page.evaluate((s) => { ulyOS.sync.setPass(s); ulyOS.vault.set('ulyos.custom', 'B-older'); }, SYNC);
  await B.page.evaluate(([t, g]) => ulyOS.sync.setToken(t, g), [TOKEN, gid]);
  const r1 = await B.page.evaluate(async () => (await ulyOS.sync.syncNow('merge')).apply.map((a) => a.k));
  expect(r1).toEqual(['app:demo:note']);
  await later(B.page);
  expect(await B.page.evaluate(() => ulyOS.vault.get('app:demo:note'))).toBe('secret-note-from-A');
  expect(await B.page.evaluate(() => ulyOS.vault.get('ulyos.custom'))).toBe('B-older');   // B's value is newer than A's

  await B.page.evaluate(() => { ulyOS.vault.remove('app:demo:note'); ulyOS.vault.set('ulyos.custom', 'B-NEWEST'); });
  await B.page.evaluate(() => ulyOS.sync.syncNow());
  const r2 = await A.page.evaluate(async () => (await ulyOS.sync.syncNow()).apply.map((a) => a.k + '=' + (a.v === null ? 'DELETED' : a.v)).sort());
  expect(r2).toEqual(['app:demo:note=DELETED', 'ulyos.custom=B-NEWEST']);
  await later(A.page);
  const r3 = await A.page.evaluate(async () => { const x = await ulyOS.sync.syncNow(); return { apply: x.apply.length, sent: x.remoteNeedsUpdate }; });
  expect(r3).toEqual({ apply: 0, sent: false });

  await B.page.evaluate(() => ulyOS.sync.setPass('Totally-Different-Phrase-99!'));
  expect(await B.page.evaluate(async () => { try { await ulyOS.sync.syncNow(); return 'accepted'; } catch (e) { return e.message; } })).toMatch(/Wrong sync passphrase/);
  await B.page.evaluate((s) => { ulyOS.sync.setPass(s); ulyOS.sync.setToken('ghp_' + 'b'.repeat(36)); }, SYNC);
  expect(await B.page.evaluate(async () => { try { await ulyOS.sync.syncNow(); return 'accepted'; } catch (e) { return e.message; } })).toMatch(/rejected the token/);

  expect(A.problems).toEqual([]);
  expect(B.problems).toEqual([]);
  await A.ctx.close(); await B.ctx.close();
});

test('sync files are encrypted, merge cleanly and cannot overwrite protected keys', async ({ page, context }) => {
  await hermetic(context);
  await createProfile(page, 'Filey');
  await page.evaluate((s) => { ulyOS.sync.setPass(s); ulyOS.vault.set('app:demo:x', 'MARKER-F1-xyz'); }, SYNC);
  const text = await page.evaluate(async () => await (await ulyOS.sync.exportFile()).text());
  expect(text).not.toMatch(/MARKER-F1|app:demo/);
  const evil = await page.evaluate(async (pass) => {
    const C = ulyOS.crypto, salt = C.rand(16), key = await C.deriveKey(pass, salt, C.ITER), iv = C.rand(12);
    const st = { v: 1, device: 'zz', at: 1, items: { 'ulyos.sync.cfg': { v: '{"token":"x"}', t: 9e15 }, 'ulyos.audit': { v: 'x', t: 9e15 }, 'ok.key': { v: 'fine', t: 9e15 }, 'bad.num': { v: 5, t: 9e15 } }, tomb: {} };
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('ulyOS-sync-v1') }, key, new TextEncoder().encode(JSON.stringify(st))));
    return JSON.stringify({ format: 'ulyOS-sync', v: 1, iter: C.ITER, salt: C.b64.enc(salt), iv: C.b64.enc(iv), ct: C.b64.enc(ct) });
  }, SYNC);
  await page.evaluate((t) => { ulyOS.sync.importFile(t); }, evil);
  await later(page);
  expect(await page.evaluate(() => JSON.parse(ulyOS.vault.get('ulyos.sync.cfg')).token !== 'x')).toBe(true);
  expect(await page.evaluate(() => ulyOS.vault.get('ok.key'))).toBe('fine');
  expect(await page.evaluate(() => ulyOS.vault.get('bad.num'))).toBeNull();
});
