const { test, expect } = require('@playwright/test');
const { hermetic, createProfile, watch } = require('./helpers');
const KEY = 'AIzaSy' + 'B'.repeat(33);
const HOST = 'generativelanguage.googleapis.com';

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });
test.beforeEach(async ({ context }) => { await hermetic(context); });

const sine = (secs, rate = 24000) => { const n = Math.round(secs * rate), b = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 330) * 12000), i * 2); return b; };

test('Jarvis: icon in Apps, settings validation, memory vault (notes, links, backlinks, search, daily note)', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Vaulty');
  await page.dblclick('.desk-icon[data-id="apps"]');
  await expect(page.locator('.fld-item:has-text("Jarvis")')).toHaveCount(1);
  expect(await page.evaluate(() => ulyOS.richIcons.has('jarvis'))).toBe(true);
  // hostile / odd settings are cleaned
  const c = await page.evaluate(() => ulyOS.Jarvis._test.clean({ name: '  <b>x</b>'.repeat(20), face: 'evil', pttKey: 'Enter', ports: { face: 80, hands: 'abc' }, personality: 'p'.repeat(5000), you: 'Bob' }));
  expect(c.name.length).toBeLessThanOrEqual(30); expect(c.face).toBe('board'); expect(c.pttKey).toBe('Space');
  expect(c.ports).toEqual({ face: 8790, hands: 8794 }); expect(c.personality.length).toBe(1200);
  await page.evaluate(() => ulyOS.Jarvis.open());
  await page.waitForSelector('.jv');
  await page.click('.jv-tabs button:has-text("Memory")');
  await expect(page.locator('.jv-item:has-text("Profile")')).toHaveCount(1);                 // seeded vault
  // new note that links to Profile → backlink on Profile
  await page.click('.jv-side button:has-text("New")');
  await page.fill('.modal input >> nth=0', 'Plan Alpha'); await page.fill('.modal input >> nth=1', 'Projects');
  await page.click('.modal button:has-text("Create")');
  await expect(page.locator('.jv-ntitle')).toHaveText('Projects/Plan Alpha.md');
  await page.fill('.jv-ed', '# Plan Alpha\n\nSee [[Profile]] and **bold** and <script>alert(1)</script>\n- one\n- two');
  await page.click('.jv-main button:has-text("Save")');
  await page.click('.jv-main button:has-text("Preview")');
  expect(await page.evaluate(() => document.querySelector('.jv-view script'))).toBeNull();      // never HTML
  await expect(page.locator('.jv-view a.jv-wl')).toHaveText('Profile');
  await page.click('.jv-view a.jv-wl');
  await expect(page.locator('.jv-ntitle')).toHaveText('Profile.md');
  await expect(page.locator('.jv-back .jv-item:has-text("Plan Alpha")')).toHaveCount(1);       // backlink
  await page.fill('.jv-side input[aria-label="Search notes"]', 'alert(1)');
  await expect(page.locator('.jv-nav .jv-item')).toHaveCount(1);                               // full-text search
  await page.fill('.jv-side input[aria-label="Search notes"]', '');
  // daily note from the template, stored encrypted in Files
  await page.click('.jv-side button:has-text("Today")');
  await expect(page.locator('.jv-ntitle')).toHaveText(/01 - Daily Notes\/\d{4}-\d{2}-\d{2}\.md/);
  expect(await page.inputValue('.jv-ed')).toContain('## Log');
  const raw = await page.evaluate(async () => { const d = await (await ulyOS.FS.roots.sandbox.handle.getDirectoryHandle('Jarvis Vault')).getFileHandle('Profile.md'); return new Uint8Array(await (await d.getFile()).slice(0, 7).arrayBuffer()).join(','); });
  expect(raw).toBe([...Buffer.from('ULYSEC1')].join(','));                                    // sealed at rest
  // vault wiki-link renderer is safe and the memory context carries the profile
  const ctx = await page.evaluate(async () => (await ulyOS.Jarvis.vault.read('Profile.md')).slice(0, 9));
  expect(ctx).toBe('# Profile');
  expect(problems).toEqual([]);
});

