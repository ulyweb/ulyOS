#!/usr/bin/env node
/* Static checks run before the browser tests (npm run lint, and on every push in CI). */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const fail = [];
const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const walk = (d, out = []) => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { if (['node_modules', '.git', 'test-results', 'playwright-report'].includes(e.name)) continue; const p = path.posix.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; };
const files = walk('.');

// 1. every script parses
for (const f of files.filter((f) => /\.(js)$/.test(f) && !f.startsWith('tests/') && f !== 'playwright.config.js')) {
  const r = cp.spawnSync(process.execPath, ['--check', path.join(root, f)], { encoding: 'utf8' });
  if (r.status !== 0) fail.push('syntax error in ' + f + '\n' + r.stderr.split('\n').slice(0, 4).join('\n'));
}

// 2. no inline script / handler / unsafe-inline for scripts in any served HTML
for (const f of files.filter((f) => f.endsWith('.html') && !f.startsWith('tools/app-sources/'))) {
  const html = rd(f);
  const csp = (html.match(/Content-Security-Policy"\s+content="([^"]*)"/) || [])[1] || '';
  if (!csp) fail.push(f + ': no Content-Security-Policy');
  if (/script-src[^;]*unsafe-inline/.test(csp) || /script-src[^;]*(?<!wasm-)unsafe-eval/.test(csp)) fail.push(f + ': script-src allows unsafe-inline or unsafe-eval (only wasm-unsafe-eval is allowed)');
  const pinned = /script-src[^;]*'sha256-/.test(csp);
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)) if (!pinned) fail.push(f + ': inline <script> without a hash-pinned policy');
  if (/\son(click|change|input|keydown|keyup|submit|load|error)=["']/.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) fail.push(f + ': inline on*= handler in markup');
}
for (const f of files.filter((f) => /^js\/.*\.js$/.test(f) || f === 'sw.js')) {
  const s = rd(f);
  if (/\son(click|error|load|change)=\\?["']/.test(s) && !/app-bridge/.test(f)) fail.push(f + ': inline on*= handler inside a string');
  if (/\beval\(|new Function\(/.test(s) && f !== 'js/app-bridge.js') fail.push(f + ': eval / Function constructor');
}

// 3. converted apps are in sync with their sources
const before = files.filter((f) => /^apps\//.test(f)).map((f) => [f, rd(f)]);
cp.spawnSync(process.execPath, [path.join(root, 'tools/build-apps.js')], { encoding: 'utf8' });
for (const [f, s] of before) if (rd(f) !== s) { fs.writeFileSync(path.join(root, f), s); fail.push(f + ' is out of date — run "npm run build:apps" and commit'); }

// 4. nothing that looks like a secret is committed
const SECRET = [/ghp_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{30,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /AKIA[0-9A-Z]{16}/, /xox[bap]-[0-9A-Za-z-]{20,}/];
for (const f of files.filter((f) => !/^(node_modules|tests)\//.test(f) && /\.(js|html|json|md|gs|webmanifest|yml)$/.test(f))) { const s = rd(f); for (const re of SECRET) if (re.test(s)) fail.push(f + ': looks like a committed secret (' + re + ')'); }

// 5. plaintext password storage patterns
for (const f of files.filter((f) => /^js\/.*\.js$/.test(f))) if (/localStorage\.setItem\([^)]*(password|passphrase|secret)\b/i.test(rd(f))) fail.push(f + ': password-like value written straight to localStorage');

if (fail.length) { console.error('Lint failed:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('Lint OK (' + files.length + ' files checked)');
