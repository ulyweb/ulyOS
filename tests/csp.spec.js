const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { hermetic, createProfile, watch } = require('./helpers');

test.beforeEach(async ({ context }) => { await hermetic(context); });

const APPS = [['systemvault', 'System Vault'], ['trustvault', 'TrustVault'], ['cryptocompass', 'Crypto Compass'], ['qrseal', 'QR Seal']];

test('the shell policy has no unsafe-inline for scripts and the page has no inline scripts', async ({ page }) => {
  const problems = watch(page);
  await createProfile(page, 'Csp');
  const r = await page.evaluate(() => ({
    csp: document.querySelector('meta[http-equiv=Content-Security-Policy]').content,
    inline: [...document.scripts].filter((s) => !s.src).length,
    handlers: [...document.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => /^on/i.test(a.name))).length,
  }));
  expect(r.csp).toMatch(/script-src 'self';/);
  expect(r.csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  expect(r.csp).not.toMatch(/unsafe-eval/);
  expect(r.inline).toBe(0);
  expect(r.handlers).toBe(0);
  // an injected inline script / handler must not run
  const ran = await page.evaluate(() => {
    window.__x = 0;
    const s = document.createElement('script'); s.textContent = 'window.__x = 1'; document.body.append(s);
    const b = document.createElement('button'); b.setAttribute('onclick', 'window.__x = 2'); document.body.append(b); b.click();
    return window.__x;
  });
  expect(ran).toBe(0);
  expect(problems.filter((p) => !/Refused to (execute|run)|Executing inline/.test(p))).toEqual([]);   // the two refusals above are the point
});

for (const [id, name] of APPS) {
  test('bundled app ' + id + ' runs under its own strict policy and stores data in the vault', async ({ page }) => {
    const problems = watch(page);
    await createProfile(page, 'Apps');
    await page.evaluate(([id, name]) => ulyOS.launch({ id, kind: 'local', name, file: 'apps/' + id + '.html', glyph: 'shield', mem: 60, w: 1000, h: 700 }), [id, name]);
    await page.waitForSelector(`.window[data-app="web:${id}"] iframe`);
    await page.waitForTimeout(1500);
    const fr = page.frames().find((f) => f.url().includes('apps/' + id + '.html'));
    expect(fr).toBeTruthy();
    const info = await fr.evaluate(() => ({ csp: document.querySelector('meta[http-equiv=Content-Security-Policy]')?.content || '', inlineNoHash: [...document.scripts].filter((s) => !s.src).length, title: document.title }));
    expect(info.csp).toContain("default-src 'none'");
    expect(info.csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(info.csp).not.toMatch(/unsafe-eval/);
    // storage goes to the profile vault (app writes its own state on first load)
    await fr.evaluate(() => localStorage.setItem('probe', '1'));
    expect(await page.evaluate((id) => ulyOS.vault.get('app:' + id + ':probe'), id)).toBe('1');
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('app:')))).toEqual([]);
    expect(problems).toEqual([]);
  });
}

for (const id of ['systemvault', 'trustvault', 'cryptocompass']) {
  test('app ' + id + ': every inline handler is routed through the bridge, injected ones are contained', async ({ page }) => {
    const problems = watch(page);
    await page.goto('/apps/' + id + '.html');
    await page.waitForFunction(() => typeof ulyOSBridge === 'object');
    // no raw on* attributes anywhere in the markup
    expect(await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => /^on/i.test(a.name))).length)).toBe(0);
    // names the handlers may reach must all exist
    const names = [...fs.readFileSync('apps/js/' + id + '.handlers.js', 'utf8').matchAll(/^    "([^"]+)": function/gm)].map((m) => m[1]);
    const missing = await page.evaluate((names) => names.filter((n) => { try { return eval('typeof ' + n) === 'undefined'; } catch { return true; } }), names);
    expect(missing).toEqual([]);
    // run-time handler text is interpreted with arguments
    const got = await page.evaluate((fn) => {
      const old = window[fn]; let args = null; window[fn] = function () { args = [].slice.call(arguments); };
      const b = document.createElement('button'); b.setAttribute('data-on-click', fn + "('abc',3,this.tagName)"); document.body.append(b); b.click();
      window[fn] = old; return args;
    }, names.find((n) => n !== '$'));
    expect(got).toEqual(['abc', 3, 'BUTTON']);
    // hostile handler text: not callable names, constructor tricks, innerHTML writes
    const hostile = await page.evaluate(() => {
      window.__pwn = 0; const out = [];
      for (const t of ["fetch('/x')", "eval('window.__pwn=1')", "this.constructor.constructor('window.__pwn=1')()", "window.__pwn=1", "document.body.innerHTML='<b>x</b>'", "Function('window.__pwn=1')()", "alert(1)"]) {
        const b = document.createElement('button'); b.setAttribute('data-on-click', t); document.body.append(b); b.click(); b.remove();
      }
      return { pwn: window.__pwn, bodyIntact: document.body.innerHTML.length > 100 };
    });
    expect(hostile).toEqual({ pwn: 0, bodyIntact: true });
    expect(problems.filter((p) => !/\[ulyOS app handler\]/.test(p))).toEqual([]);   // hostile attempts are logged, never executed
  });
}

test('QR Seal keeps its hash-pinned policy and passes its own self-test row', async ({ page }) => {
  await page.goto('/apps/qrseal.html');
  const csp = await page.evaluate(() => document.querySelector('meta[http-equiv=Content-Security-Policy]').content);
  expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+' 'sha256-[A-Za-z0-9+/=]+'/);
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
});

test('clickjacking guard hides ulyOS inside a foreign frame', async ({ page }) => {
  await page.setContent('<iframe id=x src="http://localhost:4173/index.html" width=600 height=400></iframe>');
  await page.waitForTimeout(1500);
  const fr = page.frames()[1];
  expect(await fr.evaluate(() => document.documentElement.style.display)).toBe('none');
});

test('every file the page or an app loads is listed for the offline package', async () => {
  const cfg = fs.readFileSync('js/config.js', 'utf8');
  const listed = new Set([...cfg.matchAll(/'([\w./-]+\.(?:js|html|css|png|webmanifest))'/g)].map((m) => m[1]));
  const need = new Set();
  const scan = (file, base) => {
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/(?:src|href)="([^":]+\.(?:js|css|png|webmanifest))"/g)) need.add(require('path').posix.normalize(require('path').posix.join(base, m[1])));
  };
  scan('index.html', '.');
  for (const a of ['trustvault', 'qrseal', 'systemvault', 'cryptocompass']) { need.add('apps/' + a + '.html'); scan('apps/' + a + '.html', 'apps'); }
  for (const f of need) expect(listed.has(f), f + ' missing from ulyOS.config.FILES').toBe(true);
});
