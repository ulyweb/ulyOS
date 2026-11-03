const { test, expect } = require('@playwright/test');
const { hermetic, createProfile, watch } = require('./helpers');

test.beforeEach(async ({ context }) => { await hermetic(context); });

test('font family, size, weight, style and pointer color apply to the whole UI', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Look');
  const S = () => page.evaluate(() => { const cs = getComputedStyle(document.body); return { size: Math.round(parseFloat(cs.fontSize)) + 'px', family: cs.fontFamily, weight: cs.fontWeight, style: cs.fontStyle }; });
  expect((await S()).size).toBe('13px');
  await page.evaluate(() => ulyOS.desktopApi.Settings.patch({ fontSize: 18, fontFamily: 'serif', fontWeight: 600, fontStyle: 'italic' }));
  const after = await S();
  expect(after).toMatchObject({ size: '18px', weight: '600', style: 'italic' });
  expect(after.family).toContain('Georgia');
  // a panel with its own hard-coded size scales too
  const label = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.desk-label, .di-label, .desk-icon span') || document.body).fontSize));
  expect(label).toBeGreaterThan(12);
  await page.evaluate(() => ulyOS.desktopApi.Settings.patch({ cursorStyle: 'solid', cursorColor: '#ff0000' }));
  expect(await page.evaluate(() => decodeURIComponent(document.documentElement.style.getPropertyValue('--cur-default')))).toContain('#ff0000');
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--ring-c'))).toBe('#ff0000');
  await page.evaluate(() => ulyOS.desktopApi.Settings.patch({ cursorStyle: 'target', cursorColor: '' }));
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--ring-c'))).toBe(await page.evaluate(() => ulyOS.desktopApi.Settings.get ? ulyOS.desktopApi.Settings.get('accent') : '#8fa3ff'));
  expect(problems).toEqual([]);
});

test('settings export → import keeps the new look options and rejects bad values', async ({ page }) => {
  await createProfile(page, 'Look');
  await page.evaluate(() => ulyOS.desktopApi.openSettings('appearance'));
  await page.evaluate(() => ulyOS.desktopApi.Settings.patch({ fontFamily: 'mono', fontSize: 16, cursorColor: '#00ff88' }));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.set-foot button:has-text("Export settings")')]);
  const obj = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
  expect(obj.settings).toMatchObject({ fontFamily: 'mono', fontSize: 16, cursorColor: '#00ff88' });
  await page.evaluate(() => ulyOS.desktopApi.Settings.patch({ fontFamily: 'system', fontSize: 13, cursorColor: '' }));
  const evil = { ...obj, settings: { ...obj.settings, fontFamily: 'url(javascript:1)', fontSize: 9999, cursorColor: 'red;background:url(x)' } };
  const imp = async (o) => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.set-foot button:has-text("Import settings")')]); await fc.setFiles({ name: 's.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(o)) }); await page.waitForSelector('.modal button:has-text("Import")'); await page.click('.modal button:has-text("Import")'); await page.waitForSelector('.toast:has-text("Settings imported")'); };
  await imp(evil);
  const got = await page.evaluate(() => Math.round(parseFloat(getComputedStyle(document.body).fontSize)) + 'px|' + document.documentElement.style.getPropertyValue('--font').slice(0, 6));
  expect(got).toBe('22px|Inter,');   // size clamped, bad family dropped (stays default), bad color dropped
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--ring-c'))).not.toContain('red');
  // wrong file kinds give a helpful message
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.set-foot button:has-text("Import settings")')]);
  await fc.setFiles({ name: 'b.ulyprofile', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'ulyOS-profile' })) });
  await expect(page.locator('.toast.err')).toContainText('encrypted profile backup');
});

test('vivid widgets get their own palette and can be switched to glass', async ({ page }) => {
  await createProfile(page, 'Look');
  await page.evaluate(() => { ulyOS.Widgets.add('clock', 'm'); ulyOS.Widgets.add('crypto', 'm'); });
  await page.waitForSelector('.wgt-clock');
  expect(await page.evaluate(() => document.body.dataset.widgets)).toBe('vivid');
  const bg = await page.evaluate(() => [...document.querySelectorAll('.wgt')].map((w) => getComputedStyle(w).getPropertyValue('--w1').trim()));
  expect(new Set(bg).size).toBeGreaterThan(1);
  await page.evaluate(() => ulyOS.desktopApi.Settings.set('widgetStyle', 'glass'));
  expect(await page.evaluate(() => document.body.dataset.widgets)).toBe('glass');
});

test('Speak app: speaks text, each finished word, honours stop; Notes widget has a read-aloud button', async ({ page }) => {
  await page.addInitScript(() => {
    window.__spoken = [];
    const fake = { speaking: false, getVoices: () => [], speak(u) { window.__spoken.push(u.text); }, cancel() { window.__cancels = (window.__cancels || 0) + 1; }, pause() {}, resume() {}, addEventListener() {} };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  });
  const problems = watch(page);
  await createProfile(page, 'Talker');
  expect(await page.locator('.desk-icon:has-text("Speak")').count()).toBe(1);
  await page.dblclick('.desk-icon:has-text("Speak")');
  await page.waitForSelector('.spk textarea');
  await page.locator('.spk textarea').pressSequentially('hello world ');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__spoken)).toEqual(['hello', 'world']);
  await page.click('.spk button:has-text("Speak")');
  await page.waitForTimeout(200);
  expect((await page.evaluate(() => window.__spoken)).pop()).toBe('hello world');
  await page.uncheck('.spk input[type=checkbox]');
  await page.locator('.spk textarea').pressSequentially('more ');
  await page.waitForTimeout(200);
  expect((await page.evaluate(() => window.__spoken)).length).toBe(3);
  await page.click('.spk button:has-text("Stop")');
  expect(await page.evaluate(() => window.__cancels)).toBeGreaterThan(0);
  // widget
  await page.evaluate(() => { ulyOS.Widgets.add('notes', 'm'); });
  await page.waitForSelector('.wgt-notes textarea');
  await page.fill('.wgt-notes textarea', 'remember the milk');
  await page.waitForTimeout(600);
  await page.hover('.wgt-notes');
  await page.click('.wgt-notes .w-speak');
  await page.waitForTimeout(200);
  expect((await page.evaluate(() => window.__spoken)).pop()).toBe('remember the milk');
  expect(problems).toEqual([]);
});

test('Settings explain storage, passkeys and sync', async ({ page }) => {
  await createProfile(page, 'Docs');
  await page.evaluate(() => ulyOS.desktopApi.openSettings('system'));
  await expect(page.locator('.set-content')).toContainText('Browser storage');
  await expect(page.locator('.set-content')).toContainText('not set by ulyOS');
  await expect(page.locator('.stor-bar')).toHaveCount(1);
  await page.evaluate(() => ulyOS.desktopApi.openSettings('security'));
  await expect(page.locator('.set-content details.howto')).toContainText('How passkeys and fingerprint unlock work');
  await page.evaluate(() => ulyOS.desktopApi.openSettings('sync'));
  await expect(page.locator('.set-content details.howto').first()).toContainText('Personal access tokens');
  await expect(page.locator('.set-content details.howto').nth(1)).toContainText('Google Drive');
});
