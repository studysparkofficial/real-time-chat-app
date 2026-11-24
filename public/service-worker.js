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

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'PulseChat', options: { body: event.data.text() } };
  }

  event.waitUntil((async () => {
    const options = payload.options && typeof payload.options === 'object' ? payload.options : {};
    if (payload.action === 'clear') {
      const notifications = await self.registration.getNotifications({ tag: options.tag });
      notifications.forEach((notification) => notification.close());
      return;
    }

    const title = String(payload.title || 'PulseChat').slice(0, 100);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visibleClient = windows.find((client) => client.visibilityState === 'visible');
    if (visibleClient) {
      visibleClient.postMessage({ type: 'pulsechat-push', payload });
      return;
    }

    await self.registration.showNotification(title, {
      body: String(options.body || 'You have a new notification').slice(0, 180),
      icon: options.icon || '/pwa-icon-192.png',
      badge: options.badge || '/favicon.png',
      tag: String(options.tag || 'pulsechat-notification').slice(0, 100),
      renotify: false,
      requireInteraction: Boolean(options.requireInteraction),
      silent: options.silent === true,
      data: options.data && typeof options.data === 'object' ? options.data : { url: '/' }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const requestedUrl = new URL(event.notification.data?.url || '/', self.location.origin);
  const url = (requestedUrl.origin === self.location.origin ? requestedUrl : new URL('/', self.location.origin)).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.focus();
        client.postMessage({ type: 'pulsechat-notification-click', url });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
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
