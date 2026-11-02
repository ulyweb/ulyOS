/* ==========================================================================
   ulyOS · js/admin.js
   Contact Admin (same relay as ulyweb/key) and the new-profile notification.
   Everything here is disabled in the offline build (ulyOS.config.OFFLINE).

   What can be sent, and only ever on a deliberate action:
     • Contact Admin  → the name / email / subject / message you type, after you press Send
     • New profile    → profile name, protected yes/no + type, optional contact email you typed,
                        time, site, language and time zone. NEVER passwords, PINs, keys, files or app data.
   ========================================================================== */
(function () {
  'use strict';

  const { h } = ulyOS.util;
  const { ui } = ulyOS;
  const cfg = () => ulyOS.config || {};
  const A = (ulyOS.admin = {});

  const isDevHost = () => /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname) || location.protocol === 'file:';
  /** Contact form available (online build only). */
  A.enabled = () => !cfg().OFFLINE && !!cfg().CONTACT_ENDPOINT;
  /** Admin is emailed when a profile is created (never on localhost, file:// or the offline build). */
  A.notifyEnabled = () => A.enabled() && cfg().NOTIFY_ON_PROFILE !== false && (!isDevHost() || !!cfg().NOTIFY_ON_LOCALHOST);   // NOTIFY_ON_LOCALHOST: testing only

  function post(fields) {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.append(k, String(v)));
    if (cfg().CONTACT_EMAIL) fd.append('email', cfg().CONTACT_EMAIL);   // legacy relays read the recipient from here; a hardened relay hard-codes it and this can be left empty
    return fetch(cfg().CONTACT_ENDPOINT, { method: 'POST', body: fd, mode: 'no-cors', keepalive: true });
  }

  A.contact = async function () {
    if (!A.enabled()) return;
    const prof = ulyOS.security && ulyOS.security.profile && ulyOS.security.profile();
    ulyOS.audit('Contact Admin opened', 'info');
    const v = await ui.form({
      title: '✉ Contact Admin', okText: 'Send',
      message: 'Sends a message to the ulyOS administrator. Nothing is sent until you press Send. Never include passwords, PINs or keys.',
      fields: [
        { name: 'name', label: 'Name (optional)', value: prof ? prof.name : '' },
        { name: 'reply', label: 'Your email (optional — only if you want a reply)', type: 'email' },
        { name: 'subject', label: 'Subject', placeholder: 'Short summary' },
        { name: 'message', label: 'Message', type: 'textarea', placeholder: 'What do you need the admin to know?' },
      ],
      validate: (x) => (!x.subject.trim() ? 'Enter a subject' : !x.message.trim() ? 'Enter a message' : null),
    });
    if (!v) return;
    try {
      await post({
        name: v.name.trim(), subject: '[ulyOS] ' + v.subject.trim(),
        message: v.message.trim() + (v.reply.trim() ? '\n\nReply-to: ' + v.reply.trim() : '') + '\n\n— sent from ulyOS v' + (ulyOS.version || '?') + ' · ' + location.host + location.pathname,
      });
      ui.toast('Message sent to the admin ✓', { type: 'ok' });
      ulyOS.audit('Contact Admin: message sent', 'ok');
    } catch {
      ui.toast('Could not send the message — check your connection and try again', { type: 'err' });
      ulyOS.audit('Contact Admin: send failed', 'warn');
    }
  };

  /** One-line description shown next to the profile-creation form. */
  A.disclosure = 'The site admin is notified by email when a profile is created: your profile name, whether it is password-protected, and the optional email below. Passwords, PINs, keys, files and app data are never sent.';

  A.notifyNewProfile = function (profile, extra = {}) {
    if (!A.notifyEnabled()) return;
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })();
    post({
      name: profile.name,
      subject: '[ulyOS] New profile: ' + profile.name,
      message: [
        'Event: ' + (extra.source === 'import' ? 'profile restored from backup' : 'profile created'),
        'Profile name: ' + profile.name,
        'Protected: yes (password required)',
        'Contact email (optional, typed by the user): ' + (extra.contact || '—'),
        'Time: ' + new Date().toISOString(),
        'Site: ' + location.host + location.pathname + ' (ulyOS v' + (ulyOS.version || '?') + ')',
        'Language / time zone: ' + (navigator.language || '') + ' / ' + tz,
        '',
        'No passwords, keys, files or app data are ever included.',
      ].join('\n'),
    }).catch(() => { /* silent: never block profile creation */ });
  };
})();
