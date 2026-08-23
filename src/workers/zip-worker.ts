// Web Worker for Background Asynchronous ZIP Compression & Archiving
declare const JSZip: any;

const TRUSTED_JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

function resolveJSZip(mod?: any): any {
    if (typeof (self as any).JSZip === 'function') return (self as any).JSZip;
    if (typeof mod === 'function') return mod;
    if (typeof mod?.default === 'function') return mod.default;
    if (typeof mod?.JSZip === 'function') return mod.JSZip;
    try {
        if (typeof JSZip === 'function') return JSZip;
    } catch { }
    return null;
}

self.onmessage = async function (e: MessageEvent) {
    const { type, files, options } = e.data || {};

    if (type === 'CREATE_ZIP') {
        try {
            let JSZipClass = resolveJSZip();

            if (!JSZipClass) {
                try {
                    // Try dynamic import for module workers
                    const mod = await import(/* @vite-ignore */ TRUSTED_JSZIP_URL);
                    JSZipClass = resolveJSZip(mod);
                } catch (importErr) {
                    try {
                        if (typeof (self as any).importScripts === 'function') {
                            (self as any).importScripts(TRUSTED_JSZIP_URL);
                            JSZipClass = resolveJSZip();
                        }
                    } catch (scriptsErr) {
                        // fallback below
                    }
                }
            }

            if (!JSZipClass || typeof JSZipClass !== 'function') {
                self.postMessage({ type: 'ERROR', message: 'JSZip library constructor is not available in worker context.' });
                return;
            }

            const zip = new JSZipClass();
            const total = files.length;

            for (let i = 0; i < total; i++) {
                const f = files[i];
                zip.file(f.name, f.blob);
                const progress = Math.round(((i + 1) / total) * 90);
                self.postMessage({ type: 'PROGRESS', current: i + 1, total, progress, fileName: f.name });
            }

            const compressionMode = (options && options.compression) ? options.compression : 'STORE';
            const zipBlob = await zip.generateAsync({
                type: 'blob',
                compression: compressionMode
            });

            self.postMessage({ type: 'DONE', zipBlob });
        } catch (err: any) {
            self.postMessage({ type: 'ERROR', message: err.message || 'Worker ZIP generation failed.' });
        }
    }
};

export {};
