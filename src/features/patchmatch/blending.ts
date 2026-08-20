/**
 * blending.ts - Seamless Boundary Blending & Distance Transform Alpha Feathering
 */

export function computeAdaptiveBlendRadius(patchRadius: number = 5, patternType: string = 'unknown'): number {
    if (patternType === 'screentone' || patternType === 'horizontal' || patternType === 'vertical') {
        // Crisp periodic pattern: very light feathering (1.5 - 2.5px) to prevent blurring dots/stripes
        return Math.max(1.5, Math.min(2.5, patchRadius * 0.35));
    }
    // Organic texture: moderate feathering (2.0 - 8.0px)
    return Math.max(2.0, Math.min(8.0, patchRadius * 0.5));
}

export function computeDistanceToBoundary(mask: Uint8Array, width: number, height: number): Float32Array {
    const total = width * height;
    const dist = new Float32Array(total);
    const INF = 999999.0;

    for (let i = 0; i < total; i++) {
        dist[i] = mask[i] === 0 ? 0.0 : INF;
    }

    // Forward pass (Top-Left -> Bottom-Right)
    for (let y = 0; y < height; y++) {
        const rowOff = y * width;
        for (let x = 0; x < width; x++) {
            const idx = rowOff + x;
            if (dist[idx] > 0) {
                let d = dist[idx];
                if (x > 0) d = Math.min(d, dist[idx - 1] + 1.0);
                if (y > 0) d = Math.min(d, dist[idx - width] + 1.0);
                if (x > 0 && y > 0) d = Math.min(d, dist[idx - width - 1] + 1.414);
                if (x < width - 1 && y > 0) d = Math.min(d, dist[idx - width + 1] + 1.414);
                dist[idx] = d;
            }
        }
    }

    // Backward pass (Bottom-Right -> Top-Left)
    for (let y = height - 1; y >= 0; y--) {
        const rowOff = y * width;
        for (let x = width - 1; x >= 0; x--) {
            const idx = rowOff + x;
            if (dist[idx] > 0) {
                let d = dist[idx];
                if (x < width - 1) d = Math.min(d, dist[idx + 1] + 1.0);
                if (y < height - 1) d = Math.min(d, dist[idx + width] + 1.0);
                if (x < width - 1 && y < height - 1) d = Math.min(d, dist[idx + width + 1] + 1.414);
                if (x > 0 && y < height - 1) d = Math.min(d, dist[idx + width - 1] + 1.414);
                dist[idx] = d;
            }
        }
    }

    return dist;
}

export function applySeamlessBoundaryBlending(
    originalRgba: Uint8Array,
    reconstructedRgba: Uint8Array,
    mask: Uint8Array,
    width: number,
    height: number,
    blendRadius: number = 2.5
): Uint8Array {
    const total = width * height;
    const dist = computeDistanceToBoundary(mask, width, height);
    const result = new Uint8Array(originalRgba);

    const bRad = Math.max(1.0, blendRadius);

    for (let i = 0; i < total; i++) {
        if (mask[i] === 1) {
            const d = dist[i];
            const p = i * 4;

            if (d >= bRad) {
                result[p] = reconstructedRgba[p];
                result[p + 1] = reconstructedRgba[p + 1];
                result[p + 2] = reconstructedRgba[p + 2];
                result[p + 3] = reconstructedRgba[p + 3];
            } else {
                const t = Math.min(1.0, Math.max(0.0, d / bRad));
                // Smooth Cosine S-Curve (0 to 1)
                const alpha = 0.5 * (1.0 - Math.cos(Math.PI * t));
                const invAlpha = 1.0 - alpha;

                result[p] = Math.min(255, Math.max(0, Math.round(originalRgba[p] * invAlpha + reconstructedRgba[p] * alpha)));
                result[p + 1] = Math.min(255, Math.max(0, Math.round(originalRgba[p + 1] * invAlpha + reconstructedRgba[p + 1] * alpha)));
                result[p + 2] = Math.min(255, Math.max(0, Math.round(originalRgba[p + 2] * invAlpha + reconstructedRgba[p + 2] * alpha)));
                result[p + 3] = Math.min(255, Math.max(0, Math.round(originalRgba[p + 3] * invAlpha + reconstructedRgba[p + 3] * alpha)));
            }
        }
    }

    return result;
}

