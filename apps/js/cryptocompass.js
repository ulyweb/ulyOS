var PANEL_META = [{"id":"start","name":"1 &middot; Getting Started","ic":"🚀"},{"id":"buy","name":"2 &middot; Buying Your First Crypto","ic":"🛒"},{"id":"xrp","name":"3 &middot; Understanding XRP","ic":"💧"},{"id":"security","name":"4 &middot; Account Security","ic":"🔐"},{"id":"storage","name":"4 &middot; Crypto Storage","ic":"🗄"},{"id":"diversify","name":"4 &middot; Diversification","ic":"🧺","full":true},{"id":"types","name":"4 &middot; Types of Cryptocurrencies","ic":"🧩"},{"id":"analysis","name":"4 &middot; Fundamental Analysis","ic":"🔬"},{"id":"dca","name":"4 &middot; Dollar-Cost Averaging","ic":"📆"},{"id":"cycles","name":"4 &middot; Market Cycles &amp; Risk","ic":"🎢"},{"id":"research","name":"5 &middot; Researching Tokens","ic":"🔎"},{"id":"informed","name":"6&ndash;7 &middot; Staying Informed &amp; Community","ic":"📰"},{"id":"advanced","name":"8 &middot; ISO 20022, DeFi &amp; AMMs","ic":"🏦"},{"id":"utility","name":"9 &middot; Utility Tokens","ic":"🔧"},{"id":"prices","name":"Live Prices &amp; Watchlist","ic":"📈","full":true},{"id":"bubbles","name":"Crypto Bubbles","ic":"🫧","full":true},{"id":"glossary","name":"Glossary","ic":"📖"},{"id":"faq","name":"FAQ","ic":"❓"},{"id":"activity","name":"Session Activity","ic":"📊"},{"id":"ledger","name":"Audit Ledger","ic":"🔏","full":true},{"id":"about","name":"About &amp; Disclosures","ic":"ℹ","full":true}];
/* SINGLE SOURCE OF TRUTH for the version. tools/build.mjs reads APP_VERSION from here for the <title>, the milestone file name and the stale-version audit;
   every version shown on the page (topbar chip, footer, splash, About, status bar, exports, ledger) is filled from these two values at boot.
   On EVERY shipped change: bump APP_VERSION and prepend a CHANGELOG row. Notes must not contain a single quote or a double quote. */
var APP_VERSION = '1.1';
var CHANGELOG = [
  { v: '1.1', d: '2026-10-09', n: [
    'Settings: choose the opening page (Getting started, Security checklist, Live prices or Guided tour). Default is Getting started.',
    'Single-source version and this changelog; the topbar chip, footer, tab title, About and exports all read from it.',
    'The audit ledger now records every session open and every version change.'] },
  { v: '1.0', d: '2026-10-08', n: [
    'First release: the beginner guide rebuilt in the Dashboard-Telemetry standard with all original links kept.',
    'Live prices, the Crypto Bubbles embed and Contact Admin only ever run when the visitor asks. Auto-refresh is session-only.',
    'Security, purchase and research checklists, watchlist, DCA and drawdown calculators, glossary, FAQ, audit ledger.'] }
];

/* ---------- synchronous SHA-256 (so mixing + ledger work on file:// where crypto.subtle may be absent) ---------- */
var SHA_K = (function () {
  var out = new Uint32Array(64), n = 0;
  for (var c = 2; n < 64; c++) {
    var p = true;
    for (var d = 2; d * d <= c; d++) if (c % d === 0) { p = false; break; }
    if (p) { var r = Math.cbrt(c); out[n++] = Math.floor((r - Math.floor(r)) * 4294967296) >>> 0; }
  }
  return out;
})();
var SHA_H0 = (function () {
  var out = new Uint32Array(8), n = 0;
  for (var c = 2; n < 8; c++) {
    var p = true;
    for (var d = 2; d * d <= c; d++) if (c % d === 0) { p = false; break; }
    if (p) { var r = Math.sqrt(c); out[n++] = Math.floor((r - Math.floor(r)) * 4294967296) >>> 0; }
  }
  return out;
})();
function sha256(bytes) {
  if (typeof bytes === 'string') bytes = new TextEncoder().encode(bytes);
  var l = bytes.length, total = (((l + 9 + 63) >> 6) << 6), buf = new Uint8Array(total);
  buf.set(bytes); buf[l] = 0x80;
  var dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(l / 536870912), false);
  dv.setUint32(total - 4, (l << 3) >>> 0, false);
  var H = new Uint32Array(SHA_H0), w = new Uint32Array(64);
  for (var off = 0; off < total; off += 64) {
    for (var i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (i = 16; i < 64; i++) {
      var a = w[i - 15], b = w[i - 2];
      var s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      var s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    var A = H[0], B = H[1], C = H[2], D = H[3], E = H[4], F = H[5], G = H[6], Hh = H[7];
    for (i = 0; i < 64; i++) {
      var S1 = ((E >>> 6) | (E << 26)) ^ ((E >>> 11) | (E << 21)) ^ ((E >>> 25) | (E << 7));
      var ch = (E & F) ^ (~E & G);
      var t1 = (Hh + S1 + ch + SHA_K[i] + w[i]) >>> 0;
      var S0 = ((A >>> 2) | (A << 30)) ^ ((A >>> 13) | (A << 19)) ^ ((A >>> 22) | (A << 10));
      var mj = (A & B) ^ (A & C) ^ (B & C);
      var t2 = (S0 + mj) >>> 0;
      Hh = G; G = F; F = E; E = (D + t1) >>> 0; D = C; C = B; B = A; A = (t1 + t2) >>> 0;
    }
    H[0] += A; H[1] += B; H[2] += C; H[3] += D; H[4] += E; H[5] += F; H[6] += G; H[7] += Hh;
  }
  var out = new Uint8Array(32), ov = new DataView(out.buffer);
  for (i = 0; i < 8; i++) ov.setUint32(i * 4, H[i], false);
  return out;
}
function toHex(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += (u8[i] < 16 ? '0' : '') + u8[i].toString(16); return s; }
function sha256hex(x) { return toHex(sha256(x)); }

/* ===================== CONTENT & DATA =====================
   Guide text and every outbound link are the author's, carried over from the original page.
   Token rows are labels only; prices are never embedded: they come from the CoinGecko fetch the user starts. */
var LINKS = {
  coinbase: 'https://coinbase.com/join/4R3JHCC',
  robinhood: 'https://join.robinhood.com/ulyssef1',
  uphold: 'https://wallet.uphold.com/signup?referral=358c417081&campaign=uw_p_d_w_acq_raf&utm_source=raf&utm_medium=referafriend',
  tangem: 'https://redirect.sale/tangem/?promocode=8PWWLW',
  xrpHistory: 'https://coinmarketcap.com/academy/article/xrp-a-history',
  cmc: 'https://coinmarketcap.com',
  coindesk: 'https://www.coindesk.com/',
  cointelegraph: 'https://cointelegraph.com/',
  amm: 'amm/amm.html',
  bubblesHost: 'https://cryptobubbles.net',
  bubbles: 'https://cryptobubbles.net#currencies=52,512,1720,2010,2634,3155,4030,4642,5279,5899,7127,7950,8425,18679,21159'
};

/* categories keep the guide's order; each token is [name, coingecko id, ticker, one-line description from the guide] */
var CATS = [
  { id: 'finance', name: 'Finance', note: 'fast cross-border payments and similar rails', tokens: [
    ['XRP', 'ripple', 'XRP', 'fast cross-border payments'], ['Stellar', 'stellar', 'XLM', 'similar to XRP'], ['Algorand', 'algorand', 'ALGO', 'fast and secure transactions'] ] },
  { id: 'infra', name: 'Infrastructure', note: 'plumbing between chains and data', tokens: [
    ['Chainlink', 'chainlink', 'LINK', 'connects blockchains to real-world data'], ['The Graph', 'the-graph', 'GRT', 'helps organize blockchain data'],
    ['Avalanche', 'avalanche-2', 'AVAX', 'fast and scalable platform for decentralized applications'], ['Cosmos', 'cosmos', 'ATOM', 'interoperability between different blockchains'],
    ['Quant', 'quant-network', 'QNT', 'interoperability between different blockchains'] ] },
  { id: 'future', name: 'Future of Blockchain', note: 'general-purpose chains and platforms', tokens: [
    ['Ethereum', 'ethereum', 'ETH', 'the foundation for many decentralized applications'], ['Polkadot', 'polkadot', 'DOT', 'connects different blockchains'],
    ['Kaspa', 'kaspa', 'KAS', 'a fast and scalable blockchain platform'], ['Constellation', 'constellation-labs', 'DAG', 'a scalable and secure platform for data'],
    ['Solana', 'solana', 'SOL', 'a high-performance blockchain platform'] ] },
  { id: 'metaverse', name: 'Metaverse', note: 'virtual worlds, games and NFTs', tokens: [
    ['Decentraland', 'decentraland', 'MANA', 'virtual world ownership'], ['Sandbox', 'the-sandbox', 'SAND', 'gaming and virtual land'],
    ['Gala', 'gala', 'GALA', 'gaming platform with player ownership'], ['Beam', 'beam-2', 'BEAM', 'a private and scalable blockchain platform'],
    ['ApeCoin', 'apecoin', 'APE', 'governance token for the Bored Ape Yacht Club ecosystem'], ['Axie Infinity', 'axie-infinity', 'AXS', 'play-to-earn gaming platform'],
    ['Immutable X', 'immutable-x', 'IMX', 'layer-2 scaling solution for NFTs'] ] },
  { id: 'ai', name: 'AI Tokens', note: 'decentralized AI and compute', tokens: [
    ['Fetch.ai', 'fetch-ai', 'FET', 'decentralized AI network'], ['SingularityNET', 'singularitynet', 'AGIX', 'marketplace for AI services'],
    ['Bittensor', 'bittensor', 'TAO', 'decentralized machine learning network'], ['Render', 'render-token', 'RNDR', 'decentralized GPU rendering network'],
    ['Near Protocol', 'near', 'NEAR', 'a scalable and developer-friendly blockchain platform'], ['Akash Network', 'akash-network', 'AKT', 'a decentralized cloud computing marketplace'] ] },
  { id: 'ref', name: 'Mentioned as examples', note: 'named in the guide as examples of coin types', tokens: [
    ['Bitcoin', 'bitcoin', 'BTC', 'payment coin example'], ['Tether', 'tether', 'USDT', 'stablecoin example'] ] }
];
var TOKENS = [];
CATS.forEach(function (c) { c.tokens.forEach(function (t) { TOKENS.push({ name: t[0], id: t[1], sym: t[2], blurb: t[3], cat: c.id, catName: c.name }); }); });
function tokById(id) { return TOKENS.filter(function (t) { return t.id === id; })[0]; }

/* self-tracking checklists (persisted ticks only; ticking never contacts anything) */
var SEC_ITEMS = [
  ['Enable 2FA', 'When you create your accounts on Coinbase, Robinhood, or Uphold, make sure to enable 2-factor authentication (2FA). This adds an extra layer of security by requiring a code from an authenticator app on your phone in addition to your password.'],
  ['Use an authenticator app, not only SMS or email', 'Don’t rely just on SMS or email verification – use an authenticator app like Google Authenticator or Authy. This makes your account much more secure because you control the codes.'],
  ['Strong, unique passwords', 'Use a different, strong password for each of your crypto accounts. A strong password should be a mix of letters (uppercase and lowercase), numbers, and symbols. Don’t use the same password you use for other websites.'],
  ['Watch out for phishing', 'Be careful of emails or messages that look like they’re from a crypto company but are actually fake. These are called “phishing” scams. Never click on links in these messages. Always go directly to the website or app yourself.'],
  ['Device security', 'Keep your phone and computer secure with strong passwords and up-to-date antivirus software. This helps protect your crypto accounts from hackers.'],
  ['Write down your seed phrase (self-custody only)', 'When you set up a self-custody wallet, it’ll give you a “seed phrase” – a list of words. It is the master key to your wallet. Write it down and keep it somewhere super safe (like a fireproof box or a safe deposit box).']
];
var BUY_ITEMS = [
  'Verify your identity (Coinbase needs some basic info to comply with regulations)',
  'Link a payment method: connect your bank account or debit card',
  'Search for XRP: type "XRP" in the search bar',
  'Enter the amount: decide how much to invest (start small!)',
  'Review and buy: double-check everything and click "Buy"'
];
var ANA_ITEMS = [
  'The team behind the project', 'The technology they are using', 'What real-world problem they are trying to solve', 'The community supporting the project'
];

var GLOSSARY = [
  ['Exchange', 'A service where you buy, sell and hold crypto, such as Coinbase, Robinhood or Uphold. The exchange holds the keys for coins left there.'],
  ['Wallet', 'Software or hardware that holds the keys controlling your coins. Self-custody means you hold those keys yourself.'],
  ['Self-custody', 'Holding your own keys (for example in Xaman or a Tangem card) so no exchange can freeze or lose your coins. You are also solely responsible for backups.'],
  ['Cold wallet', 'A wallet that keeps keys completely offline, which protects them from remote hackers.'],
  ['Seed phrase', 'A list of words that is the master key to a self-custody wallet. Anyone who has it controls the funds; no legitimate service ever asks for it.'],
  ['2FA', 'Two-factor authentication: a second proof, ideally an authenticator-app code, in addition to your password.'],
  ['Phishing', 'Fake emails, messages or sites that imitate a real company to steal logins or seed phrases.'],
  ['Market cap', 'Price multiplied by circulating supply. It measures size, not safety or quality.'],
  ['Volatility', 'How much and how fast a price moves. Crypto prices can swing sharply in both directions.'],
  ['Stablecoin', 'A token designed to hold a stable value, usually pegged to a currency like the US dollar (for example Tether).'],
  ['Utility token', 'A token that gives access to a product, service or feature on a specific platform.'],
  ['Governance token', 'A token whose holders can vote on a project’s decisions.'],
  ['DeFi', 'Decentralized finance: financial services built on blockchains without traditional intermediaries.'],
  ['AMM', 'Automated market maker: a DeFi mechanism that lets people trade tokens against a pool of funds instead of an order book.'],
  ['ISO 20022', 'A global standard for electronic messages between financial institutions.'],
  ['DCA', 'Dollar-cost averaging: investing a fixed amount on a regular schedule instead of all at once.'],
  ['Layer 2', 'A network built on top of another blockchain to make transactions faster or cheaper.'],
  ['Drawdown', 'The percentage fall from a previous peak price to a later low.']
];

var FAQ = [
  ['What is cryptocurrency?', 'Cryptocurrency is a digital or virtual currency secured by cryptography.'],
  ['Is it safe to invest?', 'Crypto is volatile. Only invest what you can afford to lose and do your own research. This is not financial advice.'],
  ['How much can I keep on an exchange?', 'The guide’s rule of thumb: it is fine to keep your XRP on Coinbase, Robinhood or Uphold when you are just starting out, especially under about $500 worth. Above that, consider a self-custody wallet such as Xaman or a cold wallet such as Tangem.'],
  ['Why an authenticator app instead of SMS?', 'The guide recommends not relying on SMS or email verification alone. An authenticator app means you control the codes, which makes the account much harder to take over.'],
  ['What is a seed phrase and who may see it?', 'It is the list of words that recovers a self-custody wallet. Write it down and keep it somewhere very safe, like a fireproof box. Nobody else should ever see it, and no real support person will ask for it.'],
  ['What is dollar-cost averaging?', 'Investing a small amount regularly (every week or month) instead of a large amount at once, which can help you avoid buying everything when the price is high.'],
  ['Where do the live prices come from?', 'Only when you press Fetch or Refresh in the Live Prices panel does this page ask CoinGecko’s public API for prices. Nothing is shown until then, and a failed request shows an error instead of a number.']
];

/* ===================== APP: state, ledger, audio, FX, feedback ===================== */
var APP_NAME = 'CryptoCompass', STORE_KEY = 'cryptocompass_v1';   /* distinct key: every ulyweb.github.io project shares one localStorage origin */
var CONTACT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzvKlrt3NYoGvwIoxpOrDyarhJYL5V8TctpxuG16xw0I5ee-jcOWs1Fw_c9SSh6jI_McA/exec'; /* BRIEF > CONTACT ENDPOINT (owner's relay) */
var CONTACT_EMAIL = 'francisuadm@gmail.com';                                                                                                        /* BRIEF > ADMIN CONTACT EMAIL (owner's relay) */

