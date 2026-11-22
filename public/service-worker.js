const CACHE_NAME = 'jnuverse-app-shell-v1';
const SHELL_URLS = [
  '/',
  '/manifest.json',
  '/jnu-logo.png',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png'
];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const pageResponse = await fetch('/');
  if (!pageResponse.ok) throw new Error('Could not cache the app shell.');

  await cache.put('/', pageResponse.clone());
  const html = await pageResponse.clone().text();
  const assetUrls = Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/g))
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'))
    .map((url) => `${url.pathname}${url.search}`);

  await cache.addAll(SHELL_URLS.filter((url) => url !== '/'));
  await cache.addAll(assetUrls);
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('jnuverse-app-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response.ok) return response;
          return caches.open(CACHE_NAME)
            .then((cache) => cache.put('/', response.clone()))
            .then(() => response);
        })
        .catch(async () => (await caches.match('/')) || Response.error())
    );
    return;
  }

  const isStaticAsset = url.pathname.startsWith('/assets/') ||
    /\.(?:css|gif|ico|jpe?g|js|png|svg|webp|woff2?)$/i.test(url.pathname);
  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response.ok || response.type !== 'basic') return response;
        return caches.open(CACHE_NAME)
          .then((cache) => cache.put(request, response.clone()))
          .then(() => response);
      });
    })
  );
});
