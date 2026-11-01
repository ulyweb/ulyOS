/* ==========================================================================
   ulyOS · js/shell.js
   Customisable shell chrome — macOS / iPadOS style:
     • Taskbar or floating dock at the bottom / top / left / right, auto-hide,
       icon magnification, pinned apps with running indicators
     • Optional menu bar (logo menu, app name, File / View / Window / Help,
       status items: RAM, profile, clock)
     • Start menu, tray, and the "Dock & Menu bar" settings panel
   ========================================================================== */
(function () {
  'use strict';

  const { h, icon, clamp, pad2, dur, animOn, fmtClock } = ulyOS.util;
  const { WM, ui, bus } = ulyOS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const API = () => ulyOS.desktopApi;
  const get = (k) => API().Settings.get(k);
  const Shell = (ulyOS.Shell = {});

  const LAYOUT_DEFAULTS = {
    taskbarMode: 'dock', taskbarPos: 'bottom', taskbarSize: 60, taskbarAutoHide: true, taskbarMagnify: true, taskbarLabels: true,
    showRam: true, showClock: true, menubar: true, menubarStyle: 'glass', pinned: ['files', 'taskmgr', 'settings'],
  };

  /* ------------------------------------------------------------------------
     Layout: insets, positions, auto-hide, tray placement
     ------------------------------------------------------------------------ */
  /* Safe-area insets (iPhone notch / home indicator, rounded iPad corners) measured through a hidden probe. */
  let probe = null;
  function safeArea() {
    if (!probe) {
      probe = h('div', { 'aria-hidden': 'true', style: { position: 'fixed', left: '0', top: '0', width: '0', height: '0', visibility: 'hidden', pointerEvents: 'none', paddingTop: 'env(safe-area-inset-top)', paddingRight: 'env(safe-area-inset-right)', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)' } });
      document.body.append(probe);
    }
    const cs = getComputedStyle(probe);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }

  Shell.layout = function () {
    const tb = $('#taskbar');
    if (!tb || !API()) return;
    const mode = get('taskbarMode') === 'dock' ? 'dock' : 'bar';
    const pos = ['bottom', 'top', 'left', 'right'].includes(get('taskbarPos')) ? get('taskbarPos') : 'bottom';
    const size = clamp(+get('taskbarSize') || 52, 36, 84);
    const mb = !!get('menubar');
    const sa = safeArea();
    const mbH = (mb ? 28 : 0) + sa.t;   // menu bar (+ notch area) height
    const auto = !!get('taskbarAutoHide');
    const horizontal = pos === 'top' || pos === 'bottom';
    const thick = mode === 'dock' ? size + 12 : size;
    const item = mode === 'dock' ? size : Math.max(28, size - 16);
    const reserve = auto ? 0 : thick + (mode === 'dock' ? 20 : 0);

    root.style.setProperty('--tb-size', thick + 'px');
    root.style.setProperty('--taskbar-h', thick + 'px');
    root.style.setProperty('--tb-item', item + 'px');
    root.style.setProperty('--mb-h', mbH + 'px');
    root.style.setProperty('--sat', sa.t + 'px'); root.style.setProperty('--sab', sa.b + 'px'); root.style.setProperty('--sal', sa.l + 'px'); root.style.setProperty('--sar', sa.r + 'px');
    root.style.setProperty('--inset-top', mbH + (pos === 'top' ? reserve : 0) + 'px');
    root.style.setProperty('--inset-bottom', sa.b + (pos === 'bottom' ? reserve : 0) + 'px');
    root.style.setProperty('--inset-left', sa.l + (pos === 'left' ? reserve : 0) + 'px');
    root.style.setProperty('--inset-right', sa.r + (pos === 'right' ? reserve : 0) + 'px');

    tb.dataset.mode = mode; tb.dataset.pos = pos;
    tb.classList.toggle('autohide', auto);
    tb.classList.toggle('icons-only', mode === 'dock' || !horizontal || !get('taskbarLabels'));
    tb.classList.toggle('mag', mode === 'dock' && !!get('taskbarMagnify') && animOn());
    if (!auto) tb.classList.remove('reveal');
    document.body.classList.toggle('has-menubar', mb);
    document.body.classList.toggle('tb-autohide', auto);
    const bar = $('#menubar');
    if (bar) bar.dataset.style = get('menubarStyle') === 'solid' ? 'solid' : 'glass';

    // hot zone that reveals an auto-hidden taskbar (works over iframes too)
    const hot = $('#tb-hot');
    const t = ulyOS.util.isTouch() ? 30 : 6;   // bigger target on touch screens (it shows a grab pill there)
    hot.dataset.pos = pos;
    hot.style.cssText = pos === 'bottom' ? 'left:0;right:0;bottom:0;height:' + t + 'px'
      : pos === 'top' ? 'left:0;right:0;top:' + mbH + 'px;height:' + t + 'px'
        : pos === 'left' ? 'left:0;top:' + mbH + 'px;bottom:0;width:' + t + 'px' : 'right:0;top:' + mbH + 'px;bottom:0;width:' + t + 'px';

    // where the tray (RAM / profile / clock) lives
    const tray = $('#tb-tray');
    const host = mb ? $('#mb-right') : mode === 'dock' ? $('#tray-float') : tb;
    if (tray.parentNode !== host) { if (host === tb) tb.insertBefore(tray, $('#tb-desk')); else host.append(tray); }
    document.body.classList.toggle('tray-float', !mb && mode === 'dock');
    $('#tray-ram').classList.toggle('hidden', !get('showRam'));
    $('#tray-clock').classList.toggle('hidden', !get('showClock'));
    placeStart();
  };

  /* ------------------------------------------------------------------------
     Tray: RAM chip, profile chip, clock
     ------------------------------------------------------------------------ */
  Shell.tickClock = function () {
    const clock = $('#tray-clock');
    if (!clock) return;
    const d = new Date();
    clock.innerHTML = '<b>' + fmtClock(d, { seconds: !!get('clockSeconds'), h24: get('clockFormat') !== '12' }) +
      '</b><span>' + d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + '</span>';
  };

  /** Open a menu next to an element, above or below depending on where it sits on screen. */
  function menuNear(el, items) {
    const r = el.getBoundingClientRect();
    const below = r.top < window.innerHeight / 2;
    const m = ui.contextMenu(r.left, below ? r.bottom + 4 : r.top, items);
    if (!below) m.style.top = Math.max(8, r.top - m.offsetHeight - 6) + 'px';
    const mr = m.getBoundingClientRect();
    if (mr.right > window.innerWidth - 8) m.style.left = Math.max(8, window.innerWidth - mr.width - 8) + 'px';
  }

  function initTray() {
    const ram = $('#tray-ram');
    ram.addEventListener('click', () => ulyOS.Telemetry.open());
    bus.on('telemetry:tick', (s) => {
      ram.querySelector('.v').textContent = Math.round(s.ram) + ' MB';
      const r = clamp(s.ram / s.ramLimit, 0, 1);
      ram.querySelector('i').style.width = r * 100 + '%';
      ram.classList.toggle('warn', r > 0.6); ram.classList.toggle('bad', r > 0.8);
    });
    Shell.tickClock();
    setInterval(Shell.tickClock, 1000);

    const chip = $('#tray-user');
    const paintChip = () => {
      const p = ulyOS.security.profile();
      if (!p) return;
      chip.replaceChildren(...[h('span', { class: 'chip-av', style: { '--c': p.color }, text: p.name.trim().charAt(0).toUpperCase() }), h('span', { class: 'chip-name', text: p.name }), p.protected ? h('span', { class: 'chip-lock', html: icon('lock', 12) }) : null].filter(Boolean));
      chip.title = 'Profile: ' + p.name;
    };
    paintChip();
    bus.on('profile:change', paintChip);
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const prot = ulyOS.security.isProtected();
      menuNear(chip, [
        { label: ulyOS.security.profile().name, icon: 'home', disabled: true },
        { separator: true },
        { label: prot ? 'Lock now' : 'Set a password to enable lock…', icon: 'lock', action: API().lockNow },
        { label: 'Security settings…', icon: 'shield', action: () => API().openSettings('security') },
        { separator: true },
        { label: 'Switch profile / sign out', icon: 'power', danger: true, action: () => ulyOS.security.signOut() },
      ]);
    });
  }

  /* ------------------------------------------------------------------------
     Pinned apps + running windows
     ------------------------------------------------------------------------ */
  const els = new Map();
  let firstRender = true;

  Shell.isPinned = (id) => (get('pinned') || []).includes(id);
  Shell.togglePin = function (id) {
    const p = [...(get('pinned') || [])];
    const i = p.indexOf(id);
    const app = API().catalog().find((a) => a.id === id);
    if (i >= 0) p.splice(i, 1); else p.push(id);
    API().Settings.set('pinned', p);
    ulyOS.audit((i >= 0 ? 'Unpinned ' : 'Pinned ') + "'" + (app ? app.name : id) + "' " + (i >= 0 ? 'from' : 'to') + ' the taskbar', 'info');
    render();
  };
  Shell.movePin = function (id, d) {
    const p = [...(get('pinned') || [])];
    const i = p.indexOf(id), j = i + d;
    if (i < 0 || j < 0 || j >= p.length) return;
    [p[i], p[j]] = [p[j], p[i]];
    API().Settings.set('pinned', p);
    render();
  };

  const z = (w) => +w.el.style.zIndex || 0;
  const topWin = (ws) => ws.slice().sort((a, b) => z(b) - z(a))[0];

  function desired() {
    const cat = API().catalog();
    const wins = WM.all().filter((w) => !w.closing);
    const used = new Set();
    const out = [];
    (get('pinned') || []).forEach((id) => {
      const app = cat.find((a) => a.id === id);
      if (!app) return;
      const ws = wins.filter((w) => w.appId === app.appId);
      ws.forEach((w) => used.add(w.id));
      out.push({ key: 'pin:' + app.id, app, wins: ws, pinned: true });
    });
    wins.forEach((w) => { if (!used.has(w.id)) out.push({ key: 'win:' + w.id, wins: [w], title: w.title, icon: w.icon }); });
    return out;
  }

  function itemMenu(it) {
    const items = [];
    const cat = API().catalog();
    if (it.pinned) items.push({ label: it.wins.length ? 'Show' : 'Open', icon: 'external', action: () => (it.wins.length ? WM.focus(topWin(it.wins)) : it.app.run()) });
    if (it.wins.length > 1) { items.push({ separator: true }); it.wins.forEach((w) => items.push({ label: w.title, icon: 'desktop', action: () => WM.focus(w) })); }
    if (!it.pinned) items.push(...WM.menuFor(it.wins[0]));
    const app = it.pinned ? it.app : cat.find((a) => a.appId === it.wins[0].appId);
    items.push({ separator: true });
    if (app) items.push({ label: Shell.isPinned(app.id) ? 'Remove from taskbar' : 'Keep in taskbar', icon: 'plus', action: () => Shell.togglePin(app.id) });
    if (it.pinned) {
      items.push({ label: 'Move earlier', icon: 'arrowLeft', action: () => Shell.movePin(it.app.id, -1) });
      items.push({ label: 'Move later', icon: 'arrowRight', action: () => Shell.movePin(it.app.id, 1) });
      if (it.wins.length) { items.push({ separator: true }); items.push({ label: it.wins.length > 1 ? 'Close all windows' : 'Close', icon: 'x', danger: true, action: () => it.wins.forEach((w) => WM.close(w)) }); }
    }
    return items;
  }

  function makeItem() {
    const el = h('button', { class: 'tb-item' }, h('span', { class: 'tb-ico' }), h('span', { class: 'tb-title' }));
    el.addEventListener('click', () => {
      const it = el._it;
      if (!it.wins.length) { it.app.run(); return; }
      const w = topWin(it.wins);
      if (w.minimized || !w.focused) WM.focus(w); else WM.minimize(w);
    });
    el.addEventListener('auxclick', (e) => { if (e.button === 1) el._it.wins.forEach((w) => WM.close(w)); });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); ui.contextMenu(e.clientX, e.clientY, itemMenu(el._it)); });
    return el;
  }

  function render() {
    const tasks = $('#tb-tasks');
    if (!tasks) return;
    const list = desired();
    const order = [];
    const seen = new Set();
    list.forEach((it) => {
      seen.add(it.key);
      let el = els.get(it.key);
      if (!el) {
        el = makeItem(); els.set(it.key, el);
        if (!firstRender) { el.classList.add('enter'); setTimeout(() => el.classList.remove('enter'), 400); }
      }
      el._it = it;
      const ws = it.wins;
      el.classList.toggle('pinned', !!it.pinned);
      el.classList.toggle('running', ws.length > 0);
      el.classList.toggle('active', ws.some((w) => w.focused && !w.minimized));
      el.classList.toggle('minimized', ws.length > 0 && ws.every((w) => w.minimized));
      el.dataset.wids = ws.map((w) => w.id).join(' ');
      const title = it.pinned ? it.app.name : it.title;
      el.title = title + (ws.length > 1 ? ' (' + ws.length + ' windows)' : '');
      const ti = el.querySelector('.tb-title');
      if (ti.textContent !== title) ti.textContent = title;
      if (it.pinned) { const [g1, g2] = API().iconGradient(it.app.rec); el.style.setProperty('--g1', g1); el.style.setProperty('--g2', g2); el.dataset.g = '1'; }
      else { el.style.removeProperty('--g1'); el.style.removeProperty('--g2'); delete el.dataset.g; }
      const ic = it.pinned ? API().iconHTML(it.app.rec, 16) : it.icon;
      const ico = el.querySelector('.tb-ico');
      if (ico._h !== ic) { ico.innerHTML = ic; ico._h = ic; }
      order.push(el);
    });
    els.forEach((el, k) => { if (!seen.has(k)) { el.remove(); els.delete(k); } });
    if (tasks.children.length !== order.length || order.some((e, i) => tasks.children[i] !== e)) tasks.replaceChildren(...order);
    firstRender = false;
  }

  /* dock magnification + auto-hide */
  function initDock() {
    const tb = $('#taskbar');
    /* Magnification that pushes neighbours apart (like macOS): every icon is scaled by its distance
       to the pointer, then re-centred along the dock axis so scaled icons never overlap. */
    const MAXS = 1.5, SIGMA = 62, GAP = 6;
    tb.addEventListener('pointermove', (e) => {
      if (!tb.classList.contains('mag') || e.pointerType === 'touch') return;
      const horiz = tb.dataset.pos === 'top' || tb.dataset.pos === 'bottom';
      const els = [$('#tb-start'), ...$$('.tb-item', tb)];
      const box = tb.getBoundingClientRect();
      const pointer = horiz ? e.clientX - box.left : e.clientY - box.top;
      const m = els.map((el) => {
        const p = horiz ? el.offsetLeft : el.offsetTop, w = horiz ? el.offsetWidth : el.offsetHeight;
        const d = Math.abs(pointer - (p + w / 2));
        return { el, p, w, s: 1 + (MAXS - 1) * Math.exp(-(d * d) / (2 * SIGMA * SIGMA)) };
      });
      const origSpan = m[m.length - 1].p + m[m.length - 1].w - m[0].p;
      const newSpan = m.reduce((a, x) => a + x.w * x.s, 0) + GAP * (m.length - 1);
      let cur = m[0].p - (newSpan - origSpan) / 2;
      m.forEach((x) => {
        const nw = x.w * x.s;
        const shift = cur + nw / 2 - (x.p + x.w / 2);
        x.el.style.setProperty('--mag', x.s.toFixed(3));
        x.el.style.setProperty(horiz ? '--tx' : '--ty', shift.toFixed(1) + 'px');
        cur += nw + GAP;
      });
    });
    tb.addEventListener('pointerleave', () => [$('#tb-start'), ...$$('.tb-item', tb)].forEach((el) => { el.style.removeProperty('--mag'); el.style.removeProperty('--tx'); el.style.removeProperty('--ty'); }));

    let hideT = 0;
    const busy = () => !!($('#start-menu.open') || $('.ctx-menu'));
    const reveal = (on) => { clearTimeout(hideT); tb.classList.toggle('reveal', on); };
    const later = () => { clearTimeout(hideT); hideT = setTimeout(() => { if (busy()) later(); else reveal(false); }, 550); };
    $('#tb-hot').addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') reveal(true); });
    $('#tb-hot').addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { e.preventDefault(); reveal(!tb.classList.contains('reveal')); } });
    document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && tb.classList.contains('reveal') && !e.target.closest('#taskbar, #tb-hot, #start-menu, .ctx-menu')) reveal(false); }, true);
    tb.addEventListener('click', () => { if (ulyOS.util.isTouch()) later(); });
    $('#tb-widgets').addEventListener('click', () => ulyOS.Widgets.togglePanel());
    tb.addEventListener('pointerenter', () => reveal(true));
    tb.addEventListener('pointerleave', later);
    $('#tb-desk').addEventListener('click', () => (WM.all().some((w) => !w.minimized) ? WM.minimizeAll() : WM.restoreAll()));
  }

  /* ------------------------------------------------------------------------
     Start menu
     ------------------------------------------------------------------------ */
  const menuEl = () => $('#start-menu');
  function placeStart() {
    const menu = menuEl(), btn = $('#tb-start');
    if (!menu || !btn) return;
    const r = btn.getBoundingClientRect();
    const pos = $('#taskbar').dataset.pos;
    const W = 320, vw = window.innerWidth, vh = window.innerHeight;
    const left = clamp(r.left, 8, Math.max(8, vw - W - 8));
    let css = 'left:' + left + 'px;right:auto;top:auto;bottom:auto;';
    let origin = 'bottom left';
    if (pos === 'bottom') css += 'bottom:' + (vh - r.top + 10) + 'px;';
    else if (pos === 'top') { css += 'top:' + (r.bottom + 10) + 'px;'; origin = 'top left'; }
    else if (pos === 'left') { css = 'left:' + (r.right + 10) + 'px;right:auto;top:auto;bottom:' + Math.max(8, vh - r.bottom) + 'px;'; }
    else { css = 'right:' + (vw - r.left + 10) + 'px;left:auto;top:auto;bottom:' + Math.max(8, vh - r.bottom) + 'px;'; origin = 'bottom right'; }
    menu.style.cssText = css + 'transform-origin:' + origin + ';';
  }

  function initStart() {
    const menu = menuEl(), btn = $('#tb-start'), list = $('#sm-list'), search = $('#sm-search');
    const fill = () => {
      const q = search.value.trim().toLowerCase();
      const rows = API().catalog().filter((a) => !q || a.name.toLowerCase().includes(q));
      list.replaceChildren(...(rows.length ? rows.map((a) => {
        const b = h('button', { class: 'sm-item', onclick: () => { closeMenu(); a.run(); ulyOS.audit("Launching '" + a.name + "' from start menu", 'info'); } },
          h('span', { class: 'sm-ico', html: API().iconHTML(a.rec, 18) }), h('span', { text: a.name, style: { flex: '1' } }), Shell.isPinned(a.id) ? h('span', { class: 'chip-lock', html: icon('check', 13), title: 'In taskbar' }) : null);
        b.addEventListener('contextmenu', (e) => {
          e.preventDefault(); e.stopPropagation();
          ui.contextMenu(e.clientX, e.clientY, [{ label: 'Open', icon: 'external', action: a.run }, { label: Shell.isPinned(a.id) ? 'Remove from taskbar' : 'Keep in taskbar', icon: 'plus', action: () => { Shell.togglePin(a.id); fill(); } }]);
        });
        return b;
      }) : [h('div', { class: 'fm-empty', text: 'No apps found' })]));
    };
    function openMenu() { placeStart(); menu.hidden = false; btn.classList.add('active'); search.value = ''; fill(); $('#taskbar').classList.add('reveal'); requestAnimationFrame(() => menu.classList.add('open')); search.focus(); }
    function closeMenu() { menu.classList.remove('open'); btn.classList.remove('active'); setTimeout(() => { if (!menu.classList.contains('open')) menu.hidden = true; }, dur(180)); }
    btn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.contains('open') ? closeMenu() : openMenu(); });
    search.addEventListener('input', fill);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') list.querySelector('.sm-item')?.click(); if (e.key === 'Escape') closeMenu(); });
    document.addEventListener('pointerdown', (e) => { if (menu.classList.contains('open') && !e.target.closest('#start-menu, #tb-start, .ctx-menu')) closeMenu(); }, true);
    window.addEventListener('blur', () => { if (menu.classList.contains('open')) closeMenu(); });
    window.addEventListener('resize', placeStart);
    if (!document.documentElement.requestFullscreen) $('#sm-fullscreen').hidden = true;   // iPhone Safari has no Fullscreen API
    $('#sm-fullscreen').addEventListener('click', () => { closeMenu(); document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); });
    $('#sm-restart').addEventListener('click', () => { closeMenu(); API().restart(); });
    $('#sm-lock').addEventListener('click', () => { closeMenu(); API().lockNow(); });
    const contactBtn = $('#sm-contact'), offBtn = $('#sm-offline');
    contactBtn.hidden = !(ulyOS.admin && ulyOS.admin.enabled());
    offBtn.hidden = !!(ulyOS.config && ulyOS.config.OFFLINE);
    contactBtn.addEventListener('click', () => { closeMenu(); ulyOS.admin.contact(); });
    offBtn.addEventListener('click', () => { closeMenu(); ulyOS.offline.download(); });
    Shell.closeStart = closeMenu;
  }

  /* ------------------------------------------------------------------------
     macOS-style menu bar
     ------------------------------------------------------------------------ */
  function initMenubar() {
    const left = $('#mb-left');
    let openBtn = null;
    let lastClose = { btn: null, t: 0 };
    const openMenu = (btn, items) => {
      const r = btn.getBoundingClientRect();
      btn.classList.add('open'); openBtn = btn;
      ui.contextMenu(r.left, r.bottom + 2, items, { onClose: () => { btn.classList.remove('open'); if (openBtn === btn) openBtn = null; lastClose = { btn, t: Date.now() }; } });
    };
    const add = (btn, items) => {
      btn.addEventListener('click', () => { if (lastClose.btn === btn && Date.now() - lastClose.t < 250) return; openMenu(btn, items()); });
      btn.addEventListener('pointerenter', () => { if (openBtn && openBtn !== btn) openMenu(btn, items()); });
      left.append(btn);
    };
    const about = () => ui.alert({
      title: 'ulyOS', okText: 'Close',
      message: 'Browser-based OS in vanilla HTML, CSS and JavaScript.\nProfile: ' + (ulyOS.security.profile()?.name || '') + ' · vault ' + (ulyOS.security.isProtected() ? 'encrypted (AES-256-GCM)' : 'not encrypted') + '\nhttps://github.com/ulyweb/ulyOS',
    });
    const logo = h('button', { class: 'mb-btn logo', 'aria-label': 'ulyOS menu', html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/></svg>' });
    const appBtn = h('button', { class: 'mb-btn app', text: 'ulyOS' });
    const setApp = () => { const w = WM.focused(); appBtn.textContent = w ? w.title.replace(/^● /, '') : 'ulyOS'; };
    ['window:focus', 'window:title', 'window:close', 'window:minimize'].forEach((e) => bus.on(e, setApp));

    add(logo, () => [
      { label: 'About ulyOS', icon: 'info', action: about }, { separator: true },
      { label: 'System Settings…', icon: 'settings', action: () => API().openSettings() },
      { label: 'Task Manager', icon: 'activity', action: () => API().SYS_APPS.taskmgr.open() }, { separator: true },
      { label: 'Lock Screen', icon: 'lock', action: API().lockNow },
      { label: 'Switch Profile…', icon: 'power', action: () => ulyOS.security.signOut() },
      { label: 'Restart…', icon: 'refresh', danger: true, action: () => API().restart() },
    ]);
    add(appBtn, () => {
      const w = WM.focused();
      return w ? WM.menuFor(w) : [{ label: 'New URL shortcut…', icon: 'plus', action: API().newShortcut }, { label: 'Open Files', icon: 'folder', action: () => ulyOS.FS.open() }, { separator: true }, { label: 'Settings…', icon: 'settings', action: () => API().openSettings() }];
    });
    add(h('button', { class: 'mb-btn', text: 'File' }), () => [
      { label: 'New text document', icon: 'filePlus', action: () => ulyOS.FS.newDocument() },
      { label: 'New URL shortcut…', icon: 'plus', action: API().newShortcut },
      { label: 'Open Files', icon: 'folder', action: () => ulyOS.FS.open() }, { separator: true },
      { label: 'Close window', icon: 'x', disabled: !WM.focused(), action: () => WM.focused() && WM.close(WM.focused()) },
    ]);
    add(h('button', { class: 'mb-btn', text: 'View' }), () => [
      { label: 'Surprise me  🎲', icon: 'sparkles', action: () => API().surprise(true) },
      { label: 'Wallpaper', icon: 'image', submenu: API().WALLPAPERS.map(([id, l]) => ({ label: (get('wallpaper') === id ? '✓ ' : '    ') + l, action: () => API().setWallpaper(id) })) },
      { separator: true },
      { label: (get('taskbarAutoHide') ? '✓ ' : '    ') + 'Auto-hide taskbar / dock', icon: 'arrowUp', action: () => API().Settings.set('taskbarAutoHide', !get('taskbarAutoHide')) },
      { label: 'Dock position', icon: 'desktop', submenu: ['bottom', 'top', 'left', 'right'].map((p) => ({ label: (get('taskbarPos') === p ? '✓ ' : '    ') + p[0].toUpperCase() + p.slice(1), action: () => API().Settings.set('taskbarPos', p) })) },
      { label: 'Customize dock & menu bar…', icon: 'sliders', action: () => API().openSettings('shell') }, { separator: true },
      ...(!document.documentElement.requestFullscreen ? [] : [{ label: document.fullscreenElement ? 'Exit full screen' : 'Enter full screen', icon: 'fullscreen', action: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()) }]),
    ]);
    add(h('button', { class: 'mb-btn', text: 'Window' }), () => {
      const f = WM.focused(), all = WM.all().filter((w) => !w.closing);
      return [
        { label: 'Minimize', icon: 'minus', disabled: !f, action: () => f && WM.minimize(f) },
        { label: 'Zoom', icon: 'fullscreen', disabled: !f || !f.resizable, action: () => f && WM.maximize(f) },
        { label: 'Close', icon: 'x', disabled: !f, action: () => f && WM.close(f) }, { separator: true },
        { label: 'Minimize all', icon: 'minus', disabled: !all.length, action: () => WM.minimizeAll() },
        { label: 'Show desktop / restore', icon: 'desktop', action: () => (all.some((w) => !w.minimized) ? WM.minimizeAll() : WM.restoreAll()) },
        ...(all.length ? [{ separator: true }, ...all.map((w) => ({ label: (w.focused ? '✓ ' : '    ') + w.title.replace(/^● /, ''), action: () => WM.focus(w) }))] : []),
      ];
    });
    add(h('button', { class: 'mb-btn', text: 'Help' }), () => [
      { label: 'ulyOS on GitHub', icon: 'external', action: () => window.open('https://github.com/ulyweb/ulyOS', '_blank', 'noopener,noreferrer') },
      { label: 'Security settings…', icon: 'shield', action: () => API().openSettings('security') },
      ...(ulyOS.config.OFFLINE ? [] : [{ label: 'Download offline version…', icon: 'download', action: () => ulyOS.offline.download() }]),
      ...(ulyOS.admin && ulyOS.admin.enabled() ? [{ label: 'Contact Admin…', icon: 'mailSend', action: () => ulyOS.admin.contact() }] : []),
      { separator: true },
      { label: 'About ulyOS', icon: 'info', action: about },
    ]);
    setApp();
  }

  /* ------------------------------------------------------------------------
     Settings panel
     ------------------------------------------------------------------------ */
  Shell.settingsSection = function (H) {
    const S = API().Settings;
    const segL = (key, list) => {
      const w = h('div', { class: 'seg' });
      const paint = () => w.replaceChildren(...list.map(([v, l]) => h('button', { class: get(key) === v ? 'active' : '', text: l, onclick: () => { S.set(key, v); paint(); } })));
      paint();
      return w;
    };
    const pins = h('div', { class: 'pin-list' });
    const paintPins = () => {
      const cat = API().catalog();
      const pinned = (get('pinned') || []).map((id) => cat.find((a) => a.id === id)).filter(Boolean);
      const rest = cat.filter((a) => !pinned.includes(a));
      const rowFor = (a, isPinned, i) => h('div', { class: 'pin-row' },
        h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: isPinned, onchange: () => { Shell.togglePin(a.id); } }), h('i')),
        h('span', { class: 'ico-wrap', html: API().iconHTML(a.rec, 16) }), h('span', { class: 'pin-name', text: a.name }),
        isPinned ? h('button', { class: 'tb-btn', title: 'Move earlier', html: icon('arrowUp', 14), disabled: i === 0, onclick: () => Shell.movePin(a.id, -1) }) : null,
        isPinned ? h('button', { class: 'tb-btn', title: 'Move later', html: icon('arrowUp', 14).replace('<svg', '<svg style="transform:rotate(180deg)"'), disabled: i === pinned.length - 1, onclick: () => Shell.movePin(a.id, 1) }) : null);
      pins.replaceChildren(...pinned.map((a, i) => rowFor(a, true, i)), ...rest.map((a) => rowFor(a, false, 0)));
    };
    paintPins();
    bus.on('settings:change', () => { if (pins.isConnected) paintPins(); });
    const POS = [['bottom', 'Bottom'], ['top', 'Top'], ['left', 'Left'], ['right', 'Right']];
    return h('div', {},
      h('h3', { text: 'Menu bar' }),
      H.row('Show menu bar', 'macOS-style bar with a logo menu, app name, File / View / Window / Help, and the clock, RAM and profile on the right', H.sw('menubar')),
      H.row('Menu bar style', null, segL('menubarStyle', [['glass', 'Translucent'], ['solid', 'Solid']])),
      h('h3', { text: 'Taskbar & dock' }),
      H.row('Layout', 'Full-width taskbar, or a floating dock like macOS / iPadOS', segL('taskbarMode', [['bar', 'Taskbar'], ['dock', 'Floating dock']])),
      H.row('Position', null, segL('taskbarPos', POS)),
      H.row('Size', 'Height of the taskbar or icon size of the dock', H.range('taskbarSize', 36, 84, 2, (v) => v + 'px')),
      H.row('Auto-hide', 'Slides away; move the pointer to the screen edge to bring it back', H.sw('taskbarAutoHide')),
      H.row('Magnify on hover', 'Dock icons grow as the pointer passes over them (floating dock)', H.sw('taskbarMagnify')),
      H.row('Show window titles', 'Text next to taskbar icons (top / bottom taskbar only)', H.sw('taskbarLabels')),
      H.row('Show RAM meter', null, H.sw('showRam')),
      H.row('Show clock', null, H.sw('showClock')),
      h('h3', { text: 'Pinned apps' }),
      h('div', { class: 'set-desc', text: 'Pinned apps stay in the taskbar / dock with a running indicator. Right-click any app, desktop icon or start-menu entry to pin or unpin it.' }),
      pins,
      h('div', { class: 'set-tools' }, h('button', { class: 'btn', text: 'Reset dock & menu bar', onclick: () => { S.patch({ ...LAYOUT_DEFAULTS, pinned: [...LAYOUT_DEFAULTS.pinned] }); ulyOS.audit('Dock & menu bar layout reset', 'info'); render(); paintPins(); } })));
  };

  /* ------------------------------------------------------------------------
     Init (once, after a profile signs in)
     ------------------------------------------------------------------------ */
  let started = false;
  Shell.init = function () {
    if (started) return;
    started = true;
    initTray();
    initDock();
    initStart();
    initMenubar();
    Shell.layout();
    render();
    ['window:open', 'window:close', 'window:focus', 'window:minimize', 'window:restore', 'window:title', 'settings:change'].forEach((e) => bus.on(e, render));
    bus.on('session:lock', () => { Shell.closeStart?.(); });
    window.addEventListener('resize', () => Shell.layout());
  };
})();
