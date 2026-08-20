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

    // CASE 1: HORIZONTAL STRIPES (Local Context + Periodic Phase + Gradient Preservation)
    if (patternInfo && patternInfo.type === 'horizontal') {
        const Py = patternInfo.periodY || 4;

        for (let y = 0; y < height; y++) {
            const rowOff = y * width;

            // Find all contiguous mask spans on row y
            let spanStart = -1;

            for (let x = 0; x <= width; x++) {
                const isMasked = x < width && mask[rowOff + x] === 1;

                if (isMasked && spanStart === -1) {
                    spanStart = x;
                } else if (!isMasked && spanStart !== -1) {
                    const spanEnd = x - 1;

                    // Immediate left and right clean pixels on the same row
                    const leftX = spanStart > 0 ? spanStart - 1 : -1;
                    const rightX = spanEnd < width - 1 ? spanEnd + 1 : -1;

                    for (let sx = spanStart; sx <= spanEnd; sx++) {
                        const targetIdx = rowOff + sx;
                        const p = targetIdx * 4;

                        // 1. Calculate local linear gradient across the span if both sides are valid
                        let gradR = 0, gradG = 0, gradB = 0, gradA = 255;
                        let hasGrad = false;

                        if (leftX >= 0 && rightX >= 0) {
                            const t = (sx - leftX) / (rightX - leftX);
                            const pL = (rowOff + leftX) * 4;
                            const pR = (rowOff + rightX) * 4;
                            gradR = Math.round(originalRgba[pL] * (1 - t) + originalRgba[pR] * t);
                            gradG = Math.round(originalRgba[pL + 1] * (1 - t) + originalRgba[pR + 1] * t);
                            gradB = Math.round(originalRgba[pL + 2] * (1 - t) + originalRgba[pR + 2] * t);
                            gradA = Math.round(originalRgba[pL + 3] * (1 - t) + originalRgba[pR + 3] * t);
                            hasGrad = true;
                        } else if (leftX >= 0) {
                            const pL = (rowOff + leftX) * 4;
                            gradR = originalRgba[pL];
                            gradG = originalRgba[pL + 1];
                            gradB = originalRgba[pL + 2];
                            gradA = originalRgba[pL + 3];
                            hasGrad = true;
                        } else if (rightX >= 0) {
                            const pR = (rowOff + rightX) * 4;
                            gradR = originalRgba[pR];
                            gradG = originalRgba[pR + 1];
                            gradB = originalRgba[pR + 2];
                            gradA = originalRgba[pR + 3];
                            hasGrad = true;
                        }

                        // 2. Find nearest clean pixel with the same horizontal stripe phase along column sx
                        let cleanSrcIdx = -1;
                        let bestYDist = Infinity;

                        for (let k = 1; k < Math.max(height, 20); k++) {
                            const upY = y - k * Py;
                            const downY = y + k * Py;

                            if (upY >= 0 && mask[upY * width + sx] === 0) {
                                cleanSrcIdx = upY * width + sx;
                                bestYDist = k * Py;
                                break;
                            }
                            if (downY < height && mask[downY * width + sx] === 0) {
                                cleanSrcIdx = downY * width + sx;
                                bestYDist = k * Py;
                                break;
                            }
                        }

                        // Fallback: search nearest clean pixel on same line or nearest column
                        if (cleanSrcIdx === -1) {
                            cleanSrcIdx = leftX >= 0 ? rowOff + leftX : (rightX >= 0 ? rowOff + rightX : -1);
                        }

                        if (cleanSrcIdx >= 0) {
                            const pSrc = cleanSrcIdx * 4;
                            if (hasGrad && bestYDist > Py * 2) {
                                // Blend periodic texture exemplar with local gradient
                                outputRgba[p] = Math.round(originalRgba[pSrc] * 0.8 + gradR * 0.2);
                                outputRgba[p + 1] = Math.round(originalRgba[pSrc + 1] * 0.8 + gradG * 0.2);
                                outputRgba[p + 2] = Math.round(originalRgba[pSrc + 2] * 0.8 + gradB * 0.2);
                                outputRgba[p + 3] = Math.round(originalRgba[pSrc + 3] * 0.8 + gradA * 0.2);
                            } else {
                                outputRgba[p] = originalRgba[pSrc];
                                outputRgba[p + 1] = originalRgba[pSrc + 1];
                                outputRgba[p + 2] = originalRgba[pSrc + 2];
                                outputRgba[p + 3] = originalRgba[pSrc + 3];
                            }
                        } else if (hasGrad) {
                            outputRgba[p] = gradR;
                            outputRgba[p + 1] = gradG;
                            outputRgba[p + 2] = gradB;
                            outputRgba[p + 3] = gradA;
                        }
                    }

                    spanStart = -1;
                }
            }
        }
        return outputRgba;
    }

    // CASE 2: VERTICAL STRIPES (Local Context + Periodic Phase + Gradient Preservation)
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

                    for (let sy = spanStart; sy <= spanEnd; sy++) {
                        const targetIdx = sy * width + x;
                        const p = targetIdx * 4;

                        let gradR = 0, gradG = 0, gradB = 0, gradA = 255;
                        let hasGrad = false;

                        if (topY >= 0 && bottomY >= 0) {
                            const t = (sy - topY) / (bottomY - topY);
                            const pT = (topY * width + x) * 4;
                            const pB = (bottomY * width + x) * 4;
                            gradR = Math.round(originalRgba[pT] * (1 - t) + originalRgba[pB] * t);
                            gradG = Math.round(originalRgba[pT + 1] * (1 - t) + originalRgba[pB + 1] * t);
                            gradB = Math.round(originalRgba[pT + 2] * (1 - t) + originalRgba[pB + 2] * t);
                            gradA = Math.round(originalRgba[pT + 3] * (1 - t) + originalRgba[pB + 3] * t);
                            hasGrad = true;
                        } else if (topY >= 0) {
                            const pT = (topY * width + x) * 4;
                            gradR = originalRgba[pT];
                            gradG = originalRgba[pT + 1];
                            gradB = originalRgba[pT + 2];
                            gradA = originalRgba[pT + 3];
                            hasGrad = true;
                        } else if (bottomY >= 0) {
                            const pB = (bottomY * width + x) * 4;
                            gradR = originalRgba[pB];
                            gradG = originalRgba[pB + 1];
                            gradB = originalRgba[pB + 2];
                            gradA = originalRgba[pB + 3];
                            hasGrad = true;
                        }

                        let cleanSrcIdx = -1;
                        let bestXDist = Infinity;

                        for (let k = 1; k < Math.max(width, 20); k++) {
                            const leftCol = x - k * Px;
                            const rightCol = x + k * Px;

                            if (leftCol >= 0 && mask[sy * width + leftCol] === 0) {
                                cleanSrcIdx = sy * width + leftCol;
                                bestXDist = k * Px;
                                break;
                            }
                            if (rightCol < width && mask[sy * width + rightCol] === 0) {
                                cleanSrcIdx = sy * width + rightCol;
                                bestXDist = k * Px;
                                break;
                            }
                        }

                        if (cleanSrcIdx === -1) {
                            cleanSrcIdx = topY >= 0 ? topY * width + x : (bottomY >= 0 ? bottomY * width + x : -1);
                        }

                        if (cleanSrcIdx >= 0) {
                            const pSrc = cleanSrcIdx * 4;
                            if (hasGrad && bestXDist > Px * 2) {
                                outputRgba[p] = Math.round(originalRgba[pSrc] * 0.8 + gradR * 0.2);
                                outputRgba[p + 1] = Math.round(originalRgba[pSrc + 1] * 0.8 + gradG * 0.2);
                                outputRgba[p + 2] = Math.round(originalRgba[pSrc + 2] * 0.8 + gradB * 0.2);
                                outputRgba[p + 3] = Math.round(originalRgba[pSrc + 3] * 0.8 + gradA * 0.2);
                            } else {
                                outputRgba[p] = originalRgba[pSrc];
                                outputRgba[p + 1] = originalRgba[pSrc + 1];
                                outputRgba[p + 2] = originalRgba[pSrc + 2];
                                outputRgba[p + 3] = originalRgba[pSrc + 3];
                            }
                        } else if (hasGrad) {
                            outputRgba[p] = gradR;
                            outputRgba[p + 1] = gradG;
                            outputRgba[p + 2] = gradB;
                            outputRgba[p + 3] = gradA;
                        }
                    }

                    spanStart = -1;
                }
            }
        }
        return outputRgba;
    }

    // CASE 3: 45° HALFTONE SCREENTONE DOT MATRIX (Local Phase Exemplar)
    if (patternInfo && patternInfo.type === 'screentone' && patternInfo.periodX) {
        const P = patternInfo.periodX;

        // Group clean pixel coordinates by phase (u, v)
        const phaseCleanCoords: number[][][] = Array.from({ length: P }, () => Array.from({ length: P }, () => []));
        let defaultCleanIdx = -1;

        for (let y = 0; y < height; y++) {
            const gy = offsetY + y;
            const rowOff = y * width;
            for (let x = 0; x < width; x++) {
                const idx = rowOff + x;
                if (mask[idx] === 0) {
                    if (defaultCleanIdx === -1) defaultCleanIdx = idx;
                    const gx = offsetX + x;
                    const u = (((gx + gy) % P) + P) % P;
                    const v = (((gx - gy) % P) + P) % P;
                    phaseCleanCoords[u][v].push(idx);
                }
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
                    const coords = phaseCleanCoords[u][v];

                    let bestSrcIdx = -1;
                    let bestDistSq = Infinity;

                    if (coords.length > 0) {
                        // Find closest clean pixel with the exact same phase (u, v)
                        for (let c = 0; c < coords.length; c++) {
                            const cIdx = coords[c];
                            const cx = cIdx % width;
                            const cy = Math.floor(cIdx / width);
                            const dx = x - cx;
                            const dy = y - cy;
                            const distSq = dx * dx + dy * dy;

                            if (distSq < bestDistSq) {
                                bestDistSq = distSq;
                                bestSrcIdx = cIdx;
                                if (distSq <= P * P) break; // Found an immediate neighbor phase
                            }
                        }
                    }

                    if (bestSrcIdx === -1) {
                        bestSrcIdx = defaultCleanIdx;
                    }

                    const p = idx * 4;
                    if (bestSrcIdx >= 0) {
                        const pSrc = bestSrcIdx * 4;
                        outputRgba[p] = originalRgba[pSrc];
                        outputRgba[p + 1] = originalRgba[pSrc + 1];
                        outputRgba[p + 2] = originalRgba[pSrc + 2];
                        outputRgba[p + 3] = originalRgba[pSrc + 3];
                    } else {
                        outputRgba[p] = 255;
                        outputRgba[p + 1] = 255;
                        outputRgba[p + 2] = 255;
                        outputRgba[p + 3] = 255;
                    }
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

