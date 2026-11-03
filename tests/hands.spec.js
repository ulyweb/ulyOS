const { test, expect } = require('@playwright/test');
const { hermetic, createProfile, watch } = require('./helpers');
const KEY = 'AIzaSy' + 'C'.repeat(33);
const HOST = 'generativelanguage.googleapis.com';

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] } });
test.beforeEach(async ({ context }) => { await hermetic(context); });

const openHands = async (page) => { await page.evaluate(() => ulyOS.Jarvis.open()); await page.waitForSelector('.jv'); await page.click('.jv-tabs button:has-text("Hands")'); await page.waitForSelector('.jv-hands .hd-card'); };

test('Hands: gesture maths hold at any hand size; engine grabs, moves, taps, throws, scales and claps', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Handy');
  await openHands(page);
  const m = await page.evaluate(() => {
    const G = ulyOS.Hands.gesture;
    const hand = (scale, pinchGap, extended) => {
      const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
      lm[0] = { x: 0.5, y: 0.8 }; lm[9] = { x: 0.5, y: 0.8 - 0.2 * scale };               // size = 0.2 * scale
      const tipY = extended ? 0.8 - 0.42 * scale : 0.8 - 0.12 * scale, pipY = 0.8 - 0.22 * scale;
      for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) { lm[tip] = { x: 0.5, y: tipY }; lm[pip] = { x: 0.5, y: pipY }; }
      lm[4] = { x: 0.5 + pinchGap * 0.2 * scale, y: tipY }; lm[8] = { x: 0.5, y: tipY };
      return lm;
    };
    return { pinchSmall: G.pinchRatio(hand(0.4, 0.2, true)), pinchBig: G.pinchRatio(hand(2.2, 0.2, true)), open: G.isOpenPalm(hand(1, 1.2, true)), fist: G.fingers(hand(1, 1.2, false)).count, pinched: G.pinchRatio(hand(1, 0.1, true)), up: G.isUp(hand(1, 1, true)) };
  });
  expect(Math.abs(m.pinchSmall - m.pinchBig)).toBeLessThan(0.01);          // ratios do not depend on camera distance
  expect(m.pinched).toBeLessThan(0.4); expect(m.open).toBe(true); expect(m.fist).toBe(0); expect(m.up).toBe(true);
  const r = await page.evaluate(async () => {
    const b = ulyOS.Jarvis.board, eng = b._engine, cards = b._cards, out = {};
    b.clear(); await new Promise((r) => setTimeout(r, 400));
    const c = b.add({ title: 'T', body: 'x', x: 300, y: 200 }); const hd = (x, y, pinch, extra = {}) => ({ cursor: { x, y }, pinch, open: false, up: false, size: 100, wrist: { x, y }, ...extra });
    let t = 1000; const step = (hands) => { t += 16; eng.update(hands, t); };
    // grab + move
    step([hd(300, 200, true)]); step([hd(360, 240, true)]); step([hd(420, 280, true)]); out.moved = [Math.round(c.x), Math.round(c.y)];
    // slow release: no throw
    for (let i = 0; i < 20; i++) step([hd(420, 280, true)]); step([hd(420, 280, false)]); out.noThrow = c.vx === 0 && c.vy === 0;
    // flick: throw
    step([hd(420, 280, true)]); for (let i = 1; i <= 5; i++) step([hd(420 + i * 60, 280, true)]); step([hd(720, 280, false)]); out.thrown = Math.abs(c.vx) > 10;
    c.vx = c.vy = 0;
    // quick tap on the card closes it
    step([hd(c.x, c.y, true)]); step([hd(c.x, c.y, false)]); await new Promise((r) => setTimeout(r, 400)); out.tapClosed = !cards.includes(c);
    // two hands scale one card
    const d = b.add({ title: 'S', body: 'y', x: 400, y: 220 });
    step([hd(380, 220, true), hd(420, 220, true)]); step([hd(300, 220, true), hd(500, 220, true)]); out.scaled = d.scale; step([hd(300, 220, false), hd(500, 220, false)]);
    // clap sweeps the board clean
    b.add({ title: 'A', body: 'a' }); b.add({ title: 'B', body: 'b' });
    const open = (x, y) => hd(x, y, false, { open: true, up: true, size: 100, wrist: { x, y } });
    step([open(100, 300), open(700, 300)]); step([open(300, 300), open(500, 300)]); step([open(380, 300), open(420, 300)]);
    await new Promise((r) => setTimeout(r, 600)); out.clapped = cards.length === 0;
    return out;
  });
  expect(r.moved[0]).toBeGreaterThan(380); expect(r.moved[1]).toBeGreaterThan(240);
  expect(r.noThrow).toBe(true); expect(r.thrown).toBe(true); expect(r.tapClosed).toBe(true);
  expect(r.scaled).toBeGreaterThan(1.5); expect(r.clapped).toBe(true);
  expect(problems).toEqual([]);
});

