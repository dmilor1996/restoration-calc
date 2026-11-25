// Android assets are served from the APK. Retire the previous website worker on update.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  await Promise.all((await caches.keys()).filter(key => /^rc-v\d+$/.test(key)).map(key => caches.delete(key)));
  await self.clients.claim();
  await self.registration.unregister();
})()));
