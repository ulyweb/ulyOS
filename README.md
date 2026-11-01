# ulyOS

A self-hosted, browser-based operating system in vanilla HTML, CSS and JavaScript. No frameworks, no build step.

## Run

```bash
python3 -m http.server 8080
```

Open http://localhost:8080 in Chrome or Edge (use `localhost`, not `file://`, so the sandbox filesystem works).

## Features
- Window manager: drag, resize, maximize, minimize, close, edge snap, z-order. Iframes get `pointer-events: none` during drags and resizes.
- Task Manager / System Audit: simulated RAM from DOM nodes and iframes, plus a persistent audit trail.
- Grid desktop with right-click menus, URL shortcuts, and Photopea, Polotno, Spotify and GetArtCraft launchers.
- File manager on the File System Access API: private sandbox (OPFS) plus mountable local folders.
- Settings: wallpapers, accent, blur, animations, custom cursor.
