let componentsLoadedPromise = null;

export function loadUIComponents() {
    if (!componentsLoadedPromise) {
        componentsLoadedPromise = (async () => {
            let container = document.getElementById('modals-container');
            if (!container) {
                if (document.readyState === 'loading') {
                    await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
                }
                container = document.getElementById('modals-container');
            }
            if (!container) return;

            if (container.children.length > 0) return;

            const componentUrls = [
                './src/components/settings-modal.html',
                './src/components/lorebook-modal.html',
                './src/components/gdrive-modal.html',
                './src/components/audio-modal.html',
                './src/components/srs-modal.html',
                './src/components/find-replace-modal.html',
                './src/components/export-modal.html',
                './src/components/preview-modal.html'
            ];

            const htmlChunks = await Promise.all(
                componentUrls.map(async (url) => {
                    try {
                        const res = await fetch(url);
                        if (!res.ok) {
                            console.warn(`Không thể nạp component HTML (${res.status}): ${url}`);
                            return '';
                        }
                        return await res.text();
                    } catch (e) {
                        console.warn(`Lỗi nạp component HTML: ${url}`, e);
                        return '';
                    }
                })
            );

            const validHtml = htmlChunks.filter(Boolean).join('\n');
            if (validHtml) {
                container.innerHTML = validHtml;
            }
        })();
    }
    return componentsLoadedPromise;
}

export async function ensureModalElement(modalId) {
    let el = document.getElementById(modalId);
    if (el) return el;

    await loadUIComponents();
    return document.getElementById(modalId);
}

// Auto-trigger loading as soon as module is imported
loadUIComponents();