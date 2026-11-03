const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const { test, expect } = require('@playwright/test');
const { PW, hermetic, createProfile, watch } = require('./helpers');

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });
test.beforeEach(async ({ context }) => { await hermetic(context); });

const rects = (page) => page.evaluate(() => {
  const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, id: e.dataset.id || e.getAttribute('aria-label') }; };
  return { wgts: [...document.querySelectorAll('.wgt')].map(r), icons: [...document.querySelectorAll('.desk-icon')].map(r), vw: innerWidth, vh: innerHeight };
});
const hit = (a, b) => a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1;
const noOverlap = ({ wgts, icons }) => {
  const bad = [];
  wgts.forEach((a, i) => { wgts.slice(i + 1).forEach((b) => hit(a, b) && bad.push('widget/widget ' + a.id + ' ' + b.id)); icons.forEach((c) => hit(a, c) && bad.push('widget/icon ' + a.id + ' ' + c.id)); });
  return bad;
};

test('widgets can be resized freely and reflow when the window changes size', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Wide');
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.evaluate(() => ['clock', 'notes', 'crypto', 'sports', 'system', 'calendar'].forEach((t) => ulyOS.Widgets.add(t, 'm')));
  await page.waitForSelector('.wgt-system');
  await page.waitForTimeout(400);
  expect(noOverlap(await rects(page))).toEqual([]);

  // free resize with the grip
  const w = page.locator('.wgt-notes');
  const before = await w.boundingBox();
  await w.hover();
  const grip = await page.locator('.wgt-notes .w-rz').boundingBox();
  await page.mouse.move(grip.x + 10, grip.y + 10); await page.mouse.down(); await page.mouse.move(grip.x + 10 + 120, grip.y + 10 + 64, { steps: 6 }); await page.mouse.up();
  const after = await w.boundingBox();
  expect(after.width).toBeGreaterThan(before.width + 80);
  expect(after.height).toBeGreaterThan(before.height + 40);
  expect(await page.evaluate(() => ulyOS.Widgets.list().find((i) => i.type === 'notes').w)).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  expect(noOverlap(await rects(page))).toEqual([]);

  // shrink the window: everything stays inside and nothing overlaps
  for (const [vw, vh] of [[1100, 760], [820, 640], [1500, 950]]) {
    await page.setViewportSize({ width: vw, height: vh });
    await page.waitForTimeout(700);
    const r = await rects(page);
    expect(noOverlap(r), vw + 'x' + vh).toEqual([]);
    for (const a of r.wgts) { expect(a.x).toBeGreaterThanOrEqual(-1); expect(a.x + a.w).toBeLessThanOrEqual(vw + 1); expect(a.y + a.h).toBeLessThanOrEqual(vh + 1); }
  }
  expect(problems).toEqual([]);
});

test('resized widget sizes survive export / import and are sanitised', async ({ page }) => {
  await createProfile(page, 'Wide');
  await page.evaluate(() => { const i = ulyOS.Widgets.add('notes', 'm'); });
  await page.evaluate(() => { ulyOS.Widgets.importList([{ type: 'notes', size: 'm', x: 10, y: 80, w: 500, h: 300 }, { type: 'clock', size: 's', x: 10, y: 80, w: 99999, h: -5 }]); });
  const l = await page.evaluate(() => ulyOS.Widgets.list().map((i) => [i.type, i.w, i.h]));
  expect(l[0]).toEqual(['notes', 500, 300]);
  expect(l[1][1]).toBeLessThanOrEqual(900); expect(l[1][2]).toBeGreaterThanOrEqual(120);
});

