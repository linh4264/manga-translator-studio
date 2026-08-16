/**
 * patchDistance.js - High-Performance Zero-Allocation Patch Distance & Pattern-Aware Matching
 */

/**
 * Computes the distance/cost between a target patch (tx, ty) and source candidate (sx, sy)
 * @param {Uint8Array} gray - Grayscale image buffer
 * @param {Uint8Array} mask - Binary mask (1 = masked/unknown, 0 = known/clean)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} tx - Target patch center X
 * @param {number} ty - Target patch center Y
 * @param {number} sx - Source candidate center X
 * @param {number} sy - Source candidate center Y
 * @param {number} r - Patch radius (e.g. 3, 5, 7)
 * @param {object} patternInfo - Detected pattern metadata (type, periodX, periodY, confidence)
 * @param {object} options - Weights and parameters (phaseWeight, orientationWeight)
 * @returns {number} - Non-negative distance cost
 */
export function computePatchDistance(
    gray,
    mask,
    width,
    height,
    tx,
    ty,
    sx,
    sy,
    r,
    patternInfo = null,
    options = {}
) {
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

            // Only compare on target pixels that are ALREADY KNOWN (unmasked)
            if (mask[tIdx] === 0) {
                const sIdx = sRow + sX;
                const diff = gray[tIdx] - gray[sIdx];
                ssd += diff * diff;

                // Simple 1-pixel horizontal and vertical gradient difference
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

    let baseCost;
    if (knownCount > 0) {
        baseCost = (ssd / knownCount) * 0.8 + (gradSsd / knownCount) * 0.2;
    } else {
        // If entirely masked, evaluate center proximity or default to 0
        baseCost = 0;
    }

    // Pattern-Aware Phase and Orientation Penalties
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

            // In horizontal pattern, deviation in X direction is free, but Y should match phase
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
            // 45° lattice coordinates
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
