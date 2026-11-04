const { test, expect } = require('@playwright/test');
const { hermetic, createProfile, watch } = require('./helpers');

test.beforeEach(async ({ context }) => { await hermetic(context); });

test('keyboard shortcuts: cheat sheet, app launch, window control, theme, lock-safe', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Keys');

  // cheat sheet: F1 opens, Escape closes; "?" works too but not while typing
  await page.keyboard.press('F1');
  await expect(page.locator('.kb-sheet')).toBeVisible();
  await expect(page.locator('.kb-sheet')).toContainText('Ctrl');
  await page.keyboard.press('Escape');
  await expect(page.locator('.kb-sheet')).toHaveCount(0);
  await page.keyboard.press('Control+/');
  await expect(page.locator('.kb-sheet')).toBeVisible();
  await page.keyboard.press('F1');
  await expect(page.locator('.kb-sheet')).toHaveCount(0);

  // open Files, then maximize / restore / snap / close the window by keyboard
  await page.keyboard.press('Alt+Shift+F');
  await page.waitForSelector('.window');
  const state = () => page.evaluate(() => { const w = ulyOS.WM.focused(); return w && { max: w.maximized, snap: w.snap, min: w.minimized }; });
  await page.keyboard.press('Alt+Shift+ArrowUp');
  expect((await state()).max).toBe(true);
  await page.keyboard.press('Alt+Shift+ArrowDown');
  expect((await state()).max).toBe(false);
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  expect((await state()).snap).toBe('left');
  await page.keyboard.press('Alt+Shift+ArrowDown');           // un-snap first
  expect((await state()).snap).toBe(null);

  // a second window, then cycle between them
  await page.keyboard.press('Alt+Shift+T');
  await expect.poll(() => page.evaluate(() => ulyOS.WM.all().length)).toBe(2);
  const before = await page.evaluate(() => ulyOS.WM.focused().id);
  await page.keyboard.press('Alt+BracketRight');
  expect(await page.evaluate(() => ulyOS.WM.focused().id)).not.toBe(before);

  // close the focused one
  await page.keyboard.press('Alt+Shift+Q');
  await expect.poll(() => page.evaluate(() => ulyOS.WM.all().filter((w) => !w.closing).length)).toBe(1);

  // theme toggle and Start menu
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme || document.body.dataset.theme || getComputedStyle(document.body).backgroundColor);
  const t0 = await theme();
  await page.keyboard.press('Alt+Shift+D');
  await expect.poll(theme).not.toBe(t0);
  await page.keyboard.press('Control+Shift+A');
  await expect(page.locator('#start-menu.open')).toBeVisible();
  await page.keyboard.press('Escape');

  // shortcuts do nothing before sign-in (body not .authed)
  await page.evaluate(() => document.body.classList.remove('authed'));
  await page.keyboard.press('F1');
  await expect(page.locator('.kb-sheet')).toHaveCount(0);
  await page.evaluate(() => document.body.classList.add('authed'));

  // bundled apps forward shortcuts: pressing F1 inside a local app iframe still opens the sheet
  await page.evaluate(() => ulyOS.launch({ id: 'qrseal', kind: 'local', name: 'QR Seal', file: 'apps/qrseal.html', glyph: 'qr', mem: 60, w: 980, h: 700 }));
  await page.waitForSelector('.window[data-app="web:qrseal"] iframe');
  await page.waitForTimeout(1500);
  const fr = page.frames().find((f) => f.url().includes('apps/qrseal.html'));
  await fr.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('F1');
  await expect(page.locator('.kb-sheet')).toBeVisible();
  expect(problems).toEqual([]);
});
