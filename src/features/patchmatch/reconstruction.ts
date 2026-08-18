/**
 * reconstruction.js - Pattern-Aware Discrete Synthesis & Winner-Take-All Patch Reconstruction
 * Guarantees 0% Grey Mud / Blurring on Manga Halftone Dots & Stripe Screentones
 */

export function reconstructFromNNF(
    originalRgba: Uint8Array,
    mask: Uint8Array,
    nnfX: Int32Array | null,
    nnfY: Int32Array | null,
    nnfCost: Float32Array | null,
    width: number,
    height: number,
    patchRadius: number,
    patternInfo: any = null,
    offsetX: number = 0,
    offsetY: number = 0
): Uint8Array {
    const outputRgba = new Uint8Array(originalRgba);

    // CASE 1: HORIZONTAL STRIPES
    if (patternInfo && patternInfo.type === 'horizontal') {
        for (let y = 0; y < height; y++) {
            const rowOff = y * width;
            let leftValid = -1, rightValid = -1;

            for (let x = 0; x < width; x++) {
                if (mask[rowOff + x] === 0) {
                    leftValid = rowOff + x;
                    break;
                }
            }
            for (let x = width - 1; x >= 0; x--) {
                if (mask[rowOff + x] === 0) {
                    rightValid = rowOff + x;
                    break;
                }
            }

            const srcIdx = leftValid !== -1 ? leftValid : rightValid;
            if (srcIdx !== -1) {
                const pSrc = srcIdx * 4;
                for (let x = 0; x < width; x++) {
                    const idx = rowOff + x;
                    if (mask[idx] === 1) {
                        const p = idx * 4;
                        outputRgba[p] = originalRgba[pSrc];
                        outputRgba[p + 1] = originalRgba[pSrc + 1];
                        outputRgba[p + 2] = originalRgba[pSrc + 2];
                        outputRgba[p + 3] = originalRgba[pSrc + 3];
                    }
                }
            }
        }
        return outputRgba;
    }

    // CASE 2: VERTICAL STRIPES
    if (patternInfo && patternInfo.type === 'vertical') {
        for (let x = 0; x < width; x++) {
            let topValid = -1, bottomValid = -1;

            for (let y = 0; y < height; y++) {
                if (mask[y * width + x] === 0) {
                    topValid = y * width + x;
                    break;
                }
            }
            for (let y = height - 1; y >= 0; y--) {
                if (mask[y * width + x] === 0) {
                    bottomValid = y * width + x;
                    break;
                }
            }

            const srcIdx = topValid !== -1 ? topValid : bottomValid;
            if (srcIdx !== -1) {
                const pSrc = srcIdx * 4;
                for (let y = 0; y < height; y++) {
                    const idx = y * width + x;
                    if (mask[idx] === 1) {
                        const p = idx * 4;
                        outputRgba[p] = originalRgba[pSrc];
                        outputRgba[p + 1] = originalRgba[pSrc + 1];
                        outputRgba[p + 2] = originalRgba[pSrc + 2];
                        outputRgba[p + 3] = originalRgba[pSrc + 3];
                    }
                }
            }
        }
        return outputRgba;
    }

    // CASE 3: 45° HALFTONE SCREENTONE DOT MATRIX
    if (patternInfo && patternInfo.type === 'screentone' && patternInfo.periodX) {
        const P = patternInfo.periodX;

        const phaseSums = Array.from({ length: P }, () => Array.from({ length: P }, () => ({ r: 0, g: 0, b: 0, a: 0, count: 0 })));
        let firstCleanIdx = -1;

        for (let y = 0; y < height; y++) {
            const gx = offsetX;
            const gy = offsetY + y;
            const rowOff = y * width;
            for (let x = 0; x < width; x++) {
                const idx = rowOff + x;
                if (mask[idx] === 0) {
                    if (firstCleanIdx === -1) firstCleanIdx = idx;
                    const curGx = gx + x;
                    const u = (((curGx + gy) % P) + P) % P;
                    const v = (((curGx - gy) % P) + P) % P;
                    const p = idx * 4;
                    phaseSums[u][v].r += originalRgba[p];
                    phaseSums[u][v].g += originalRgba[p + 1];
                    phaseSums[u][v].b += originalRgba[p + 2];
                    phaseSums[u][v].a += originalRgba[p + 3];
                    phaseSums[u][v].count++;
                }
            }
        }

        const phaseMap: Array<Array<{ r: number; g: number; b: number; a: number } | null>> = Array.from({ length: P }, () => Array.from({ length: P }, () => null));
        for (let u = 0; u < P; u++) {
            for (let v = 0; v < P; v++) {
                if (phaseSums[u][v].count > 0) {
                    phaseMap[u][v] = {
                        r: Math.round(phaseSums[u][v].r / phaseSums[u][v].count),
                        g: Math.round(phaseSums[u][v].g / phaseSums[u][v].count),
                        b: Math.round(phaseSums[u][v].b / phaseSums[u][v].count),
                        a: Math.round(phaseSums[u][v].a / phaseSums[u][v].count)
                    };
                }
            }
        }

        const defaultSample = firstCleanIdx !== -1
            ? { r: originalRgba[firstCleanIdx * 4], g: originalRgba[firstCleanIdx * 4 + 1], b: originalRgba[firstCleanIdx * 4 + 2], a: 255 }
            : { r: 255, g: 255, b: 255, a: 255 };

        for (let u = 0; u < P; u++) {
            for (let v = 0; v < P; v++) {
                if (!phaseMap[u][v]) phaseMap[u][v] = defaultSample;
            }
        }

        for (let y = 0; y < height; y++) {
            const gy = offsetY + y;
            const rowOff = y * width;
            for (let x = 0; x < width; x++) {
                const idx = rowOff + x;
                if (mask[idx] === 1) {
                    const gx = offsetX + x;
                    const u = (((gx + gy) % P) + P) % P;
                    const v = (((gx - gy) % P) + P) % P;
                    const sample = phaseMap[u][v]!;
                    const p = idx * 4;
                    outputRgba[p] = sample.r;
                    outputRgba[p + 1] = sample.g;
                    outputRgba[p + 2] = sample.b;
                    outputRgba[p + 3] = sample.a;
                }
            }
        }
        return outputRgba;
    }

    // CASE 4: GENERAL / ORGANIC TEXTURE
    const total = width * height;
    const bestDist = new Float32Array(total).fill(999999.0);
    const bestSourceIdx = new Int32Array(total).fill(-1);

    const r = patchRadius;

    if (nnfX && nnfY && nnfCost) {
        for (let ty = r; ty < height - r; ty++) {
            const tRow = ty * width;
            for (let tx = r; tx < width - r; tx++) {
                const tIdx = tRow + tx;

                if (mask[tIdx] === 1 && nnfX[tIdx] >= 0) {
                    const sx = nnfX[tIdx];
                    const sy = nnfY[tIdx];
                    const cost = nnfCost[tIdx];

                    for (let dy = -r; dy <= r; dy++) {
                        const destY = ty + dy;
                        const srcY = sy + dy;
                        const destRow = destY * width;
                        const srcRow = srcY * width;

                        for (let dx = -r; dx <= r; dx++) {
                            const destX = tx + dx;
                            const destIdx = destRow + destX;

                            if (mask[destIdx] === 1) {
                                const distToCenter = dx * dx + dy * dy;
                                const totalScore = cost * 10.0 + distToCenter;

                                if (totalScore < bestDist[destIdx]) {
                                    bestDist[destIdx] = totalScore;
                                    bestSourceIdx[destIdx] = srcRow + (sx + dx);
                                }
                            }
                        }
                    }
                }
            }
        }

        for (let i = 0; i < total; i++) {
            if (mask[i] === 1) {
                const sIdx = bestSourceIdx[i];
                const p = i * 4;
                if (sIdx >= 0) {
                    const pSrc = sIdx * 4;
                    outputRgba[p] = originalRgba[pSrc];
                    outputRgba[p + 1] = originalRgba[pSrc + 1];
                    outputRgba[p + 2] = originalRgba[pSrc + 2];
                    outputRgba[p + 3] = originalRgba[pSrc + 3];
                }
            }
        }
    }

    return outputRgba;
}
