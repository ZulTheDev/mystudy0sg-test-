/* Study0SG: safe static-only offline fallback.
 * Never cache login/session/API/Supabase/Stytch replies or participant records.
 * A future Workbox upgrade can replace this worker without changing data policies.
 */
const VERSION = 'study0sg-shell-v2-1';
const ROOT = new URL('./', self.location.href);
const OFFLINE = new URL('offline.html', ROOT).pathname;
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.add(OFFLINE)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('study0sg-shell-') && key !== VERSION).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]));
});
const staticAsset = path => /\.(?:js|css|svg|png|jpe?g|webp|woff2?|ico|wasm)$/i.test(path);
self.addEventListener('fetch', event => {
  const request = event.request;
  if(request.method !== 'GET' || request.headers.has('Authorization')) return;
  const url = new URL(request.url);
  if(url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  if(url.pathname.includes('/api/') || url.pathname.includes('/functions/') || url.pathname.includes('/auth/')) return;
  if(request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
    return;
  }
  if(!staticAsset(url.pathname)) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(async response => {
    if(response.ok && response.type === 'basic') {
      const cache = await caches.open(VERSION);
      await cache.put(request, response.clone());
    }
    return response;
  })));
});
