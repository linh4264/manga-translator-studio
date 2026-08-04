// Web Worker for Background Asynchronous ZIP Compression & Archiving
self.onmessage = async function (e) {
    const { type, files, options } = e.data || {};

    if (type === 'CREATE_ZIP') {
        try {
            // Import JSZip in worker context
            if (typeof JSZip === 'undefined' && e.data.jszipUrl) {
                importScripts(e.data.jszipUrl);
            }

            if (typeof JSZip === 'undefined') {
                self.postMessage({ type: 'ERROR', message: 'JSZip library is not available in worker context.' });
                return;
            }

            const zip = new JSZip();
            const total = files.length;

            for (let i = 0; i < total; i++) {
                const f = files[i];
                zip.file(f.name, f.blob);
                const progress = Math.round(((i + 1) / total) * 90);
                self.postMessage({ type: 'PROGRESS', current: i + 1, total, progress, fileName: f.name });
            }

            const zipBlob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });

            self.postMessage({ type: 'DONE', zipBlob });
        } catch (err) {
            self.postMessage({ type: 'ERROR', message: err.message || 'Worker ZIP generation failed.' });
        }
    }
};
