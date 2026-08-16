/**
 * maskUtils.js - Mask Preprocessing, Morphological Operations and ROI Bounding Box
 */

/**
 * Dilates a binary mask by a given radius (0 to 8 px) using Euclidean circular kernel
 * @param {Uint8Array} mask - Binary mask array (0 = keep, 1 = inpaint)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} radius - Dilation radius in pixels (0-8)
 * @returns {Uint8Array} - Dilated binary mask
 */
export function dilateMask(mask, width, height, radius = 2) {
    if (radius <= 0) return new Uint8Array(mask);
    const rad = Math.min(8, Math.max(1, Math.round(radius)));
    const outMask = new Uint8Array(mask.length);
    const rSq = rad * rad;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (mask[y * width + x] === 1) {
                // Dilate outward in circle
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

/**
 * Computes the tight Bounding Box ROI of the active mask with safety padding
 * @param {Uint8Array} mask - Binary mask array
 * @param {number} width - Full image width
 * @param {number} height - Full image height
 * @param {number} padding - Padding in pixels (default patchRadius * 4)
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number } | null}
 */
export function computeMaskROI(mask, width, height, padding = 20) {
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

    if (maxX === -1) return null; // No masked pixels

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

/**
 * Extracts sub-region RGBA and Mask buffers for ROI processing
 * @param {Uint8ClampedArray|Uint8Array} rgba - Full image RGBA data
 * @param {Uint8Array} mask - Full image binary mask
 * @param {number} fullWidth - Full image width
 * @param {object} roi - ROI bounding box
 * @returns {{ roiRgba: Uint8Array, roiMask: Uint8Array, roiWidth: number, roiHeight: number }}
 */
export function extractROI(rgba, mask, fullWidth, roi) {
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

/**
 * Generates Valid Source Map ensuring no patch around center contains any masked pixels
 * @param {Uint8Array} roiMask - ROI binary mask
 * @param {number} width - ROI width
 * @param {number} height - ROI height
 * @param {number} patchRadius - Radius R of patch (e.g. 3, 5, 7)
 * @returns {{ validSource: Uint8Array, validCount: number, validCoords: Int32Array }}
 */
export function generateValidSourceMap(roiMask, width, height, patchRadius) {
    const validSource = new Uint8Array(width * height);
    const r = patchRadius;
    let validCount = 0;

    // Use integral image / prefix sums on mask for O(1) patch validation
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

            // Box sum of mask values in patch
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

    // Build flattened valid coordinate list [x0, y0, x1, y1, ...]
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