test('Hands: the real camera pipeline loads the vendored MediaPipe (WebAssembly under the CSP) and runs on live frames; notes and images become cards', async ({ page }) => {
  test.setTimeout(150000);
  const problems = watch(page);
  const reqs = [];
  page.on('request', (r) => { if (/^https?:/.test(r.url())) reqs.push(r.url()); });
  await createProfile(page, 'Cam');
  await openHands(page);
  await page.click('.jv-hands button:has-text("Start camera")');
  await expect(page.locator('.hd-status')).toContainText('Hand tracking is on', { timeout: 100000 });
  await expect.poll(() => page.evaluate(() => ulyOS.Jarvis.board._frames()), { timeout: 30000 }).toBeGreaterThan(3);   // inference really ran
  expect(await page.evaluate(() => ulyOS.Jarvis.board._running())).toBe(true);
  const origin = new URL(page.url()).origin;
  expect(reqs.filter((u) => !u.startsWith(origin + '/'))).toEqual([]);                                              // everything is served from ulyOS itself, nothing from a CDN
  expect(reqs.some((u) => u.endsWith('hand_landmarker.task'))).toBe(true);
  // notes orb → list → note card (markdown, no HTML)
  await page.click('.hd-ring', { force: true }); await page.click('.hd-orb:has-text("Notes")');
  await expect(page.locator('.hd-card:has-text("Notes") .hd-note').first()).toBeVisible();
  await page.click('.hd-note:has-text("Profile")');
  await expect(page.locator('.hd-card:has-text("Profile") h3')).toHaveCount(1);
  // image card from a file
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('.jv-hands input[type=file]', { name: 'dot.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.hd-card img')).toHaveCount(1);
  await page.setInputFiles('.jv-hands input[type=file]', { name: 'evil.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>') });
  await expect(page.locator('.hd-card img')).toHaveCount(1);                               // SVG is refused
  await page.click('.jv-hands button:has-text("Stop camera")');
  await expect.poll(() => page.evaluate(() => ulyOS.Jarvis.board._running())).toBe(false);
  expect(problems).toEqual([]);
});

