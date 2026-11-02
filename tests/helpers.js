// Shared helpers. Tests are hermetic: every request that is not to the local server is stubbed or aborted.
const PW = 'Tr0ub4dor&3-Longer-Pass!';

async function hermetic(context, extra) {
  await context.route(/^https?:\/\/(?!localhost)/, async (route) => {
    const url = route.request().url();
    if (extra) { const r = await extra(route, url); if (r !== false) return; }
    if (/script\.google\.com/.test(url)) return route.fulfill({ status: 200, body: 'ok', headers: { 'access-control-allow-origin': '*' } });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
  });
}

/** Creates a profile through the real UI and waits for the desktop. */
async function createProfile(page, name = 'Tester', pw = PW) {
  await page.goto('/index.html');
  await page.waitForSelector('.auth-form');
  await page.fill('input[placeholder="Profile name"]', name);
  await page.fill('.pwc input[placeholder="Password"]', pw);
  await page.fill('.pwc input[placeholder="Confirm"]', pw);
  await page.click('button:has-text("Create profile")');
  await page.waitForSelector('.desk-icon', { timeout: 45000 });
}

/** Collects page errors and CSP violations. */
function watch(page) {
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    const t = m.text();
    if (/Refused to|Content Security Policy|\[ulyOS app handler\]/.test(t)) problems.push(t.slice(0, 200));
    else if (m.type() === 'error' && !/favicon|Failed to load resource|net::ERR/.test(t)) problems.push('console.error: ' + t.slice(0, 200));
  });
  return problems;
}

/** Seeds v1 (pre-1.9) profile records exactly as ulyOS 1.8 stored them. */
async function seedLegacyProfiles(page) {
  await page.evaluate(async () => {
    const enc = new TextEncoder(), b64 = (u) => btoa(String.fromCharCode(...u));
    const mk = async (id, name, secret, cred) => {
      const prof = { id, name, color: '#8fa3ff', protected: !!secret, cred: secret ? cred : 'none', created: Date.now() };
      const data = { 'legacy-marker': id };
      let rec;
      if (secret) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const km = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('ulyOS-vault-v1:' + id) }, key, enc.encode(JSON.stringify(data))));
        rec = { v: 1, enc: true, iter: 600000, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
      } else rec = { v: 1, enc: false, data };
      localStorage.setItem('ulyos.vault.' + id, JSON.stringify(rec));
      return prof;
    };
    const list = [await mk('p_aaaaaaaaaa', 'Plain', null), await mk('p_bbbbbbbbbb', 'Pinny', '482915', 'pin'), await mk('p_cccccccccc', 'Strongy', 'Old-But-Strong-Pass-9!', 'password')];
    localStorage.setItem('ulyos.profiles', JSON.stringify(list));
  });
}

module.exports = { PW, hermetic, createProfile, watch, seedLegacyProfiles };
