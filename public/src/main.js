import { initApplication } from './core/bootstrap.js';

document.addEventListener('DOMContentLoaded', async () => {
    await initApplication();

    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
            console.log('PWA ServiceWorker registration notice:', err);
        });
    }
});

