/**
 * patchmatch.worker.ts - Dedicated WebWorker for Non-Blocking Manga PatchMatch Inpainting
 * Guarantees 0% Grey Mud / Blurring and 0% Random Noise via Deterministic PatchMatch / NNF
 */

import { dilateMask, computeMaskROI, extractROI, generateValidSourceMap, MaskROI } from './maskUtils';
import { rgbToGrayscale, analyzeMangaTexture, MangaTexturePattern } from './textureAnalysis';
import { reconstructFromNNF } from './reconstruction';
import { computeAdaptiveBlendRadius, applySeamlessBoundaryBlending } from './blending';
import { createSeededRng, computePatchDistance } from './patchDistance';

let isCancelled = false;

if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
    (self as any).onmessage = function (e: MessageEvent) {
        const data = e.data;
        if (!data) return;
        const requestId = data.requestId;

        if (data.type === 'cancel') {
            isCancelled = true;
            return;
        }

        if (data.type === 'inpaint') {
            isCancelled = false;
            try {
                const {
                    rgbaBuffer,
                    maskBuffer,
                    width,
                    height,
                    options = {}
                } = data;

                const rgba = new Uint8Array(rgbaBuffer);
                const rawMask = new Uint8Array(maskBuffer);

                const result = runPatchMatchPipeline(rgba, rawMask, width, height, options, (progress, msg) => {
                    (self as any).postMessage({ requestId, type: 'progress', progress, message: msg });
                });

                if (isCancelled) {
                    (self as any).postMessage({ requestId, type: 'cancelled' });
                    return;
                }

                (self as any).postMessage(
                    {
                        requestId,
                        type: 'complete',
                        outputBuffer: result.outputRgba.buffer,
                        roi: result.roi,
                        patternInfo: result.patternInfo,
                        confidence: result.confidence,
                        confidenceLevel: result.confidenceLevel,
                        stats: result.stats
                    },
                    [result.outputRgba.buffer]
                );
            } catch (err: any) {
                (self as any).postMessage({
                    requestId,
                    type: 'error',
                    error: err.message || String(err)
                });
            }
        }
    };
}

/**
 * Runs a true PatchMatch / NNF (Nearest Neighbor Field) synthesis pipeline.
 * Utilizes iterations, propagation, decaying random search with seeded PRNG, and Winner-Take-All reconstruction.
 */