test('Jarvis tools: the assistant searches and reads notes, asks before writing (button or spoken yes/no), and shows things on the board', async ({ page }) => {
  const problems = watch(page);
  const seen = { tools: [], responses: [], setup: null };
  let ws0 = null;
  await page.addInitScript(() => {
    const ac = new AudioContext(), dest = ac.createMediaStreamDestination(), o = ac.createOscillator(); o.frequency.value = 300; o.connect(dest); o.start();
    navigator.mediaDevices.getUserMedia = async () => dest.stream;
  });
  await page.routeWebSocket(new RegExp(HOST), (ws) => {
    ws0 = ws;
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.setup) { seen.setup = m.setup; ws.send(JSON.stringify({ setupComplete: {} })); return; }
      if (m.toolResponse) seen.responses.push(...m.toolResponse.functionResponses);
    });
  });
  await createProfile(page, 'Tooly');
  await page.evaluate((k) => { ulyOS.Gemini.setKey(k); ulyOS.vault.set('ulyos.jarvis', JSON.stringify({ name: 'Ada', you: 'Dana', permission: 'ask' })); }, KEY);
  await page.evaluate(() => ulyOS.Jarvis.open());
  await page.click('.jv-bar button:has-text("Start talking")');
  await expect(page.locator('.jv-status')).toContainText('Connected as Ada', { timeout: 20000 });
  expect(seen.setup.tools[0].functionDeclarations.map((f) => f.name)).toEqual(['search_notes', 'read_note', 'write_note', 'present', 'get_board']);
  expect(seen.setup.generationConfig.responseModalities).toEqual(['AUDIO']);
  const call = (id, name, args) => ws0.send(JSON.stringify({ toolCall: { functionCalls: [{ id, name, args }] } }));
  const got = (id) => expect.poll(() => seen.responses.find((r) => r.id === id), { timeout: 15000 });
  call('c1', 'search_notes', { query: 'profile' }); await got('c1').toBeTruthy();
  expect(JSON.stringify(seen.responses.find((r) => r.id === 'c1').response)).toContain('Profile.md');
  call('c2', 'read_note', { path: 'Profile.md' }); await got('c2').toBeTruthy();
  expect(seen.responses.find((r) => r.id === 'c2').response.output).toContain('# Profile');
  // write: asks first; Deny keeps the note unchanged
  call('c3', 'write_note', { path: 'Inbox/From Ada.md', content: 'remember the milk', mode: 'append' });
  await expect(page.locator('.modal:has-text("Allow this?")')).toContainText('Inbox/From Ada.md');
  await page.click('.modal button:has-text("Deny")'); await got('c3').toBeTruthy();
  expect(seen.responses.find((r) => r.id === 'c3').response.error).toContain('said no');
  expect(await page.evaluate(() => ulyOS.Jarvis.vault.read('Inbox/From Ada.md', true))).toBeNull();
  // write again: Allow writes it
  call('c4', 'write_note', { path: 'Inbox/From Ada.md', content: 'remember the milk', mode: 'append' });
  await page.click('.modal button:has-text("Allow")'); await got('c4').toBeTruthy();
  expect(await page.evaluate(() => ulyOS.Jarvis.vault.read('Inbox/From Ada.md'))).toContain('remember the milk');
  // write once more: a spoken "yes" allows it
  call('c5', 'write_note', { path: 'Inbox/Voice.md', content: 'by voice' });
  await expect(page.locator('.modal:has-text("Allow this?")')).toHaveCount(1);
  ws0.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'yes' } } })); await got('c5').toBeTruthy();
  expect(await page.evaluate(() => ulyOS.Jarvis.vault.read('Inbox/Voice.md'))).toContain('by voice');
  // path tricks stay inside the vault
  call('c6', 'write_note', { path: '../../escape.md', content: 'x', mode: 'replace' }); await page.click('.modal button:has-text("Allow")'); await got('c6').toBeTruthy();
  expect(await page.evaluate(() => ulyOS.Jarvis.vault.read('escape.md', true))).toContain('x');
  // present puts a spotlit card on the board
  call('c7', 'present', { title: 'THE PLAN', body: 'Step one' }); await got('c7').toBeTruthy();
  await expect(page.locator('.jv-hands .hd-card.spot')).toContainText('THE PLAN');
  call('c8', 'get_board', {}); await got('c8').toBeTruthy();
  expect(JSON.stringify(seen.responses.find((r) => r.id === 'c8').response)).toContain('THE PLAN');
  // auto-approve skips the question
  await page.evaluate(() => ulyOS.vault.set('ulyos.jarvis', JSON.stringify({ ...JSON.parse(ulyOS.vault.get('ulyos.jarvis')), permission: 'auto' })));
  call('c9', 'write_note', { path: 'Inbox/Auto.md', content: 'no prompt' }); await got('c9').toBeTruthy();
  expect(await page.evaluate(() => ulyOS.Jarvis.vault.read('Inbox/Auto.md'))).toContain('no prompt');
  expect(problems.filter((p) => !/WebSocket/i.test(p))).toEqual([]);
});
