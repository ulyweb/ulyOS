const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { hermetic, createProfile, watch } = require('./helpers');
const KEY = 'AIzaSy' + 'A'.repeat(33);
const HOST = 'generativelanguage.googleapis.com';

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });
test.beforeEach(async ({ context }) => { await hermetic(context); });

const sinePcm = (secs, rate = 24000) => { const n = Math.round(secs * rate), b = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 440) * 12000), i * 2); return b; };

test('Gemini voices: natural speech with style and voice, saved straight to WAV / MP3 (no tab audio)', async ({ page }) => {
  const problems = watch(page);
  const reqs = [];
  await page.route(`https://${HOST}/**`, async (route) => {
    const r = route.request();
    reqs.push({ url: r.url(), method: r.method(), key: r.headers()['x-goog-api-key'], body: r.postDataJSON && r.postData() ? JSON.parse(r.postData()) : null });
    const hdr = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: hdr });
    if (r.headers()['x-goog-api-key'] === 'bad') return route.fulfill({ status: 400, headers: hdr, contentType: 'application/json', body: JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }) });
    if (/quota/.test(reqs[reqs.length - 1].body?.contents?.[0]?.parts?.[0]?.text || '')) return route.fulfill({ status: 429, headers: hdr, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, headers: hdr, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: sinePcm(1.5).toString('base64') } }] } }] }) });
  });
  await createProfile(page, 'Gem');
  await page.evaluate((k) => ulyOS.Gemini.setKey(k), KEY);
  expect(await page.evaluate(() => JSON.stringify(ulyOS.Gemini.config()))).not.toContain('AIzaSy');   // the key is never shown back in full
  await page.evaluate(() => ulyOS.Speech.open());
  await page.waitForSelector('.spk textarea');
  expect(await page.inputValue('select[aria-label="Voice engine"]')).toBe('gemini');   // default once a key exists
  await page.selectOption('select[aria-label="Gemini voice"]', 'Puck');
  await page.selectOption('select[aria-label="Speaking style"]', { label: 'Whisper' });
  await page.fill('.spk textarea', 'Good night, sleep well.');
  const save = async (fmt) => {
    await page.selectOption('select[aria-label="Audio format"]', fmt);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), (async () => { await page.click('.spk button:has-text("Save audio")'); await page.waitForSelector('.modal input'); await page.selectOption('.modal select', 'download'); await page.click('.modal button:has-text("Save")'); })()]);
    return fs.readFileSync(await dl.path());
  };
  const wav = await save('wav');
  expect(wav.slice(0, 4).toString() + wav.slice(8, 12).toString()).toBe('RIFFWAVE');
  expect(wav.readUInt32LE(24)).toBe(24000);
  expect((wav.length - 44) / 2 / 24000).toBeGreaterThan(1.3);
  const mp3 = await save('mp3');
  expect(mp3.length).toBeGreaterThan(5000); expect(mp3[0] === 0xff || mp3.slice(0, 3).toString() === 'ID3').toBe(true);
  const call = reqs.filter((r) => r.method === 'POST').pop();
  expect(call.url).toContain('/v1beta/models/gemini-2.5-flash-preview-tts:generateContent');
  expect(call.key).toBe(KEY);                                  // header, not URL
  expect(call.url).not.toContain(KEY);
  expect(call.body.generationConfig.responseModalities).toEqual(['AUDIO']);
  expect(call.body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Puck');
  expect(call.body.contents[0].parts[0].text).toBe('Say in a soft whisper: Good night, sleep well.');
  expect(reqs.every((r) => r.url.startsWith('https://' + HOST + '/'))).toBe(true);
  // speaking (not saving) plays it
  await page.click('.spk button:has-text("Speak")');
  await expect(page.locator('.spk-now')).toContainText('Speaking', { timeout: 10000 });
  // errors are explained
  await page.evaluate(() => ulyOS.vault.set('ulyos.gemini', JSON.stringify({ ...JSON.parse(ulyOS.vault.get('ulyos.gemini')), key: 'bad-key-bad-key-bad-key-bad-key' })));
  expect(await page.evaluate(async () => { try { await ulyOS.Gemini.tts('hello', { key: 'bad' }); return 'ok'; } catch (e) { return e.message; } })).toMatch(/rejected the API key/);
  expect(await page.evaluate(async (k) => { try { await ulyOS.Gemini.tts('quota test', { key: k }); return 'ok'; } catch (e) { return e.message; } }, KEY)).toMatch(/quota|429/);
  expect(await page.evaluate(() => { try { ulyOS.Gemini.setKey('not a key!'); return 'accepted'; } catch (e) { return e.message; } })).toMatch(/does not look like/);
  expect(problems.filter((p) => !/429|400/.test(p))).toEqual([]);
});

