/* 12W SPORT PWA: cache app shell, not user health records. */
const PREFIX = 'rebuild12-v3merge-preview-';
const CACHE = PREFIX+'sport-v3merge-preview-20261016';
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./sport.css",
  "./v3-addon.css",
  "./v3-addon.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./covers/flat.svg",
  "./covers/incline.svg",
  "./covers/fly.svg",
  "./covers/push.svg",
  "./covers/over.svg",
  "./covers/pulldown.svg",
  "./covers/row.svg",
  "./covers/cable.svg",
  "./covers/rear.svg",
  "./covers/curl.svg",
  "./covers/hammer.svg",
  "./covers/squat.svg",
  "./covers/rdl.svg",
  "./covers/split.svg",
  "./covers/legcurl.svg",
  "./covers/hip.svg",
  "./covers/calf.svg",
  "./covers/press.svg",
  "./covers/lateral.svg",
  "./covers/latcable.svg",
  "./covers/rear2.svg",
  "./covers/abs.svg",
  "./covers/plank.svg"
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]))});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin)return;
 const scope=new URL(self.registration.scope);
 if(!url.pathname.startsWith(scope.pathname))return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)))}return res}).catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||caches.match('./index.html'))));return;
 }
 const staticCover=url.pathname.includes('/covers/')||url.pathname.includes('/icons/');
 event.respondWith(staticCover?caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok){const copy=res.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(req,copy)))}return res})):fetch(req).then(res=>{if(res.ok){const copy=res.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(req,copy)))}return res}).catch(()=>caches.match(req)));
});