test('welcome screen and guided tour', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Tourist', PW, { tour: true });
  await page.waitForSelector('.welcome', { timeout: 8000 });
  await expect(page.locator('.welcome')).toContainText('Welcome to ulyOS');
  await expect(page.locator('.welcome')).toContainText('Private by design');
  await expect(page.locator('.welcome')).toContainText('v' + await page.evaluate(() => ulyOS.version));
  await page.click('.welcome button:has-text("Take the tour")');
  await page.waitForSelector('.tour-card');
  const n = await page.locator('.tour-dots i').count();
  expect(n).toBeGreaterThanOrEqual(10);
  await expect(page.locator('.tour-card')).toContainText('Welcome to ulyOS');
  await page.click('.tour-card button:has-text("Next")');
  await expect(page.locator('.tour-card')).toContainText('Why it is better');
  expect(await page.locator('.tour-card').innerText()).not.toContain('null');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tour-card')).toContainText('Who it is for');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tour-card')).toContainText('A calm desktop');
  await page.waitForFunction(() => { const h = document.querySelector('.tour-hole'); return h && h.getBoundingClientRect().width > 20; });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tour-card')).toContainText('Menu bar');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tour-card')).toContainText('Taskbar');
  expect(await page.evaluate(() => document.getElementById('taskbar').classList.contains('reveal'))).toBe(true);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.tour-card')).toContainText('Taskbar');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tour-card')).toHaveCount(0);
  expect(await page.evaluate(() => document.getElementById('taskbar').classList.contains('reveal'))).toBe(false);
  // seen: next sign-in does not show it
  expect(await page.evaluate(() => ulyOS.vault.get('ulyos.tour.seen'))).toBe('1');
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.auth-form'); await page.fill('.auth-input', PW); await page.click('.auth-go'); await page.waitForSelector('.desk-icon', { timeout: 45000 });
  await page.waitForTimeout(2600);
  await expect(page.locator('.welcome')).toHaveCount(0);
  // replay from Help, and through the whole tour to Finish
  await page.click('#menubar .mb-btn:has-text("Help")');
  await page.click('.ctx-item:has-text("Guided tour")');
  for (let k = 0; k < n - 1; k++) await page.click('.tour-card button.primary');
  await expect(page.locator('.tour-card button.primary')).toHaveText('Finish');
  await page.click('.tour-card button.primary');
  await expect(page.locator('.tour-card')).toHaveCount(0);
  // "show on every sign-in"
  await page.evaluate(() => ulyOS.desktopApi.Settings.set('welcomeAlways', true));
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.auth-form'); await page.fill('.auth-input', PW); await page.click('.auth-go');
  await page.waitForSelector('.welcome', { timeout: 15000 });
  await page.keyboard.press('Enter');
  await expect(page.locator('.welcome')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('About shows the version in the Help menu dialog and in Settings', async ({ page }) => {
  await createProfile(page, 'Ver');
  const v = await page.evaluate(() => ulyOS.version);
  await page.click('#menubar .mb-btn:has-text("Help")');
  await expect(page.locator('.ctx-item:has-text("About ulyOS")')).toContainText(v);
  await page.click('.ctx-item:has-text("About ulyOS")');
  await expect(page.locator('.modal-title')).toContainText('ulyOS ' + v);
  await expect(page.locator('.modal-msg')).toContainText('Version ' + v);
  await page.click('.modal button:has-text("Version history")');
  await expect(page.locator('.about-ver')).toContainText('version ' + v);
});

test('Speak can record to WAV and MP3 (audio pipeline, with a simulated tab capture)', async ({ page }) => {
  await page.addInitScript(() => {
    const ac = new AudioContext(); let dest = null;
    window.__ac = ac;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [], cancel() {}, pause() {}, resume() {}, addEventListener() {},
      speak(u) { ac.resume(); const o = ac.createOscillator(); o.frequency.value = 440; const g = ac.createGain(); g.gain.value = 0.4; o.connect(g).connect(dest); o.start(); setTimeout(() => { o.stop(); u.onend && u.onend(); }, 1200); },
    } });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    navigator.mediaDevices.getDisplayMedia = async () => { dest = ac.createMediaStreamDestination(); const c = document.createElement('canvas'); c.width = c.height = 8; const v = c.captureStream(1).getVideoTracks()[0]; return new MediaStream([v, ...dest.stream.getAudioTracks()]); };   // a fresh capture each time, like a real browser
  });
  const problems = watch(page);
  await createProfile(page, 'Rec');
  for (const fmt of ['wav', 'mp3']) {
    const r = await page.evaluate(async (fmt) => {
      const blob = await ulyOS.Speech.record('hello recording', fmt);
      const u = new Uint8Array(await blob.arrayBuffer());
      return { type: blob.type, size: blob.size, head: Array.from(u.slice(0, 4)), riff: String.fromCharCode(...u.slice(0, 4)), wave: String.fromCharCode(...u.slice(8, 12)), rate: new DataView(u.buffer).getUint32(24, true), dataLen: new DataView(u.buffer).getUint32(40, true) };
    }, fmt);
    if (fmt === 'wav') { expect(r.type).toBe('audio/wav'); expect(r.riff + r.wave).toBe('RIFFWAVE'); const secs = r.dataLen / 2 / r.rate; expect(secs).toBeGreaterThan(0.9); expect(secs).toBeLessThan(2.2); }
    else { expect(r.type).toBe('audio/mpeg'); expect(r.size).toBeGreaterThan(4000); expect(r.head[0] === 0xff || (r.head[0] === 0x49 && r.head[1] === 0x44)).toBe(true); }
  }
  // silence → clear error, not an empty file
  const err = await page.evaluate(async () => {
    navigator.mediaDevices.getDisplayMedia = async () => { const ac = new AudioContext(), d = ac.createMediaStreamDestination(); const c = document.createElement('canvas'); c.width = c.height = 8; return new MediaStream([c.captureStream(1).getVideoTracks()[0], ...d.stream.getAudioTracks()]); };
    try { await ulyOS.Speech.record('quiet', 'wav'); return 'ok'; } catch (e) { return e.message; }
  });
  expect(err).toMatch(/Nothing was captured/);
  // no audio shared → helpful message
  const err2 = await page.evaluate(async () => {
    navigator.mediaDevices.getDisplayMedia = async () => { const c = document.createElement('canvas'); c.width = c.height = 8; return new MediaStream([c.captureStream(1).getVideoTracks()[0]]); };
    try { await ulyOS.Speech.record('x', 'wav'); return 'ok'; } catch (e) { return e.message; }
  });
  expect(err2).toMatch(/Share tab audio/);
  expect(problems).toEqual([]);
});

