const { test, expect } = require('@playwright/test');
const { PW, hermetic, createProfile, watch } = require('./helpers');
const SYNC = 'Sync-Phrase-Quartz-77!x';

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });
test.beforeEach(async ({ context }) => { await hermetic(context); });

test('dark / light theme: tray button, settings, persistence incl. profile screen', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Theme');
  const info = () => page.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor, text: getComputedStyle(document.body).color, stored: localStorage.getItem('ulyos.theme') }));
  const dark = await info();
  expect(dark.theme).toBe('dark');
  await expect(page.locator('#tray-theme')).toBeVisible();
  await page.click('#tray-theme');
  const light = await info();
  expect(light).toMatchObject({ theme: 'light', stored: 'light' });
  expect(light.text).not.toBe(dark.text);
  // a window is light too: readable (dark text on light panel)
  await page.evaluate(() => ulyOS.desktopApi.openSettings('appearance'));
  await page.waitForSelector('.set-content');
  const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const win = await page.evaluate(() => { const w = document.querySelector('.window'); const cs = getComputedStyle(w); return { bg: cs.backgroundColor, color: getComputedStyle(document.querySelector('.set-content')).color }; });
  expect(lum(win.color)).toBeLessThan(110);
  expect(lum(win.bg.replace(/rgba?\(([^)]*)\)/, (m, a) => 'rgb(' + a.split(',').slice(0, 3).join(',') + ')'))).toBeGreaterThan(180);
  // settings: auto follows the device
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => ulyOS.desktopApi.Settings.set('theme', 'auto'));
  expect((await info()).theme).toBe('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(200);
  expect((await info()).theme).toBe('light');
  // the profile screen uses the last theme
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.auth-form');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  expect(problems).toEqual([]);
});

test('App Store: browse, search, add to desktop, open, remove', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Store');
  expect(await page.locator('.desk-icon:has-text("App Store")').count()).toBe(1);
  await page.dblclick('.desk-icon:has-text("App Store")');
  await page.waitForSelector('.st-card');
  expect(await page.locator('.st-card').count()).toBeGreaterThan(30);
  await page.fill('.st input[type=search]', 'excalidraw');
  await expect(page.locator('.st-card')).toHaveCount(1);
  await page.click('.st-card button:has-text("Add")');
  await expect(page.locator('.st-card .btn:has-text("Remove")')).toHaveCount(1);
  expect(await page.locator('.desk-icon:has-text("Excalidraw")').count()).toBe(1);
  await page.click('.st-chip:has-text("Installed")');
  await page.fill('.st input[type=search]', '');
  expect(await page.locator('.st-card').count()).toBeGreaterThanOrEqual(1);
  await page.click('.st-card:has-text("Excalidraw") button:has-text("Remove")');
  await page.waitForTimeout(200);
  expect(await page.locator('.desk-icon:has-text("Excalidraw")').count()).toBe(0);
  // a built-in app can be added back after deleting its icon
  await page.click('.st-chip:has-text("Security")');
  await expect(page.locator('.st-card:has-text("TrustVault") button:has-text("Add")')).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('Speak: save text to Files and as a download, open text, record with a local voice', async ({ page }) => {
  await page.addInitScript(() => {
    const ac = new AudioContext(); let dest = null;
    const voices = [{ voiceURI: 'cloud', name: 'Google UK English Female', lang: 'en-GB', localService: false }, { voiceURI: 'local', name: 'Local English', lang: 'en-US', localService: true }];
    window.__used = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => voices, cancel() {}, pause() {}, resume() {}, addEventListener() {},
      speak(u) { window.__used.push(u.voice && u.voice.voiceURI); ac.resume(); const o = ac.createOscillator(); o.frequency.value = 330; const g = ac.createGain(); g.gain.value = 0.4; o.connect(g).connect(dest); o.start(); setTimeout(() => { o.stop(); u.onend && u.onend(); }, 900); } } });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    navigator.mediaDevices.getDisplayMedia = async () => { dest = ac.createMediaStreamDestination(); const c = document.createElement('canvas'); c.width = c.height = 8; return new MediaStream([c.captureStream(1).getVideoTracks()[0], ...dest.stream.getAudioTracks()]); };
  });
  const problems = watch(page);
  await createProfile(page, 'Spk');
  await page.evaluate(() => ulyOS.Speech.open());
  await page.waitForSelector('.spk textarea');
  await page.uncheck('.spk input[type=checkbox]');
  await page.fill('.spk textarea', 'Remember to buy milk.');
  // save text: Files + download
  const [dl] = await Promise.all([page.waitForEvent('download'), (async () => { await page.click('.spk button:has-text("Save text")'); await page.waitForSelector('.modal input'); await page.fill('.modal input >> nth=0', 'note.txt'); await page.click('.modal button:has-text("Save")'); })()]);
  expect(dl.suggestedFilename()).toBe('note.txt');
  expect(await page.evaluate(async () => await (await ulyOS.FS.readSandboxFile('Documents/Speak/note.txt')).text())).toBe('Remember to buy milk.');
  // bad file names are refused
  await page.click('.spk button:has-text("Save text")'); await page.waitForSelector('.modal input');
  await page.fill('.modal input >> nth=0', 'a/b.txt'); await page.click('.modal button:has-text("Save")');
  await expect(page.locator('.modal')).toContainText('simple file name');
  await page.click('.modal button:has-text("Cancel")');
  // open text
  await page.click('.spk button:has-text("Clear")');
  const fc = page.waitForEvent('filechooser');
  await page.click('.spk button:has-text("Open")');
  await (await fc).setFiles({ name: 'in.txt', mimeType: 'text/plain', buffer: Buffer.from('from a file') });
  await expect(page.locator('.spk textarea')).toHaveValue('from a file');
  // saving with nothing typed gives a hint, not an empty file
  await page.click('.spk button:has-text("Clear")'); await page.click('.spk button:has-text("Save text")');
  await expect(page.locator('.toast:has-text("Nothing to save")')).toBeVisible();
  // pick the cloud voice, then record: a local voice is used instead
  await page.evaluate(() => ulyOS.vault.set('ulyos.speech', JSON.stringify({ voice: 'cloud', rate: 1, pitch: 1, volume: 1, perWord: false })));
  await page.fill('.spk textarea', 'hello there');
  await page.evaluate(() => { window.__used.length = 0; });
  const [dl2] = await Promise.all([page.waitForEvent('download'), (async () => { await page.click('.spk button:has-text("Save audio")'); await page.click('.modal button:has-text("Record it")'); await page.click('.modal button:has-text("Continue")'); await page.waitForSelector('.modal input'); await page.selectOption('.modal select', 'download'); await page.click('.modal button:has-text("Save")'); })()]);
  expect(dl2.suggestedFilename()).toMatch(/^speech-.*\.wav$/);
  expect(await page.evaluate(() => window.__used.pop())).toBe('local');
  expect(problems).toEqual([]);
});

