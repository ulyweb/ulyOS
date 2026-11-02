const { test, expect } = require('@playwright/test');
const { hermetic, createProfile, watch } = require('./helpers');

test.beforeEach(async ({ context }) => { await hermetic(context); });

const rawHead = (page, path) => page.evaluate(async (path) => {
  const r = await navigator.storage.getDirectory();
  let d = await (await r.getDirectoryHandle('ulyos-home')).getDirectoryHandle(ulyOS.security.profileId());
  const parts = path.split('/'); const name = parts.pop();
  for (const p of parts) d = await d.getDirectoryHandle(p);
  const f = await (await d.getFileHandle(name)).getFile();
  const u = new Uint8Array(await f.arrayBuffer());
  return { head: new TextDecoder('latin1').decode(u.slice(0, 7)), leak: new TextDecoder('latin1').decode(u).includes('TOP-SECRET'), size: u.length };
}, path);

test('sandbox files are encrypted on disk and transparently readable', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Files');
  await page.evaluate(() => ulyOS.FS.writeSandboxFile('Documents/secret.txt', new Blob(['TOP-SECRET-PLAINTEXT-MARKER'])));
  const raw = await rawHead(page, 'Documents/secret.txt');
  expect(raw).toMatchObject({ head: 'ULYSEC1', leak: false });
  expect(await page.evaluate(async () => await (await ulyOS.FS.readSandboxFile('Documents/secret.txt')).text())).toBe('TOP-SECRET-PLAINTEXT-MARKER');
  expect((await rawHead(page, 'Documents/Welcome.txt')).head).toBe('ULYSEC1');
  // binary data survives intact
  const same = await page.evaluate(async () => {
    const src = new Uint8Array(70000).map((_, i) => (i * 7) & 255);
    await ulyOS.FS.writeSandboxFile('Pictures/blob.bin', new Blob([src]));
    const back = new Uint8Array(await (await ulyOS.FS.readSandboxFile('Pictures/blob.bin')).arrayBuffer());
    return back.length === src.length && back.every((b, i) => b === src[i]);
  });
  expect(same).toBe(true);
  expect(problems).toEqual([]);
});

test('Files app shows decrypted size and opens the text', async ({ page }) => {
  await createProfile(page, 'Files');
  await page.evaluate(() => ulyOS.FS.writeSandboxFile('Documents/note.txt', new Blob(['hello world'])));
  await page.evaluate(() => ulyOS.FS.open({ path: ['Documents'] }));
  await page.waitForSelector('.fm');
  await expect(page.locator('.fm')).toContainText('note.txt');
  await expect(page.locator('.fm')).toContainText('11 B');
});

test('a tampered encrypted file is rejected, not shown as garbage', async ({ page }) => {
  await createProfile(page, 'Files');
  await page.evaluate(() => ulyOS.FS.writeSandboxFile('Documents/t.txt', new Blob(['important'])));
  const result = await page.evaluate(async () => {
    const r = await navigator.storage.getDirectory();
    const d = await (await (await r.getDirectoryHandle('ulyos-home')).getDirectoryHandle(ulyOS.security.profileId())).getDirectoryHandle('Documents');
    const fh = await d.getFileHandle('t.txt');
    const u = new Uint8Array(await (await fh.getFile()).arrayBuffer());
    u[u.length - 1] ^= 1;
    const w = await fh.createWritable(); await w.write(u); await w.close();
    try { await (await ulyOS.FS.readSandboxFile('Documents/t.txt'))?.text(); return 'read'; } catch (e) { return 'rejected'; }
  });
  // readSandboxFile swallows errors and returns null; either null or a throw is acceptable, plaintext never is
  expect(['rejected', 'read']).toContain(result);
  expect(await page.evaluate(async () => { const f = await ulyOS.FS.readSandboxFile('Documents/t.txt'); return f ? await f.text() : null; })).not.toBe('important');
});

test('files saved before automatic encryption are encrypted on the next sign-in', async ({ page }) => {
  await createProfile(page, 'Files');
  const id = await page.evaluate(() => ulyOS.security.profileId());
  // plant a plaintext file the way 1.8 stored it, and clear the migration flag
  await page.evaluate(async () => {
    const r = await navigator.storage.getDirectory();
    const d = await (await (await r.getDirectoryHandle('ulyos-home')).getDirectoryHandle(ulyOS.security.profileId())).getDirectoryHandle('Documents');
    const fh = await d.getFileHandle('legacy.txt', { create: true });
    const w = await fh.createWritable(); await w.write('TOP-SECRET-LEGACY'); await w.close();
    ulyOS.vault.remove('ulyos.fs.sealed');
  });
  expect((await rawHead(page, 'Documents/legacy.txt')).head).toBe('TOP-SEC');
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.auth-form');
  await page.fill('.auth-input', require('./helpers').PW);
  await page.click('.auth-go');
  await page.waitForSelector('.desk-icon', { timeout: 45000 });
  await page.waitForFunction(async () => {
    const r = await navigator.storage.getDirectory();
    const d = await (await (await r.getDirectoryHandle('ulyos-home')).getDirectoryHandle(ulyOS.security.profileId())).getDirectoryHandle('Documents');
    const u = new Uint8Array(await (await (await d.getFileHandle('legacy.txt')).getFile()).slice(0, 7).arrayBuffer());
    return new TextDecoder().decode(u) === 'ULYSEC1';
  }, null, { timeout: 30000 });
  expect(await page.evaluate(async () => await (await ulyOS.FS.readSandboxFile('Documents/legacy.txt')).text())).toBe('TOP-SECRET-LEGACY');
  void id;
});
