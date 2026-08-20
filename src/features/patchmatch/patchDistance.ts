/**
 * patchDistance.ts - High-Performance Zero-Allocation Patch Distance, Pattern-Aware Matching & Deterministic RNG
 */

/**
 * Creates a fast, deterministic 32-bit PRNG (Mulberry32).
 * Same seed always yields the exact same sequence of pseudo-random numbers in [0, 1).
 */
export function createSeededRng(seed: number): () => number {
    let s = (seed | 0) || 1337;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Computes a local-aware patch distance between target (tx, ty) and source (sx, sy).
 * Cost = PatchSSD (Luminance + Gradient) + LocalColorPenalty + DistancePenalty + PatternPhasePenalty
 */
export function computePatchDistance(
    gray: Uint8Array,
    mask: Uint8Array,
    width: number,
    height: number,
    tx: number,
    ty: number,
    sx: number,
    sy: number,
    r: number,
    patternInfo: any = null,
    options: any = {}
): number {
    let ssd = 0;
    let gradSsd = 0;
    let knownCount = 0;
    let targetLumSum = 0;
    let sourceLumSum = 0;

    for (let dy = -r; dy <= r; dy++) {
        const tY = ty + dy;
        const sY = sy + dy;
        const tRow = tY * width;
        const sRow = sY * width;

        for (let dx = -r; dx <= r; dx++) {
            const tX = tx + dx;
            const sX = sx + dx;
            const tIdx = tRow + tX;

            if (mask[tIdx] === 0) {
                const sIdx = sRow + sX;
                const tVal = gray[tIdx];
                const sVal = gray[sIdx];
                const diff = tVal - sVal;
                ssd += diff * diff;

                targetLumSum += tVal;
                sourceLumSum += sVal;

                if (tX + 1 < width && sX + 1 < width && tY + 1 < height && sY + 1 < height) {
                    const tGradX = gray[tIdx + 1] - tVal;
                    const sGradX = gray[sIdx + 1] - sVal;
                    const tGradY = gray[tIdx + width] - tVal;
                    const sGradY = gray[sIdx + width] - sVal;

                    const dGradX = tGradX - sGradX;
                    const dGradY = tGradY - sGradY;
                    gradSsd += (dGradX * dGradX + dGradY * dGradY);
                }

                knownCount++;
            }
        }
    }

    let baseCost: number;
    if (knownCount > 0) {
        // Normalized SSD + Gradient SSD
        baseCost = (ssd / knownCount) * 0.8 + (gradSsd / knownCount) * 0.2;

        // Local color / luminance consistency penalty
        const avgT = targetLumSum / knownCount;
        const avgS = sourceLumSum / knownCount;
        const colorDiff = avgT - avgS;
        const colorPenaltyWeight = options.colorPenaltyWeight !== undefined ? options.colorPenaltyWeight : 0.25;
        baseCost += (colorDiff * colorDiff) * colorPenaltyWeight;
    } else {
        baseCost = 0;
    }

    // Distance bias: slight preference for closer source patches when SSD is very close
    // but texture match remains primary
    const distanceWeight = options.distanceWeight !== undefined ? options.distanceWeight : 0.05;
    if (distanceWeight > 0) {
        const dx = tx - sx;
        const dy = ty - sy;
        const distSq = dx * dx + dy * dy;
        const maxDistSq = width * width + height * height;
        const normDist = distSq / Math.max(1, maxDistSq);
        // Add small penalty scaled relative to SSD scale
        baseCost += normDist * 50.0 * distanceWeight;
    }

    // Pattern & phase penalties
    if (patternInfo && patternInfo.type !== 'unknown' && patternInfo.confidence > 0.3) {
        const phaseWeight = options.phaseWeight !== undefined ? options.phaseWeight : 0.25;
        const orientWeight = options.orientationWeight !== undefined ? options.orientationWeight : 0.15;
        let phasePenalty = 0;
        let orientPenalty = 0;

        if (patternInfo.type === 'horizontal' && patternInfo.periodY) {
            const Py = patternInfo.periodY;
            const tPhaseY = ((ty % Py) + Py) % Py;
            const sPhaseY = ((sy % Py) + Py) % Py;
            const diffY = Math.abs(tPhaseY - sPhaseY);
            const circularDiffY = Math.min(diffY, Py - diffY);
            phasePenalty = circularDiffY / Py;
            orientPenalty = Math.min(1.0, Math.abs(sy - ty) / (height * 0.5));
        } else if (patternInfo.type === 'vertical' && patternInfo.periodX) {
            const Px = patternInfo.periodX;
            const tPhaseX = ((tx % Px) + Px) % Px;
            const sPhaseX = ((sx % Px) + Px) % Px;
            const diffX = Math.abs(tPhaseX - sPhaseX);
            const circularDiffX = Math.min(diffX, Px - diffX);
            phasePenalty = circularDiffX / Px;
            orientPenalty = Math.min(1.0, Math.abs(sx - tx) / (width * 0.5));
        } else if (patternInfo.type === 'screentone' && patternInfo.periodX) {
            const P = patternInfo.periodX;
            const uT = (((tx + ty) % P) + P) % P;
            const vT = (((tx - ty) % P) + P) % P;
            const uS = (((sx + sy) % P) + P) % P;
            const vS = (((sx - sy) % P) + P) % P;

            const diffU = Math.min(Math.abs(uT - uS), P - Math.abs(uT - uS));
            const diffV = Math.min(Math.abs(vT - vS), P - Math.abs(vT - vS));
            phasePenalty = (diffU + diffV) / (2 * P);
        }

        const maxCostScale = 255 * 255;
        baseCost += (phasePenalty * phaseWeight + orientPenalty * orientWeight) * maxCostScale * patternInfo.confidence;
    }

    return baseCost;
}

