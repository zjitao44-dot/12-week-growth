/* Cache only static app-shell files. Fitness/health records stay in IndexedDB/localStorage. */
const CACHE = 'rebuild12-pwa-shell-v4';
const ASSETS = ['./','./index.html','./styles.css','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]));
});
self.addEventListener('fetch', event => {
  const url=new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(cached => {
    if (cached) return cached;
    return fetch(event.request).then(response => {
      if (response.ok && url.pathname.startsWith(new URL(self.registration.scope).pathname)) {
        const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      }
      return response;
    }).catch(async () => {
      if(event.request.mode === 'navigate')return caches.match('./index.html');
      return Response.error();
    });
  }));
});
