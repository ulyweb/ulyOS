/* ulyOS · js/app-shim.js — loaded first by every bundled app.
   When the app runs inside ulyOS (same-origin parent) its localStorage is redirected into the signed-in
   profile's encrypted vault under "app:<id>:", and user activity is reported so idle auto-lock works.
   Outside ulyOS it does nothing and the app uses the browser's own localStorage. */
(function () {
  'use strict';
  try {
    var P = parent !== window ? parent.ulyOS : null;
    if (!P || !P.vault || !P.security || !P.security.profileId()) return;
    var ns = 'app:' + document.currentScript.dataset.app + ':';
    var mine = function () { return P.vault.keys().filter(function (k) { return k.indexOf(ns) === 0; }); };
    var api = {
      getItem: function (k) { return P.vault.get(ns + k); },
      setItem: function (k, v) { P.vault.set(ns + k, String(v)); },
      removeItem: function (k) { P.vault.remove(ns + k); },
      clear: function () { mine().forEach(function (k) { P.vault.remove(k); }); },
      key: function (i) { var a = mine(); return a[i] == null ? null : a[i].slice(ns.length); },
    };
    var st = new Proxy(api, {
      get: function (t, k) { if (k === 'length') return mine().length; if (k in t) return t[k]; if (typeof k === 'string') return t.getItem(k); },
      set: function (t, k, v) { t.setItem(k, v); return true; },
      deleteProperty: function (t, k) { t.removeItem(k); return true; },
    });
    Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return st; } });
    var last = 0;
    var ping = function () { var n = Date.now(); if (n - last > 4000) { last = n; try { P.security.ping(); } catch (e) { /* ignore */ } } };
    // forward ulyOS shortcuts (Ctrl+Shift+F full screen, F1 help, …) pressed while an app has the focus
    addEventListener('keydown', function (e) { try { if (P.shortcuts && P.shortcuts.handle(e)) e.stopPropagation(); } catch (x) { /* ignore */ } }, true);
    ['pointerdown', 'keydown', 'wheel'].forEach(function (e) { addEventListener(e, ping, { passive: true, capture: true }); });
  } catch (e) { console.warn('ulyOS storage shim failed', e); }
})();
