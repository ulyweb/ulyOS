/* ==========================================================================
   ulyOS · js/sync.js
   Multi-device sync built on encrypted bundles (same idea as the encrypted
   profile backups). Everything that leaves the device is AES-256-GCM encrypted
   with a key derived (PBKDF2-SHA256, 600,000 iterations) from a sync passphrase
   that only you hold; the server / file never sees plaintext.

   • Merge: per key, the most recent change wins; deletions are remembered as
     tombstones (90 days) so a deleted icon does not come back.
   • Transports: a .ulysync file you move yourself, or a secret GitHub gist
     reached with a token you provide (stored only inside your encrypted vault).
   • Not synced: the sandbox files, the audit log, this device's sync settings.
   ========================================================================== */
(function () {
  'use strict';
  const { h, icon, stamp } = ulyOS.util;
  const { bus, ui } = ulyOS;
  const C = ulyOS.crypto;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const META = 'ulyos.sync.meta', CFG = 'ulyos.sync.cfg';
  const EXCLUDE = /^(ulyos\.sync\.|ulyos\.audit$|ulyos\.fs\.sealed$|ulyos\.migr\.|ulyos\.welcomed$)/;
  const TOMB_DAYS = 90, FILE = 'ulyos-sync.json', AAD = enc.encode('ulyOS-sync-v1');
  const API = 'https://api.github.com';
  const V = () => ulyOS.vault;

  const Sync = (ulyOS.sync = { EXCLUDE });
  let meta = {}, cfg = {}, metaTimer = 0, running = false, autoTimer = 0;

  /* ---------- local change tracking ---------- */
  function loadState() {
    try { meta = JSON.parse(V().get(META) || '{}') || {}; } catch { meta = {}; }
    try { cfg = JSON.parse(V().get(CFG) || '{}') || {}; } catch { cfg = {}; }
    if (!cfg.device) { cfg.device = Array.from(C.rand(6)).map((b) => b.toString(16).padStart(2, '0')).join(''); saveCfg(); }
  }
  const saveCfg = () => V().setRaw(CFG, JSON.stringify(cfg));
  const saveMeta = () => { clearTimeout(metaTimer); metaTimer = setTimeout(() => V().setRaw(META, JSON.stringify(meta)), 400); };
  V().watch((k, deleted) => { if (EXCLUDE.test(k) || !ulyOS.security.profileId()) return; meta[k] = { t: Date.now(), d: deleted ? 1 : 0 }; saveMeta(); });

  function snapshot() {
    const items = {}, tomb = {};
    for (const k of V().keys()) if (!EXCLUDE.test(k)) items[k] = { v: V().get(k), t: (meta[k] && meta[k].t) || 0 };
    const cutoff = Date.now() - TOMB_DAYS * 864e5;
    for (const [k, m] of Object.entries(meta)) if (m.d && !(k in items)) { if (m.t > cutoff) tomb[k] = m.t; else delete meta[k]; }
    return { v: 1, device: cfg.device, at: Date.now(), items, tomb };
  }

  /** Newest change per key wins. Returns the merged state and what must change locally. */
  function merge(local, remote) {
    const out = { v: 1, device: local.device, at: Date.now(), items: {}, tomb: {} };
    const apply = [];
    let remoteNeedsUpdate = false;
    const keys = new Set([...Object.keys(local.items), ...Object.keys(local.tomb), ...Object.keys(remote.items || {}), ...Object.keys(remote.tomb || {})]);
    for (const k of keys) {
      if (EXCLUDE.test(k)) continue;
      const li = local.items[k], lt = local.tomb[k] || 0, ri = (remote.items || {})[k], rt = (remote.tomb || {})[k] || 0;
      const L = li ? li.t : lt, R = ri ? ri.t : rt;
      const lIsItem = !!li, rIsItem = !!ri;
      let winner;   // 'l' | 'r'
      if (L > R) winner = 'l'; else if (R > L) winner = 'r';
      else if (lIsItem === rIsItem && (!lIsItem || li.v === ri.v)) winner = 'l';   // identical
      else winner = String(remote.device) > String(local.device) ? 'r' : 'l';
      if (winner === 'l') {
        if (lIsItem) { out.items[k] = li; if (!rIsItem || ri.v !== li.v || R !== L) remoteNeedsUpdate = true; } else { out.tomb[k] = lt; if (rIsItem || R !== L) remoteNeedsUpdate = true; }
      } else if (rIsItem) { out.items[k] = ri; if (!lIsItem || li.v !== ri.v) apply.push({ k, v: ri.v, t: ri.t }); }
      else { out.tomb[k] = rt; if (lIsItem) apply.push({ k, v: null, t: rt }); }
    }
    return { merged: out, apply, remoteNeedsUpdate };
  }

  /* ---------- encrypted envelope ---------- */
  const keyCache = new Map();
  async function keyFor(pass, salt, iter) {
    const id = pass + '|' + C.b64.enc(salt) + '|' + iter;
    if (!keyCache.has(id)) { keyCache.clear(); keyCache.set(id, await C.deriveKey(pass, salt, iter)); }
    return keyCache.get(id);
  }
  async function pack(state, pass, salt) {
    salt = salt || C.rand(16);
    const key = await keyFor(pass, salt, C.ITER), iv = C.rand(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, enc.encode(JSON.stringify(state))));
    return JSON.stringify({ format: 'ulyOS-sync', v: 1, updated: new Date().toISOString(), iter: C.ITER, salt: C.b64.enc(salt), iv: C.b64.enc(iv), ct: C.b64.enc(ct) });
  }
  async function unpack(text, pass) {
    let o; try { o = JSON.parse(text); } catch { throw new Error('Not a ulyOS sync file'); }
    if (o.format !== 'ulyOS-sync' || !(o.iter >= 100000 && o.iter <= 5000000) || typeof o.salt !== 'string' || typeof o.iv !== 'string' || typeof o.ct !== 'string') throw new Error('Not a ulyOS sync file');
    const salt = C.b64.dec(o.salt);
    const key = await keyFor(pass, salt, o.iter);
    let plain; try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: C.b64.dec(o.iv), additionalData: AAD }, key, C.b64.dec(o.ct)); } catch { throw new Error('Wrong sync passphrase, or the sync data is damaged'); }
    const st = JSON.parse(dec.decode(plain));
    if (!st || typeof st !== 'object' || typeof st.items !== 'object') throw new Error('Sync data is malformed');
    // only plain strings under sane key names are accepted from the outside
    const okKey = (k) => typeof k === 'string' && k.length <= 200 && !EXCLUDE.test(k);
    for (const k of Object.keys(st.items)) if (!okKey(k) || typeof st.items[k].v !== 'string' || !Number.isFinite(st.items[k].t)) delete st.items[k];
    st.tomb = st.tomb || {};
    for (const k of Object.keys(st.tomb)) if (!okKey(k) || !Number.isFinite(st.tomb[k])) delete st.tomb[k];
    return { state: st, salt };
  }

  /* ---------- transports ---------- */
  async function gh(path, opts = {}) {
    let r;
    try { r = await fetch(API + path, { ...opts, headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + cfg.token, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store' }); }
    catch { throw new Error('Could not reach GitHub (offline, or blocked)'); }
    if (r.status === 401) throw new Error('GitHub rejected the token (expired or wrong)');
    if (r.status === 403 || r.status === 429) throw new Error('GitHub refused the request (rate limit or the token lacks the "gist" permission)');
    if (r.status === 404) throw new Error('Gist not found — check the gist ID and that the token owns it');
    if (!r.ok) throw new Error('GitHub error ' + r.status);
    return r.json();
  }
  async function gistRead() {
    const g = await gh('/gists/' + encodeURIComponent(cfg.gist));
    const f = g.files && g.files[FILE];
    if (!f) return null;
    if (f.truncated && f.raw_url) { const r = await fetch(f.raw_url, { cache: 'no-store' }); if (!r.ok) throw new Error('Could not read the sync gist'); return r.text(); }
    return f.content;
  }
  async function gistWrite(text) {
    if (!cfg.gist) {
      const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: 'ulyOS encrypted sync (unreadable without the sync passphrase)', public: false, files: { [FILE]: { content: text } } }) });
      cfg.gist = g.id; saveCfg();
    } else await gh('/gists/' + encodeURIComponent(cfg.gist), { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: text } } }) });
  }

  /* ---------- operations ---------- */
  function need() {
    if (!cfg.pass) throw new Error('Set a sync passphrase first');
  }
  function applyLocal(apply) {
    for (const a of apply) {
      if (a.v === null) V().removeRaw(a.k); else V().setRaw(a.k, a.v);
      meta[a.k] = { t: a.t, d: a.v === null ? 1 : 0 };
    }
    V().setRaw(META, JSON.stringify(meta));
  }
  async function afterApply(n) {
    if (!n) return;
    ulyOS.audit('Sync merged ' + n + ' change(s) from another device', 'ok');
    if (await ui.confirm({ title: 'Changes received', message: n + ' change(s) from your other device were merged. Reload ulyOS to apply them? You will sign in again.', okText: 'Reload now', cancelText: 'Later' })) { await V().flush(); location.reload(); }
  }

  /** Pull from the gist, merge, push back. mode 'replace' = take the synced copy as is. */
  Sync.syncNow = async function (mode) {
    if (running) return null; running = true;
    try {
      need();
      if (!cfg.token) throw new Error('Add a GitHub token first (or use the file method)');
      const local = snapshot();
      let remote = null, salt = null;
      if (cfg.gist) { const txt = await gistRead(); if (txt) { const u = await unpack(txt, cfg.pass); remote = u.state; salt = u.salt; } }
      let res;
      if (!remote) res = { merged: local, apply: [], remoteNeedsUpdate: true };
      else if (mode === 'replace') res = { merged: remote, apply: Object.entries(remote.items).filter(([k, i]) => local.items[k] ? local.items[k].v !== i.v : true).map(([k, i]) => ({ k, v: i.v, t: i.t })).concat(Object.keys(local.items).filter((k) => !remote.items[k]).map((k) => ({ k, v: null, t: Date.now() }))), remoteNeedsUpdate: false };
      else res = merge(local, remote);
      if (res.remoteNeedsUpdate) await gistWrite(await pack({ ...res.merged, device: cfg.device }, cfg.pass, salt));
      applyLocal(res.apply);
      cfg.last = Date.now(); cfg.lastResult = res.apply.length + ' received' + (res.remoteNeedsUpdate ? ', sent' : ''); saveCfg();
      bus.emit('sync:done');
      ulyOS.audit('Sync complete (' + cfg.lastResult + ')', 'ok');
      afterApply(res.apply.length);
      return res;
    } finally { running = false; }
  };
  Sync.exportFile = async function () {
    need();
    return new Blob([await pack(snapshot(), cfg.pass)], { type: 'application/json' });
  };
  /** Merge a .ulysync file into this device. Returns the number of changes applied. */
  Sync.importFile = async function (text) {
    need();
    const { state } = await unpack(text, cfg.pass);
    const res = merge(snapshot(), state);
    applyLocal(res.apply);
    cfg.last = Date.now(); cfg.lastResult = res.apply.length + ' received from file'; saveCfg();
    bus.emit('sync:done');
    ulyOS.audit('Sync file merged (' + res.apply.length + ' change(s))', 'ok');
    afterApply(res.apply.length);
    return res.apply.length;
  };
  Sync.config = () => ({ hasPass: !!cfg.pass, hasToken: !!cfg.token, gist: cfg.gist || '', auto: !!cfg.auto, last: cfg.last || 0, lastResult: cfg.lastResult || '', device: cfg.device });
  Sync.setPass = (p) => { const bad = C.policy(p, 'password'); if (bad) throw new Error(bad); cfg.pass = p; saveCfg(); };
  Sync.getPass = () => cfg.pass || '';
  Sync.setToken = (t, gist) => { cfg.token = (t || '').trim(); if (gist != null) cfg.gist = gist.trim(); saveCfg(); };
  Sync.disconnect = () => { delete cfg.token; delete cfg.gist; delete cfg.auto; delete cfg.last; saveCfg(); clearInterval(autoTimer); };
  Sync.setAuto = (on) => { cfg.auto = !!on; saveCfg(); schedule(); };
  const schedule = () => {
    clearInterval(autoTimer);
    if (cfg.auto && cfg.token && cfg.pass) autoTimer = setInterval(() => { if (!ulyOS.security.isLocked()) Sync.syncNow().catch((e) => ulyOS.audit('Auto-sync failed: ' + e.message, 'warn')); }, 10 * 60000);
  };

  bus.on('session:start', () => {
    keyCache.clear(); loadState(); schedule();
    if (cfg.auto && cfg.token && cfg.pass) setTimeout(() => Sync.syncNow().catch((e) => ulyOS.audit('Auto-sync failed: ' + e.message, 'warn')), 4000);
  });
  bus.on('session:lock', () => { keyCache.clear(); });

  /* ---------- Settings → Sync ---------- */
  Sync.settingsSection = function ({ row }) {
    const wrap = h('div', {});
    const download = (blob, name) => { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const fmt = (t) => (t ? new Date(t).toLocaleString() : 'never');
    const fail = (e) => ui.toast(e.message, { type: 'err', timeout: 6000 });
    function paint() {
      const c = Sync.config();
      wrap.replaceChildren(
        h('p', { class: 'set-desc', text: 'Keep your settings, desktop layout, widgets and app data identical on all your devices. Everything is encrypted on this device with your sync passphrase before it leaves; the file or gist is unreadable without it. Sandbox files and the audit log are not synced.' }),
        h('h3', { text: '1 · Sync passphrase' }),
        row(c.hasPass ? 'Passphrase is set' : 'Choose a passphrase', 'Use the same one on every device. It is separate from your profile password and is kept only inside your encrypted vault.',
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn sm primary', text: c.hasPass ? 'Change…' : 'Set…', onclick: async () => {
              const pwc = ui.passwordInput();
              const v = await ui.form({ title: 'Sync passphrase', message: 'Enter the same passphrase on each device. If you forget it the synced copy cannot be read.', fields: [{ name: 'pw', type: 'custom', node: pwc.el, get: pwc.value, focus: pwc.focus, dispose: pwc.dispose }, { name: 'pw2', type: 'custom', get: pwc.confirm }], okText: 'Save', validate: (x) => C.policy(x.pw, 'password') || (x.pw !== x.pw2 ? 'Entries do not match' : null) });
              if (!v) return;
              try { Sync.setPass(v.pw); ui.toast('Sync passphrase saved', { type: 'ok' }); paint(); } catch (e) { fail(e); }
            } }),
            c.hasPass ? h('button', { class: 'btn sm', text: 'Copy', onclick: async () => { try { await ulyOS.clip.copy(Sync.getPass()); ui.toast('Copied — paste it on your other device', { type: 'ok' }); } catch { fail(new Error('Could not copy')); } } }) : null)),
        h('h3', { text: '2 · Move a file yourself' }),
        row('Export sync file', 'An encrypted .ulysync file you can carry by AirDrop, cloud drive or USB', h('button', { class: 'btn sm', html: icon('download', 14) + ' Export', disabled: !c.hasPass, onclick: async () => { try { download(await Sync.exportFile(), (ulyOS.security.profile().name.replace(/[^\w.-]+/g, '_')) + '-' + stamp() + '.ulysync'); ui.toast('Sync file saved', { type: 'ok' }); } catch (e) { fail(e); } } })),
        row('Import sync file', 'Merges a file from another device: the newest change to each item wins', h('button', { class: 'btn sm', text: 'Import…', disabled: !c.hasPass, onclick: () => {
          const inp = h('input', { type: 'file', accept: '.ulysync,application/json' });
          inp.addEventListener('change', async () => { if (!inp.files[0]) return; try { const n = await Sync.importFile(await inp.files[0].text()); ui.toast(n ? n + ' change(s) merged' : 'Already up to date', { type: 'ok' }); paint(); } catch (e) { fail(e); } });
          inp.click();
        } })),
        h('h3', { text: '3 · Automatic sync through a secret GitHub gist' }),
        h('p', { class: 'set-desc', text: 'Create a fine-grained or classic token that has only the “gist” permission (github.com/settings/tokens). The token is stored only in your encrypted vault and is sent only to api.github.com. The gist holds encrypted data, nothing readable.' }),
        c.hasToken
          ? row('Connected', 'Gist: ' + (c.gist || '(will be created on first sync)') + ' · last sync ' + fmt(c.last) + (c.lastResult ? ' (' + c.lastResult + ')' : ''),
            h('div', { class: 'btn-row' },
              h('button', { class: 'btn sm primary', html: icon('refresh', 14) + ' Sync now', disabled: !c.hasPass, onclick: async (e) => { e.target.disabled = true; try { await Sync.syncNow(); ui.toast('Sync complete', { type: 'ok' }); } catch (x) { fail(x); } paint(); } }),
              h('button', { class: 'btn sm', text: 'Disconnect', onclick: () => { Sync.disconnect(); paint(); } })))
          : row('Connect', null, h('button', { class: 'btn sm primary', text: 'Connect…', onclick: async () => {
            const v = await ui.form({ title: 'Connect GitHub gist', message: 'First device: leave Gist ID empty. Other devices: paste the Gist ID shown on your first device.', fields: [{ name: 'tok', label: 'GitHub token (gist permission only)', type: 'password' }, { name: 'gist', label: 'Gist ID (optional)', value: '' }], okText: 'Connect', validate: (x) => (/^[\w-]{20,}$/.test((x.tok || '').trim()) ? ((x.gist || '').trim() && !/^[0-9a-f]{20,40}$/i.test(x.gist.trim()) ? 'That does not look like a gist ID' : null) : 'Paste a GitHub token') });
            if (!v) return;
            Sync.setToken(v.tok, v.gist);
            if (v.gist.trim() && Sync.config().hasPass) {
              const how = await ui.choose({ title: 'Existing synced data found', message: 'How should this device start?', choices: [{ label: 'Merge — newest change wins', value: 'merge', primary: true }, { label: 'Replace this device with the synced copy', value: 'replace', danger: true }] });
              if (how) { try { await Sync.syncNow(how); ui.toast('Sync complete', { type: 'ok' }); } catch (e) { fail(e); } }
            }
            paint();
          } })),
        c.hasToken ? row('Sync automatically', 'On sign-in and every 10 minutes while you are signed in', h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: c.auto, onchange: (e) => Sync.setAuto(e.target.checked) }), h('i'))) : null,
        h('p', { class: 'set-desc', style: { marginTop: '14px' }, text: 'If two devices change the same item at nearly the same moment, the later change wins and the other is overwritten. When changes arrive from another device, ulyOS asks to reload and you sign in again.' }));
    }
    bus.on('sync:done', () => { if (wrap.isConnected) paint(); });
    paint();
    return wrap;
  };
})();
