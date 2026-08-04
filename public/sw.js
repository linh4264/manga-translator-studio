// Service Worker for Manga Translator Studio PWA Offline Operation
const CACHE_NAME = 'manga-translator-v1';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/src/main.js',
    '/src/config/constants.js',
    '/src/core/bootstrap.js',
    '/src/core/component-loader.js',
    '/src/core/elements.js',
    '/src/core/events.js',
    '/src/core/i18n.js',
    '/src/core/state.js',
    '/src/core/utils.js',
    '/src/core/utils/dom.js',
    '/src/core/utils/json.js',
    '/src/core/utils/storage.js',
    '/src/features/ocr/ocr-service.js',
    '/src/features/ocr/local-ocr.js',
    '/src/features/canvas/canvas-service.js',
    '/src/features/canvas/canvas-renderer.js',
    '/src/features/canvas/canvas-exporter.js',
    '/src/features/io.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('PWA SW: Partial static cache preload:', err);
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Only intercept GET HTTP/HTTPS requests
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (!url.protocol.startsWith('http')) return;

    // Cache-first strategy for static assets, network-first for APIs
    if (url.pathname.includes('/v1beta/') || url.pathname.includes('generativelanguage')) {
        return; // Pass API calls directly to network
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached version & fetch fresh copy in background
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            return fetch(event.request).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            });
        })
    );
});
