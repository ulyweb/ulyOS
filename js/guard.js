/* ulyOS · js/guard.js — anti-clickjacking: ulyOS must not be shown inside another site's frame.
   Loaded synchronously in <head> (an external file, so the Content-Security-Policy needs no inline-script allowance). */
if (window.top !== window.self) {
  document.documentElement.style.display = 'none';
  try { window.top.location = window.self.location; } catch (e) { /* cross-origin top: stay hidden */ }
}

/* theme before first paint (the choice itself lives in the encrypted profile; only the resolved dark/light is remembered here) */
try { document.documentElement.dataset.theme = localStorage.getItem('ulyos.theme') === 'light' ? 'light' : 'dark'; } catch (e) { /* ignore */ }