test('folder connector: two profiles sync through a shared folder (encrypted file), settings file round-trips', async ({ page }) => {
  const problems = watch(page);
  // stand-in for a Drive / iCloud / SMB folder: a directory in the origin-private file system
  await page.addInitScript(() => { window.showDirectoryPicker = async () => { const r = await navigator.storage.getDirectory(); return r.getDirectoryHandle('shared-drive', { create: true }); }; });
  await createProfile(page, 'One');
  await page.evaluate((s) => { ulyOS.sync.setPass(s); ulyOS.vault.set('app:demo:x', 'from-one'); }, SYNC);
  await page.evaluate(() => ulyOS.desktopApi.openSettings('sync'));
  await page.click('button:has-text("Choose folder")');
  await page.waitForSelector('button:has-text("Save settings file here")');
  await page.click('button:has-text("Sync now") >> nth=0');
  await page.waitForSelector('.toast:has-text("Folder sync complete")', { timeout: 40000 });
  const raw = await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); const d = await r.getDirectoryHandle('shared-drive'); return await (await (await d.getFileHandle('ulyos-sync.ulysync')).getFile()).text(); });
  expect(raw).not.toMatch(/from-one|app:demo/);
  await page.click('button:has-text("Save settings file here")');
  await page.waitForSelector('.toast:has-text("ulyOS-settings.json")');
  const settingsTxt = await page.evaluate(async () => { const r = await navigator.storage.getDirectory(); const d = await r.getDirectoryHandle('shared-drive'); return await (await (await d.getFileHandle('ulyOS-settings.json')).getFile()).text(); });
  expect(JSON.parse(settingsTxt).format).toBe('ulyOS-settings');

  // second profile joins the same folder
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.auth-form');
  await page.click('.link:has-text("All profiles")'); await page.click('.prof.add');
  await page.fill('input[placeholder="Profile name"]', 'Two'); await page.fill('.pwc input[placeholder="Password"]', PW); await page.fill('.pwc input[placeholder="Confirm"]', PW);
  await page.click('button:has-text("Create profile")'); await page.waitForSelector('.desk-icon', { timeout: 45000 });
  await page.evaluate(() => ulyOS.vault.set('ulyos.tour.seen', '1'));
  await page.evaluate((s) => { ulyOS.sync.setPass(s); }, SYNC);
  await page.evaluate(() => ulyOS.desktopApi.openSettings('sync'));
  await page.click('button:has-text("Choose folder")');
  await page.waitForSelector('button:has-text("Save settings file here")');
  await page.click('button:has-text("Sync now") >> nth=0');
  await page.waitForSelector('.modal:has-text("Changes received")', { timeout: 40000 });
  await page.click('.modal button:has-text("Later")');
  expect(await page.evaluate(() => ulyOS.vault.get('app:demo:x'))).toBe('from-one');
  expect(problems).toEqual([]);
});

