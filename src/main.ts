import { initApplication } from './core/bootstrap';
import './core/analytics';

document.addEventListener('DOMContentLoaded', async () => {
    await initApplication();

    if ('serviceWorker' in navigator) {
        const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname) ||
            /^192\.168\./.test(window.location.hostname) ||
            /^10\./.test(window.location.hostname) ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(window.location.hostname);

        if (isLocal) {
            navigator.serviceWorker.getRegistrations().then((registrations) => {
                for (const reg of registrations) {
                    reg.unregister();
                }
            });
            if ('caches' in window) {
                caches.keys().then((names) => {
                    for (const name of names) {
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