test('Gemini Live: setup, microphone audio up, transcripts + audio down, typed messages, errors', async ({ page }) => {
  const problems = watch(page);
  const seen = { url: '', setup: null, audio: [], texts: [], closed: false };
  await page.addInitScript(() => {
    const ac = new AudioContext(), dest = ac.createMediaStreamDestination(), o = ac.createOscillator(); o.frequency.value = 300; o.connect(dest); o.start();
    navigator.mediaDevices.getUserMedia = async () => dest.stream;   // a steady tone instead of a real microphone
  });
  const pcm = sinePcm(0.4);
  let mode = 'ok';
  await page.routeWebSocket(new RegExp(HOST), (ws) => {
    seen.url = ws.url();
    ws.onClose(() => { seen.closed = true; });
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.setup) { seen.setup = m.setup; if (mode === 'badmodel') { ws.send(JSON.stringify({ error: { message: 'models/nope is not found for API version v1beta' } })); return; } ws.send(JSON.stringify({ setupComplete: {} })); return; }
      if (m.realtimeInput && m.realtimeInput.audio) {
        seen.audio.push(m.realtimeInput.audio);
        if (seen.audio.length === 3) {
          ws.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'hello there ' } } }));
          ws.send(JSON.stringify({ serverContent: { outputTranscription: { text: 'Hi! ' }, modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: pcm.toString('base64') } }] } } }));
          ws.send(JSON.stringify({ serverContent: { outputTranscription: { text: 'How can I help?' }, turnComplete: true } }));
        }
      }
      if (m.clientContent) { seen.texts.push(m.clientContent.turns[0].parts[0].text); ws.send(JSON.stringify({ serverContent: { outputTranscription: { text: 'You typed: ' + m.clientContent.turns[0].parts[0].text }, turnComplete: true } })); }
    });
  });
  await createProfile(page, 'Live');
  await page.evaluate((k) => ulyOS.Gemini.setKey(k), KEY);
  await page.evaluate(() => ulyOS.Gemini.openLive());
  await page.waitForSelector('.lv');
  await page.selectOption('.lv select[aria-label="Voice"]', 'Aoede');
  await page.fill('.lv textarea', 'Speak softly and keep answers short.');
  await page.click('.lv-go');
  await expect(page.locator('.lv-status')).toContainText('Listening', { timeout: 20000 });
  expect(seen.url).toContain('wss://' + HOST + '/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent');
  expect(seen.url).toContain('key=' + KEY);
  expect(seen.setup.model).toBe('models/gemini-live-2.5-flash-preview');
  expect(seen.setup.generationConfig.responseModalities).toEqual(['AUDIO']);
  expect(seen.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
  expect(seen.setup.systemInstruction.parts[0].text).toContain('Speak softly');
  await expect(page.locator('.lv-line.me')).toContainText('hello there', { timeout: 15000 });
  await expect(page.locator('.lv-line.ai')).toContainText('Hi! How can I help?');
  expect(seen.audio.length).toBeGreaterThanOrEqual(3);
  expect(seen.audio[0].mimeType).toBe('audio/pcm;rate=16000');
  const first = Buffer.from(seen.audio[0].data, 'base64'); expect(first.length).toBe(1280);   // 640 samples × 2 bytes (40 ms at 16 kHz)
  expect(await page.evaluate(() => ulyOS.Gemini._session.played)).toBeGreaterThan(0);          // the reply audio was queued for playback
  await page.fill('.lv input[aria-label="Message"]', 'what time is it');
  await page.press('.lv input[aria-label="Message"]', 'Enter');
  await expect(page.locator('.lv-line.ai').last()).toContainText('You typed: what time is it');
  expect(seen.texts).toEqual(['what time is it']);
  await page.click('.lv-go');
  await expect.poll(() => seen.closed).toBe(true);
  await expect(page.locator('.lv-go')).toContainText('Start talking');
  // a server-side error is shown and the session does not start
  mode = 'badmodel';
  await page.click('.lv-go');
  await expect(page.locator('.toast.err')).toContainText('not found', { timeout: 20000 });
  await expect(page.locator('.lv-go')).toContainText('Start talking');
  expect(problems.filter((p) => !/not found|WebSocket/i.test(p))).toEqual([]);
});

test('Gemini Live needs a key and keeps it out of settings exports and sync', async ({ page }) => {
  await createProfile(page, 'Key');
  await page.evaluate((k) => ulyOS.Gemini.setKey(k), KEY);
  const exported = await page.evaluate(async () => await ulyOS.desktopApi.settingsFile().blob.text());
  expect(exported).not.toContain('AIzaSy');
  expect(await page.evaluate(() => ulyOS.sync.EXCLUDE.test('ulyos.gemini'))).toBe(true);   // never synced to a gist or shared folder
});
