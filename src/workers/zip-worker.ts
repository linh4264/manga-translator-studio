// Web Worker for Background Asynchronous ZIP Compression & Archiving
declare const JSZip: any;

self.onmessage = async function (e: MessageEvent) {
    const { type, files, options } = e.data || {};

    if (type === 'CREATE_ZIP') {
        try {
            let JSZipClass = typeof JSZip !== 'undefined' ? JSZip : (self as any).JSZip;

            if (!JSZipClass && e.data.jszipUrl) {
                try {
                    // Try dynamic import for module workers
                    const mod = await import(/* @vite-ignore */ e.data.jszipUrl);
                    JSZipClass = mod?.default || mod;
                } catch (importErr) {
                    try {
                        if (typeof (self as any).importScripts === 'function') {
                            (self as any).importScripts(e.data.jszipUrl);
                            JSZipClass = (self as any).JSZip;
                        }
                    } catch (scriptsErr) {
                        // fallback below
                    }
                }
            }

            if (!JSZipClass) {
                self.postMessage({ type: 'ERROR', message: 'JSZip library is not available in worker context.' });
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
