/* ulyOS · js/sw-register.js — registers the offline-cache service worker (not in the offline build or on file://). */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !(window.ulyOS && ulyOS.config && ulyOS.config.OFFLINE)) {
  navigator.serviceWorker.register('sw.js').catch(function () { /* optional */ });
}
