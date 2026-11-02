const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { hermetic, createProfile, watch } = require('./helpers');

test.beforeEach(async ({ context }) => { await hermetic(context); });

test('desktop boots, Settings tabs open, Files and a window work without errors', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Smoke');
  expect(await page.locator('.desk-icon').count()).toBeGreaterThan(3);
  for (const tab of ['appearance', 'security', 'sync', 'about']) {
    await page.evaluate((t) => ulyOS.desktopApi.openSettings(t), tab);
    await page.waitForTimeout(300);
  }
  await expect(page.locator('.set-content')).toContainText('Version history');
  await page.evaluate(() => ulyOS.FS.open({ path: ['Documents'] }));
  await expect(page.locator('.fm')).toContainText('Welcome.txt');
  expect(await page.evaluate(() => ulyOS.WM.all().length)).toBeGreaterThanOrEqual(2);
  expect(problems).toEqual([]);
});

test('version number matches the newest changelog entry and the docs', async ({ page }) => {
  await page.goto('/index.html');
  const v = await page.evaluate(() => [ulyOS.version, ulyOS.CHANGELOG[0].v]);
  expect(v[0]).toBe(v[1]);
  expect(JSON.parse(fs.readFileSync('package.json', 'utf8')).version).toBe(v[0]);
});

test('the service worker file and manifest are valid', async () => {
  expect(() => new Function(fs.readFileSync('sw.js', 'utf8'))).not.toThrow();
  const m = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  expect(m.name).toBeTruthy();
});
