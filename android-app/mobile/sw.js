// Android assets are served from the APK. Retire the previous website worker on update.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  await caches.delete('rc-v7');
  await self.registration.unregister();
})()));
