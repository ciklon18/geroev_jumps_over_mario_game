/*
 * Грибок против Марио — service worker.
 * Стратегия: cache-first, при промахе — сеть (и копия ответа в кэш).
 * Все пути относительные, поэтому SW работает и из подкаталога
 * (https://ciklon18.github.io/geroev_jumps_over_mario_game/).
 */

const VERSION = 'v11';
const CACHE = `mushroom-game-${VERSION}`;

/** Список предкэшируемых файлов (относительно области регистрации). */
const PRECACHE_URLS = [
  './',
  './index.html',
  './game.js',
  './becoming.js',
  './sfx.js',
  './assets/hero.png',
  './assets/hero-src.png',
  './manifest.webmanifest',
];

/** Абсолютный URL относительно области регистрации SW. */
function scopeUrl(relativePath) {
  return new URL(relativePath, self.registration.scope).href;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll упал бы целиком из-за одного 404 — добавляем по одному.
      await Promise.all(
        PRECACHE_URLS.map(async (path) => {
          const url = scopeUrl(path);
          try {
            const response = await fetch(new Request(url, { cache: 'reload' }));
            if (response.ok) await cache.put(url, response);
          } catch (err) {
            // Файл может отсутствовать при первом деплое — не валим установку.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('mushroom-game-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Только GET и только свой origin: POST, Range и сторонние запросы — мимо.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(self.registration.scope)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request, { ignoreSearch: false });
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response && response.ok && response.type === 'basic') {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch (err) {
        // Офлайн: для навигации отдаём оболочку, если она есть в кэше.
        if (request.mode === 'navigate') {
          const shell = await cache.match(scopeUrl('./index.html'));
          if (shell) return shell;
          const root = await cache.match(scopeUrl('./'));
          if (root) return root;
        }
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});