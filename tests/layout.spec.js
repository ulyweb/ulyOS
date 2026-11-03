const { test, expect } = require('@playwright/test');
const { PW, hermetic, createProfile, watch } = require('./helpers');

test.beforeEach(async ({ context }) => { await hermetic(context); });

const deskNames = (page) => page.evaluate(() => [...document.querySelectorAll('#desktop .desk-icon')].map((e) => e.getAttribute('aria-label')));

test('new profiles get a taskbar that stays visible, four pinned tools, four desktop tools and an Apps folder', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Layout');
  const info = await page.evaluate(() => ({ mode: document.getElementById('taskbar').dataset.mode, auto: document.getElementById('taskbar').classList.contains('autohide'), pinned: [...document.querySelectorAll('#taskbar .tb-item.pinned')].map((e) => e.dataset.app), s: ulyOS.desktopApi.Settings.all() }));
  expect(info.mode).toBe('bar');
  expect(info.auto).toBe(false);
  expect(info.pinned).toEqual(['settings', 'beam', 'files', 'taskmgr']);
  expect(info.s).toMatchObject({ taskbarMode: 'bar', taskbarAutoHide: false });
  expect(await deskNames(page)).toEqual(['Gemini Live', 'Speak', 'Beam', 'App Store', 'Apps']);
  await expect(page.locator('#taskbar')).toBeVisible();
  const dockBottom = await page.evaluate(() => { const r = document.getElementById('taskbar').getBoundingClientRect(); return Math.round(innerHeight - r.bottom); });
  expect(dockBottom).toBeLessThanOrEqual(2);   // a full-width bar on the edge, not a floating dock

  // the Apps folder holds the rest
  await page.dblclick('.desk-icon[data-id="apps"]');
  await page.waitForSelector('.fld-item');
  const inside = await page.locator('.fld-item .di-label').allTextContents();
  for (const n of ['Files', 'Task Manager', 'Settings', 'QR Seal', 'System Vault', 'Crypto Compass', 'Polotno', 'GetArtCraft', 'YouTube', 'XRP Price', 'Outlook']) expect(inside).toContain(n);
  expect(inside).not.toContain('Speak');
  await page.fill('.fld input[type=search]', 'vault');
  await expect(page.locator('.fld-item')).toHaveCount(1);
  await page.fill('.fld input[type=search]', '');
  // opening an app from the folder works
  await page.click('.fld-item:has-text("System Vault")');
  await page.waitForSelector('.window[data-app="web:systemvault"] iframe');
  await page.evaluate(() => ulyOS.WM.all().filter((w) => w.appId === 'web:systemvault').forEach((w) => ulyOS.WM.close(w, { force: true })));
  // move to desktop and back via the menu
  await page.click('.fld-item:has-text("QR Seal")', { button: 'right' });
  await page.click('.ctx-item:has-text("Move to desktop")');
  await expect(page.locator('#desktop .desk-icon[data-id="qrseal"]')).toHaveCount(1);
  await page.click('#desktop .desk-icon[data-id="qrseal"]', { button: 'right' });
  await page.click('.ctx-item:has-text("Move to Apps folder")');
  await expect(page.locator('#desktop .desk-icon[data-id="qrseal"]')).toHaveCount(0);
  // drag an icon onto the folder
  await page.click('.fld-item:has-text("Outlook")', { button: 'right' });
  await page.click('.ctx-item:has-text("Move to desktop")');
  const src = await page.locator('#desktop .desk-icon[data-id="outlook"]').boundingBox(), dst = await page.locator('#desktop .desk-icon[data-id="apps"]').boundingBox();
  await page.mouse.move(src.x + src.width / 2, src.y + 20); await page.mouse.down();
  await page.mouse.move(dst.x + dst.width / 2, dst.y + 20, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('#desktop .desk-icon[data-id="outlook"]')).toHaveCount(0);
  expect(await page.evaluate(() => ulyOS.Desktop.icons.find((i) => i.id === 'outlook').folder)).toBe('apps');
  // pinned tools still launch from the taskbar although their icons are in the folder
  await page.click('#taskbar .tb-item[data-app="files"]');
  await page.waitForSelector('.fm');
  expect(problems).toEqual([]);
});

