/**
 * textureAnalysis.js - Manga Texture Analysis & Periodic Pattern Classification
 */

export interface MangaTexturePattern {
    type: "horizontal" | "vertical" | "diagonal" | "screentone" | "crosshatch" | "unknown";
    orientation: number;
    periodX: number | null;
    periodY: number | null;
    confidence: number;
}

export function rgbToGrayscale(rgba: Uint8Array, width: number, height: number): Uint8Array {
    const total = width * height;
    const gray = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
        const p = i * 4;
        gray[i] = (299 * rgba[p] + 587 * rgba[p + 1] + 114 * rgba[p + 2] + 500) / 1000 | 0;
    }
    return gray;
}

export function analyzeMangaTexture(
    gray: Uint8Array,
    mask: Uint8Array,
    _validSource: Uint8Array,
    width: number,
    height: number
): MangaTexturePattern {
    let varX = 0, varY = 0;
    let countX = 0, countY = 0;
    let unmaskedCount = 0;

    for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        for (let x = 1; x < width - 1; x++) {
            const idx = row + x;
            if (mask[idx] === 0) {
                unmaskedCount++;
                const val = gray[idx];
                if (mask[idx + 1] === 0) {
                    varX += Math.abs(val - gray[idx + 1]);
                    countX++;
                }
                if (mask[idx + width] === 0) {
                    varY += Math.abs(val - gray[idx + width]);
                    countY++;
                }
            }
        }
    }

    if (unmaskedCount < 30) {
        return { type: "unknown", orientation: 0, periodX: null, periodY: null, confidence: 0.0 };
    }

    if (countX > 0) varX /= countX;
    if (countY > 0) varY /= countY;

    const candidatePitches = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16];

    // A. 1D Horizontal Autocorrelation (along Y columns)
    let bestYPitch: number | null = null;
    let bestYCorr = Infinity;
    for (const P of candidatePitches) {
        let diffSum = 0, count = 0;
        for (let y = 0; y < height - P; y++) {
            const row1 = y * width;
            const row2 = (y + P) * width;
            for (let x = 0; x < width; x++) {
                if (mask[row1 + x] === 0 && mask[row2 + x] === 0) {
                    diffSum += Math.abs(gray[row1 + x] - gray[row2 + x]);
                    count++;
                }
            }
        }
        if (count > 40) {
            const score = diffSum / count;
            if (score < bestYCorr) {
                bestYCorr = score;
                bestYPitch = P;
            }
        }
    }

    // B. 1D Vertical Autocorrelation (along X rows)
    let bestXPitch: number | null = null;
    let bestXCorr = Infinity;
    for (const P of candidatePitches) {
        let diffSum = 0, count = 0;
        for (let y = 0; y < height; y++) {
            const row = y * width;
            for (let x = 0; x < width - P; x++) {
                if (mask[row + x] === 0 && mask[row + x + P] === 0) {
                    diffSum += Math.abs(gray[row + x] - gray[row + x + P]);
                    count++;
                }
            }
        }
        if (count > 40) {
            const score = diffSum / count;
            if (score < bestXCorr) {
                bestXCorr = score;
                bestXPitch = P;
            }
        }
    }

    // C. 2D 45° Screentone Lattice Phase Profile & Contrast Detection
    let bestDiagPitch: number | null = null;
    let bestDiagMae = Infinity;
    let bestDiagContrast = 0;

    for (const P of candidatePitches) {
        const binValues: number[][] = Array.from({ length: P * P }, () => []);

        for (let y = 0; y < height; y++) {
            const row = y * width;
            for (let x = 0; x < width; x++) {
                const idx = row + x;
                if (mask[idx] === 0) {
                    const u = (((x + y) % P) + P) % P;
                    const v = (((x - y) % P) + P) % P;
                    binValues[u * P + v].push(gray[idx]);
                }
            }
        }

        const medians = new Float32Array(P * P);
        let minMed = 255, maxMed = 0;
        let validBins = 0;

        for (let b = 0; b < P * P; b++) {
            const vals = binValues[b];
            if (vals.length >= 2) {
                vals.sort((a, b) => a - b);
                const med = vals[Math.floor(vals.length / 2)];
                medians[b] = med;
                if (med < minMed) minMed = med;
                if (med > maxMed) maxMed = med;
                validBins++;
            } else {
                medians[b] = -1;
            }
        }

        if (validBins >= P) {
            let absErrSum = 0, count = 0;
            for (let y = 0; y < height; y++) {
                const row = y * width;
                for (let x = 0; x < width; x++) {
                    const idx = row + x;
                    if (mask[idx] === 0) {
                        const u = (((x + y) % P) + P) % P;
                        const v = (((x - y) % P) + P) % P;
                        const med = medians[u * P + v];
                        if (med >= 0) {
                            absErrSum += Math.abs(gray[idx] - med);
                            count++;
                        }
                    }
                }
            }

            if (count > 40) {
                const mae = absErrSum / count;
                const contrast = maxMed - minMed;
                if (contrast > 20 && (mae < bestDiagMae || (contrast > bestDiagContrast * 1.3 && mae < bestDiagMae + 5))) {
                    bestDiagMae = mae;
                    bestDiagPitch = P;
                    bestDiagContrast = contrast;
                }
            }
        }
    }

    // =========================================================================
    // PATTERN CLASSIFICATION LOGIC
    // =========================================================================

    // 1. Check 1D Horizontal Stripes (varY dominates varX by at least 1.6x, or varX <= 8 while varY is active)
    if (varY > 10 && (varX <= 8 || varY >= varX * 1.6) && bestYCorr < 35 && bestYPitch !== null) {
        const conf = Math.min(1.0, Math.max(0.75, (varY - varX) / (varY + varX + 0.001) * 0.5 + 0.5));
        return {
            type: "horizontal",
            orientation: 0,
            periodX: null,
            periodY: bestYPitch,
            confidence: conf
        };
    }

    // 2. Check 1D Vertical Stripes (varX dominates varY by at least 1.6x, or varY <= 8 while varX is active)
    if (varX > 10 && (varY <= 8 || varX >= varY * 1.6) && bestXCorr < 35 && bestXPitch !== null) {
        const conf = Math.min(1.0, Math.max(0.75, (varX - varY) / (varX + varY + 0.001) * 0.5 + 0.5));
        return {
            type: "vertical",
            orientation: 90,
            periodX: bestXPitch,
            periodY: null,
            confidence: conf
        };
    }

    // 3. Check 2D 45° Screentone (Halftone Dot Matrix: both X and Y active, strong phase contrast with low residual phase MAE)
    if (varX > 4 && varY > 4 && bestDiagPitch !== null && bestDiagContrast >= 30 && bestDiagMae < 25 && bestDiagContrast >= bestDiagMae * 1.5) {
        const conf = Math.min(1.0, Math.max(0.75, Math.min(1.0, (bestDiagContrast - bestDiagMae) / 100.0) * 0.5 + 0.5));
        return {
            type: "screentone",
            orientation: 45,
            periodX: bestDiagPitch,
            periodY: bestDiagPitch,
            confidence: conf
        };
    }

    // 4. Check Crosshatch - strict requirement
    if (varX > 10 && varY > 10 && bestXCorr < 20 && bestYCorr < 20 && bestXPitch && bestYPitch) {
        return {
            type: "crosshatch",
            orientation: 0,
            periodX: bestXPitch,
            periodY: bestYPitch,
            confidence: 0.75
        };
    }

    return {
        type: "unknown",
        orientation: 0,
        periodX: null,
        periodY: null,
        confidence: 0.0
    };
}