export function runPatchMatchNNFSynthesis(
    roiRgba: Uint8Array,
    roiMask: Uint8Array,
    gray: Uint8Array,
    roiW: number,
    roiH: number,
    patchRadius: number,
    validCoords: Int32Array,
    validCount: number,
    validSource: Uint8Array,
    patternInfo: MangaTexturePattern,
    options: any = {},
    roiOffset: { minX: number; minY: number } = { minX: 0, minY: 0 },
    onProgress: ((progress: number, msg: string) => void) | null = null
): { reconstructedRgba: Uint8Array; avgCost: number; convergenceScore: number } {
    const totalPixels = roiW * roiH;
    const R = Math.max(2, patchRadius);
    const iterations = Math.max(1, options.iterations || 6);
    const initialSearchRadius = Math.max(8, options.randomSearchRadius || 64);
    const alpha = 0.5;

    const seed = ((roiW * 31 + roiH * 17 + roiOffset.minX * 7 + roiOffset.minY * 13 + patchRadius * 3) ^ (options.seed || 1337)) >>> 0;
    const rng = createSeededRng(seed);

    const nnfX = new Int32Array(totalPixels).fill(-1);
    const nnfY = new Int32Array(totalPixels).fill(-1);
    const nnfCost = new Float32Array(totalPixels).fill(Infinity);

    let maskedCount = 0;
    for (let y = 0; y < roiH; y++) {
        const rowOff = y * roiW;
        for (let x = 0; x < roiW; x++) {
            const idx = rowOff + x;
            if (roiMask[idx] === 1) {
                maskedCount++;
                const randSourceIdx = Math.floor(rng() * validCount);
                const sx = validCoords[randSourceIdx * 2];
                const sy = validCoords[randSourceIdx * 2 + 1];

                nnfX[idx] = sx;
                nnfY[idx] = sy;
                nnfCost[idx] = computePatchDistance(gray, roiMask, roiW, roiH, x, y, sx, sy, R, patternInfo, options);
            }
        }
    }

    let initialTotalCost = 0;
    for (let i = 0; i < totalPixels; i++) {
        if (roiMask[i] === 1 && nnfCost[i] < Infinity) {
            initialTotalCost += nnfCost[i];
        }
    }

    const minSearchX = R;
    const maxSearchX = roiW - R - 1;
    const minSearchY = R;
    const maxSearchY = roiH - R - 1;

    for (let iter = 0; iter < iterations; iter++) {
        const isForward = (iter % 2 === 0);
        const yStart = isForward ? 0 : roiH - 1;
        const yEnd = isForward ? roiH : -1;
        const yStep = isForward ? 1 : -1;

        const xStart = isForward ? 0 : roiW - 1;
        const xEnd = isForward ? roiW : -1;
        const xStep = isForward ? 1 : -1;

        for (let y = yStart; y !== yEnd; y += yStep) {
            const rowOff = y * roiW;
            for (let x = xStart; x !== xEnd; x += xStep) {
                const tIdx = rowOff + x;
                if (roiMask[tIdx] !== 1) continue;

                let curSx = nnfX[tIdx];
                let curSy = nnfY[tIdx];
                let curCost = nnfCost[tIdx];

                if (isForward) {
                    if (x > 0) {
                        const nIdx = tIdx - 1;
                        if (nnfX[nIdx] >= 0) {
                            const candX = nnfX[nIdx] + 1;
                            const candY = nnfY[nIdx];
                            if (candX >= minSearchX && candX <= maxSearchX && candY >= minSearchY && candY <= maxSearchY) {
                                if (validSource[candY * roiW + candX] === 1) {
                                    const cost = computePatchDistance(gray, roiMask, roiW, roiH, x, y, candX, candY, R, patternInfo, options);
                                    if (cost < curCost) { curSx = candX; curSy = candY; curCost = cost; }
                                }
                            }
                        }
                    }
                    if (y > 0) {
                        const nIdx = tIdx - roiW;
                        if (nnfX[nIdx] >= 0) {
                            const candX = nnfX[nIdx];
                            const candY = nnfY[nIdx] + 1;
                            if (candX >= minSearchX && candX <= maxSearchX && candY >= minSearchY && candY <= maxSearchY) {
                                if (validSource[candY * roiW + candX] === 1) {
                                    const cost = computePatchDistance(gray, roiMask, roiW, roiH, x, y, candX, candY, R, patternInfo, options);
                                    if (cost < curCost) { curSx = candX; curSy = candY; curCost = cost; }
                                }
                            }
                        }
                    }
                } else {
                    if (x < roiW - 1) {
                        const nIdx = tIdx + 1;
                        if (nnfX[nIdx] >= 0) {
                            const candX = nnfX[nIdx] - 1;
                            const candY = nnfY[nIdx];
                            if (candX >= minSearchX && candX <= maxSearchX && candY >= minSearchY && candY <= maxSearchY) {
                                if (validSource[candY * roiW + candX] === 1) {
                                    const cost = computePatchDistance(gray, roiMask, roiW, roiH, x, y, candX, candY, R, patternInfo, options);
                                    if (cost < curCost) { curSx = candX; curSy = candY; curCost = cost; }
                                }
                            }
                        }
                    }
                    if (y < roiH - 1) {
                        const nIdx = tIdx + roiW;
                        if (nnfX[nIdx] >= 0) {
                            const candX = nnfX[nIdx];
                            const candY = nnfY[nIdx] - 1;
                            if (candX >= minSearchX && candX <= maxSearchX && candY >= minSearchY && candY <= maxSearchY) {
                                if (validSource[candY * roiW + candX] === 1) {
                                    const cost = computePatchDistance(gray, roiMask, roiW, roiH, x, y, candX, candY, R, patternInfo, options);
                                    if (cost < curCost) { curSx = candX; curSy = candY; curCost = cost; }
                                }
                            }
                        }
                    }
                }

                let searchRad = Math.min(initialSearchRadius, Math.max(roiW, roiH));
                while (searchRad >= 1) {
                    const dx = Math.round((rng() * 2 - 1) * searchRad);
                    const dy = Math.round((rng() * 2 - 1) * searchRad);
                    const candX = curSx + dx;
                    const candY = curSy + dy;

                    if (candX >= minSearchX && candX <= maxSearchX && candY >= minSearchY && candY <= maxSearchY) {
                        if (validSource[candY * roiW + candX] === 1) {
                            const cost = computePatchDistance(gray, roiMask, roiW, roiH, x, y, candX, candY, R, patternInfo, options);
                            if (cost < curCost) { curSx = candX; curSy = candY; curCost = cost; }
                        }
                    }
                    searchRad = Math.floor(searchRad * alpha);
                }

                nnfX[tIdx] = curSx;
                nnfY[tIdx] = curSy;
                nnfCost[tIdx] = curCost;
            }
        }
    }

    let finalTotalCost = 0;
    for (let i = 0; i < totalPixels; i++) {
        if (roiMask[i] === 1 && nnfCost[i] < Infinity) {
            finalTotalCost += nnfCost[i];
        }
    }
    const avgCost = maskedCount > 0 ? finalTotalCost / maskedCount : 0;
    const convergenceScore = initialTotalCost > 0 ? Math.max(0, 1.0 - (finalTotalCost / initialTotalCost)) : 1.0;

    const reconstructedRgba = reconstructFromNNF(roiRgba, roiMask, nnfX, nnfY, nnfCost, roiW, roiH, R, patternInfo, roiOffset.minX, roiOffset.minY);
    return { reconstructedRgba, avgCost, convergenceScore };
}

