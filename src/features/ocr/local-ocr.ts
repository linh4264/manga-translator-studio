// Local Offline Speech Bubble & Text Region Detector (Zero-API Fallback Engine)
import { normalizeAiBlockBox } from './ocr-service';
import { BoundingBox } from '../../types/index';

export function detectLocalTextRegions(imageData: ImageData): BoundingBox[] {
    if (!imageData || !imageData.width || !imageData.height) return [];

    const W = imageData.width;
    const H = imageData.height;
    const data = imageData.data;

    // 1. Calculate luminance and binarize low-brightness text pixels
    const gridScale = Math.max(1, Math.floor(Math.min(W, H) / 600));
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

            // Dark ink text pixels (threshold <= 145 to capture gray/anti-aliased text)
            if (luminance <= 145) {
                binaryMap[sy * sampleW + sx] = 1;
            }
        }
    }

    // 2. Connected Component Labeling
    const visited = new Uint8Array(sampleW * sampleH);
    const glyphComponents: Array<{ x: number; y: number; w: number; h: number }> = [];

    for (let sy = 0; sy < sampleH; sy++) {
        for (let sx = 0; sx < sampleW; sx++) {
            const pos = sy * sampleW + sx;
            if (binaryMap[pos] === 1 && visited[pos] === 0) {
                let minX = sx, maxX = sx, minY = sy, maxY = sy;
                let pixelCount = 0;

                const queue = [pos];
                visited[pos] = 1;

                while (queue.length > 0) {
                    const curr = queue.pop()!;
                    const cy = Math.floor(curr / sampleW);
                    const cx = curr % sampleW;
                    pixelCount++;

                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;

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

                const compW = (maxX - minX + 1) * gridScale;
                const compH = (maxY - minY + 1) * gridScale;

                // Filter out thin panel border lines (very wide or very tall thin lines) and giant background frames
                const isBorderLine = (compW > W * 0.45 && compH < 20) || (compH > H * 0.45 && compW < 20);
                const isPageFrame = compW > W * 0.7 && compH > H * 0.7;

                if (!isBorderLine && !isPageFrame && pixelCount >= 2 && compW >= 4 && compH >= 4 && compW < W * 0.6 && compH < H * 0.6) {
                    glyphComponents.push({
                        x: (minX * gridScale / W) * 100,
                        y: (minY * gridScale / H) * 100,
                        w: (compW / W) * 100,
                        h: (compH / H) * 100
                    });
                }
            }
        }
    }

    // 3. Merge adjacent glyph components into full speech bubble text regions (4.5% proximity margin)
    const mergedBlocks = mergeAdjacentBoxes(glyphComponents, 4.5);

    // Filter final merged blocks (min 0.8% width/height)
    const validBlocks = mergedBlocks.filter(b => b.w >= 0.8 && b.h >= 0.8 && b.w <= 75 && b.h <= 75);

    return validBlocks.map(b => normalizeAiBlockBox(b));
}

function mergeAdjacentBoxes(boxes: Array<{ x: number; y: number; w: number; h: number }>, paddingPct: number): Array<{ x: number; y: number; w: number; h: number }> {
    if (!boxes || boxes.length === 0) return [];
    let result = [...boxes];
    let merged = true;

    while (merged) {
        merged = false;
        const nextResult: Array<{ x: number; y: number; w: number; h: number }> = [];
        const skip = new Set<number>();

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
