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
    wallpaper: 'land:forest', wallpaperColor: '#07080c', wallpaperCustom: '',
    accent: '#8fa3ff', animations: true, animSpeed: 1, blur: 24, glassAlpha: 0.72,
    cursor: true, bootAnim: true, iconSize: 'medium', favicons: true, clockSeconds: true, clockFormat: '12', widgetsVisible: true, clockStyle: 'digital', clockDate: 'short', clockFont: 'inherit', clockSize: 13, clockWeight: 500, clockColor: 'text', clockLayout: 'row', clockAmPm: true,
    cursorStyle: 'neon', cursorSize: 100, welcomeAlways: false, theme: 'dark', richIcons: true, widgetTheme: 'auto', cursorColor: '', fontFamily: 'system', fontSize: 13, fontWeight: 400, fontStyle: 'normal', widgetStyle: 'vivid', animStyle: 'scale', iconStyle: 'vivid', shuffleOnLogin: false,
    // Telemetry FX (Settings → Effects)
    fxAurora: 65, fxTilt: 0, fxAnim: true, fxGlow: 55, iconScale: 100, fxScan: false, depth: 50, sfx: true, sfxVolume: 35,
    // memory hygiene (Settings → Security)
    clipClear: 30, purgeIdle: 120, purgeOnHide: true,
    // taskbar / dock / menu bar (see js/shell.js)
    taskbarMode: 'bar', taskbarPos: 'bottom', taskbarSize: 60, taskbarAutoHide: false, taskbarMagnify: true, taskbarLabels: true,
    showRam: true, showClock: true, menubar: true, menubarStyle: 'glass', pinned: ['settings', 'beam', 'files', 'taskmgr'],
  };
  let settings = { ...DEFAULT_SETTINGS };   // replaced with the profile's saved settings on sign-in
  const Settings = (ulyOS.settings = {
    get: (k) => settings[k],
    all: () => ({ ...settings }),
    set(k, v) {
      settings[k] = v; store.set('ulyos.settings', settings);
      applySettings(k);
      bus.emit('settings:change', { key: k, value: v });
    },
    patch(obj) { Object.assign(settings, obj); store.set('ulyos.settings', settings); applySettings(); bus.emit('settings:change', { key: '*', value: obj }); },
    reset() { settings = { ...DEFAULT_SETTINGS }; eff = {}; store.set('ulyos.settings', settings); applySettings(); applyWallpaper(); },
  });

  const ICON_SIZES = { small: { cw: 88, ch: 96, tile: 44 }, medium: { cw: 100, ch: 110, tile: 52 }, large: { cw: 116, ch: 128, tile: 64 } };
  const WALLPAPERS = [
    ['void', 'Void'], ['aurora', 'Aurora'], ['grid', 'Grid'], ['ocean', 'Deep Ocean'], ['ember', 'Ember'], ['mono', 'Graphite'],
    ['sunset', 'Sunset'], ['forest', 'Forest'], ['nebula', 'Nebula'], ['midnight', 'Midnight'], ['rose', 'Rose'], ['carbon', 'Carbon'], ['lagoon', 'Lagoon'], ['dusk', 'Dusk'],
  ];
  const CURSOR_STYLES = [['classic', 'Classic arrow'], ['dot', 'Dot'], ['cross', 'Crosshair'], ['neon', 'Neon arrow'], ['ring', 'Ring'], ['solid', 'Solid arrow'], ['target', 'Target'], ['system', 'System default']];
  const FONTS = [['system', 'Inter / System UI'], ['rounded', 'Rounded'], ['humanist', 'Humanist (Segoe / Gill)'], ['serif', 'Serif (Georgia)'], ['mono', 'Monospace'], ['slab', 'Typewriter / Slab'], ['casual', 'Casual (Comic)'], ['condensed', 'Condensed']];
  const FONT_STACKS = {
    system: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    rounded: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Quicksand, Nunito, "Segoe UI", system-ui, sans-serif',
    humanist: '"Gill Sans", "Gill Sans MT", Calibri, "Segoe UI", Candara, Optima, sans-serif',
    serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, Cambria, "Times New Roman", serif',
    mono: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace',
    slab: '"Rockwell", "Courier New", Courier, "American Typewriter", serif',
    casual: '"Comic Sans MS", "Comic Neue", "Chalkboard SE", "Marker Felt", cursive',
    condensed: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue Condensed", "Segoe UI Semibold", sans-serif',
  };
  const ANIM_STYLES = [['scale', 'Scale'], ['slide', 'Slide up'], ['fade', 'Fade'], ['zoom', 'Zoom'], ['bounce', 'Bounce'], ['blur', 'Blur in']];
  const ICON_STYLES = [['vivid', 'Colorful & animated'], ['glass', 'Glass'], ['flat', 'Flat'], ['outline', 'Outline'], ['circle', 'Circle'], ['neon', 'Neon'], ['gradient', 'Gradient']];
  const LANDS = ulyOS.landscapes ? ulyOS.landscapes.list : [];
  const POOLS = { wallpaper: [...WALLPAPERS.map((w) => w[0]), ...LANDS.map((l) => 'land:' + l[0])], cursorStyle: ['classic', 'dot', 'cross', 'neon', 'ring', 'solid', 'target'], iconStyle: ICON_STYLES.map((i) => i[0]) };
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const wpName = (id) => (id.startsWith('photo:') ? ((ulyOS.landscapes.photos.find((p) => 'photo:' + p.key === id) || {}).label || id) : id.startsWith('land:') ? (LANDS.find((l) => l[0] === id.slice(5)) || [0, id])[1] : (WALLPAPERS.find((w) => w[0] === id) || [0, id])[1]);
  /* "random" settings resolve to one concrete pick that stays stable for the whole session */
  let eff = {};
  const val = (k) => (settings[k] === 'random' ? (eff[k] || (eff[k] = rnd(POOLS[k]))) : settings[k]);
  function hslHex(h2, sat, lig) {
    const a = (sat / 100) * Math.min(lig / 100, 1 - lig / 100);
    const f = (n) => { const k = (n + h2 / 30) % 12; const c = lig / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, '0'); };
    return '#' + f(0) + f(8) + f(4);
  }
  /** Randomise look & feel in one go (wallpaper, accent, cursor, icons, animations). */
  function surprise(announce = true) {
    const pick = {
      wallpaper: rnd(POOLS.wallpaper), accent: hslHex(Math.floor(Math.random() * 360), 78, 68),
      cursorStyle: rnd(POOLS.cursorStyle), iconStyle: rnd(POOLS.iconStyle), animStyle: rnd(ANIM_STYLES.map((a) => a[0])),
    };
    eff = {};
    Settings.patch(pick);
    applyWallpaper();
    ulyOS.audit('Surprise me: wallpaper ' + pick.wallpaper + ', cursor ' + pick.cursorStyle + ', icons ' + pick.iconStyle + ', animation ' + pick.animStyle + ', accent ' + pick.accent, 'info');
    if (announce) ui.toast('🎲 ' + wpName(pick.wallpaper) + ' · ' + pick.cursorStyle + ' cursor · ' + pick.iconStyle + ' icons · ' + pick.animStyle + ' windows', { timeout: 4200 });
  }

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex) || [0, '8fa3ff'];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const resolveTheme = () => (settings.theme === 'light' ? 'light' : settings.theme === 'auto' ? (darkQuery && !darkQuery.matches ? 'light' : 'dark') : 'dark');
  function applyTheme() {
    const signedIn = !!(ulyOS.security && ulyOS.security.profileId && ulyOS.security.profileId());
    let t;
    if (signedIn) { t = resolveTheme(); try { localStorage.setItem('ulyos.theme', t); } catch { /* ignore */ } }
    else { try { t = localStorage.getItem('ulyos.theme') === 'light' ? 'light' : 'dark'; } catch { t = 'dark'; } }   // profile screen: last used theme
    root.dataset.theme = t;
    const b = document.getElementById('tray-theme');
    if (b) { b.innerHTML = icon(t === 'light' ? 'moon' : 'sun', 16); b.title = t === 'light' ? 'Switch to dark theme' : 'Switch to light theme'; }
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = t === 'light' ? '#dfe3ee' : '#000000';
  }
  darkQuery?.addEventListener?.('change', () => { if (settings.theme === 'auto') applyTheme(); });
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#tray-theme')) { Settings.set('theme', resolveTheme() === 'light' ? 'dark' : 'light'); } });
  function applySettings() {
    const s = settings;
    root.style.setProperty('--accent', s.accent);
    root.style.setProperty('--accent-rgb', hexToRgb(s.accent).join(','));
    root.style.setProperty('--blur', s.blur + 'px');
    root.style.setProperty('--glass-alpha', s.glassAlpha);
    root.style.setProperty('--speed', s.animSpeed);
    root.style.setProperty('--font', FONT_STACKS[s.fontFamily] || FONT_STACKS.system);
    root.style.setProperty('--clock-font', s.clockFont && s.clockFont !== 'inherit' && FONT_STACKS[s.clockFont] ? FONT_STACKS[s.clockFont] : 'var(--font)');
    root.style.setProperty('--clock-size', clamp(+s.clockSize || 13, 10, 26) + 'px');
    root.style.setProperty('--clock-fw', String([400, 500, 700].includes(+s.clockWeight) ? +s.clockWeight : 500));
    root.style.setProperty('--fscale', (clamp(+s.fontSize || 13, 10, 22) / 13).toFixed(5));
    root.style.setProperty('--fw', String([300, 400, 500, 600, 700].includes(+s.fontWeight) ? +s.fontWeight : 400));
    root.style.setProperty('--fstyle', s.fontStyle === 'italic' ? 'italic' : 'normal');
    document.body.dataset.widgets = s.widgetStyle === 'glass' ? 'glass' : 'vivid';
    applyTheme();
    if (applySettings._rich !== s.richIcons) { const first = applySettings._rich === undefined; applySettings._rich = s.richIcons; if (!first && Desktop.ready) setTimeout(() => { Desktop.render(); ulyOS.Shell?.layout?.(); }, 0); }
    document.body.classList.toggle('no-anim', !s.animations);
    document.body.classList.toggle('no-blur', s.blur === 0);
    root.style.setProperty('--fx-aurora', (s.fxAurora / 100).toFixed(2));
    root.style.setProperty('--glow', (s.fxGlow / 100).toFixed(2));
    root.style.setProperty('--depth', (s.depth / 50).toFixed(2));
    document.body.classList.toggle('no-fx', !s.fxAnim);
    document.body.classList.toggle('scanlines', !!s.fxScan);
    if (ulyOS.fx) ulyOS.fx.setTilt(s.fxTilt);
    Cursor.apply();
    document.body.dataset.icons = val('iconStyle') || 'glass';
    document.body.dataset.rich = s.richIcons === false ? '0' : '1';
    ulyOS.anim.mode = s.animStyle || 'scale';
    const sz = ICON_SIZES[window.innerWidth < 520 ? 'small' : s.iconSize] || ICON_SIZES.medium;   // phones always use the compact grid
    const k = clamp((s.iconScale || 100) / 100, 0.5, 1.6);
    root.style.setProperty('--cell-w', Math.round(sz.cw * k) + 'px');
    root.style.setProperty('--cell-h', Math.round(sz.ch * k) + 'px');
    root.style.setProperty('--tile', Math.round(sz.tile * k) + 'px');
    ulyOS.Widgets?.applyVisibility?.();
    ulyOS.Shell?.layout?.();   // first: it changes the usable area the icon grid is measured against
    if (Desktop.ready) Desktop.layout();
    ulyOS.Shell?.tickClock?.();
  }

  let wpUrl = null;
  async function applyWallpaper() {
    const wp = $('#wallpaper');
    wp.removeAttribute('style');
    const wpv = val('wallpaper');
    if (wpv.startsWith('land:')) {   // procedurally drawn nature landscape
      wp.className = 'wp-landscape';
      const u = ulyOS.landscapes && ulyOS.landscapes.url(wpv.slice(5));
      if (u) wp.style.backgroundImage = 'url("' + u + '")';
      return;
    }
    if (wpv.startsWith('photo:') && ulyOS.landscapes && ulyOS.landscapes.photoUrl) {   // a photograph, fetched on demand from Wikimedia Commons
      wp.className = 'wp-landscape';
      const px = Math.min(3840, (window.screen.width || 1920) * (window.devicePixelRatio || 1)), w = [1280, 1920, 2560, 3840].find((x) => x >= px) || 3840;
      const u = ulyOS.landscapes.photoUrl(wpv.slice(6), w);
      if (u) wp.style.backgroundImage = 'url("' + u + '")';
      return;
    }
    wp.className = 'wp-' + wpv;
    if (wpv === 'solid') wp.style.background = settings.wallpaperColor;
    if (wpv === 'custom') {
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
      const style = val('cursorStyle') || 'classic';
      const on = settings.cursor && style !== 'system';
      document.body.classList.toggle('no-cursor', !on);
      const ac = /^#[0-9a-f]{6}$/i.test(settings.cursorColor) ? settings.cursorColor : settings.accent;
      const fc = /^#[0-9a-f]{6}$/i.test(settings.cursorColor) ? settings.cursorColor : '#fff';
      root.style.setProperty('--ring-c', ac);
      const scale = clamp((+settings.cursorSize || 100) / 100, 0.5, 3);
      const px = Math.min(96, Math.round(28 * scale)), kk = px / 28;
      root.style.setProperty('--ring-scale', scale.toFixed(2));
      const svg = (body, hx, hy, fb) => 'url("data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px + '" viewBox="0 0 28 28">' + body + '</svg>') + '") ' + Math.round(hx * kk) + ' ' + Math.round(hy * kk) + ', ' + fb;
      const ARROW = 'M6 4l15 8.2-6.6 1.9-2.9 6.4z';
      const SETS = {
        classic: [svg('<path d="' + ARROW + '" fill="' + fc + '" stroke="#000" stroke-opacity=".85" stroke-width="1.3" stroke-linejoin="round"/>', 6, 4, 'default'),
          svg('<circle cx="14" cy="14" r="7" fill="rgba(255,255,255,.14)" stroke="#fff" stroke-width="1.4"/><circle cx="14" cy="14" r="2" fill="' + fc + '"/>', 14, 14, 'pointer')],
        dot: [svg('<circle cx="14" cy="14" r="4.2" fill="' + fc + '" stroke="#000" stroke-opacity=".75" stroke-width="1.3"/>', 14, 14, 'default'),
          svg('<circle cx="14" cy="14" r="8" fill="none" stroke="' + ac + '" stroke-width="1.8"/><circle cx="14" cy="14" r="2.6" fill="' + ac + '"/>', 14, 14, 'pointer')],
        cross: [svg('<path d="M14 3v22M3 14h22" stroke="#000" stroke-opacity=".7" stroke-width="3.2"/><path d="M14 3v22M3 14h22" stroke="#fff" stroke-width="1.3"/>', 14, 14, 'crosshair'),
          svg('<circle cx="14" cy="14" r="6" fill="none" stroke="' + ac + '" stroke-width="1.6"/><path d="M14 2v6M14 20v6M2 14h6M20 14h6" stroke="' + ac + '" stroke-width="1.6"/>', 14, 14, 'pointer')],
        neon: [svg('<path d="' + ARROW + '" fill="rgba(0,0,0,.55)" stroke="' + ac + '" stroke-opacity=".35" stroke-width="4.5" stroke-linejoin="round"/><path d="' + ARROW + '" fill="rgba(0,0,0,.4)" stroke="' + ac + '" stroke-width="1.6" stroke-linejoin="round"/>', 6, 4, 'default'),
          svg('<circle cx="14" cy="14" r="8" fill="' + ac + '" fill-opacity=".18" stroke="' + ac + '" stroke-opacity=".4" stroke-width="4"/><circle cx="14" cy="14" r="8" fill="none" stroke="' + ac + '" stroke-width="1.6"/>', 14, 14, 'pointer')],
        solid: [svg('<path d="' + ARROW + '" fill="' + ac + '" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>', 6, 4, 'default'),
          svg('<path d="' + ARROW + '" fill="' + ac + '" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="21" cy="21" r="4" fill="#fff" stroke="' + ac + '" stroke-width="1.6"/>', 6, 4, 'pointer')],
        target: [svg('<circle cx="14" cy="14" r="8.5" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="3.4"/><circle cx="14" cy="14" r="8.5" fill="none" stroke="' + ac + '" stroke-width="1.8"/><path d="M14 2.5v6M14 19.5v6M2.5 14h6M19.5 14h6" stroke="' + ac + '" stroke-width="1.8"/><circle cx="14" cy="14" r="1.6" fill="' + ac + '"/>', 14, 14, 'default'),
          svg('<circle cx="14" cy="14" r="8.5" fill="' + ac + '" fill-opacity=".3" stroke="' + ac + '" stroke-width="2"/><circle cx="14" cy="14" r="2.4" fill="#fff"/>', 14, 14, 'pointer')],
        ring: [svg('<circle cx="14" cy="14" r="7" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="3.2"/><circle cx="14" cy="14" r="7" fill="none" stroke="#fff" stroke-width="1.5"/>', 14, 14, 'default'),
          svg('<circle cx="14" cy="14" r="7" fill="' + ac + '" stroke="#fff" stroke-width="1.5"/>', 14, 14, 'pointer')],
      };
      const set = SETS[style];
      if (on && set) {
        root.style.setProperty('--cur-default', set[0]);
        root.style.setProperty('--cur-pointer', set[1]);
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
  /** Convert share links to embeddable players (Spotify, YouTube, Vimeo). */
  function embedUrl(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
      if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
        let id = null;
        if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
        else if (u.pathname === '/watch') id = u.searchParams.get('v');
        else if (/^\/(shorts|live)\//.test(u.pathname)) id = u.pathname.split('/')[2];
        if (id && /^[\w-]{6,}$/.test(id)) return 'https://www.youtube.com/embed/' + id + '?rel=0';
        if (u.pathname === '/playlist' && u.searchParams.get('list')) return 'https://www.youtube.com/embed/videoseries?list=' + encodeURIComponent(u.searchParams.get('list'));
      }
      if (host === 'vimeo.com' && /^\/\d+/.test(u.pathname)) return 'https://player.vimeo.com/video/' + u.pathname.split('/')[1];
      if (u.hostname === 'open.spotify.com' && !u.pathname.startsWith('/embed')) {
        const m = u.pathname.match(/^\/(?:intl-[a-z]+\/)?(track|album|playlist|artist|show|episode)\/([A-Za-z0-9]+)/);
        if (m) return 'https://open.spotify.com/embed/' + m[1] + '/' + m[2] + '?utm_source=generator&theme=0';
      }
    } catch { /* ignore */ }
    return url;
  }
  /** Well-known sites that send X-Frame-Options / CSP frame-ancestors and cannot be shown in a window. */
  const NO_EMBED = ['youtube.com', 'google.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'linkedin.com', 'github.com', 'netflix.com', 'amazon.com',
    'reddit.com', 'whatsapp.com', 'tiktok.com', 'discord.com', 'chatgpt.com', 'openai.com', 'claude.ai', 'anthropic.com', 'paypal.com', 'apple.com', 'microsoft.com',
    'live.com', 'outlook.com', 'office.com', 'bing.com', 'duckduckgo.com', 'twitch.tv', 'pinterest.com', 'dropbox.com', 'zoom.us', 'slack.com', 'notion.so',
    'coinbase.com', 'robinhood.com', 'uphold.com', 'binance.com', 'kraken.com', 'ebay.com', 'yahoo.com', 'cnn.com', 'nytimes.com'];
  function blocksEmbedding(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      if ((host === 'youtube.com' || host === 'youtube-nocookie.com') && u.pathname.startsWith('/embed')) return false;
      return NO_EMBED.some((d) => host === d || host.endsWith('.' + d));
    } catch { return false; }
  }
  const hostName = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  const hueOf = (s) => { let n = 0; for (const c of s) n = (n * 31 + c.charCodeAt(0)) % 360; return n; };

  /* Brand-style gradients + animated artwork for the colorful icon style */
  const GRADS = {
    files: ['#4aa8ff', '#1d4ed8'], polotno: ['#b06cff', '#5b5bf0'], getartcraft: ['#ffb020', '#ef4444'], youtube: ['#ff4b4b', '#b91c1c'],
    xrp: ['#22d3ee', '#2563eb'], outlook: ['#3aa0ff', '#0b5bc4'], qrseal: ['#a78bfa', '#ec4899'], systemvault: ['#fb7185', '#9f1239'],
    cryptocompass: ['#fbbf24', '#d97706'], taskmgr: ['#34d399', '#047857'], settings: ['#94a3b8', '#475569'], trustvault: ['#5eead4', '#0f766e'],
  };
  function gradientOf(rec) {
    if (GRADS[rec.id]) return GRADS[rec.id];
    const hh = hueOf(hostName(rec.url || rec.name || 'x'));
    return ['hsl(' + hh + ' 78% 60%)', 'hsl(' + ((hh + 35) % 360) + ' 80% 42%)'];
  }
  const ART = {
    files: '<svg viewBox="0 0 48 48"><path d="M6 14a4 4 0 0 1 4-4h9l4 4h15a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="#fff" fill-opacity=".55"/><path class="a-front" d="M6 21a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4v15a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="#fff"/></svg>',
    settings: '<svg viewBox="0 0 48 48"><g class="a-gear"><circle cx="24" cy="24" r="14" fill="none" stroke="#fff" stroke-width="5.5" stroke-dasharray="3.6 3.66"/><circle cx="24" cy="24" r="10.5" fill="#fff"/></g><circle cx="24" cy="24" r="4.6" style="fill:var(--g2)"/></svg>',
    taskmgr: '<svg viewBox="0 0 48 48"><rect x="5" y="9" width="38" height="30" rx="6" fill="#fff" fill-opacity=".22"/><path d="M8 27h8l4-11 6 20 5-14 3 5h6" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path class="a-pulse" d="M8 27h8l4-11 6 20 5-14 3 5h6" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" pathLength="100"/></svg>',
    youtube: '<svg viewBox="0 0 48 48"><rect x="5" y="11" width="38" height="26" rx="8" fill="#fff"/><path class="a-play" d="M20 18v12l11-6z" style="fill:var(--g1)"/></svg>',
    xrp: '<svg viewBox="0 0 48 48"><rect x="7" y="28" width="6" height="12" rx="2" fill="#fff" fill-opacity=".45"/><rect x="17" y="22" width="6" height="18" rx="2" fill="#fff" fill-opacity=".6"/><rect x="27" y="26" width="6" height="14" rx="2" fill="#fff" fill-opacity=".45"/><path class="a-trend" d="M6 30l11-9 8 6 14-15" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" pathLength="100"/><path d="M31 12h8v8" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    outlook: '<svg viewBox="0 0 48 48"><rect x="6" y="12" width="36" height="26" rx="5" fill="#fff"/><path class="a-flap" d="M9 16.5l15 11.5 15-11.5" fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" style="stroke:var(--g2)"/></svg>',
    qrseal: '<svg viewBox="0 0 48 48"><rect x="7" y="7" width="14" height="14" rx="3" fill="#fff"/><rect x="27" y="7" width="14" height="14" rx="3" fill="#fff"/><rect x="7" y="27" width="14" height="14" rx="3" fill="#fff"/><rect x="11" y="11" width="6" height="6" rx="1.5" style="fill:var(--g2)"/><rect x="31" y="11" width="6" height="6" rx="1.5" style="fill:var(--g2)"/><rect x="11" y="31" width="6" height="6" rx="1.5" style="fill:var(--g2)"/><rect class="a-dot d1" x="27" y="27" width="6" height="6" rx="1.5" fill="#fff"/><rect class="a-dot d2" x="35" y="27" width="6" height="6" rx="1.5" fill="#fff"/><rect class="a-dot d3" x="27" y="35" width="6" height="6" rx="1.5" fill="#fff"/><rect class="a-dot d4" x="35" y="35" width="6" height="6" rx="1.5" fill="#fff"/><rect class="a-scan" x="4" y="6" width="40" height="2.6" rx="1.3" fill="#fff"/></svg>',
    systemvault: '<svg viewBox="0 0 48 48"><g class="a-key"><circle cx="17" cy="31" r="8.5" fill="none" stroke="#fff" stroke-width="5"/><path d="M23.5 24.5L40 8M33 15l5.5 5.5M28 20l4.5 4.5" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/></g></svg>',
    cryptocompass: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" fill="none" stroke="#fff" stroke-width="3.6"/><g class="a-needle"><path d="M24 9l6.5 15h-13z" fill="#fff"/><path d="M24 39l-6.5-15h13z" fill="#fff" fill-opacity=".5"/></g><circle cx="24" cy="24" r="2.6" style="fill:var(--g2)"/></svg>',
    polotno: '<svg viewBox="0 0 48 48"><rect class="a-f1" x="6" y="6" width="17" height="17" rx="4.5" fill="#fff"/><circle class="a-f2" cx="34" cy="15" r="9" fill="#fff" fill-opacity=".8"/><path class="a-f3" d="M23.5 42l9.5-16 9.5 16z" fill="#fff" fill-opacity=".92"/><rect x="6" y="28" width="12" height="12" rx="3" fill="#fff" fill-opacity=".4"/></svg>',
    getartcraft: '<svg viewBox="0 0 48 48"><path class="a-s1" d="M22 5l3.6 10.4L36 19l-10.4 3.6L22 33l-3.6-10.4L8 19l10.4-3.6z" fill="#fff"/><path class="a-s2" d="M37 28l1.8 5.2L44 35l-5.2 1.8L37 42l-1.8-5.2L30 35l5.2-1.8z" fill="#fff" fill-opacity=".85"/><path class="a-s3" d="M11 33l1.2 3.4 3.4 1.2-3.4 1.2L11 42l-1.2-3.2L6.4 37.6l3.4-1.2z" fill="#fff" fill-opacity=".7"/></svg>',
  };

  const SYS_APPS = {
    files: { name: 'Files', icon: 'folder', open: () => ulyOS.FS.open() },
    taskmgr: { name: 'Task Manager', icon: 'activity', open: () => ulyOS.Telemetry.open() },
    settings: { name: 'Settings', icon: 'settings', open: () => SettingsApp.open() },
    speak: { name: 'Speak', icon: 'volume', open: () => ulyOS.Speech.open() },
    store: { name: 'App Store', icon: 'store', open: () => ulyOS.Store.open() },
    beam: { name: 'Beam', icon: 'send', open: () => ulyOS.Beam.open() },
    live: { name: 'Gemini Live', icon: 'mic', open: () => ulyOS.Gemini.openLive() },
  };
  /* The desktop shows four tools and one folder; everything else lives in the Apps folder (and the dock / Start menu / App Store). */
  const A = 'apps';
  const DEFAULT_ICONS = [
    { id: 'live', kind: 'sys', sys: 'live', name: 'Gemini Live' },
    { id: 'speak', kind: 'sys', sys: 'speak', name: 'Speak' },
    { id: 'beam', kind: 'sys', sys: 'beam', name: 'Beam' },
    { id: 'store', kind: 'sys', sys: 'store', name: 'App Store' },
    { id: 'apps', kind: 'folder', name: 'Apps', glyph: 'folder', tint: '#fbbf24' },
    { id: 'files', kind: 'sys', sys: 'files', name: 'Files', folder: A },
    { id: 'taskmgr', kind: 'sys', sys: 'taskmgr', name: 'Task Manager', folder: A },
    { id: 'settings', kind: 'sys', sys: 'settings', name: 'Settings', folder: A },
    { id: 'qrseal', kind: 'local', name: 'QR Seal', file: 'apps/qrseal.html', glyph: 'qr', mem: 60, w: 980, h: 760, tint: '#c4b5fd', folder: A },
    { id: 'systemvault', kind: 'local', name: 'System Vault', file: 'apps/systemvault.html', glyph: 'key', mem: 62, w: 1100, h: 760, tint: '#fb7185', folder: A },
    { id: 'cryptocompass', kind: 'local', name: 'Crypto Compass', file: 'apps/cryptocompass.html', glyph: 'compass', mem: 40, w: 1100, h: 760, tint: '#fbbf24', folder: A },
    { id: 'polotno', kind: 'url', name: 'Polotno', url: 'https://studio.polotno.com/', glyph: 'shapes', mem: 95, w: 1100, h: 720, tint: '#c4b5fd', folder: A },
    { id: 'getartcraft', kind: 'url', name: 'GetArtCraft', url: 'https://app.getartcraft.com/create-image', glyph: 'sparkles', mem: 140, w: 1100, h: 720, tint: '#fbbf24', folder: A },
    { id: 'youtube', kind: 'url', name: 'YouTube', url: 'https://www.youtube.com/', glyph: 'video', mode: 'tab', tint: '#ff5c5c', folder: A },
    { id: 'xrp', kind: 'url', name: 'XRP Price', url: 'https://coinmarketcap.com/currencies/xrp/', glyph: 'trending', mode: 'tab', tint: '#38bdf8', folder: A },
    { id: 'outlook', kind: 'url', name: 'Outlook', url: 'https://outlook.office.com/mail', glyph: 'mail', mode: 'tab', tint: '#4fa3ff', folder: A },
  ];
  const DESK_ONLY = ['live', 'speak', 'beam', 'store', 'apps'];
  const onDesk = (i) => !i.folder;

  /** Icon markup for an icon record (used by desktop tiles, taskbar, window chrome). */
  const richOn = () => settings.richIcons !== false && ulyOS.richIcons;
  function iconHTML(ic, size = 16) {
    if (richOn() && ulyOS.richIcons.has(ic.id) && ic.kind !== 'url-custom') return '<span class="rich-ico" style="width:' + size + 'px;height:' + size + 'px">' + ulyOS.richIcons.svg(ic.id) + '</span>';
    if (ic.kind === 'sys') return icon(SYS_APPS[ic.sys].icon, size);
    if (ic.glyph) return icon(ic.glyph, size);
    const letter = escapeHtml((ic.name || '?').trim().charAt(0).toUpperCase());
    const fav = settings.favicons && ic.url
      ? '<img src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(hostName(ic.url)) + '&sz=64" alt="" referrerpolicy="no-referrer" data-favicon="1">' : '';
    return '<span class="letter-ico" style="--h:' + hueOf(hostName(ic.url || ic.name)) + ';width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.62) + 'px">' + letter + fav + '</span>';
  }

  // a favicon that fails to load simply disappears (replaces an inline onerror, which the CSP forbids)
  document.addEventListener('error', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && t.dataset && t.dataset.favicon) t.remove(); }, true);

  /* ---- Apps folder ---- */
  function moveToFolder(ic, folderId) {
    if (ic.kind === 'folder' || ic.id === folderId) return;
    ic.folder = folderId; ic.col = undefined; ic.row = undefined;
    Desktop.selected.delete(ic.id); Desktop.render(); ulyOS.audit("'" + ic.name + "' moved into the " + folderId + ' folder', 'info');
  }
  function moveToDesktop(ic) { delete ic.folder; ic.col = undefined; ic.row = undefined; Desktop.render(); ulyOS.audit("'" + ic.name + "' moved to the desktop", 'info'); }
  function openFolder(f) {
    const ex = WM.byApp('folder:' + f.id)[0];
    if (ex) { WM.focus(ex); return; }
    WM.open({ appId: 'folder:' + f.id, title: f.name, icon: icon('folder', 16), width: 680, height: 500, minWidth: 340, minHeight: 280, mem: 6, render: () => {
      const grid = h('div', { class: 'fld-grid' });
      let q = '';
      const search = h('input', { class: 'input', type: 'search', placeholder: 'Search ' + f.name + '…', 'aria-label': 'Search apps', oninput: () => { q = search.value.trim().toLowerCase(); paint(); } });
      const paint = () => {
        const kids = Desktop.icons.filter((i) => i.folder === f.id && (!q || i.name.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
        grid.replaceChildren(...(kids.length ? kids.map((ic) => {
          const el = h('button', { class: 'fld-item', title: ic.name }, tileEl(ic), h('div', { class: 'di-label', text: ic.name }));
          el.addEventListener('click', () => { launch(ic); ulyOS.audit("Launching '" + ic.name + "' from the " + f.name + ' folder', 'info'); });
          el.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            ui.contextMenu(e.clientX, e.clientY, [
              { label: 'Open', icon: 'external', action: () => launch(ic) },
              { label: 'Move to desktop', icon: 'desktop', action: () => moveToDesktop(ic) },
              { label: ulyOS.Shell && ulyOS.Shell.isPinned(ic.id) ? 'Remove from taskbar' : 'Keep in taskbar', icon: 'plus', action: () => ulyOS.Shell.togglePin(ic.id) },
              { separator: true },
              { label: 'Delete', icon: 'trash', danger: true, action: () => removeIcon(ic) },
            ]);
          });
          return el;
        }) : [h('div', { class: 'set-desc', style: { padding: '24px 6px' }, text: q ? 'Nothing matches.' : 'This folder is empty. Right-click an icon on the desktop → Move to ' + f.name + ', or drag it onto the folder.' })]));
      };
      paint();
      bus.on('icons:change', () => { if (grid.isConnected) paint(); });
      return h('div', { class: 'fld' }, h('div', { class: 'fld-top' }, search), grid);
    } });
  }

  async function launch(ic) {
    if (ic.kind === 'folder') { openFolder(ic); return; }
    if (ic.kind === 'sys') { SYS_APPS[ic.sys].open(); return; }
    if (ic.kind === 'local') {
      const existing = WM.byApp('web:' + ic.id)[0];
      if (existing) { WM.focus(existing); return; }
      WM.open({ appId: 'web:' + ic.id, title: ic.name, icon: iconHTML(ic, 16), src: ic.file, width: ic.w || 1000, height: ic.h || 700, mem: ic.mem, singleton: true });
      return;
    }
    const target = embedUrl(ic.url);
    const mode = ic.mode || 'auto';
    if (mode === 'tab' || (mode === 'auto' && blocksEmbedding(target))) {
      window.open(target, '_blank', 'noopener,noreferrer');
      if (mode === 'auto') ui.toast(hostName(target) + ' doesn’t allow embedding, so it opened in a browser tab. Paste a direct video/playlist link to play YouTube in a window.', { timeout: 6500 });
      ulyOS.audit("'" + ic.name + "' opened in a browser tab (" + hostName(target) + ')', 'info');
      return;
    }
    WM.open({
      appId: 'web:' + ic.id, title: ic.name, icon: iconHTML(ic, 16), url: target,
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
  const saveIcons = () => { store.set('ulyos.icons', { v: 1, list: Desktop.icons }); bus.emit('icons:change'); };

  function metrics() {
    const c = cell(), el = $('#desktop');
    Desktop.cols = Math.max(1, Math.floor((el.clientWidth - Desktop.pad * 2) / c.w));
    Desktop.rows = Math.max(1, Math.floor((el.clientHeight - Desktop.pad * 2) / c.h));
  }
  const occupied = (col, row, ignoreId) => Desktop.icons.some((i) => onDesk(i) && i.id !== ignoreId && i.col === col && i.row === row);
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
    if (WM.compact()) {   // phones fill row by row like a home screen
      for (let r = 0; r < Desktop.rows; r++) for (let c = 0; c < Math.max(Desktop.cols, 1); c++) if (!occupied(c, r)) return [c, r];
      return [0, 0];
    }
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
    Desktop.icons.filter(onDesk).forEach((ic) => {
      if (ic.col == null || ic.col >= Desktop.cols || ic.row >= Desktop.rows || ic.col < 0 || ic.row < 0) {
        const tmp = ic.id; ic.col = -1; ic.row = -1; const [c, r] = nextFree(); ic.col = c; ic.row = r; void tmp;
      }
    });
    Desktop.icons.filter(onDesk).forEach(placeEl);
    saveIcons();
    bus.emit('desktop:layout');
  };

  Desktop.render = function (animateIn) {
    const host = $('#desktop');
    host.querySelectorAll('.desk-icon').forEach((n) => n.remove());   // keep the #widgets layer
    Desktop.els.clear();
    metrics();
    Desktop.icons.filter(onDesk).forEach((ic, i) => {
      if (ic.col == null) { const [c, r] = nextFree(); ic.col = c; ic.row = r; }
      const el = buildIcon(ic);
      el.style.setProperty('--bd', -(i * 0.9) + 's');
      if (animateIn) { el.classList.add('pop-in'); el.style.animationDelay = 120 + i * 60 + 'ms'; }
      host.append(el);
      Desktop.els.set(ic.id, el);
    });
    Desktop.layout();
    paintSelection();
  };

  /** The picture tile for an icon: full-colour artwork when available, otherwise the gradient tile with a glyph / letter. */
  function tileEl(ic) {
    const rich = richOn() && ulyOS.richIcons.has(ic.id);
    const art = !rich && ART[ic.id];
    const [g1, g2] = gradientOf(ic);
    return h('div', {
      class: 'di-tile' + (rich ? ' has-rich' : art ? ' has-art' : ''),
      html: rich ? '<span class="rich-art">' + ulyOS.richIcons.svg(ic.id) + '</span>'
        : '<span class="glyph">' + (ic.kind === 'sys' || ic.glyph ? iconHTML(ic, 30) : iconHTML(ic, 30)) + '</span>' + (art ? '<span class="art">' + art + '</span>' : ''),
      style: { '--g1': g1, '--g2': g2, ...(ic.tint ? { '--tint': ic.tint } : {}) },
    });
  }
  function buildIcon(ic) {
    const tile = tileEl(ic);
    const el = h('div', { class: 'desk-icon', tabindex: 0, role: 'button', 'aria-label': ic.name, dataset: { id: ic.id } },
      tile, h('div', { class: 'di-label', text: ic.name }));
    el.addEventListener('dblclick', () => { el.classList.add('launching'); setTimeout(() => el.classList.remove('launching'), 1300); launch(ic); ulyOS.audit("Launching '" + ic.name + "' from desktop", 'info'); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') launch(ic); });
    el.addEventListener('click', (e) => {   // touch / pen: one tap opens (double-tap is unreliable on phones)
      if (el._drag || !(e.pointerType === 'touch' || e.pointerType === 'pen')) return;
      Desktop.selected = new Set([ic.id]); paintSelection();
      el.classList.add('launching'); setTimeout(() => el.classList.remove('launching'), 1300);
      launch(ic); ulyOS.audit("Launching '" + ic.name + "' from desktop (tap)", 'info');
    });
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
    const hint = $('#cell-hint'), host = $('#desktop');
    let lastX = e.clientX, lastY = e.clientY;
    const onMove = (ev) => {
      lastX = ev.clientX; lastY = ev.clientY;
      if (moved) { const o = document.elementFromPoint(lastX, lastY), t = o && o.closest && o.closest('.desk-icon'); host.querySelectorAll('.drop-target').forEach((n) => { if (n !== t) n.classList.remove('drop-target'); }); if (t && t !== el && Desktop.icons.some((i) => i.id === t.dataset.id && i.kind === 'folder')) t.classList.add('drop-target'); }
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
      const over = document.elementFromPoint(lastX, lastY), tgt = over && over.closest && over.closest('.desk-icon');   // while the dragged icon is still click-through
      const fold = tgt && Desktop.icons.find((i) => i.id === tgt.dataset.id && i.kind === 'folder');
      el._drag = true; setTimeout(() => { el._drag = false; }, 350);
      WM.setIframesInert(false);
      el.classList.remove('dragging');
      hint.style.display = 'none';
      host.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
      if (fold && fold.id !== ic.id && ic.kind !== 'folder') { moveToFolder(ic, fold.id); return; }
      if (hint._cell) { [ic.col, ic.row] = hint._cell; }
      placeEl(ic); saveIcons();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  }

  /* ---- icon CRUD ---- */
  function addIcon(rec) {
    if (rec.folder) { const ic = { ...rec, col: undefined, row: undefined }; Desktop.icons.push(ic); saveIcons(); return ic; }   // goes straight into a folder
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
    if (ic.kind === 'folder') { Desktop.icons.forEach((c) => { if (c.folder === ic.id) { delete c.folder; c.col = undefined; c.row = undefined; } }); }
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
      message: 'Many big sites (YouTube home, Google, GitHub…) refuse to be shown inside another page — those open in a browser tab. YouTube video/playlist, Spotify and Vimeo links are converted to embeddable players.',
      fields: [
        { name: 'name', label: 'Name', value: existing?.name || '', placeholder: 'e.g. Figma' },
        { name: 'url', label: 'URL', value: existing?.url || '', placeholder: 'https://example.com', type: 'text' },
        { name: 'mode', label: 'Open in', type: 'select', value: existing?.mode || 'auto', options: [
          { value: 'auto', label: 'Automatic (window, or browser tab if the site blocks embedding)' },
          { value: 'window', label: 'Always a ulyOS window' }, { value: 'tab', label: 'Always a browser tab' }] },
      ],
      validate: (v) => (!normalizeUrl(v.url) ? 'Enter a valid http(s) URL' : null),
    });
    if (!vals) return;
    const url = normalizeUrl(vals.url);
    const name = vals.name.trim() || hostName(url).replace(/\.[^.]+$/, '').replace(/^./, (c) => c.toUpperCase());
    if (existing) {
      Object.assign(existing, { name, url, mode: vals.mode });
      ulyOS.audit("Shortcut '" + name + "' updated → " + hostName(url), 'ok');
      Desktop.render();
    } else {
      const ic = addIcon({ id: 'u' + Date.now().toString(36), kind: 'url', name, url, mode: vals.mode });
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
    const dk = Desktop.icons.filter(onDesk);
    dk.forEach((i) => { i.col = -1; i.row = -1; });
    dk.forEach((i) => { const [c, r] = nextFree(); i.col = c; i.row = r; });
    dk.forEach(placeEl); saveIcons();
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
      { label: ulyOS.Shell && ulyOS.Shell.isPinned(ic.id) ? 'Remove from taskbar' : 'Keep in taskbar', icon: 'plus', disabled: multi, action: () => ulyOS.Shell.togglePin(ic.id) },
      ic.kind !== 'folder' && Desktop.icons.some((i) => i.kind === 'folder') ? { label: 'Move to Apps folder', icon: 'folder', action: () => sel.forEach((i) => moveToFolder(i, 'apps')) } : null,
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
      { label: 'Surprise me  🎲', icon: 'sparkles', action: () => surprise(true) },
      { label: 'Wallpaper', icon: 'image', submenu: [{ label: (settings.wallpaper === 'random' ? '✓ ' : '    ') + '🎲 Random each sign-in', action: () => { Settings.set('wallpaper', 'random'); eff = {}; applyWallpaper(); } },
        ...(((ulyOS.landscapes && ulyOS.landscapes.groups) || [['Nature & landscapes', LANDS]]).map(([title, items]) => ({ label: title, icon: 'image', submenu: items.map(([id, l]) => ({ label: (settings.wallpaper === 'land:' + id ? '✓ ' : '    ') + l, action: () => { eff = {}; Settings.set('wallpaper', 'land:' + id); applyWallpaper(); } })) }))),
        { separator: true }].concat(WALLPAPERS.map(([id, label]) => ({
        label: (settings.wallpaper === id ? '✓ ' : '    ') + label,
        action: () => { Settings.set('wallpaper', id); applyWallpaper(); ulyOS.audit("Wallpaper changed to '" + label + "'", 'info'); },
      }))).concat([{ separator: true }, { label: 'More in Settings…', icon: 'settings', action: () => SettingsApp.open('appearance') }]) },
      { label: 'Customize dock & menu bar…', icon: 'desktop', action: () => SettingsApp.open('shell') },
      ...(ulyOS.Widgets ? ulyOS.Widgets.menuItems() : []),
      ...(ulyOS.config.OFFLINE ? [] : [{ label: 'Download offline version…', icon: 'download', action: () => ulyOS.offline.download() }]),
      { label: 'Icon size', icon: 'grid', submenu: ['small', 'medium', 'large'].map((s) => ({
        label: (settings.iconSize === s ? '✓ ' : '    ') + s[0].toUpperCase() + s.slice(1),
        action: () => Settings.set('iconSize', s),
      })) },
      { label: 'Auto-arrange icons', icon: 'list', action: autoArrange },
      { label: 'Restore stock icons' + (miss.length ? ' (' + miss.length + ')' : ''), icon: 'refresh', disabled: !miss.length, action: restoreDefaults },
      { separator: true },
      { label: 'Screenshot', icon: 'image', submenu: ulyOS.Capture ? ulyOS.Capture.menuItems() : [] },
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
    if (!store.get('ulyos.migr.addYtXrpOutlook', false)) {   // one-time: new stock icons for existing profiles
      ['youtube', 'xrp', 'outlook'].forEach((id) => { if (!Desktop.icons.some((i) => i.id === id)) Desktop.icons.push({ ...DEFAULT_ICONS.find((d) => d.id === id) }); });
      store.set('ulyos.migr.addYtXrpOutlook', true);
      if (saved) saveIcons();
    }
    if (!store.get('ulyos.migr.dropTrustVault', false)) {   // one-time: TrustVault is no longer a stock icon
      Desktop.icons = Desktop.icons.filter((i) => i.id !== 'trustvault');
      store.set('ulyos.migr.dropTrustVault', true);
      if (saved) saveIcons();
    }
    if (!store.get('ulyos.migr.addSpeak', false)) {   // one-time: the new Speak app appears on existing desktops
      if (!Desktop.icons.some((i) => i.id === 'speak')) Desktop.icons.push({ ...DEFAULT_ICONS.find((d) => d.id === 'speak') });
      store.set('ulyos.migr.addSpeak', true);
      if (saved) saveIcons();
    }
    if (!store.get('ulyos.migr.addLive', false)) {   // one-time: the Gemini Live icon appears on existing desktops
      if (!Desktop.icons.some((i) => i.id === 'live')) Desktop.icons.push({ ...DEFAULT_ICONS.find((d) => d.id === 'live') });
      store.set('ulyos.migr.addLive', true);
      if (saved) saveIcons();
    }
    if (!store.get('ulyos.migr.addBeam', false)) {   // one-time: the Beam icon appears on existing desktops
      if (!Desktop.icons.some((i) => i.id === 'beam')) Desktop.icons.push({ ...DEFAULT_ICONS.find((d) => d.id === 'beam') });
      store.set('ulyos.migr.addBeam', true);
      if (saved) saveIcons();
    }
    if (!store.get('ulyos.migr.addStore', false)) {   // one-time: the App Store icon appears on existing desktops
      if (!Desktop.icons.some((i) => i.id === 'store')) Desktop.icons.push({ ...DEFAULT_ICONS.find((d) => d.id === 'store') });
      store.set('ulyos.migr.addStore', true);
      if (saved) saveIcons();
    }
    if (!store.get('ulyos.migr.dropPhotopeaSpotify', false)) {   // one-time: these are no longer stock icons
      Desktop.icons = Desktop.icons.filter((i) => !['photopea', 'spotify'].includes(i.id));
      store.set('ulyos.migr.dropPhotopeaSpotify', true);
      if (saved) saveIcons();
    }
    if (!store.get('ulyos.migr.layout2i', false)) {   // one-time: a calm desktop — four tools and an Apps folder holding the rest
      if (saved) {
        DESK_ONLY.forEach((id) => { if (!Desktop.icons.some((i) => i.id === id)) Desktop.icons.push({ ...DEFAULT_ICONS.find((d) => d.id === id) }); });
        Desktop.icons.forEach((i) => { if (DESK_ONLY.includes(i.id)) delete i.folder; else i.folder = 'apps'; i.col = undefined; i.row = undefined; });
        const rank = (id) => (DESK_ONLY.includes(id) ? DESK_ONLY.indexOf(id) : 99);
        Desktop.icons.sort((a, b) => rank(a.id) - rank(b.id));
        saveIcons();
      }
      store.set('ulyos.migr.layout2i', true);
    }
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

  function lockNow() {
    if (ulyOS.security.isProtected()) ulyOS.security.lock('manual');
    else { ui.toast('This profile has no password yet — set one to enable locking', { type: 'info' }); SettingsApp.open('security'); }
  }

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


  /* ---- Security tab ---- */
  function securitySection() {
    const wrap = h('div', {});
    const sec = ulyOS.security;
    const download = (blob, name) => {
      const a = h('a', { href: URL.createObjectURL(blob), download: name });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    const row = (label, desc, ctl) => h('div', { class: 'set-row' }, h('div', {}, h('div', { class: 'set-label', text: label }), desc ? h('div', { class: 'set-desc', text: desc }) : null), ctl);
    const selS = (key, list) => h('select', { class: 'input sm', onchange: (e) => Settings.set(key, +e.target.value) }, list.map(([v, l]) => h('option', { value: v, text: l, selected: String(settings[key]) === String(v) })));
    const swS = (key) => h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: !!settings[key], onchange: (e) => Settings.set(key, e.target.checked) }), h('i'));
    const secretFields = (pwc) => [{ name: 'pw', type: 'custom', node: pwc.el, get: pwc.value, focus: pwc.focus, dispose: pwc.dispose }, { name: 'pw2', type: 'custom', get: pwc.confirm }];
    const validateNew = (v) => ulyOS.crypto.policy(v.pw, 'password') || (v.pw !== v.pw2 ? 'Entries do not match' : null);

    function paint() {
      const p = sec.profile(), info = sec.vaultInfo(), prot = true;
      const swatches = h('div', { class: 'swatches' }, sec.COLORS.map((c) => h('button', { class: 'swatch' + (p.color === c ? ' active' : ''), style: { background: c }, 'aria-label': c, onclick: () => { sec.setColor(c); paint(); } })));
      const nameIn = h('input', { class: 'input', value: p.name, maxLength: 24, style: { width: '170px' } });
      const autoSel = h('select', { class: 'input sm', onchange: (e) => sec.setAutoLock(+e.target.value) },
        [[0, 'Never'], [1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']].map(([v, l]) => h('option', { value: v, text: l, selected: v === sec.getAutoLock() })));

      wrap.replaceChildren(
        h('div', { class: 'sec-status ' + (prot ? 'ok' : 'bad') },
          h('div', { class: 'sec-ico', html: icon(prot ? 'lock' : 'shield', 22) }),
          h('div', {}, h('div', { class: 'set-label', text: prot ? 'Vault encrypted at rest' : 'Vault is NOT encrypted' }),
            h('div', { class: 'set-desc', text: prot ? 'AES-256-GCM · PBKDF2-SHA256 × ' + info.iterations.toLocaleString() + (info.passkeys ? ' · ' + info.passkeys + ' passkey' + (info.passkeys > 1 ? 's' : '') : '') + ' · ' + info.keys + ' entries · ' + (info.bytes / 1024).toFixed(1) + ' KB on disk'
              : 'Anyone using this browser (and any page on this site’s origin) can read this profile’s data. Set a password to encrypt it.' }))),
        h('h3', { text: 'Profile' }),
        row('Name', null, h('div', { class: 'inline-form', style: { width: 'auto' } }, nameIn, h('button', { class: 'btn sm', text: 'Rename', onclick: () => { sec.rename(nameIn.value); paint(); } }))),
        row('Picture', 'A letter, an emoji or your photo — shown on the sign-in screen and next to the clock', h('div', { class: 'btn-row' }, sec.avatarEl(p, 40), h('button', { class: 'btn sm', text: 'Change…', onclick: async () => {
          const pk = sec.avatarPicker({ name: p.name, color: p.color, avatar: p.avatar });
          const v = await ui.form({ title: 'Profile picture', fields: [{ name: 'pic', type: 'custom', node: pk.el, get: pk.get }], okText: 'Save' });
          if (v) { sec.setPicture(v.pic); paint(); }
        } }))),
        h('h3', { text: 'Lock & password' }),
        row('Change password', 'Re-wraps the vault key with a fresh salt. Passkeys and encrypted files keep working.',
          h('button', { class: 'btn sm primary', text: 'Change…', onclick: async () => {
            const pwc = ui.passwordInput();
            const v = await ui.form({ title: 'Change password',
              fields: [{ name: 'old', label: 'Current password', type: 'password' }, ...secretFields(pwc)],
              okText: 'Save', validate: (x) => (!x.old ? 'Enter your current password' : validateNew(x)) });
            if (!v) return;
            try { await sec.changeSecret(v.old, v.pw); ui.toast('Password changed', { type: 'ok' }); bus.emit('profile:change'); paint(); }
            catch (err) { ui.toast(err.message, { type: 'err' }); }
          } })),
        h('details', { class: 'howto' }, h('summary', { text: 'How passkeys and fingerprint unlock work — and how to use them' }),
          h('p', { html: '<b>The idea:</b> your device (Touch ID, Windows Hello, an Android phone or iPhone, or a USB security key) keeps a secret that never leaves it. When you unlock, ulyOS asks the device for a code derived from that secret and uses it to open your vault. Because the code is long and random and stays inside the device, nobody can guess it from a copy of your data — a PIN can be guessed in minutes, a passkey cannot.' }),
          h('ol', {}, [
            h('li', { html: 'Press <b>Add passkey…</b>, name it (for example “MacBook fingerprint”) and type your password once to prove it is you.' }),
            h('li', { html: 'Your browser shows its own prompt — touch the sensor, look at the camera, enter the device PIN or tap the key. Approve it.' }),
            h('li', { html: 'Next time, on the profile screen or the lock screen press <b>Use passkey / fingerprint</b> instead of typing the password.' }),
          ]),
          h('p', { html: '<b>Good to know:</b> your password still works and is your recovery — keep it. A passkey belongs to one site address, so the online site and the offline copy each need their own. Passkeys saved to iCloud Keychain or Google Password Manager appear on your other devices automatically; otherwise add one per device. If you see “did not return a key”, that authenticator lacks the PRF feature — try another device or browser. Remove a lost device’s passkey in the list below.' })),
        row('Passkey / fingerprint', sec.passkeySupported() ? 'Unlock with Touch ID, Windows Hello, a phone or a security key. The key comes from the authenticator, not from anything typed, so it cannot be guessed offline the way a PIN can. Your password stays as the fallback.' : 'This browser cannot create passkeys here (needs HTTPS or localhost and WebAuthn).',
          h('button', { class: 'btn sm', text: 'Add passkey…', disabled: !sec.passkeySupported(), onclick: async () => {
            const v = await ui.form({ title: 'Add a passkey', message: 'Confirm your password, then your device will ask for your fingerprint, face, PIN or security key.',
              fields: [{ name: 'label', label: 'Name this passkey', value: /iPhone|iPad/.test(navigator.userAgent) ? 'This iPhone / iPad' : 'This device' }, { name: 'old', label: 'Password', type: 'password' }],
              okText: 'Continue', validate: (x) => (x.old ? null : 'Enter your password') });
            if (!v) return;
            try { await sec.addPasskey(v.old, v.label); ui.toast('Passkey added', { type: 'ok' }); paint(); }
            catch (err) { ui.toast(err.name === 'NotAllowedError' ? 'Passkey setup was cancelled' : err.message, { type: 'err' }); }
          } })),
        ...sec.passkeys().map((k) => row('🔑 ' + k.label, 'Added ' + new Date(k.added).toLocaleDateString(), h('button', { class: 'btn sm danger', text: 'Remove', onclick: async () => {
          if (!(await ui.confirm({ title: 'Remove passkey?', message: "'" + k.label + "' will no longer unlock this profile.", okText: 'Remove', danger: true }))) return;
          await sec.removePasskey(k.cred); paint();
        } }))),
        row('Auto-lock after idle', 'Focus inside a cross-origin embedded site (e.g. Polotno) counts as activity — lock manually when you step away', autoSel),
        row('Sign out when locked for', 'After this long on the lock screen the encryption key is discarded from memory (full sign-out)', h('select', { class: 'input sm', onchange: (e) => sec.setLockSignOut(+e.target.value) }, [[0, 'Never'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']].map(([v, l]) => h('option', { value: v, text: l, selected: v === sec.getLockSignOut() })))),
        row('Lock now', null, h('button', { class: 'btn sm', html: icon('lock', 14) + ' Lock', onclick: lockNow })),
        h('h3', { text: 'Memory & clipboard' }),
        row('Purge memory now', 'Wipes every typed or generated password field and the clipboard — like “Purge memory” in System Vault', h('button', { class: 'btn sm danger', html: icon('trash', 14) + ' Purge now', onclick: () => ulyOS.purge.now('manual') })),
        row('Purge when idle', 'Wipe typed / generated secrets after this long without any activity', selS('purgeIdle', [[0, 'Never'], [30, '30 seconds'], [60, '1 minute'], [120, '2 minutes'], [300, '5 minutes']])),
        row('Purge when the tab is hidden', 'Switching tabs or minimising the browser wipes typed / generated secrets', swS('purgeOnHide')),
        row('Clear clipboard after copy', 'Overwrites the clipboard some seconds after you copy a generated password', selS('clipClear', [[0, 'Never (not recommended)'], [15, '15 seconds'], [30, '30 seconds'], [60, '1 minute']])),
        h('h3', { text: 'Backup' }),
        row('Export encrypted profile', 'Settings, desktop layout, audit log and app data (not sandbox files) as a .ulyprofile file', h('button', { class: 'btn sm', html: icon('download', 14) + ' Export…', onclick: async () => {
          const pwc = ui.passwordInput();
          const v = await ui.form({ title: 'Encrypt backup', message: 'Choose the password that will protect the backup file. Restoring it creates a profile protected with this password.',
            fields: secretFields(pwc), okText: 'Export',
            validate: (x) => ulyOS.crypto.policy(x.pw, 'password') || (x.pw !== x.pw2 ? 'Entries do not match' : null) });
          if (!v) return;
          try { download(await sec.exportProfile(v.pw), p.name.replace(/[^\w.-]+/g, '_') + '-' + ulyOS.util.stamp() + '.ulyprofile'); ulyOS.audit('Encrypted profile backup exported', 'ok'); ui.toast('Encrypted backup saved', { type: 'ok' }); }
          catch (err) { ui.toast('Export failed: ' + err.message, { type: 'err' }); }
        } })),
        row('Restore a backup', 'On the profile screen: sign out → Add profile → Import encrypted backup', h('button', { class: 'btn sm', text: 'Sign out…', onclick: () => sec.signOut() })),
        h('h3', { text: 'Danger zone' }),
        row('Delete this profile', 'Erases its vault, sandbox files and settings from this browser', h('button', { class: 'btn sm danger', text: 'Delete…', onclick: async () => {
          const v = await ui.form({ title: "Delete '" + p.name + "'?", message: 'This permanently erases everything in this profile and signs you out.', fields: [{ name: 'old', label: 'Enter your password to confirm', type: 'password' }], okText: 'Delete forever', danger: true, validate: (x) => (x.old ? null : 'Required') });
          if (!v) return;
          try { await sec.deleteSelf(v.old); } catch (err) { ui.toast(err.message, { type: 'err' }); }
        } })),
        h('p', { class: 'set-desc', style: { marginTop: '18px' }, text: 'Files you save in the sandbox are encrypted automatically with a key derived from your vault key (AES-256-GCM); folders you mount from your computer stay as normal files. GitHub Pages serves every ulyweb.github.io project from one origin, so other pages there share this browser’s storage; an unencrypted profile is readable by them.' }));
    }
    bus.on('profile:change', () => { if (wrap.isConnected) paint(); });
    paint();
    return wrap;
  }

  /* ---- Settings export / import (appearance, dock & menu bar, desktop icon layout) ---- */
  const HEX = /^#[0-9a-f]{6}$/i;
  function sanitizeSettings(src) {
    const out = {};
    const D = DEFAULT_SETTINGS;
    const oneOf = (v, list) => list.includes(v);
    for (const k of Object.keys(D)) {
      if (!(k in src)) continue;
      const v = src[k], dv = D[k];
      if (k === 'pinned') { if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string' && /^[\w-]{1,40}$/.test(x)).slice(0, 40); continue; }
      if (typeof v !== typeof dv) continue;
      if (typeof dv === 'number') { out[k] = Number.isFinite(v) ? v : dv; continue; }
      out[k] = v;
    }
    const clampKey = (k, lo, hi) => { if (k in out) out[k] = clamp(out[k], lo, hi); };
    clampKey('fxAurora', 0, 100); clampKey('fxTilt', 0, 10); clampKey('fxGlow', 0, 100); clampKey('iconScale', 50, 160); clampKey('depth', 0, 100); clampKey('sfxVolume', 0, 100); clampKey('cursorSize', 50, 300); clampKey('clipClear', 0, 600); clampKey('purgeIdle', 0, 3600);
    clampKey('animSpeed', 0.25, 3); clampKey('blur', 0, 60); clampKey('glassAlpha', 0.3, 1); clampKey('taskbarSize', 36, 84);
    if ('theme' in out && !['dark', 'light', 'auto'].includes(out.theme)) delete out.theme;
    if ('widgetTheme' in out && !(ulyOS.Widgets && ulyOS.Widgets.themes.some((t) => t[0] === out.widgetTheme))) delete out.widgetTheme;
    clampKey('fontSize', 10, 22);
    if ('fontFamily' in out && !FONTS.some((f) => f[0] === out.fontFamily)) delete out.fontFamily;
    if ('fontWeight' in out && ![300, 400, 500, 600, 700].includes(out.fontWeight)) delete out.fontWeight;
    if ('fontStyle' in out && !['normal', 'italic'].includes(out.fontStyle)) delete out.fontStyle;
    if ('widgetStyle' in out && !['vivid', 'glass'].includes(out.widgetStyle)) delete out.widgetStyle;
    if ('cursorColor' in out && out.cursorColor !== '' && !HEX.test(out.cursorColor)) delete out.cursorColor;
    ['accent', 'wallpaperColor'].forEach((k) => { if (k in out && !HEX.test(out[k])) delete out[k]; });
    if ('wallpaper' in out && !oneOf(out.wallpaper, [...POOLS.wallpaper, 'solid', 'custom', 'random']) && !(out.wallpaper.startsWith('photo:') && ulyOS.landscapes.photos.some((p) => 'photo:' + p.key === out.wallpaper))) delete out.wallpaper;
    if ('cursorStyle' in out && !oneOf(out.cursorStyle, [...CURSOR_STYLES.map((c) => c[0]), 'random'])) delete out.cursorStyle;
    if ('animStyle' in out && !oneOf(out.animStyle, [...ANIM_STYLES.map((c) => c[0]), 'random'])) delete out.animStyle;
    if ('iconStyle' in out && !oneOf(out.iconStyle, [...ICON_STYLES.map((c) => c[0]), 'random'])) delete out.iconStyle;
    if ('iconSize' in out && !oneOf(out.iconSize, ['small', 'medium', 'large'])) delete out.iconSize;
    if ('taskbarMode' in out && !oneOf(out.taskbarMode, ['bar', 'dock'])) delete out.taskbarMode;
    if ('taskbarPos' in out && !oneOf(out.taskbarPos, ['bottom', 'top', 'left', 'right'])) delete out.taskbarPos;
    if ('clockFormat' in out && !oneOf(out.clockFormat, ['12', '24'])) delete out.clockFormat;
    if ('clockStyle' in out && !oneOf(out.clockStyle, ['digital', 'analog', 'lcd', 'minimal'])) delete out.clockStyle;
    if ('clockDate' in out && !oneOf(out.clockDate, ['short', 'long', 'numeric', 'iso', 'none'])) delete out.clockDate;
    if ('clockFont' in out && out.clockFont !== 'inherit' && !FONTS.some((f) => f[0] === out.clockFont)) delete out.clockFont;
    if ('clockLayout' in out && !oneOf(out.clockLayout, ['row', 'stack'])) delete out.clockLayout;
    if ('clockColor' in out && !oneOf(out.clockColor, ['text', 'accent'])) delete out.clockColor;
    if ('clockWeight' in out && ![400, 500, 700].includes(+out.clockWeight)) delete out.clockWeight;
    if ('clockSize' in out) { const n = +out.clockSize; if (!(n >= 10 && n <= 26)) delete out.clockSize; }
    if ('menubarStyle' in out && !oneOf(out.menubarStyle, ['glass', 'solid'])) delete out.menubarStyle;
    // a custom wallpaper only travels if it is a plain web URL (uploaded images live in this browser's sandbox)
    const wpc = normalizeUrl(out.wallpaperCustom || '');
    out.wallpaperCustom = wpc || '';
    if (out.wallpaper === 'custom' && !wpc) out.wallpaper = 'void';
    return out;
  }
  function sanitizeIcons(list) {
    if (!Array.isArray(list)) return null;
    const out = [];
    const used = new Set();
    for (const r of list.slice(0, 120)) {
      if (!r || typeof r.id !== 'string' || !/^[\w-]{1,40}$/.test(r.id) || used.has(r.id)) continue;
      const stock = DEFAULT_ICONS.find((d) => d.id === r.id);
      const base = stock ? { ...stock } : null;
      const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : (base ? base.name : null);
      if (!name) continue;
      let rec;
      if (base && base.kind !== 'url') rec = { ...base, name };                         // sys / local / folder: trusted record only
      else {
        const url = normalizeUrl(r.url || (base && base.url) || '');
        if (!url) continue;
        rec = { ...(base || { id: r.id, kind: 'url' }), name, url, mode: ['auto', 'window', 'tab'].includes(r.mode) ? r.mode : (base?.mode || 'auto') };
      }
      if (r.folder === 'apps' && list.some((f) => f && f.id === 'apps')) rec.folder = 'apps'; else delete rec.folder;
      rec.col = Number.isInteger(r.col) && r.col >= 0 && r.col < 200 ? r.col : undefined;
      rec.row = Number.isInteger(r.row) && r.row >= 0 && r.row < 200 ? r.row : undefined;
      used.add(r.id); out.push(rec);
    }
    return out;
  }
  /** The settings export as { blob, name } (also used by the Sync tab's folder connector and Share button). */
  function settingsFile() {
    const prof = ulyOS.security.profile();
    const data = {
      format: 'ulyOS-settings', v: 1, exported: new Date().toISOString(), profile: prof ? prof.name : '',
      settings: { ...settings, wallpaperCustom: String(settings.wallpaperCustom || '').startsWith('opfs:') ? '' : settings.wallpaperCustom },
      icons: Desktop.icons.map((i) => ({ id: i.id, kind: i.kind, name: i.name, url: i.url, mode: i.mode, col: i.col, row: i.row, folder: i.folder })),
      widgets: ulyOS.Widgets.exportList(),   // positions / sizes only — note text is private and never exported
    };
    if (String(settings.wallpaperCustom || '').startsWith('opfs:') && settings.wallpaper === 'custom') data.settings.wallpaper = 'void';
    return { data, blob: new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), name: 'ulyOS-settings-' + (prof ? prof.name.replace(/[^\w.-]+/g, '_') : 'profile') + '-' + ulyOS.util.stamp() + '.json' };
  }
  function exportSettings() {
    const { data, blob, name } = settingsFile();
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    ulyOS.audit('Settings exported (' + Object.keys(data.settings).length + ' options, ' + data.icons.length + ' desktop icons)', 'ok');
    ui.toast('Settings exported — import the file on another device to copy this setup', { type: 'ok', timeout: 4500 });
  }
  async function importSettings(file) {
    let obj;
    try { obj = JSON.parse(await file.text()); } catch { ui.toast('That file is not valid JSON — import the .json file exported from Settings (not a .ulyprofile backup or a .zip)', { type: 'err', timeout: 7000 }); return; }
    if (!obj || obj.format !== 'ulyOS-settings' || typeof obj.settings !== 'object' || !obj.settings) { ui.toast(obj && obj.format === 'ulyOS-profile' ? 'That is an encrypted profile backup. Restore it from the profile screen (Add profile → Import encrypted backup)' : 'This file is not a ulyOS settings export (it should contain format “ulyOS-settings”)', { type: 'err', timeout: 7000 }); return; }
    const clean = sanitizeSettings(obj.settings);
    const icons = sanitizeIcons(obj.icons);
    const ok = await ui.confirm({
      title: 'Import settings?', okText: 'Import',
      message: 'Applies ' + Object.keys(clean).length + ' options' + (icons ? ' and the layout of ' + icons.length + ' desktop icons' : '') + (obj.profile ? ' exported from “' + String(obj.profile).slice(0, 30) + '”' : '') + '. Files, passwords and app data are not touched.',
    });
    if (!ok) return;
    eff = {};
    Settings.patch(clean);
    if (icons) { Desktop.icons = icons; saveIcons(); Desktop.render(); }
    if (Array.isArray(obj.widgets)) ulyOS.Widgets.importList(obj.widgets);
    await applyWallpaper();
    ulyOS.audit('Settings imported (' + Object.keys(clean).length + ' options' + (icons ? ', ' + icons.length + ' icons' : '') + ')', 'ok');
    ui.toast('Settings imported', { type: 'ok' });
  }

  /* ---- About tab: what it is, diagnostics, privacy notes and the full version history ---- */
  function aboutSection() {
    const wrap = h('div', {});
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const diag = () => [
      ['Version', 'ulyOS ' + ulyOS.version],
      ['Build', ulyOS.config.OFFLINE ? 'Offline (nothing is sent anywhere)' : 'Online — ' + location.host + location.pathname],
      ['Secure context (encryption)', window.isSecureContext ? 'yes' : 'NO — HTTPS or localhost required'],
      ['Private file system (OPFS)', ulyOS.FS.roots.sandbox.handle ? 'ready' : 'unavailable'],
      ['File writing', typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype ? 'native' : 'worker fallback (Safari / iOS)'],
      ['Folder picker', window.showDirectoryPicker ? 'supported' : 'not supported'],
      ['Display mode', standalone ? 'installed app' : 'browser tab'],
      ['Viewport', window.innerWidth + '×' + window.innerHeight + ' @' + (window.devicePixelRatio || 1) + 'x · ' + (ulyOS.WM.compact() ? 'phone layout' : 'desktop layout') + ' · ' + (ulyOS.util.isTouch() ? 'touch' : 'mouse')],
      ['Profile vault', 'encrypted (AES-256-GCM)'],
      ['Browser', navigator.userAgent.replace(/\s+/g, ' ').slice(0, 110)],
    ];
    const table = h('div', { class: 'about-diag mono' });
    const paint = () => table.replaceChildren(...diag().map(([k, v]) => h('div', { class: 'ad-row' }, h('span', { text: k }), h('b', { text: v }))));
    paint();
    navigator.storage?.estimate?.().then((e) => { table.append(h('div', { class: 'ad-row' }, h('span', { text: 'Storage used' }), h('b', { text: fmtBytes(e.usage) + ' of ' + fmtBytes(e.quota) }))); }).catch(() => {});
    navigator.serviceWorker?.getRegistration?.().then((r) => { table.append(h('div', { class: 'ad-row' }, h('span', { text: 'Offline cache (service worker)' }), h('b', { text: r ? 'active' : 'not installed' }))); }).catch(() => {});
    const log = ulyOS.CHANGELOG.map((c, i) => h('div', { class: 'cl' + (i === 0 ? ' latest' : '') },
      h('div', { class: 'cl-head' }, h('b', { class: 'mono', text: 'v' + c.v }), h('span', { class: 'cl-date mono', text: c.d }), i === 0 ? h('span', { class: 'cl-tag', text: 'current' }) : null),
      h('ul', {}, c.n.map((x) => h('li', { text: x })))));
    wrap.append(
      h('div', { class: 'about-hero' }, h('div', { class: 'about-logo', html: '<svg viewBox="0 0 80 80" width="44" height="44"><circle cx="40" cy="40" r="28" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="40" cy="40" r="5" fill="currentColor"/></svg>' }),
        h('div', {}, h('div', { class: 'about-name', html: 'uly<span>OS</span>' }), h('div', { class: 'mono about-ver', text: 'version ' + ulyOS.version + ' · ' + ulyOS.CHANGELOG[0].d + ' · ' + (ulyOS.config.OFFLINE ? 'offline build' : 'online build') }), h('div', { class: 'btn-row', style: { marginTop: '8px' } }, h('button', { class: 'btn sm', text: '🧭 Guided tour', onclick: () => ulyOS.tour.start() }), h('button', { class: 'btn sm', text: 'Welcome screen', onclick: () => ulyOS.tour.welcome(true) })))),
      h('h3', { text: 'Why ulyOS' }),
      h('div', { class: 'why' }, [
        ['🔒 Private by design', 'Everything you keep is encrypted at rest with a key only you hold (password, or fingerprint / passkey). There is no account and no ulyOS server, so there is nothing for anyone else to breach, read or sell.'],
        ['🌐 Nothing to install, works anywhere', 'It is a web page: open it on a laptop, tablet or phone. An offline build runs without internet, and encrypted sync keeps your devices identical when you want that.'],
        ['🧰 One tidy workspace', 'Encrypted files, a password and key generator, QR tools, a crypto guide, widgets, voice (Speak) and Gemini Live — instead of a dozen tabs and accounts.'],
        ['🤝 Move data without the cloud', 'Beam sends files and settings device-to-device, end-to-end encrypted. Sync can use your own drive or network share. Only encrypted data ever leaves the device.'],
        ['🔍 Transparent and tested', 'Open source, no trackers, a visible audit log, a strict Content-Security-Policy and automated tests on every change.'],
        ['👥 Good for', 'People handling sensitive documents, shared or borrowed computers (each profile is separately encrypted), travellers who need an offline copy, and anyone who wants control over their own data.'],
      ].map(([t, d]) => h('div', { class: 'why-card' }, h('b', { text: t }), h('p', { text: d })))),
      h('p', { class: 'set-desc about-p', text: 'A private, browser-based operating system in vanilla HTML, CSS and JavaScript — no frameworks, no build step, no server. Everything runs on your device.' }),
      h('h3', { text: 'Security model' }),
      h('p', { class: 'set-desc about-p', text: 'Each profile’s vault (settings, layout, audit log, app data, notes) is encrypted with AES-256-GCM using a key derived by PBKDF2-SHA256 (600,000 iterations). The key is non-extractable and lives only in memory while you are signed in. There is no recovery: a forgotten password cannot be reset, so keep an encrypted backup. Typed or generated secrets can be wiped at any time with Purge memory.' }),
      h('h3', { text: 'Network & privacy' }),
      h('p', { class: 'set-desc about-p', text: ulyOS.config.OFFLINE ? 'This is the offline build: it sends nothing anywhere. Widgets that fetch public data (crypto, scores, headlines, markets) only work while you are online and only while the widget exists.' : 'The online build sends only (1) a Contact Admin message when you press Send, and (2) a notice to the site admin when a profile is created — profile name, whether it is password-protected, the optional email you typed, time, site, language and time zone; never passwords, keys, files or app data. Data widgets call public APIs (CoinGecko, ESPN, Polymarket, Wikipedia, Hacker News) only while the widget exists.' }),
      h('h3', { text: 'Limits you should know' }),
      h('p', { class: 'set-desc about-p', text: 'The browser and operating system must be trustworthy — malware or a hostile extension can read the page. Sandbox files are isolated per profile but not encrypted unless you encrypt them (Files → Encrypt…). PINs are weak against offline guessing. RAM and CPU in the Task Manager are simulations. Pages on the same ulyweb.github.io origin share browser storage, so use a password on any profile that matters.' }),
      h('h3', { text: 'Bundled apps' }),
      h('p', { class: 'set-desc about-p', text: 'QR Seal (ulyweb/qrcode), System Vault (ulyweb/key), Crypto Compass (ulyweb/crypto) and TrustVault run inside ulyOS windows; their storage is redirected into your encrypted vault.' }),
      h('h3', { text: 'Diagnostics' }), table,
      h('div', { class: 'set-tools' },
        h('button', { class: 'btn sm', html: icon('copy', 14) + ' Copy diagnostics', onclick: async () => { try { await navigator.clipboard.writeText('ulyOS diagnostics\n' + diag().map(([k, v]) => k + ': ' + v).join('\n')); ui.toast('Diagnostics copied — paste it into a bug report', { type: 'ok' }); } catch { ui.toast('Could not copy', { type: 'err' }); } } }),
        h('button', { class: 'btn sm', html: icon('refresh', 14) + ' Refresh', onclick: () => { paint(); ui.toast('Refreshed', { timeout: 1200 }); } })),
      h('h3', { text: 'Version history' }), h('div', { class: 'changelog' }, log));
    return wrap;
  }

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
    const landTiles = h('div', {});
    const photoBox = h('div', {});
    const paintPhotos = (open) => {
      const L = ulyOS.landscapes;
      if (ulyOS.config.OFFLINE) { photoBox.replaceChildren(h('p', { class: 'set-desc', text: 'Photos are loaded from Wikimedia Commons, so they are not available in the offline build. Use "Image from your computer" to add your own.' })); return; }
      if (!open) { photoBox.replaceChildren(h('p', { class: 'set-desc', text: L.photos.length + ' real photographs: cities at night, misty forests, mountains, coast, desert, aurora, the Milky Way and NASA space imagery (public domain or CC0, so no attribution is needed). They are not stored in ulyOS: when you open this list or pick one, your browser fetches a resized copy from commons.wikimedia.org.' }), h('button', { class: 'btn sm', text: 'Show photos…', onclick: () => paintPhotos(true) })); return; }
      const tile = (p) => h('button', {
        class: 'wp-tile' + (settings.wallpaper === 'photo:' + p.key ? ' active' : ''), title: p.label + ' — ' + p.credit,
        onclick: () => { eff = {}; Settings.set('wallpaper', 'photo:' + p.key); applyWallpaper(); paintPhotos(true); paintTiles(); ulyOS.audit("Wallpaper changed to photo '" + p.label + "' (" + p.credit + ')', 'info'); },
      }, h('div', { class: 'wp-thumb', style: { backgroundImage: 'url("' + L.photoUrl(p.key, 320) + '")', backgroundSize: 'cover', backgroundPosition: 'center' } }), h('span', { text: p.label }));
      // one collapsible section per theme; thumbnails are requested only when a section is opened (kind to Wikimedia)
      const sections = L.photoGroups.map(([title, items], i) => {
        const list = h('div', { class: 'wp-list' }), det = h('details', { class: 'wp-det' }, h('summary', { class: 'wp-grp', text: title + ' (' + items.length + ')' }), list);
        const fill = () => { if (!list.childElementCount) list.replaceChildren(...items.map(tile)); };
        det.addEventListener('toggle', () => { if (det.open) fill(); });
        if (items.some((p) => settings.wallpaper === 'photo:' + p.key) || (i === 0 && !settings.wallpaper.startsWith('photo:'))) { det.open = true; fill(); }
        return det;
      });
      photoBox.replaceChildren(...sections, h('p', { class: 'set-desc', text: 'Credits: NASA, NOAA, the US National Park Service, and CC0 photographers on Wikimedia Commons. Hover a photo for its source.' }));
    };
    paintPhotos(settings.wallpaper.startsWith('photo:'));
    const paintTiles = () => {
      const randTile = h('button', {
        class: 'wp-tile rand' + (settings.wallpaper === 'random' ? ' active' : ''), title: 'A different wallpaper every sign-in',
        onclick: () => { Settings.set('wallpaper', 'random'); eff = {}; applyWallpaper(); paintTiles(); ulyOS.audit('Wallpaper set to random on each sign-in', 'info'); },
      }, h('div', { class: 'wp-thumb' }, '🎲'), h('span', { text: 'Random' }));
      const GROUPS = (ulyOS.landscapes && ulyOS.landscapes.groups) || [['Nature & landscapes', LANDS]];
      landTiles.replaceChildren(...GROUPS.flatMap(([title, items]) => [h('h3', { text: title }), h('div', { class: 'wp-list' }, items.map(([id, label]) => h('button', {
        class: 'wp-tile' + (settings.wallpaper === 'land:' + id ? ' active' : ''), title: label,
        onclick: () => { eff = {}; Settings.set('wallpaper', 'land:' + id); applyWallpaper(); paintTiles(); ulyOS.audit("Wallpaper changed to '" + label + "'", 'info'); },
      }, h('div', { class: 'wp-thumb', style: { backgroundImage: 'url("' + ulyOS.landscapes.url(id) + '")', backgroundSize: 'cover', backgroundPosition: 'center' } }), h('span', { text: label }))))]));
      tiles.replaceChildren(randTile, ...WALLPAPERS.map(([id, label]) => h('button', {
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
    })), h('button', { class: 'btn sm', text: '🎲', title: 'Random accent', onclick: () => { Settings.set('accent', hslHex(Math.floor(Math.random() * 360), 78, 68)); paintSw(); } }));
    paintSw();
    const choose = (key, list, extraRandom, after) => h('select', { class: 'input sm', onchange: (e) => { eff = {}; Settings.set(key, e.target.value); if (key === 'wallpaper') applyWallpaper(); after?.(); ulyOS.audit('Setting ' + key + ' → ' + e.target.value, 'info'); } },
      list.map(([v, l]) => h('option', { value: v, text: l, selected: settings[key] === v })).concat(extraRandom ? [h('option', { value: 'random', text: '🎲 ' + extraRandom, selected: settings[key] === 'random' })] : []));
    const tryAnim = () => {
      const w = WM.open({ title: 'Animation preview', width: 320, height: 150, mem: 4, resizable: false,
        content: h('div', { style: { padding: '30px', textAlign: 'center', color: 'var(--muted)' } }, 'Style: ', h('b', { text: '…' })) });
      w.body.querySelector('b').textContent = w.el.dataset.anim;
      setTimeout(() => WM.close(w, { force: true }), 1500);
    };

    const seg = (key, opts) => {
      const w = h('div', { class: 'seg' });
      const paint = () => w.replaceChildren(...opts.map((o) => h('button', { class: settings[key] === o ? 'active' : '', text: o[0].toUpperCase() + o.slice(1), onclick: () => { Settings.set(key, o); paint(); } })));
      paint(); return w;
    };

    const storageEl = h('div', { class: 'storage-box' });
    const paintStorage = async () => {
      let e = null, persisted = null;
      try { e = await navigator.storage.estimate(); persisted = await navigator.storage.persisted(); } catch { /* unsupported */ }
      if (!e) { storageEl.replaceChildren(h('span', { class: 'mono', text: 'n/a' })); return; }
      const pct = Math.max(0.5, Math.min(100, (e.usage / e.quota) * 100));
      storageEl.replaceChildren(
        h('span', { class: 'mono', text: fmtBytes(e.usage) + ' used of ' + fmtBytes(e.quota) + ' (' + pct.toFixed(pct < 1 ? 2 : 1) + '%)' }),
        h('div', { class: 'stor-bar' }, h('i', { style: { width: pct + '%' } })),
        h('div', { class: 'btn-row' },
          h('span', { class: 'set-desc', text: persisted ? '✓ The browser has promised to keep your data' : 'The browser may clear this data if the disk fills up' }),
          persisted ? null : h('button', { class: 'btn sm', text: 'Keep my data', title: 'Ask the browser for persistent storage', onclick: async () => { const ok = await navigator.storage.persist?.(); ui.toast(ok ? 'Persistent storage granted' : 'The browser declined (it decides by how much you use the site; installing ulyOS as an app helps)', { type: ok ? 'ok' : 'info', timeout: 5000 }); paintStorage(); } })));
    };
    paintStorage();

    const FX_DEFAULTS = { fxAurora: 65, fxTilt: 0, fxAnim: true, fxGlow: 55, iconScale: 100, fxScan: false, blur: 24, glassAlpha: 0.72, depth: 50, sfx: true, sfxVolume: 35, cursorSize: 100 };
    let currentTab = startTab;
    const buildEffects = () => h('div', {},
      h('h3', { text: 'Animations' }),
      row('UI animations', 'Window open/close/minimize, boot sequence, animated wallpapers', sw('animations')),
      row('Window animation', 'How windows appear and close — “Random” picks a style for every window', h('div', { class: 'btn-row' }, choose('animStyle', ANIM_STYLES, 'Random per window'), h('button', { class: 'btn sm', text: 'Try', onclick: tryAnim }))),
      row('Animation speed', 'Slower ← → faster', range('animSpeed', 0.5, 2, 0.25, (v) => v + '×')),
      row('Boot animation', 'Show the full boot log on restart', sw('bootAnim')),
      h('h3', { text: 'Telemetry FX' }),
      row('Aurora intensity', 'Soft animated glow floating over the wallpaper', range('fxAurora', 0, 100, 1, (v) => v)),
      row('3D tilt (deg)', 'Widgets, desktop icons and profile cards lean toward the pointer', range('fxTilt', 0, 10, 1, (v) => v + '°')),
      row('FX animation', 'Ambient motion: aurora drift, icon float, animated icon artwork and wallpapers', sw('fxAnim')),
      row('Toolbar glow', 'Accent glow around the dock, taskbar and menu bar', range('fxGlow', 0, 100, 1, (v) => v)),
      row('Icon scale %', 'Size of the desktop icons', range('iconScale', 60, 150, 5, (v) => v + '%')),
      row('CRT scanlines', 'Retro scanline overlay across the whole screen', sw('fxScan')),
      row('Glass blur (px)', 'Backdrop blur behind windows, widgets and the dock', range('blur', 0, 40, 2, (v) => v + 'px')),
      row('Panel fill %', 'Window opacity — lower values reveal more of the wallpaper', range('glassAlpha', 0.4, 0.98, 0.02, (v) => Math.round(v * 100))),
      row('Depth (shadow) %', 'Strength of the shadows under windows, widgets and the dock', range('depth', 0, 100, 1, (v) => v)),
      row('Sound effects', 'Soft synthesized sounds for windows, notifications, lock and purge (no audio files)', sw('sfx')),
      row('Sound volume', null, h('div', { class: 'btn-row' }, range('sfxVolume', 0, 100, 1, (v) => v), h('button', { class: 'btn sm', text: 'Test', onclick: () => ulyOS.fx.sound('ok') }))),
      h('div', { class: 'set-tools' }, h('button', { class: 'btn', text: 'Reset FX to defaults', onclick: () => { Settings.patch(FX_DEFAULTS); ui.toast('FX reset to defaults', { type: 'ok', timeout: 1800 }); rebuildEffects(); } })),
      h('h3', { text: 'Pointer' }),
      row('Custom cursor', 'SVG cursor with a trailing ring (not shown inside embedded apps)', sw('cursor')),
      row('Cursor style', '“Random” picks one each sign-in; the accent color tints Neon, Dot and Crosshair', choose('cursorStyle', CURSOR_STYLES, 'Random each sign-in')),
      row('Pointer size', 'Scales the cursor and its trailing ring', range('cursorSize', 60, 250, 10, (v) => v + '%')),
      row('Pointer color', 'Tints the cursor and its ring. “Follow accent” uses your accent color', (() => {
        const ci = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(settings.cursorColor) ? settings.cursorColor : settings.accent, oninput: (e) => Settings.set('cursorColor', e.target.value) });
        return h('div', { class: 'btn-row' }, ci, h('button', { class: 'btn sm', text: 'Follow accent', onclick: () => { Settings.set('cursorColor', ''); ci.value = settings.accent; } }),
          h('button', { class: 'btn sm', text: '🎲', title: 'Random color', onclick: () => { const c = hslHex(Math.floor(Math.random() * 360), 85, 62); Settings.set('cursorColor', c); ci.value = c; } }));
      })()));
    const rebuildEffects = () => { sections.effects = buildEffects(); if (currentTab === 'effects') show('effects'); };

    const sections = {
      appearance: h('div', {},
        h('div', { class: 'set-tools' },
          h('button', { class: 'btn primary', text: '🎲 Surprise me', title: 'Randomise wallpaper, accent, cursor, icons and animations', onclick: () => { surprise(true); paintTiles(); paintSw(); show('appearance'); } }),
          h('button', { class: 'btn', text: 'Shuffle wallpaper', onclick: () => { Settings.set('wallpaper', rnd(POOLS.wallpaper)); applyWallpaper(); paintTiles(); } })),
        row('Surprise me on every sign-in', 'Pick a fresh random wallpaper, accent, cursor, icon and animation style each time you sign in', sw('shuffleOnLogin')),
        h('h3', { text: 'Wallpaper' }), tiles,
        landTiles,
        h('h3', { text: 'Real photos (NASA & public domain)' }),
        photoBox,
        row('Find more wallpapers', 'Opens in a new tab. Download an image, then use “Image from your computer” below. Each site has its own licence: check it before sharing', h('div', { class: 'btn-row' }, ...[['Magnific (AI)', 'https://www.magnific.com/free-photos-vectors/ai-wallpaper'], ['Unsplash', 'https://unsplash.com/s/photos/wallpaper'], ['Pexels', 'https://www.pexels.com/search/wallpaper/'], ['NASA images', 'https://images.nasa.gov/']].map(([t, u]) => h('a', { class: 'btn sm', href: u, target: '_blank', rel: 'noopener noreferrer', text: t })))),
        row('Solid color', 'Pick any flat background color', colorIn),
        row('Image from your computer', 'Stored in the sandbox filesystem (Wallpapers/)', h('button', { class: 'btn sm', html: icon('upload', 14) + ' Choose image…', onclick: () => fileIn.click() })),
        row('Image from URL', null, h('div', { class: 'inline-form' }, urlIn, h('button', { class: 'btn sm', text: 'Apply', onclick: () => {
          const u = normalizeUrl(urlIn.value);
          if (!u) { ui.toast('Enter a valid image URL', { type: 'err' }); return; }
          Settings.set('wallpaperCustom', u); Settings.set('wallpaper', 'custom'); applyWallpaper(); paintTiles();
          ulyOS.audit('Wallpaper set from ' + hostName(u), 'info');
        } }))),
        h('h3', { text: 'Accent color' }), swatches,
        h('h3', { text: 'Theme' }),
        row('Dark / light', 'Also switchable with the sun / moon button next to the clock. “Auto” follows your device', choose('theme', [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Auto (follow device)']])),
        h('h3', { text: 'Text' }),
        row('Font', 'Applies to the whole interface. These are fonts already on your device, so nothing is downloaded', choose('fontFamily', FONTS)),
        row('Text size', 'Scales every label, menu and window (13 is the default)', range('fontSize', 10, 22, 1, (v) => v + ' px')),
        row('Weight', null, h('select', { class: 'input sm', onchange: (e) => Settings.set('fontWeight', +e.target.value) }, [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semi-bold'], [700, 'Bold']].map(([v, l]) => h('option', { value: v, text: l, selected: +settings.fontWeight === v })))),
        row('Style', null, choose('fontStyle', [['normal', 'Normal'], ['italic', 'Italic']])),
        h('div', { class: 'set-desc', style: { padding: '8px 2px', fontSize: 'calc(15px * var(--fscale, 1))' }, text: 'The quick brown fox jumps over the lazy dog — 0123456789' }),
        h('div', { class: 'set-tools' }, h('button', { class: 'btn', text: 'Reset text to defaults', onclick: () => { Settings.patch({ fontFamily: 'system', fontSize: 13, fontWeight: 400, fontStyle: 'normal' }); const w = WM.byApp('settings')[0]; if (w) WM.close(w, { force: true }); SettingsApp.open('appearance'); } })),
        h('h3', { text: 'Widgets' }),
        row('Widget style', 'Vivid gives every widget its own colors and glow; Glass keeps them neutral', choose('widgetStyle', [['vivid', 'Vivid (colorful)'], ['glass', 'Glass (neutral)']])),
        fileIn),
      effects: buildEffects(),
      desktop: h('div', {},
        h('h3', { text: 'Icons' }),
        row('Icon size', null, seg('iconSize', ['small', 'medium', 'large'])),
        row('Full-colour app icons', 'Detailed, multi-colour icons like a modern desktop system. Turn off to use the flat style chosen below for every icon', sw('richIcons', () => { Desktop.render(); ulyOS.Shell?.layout?.(); bus.emit('settings:change', { key: 'richIcons' }); })),
        row('Icon style', 'Look of the desktop icon tiles — “Random” picks one each sign-in', choose('iconStyle', ICON_STYLES, 'Random each sign-in')),
        row('Fetch website favicons', 'Custom shortcuts request a favicon from Google’s favicon service', sw('favicons', () => Desktop.render())),
        row('Auto-arrange', 'Pack icons into the grid from the top-left', h('button', { class: 'btn sm', text: 'Arrange now', onclick: autoArrange })),
        row('Restore stock icons', 'Bring back deleted default icons', h('button', { class: 'btn sm', text: 'Restore', onclick: () => { missingDefaults().length ? restoreDefaults() : ui.toast('All stock icons are already on the desktop'); } })),
        h('div', { class: 'set-desc', text: 'Clock, date and time format: Settings → Dock & Menu Bar → Date & time.' })),
      widgets: ulyOS.Widgets.settingsSection({ row, sw, choose }),
      shell: ulyOS.Shell.settingsSection({ row, sw, range, choose }),
      security: securitySection(),
      sync: ulyOS.sync.settingsSection({ row }),
      about: aboutSection(),
      system: h('div', {},
        h('h3', { text: 'Storage' }),
        row('Browser storage', 'What this site uses on your device, against the share the browser grants it', storageEl),
        h('details', { class: 'howto' }, h('summary', { text: 'Why “10 GB”? Can I change it?' }),
          h('p', { html: 'The limit is <b>not set by ulyOS</b>. It is the <b>quota your browser gives this website</b>, worked out from the free space on your disk (Chrome and Edge allow a site up to roughly 60% of the disk; Safari and Firefox use their own, usually smaller, rules). That is why the number differs between computers and changes as your disk fills or empties.' }),
          h('p', { html: '<b>What counts:</b> your sandbox files (stored encrypted), the encrypted profile vault, and the offline cache of the ulyOS files themselves. Folders you open from your computer (“Open folder…”) are real files on your disk and are <b>not</b> counted.' }),
          h('p', { html: '<b>Can it be changed?</b> A web page cannot raise or lower it. You can: free space on your disk (the quota grows), delete files in Files, or use “Keep my data” so the browser will not evict it. To start clean, your browser’s “Clear site data” for this site erases everything — export a backup first.' })),
        row('Open Task Manager', 'Live RAM / CPU simulation and the audit trail', h('button', { class: 'btn sm', text: 'Open', onclick: () => ulyOS.Telemetry.open() })),
        h('h3', { text: 'Maintenance' }),
        row('Reset settings', 'Restore appearance and behaviour defaults', h('button', { class: 'btn sm', text: 'Reset', onclick: async () => {
          if (await ui.confirm({ title: 'Reset settings?', message: 'Appearance and behaviour return to defaults. Files are not touched.', okText: 'Reset' })) { Settings.reset(); ulyOS.audit('Settings reset to defaults', 'warn'); show('appearance'); paintTiles(); paintSw(); }
        } })),
        ulyOS.offline && ulyOS.offline.canQuit() ? row('Quit ulyOS', 'Saves everything, stops the local Python server and ends the session — then close the tab', h('button', { class: 'btn sm danger', text: 'Quit…', onclick: () => ulyOS.offline.quit() })) : null,
        row('Guided tour', 'A short walkthrough of what ulyOS can do', h('button', { class: 'btn sm', text: 'Start tour', onclick: () => ulyOS.tour.start() })),
        row('Show the welcome screen on every sign-in', 'Off: it appears only the first time (replay it any time from Help)', sw('welcomeAlways')),
        row('Restart ulyOS', 'Close all windows and replay the boot sequence', h('button', { class: 'btn sm', text: 'Restart', onclick: restart })),
        ulyOS.config.OFFLINE ? null : row('Offline version', 'Download a .zip you can run without the internet (no admin contact, nothing is sent anywhere)', h('button', { class: 'btn sm', html: icon('download', 14) + ' Download .zip', onclick: () => ulyOS.offline.download() })),
        ulyOS.admin.enabled() ? row('Contact Admin', 'Send a message to the person who runs this site', h('button', { class: 'btn sm', html: icon('mailSend', 14) + ' Write message', onclick: () => ulyOS.admin.contact() })) : null,
        h('div', { class: 'set-desc', style: { marginTop: '16px' }, text: 'Version history, diagnostics and the privacy notes are in the About tab.' })),
    };
    const navDefs = [['appearance', 'palette', 'Appearance'], ['effects', 'sliders', 'Effects'], ['desktop', 'desktop', 'Desktop'], ['widgets', 'clock', 'Widgets'], ['shell', 'grid', 'Dock & Menu bar'], ['security', 'shield', 'Security'], ['sync', 'refresh', 'Sync'], ['system', 'cpu', 'System'], ['about', 'info', 'About']];
    const navBtns = {};
    const content = h('div', { class: 'set-content' });
    function show(id) {
      currentTab = id;
      Object.entries(navBtns).forEach(([k, b]) => b.classList.toggle('active', k === id));
      content.replaceChildren(sections[id]); content.scrollTop = 0;
    }
    win.showTab = show;
    const nav = h('nav', { class: 'set-nav' }, navDefs.map(([id, ico, label]) => (navBtns[id] = h('button', { class: 'place', html: icon(ico, 16) + '<span>' + label + '</span>', onclick: () => show(id) }))));
    show(startTab);

    /* footer: autosave status + save / export / import */
    const saved = h('span', { class: 'set-saved' }, h('b', { text: '✓' }), ' All changes are saved automatically to this profile');
    const stamp = () => { saved.replaceChildren(h('b', { text: '✓' }), ' Saved ' + ulyOS.util.fmtTime(Date.now()) + ' · stored in this profile' + (ulyOS.security.isProtected() ? ' (encrypted)' : '')); };
    const offs = bus.on('settings:change', stamp);
    win.onClose = () => offs();
    const importIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) await importSettings(f); } });
    const snapshot = Settings.all();
    const undo = h('button', { class: 'btn sm', html: icon('refresh', 14) + ' Undo changes', title: 'Put every setting back to how it was when this window opened', onclick: async () => {
      eff = {}; Settings.patch(snapshot); await applyWallpaper();
      ui.toast('Settings restored to how they were when you opened this window', { type: 'ok' });
      const t = currentTab; await WM.close(win, { force: true }); SettingsApp.open(t);
    } });
    const foot = h('div', { class: 'set-foot' }, saved, h('span', { class: 'grow' }), undo,
      h('button', { class: 'btn sm', html: icon('save', 14) + ' Save now', title: 'Write everything to the profile vault immediately', onclick: async () => { await ulyOS.vault.flush(); stamp(); ui.toast('Saved', { type: 'ok', timeout: 1600 }); } }),
      h('button', { class: 'btn sm', html: icon('download', 14) + ' Export settings', title: 'Download appearance, dock and icon layout as a file', onclick: exportSettings }),
      h('button', { class: 'btn sm', html: icon('upload', 14) + ' Import settings', title: 'Load a settings file exported from another device', onclick: () => importIn.click() }), importIn);
    return h('div', { class: 'settings' }, nav, h('div', { class: 'set-main' }, content, foot));
  }

  /* ==========================================================================
     Start-up
     ========================================================================== */
  /* Runs once a profile has signed in (security.js emits session:start). */
  function startSession() {
    settings = { ...DEFAULT_SETTINGS, ...store.get('ulyos.settings', {}) };
    if (!store.get('ulyos.migr.defaults2', false)) {   // one-time: new defaults (seconds clock, floating dock, colorful icons)
      Object.assign(settings, { clockSeconds: true, taskbarMode: 'dock', iconStyle: 'vivid' });
      store.set('ulyos.settings', settings); store.set('ulyos.migr.defaults2', true);
    }
    if (!store.get('ulyos.migr.defaults3', false)) {   // one-time: menu bar on, dock size 60, auto-hide on
      Object.assign(settings, { menubar: true, taskbarSize: 60, taskbarAutoHide: true });
      store.set('ulyos.settings', settings); store.set('ulyos.migr.defaults3', true);
    }
    if (!store.get('ulyos.migr.defaults4', false)) {   // one-time: 12-hour clock + neon cursor
      Object.assign(settings, { clockFormat: '12', cursorStyle: 'neon' });
      store.set('ulyos.settings', settings); store.set('ulyos.migr.defaults4', true);
    }
    if (!store.get('ulyos.migr.wpForest', false)) {   // one-time: the untouched default wallpaper becomes Misty forest
      if (settings.wallpaper === 'void') settings.wallpaper = 'land:forest';
      store.set('ulyos.settings', settings); store.set('ulyos.migr.wpForest', true);
    }
    if (!store.get('ulyos.migr.wp119', false)) {   // one-time: drawn space / anime / futuristic scenes were retired
      if (ulyOS.landscapes && ulyOS.landscapes.removed(settings.wallpaper)) settings.wallpaper = 'land:forest';
      store.set('ulyos.settings', settings); store.set('ulyos.migr.wp119', true);
    }
    if (!store.get('ulyos.migr.layout2s', false)) {   // one-time: classic taskbar, always visible, four pinned tools
      Object.assign(settings, { taskbarMode: 'bar', taskbarAutoHide: false, pinned: ['settings', 'beam', 'files', 'taskmgr'] });
      store.set('ulyos.settings', settings); store.set('ulyos.migr.layout2s', true);
    }
    if (settings.shuffleOnLogin) surprise(false);
    applySettings();
    Desktop.init();
    ulyOS.Widgets.init();
    ulyOS.Shell.init();
    boot(true);
  }
  function init() {
    if (ulyOS.fx) ulyOS.fx.init();
    let wasCompact = ulyOS.WM.compact();
    window.addEventListener('resize', () => { const c = ulyOS.WM.compact(); if (c !== wasCompact) { wasCompact = c; applySettings(); } });
    applySettings();   // defaults — gives the profile screen the custom cursor + glass look
    Cursor.init();
    bus.on('session:start', startSession);
    bus.on('session:start', () => applyTheme());
  }
  /** Shared with js/shell.js (taskbar, dock, menu bar, start menu). */
  function catalog() {
    const out = [];
    Object.entries(SYS_APPS).forEach(([k, a]) => out.push({ id: k, name: a.name, rec: { id: k, kind: 'sys', sys: k, name: a.name }, appId: k, run: a.open }));
    const seen = new Set(out.map((o) => o.id));
    [...DEFAULT_ICONS.filter((d) => d.kind !== 'sys'), ...Desktop.icons.filter((i) => i.kind !== 'sys')].forEach((r) => {
      if (seen.has(r.id)) return;
      seen.add(r.id);
      const live = Desktop.icons.find((i) => i.id === r.id) || r;
      out.push({ id: r.id, name: live.name, rec: live, appId: 'web:' + r.id, run: () => launch(live) });
    });
    return out;
  }
  ulyOS.desktopApi = { settingsFile, importSettings: (f) => importSettings(f), addIcon: (rec) => addIcon(rec), hasIcon: (id) => Desktop.icons.some((i) => i.id === id), removeIcon: (id) => { Desktop.icons = Desktop.icons.filter((i) => i.id !== id); saveIcons(); Desktop.render(); }, hostName, launch, catalog, LANDSCAPES: LANDS, iconGradient: gradientOf, exportSettings, newShortcut: () => shortcutDialog(null), iconHTML, lockNow, restart, surprise, openSettings: (t) => SettingsApp.open(t), WALLPAPERS, applyWallpaper, Settings, setWallpaper: (id) => { eff = {}; Settings.set('wallpaper', id); applyWallpaper(); }, SYS_APPS };
  ulyOS.restart = restart;
  ulyOS.launch = launch;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
