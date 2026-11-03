/* ==========================================================================
   ulyOS · js/icons-rich.js — full-colour app icons
   Hand-drawn SVG icons in the style of modern desktop systems: a rounded
   "squircle" tile with a gradient, glossy highlight and a layered, multi-colour
   illustration. Used for the desktop, the Apps folder, the taskbar and the
   Start menu when "Full-colour app icons" is on (Settings → Desktop).
   ========================================================================== */
(function () {
  'use strict';
  const R = (ulyOS.richIcons = {});

  /** tile = squircle + gradient + soft gloss + inner border; body = the illustration (64×64 box) */
  const tile = (id, c1, c2, body) =>
    '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" data-ri="' + id + '" focusable="false" aria-hidden="true"><defs>' +
    '<linearGradient id="ri-' + id + '" x1=".15" y1="0" x2=".85" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient>' +
    '<linearGradient id="rg-' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
    '<rect x="2" y="2" width="60" height="60" rx="14" fill="url(#ri-' + id + ')"/><g class="ri-b">' + body + '</g>' +
    '<path d="M2 16A14 14 0 0 1 16 2h32a14 14 0 0 1 14 14v7C46 31 18 31 2 23z" fill="url(#rg-' + id + ')"/>' +
    '<rect x="2.5" y="2.5" width="59" height="59" rx="13.5" fill="none" stroke="#fff" stroke-opacity=".3"/></svg>';
  const g = (id, a, b, v = 'y') => '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (v === 'x' ? 1 : 0) + '" y2="' + (v === 'x' ? 0 : 1) + '"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>';

  const ART = {
    /* Gemini Live — microphone with colourful sound bars and a sparkle */
    live: tile('live', '#4b6bff', '#b04dff',
      '<defs>' + g('lm', '#ffffff', '#cfd8ff') + g('lc', '#ff7ab8', '#ffb86b') + '</defs>' +
      '<rect x="9" y="27" width="4" height="10" rx="2" fill="#7df9ff"/><rect x="15" y="22" width="4" height="20" rx="2" fill="#a6ffcb"/><rect x="45" y="22" width="4" height="20" rx="2" fill="#ffd36e"/><rect x="51" y="27" width="4" height="10" rx="2" fill="#ff9ad5"/>' +
      '<rect x="24" y="11" width="16" height="27" rx="8" fill="url(#lm)"/><rect x="27.5" y="15" width="9" height="12" rx="4.5" fill="url(#lc)" opacity=".9"/>' +
      '<path d="M19 33a13 13 0 0 0 26 0" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/><path d="M32 46v7M25 53.5h14" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/>' +
      '<path d="M50 9l1.6 4.2 4.2 1.6-4.2 1.6L50 20.6l-1.6-4.2-4.2-1.6 4.2-1.6z" fill="#ffe27a"/>'),
    /* Speak — speaker with waves */
    speak: tile('speak', '#14c9c0', '#2a6df4',
      '<defs>' + g('sp', '#ffffff', '#cfeeff') + '</defs>' +
      '<path d="M12 26h9l11-9a1.5 1.5 0 0 1 2.5 1.2v27.6a1.5 1.5 0 0 1-2.5 1.2l-11-9h-9a2 2 0 0 1-2-2V28a2 2 0 0 1 2-2z" fill="url(#sp)"/>' +
      '<path d="M40 25a10 10 0 0 1 0 14" fill="none" stroke="#ffe27a" stroke-width="3.6" stroke-linecap="round"/><path d="M45.5 19a18 18 0 0 1 0 26" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="3.6" stroke-linecap="round"/><path d="M51 14a26 26 0 0 1 0 36" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3.6" stroke-linecap="round"/>'),
    /* Beam — paper plane on a dotted arc */
    beam: tile('beam', '#ff6a5f', '#c43bd6',
      '<defs>' + g('bp', '#ffffff', '#ffe3ef') + '</defs>' +
      '<path d="M8 50C16 28 34 20 50 22" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="1 5.5"/>' +
      '<path d="M54 14L30 36l-3 13-3.5-11L12 34z" fill="url(#bp)"/><path d="M54 14L24 37.5l3 11.5z" fill="#ffc2da"/><path d="M54 14L27 49l-3.5-11.5z" fill="#fff" opacity=".35"/>' +
      '<circle cx="12" cy="52" r="3" fill="#ffe27a"/><circle cx="19" cy="46" r="2" fill="#fff" opacity=".8"/>'),
    /* App Store — shopping bag with app tiles */
    store: tile('store', '#2bb6ff', '#3a53ff',
      '<defs>' + g('sb', '#ffffff', '#d9e6ff') + '</defs>' +
      '<path d="M22 24v-4a10 10 0 0 1 20 0v4" fill="none" stroke="#fff" stroke-width="3.8" stroke-linecap="round"/>' +
      '<path d="M12 24h40l-2.4 25a5 5 0 0 1-5 4.5H19.4a5 5 0 0 1-5-4.5z" fill="url(#sb)"/>' +
      '<rect x="19" y="30" width="10" height="10" rx="3" fill="#ff5b6e"/><rect x="31" y="30" width="10" height="10" rx="3" fill="#34d27b"/><rect x="25" y="42" width="10" height="7" rx="3" fill="#ffb02e"/><rect x="37" y="42" width="8" height="7" rx="3" fill="#8f6bff"/>'),
    /* Apps folder — warm folder with app tiles peeking out */
    apps: tile('apps', '#ffc53d', '#ff8a1f',
      '<defs>' + g('af', '#fff3c4', '#ffd45c') + '</defs>' +
      '<path d="M8 20a4 4 0 0 1 4-4h12l4.5 5H52a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" fill="#d9731a" opacity=".55"/>' +
      '<rect x="14" y="19" width="11" height="11" rx="3" fill="#4b8bff"/><rect x="27" y="17" width="11" height="11" rx="3" fill="#ff5b8a"/><rect x="40" y="20" width="11" height="11" rx="3" fill="#34d27b"/>' +
      '<path d="M8 29a4 4 0 0 1 4-4h40a4 4 0 0 1 4 4v19a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" fill="url(#af)"/><path d="M8 29a4 4 0 0 1 4-4h40a4 4 0 0 1 4 4v3H8z" fill="#fff" opacity=".45"/>'),
    /* Files — blue folder with papers */
    files: tile('files', '#4dc4ff', '#2468f2',
      '<defs>' + g('fb', '#ffffff', '#cfe3ff') + g('ff', '#8fd8ff', '#3b8cff') + '</defs>' +
      '<path d="M8 19a4 4 0 0 1 4-4h12l5 5h23a4 4 0 0 1 4 4v23a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" fill="#1c4fc4" opacity=".6"/>' +
      '<rect x="14" y="22" width="36" height="22" rx="3" fill="url(#fb)" transform="rotate(-3 32 33)"/><rect x="16" y="25" width="30" height="3" rx="1.5" fill="#9bb8ff"/><rect x="16" y="31" width="22" height="3" rx="1.5" fill="#c3d4ff"/>' +
      '<path d="M8 29a4 4 0 0 1 4-4h40a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" fill="url(#ff)"/><path d="M8 29a4 4 0 0 1 4-4h40a4 4 0 0 1 4 4v2H8z" fill="#fff" opacity=".4"/>'),
    /* Settings — metallic gear */
    settings: tile('settings', '#9aa3b5', '#4a5266',
      '<defs>' + g('gm', '#ffffff', '#b9c2d4') + '</defs>' +
      '<g transform="translate(32 32)"><g fill="url(#gm)"><rect x="-4" y="-25" width="8" height="12" rx="2.5"/><rect x="-4" y="-25" width="8" height="12" rx="2.5" transform="rotate(45)"/><rect x="-4" y="-25" width="8" height="12" rx="2.5" transform="rotate(90)"/><rect x="-4" y="-25" width="8" height="12" rx="2.5" transform="rotate(135)"/><rect x="-4" y="-25" width="8" height="12" rx="2.5" transform="rotate(180)"/><rect x="-4" y="-25" width="8" height="12" rx="2.5" transform="rotate(225)"/><rect x="-4" y="-25" width="8" height="12" rx="2.5" transform="rotate(270)"/><rect x="-4" y="-25" width="8" height="12" rx="2.5" transform="rotate(315)"/><circle r="18"/></g><circle r="9" fill="#5b6479"/><circle r="9" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/><circle r="4" fill="#cfd6e6"/></g>'),
    /* Task Manager — monitor with pulse line and bars */
    taskmgr: tile('taskmgr', '#2e3a52', '#0f1626',
      '<rect x="9" y="13" width="46" height="34" rx="5" fill="#0a1020" stroke="#6ee7b7" stroke-opacity=".55" stroke-width="2"/>' +
      '<rect x="14" y="34" width="5" height="8" rx="1.5" fill="#38bdf8"/><rect x="21" y="29" width="5" height="13" rx="1.5" fill="#34d399"/><rect x="28" y="32" width="5" height="10" rx="1.5" fill="#fbbf24"/><rect x="35" y="26" width="5" height="16" rx="1.5" fill="#fb7185"/>' +
      '<path d="M12 27h8l4-8 6 13 5-9 3 4h10" fill="none" stroke="#6ee7b7" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 51h16M32 47v4" stroke="#9aa6c0" stroke-width="3" stroke-linecap="round"/>'),
    /* QR Seal — QR code with a seal */
    qrseal: tile('qrseal', '#a259ff', '#5b35e8',
      '<rect x="11" y="11" width="18" height="18" rx="4" fill="#fff"/><rect x="35" y="11" width="18" height="18" rx="4" fill="#fff"/><rect x="11" y="35" width="18" height="18" rx="4" fill="#fff"/>' +
      '<rect x="16" y="16" width="8" height="8" rx="2" fill="#5b35e8"/><rect x="40" y="16" width="8" height="8" rx="2" fill="#5b35e8"/><rect x="16" y="40" width="8" height="8" rx="2" fill="#5b35e8"/>' +
      '<circle cx="46" cy="46" r="10" fill="#ffd54a"/><path d="M41 46l4 4 7-8" fill="none" stroke="#6a3d00" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="35" y="35" width="5" height="5" rx="1" fill="#fff" opacity=".9"/>'),
    /* System Vault — vault door */
    systemvault: tile('systemvault', '#ff8a5c', '#d7263d',
      '<defs>' + g('vd', '#f3f5fa', '#aeb7c9') + '</defs>' +
      '<rect x="10" y="12" width="44" height="40" rx="8" fill="url(#vd)"/><rect x="14" y="16" width="36" height="32" rx="5" fill="#8b95ab"/>' +
      '<circle cx="32" cy="32" r="11" fill="#e9edf6"/><circle cx="32" cy="32" r="7.5" fill="#b6bfd1"/><path d="M32 25v7l5 3" fill="none" stroke="#ff4d5e" stroke-width="3" stroke-linecap="round"/>' +
      '<rect x="16" y="52" width="7" height="4" rx="1.5" fill="#6b738a"/><rect x="41" y="52" width="7" height="4" rx="1.5" fill="#6b738a"/>'),
    /* Crypto Compass — gold compass */
    cryptocompass: tile('cryptocompass', '#ffcf4a', '#f2760c',
      '<defs>' + g('cc', '#ffffff', '#ffe9b8') + '</defs>' +
      '<circle cx="32" cy="32" r="21" fill="url(#cc)"/><circle cx="32" cy="32" r="17" fill="#1d2b4d"/>' +
      '<path d="M32 15v3M32 46v3M15 32h3M46 32h3" stroke="#9fb4ff" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M32 18l7 14-7-3-7 3z" fill="#ff4d5e"/><path d="M32 46l-7-14 7 3 7-3z" fill="#e8eeff"/><circle cx="32" cy="32" r="2.6" fill="#ffd54a"/>'),
    /* Polotno — colourful shapes */
    polotno: tile('polotno', '#a98bff', '#4f46e5',
      '<rect x="11" y="12" width="22" height="22" rx="6" fill="#ff6b8b"/><circle cx="43" cy="22" r="11" fill="#ffd54a"/><path d="M31 54l11.5-20L54 54z" fill="#34d3a0"/><rect x="11" y="40" width="14" height="14" rx="4" fill="#fff" opacity=".9"/>'),
    /* GetArtCraft — sparkles on a palette */
    getartcraft: tile('getartcraft', '#ff9a3d', '#e0287a',
      '<defs>' + g('gp', '#ffffff', '#ffe0ec') + '</defs>' +
      '<path d="M32 10c13 0 22 8 22 18 0 7-5 9-10 9-4 0-5 2-4 4 1 3-1 6-6 6C21 47 10 40 10 29S20 10 32 10z" fill="url(#gp)"/>' +
      '<circle cx="22" cy="26" r="3.6" fill="#ff4d6d"/><circle cx="31" cy="20" r="3.6" fill="#ffb02e"/><circle cx="41" cy="23" r="3.6" fill="#34d27b"/><circle cx="20" cy="36" r="3.6" fill="#4b8bff"/>' +
      '<path d="M50 40l1.8 5 5 1.8-5 1.8L50 54l-1.8-5.4-5-1.8 5-1.8z" fill="#ffe27a"/>'),
    /* YouTube */
    youtube: tile('youtube', '#ff4e4e', '#c4001d',
      '<rect x="8" y="17" width="48" height="30" rx="10" fill="#fff"/><path d="M27 24v16l15-8z" fill="#ff1f3d"/>'),
    /* XRP price — rising candles */
    xrp: tile('xrp', '#1c2f66', '#0b1331',
      '<path d="M13 16v32M24 22v26M35 18v30M46 26v22" stroke="#fff" stroke-opacity=".35" stroke-width="1.6" stroke-linecap="round"/>' +
      '<rect x="9.5" y="26" width="7" height="14" rx="2" fill="#ff5b6e"/><rect x="20.5" y="30" width="7" height="12" rx="2" fill="#34d27b"/><rect x="31.5" y="22" width="7" height="16" rx="2" fill="#34d27b"/><rect x="42.5" y="30" width="7" height="12" rx="2" fill="#34d27b"/>' +
      '<path d="M10 44l13-9 10 4 20-18" fill="none" stroke="#38bdf8" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M47 21h7v7" fill="none" stroke="#38bdf8" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'),
    /* Outlook — envelope + calendar corner */
    outlook: tile('outlook', '#3aa0ff', '#0b4fd6',
      '<defs>' + g('om', '#ffffff', '#d7e7ff') + '</defs>' +
      '<rect x="9" y="17" width="46" height="31" rx="6" fill="url(#om)"/><path d="M11 21l21 15 21-15" fill="none" stroke="#2b7bff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<rect x="36" y="38" width="20" height="18" rx="4" fill="#ff5b3d"/><rect x="36" y="38" width="20" height="6" rx="3" fill="#c93a1f"/><path d="M41 49h10M41 53h6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>'),
  };

  R.has = (id) => Object.prototype.hasOwnProperty.call(ART, id);
  R.svg = (id) => ART[id] || '';
  R.ids = () => Object.keys(ART);
})();