/* ---------- offline server (python) ---------- */
const py = (dir, port, env = {}) => cp.spawn('python3', ['server.py', String(port)], { cwd: dir, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
const waitExit = (p, ms) => new Promise((res) => { const t = setTimeout(() => res(false), ms); p.on('exit', () => { clearTimeout(t); res(true); }); });
const http = async (port, method, url, headers = {}) => { try { return (await fetch('http://127.0.0.1:' + port + url, { method, headers })).status; } catch { return 0; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function offlineDir(page) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ulyos-off-'));
  fs.writeFileSync(path.join(dir, 'server.py'), await page.evaluate(() => ulyOS.offline.SERVER_PY));
  fs.writeFileSync(path.join(dir, 'index.html'), 'hi');
  return dir;
}

test('offline server: quits on request, on heartbeat loss and after the tab closes; rejects foreign callers', async ({ page }) => {
  await page.goto('/index.html');
  const dir = await offlineDir(page);
  let p = py(dir, 8841); await sleep(900);
  expect(await http(8841, 'GET', '/index.html')).toBe(200);
  expect(await http(8841, 'GET', '/__ping')).toBe(204);
  expect(await http(8841, 'POST', '/__quit')).toBe(404);                                              // missing marker header
  expect(await http(8841, 'POST', '/__quit', { 'X-ulyOS': '1', Origin: 'https://evil.example' })).toBe(403);   // another website cannot stop it
  expect(p.exitCode).toBeNull();
  expect(await http(8841, 'POST', '/__quit', { 'X-ulyOS': '1' })).toBe(200);
  expect(await waitExit(p, 4000)).toBe(true);

  p = py(dir, 8842, { ULYOS_IDLE: '2' }); await sleep(900);
  await http(8842, 'GET', '/__ping');
  expect(await waitExit(p, 6000)).toBe(true);                                                          // heartbeat stopped

  p = py(dir, 8843, { ULYOS_BYE: '2' }); await sleep(900);
  await http(8843, 'GET', '/__ping'); await http(8843, 'POST', '/__bye'); await sleep(900); await http(8843, 'GET', '/__ping');   // reload: back before the grace ends
  await sleep(2500); expect(p.exitCode).toBeNull();
  await http(8843, 'POST', '/__bye');
  expect(await waitExit(p, 5000)).toBe(true);                                                          // tab really closed
  const busy = py(dir, 8844); await sleep(800); const second = py(dir, 8844); expect(await waitExit(second, 3000)).toBe(true); busy.kill();
});

test('offline build: "Quit ulyOS" stops the server and shows a goodbye screen', async ({ page, browser }) => {
  await page.goto('/index.html');
  const dir = await offlineDir(page);
  for (const f of ['index.html', 'manifest.webmanifest', 'sw.js']) fs.copyFileSync(f, path.join(dir, f));
  for (const d of ['css', 'js', 'apps', 'icons', 'vendor']) fs.cpSync(d, path.join(dir, d), { recursive: true });
  fs.writeFileSync(path.join(dir, 'js/config.js'), 'window.ulyOS=window.ulyOS||{};ulyOS.config={OFFLINE:true,CONTACT_ENDPOINT:"",CONTACT_EMAIL:"",NOTIFY_ON_PROFILE:false,FILES:[]};');
  const srv = py(dir, 8845); await sleep(900);
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 850 } });
  const p2 = await ctx.newPage();
  const problems = watch(p2);
  await p2.goto('http://localhost:8845/index.html'); await p2.waitForSelector('.auth-form');
  await p2.fill('input[placeholder="Profile name"]', 'Off'); await p2.fill('.pwc input[placeholder="Password"]', PW); await p2.fill('.pwc input[placeholder="Confirm"]', PW); await p2.click('button:has-text("Create profile")');
  await p2.waitForSelector('.desk-icon', { timeout: 45000 });
  await p2.evaluate(() => ulyOS.vault.set('ulyos.tour.seen', '1'));
  await p2.waitForFunction(() => ulyOS.offline.canQuit(), null, { timeout: 8000 });
  await p2.click('#tray-user');   // profile chip
  await p2.click('.ctx-item:has-text("Quit ulyOS")');
  await p2.click('.modal button:has-text("Quit")');
  await expect(p2.locator('body')).toContainText('ulyOS has stopped');
  expect(await waitExit(srv, 5000)).toBe(true);
  expect(problems.filter((x) => !/net::|Failed to fetch/.test(x))).toEqual([]);
  await ctx.close();
});