test('Speak: built-in voice creates WAV / MP3 files directly; browser voices explain why they cannot', async ({ page }) => {
  await page.addInitScript(() => {
    const ac = new AudioContext();
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ voiceURI: 'cloud', name: 'Google UK English Female', lang: 'en-GB', localService: false }], cancel() {}, pause() {}, resume() {}, addEventListener() {}, speak(u) { setTimeout(() => u.onend && u.onend(), 300); } } });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    // a capture that carries only silence (what a cloud voice produces)
    navigator.mediaDevices.getDisplayMedia = async () => { const d = ac.createMediaStreamDestination(); const c = document.createElement('canvas'); c.width = c.height = 8; return new MediaStream([c.captureStream(1).getVideoTracks()[0], ...d.stream.getAudioTracks()]); };
  });
  const problems = watch(page);
  await createProfile(page, 'Builtin');
  await page.evaluate(() => ulyOS.Speech.open());
  await page.waitForSelector('.spk textarea');
  await page.uncheck('.spk input[type=checkbox]');
  await page.fill('.spk textarea', 'This file was made with the built in voice.');
  const wav = async (name) => { const d = require('fs').readFileSync(name); return { riff: d.slice(0, 4).toString(), wave: d.slice(8, 12).toString(), rate: d.readUInt32LE(24), secs: (d.length - 44) / 2 / d.readUInt32LE(24), peak: Math.max(...new Int16Array(d.buffer.slice(d.byteOffset + 44, d.byteOffset + 44 + 20000)).slice(0, 8000)) }; };
  // 1) built-in engine selected explicitly → WAV
  await page.selectOption('select[aria-label="Voice engine"]', 'builtin');
  const saveWith = async (fmt) => {
    await page.selectOption('select[aria-label="Audio format"]', fmt);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), (async () => { await page.click('.spk button:has-text("Save audio")'); await page.waitForSelector('.modal input'); await page.selectOption('.modal select', 'download'); await page.click('.modal button:has-text("Save")'); })()]);
    return dl;
  };
  const dl1 = await saveWith('wav');
  expect(dl1.suggestedFilename()).toMatch(/\.wav$/);
  const w = await wav(await dl1.path());
  expect(w.riff + w.wave).toBe('RIFFWAVE'); expect(w.secs).toBeGreaterThan(1.5); expect(w.peak).toBeGreaterThan(1000);   // real speech, not silence
  const dl2 = await saveWith('mp3');
  const mp3 = require('fs').readFileSync(await dl2.path());
  expect(mp3.length).toBeGreaterThan(5000); expect(mp3[0] === 0xff || mp3.slice(0, 3).toString() === 'ID3').toBe(true);
  // 2) browser engine: explained choice; recording a voice that gives silence says what to do instead
  await page.selectOption('select[aria-label="Voice engine"]', 'browser');
  await page.selectOption('select[aria-label="Audio format"]', 'wav');
  await page.click('.spk button:has-text("Save audio")');
  await expect(page.locator('.modal')).toContainText('keep the audio of their own voices to themselves');
  await page.click('.modal button:has-text("Record it")');
  await page.click('.modal button:has-text("Continue")');
  await expect(page.locator('.toast.err')).toContainText('Built-in or Gemini engine', { timeout: 20000 });
  expect(problems).toEqual([]);
});
