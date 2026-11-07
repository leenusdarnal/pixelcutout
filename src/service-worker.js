import { build, files, version } from '$service-worker';

const CACHE_PREFIX = 'pixelcutout-';
const CACHE_NAME = `${CACHE_PREFIX}${version}`;

// Cache the compiled app and the small, explicit PWA assets only.
// User-selected images use blob: URLs and remote AI model downloads are
// intentionally excluded from this service worker's cache.
const APP_ASSETS = [
  ...build,
  ...files.filter((path) => path.endsWith('.webmanifest') || path.endsWith('.svg'))
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_ASSETS.map(async (asset) => {
      try {
        await cache.add(asset);
      } catch {
        // A single optional static asset should not prevent installation.
      }
    }));

    // Save the app entry point for offline launches after the first visit.
    try {
      await cache.add('/');
    } catch {
      // The active page can still install the worker if the root is unavailable.
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Never intercept uploads, cross-origin model downloads, or non-GET requests.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/', response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(request) || await caches.match('/');
        return cached || new Response('PixelCutout is unavailable offline. Open it once while online to enable offline access.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // Cache-first only for compiled app assets and the explicit PWA files.
  if (APP_ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })());
  }
});
