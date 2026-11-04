/* ==========================================================================
   ulyOS · js/shortcuts.js — keyboard shortcuts for every main function
   One table drives both the key handling and the cheat sheet (press F1, ? or Ctrl+/).
   Chosen to avoid keys the browser keeps for itself (Ctrl+N / T / W / Tab and friends are
   never delivered to a web page). Letters are matched by physical key, so they work on any
   keyboard layout and on a Mac where Option+letter types a symbol. Bundled apps forward their
   key presses here too (js/app-shim.js); a website opened in a window keeps its own keys.
   ========================================================================== */
(function () {
  'use strict';
  const { h } = ulyOS.util;
  const { WM, bus } = ulyOS;
  const S = (ulyOS.shortcuts = {});
  const sys = (id) => () => ulyOS.desktopApi.SYS_APPS[id].open();
  const fs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
  const cycle = (d) => {
    const ws = WM.all().filter((w) => !w.closing).sort((a, b) => parseInt(a.id.slice(1), 10) - parseInt(b.id.slice(1), 10));
    if (!ws.length) return;
    const i = ws.findIndex((w) => w.focused);
    WM.focus(ws[(i + d + ws.length) % ws.length]);
  };
  const win = (fn) => () => { const w = WM.focused(); if (w) fn(w); };

  /* mods: c = Ctrl, s = Shift, a = Alt.  code = KeyboardEvent.code (or key for F-keys). */
  const LIST = [
    ['Everything', [
      ['Ctrl+Shift+F', 'Full screen on / off (F11 also works)', fs, () => !!document.documentElement.requestFullscreen],
      ['Ctrl+Shift+A', 'Start menu / search apps', () => ulyOS.Shell.toggleStart?.()],
      ['Ctrl+Shift+D', 'Show desktop / bring windows back', () => (WM.all().some((w) => !w.minimized) ? WM.minimizeAll() : WM.restoreAll())],
      ['Ctrl+Shift+L', 'Lock ulyOS', () => ulyOS.desktopApi.lockNow()],
      ['Ctrl+Shift+S', 'Screenshot (drag a region)', null],           // handled by capture.js; listed here for the sheet
      ['Alt+Shift+D', 'Dark / light theme', () => document.getElementById('tray-theme')?.click()],
      ['Alt+Shift+R', 'Surprise me (random wallpaper)', () => ulyOS.desktopApi.surprise(true)],
      ['F1', 'Show this shortcut list  (also ? and Ctrl+/)', () => S.show()],
    ]],
    ['Windows', [
      ['Alt+]', 'Next window', () => cycle(1)],
      ['Alt+[', 'Previous window', () => cycle(-1)],
      ['Alt+Shift+Up', 'Maximize / restore the window', win((w) => WM.maximize(w))],
      ['Alt+Shift+Down', 'Minimize the window', win((w) => (w.maximized || w.snap ? restore(w) : WM.minimize(w)))],
      ['Alt+Shift+Left', 'Snap the window to the left half', win((w) => WM.snap(w, 'left'))],
      ['Alt+Shift+Right', 'Snap the window to the right half', win((w) => WM.snap(w, 'right'))],
      ['Alt+Shift+Q', 'Close the window', win((w) => WM.close(w))],
    ]],
    ['Open an app', [
      ['Alt+Shift+F', 'Files', sys('files')],
      ['Alt+Shift+N', 'New text document', () => ulyOS.FS.newDocument()],
      ['Alt+Shift+S', 'Settings', sys('settings')],
      ['Alt+Shift+T', 'Task Manager', sys('taskmgr')],
      ['Alt+Shift+G', 'Gemini Live', sys('live')],
      ['Alt+Shift+K', 'Speak', sys('speak')],
      ['Alt+Shift+B', 'Beam', sys('beam')],
      ['Alt+Shift+A', 'App Store', sys('store')],
      ['Alt+Shift+J', 'Jarvis', sys('jarvis')],
    ]],
  ];

  /* Alt+Shift+Down on a maximized / snapped window first brings it back to normal size. */
  function restore(w) { if (w.maximized) WM.maximize(w); else if (w.snap) WM.unsnap(w); }

  const MAP = new Map();
  const parse = (combo) => {
    const parts = combo.split('+'); const key = parts.pop() || '+';
    const m = { c: parts.includes('Ctrl'), s: parts.includes('Shift'), a: parts.includes('Alt') };
    const k = { '[': 'BracketLeft', ']': 'BracketRight', Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight' }[key] || (/^[A-Z]$/.test(key) ? 'Key' + key : key);
    return (m.c ? 'c' : '') + (m.s ? 's' : '') + (m.a ? 'a' : '') + ':' + k;
  };
  LIST.forEach(([, rows]) => rows.forEach(([combo, , run, when]) => { if (run) MAP.set(parse(combo), { run, when }); }));
  MAP.set('c:Slash', { run: () => S.show() });

  /** Returns true when the key press was a ulyOS shortcut (and has been run). Also used by bundled apps. */
  S.handle = function (e) {
    if (!document.body.classList.contains('authed') || e.metaKey || e.isComposing) return false;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
    if (!e.ctrlKey && !e.altKey) {                               // plain keys: only F1 and "?" (never while typing)
      if (e.key === 'F1' || (e.key === '?' && !typing)) { e.preventDefault(); S.show(); return true; }
      return false;
    }
    const hit = MAP.get((e.ctrlKey ? 'c' : '') + (e.shiftKey ? 's' : '') + (e.altKey ? 'a' : '') + ':' + e.code);
    if (!hit || (hit.when && !hit.when())) return false;
    if (e.repeat) { e.preventDefault(); return true; }
    e.preventDefault(); e.stopPropagation();
    try { hit.run(); } catch (err) { console.error(err); }
    return true;
  };
  document.addEventListener('keydown', (e) => { S.handle(e); }, true);

  /* ---- the cheat sheet ---- */
  let sheet = null;
  S.hide = function () { if (!sheet) return; const el = sheet; sheet = null; document.removeEventListener('keydown', el._key, true); el.classList.add('out'); setTimeout(() => el.remove(), 160); };
  S.show = function () {
    if (sheet) { S.hide(); return; }
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
    const keys = (combo) => h('span', { class: 'kb-keys' }, combo.split('+').map((k) => h('kbd', { text: mac && k === 'Alt' ? 'Option' : k })).concat([]));
    const back = h('div', { class: 'modal-back kb-back' });
    const close = () => S.hide();
    back.append(h('div', { class: 'modal kb-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Keyboard shortcuts' },
      h('div', { class: 'kb-head' }, h('h3', { class: 'modal-title', text: 'Keyboard shortcuts' }), h('button', { class: 'btn sm', type: 'button', text: 'Close', onclick: close })),
      h('div', { class: 'kb-cols' }, LIST.map(([title, rows]) => h('section', { class: 'kb-group' }, h('h4', { text: title }),
        rows.map(([combo, label]) => h('div', { class: 'kb-row' }, keys(combo), h('span', { text: label })))))),
      h('p', { class: 'set-desc kb-note', text: 'Your browser keeps Ctrl+N, Ctrl+T, Ctrl+W and Alt+F4 for itself, so ulyOS uses other combinations. A website opened in a window (YouTube, etc.) keeps its own keys while you are inside it; click the title bar first to use these.' })));
    back._key = (e) => { if (e.key === 'Escape' || e.key === 'F1' || (e.key === '?' && !/INPUT|TEXTAREA/.test(e.target.tagName || ''))) { e.preventDefault(); e.stopPropagation(); close(); } };
    document.addEventListener('keydown', back._key, true);
    back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
    document.getElementById('overlay-root').append(back);
    sheet = back;
  };
  bus.on('session:lock', () => S.hide());
  S.list = LIST;
})();
