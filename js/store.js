/* ==========================================================================
   ulyOS · js/store.js — App Store
   A curated catalog of the bundled apps and well-known web apps. "Add" puts a
   shortcut on your desktop (it is just a link — nothing is installed and no
   third-party code is added to ulyOS). Sites that forbid being embedded open
   in a browser tab automatically.
   ========================================================================== */
(function () {
  'use strict';
  const { h, icon } = ulyOS.util;
  const { ui, WM } = ulyOS;
  const S = (ulyOS.Store = {});

  /* kind 'local' = bundled with ulyOS (encrypted storage, works offline); everything else is a link */
  const L = (id, name, cat, desc, file, glyph, tint, w, hh) => ({ id, name, cat, desc, kind: 'local', file, glyph, tint, w, h: hh, bundled: true });
  const U = (id, name, cat, desc, url, tint, mode = 'auto') => ({ id: 'st-' + id, name, cat, desc, kind: 'url', url, tint, mode });
  const CATALOG = [
    L('qrseal', 'QR Seal', 'Security', 'Password-protected QR code generator and reader', 'apps/qrseal.html', 'qr', '#c4b5fd', 980, 760),
    L('systemvault', 'System Vault', 'Security', 'Strong password and key generator with entropy scoring', 'apps/systemvault.html', 'key', '#fb7185', 1000, 700),
    L('cryptocompass', 'Crypto Compass', 'Finance', 'Beginner crypto guide, live prices and calculators', 'apps/cryptocompass.html', 'compass', '#fbbf24', 1000, 700),
    L('trustvault', 'TrustVault', 'Security', 'Digital legacy platform: documents, recipients, check-ins', 'apps/trustvault.html', 'shield', '#38bdf8', 1100, 760),

    U('excalidraw', 'Excalidraw', 'Create', 'Hand-drawn style whiteboard and diagrams', 'https://excalidraw.com/', '#a78bfa'),
    U('drawio', 'diagrams.net', 'Create', 'Flowcharts, UML and network diagrams', 'https://app.diagrams.net/', '#fb923c'),
    U('photopea', 'Photopea', 'Create', 'Photoshop-like image editor in the browser', 'https://www.photopea.com/', '#34d399'),
    U('squoosh', 'Squoosh', 'Create', 'Compress and convert images', 'https://squoosh.app/', '#f472b6'),
    U('mermaid', 'Mermaid Live', 'Create', 'Diagrams from text', 'https://mermaid.live/', '#22d3ee'),
    U('canva', 'Canva', 'Create', 'Design posts, slides and posters', 'https://www.canva.com/', '#6366f1', 'tab'),
    U('figma', 'Figma', 'Create', 'Collaborative interface design', 'https://www.figma.com/', '#f97316', 'tab'),

    U('gdocs', 'Google Docs', 'Office', 'Documents', 'https://docs.google.com/', '#4285f4', 'tab'),
    U('gsheets', 'Google Sheets', 'Office', 'Spreadsheets', 'https://sheets.google.com/', '#34a853', 'tab'),
    U('gdrive', 'Google Drive', 'Office', 'Files in the cloud', 'https://drive.google.com/', '#fbbc05', 'tab'),
    U('gmail', 'Gmail', 'Office', 'Email', 'https://mail.google.com/', '#ea4335', 'tab'),
    U('gcal', 'Google Calendar', 'Office', 'Calendar', 'https://calendar.google.com/', '#4285f4', 'tab'),
    U('o365', 'Microsoft 365', 'Office', 'Word, Excel, PowerPoint online', 'https://www.office.com/', '#ef4444', 'tab'),
    U('notion', 'Notion', 'Office', 'Notes, docs and wikis', 'https://www.notion.so/', '#e5e7eb', 'tab'),
    U('nextcloud', 'Nextcloud', 'Office', 'Your own cloud — enter your server address when you add it', 'https://nextcloud.com/', '#38bdf8', 'tab'),

    U('codepen', 'CodePen', 'Develop', 'Front-end playground', 'https://codepen.io/pen/', '#e5e7eb'),
    U('stackblitz', 'StackBlitz', 'Develop', 'Full dev environments in the browser', 'https://stackblitz.com/', '#38bdf8'),
    U('regex101', 'regex101', 'Develop', 'Build and test regular expressions', 'https://regex101.com/', '#22c55e'),
    U('cyberchef', 'CyberChef', 'Develop', 'The cyber Swiss-army knife (encode, hash, decode)', 'https://gchq.github.io/CyberChef/', '#a3e635'),
    U('hoppscotch', 'Hoppscotch', 'Develop', 'API request builder', 'https://hoppscotch.io/', '#34d399'),
    U('jsoncrack', 'JSON Crack', 'Develop', 'Visualize JSON as a graph', 'https://jsoncrack.com/editor', '#f59e0b'),
    U('github', 'GitHub', 'Develop', 'Code hosting', 'https://github.com/', '#e5e7eb', 'tab'),

    U('wikipedia', 'Wikipedia', 'Learn', 'The free encyclopedia', 'https://en.wikipedia.org/wiki/Main_Page', '#e5e7eb'),
    U('desmos', 'Desmos', 'Learn', 'Graphing calculator', 'https://www.desmos.com/calculator', '#34d399'),
    U('khan', 'Khan Academy', 'Learn', 'Free lessons in maths, science and more', 'https://www.khanacademy.org/', '#22c55e'),
    U('geogebra', 'GeoGebra', 'Learn', 'Maths tools: geometry, algebra, 3D', 'https://www.geogebra.org/classic', '#60a5fa'),
    U('duolingo', 'Duolingo', 'Learn', 'Learn languages', 'https://www.duolingo.com/', '#84cc16', 'tab'),

    U('youtube', 'YouTube', 'Media', 'Videos (paste a video link into a shortcut to play it in a window)', 'https://www.youtube.com/', '#ff5c5c', 'tab'),
    U('spotify', 'Spotify', 'Media', 'Music', 'https://open.spotify.com/', '#22c55e', 'tab'),
    U('soundcloud', 'SoundCloud', 'Media', 'Music and podcasts', 'https://soundcloud.com/', '#fb923c', 'tab'),
    U('twitch', 'Twitch', 'Media', 'Live streams', 'https://www.twitch.tv/', '#a78bfa', 'tab'),

    U('cmc', 'CoinMarketCap', 'Finance', 'Crypto prices and rankings', 'https://coinmarketcap.com/', '#38bdf8', 'tab'),
    U('tradingview', 'TradingView', 'Finance', 'Charts and markets', 'https://www.tradingview.com/', '#60a5fa', 'tab'),
    U('yfinance', 'Yahoo Finance', 'Finance', 'Stocks, news, portfolios', 'https://finance.yahoo.com/', '#a78bfa', 'tab'),

    U('osm', 'OpenStreetMap', 'Tools', 'Open map of the world', 'https://www.openstreetmap.org/', '#22c55e'),
    U('windy', 'Windy', 'Tools', 'Weather maps and forecasts', 'https://embed.windy.com/', '#38bdf8'),
    U('lichess', 'Lichess', 'Games', 'Free, open-source chess', 'https://lichess.org/', '#e5e7eb'),
    U('hn', 'Hacker News', 'News', 'Tech news and discussion', 'https://news.ycombinator.com/', '#fb923c', 'tab'),
    U('hibp', 'Have I Been Pwned', 'Security', 'Check whether an email appeared in a data breach', 'https://haveibeenpwned.com/', '#fb7185', 'tab'),
    U('virustotal', 'VirusTotal', 'Security', 'Scan files and links with many antivirus engines', 'https://www.virustotal.com/', '#3b82f6', 'tab'),
  ];
  S.catalog = CATALOG;
  const CATS = ['All', 'Installed', ...[...new Set(CATALOG.map((c) => c.cat))].sort()];

  const rec = (c) => (c.kind === 'local'
    ? { id: c.id, kind: 'local', name: c.name, file: c.file, glyph: c.glyph, mem: 60, w: c.w, h: c.h, tint: c.tint }
    : { id: c.id, kind: 'url', name: c.name, url: c.url, mode: c.mode, tint: c.tint });
  const tile = (c) => h('div', { class: 'st-tile', style: { '--t': c.tint }, html: c.glyph ? icon(c.glyph, 24) : '' }, c.glyph ? null : (c.name.trim()[0] || '?').toUpperCase());

  S.open = function () {
    const ex = WM.byApp('store')[0];
    if (ex) { WM.focus(ex); return ex; }
    return WM.open({ appId: 'store', title: 'App Store', icon: icon('store', 16), width: 940, height: 640, minWidth: 420, minHeight: 360, mem: 12, render: build });
  };

  function build() {
    let cat = 'All', q = '';
    const grid = h('div', { class: 'st-grid' });
    const chips = h('div', { class: 'st-chips' });
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Search apps…', 'aria-label': 'Search apps', autocomplete: 'off', oninput: () => { q = search.value.trim().toLowerCase(); paint(); } });
    const installed = (c) => ulyOS.desktopApi.hasIcon(c.id);
    const paintChips = () => chips.replaceChildren(...CATS.map((c) => h('button', { class: 'st-chip' + (c === cat ? ' on' : ''), text: c, onclick: () => { cat = c; paintChips(); paint(); } })));
    const paint = () => {
      const list = CATALOG.filter((c) => (cat === 'All' || (cat === 'Installed' ? installed(c) : c.cat === cat)) && (!q || (c.name + ' ' + c.desc + ' ' + c.cat).toLowerCase().includes(q)));
      grid.replaceChildren(...(list.length ? list.map(card) : [h('div', { class: 'set-desc', style: { padding: '30px 6px' }, text: cat === 'Installed' ? 'Nothing from the store is on your desktop yet.' : 'No apps match. Use “Add your own link” to create a shortcut.' })]));
    };
    const card = (c) => {
      const has = installed(c);
      return h('div', { class: 'st-card' },
        tile(c),
        h('div', { class: 'st-body' },
          h('div', { class: 'st-name' }, c.name, c.bundled ? h('span', { class: 'st-badge', text: 'Built in' }) : (c.mode === 'tab' ? h('span', { class: 'st-badge dim', text: 'Opens in a tab' }) : null)),
          h('div', { class: 'st-desc', text: c.desc }),
          h('div', { class: 'st-meta', text: c.cat + (c.kind === 'url' ? ' · ' + ulyOS.desktopApi.hostName(c.url) : ' · works offline') })),
        h('div', { class: 'st-act' },
          has ? h('button', { class: 'btn sm', text: 'Open', onclick: () => ulyOS.desktopApi.launch(rec(c)) }) : h('button', { class: 'btn sm primary', text: 'Add', onclick: () => { const inFolder = ulyOS.Desktop.icons.some((i) => i.id === 'apps' && i.kind === 'folder'); ulyOS.desktopApi.addIcon(inFolder ? { ...rec(c), folder: 'apps' } : rec(c)); ulyOS.audit("App Store: '" + c.name + "' added", 'ok'); ui.toast(c.name + (inFolder ? ' added to your Apps folder' : ' added to your desktop'), { type: 'ok' }); paint(); } }),
          has ? h('button', { class: 'btn sm', text: 'Remove', title: 'Remove from the desktop', onclick: () => { ulyOS.desktopApi.removeIcon(c.id); paint(); } }) : h('button', { class: 'btn sm', text: 'Try', title: 'Open without adding', onclick: () => ulyOS.desktopApi.launch(rec(c)) })));
    };
    paintChips(); paint();
    const bus = ulyOS.bus; bus.on('desktop:layout', () => { if (grid.isConnected) paint(); });
    return h('div', { class: 'st' },
      h('div', { class: 'st-top' },
        h('div', { class: 'st-title' }, h('b', { text: 'App Store' }), h('span', { text: CATALOG.length + ' apps · links open in a window or a browser tab; nothing is installed' })),
        h('div', { class: 'st-tools' }, search, h('button', { class: 'btn sm', html: icon('plus', 13) + ' Add your own link', onclick: () => ulyOS.desktopApi.newShortcut() }))),
      chips, grid);
  }
})();
