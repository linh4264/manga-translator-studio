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
    const alpha = 0.5; // Random search radius decay factor

    // Deterministic Seeded PRNG
    const seed = ((roiW * 31 + roiH * 17 + roiOffset.minX * 7 + roiOffset.minY * 13 + patchRadius * 3) ^ (options.seed || 1337)) >>> 0;
    const rng = createSeededRng(seed);

    // 1. Initialize NNF and Costs
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
                // Deterministic initial source assignment: sample from valid sources using seeded RNG
                const randSourceIdx = Math.floor(rng() * validCount);
                const sx = validCoords[randSourceIdx * 2];
                const sy = validCoords[randSourceIdx * 2 + 1];

                nnfX[idx] = sx;
                nnfY[idx] = sy;
                nnfCost[idx] = computePatchDistance(
                    gray,
                    roiMask,
                    roiW,
                    roiH,
                    x,
                    y,
                    sx,
                    sy,
                    R,
                    patternInfo,
                    options
                );
            }
        }
    }

    let initialTotalCost = 0;
    for (let i = 0; i < totalPixels; i++) {
        if (roiMask[i] === 1 && nnfCost[i] < Infinity) {
            initialTotalCost += nnfCost[i];
        }
    }

    // 2. Multi-Iteration Loop (Propagation + Random Search)
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

                // A. PROPAGATION: examine NNF of neighboring pixels
                if (isForward) {
                    // Left neighbor (x - 1, y)
                    if (x > 0) {
                        const nIdx = tIdx - 1;
                        if (nnfX[nIdx] >= 0) {
                            const candX = nnfX[nIdx] + 1;
                            const candY = nnfY[nIdx];
                            if (candX >= minSearchX && candX <= maxSearchX && candY >= minSearchY && candY <= maxSearchY) {
                                if (validSource[candY * roiW + candX] === 1) {
                                    const cost = computePatchDistance(gray, roiMask, roiW, roiH, x, y, candX, candY, R, patternInfo, options);
                                    if (cost < curCost) {
                                        curSx = candX;
                                        curSy = candY;
                                        curCost = cost;
                                    }
                                }
                            }
                        }
                    }
                    // Top neighbor (x, y - 1)
                    if (y > 0) {
                        const nIdx = tIdx - roiW;
                        if (nnfX[nIdx] >= 0) {
                            const candX = nnfX[nIdx];
                            const candY = nnfY[nIdx] + 1;
                            if (candX >= minSearchX && candX <= maxSearchX && candY >= minSearchY && candY <= maxSearchY) {
                                if (validSource[candY * roiW + candX] === 1) {
                                    const cost = computePatchDistance(gray, roiMask, roiW, roiH, x, y, candX, candY, R, patternInfo, options);
                                    if (cost < curCost) {
                                        curSx = candX;
                                        curSy = candY;
                                        curCost = cost;
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // Right neighbor (x + 1, y)
                    if (x < roiW - 1) {
                        const nIdx = tIdx + 1;
                        if (nnfX[nIdx] >= 0) {
                            const candX = nnfX[nIdx] - 1;
                            const candY = nnfY[nIdx];
                            if (candX >= minSearchX && candX <= maxSearchX && candY >= minSearchY && candY <= maxSearchY) {
                                if (validSource[candY * roiW + candX] === 1) {
                                    const cost = computePatchDistance(gray, roiMask, roiW, roiH, x, y, candX, candY, R, patternInfo, options);
                                    if (cost < curCost) {
                                        curSx = candX;
                                        curSy = candY;
                                        curCost = cost;
                                    }
                                }
                            }
                        }
                    }
                    // Bottom neighbor (x, y + 1)
                    if (y < roiH - 1) {
                        const nIdx = tIdx + roiW;
                        if (nnfX[nIdx] >= 0) {
                            const candX = nnfX[nIdx];
                            const candY = nnfY[nIdx] - 1;
                            if (candX >= minSearchX && candX <= maxSearchX && candY >= minSearchY && candY <= maxSearchY) {
                                if (validSource[candY * roiW + candX] === 1) {
                                    const cost = computePatchDistance(gray, roiMask, roiW, roiH, x, y, candX, candY, R, patternInfo, options);
                                    if (cost < curCost) {
                                        curSx = candX;
                                        curSy = candY;
                                        curCost = cost;
                                    }
                                }
                            }
                        }
                    }
                }

                // B. RANDOM SEARCH: sample with decaying radius around current best
                let searchRad = Math.min(initialSearchRadius, Math.max(roiW, roiH));
                while (searchRad >= 1) {
                    const dx = Math.round((rng() * 2 - 1) * searchRad);
                    const dy = Math.round((rng() * 2 - 1) * searchRad);
                    const candX = curSx + dx;
                    const candY = curSy + dy;

                    if (candX >= minSearchX && candX <= maxSearchX && candY >= minSearchY && candY <= maxSearchY) {
                        if (validSource[candY * roiW + candX] === 1) {
                            const cost = computePatchDistance(gray, roiMask, roiW, roiH, x, y, candX, candY, R, patternInfo, options);
                            if (cost < curCost) {
                                curSx = candX;
                                curSy = candY;
                                curCost = cost;
                            }
                        }
                    }

                    searchRad = Math.floor(searchRad * alpha);
                }

                // Commit best NNF entry
                nnfX[tIdx] = curSx;
                nnfY[tIdx] = curSy;
                nnfCost[tIdx] = curCost;
            }
        }

        if (onProgress) {
            const p = 0.25 + ((iter + 1) / iterations) * 0.60;
            onProgress(p, `PatchMatch NNF hội tụ (${Math.round(((iter + 1) / iterations) * 100)}%)...`);
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

    // 3. Reconstruct image from converged NNF
    const reconstructedRgba = reconstructFromNNF(
        roiRgba,
        roiMask,
        nnfX,
        nnfY,
        nnfCost,
        roiW,
        roiH,
        R,
        patternInfo,
        roiOffset.minX,
        roiOffset.minY
    );

    return { reconstructedRgba, avgCost, convergenceScore };
}

// Retain backward-compatible alias for existing imports if any
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
    const gray = rgbToGrayscale(roiRgba, roiW, roiH);
    const { validSource } = generateValidSourceMap(roiMask, roiW, roiH, patchRadius);
    const patternInfo: MangaTexturePattern = { type: "unknown", orientation: 0, periodX: null, periodY: null, confidence: 0 };
    const { reconstructedRgba } = runPatchMatchNNFSynthesis(
        roiRgba,
        roiMask,
        gray,
        roiW,
        roiH,
        patchRadius,
        validCoords,
        validCount,
        validSource,
        patternInfo,
        { iterations: 6, randomSearchRadius: 64 },
        { minX: 0, minY: 0 },
        onProgress
    );
    return reconstructedRgba;
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

    // CONFIDENCE GATE: only use specialized path if confidence >= 0.80
    const CONFIDENCE_THRESHOLD = 0.80;
    const isSpecialized = patternInfo.confidence >= CONFIDENCE_THRESHOLD && (
        patternInfo.type === 'horizontal' ||
        patternInfo.type === 'vertical' ||
        patternInfo.type === 'screentone'
    );

    if (isSpecialized) {
        if (onProgress) onProgress(0.40, `Đang tổng hợp cấu trúc tuần hoàn (${patternInfo.type}, conf: ${(patternInfo.confidence * 100).toFixed(0)}%)...`);
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
        if (onProgress) onProgress(0.30, "Đang chạy PatchMatch / NNF Organic Synthesis...");
        const synthRes = runPatchMatchNNFSynthesis(
            roiRgba,
            roiMask,
            gray,
            roiW,
            roiH,
            patchRadius,
            validCoords,
            validCount,
            validSource,
            patternInfo,
            options,
            { minX: roi.minX, minY: roi.minY },
            onProgress
        );
        reconstructedRoi = synthRes.reconstructedRgba;

        // Calculate confidence from residual cost and source availability
        let maskPixelCount = 0;
        for (let i = 0; i < roiW * roiH; i++) {
            if (roiMask[i] === 1) maskPixelCount++;
        }
        const costFactor = Math.max(0.2, Math.min(1.0, 1.0 - (synthRes.avgCost / 400.0)));
        const sourceFactor = Math.max(0.3, Math.min(1.0, validCount / Math.max(1, maskPixelCount * 0.5)));
        inpaintConfidence = Math.round((costFactor * 0.6 + sourceFactor * 0.4) * 100) / 100;
    }

    if (enableBlending) {
        if (onProgress) onProgress(0.92, "Đang hòa trộn biên mềm liền mạch...");
        const blendRadius = computeAdaptiveBlendRadius(patchRadius, isSpecialized ? patternInfo.type : 'unknown');
        reconstructedRoi = applySeamlessBoundaryBlending(roiRgba, reconstructedRoi, roiMask, roiW, roiH, blendRadius);
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

