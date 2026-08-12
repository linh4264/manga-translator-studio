import { initApplication } from './core/bootstrap.js';

document.addEventListener('DOMContentLoaded', async () => {
    await initApplication();

    if ('serviceWorker' in navigator) {
        const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
        if (isLocal) {
            // Self-cleaning: Unregister Service Worker & clear stale cache on localhost so code edits take effect instantly
            navigator.serviceWorker.getRegistrations().then((registrations) => {
                for (let reg of registrations) {
                    reg.unregister();
                }
            });
            if ('caches' in window) {
                caches.keys().then((names) => {
                    for (let name of names) {
                        caches.delete(name);
                    }
                });
            }
        } else if (window.location.protocol.startsWith('http')) {
            navigator.serviceWorker.register('/sw.js').catch((err) => {
                console.log('PWA ServiceWorker registration notice:', err);
            });
        }
    }
});

