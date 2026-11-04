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
    'js/guard.js', 'js/config.js', 'js/version.js', 'js/window.js', 'js/security.js', 'js/admin.js', 'js/offline.js', 'js/telemetry.js', 'js/filesystem.js', 'js/landscapes.js', 'js/photos.js', 'js/fx.js', 'js/icons-rich.js', 'js/desktop.js', 'js/shell.js', 'js/speech.js', 'js/widgets.js', 'js/sync.js', 'js/store.js', 'js/beam.js', 'js/capture.js', 'js/shortcuts.js', 'js/jarvis.js', 'js/hands.js', 'vendor/mediapipe/vision_bundle.mjs', 'vendor/mediapipe/wasm/vision_wasm_internal.js', 'vendor/mediapipe/wasm/vision_wasm_internal.wasm', 'vendor/mediapipe/hand_landmarker.task', 'js/gemini.js', 'js/live-worklet.js', 'vendor/qrcode.js', 'vendor/jsQR.js', 'js/tour.js', 'vendor/lamejs.min.js', 'vendor/mespeak.js', 'vendor/espeak/mespeak_config.json', 'vendor/espeak/voices/en/en-us.json', 'vendor/espeak/voices/en/en-rp.json', 'vendor/espeak/voices/en/en.json', 'vendor/espeak/voices/es.json', 'vendor/espeak/voices/fr.json', 'vendor/espeak/voices/de.json', 'vendor/espeak/voices/it.json', 'vendor/espeak/voices/pt.json', 'vendor/espeak/voices/nl.json', 'vendor/espeak/voices/pl.json', 'vendor/espeak/voices/sv.json', 'vendor/espeak/voices/tr.json', 'js/sw-register.js', 'js/app-bridge.js', 'js/app-shim.js',
    'apps/trustvault.html', 'apps/qrseal.html', 'apps/systemvault.html', 'apps/cryptocompass.html',
  'apps/js/trustvault.js', 'apps/js/trustvault.handlers.js',
    'apps/js/systemvault.js', 'apps/js/systemvault.handlers.js', 'apps/js/cryptocompass.js', 'apps/js/cryptocompass.handlers.js',
  ],
};