test('widgets stay pinned to the edge they were placed against, return when the window returns, and never overlap', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Pin');
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.evaluate(() => ['clock', 'notes', 'crypto', 'system'].forEach((t) => ulyOS.Widgets.add(t, 'm')));
  await page.waitForSelector('.wgt-system'); await page.waitForTimeout(500);
  const gaps = () => page.evaluate(() => { const d = document.getElementById('desktop').getBoundingClientRect(); return [...document.querySelectorAll('.wgt')].map((w) => { const r = w.getBoundingClientRect(); return { id: w.dataset.id, right: Math.round(d.right - r.right), top: Math.round(r.top - d.top), w: Math.round(r.width) }; }); });
  const before = await gaps();
  expect(before.every((g) => g.right < 100)).toBe(true);   // they start at the right edge
  for (const [vw, vh] of [[1900, 1000], [1200, 800], [1000, 700], [1500, 950]]) {
    await page.setViewportSize({ width: vw, height: vh });
    await page.waitForTimeout(700);
    const r = await rects(page);
    expect(noOverlap(r), vw + 'x' + vh).toEqual([]);
    if (vw >= 1200) {   // wide enough that nothing needs to move: the right gap is unchanged (pinned to the right edge)
      const now = await gaps();
      for (const g of now) { const b = before.find((x) => x.id === g.id); expect(Math.abs(g.right - b.right), 'right gap ' + vw).toBeLessThanOrEqual(1); }
    }
    // never under the menu bar or the revealed dock area
    const inside = await page.evaluate(() => { const d = document.getElementById('desktop').getBoundingClientRect(); return [...document.querySelectorAll('.wgt')].every((w) => { const r = w.getBoundingClientRect(); return r.top >= d.top - 1 && r.bottom <= d.bottom + 1 && r.left >= d.left - 1 && r.right <= d.right + 1; }); });
    expect(inside, vw + 'x' + vh + ' inside desktop').toBe(true);
  }
  const back = await gaps();
  for (const g of back) { const b = before.find((x) => x.id === g.id); expect(g.right).toBe(b.right); expect(g.top).toBe(b.top); }   // exactly where they were
  // a widget moved to the left edge stays at the left edge when the window grows
  await page.evaluate(() => { const l = ulyOS.Widgets.list().find((i) => i.type === 'clock'); const el = document.querySelector('.wgt-clock'); el.style.left = '260px'; el.style.top = '420px'; });
  const box0 = await page.locator('.wgt-clock').boundingBox();
  await page.mouse.move(box0.x + 100, box0.y + 40); await page.mouse.down(); await page.mouse.move(box0.x + 100 - 30, box0.y + 40, { steps: 4 }); await page.mouse.up();
  const l1 = await page.locator('.wgt-clock').boundingBox();
  await page.setViewportSize({ width: 1900, height: 950 }); await page.waitForTimeout(700);
  const l2 = await page.locator('.wgt-clock').boundingBox();
  expect(Math.abs(l2.x - l1.x)).toBeLessThanOrEqual(2);
  expect(noOverlap(await rects(page))).toEqual([]);
  expect(problems).toEqual([]);
});
