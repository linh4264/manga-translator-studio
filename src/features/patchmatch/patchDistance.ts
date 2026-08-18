/**
 * patchDistance.js - High-Performance Zero-Allocation Patch Distance & Pattern-Aware Matching
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
                const diff = gray[tIdx] - gray[sIdx];
                ssd += diff * diff;

                if (tX + 1 < width && sX + 1 < width && tY + 1 < height && sY + 1 < height) {
                    const tGradX = gray[tIdx + 1] - gray[tIdx];
                    const sGradX = gray[sIdx + 1] - gray[sIdx];
                    const tGradY = gray[tIdx + width] - gray[tIdx];
                    const sGradY = gray[sIdx + width] - gray[sIdx];

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
        baseCost = (ssd / knownCount) * 0.8 + (gradSsd / knownCount) * 0.2;
    } else {
        baseCost = 0;
    }

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
