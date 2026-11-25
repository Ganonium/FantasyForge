// Service Worker: offline spielbar, neue Versionen werden angeboten statt still eingespielt.
// Bei jeder Veröffentlichung VERSION erhöhen (und APP_VERSION in index.html).
const VERSION = '0.1.0';
const CACHE = 'fantasyforge-' + VERSION;
const FILES = [
  './', './index.html', './css/style.css', './manifest.webmanifest',
  './js/main.js', './js/sim.js', './js/render.js', './js/data.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('fantasyforge-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) {
    // Schriften: aus dem Cache, sonst Netz (und merken).
    e.respondWith(caches.open(CACHE).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; }))).catch(() => fetch(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
