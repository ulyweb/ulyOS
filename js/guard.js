/* ulyOS · js/guard.js — anti-clickjacking: ulyOS must not be shown inside another site's frame.
   Loaded synchronously in <head> (an external file, so the Content-Security-Policy needs no inline-script allowance). */
if (window.top !== window.self) {
  document.documentElement.style.display = 'none';
  try { window.top.location = window.self.location; } catch (e) { /* cross-origin top: stay hidden */ }
}
