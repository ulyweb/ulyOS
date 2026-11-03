const { test, expect } = require('@playwright/test');
const { PW, hermetic, createProfile, watch, seedLegacyProfiles } = require('./helpers');
const NEW = 'Brand-New-Strong-Pass-42!';

test.beforeEach(async ({ context }) => { await hermetic(context); });

test('a password is mandatory: no opt-out, no PIN, weak passwords refused', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/index.html');
  await page.waitForSelector('.auth-form');
  await expect(page.locator('.check input')).toHaveCount(0);
  await expect(page.locator('.seg button:has-text("PIN")')).toHaveCount(0);
  await page.fill('input[placeholder="Profile name"]', 'Alpha');
  await page.fill('.pwc input[placeholder="Password"]', 'short');
  await page.fill('.pwc input[placeholder="Confirm"]', 'short');
  await page.click('button:has-text("Create profile")');
  await expect(page.locator('.auth-err')).toContainText('at least 10 characters');
  await page.fill('.pwc input[placeholder="Password"]', '');
  await page.fill('.pwc input[placeholder="Confirm"]', '');
  await page.click('button:has-text("Create profile")');
  await expect(page.locator('.auth-err')).not.toBeEmpty();
  expect(await page.evaluate(() => localStorage.getItem('ulyos.profiles'))).toBeNull();
  expect(problems).toEqual([]);
});

test('vault is a v2 record: password-wrapped master key, no plaintext, no stored password', async ({ page }) => {
  await createProfile(page, 'Alpha');
  const info = await page.evaluate((pw) => {
    const id = ulyOS.security.profileId();
    const raw = localStorage.getItem('ulyos.vault.' + id);
    const everything = JSON.stringify(Object.entries(localStorage));
    return { v: JSON.parse(raw).v, wraps: JSON.parse(raw).wraps.map((w) => w.type), leaksSettings: raw.includes('ulyos.settings') || raw.includes('accent'), leaksPassword: everything.includes(pw) };
  }, PW);
  expect(info).toEqual({ v: 2, wraps: ['password'], leaksSettings: false, leaksPassword: false });
});

test('lock screen, wrong password, change password keeps data', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Alpha');
  await page.evaluate(() => ulyOS.vault.set('app:test:note', 'kept'));
  await page.evaluate(() => ulyOS.security.lock('test'));
  await page.waitForSelector('.auth-form');
  await page.fill('.auth-input', 'wrong-password-x');
  await page.click('.auth-go');
  await expect(page.locator('.auth-err')).toContainText('Incorrect password');
  await page.fill('.auth-input', PW);
  await page.click('.auth-go');
  await page.waitForFunction(() => !document.body.classList.contains('locked'), null, { timeout: 30000 });
  await expect(page.evaluate(() => ulyOS.security.changeSecret('nope-nope-nope', 'Whatever-Strong-Pass-1!'))).rejects.toThrow(/incorrect/i);
  await expect(page.evaluate((p) => ulyOS.security.changeSecret(p, 'weak'), PW)).rejects.toThrow(/10 characters/);
  await page.evaluate(([o, n]) => ulyOS.security.changeSecret(o, n), [PW, NEW]);
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.auth-form');
  await page.fill('.auth-input', PW);
  await page.click('.auth-go');
  await expect(page.locator('.auth-err')).toContainText('Incorrect password');
  await page.fill('.auth-input', NEW);
  await page.click('.auth-go');
  await page.waitForSelector('.desk-icon', { timeout: 45000 });
  expect(await page.evaluate(() => ulyOS.vault.get('app:test:note'))).toBe('kept');
  expect(problems).toEqual([]);
});

test('Settings → Security has no way to remove the password', async ({ page }) => {
  await createProfile(page, 'Alpha');
  await page.evaluate(() => ulyOS.desktopApi.openSettings('security'));
  await page.waitForSelector('.set-content :text("Change password")');
  await expect(page.locator('.set-content :text("Remove password")')).toHaveCount(0);
});

test('profiles from earlier versions are forced onto a strong password', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForSelector('.auth-form');
  await seedLegacyProfiles(page);
  await page.reload();
  await page.waitForSelector('.prof-grid');
  await expect(page.locator('.prof-sub')).toContainText(['Password needed']);

  // strong v1 password → silently upgraded
  await page.click('.prof:has-text("Strongy")');
  await page.fill('.auth-input', 'Old-But-Strong-Pass-9!');
  await page.click('.auth-go');
  await page.waitForSelector('.desk-icon', { timeout: 45000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ulyos.vault.p_cccccccccc')).v)).toBe(2);
  expect(await page.evaluate(() => ulyOS.vault.get('legacy-marker'))).toBe('p_cccccccccc');
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.prof-grid');

  // PIN → must choose a password, weak one refused, old PIN dead afterwards
  await page.click('.prof:has-text("Pinny")');
  await page.fill('.auth-input', '482915');
  await page.click('.auth-go');
  await page.waitForSelector('h2:has-text("Choose a strong password")');
  await page.fill('.pwc input[placeholder="Password"]', '12345');
  await page.fill('.pwc input[placeholder="Confirm"]', '12345');
  await page.click('button:has-text("Set password and continue")');
  await expect(page.locator('.auth-err')).toContainText('at least 10');
  await page.fill('.pwc input[placeholder="Password"]', NEW);
  await page.fill('.pwc input[placeholder="Confirm"]', NEW);
  await page.click('button:has-text("Set password and continue")');
  await page.waitForSelector('.desk-icon', { timeout: 45000 });
  expect(await page.evaluate(() => ulyOS.vault.get('legacy-marker'))).toBe('p_bbbbbbbbbb');
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.prof-grid');
  await page.click('.prof:has-text("Pinny")');
  await page.fill('.auth-input', '482915');
  await page.click('.auth-go');
  await expect(page.locator('.auth-err')).toContainText('Incorrect password');

  // profile without any password → must set one, plaintext gone from storage
  await page.click('.link:has-text("All profiles")');
  await page.click('.prof:has-text("Plain")');
  await page.click('.auth-go');
  await page.waitForSelector('h2:has-text("Choose a strong password")');
  await page.fill('.pwc input[placeholder="Password"]', NEW);
  await page.fill('.pwc input[placeholder="Confirm"]', NEW);
  await page.click('button:has-text("Set password and continue")');
  await page.waitForSelector('.desk-icon', { timeout: 45000 });
  expect(await page.evaluate(() => localStorage.getItem('ulyos.vault.p_aaaaaaaaaa').includes('legacy-marker'))).toBe(false);
  expect(await page.evaluate(() => ulyOS.vault.get('legacy-marker'))).toBe('p_aaaaaaaaaa');
});

test('encrypted backup round-trips into a new profile', async ({ page }) => {
  await createProfile(page, 'Alpha');
  await page.evaluate(() => ulyOS.vault.set('app:test:note', 'in-backup'));
  const text = await page.evaluate(async (p) => await (await ulyOS.security.exportProfile(p)).text(), NEW);
  expect(text).not.toContain('in-backup');
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.auth-form');
  await page.click('.link:has-text("All profiles")');
  await page.click('.prof.add');
  await page.click('.link:has-text("Import encrypted backup")');
  await page.setInputFiles('input[type=file]', { name: 'b.ulyprofile', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.fill('input[placeholder="Backup password"]', NEW);
  await page.click('button:has-text("Import profile")');
  await page.waitForSelector('.desk-icon', { timeout: 45000 });
  expect(await page.evaluate(() => ulyOS.vault.get('app:test:note'))).toBe('in-backup');
});