/* ---------- display time: the visitor's own timezone. Display only: ledger timestamps stay ISO-8601 UTC so the hash chain is unaffected. ---------- */
var _ptFmt = new Intl.DateTimeFormat('en-US', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
function ptParts(d) { var o = {}; _ptFmt.formatToParts(d).forEach(function (p) { o[p.type] = p.value; }); if (o.hour === '24') o.hour = '00'; return o; }
function fmtPT(iso) { var d = new Date(iso); if (isNaN(d)) return String(iso || ''); var o = ptParts(d); return o.year + '-' + o.month + '-' + o.day + ' ' + o.hour + ':' + o.minute + ':' + o.second + ' ' + o.timeZoneName; }
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function stripTags(s) { return String(s).replace(/<[^>]*>/g, '').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&ndash;/g, '–'); }

/* ---------- persisted state: ONE key. Contains ticks, watchlist, layout, FX dials and the ledger; no personal data. ---------- */
var UI_DEFAULTS = { fx: 65, tilt: 0, fxAnim: true, glow: 55, iconSize: 100, crt: false, soundEnabled: true, soundVolume: 50, blur: 12, fill: 68, depth: 45 };
var PREF_DEFAULTS = { startPage: 'start', startWt: false };
var S = { ui: {}, prefs: {}, audit: [], hidden: {}, tray: [], collapsed: {}, order: [], wtDone: {}, secDone: {}, buyDone: {}, anaDone: {}, read: {}, watch: [], dca: {}, sortK: 'cat', sortD: 1, watchOnly: false, welcomeSeen: false, theme: 'dark', view: 'grid', lastVer: '' };
var ui = Object.assign({}, UI_DEFAULTS), prefs = Object.assign({}, PREF_DEFAULTS);
function load() {
  try { var raw = localStorage.getItem(STORE_KEY); if (raw) { var o = JSON.parse(raw); Object.keys(S).forEach(function (k) { if (o[k] !== undefined) S[k] = o[k]; }); } } catch (e) {}
  if (!Array.isArray(S.audit)) S.audit = [];
  if (!Array.isArray(S.watch)) S.watch = [];
  S.watch = S.watch.filter(function (id) { return !!tokById(id); });
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {} }

/* ---------- Telemetry-FX engine (blueprint 2.8) ---------- */
function loadUI() { ui = Object.assign({}, UI_DEFAULTS, S.ui || {}); prefs = Object.assign({}, PREF_DEFAULTS, S.prefs || {}); applyFx(); }
function saveUI() { S.ui = ui; S.prefs = prefs; save(); applyFx(); }
function applyFx() {
  var r = document.documentElement, st = r.style;
  st.setProperty('--fx', ((ui.fx == null ? 65 : ui.fx) / 100).toFixed(2));
  r.setAttribute('data-fx', ui.fxAnim === false ? 'off' : 'on');
  if (ui.crt) r.setAttribute('data-crt', 'on'); else r.removeAttribute('data-crt');
  var gr = (ui.glow == null ? 55 : ui.glow) / 100;
  st.setProperty('--glow', '0 0 ' + Math.round(24 * gr) + 'px rgba(47,230,208,' + (0.35 * gr).toFixed(2) + ')');
  st.setProperty('--ui-scale', ((ui.iconSize == null ? 100 : ui.iconSize) / 100).toFixed(2));
  st.setProperty('--g-blur', (ui.blur == null ? 12 : ui.blur) + 'px');
  st.setProperty('--g-fill-a', ((ui.fill == null ? 68 : ui.fill) / 100).toFixed(2));
  st.setProperty('--g-shadow-a', ((ui.depth == null ? 45 : ui.depth) / 100).toFixed(2));
  st.setProperty('--tilt', (ui.tilt || 0) + 'deg');
  r.setAttribute('data-theme', S.theme === 'light' ? 'light' : 'dark');
  var b = $('btnSound'); if (b) b.textContent = ui.soundEnabled === false ? '🔇' : '🔊';
}
function wireTilt(selector) {
  document.querySelectorAll(selector).forEach(function (p) {
    if (p._tilted) return; p._tilted = true;
    p.addEventListener('mousemove', function (e) {
      if (ui.fxAnim === false || (ui.tilt || 0) <= 0) return;
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var r = p.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5, deg = ui.tilt == null ? 0 : ui.tilt;
      p.classList.add('tilt'); p.style.setProperty('--gtx', (-py * deg).toFixed(2) + 'deg'); p.style.setProperty('--gty', (px * deg).toFixed(2) + 'deg');
    });
    p.addEventListener('mouseleave', function () { p.classList.remove('tilt'); p.style.removeProperty('--gtx'); p.style.removeProperty('--gty'); });
  });
}

/* ---------- Web Audio synthesizer (blueprint PART 7) ---------- */
var audioCtx = null;
function playBeep(freq, type, duration, gain) {
  if (ui.soundEnabled === false) return;
  freq = freq || 880; type = type || 'sine'; duration = duration || .08; gain = gain == null ? .05 : gain;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var osc = audioCtx.createOscillator(), g = audioCtx.createGain(), master = (ui.soundVolume == null ? 50 : ui.soundVolume) / 100;
    osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    g.gain.setValueAtTime(Math.max(.0001, gain * master), audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + duration);
    osc.connect(g); g.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}
function playCheerChime() {
  playBeep(523.25, 'triangle', .12, .08);
  setTimeout(function () { playBeep(659.25, 'triangle', .12, .08); }, 80);
  setTimeout(function () { playBeep(783.99, 'triangle', .18, .10); }, 160);
  setTimeout(function () { playBeep(1046.5, 'sine', .28, .12); }, 240);
}

/* ---------- toasts ---------- */
function toast(kind, title, msg) {
  var box = $('toasts'); if (!box) return;
  var t = document.createElement('div'); t.className = 'toast ' + (kind === 'err' ? 'err' : kind === 'warn' ? 'warn' : '');
  t.innerHTML = '<b>' + esc(title) + '</b>' + esc(msg || ''); box.appendChild(t);
  setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(function () { t.remove(); }, 320); }, 3600);
}

/* ---------- confetti + comic pop (blueprint 2.10; visual effect only, so Math.random is fine here) ---------- */
var gfxCtx = null, gfxParticles = [], gfxRAF = null;
var PULSE_WORDS = ['STAY SAFE!', 'DYOR!', 'CHAIN INTACT!', '2FA ON!', 'START SMALL!'];
function initConfetti() { var cv = $('gfx'); if (!cv) return; cv.width = innerWidth; cv.height = innerHeight; gfxCtx = cv.getContext('2d'); }
function fireConfetti(x, y) {
  if (!gfxCtx) initConfetti(); if (!gfxCtx) return;
  x = x == null ? innerWidth / 2 : x; y = y == null ? innerHeight / 3 : y;
  var colors = ['#2fe6d0', '#7dff9b', '#ffcf5c', '#8b7dff', '#59b4ff'];
  for (var i = 0; i < 45; i++) gfxParticles.push({ x: x, y: y, vx: (Math.random() - .5) * 9, vy: Math.random() * -9 - 2, g: .35, size: 4 + Math.random() * 5, color: colors[i % colors.length], life: 60 + Math.random() * 25 });
  if (!gfxRAF) gfxRAF = requestAnimationFrame(loopConfetti);
  comicPop(x, y); playCheerChime();
}
function loopConfetti() {
  var cv = $('gfx'); if (!cv || !gfxCtx) { gfxRAF = null; return; }
  gfxCtx.clearRect(0, 0, cv.width, cv.height);
  gfxParticles.forEach(function (p) { p.vy += p.g; p.x += p.vx; p.y += p.vy; p.life--; gfxCtx.fillStyle = p.color; gfxCtx.fillRect(p.x, p.y, p.size, p.size); });
  gfxParticles = gfxParticles.filter(function (p) { return p.life > 0 && p.y < cv.height + 40; });
  gfxRAF = gfxParticles.length ? requestAnimationFrame(loopConfetti) : null;
}
function comicPop(x, y) {
  var el = document.createElement('div'); el.className = 'gcomic'; el.textContent = PULSE_WORDS[Math.floor(Math.random() * PULSE_WORDS.length)];
  el.style.left = x + 'px'; el.style.top = y + 'px'; document.body.appendChild(el); setTimeout(function () { el.remove(); }, 1000);
}

/* ---------- tamper-evident audit ledger (blueprint PART 5) ---------- */
var GENESIS = '0000000000000000000000000000000000000000000000000000000000000000';
var HAS_SUBTLE = !!(window.crypto && window.crypto.subtle);
/* Both paths are real SHA-256 (WebCrypto when present, the built-in pure-JS implementation otherwise); the label says which. */
var LEDGER_ALGO = HAS_SUBTLE ? 'SHA-256 (WebCrypto)' : 'SHA-256 (built-in JS; crypto.subtle unavailable in this context)';
function hashOf(str) {
  if (HAS_SUBTLE) {
    try {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) { return toHex(new Uint8Array(buf)); })['catch'](function () { return Promise.resolve(sha256hex(str)); });
    } catch (e) {}
  }
  return Promise.resolve(sha256hex(str));
}
function blockPayload(e) { return e.seq + '|' + e.ts + '|' + e.subject + '|' + e.action + '|' + e.prevHash; }
var _ledgerQ = Promise.resolve();
function ledgerQueue(fn) { _ledgerQ = _ledgerQ.then(fn)['catch'](function () {}); return _ledgerQ; }
function ledgerSettled() { return _ledgerQ; }
/* audit() records metadata ONLY: panel names, counts, file names. Never message bodies, addresses or keys. */
function audit(subject, action) {
  _ledgerQ = _ledgerQ.then(function () {
    var head = S.audit[0], seq = head && head.seq ? head.seq + 1 : 1, prev = head && head.hash ? head.hash : GENESIS;
    var e = { seq: seq, ts: new Date().toISOString(), subject: String(subject), action: String(action), prevHash: prev, hash: '' };
    return hashOf(blockPayload(e)).then(function (h) {
      e.hash = h; S.audit.unshift(e); if (S.audit.length > 500) S.audit.length = 500;
      save(); if (window.renderPanel) { renderPanel('ledger'); renderPanel('activity'); } updateLedgerStatus();
    });
  })['catch'](function () {});
  return _ledgerQ;
}
var ledgerVerified = null;
var autoRefresh = false;   /* session-only on purpose: a stored "on" would fetch prices at page open without a click */
var netCount = 0;   /* outbound requests this page has started this session: price fetch, embed load, contact send */
function verifyChain() {
  var chron = S.audit.slice().reverse(), prev = GENESIS, chain = Promise.resolve({ ok: true, count: chron.length });
  chron.forEach(function (e) {
    chain = chain.then(function (res) {
      if (!res.ok) return res;
      var probe = { seq: e.seq, ts: e.ts, subject: e.subject, action: e.action, prevHash: prev };
      return hashOf(blockPayload(probe)).then(function (h) {
        if (e.prevHash !== prev || h !== e.hash) return { ok: false, brokenAt: e.seq || '?', count: chron.length };
        prev = e.hash; return res;
      });
    });
  });
  return chain;
}
function migrateLedger() {
  var legacy = S.audit.filter(function (e) { return !e.hash; }); if (!legacy.length) return;
  var chron = S.audit.slice().reverse(), prev = GENESIS, seq = 0, chain = Promise.resolve();
  chron.forEach(function (e) { chain = chain.then(function () { e.seq = ++seq; e.prevHash = prev; return hashOf(blockPayload(e)).then(function (h) { e.hash = h; prev = h; }); }); });
  _ledgerQ = chain.then(function () { save(); updateLedgerStatus(); audit('Ledger', 'Re-chained ' + legacy.length + ' pre-existing audit rows into the hash chain'); })['catch'](function () {});
}

function dl(name, content, type) {
  var b = new Blob([content], { type: type || 'text/plain' }), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  audit('Export', name);
}

/* ===================== APP: panel renderers, prices, calculators, ledger ===================== */
function ext(url, text) { return '<a class="footlink" href="' + esc(url) + '" target="_blank" rel="noopener">' + text + '</a>'; }
function refLink(url, text) { return '<a class="footlink" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer sponsored">' + text + '</a> <span class="tag warn" title="Referral link: the guide’s author may benefit if you sign up">referral</span>'; }
function body(id) { return $('pb_' + id); }
function setBody(id, html) { var b = body(id); if (b) b.innerHTML = html; }
function doneCount(key) { return Object.keys(S[key] || {}).filter(function (k) { return S[key][k]; }).length; }
function prog(n, total) { return '<div class="meter" style="margin:6px 0"><i style="width:' + (total ? Math.round(n / total * 100) : 0) + '%"></i></div><div class="mini"><b>' + n + ' / ' + total + '</b> ticked (your own self-tracking, saved in this browser only)</div>'; }
function chkList(items, key, panel, titled) {
  return items.map(function (it, i) {
    var t = titled ? it[0] : it, x = titled ? it[1] : '';
    return '<label class="switch chk"><input type="checkbox" ' + (S[key][i] ? 'checked' : '') + ' data-on-change="toggleChk(\'' + key + '\',' + i + ',\'' + panel + '\')"><span><b>' + esc(t) + '</b>' + (x ? '<span class="mini" style="display:block;font-weight:400">' + esc(x) + '</span>' : '') + '</span></label>';
  }).join('');
}
var CHK_META = { secDone: { items: SEC_ITEMS, label: 'Security checklist' }, buyDone: { items: BUY_ITEMS, label: 'First-purchase checklist' }, anaDone: { items: ANA_ITEMS, label: 'Research checklist' } };
function toggleChk(key, i, panel) {
  S[key][i] = !S[key][i]; save(); playBeep(S[key][i] ? 760 : 420, 'sine', .04, .03);
  var m = CHK_META[key], it = m.items[i]; audit(m.label, '#' + (i + 1) + ' ' + (S[key][i] ? 'ticked' : 'cleared'));
  if (doneCount(key) === m.items.length) fireConfetti();
  renderPanel(panel); renderHud();
}
function disclaimer() { return '<p class="disc">This is not financial advice. Any investment decisions should be made after conducting your own research and consulting with a financial advisor.</p>'; }
function tokenRow(t) {
  var q = mktQuote(t.id), w = S.watch.indexOf(t.id) >= 0;
  return '<div class="tkn"><button class="star' + (w ? ' on' : '') + '" title="' + (w ? 'Remove from watchlist' : 'Add to watchlist') + '" data-on-click="toggleWatch(\'' + t.id + '\')">' + (w ? '★' : '☆') + '</button><span><b>' + esc(t.name) + '</b> <span class="tag">' + esc(t.sym) + '</span><span class="mini"> &mdash; ' + esc(t.blurb) + '</span></span><span class="tkp mono">' + (q ? fmtUsd(q.usd) : '<span class="pend">PENDING</span>') + '</span></div>';
}

