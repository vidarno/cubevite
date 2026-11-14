// CubeVite service worker (generated into dist/sw.js at build time; see vite.config.ts).
// Precaches the whole build so the app starts offline. A new version waits until the page
// asks it to take over (the "New version - reload" button), so a running page never loses
// lazily loaded chunks halfway through a session.
const VERSION = __VERSION__;
const FILES = __FILES__;
const CACHE = `cubevite-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cubevite-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Network first for the page (so a deploy is noticed), cached shell when offline.
    event.respondWith(fetch(req).catch(() => caches.match('./index.html', { ignoreSearch: true })));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit ?? fetch(req)),
  );
});
