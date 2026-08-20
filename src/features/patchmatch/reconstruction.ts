/**
 * reconstruction.ts - Pattern-Aware Discrete Synthesis & Winner-Take-All Patch Reconstruction
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

    // CASE 1: HORIZONTAL STRIPES (Direct Continuous Row-Wise Extension & Gradient Interpolation)
    if (patternInfo && patternInfo.type === 'horizontal') {
        const Py = patternInfo.periodY || 4;

        for (let y = 0; y < height; y++) {
            const rowOff = y * width;
            let spanStart = -1;

            for (let x = 0; x <= width; x++) {
                const isMasked = x < width && mask[rowOff + x] === 1;

                if (isMasked && spanStart === -1) {
                    spanStart = x;
                } else if (!isMasked && spanStart !== -1) {
                    const spanEnd = x - 1;

                    // Clean pixels immediately adjacent on row y
                    const leftX = spanStart > 0 ? spanStart - 1 : -1;
                    const rightX = spanEnd < width - 1 ? spanEnd + 1 : -1;

                    if (leftX >= 0 && rightX >= 0) {
                        const pL = (rowOff + leftX) * 4;
                        const pR = (rowOff + rightX) * 4;
                        const rL = originalRgba[pL], gL = originalRgba[pL + 1], bL = originalRgba[pL + 2], aL = originalRgba[pL + 3];
                        const rR = originalRgba[pR], gR = originalRgba[pR + 1], bR = originalRgba[pR + 2], aR = originalRgba[pR + 3];

                        for (let sx = spanStart; sx <= spanEnd; sx++) {
                            const t = (sx - leftX) / (rightX - leftX);
                            const p = (rowOff + sx) * 4;
                            outputRgba[p] = Math.round(rL * (1 - t) + rR * t);
                            outputRgba[p + 1] = Math.round(gL * (1 - t) + gR * t);
                            outputRgba[p + 2] = Math.round(bL * (1 - t) + bR * t);
                            outputRgba[p + 3] = Math.round(aL * (1 - t) + aR * t);
                        }
                    } else if (leftX >= 0) {
                        const pL = (rowOff + leftX) * 4;
                        for (let sx = spanStart; sx <= spanEnd; sx++) {
                            const p = (rowOff + sx) * 4;
                            outputRgba[p] = originalRgba[pL];
                            outputRgba[p + 1] = originalRgba[pL + 1];
                            outputRgba[p + 2] = originalRgba[pL + 2];
                            outputRgba[p + 3] = originalRgba[pL + 3];
                        }
                    } else if (rightX >= 0) {
                        const pR = (rowOff + rightX) * 4;
                        for (let sx = spanStart; sx <= spanEnd; sx++) {
                            const p = (rowOff + sx) * 4;
                            outputRgba[p] = originalRgba[pR];
                            outputRgba[p + 1] = originalRgba[pR + 1];
                            outputRgba[p + 2] = originalRgba[pR + 2];
                            outputRgba[p + 3] = originalRgba[pR + 3];
                        }
                    } else {
                        // Entire row is masked: find nearest row with same phase (y ± k * Py)
                        let srcRow = -1;
                        for (let k = 1; k < height; k++) {
                            const upY = y - k * Py;
                            const downY = y + k * Py;
                            if (upY >= 0 && mask[upY * width + (width >> 1)] === 0) { srcRow = upY; break; }
                            if (downY < height && mask[downY * width + (width >> 1)] === 0) { srcRow = downY; break; }
                        }
                        if (srcRow >= 0) {
                            for (let sx = spanStart; sx <= spanEnd; sx++) {
                                const p = (rowOff + sx) * 4;
                                const pSrc = (srcRow * width + sx) * 4;
                                outputRgba[p] = originalRgba[pSrc];
                                outputRgba[p + 1] = originalRgba[pSrc + 1];
                                outputRgba[p + 2] = originalRgba[pSrc + 2];
                                outputRgba[p + 3] = originalRgba[pSrc + 3];
                            }
                        }
                    }

                    spanStart = -1;
                }
            }
        }
        return outputRgba;
    }

    // CASE 2: VERTICAL STRIPES (Direct Continuous Column-Wise Extension & Gradient Interpolation)
    if (patternInfo && patternInfo.type === 'vertical') {
        const Px = patternInfo.periodX || 4;

        for (let x = 0; x < width; x++) {
            let spanStart = -1;

            for (let y = 0; y <= height; y++) {
                const isMasked = y < height && mask[y * width + x] === 1;

                if (isMasked && spanStart === -1) {
                    spanStart = y;
                } else if (!isMasked && spanStart !== -1) {
                    const spanEnd = y - 1;

                    const topY = spanStart > 0 ? spanStart - 1 : -1;
                    const bottomY = spanEnd < height - 1 ? spanEnd + 1 : -1;

                    if (topY >= 0 && bottomY >= 0) {
                        const pT = (topY * width + x) * 4;
                        const pB = (bottomY * width + x) * 4;
                        const rT = originalRgba[pT], gT = originalRgba[pT + 1], bT = originalRgba[pT + 2], aT = originalRgba[pT + 3];
                        const rB = originalRgba[pB], gB = originalRgba[pB + 1], bB = originalRgba[pB + 2], aB = originalRgba[pB + 3];

                        for (let sy = spanStart; sy <= spanEnd; sy++) {
                            const t = (sy - topY) / (bottomY - topY);
                            const p = (sy * width + x) * 4;
                            outputRgba[p] = Math.round(rT * (1 - t) + rB * t);
                            outputRgba[p + 1] = Math.round(gT * (1 - t) + gB * t);
                            outputRgba[p + 2] = Math.round(bT * (1 - t) + bB * t);
                            outputRgba[p + 3] = Math.round(aT * (1 - t) + aB * t);
                        }
                    } else if (topY >= 0) {
                        const pT = (topY * width + x) * 4;
                        for (let sy = spanStart; sy <= spanEnd; sy++) {
                            const p = (sy * width + x) * 4;
                            outputRgba[p] = originalRgba[pT];
                            outputRgba[p + 1] = originalRgba[pT + 1];
                            outputRgba[p + 2] = originalRgba[pT + 2];
                            outputRgba[p + 3] = originalRgba[pT + 3];
                        }
                    } else if (bottomY >= 0) {
                        const pB = (bottomY * width + x) * 4;
                        for (let sy = spanStart; sy <= spanEnd; sy++) {
                            const p = (sy * width + x) * 4;
                            outputRgba[p] = originalRgba[pB];
                            outputRgba[p + 1] = originalRgba[pB + 1];
                            outputRgba[p + 2] = originalRgba[pB + 2];
                            outputRgba[p + 3] = originalRgba[pB + 3];
                        }
                    } else {
                        let srcCol = -1;
                        for (let k = 1; k < width; k++) {
                            const leftCol = x - k * Px;
                            const rightCol = x + k * Px;
                            if (leftCol >= 0 && mask[(height >> 1) * width + leftCol] === 0) { srcCol = leftCol; break; }
                            if (rightCol < width && mask[(height >> 1) * width + rightCol] === 0) { srcCol = rightCol; break; }
                        }
                        if (srcCol >= 0) {
                            for (let sy = spanStart; sy <= spanEnd; sy++) {
                                const p = (sy * width + x) * 4;
                                const pSrc = (sy * width + srcCol) * 4;
                                outputRgba[p] = originalRgba[pSrc];
                                outputRgba[p + 1] = originalRgba[pSrc + 1];
                                outputRgba[p + 2] = originalRgba[pSrc + 2];
                                outputRgba[p + 3] = originalRgba[pSrc + 3];
                            }
                        }
                    }

                    spanStart = -1;
                }
            }
        }
        return outputRgba;
    }

    // CASE 3: 45° HALFTONE SCREENTONE DOT MATRIX (Robust Median Phase Model)
    if (patternInfo && patternInfo.type === 'screentone' && patternInfo.periodX) {
        const P = patternInfo.periodX;

        const binR: number[][] = Array.from({ length: P * P }, () => []);
        const binG: number[][] = Array.from({ length: P * P }, () => []);
        const binB: number[][] = Array.from({ length: P * P }, () => []);
        const binA: number[][] = Array.from({ length: P * P }, () => []);

        for (let y = 0; y < height; y++) {
            const gy = offsetY + y;
            const rowOff = y * width;
            for (let x = 0; x < width; x++) {
                const idx = rowOff + x;
                if (mask[idx] === 0) {
                    const gx = offsetX + x;
                    const u = (((gx + gy) % P) + P) % P;
                    const v = (((gx - gy) % P) + P) % P;
                    const b = u * P + v;
                    const p = idx * 4;
                    binR[b].push(originalRgba[p]);
                    binG[b].push(originalRgba[p + 1]);
                    binB[b].push(originalRgba[p + 2]);
                    binA[b].push(originalRgba[p + 3]);
                }
            }
        }

        const phaseMap = Array.from({ length: P }, (_, u) =>
            Array.from({ length: P }, (_, v) => {
                const b = u * P + v;
                const rVals = binR[b];
                if (rVals.length > 0) {
                    rVals.sort((a, b) => a - b);
                    const gVals = binG[b].sort((a, b) => a - b);
                    const bVals = binB[b].sort((a, b) => a - b);
                    const aVals = binA[b].sort((a, b) => a - b);
                    const mid = Math.floor(rVals.length / 2);
                    return {
                        r: rVals[mid],
                        g: gVals[mid],
                        b: bVals[mid],
                        a: aVals[mid]
                    };
                }
                return { r: 255, g: 255, b: 255, a: 255 };
            })
        );

        for (let y = 0; y < height; y++) {
            const gy = offsetY + y;
            const rowOff = y * width;
            for (let x = 0; x < width; x++) {
                const idx = rowOff + x;
                if (mask[idx] === 1) {
                    const gx = offsetX + x;
                    const u = (((gx + gy) % P) + P) % P;
                    const v = (((gx - gy) % P) + P) % P;
                    const sample = phaseMap[u][v];
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

    // CASE 4: GENERAL / ORGANIC TEXTURE (Winner-Take-All from NNF)
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

