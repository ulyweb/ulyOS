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

  /* ---------- shared-folder transport ----------
     Pick any folder on this computer. If a sync client keeps that folder in step with the cloud (Google Drive for
     desktop, iCloud Drive, OneDrive, Dropbox, Box Drive, Nextcloud / ownCloud client) or it is a mounted network
     share (SMB / NAS), ulyOS reads and writes one encrypted file there and the service carries it between devices.
     ulyOS itself never talks to those services, so no account details are involved. Chromium browsers only. */
  const FOLDER_FILE = 'ulyos-sync.ulysync';
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('ulyos-sync', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const idbGet = async (k) => { const d = await idb(); return new Promise((res) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); };
  const idbSet = async (k, v) => { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); if (v == null) t.objectStore('kv').delete(k); else t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); };
  const dirKey = () => 'dir:' + ulyOS.security.profileId();
  Sync.folderSupported = !!window.showDirectoryPicker;
  let memDir = null;   // the handle for this session (the stored copy is only read after a reload)
  Sync.folderName = async () => cfg.folder || '';
  Sync.pickFolder = async function () {
    if (!window.showDirectoryPicker) throw new Error('Your browser cannot open folders (use Chrome or Edge on a computer)');
    const handle = await window.showDirectoryPicker({ id: 'ulyos-sync', mode: 'readwrite' });
    memDir = handle;
    await idbSet(dirKey(), handle);
    cfg.folder = handle.name; saveCfg();
    ulyOS.audit("Sync folder '" + handle.name + "' chosen", 'ok');
    return handle;
  };
  Sync.forgetFolder = async () => { memDir = null; await idbSet(dirKey(), null); delete cfg.folder; saveCfg(); };
  async function folderHandle(interactive) {
    const dirH = memDir || (memDir = await idbGet(dirKey()));
    if (!dirH) throw new Error('Choose a sync folder first');
    let perm = await dirH.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') { if (!interactive) throw new Error('needs-permission'); perm = await dirH.requestPermission({ mode: 'readwrite' }); }
    if (perm !== 'granted') throw new Error('Permission to use the folder was not granted');
    return dirH;
  }
  const folderTransport = (interactive) => ({
    async read() { const d = await folderHandle(interactive); try { return await (await (await d.getFileHandle(FOLDER_FILE)).getFile()).text(); } catch (e) { if (e.name === 'NotFoundError') return null; throw e; } },
    async write(text) { const d = await folderHandle(interactive); const w = await (await d.getFileHandle(FOLDER_FILE, { create: true })).createWritable(); await w.write(text); await w.close(); },
    ready() { if (!cfg.folder) throw new Error('Choose a sync folder first'); },
  });
  const gistTransport = () => ({
    async read() { return cfg.gist ? gistRead() : null; },
    write: (text) => gistWrite(text),
    ready() { if (!cfg.token) throw new Error('Add a GitHub token first (or use the file method)'); },
  });

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
  Sync.syncNow = async function (mode, via) {
    if (running) return null; running = true;
    try {
      need();
      const T = via === 'folder' ? folderTransport(true) : gistTransport();
      T.ready();
      const local = snapshot();
      let remote = null, salt = null;
      { const txt = await T.read(); if (txt) { const u = await unpack(txt, cfg.pass); remote = u.state; salt = u.salt; } }
      let res;
      if (!remote) res = { merged: local, apply: [], remoteNeedsUpdate: true };
      else if (mode === 'replace') res = { merged: remote, apply: Object.entries(remote.items).filter(([k, i]) => local.items[k] ? local.items[k].v !== i.v : true).map(([k, i]) => ({ k, v: i.v, t: i.t })).concat(Object.keys(local.items).filter((k) => !remote.items[k]).map((k) => ({ k, v: null, t: Date.now() }))), remoteNeedsUpdate: false };
      else res = merge(local, remote);
      if (res.remoteNeedsUpdate) await T.write(await pack({ ...res.merged, device: cfg.device }, cfg.pass, salt));
      applyLocal(res.apply);
      cfg.last = Date.now(); cfg.lastResult = (via === 'folder' ? 'folder: ' : '') + res.apply.length + ' received' + (res.remoteNeedsUpdate ? ', sent' : ''); saveCfg();
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
  Sync.config = () => ({ folder: cfg.folder || '', hasPass: !!cfg.pass, hasToken: !!cfg.token, gist: cfg.gist || '', auto: !!cfg.auto, last: cfg.last || 0, lastResult: cfg.lastResult || '', device: cfg.device });
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
  const folderHandle0 = () => folderHandle(true);
  Sync.settingsSection = function ({ row }) {
    const wrap = h('div', {});
    const download = (blob, name) => { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    const fmt = (t) => (t ? new Date(t).toLocaleString() : 'never');
    const fail = (e) => ui.toast(e.message, { type: 'err', timeout: 6000 });
    const share = async (blob, name) => {
      const file = new File([blob], name, { type: blob.type || 'application/json' });
      if (!(navigator.canShare && navigator.canShare({ files: [file] }))) { fail(new Error('Sharing files is not supported here — use Export instead')); return; }
      try { await navigator.share({ files: [file], title: name }); } catch (e) { if (e.name !== 'AbortError') fail(e); }
    };
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.json', { type: 'application/json' })] }));
    function paint() {
      const c = Sync.config();
      wrap.replaceChildren(
        h('p', { class: 'set-desc', text: 'Keep your settings, desktop layout, widgets and app data identical on all your devices. Everything is encrypted on this device with your sync passphrase before it leaves; the file or gist is unreadable without it. Sandbox files and the audit log are not synced.' }),
        h('details', { class: 'howto' }, h('summary', { text: 'How sync works — step by step' }),
          h('p', { html: 'Your data is locked on this device with the <b>sync passphrase</b>, and only the locked copy leaves. To sync, every device needs the <b>same passphrase</b> and a way to reach the same locked copy: a <b>file</b> you carry, or a <b>GitHub gist</b> that ulyOS reads and writes for you.' }),
          h('p', { html: '<b>Option A — file (no accounts):</b> on device 1 set the passphrase → <i>Export</i>. Send the .ulysync file to device 2 (AirDrop, email, cloud drive). On device 2 set the <i>same</i> passphrase → <i>Import</i>. Repeat in the other direction whenever you want them to match.' }),
          h('p', { html: '<b>Option B — automatic through GitHub:</b>' }),
          h('ol', {}, [
            h('li', { html: 'On every device set the same <b>sync passphrase</b> (step 1 below). It is not your profile password and never leaves the device unencrypted.' }),
            h('li', { html: 'On github.com open <b>Settings → Developer settings → Personal access tokens</b> and create a token whose only permission is <b>Gists</b> (classic token: tick just “gist”). Copy it — it starts with <code>ghp_</code> or <code>github_pat_</code>.' }),
            h('li', { html: 'Device 1: <b>Connect…</b>, paste the token, leave <i>Gist ID</i> empty, then <b>Sync now</b>. A secret gist is created; its ID appears next to “Connected” — press <b>Copy gist ID</b>.' }),
            h('li', { html: 'Device 2: set the same passphrase, <b>Connect…</b>, paste the token and the Gist ID, choose <b>Merge</b>, and it pulls everything across.' }),
            h('li', { html: 'Switch on <b>Sync automatically</b> on each device. Changes travel on sign-in and every 10 minutes; when new changes arrive ulyOS offers to reload.' }),
          ]),
          h('p', { html: '<b>Safe?</b> The gist only holds scrambled data; without your passphrase it is unreadable even to GitHub. The token is kept inside your encrypted vault. If a device is lost, delete the token on GitHub.' })),
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
        canShare ? row('Share sync file', 'Opens the share sheet — on iPhone / iPad choose “Save to Files” → iCloud Drive; on Android pick Drive or any app', h('button', { class: 'btn sm', text: 'Share…', disabled: !c.hasPass, onclick: async () => { try { await share(await Sync.exportFile(), 'ulyOS-' + stamp() + '.ulysync'); } catch (e) { fail(e); } } })) : null,
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
              c.gist ? h('button', { class: 'btn sm', text: 'Copy gist ID', onclick: async () => { try { await navigator.clipboard.writeText(c.gist); ui.toast('Gist ID copied — paste it on your other device', { type: 'ok' }); } catch { fail(new Error('Could not copy')); } } }) : null,
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
        h('h3', { text: '4 · Cloud drive or network folder' }),
        h('details', { class: 'howto' }, h('summary', { text: 'How to use Google Drive, iCloud, OneDrive, Dropbox, Box, Nextcloud or a network share' }),
          h('p', { html: 'ulyOS never logs in to those services. Instead you point it at a <b>folder on this computer</b> and the service you already use keeps that folder in step with the cloud:' }),
          h('ul', {}, [
            h('li', { html: '<b>Google Drive, OneDrive, Dropbox, Box, iCloud Drive:</b> install the service’s desktop app (Drive for desktop, OneDrive, Dropbox, Box Drive, iCloud for Windows / built into macOS) and choose a folder inside it.' }),
            h('li', { html: '<b>Nextcloud / ownCloud:</b> use its desktop sync client and choose a folder inside the sync folder.' }),
            h('li', { html: '<b>Network drive (Samba / SMB, NAS):</b> mount the share in Finder / Explorer first, then choose a folder on it.' }),
          ]),
          h('p', { html: 'Then: set your sync passphrase, <b>Choose folder…</b>, press <b>Sync now</b>. On your other computer pick the same shared folder and the same passphrase. The folder only ever holds an encrypted <code>ulyos-sync.ulysync</code> file and, if you save it, <code>ulyOS-settings.json</code>. Needs Chrome or Edge on a computer; on phones use the Share button above.' })),
        Sync.folderSupported
          ? (c.folder
            ? row('Folder: ' + c.folder, 'Merge with the encrypted file in this folder, or move your settings file in and out', h('div', { class: 'btn-row' },
              h('button', { class: 'btn sm primary', html: icon('refresh', 14) + ' Sync now', disabled: !c.hasPass, onclick: async (e) => { e.target.disabled = true; try { await Sync.syncNow(undefined, 'folder'); ui.toast('Folder sync complete', { type: 'ok' }); } catch (x) { fail(x); } paint(); } }),
              h('button', { class: 'btn sm', text: 'Save settings file here', onclick: async () => {
                try { const d = await folderHandle0(); const { blob } = ulyOS.desktopApi.settingsFile(); const w = await (await d.getFileHandle('ulyOS-settings.json', { create: true })).createWritable(); await w.write(blob); await w.close(); ui.toast('Saved ulyOS-settings.json in ' + c.folder, { type: 'ok' }); ulyOS.audit('Settings file written to sync folder', 'ok'); } catch (x) { fail(x); } } }),
              h('button', { class: 'btn sm', text: 'Open settings file…', onclick: async () => {
                try { const d = await folderHandle0(); const [fh] = await window.showOpenFilePicker({ startIn: d, types: [{ description: 'ulyOS settings (.json)', accept: { 'application/json': ['.json'] } }] }); await ulyOS.desktopApi.importSettings(await fh.getFile()); } catch (x) { if (x.name !== 'AbortError') fail(x); } } }),
              h('button', { class: 'btn sm', text: 'Change…', onclick: async () => { try { await Sync.pickFolder(); paint(); } catch (x) { if (x.name !== 'AbortError') fail(x); } } }),
              h('button', { class: 'btn sm', text: 'Disconnect', onclick: async () => { await Sync.forgetFolder(); paint(); } })))
            : row('Choose a folder', null, h('button', { class: 'btn sm primary', text: 'Choose folder…', onclick: async () => { try { await Sync.pickFolder(); paint(); } catch (x) { if (x.name !== 'AbortError') fail(x); } } })))
          : row('Not available in this browser', 'Folder access needs Chrome or Edge on a computer. Use Export / Import or Share above.', null),
        h('p', { class: 'set-desc', style: { marginTop: '14px' }, text: 'If two devices change the same item at nearly the same moment, the later change wins and the other is overwritten. When changes arrive from another device, ulyOS asks to reload and you sign in again.' }));
    }
    bus.on('sync:done', () => { if (wrap.isConnected) paint(); });
    paint();
    return wrap;
  };
})();
