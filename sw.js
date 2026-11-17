// Офлайн-режим: сайт открывается без интернета (например, на выезде).
// Стратегия: сначала сеть (чтобы обновления приходили сразу), при её отсутствии — сохранённая копия.

const CACHE = 'rc-v7';
const CORE = [
  './', 'index.html', 'css/styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/cost.js', 'js/ui.js', 'js/diagram.js', 'js/calc.js', 'js/defaults.js', 'js/store.js', 'js/firebase-config.js', 'js/vendor/preact-htm.js', 'js/vendor/firebase.js', 'css/fonts.css',
  'fonts/Onest-400-cyrillic.woff2', 'fonts/Onest-400-latin.woff2', 'fonts/JetBrainsMono-400-cyrillic.woff2', 'fonts/JetBrainsMono-400-latin.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isFont) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isFont) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
