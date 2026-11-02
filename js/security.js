/* ==========================================================================
   ulyOS · js/security.js
   Profiles, password / PIN protection, encrypted per-profile vault,
   lock screen + idle auto-lock, encrypted profile backup/restore,
   file-encryption helpers and the storage shim for embedded apps.

   Crypto: PBKDF2-SHA256 (600,000 iterations) → AES-256-GCM, random salt per
   vault and random 96-bit IV per write. The key is non-extractable and lives
   only in memory while a profile is signed in.
   ========================================================================== */
(function () {
  'use strict';

  const { h, icon, store, clamp, dur } = ulyOS.util;
  const { bus, ui } = ulyOS;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const ITER = 600000;
  const PKEY = 'ulyos.profiles';
  const LASTKEY = 'ulyos.lastProfile';
  const vkey = (id) => 'ulyos.vault.' + id;
  const fkey = (id) => 'ulyos.fail.' + id;
  const COLORS = ['#8fa3ff', '#5eead4', '#fbbf24', '#fb7185', '#a78bfa', '#38bdf8', '#a3e635', '#f97316'];
  const LEGACY_KEYS = ['ulyos.settings', 'ulyos.icons', 'ulyos.audit', 'ulyos.ramLimit', 'ulyos.welcomed', 'ulyos.fs.seeded'];

  /* ------------------------------------------------------------------------
     Crypto helpers (exposed as ulyOS.crypto)
     ------------------------------------------------------------------------ */
  const b64 = {
    enc(u8) {
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    },
    dec(str) {
      const bin = atob(str); const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    },
  };
  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
  const hasCrypto = !!(window.crypto && crypto.subtle && window.isSecureContext);

  async function deriveKey(secret, salt, iter) {
    const km = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, km,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(key, bytes, aad) {
    const iv = rand(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, bytes));
    return { iv, ct };
  }
  const unseal = async (key, iv, ct, aad) =>
    new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, ct));
  const aadFor = (id) => enc.encode('ulyOS-vault-v1:' + id);

  /** Unbiased random int in [0, n) */
  function randInt(n) {
    const lim = Math.floor(0x100000000 / n) * n;
    const b = new Uint32Array(1);
    do { crypto.getRandomValues(b); } while (b[0] >= lim);
    return b[0] % n;
  }
  function generatePassword(len = 20, o = {}) {
    const on = { lower: true, upper: true, digits: true, symbols: true, ...o };
    const sets = [];
    if (on.lower) sets.push('abcdefghijkmnopqrstuvwxyz');
    if (on.upper) sets.push('ABCDEFGHJKLMNPQRSTUVWXYZ');
    if (on.digits) sets.push('23456789');
    if (on.symbols) sets.push('!@#$%^&*()-_=+[]{};:,.?');
    if (!sets.length) sets.push('abcdefghijkmnopqrstuvwxyz');
    const all = sets.join('');
    for (;;) {
      let out = '';
      for (let i = 0; i < len; i++) out += all[randInt(all.length)];
      if (len < sets.length || sets.every((s) => [...out].some((c) => s.includes(c)))) return { password: out, pool: all.length, bits: Math.round(len * Math.log2(all.length)) };
    }
  }
  function generatePin(len = 8) { let out = ''; for (let i = 0; i < len; i++) out += randInt(10); return out; }
  function crackTime(bits) {
    const sec = Math.pow(2, bits) / 1e10;   // average case would be half this
    if (sec < 1) return 'instantly';
    const units = [[60, 'second'], [60, 'minute'], [24, 'hour'], [365, 'day'], [1000, 'year'], [1000, 'thousand years'], [1000, 'million years'], [1000, 'billion years']];
    let v = sec, label = 'second';
    for (let i = 0; i < units.length - 1; i++) { if (v < units[i][0]) break; v /= units[i][0]; label = units[i + 1][1]; }
    if (label === 'billion years' && v > 1e6) return 'longer than the age of the universe';
    return '≈ ' + (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(v >= 10 ? 0 : 1)) + ' ' + label + (/^(second|minute|hour|day|year)$/.test(label) && Math.round(v) !== 1 ? 's' : '');
  }
  const COMMON = /^(password|passw0rd|123456|1234567|12345678|qwerty|letmein|admin|welcome|iloveyou|monkey|dragon|abc123|trustno1)/i;
  function strength(pw) {
    if (!pw) return { bits: 0, label: '', level: 0 };
    let pool = 0;
    if (/[a-z]/.test(pw)) pool += 26;
    if (/[A-Z]/.test(pw)) pool += 26;
    if (/\d/.test(pw)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
    let bits = pw.length * Math.log2(pool || 1);
    bits *= Math.min(1, new Set(pw).size / pw.length + 0.35);
    if (/(.)\1{2,}/.test(pw)) bits -= 8;
    if (/0123|1234|2345|3456|abcd|bcde|qwer|asdf|zxcv/i.test(pw)) bits -= 10;
    if (COMMON.test(pw)) bits = Math.min(bits, 12);
    bits = Math.max(0, Math.round(bits));
    const [label, level] = bits < 28 ? ['Very weak', 1] : bits < 40 ? ['Weak', 2] : bits < 60 ? ['Fair', 3] : bits < 80 ? ['Strong', 4] : ['Excellent', 5];
    return { bits, label, level };
  }

  /** Minimum quality for anything that protects data at rest. Returns a message, or null if acceptable. */
  function policy(secret, cred) {
    if (cred === 'pin') {
      if (!/^\d{6,12}$/.test(secret)) return 'A PIN must be 6–12 digits';
      if (/^(\d)\1+$/.test(secret) || '01234567890123456789'.includes(secret) || '98765432109876543210'.includes(secret)) return 'That PIN is too easy to guess';
      return null;
    }
    if (secret.length < 10) return 'Use at least 10 characters (the generator makes strong ones)';
    const st = strength(secret);
    if (st.bits < 45) return 'Too easy to guess (about ' + st.bits + ' bits). Make it longer or more random, or use the generator';
    return null;
  }

  /* File encryption: "ULYENC1\0" | iter(u32) | salt(16) | iv(12) | AES-GCM( nameLen(u16) | name | data ) */
  const MAGIC = enc.encode('ULYENC1\0');
  async function encryptFile(data, password, name) {
    const iter = ITER, salt = rand(16), nm = enc.encode(name || 'file');
    const plain = new Uint8Array(2 + nm.length + data.length);
    plain[0] = nm.length >> 8; plain[1] = nm.length & 255; plain.set(nm, 2); plain.set(data, 2 + nm.length);
    const key = await deriveKey(password, salt, iter);
    const { iv, ct } = await seal(key, plain, MAGIC);
    const out = new Uint8Array(8 + 4 + 16 + 12 + ct.length);
    out.set(MAGIC, 0); new DataView(out.buffer).setUint32(8, iter); out.set(salt, 12); out.set(iv, 28); out.set(ct, 40);
    return out;
  }
  async function decryptFile(bytes, password) {
    if (bytes.length < 56 || !MAGIC.every((b, i) => bytes[i] === b)) throw new Error('Not a ulyOS encrypted file');
    const iter = new DataView(bytes.buffer, bytes.byteOffset).getUint32(8);
    if (iter < 100000 || iter > 5000000) throw new Error('Corrupted header');
    const key = await deriveKey(password, bytes.slice(12, 28), iter);
    let plain;
    try { plain = await unseal(key, bytes.slice(28, 40), bytes.slice(40), MAGIC); } catch { throw new Error('Wrong password or corrupted file'); }
    const n = (plain[0] << 8) | plain[1];
    return { name: dec.decode(plain.slice(2, 2 + n)), data: plain.slice(2 + n) };
  }
  /* ------------------------------------------------------------------------
     Purge memory — wipes typed / generated secrets and the clipboard.
     Runs on demand, when idle, and when the tab is hidden (see Settings → Security).
     ------------------------------------------------------------------------ */
  const holders = new Set();
  let lastAct = Date.now(), clipTimer = 0;
  const pref = (k, d) => { try { const v = ulyOS.settings && ulyOS.settings.get(k); return v == null ? d : v; } catch { return d; } };
  ulyOS.clip = {
    /** Copy text, then overwrite the clipboard after the configured delay. */
    async copy(text) {
      await navigator.clipboard.writeText(text);
      clearTimeout(clipTimer);
      const sec = +pref('clipClear', 30);
      if (sec > 0) clipTimer = setTimeout(() => ulyOS.clip.clear(), sec * 1000);
    },
    clear() { clearTimeout(clipTimer); try { navigator.clipboard.writeText(' ').catch(() => {}); } catch { /* ignore */ } },
  };
  ulyOS.purge = {
    register(hold) { holders.add(hold); return () => holders.delete(hold); },
    holding: () => [...holders].some((x) => { try { return x.holding(); } catch { return false; } }),
    now(reason) {
      let n = 0;
      holders.forEach((x) => { try { if (x.wipe(reason)) n++; } catch { /* ignore */ } });
      if (reason !== 'tab hidden') ulyOS.clip.clear();
      if (ulyOS.FS) ulyOS.FS.clipboard = null;
      if (ulyOS.security && ulyOS.security.profile && ulyOS.security.profile()) ulyOS.audit('Memory purged (' + (reason || 'manual') + ') — ' + n + ' secret field(s) wiped, clipboard cleared', 'warn');
      if (!reason || reason === 'manual' || reason === 'idle') {
        ulyOS.ui.toast('Memory purged — typed secrets and the clipboard were wiped', { type: 'ok' });
        if (ulyOS.fx) ulyOS.fx.sound('purge');
      }
      return n;
    },
  };
  ['pointerdown', 'keydown', 'pointermove', 'wheel', 'touchstart'].forEach((e) => document.addEventListener(e, () => { lastAct = Date.now(); }, { capture: true, passive: true }));
  setInterval(() => {
    const sec = +pref('purgeIdle', 120);
    if (sec > 0 && ulyOS.purge.holding() && Date.now() - lastAct >= sec * 1000) { ulyOS.purge.now('idle'); lastAct = Date.now(); }
  }, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden && pref('purgeOnHide', true) && ulyOS.purge.holding()) ulyOS.purge.now('tab hidden'); });

  ulyOS.crypto = { b64, rand, deriveKey, strength, policy, generatePassword, generatePin, crackTime, encryptFile, decryptFile, ITER, hasCrypto };

  /* ------------------------------------------------------------------------
     Profile registry (names/colors are public; data is in the vault)
     ------------------------------------------------------------------------ */
  const loadProfiles = () => { try { const l = JSON.parse(localStorage.getItem(PKEY)); return Array.isArray(l) ? l : []; } catch { return []; } };
  const saveProfiles = (l) => localStorage.setItem(PKEY, JSON.stringify(l));
  const getFail = (id) => { try { return JSON.parse(localStorage.getItem(fkey(id))) || { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; } };
  const setFail = (id, v) => { if (v) localStorage.setItem(fkey(id), JSON.stringify(v)); else localStorage.removeItem(fkey(id)); };

  /* ------------------------------------------------------------------------
     Vault runtime — a localStorage-shaped Map, persisted encrypted
     ------------------------------------------------------------------------ */
  let S = null;   // active session
  const vault = (ulyOS.vault = {
    get: (k) => (S && S.data.has(k) ? S.data.get(k) : null),
    set(k, v) { if (S) { S.data.set(k, String(v)); schedule(); } },
    remove(k) { if (S && S.data.delete(k)) schedule(); },
    keys: () => (S ? [...S.data.keys()] : []),
    flush: () => flush(),
  });

  async function writeVault(profile, data, key, salt, iter) {
    let rec;
    if (profile.protected) {
      const { iv, ct } = await seal(key, enc.encode(JSON.stringify(data)), aadFor(profile.id));
      rec = { v: 1, enc: true, iter, salt: b64.enc(salt), iv: b64.enc(iv), ct: b64.enc(ct) };
    } else rec = { v: 1, enc: false, data };
    localStorage.setItem(vkey(profile.id), JSON.stringify(rec));
  }
  let timer = 0;
  function schedule() { clearTimeout(timer); timer = setTimeout(flush, 250); }
  function flush() {
    clearTimeout(timer);
    if (!S) return Promise.resolve();
    const s = S;
    s.chain = s.chain.then(() => writeVault(s.profile, Object.fromEntries(s.data), s.key, s.salt, s.iter)).catch((err) => {
      console.error('[vault]', err);
      ui.toast(err.name === 'QuotaExceededError' ? 'Browser storage is full — export a backup and free some space' : 'Could not save profile data: ' + err.message, { type: 'err' });
    });
    return s.chain;
  }
  ['pagehide', 'visibilitychange'].forEach((ev) => window.addEventListener(ev, () => { if (ev === 'pagehide' || document.visibilityState === 'hidden') flush(); }));

  async function openVault(profile, secret) {
    const raw = localStorage.getItem(vkey(profile.id));
    if (!raw) return { data: {}, key: null, salt: null, iter: 0 };
    const rec = JSON.parse(raw);
    if (!rec.enc) return { data: rec.data || {}, key: null, salt: null, iter: 0 };
    if (!(rec.iter >= 100000 && rec.iter <= 5000000) || typeof rec.salt !== 'string' || typeof rec.iv !== 'string' || typeof rec.ct !== 'string') throw new Error('this profile’s stored data looks corrupted');
    const salt = b64.dec(rec.salt);
    const key = await deriveKey(secret, salt, rec.iter);
    let plain;
    try { plain = await unseal(key, b64.dec(rec.iv), b64.dec(rec.ct), aadFor(profile.id)); } catch { throw new Error('bad-password'); }
    return { data: JSON.parse(dec.decode(plain)), key, salt, iter: rec.iter };
  }

  /* ------------------------------------------------------------------------
     Sessions
     ------------------------------------------------------------------------ */
  let idleLast = Date.now();
  const ping = () => { idleLast = Date.now(); };

  async function startSession(profile, opened) {
    S = { profile, key: opened.key, salt: opened.salt, iter: opened.iter, data: new Map(Object.entries(opened.data)), chain: Promise.resolve(), locked: false, check: null };
    if (profile.protected) S.check = await seal(S.key, enc.encode('ok'), aadFor(profile.id));
    store.use({ getItem: (k) => vault.get(k), setItem: (k, v) => vault.set(k, v), removeItem: (k) => vault.remove(k) });
    localStorage.setItem(LASTKEY, profile.id);
    const fails = getFail(profile.id);
    setFail(profile.id, null);
    document.body.classList.add('authed');
    hideAuth();
    try { navigator.storage?.persist?.(); } catch { /* ignore */ }
    bus.emit('session:start', { profile, failedAttempts: fails.n });
    ulyOS.audit("Profile '" + profile.name + "' signed in (" + (profile.protected ? 'encrypted vault unlocked' : 'no password set') + ')', 'ok');
    if (fails.n) ulyOS.audit(fails.n + ' failed unlock attempt(s) were recorded for this profile before this sign-in', 'warn');
    startIdle();
  }

  async function verifySecret(secret) {
    if (!S || !S.profile.protected) return true;
    try {
      const key = await deriveKey(secret, S.salt, S.iter);
      await unseal(key, S.check.iv, S.check.ct, aadFor(S.profile.id));
      return true;
    } catch { return false; }
  }

  function lock(reason) {
    if (!S || !S.profile.protected) return false;
    if (S.locked) return true;
    S.locked = true;
    S.lockedAt = Date.now();
    ui.closeMenu();
    document.body.classList.add('locked');
    flush();
    showAuth(loginView(S.profile, { lock: true }));
    ulyOS.audit('Session locked' + (reason ? ' (' + reason + ')' : ''), 'info');
    bus.emit('session:lock');
    return true;
  }
  function unlockSession() {
    S.locked = false;
    document.body.classList.remove('locked');
    hideAuth();
    ping();
    ulyOS.audit('Session unlocked', 'ok');
    bus.emit('session:unlock');
  }
  async function signOut() {
    ulyOS.audit("Profile '" + (S?.profile.name || '') + "' signed out", 'info');
    await flush();
    S = null;
    store.use(null);
    location.reload();
  }

  /* idle auto-lock */
  let idleTimer = 0;
  function startIdle() {
    ['pointerdown', 'keydown', 'wheel', 'pointermove', 'touchstart'].forEach((e) => document.addEventListener(e, ping, { passive: true, capture: true }));
    idleTimer = setInterval(() => {
      if (!S || !S.profile.protected) return;
      if (S.locked) {   // locked for too long → throw the key away (full sign-out)
        const lm = +(vault.get('ulyos.locksignout') ?? 15);
        if (lm && Date.now() - S.lockedAt > lm * 60000) { ulyOS.audit('Signed out automatically after ' + lm + ' min locked — encryption key discarded from memory', 'warn'); signOut(); }
        return;
      }
      const mins = +(vault.get('ulyos.autolock') ?? 5);
      if (!mins) return;
      const a = document.activeElement;
      // cross-origin iframes (Photopea …) cannot be observed → focus inside one counts as activity
      if (a && a.tagName === 'IFRAME' && !a.dataset.local && document.hasFocus()) { ping(); return; }
      if (Date.now() - idleLast > mins * 60000) lock('idle ' + mins + ' min');
    }, 5000);
  }

  /* ------------------------------------------------------------------------
     Profile operations
     ------------------------------------------------------------------------ */
  async function createProfile({ name, color, secret, cred, data }) {
    const list = loadProfiles();
    const isFirst = list.length === 0;
    let n = name.trim() || 'Profile', base = n, i = 2;
    while (list.some((p) => p.name.toLowerCase() === n.toLowerCase())) n = base + ' ' + i++;
    const profile = {
      id: 'p_' + [...rand(5)].map((b) => b.toString(16).padStart(2, '0')).join(''),
      name: n, color: color || COLORS[list.length % COLORS.length], protected: !!secret, cred: secret ? cred || 'password' : 'none', created: Date.now(),
    };
    const vdata = data || {};
    if (isFirst && !data) {   // adopt data from a pre-profile install, then remove the plaintext copies
      LEGACY_KEYS.forEach((k) => { const v = localStorage.getItem(k); if (v != null) { vdata[k] = v; localStorage.removeItem(k); } });
    }
    let key = null, salt = null;
    if (secret) { salt = rand(16); key = await deriveKey(secret, salt, ITER); }
    await writeVault(profile, vdata, key, salt, ITER);
    list.push(profile);
    saveProfiles(list);
    return { profile, opened: { data: vdata, key, salt, iter: ITER } };
  }

  async function removeProfileData(id) {
    localStorage.removeItem(vkey(id)); localStorage.removeItem(fkey(id));
    saveProfiles(loadProfiles().filter((p) => p.id !== id));
    if (localStorage.getItem(LASTKEY) === id) localStorage.removeItem(LASTKEY);
    try { const root = await navigator.storage.getDirectory(); const home = await root.getDirectoryHandle('ulyos-home'); await home.removeEntry(id, { recursive: true }); } catch { /* none */ }
    try { await new Promise((res) => { const r = indexedDB.open('ulyos-fs', 1); r.onsuccess = () => { try { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').delete('localRoot:' + id); tx.oncomplete = res; } catch { res(); } }; r.onerror = res; r.onupgradeneeded = () => r.result.createObjectStore('kv'); }); } catch { /* ignore */ }
  }

  async function changeSecret(oldSecret, newSecret, cred) {
    if (S.profile.protected && !(await verifySecret(oldSecret))) throw new Error('Current password is incorrect');
    const salt = rand(16);
    S.key = await deriveKey(newSecret, salt, ITER);
    S.salt = salt; S.iter = ITER;
    S.profile.protected = true; S.profile.cred = cred || 'password';
    S.check = await seal(S.key, enc.encode('ok'), aadFor(S.profile.id));
    patchProfile(S.profile);
    await flush();
    ulyOS.audit('Profile password ' + (oldSecret == null ? 'set' : 'changed') + ' — vault re-encrypted with a new salt', 'warn');
  }
  async function removeSecret(oldSecret) {
    if (!(await verifySecret(oldSecret))) throw new Error('Password is incorrect');
    S.key = null; S.salt = null; S.iter = 0; S.check = null;
    S.profile.protected = false; S.profile.cred = 'none';
    patchProfile(S.profile);
    await flush();
    ulyOS.audit('Profile password REMOVED — vault is stored unencrypted', 'warn');
  }
  function patchProfile(p) { saveProfiles(loadProfiles().map((x) => (x.id === p.id ? { ...x, ...p } : x))); }

  async function exportProfile(pass) {
    await flush();
    const salt = rand(16);
    const key = await deriveKey(pass, salt, ITER);
    const { iv, ct } = await seal(key, enc.encode(JSON.stringify(Object.fromEntries(S.data))), enc.encode('ulyOS-profile-backup-v1'));
    const obj = { format: 'ulyOS-profile', v: 1, exported: new Date().toISOString(), profile: { name: S.profile.name, color: S.profile.color }, iter: ITER, salt: b64.enc(salt), iv: b64.enc(iv), ct: b64.enc(ct) };
    return new Blob([JSON.stringify(obj)], { type: 'application/json' });
  }
  async function decryptBackup(text, pass) {
    let obj;
    try { obj = JSON.parse(text); } catch { throw new Error('Not a valid backup file'); }
    if (obj.format !== 'ulyOS-profile') throw new Error('Not a ulyOS profile backup');
    if (!(obj.iter >= 100000 && obj.iter <= 5000000) || typeof obj.salt !== 'string' || typeof obj.iv !== 'string' || typeof obj.ct !== 'string') throw new Error('Corrupted or unsupported backup file');
    const key = await deriveKey(pass, b64.dec(obj.salt), obj.iter);
    try { return { name: obj.profile?.name || 'Imported', color: obj.profile?.color, data: JSON.parse(dec.decode(await unseal(key, b64.dec(obj.iv), b64.dec(obj.ct), enc.encode('ulyOS-profile-backup-v1')))) }; }
    catch { throw new Error('Wrong password or corrupted backup'); }
  }

  /* ------------------------------------------------------------------------
     Embedded-app storage shim: each app's localStorage is redirected into the
     signed-in profile's vault under "app:<id>:" so it is encrypted at rest and
     separated per profile.
     ------------------------------------------------------------------------ */
  function injectShim(html, appId) {
    const ns = JSON.stringify('app:' + appId + ':');
    const shim = '<script>(function(){try{var P=parent.ulyOS;if(!P||!P.vault)return;var ns=' + ns + ';' +
      'function mine(){return P.vault.keys().filter(function(k){return k.indexOf(ns)===0})}' +
      'var api={getItem:function(k){return P.vault.get(ns+k)},setItem:function(k,v){P.vault.set(ns+k,String(v))},removeItem:function(k){P.vault.remove(ns+k)},' +
      'clear:function(){mine().forEach(function(k){P.vault.remove(k)})},key:function(i){var a=mine();return a[i]==null?null:a[i].slice(ns.length)}};' +
      'var st=new Proxy(api,{get:function(t,k){if(k==="length")return mine().length;if(k in t)return t[k];if(typeof k==="string")return t.getItem(k)},' +
      'set:function(t,k,v){t.setItem(k,v);return true},deleteProperty:function(t,k){t.removeItem(k);return true}});' +
      'Object.defineProperty(window,"localStorage",{configurable:true,get:function(){return st}});' +
      'var last=0;function ping(){var n=Date.now();if(n-last>4000){last=n;try{P.security.ping()}catch(e){}}}' +
      '["pointerdown","keydown","wheel"].forEach(function(e){addEventListener(e,ping,{passive:true,capture:true})});' +
      '}catch(e){console.warn("ulyOS storage shim failed",e)}})();<\/script>';
    const m = /<head[^>]*>/i.exec(html);
    return m ? html.slice(0, m.index + m[0].length) + shim + html.slice(m.index + m[0].length) : shim + html;
  }


  /* ==========================================================================
     Reusable password / PIN field with generator, live length + entropy meter
     ========================================================================== */
  function passwordInput(o = {}) {
    let mode = o.mode || 'password';
    let generated = null;   // {len, pool, bits} while the field still holds a generated value
    const pw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Password', 'aria-label': 'Password' });
    const pw2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Confirm', 'aria-label': 'Confirm password' });
    const eye = h('button', { type: 'button', class: 'btn sm', text: 'Show', onclick: () => { const t = pw.type === 'password' ? 'text' : 'password'; pw.type = t; pw2.type = t; eye.textContent = t === 'password' ? 'Show' : 'Hide'; } });
    const meter = h('div', { class: 'meter' }, h('i'));
    const info = h('div', { class: 'meter-txt mono' });
    const crack = h('div', { class: 'meter-txt mono dim' });
    const lenOut = h('span', { class: 'mono', text: '20' });
    const len = h('input', { type: 'range', min: 8, max: 64, value: 20, oninput: () => { lenOut.textContent = len.value; } });
    const opt = (k, label, on = true) => { const c = h('input', { type: 'checkbox', checked: on }); return { k, c, el: h('label', { class: 'opt' }, c, label) }; };
    const opts = [opt('lower', 'a-z'), opt('upper', 'A-Z'), opt('digits', '0-9'), opt('symbols', '!@#')];
    const optsRow = h('div', { class: 'gen-opts' }, opts.map((x) => x.el));

    const paint = () => {
      const v = pw.value;
      if (mode === 'pin') {
        const n = v.length, bits = Math.round(n * Math.log2(10));
        meter.firstChild.style.width = clamp(n / 10 * 100, 0, 100) + '%'; meter.dataset.l = n < 6 ? 1 : n < 8 ? 3 : 4;
        info.textContent = n ? 'Length ' + n + ' · ~' + bits + ' bits · ' + (n < 6 ? 'too short (min 6)' : 'digits only — convenient, but guessable offline; a password is far safer') : '';
        crack.textContent = n ? 'Offline brute-force at 10 billion guesses/s: ' + crackTime(bits) : '';
        return;
      }
      if (!v) { meter.firstChild.style.width = '0'; info.textContent = ''; crack.textContent = ''; return; }
      const st = generated && generated.value === v ? { bits: generated.bits, label: strength(v).level >= 4 ? 'Excellent' : strength(v).label, level: Math.max(strength(v).level, generated.bits >= 80 ? 5 : 4) } : strength(v);
      meter.firstChild.style.width = st.level * 20 + '%'; meter.dataset.l = st.level;
      info.textContent = (generated && generated.value === v ? 'Generated · ' : '') + 'Length ' + v.length + ' · ' + (generated && generated.value === v ? generated.pool + '-symbol alphabet · ' : '') + '~' + st.bits + ' bits of entropy · ' + st.label;
      crack.textContent = 'Offline brute-force at 10 billion guesses/s: ' + crackTime(st.bits);
    };
    const genBtn = h('button', { type: 'button', class: 'btn sm', html: icon('refresh', 13) + ' Generate', onclick: () => {
      if (mode === 'pin') { const p = generatePin(Math.min(+len.value, 12)); pw.value = p; pw2.value = p; generated = null; }
      else {
        const g = generatePassword(+len.value, Object.fromEntries(opts.map((x) => [x.k, x.c.checked])));
        pw.value = g.password; pw2.value = g.password; generated = { value: g.password, pool: g.pool, bits: g.bits };
      }
      pw.type = 'text'; pw2.type = 'text'; eye.textContent = 'Hide'; paint(); o.onChange?.();
    } });
    let copied = false;
    const copyBtn = h('button', { type: 'button', class: 'btn sm', html: icon('copy', 13) + ' Copy', onclick: async () => {
      if (!pw.value) return;
      try { await ulyOS.clip.copy(pw.value); copied = true; const s = +pref('clipClear', 30); ui.toast('Copied — store it in a password manager' + (s ? ' (clipboard clears in ' + s + 's)' : ''), { type: 'ok', timeout: 2600 }); } catch { pw.select(); ui.toast('Press Ctrl/Cmd+C to copy', { type: 'info' }); }
    } });
    /** Wipe this field from memory: values, generated state and (if we copied it) the clipboard. */
    const wipe = (reason) => {
      const had = !!(pw.value || pw2.value);
      pw.value = ''; pw2.value = ''; generated = null; pw.type = 'password'; pw2.type = 'password'; eye.textContent = 'Show';
      if (copied) { ulyOS.clip.clear(); copied = false; }
      paint();
      return had;
    };
    const purgeBtn = h('button', { type: 'button', class: 'btn sm danger', html: icon('trash', 13) + ' Purge', title: 'Don’t want this one? Wipe it (and the clipboard) from memory', onclick: () => {
      const had = wipe('manual');
      ui.toast(had ? 'Purged — nothing is kept in memory' : 'Nothing to purge', { type: had ? 'ok' : 'info', timeout: 2000 });
      if (had && ulyOS.fx) ulyOS.fx.sound('purge');
      pw.focus();
    } });
    const offHold = ulyOS.purge.register({ holding: () => !!(pw.value || pw2.value), wipe });
    const gen = h('div', { class: 'gen' },
      h('div', { class: 'gen-row' }, h('span', { class: 'gen-lbl', text: 'Length' }), len, lenOut),
      optsRow, h('div', { class: 'btn-row' }, genBtn, copyBtn, purgeBtn),
      h('div', { class: 'w-sub gen-note', text: 'Secrets are wiped automatically when you go idle or switch tabs (Settings → Security → Memory).' }));
    pw.addEventListener('input', () => { if (mode === 'pin') { pw.value = pw.value.replace(/\D/g, ''); } if (generated && generated.value !== pw.value) generated = null; paint(); o.onChange?.(); });
    pw2.addEventListener('input', () => { if (mode === 'pin') pw2.value = pw2.value.replace(/\D/g, ''); });
    const api = {
      el: h('div', { class: 'pwc' }, h('div', { class: 'row-between' }, h('span', { class: 'field-label', text: 'Secret' }), eye), pw, pw2, meter, info, crack, gen),
      value: () => pw.value, confirm: () => pw2.value, focus: () => pw.focus(), purge: wipe,
      dispose() { offHold(); wipe('closed'); },
      setMode(m) {
        mode = m; pw.value = ''; pw2.value = ''; generated = null; pw.type = 'password'; pw2.type = 'password'; eye.textContent = 'Show';
        pw.placeholder = m === 'pin' ? 'PIN (digits)' : 'Password'; pw.inputMode = m === 'pin' ? 'numeric' : 'text'; pw2.inputMode = pw.inputMode;
        len.min = m === 'pin' ? 4 : 8; len.max = m === 'pin' ? 12 : 64; len.value = m === 'pin' ? 8 : 20; lenOut.textContent = len.value;
        optsRow.hidden = m === 'pin'; genBtn.lastChild.textContent = m === 'pin' ? ' Generate PIN' : ' Generate';
        paint();
      },
    };
    api.setMode(mode);
    return api;
  }
  ui.passwordInput = passwordInput;

  /* ==========================================================================
     Authentication UI
     ========================================================================== */
  const authEl = () => document.getElementById('auth');
  let busy = false;

  const avatar = (p, size = 64) => h('div', { class: 'avatar', style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.42) + 'px', '--c': p.color } }, (p.name || '?').trim().charAt(0).toUpperCase());

  function showAuth(view) {
    const el = authEl();
    const prevView = el.querySelector('.auth-card') && el.querySelector('.auth-card').firstElementChild;
    if (prevView && prevView._dispose) prevView._dispose();   // wipe secrets typed on the screen we are leaving
    el.hidden = false;
    document.body.classList.add('auth-open');
    const card = h('div', { class: 'auth-card' }, view);
    el.replaceChildren(h('div', { class: 'auth-brand' }, h('span', { class: 'auth-logo', html: '<svg viewBox="0 0 80 80" width="28" height="28"><circle cx="40" cy="40" r="28" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="40" cy="40" r="5" fill="currentColor"/></svg>' }), h('span', { text: 'uly' }), h('b', { text: 'OS' })), card,
      h('div', { class: 'auth-foot' }, hasCrypto ? 'PBKDF2-SHA256 · AES-256-GCM · everything stays on this device' : '⚠ Secure context required (HTTPS or localhost) — encryption unavailable',
        ulyOS.admin && ulyOS.admin.enabled() ? [h('span', { class: 'sep', text: ' | ' }), h('a', { href: '#', class: 'footlink', text: 'Contact Admin', onclick: (e) => { e.preventDefault(); ulyOS.admin.contact(); } })] : null));
    const f = card.querySelector('input:not([type=hidden]),button.primary');
    setTimeout(() => f && f.focus && f.focus(), 40);
  }
  function hideAuth() {
    const el = authEl();
    const prevView = el.querySelector('.auth-card') && el.querySelector('.auth-card').firstElementChild;
    if (prevView && prevView._dispose) prevView._dispose();
    el.classList.add('out');
    setTimeout(() => { el.hidden = true; el.classList.remove('out'); el.replaceChildren(); document.body.classList.remove('auth-open'); }, dur(350));
  }

  function pickView() {
    const list = loadProfiles();
    if (!list.length) return createView({ first: true });
    const last = localStorage.getItem(LASTKEY);
    const cards = list.map((p) => {
      const c = h('button', { class: 'prof' + (p.id === last ? ' last' : ''), onclick: () => showAuth(loginView(p)) },
        avatar(p, 72),
        h('div', { class: 'prof-name', text: p.name }),
        h('div', { class: 'prof-sub', html: (p.protected ? icon('lock', 12) + ' ' + (p.cred === 'pin' ? 'PIN' : 'Password') : 'No password') }));
      c.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        ui.contextMenu(e.clientX, e.clientY, [
          { label: 'Sign in', icon: 'arrowRight', action: () => showAuth(loginView(p)) },
          { separator: true },
          { label: 'Delete profile…', icon: 'trash', danger: true, action: () => deleteFromPicker(p) },
        ]);
      });
      return c;
    });
    cards.push(h('button', { class: 'prof add', onclick: () => showAuth(createView({})) },
      h('div', { class: 'avatar add', html: icon('plus', 28) }), h('div', { class: 'prof-name', text: 'Add profile' }), h('div', { class: 'prof-sub', text: 'New or imported' })));
    return h('div', {}, h('h1', { class: 'auth-title', text: 'Who’s using ulyOS?' }), h('p', { class: 'auth-sub', text: 'Each profile has its own desktop, files and apps. Right-click a profile for more.' }), h('div', { class: 'prof-grid' }, cards));
  }

  async function deleteFromPicker(p) {
    let ok = false;
    if (p.protected) {
      const pw = await ui.prompt({ title: "Delete '" + p.name + "'?", message: 'This permanently erases the profile, its encrypted data and its sandbox files. Enter its ' + (p.cred === 'pin' ? 'PIN' : 'password') + ' to confirm.', label: p.cred === 'pin' ? 'PIN' : 'Password', okText: 'Delete', validate: (v) => (v ? null : 'Required') });
      if (pw == null) return;
      try { await openVault(p, pw); ok = true; } catch { ui.toast('Incorrect ' + (p.cred === 'pin' ? 'PIN' : 'password') + ' — profile not deleted', { type: 'err' }); return; }
    } else ok = await ui.confirm({ title: "Delete '" + p.name + "'?", message: 'This permanently erases the profile, its data and its sandbox files.', okText: 'Delete', danger: true });
    if (!ok) return;
    await removeProfileData(p.id);
    ui.toast("Profile '" + p.name + "' deleted", { type: 'ok' });
    showAuth(pickView());
  }

  function loginView(p, { lock: isLock = false } = {}) {
    const isPin = p.cred === 'pin';
    const input = h('input', { class: 'input auth-input', type: 'password', placeholder: isPin ? 'PIN' : 'Password', autocomplete: 'off', 'aria-label': isPin ? 'PIN' : 'Password' });
    if (isPin) { input.inputMode = 'numeric'; input.maxLength = 12; input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, ''); }); }
    const err = h('div', { class: 'auth-err', role: 'alert' });
    const go = h('button', { class: 'btn primary auth-go', type: 'submit' }, p.protected ? 'Unlock' : 'Sign in');
    const eye = h('button', { class: 'auth-eye', type: 'button', title: 'Show / hide', html: icon('search', 16), onclick: () => { input.type = input.type === 'password' ? 'text' : 'password'; input.focus(); } });
    const keypad = isPin ? h('div', { class: 'keypad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '↵'].map((k) => h('button', {
      type: 'button', class: 'key', text: k,
      onclick: () => { if (k === '⌫') input.value = input.value.slice(0, -1); else if (k === '↵') form.requestSubmit(); else if (input.value.length < 12) input.value += k; input.focus(); },
    }))) : null;

    let cd = 0;
    const tick = () => {
      const left = Math.ceil((getFail(p.id).until - Date.now()) / 1000);
      if (left > 0) { go.disabled = true; err.textContent = 'Too many attempts — try again in ' + left + 's'; cd = setTimeout(tick, 250); }
      else { go.disabled = false; if (err.textContent.startsWith('Too many')) err.textContent = ''; }
    };

    async function submit(e) {
      e.preventDefault();
      if (busy || go.disabled) return;
      if (p.protected && !input.value) { err.textContent = 'Enter your ' + (isPin ? 'PIN' : 'password'); return; }
      busy = true; go.disabled = true; err.textContent = ''; go.classList.add('busy');
      const label = go.textContent; go.textContent = 'Deriving key…';
      await new Promise((r) => setTimeout(r, 30));   // let the UI paint before PBKDF2 blocks the thread
      try {
        if (isLock) {
          if (!(await verifySecret(input.value))) throw new Error('bad-password');
          unlockSession();
        } else {
          const opened = await openVault(p, input.value);
          await startSession(p, opened);
        }
        busy = false;
      } catch (ex) {
        busy = false; go.classList.remove('busy'); go.textContent = label; go.disabled = false;
        if (ex.message === 'bad-password') {
          const f = getFail(p.id); f.n++;
          f.until = f.n >= 3 ? Date.now() + Math.min(60, 2 ** (f.n - 2)) * 1000 : 0;
          setFail(p.id, f);
          err.textContent = 'Incorrect ' + (isPin ? 'PIN' : 'password') + (f.n >= 3 ? '' : ' (' + f.n + ')');
          input.value = ''; input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); input.focus();
          if (f.n >= 3) tick();
          if (isLock && S) ulyOS.audit('Failed unlock attempt on locked session', 'warn');
        } else { err.textContent = 'Could not open profile: ' + ex.message; console.error(ex); }
      }
    }

    const form = h('form', { class: 'auth-form', onsubmit: submit },
      avatar(p, 88), h('h2', { class: 'auth-name', text: p.name }),
      p.protected ? h('div', { class: 'auth-input-wrap' }, input, eye) : h('p', { class: 'auth-sub', text: 'This profile has no password. Add one in Settings → Security.' }),
      keypad, err, go,
      h('div', { class: 'auth-links' }, isLock
        ? h('button', { type: 'button', class: 'link', onclick: () => signOut(), text: 'Switch profile' })
        : h('button', { type: 'button', class: 'link', onclick: () => showAuth(pickView()), text: '← All profiles' })));
    if (getFail(p.id).until > Date.now()) tick();
    form.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !isLock) showAuth(pickView()); });
    form._cleanup = () => clearTimeout(cd);
    return form;
  }

  function createView({ first = false }) {
    let color = COLORS[loadProfiles().length % COLORS.length];
    let cred = 'password';
    const name = h('input', { class: 'input', placeholder: 'Profile name', maxLength: 24, autocomplete: 'off', 'aria-label': 'Profile name' });
    const pwc = passwordInput({ mode: 'password' });
    const err = h('div', { class: 'auth-err', role: 'alert' });
    const protect = h('input', { type: 'checkbox', checked: true });
    const secretBox = h('div', { class: 'secret-box' });
    const swatches = h('div', { class: 'swatches' });
    const prev = h('div', { class: 'prev' });
    const credBox = h('div', { class: 'seg' });
    const notify = !!(ulyOS.admin && ulyOS.admin.notifyEnabled());
    const contact = h('input', { class: 'input', type: 'email', placeholder: 'Your email (optional — lets the admin reach you)', autocomplete: 'email', 'aria-label': 'Optional contact email' });

    const paintPrev = () => prev.replaceChildren(avatar({ name: name.value || '?', color }, 72));
    const paintSw = () => swatches.replaceChildren(...COLORS.map((c) => h('button', { type: 'button', class: 'swatch' + (c === color ? ' active' : ''), style: { background: c }, 'aria-label': c, onclick: () => { color = c; paintSw(); paintPrev(); } })));
    const credSeg = () => credBox.replaceChildren(...[['password', 'Password'], ['pin', 'PIN']].map(([v, l]) => h('button', { type: 'button', class: cred === v ? 'active' : '', text: l, onclick: () => { cred = v; pwc.setMode(v); credSeg(); } })));
    name.addEventListener('input', paintPrev);
    secretBox.append(credBox, pwc.el,
      h('p', { class: 'auth-note', text: 'There is no recovery. If you forget this password the profile’s encrypted data cannot be restored — keep an encrypted backup (Settings → Security).' }));
    protect.addEventListener('change', () => { secretBox.hidden = !protect.checked; });

    const submit = async (e) => {
      e.preventDefault();
      if (busy) return;
      err.textContent = '';
      if (!name.value.trim()) { err.textContent = 'Enter a profile name'; name.focus(); return; }
      let sec = null;
      if (protect.checked) {
        if (!hasCrypto) { err.textContent = 'Encryption needs HTTPS or localhost'; return; }
        sec = pwc.value();
        const pe = policy(sec, cred);
        if (pe) { err.textContent = pe; return; }
        if (sec !== pwc.confirm()) { err.textContent = 'Entries do not match'; return; }
      }
      busy = true; btn.disabled = true; btn.textContent = sec ? 'Encrypting…' : 'Creating…';
      await new Promise((r) => setTimeout(r, 30));
      try {
        const { profile, opened } = await createProfile({ name: name.value, color, secret: sec, cred });
        busy = false;
        if (ulyOS.admin) ulyOS.admin.notifyNewProfile(profile, { contact: contact.value.trim().slice(0, 120) });
        await startSession(profile, opened);
      } catch (ex) { busy = false; btn.disabled = false; btn.textContent = 'Create profile'; err.textContent = 'Could not create profile: ' + ex.message; console.error(ex); }
    };
    const btn = h('button', { class: 'btn primary auth-go', type: 'submit', text: 'Create profile' });
    const form = h('form', { class: 'auth-form wide', onsubmit: submit },
      h('h2', { class: 'auth-name', text: first ? 'Create your profile' : 'New profile' }),
      first ? h('p', { class: 'auth-sub', text: 'Your desktop, files and app data live in a profile. Protect it with a password to encrypt everything at rest.' }) : null,
      prev, name, swatches,
      h('label', { class: 'check' }, protect, h('span', { text: 'Protect with a password (recommended)' })),
      secretBox,
      notify ? h('div', { class: 'notice' }, h('div', { class: 'notice-text', html: 'ℹ ' }, ulyOS.admin.disclosure), contact) : null,
      err, btn,
      h('div', { class: 'auth-links' },
        first ? null : h('button', { type: 'button', class: 'link', onclick: () => showAuth(pickView()), text: '← All profiles' }),
        h('button', { type: 'button', class: 'link', onclick: () => showAuth(importView(first)), text: 'Import encrypted backup…' })));
    credSeg(); paintSw(); paintPrev();
    form._dispose = () => pwc.dispose();
    return form;
  }

  function importView(first) {
    const file = h('input', { type: 'file', accept: '.ulyprofile,application/json', class: 'input' });
    const pass = h('input', { type: 'password', class: 'input', placeholder: 'Backup password', autocomplete: 'off' });
    const err = h('div', { class: 'auth-err', role: 'alert' });
    const btn = h('button', { class: 'btn primary auth-go', type: 'submit', text: 'Import profile' });
    const form = h('form', { class: 'auth-form wide', onsubmit: async (e) => {
      e.preventDefault();
      if (busy) return;
      if (!file.files[0] || !pass.value) { err.textContent = 'Choose a backup file and enter its password'; return; }
      busy = true; btn.disabled = true; btn.textContent = 'Decrypting…'; err.textContent = '';
      await new Promise((r) => setTimeout(r, 30));
      try {
        const b = await decryptBackup(await file.files[0].text(), pass.value);
        const { profile, opened } = await createProfile({ name: b.name, color: b.color, secret: pass.value, cred: 'password', data: b.data });
        busy = false;
        if (ulyOS.admin) ulyOS.admin.notifyNewProfile(profile, { source: 'import' });
        await startSession(profile, opened);
        ulyOS.audit("Profile '" + profile.name + "' restored from encrypted backup (protected with the backup password)", 'ok');
      } catch (ex) { busy = false; btn.disabled = false; btn.textContent = 'Import profile'; err.textContent = ex.message; }
    } },
      h('h2', { class: 'auth-name', text: 'Import encrypted backup' }),
      h('p', { class: 'auth-sub', text: 'Restores desktop layout, settings, audit log and app data from a .ulyprofile file. Sandbox files are not included. The new profile is protected with the backup password.' }),
      file, pass,
      ulyOS.admin && ulyOS.admin.notifyEnabled() ? h('p', { class: 'auth-note', text: 'The site admin is notified by email that a profile was restored (profile name only). Passwords, keys, files and app data are never sent.' }) : null,
      err, btn,
      h('div', { class: 'auth-links' }, h('button', { type: 'button', class: 'link', onclick: () => showAuth(first ? createView({ first: true }) : pickView()), text: '← Back' })));
    return form;
  }

  /* ------------------------------------------------------------------------
     Public API
     ------------------------------------------------------------------------ */
  ulyOS.security = {
    ping,
    injectShim,
    profile: () => (S ? { ...S.profile } : null),
    profileId: () => S?.profile.id || null,
    isProtected: () => !!S?.profile.protected,
    isLocked: () => !!S?.locked,
    lock,
    signOut,
    verifySecret,
    changeSecret,
    removeSecret,
    exportProfile,
    vaultInfo: () => ({ iterations: S?.iter || 0, protected: !!S?.profile.protected, keys: vault.keys().length, bytes: (localStorage.getItem(vkey(S?.profile.id)) || '').length, failedAttempts: S ? 0 : 0 }),
    getAutoLock: () => +(vault.get('ulyos.autolock') ?? 5),
    getLockSignOut: () => +(vault.get('ulyos.locksignout') ?? 15),
    setLockSignOut: (m) => { vault.set('ulyos.locksignout', String(m)); ulyOS.audit('Sign out after lock set to ' + (m ? m + ' min' : 'never'), 'info'); },
    setAutoLock: (m) => { vault.set('ulyos.autolock', String(m)); ulyOS.audit('Auto-lock set to ' + (m ? m + ' min idle' : 'never'), 'info'); },
    rename(n) { n = n.trim(); if (!n) return; ulyOS.audit("Profile renamed '" + S.profile.name + "' → '" + n + "'", 'info'); S.profile.name = n; patchProfile(S.profile); bus.emit('profile:change'); },
    setColor(c) { S.profile.color = c; patchProfile(S.profile); bus.emit('profile:change'); },
    async deleteSelf(secret) {
      if (S.profile.protected && !(await verifySecret(secret))) throw new Error('Password is incorrect');
      const id = S.profile.id; const name = S.profile.name;
      clearTimeout(timer); S = null; store.use(null);
      await removeProfileData(id);
      location.reload(); return name;
    },
    COLORS,
  };

  /* ------------------------------------------------------------------------
     Boot: show the profile picker
     ------------------------------------------------------------------------ */
  function init() {
    const list = loadProfiles();
    const last = list.find((p) => p.id === localStorage.getItem(LASTKEY));
    // remembered profile without a password → still show the picker (never auto sign-in)
    showAuth(last && list.length > 1 ? pickView() : list.length === 1 ? loginView(list[0]) : pickView());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
