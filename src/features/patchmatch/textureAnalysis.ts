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
            if (score < bestYCorr) {
                bestYCorr = score;
                bestYPitch = P;
            }
        }
    }

    let bestXPitch: number | null = null;
    let bestXCorr = Infinity;
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
            if (score < bestXCorr) {
                bestXCorr = score;
                bestXPitch = P;
            }
        }
    }

    let bestDiagPitch: number | null = null;
    let bestDiagVariance = Infinity;

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
                bestDiagVariance = avgVariance;
                bestDiagPitch = P;
            }
        }
    }

    if (varY > 8 && (varX <= 8 || varX <= varY * 0.55) && bestYCorr < 35 && bestYPitch !== null) {
        const conf = Math.min(1.0, Math.max(0.7, (varY - varX) / (varY + 1)));
        return {
            type: "horizontal",
            orientation: 0,
            periodX: null,
            periodY: bestYPitch,
            confidence: conf
        };
    }

    if (varX > 8 && (varY <= 8 || varY <= varX * 0.55) && bestXCorr < 35 && bestXPitch !== null) {
        const conf = Math.min(1.0, Math.max(0.7, (varX - varY) / (varX + 1)));
        return {
            type: "vertical",
            orientation: 90,
            periodX: bestXPitch,
            periodY: null,
            confidence: conf
        };
    }

    if (varX > 6 && varY > 6 && bestDiagVariance < 45 && bestDiagPitch !== null) {
        const conf = Math.min(1.0, Math.max(0.7, (50 - bestDiagVariance) / 50));
        return {
            type: "screentone",
            orientation: 45,
            periodX: bestDiagPitch,
            periodY: bestDiagPitch,
            confidence: conf
        };
    }

    if (varX > 10 && varY > 10 && bestXCorr < 18 && bestYCorr < 18 && bestXPitch && bestYPitch) {
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
