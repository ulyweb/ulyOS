const { test, expect } = require('@playwright/test');
const { PW, hermetic, createProfile, watch } = require('./helpers');

test.beforeEach(async ({ context }) => { await hermetic(context); });

test('passkey (WebAuthn PRF) unlocks sign-in and the lock screen, survives a password change', async ({ page, context }) => {
  const problems = watch(page);
  await createProfile(page, 'Keyed');
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
  expect(await page.evaluate(() => ulyOS.security.passkeySupported())).toBe(true);

  await expect(page.evaluate(() => ulyOS.security.addPasskey('wrong-password-123', 'x'))).rejects.toThrow(/incorrect/i);
  await page.evaluate((pw) => ulyOS.security.addPasskey(pw, 'Test key'), PW);
  expect(await page.evaluate(() => ulyOS.security.passkeys().map((k) => k.label))).toEqual(['Test key']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ulyos.vault.' + ulyOS.security.profileId())).wraps.map((w) => w.type))).toEqual(['password', 'passkey']);
  await page.evaluate(() => ulyOS.vault.set('app:test:note', 'via-passkey'));

  // sign in with the passkey instead of typing
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.auth-form');
  await page.click('.auth-passkey');
  await page.waitForSelector('.desk-icon', { timeout: 45000 });
  expect(await page.evaluate(() => ulyOS.vault.get('app:test:note'))).toBe('via-passkey');

  // lock screen
  await page.evaluate(() => ulyOS.security.lock('test'));
  await page.click('.auth-passkey');
  await page.waitForFunction(() => !document.body.classList.contains('locked'), null, { timeout: 30000 });

  // changing the password does not invalidate the passkey
  await page.evaluate((o) => ulyOS.security.changeSecret(o, 'Third-Strong-Pass-Phrase-5$'), PW);
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.auth-form');
  await page.click('.auth-passkey');
  await page.waitForSelector('.desk-icon', { timeout: 45000 });

  // removal
  await page.evaluate(() => ulyOS.security.removePasskey(ulyOS.security.passkeys()[0].cred));
  await page.evaluate(() => ulyOS.security.signOut());
  await page.waitForSelector('.auth-form');
  await expect(page.locator('.auth-passkey')).toHaveCount(0);
  expect(problems).toEqual([]);
});
