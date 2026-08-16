/**
 * patchmatch.js - Client Facade & Worker Management for Pattern-Aware Manga Inpainting
 */

import { runPatchMatchPipeline } from './patchmatch.worker.js';

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

let activeWorker = null;

/**
 * Creates or reuses a WebWorker for PatchMatch execution
 */
function getOrCreateWorker() {
    if (!activeWorker && typeof Worker !== 'undefined') {
        try {
            activeWorker = new Worker(new URL('./patchmatch.worker.js', import.meta.url), { type: 'module' });
        } catch (e) {
            console.warn("Could not instantiate module WebWorker, falling back to direct execution:", e);
            activeWorker = null;
        }
    }
    return activeWorker;
}

/**
 * Inpaints an image buffer using Pattern-Aware PatchMatch Inpainting
 * @param {object} params
 * @param {ImageData|Uint8Array} params.imageData - RGBA ImageData or Uint8Array
 * @param {Uint8Array} params.mask - Binary mask buffer (0 = keep, 1 = inpaint)
 * @param {number} params.width - Image width
 * @param {number} params.height - Image height
 * @param {object} [params.options] - PatchMatch options (patchRadius, iterations, etc.)
 * @param {function} [params.onProgress] - Callback (progress: 0.0-1.0, message: string)
 * @param {AbortSignal} [params.signal] - Abort signal for cancellation
 * @returns {Promise<{ outputImageData: ImageData, outputRgba: Uint8Array, patternInfo: object, stats: object }>}
 */
export async function patchMatchInpaintImageData({
    imageData,
    mask,
    width,
    height,
    options = {},
    onProgress = null,
    signal = null
}) {
    const mergedOpts = { ...PATCHMATCH_PRESETS.BALANCED, ...options };
    const rawRgba = imageData.data ? new Uint8Array(imageData.data) : new Uint8Array(imageData);
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

            worker.onmessage = (e) => {
                const data = e.data;
                if (!data) return;

                if (data.type === 'progress' && onProgress) {
                    onProgress(data.progress, data.message);
                } else if (data.type === 'complete') {
                    cleanup();
                    const outputRgba = new Uint8Array(data.outputBuffer);
                    let outImgData = null;
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
                    let outImgData = null;
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

            // Transfer buffers to worker for zero-copy high performance
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
        // Direct synchronous execution
        if (signal && signal.aborted) {
            throw new DOMException("PatchMatch operation was cancelled.", "AbortError");
        }
        const result = runPatchMatchPipeline(rawRgba, rawMask, width, height, mergedOpts, onProgress);
        let outImgData = null;
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

/**
 * High-level Canvas Inpaint API: Takes input Canvas & Mask Canvas, runs PatchMatch, and draws back to Canvas
 * @param {object} params
 * @param {HTMLCanvasElement} params.canvas - Source image canvas
 * @param {HTMLCanvasElement} params.maskCanvas - Binary mask canvas (white = inpaint, black = keep)
 * @param {object} [params.options] - PatchMatch options
 * @param {function} [params.onProgress] - Progress callback
 * @param {AbortSignal} [params.signal] - Abort signal
 * @returns {Promise<HTMLCanvasElement>} - Updated Canvas
 */
export async function patchMatchInpaintCanvas({
    canvas,
    maskCanvas,
    options = {},
    onProgress = null,
    signal = null
}) {
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imgData = ctx.getImageData(0, 0, width, height);

    const mCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    const mImgData = mCtx.getImageData(0, 0, width, height);
    const mask = new Uint8Array(width * height);

    // Convert mask pixels to binary (1 = white/inpaint, 0 = black/keep)
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

    ctx.putImageData(outputImageData, 0, 0);
    return canvas;
}
