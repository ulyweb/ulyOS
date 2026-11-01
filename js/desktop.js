/* ==========================================================================
   ulyOS · js/desktop.js
   Boot sequence · settings store · wallpaper · custom cursor · grid desktop
   with right-click menus · taskbar / start menu · Settings app
   ========================================================================== */
(function () {
  'use strict';

  const { h, icon, store, clamp, pad2, fmtBytes, escapeHtml } = ulyOS.util;
  const { WM, ui, bus } = ulyOS;
  const $ = (s, r = document) => r.querySelector(s);
  const root = document.documentElement;

  /* ==========================================================================
     Settings store
     ========================================================================== */
  const DEFAULT_SETTINGS = {
    wallpaper: 'void', wallpaperColor: '#07080c', wallpaperCustom: '',
    accent: '#8fa3ff', animations: true, animSpeed: 1, blur: 24, glassAlpha: 0.72,
    cursor: true, bootAnim: true, iconSize: 'medium', favicons: true, clockSeconds: false,
  };
  let settings = { ...DEFAULT_SETTINGS, ...store.get('ulyos.settings', {}) };
  const Settings = (ulyOS.settings = {
    get: (k) => settings[k],
    all: () => ({ ...settings }),
    set(k, v) {
      settings[k] = v; store.set('ulyos.settings', settings);
      applySettings(k);
      bus.emit('settings:change', { key: k, value: v });
    },
    reset() { settings = { ...DEFAULT_SETTINGS }; store.set('ulyos.settings', settings); applySettings(); applyWallpaper(); },
  });

  const ICON_SIZES = { small: { cw: 88, ch: 96, tile: 44 }, medium: { cw: 100, ch: 110, tile: 52 }, large: { cw: 116, ch: 128, tile: 64 } };
  const WALLPAPERS = [
    ['void', 'Void'], ['aurora', 'Aurora'], ['grid', 'Grid'], ['ocean', 'Deep Ocean'], ['ember', 'Ember'], ['mono', 'Graphite'],
  ];

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex) || [0, '8fa3ff'];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function applySettings() {
    const s = settings;
    root.style.setProperty('--accent', s.accent);
    root.style.setProperty('--accent-rgb', hexToRgb(s.accent).join(','));
    root.style.setProperty('--blur', s.blur + 'px');
    root.style.setProperty('--glass-alpha', s.glassAlpha);
    root.style.setProperty('--speed', s.animSpeed);
    document.body.classList.toggle('no-anim', !s.animations);
    document.body.classList.toggle('no-blur', s.blur === 0);
    Cursor.apply();
    const sz = ICON_SIZES[s.iconSize] || ICON_SIZES.medium;
    root.style.setProperty('--cell-w', sz.cw + 'px');
    root.style.setProperty('--cell-h', sz.ch + 'px');
    root.style.setProperty('--tile', sz.tile + 'px');
    if (Desktop.ready) Desktop.layout();
    Taskbar.tickClock?.();
  }

  let wpUrl = null;
  async function applyWallpaper() {
    const wp = $('#wallpaper');
    wp.removeAttribute('style');
    wp.className = 'wp-' + settings.wallpaper;
    if (settings.wallpaper === 'solid') wp.style.background = settings.wallpaperColor;
    if (settings.wallpaper === 'custom') {
      let url = settings.wallpaperCustom;
      if (url.startsWith('opfs:')) {
        const f = await ulyOS.FS.readSandboxFile(url.slice(5));
        if (wpUrl) URL.revokeObjectURL(wpUrl);
        url = f ? (wpUrl = URL.createObjectURL(f)) : '';
      }
      if (url) wp.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';
    }
  }

  /* ==========================================================================
     Custom cursor (SVG cursors + trailing ring)
     ========================================================================== */
  const Cursor = {
    apply() {
      const on = settings.cursor;
      document.body.classList.toggle('no-cursor', !on);
      const svg = (body, hx, hy, fb) => 'url("data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">' + body + '</svg>') + '") ' + hx + ' ' + hy + ', ' + fb;
      if (on) {
        root.style.setProperty('--cur-default', svg('<path d="M6 4l15 8.2-6.6 1.9-2.9 6.4z" fill="#fff" stroke="#000" stroke-opacity=".85" stroke-width="1.3" stroke-linejoin="round"/>', 6, 4, 'default'));
        root.style.setProperty('--cur-pointer', svg('<circle cx="14" cy="14" r="7" fill="rgba(255,255,255,.14)" stroke="#fff" stroke-width="1.4"/><circle cx="14" cy="14" r="2" fill="#fff"/>', 14, 14, 'pointer'));
      } else {
        root.style.setProperty('--cur-default', 'default');
        root.style.setProperty('--cur-pointer', 'pointer');
      }
    },
    init() {
      const ring = $('#cursor-ring');
      let tx = -100, ty = -100, x = -100, y = -100, raf = 0;
      const loop = () => {
        x += (tx - x) * 0.22; y += (ty - y) * 0.22;
        ring.style.transform = 'translate3d(' + (x - 16) + 'px,' + (y - 16) + 'px,0)';
        raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(loop) : 0;
      };
      document.addEventListener('pointermove', (e) => {
        if (!settings.cursor || e.pointerType === 'touch') return;
        tx = e.clientX; ty = e.clientY;
        const t = e.target;
        // over an iframe the page cannot track the pointer → hide the ring
        ring.classList.toggle('hidden', t && t.tagName === 'IFRAME');
        ring.classList.toggle('hot', !!(t.closest && t.closest('a,button,.desk-icon,.tb-item,.ctx-item,.fm-row,.place,.win-btn,[role=tab],select,label.switch')));
        ring.classList.toggle('down', e.buttons > 0);
        if (!raf) raf = requestAnimationFrame(loop);
      }, { passive: true });
      document.addEventListener('pointerdown', () => ring.classList.add('down'), true);
      document.addEventListener('pointerup', () => ring.classList.remove('down'), true);
      document.documentElement.addEventListener('mouseleave', () => ring.classList.add('hidden'));
    },
  };

  /* ==========================================================================
     URL helpers + app registry
     ========================================================================== */
  function normalizeUrl(input) {
    let s = (input || '').trim();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
    try {
      const u = new URL(s);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
      return u.href;
    } catch { return null; }
  }
  /** open.spotify.com/playlist/ID → embeddable /embed/playlist/ID */
  function embedUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'open.spotify.com' && !u.pathname.startsWith('/embed')) {
        const m = u.pathname.match(/^\/(?:intl-[a-z]+\/)?(track|album|playlist|artist|show|episode)\/([A-Za-z0-9]+)/);
        if (m) return 'https://open.spotify.com/embed/' + m[1] + '/' + m[2] + '?utm_source=generator&theme=0';
      }
    } catch { /* ignore */ }
    return url;
  }
  const hostName = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  const hueOf = (s) => { let n = 0; for (const c of s) n = (n * 31 + c.charCodeAt(0)) % 360; return n; };

  const SYS_APPS = {
    files: { name: 'Files', icon: 'folder', open: () => ulyOS.FS.open() },
    taskmgr: { name: 'Task Manager', icon: 'activity', open: () => ulyOS.Telemetry.open() },
    settings: { name: 'Settings', icon: 'settings', open: () => SettingsApp.open() },
  };
  const DEFAULT_ICONS = [
    { id: 'files', kind: 'sys', sys: 'files', name: 'Files' },
    { id: 'photopea', kind: 'url', name: 'Photopea', url: 'https://www.photopea.com/', glyph: 'layers', mem: 120, w: 1200, h: 760, tint: '#7dd3fc' },
    { id: 'polotno', kind: 'url', name: 'Polotno', url: 'https://studio.polotno.com/', glyph: 'shapes', mem: 95, w: 1100, h: 720, tint: '#c4b5fd' },
    { id: 'getartcraft', kind: 'url', name: 'GetArtCraft', url: 'https://app.getartcraft.com/create-image', glyph: 'sparkles', mem: 140, w: 1100, h: 720, tint: '#fbbf24' },
    { id: 'spotify', kind: 'url', name: 'Spotify', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator&theme=0', glyph: 'headphones', mem: 70, w: 560, h: 700, tint: '#4ade80' },
    { id: 'taskmgr', kind: 'sys', sys: 'taskmgr', name: 'Task Manager' },
    { id: 'settings', kind: 'sys', sys: 'settings', name: 'Settings' },
  ];

  /** Icon markup for an icon record (used by desktop tiles, taskbar, window chrome). */
  function iconHTML(ic, size = 16) {
    if (ic.kind === 'sys') return icon(SYS_APPS[ic.sys].icon, size);
    if (ic.glyph) return icon(ic.glyph, size);
    const letter = escapeHtml((ic.name || '?').trim().charAt(0).toUpperCase());
    const fav = settings.favicons && ic.url
      ? '<img src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(hostName(ic.url)) + '&sz=64" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '';
    return '<span class="letter-ico" style="--h:' + hueOf(hostName(ic.url || ic.name)) + ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.62) + 'px">' + letter + fav + '</span>';
  }

  function launch(ic) {
    if (ic.kind === 'sys') { SYS_APPS[ic.sys].open(); return; }
    WM.open({
      appId: 'web:' + ic.id, title: ic.name, icon: iconHTML(ic, 16), url: embedUrl(ic.url),
      width: ic.w || 1000, height: ic.h || 680, mem: ic.mem, singleton: true,
    });
  }

  /* ==========================================================================
     Desktop (grid of icons)
     ========================================================================== */
  const Desktop = (ulyOS.Desktop = {
    ready: false, icons: [], selected: new Set(), cols: 1, rows: 1, pad: 16, els: new Map(),
  });

  const cell = () => ({ w: parseFloat(getComputedStyle(root).getPropertyValue('--cell-w')) || 100, h: parseFloat(getComputedStyle(root).getPropertyValue('--cell-h')) || 110 });
  const saveIcons = () => store.set('ulyos.icons', { v: 1, list: Desktop.icons });

  function metrics() {
    const c = cell(), el = $('#desktop');
    Desktop.cols = Math.max(1, Math.floor((el.clientWidth - Desktop.pad * 2) / c.w));
    Desktop.rows = Math.max(1, Math.floor((el.clientHeight - Desktop.pad * 2) / c.h));
  }
  const occupied = (col, row, ignoreId) => Desktop.icons.some((i) => i.id !== ignoreId && i.col === col && i.row === row);
  function freeCellNear(col, row, ignoreId) {
    col = clamp(col, 0, Desktop.cols - 1); row = clamp(row, 0, Desktop.rows - 1);
    if (!occupied(col, row, ignoreId)) return [col, row];
    let best = null, bd = Infinity;
    for (let c = 0; c < Desktop.cols; c++) for (let r = 0; r < Desktop.rows; r++) {
      if (occupied(c, r, ignoreId)) continue;
      const d = Math.abs(c - col) + Math.abs(r - row);
      if (d < bd) { bd = d; best = [c, r]; }
    }
    return best || [col, row];
  }
  function nextFree() {
    for (let c = 0; c < Math.max(Desktop.cols, 1); c++) for (let r = 0; r < Desktop.rows; r++) if (!occupied(c, r)) return [c, r];
    return [0, 0];
  }
  function placeEl(ic) {
    const el = Desktop.els.get(ic.id), c = cell();
    if (!el) return;
    el.style.left = Desktop.pad + ic.col * c.w + 'px';
    el.style.top = Desktop.pad + ic.row * c.h + 'px';
  }

  Desktop.layout = function () {
    metrics();
    // re-home icons that fall outside the visible grid, resolve collisions
    Desktop.icons.forEach((ic) => {
      if (ic.col == null || ic.col >= Desktop.cols || ic.row >= Desktop.rows || ic.col < 0 || ic.row < 0) {
        const tmp = ic.id; ic.col = -1; ic.row = -1; const [c, r] = nextFree(); ic.col = c; ic.row = r; void tmp;
      }
    });
    Desktop.icons.forEach(placeEl);
    saveIcons();
  };

  Desktop.render = function (animateIn) {
    const host = $('#desktop');
    host.replaceChildren();
    Desktop.els.clear();
    metrics();
    Desktop.icons.forEach((ic, i) => {
      if (ic.col == null) { const [c, r] = nextFree(); ic.col = c; ic.row = r; }
      const el = buildIcon(ic);
      if (animateIn) { el.classList.add('pop-in'); el.style.animationDelay = 120 + i * 60 + 'ms'; }
      host.append(el);
      Desktop.els.set(ic.id, el);
    });
    Desktop.layout();
    paintSelection();
  };

  function buildIcon(ic) {
    const tile = h('div', { class: 'di-tile', html: ic.kind === 'sys' || ic.glyph ? iconHTML(ic, 26) : iconHTML(ic, 30), style: ic.tint ? { '--tint': ic.tint } : null });
    const el = h('div', { class: 'desk-icon', tabindex: 0, role: 'button', 'aria-label': ic.name, dataset: { id: ic.id } },
      tile, h('div', { class: 'di-label', text: ic.name }));
    el.addEventListener('dblclick', () => { launch(ic); ulyOS.audit("Launching '" + ic.name + "' from desktop", 'info'); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') launch(ic); });
    el.addEventListener('pointerdown', (e) => beginIconDrag(ic, el, e));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!Desktop.selected.has(ic.id)) { Desktop.selected = new Set([ic.id]); paintSelection(); }
      ui.contextMenu(e.clientX, e.clientY, iconMenu(ic));
    });
    return el;
  }

  function paintSelection() {
    Desktop.els.forEach((el, id) => el.classList.toggle('selected', Desktop.selected.has(id)));
  }

  function beginIconDrag(ic, el, e) {
    if (e.button !== 0) return;
    e.stopPropagation();
    ui.closeMenu();
    if (e.ctrlKey || e.metaKey) { Desktop.selected.has(ic.id) ? Desktop.selected.delete(ic.id) : Desktop.selected.add(ic.id); }
    else if (!Desktop.selected.has(ic.id)) Desktop.selected = new Set([ic.id]);
    paintSelection();
    WM.all().forEach((w) => { if (w.focused) { w.focused = false; w.el.classList.remove('focused'); } });
    bus.emit('window:focus', null);

    const c = cell();
    const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop;
    let moved = false;
    const hint = $('#cell-hint');
    const onMove = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      if (!moved) { moved = true; el.classList.add('dragging'); WM.setIframesInert(true); }
      const nx = ox + ev.clientX - sx, ny = oy + ev.clientY - sy;
      el.style.left = nx + 'px'; el.style.top = ny + 'px';
      const [col, row] = freeCellNear(Math.round((nx - Desktop.pad) / c.w), Math.round((ny - Desktop.pad) / c.h), ic.id);
      hint.style.cssText = 'display:block;left:' + (Desktop.pad + col * c.w) + 'px;top:' + (Desktop.pad + row * c.h) + 'px;width:' + c.w + 'px;height:' + c.h + 'px';
      hint._cell = [col, row];
    };
    const end = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      if (!moved) return;
      WM.setIframesInert(false);
      el.classList.remove('dragging');
      hint.style.display = 'none';
      if (hint._cell) { [ic.col, ic.row] = hint._cell; }
      placeEl(ic); saveIcons();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  }

  /* ---- icon CRUD ---- */
  function addIcon(rec) {
    metrics();
    const [c, r] = nextFree();
    const ic = { col: c, row: r, ...rec };
    Desktop.icons.push(ic);
    const el = buildIcon(ic);
    el.classList.add('pop-in');
    $('#desktop').append(el);
    Desktop.els.set(ic.id, el);
    placeEl(ic); saveIcons();
    return ic;
  }
  function removeIcon(ic, withUndo = true) {
    const idx = Desktop.icons.indexOf(ic);
    if (idx < 0) return;
    Desktop.icons.splice(idx, 1);
    Desktop.els.get(ic.id)?.remove(); Desktop.els.delete(ic.id);
    Desktop.selected.delete(ic.id);
    saveIcons();
    ulyOS.audit("Desktop icon '" + ic.name + "' deleted" + (ic.kind === 'sys' || ic.glyph ? ' (stock icon)' : ''), 'warn');
    if (withUndo) {
      ui.toast("Removed '" + ic.name + "'", {
        action: {
          label: 'Undo', fn: () => {
            Desktop.icons.splice(idx, 0, ic);
            Desktop.render(); ulyOS.audit("Desktop icon '" + ic.name + "' restored (undo)", 'info');
          },
        },
      });
    }
  }
  async function shortcutDialog(existing) {
    const vals = await ui.form({
      title: existing ? 'Edit shortcut' : 'New URL shortcut', okText: existing ? 'Save' : 'Create',
      message: 'The page opens in its own window. Spotify links are converted to the embeddable player automatically.',
      fields: [
        { name: 'name', label: 'Name', value: existing?.name || '', placeholder: 'e.g. Figma' },
        { name: 'url', label: 'URL', value: existing?.url || '', placeholder: 'https://example.com', type: 'text' },
      ],
      validate: (v) => (!normalizeUrl(v.url) ? 'Enter a valid http(s) URL' : null),
    });
    if (!vals) return;
    const url = normalizeUrl(vals.url);
    const name = vals.name.trim() || hostName(url).replace(/\.[^.]+$/, '').replace(/^./, (c) => c.toUpperCase());
    if (existing) {
      Object.assign(existing, { name, url });
      ulyOS.audit("Shortcut '" + name + "' updated → " + hostName(url), 'ok');
      Desktop.render();
    } else {
      const ic = addIcon({ id: 'u' + Date.now().toString(36), kind: 'url', name, url });
      ulyOS.audit("Shortcut '" + name + "' added to desktop → " + hostName(url), 'ok');
      Desktop.selected = new Set([ic.id]); paintSelection();
    }
  }

  function missingDefaults() { return DEFAULT_ICONS.filter((d) => !Desktop.icons.some((i) => i.id === d.id)); }
  function restoreDefaults() {
    const miss = missingDefaults();
    miss.forEach((d) => addIcon({ ...d }));
    if (miss.length) ulyOS.audit('Restored ' + miss.length + ' stock desktop icon(s)', 'ok');
  }
  function autoArrange() {
    metrics();
    Desktop.icons.forEach((i) => { i.col = -1; i.row = -1; });
    Desktop.icons.forEach((i) => { const [c, r] = nextFree(); i.col = c; i.row = r; });
    Desktop.icons.forEach(placeEl); saveIcons();
    ulyOS.audit('Desktop icons auto-arranged', 'info');
  }

  function iconMenu(ic) {
    const sel = [...Desktop.selected].map((id) => Desktop.icons.find((i) => i.id === id)).filter(Boolean);
    const multi = sel.length > 1;
    return [
      { label: 'Open', icon: 'external', disabled: multi, action: () => launch(ic) },
      ic.kind === 'url' ? { label: 'Open in browser tab', icon: 'globe', disabled: multi, action: () => window.open(embedUrl(ic.url), '_blank', 'noopener,noreferrer') } : null,
      ic.kind === 'url' ? { label: 'Edit shortcut…', icon: 'edit', disabled: multi, action: () => shortcutDialog(ic) } : null,
      { label: 'Rename', icon: 'edit', disabled: multi, action: async () => {
        const n = await ui.prompt({ title: 'Rename icon', label: 'Name', value: ic.name, okText: 'Rename', validate: (v) => (v.trim() ? null : 'Name required') });
        if (n) { ulyOS.audit("Desktop icon '" + ic.name + "' renamed to '" + n.trim() + "'", 'info'); ic.name = n.trim(); Desktop.render(); }
      } },
      { separator: true },
      { label: multi ? 'Delete ' + sel.length + ' icons' : 'Delete', icon: 'trash', danger: true, shortcut: 'Del', action: () => sel.forEach((i) => removeIcon(i)) },
    ];
  }

  function desktopMenu(x, y) {
    const miss = missingDefaults();
    ui.contextMenu(x, y, [
      { label: 'New URL shortcut…', icon: 'plus', action: () => shortcutDialog(null) },
      { label: 'New text document', icon: 'filePlus', action: () => ulyOS.FS.newDocument() },
      { separator: true },
      { label: 'Wallpaper', icon: 'image', submenu: WALLPAPERS.map(([id, label]) => ({
        label: (settings.wallpaper === id ? '✓ ' : '    ') + label,
        action: () => { Settings.set('wallpaper', id); applyWallpaper(); ulyOS.audit("Wallpaper changed to '" + label + "'", 'info'); },
      })).concat([{ separator: true }, { label: 'More in Settings…', icon: 'settings', action: () => SettingsApp.open('appearance') }]) },
      { label: 'Icon size', icon: 'grid', submenu: ['small', 'medium', 'large'].map((s) => ({
        label: (settings.iconSize === s ? '✓ ' : '    ') + s[0].toUpperCase() + s.slice(1),
        action: () => Settings.set('iconSize', s),
      })) },
      { label: 'Auto-arrange icons', icon: 'list', action: autoArrange },
      { label: 'Restore stock icons' + (miss.length ? ' (' + miss.length + ')' : ''), icon: 'refresh', disabled: !miss.length, action: restoreDefaults },
      { separator: true },
      { label: 'Files', icon: 'folder', action: () => SYS_APPS.files.open() },
      { label: 'Task Manager', icon: 'activity', action: () => SYS_APPS.taskmgr.open() },
      { label: 'Settings', icon: 'settings', action: () => SettingsApp.open() },
      { separator: true },
      { label: 'Refresh desktop', icon: 'refresh', action: () => Desktop.render() },
    ]);
  }

  Desktop.init = function () {
    const saved = store.get('ulyos.icons', null);
    Desktop.icons = saved && Array.isArray(saved.list) ? saved.list : DEFAULT_ICONS.map((d) => ({ ...d }));
    const host = $('#desktop');
    host.addEventListener('contextmenu', (e) => {
      if (e.target !== host) return;
      e.preventDefault();
      desktopMenu(e.clientX, e.clientY);
    });
    host.addEventListener('pointerdown', (e) => {
      if (e.target !== host) return;
      ui.closeMenu();
      Desktop.selected.clear(); paintSelection();
      WM.all().forEach((w) => { if (w.focused) { w.focused = false; w.el.classList.remove('focused'); } });
      bus.emit('window:focus', null);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Delete' || !Desktop.selected.size) return;
      if (e.target.closest('input,textarea,select') || WM.focused()) return;
      [...Desktop.selected].map((id) => Desktop.icons.find((i) => i.id === id)).filter(Boolean).forEach((i) => removeIcon(i));
    });
    window.addEventListener('resize', () => { if (Desktop.ready) Desktop.layout(); });
    Desktop.ready = true;
  };

  /* ==========================================================================
     Taskbar + Start menu
     ========================================================================== */
  const Taskbar = {};
  Taskbar.init = function () {
    const tasks = $('#tb-tasks');
    const items = new Map();

    function paintItem(win) {
      const it = items.get(win.id);
      if (!it) return;
      it.classList.toggle('active', win.focused && !win.minimized);
      it.classList.toggle('minimized', win.minimized);
      it.querySelector('.tb-title').textContent = win.title;
    }
    bus.on('window:open', (win) => {
      const it = h('button', {
        class: 'tb-item', dataset: { wid: win.id }, title: win.title,
        onclick: () => {
          if (win.minimized) WM.focus(win);
          else if (win.focused) WM.minimize(win);
          else WM.focus(win);
        },
        onauxclick: (e) => { if (e.button === 1) WM.close(win); },
        oncontextmenu: (e) => { e.preventDefault(); e.stopPropagation(); ui.contextMenu(e.clientX, e.clientY, WM.menuFor(win)); },
      }, h('span', { class: 'tb-ico', html: win.icon }), h('span', { class: 'tb-title', text: win.title }));
      items.set(win.id, it);
      tasks.append(it);
      paintItem(win);
    });
    bus.on('window:close', (win) => { items.get(win.id)?.remove(); items.delete(win.id); });
    ['window:focus', 'window:minimize', 'window:restore', 'window:title'].forEach((ev) =>
      bus.on(ev, () => WM.all().forEach(paintItem)));

    $('#tb-desk').addEventListener('click', () => {
      const anyVisible = WM.all().some((w) => !w.minimized);
      anyVisible ? WM.minimizeAll() : WM.restoreAll();
    });

    // tray: RAM chip + clock
    const ram = $('#tray-ram');
    ram.addEventListener('click', () => ulyOS.Telemetry.open());
    bus.on('telemetry:tick', (s) => {
      ram.querySelector('.v').textContent = Math.round(s.ram) + ' MB';
      const r = clamp(s.ram / s.ramLimit, 0, 1);
      ram.querySelector('i').style.width = r * 100 + '%';
      ram.classList.toggle('warn', r > 0.6); ram.classList.toggle('bad', r > 0.8);
    });
    const clock = $('#tray-clock');
    Taskbar.tickClock = () => {
      const d = new Date();
      clock.innerHTML = '<b>' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + (settings.clockSeconds ? ':' + pad2(d.getSeconds()) : '') +
        '</b><span>' + d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + '</span>';
    };
    Taskbar.tickClock();
    setInterval(Taskbar.tickClock, 1000);

    /* start menu */
    const menu = $('#start-menu'), btn = $('#tb-start');
    const list = $('#sm-list'), search = $('#sm-search');
    const entries = () => {
      const out = Object.entries(SYS_APPS).map(([k, a]) => ({ name: a.name, html: icon(a.icon, 18), run: a.open }));
      DEFAULT_ICONS.filter((d) => d.kind === 'url').forEach((d) => out.push({ name: d.name, html: iconHTML(d, 18), run: () => launch(d) }));
      Desktop.icons.filter((i) => i.kind === 'url' && !DEFAULT_ICONS.some((d) => d.id === i.id)).forEach((i) => out.push({ name: i.name, html: iconHTML(i, 18), run: () => launch(i) }));
      return out;
    };
    const fill = () => {
      const q = search.value.trim().toLowerCase();
      const rows = entries().filter((e) => !q || e.name.toLowerCase().includes(q));
      list.replaceChildren(...(rows.length ? rows.map((e) => h('button', {
        class: 'sm-item', onclick: () => { closeMenu(); e.run(); ulyOS.audit("Launching '" + e.name + "' from start menu", 'info'); },
      }, h('span', { class: 'sm-ico', html: e.html }), h('span', { text: e.name }))) : [h('div', { class: 'fm-empty', text: 'No apps found' })]));
    };
    function openMenu() { menu.hidden = false; btn.classList.add('active'); search.value = ''; fill(); requestAnimationFrame(() => menu.classList.add('open')); search.focus(); }
    function closeMenu() { menu.classList.remove('open'); btn.classList.remove('active'); setTimeout(() => { if (!menu.classList.contains('open')) menu.hidden = true; }, ulyOS.util.dur(180)); }
    btn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.contains('open') ? closeMenu() : openMenu(); });
    search.addEventListener('input', fill);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') list.querySelector('.sm-item')?.click();
      if (e.key === 'Escape') closeMenu();
    });
    document.addEventListener('pointerdown', (e) => { if (menu.classList.contains('open') && !e.target.closest('#start-menu, #tb-start')) closeMenu(); }, true);
    window.addEventListener('blur', () => { if (menu.classList.contains('open')) closeMenu(); });
    $('#sm-fullscreen').addEventListener('click', () => {
      closeMenu();
      document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
    });
    $('#sm-restart').addEventListener('click', () => { closeMenu(); restart(); });
  };

  /* ==========================================================================
     Boot sequence
     ========================================================================== */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let booting = false;

  async function boot(first) {
    if (booting) return;
    booting = true;
    const el = $('#boot'), logEl = $('#boot-log'), bar = $('#boot-bar i');
    const full = settings.bootAnim && settings.animations;
    let skip = !full;
    const skipper = () => { skip = true; };
    el.classList.remove('done'); el.hidden = false; logEl.replaceChildren(); bar.style.width = '0';
    document.body.classList.add('booting');
    document.addEventListener('keydown', skipper, { once: true });
    el.addEventListener('pointerdown', skipper, { once: true });
    const t0 = performance.now();
    ulyOS.audit(first ? 'ulyOS cold boot' : 'ulyOS warm restart', 'sys');

    const steps = [
      ['Initializing kernel shim', async () => { await sleep(120); }],
      ['Mounting virtual filesystem (OPFS)', async () => {
        const ok = await ulyOS.FS.init();
        if (!ok) throw new Error('sandbox unavailable — serve over http://localhost');
      }],
      ['Starting window manager', async () => { await sleep(90); }],
      ['Starting telemetry daemon', async () => { await sleep(90); }],
      ['Restoring wallpaper & theme', async () => { await applyWallpaper(); }],
      ['Loading desktop shell', async () => { Desktop.render(first); }],
    ];
    for (let i = 0; i < steps.length; i++) {
      const [label, fn] = steps[i];
      const line = h('div', { class: 'bl' }, h('span', { class: 'st', text: '····' }), h('span', { text: label }));
      logEl.append(line);
      bar.style.width = ((i + 0.5) / steps.length) * 100 + '%';
      let err = null;
      try { await fn(); } catch (e) { err = e; }
      if (!skip) await sleep(200 + Math.random() * 130);
      line.querySelector('.st').textContent = err ? 'WARN' : ' OK ';
      line.classList.add(err ? 'warn' : 'ok');
      if (err) { line.append(h('span', { class: 'bl-err', text: ' — ' + err.message })); ulyOS.audit('Boot: ' + label + ' failed: ' + err.message, 'err'); }
      else ulyOS.audit('Boot: ' + label + ' … ok', 'sys');
      bar.style.width = ((i + 1) / steps.length) * 100 + '%';
    }
    if (!skip) await sleep(350);
    el.classList.add('done');
    document.body.classList.remove('booting');
    ulyOS.audit('System boot complete in ' + Math.round(performance.now() - t0) + 'ms', 'ok');
    setTimeout(() => { el.hidden = true; booting = false; }, full ? 800 : 250);
    if (first && !store.get('ulyos.welcomed', false)) {
      store.set('ulyos.welcomed', true);
      setTimeout(() => ui.toast('Tip: right-click the desktop to add URL shortcuts or delete icons.', { timeout: 6000 }), 1200);
    }
  }

  async function restart() {
    ulyOS.audit('Restart requested — closing all windows', 'warn');
    for (const w of WM.all()) await WM.close(w, { force: true });
    await boot(false);
  }

  /* ==========================================================================
     Settings app
     ========================================================================== */
  const SettingsApp = {};
  SettingsApp.open = function (tab) {
    const existing = WM.byApp('settings')[0];
    if (existing) { WM.focus(existing); if (tab && existing.showTab) existing.showTab(tab); return existing; }
    return WM.open({
      appId: 'settings', title: 'Settings', icon: icon('settings', 16), width: 780, height: 560, minWidth: 560, minHeight: 360, mem: 14,
      render: (win) => buildSettings(win, tab || 'appearance'),
    });
  };

  function buildSettings(win, startTab) {
    const sw = (key, after) => h('label', { class: 'switch' },
      h('input', { type: 'checkbox', checked: !!settings[key], onchange: (e) => { Settings.set(key, e.target.checked); after?.(); ulyOS.audit('Setting ' + key + ' → ' + (e.target.checked ? 'on' : 'off'), 'info'); } }), h('i'));
    const range = (key, min, max, step, fmt) => {
      const out = h('span', { class: 'mono range-v', text: fmt(settings[key]) });
      const input = h('input', { type: 'range', min, max, step, value: settings[key], oninput: (e) => { const v = +e.target.value; out.textContent = fmt(v); Settings.set(key, v); } });
      return h('div', { class: 'range' }, input, out);
    };
    const row = (label, desc, ctl) => h('div', { class: 'set-row' }, h('div', {}, h('div', { class: 'set-label', text: label }), desc ? h('div', { class: 'set-desc', text: desc }) : null), ctl);

    /* wallpaper tiles */
    const tiles = h('div', { class: 'wp-list' });
    const paintTiles = () => {
      tiles.replaceChildren(...WALLPAPERS.map(([id, label]) => h('button', {
        class: 'wp-tile' + (settings.wallpaper === id ? ' active' : ''), title: label,
        onclick: () => { Settings.set('wallpaper', id); applyWallpaper(); paintTiles(); ulyOS.audit("Wallpaper changed to '" + label + "'", 'info'); },
      }, h('div', { class: 'wp-thumb wp-' + id }), h('span', { text: label }))));
    };
    paintTiles();
    const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const name = 'Wallpapers/' + Date.now().toString(36) + '-' + f.name.replace(/[^\w.-]+/g, '_');
        await ulyOS.FS.writeSandboxFile(name, f);
        Settings.set('wallpaperCustom', 'opfs:' + name); Settings.set('wallpaper', 'custom');
        await applyWallpaper(); paintTiles();
        ulyOS.audit("Custom wallpaper '" + f.name + "' (" + fmtBytes(f.size) + ') applied', 'ok');
      } catch (err) { ui.toast('Could not import image: ' + err.message, { type: 'err' }); }
    } });
    const urlIn = h('input', { class: 'input', placeholder: 'https://…/image.jpg', value: settings.wallpaper === 'custom' && !settings.wallpaperCustom.startsWith('opfs:') ? settings.wallpaperCustom : '' });
    const colorIn = h('input', { type: 'color', value: settings.wallpaperColor, oninput: (e) => { Settings.set('wallpaperColor', e.target.value); Settings.set('wallpaper', 'solid'); applyWallpaper(); paintTiles(); } });
    const swatches = h('div', { class: 'swatches' });
    const paintSw = () => swatches.replaceChildren(...['#8fa3ff', '#5eead4', '#fbbf24', '#fb7185', '#a78bfa', '#e5e5e5'].map((c) => h('button', {
      class: 'swatch' + (settings.accent === c ? ' active' : ''), style: { background: c }, 'aria-label': 'Accent ' + c,
      onclick: () => { Settings.set('accent', c); paintSw(); ulyOS.audit('Accent color changed to ' + c, 'info'); },
    })));
    paintSw();

    const seg = (key, opts) => {
      const w = h('div', { class: 'seg' });
      const paint = () => w.replaceChildren(...opts.map((o) => h('button', { class: settings[key] === o ? 'active' : '', text: o[0].toUpperCase() + o.slice(1), onclick: () => { Settings.set(key, o); paint(); } })));
      paint(); return w;
    };

    const storageEl = h('span', { class: 'mono', text: '…' });
    navigator.storage?.estimate?.().then((e) => { storageEl.textContent = fmtBytes(e.usage) + ' of ' + fmtBytes(e.quota); }).catch(() => { storageEl.textContent = 'n/a'; });

    const sections = {
      appearance: h('div', {},
        h('h3', { text: 'Wallpaper' }), tiles,
        row('Solid color', 'Pick any flat background color', colorIn),
        row('Image from your computer', 'Stored in the sandbox filesystem (Wallpapers/)', h('button', { class: 'btn sm', html: icon('upload', 14) + ' Choose image…', onclick: () => fileIn.click() })),
        row('Image from URL', null, h('div', { class: 'inline-form' }, urlIn, h('button', { class: 'btn sm', text: 'Apply', onclick: () => {
          const u = normalizeUrl(urlIn.value);
          if (!u) { ui.toast('Enter a valid image URL', { type: 'err' }); return; }
          Settings.set('wallpaperCustom', u); Settings.set('wallpaper', 'custom'); applyWallpaper(); paintTiles();
          ulyOS.audit('Wallpaper set from ' + hostName(u), 'info');
        } }))),
        h('h3', { text: 'Accent color' }), swatches, fileIn),
      effects: h('div', {},
        h('h3', { text: 'Animations' }),
        row('UI animations', 'Window open/close/minimize, boot sequence, animated wallpapers', sw('animations')),
        row('Animation speed', 'Slower ← → faster', range('animSpeed', 0.5, 2, 0.25, (v) => v + '×')),
        row('Boot animation', 'Show the full boot log on restart', sw('bootAnim')),
        h('h3', { text: 'Glass' }),
        row('Blur strength', 'Backdrop blur behind windows and the taskbar', range('blur', 0, 40, 2, (v) => v + 'px')),
        row('Window opacity', 'Lower values reveal more of the wallpaper', range('glassAlpha', 0.4, 0.98, 0.02, (v) => Math.round(v * 100) + '%')),
        h('h3', { text: 'Pointer' }),
        row('Custom cursor', 'SVG cursor with a trailing ring (not shown inside embedded apps)', sw('cursor'))),
      desktop: h('div', {},
        h('h3', { text: 'Icons' }),
        row('Icon size', null, seg('iconSize', ['small', 'medium', 'large'])),
        row('Fetch website favicons', 'Custom shortcuts request a favicon from Google’s favicon service', sw('favicons', () => Desktop.render())),
        row('Auto-arrange', 'Pack icons into the grid from the top-left', h('button', { class: 'btn sm', text: 'Arrange now', onclick: autoArrange })),
        row('Restore stock icons', 'Bring back deleted default icons', h('button', { class: 'btn sm', text: 'Restore', onclick: () => { missingDefaults().length ? restoreDefaults() : ui.toast('All stock icons are already on the desktop'); } })),
        h('h3', { text: 'Taskbar' }),
        row('Show seconds in clock', null, sw('clockSeconds'))),
      system: h('div', {},
        h('h3', { text: 'Storage' }),
        row('Sandbox usage', 'Origin-private storage for this site', storageEl),
        row('Open Task Manager', 'Live RAM / CPU simulation and the audit trail', h('button', { class: 'btn sm', text: 'Open', onclick: () => ulyOS.Telemetry.open() })),
        h('h3', { text: 'Maintenance' }),
        row('Reset settings', 'Restore appearance and behaviour defaults', h('button', { class: 'btn sm', text: 'Reset', onclick: async () => {
          if (await ui.confirm({ title: 'Reset settings?', message: 'Appearance and behaviour return to defaults. Files are not touched.', okText: 'Reset' })) { Settings.reset(); ulyOS.audit('Settings reset to defaults', 'warn'); show('appearance'); paintTiles(); paintSw(); }
        } })),
        row('Restart ulyOS', 'Close all windows and replay the boot sequence', h('button', { class: 'btn sm', text: 'Restart', onclick: restart })),
        h('h3', { text: 'About' }),
        h('div', { class: 'about mono' },
          h('div', { text: 'ulyOS 1.0 · vanilla HTML/CSS/JS' }),
          h('div', { text: 'Secure context: ' + window.isSecureContext }),
          h('div', { text: 'OPFS: ' + (ulyOS.FS.roots.sandbox.handle ? 'ready' : 'unavailable') }),
          h('div', { text: 'Directory picker: ' + (window.showDirectoryPicker ? 'supported' : 'unsupported') }))),
    };
    const navDefs = [['appearance', 'palette', 'Appearance'], ['effects', 'sliders', 'Effects'], ['desktop', 'desktop', 'Desktop'], ['system', 'cpu', 'System']];
    const navBtns = {};
    const content = h('div', { class: 'set-content' });
    function show(id) {
      Object.entries(navBtns).forEach(([k, b]) => b.classList.toggle('active', k === id));
      content.replaceChildren(sections[id]); content.scrollTop = 0;
    }
    win.showTab = show;
    const nav = h('nav', { class: 'set-nav' }, navDefs.map(([id, ico, label]) => (navBtns[id] = h('button', { class: 'place', html: icon(ico, 16) + '<span>' + label + '</span>', onclick: () => show(id) }))));
    show(startTab);
    return h('div', { class: 'settings' }, nav, content);
  }

  /* ==========================================================================
     Start-up
     ========================================================================== */
  function init() {
    applySettings();
    Cursor.init();
    Desktop.init();
    Taskbar.init();
    bus.on('fs:change', () => { /* hook for future desktop-backed folders */ });
    boot(true);
  }
  ulyOS.restart = restart;
  ulyOS.launch = launch;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
