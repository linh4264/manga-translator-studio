// Local Offline Speech Bubble & Text Region Detector (Zero-API Fallback Engine)
import { normalizeAiBlockBox } from './ocr-service.js';

export function detectLocalTextRegions(imageData) {
    if (!imageData || !imageData.width || !imageData.height) return [];

    const W = imageData.width;
    const H = imageData.height;
    const data = imageData.data;

    // 1. Calculate luminance and binarize low-brightness text/border pixels
    const gridScale = Math.max(1, Math.floor(Math.min(W, H) / 400));
    const sampleW = Math.floor(W / gridScale);
    const sampleH = Math.floor(H / gridScale);
    const binaryMap = new Uint8Array(sampleW * sampleH);

    for (let sy = 0; sy < sampleH; sy++) {
        for (let sx = 0; sx < sampleW; sx++) {
            const px = sx * gridScale;
            const py = sy * gridScale;
            const idx = (py * W + px) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

            // Dark ink text or bubble outline threshold
            if (luminance < 110) {
                binaryMap[sy * sampleW + sx] = 1;
            }
        }
    }

    // 2. Connected Component Labeling & Bounding Box Clustering
    const visited = new Uint8Array(sampleW * sampleH);
    const rawBoxes = [];

    for (let sy = 0; sy < sampleH; sy++) {
        for (let sx = 0; sx < sampleW; sx++) {
            const pos = sy * sampleW + sx;
            if (binaryMap[pos] === 1 && visited[pos] === 0) {
                let minX = sx, maxX = sx, minY = sy, maxY = sy;
                let pixelCount = 0;

                const queue = [pos];
                visited[pos] = 1;

                while (queue.length > 0) {
                    const curr = queue.pop();
                    const cy = Math.floor(curr / sampleW);
                    const cx = curr % sampleW;
                    pixelCount++;

                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;

                    // 4-way connectivity search
                    const neighbors = [
                        cy > 0 ? curr - sampleW : -1,
                        cy < sampleH - 1 ? curr + sampleW : -1,
                        cx > 0 ? curr - 1 : -1,
                        cx < sampleW - 1 ? curr + 1 : -1
                    ];

                    for (const n of neighbors) {
                        if (n >= 0 && binaryMap[n] === 1 && visited[n] === 0) {
                            visited[n] = 1;
                            queue.push(n);
                        }
                    }
                }

                const boxW = (maxX - minX + 1) * gridScale;
                const boxH = (maxY - minY + 1) * gridScale;
                const boxX = minX * gridScale;
                const boxY = minY * gridScale;

                // Filter out tiny noise and full-page borders
                if (pixelCount >= 12 && boxW >= 20 && boxH >= 20 && boxW < W * 0.9 && boxH < H * 0.9) {
                    rawBoxes.push({
                        x: (boxX / W) * 100,
                        y: (boxY / H) * 100,
                        w: (boxW / W) * 100,
                        h: (boxH / H) * 100
                    });
                }
            }
        }
    }

    // 3. Merge overlapping or closely adjacent text regions
    const mergedBoxes = mergeAdjacentBoxes(rawBoxes, 3);
    return mergedBoxes.map(b => normalizeAiBlockBox(b));
}

function mergeAdjacentBoxes(boxes, paddingPct) {
    if (!boxes || boxes.length === 0) return [];
    let result = [...boxes];
    let merged = true;

    while (merged) {
        merged = false;
        const nextResult = [];
        const skip = new Set();

        for (let i = 0; i < result.length; i++) {
            if (skip.has(i)) continue;
            let current = { ...result[i] };

            for (let j = i + 1; j < result.length; j++) {
                if (skip.has(j)) continue;
                const other = result[j];

                // Check overlap with padding margin
                const isOverlapping = !(
                    current.x + current.w + paddingPct < other.x ||
                    other.x + other.w + paddingPct < current.x ||
                    current.y + current.h + paddingPct < other.y ||
                    other.y + other.h + paddingPct < current.y
                );

                if (isOverlapping) {
                    const newX = Math.min(current.x, other.x);
                    const newY = Math.min(current.y, other.y);
                    const newRight = Math.max(current.x + current.w, other.x + other.w);
                    const newBottom = Math.max(current.y + current.h, other.y + other.h);

                    current = {
                        x: newX,
                        y: newY,
                        w: newRight - newX,
                        h: newBottom - newY
                    };
                    skip.add(j);
                    merged = true;
                }
            }
            nextResult.push(current);
        }
        result = nextResult;
    }

    return result;
}
