/**
 * service-worker.js — Suporte Offline e Cache para o Busca Ofertas
 */

const CACHE_NAME = 'busca-ofertas-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/db_storage.js',
  './js/gamification.js',
  './js/scanner.js',
  './js/chave_parser.js',
  './js/sefaz_fetcher.js',
  './js/sefaz_parser.js',
  './js/comparador.js',
  './js/community_feed.js',
  './js/backup.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ignora requisições de proxy SEFAZ ou CDNs dinâmicas
  if (event.request.url.includes('api.allorigins.win') || 
      event.request.url.includes('corsproxy.io') || 
      event.request.url.includes('codetabs.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // Fallback offline se necessário
      });
    })
  );
});
