/* ==========================================================================
   ulyOS · js/window.js
   Core namespace, event bus, utilities, icon set, the Window Manager (WM)
   and shared UI primitives (context menu, dialogs, toasts).
   Loaded FIRST — every other module builds on `window.ulyOS`.
   ========================================================================== */
(function () {
  'use strict';

  const ulyOS = (window.ulyOS = window.ulyOS || {});

  /* ------------------------------------------------------------------------
     Event bus + audit shortcut
     ------------------------------------------------------------------------ */
  const listeners = new Map();
  ulyOS.bus = {
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(fn);
      return () => this.off(evt, fn);
    },
    off(evt, fn) { listeners.get(evt)?.delete(fn); },
    emit(evt, data) {
      listeners.get(evt)?.forEach((fn) => {
        try { fn(data); } catch (err) { console.error('[bus:' + evt + ']', err); }
      });
    },
  };
  /** Append a line to the system audit trail (consumed by telemetry.js). */
  ulyOS.audit = (msg, level = 'info') => ulyOS.bus.emit('audit', { msg, level, ts: Date.now() });

  /* ------------------------------------------------------------------------
     Utilities
     ------------------------------------------------------------------------ */
  function h(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) n.style.setProperty(sk, sv); else n.style[sk] = sv; } }
        else if (k === 'dataset') Object.assign(n.dataset, v);
        else if (k === 'html') n.innerHTML = v;
        else if (k === 'text') n.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else if (k in n && k !== 'list') n[k] = v;
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return n;
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtTime = (ts) => { const d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); };
  const fmtBytes = (b) => {
    if (b == null || isNaN(b)) return '—';
    if (b < 1024) return b + ' B';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1;
    do { b /= 1024; i++; } while (b >= 1024 && i < u.length - 1);
    return (b >= 100 ? b.toFixed(0) : b >= 10 ? b.toFixed(1) : b.toFixed(2)) + ' ' + u[i];
  };
  const fmtDuration = (ms) => {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + pad2(s % 60) + 's';
    return Math.floor(m / 60) + 'h ' + pad2(m % 60) + 'm';
  };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* Storage goes through a swappable backend: before sign-in it is plain localStorage;
     security.js swaps in the signed-in profile's (optionally encrypted) vault. */
  const backend = {
    getItem: (k) => localStorage.getItem(k),
    setItem: (k, v) => localStorage.setItem(k, v),
    removeItem: (k) => localStorage.removeItem(k),
  };
  let activeBackend = backend;
  const store = {
    use(b) { activeBackend = b || backend; },
    get(k, fb) { try { const v = activeBackend.getItem(k); return v == null ? fb : JSON.parse(v); } catch { return fb; } },
    set(k, v) { try { activeBackend.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { activeBackend.removeItem(k); } catch { /* ignore */ } },
  };

  /* Animation timing is driven by CSS vars/body class set by Settings. */
  const rootStyle = getComputedStyle(document.documentElement);
  const cssNum = (name, fb) => { const v = parseFloat(rootStyle.getPropertyValue(name)); return Number.isFinite(v) ? v : fb; };
  const animOn = () => !document.body.classList.contains('no-anim');
  const dur = (ms = 220) => (animOn() ? ms / Math.max(0.25, cssNum('--speed', 1)) : 0);

  /* ------------------------------------------------------------------------
     Icon set (24px grid, stroke based)
     ------------------------------------------------------------------------ */
  const ICONS = {
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10.5v5M9.5 13h5"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    filePlus: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11.5v5M9.5 14h5"/>',
    text: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-9 9"/>',
    music: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    shapes: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><circle cx="17" cy="7" r="4"/><path d="M7 21l4-7 4 7z"/>',
    sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    power: '<path d="M12 3v9"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4M4 5v4h4M4 13a8 8 0 0 0 14.5 4M20 19v-4h-4"/>',
    arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    chevronRight: '<path d="M9 6l6 6-6 6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    scissors: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 7.5L20 18M8 16.5L20 6"/>',
    clipboard: '<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
    hdd: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M3 13l3-8h12l3 8"/><path d="M7 16.5h.01"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="10" y="10" width="4" height="4"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.3 0 2-.8 2-1.8 0-1-.7-1.4-.7-2.3 0-.9.7-1.5 1.7-1.5H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z"/><path d="M7.5 11h.01M10 7.5h.01M14.5 7.5h.01"/>',
    desktop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    sliders: '<path d="M5 4v16M12 4v16M19 4v16"/><circle cx="5" cy="9" r="2"/><circle cx="12" cy="15" r="2"/><circle cx="19" cy="8" r="2"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    minus: '<path d="M5 12h14"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    mailSend: '<path d="M3 11l18-8-8 18-2-8z"/>',
    trending: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4M17 20v.01"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  };
  const icon = (name, size = 18) =>
    '<svg class="ico" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.file) + '</svg>';

  /** Clock text: h24 → "23:07:41", otherwise "11:07:41 PM". */
  const fmtClock = (d, { seconds = false, h24 = true } = {}) => {
    const hh = d.getHours(), mm = pad2(d.getMinutes()), ss = seconds ? ':' + pad2(d.getSeconds()) : '';
    return h24 ? pad2(hh) + ':' + mm + ss : (hh % 12 || 12) + ':' + mm + ss + ' ' + (hh < 12 ? 'AM' : 'PM');
  };
  /** Filename-safe local timestamp: 20261102-093015 */
  const stamp = (d = new Date()) => d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  ulyOS.util = { h, icon, ICONS, clamp, pad2, stamp, fmtTime, fmtClock, fmtBytes, fmtDuration, debounce, escapeHtml, store, dur, animOn, cssNum };

  const $ = (sel, root = document) => root.querySelector(sel);

  /* ==========================================================================
     WINDOW MANAGER
     ========================================================================== */
  const WM = (ulyOS.WM = {});
  const registry = new Map();
  let zCounter = 100;
  let idSeq = 0;
  let cascade = 0;
  const MIN_W = 300;
  const MIN_H = 180;

  const layer = () => document.getElementById('windows');
  const inset = (n) => cssNum('--inset-' + n, 0);
  /** Usable window area (excludes menu bar / taskbar). Coordinates are relative to #windows. */
  WM.area = () => ({ w: window.innerWidth - inset('left') - inset('right'), h: window.innerHeight - inset('top') - inset('bottom') });
  WM.origin = () => ({ x: inset('left'), y: inset('top') });
  /** Phone-sized viewport (portrait phone, or short landscape phone): windows open full-screen. */
  WM.compact = () => window.innerWidth < 700 || (window.innerWidth < 940 && window.innerHeight < 500);
  ulyOS.util.isTouch = () => window.matchMedia('(pointer: coarse)').matches;
  const syncCompact = () => { document.body.classList.toggle('compact', WM.compact()); document.body.classList.toggle('touch', ulyOS.util.isTouch()); };
  syncCompact();
  window.addEventListener('resize', syncCompact);
  window.addEventListener('orientationchange', () => setTimeout(syncCompact, 120));
  WM.all = () => [...registry.values()];
  WM.get = (id) => registry.get(id);
  WM.byApp = (appId) => WM.all().filter((w) => w.appId === appId);
  WM.focused = () => WM.all().find((w) => w.focused) || null;

  const isTiled = (w) => w.maximized || !!w.snap;

  function applyRect(win, r) {
    win.rect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
    Object.assign(win.el.style, {
      left: win.rect.x + 'px', top: win.rect.y + 'px', width: win.rect.w + 'px', height: win.rect.h + 'px',
    });
  }
  function applyPos(win, x, y) {
    win.rect.x = Math.round(x); win.rect.y = Math.round(y);
    win.el.style.left = win.rect.x + 'px'; win.el.style.top = win.rect.y + 'px';
  }
  function geomAnim(win) {
    const d = dur(240);
    if (!d) return;
    win.el.classList.add('geo-anim');
    clearTimeout(win._geoT);
    win._geoT = setTimeout(() => win.el.classList.remove('geo-anim'), d + 30);
  }

  /* ---- iframe protection: THE drag fix -----------------------------------
     Cross-origin iframes swallow pointermove/pointerup events once the cursor
     enters them, which freezes a drag or resize. While any drag/resize is in
     progress, every iframe gets `pointer-events: none`; the previous inline
     value is restored afterwards. A full-screen shield backs this up so the
     cursor shape also stays consistent. */
  function setIframesInert(on) {
    document.querySelectorAll('iframe').forEach((f) => {
      if (on) {
        if (f.dataset.peSaved === undefined) f.dataset.peSaved = f.style.pointerEvents || '';
        f.style.pointerEvents = 'none';
      } else if (f.dataset.peSaved !== undefined) {
        f.style.pointerEvents = f.dataset.peSaved;
        delete f.dataset.peSaved;
      }
    });
    document.body.classList.toggle('wm-dragging', on);
  }
  WM.setIframesInert = setIframesInert;

  function showShield(cursor) {
    const s = $('#drag-shield');
    if (!s) return;
    s.style.cursor = cursor || 'default';
    s.classList.add('on');
  }
  function hideShield() { $('#drag-shield')?.classList.remove('on'); }

  /* ---- Snap preview ---- */
  function snapRect(kind) {
    const a = WM.area();
    if (kind === 'left') return { x: 0, y: 0, w: Math.round(a.w / 2), h: a.h };
    if (kind === 'right') return { x: Math.round(a.w / 2), y: 0, w: a.w - Math.round(a.w / 2), h: a.h };
    return { x: 0, y: 0, w: a.w, h: a.h };
  }
  function showSnapPreview(kind) {
    const p = $('#snap-preview');
    if (!p) return;
    if (!kind) { p.classList.remove('on'); return; }
    const r = snapRect(kind);
    const o = WM.origin();
    Object.assign(p.style, { left: r.x + o.x + 'px', top: r.y + o.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    p.classList.add('on');
  }
  function applySnap(win, kind) {
    if (win.resizable === false) return;
    if (kind === 'max') { WM.maximize(win, true); return; }
    if (!win.restoreRect) win.restoreRect = { ...win.rect };
    geomAnim(win);
    win.snap = kind;
    win.el.classList.add('snapped');
    applyRect(win, snapRect(kind));
    ulyOS.audit("Window '" + win.title + "' snapped " + kind, 'info');
  }

  /* ---- un-tile (maximized/snapped) on drag-out ---- */
  function untile(win, px, py) {
    const a = WM.area();
    const prev = win.maximized ? { x: 0, y: 0, w: a.w, h: a.h } : win.rect;
    const rr = win.restoreRect || { x: 80, y: 60, w: 820, h: 560 };
    const ratio = clamp((px - prev.x) / prev.w, 0.1, 0.9);
    win.el.classList.remove('maximized', 'snapped');
    win.maximized = false; win.snap = null;
    const r = { x: Math.round(px - rr.w * ratio), y: Math.max(0, Math.round(py - 18)), w: rr.w, h: rr.h };
    applyRect(win, r);
    syncMaxButton(win);
    return { x: r.x, y: r.y };
  }

  /* ---- DRAG ---- */
  function beginDrag(win, e) {
    if (e.button !== 0 || e.target.closest('.win-controls') || win.minimized) return;
    WM.focus(win);
    if (WM.compact()) return;   // phone layout: windows are full-screen, not draggable
    const bar = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY };
    let moved = false, ended = false, origin = null, snapKind = null;

    const onMove = (ev) => {
      if (!moved) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
        moved = true;
        setIframesInert(true);                // <- iframes stop swallowing mouse events
        showShield('grabbing');
        win.el.classList.add('dragging');
        origin = isTiled(win) ? untile(win, ev.clientX, ev.clientY) : { x: win.rect.x, y: win.rect.y };
        start.x = ev.clientX; start.y = ev.clientY;
      }
      const a = WM.area();
      const nx = clamp(origin.x + (ev.clientX - start.x), -win.rect.w + 120, a.w - 120);
      const ny = clamp(origin.y + (ev.clientY - start.y), 0, a.h - 40);
      applyPos(win, nx, ny);
      snapKind = null;
      if (win.resizable !== false) {
        const o = WM.origin();
        if (ev.clientY <= o.y + 3) snapKind = 'max';
        else if (ev.clientX <= o.x + 3) snapKind = 'left';
        else if (ev.clientX >= o.x + a.w - 4) snapKind = 'right';
      }
      showSnapPreview(snapKind);
    };
    const end = () => {
      if (ended) return;
      ended = true;
      bar.removeEventListener('pointermove', onMove);
      bar.removeEventListener('pointerup', end);
      bar.removeEventListener('pointercancel', end);
      bar.removeEventListener('lostpointercapture', end);
      try { bar.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      if (moved) {
        setIframesInert(false);
        hideShield();
        win.el.classList.remove('dragging');
        showSnapPreview(null);
        if (snapKind) applySnap(win, snapKind);
      }
    };
    try { bar.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    bar.addEventListener('pointermove', onMove);
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
    bar.addEventListener('lostpointercapture', end);
  }

  /* ---- RESIZE ---- */
  const CURSORS = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };
  function beginResize(win, dir, e) {
    if (e.button !== 0 || win.maximized || win.resizable === false) return;
    e.preventDefault();
    WM.focus(win);
    const handle = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY };
    if (win.snap) { win.el.classList.remove('snapped'); win.snap = null; }
    const r0 = { ...win.rect };
    const minW = win.minWidth || MIN_W, minH = win.minHeight || MIN_H;
    let ended = false;
    setIframesInert(true);
    showShield(CURSORS[dir]);
    win.el.classList.add('resizing');

    const onMove = (ev) => {
      const a = WM.area();
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      let { x, y, w, h } = r0;
      if (dir.includes('e')) w = clamp(r0.w + dx, minW, a.w * 2);
      if (dir.includes('s')) h = clamp(r0.h + dy, minH, a.h * 2);
      if (dir.includes('w')) { w = Math.max(minW, r0.w - dx); x = r0.x + (r0.w - w); }
      if (dir.includes('n')) {
        h = Math.max(minH, r0.h - dy); y = r0.y + (r0.h - h);
        if (y < 0) { h = Math.max(minH, h + y); y = 0; }
      }
      applyRect(win, { x, y, w, h });
    };
    const end = () => {
      if (ended) return;
      ended = true;
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      handle.removeEventListener('lostpointercapture', end);
      try { handle.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      setIframesInert(false);
      hideShield();
      win.el.classList.remove('resizing');
    };
    try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', end);
  }

  /* ---- z-order & focus ---- */
  function compactZ() {
    const ordered = WM.all().sort((a, b) => (+a.el.style.zIndex || 0) - (+b.el.style.zIndex || 0));
    zCounter = 100;
    ordered.forEach((w) => { w.el.style.zIndex = ++zCounter; });
  }

  WM.focus = function (win) {
    if (!win || win.closing) return;
    if (win.minimized) WM.restore(win);
    if (+win.el.style.zIndex !== zCounter) {
      win.el.style.zIndex = ++zCounter;
      if (zCounter > 8000) compactZ();
    }
    if (win.focused) return;
    registry.forEach((w) => {
      if (w !== win && w.focused) {
        w.focused = false; w.el.classList.remove('focused');
        try { w.onBlur?.(w); } catch (err) { console.error(err); }
      }
    });
    win.focused = true;
    win.el.classList.add('focused');
    try { win.onFocus?.(win); } catch (err) { console.error(err); }
    ulyOS.bus.emit('window:focus', win);
  };

  function focusTopmost() {
    const cands = WM.all().filter((w) => !w.minimized && !w.closing);
    cands.sort((a, b) => (+b.el.style.zIndex || 0) - (+a.el.style.zIndex || 0));
    if (cands[0]) WM.focus(cands[0]);
    else ulyOS.bus.emit('window:focus', null);
  }

  /* ---- minimize / restore / maximize / close ---- */
  function dockOffset(win) {
    const item = document.querySelector('.tb-item[data-wids~="' + win.id + '"]');
    if (!item) return { x: 0, y: 120 };
    const ir = item.getBoundingClientRect();
    const wr = win.el.getBoundingClientRect();
    return { x: ir.left + ir.width / 2 - (wr.left + wr.width / 2), y: ir.top + ir.height / 2 - (wr.top + wr.height / 2) };
  }

  WM.minimize = function (win) {
    if (!win || win.minimized || win.closing) return;
    win.minimized = true;
    if (win.focused) { win.focused = false; win.el.classList.remove('focused'); }
    const off = dockOffset(win);
    win.el.style.setProperty('--tx', off.x + 'px');
    win.el.style.setProperty('--ty', off.y + 'px');
    clearTimeout(win._animT);
    const d = dur(240);
    if (d) {
      win.el.classList.add('minimizing');
      win._animT = setTimeout(() => { win.el.classList.remove('minimizing'); win.el.classList.add('minimized'); }, d);
    } else win.el.classList.add('minimized');
    ulyOS.bus.emit('window:minimize', win);
    focusTopmost();
  };

  WM.restore = function (win) {
    if (!win || !win.minimized) return;
    win.minimized = false;
    clearTimeout(win._animT);
    const off = dockOffset(win);
    win.el.style.setProperty('--tx', off.x + 'px');
    win.el.style.setProperty('--ty', off.y + 'px');
    win.el.classList.remove('minimized', 'minimizing');
    const d = dur(240);
    if (d) {
      win.el.classList.add('restoring');
      win._animT = setTimeout(() => win.el.classList.remove('restoring'), d);
    }
    ulyOS.bus.emit('window:restore', win);
  };

  function syncMaxButton(win) {
    const b = win.el.querySelector('.win-btn.max');
    if (!b) return;
    b.innerHTML = win.maximized ? WIN_GLYPH.restore : WIN_GLYPH.max;
    b.setAttribute('aria-label', win.maximized ? 'Restore' : 'Maximize');
  }

  /** Toggle maximize. Pass `force=true` to force maximize. */
  WM.maximize = function (win, force) {
    if (!win || win.closing || win.resizable === false) return;
    if (win.minimized) WM.restore(win);
    if (win.maximized && !force) {
      geomAnim(win);
      win.el.classList.remove('maximized');
      win.maximized = false;
      if (win.restoreRect) applyRect(win, win.restoreRect);
      win.restoreRect = null;
      ulyOS.audit("Window '" + win.title + "' restored", 'info');
    } else if (!win.maximized) {
      if (!win.snap || !win.restoreRect) win.restoreRect = { ...win.rect };
      geomAnim(win);
      win.el.classList.remove('snapped');
      win.snap = null;
      win.el.classList.add('maximized');
      win.maximized = true;
      ulyOS.audit("Window '" + win.title + "' maximized", 'info');
    }
    syncMaxButton(win);
    ulyOS.bus.emit('window:maximize', win);
  };

  /** Close a window. Resolves true if closed, false if vetoed by `canClose`. */
  WM.close = async function (win, opts = {}) {
    if (!win || win.closing) return false;
    if (!opts.force && typeof win.canClose === 'function') {
      let ok = true;
      try { ok = await win.canClose(win); } catch (err) { console.error(err); }
      if (!ok) return false;
    }
    win.closing = true;
    clearTimeout(win._animT);
    win.el.classList.remove('minimizing', 'restoring');
    const d = dur(200);
    if (win.minimized) win.el.classList.remove('minimized');
    if (d) win.el.classList.add('closing');
    await new Promise((r) => setTimeout(r, d));
    if (win.iframe) { try { win.iframe.src = 'about:blank'; } catch { /* ignore */ } }
    win.el.remove();
    registry.delete(win.id);
    if (!registry.size) cascade = 0;
    ulyOS.bus.emit('window:close', win);
    try { win.onClose?.(win); } catch (err) { console.error(err); }
    if (win.focused) focusTopmost();
    return true;
  };

  /* Window open/close animation style (set from Settings; 'random' picks per window). */
  const ANIM_STYLES = ['scale', 'slide', 'fade', 'zoom', 'bounce', 'blur'];
  ulyOS.anim = {
    styles: ANIM_STYLES, mode: 'scale',
    pick() {
      if (this.mode === 'random') return ANIM_STYLES[Math.floor(Math.random() * ANIM_STYLES.length)];
      return ANIM_STYLES.includes(this.mode) ? this.mode : 'scale';
    },
  };

  WM.minimizeAll = () => WM.all().forEach((w) => WM.minimize(w));
  WM.restoreAll = () => { WM.all().forEach((w) => WM.restore(w)); focusTopmost(); };

  WM.setTitle = function (win, title) {
    win.title = title;
    win.el.querySelector('.win-title').textContent = title;
    win.el.setAttribute('aria-label', title);
    ulyOS.bus.emit('window:title', win);
  };

  const WIN_GLYPH = {
    min: '<svg viewBox="0 0 12 12"><path d="M2.5 6h7"/></svg>',
    max: '<svg viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" rx="1.2"/></svg>',
    restore: '<svg viewBox="0 0 12 12"><rect x="2.5" y="4" width="5.5" height="5.5" rx="1"/><path d="M4 4V3.2c0-.4.3-.7.7-.7H9c.4 0 .7.3.7.7v4.3c0 .4-.3.7-.7.7H8"/></svg>',
    close: '<svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6"/></svg>',
  };
  const IFRAME_ALLOW = 'clipboard-read; clipboard-write; fullscreen; autoplay; encrypted-media; picture-in-picture; microphone; camera; display-capture; accelerometer; gyroscope';

  /** Build the chrome-less iframe application surface. */
  function buildFrameApp(win, url, html, localSrc) {
    const t0 = performance.now();
    const loader = h('div', { class: 'frame-loader' },
      h('div', { class: 'spinner' }),
      h('div', { class: 'frame-hint', text: 'Loading ' + safeHost(url) + '…' }));
    const iframe = h('iframe', { class: 'app-frame', title: win.title, referrerPolicy: 'no-referrer-when-downgrade' });
    const local = html != null || !!localSrc;
    if (local) iframe.dataset.local = '1';
    iframe.setAttribute('allow', IFRAME_ALLOW);
    /* Third-party sites run sandboxed: no top-level navigation (a framed site cannot redirect ulyOS itself),
       no access to ulyOS. Bundled local apps are same-origin documents of their own (own CSP, no inline script) and are trusted. */
    if (!local) iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-pointer-lock allow-presentation allow-storage-access-by-user-activation');
    iframe.setAttribute('allowfullscreen', '');
    const reload = () => {
      loader.classList.remove('done', 'slow');
      loader.querySelector('.frame-hint').textContent = 'Reloading…';
      if (local) { if (localSrc) { iframe.src = 'about:blank'; setTimeout(() => { iframe.src = localSrc; arm(); }, 40); } else { iframe.srcdoc = html; arm(); } return; }
      const s = iframe.src;
      iframe.src = 'about:blank';
      setTimeout(() => { iframe.src = s; arm(); }, 40);
    };
    let slowT;
    const arm = () => {
      clearTimeout(slowT);
      slowT = setTimeout(() => {
        if (loader.classList.contains('done')) return;
        loader.classList.add('slow');
        loader.querySelector('.frame-hint').innerHTML =
          'Still loading… if this stays blank, the site may forbid embedding.<br>Use the <b>↗</b> button to open it in a browser tab.';
      }, 9000);
    };
    iframe.addEventListener('load', () => {
      if (!local && (iframe.src === 'about:blank' || !iframe.getAttribute('src') || iframe.getAttribute('src') === 'about:blank')) return;
      loader.classList.add('done');
      clearTimeout(slowT);
      ulyOS.audit("Window '" + win.title + "': iframe loaded from " + safeHost(url) + ' in ' + Math.round(performance.now() - t0) + 'ms', 'ok');
      ulyOS.bus.emit('frame:load', win);
    });
    const bar = h('div', { class: 'frame-bar' },
      h('button', { class: 'frame-btn', title: 'Reload', 'aria-label': 'Reload', html: icon('refresh', 14), onclick: reload }),
      h('div', { class: 'frame-url', title: url, text: url }),
      local ? null : h('button', { class: 'frame-btn', title: 'Open in a browser tab', 'aria-label': 'Open in a browser tab', html: icon('external', 14), onclick: () => window.open(url, '_blank', 'noopener,noreferrer') }));
    // after load, offer an escape hatch: blocked sites render as a blank/"refused" page we cannot detect
    const note = h('div', { class: 'frame-note', hidden: true },
      h('span', { text: 'Blank page or “refused to connect”? This site may block embedding.' }),
      h('button', { class: 'btn sm', text: 'Open in browser tab', onclick: () => window.open(url, '_blank', 'noopener,noreferrer') }),
      h('button', { class: 'frame-btn', 'aria-label': 'Dismiss', html: icon('x', 13), onclick: () => { note.hidden = true; } }));
    if (!local) iframe.addEventListener('load', () => { if (!loader.classList.contains('done') || iframe.getAttribute('src') === 'about:blank') return; note.hidden = false; setTimeout(() => { note.hidden = true; }, 12000); });
    const stage = h('div', { class: 'frame-stage' }, iframe, loader, note);
    win.iframe = iframe;
    // attach first, then navigate (so `load` always fires on a connected frame)
    win._startFrame = () => { if (localSrc) iframe.src = localSrc; else if (local) iframe.srcdoc = html; else iframe.src = url; arm(); };
    return h('div', { class: 'frame-app' }, bar, stage);
  }
  function safeHost(u) { try { return new URL(u).host; } catch { return u; } }

  /**
   * Open a window.
   * opts: { appId, key, title, icon(html), width, height, x, y, minWidth, minHeight, resizable,
   *         content(Node|string) | render(win)->Node | url(string → iframe app),
   *         mem(MB, simulated base cost), singleton, canClose(win)->bool|Promise, onClose, onFocus, onBlur }
   */
  WM.open = function (opts = {}) {
    if (opts.singleton && opts.appId) {
      const existing = WM.all().find((w) => w.appId === opts.appId && (opts.key == null || w.key === opts.key) && !w.closing);
      if (existing) { WM.restore(existing); WM.focus(existing); return existing; }
    }
    const a = WM.area();
    const w = Math.min(opts.width || 820, a.w - 24);
    const hgt = Math.min(opts.height || 540, a.h - 24);
    const off = (cascade++ % 8) * 30;
    const x = opts.x ?? clamp(Math.round((a.w - w) / 2) - 90 + off, 8, Math.max(8, a.w - w - 8));
    const y = opts.y ?? clamp(Math.round((a.h - hgt) / 2) - 50 + off, 8, Math.max(8, a.h - hgt - 8));

    const win = {
      id: 'w' + ++idSeq, appId: opts.appId || 'app', key: opts.key ?? null,
      title: opts.title || 'Untitled', icon: opts.icon || icon('file', 16), url: opts.url || null,
      mem: opts.mem, resizable: opts.resizable !== false, minWidth: opts.minWidth, minHeight: opts.minHeight,
      canClose: opts.canClose, onClose: opts.onClose, onFocus: opts.onFocus, onBlur: opts.onBlur,
      minimized: false, maximized: false, snap: null, restoreRect: null, focused: false, closing: false,
      openedAt: Date.now(), iframe: null, rect: { x, y, w, h: hgt },
    };

    const controls = h('div', { class: 'win-controls' },
      h('button', { class: 'win-btn min', 'aria-label': 'Minimize', html: WIN_GLYPH.min, onclick: () => WM.minimize(win) }),
      win.resizable ? h('button', { class: 'win-btn max', 'aria-label': 'Maximize', html: WIN_GLYPH.max, onclick: () => WM.maximize(win) }) : null,
      h('button', { class: 'win-btn close', 'aria-label': 'Close', html: WIN_GLYPH.close, onclick: () => WM.close(win) }));
    const titlebar = h('header', { class: 'win-titlebar' },
      h('div', { class: 'win-icon', html: win.icon }),
      h('div', { class: 'win-title', text: win.title }),
      controls);
    const body = h('div', { class: 'win-body' });
    const shield = h('div', { class: 'win-shield', title: 'Click to focus' });

    const el = h('section', {
      class: 'window opening', role: 'dialog', 'aria-label': win.title, tabindex: -1,
      dataset: { wid: win.id, app: win.appId, anim: ulyOS.anim.pick() },
    }, titlebar, body, shield);
    if (win.resizable) {
      ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach((dir) => {
        el.append(h('div', { class: 'rz rz-' + dir, onpointerdown: (e) => beginResize(win, dir, e) }));
      });
    }
    win.el = el; win.body = body; win.titlebar = titlebar;

    // content
    if (opts.url || opts.html != null || opts.src) {
      win.local = opts.html != null || !!opts.src;
      body.append(buildFrameApp(win, opts.url || 'local app · ' + win.title, opts.html, opts.src));
      el.classList.add('has-iframe');
    } else if (typeof opts.render === 'function') {
      // appended before render so render() can measure/focus
      layer().append(el);
    }
    if (!el.isConnected) layer().append(el);
    applyRect(win, win.rect);
    el.style.zIndex = ++zCounter;
    registry.set(win.id, win);

    if (!opts.url && opts.html == null && !opts.src && typeof opts.render === 'function') {
      const node = opts.render(win);
      if (node) body.append(node);
    } else if (opts.content) {
      body.append(opts.content.nodeType ? opts.content : h('div', { html: opts.content }));
    }

    // interactions
    el.addEventListener('pointerdown', () => WM.focus(win), true);
    titlebar.addEventListener('pointerdown', (e) => beginDrag(win, e));
    titlebar.addEventListener('dblclick', (e) => { if (!e.target.closest('.win-controls') && !WM.compact()) WM.maximize(win); });
    titlebar.addEventListener('auxclick', (e) => { if (e.button === 1) WM.close(win); });
    titlebar.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ulyOS.ui.contextMenu(e.clientX, e.clientY, windowMenu(win));
    });

    if (WM.compact() && win.resizable) {   // phone: every window opens full-screen
      win.restoreRect = { ...win.rect }; el.classList.add('maximized'); win.maximized = true; syncMaxButton(win);
    }
    const d = dur(260);
    setTimeout(() => el.classList.remove('opening'), d);
    if (!d) el.classList.remove('opening');

    ulyOS.bus.emit('window:open', win);
    WM.focus(win);
    if (win._startFrame) win._startFrame();
    return win;
  };

  function windowMenu(win) {
    return [
      { label: win.minimized ? 'Restore' : 'Minimize', icon: 'minus', action: () => (win.minimized ? WM.focus(win) : WM.minimize(win)) },
      win.resizable ? { label: win.maximized ? 'Restore size' : 'Maximize', icon: 'fullscreen', action: () => WM.maximize(win) } : null,
      win.url && !win.local ? { label: 'Open in browser tab', icon: 'external', action: () => window.open(win.url, '_blank', 'noopener,noreferrer') } : null,
      { separator: true },
      { label: 'Close', icon: 'x', danger: true, action: () => WM.close(win) },
    ].filter(Boolean);
  }
  WM.menuFor = windowMenu;

  // Keyboard focus moved into an iframe → bring that window forward.
  window.addEventListener('blur', () => {
    setTimeout(() => {
      const act = document.activeElement;
      if (act && act.tagName === 'IFRAME') {
        const win = WM.all().find((w) => w.el.contains(act));
        if (win) WM.focus(win);
      }
    }, 0);
  });

  // Keep windows reachable when the viewport changes.
  window.addEventListener('resize', () => {
    const a = WM.area();
    WM.all().forEach((win) => {
      if (win.maximized) return;
      if (win.snap) { applyRect(win, snapRect(win.snap)); return; }
      const r = win.rect;
      const w = Math.min(r.w, a.w), hh = Math.min(r.h, a.h);
      applyRect(win, { x: clamp(r.x, -w + 120, a.w - 120), y: clamp(r.y, 0, Math.max(0, a.h - 40)), w, h: hh });
    });
  });

  /* ==========================================================================
     SHARED UI PRIMITIVES — context menu, dialogs, toasts
     ========================================================================== */
  const ui = (ulyOS.ui = {});
  const overlay = () => document.getElementById('overlay-root');

  /* ---------------- Context menu ---------------- */
  let ctx = null;

  ui.closeMenu = function () {
    if (!ctx) return;
    const c = ctx; ctx = null;
    c.menus.forEach((m) => m.remove());
    try { c.onClose?.(); } catch (err) { console.error(err); }
    document.removeEventListener('pointerdown', c.onDown, true);
    document.removeEventListener('keydown', c.onKey, true);
    document.removeEventListener('wheel', ui.closeMenu, true);
    window.removeEventListener('blur', ui.closeMenu);
    window.removeEventListener('resize', ui.closeMenu);
  };

  function place(menu, x, y, anchorLeft) {
    const mw = menu.offsetWidth, mh = menu.offsetHeight;   // layout size — getBoundingClientRect() is skewed by the pop-in scale animation
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = x, top = y;
    if (left + mw > vw - 8) left = anchorLeft != null ? anchorLeft - mw + 4 : vw - mw - 8;
    if (top + mh > vh - 8) top = vh - mh - 8;
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top = Math.max(8, top) + 'px';
    menu.style.visibility = '';
  }

  function closeSubOf(menu) {
    if (!menu._sub) return;
    closeSubOf(menu._sub);
    menu._sub.remove();
    ctx && (ctx.menus = ctx.menus.filter((m) => m !== menu._sub));
    menu._sub = null;
  }

  function buildMenu(items) {
    const menu = h('div', { class: 'ctx-menu', role: 'menu' });
    menu.style.visibility = 'hidden';
    items.filter(Boolean).forEach((it) => {
      if (it.separator) { menu.append(h('div', { class: 'ctx-sep', role: 'separator' })); return; }
      const row = h('div', {
        class: 'ctx-item' + (it.disabled ? ' disabled' : '') + (it.danger ? ' danger' : ''), role: 'menuitem',
      },
        h('span', { class: 'ctx-ico', html: it.icon ? icon(it.icon, 15) : '' }),
        h('span', { class: 'ctx-label', text: it.label }),
        it.shortcut ? h('span', { class: 'ctx-kbd', text: it.shortcut }) : null,
        it.submenu ? h('span', { class: 'ctx-arrow', html: icon('chevronRight', 13) }) : null);
      const openSub = () => {
        if (menu._sub && menu._sub._owner === row) return;
        closeSubOf(menu);
        const sub = buildMenu(it.submenu);
        sub._owner = row;
        menu._sub = sub;
        ctx.menus.push(sub);
        overlay().append(sub);
        const rr = row.getBoundingClientRect();
        place(sub, rr.right - 4, rr.top - 6, rr.left);
      };
      row._open = openSub;
      row.addEventListener('pointerenter', () => {
        menu.querySelectorAll('.ctx-item.hot').forEach((n) => n.classList.remove('hot'));
        if (!it.disabled) row.classList.add('hot');
        if (it.submenu && !it.disabled) openSub(); else closeSubOf(menu);
      });
      if (!it.submenu && !it.disabled) {
        row.addEventListener('click', (e) => { e.stopPropagation(); ui.closeMenu(); setTimeout(() => it.action?.(), 0); });
      }
      menu.append(row);
    });
    return menu;
  }

  ui.contextMenu = function (x, y, items, opts = {}) {
    ui.closeMenu();
    const state = { menus: [], onClose: opts.onClose };
    ctx = state;
    const menu = buildMenu(items);
    state.menus.push(menu);
    overlay().append(menu);
    place(menu, x, y);

    state.onDown = (e) => { if (!e.target.closest('.ctx-menu')) ui.closeMenu(); };
    state.onKey = (e) => {
      const cur = state.menus[state.menus.length - 1];
      const rows = [...cur.querySelectorAll(':scope > .ctx-item:not(.disabled)')];
      const hot = cur.querySelector(':scope > .ctx-item.hot');
      const setHot = (n) => { cur.querySelectorAll('.ctx-item.hot').forEach((r) => r.classList.remove('hot')); n?.classList.add('hot'); };
      if (e.key === 'Escape') { e.preventDefault(); ui.closeMenu(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setHot(rows[(rows.indexOf(hot) + 1) % rows.length]); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHot(rows[(rows.indexOf(hot) - 1 + rows.length) % rows.length]); }
      else if (e.key === 'ArrowRight') { if (hot?._open) { e.preventDefault(); hot._open(); const s = state.menus[state.menus.length - 1]; setHot.call(null, null); s.querySelector('.ctx-item:not(.disabled)')?.classList.add('hot'); } }
      else if (e.key === 'ArrowLeft') { if (state.menus.length > 1) { e.preventDefault(); closeSubOf(state.menus[state.menus.length - 2]); } }
      else if (e.key === 'Enter') { if (hot) { e.preventDefault(); hot.click(); } }
    };
    document.addEventListener('pointerdown', state.onDown, true);
    document.addEventListener('keydown', state.onKey, true);
    document.addEventListener('wheel', ui.closeMenu, { capture: true, passive: true });
    window.addEventListener('blur', ui.closeMenu);   // clicking into an iframe blurs the parent window
    window.addEventListener('resize', ui.closeMenu);
    return menu;
  };

  /* ---------------- Modal dialogs ---------------- */
  function openModal(build) {
    return new Promise((resolve) => {
      const back = h('div', { class: 'modal-back' });
      const prevFocus = document.activeElement;
      let done = false;
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
      const close = (val) => {
        if (done) return;
        done = true;
        try { const m = back.firstElementChild; if (m && m._dispose) m._dispose(); } catch { /* ignore */ }   // lets dialogs wipe secrets
        document.removeEventListener('keydown', onKey, true);
        back.classList.add('out');
        setTimeout(() => { back.remove(); try { prevFocus?.focus?.({ preventScroll: true }); } catch { /* ignore */ } }, dur(160));
        resolve(val);
      };
      back.append(build(close));
      overlay().append(back);
      back.addEventListener('pointerdown', (e) => { if (e.target === back) close(null); });
      document.addEventListener('keydown', onKey, true);
    });
  }

  /** Generic form dialog → resolves object of values, `true` (no fields) or null on cancel. */
  ui.form = (cfg) => openModal((close) => {
    const { title, message, fields = [], okText = 'OK', cancelText = 'Cancel', danger = false, validate, hideCancel = false } = cfg;
    const err = h('div', { class: 'modal-err', role: 'alert' });
    const inputs = {};
    const rows = fields.map((f) => {
      let input;
      if (f.type === 'custom') {   // caller supplies its own node + value getter (e.g. the password widget)
        inputs[f.name] = { get value() { return f.get(); }, focus: f.focus };
        return f.node || null;
      }
      if (f.type === 'select') {
        input = h('select', { class: 'input', onchange: f.onchange ? (e) => f.onchange(e.target.value) : null }, f.options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          return h('option', { value: v, text: typeof o === 'object' ? o.label : o, selected: v === f.value });
        }));
      } else if (f.type === 'textarea') {
        input = h('textarea', { class: 'input', rows: f.rows || 5, value: f.value ?? '', placeholder: f.placeholder || '', spellcheck: true, style: { resize: 'vertical', minHeight: '90px' } });
      } else {
        input = h('input', { class: 'input', type: f.type || 'text', value: f.value ?? '', placeholder: f.placeholder || '', spellcheck: false, autocomplete: 'off' });
      }
      inputs[f.name] = input;
      return h('label', { class: 'field' }, h('span', { class: 'field-label', text: f.label }), input);
    });
    const okBtn = h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'submit', text: okText });
    const submit = () => {
      const vals = {};
      fields.forEach((f) => { vals[f.name] = inputs[f.name].value; });
      const msg = validate ? validate(vals) : null;
      if (msg) { err.textContent = msg; return; }
      close(fields.length ? vals : true);
    };
    const form = h('form', { class: 'modal', role: 'dialog', 'aria-modal': 'true', onsubmit: (e) => { e.preventDefault(); submit(); } },
      h('h3', { class: 'modal-title', text: title }),
      message ? h('p', { class: 'modal-msg', text: message }) : null,
      rows, err,
      h('div', { class: 'modal-actions' },
        hideCancel ? null : h('button', { class: 'btn', type: 'button', text: cancelText, onclick: () => close(null) }),
        okBtn));
    form._dispose = () => fields.forEach((f) => { try { if (f.dispose) f.dispose(); } catch { /* ignore */ } });
    setTimeout(() => {
      const first = inputs[fields[0]?.name];
      if (first) { first.focus?.(); first.select?.(); } else okBtn.focus();
    }, 30);
    return form;
  });

  ui.prompt = async (cfg) => {
    const res = await ui.form({
      title: cfg.title, message: cfg.message, okText: cfg.okText, validate: cfg.validate ? (v) => cfg.validate(v.value) : null,
      fields: [{ name: 'value', label: cfg.label || '', value: cfg.value || '', placeholder: cfg.placeholder || '' }],
    });
    return res ? res.value : null;
  };
  ui.confirm = async (cfg) => (await ui.form({ ...cfg, fields: [] })) === true;
  ui.alert = (cfg) => ui.form({ ...cfg, fields: [], hideCancel: true, okText: cfg.okText || 'OK' });
  /** choices: [{label, value, primary, danger}] → resolves chosen value or null. */
  ui.choose = (cfg) => openModal((close) =>
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      h('h3', { class: 'modal-title', text: cfg.title }),
      cfg.message ? h('p', { class: 'modal-msg', text: cfg.message }) : null,
      h('div', { class: 'modal-actions' },
        cfg.choices.map((c) => h('button', {
          class: 'btn' + (c.primary ? ' primary' : '') + (c.danger ? ' danger' : ''), type: 'button', text: c.label,
          onclick: () => close(c.value),
        })))));

  /* ---------------- Toasts ---------------- */
  ui.toast = function (message, opts = {}) {
    let host = $('#toasts');
    if (!host) { host = h('div', { id: 'toasts' }); overlay().append(host); }
    const t = h('div', { class: 'toast ' + (opts.type || 'info'), role: 'status' },
      h('span', { class: 'toast-msg', text: message }),
      opts.action ? h('button', {
        class: 'toast-act', text: opts.action.label,
        onclick: () => { opts.action.fn(); kill(); },
      }) : null);
    host.append(t);
    if (ulyOS.fx) ulyOS.fx.sound(opts.type === 'err' ? 'err' : opts.type === 'ok' ? 'ok' : 'notify', 0.8);
    let killed = false;
    const kill = () => {
      if (killed) return; killed = true;
      t.classList.add('out');
      setTimeout(() => t.remove(), dur(220));
    };
    setTimeout(kill, opts.timeout || (opts.action ? 6000 : 3400));
    return kill;
  };

  // Block the browser's native menu on OS chrome (but keep it for text inputs).
  document.addEventListener('contextmenu', (e) => {
    if (e.defaultPrevented) return;
    if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
    e.preventDefault();
  });

  /* ---- Touch: long-press opens the context menu (iOS never fires `contextmenu` itself) ---- */
  (function () {
    let timer = 0, sx = 0, sy = 0, target = null, fired = 0;
    const clear = () => { clearTimeout(timer); timer = 0; };
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !e.isPrimary) return;
      clear(); sx = e.clientX; sy = e.clientY; target = e.target;
      if (target.closest && target.closest('input, textarea, select, .ctx-menu, .win-titlebar, .rz')) return;
      timer = setTimeout(() => {
        timer = 0; fired = Date.now();
        if (navigator.vibrate) navigator.vibrate(10);
        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: sx, clientY: sy, button: 2 }));
      }, 480);
    }, { capture: true, passive: true });
    document.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clear(); }, { capture: true, passive: true });
    ['pointerup', 'pointercancel'].forEach((ev) => document.addEventListener(ev, clear, { capture: true, passive: true }));
    // the finger-lift after a long-press must not "click" whatever appeared under it
    document.addEventListener('click', (e) => { if (Date.now() - fired < 700) { e.stopPropagation(); e.preventDefault(); fired = 0; } }, true);
  })();
})();
