/**
 * ulyOS contact relay — HARDENED Google Apps Script web app.
 *
 * Why: a relay that takes the recipient (or anything else) from the request can be abused by anyone who knows
 * its URL (and the URL is public in the page source) to send spam from your Google account. This version:
 *   - hard-codes the recipient — it is never read from the request
 *   - only accepts messages whose subject starts with "[ulyOS]" (what the app sends)
 *   - strips control characters, caps every field's length, ignores everything else
 *   - rate-limits globally (per minute and per day) and fails closed
 *
 * Deploy:  script.google.com → New project → paste this file → set RECIPIENT →
 *          Deploy → New deployment → type "Web app" → Execute as: Me → Who has access: Anyone → Deploy.
 *          Copy the new /exec URL into js/config.js (CONTACT_ENDPOINT) and then set CONTACT_EMAIL to ''.
 */
var RECIPIENT = 'you@example.com';          // <-- your address lives ONLY here, not in the public repo
var LIMITS = { name: 80, subject: 140, message: 4000 };
var PER_MINUTE = 6;
var PER_DAY = 100;

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    var subject = clean(p.subject, LIMITS.subject).replace(/[\r\n]+/g, ' ');
    if (subject.indexOf('[ulyOS]') !== 0) return reply('ignored');
    var message = clean(p.message, LIMITS.message);
    if (!message) return reply('empty');
    if (!allow()) return reply('rate-limited');
    MailApp.sendEmail({
      to: RECIPIENT,
      subject: subject,
      body: 'From: ' + (clean(p.name, LIMITS.name) || '(no name)') + '\n\n' + message,
      name: 'ulyOS relay'
    });
    return reply('ok');
  } catch (err) {
    return reply('error');
  }
}

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max).trim();
}

function allow() {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var cache = CacheService.getScriptCache();
    var mk = 'm' + Math.floor(Date.now() / 60000);
    var n = Number(cache.get(mk) || 0);
    if (n >= PER_MINUTE) return false;
    var props = PropertiesService.getScriptProperties();
    var dk = 'd' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd');
    var dn = Number(props.getProperty(dk) || 0);
    if (dn >= PER_DAY) return false;
    cache.put(mk, String(n + 1), 120);
    props.setProperty(dk, String(dn + 1));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function reply(s) { return ContentService.createTextOutput(s); }
