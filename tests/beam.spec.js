const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { hermetic, createProfile, watch } = require('./helpers');

// two isolated browsers-in-one: separate storage, real WebRTC between them over loopback
test.use({ launchOptions: { args: ['--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns'] } });

async function device(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  await hermetic(ctx);
  const page = await ctx.newPage();
  const problems = watch(page);
  await createProfile(page, name);
  await page.evaluate(() => ulyOS.Beam.open());
  await page.waitForSelector('.bm');
  return { ctx, page, problems };
}

test('Beam: pair two devices with codes, verify, send text, files and settings; decline and bad codes', async ({ browser }) => {
  const A = await device(browser, 'Laptop'), B = await device(browser, 'Phone');
  expect(await A.page.locator('.desk-icon:has-text("Beam")').count()).toBe(1);

  // bad codes are refused with a clear message
  await B.page.click('.bm button:has-text("Join")');
  await B.page.fill('textarea.bm-code', 'hello');
  await B.page.click('button:has-text("Continue")');
  await expect(B.page.locator('.bm .auth-err')).toContainText('not a Beam code');
  await B.page.fill('textarea.bm-code', 'BEAM1.AAAA');
  await B.page.click('button:has-text("Continue")');
  await expect(B.page.locator('.bm .auth-err')).toContainText('damaged');

  // A starts, B joins with A's code, A finishes with B's reply
  await A.page.click('.bm button:has-text("Start")');
  await A.page.waitForSelector('canvas.bm-qr');
  const first = await A.page.inputValue('textarea.bm-code[readonly]');
  expect(first).toMatch(/^BEAM1\.[\w-]+$/);
  expect(first.length).toBeLessThan(3000);
  expect(await A.page.evaluate(() => { const c = document.querySelector('canvas.bm-qr'); return c.width > 100; })).toBe(true);
  await B.page.fill('textarea.bm-code', first);
  await B.page.click('button:has-text("Continue")');
  await B.page.waitForSelector('textarea.bm-code[readonly]');
  const reply = await B.page.inputValue('textarea.bm-code[readonly]');
  // using the wrong kind of code in the wrong place
  await A.page.fill('textarea[aria-label="Reply code"]', first);
  await A.page.click('button:has-text("Connect")');
  await expect(A.page.locator('.bm .auth-err')).toContainText('first code');
  await A.page.fill('textarea[aria-label="Reply code"]', reply);
  await A.page.click('button:has-text("Connect")');
  await A.page.waitForSelector('.bm-conn', { timeout: 30000 });
  await B.page.waitForSelector('.bm-conn', { timeout: 30000 });
  const va = (await A.page.textContent('.bm-verify')).trim(), vb = (await B.page.textContent('.bm-verify')).trim();
  expect(va).toMatch(/^\d{3} \d{3}$/); expect(va).toBe(vb);
  await expect(A.page.locator('.bm-conn b')).toContainText('Connected to Phone');
  await expect(B.page.locator('.bm-conn b')).toContainText('Connected to Laptop');

  // text
  await A.page.fill('.bm-send input', 'hello from the laptop');
  await A.page.click('.bm-send button');
  await expect(B.page.locator('.bm-text')).toContainText('hello from the laptop');

  // a 300 KB binary file, accepted
  const data = Buffer.alloc(300 * 1024); for (let i = 0; i < data.length; i++) data[i] = (i * 31 + 7) & 255;
  await A.page.setInputFiles('.bm input[type=file]', { name: 'pic.bin', mimeType: 'application/octet-stream', buffer: data });
  await B.page.waitForSelector('.bm-row:has-text("pic.bin") button:has-text("Accept")');
  await expect(B.page.locator('.bm-row:has-text("pic.bin")')).toContainText('from Laptop');
  await B.page.click('.bm-row:has-text("pic.bin") button:has-text("Accept")');
  await expect(B.page.locator('.bm-row:has-text("pic.bin")')).toContainText('Received', { timeout: 30000 });
  await expect(A.page.locator('.bm-row:has-text("pic.bin")')).toContainText('Sent');
  const [dl] = await Promise.all([B.page.waitForEvent('download'), B.page.click('.bm-row:has-text("pic.bin") button:has-text("Download")')]);
  expect(Buffer.compare(fs.readFileSync(await dl.path()), data)).toBe(0);   // byte-for-byte
  await B.page.click('.bm-row:has-text("pic.bin") button:has-text("Save to Files")');
  await expect(B.page.locator('.toast:has-text("Documents")')).toBeVisible();
  expect(await B.page.evaluate(async () => (await (await ulyOS.FS.readSandboxFile('Documents/Received/pic.bin')).arrayBuffer()).byteLength)).toBe(300 * 1024);

  // declined file; hostile file name is neutralised
  await A.page.setInputFiles('.bm input[type=file]', { name: '../../evil:name?.txt', mimeType: 'text/plain', buffer: Buffer.from('nope') });
  await B.page.waitForSelector('.bm-row:has-text("evil") button:has-text("Decline")');
  expect(await B.page.locator('.bm-row:has-text("evil") .bm-rt').textContent()).not.toMatch(/[\\/:?]/);
  await B.page.click('.bm-row:has-text("evil") button:has-text("Decline")');
  await expect(A.page.locator('.bm-row:has-text("evil")')).toContainText('Declined');

  // settings go across as a file and can be imported
  await A.page.evaluate(() => ulyOS.desktopApi.Settings.set('fontSize', 17));
  await A.page.click('button:has-text("Send my settings")');
  await B.page.waitForSelector('.bm-row:has-text("ulyOS-settings") button:has-text("Accept")');
  await B.page.click('.bm-row:has-text("ulyOS-settings") button:has-text("Accept")');
  await B.page.click('.bm-row:has-text("ulyOS-settings") button:has-text("Import settings")');
  await B.page.click('.modal button:has-text("Import")');
  await B.page.waitForSelector('.toast:has-text("Settings imported")');
  expect(await B.page.evaluate(() => ulyOS.desktopApi.Settings.get('fontSize'))).toBe(17);

  // disconnect returns the other side to the start screen with a note
  await A.page.click('button:has-text("Disconnect")');
  await expect(B.page.locator('.bm-msg')).toContainText('disconnected', { timeout: 15000 });
  expect(A.problems).toEqual([]); expect(B.problems).toEqual([]);
  await A.ctx.close(); await B.ctx.close();
});

test('Beam codes are small enough for a QR and carry no secrets', async ({ browser }) => {
  const A = await device(browser, 'Solo');
  await A.page.click('.bm button:has-text("Start")');
  await A.page.waitForSelector('canvas.bm-qr');
  const code = await A.page.inputValue('textarea.bm-code[readonly]');
  const dec = await A.page.evaluate((c) => ulyOS.Beam._decode(c), code);
  expect(dec.t).toBe('o');
  expect(dec.s).not.toMatch(/Solo|ulyos|password/i);   // no profile name or vault data in the code
  expect(code.length).toBeLessThan(2500);
  await A.ctx.close();
});