test('existing profiles are migrated once: calm desktop, Apps folder keeps every icon incl. custom shortcuts', async ({ page }) => {
  await createProfile(page, 'Legacy');
  // recreate what 1.13 stored: every stock icon on the desktop, a custom shortcut, floating dock with auto-hide
  await page.evaluate(() => {
    const L = [['files', 'sys', 'Files'], ['qrseal', 'local', 'QR Seal'], ['systemvault', 'local', 'System Vault'], ['speak', 'sys', 'Speak'], ['store', 'sys', 'App Store'], ['beam', 'sys', 'Beam'], ['live', 'sys', 'Gemini Live'], ['settings', 'sys', 'Settings']].map(([id, kind, name], i) => ({ id, kind, ...(kind === 'sys' ? { sys: id } : { file: 'apps/' + id + '.html' }), name, col: 0, row: i }));
    L.push({ id: 'umine', kind: 'url', name: 'My Shortcut', url: 'https://example.com/', mode: 'tab', col: 1, row: 0 });
    ulyOS.vault.set('ulyos.icons', JSON.stringify({ v: 1, list: L }));
    ulyOS.vault.set('ulyos.settings', JSON.stringify({ ...ulyOS.desktopApi.Settings.all(), taskbarMode: 'dock', taskbarAutoHide: true, pinned: ['files'] }));
    ulyOS.vault.remove('ulyos.migr.layout2i'); ulyOS.vault.remove('ulyos.migr.layout2s');
  });
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.auth-form');
  await page.fill('.auth-input', PW); await page.click('.auth-go');
  await page.waitForSelector('.desk-icon', { timeout: 45000 });
  await page.evaluate(() => ulyOS.vault.set('ulyos.tour.seen', '1'));
  expect(await deskNames(page)).toEqual(['Gemini Live', 'Speak', 'Beam', 'App Store', 'Apps']);
  const folder = await page.evaluate(() => ulyOS.Desktop.icons.filter((i) => i.folder === 'apps').map((i) => i.id).sort());
  expect(folder).toEqual(expect.arrayContaining(['files', 'qrseal', 'systemvault', 'settings', 'umine']));
  const s = await page.evaluate(() => ({ ...ulyOS.desktopApi.Settings.all(), dock: document.getElementById('taskbar').dataset.mode }));
  expect(s).toMatchObject({ taskbarMode: 'bar', taskbarAutoHide: false, dock: 'bar' });
  expect(s.pinned).toEqual(['settings', 'beam', 'files', 'taskmgr']);
  // runs only once: a later change sticks
  await page.evaluate(() => { ulyOS.desktopApi.Settings.set('taskbarMode', 'dock'); });
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.auth-form'); await page.fill('.auth-input', PW); await page.click('.auth-go');
  await page.waitForSelector('.desk-icon', { timeout: 45000 });
  expect(await page.evaluate(() => ulyOS.desktopApi.Settings.get('taskbarMode'))).toBe('dock');
});

test('settings export / import keeps the Apps folder arrangement', async ({ page }) => {
  await createProfile(page, 'Port');
  const file = await page.evaluate(() => ulyOS.desktopApi.settingsFile().data);
  expect(file.icons.filter((i) => i.folder === 'apps').length).toBeGreaterThan(5);
  expect(file.icons.some((i) => i.id === 'apps' && i.kind === 'folder')).toBe(true);
  // a hostile file cannot create other folders or point icons at one that does not exist
  const evil = { ...file, icons: [...file.icons.filter((i) => i.id !== 'apps'), { id: 'x1', kind: 'url', name: 'X', url: 'https://example.com/', folder: '../../etc' }] };
  const out = await page.evaluate(async (o) => { const f = new File([JSON.stringify(o)], 's.json', { type: 'application/json' }); window.__done = ulyOS.desktopApi.importSettings(f); await new Promise((r) => setTimeout(r, 400)); document.querySelector('.modal button:last-child').click(); await window.__done; return ulyOS.Desktop.icons.filter((i) => i.folder).map((i) => i.folder); }, evil);
  expect(out.every((f) => f === 'apps')).toBe(true);
});