test('Jarvis Talk: persona + memory sent to Gemini Live, spoken greeting, face follows the conversation, voice commands, save to daily note', async ({ page }) => {
  const problems = watch(page);
  const seen = { setup: null, texts: [] };
  const pcm = sine(1.2);
  await page.addInitScript(() => {
    const ac = new AudioContext(), dest = ac.createMediaStreamDestination(), o = ac.createOscillator(); o.frequency.value = 300; o.connect(dest); o.start();
    navigator.mediaDevices.getUserMedia = async () => dest.stream;   // a steady tone instead of a real microphone
  });
  await page.routeWebSocket(new RegExp(HOST), (ws) => {
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.setup) { seen.setup = m.setup; ws.send(JSON.stringify({ setupComplete: {} })); return; }
      if (m.clientContent) {
        const t = m.clientContent.turns[0].parts[0].text; seen.texts.push(t);
        ws.send(JSON.stringify({ serverContent: { outputTranscription: { text: 'Hello Dana, what are we working on today?' }, modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: pcm.toString('base64') } }] } } }));
        ws.send(JSON.stringify({ serverContent: { turnComplete: true } }));
      }
    });
  });
  await createProfile(page, 'Talky');
  await page.evaluate((k) => { ulyOS.Gemini.setKey(k); ulyOS.vault.set('ulyos.jarvis', JSON.stringify({ name: 'Ada', you: 'Dana', personality: 'Be brief.', ptt: false })); }, KEY);
  await page.evaluate(() => ulyOS.Jarvis.open());
  await page.waitForSelector('.jv-stage canvas');
  // the face is really drawn (not blank) in every style, and survives a tab switch
  for (const f of ['board', 'radial', 'rain', 'neural']) {
    await page.selectOption('.jv select[aria-label="Face"]', f);
    await page.waitForTimeout(500);
    const lit = await page.evaluate(() => { const cv = document.querySelector('.jv-canvas'); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 37) if (d[i] + d[i + 1] + d[i + 2] > 120) n++; return n; });
    expect(lit, f + ' face draws').toBeGreaterThan(20);
  }
  await page.click('.jv-bar button:has-text("Start talking")');
  await expect(page.locator('.jv-status')).toContainText('Connected as Ada', { timeout: 20000 });
  expect(seen.setup.systemInstruction.parts[0].text).toContain('You are Ada');
  expect(seen.setup.systemInstruction.parts[0].text).toContain('Dana');
  expect(seen.setup.systemInstruction.parts[0].text).toContain('## Profile');                  // memory vault is part of the briefing
  await expect.poll(() => seen.texts.length).toBe(1);
  expect(seen.texts[0]).toContain('Hello Dana, what are we working on today?');               // the signature greeting is requested verbatim
  await expect(page.locator('.jv-line.ai')).toContainText('Hello Dana');
  await expect(page.locator('.jv-badge')).toHaveAttribute('data-s', /speaking|idle|thinking|listening/);
  await page.click('.jv-tabs button:has-text("Agent")');                                       // switching tabs does not drop the call
  await page.click('.jv-tabs button:has-text("Talk")');
  expect(await page.locator('.jv-bar button.danger').count()).toBe(1);
  // saved into today's daily note
  await page.click('button:has-text("Save to today")');
  await expect(page.locator('.toast.ok:has-text("Saved to 01 - Daily Notes")')).toHaveCount(1);
  expect(await page.evaluate(() => ulyOS.Jarvis.vault.read('01 - Daily Notes/' + new Date().toISOString().slice(0, 4) + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0') + '.md'))).toContain('Hello Dana');
  // voice commands are exact phrases
  expect(await page.evaluate(() => ulyOS.Jarvis._test.norm('Push-to-talk mode!'))).toBe('push to talk mode');
  await page.click('.jv-bar button:has-text("Stop")');
  expect(problems.filter((p) => !/WebSocket/i.test(p))).toEqual([]);
});

test('Jarvis Stack: install commands, local-service check, hands/face windows use loopback only, CSP allows only 127.0.0.1', async ({ page }) => {
  const problems = watch(page);
  const hits = [];
  await page.route(/127\.0\.0\.1:(8790|8794)/, (route) => { hits.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>local</title>ok' }); });
  await createProfile(page, 'Stacky');
  await page.evaluate(() => ulyOS.Jarvis.open());
  await page.click('.jv-tabs button:has-text("Stack")');
  await expect(page.locator('#jv-face-chip')).toContainText('running on port 8790', { timeout: 10000 });
  await expect(page.locator('#jv-hands-chip')).toContainText('running on port 8794');
  await expect(page.locator('.jv-cmd code').first()).toContainText('git clone https://github.com/jaredrhod/fullstack-agent');
  await expect(page.locator('.jv-card a[href^="https://github.com/jaredrhod/"]')).toHaveCount(4);
  await page.click('button:has-text("Open hands board")');
  await page.waitForSelector('iframe.app-frame');
  expect(await page.evaluate(() => document.querySelector('iframe.app-frame').src)).toBe('http://127.0.0.1:8794/stage.html');
  const csp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
  const loop = csp.match(/http:\/\/[^\s;]+/g);
  expect([...new Set(loop)].sort()).toEqual(['http://127.0.0.1:*', 'http://localhost:*']);   // no other plain-http origin is allowed
  expect(hits.length).toBeGreaterThan(1);
  expect(problems.filter((p) => !/127\.0\.0\.1/.test(p))).toEqual([]);
});