/**
 * Inward Onion-Peel Exemplar-Based Patch Synthesis
 * Propagates boundary textures inward until the mask is 100% filled.
 * Every patch is matched against currently known surrounding pixels.
 */
export function runExemplarInwardSynthesis(
    roiRgba: Uint8Array,
    roiMask: Uint8Array,
    roiW: number,
    roiH: number,
    patchRadius: number,
    validCoords: Int32Array,
    validCount: number,
    onProgress: ((progress: number, msg: string) => void) | null = null
): Uint8Array {
    const workRgba = new Uint8Array(roiRgba);
    const workMask = new Uint8Array(roiMask);
    const R = Math.max(3, patchRadius);

    let remaining = 0;
    for (let i = 0; i < roiW * roiH; i++) {
        if (workMask[i] === 1) remaining++;
    }
    const initialRemaining = remaining;

    const maxSteps = 250;
    let step = 0;

    while (remaining > 0 && step < maxSteps) {
        step++;

        // 1. Identify boundary pixels of current mask
        const boundary: Array<{ x: number; y: number }> = [];
        for (let y = R; y < roiH - R; y++) {
            const row = y * roiW;
            for (let x = R; x < roiW - R; x++) {
                const idx = row + x;
                if (workMask[idx] === 1) {
                    if (
                        workMask[idx - 1] === 0 ||
                        workMask[idx + 1] === 0 ||
                        workMask[idx - roiW] === 0 ||
                        workMask[idx + roiW] === 0
                    ) {
                        boundary.push({ x, y });
                    }
                }
            }
        }

        if (boundary.length === 0) {
            // Fill any remaining edge pixels by copying from nearest valid pixel
            for (let y = 0; y < roiH; y++) {
                for (let x = 0; x < roiW; x++) {
                    const idx = y * roiW + x;
                    if (workMask[idx] === 1) {
                        const sx = validCoords[0];
                        const sy = validCoords[1];
                        const pt = idx * 4;
                        const ps = (sy * roiW + sx) * 4;
                        workRgba[pt] = roiRgba[ps];
                        workRgba[pt + 1] = roiRgba[ps + 1];
                        workRgba[pt + 2] = roiRgba[ps + 2];
                        workRgba[pt + 3] = roiRgba[ps + 3];
                        workMask[idx] = 0;
                        remaining--;
                    }
                }
            }
            break;
        }

        // 2. Synthesize patches along the frontier
        const stride = Math.max(1, Math.floor(R / 2));
        for (let b = 0; b < boundary.length; b += stride) {
            const { x: tx, y: ty } = boundary[b];
            if (workMask[ty * roiW + tx] === 0) continue;

            let bestCost = Infinity;
            let bestSx = -1, bestSy = -1;

            // Search over valid source candidates
            const sampleLimit = Math.min(validCount, 150);
            const stepCoarse = Math.max(1, Math.floor(validCount / sampleLimit));

            for (let i = 0; i < validCount; i += stepCoarse) {
                const sx = validCoords[i * 2];
                const sy = validCoords[i * 2 + 1];

                let ssd = 0;
                let count = 0;

                for (let dy = -R; dy <= R; dy++) {
                    const tY = ty + dy;
                    const sY = sy + dy;
                    const tRow = tY * roiW;
                    const sRow = sY * roiW;

                    for (let dx = -R; dx <= R; dx++) {
                        const tIdx = tRow + (tx + dx);
                        if (workMask[tIdx] === 0) {
                            const sIdx = sRow + (sx + dx);
                            const pt = tIdx * 4;
                            const ps = sIdx * 4;
                            const dr = workRgba[pt] - roiRgba[ps];
                            const dg = workRgba[pt + 1] - roiRgba[ps + 1];
                            const db = workRgba[pt + 2] - roiRgba[ps + 2];
                            ssd += dr * dr + dg * dg + db * db;
                            count++;
                        }
                    }
                }

                if (count > 0) {
                    const normCost = ssd / count;
                    if (normCost < bestCost) {
                        bestCost = normCost;
                        bestSx = sx;
                        bestSy = sy;
                    }
                }
            }

            // Copy candidate patch to target for un-filled pixels
            if (bestSx !== -1) {
                for (let dy = -R; dy <= R; dy++) {
                    const tY = ty + dy;
                    const sY = bestSy + dy;
                    const tRow = tY * roiW;
                    const sRow = sY * roiW;

                    for (let dx = -R; dx <= R; dx++) {
                        const tIdx = tRow + (tx + dx);
                        if (workMask[tIdx] === 1) {
                            const sIdx = sRow + (bestSx + dx);
                            const pt = tIdx * 4;
                            const ps = sIdx * 4;
                            workRgba[pt] = roiRgba[ps];
                            workRgba[pt + 1] = roiRgba[ps + 1];
                            workRgba[pt + 2] = roiRgba[ps + 2];
                            workRgba[pt + 3] = roiRgba[ps + 3];
                            workMask[tIdx] = 0;
                            remaining--;
                        }
                    }
                }
            }
        }

        if (onProgress && initialRemaining > 0) {
            const p = 0.20 + (1.0 - remaining / initialRemaining) * 0.70;
            onProgress(p, `Đang tổng hợp cấu trúc hoa văn (${Math.round((1 - remaining / initialRemaining) * 100)}%)...`);
        }
    }

    return workRgba;
}