/* ---------- guide panels (text carried over from the original page) ---------- */
function renderStart() {
  setBody('start', '<p>Welcome to your cryptocurrency investing journey. Three places to start:</p><div class="excards">' +
    '<div class="excard"><h4>Coinbase</h4><p>I recommend starting with Coinbase, it’s easy to use.</p>' + refLink(LINKS.coinbase, 'Coinbase link') + '</div>' +
    '<div class="excard"><h4>Robinhood</h4><p>Robinhood is another option, but Coinbase offers more crypto choices.</p>' + refLink(LINKS.robinhood, 'Robinhood link') + '</div>' +
    '<div class="excard"><h4>Uphold</h4><p>Uphold is good too, especially if you want to explore other assets beyond crypto.</p>' + refLink(LINKS.uphold, 'Uphold link') + '</div></div>' +
    '<div class="note-warn"><b>Disclosure:</b> all three links above are the author’s referral links. This dashboard never signs up, logs in, or buys anything for you.</div>');
}
function renderBuy() {
  setBody('buy', '<p><b>Coinbase guide.</b> Tick the steps as you complete them on the real site.</p>' + chkList(BUY_ITEMS, 'buyDone', 'buy') + prog(doneCount('buyDone'), BUY_ITEMS.length) +
    '<div class="note-warn">Start small. This checklist only remembers your ticks; no purchase is made from this page.</div>');
}
function renderXrp() {
  setBody('xrp', '<p>XRP is a cryptocurrency used for fast and cheap international transfers. It might play a bigger role in finance in the future, but it’s important to do your own research.</p><p>' + ext(LINKS.xrpHistory, 'Article of XRP History') + '</p>' +
    '<div class="btnrow"><button class="btn sm" data-on-click="watchOnly(\'ripple\')">☆ Watch XRP</button><button class="btn sm" data-on-click="openPanel(\'prices\')">📈 Live prices</button></div>' + disclaimer());
}
function renderSecurity() {
  var n = doneCount('secDone');
  setBody('security', '<p><b>Account Security.</b> Tick each item once it is done on your real accounts.</p>' + chkList(SEC_ITEMS, 'secDone', 'security', true) + prog(n, SEC_ITEMS.length));
}
function renderStorage() {
  setBody('storage', '<p>It’s totally fine to keep your XRP on Coinbase, Robinhood, or Uphold when you’re just starting out, especially if you have less than <b>$500</b> worth. But, if you buy more and your investment goes over $500, you want to keep it safer.</p>' +
    '<div class="excards"><div class="excard"><h4>Xaman App</h4><p>The Xaman Wallet app is a self-custody wallet, which means you’ll have full control over your XRP. It’s like putting your money in a secure bank account that only you have the key to.</p></div>' +
    '<div class="excard"><h4>Even better: cold wallets</h4><p>For even stronger security, consider a “cold wallet” like the Tangem card. These wallets store your crypto completely offline, making them super secure from hackers.</p>' + refLink(LINKS.tangem, 'TangemCARD') + '</div></div>' +
    '<h4 class="sh">Why a self-custody wallet (like Xaman or a cold wallet) matters</h4><ul class="plain">' +
    '<li><b>Your keys, your coins:</b> When you use a self-custody wallet, you’re in control of your XRP. It’s like having the only key to your own safe. No one else can access it.</li>' +
    '<li><b>Exchange risks:</b> Keeping your crypto on Coinbase, Robinhood, or Uphold is convenient, but there’s a small risk that something could happen to the exchange (like hackers or technical problems). With a self-custody wallet, your XRP is much safer.</li>' +
    '<li><b>Write down your seed phrase!</b> When you set up a self-custody wallet, it’ll give you a “seed phrase” – a list of words. This is like the master key to your wallet. Write it down and keep it somewhere super safe (like a fireproof box or a safe deposit box). If you lose your phone, you can use this phrase to recover your XRP.</li></ul>' +
    '<div class="note-warn">Never type your seed phrase into a website, a chat, or this dashboard’s Contact Admin form.</div>');
}
function renderDiversify() {
  setBody('diversify', '<p>Don’t put all your eggs in one basket! Just like you wouldn’t invest all your money in a single company, it’s good to explore different cryptocurrencies. Here are a few categories and examples of utility tokens to consider. Press <b>☆</b> to add one to your watchlist.</p>' +
    '<div class="catgrid">' + CATS.filter(function (c) { return c.id !== 'ref'; }).map(function (c) {
      return '<div class="cat"><h4>' + esc(c.name) + ' <span class="mini">(' + c.tokens.length + ')</span></h4><div class="mini" style="margin-bottom:6px">' + esc(c.note) + '</div>' + TOKENS.filter(function (t) { return t.cat === c.id; }).map(tokenRow).join('') + '</div>';
    }).join('') + '</div>' + '<div class="mini" style="margin-top:8px">Prices appear after you press FETCH in <a class="footlink" data-on-click="openPanel(\'prices\')">Live Prices</a>. ' + tokens() + ' tokens listed.</div>' + disclaimer());
}
function tokens() { return TOKENS.length; }
function renderTypes() {
  setBody('types', '<ul class="plain"><li><b>Utility Tokens:</b> Like the ones mentioned above, these have a specific use within a project or platform.</li><li><b>Payment Coins:</b> These are designed to be used as digital money (like Bitcoin).</li><li><b>Stablecoins:</b> These are designed to have a stable value, usually pegged to a currency like the US dollar (like Tether).</li><li><b>Governance Tokens:</b> These give holders voting rights in a project’s decisions.</li></ul>' +
    '<div class="btnrow"><button class="btn sm" data-on-click="watchOnly(\'bitcoin\')">☆ Watch Bitcoin</button><button class="btn sm" data-on-click="watchOnly(\'tether\')">☆ Watch Tether</button></div>');
}
function renderAnalysis() {
  setBody('analysis', '<p>Don’t just buy based on hype or what you see on social media. Do some research on the project behind the token. Look into things like:</p>' + chkList(ANA_ITEMS, 'anaDone', 'analysis') + prog(doneCount('anaDone'), ANA_ITEMS.length) +
    '<div class="btnrow" style="margin-top:8px"><button class="btn sm" data-on-click="openPanel(\'research\')">🔎 Where to research</button></div>');
}
function renderResearch() {
  setBody('research', '<p>To learn more about the tokens mentioned above, you can visit ' + ext(LINKS.cmc, 'CoinMarketCap.com') + '. Think of it as the yellow pages or encyclopedia for cryptocurrencies! This website provides detailed information about each token, including its price, market capitalization, trading volume, and more. You can also find news and analysis about the cryptocurrency market on CoinMarketCap.</p>');
}
function renderInformed() {
  setBody('informed', '<h4 class="sh">6. Staying informed</h4><p>Keep learning about crypto! Here are some good places to get information:</p><ul class="plain"><li>' + ext(LINKS.coindesk, 'CoinDesk') + '</li><li>' + ext(LINKS.cointelegraph, 'CoinTelegraph') + '</li><li>Search for “cryptocurrency education” on Google or YouTube</li></ul>' +
    '<h4 class="sh">7. Community and support</h4><p>Connect with other crypto enthusiasts online! Search for “cryptocurrency forums” or “cryptocurrency groups” on Google or social media to find communities where you can learn and ask questions.</p>' +
    '<div class="note-warn">Anyone who DMs you offering help, “recovery”, or guaranteed returns is a scam risk. Never share your seed phrase or screen with them.</div>');
}
function renderAdvanced() {
  setBody('advanced', '<h4 class="sh">Advanced insights: ISO 20022, DeFi, and AMMs</h4><ul class="plain"><li><b>ISO 20022:</b> This is a global standard for exchanging electronic messages between financial institutions. Cryptocurrencies adopting this standard could be better positioned for future integration with traditional finance.</li>' +
    '<li><b>Decentralized Finance (DeFi):</b> DeFi aims to create a more open and accessible financial system using blockchain technology.</li>' +
    '<li><b>Automated Market Makers (AMMs):</b> AMMs are a key component of DeFi, enabling decentralized trading of cryptocurrencies without intermediaries. ' + ext(LINKS.amm, 'Learn more about AMMs and how they work') + '</li></ul>');
}
function renderUtility() {
  setBody('utility', '<p>Utility tokens are the lifeblood of many blockchain projects. They grant users access to specific products, services, or features within a platform. Unlike payment coins, utility tokens have a defined purpose beyond simply being a medium of exchange.</p>' +
    '<h4 class="sh">Key characteristics of utility tokens</h4><ul class="plain"><li><b>Access &amp; Functionality:</b> They unlock specific functionalities or services within a blockchain ecosystem.</li><li><b>Incentivization:</b> They can be used to reward users for contributing to the network (e.g., staking, providing resources).</li><li><b>Governance:</b> Some utility tokens grant holders voting rights in the project’s development and direction.</li></ul>' +
    '<p><b>Examples:</b> Consider tokens used for cloud storage, decentralized computing power, or access to exclusive content platforms.</p><p><b>Due diligence:</b> Before investing in a utility token, carefully evaluate the project’s viability, the token’s utility, and the strength of the underlying ecosystem.</p>' + disclaimer());
}
function renderGlossary() {
  var q = ($('glQ') ? $('glQ').value : '').toLowerCase(), list = GLOSSARY.filter(function (g) { return (g[0] + ' ' + g[1]).toLowerCase().indexOf(q) >= 0; });
  var el = $('glList'); if (!el) return;
  el.innerHTML = list.length ? list.map(function (g) { return '<div class="gl"><b>' + esc(g[0]) + '</b><span>' + esc(g[1]) + '</span></div>'; }).join('') : '<div class="empty">No term matches “' + esc(q) + '”.</div>';
  if ($('glMeta')) $('glMeta').textContent = list.length + ' of ' + GLOSSARY.length + ' terms';
}
function renderFaq() {
  setBody('faq', FAQ.map(function (f) { return '<details class="faqd"><summary>' + esc(f[0]) + '</summary><p>' + esc(f[1]) + '</p></details>'; }).join(''));
}

/* ---------- calculators: arithmetic on numbers the visitor types; nothing is estimated or forecast ---------- */
function numOf(id) { var e = $(id); return e && e.value !== '' ? parseFloat(e.value) : NaN; }
function calcDca() {
  var out = $('dcaOut'); if (!out) return;
  S.dca = { amt: $('dcaAmt').value, n: $('dcaN').value, freq: $('dcaFreq').value, prices: $('dcaPrices').value }; save();
  var amt = numOf('dcaAmt'), n = numOf('dcaN'), raw = $('dcaPrices').value.split(/[\s,;]+/).filter(Boolean), prices = raw.map(parseFloat), fq = $('dcaFreq').value;
  if (!(amt > 0) || !(n >= 1) || n !== Math.floor(n) || n > 520) { out.innerHTML = '<div class="empty">Enter an amount and a whole number of purchases (1–520) to see the arithmetic. Nothing is assumed for you.</div>'; return; }
  if (prices.length !== n) { out.innerHTML = '<div class="empty">Enter exactly <b>' + n + '</b> prices, one per purchase (you entered ' + prices.length + '). This calculator never invents prices.</div>'; return; }
  if (prices.some(function (p) { return !(p > 0) || !isFinite(p); })) { out.innerHTML = '<div class="empty">Every price must be a number greater than zero.</div>'; return; }
  var units = 0, rows = []; prices.forEach(function (p, i) { var u = amt / p; units += u; rows.push('<tr><td class="m">' + (i + 1) + '</td><td class="m">$' + fmtNum(p) + '</td><td class="m">' + fmtNum(u) + '</td></tr>'); });
  var invested = amt * n, avg = invested / units, last = prices[n - 1], lumpUnits = invested / prices[0], vDca = units * last, vLump = lumpUnits * last;
  out.innerHTML = '<div class="gkpis dcak"><div class="gkpi"><div class="v">$' + fmtNum(invested) + '</div><div class="l">invested</div></div><div class="gkpi"><div class="v">' + fmtNum(units) + '</div><div class="l">units bought</div></div><div class="gkpi"><div class="v">$' + fmtNum(avg) + '</div><div class="l">average cost</div></div><div class="gkpi"><div class="v">$' + fmtNum(vDca) + '</div><div class="l">value at last price</div></div></div>' +
    '<div class="kv" style="margin:12px 0"><span>Buying all at once on purchase #1 (price $' + fmtNum(prices[0]) + ')</span><b>' + fmtNum(lumpUnits) + ' units → $' + fmtNum(vLump) + '</b><span>One purchase every ' + esc(fq) + ' (the schedule above)</span><b>' + fmtNum(units) + ' units → $' + fmtNum(vDca) + '</b><span>Difference at the last price</span><b>' + (vDca - vLump >= 0 ? '+' : '−') + '$' + fmtNum(Math.abs(vDca - vLump)) + '</b></div>' +
    '<div class="tbl-scroll"><table class="t"><tr><th>#</th><th>Price</th><th>Units</th></tr>' + rows.join('') + '</table></div><div class="mini" style="margin-top:6px">Arithmetic on the prices you typed. It is an illustration, not a forecast or a recommendation.</div>';
}
function drawCycles() {
  var el = $('cyRange'), o = $('cyOut'); if (!el || !o) return; var d = +el.value, g = (1 / (1 - d / 100) - 1) * 100;
  o.innerHTML = 'After a <b>' + d + '%</b> fall you need <b class="mono" style="color:var(--accent)">+' + (g >= 1000 ? Math.round(g).toLocaleString('en-US') : g.toFixed(1)) + '%</b> just to get back to even.';
}
function fmtNum(n) { if (!isFinite(n)) return '—'; var a = Math.abs(n); return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: a >= 1 ? 2 : 6 }); }

