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
    const samples: Array<{ x: number; y: number; idx: number }> = [];
    const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 800)));

    for (let y = 4; y < height - 4; y += step) {
        const rowOff = y * width;
        for (let x = 4; x < width - 4; x += step) {
            if (mask[rowOff + x] === 0) {
                samples.push({ x, y, idx: rowOff + x });
            }
        }
    }

    if (samples.length < 30) {
        return { type: "unknown", orientation: 0, periodX: null, periodY: null, confidence: 0.0 };
    }

    let varX = 0, varY = 0;
    let countX = 0, countY = 0;

    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        for (let d = 1; d <= 2; d++) {
            if (s.x + d < width && mask[s.idx + d] === 0) {
                varX += Math.abs(gray[s.idx] - gray[s.idx + d]);
                countX++;
            }
            if (s.y + d < height && mask[s.idx + d * width] === 0) {
                varY += Math.abs(gray[s.idx] - gray[s.idx + d * width]);
                countY++;
            }
        }
    }

    if (countX > 0) varX /= countX;
    if (countY > 0) varY /= countY;

    const candidatePitches = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16];

    let bestYPitch: number | null = null;
    let bestYCorr = Infinity;
    let secondBestYCorr = Infinity;
    let sumYCorr = 0;
    let validYPitchCount = 0;

    for (const P of candidatePitches) {
        let diffSum = 0;
        let count = 0;
        for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            if (s.y + P < height && mask[s.idx + P * width] === 0) {
                diffSum += Math.abs(gray[s.idx] - gray[s.idx + P * width]);
                count++;
            }
        }
        if (count > 20) {
            const score = diffSum / count;
            sumYCorr += score;
            validYPitchCount++;
            if (score < bestYCorr) {
                secondBestYCorr = bestYCorr;
                bestYCorr = score;
                bestYPitch = P;
            } else if (score < secondBestYCorr) {
                secondBestYCorr = score;
            }
        }
    }

    let bestXPitch: number | null = null;
    let bestXCorr = Infinity;
    let secondBestXCorr = Infinity;
    let sumXCorr = 0;
    let validXPitchCount = 0;

    for (const P of candidatePitches) {
        let diffSum = 0;
        let count = 0;
        for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            if (s.x + P < width && mask[s.idx + P] === 0) {
                diffSum += Math.abs(gray[s.idx] - gray[s.idx + P]);
                count++;
            }
        }
        if (count > 20) {
            const score = diffSum / count;
            sumXCorr += score;
            validXPitchCount++;
            if (score < bestXCorr) {
                secondBestXCorr = bestXCorr;
                bestXCorr = score;
                bestXPitch = P;
            } else if (score < secondBestXCorr) {
                secondBestXCorr = score;
            }
        }
    }

    let bestDiagPitch: number | null = null;
    let bestDiagVariance = Infinity;
    let secondDiagVariance = Infinity;

    for (const P of candidatePitches) {
        const sumVal = new Float32Array(P * P);
        const sumSqVal = new Float32Array(P * P);
        const binCount = new Int32Array(P * P);

        for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            const u = (((s.x + s.y) % P) + P) % P;
            const v = (((s.x - s.y) % P) + P) % P;
            const binIdx = u * P + v;
            const val = gray[s.idx];
            sumVal[binIdx] += val;
            sumSqVal[binIdx] += val * val;
            binCount[binIdx]++;
        }

        let totalVariance = 0;
        let validBins = 0;
        for (let b = 0; b < P * P; b++) {
            const cnt = binCount[b];
            if (cnt >= 2) {
                const mean = sumVal[b] / cnt;
                const variance = (sumSqVal[b] / cnt) - (mean * mean);
                totalVariance += Math.max(0, variance);
                validBins++;
            }
        }

        if (validBins >= 2) {
            const avgVariance = totalVariance / validBins;
            if (avgVariance < bestDiagVariance) {
                secondDiagVariance = bestDiagVariance;
                bestDiagVariance = avgVariance;
                bestDiagPitch = P;
            } else if (avgVariance < secondDiagVariance) {
                secondDiagVariance = avgVariance;
            }
        }
    }

    const sampleQuality = Math.min(1.0, Math.max(0.6, samples.length / 80));

    // 1. Check Horizontal stripe pattern
    if (varY > 8 && (varX <= 8 || varX <= varY * 0.50) && bestYCorr < 30 && bestYPitch !== null) {
        const varRatio = (varY - varX) / (varY + varX + 0.001);
        const corrScore = Math.max(0, 1.0 - (bestYCorr / 30.0));
        const avgYCorr = validYPitchCount > 0 ? sumYCorr / validYPitchCount : bestYCorr;
        const pitchSeparation = avgYCorr > 0 ? Math.min(1.0, (avgYCorr - bestYCorr) / (avgYCorr + 0.001) * 2.0) : 0.5;

        const conf = Math.min(1.0, Math.max(0.5, (varRatio * 0.45 + corrScore * 0.35 + pitchSeparation * 0.10 + sampleQuality * 0.10)));

        if (conf >= 0.75) {
            return {
                type: "horizontal",
                orientation: 0,
                periodX: null,
                periodY: bestYPitch,
                confidence: conf
            };
        }
    }

    // 2. Check Vertical stripe pattern
    if (varX > 8 && (varY <= 8 || varY <= varX * 0.50) && bestXCorr < 30 && bestXPitch !== null) {
        const varRatio = (varX - varY) / (varX + varY + 0.001);
        const corrScore = Math.max(0, 1.0 - (bestXCorr / 30.0));
        const avgXCorr = validXPitchCount > 0 ? sumXCorr / validXPitchCount : bestXCorr;
        const pitchSeparation = avgXCorr > 0 ? Math.min(1.0, (avgXCorr - bestXCorr) / (avgXCorr + 0.001) * 2.0) : 0.5;

        const conf = Math.min(1.0, Math.max(0.5, (varRatio * 0.45 + corrScore * 0.35 + pitchSeparation * 0.10 + sampleQuality * 0.10)));

        if (conf >= 0.75) {
            return {
                type: "vertical",
                orientation: 90,
                periodX: bestXPitch,
                periodY: null,
                confidence: conf
            };
        }
    }

    // 3. Check Screentone (45° Halftone dots)
    if (varX > 6 && varY > 6 && bestDiagVariance < 40 && bestDiagPitch !== null) {
        const varScore = Math.max(0, 1.0 - (bestDiagVariance / 40.0));
        const separationScore = (secondDiagVariance < Infinity && secondDiagVariance > bestDiagVariance)
            ? Math.min(1.0, (secondDiagVariance - bestDiagVariance) / 20.0)
            : 0.5;

        const conf = Math.min(1.0, Math.max(0.5, (varScore * 0.60 + separationScore * 0.25 + sampleQuality * 0.15)));

        if (conf >= 0.75) {
            return {
                type: "screentone",
                orientation: 45,
                periodX: bestDiagPitch,
                periodY: bestDiagPitch,
                confidence: conf
            };
        }
    }

    // 4. Check Crosshatch - strict requirement
    if (varX > 12 && varY > 12 && bestXCorr < 15 && bestYCorr < 15 && bestXPitch && bestYPitch) {
        const conf = Math.min(1.0, Math.max(0.6, (1.0 - (bestXCorr + bestYCorr) / 30.0) * 0.8 + sampleQuality * 0.2));
        if (conf >= 0.80) {
            return {
                type: "crosshatch",
                orientation: 0,
                periodX: bestXPitch,
                periodY: bestYPitch,
                confidence: conf
            };
        }
    }

    return {
        type: "unknown",
        orientation: 0,
        periodX: null,
        periodY: null,
        confidence: 0.0
    };
}
