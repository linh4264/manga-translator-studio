/**
 * patchmatch.ts - Client Facade & Worker Management for Pattern-Aware Manga Inpainting
 */

import { runPatchMatchPipeline } from './patchmatch.worker';

export const PATCHMATCH_PRESETS = {
    FAST: {
        patchRadius: 3,
        iterations: 3,
        randomSearchRadius: 32,
        maskDilate: 2,
        enablePatternDetection: true,
        enableSeamBlending: true
    },
    BALANCED: {
        patchRadius: 5,
        iterations: 6,
        randomSearchRadius: 64,
        maskDilate: 2,
        enablePatternDetection: true,
        enableSeamBlending: true
    },
    QUALITY: {
        patchRadius: 7,
        iterations: 8,
        randomSearchRadius: 128,
        maskDilate: 3,
        enablePatternDetection: true,
        enableSeamBlending: true
    }
};

let activeWorker: Worker | null = null;

function getOrCreateWorker(): Worker | null {
    if (!activeWorker && typeof Worker !== 'undefined') {
        try {
            activeWorker = new Worker(new URL('./patchmatch.worker.ts', import.meta.url), { type: 'module' });
        } catch (e) {
            console.warn("Could not instantiate module WebWorker, falling back to direct execution:", e);
            activeWorker = null;
        }
    }
    return activeWorker;
}

export async function patchMatchInpaintImageData({
    imageData,
    mask,
    width,
    height,
    options = {},
    onProgress = null,
    signal = null
}: {
    imageData: ImageData | Uint8Array | { data: Uint8ClampedArray };
    mask: Uint8Array;
    width: number;
    height: number;
    options?: any;
    onProgress?: ((progress: number, msg: string) => void) | null;
    signal?: AbortSignal | null;
}): Promise<{
    outputImageData: ImageData | null;
    outputRgba: Uint8Array;
    roi: any;
    patternInfo: any;
    stats: any;
}> {
    const mergedOpts = { ...PATCHMATCH_PRESETS.BALANCED, ...options };
    const rawRgba = (imageData as any).data ? new Uint8Array((imageData as any).data) : new Uint8Array(imageData as Uint8Array);
    const rawMask = new Uint8Array(mask);

    const worker = getOrCreateWorker();

    if (worker) {
        return new Promise((resolve, reject) => {
            const onAbort = () => {
                worker.postMessage({ type: 'cancel' });
                cleanup();
                reject(new DOMException("PatchMatch operation was cancelled.", "AbortError"));
            };

            const cleanup = () => {
                if (signal) signal.removeEventListener('abort', onAbort);
                worker.onmessage = null;
                worker.onerror = null;
            };

            if (signal) {
                if (signal.aborted) return onAbort();
                signal.addEventListener('abort', onAbort);
            }

            worker.onmessage = (e: MessageEvent) => {
                const data = e.data;
                if (!data) return;

                if (data.type === 'progress' && onProgress) {
                    onProgress(data.progress, data.message);
                } else if (data.type === 'complete') {
                    cleanup();
                    const outputRgba = new Uint8Array(data.outputBuffer);
                    let outImgData: ImageData | null = null;
                    if (typeof ImageData !== 'undefined') {
                        const clamped = new Uint8ClampedArray(outputRgba);
                        outImgData = new ImageData(clamped, width, height);
                    }
                    resolve({
                        outputImageData: outImgData,
                        outputRgba,
                        roi: data.roi,
                        patternInfo: data.patternInfo,
                        stats: data.stats
                    });
                } else if (data.type === 'cancelled') {
                    cleanup();
                    reject(new DOMException("PatchMatch operation was cancelled.", "AbortError"));
                } else if (data.type === 'error') {
                    cleanup();
                    reject(new Error(data.error || "PatchMatch worker error"));
                }
            };

            worker.onerror = (err) => {
                cleanup();
                console.warn("Worker error during PatchMatch, falling back to synchronous execution:", err);
                try {
                    const fallbackResult = runPatchMatchPipeline(rawRgba, rawMask, width, height, mergedOpts, onProgress);
                    let outImgData: ImageData | null = null;
                    if (typeof ImageData !== 'undefined') {
                        outImgData = new ImageData(new Uint8ClampedArray(fallbackResult.outputRgba), width, height);
                    }
                    resolve({
                        outputImageData: outImgData,
                        outputRgba: fallbackResult.outputRgba,
                        roi: fallbackResult.roi,
                        patternInfo: fallbackResult.patternInfo,
                        stats: fallbackResult.stats
                    });
                } catch (fallbackErr) {
                    reject(fallbackErr);
                }
            };

            worker.postMessage(
                {
                    type: 'inpaint',
                    rgbaBuffer: rawRgba.buffer,
                    maskBuffer: rawMask.buffer,
                    width,
                    height,
                    options: mergedOpts
                },
                [rawRgba.buffer, rawMask.buffer]
            );
        });
    } else {
        if (signal && signal.aborted) {
            throw new DOMException("PatchMatch operation was cancelled.", "AbortError");
        }
        const result = runPatchMatchPipeline(rawRgba, rawMask, width, height, mergedOpts, onProgress);
        let outImgData: ImageData | null = null;
        if (typeof ImageData !== 'undefined') {
            outImgData = new ImageData(new Uint8ClampedArray(result.outputRgba), width, height);
        }
        return {
            outputImageData: outImgData,
            outputRgba: result.outputRgba,
            roi: result.roi,
            patternInfo: result.patternInfo,
            stats: result.stats
        };
    }
}

export async function patchMatchInpaintCanvas({
    canvas,
    maskCanvas,
    options = {},
    onProgress = null,
    signal = null
}: {
    canvas: HTMLCanvasElement;
    maskCanvas: HTMLCanvasElement;
    options?: any;
    onProgress?: ((progress: number, msg: string) => void) | null;
    signal?: AbortSignal | null;
}): Promise<HTMLCanvasElement> {
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error("Không thể tạo 2D context cho canvas");
    const imgData = ctx.getImageData(0, 0, width, height);

    const mCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!mCtx) throw new Error("Không thể tạo 2D context cho mask canvas");
    const mImgData = mCtx.getImageData(0, 0, width, height);
    const mask = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i++) {
        const p = i * 4;
        mask[i] = (mImgData.data[p] > 120 || mImgData.data[p + 3] > 120) ? 1 : 0;
    }

    const { outputImageData } = await patchMatchInpaintImageData({
        imageData: imgData,
        mask,
        width,
        height,
        options,
        onProgress,
        signal
    });

    if (outputImageData) {
        ctx.putImageData(outputImageData, 0, 0);
    }
    return canvas;
}
