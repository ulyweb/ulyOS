/* ==========================================================================
   ulyOS · js/config.js — deployment switches.
   The "Download offline version" package REPLACES this file with OFFLINE: true,
   which removes Contact Admin and the new-profile notification.
   ========================================================================== */
window.ulyOS = window.ulyOS || {};
ulyOS.config = {
  OFFLINE: false,
  /* Same Google Apps Script relay as ulyweb/key (forwards to the admin's Gmail). */
  CONTACT_ENDPOINT: 'https://script.google.com/macros/s/AKfycbzvKlrt3NYoGvwIoxpOrDyarhJYL5V8TctpxuG16xw0I5ee-jcOWs1Fw_c9SSh6jI_McA/exec',
  CONTACT_EMAIL: 'francisuadm@gmail.com',
  /* Email the admin when a profile is created (disclosed on the profile screen; never on localhost / file://). */
  NOTIFY_ON_PROFILE: true,
  /* Every file in the offline package (paths relative to index.html). */
  FILES: [
    'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
    'js/config.js', 'js/window.js', 'js/security.js', 'js/admin.js', 'js/offline.js', 'js/telemetry.js', 'js/filesystem.js', 'js/desktop.js', 'js/shell.js', 'js/widgets.js',
    'apps/trustvault.html', 'apps/qrseal.html', 'apps/systemvault.html', 'apps/cryptocompass.html',
  ],
};