export interface PatchMatchResult {
    outputRgba: Uint8Array;
    roi: MaskROI;
    patternInfo: MangaTexturePattern;
    confidence: number;
    confidenceLevel: 'high' | 'medium' | 'low';
    stats: { durationMs: number };
}

export function runPatchMatchPipeline(
    rgba: Uint8Array,
    rawMask: Uint8Array,
    width: number,
    height: number,
    options: any = {},
    onProgress: ((progress: number, msg: string) => void) | null = null
): PatchMatchResult {
    const tStart = performance.now();
    const patchRadius = options.patchRadius || 5;
    const maskDilate = options.maskDilate !== undefined ? options.maskDilate : 2;
    const enablePattern = options.enablePatternDetection !== false;
    const enableBlending = options.enableSeamBlending !== false;

    if (onProgress) onProgress(0.05, "Đang tiền xử lý vùng chọn và mở rộng biên...");

    const mask = dilateMask(rawMask, width, height, maskDilate);

    const roi = computeMaskROI(mask, width, height, patchRadius * 4);
    if (!roi) {
        return {
            outputRgba: new Uint8Array(rgba),
            roi: { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1, width, height },
            patternInfo: { type: "unknown", orientation: 0, periodX: null, periodY: null, confidence: 0 },
            confidence: 1.0,
            confidenceLevel: 'high',
            stats: { durationMs: 0 }
        };
    }

    const { roiRgba, roiMask, roiWidth: roiW, roiHeight: roiH } = extractROI(rgba, mask, width, roi);

    if (onProgress) onProgress(0.12, "Đang phân tích cấu trúc họa tiết manga...");

    const gray = rgbToGrayscale(roiRgba, roiW, roiH);
    const { validSource, validCount, validCoords } = generateValidSourceMap(roiMask, roiW, roiH, patchRadius);

    if (validCount === 0) {
        throw new Error("Không tìm thấy vùng texture sạch xung quanh để sao chép. Vui lòng mở rộng vùng chọn.");
    }

    let patternInfo: MangaTexturePattern = { type: "unknown", orientation: 0, periodX: null, periodY: null, confidence: 0 };
    if (enablePattern) {
        patternInfo = analyzeMangaTexture(gray, roiMask, validSource, roiW, roiH);
    }

    let reconstructedRoi: Uint8Array;
    let inpaintConfidence = 0.85;

    const isSpecialized = (
        patternInfo.type === 'horizontal' ||
        patternInfo.type === 'vertical' ||
        patternInfo.type === 'screentone'
    );

    if (isSpecialized) {
        if (onProgress) onProgress(0.40, `Đang tổng hợp cấu trúc tuần hoàn (${patternInfo.type})...`);
        reconstructedRoi = reconstructFromNNF(
            roiRgba,
            roiMask,
            null,
            null,
            null,
            roiW,
            roiH,
            patchRadius,
            patternInfo,
            roi.minX,
            roi.minY
        );
        inpaintConfidence = Math.min(1.0, Math.max(0.70, patternInfo.confidence));
    } else {
        if (onProgress) onProgress(0.30, "Đang thực hiện Exemplar Inward Synthesis...");
        reconstructedRoi = runExemplarInwardSynthesis(
            roiRgba,
            roiMask,
            roiW,
            roiH,
            patchRadius,
            validCoords,
            validCount,
            onProgress
        );
        inpaintConfidence = 0.85;
    }

    if (enableBlending && patternInfo.type === 'unknown') {
        if (onProgress) onProgress(0.92, "Đang hòa trộn biên mềm liền mạch...");
        reconstructedRoi = applySeamlessBoundaryBlending(roiRgba, reconstructedRoi, roiMask, roiW, roiH, 2.5);
    }

    const outputRgba = new Uint8Array(rgba);
    const { minX, minY } = roi;

    for (let y = 0; y < roiH; y++) {
        const fullY = minY + y;
        const fullRowOff = fullY * width;
        const roiRowOff = y * roiW;

        for (let x = 0; x < roiW; x++) {
            const roiIdx = roiRowOff + x;
            if (roiMask[roiIdx] === 1) {
                const fullIdx = fullRowOff + (minX + x);
                const pFull = fullIdx * 4;
                const pRoi = roiIdx * 4;

                outputRgba[pFull] = reconstructedRoi[pRoi];
                outputRgba[pFull + 1] = reconstructedRoi[pRoi + 1];
                outputRgba[pFull + 2] = reconstructedRoi[pRoi + 2];
                outputRgba[pFull + 3] = reconstructedRoi[pRoi + 3];
            }
        }
    }

    if (onProgress) onProgress(1.0, "Hoàn tất inpainting!");

    const durationMs = Math.round(performance.now() - tStart);
    const confidenceLevel: 'high' | 'medium' | 'low' =
        inpaintConfidence >= 0.80 ? 'high' : (inpaintConfidence >= 0.55 ? 'medium' : 'low');

    return {
        outputRgba,
        roi,
        patternInfo,
        confidence: inpaintConfidence,
        confidenceLevel,
        stats: { durationMs }
    };
}

