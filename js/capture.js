/* ==========================================================================
   ulyOS · js/capture.js — Screenshot, Visual search and Send to device
   Like the Edge right-click menu. A browser cannot read its own pixels, so the
   page asks the browser to share THIS TAB once (the standard "share this tab"
   prompt), grabs a single frame, stops sharing immediately, and lets you drag
   a region. Nothing leaves your device unless you choose Visual search or Beam.
     · Save to Files (Pictures/Screenshots, encrypted like every sandbox file)
     · Download PNG · Copy to clipboard
     · Send to device — through Beam, end-to-end encrypted
     · Visual search — copies the image, opens Google Lens / Bing / TinEye in a
       new tab; press Ctrl+V there (the search sites accept pasted images)
   ========================================================================== */
(function () {
  'use strict';
  const { h, icon, stamp, fmtBytes } = ulyOS.util;
  const { ui } = ulyOS;
  const C = (ulyOS.Capture = {});
  let busy = false;

  C.supported = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

  const SEARCH = [
    ['Google Lens', 'https://lens.google.com/'],
    ['Bing Visual Search', 'https://www.bing.com/visualsearch'],
    ['TinEye', 'https://tineye.com/'],
  ];

  /** One frame of this tab as a canvas. The share is stopped the moment the frame is read. */
  async function grab() {
    if (!C.supported) throw new Error('This browser cannot capture the screen. Try Chrome, Edge or Firefox on a computer.');
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' });
    try {
      const v = h('video', { muted: true, playsInline: true });
      v.srcObject = stream;
      await v.play();
      await new Promise((res) => (v.videoWidth ? res() : v.addEventListener('loadedmetadata', res, { once: true })));
      await new Promise((r) => setTimeout(r, 250));       // let the "sharing" banner settle out of the frame
      const cv = document.createElement('canvas');
      cv.width = v.videoWidth; cv.height = v.videoHeight;
      cv.getContext('2d').drawImage(v, 0, 0);
      return cv;
    } finally { stream.getTracks().forEach((t) => t.stop()); }
  }

  const toBlob = (cv) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the image'))), 'image/png'));

  /** Full-screen overlay showing the frozen frame; drag a region, or press Enter / click "Full screen". */
  function pickRegion(cv) {
    return new Promise((resolve) => {
      const url = cv.toDataURL('image/png');
      const sel = h('div', { class: 'cap-sel', hidden: true });
      const tip = h('div', { class: 'cap-tip' }, h('b', { text: 'Drag to select' }), ' · Enter = whole screen · Esc = cancel');
      const ov = h('div', { class: 'cap-ov', tabindex: '-1', role: 'dialog', 'aria-label': 'Select a screenshot area' }, sel, tip);
      ov.style.backgroundImage = 'url("' + url + '")';
      let x0 = 0, y0 = 0, drag = false, box = null;
      const done = (rect) => { document.removeEventListener('keydown', key, true); ov.remove(); resolve(rect); };
      const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } else if (e.key === 'Enter') { e.preventDefault(); done({ x: 0, y: 0, w: cv.width, h: cv.height }); } };
      const paint = (x1, y1) => {
        box = { l: Math.min(x0, x1), t: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
        Object.assign(sel.style, { left: box.l + 'px', top: box.t + 'px', width: box.w + 'px', height: box.h + 'px' });
        sel.hidden = false; sel.dataset.size = Math.round(box.w * cv.width / innerWidth) + ' × ' + Math.round(box.h * cv.height / innerHeight);
      };
      ov.addEventListener('pointerdown', (e) => { drag = true; x0 = e.clientX; y0 = e.clientY; box = null; ov.setPointerCapture(e.pointerId); paint(x0, y0); tip.hidden = true; });
      ov.addEventListener('pointermove', (e) => { if (drag) paint(e.clientX, e.clientY); });
      ov.addEventListener('pointerup', () => {
        drag = false;
        if (!box || box.w < 8 || box.h < 8) { sel.hidden = true; tip.hidden = false; return; }
        const sx = cv.width / innerWidth, sy = cv.height / innerHeight;
        done({ x: Math.round(box.l * sx), y: Math.round(box.t * sy), w: Math.round(box.w * sx), h: Math.round(box.h * sy) });
      });
      document.addEventListener('keydown', key, true);
      document.body.append(ov);
      ov.focus();
    });
  }

  function crop(cv, r) {
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.min(r.w, cv.width - r.x)); out.height = Math.max(1, Math.min(r.h, cv.height - r.y));
    out.getContext('2d').drawImage(cv, r.x, r.y, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  /* ---------------- actions ---------------- */
  C.save = async function (blob, name) {
    await ulyOS.FS.writeSandboxFile('Pictures/Screenshots/' + name, blob);
    ui.toast('Saved to Files → Pictures/Screenshots', { type: 'ok', timeout: 2600 });
  };
  C.download = function (blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  C.copy = async function (blob) {
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error('This browser cannot copy images — use Download instead');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    ui.toast('Image copied to the clipboard', { type: 'ok', timeout: 1800 });
  };
  C.send = async function (blob, name) {
    const file = new File([blob], name, { type: 'image/png' });
    if (ulyOS.Beam && ulyOS.Beam._send && ulyOS.Beam._link && ulyOS.Beam._link.open) { ulyOS.Beam._send([file]); ulyOS.Beam.open(); ui.toast('Sending to your device…', { type: 'ok', timeout: 1800 }); return; }
    try { await C.save(blob, name); } catch { /* ignore */ }
    ulyOS.Beam.open();
    ui.toast('Connect your other device in Beam first, then send “' + name + '” from Files or drop it here.', { type: 'info', timeout: 6000 });
  };
  C.search = async function (blob, engine) {
    const url = (SEARCH.find((s) => s[0] === engine) || SEARCH[0])[1];
    window.open(url, '_blank', 'noopener,noreferrer');      // first, inside the click, so the browser does not treat it as a pop-up
    let copied = true;
    try { await C.copy(blob); } catch { copied = false; }
    ui.toast(copied ? 'Image copied — press Ctrl+V on the ' + (engine || 'Google Lens') + ' page' : 'Download the image, then upload it on the search page', { type: 'info', timeout: 7000 });
  };

  /* ---------------- result window ---------------- */
  function showResult(cv, blob) {
    const name = 'ulyOS-screenshot-' + stamp() + '.png';
    const url = URL.createObjectURL(blob);
    const back = h('div', { class: 'modal-back cap-back', role: 'dialog', 'aria-label': 'Screenshot' });
    const close = () => { URL.revokeObjectURL(url); back.remove(); };
    const act = (label, ic, fn, cls = 'btn sm') => h('button', { class: cls, html: icon(ic, 14) + ' ' + label, onclick: async () => { try { await fn(); } catch (e) { ui.toast(e.message || String(e), { type: 'err' }); } } });
    const engines = h('select', { class: 'input sm cap-eng', 'aria-label': 'Search engine' }, SEARCH.map(([n]) => h('option', { value: n, text: n })));
    back.append(h('div', { class: 'modal cap-modal' },
      h('h2', { text: 'Screenshot' }),
      h('div', { class: 'cap-prev' }, h('img', { src: url, alt: 'Screenshot preview', draggable: false })),
      h('p', { class: 'set-desc', text: cv.width + ' × ' + cv.height + ' px · ' + fmtBytes(blob.size) }),
      h('div', { class: 'cap-actions' },
        act('Save to Files', 'save', () => C.save(blob, name), 'btn sm primary'),
        act('Download', 'download', () => C.download(blob, name)),
        act('Copy', 'copy', () => C.copy(blob)),
        act('Send to device', 'send', () => C.send(blob, name))),
      h('div', { class: 'cap-actions' }, act('Visual search', 'search', () => C.search(blob, engines.value)), engines),
      h('p', { class: 'auth-note', text: 'Visual search copies the picture and opens the search site; press Ctrl+V there. The picture is only shared if you choose to.' }),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', text: 'Close', onclick: close }))));
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.body.append(back);
    back.querySelector('button').focus();
    return { close };
  }

  /** mode: 'region' (default) | 'full' | 'search' (region, then straight to Visual search) */
  C.start = async function (mode = 'region') {
    if (busy) return;
    busy = true;
    try {
      ulyOS.ui.closeMenus?.();
      await new Promise((r) => setTimeout(r, 160));        // let the context menu finish closing before the frame is taken
      let cv = await grab();
      if (mode !== 'full') { const r = await pickRegion(cv); if (!r) return; cv = crop(cv, r); }
      const blob = await toBlob(cv);
      if (mode === 'search') await C.search(blob); else showResult(cv, blob);
    } catch (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) ui.toast('Screenshot cancelled', { type: 'info', timeout: 1800 });
      else ui.toast((e && e.message) || 'Screenshot failed', { type: 'err' });
    } finally { busy = false; }
  };

  /** Items for context menus (desktop, File menu). */
  C.menuItems = () => [
    { label: 'Screenshot…', icon: 'image', action: () => C.start('region') },
    { label: 'Screenshot — whole screen', icon: 'fullscreen', action: () => C.start('full') },
    { label: 'Visual search…', icon: 'search', action: () => C.start('search') },
  ];

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === 'S' || e.key === 's') && document.body.classList.contains('authed')) { e.preventDefault(); C.start('region'); }
  });
})();
