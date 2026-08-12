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

    // Direct pass for AI APIs
    if (url.pathname.includes('/v1beta/') || url.pathname.includes('generativelanguage') || url.pathname.includes('/v1/chat')) {
        return;
    }

    // Network-First strategy: Always fetch fresh code from server/disk first
    event.respondWith(
        fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
            }
            return networkResponse;
        }).catch(() => {
            // Fallback to cache ONLY if offline / network fails
            return caches.match(event.request);
        })
    );
});
