/**
 * maskUtils.js - Mask Preprocessing, Morphological Operations and ROI Bounding Box
 */

export interface MaskROI {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
}

export function dilateMask(mask: Uint8Array, width: number, height: number, radius: number = 2): Uint8Array {
    if (radius <= 0) return new Uint8Array(mask);
    const rad = Math.min(8, Math.max(1, Math.round(radius)));
    const outMask = new Uint8Array(mask.length);
    const rSq = rad * rad;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (mask[y * width + x] === 1) {
                const yMin = Math.max(0, y - rad);
                const yMax = Math.min(height - 1, y + rad);
                const xMin = Math.max(0, x - rad);
                const xMax = Math.min(width - 1, x + rad);

                for (let dy = yMin; dy <= yMax; dy++) {
                    const yDistSq = (dy - y) * (dy - y);
                    const rowOffset = dy * width;
                    for (let dx = xMin; dx <= xMax; dx++) {
                        if (yDistSq + (dx - x) * (dx - x) <= rSq) {
                            outMask[rowOffset + dx] = 1;
                        }
                    }
                }
            }
        }
    }
    return outMask;
}

export function computeMaskROI(mask: Uint8Array, width: number, height: number, padding: number = 20): MaskROI | null {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
        const rowOffset = y * width;
        for (let x = 0; x < width; x++) {
            if (mask[rowOffset + x] === 1) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (maxX === -1) return null;

    const pad = Math.max(8, Math.round(padding));
    const roiMinX = Math.max(0, minX - pad);
    const roiMinY = Math.max(0, minY - pad);
    const roiMaxX = Math.min(width - 1, maxX + pad);
    const roiMaxY = Math.min(height - 1, maxY + pad);

    return {
        minX: roiMinX,
        minY: roiMinY,
        maxX: roiMaxX,
        maxY: roiMaxY,
        width: roiMaxX - roiMinX + 1,
        height: roiMaxY - roiMinY + 1
    };
}

export function extractROI(
    rgba: Uint8ClampedArray | Uint8Array,
    mask: Uint8Array,
    fullWidth: number,
    roi: MaskROI
): { roiRgba: Uint8Array; roiMask: Uint8Array; roiWidth: number; roiHeight: number } {
    const { minX, minY, width: roiW, height: roiH } = roi;
    const roiRgba = new Uint8Array(roiW * roiH * 4);
    const roiMask = new Uint8Array(roiW * roiH);

    for (let y = 0; y < roiH; y++) {
        const fullY = minY + y;
        const fullRowOff = fullY * fullWidth;
        const roiRowOff = y * roiW;

        for (let x = 0; x < roiW; x++) {
            const fullX = minX + x;
            const fullIdx = fullRowOff + fullX;
            const roiIdx = roiRowOff + x;

            roiMask[roiIdx] = mask[fullIdx];

            const pFull = fullIdx * 4;
            const pRoi = roiIdx * 4;
            roiRgba[pRoi] = rgba[pFull];
            roiRgba[pRoi + 1] = rgba[pFull + 1];
            roiRgba[pRoi + 2] = rgba[pFull + 2];
            roiRgba[pRoi + 3] = rgba[pFull + 3];
        }
    }

    return { roiRgba, roiMask, roiWidth: roiW, roiHeight: roiH };
}

export function generateValidSourceMap(
    roiMask: Uint8Array,
    width: number,
    height: number,
    patchRadius: number
): { validSource: Uint8Array; validCount: number; validCoords: Int32Array } {
    const validSource = new Uint8Array(width * height);
    const r = patchRadius;
    let validCount = 0;

    const integral = new Int32Array((width + 1) * (height + 1));
    for (let y = 0; y < height; y++) {
        let rowSum = 0;
        for (let x = 0; x < width; x++) {
            rowSum += roiMask[y * width + x];
            integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum;
        }
    }

    for (let y = r; y < height - r; y++) {
        const y0 = y - r;
        const y1 = y + r + 1;
        const stride = width + 1;

        for (let x = r; x < width - r; x++) {
            const x0 = x - r;
            const x1 = x + r + 1;

            const maskSum = integral[y1 * stride + x1]
                          - integral[y0 * stride + x1]
                          - integral[y1 * stride + x0]
                          + integral[y0 * stride + x0];

            if (maskSum === 0) {
                validSource[y * width + x] = 1;
                validCount++;
            }
        }
    }

    const validCoords = new Int32Array(validCount * 2);
    let ptr = 0;
    for (let y = r; y < height - r; y++) {
        for (let x = r; x < width - r; x++) {
            if (validSource[y * width + x] === 1) {
                validCoords[ptr++] = x;
                validCoords[ptr++] = y;
            }
        }
    }

    return { validSource, validCount, validCoords };
}