/* ---------- live prices (user-initiated; never fabricated) ---------- */
var mkt = { data: null, ts: 0, err: '', loading: false, n: 0, backoff: 0 };
function mktQuote(id) { var d = mkt.data && mkt.data[id]; return d && typeof d.usd === 'number' ? d : null; }
function fmtUsd(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 6 : 2 }); }
function fmtBig(n) { if (typeof n !== 'number' || !isFinite(n)) return '—'; var a = Math.abs(n); return '$' + (a >= 1e12 ? (n / 1e12).toFixed(2) + ' T' : a >= 1e9 ? (n / 1e9).toFixed(2) + ' B' : a >= 1e6 ? (n / 1e6).toFixed(1) + ' M' : n.toLocaleString('en-US', { maximumFractionDigits: 0 })); }
function ageText(ms) { var s = Math.max(0, Math.round(ms / 1000)); return s < 90 ? s + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h'; }
function pricedCount() { return TOKENS.filter(function (t) { return !!mktQuote(t.id); }).length; }
function fetchPrices(why) {
  if (mkt.loading) return; if (Date.now() < mkt.backoff) { toast('warn', 'RATE LIMITED', 'CoinGecko asked us to slow down. Try again in ' + Math.ceil((mkt.backoff - Date.now()) / 1000) + ' s.'); return; }
  mkt.loading = true; netCount++; renderPrices(); renderStatus(); playBeep(700, 'sine', .05, .03);
  fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + TOKENS.map(function (t) { return t.id; }).join(',') + '&vs_currencies=usd&include_24hr_change=true&include_market_cap=true', { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
    .then(function (r) { if (r.status === 429) { mkt.backoff = Date.now() + 120000; throw new Error('Rate limited by CoinGecko (HTTP 429). Wait about 2 minutes.'); } if (!r.ok) throw new Error('CoinGecko answered HTTP ' + r.status); return r.json(); })
    .then(function (d) { if (!d || typeof d !== 'object') throw new Error('Unexpected response'); mkt.data = d; mkt.ts = Date.now(); mkt.err = ''; mkt.n = pricedCount(); audit('Prices', 'Fetched ' + mkt.n + ' of ' + TOKENS.length + ' (' + why + ')'); })
    ['catch'](function (e) { mkt.err = (e && e.message) || 'Network error'; if (/Failed to fetch|NetworkError|Load failed/i.test(mkt.err)) mkt.err = 'Request blocked or offline (' + mkt.err + ')'; audit('Prices', 'Fetch failed'); toast('err', 'PRICES UNAVAILABLE', mkt.err); })
    .then(function () { mkt.loading = false; renderPrices(); renderPanel('diversify'); renderHud(); renderStatus(); });
}
function priceStatusHtml() {
  if (mkt.loading) return '<b>FETCHING…</b> one request to api.coingecko.com is in flight.';
  if (mkt.data && !mkt.err) return '<b style="color:var(--accent-2)">LIVE</b> &middot; ' + mkt.n + ' of ' + TOKENS.length + ' priced &middot; fetched ' + esc(fmtPT(new Date(mkt.ts)).slice(11)) + ' (<span id="prAge">' + ageText(Date.now() - mkt.ts) + '</span> ago) &middot; source CoinGecko public API';
  if (mkt.data) return '<b style="color:var(--warn)">STALE</b> &middot; ' + esc(mkt.err) + ' &middot; showing data from ' + ageText(Date.now() - mkt.ts) + ' ago';
  if (mkt.err) return '<b style="color:var(--danger)">ERROR</b> &middot; ' + esc(mkt.err) + ' &middot; prices stay PENDING. Press FETCH to retry.';
  return '<b>PENDING</b> &middot; no price data yet. Press <code>FETCH LIVE PRICES</code> (this sends one request to api.coingecko.com).';
}
var SORTS = { cat: 'Guide order', name: 'Name', price: 'Price', chg: '24 h %', mcap: 'Market cap' };
function sortBy(k) { if (S.sortK === k) S.sortD = -S.sortD; else { S.sortK = k; S.sortD = k === 'name' || k === 'cat' ? 1 : -1; } save(); renderPrices(); playBeep(640, 'sine', .04, .025); }
function toggleWatchOnly() { S.watchOnly = !!$('prWatchOnly').checked; save(); renderPrices(); }
function toggleAuto() { autoRefresh = !!$('prAuto').checked; save(); audit('Prices', 'Auto-refresh ' + (autoRefresh ? 'on (60 s while the panel is open)' : 'off')); if (autoRefresh) fetchPrices('auto-refresh enabled'); }
function ranked() {
  var withCap = TOKENS.filter(function (t) { var q = mktQuote(t.id); return q && typeof q.usd_market_cap === 'number'; }).sort(function (a, b) { return mktQuote(b.id).usd_market_cap - mktQuote(a.id).usd_market_cap; }), r = {};
  withCap.forEach(function (t, i) { r[t.id] = i + 1; }); return r;
}
function renderPrices() {
  var st = $('prStatus'), tb = $('prTable'); if (!st || !tb) return;
  st.innerHTML = priceStatusHtml(); $('prFetch').disabled = mkt.loading; $('prFetch').textContent = mkt.loading ? '⟳ FETCHING…' : '⟳ ' + (mkt.data ? 'REFRESH' : 'FETCH LIVE PRICES'); $('prAuto').checked = !!autoRefresh; $('prWatchOnly').checked = !!S.watchOnly;
  var rk = ranked(), list = TOKENS.map(function (t, i) { return { t: t, i: i, q: mktQuote(t.id) }; });
  if (S.watchOnly) list = list.filter(function (x) { return S.watch.indexOf(x.t.id) >= 0; });
  var k = S.sortK, d = S.sortD;
  list.sort(function (a, b) {
    var va, vb; if (k === 'name') { va = a.t.name.toLowerCase(); vb = b.t.name.toLowerCase(); } else if (k === 'price') { va = a.q ? a.q.usd : null; vb = b.q ? b.q.usd : null; } else if (k === 'chg') { va = a.q ? a.q.usd_24h_change : null; vb = b.q ? b.q.usd_24h_change : null; } else if (k === 'mcap') { va = a.q ? a.q.usd_market_cap : null; vb = b.q ? b.q.usd_market_cap : null; } else { va = a.i; vb = b.i; }
    if (va == null && vb == null) return a.i - b.i; if (va == null) return 1; if (vb == null) return -1; return va < vb ? -d : va > vb ? d : 0;
  });
  var th = function (key, label) { return '<th class="sortable' + (S.sortK === key ? ' on' : '') + '" data-on-click="sortBy(\'' + key + '\')">' + label + (S.sortK === key ? (S.sortD > 0 ? ' ▲' : ' ▼') : '') + '</th>'; };
  tb.innerHTML = list.length ? '<div class="tbl-scroll"><table class="t pt"><tr><th></th><th>Rank*</th>' + th('name', 'Token') + '<th>Category</th>' + th('price', 'Price (USD)') + th('chg', '24 h %') + th('mcap', 'Market cap') + '</tr>' + list.map(function (x) {
    var t = x.t, q = x.q, w = S.watch.indexOf(t.id) >= 0, ch = q && typeof q.usd_24h_change === 'number' ? q.usd_24h_change : null;
    return '<tr><td><button class="star' + (w ? ' on' : '') + '" data-on-click="toggleWatch(\'' + t.id + '\')" aria-label="Watch ' + esc(t.name) + '">' + (w ? '★' : '☆') + '</button></td><td class="m">' + (rk[t.id] || '—') + '</td><td><b>' + esc(t.name) + '</b> <span class="tag">' + esc(t.sym) + '</span></td><td class="mini">' + esc(t.catName) + '</td><td class="m">' + (q ? fmtUsd(q.usd) : '<span class="pend">PENDING</span>') + '</td><td class="m ' + (ch == null ? '' : ch >= 0 ? 'up' : 'dn') + '">' + (ch == null ? '<span class="pend">PENDING</span>' : (ch >= 0 ? '+' : '−') + Math.abs(ch).toFixed(2) + '%') + '</td><td class="m">' + (q && typeof q.usd_market_cap === 'number' ? fmtBig(q.usd_market_cap) : '<span class="pend">PENDING</span>') + '</td></tr>';
  }).join('') + '</table></div><div class="mini" style="margin-top:6px">*Rank among the ' + TOKENS.length + ' tokens in this guide by market cap, not the global CoinGecko rank. Sort: ' + esc(SORTS[S.sortK]) + '.</div>' : '<div class="empty">Your watchlist is empty. Press ☆ next to a token in this table or in Diversification.</div>';
}
function toggleWatch(id) {
  var i = S.watch.indexOf(id), t = tokById(id); if (!t) return; if (i >= 0) S.watch.splice(i, 1); else S.watch.push(id); save();
  playBeep(i >= 0 ? 420 : 760, 'sine', .04, .03); audit('Watchlist', (i >= 0 ? 'Removed ' : 'Added ') + t.sym); renderPanel('prices'); renderPanel('diversify'); renderHud(); renderStatus();
}
function watchOnly(id) { if (S.watch.indexOf(id) < 0) toggleWatch(id); else toast('ok', 'WATCHLIST', tokById(id).name + ' is already on your watchlist.'); }
function clearWatch() { if (!S.watch.length) return; S.watch = []; save(); audit('Watchlist', 'Cleared'); renderPanel('prices'); renderPanel('diversify'); renderHud(); renderStatus(); }
function exportPricesCSV() {
  if (!mkt.data) { toast('warn', 'NO DATA', 'Fetch live prices first. Nothing is exported until real data exists.'); return; }
  var rk = ranked(); dl('CryptoCompass_prices.csv', '# source: CoinGecko public API; fetched ' + new Date(mkt.ts).toISOString() + '\nrank_in_guide,name,ticker,category,coingecko_id,usd,usd_24h_change,usd_market_cap,watched\n' + TOKENS.map(function (t) { var q = mktQuote(t.id) || {}; return [rk[t.id] || '', t.name, t.sym, t.catName, t.id, q.usd == null ? '' : q.usd, q.usd_24h_change == null ? '' : q.usd_24h_change, q.usd_market_cap == null ? '' : q.usd_market_cap, S.watch.indexOf(t.id) >= 0 ? 'yes' : 'no'].map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(','); }).join('\n'), 'text/csv');
  toast('ok', 'EXPORT', 'Prices CSV downloaded.');
}

/* ---------- Crypto Bubbles: third-party iframe, loaded only on request ---------- */
var bubblesLoaded = false;
function loadBubbles() {
  var w = $('bbWrap'); if (!w) return; bubblesLoaded = true; netCount++;
  w.innerHTML = '<iframe id="bbFrame" title="Crypto Bubbles" src="' + esc(LINKS.bubbles) + '" referrerpolicy="no-referrer" allowfullscreen sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>';
  $('bbLoad').textContent = '■ UNLOAD'; $('bbLoad').onclick = unloadBubbles; audit('Crypto Bubbles', 'Embed loaded by the visitor'); playBeep(760, 'sine', .05, .03); renderStatus();
}
function unloadBubbles() {
  var w = $('bbWrap'); if (!w) return; bubblesLoaded = false; w.innerHTML = '<div class="empty" id="bbEmpty">Not loaded. Nothing has been requested from cryptobubbles.net.</div>';
  $('bbLoad').textContent = '▶ LOAD CRYPTO BUBBLES'; $('bbLoad').onclick = loadBubbles; audit('Crypto Bubbles', 'Embed unloaded'); playBeep(420, 'sine', .05, .03); renderStatus();
}

/* ---------- activity + ledger ---------- */
function renderActivity() {
  var cv = $('spark'); if (!cv) return; var w = cv.clientWidth || 600; cv.width = w; var ctx = cv.getContext('2d'), N = 24, now = Date.now(), b = new Array(N).fill(0), cnt = 0;
  S.audit.forEach(function (e) { var age = (now - Date.parse(e.ts)) / 3600000; if (age >= 0 && age < N) { b[N - 1 - Math.floor(age)]++; cnt++; } });
  var mx = Math.max(1, Math.max.apply(null, b)), cs = getComputedStyle(document.documentElement);
  ctx.clearRect(0, 0, w, 80); ctx.strokeStyle = cs.getPropertyValue('--accent').trim() || '#2fe6d0'; ctx.lineWidth = 2; ctx.beginPath();
  b.forEach(function (v, i) { var x = 6 + i * (w - 12) / (N - 1), y = 72 - v / mx * 62; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
  if ($('sparkMeta')) $('sparkMeta').textContent = cnt + ' ledger events in the last 24 h · peak ' + mx + '/h';
}
function renderLedger() {
  var b = $('ledBody'); if (!b) return;
  if (!S.audit.length) { b.innerHTML = '<div class="empty">The ledger is empty. Every action appends a hash-chained block (metadata only).</div>'; }
  else b.innerHTML = '<div class="tbl-scroll"><table class="t"><tr><th>#</th><th>Time</th><th>Event</th><th>Detail</th><th>Hash</th></tr>' + S.audit.slice(0, 60).map(function (e) { return '<tr><td class="m">' + e.seq + '</td><td class="m">' + esc(fmtPT(e.ts)) + '</td><td>' + esc(e.subject) + '</td><td>' + esc(e.action) + '</td><td class="m" title="' + e.hash + '">' + (e.hash || '').slice(0, 12) + '…</td></tr>'; }).join('') + '</table></div>' + (S.audit.length > 60 ? '<div class="mini">Showing newest 60 of ' + S.audit.length + '.</div>' : '');
  updateLedgerStatus();
}
function updateLedgerStatus() {
  var c = $('ledCount'), a = $('ledAlgo'), n = $('ledNote'); if (c) c.textContent = S.audit.length + ' blocks'; if (a) a.textContent = LEDGER_ALGO;
  if (n) { n.style.display = HAS_SUBTLE ? 'none' : 'block'; n.innerHTML = HAS_SUBTLE ? '' : '⚠ <b>crypto.subtle is unavailable in this context</b> (browsers withhold WebCrypto on a bare <code>file://</code> path). The ledger still uses real SHA-256 through the built-in JavaScript implementation and is labelled accordingly. Serve over <code>https://</code> or <code>http://localhost</code> to use WebCrypto.'; }
  renderStatus();
}
function verifyLedger() {
  var st = $('ledState'); if (st) { st.textContent = 'Verifying…'; st.style.color = 'var(--warn)'; }
  ledgerSettled().then(verifyChain).then(function (r) {
    ledgerVerified = r.ok; if (st) { st.style.color = r.ok ? 'var(--accent-2)' : 'var(--danger)'; st.textContent = r.ok ? 'INTACT · ' + r.count + ' blocks verified' : 'BROKEN at block #' + r.brokenAt; }
    toast(r.ok ? 'ok' : 'err', r.ok ? 'CHAIN INTACT' : 'CHAIN BROKEN', r.ok ? r.count + ' blocks verified (' + LEDGER_ALGO + ').' : 'First mismatch at block #' + r.brokenAt + '.');
    playBeep(r.ok ? 880 : 200, 'sine', .1, .06); renderHud(); renderStatus();
  });
}
function exportLedger(kind) {
  var blocks = S.audit.slice().reverse();
  if (kind === 'csv') { dl('CryptoCompass_ledger.csv', 'seq,ts,subject,action,prevHash,hash\n' + blocks.map(function (e) { return [e.seq, e.ts, e.subject, e.action, e.prevHash, e.hash].map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(','); }).join('\n'), 'text/csv'); }
  else dl('CryptoCompass_ledger.json', JSON.stringify({ app: APP_NAME, version: APP_VERSION, algo: LEDGER_ALGO, genesis: GENESIS, exportedAt: new Date().toISOString(), blocks: blocks }, null, 2), 'application/json');
  toast('ok', 'EXPORT', 'Ledger ' + kind.toUpperCase() + ' downloaded.');
}
function importLedger(file) {
  if (!file) return; var fr = new FileReader();
  fr.onload = function () {
    try {
      var o = JSON.parse(fr.result); if (o.app !== APP_NAME || !Array.isArray(o.blocks)) throw new Error('Not a Crypto Compass ledger export.');
      ledgerQueue(function () { S.audit = o.blocks.slice().reverse(); save(); renderPanel('ledger'); }); toast('ok', 'IMPORTED', o.blocks.length + ' blocks — run VERIFY CHAIN.'); audit('Ledger', 'Imported ' + o.blocks.length + ' blocks');
    } catch (e) { toast('err', 'IMPORT FAILED', e.message); }
  }; fr.readAsText(file);
}
function clearLedger() { if (!confirm('Clear the audit ledger? This cannot be undone.')) return; ledgerQueue(function () { S.audit = []; save(); }).then(function () { renderPanel('ledger'); audit('Ledger', 'Cleared by user'); }); }

function changelogHtml() {
  return '<h4>Version history</h4><div class="tbl-scroll"><table class="t"><tr><th>Version</th><th>Date</th><th>Changes</th></tr>' + CHANGELOG.map(function (c) { return '<tr><td class="m"><b>v' + esc(c.v) + '</b></td><td class="m">' + esc(c.d) + '</td><td><ul class="plain" style="margin:0;padding-left:16px">' + c.n.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></td></tr>'; }).join('') + '</table></div>';
}
function renderAbout() {
  var h = '<h4>What this is</h4><p>Crypto Compass is a self-hosted learning dashboard built from the author’s beginner’s guide to cryptocurrency investing. Everything runs in this page; there is no server and no account.</p>' +
    '<h4>Not financial advice</h4><p>This is not financial advice. Crypto can be volatile: only invest what you can afford to lose and do your own research. Any investment decisions should be made after conducting your own research and consulting with a financial advisor. The tokens named here are the guide’s examples, not recommendations from this dashboard.</p>' +
    '<h4>Referral links</h4><p>The Coinbase, Robinhood, Uphold and Tangem links are the author’s referral links and are marked <span class="tag warn">referral</span>. The author may benefit if you sign up or buy through them.</p>' +
    '<h4>Network: exactly what leaves this page</h4><p>Nothing is sent when the page opens. There are three outbound requests, and each one waits for you: <b>(1)</b> Fetch / Refresh in Live Prices asks <code>api.coingecko.com</code> for the listed tokens’ prices; <b>(2)</b> LOAD in Crypto Bubbles embeds <code>cryptobubbles.net</code>, whose own cookies and policies then apply; <b>(3)</b> SEND in Contact Admin posts your message to the administrator’s relay. There are no analytics, no CDN scripts, no web fonts and no tracking.</p>' +
    '<h4>What is stored</h4><p>One key in this browser’s localStorage (<code>' + STORE_KEY + '</code>): your ticks, watchlist, layout, effect settings and the audit ledger. The ledger records metadata only (panel names, counts, file names), never message text. Prices are not stored.</p>' +
    '<h4>About the numbers</h4><p>Prices, 24 h change and market cap come straight from CoinGecko’s public API when you ask for them. They can be delayed or rate-limited and are not a quote you can trade at. If a request fails the table says so and keeps showing PENDING rather than a made-up number. Some projects may have been renamed or merged since the guide was written, so a ticker here can differ from the exchange’s current one.</p>' +
    '<h4>Ledger</h4><p>Each action is a block <code>seq|ts|event|detail|prevHash</code> hashed with SHA-256, so editing or deleting a row breaks the chain and Verify names the first broken block.</p>';
  h += changelogHtml(); if ($('pb_about')) $('pb_about').innerHTML = '<div class="about">' + h + '</div>'; if ($('stAbout')) $('stAbout').innerHTML = h + '<p class="mini">Build ' + APP_VERSION + ' &middot; ' + TOKENS.length + ' tokens &middot; ' + LEDGER_ALGO + '</p>';
}

/* ---------- static skeletons: controls that must not be rebuilt when their panel re-renders ---------- */
var STATIC = {
  prices: '<div class="btnrow" style="align-items:center"><button class="btn primary" id="prFetch" data-on-click="fetchPrices(\'manual\')">⟳ FETCH LIVE PRICES</button><label class="switch" style="margin:0"><input type="checkbox" id="prAuto" data-on-change="toggleAuto()"> auto-refresh every 60 s while this panel is open (this session only)</label><label class="switch" style="margin:0"><input type="checkbox" id="prWatchOnly" data-on-change="toggleWatchOnly()"> watchlist only</label><button class="btn sm" data-on-click="exportPricesCSV()">CSV</button><button class="btn sm danger" data-on-click="clearWatch()">CLEAR WATCHLIST</button></div><div class="note-warn" id="prStatus"></div><div id="prTable"></div><div class="mini" style="margin-top:6px">Source: CoinGecko public API &middot; USD &middot; may be delayed or rate-limited &middot; informational only, not a quote you can trade at.</div>',
  bubbles: '<div class="note-warn">This panel embeds a <b>third-party site</b> (cryptobubbles.net). Nothing is requested from it until you press LOAD, and once loaded its own cookies and tracking policies apply. The preset is the 15 currencies from the original guide.</div><div class="btnrow" style="margin-bottom:10px"><button class="btn primary" id="bbLoad" data-on-click="loadBubbles()">▶ LOAD CRYPTO BUBBLES</button><a class="btn" href="' + esc(LINKS.bubbles) + '" target="_blank" rel="noopener noreferrer">↗ Open in a new tab</a></div><div class="bbwrap noprint" id="bbWrap"><div class="empty" id="bbEmpty">Not loaded. Nothing has been requested from cryptobubbles.net.</div></div>',
  dca: '<p>Dollar-Cost Averaging (DCA) means investing a small amount regularly (like every week or month), instead of investing a large amount all at once. This can help you avoid buying when the price is too high. Try the arithmetic with prices <b>you</b> type in:</p><div class="row3"><div class="field"><label class="ctrl-label" for="dcaAmt">Amount per purchase (USD)</label><input type="number" id="dcaAmt" min="0" step="any" inputmode="decimal" placeholder="e.g. 25" data-on-input="calcDca()"></div><div class="field"><label class="ctrl-label" for="dcaN">Number of purchases</label><input type="number" id="dcaN" min="1" max="520" step="1" inputmode="numeric" placeholder="e.g. 4" data-on-input="calcDca()"></div><div class="field"><label class="ctrl-label" for="dcaFreq">One purchase every</label><select id="dcaFreq" data-on-change="calcDca()"><option>week</option><option>2 weeks</option><option>month</option></select></div></div><div class="field"><label class="ctrl-label" for="dcaPrices">Price at each purchase, USD (comma-separated, one per purchase)</label><textarea id="dcaPrices" class="mono" rows="2" placeholder="numbers you choose, e.g. 2.10, 1.85, 2.40, 2.00" data-on-input="calcDca()"></textarea></div><div id="dcaOut"></div>',
  cycles: '<p>The crypto market goes up and down like a roller coaster! Be prepared for price swings and don’t panic sell if the price drops. It’s important to be patient and think long-term.</p><div class="grp"><label class="ctrl-label" for="cyRange">If a price falls by: <b id="cyV">50</b>%</label><input type="range" id="cyRange" min="5" max="95" value="50" data-on-input="$(\'cyV\').textContent=this.value;drawCycles()"><div id="cyOut" style="margin-top:8px"></div></div><div class="tbl-scroll"><table class="t"><tr><th>Fall</th><th>Rise needed to break even</th></tr>' + [10, 20, 30, 40, 50, 60, 70, 80, 90].map(function (d) { return '<tr><td class="m">−' + d + '%</td><td class="m">+' + Math.round((1 / (1 - d / 100) - 1) * 1000) / 10 + '%</td></tr>'; }).join('') + '</table></div><h4 class="sh">Risk</h4><p>Crypto can be volatile! <b>Only invest what you can afford to lose</b> and, <b>do not forget it’s important to do your own research.</b></p>' + '<p class="disc">This is not financial advice. Any investment decisions should be made after conducting your own research and consulting with a financial advisor.</p>',
  glossary: '<div class="field"><input type="search" id="glQ" placeholder="Search terms…" data-on-input="renderGlossary()" autocomplete="off"></div><div id="glList"></div><div class="mini" id="glMeta" style="margin-top:6px"></div>',
  activity: '<canvas class="spark" id="spark" height="80"></canvas><div class="mini" id="sparkMeta" style="margin-top:6px"></div>',
  ledger: '<div class="btnrow" style="margin-bottom:10px;align-items:center"><button class="btn sm primary" data-on-click="verifyLedger()">✓ VERIFY CHAIN</button><button class="btn sm" data-on-click="exportLedger(\'json\')">JSON</button><button class="btn sm" data-on-click="exportLedger(\'csv\')">CSV</button><button class="btn sm" data-on-click="$(\'ledImport\').click()">IMPORT</button><input type="file" id="ledImport" accept=".json" style="display:none" data-on-change="importLedger(this.files[0])"><button class="btn sm danger" data-on-click="clearLedger()">CLEAR</button><span class="mini">CHAIN STATE: <b id="ledState">Not yet verified</b> &middot; <span id="ledAlgo"></span> &middot; <span id="ledCount"></span></span></div><div class="note-warn" id="ledNote" style="display:none"></div><div id="ledBody"></div>'
};
function mountStatic() {
  Object.keys(STATIC).forEach(function (id) { var b = body(id); if (b && !b.firstChild) b.innerHTML = STATIC[id]; });
  var d = S.dca || {}; if ($('dcaAmt')) { $('dcaAmt').value = d.amt || ''; $('dcaN').value = d.n || ''; if (d.freq) $('dcaFreq').value = d.freq; $('dcaPrices').value = d.prices || ''; }
}

/* ===================== APP: chrome, views, walkthrough, splash, palette, settings, boot ===================== */
var RENDER = { start: renderStart, buy: renderBuy, xrp: renderXrp, security: renderSecurity, storage: renderStorage, diversify: renderDiversify, types: renderTypes, analysis: renderAnalysis, dca: calcDca, cycles: drawCycles, research: renderResearch, informed: renderInformed, advanced: renderAdvanced, utility: renderUtility, prices: renderPrices, bubbles: null, glossary: renderGlossary, faq: renderFaq, activity: renderActivity, ledger: renderLedger, about: renderAbout };
var PANELS = PANEL_META.map(function (m) { return { id: m.id, name: m.name, ic: m.ic, r: RENDER[m.id] }; });
var GUIDE_IDS = ['start', 'buy', 'xrp', 'security', 'storage', 'diversify', 'types', 'analysis', 'dca', 'cycles', 'research', 'informed', 'advanced', 'utility'];
var STORAGE_OK = (function () { try { localStorage.setItem('__cc_probe', '1'); localStorage.removeItem('__cc_probe'); return true; } catch (e) { return false; } })();
var sessionStart = Date.now();
function pById(id) { return PANELS.filter(function (p) { return p.id === id; })[0]; }
function panelEl(id) { return $('panel_' + id); }
function renderPanel(id) { var p = pById(id); if (!p || !p.r) return; var el = panelEl(id); if (!el) return; try { p.r(); } catch (e) { console.error('panel ' + id, e); } }

/* ---------- panel chrome ---------- */
function buildPanelHeads() {
  PANELS.forEach(function (p) {
    var el = panelEl(p.id); if (!el || el.querySelector('.phead')) return;
    var h = document.createElement('div'); h.className = 'phead';
    h.innerHTML = '<span class="ic">' + p.ic + '</span><h3>' + p.name + '</h3><div class="pctl"><button class="rowbtn" title="Move up" data-on-click="movePanel(\'' + p.id + '\',-1)">▲</button><button class="rowbtn" title="Move down" data-on-click="movePanel(\'' + p.id + '\',1)">▼</button><button class="rowbtn" title="Collapse / expand" data-on-click="toggleCollapse(\'' + p.id + '\')">▾</button><button class="rowbtn" title="Hide" data-on-click="hidePanel(\'' + p.id + '\')">✕</button></div>';
    el.insertBefore(h, el.firstChild);
  });
}
function applyOrder() {
  var g = $('grid'), ids = (S.order || []).filter(function (id) { return pById(id); });
  PANELS.forEach(function (p) { if (ids.indexOf(p.id) < 0) ids.push(p.id); }); S.order = ids;
  ids.forEach(function (id) { var el = panelEl(id); if (el) g.appendChild(el); });
}
function movePanel(id, d) { var o = S.order, i = o.indexOf(id), j = i + d; if (j < 0 || j >= o.length) return; o.splice(i, 1); o.splice(j, 0, id); save(); applyOrder(); playBeep(560, 'sine', .04, .025); }
function toggleCollapse(id) {
  var el = id === 'walkthrough' ? $('panel-walkthrough') : panelEl(id); if (!el) return;
  var c = el.getAttribute('data-collapsed') === '1' ? '0' : '1'; el.setAttribute('data-collapsed', c); S.collapsed[id] = c === '1'; save(); playBeep(c === '1' ? 520 : 700, 'sine', .04, .025);
}
/* Default view = the three components (#homeBanner, #heroHud, #panel-walkthrough); everything else hidden. data-keep panels are pinned open. */
/* The opening page is the visitor's choice (Settings > Opening page, saved in prefs.startPage). Banner and HUD always show; the chosen panel opens under them.
   "tour" = the original standard trio (banner, HUD, guided walkthrough). Any other page hides the walkthrough unless prefs.startWt is on. Nothing is requested from the network by any choice. */
var START_PAGES = [['start', 'Getting started', '🚀'], ['security', 'Security checklist', '🔐'], ['prices', 'Live prices (still PENDING until you press Fetch)', '📈'], ['tour', 'Guided tour (walkthrough)', '🧭']];
function startPageId() { var p = prefs.startPage; return START_PAGES.some(function (x) { return x[0] === p; }) ? p : 'start'; }
function startPageName() { return START_PAGES.filter(function (x) { return x[0] === startPageId(); })[0][1].replace(/ \(.*\)$/, ''); }
function applyDefaultView() {
  S.hidden = {}; PANELS.forEach(function (p) { S.hidden[p.id] = true; }); S.tray = []; S.view = 'grid';
  var sp = startPageId(), wtOn = sp === 'tour' || !!prefs.startWt;
  if (sp !== 'tour') S.hidden[sp] = false;
  var hud = $('heroHud'); if (hud) hud.setAttribute('data-hidden', '0');
  var wt = $('panel-walkthrough'); if (wt) { wt.setAttribute('data-hidden', wtOn ? '0' : '1'); wt.setAttribute('data-collapsed', '0'); }
  if (wtTimer) wtStop();
  save();
}
function setStartPage(id, quiet) { prefs.startPage = id; saveUI(); if (!quiet) { audit('Settings', 'Opening page set to ' + startPageName()); toast('ok', 'OPENING PAGE', startPageName() + '. Applies on every page load; press Default View to see it now.'); } }
function defaultView() { applyDefaultView(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); playBeep(560, 'sine', .06, .03); audit('Layout', 'Default view restored (' + startPageName() + ')'); toast('ok', 'DEFAULT VIEW', 'Banner, HUD and ' + startPageName() + '.'); }
function hideAllPanels() { defaultView(); }
function showAll() { PANELS.forEach(function (p) { S.hidden[p.id] = false; }); S.tray = []; save(); render(); playBeep(880, 'sine', .07, .04); audit('Layout', 'Show all panels'); }
function hidePanel(id) {
  S.hidden[id] = true; S.tray = (S.tray || []).filter(function (x) { return x !== id; }); S.tray.unshift(id); if (S.tray.length > 8) S.tray.length = 8;
  playBeep(420, 'sine', .05, .03); audit('Panel ' + id, 'Hidden'); render();
}
function togglePanel(id) { S.hidden[id] = !S.hidden[id]; if (!S.hidden[id]) S.tray = (S.tray || []).filter(function (x) { return x !== id; }); playBeep(S.hidden[id] ? 420 : 760, 'sine', .05, .03); render(); }
function openPanel(id) {
  var wasHidden = S.hidden[id];
  if (S.hidden[id]) { S.hidden[id] = false; S.tray = (S.tray || []).filter(function (x) { return x !== id; }); render(); }
  var el = panelEl(id); if (el && el.getAttribute('data-collapsed') === '1') toggleCollapse(id);
  if (GUIDE_IDS.indexOf(id) >= 0 && !S.read[id]) { S.read[id] = true; save(); renderHud(); }
  renderPanel(id); setTimeout(function () { jumpTo('panel_' + id); }, 40);
  if (wasHidden) audit('Panel ' + id, 'Opened');
}
function jumpTo(domId) {
  if (domId === 'panel-walkthrough' || domId === 'heroHud') { var w = $(domId); if (w.getAttribute('data-hidden') === '1') { w.setAttribute('data-hidden', '0'); w.setAttribute('data-collapsed', '0'); if (domId === 'heroHud') renderHud(); else renderWalkthrough(); } }
  var el = $(domId); if (!el) return; var off = ($('topbar').offsetHeight || 54) + 8; window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - off), behavior: 'smooth' }); }
function renderChips() {
  var c = $('jumpChips'); if (!c) return;
  var comp = [['homeBanner', '🪙 Home'], ['heroHud', '📡 HUD'], ['panel-walkthrough', '🧭 Walkthrough']];
  c.innerHTML = comp.map(function (x) { return '<span class="chip jumpchip" data-jump="' + x[0] + '" data-on-click="jumpTo(\'' + x[0] + '\')">' + x[1] + '</span>'; }).join('') +
    PANELS.map(function (p) { return '<span class="chip jumpchip ' + (S.hidden[p.id] ? 'hidden-p' : '') + '" title="' + (S.hidden[p.id] ? 'Hidden — click to open' : 'Jump') + '" data-on-click="openPanel(\'' + p.id + '\')">' + p.ic + ' ' + stripTags(p.name) + '</span>'; }).join('');
}
function renderTray() {
  var t = $('hiddenTray'); if (!t) return; t.innerHTML = '';
  var recent = (S.tray || []).filter(function (id) { return S.hidden[id]; });
  recent.forEach(function (id) { var p = pById(id); if (!p) return; var b = document.createElement('button'); b.className = 'trchip'; b.textContent = '↺ ' + stripTags(p.name); b.title = 'Restore this panel'; b.onclick = function () { togglePanel(id); setTimeout(function () { jumpTo('panel_' + id); }, 60); }; t.appendChild(b); });
  var extra = PANELS.filter(function (p) { return S.hidden[p.id]; }).length - recent.length;
  if (extra > 0) { var b2 = document.createElement('button'); b2.className = 'trchip'; b2.textContent = '▦ +' + extra + ' more'; b2.onclick = toggleChipDrawer; t.appendChild(b2); }
}
function toggleChipDrawer() {
  var d = $('chipDrawer'); d.classList.toggle('open');
  d.innerHTML = PANELS.map(function (p) { return '<label><input type="checkbox" ' + (S.hidden[p.id] ? '' : 'checked') + ' data-on-change="togglePanel(\'' + p.id + '\')"> ' + p.ic + ' ' + p.name + '</label>'; }).join('');
  playBeep(d.classList.contains('open') ? 700 : 520, 'sine', .04, .025);
}
function setView(v, quiet) { S.view = v; document.body.setAttribute('data-view', v); document.querySelectorAll('#viewSw button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === v); }); save(); if (!quiet) playBeep(640, 'sine', .05, .03); if (v === 'ledger') { renderPanel('ledger'); renderPanel('activity'); } }
function render() {
  PANELS.forEach(function (p) { var el = panelEl(p.id); if (!el) return; el.setAttribute('data-hidden', S.hidden[p.id] ? '1' : '0'); el.setAttribute('data-collapsed', S.collapsed[p.id] ? '1' : '0'); if (!S.hidden[p.id]) renderPanel(p.id); });
  if (S.collapsed.walkthrough) $('panel-walkthrough').setAttribute('data-collapsed', '1');
  renderChips(); renderTray(); renderHud(); renderStatus(); renderWalkthrough(); setView(S.view || 'grid', true); wireTilt('.gpanel');
}
function measureTopbar() { var h = $('topbar').offsetHeight; document.documentElement.style.setProperty('--topbar-h', h + 'px'); }

/* ---------- HUD / KPIs / status (each number comes from one function) ---------- */
function readCount() { return GUIDE_IDS.filter(function (id) { return S.read[id]; }).length; }
function wtDoneCount() { return Object.keys(S.wtDone || {}).filter(function (k) { return S.wtDone[k]; }).length; }
function tickTotal() { return doneCount('secDone') + doneCount('buyDone') + doneCount('anaDone'); }
function tickMax() { return SEC_ITEMS.length + BUY_ITEMS.length + ANA_ITEMS.length; }
function kpiHtml() {
  var k = [[TOKENS.length, 'TOKENS IN GUIDE'], [mkt.data ? pricedCount() + ' / ' + TOKENS.length : 'PENDING', 'PRICED'], [S.watch.length, 'WATCHLIST'], [S.audit.length, 'LEDGER BLOCKS']];
  return k.map(function (x) { return '<div class="gkpi"><div class="v">' + x[0] + '</div><div class="l">' + x[1] + '</div></div>'; }).join('');
}
function ringSvg(pct, label) {
  var r = 22, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return '<div class="ring"><svg width="56" height="56" viewBox="0 0 56 56"><circle cx="28" cy="28" r="' + r + '" fill="none" stroke="var(--line-2)" stroke-width="5"/><circle cx="28" cy="28" r="' + r + '" fill="none" stroke="var(--accent)" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 28 28)"/><text x="28" y="32" text-anchor="middle" class="rv">' + Math.round(pct) + '</text></svg><div class="rl">' + label + '</div></div>';
}
function renderHud() {
  var v = $('hudVerdict'); if (!v) return;
  var rings = [ringSvg(readCount() / GUIDE_IDS.length * 100, 'Learn'), ringSvg(doneCount('secDone') / SEC_ITEMS.length * 100, 'Secure'), ringSvg(wtDoneCount() / WT_TOTAL_STEPS * 100, 'Plan'), ringSvg(Math.min(S.watch.length, 5) / 5 * 100, 'Track')];
  $('hudRings').innerHTML = rings.join(''); $('hudKpis').innerHTML = kpiHtml(); var wk = $('wKpis'); if (wk) wk.innerHTML = kpiHtml();
  v.textContent = mkt.data ? pricedCount() + ' of ' + TOKENS.length + ' tokens priced · data ' + ageText(Date.now() - mkt.ts) + ' old' + (mkt.err ? ' · last refresh failed' : '') : TOKENS.length + ' tokens in the guide · prices ' + (mkt.err ? 'UNAVAILABLE' : 'PENDING');
  $('hudLamp').className = 'lamp' + (mkt.err ? ' warn' : '');
}
var netCountLabel = function () { return netCount + (netCount === 1 ? ' request' : ' requests'); };
function renderStatus() {
  var s = $('statusbar'); if (!s) return;
  var pr = mkt.loading ? 'FETCHING' : mkt.data ? (mkt.err ? 'STALE' : 'LIVE · ' + ageText(Date.now() - mkt.ts)) : (mkt.err ? 'ERROR' : 'PENDING');
  s.innerHTML = '<span class="st-item ' + (STORAGE_OK ? 'ok' : 'warn') + '">STORAGE <b>' + (STORAGE_OK ? 'OK' : 'UNAVAILABLE (progress will not persist)') + '</b></span><span class="st-item">LEDGER <b>' + (HAS_SUBTLE ? 'SHA-256' : 'SHA-256 (JS)') + ' · ' + S.audit.length + ' blocks' + (ledgerVerified === true ? ' · verified' : ledgerVerified === false ? ' · BROKEN' : '') + '</b></span><span class="st-item ' + (mkt.err ? 'warn' : '') + '">PRICES <b>' + pr + '</b></span><span class="st-item">WATCHLIST <b>' + S.watch.length + '</b></span><span class="st-item ' + (bubblesLoaded ? 'warn' : '') + '">EMBED <b>' + (bubblesLoaded ? 'cryptobubbles.net LOADED' : 'none') + '</b></span><span class="st-item">OUTBOUND <b>' + netCountLabel() + ' this session</b></span><span class="st-item" style="margin-left:auto">v' + APP_VERSION + '</span>';
}
function updateClocks() {
  var d = new Date(), pt = ptParts(d), t = pt.hour + ':' + pt.minute + ':' + pt.second;
  ['clock', 'wClock'].forEach(function (i) { var e = $(i); if (e) e.innerHTML = pt.timeZoneName + ' <b>' + t + '</b>'; });
  var age = Math.floor((Date.now() - sessionStart) / 1000), a = $('hudAge');
  if (a) a.textContent = 'session ' + ('0' + Math.floor(age / 3600)).slice(-2) + ':' + ('0' + Math.floor(age / 60) % 60).slice(-2) + ':' + ('0' + age % 60).slice(-2) + ' · ' + pt.year + '-' + pt.month + '-' + pt.day;
  var pa = $('prAge'); if (pa && mkt.data) pa.textContent = ageText(Date.now() - mkt.ts);
  if (autoRefresh && !document.hidden && !S.hidden.prices && !mkt.loading && Date.now() - mkt.ts >= 60000 && Date.now() >= mkt.backoff) fetchPrices('auto-refresh');
  if (age % 5 === 0) { renderStatus(); if (mkt.data) renderHud(); }
}

/* ---------- walkthrough ---------- */
var WT_STEPS = [
  { id: 'choose', t: 'Pick an exchange', go: 'start', x: 'Coinbase is the guide’s easy starting point; Robinhood and Uphold are the alternatives. Compare them before you sign up.' },
  { id: 'verify', t: 'Verify identity and link payment', go: 'buy', x: 'The exchange needs basic info to comply with regulations, then a bank account or debit card.' },
  { id: 'secure', t: 'Lock down the account', go: 'security', x: 'Turn on 2FA with an authenticator app, use a unique strong password, learn to spot phishing, and secure your devices.' },
  { id: 'first', t: 'Make a small first purchase', go: 'buy', x: 'Search for XRP, decide how much (start small!), review everything, then buy. This dashboard never buys for you.' },
  { id: 'understand', t: 'Understand what you hold', go: 'xrp', x: 'XRP is used for fast, cheap international transfers. Read the history article and do your own research.' },
  { id: 'storage', t: 'Plan where it is stored', go: 'storage', x: 'An exchange is fine to start, especially under about $500. Above that, consider Xaman self-custody or a cold wallet, and guard your seed phrase.' },
  { id: 'diversify', t: 'Look at the categories', go: 'diversify', x: 'Finance, infrastructure, future of blockchain, metaverse and AI tokens. Add the ones you want to follow to your watchlist.' },
  { id: 'research', t: 'Research before you buy', go: 'analysis', x: 'Look at the team, the technology, the real-world problem and the community, not the hype on social media.' },
  { id: 'dca', t: 'Consider a regular schedule', go: 'dca', x: 'Dollar-cost averaging invests a small amount regularly. Try the arithmetic with prices you type in.' },
  { id: 'volatility', t: 'Prepare for volatility', go: 'cycles', x: 'Prices swing both ways. Only invest what you can afford to lose, be patient, and do your own research.' }
];
var WT_TOTAL_STEPS = WT_STEPS.length, wtIdx = 0, wtTimer = null;
function toggleDone(id) { S.wtDone[id] = !S.wtDone[id]; save(); playBeep(S.wtDone[id] ? 760 : 420, 'sine', .04, .03); audit('Walkthrough', id + (S.wtDone[id] ? ' ticked' : ' cleared')); if (wtDoneCount() === WT_TOTAL_STEPS) fireConfetti(); renderWalkthrough(); renderHud(); }
function wtScene(i) {
  var A = 'var(--accent)', V = 'var(--guide-violet)', G = 'var(--guide-gold)', L = 'var(--line-2)', M = 'var(--muted)', D = 'var(--danger)', sc = '<svg viewBox="0 0 280 170" role="img" aria-label="Step ' + (i + 1) + ' illustration">' + '<rect x="2" y="2" width="276" height="166" rx="12" fill="none" stroke="' + L + '"/>', e = '</svg>';
  var scenes = [
    sc + '<g font-family="monospace" font-size="11" text-anchor="middle"><rect x="26" y="50" width="68" height="56" rx="8" fill="none" stroke="' + A + '" stroke-width="2"/><text x="60" y="82" fill="' + A + '">COIN</text><rect x="106" y="50" width="68" height="56" rx="8" fill="none" stroke="' + V + '"/><text x="140" y="82" fill="' + V + '">ROBIN</text><rect x="186" y="50" width="68" height="56" rx="8" fill="none" stroke="' + G + '"/><text x="220" y="82" fill="' + G + '">UPHOLD</text></g><rect class="scn-pulse" x="26" y="122" width="68" height="5" rx="2" fill="' + A + '"/>' + e,
    sc + '<rect x="70" y="34" width="140" height="84" rx="10" fill="none" stroke="' + A + '" stroke-width="2"/><circle cx="105" cy="68" r="14" fill="none" stroke="' + G + '" stroke-width="2"/><path d="M92 100q13-16 26 0" fill="none" stroke="' + G + '" stroke-width="2"/><path d="M130 62h58M130 78h44M130 94h52" stroke="' + M + '" stroke-width="3" stroke-linecap="round"/><text x="140" y="142" text-anchor="middle" font-family="monospace" font-size="10" fill="' + M + '">identity + payment method</text>' + e,
    sc + '<path d="M140 22 200 44v34c0 30-24 50-60 64-36-14-60-34-60-64V44z" fill="none" stroke="' + A + '" stroke-width="2.5"/><path class="scn-dash" d="M112 82l20 20 38-40" stroke="' + A + '" stroke-width="5" fill="none" stroke-linecap="round"/><text x="140" y="160" text-anchor="middle" font-family="monospace" font-size="10" fill="' + M + '">2FA · unique password</text>' + e,
    sc + '<rect x="50" y="46" width="180" height="46" rx="8" fill="none" stroke="' + A + '" stroke-width="2"/><text x="66" y="76" font-family="monospace" font-size="16" fill="' + G + '">$ 25</text><rect x="168" y="56" width="52" height="26" rx="6" fill="' + A + '"/><text x="194" y="73" text-anchor="middle" font-family="monospace" font-size="11" fill="var(--accent-ink)">BUY</text><text x="140" y="130" text-anchor="middle" font-family="monospace" font-size="10" fill="' + M + '">start small · review first</text>' + e,
    sc + '<circle cx="140" cy="76" r="36" fill="none" stroke="' + A + '" stroke-width="2"/><path class="scn-dash" d="M110 76h60M158 64l12 12-12 12" stroke="' + G + '" stroke-width="3" fill="none" stroke-linecap="round"/><text x="140" y="140" text-anchor="middle" font-family="monospace" font-size="10" fill="' + M + '">fast · cheap · cross-border</text>' + e,
    sc + '<g fill="none" stroke="' + A + '" stroke-width="2"><rect x="30" y="52" width="86" height="56" rx="8"/><rect x="164" y="52" width="86" height="56" rx="8"/></g><text x="73" y="84" text-anchor="middle" font-family="monospace" font-size="11" fill="' + M + '">exchange</text><text x="207" y="84" text-anchor="middle" font-family="monospace" font-size="11" fill="' + A + '">your keys</text><path class="scn-dash" d="M120 80h40" stroke="' + G + '" stroke-width="3"/><text x="140" y="140" text-anchor="middle" font-family="monospace" font-size="10" fill="' + D + '">seed phrase: offline only</text>' + e,
    sc + '<g font-family="monospace" font-size="9.5" fill="' + M + '" text-anchor="middle"><circle cx="50" cy="60" r="20" fill="none" stroke="' + A + '"/><text x="50" y="92">FIN</text><circle cx="110" cy="80" r="16" fill="none" stroke="' + V + '"/><text x="110" y="108">INFRA</text><circle cx="168" cy="56" r="24" fill="none" stroke="' + G + '"/><text x="168" y="94">CHAIN</text><circle cx="226" cy="84" r="14" fill="none" stroke="' + A + '"/><text x="226" y="110">AI</text></g>' + e,
    sc + '<g fill="none" stroke="' + A + '" stroke-width="2"><circle cx="118" cy="70" r="26"/><path d="M137 89l30 30" stroke-linecap="round"/></g><g stroke="' + M + '" stroke-width="3" stroke-linecap="round"><path d="M96 70h44M118 48v44" class="scn-dash"/></g><text x="140" y="148" text-anchor="middle" font-family="monospace" font-size="10" fill="' + M + '">team · tech · problem · community</text>' + e,
    sc + '<g stroke="' + L + '"><path d="M36 130h208"/></g><g fill="' + A + '"><rect x="48" y="104" width="22" height="26"/><rect x="90" y="104" width="22" height="26"/><rect x="132" y="104" width="22" height="26"/><rect x="174" y="104" width="22" height="26"/><rect x="216" y="104" width="22" height="26"/></g><path class="scn-dash" d="M48 70L240 50" stroke="' + G + '" stroke-width="2" fill="none"/><text x="140" y="152" text-anchor="middle" font-family="monospace" font-size="10" fill="' + M + '">same amount, regular schedule</text>' + e,
    sc + '<path class="scn-dash" d="M24 110q30-70 56-30t52-10 52 40 56-30" stroke="' + A + '" stroke-width="3" fill="none"/><path d="M24 128h232" stroke="' + L + '"/><text x="140" y="152" text-anchor="middle" font-family="monospace" font-size="10" fill="' + D + '">only invest what you can afford to lose</text>' + e
  ];
  return scenes[i];
}
function renderWalkthrough() {
  var c = $('wtCard'); if (!c) return; var s = WT_STEPS[wtIdx], done = !!S.wtDone[s.id], n = wtDoneCount();
  $('wtScene').innerHTML = wtScene(wtIdx);
  c.innerHTML = '<div class="wtn">STEP ' + (wtIdx + 1) + ' OF ' + WT_TOTAL_STEPS + (done ? ' · ✓ DONE' : '') + '</div><h4>' + esc(s.t) + '</h4><p>' + esc(s.x) + '</p><div class="btnrow"><button class="btn sm" data-on-click="wtGo(-1)">← Prev</button><button class="btn sm" data-on-click="wtGo(1)">Next →</button><button class="btn sm primary" data-on-click="openPanel(\'' + s.go + '\')">Open panel</button><button class="btn sm" data-on-click="toggleDone(\'' + s.id + '\')">' + (done ? 'Mark not done' : 'Mark done') + '</button></div>';
  $('wtBar').style.width = (n / WT_TOTAL_STEPS * 100) + '%'; $('wtSub').textContent = n + ' / ' + WT_TOTAL_STEPS + ' complete (your own checklist)';
  $('wtDots').innerHTML = WT_STEPS.map(function (x, i) { return '<button class="' + (i === wtIdx ? 'cur ' : '') + (S.wtDone[x.id] ? 'done' : '') + '" title="' + esc(x.t) + '" data-on-click="wtSet(' + i + ')" aria-label="Step ' + (i + 1) + '"></button>'; }).join('');
  $('wtList').innerHTML = WT_STEPS.map(function (x, i) { return '<label class="' + (i === wtIdx ? 'cur' : '') + '"><input type="checkbox" ' + (S.wtDone[x.id] ? 'checked' : '') + ' data-on-change="toggleDone(\'' + x.id + '\')"> ' + (i + 1) + '. ' + esc(x.t) + '</label>'; }).join('');
}
function wtSet(i) { wtIdx = (i + WT_TOTAL_STEPS) % WT_TOTAL_STEPS; if (wtTimer) wtStop(); renderWalkthrough(); playBeep(600 + wtIdx * 40, 'sine', .04, .025); }
function wtGo(d) { wtSet(wtIdx + d); }
function wtStop() { clearInterval(wtTimer); wtTimer = null; var b = $('wtPlayBtn'); if (b) b.innerHTML = '▶'; }
function wtPlay() {
  if (wtTimer) { wtStop(); return; } $('wtPlayBtn').innerHTML = '⏸';
  wtTimer = setInterval(function () { wtIdx = (wtIdx + 1) % WT_TOTAL_STEPS; renderWalkthrough(); playBeep(600 + wtIdx * 40, 'sine', .04, .02); }, 5200);
}
function hideHud() { $('heroHud').setAttribute('data-hidden', '1'); playBeep(420, 'sine', .05, .03); }
var sbTimer = null, sbPinned = false;
function showSubbar() { clearTimeout(sbTimer); $('subbar').classList.add('show'); }
function hideSubbarSoon() {
  clearTimeout(sbTimer);
  sbTimer = setTimeout(function () { var sb = $('subbar'); if (sbPinned || $('chipDrawer').classList.contains('open') || sb.matches(':focus-within')) return; sb.classList.remove('show'); }, 700);
}
function toggleSubbarPin() { sbPinned = !sbPinned; $('btnNav').style.color = sbPinned ? 'var(--accent)' : ''; if (sbPinned) showSubbar(); else hideSubbarSoon(); playBeep(sbPinned ? 760 : 520, 'sine', .04, .025); }
function wireSubbar() {
  var tb = $('topbar'), sb = $('subbar');
  tb.addEventListener('mouseenter', showSubbar); tb.addEventListener('mouseleave', hideSubbarSoon);
  sb.addEventListener('mouseenter', showSubbar); sb.addEventListener('mouseleave', hideSubbarSoon);
  sb.addEventListener('focusin', showSubbar); sb.addEventListener('focusout', hideSubbarSoon);
  document.addEventListener('mousemove', function (e) {
    if (e.clientY <= 4) showSubbar();
    else if (sb.classList.contains('show') && e.clientY > sb.getBoundingClientRect().bottom + 6) hideSubbarSoon();
  }, { passive: true });
}
function hideWalkthrough() { wtStop(); $('panel-walkthrough').setAttribute('data-hidden', '1'); playBeep(420, 'sine', .05, .03); }
function startTour() { var el = $('panel-walkthrough'); if (el.getAttribute('data-collapsed') === '1') toggleCollapse('walkthrough'); wtIdx = 0; renderWalkthrough(); jumpTo('panel-walkthrough'); if (!wtTimer) wtPlay(); audit('Walkthrough', 'Guided tour started'); }

/* ---------- welcome splash (6 stages, 18/38/56/74/90/100; each message describes real startup work) ---------- */
var bootTimer = null;
function playSplash(force) {
  var w = $('welcome'); if (!w) return; w.classList.remove('hide'); var fill = $('bootfill'), step = $('bootstep'); if (fill) fill.style.width = '0%';
  var stages = [
    { pct: 18, text: 'Probing browser storage & WebCrypto — localStorage ' + (STORAGE_OK ? 'OK' : 'UNAVAILABLE') + ', subtle ' + (HAS_SUBTLE ? 'available' : 'unavailable (using built-in SHA-256)') + '…' },
    { pct: 38, text: 'Checking the audit ledger — ' + S.audit.length + ' blocks, ' + (ledgerVerified === true ? 'verified intact' : ledgerVerified === false ? 'BROKEN, see Ledger' : 'verification running') + '…' },
    { pct: 56, text: 'Decoding the token catalog — ' + TOKENS.length + ' tokens, ' + (CATS.length - 1) + ' categories + ' + CATS[CATS.length - 1].tokens.length + ' reference coins…' },
    { pct: 74, text: 'Restoring your progress — ' + tickTotal() + ' of ' + tickMax() + ' checklist items ticked, ' + S.watch.length + ' on your watchlist…' },
    { pct: 90, text: 'Composing ' + PANELS.length + ' panels…' },
    { pct: 100, text: 'Guide ready · prices PENDING (nothing is requested until you ask) · Ready!' }
  ];
  var i = 0; if (bootTimer) clearInterval(bootTimer);
  bootTimer = setInterval(function () { if (i >= stages.length) { clearInterval(bootTimer); bootTimer = null; return; } if (fill) fill.style.width = stages[i].pct + '%'; if (step) step.textContent = stages[i].text; playBeep(600 + i * 90, 'sine', .04, .02); i++; }, 260);
  audit('Welcome', force ? 'Replayed the welcome splash' : 'Initial boot splash');
}
function dismissWelcome() { var w = $('welcome'); if (w) w.classList.add('hide'); if (bootTimer) { clearInterval(bootTimer); bootTimer = null; } S.welcomeSeen = true; save(); audit('Welcome', 'Entered'); }
function showWelcome() { playSplash(true); }
function checkWelcomeOnLoad() { if (S.welcomeSeen) { var w = $('welcome'); if (w) { w.style.transition = 'none'; w.classList.add('hide'); setTimeout(function () { w.style.transition = ''; }, 60); } } else playSplash(false); }

/* ---------- theme / sound ---------- */
function toggleTheme() { S.theme = S.theme === 'light' ? 'dark' : 'light'; save(); applyFx(); playBeep(S.theme === 'light' ? 760 : 520, 'sine', .05, .03); audit('Theme', S.theme); renderActivity(); }
function toggleSound() { ui.soundEnabled = ui.soundEnabled === false; saveUI(); if (ui.soundEnabled) playBeep(880, 'sine', .06, .04); toast('ok', 'SOUND', ui.soundEnabled ? 'On' : 'Off'); }
function toggleFx() { ui.fxAnim = ui.fxAnim === false; saveUI(); }
function toggleCrt() { ui.crt = !ui.crt; saveUI(); }

/* ---------- command palette ---------- */
var CMDS = [], palList = [], palSel = 0;
function buildCmds() {
  CMDS = PANELS.map(function (p) { return { ic: '▦', t: 'Jump to panel: ' + stripTags(p.name), k: 'PANEL', run: function () { openPanel(p.id); } }; }).concat([
    { ic: '🪙', t: 'Jump to Home banner', k: 'COMPONENT', run: function () { jumpTo('homeBanner'); } },
    { ic: '📡', t: 'Jump to Telemetry HUD', k: 'COMPONENT', run: function () { jumpTo('heroHud'); } },
    { ic: '🧭', t: 'Jump to Guided Walkthrough', k: 'COMPONENT', run: function () { jumpTo('panel-walkthrough'); } },
    { ic: '▥', t: 'Default view (your opening page)', k: 'LAYOUT', run: defaultView },
    { ic: '🏠', t: 'Opening page: Getting started', k: 'START', run: function () { setStartPage('start'); } },
    { ic: '🏠', t: 'Opening page: Security checklist', k: 'START', run: function () { setStartPage('security'); } },
    { ic: '🏠', t: 'Opening page: Live prices', k: 'START', run: function () { setStartPage('prices'); } },
    { ic: '🏠', t: 'Opening page: Guided tour', k: 'START', run: function () { setStartPage('tour'); } },
    { ic: '▤', t: 'Show all panels', k: 'LAYOUT', run: showAll },
    { ic: '▦', t: 'Open chip drawer', k: 'LAYOUT', run: toggleChipDrawer },
    { ic: '☰', t: 'Collapse all panels', k: 'LAYOUT', run: function () { PANELS.forEach(function (p) { S.collapsed[p.id] = true; }); save(); render(); } },
    { ic: '☰', t: 'Expand all panels', k: 'LAYOUT', run: function () { PANELS.forEach(function (p) { S.collapsed[p.id] = false; }); save(); render(); } },
    { ic: '▦', t: 'View: Grid', k: '1', run: function () { setView('grid'); } },
    { ic: '▤', t: 'View: Report (print-ready column)', k: '2', run: function () { setView('report'); } },
    { ic: '🔏', t: 'View: Ledger', k: '3', run: function () { setView('ledger'); } },
    { ic: '⟳', t: 'Fetch live prices (asks CoinGecko)', k: 'L', run: function () { openPanel('prices'); fetchPrices('palette'); } },
    { ic: '⏱', t: 'Toggle price auto-refresh (60 s)', k: 'PRICES', run: function () { autoRefresh = !autoRefresh; save(); audit('Prices', 'Auto-refresh ' + (autoRefresh ? 'on' : 'off')); renderPrices(); toast('ok', 'AUTO-REFRESH', autoRefresh ? 'On: every 60 s while the Live Prices panel is open.' : 'Off'); } },
    { ic: '★', t: 'Show watchlist only', k: 'PRICES', run: function () { S.watchOnly = true; save(); openPanel('prices'); renderPrices(); } },
    { ic: '☆', t: 'Show all tokens (not just the watchlist)', k: 'PRICES', run: function () { S.watchOnly = false; save(); openPanel('prices'); renderPrices(); } },
    { ic: '✕', t: 'Clear watchlist', k: 'PRICES', run: clearWatch },
    { ic: '↕', t: 'Sort prices: guide order', k: 'SORT', run: function () { S.sortK = 'cat'; S.sortD = 1; save(); openPanel('prices'); renderPrices(); } },
    { ic: '↕', t: 'Sort prices: by market cap', k: 'SORT', run: function () { S.sortK = 'mcap'; S.sortD = -1; save(); openPanel('prices'); renderPrices(); } },
    { ic: '↕', t: 'Sort prices: by 24 h change', k: 'SORT', run: function () { S.sortK = 'chg'; S.sortD = -1; save(); openPanel('prices'); renderPrices(); } },
    { ic: '↕', t: 'Sort prices: by name', k: 'SORT', run: function () { S.sortK = 'name'; S.sortD = 1; save(); openPanel('prices'); renderPrices(); } },
    { ic: '⬇', t: 'Export prices CSV', k: 'EXPORT', run: exportPricesCSV },
    { ic: '🫧', t: 'Load Crypto Bubbles (third-party embed)', k: 'EMBED', run: function () { openPanel('bubbles'); if (!bubblesLoaded) loadBubbles(); } },
    { ic: '■', t: 'Unload Crypto Bubbles', k: 'EMBED', run: function () { if (bubblesLoaded) unloadBubbles(); } },
    { ic: '📆', t: 'Open the DCA calculator', k: 'TOOL', run: function () { openPanel('dca'); setTimeout(function () { var e = $('dcaAmt'); if (e) e.focus(); }, 380); } },
    { ic: '🎢', t: 'Open the drawdown calculator', k: 'TOOL', run: function () { openPanel('cycles'); } },
    { ic: '📖', t: 'Search the glossary', k: 'TOOL', run: function () { openPanel('glossary'); setTimeout(function () { var e = $('glQ'); if (e) e.focus(); }, 380); } },
    { ic: '↺', t: 'Reset all ticks and walkthrough progress', k: 'PROGRESS', run: resetProgress },
    { ic: '✓', t: 'Verify the audit ledger hash chain', k: 'V', run: function () { openPanel('ledger'); setTimeout(verifyLedger, 200); } },
    { ic: '✎', t: 'Add a note to the audit ledger', k: 'N', run: addNote },
    { ic: '⬇', t: 'Export full state JSON', k: 'E', run: exportJSON },
    { ic: '⬇', t: 'Export ledger JSON', k: 'EXPORT', run: function () { exportLedger('json'); } },
    { ic: '⬇', t: 'Export ledger CSV', k: 'EXPORT', run: function () { exportLedger('csv'); } },
    { ic: '🖨', t: 'Print / Save as PDF', k: 'EXPORT', run: function () { window.print(); } },
    { ic: '⚙', t: 'Open Settings & Control Center', k: 'P', run: openSettings },
    { ic: '🌓', t: 'Toggle light / dark theme', k: 'T', run: toggleTheme },
    { ic: '🔊', t: 'Toggle sound', k: 'AUDIO', run: toggleSound },
    { ic: '✨', t: 'Toggle FX animation', k: 'FX', run: toggleFx },
    { ic: '📺', t: 'Toggle CRT scanlines', k: 'FX', run: toggleCrt },
    { ic: '✦', t: 'Replay welcome splash', k: 'W', run: showWelcome },
    { ic: '🧭', t: 'Start guided tour', k: 'G', run: startTour },
    { ic: '▶', t: 'Play / pause the walkthrough', k: '⌥P', run: wtPlay },
    { ic: '⌨', t: 'Keyboard shortcuts', k: '?', run: openShortcuts },
    { ic: '✉', t: 'Contact Admin', k: 'SUPPORT', run: openContactAdmin },
    { ic: '↻', t: 'Refresh / re-render all panels', k: 'R', run: function () { render(); toast('ok', 'REFRESHED', 'All panels re-rendered.'); } }
  ]);
}
function openPal() { $('palOvl').classList.add('open'); var i = $('palIn'); i.value = ''; palSel = 0; palList = CMDS; drawPal(); i.focus(); playBeep(900, 'sine', .05, .03); }
function closePal() { $('palOvl').classList.remove('open'); }
function drawPal() {
  $('palList').innerHTML = palList.map(function (c, i) { return '<div class="pcmd ' + (i === palSel ? 'on' : '') + '" data-on-click="runPal(' + i + ')"><span class="ic">' + (c.ic || '▸') + '</span><span class="lb">' + esc(c.t) + '</span><span class="kb">' + c.k + '</span></div>'; }).join('') || '<div class="pcmd"><span class="ic">∅</span><span class="lb">No match</span></div>';
  var sel = document.querySelector('.pcmd.on'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
}
function runPal(i) { var c = palList[i]; if (!c) return; closePal(); c.run(); }
function addNote() { var t = prompt('Add a note to the audit ledger (metadata only — never type a password, seed phrase or key here):'); if (t) { audit('Note', t.slice(0, 200)); toast('ok', 'NOTE', 'Added to the ledger.'); } }
function resetProgress() { if (!confirm('Clear every checklist tick and the walkthrough progress in this browser? Your watchlist is kept.')) return; S.secDone = {}; S.buyDone = {}; S.anaDone = {}; S.wtDone = {}; S.read = {}; save(); audit('Progress', 'All ticks reset'); render(); toast('ok', 'PROGRESS RESET', 'Ticks cleared.'); }

/* ---------- overlays / shortcuts ---------- */
var SHORTCUTS = [['⌘K / Ctrl+K', 'Command palette'], ['L', 'Fetch live prices'], ['1 / 2 / 3', 'View: Grid · Report · Ledger'], ['W', 'Welcome splash & boot bar'], ['G', 'Guided tour'], ['⌥P', 'Play / pause the walkthrough'], ['← / →', 'Walkthrough steps'], ['E', 'Export full state JSON'], ['V', 'Verify the audit ledger'], ['N', 'Add a note to the ledger'], ['R', 'Refresh all panels'], ['P', 'Settings & Control Center'], ['T', 'Toggle theme'], ['?', 'This list'], ['Esc', 'Close overlay / drawer']];
function openShortcuts() { $('scList').innerHTML = SHORTCUTS.map(function (s) { return '<kbd>' + s[0] + '</kbd><span>' + s[1] + '</span>'; }).join(''); $('shortcutsModal').classList.add('open'); }
function closeOvl(id) { $(id).classList.remove('open'); }
function anyOverlayOpen() { return document.querySelector('.modal-overlay.open'); }

/* ---------- settings (FX edits preview live; CANCEL reverts) ---------- */
var FX_DIALS = [
  { k: 'fx', l: 'Aurora intensity', min: 0, max: 100 }, { k: 'tilt', l: '3D tilt (deg)', min: 0, max: 10 }, { k: 'fxAnim', l: 'FX animation', bool: 1 }, { k: 'glow', l: 'Toolbar glow', min: 0, max: 100 },
  { k: 'iconSize', l: 'Icon scale %', min: 70, max: 130 }, { k: 'crt', l: 'CRT scanlines', bool: 1 }, { k: 'blur', l: 'Glass blur (px)', min: 0, max: 30 }, { k: 'fill', l: 'Panel fill %', min: 20, max: 95 }, { k: 'depth', l: 'Depth (shadow) %', min: 0, max: 90 },
  { k: 'soundEnabled', l: 'Sound effects', bool: 1 }, { k: 'soundVolume', l: 'Sound volume', min: 0, max: 100 }
];
var stSnap = null;
function buildDials() {
  $('fxDials').innerHTML = FX_DIALS.map(function (d) {
    return d.bool ? '<label class="switch"><input type="checkbox" data-fx="' + d.k + '" ' + (ui[d.k] !== false && ui[d.k] ? 'checked' : '') + '> ' + d.l + '</label>'
      : '<div class="dial"><span>' + d.l + '</span><input type="range" data-fx="' + d.k + '" min="' + d.min + '" max="' + d.max + '" value="' + ui[d.k] + '"><output>' + ui[d.k] + '</output></div>';
  }).join('');
  document.querySelectorAll('#fxDials [data-fx]').forEach(function (el) {
    el.addEventListener('input', function () { var k = el.getAttribute('data-fx'); ui[k] = el.type === 'checkbox' ? el.checked : +el.value; if (el.nextElementSibling && el.nextElementSibling.tagName === 'OUTPUT') el.nextElementSibling.textContent = el.value; applyFx(); });
  });
}
function openSettings() {
  stSnap = { ui: Object.assign({}, ui), auto: autoRefresh, watchOnly: S.watchOnly };
  $('stStart').innerHTML = START_PAGES.map(function (x) { return '<option value="' + x[0] + '">' + x[2] + ' ' + x[1] + '</option>'; }).join(''); $('stStart').value = startPageId(); $('stStartWt').checked = !!prefs.startWt;
  $('stAuto').checked = !!autoRefresh; $('stWatchOnly').checked = !!S.watchOnly;
  buildDials(); renderAbout(); $('settingsModal').classList.add('open'); playBeep(760, 'sine', .05, .03);
}
function saveSettings() {
  prefs.startPage = $('stStart').value; prefs.startWt = $('stStartWt').checked; autoRefresh = $('stAuto').checked; S.watchOnly = $('stWatchOnly').checked; saveUI(); renderPrices();
  audit('Settings', 'Saved (opening page=' + startPageId() + ', walkthrough on load=' + (prefs.startWt ? 'yes' : 'no') + ', auto-refresh=' + (autoRefresh ? 'on' : 'off') + ', watchlist-only=' + (S.watchOnly ? 'on' : 'off') + ')'); closeOvl('settingsModal'); toast('ok', 'SAVED', 'Settings stored in this browser.'); renderStatus(); playBeep(880, 'sine', .06, .04);
}
function cancelSettings() { if (stSnap) { ui = stSnap.ui; applyFx(); } closeOvl('settingsModal'); }
function resetFx() { ui = Object.assign({}, UI_DEFAULTS); applyFx(); buildDials(); playBeep(440, 'sine', .15, .08); }
$('stTabs') && $('stTabs').addEventListener('click', function (e) { var t = e.target.getAttribute && e.target.getAttribute('data-t'); if (!t) return; document.querySelectorAll('#stTabs button').forEach(function (b) { b.classList.toggle('on', b === e.target); }); document.querySelectorAll('.tabpane').forEach(function (p) { p.classList.toggle('on', p.id === 'tab_' + t); }); });

/* ---------- backup / restore (ticks, watchlist, layout, ledger; no personal data) ---------- */
function exportJSON() {
  var st = Object.assign({}, S); delete st.audit;
  dl('CryptoCompass_state.json', JSON.stringify({ app: APP_NAME, version: APP_VERSION, exported: new Date().toISOString(), ledger: { algo: LEDGER_ALGO, genesis: GENESIS, blocks: S.audit.slice().reverse() }, ui: ui, prefs: prefs, state: st }, null, 2), 'application/json');
  toast('ok', 'EXPORT', 'State JSON downloaded.');
}
function importJSON(file) {
  if (!file) return; var fr = new FileReader();
  fr.onload = function () {
    try {
      var o = JSON.parse(fr.result); if (o.app !== APP_NAME) throw new Error('Not a Crypto Compass export.'); if (String(o.version).split('.')[0] !== APP_VERSION.split('.')[0]) throw new Error('Unsupported version ' + o.version + '.');
      if (o.ui) ui = Object.assign({}, UI_DEFAULTS, o.ui); if (o.prefs) prefs = Object.assign({}, PREF_DEFAULTS, o.prefs);
      if (o.state) ['hidden', 'tray', 'collapsed', 'order', 'wtDone', 'secDone', 'buyDone', 'anaDone', 'read', 'watch', 'dca', 'sortK', 'sortD', 'watchOnly', 'theme', 'view'].forEach(function (k) { if (o.state[k] !== undefined) S[k] = o.state[k]; });
      S.watch = (Array.isArray(S.watch) ? S.watch : []).filter(function (id) { return !!tokById(id); });
      if (o.ledger && Array.isArray(o.ledger.blocks)) ledgerQueue(function () { S.audit = o.ledger.blocks.slice().reverse(); });
      ledgerSettled().then(function () { saveUI(); applyOrder(); mountStatic(); render(); audit('Import', 'State restored from JSON'); toast('ok', 'IMPORTED', 'State restored. Run VERIFY CHAIN to check the ledger.'); });
    } catch (e) { toast('err', 'IMPORT FAILED', e.message); }
  }; fr.readAsText(file);
}
function resetAll() { if (!confirm('Reset ALL Crypto Compass data in this browser?')) return; try { localStorage.removeItem(STORE_KEY); } catch (e) {} location.reload(); }

/* ---------- Contact Admin (blueprint PART 10) ---------- */
var caTimer = null;
function openContactAdmin() { var m = $('contactAdminModal'); if (!m) return; m.classList.add('open'); playBeep(760, 'sine', .05, .03); setTimeout(function () { var s = $('caSubject'); if (s) s.focus(); }, 60); audit('Contact Admin', 'Opened the contact form'); }
function closeContactAdmin() { var m = $('contactAdminModal'); if (!m) return; m.classList.remove('open'); if (caTimer) { clearTimeout(caTimer); caTimer = null; } var b = $('caSubmit'); if (b) { b.disabled = false; b.textContent = 'SEND'; } }
/* refuse messages that look like a private key or wallet secret: 64-hex keys and XRPL family seeds (s + base58) */
function looksLikeSecret(t) { return /\b[0-9a-fA-F]{64}\b/.test(t) || /\bs[1-9A-HJ-NP-Za-km-z]{25,34}\b/.test(t); }
function sendContactAdmin(ev) {
  ev.preventDefault(); var form = $('caForm'), btn = $('caSubmit'); if (!form || !btn) return false;
  var text = $('caName').value + ' ' + $('caSubject').value + ' ' + $('caMessage').value;
  if (looksLikeSecret(text)) { toast('err', 'BLOCKED', 'The message looks like it contains a private key or wallet seed. Remove it before sending. No legitimate admin needs it.'); return false; }
  btn.disabled = true; btn.textContent = 'Sending…'; netCount++; renderStatus();
  var fd = new FormData(form); fd.append('email', CONTACT_EMAIL);
  fetch(CONTACT_ENDPOINT, { method: 'POST', body: fd }).then(function () {
    btn.textContent = 'Message Sent ✓'; form.reset(); audit('Contact Admin', 'Message sent to the administrator'); caTimer = setTimeout(closeContactAdmin, 2000);
  })['catch'](function () { btn.textContent = 'Error Sending'; audit('Contact Admin', 'Send failed'); caTimer = setTimeout(function () { btn.disabled = false; btn.textContent = 'SEND'; }, 3000); });
  return false;
}

/* ---------- version: every on-page version string is filled from APP_VERSION / CHANGELOG (00_version.js), never typed in markup ---------- */
function fillVersions() {
  var v = 'v' + APP_VERSION, full = 'Crypto Compass ' + v + ' \u00B7 ' + CHANGELOG[0].d;
  document.querySelectorAll('[data-ver]').forEach(function (e) { e.textContent = v; e.title = full; });
  document.querySelectorAll('[data-ver-full]').forEach(function (e) { e.textContent = full; });
}
/* audit trail: one block per session open, and one per version change (the previous version is remembered in S.lastVer) */
function versionAudit() {
  if (!S.lastVer) audit('Version', 'First run on v' + APP_VERSION);
  else if (S.lastVer !== APP_VERSION) audit('Version', 'Updated v' + S.lastVer + ' to v' + APP_VERSION + ': ' + (CHANGELOG[0].n[0] || '').slice(0, 120));
  audit('Session', 'Crypto Compass v' + APP_VERSION + ' opened');
  S.lastVer = APP_VERSION; save();
}

/* ---------- boot ---------- */
function bootChecks() {
  /* real startup work: cross-check the built-in SHA-256 against WebCrypto, then verify the persisted ledger */
  if (HAS_SUBTLE) { var probe = new TextEncoder().encode('cryptocompass-selfcheck'); crypto.subtle.digest('SHA-256', probe).then(function (d) { if (toHex(new Uint8Array(d)) !== sha256hex(probe)) toast('err', 'SHA-256 MISMATCH', 'Built-in SHA-256 disagrees with WebCrypto.'); }); }
  ledgerSettled().then(verifyChain).then(function (r) { ledgerVerified = r.ok; if (!r.ok) toast('err', 'LEDGER BROKEN', 'Block #' + r.brokenAt + ' failed verification.'); renderStatus(); });
}
function wireGlobal() {
  wireSubbar();
  window.addEventListener('resize', function () { measureTopbar(); initConfetti(); renderActivity(); });
  ['palOvl', 'shortcutsModal', 'contactAdminModal'].forEach(function (id) { $(id).addEventListener('click', function (e) { if (e.target === this) { if (id === 'contactAdminModal') closeContactAdmin(); else closeOvl(id); } }); });
  $('settingsModal').addEventListener('click', function (e) { if (e.target === this) cancelSettings(); });
  $('palIn').addEventListener('input', function () { var q = this.value.toLowerCase(); palList = CMDS.filter(function (c) { return (c.t + ' ' + c.k).toLowerCase().indexOf(q) >= 0; }); palSel = 0; drawPal(); });
  $('palIn').addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { palSel = Math.min(palList.length - 1, palSel + 1); drawPal(); e.preventDefault(); } else if (e.key === 'ArrowUp') { palSel = Math.max(0, palSel - 1); drawPal(); e.preventDefault(); } else if (e.key === 'Enter') { runPal(palSel); e.preventDefault(); } });
  var dz = $('dropzone'); if (dz) { dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('over'); }); dz.addEventListener('dragleave', function () { dz.classList.remove('over'); }); dz.addEventListener('drop', function (e) { e.preventDefault(); dz.classList.remove('over'); importJSON(e.dataTransfer.files[0]); }); }
  $('mascot').addEventListener('click', function (e) { fireConfetti(e.clientX, e.clientY); });
  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')), mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); if ($('palOvl').classList.contains('open')) closePal(); else openPal(); return; }
    if (e.key === 'Escape') { if (!$('welcome').classList.contains('hide')) { dismissWelcome(); return; } if ($('palOvl').classList.contains('open')) closePal(); else if ($('settingsModal').classList.contains('open')) cancelSettings(); else if ($('contactAdminModal').classList.contains('open')) closeContactAdmin(); else if ($('shortcutsModal').classList.contains('open')) closeOvl('shortcutsModal'); else if ($('chipDrawer').classList.contains('open')) toggleChipDrawer(); return; }
    if (e.key === 'Enter' && !$('welcome').classList.contains('hide') && !typing) { dismissWelcome(); return; }
    if (typing || mod || anyOverlayOpen()) return;
    if (e.altKey && e.key.toLowerCase() === 'p') { wtPlay(); e.preventDefault(); return; }
    if (e.altKey) return;
    var k = e.key, K = k.length === 1 ? k.toLowerCase() : k;
    if (k === '1') setView('grid'); else if (k === '2') setView('report'); else if (k === '3') setView('ledger');
    else if (K === 'w') showWelcome(); else if (K === 'g') startTour(); else if (K === 'l') { openPanel('prices'); fetchPrices('keyboard'); }
    else if (K === 'e') exportJSON(); else if (K === 'v') { openPanel('ledger'); verifyLedger(); } else if (K === 'n') addNote();
    else if (K === 'r') { render(); toast('ok', 'REFRESHED', 'All panels re-rendered.'); } else if (K === 'p') openSettings(); else if (K === 't') toggleTheme();
    else if (k === '?') openShortcuts();
    else if (k === 'ArrowRight') wtGo(1); else if (k === 'ArrowLeft') wtGo(-1);
  });
}
function boot() {
  load(); loadUI(); buildPanelHeads(); mountStatic(); applyOrder(); buildCmds(); wireGlobal();
  applyDefaultView(); render(); measureTopbar(); initConfetti(); wireTilt('.gpanel'); updateClocks(); setInterval(updateClocks, 1000);
  bootChecks(); checkWelcomeOnLoad(); migrateLedger(); fillVersions(); versionAudit(); renderAbout();
}
document.addEventListener('DOMContentLoaded', boot);

