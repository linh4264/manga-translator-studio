/**
 * ocr.worker.ts - Dedicated Web Worker for Non-Blocking Manga OCR & Computer Vision Pixel Processing
 * Offloads heavy luminance mapping, watershed segmentation, distance transforms, and mask dilation off the main UI thread.
 */

export interface BoundingBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

export function getImageBrightnessMapFromBuffer(rgba: Uint8Array, width: number, height: number): Uint8Array {
    const map = new Uint8Array(width * height);
    for (let i = 0; i < rgba.length; i += 4) {
        const r = rgba[i];
        const g = rgba[i + 1];
        const b = rgba[i + 2];
        map[i / 4] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    return map;
}

export function normalizeAiBlockBox(
    box: any,
    imgW: number = 1000,
    imgH: number = 1000,
    blockType?: string
): BoundingBox {
    const isSfx = (blockType || '').toLowerCase() === 'sfx';
    const targetBlockSizePx = isSfx ? 200 : 400;

    const defaultWPct = Math.round(((targetBlockSizePx / imgW) * 100) * 100) / 100;
    const defaultHPct = Math.round(((targetBlockSizePx / imgH) * 100) * 100) / 100;

    if (!box) {
        return {
            x: Math.max(0, Math.round((50 - defaultWPct / 2) * 100) / 100),
            y: Math.max(0, Math.round((50 - defaultHPct / 2) * 100) / 100),
            w: defaultWPct,
            h: defaultHPct
        };
    }

    let x: number, y: number, w: number, h: number;

    if (Array.isArray(box)) {
        if (box.length === 2) {
            const centerX = Number(box[0]) / 10;
            const centerY = Number(box[1]) / 10;
            x = centerX - (defaultWPct / 2);
            y = centerY - (defaultHPct / 2);
            w = defaultWPct;
            h = defaultHPct;
        } else if (box.length >= 4) {
            x = Number(box[0]) / 10;
            y = Number(box[1]) / 10;
            w = Number(box[2]) / 10;
            h = Number(box[3]) / 10;
        } else {
            return {
                x: Math.max(0, Math.round((50 - defaultWPct / 2) * 100) / 100),
                y: Math.max(0, Math.round((50 - defaultHPct / 2) * 100) / 100),
                w: defaultWPct,
                h: defaultHPct
            };
        }
    } else if (typeof box === 'object') {
        x = Number(box.x !== undefined ? box.x : box.left) / 10;
        y = Number(box.y !== undefined ? box.y : box.top) / 10;
        const rawW = box.w !== undefined ? box.w : box.width;
        const rawH = box.h !== undefined ? box.h : box.height;
        w = rawW !== undefined ? Number(rawW) / 10 : defaultWPct;
        h = rawH !== undefined ? Number(rawH) / 10 : defaultHPct;
    } else {
        return {
            x: Math.max(0, Math.round((50 - defaultWPct / 2) * 100) / 100),
            y: Math.max(0, Math.round((50 - defaultHPct / 2) * 100) / 100),
            w: defaultWPct,
            h: defaultHPct
        };
    }

    if (![x, y].every(Number.isFinite)) {
        return {
            x: Math.max(0, Math.round((50 - defaultWPct / 2) * 100) / 100),
            y: Math.max(0, Math.round((50 - defaultHPct / 2) * 100) / 100),
            w: defaultWPct,
            h: defaultHPct
        };
    }
    if (!Number.isFinite(w) || w <= 0) w = defaultWPct;
    if (!Number.isFinite(h) || h <= 0) h = defaultHPct;

    const cleanX = Math.max(0, Math.min(100, x));
    const cleanY = Math.max(0, Math.min(100, y));
    const cleanW = Math.max(0.1, Math.min(100 - cleanX, w));
    const cleanH = Math.max(0.1, Math.min(100 - cleanY, h));

    return {
        x: Math.round(cleanX * 100) / 100,
        y: Math.round(cleanY * 100) / 100,
        w: Math.round(cleanW * 100) / 100,
        h: Math.round(cleanH * 100) / 100
    };
}

export function expandAiBox(box: BoundingBox, expandXRatio: number, expandYRatio: number): BoundingBox {
    const xPad = Math.max(1, box.w * expandXRatio);
    const yPad = Math.max(1, box.h * expandYRatio);
    const nextX = Math.max(0, box.x - xPad);
    const nextY = Math.max(0, box.y - yPad);
    const nextW = Math.min(100 - nextX, box.w + (xPad * 2));
    const nextH = Math.min(100 - nextY, box.h + (yPad * 2));
    return { x: nextX, y: nextY, w: nextW, h: nextH };
}

export function computeTextMaskDilatedRoiFromBuffer(
    rgba: Uint8Array,
    imgW: number,
    imgH: number,
    rawBox: any,
    options: any = {}
): BoundingBox {
    const normalized = normalizeAiBlockBox(rawBox, imgW, imgH);
    if (!rgba || imgW <= 0 || imgH <= 0) return normalized;

    const searchBox = expandAiBox(normalized, 0.08, 0.08);
    const sx = Math.max(0, Math.min(imgW - 1, Math.round((searchBox.x / 100) * imgW)));
    const sy = Math.max(0, Math.min(imgH - 1, Math.round((searchBox.y / 100) * imgH)));
    const sw = Math.max(4, Math.min(imgW - sx, Math.round((searchBox.w / 100) * imgW)));
    const sh = Math.max(4, Math.min(imgH - sy, Math.round((searchBox.h / 100) * imgH)));

    const darkThreshold = options.darkThreshold || 140;
    const paddingPx = options.paddingPx !== undefined ? options.paddingPx : 6;

    const rawBinary = new Uint8Array(sw * sh);
    let darkPixelCount = 0;

    for (let ly = 0; ly < sh; ly++) {
        const rowOffset = (sy + ly) * imgW;
        for (let lx = 0; lx < sw; lx++) {
            const idx = (rowOffset + (sx + lx)) * 4;
            const r = rgba[idx];
            const g = rgba[idx + 1];
            const b = rgba[idx + 2];
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

            if (luminance <= darkThreshold) {
                rawBinary[ly * sw + lx] = 1;
                darkPixelCount++;
            }
        }
    }

    if (darkPixelCount < 4 || darkPixelCount > (sw * sh * 0.90)) {
        return normalized;
    }

    const visited = new Uint8Array(sw * sh);
    const cleanTextMask = new Uint8Array(sw * sh);
    let validGlyphCount = 0;
    const glyphSizes: number[] = [];

    for (let ly = 0; ly < sh; ly++) {
        for (let lx = 0; lx < sw; lx++) {
            const pos = ly * sw + lx;
            if (rawBinary[pos] === 1 && visited[pos] === 0) {
                let compMinX = lx, compMaxX = lx, compMinY = ly, compMaxY = ly;
                let compPixelCount = 0;
                const compPixels: number[] = [];

                const queue = [pos];
                visited[pos] = 1;

                while (queue.length > 0) {
                    const curr = queue.pop()!;
                    const cy = Math.floor(curr / sw);
                    const cx = curr % sw;
                    compPixelCount++;
                    compPixels.push(curr);

                    if (cx < compMinX) compMinX = cx;
                    if (cx > compMaxX) compMaxX = cx;
                    if (cy < compMinY) compMinY = cy;
                    if (cy > compMaxY) compMaxY = cy;

                    const neighbors = [
                        cy > 0 ? curr - sw : -1,
                        cy < sh - 1 ? curr + sw : -1,
                        cx > 0 ? curr - 1 : -1,
                        cx < sw - 1 ? curr + 1 : -1
                    ];

                    for (const n of neighbors) {
                        if (n >= 0 && rawBinary[n] === 1 && visited[n] === 0) {
                            visited[n] = 1;
                            queue.push(n);
                        }
                    }
                }

                const compW = compMaxX - compMinX + 1;
                const compH = compMaxY - compMinY + 1;

                const isBorderLine = (compW > sw * 0.75 && compH <= 4) || (compH > sh * 0.75 && compW <= 4);
                const isGiantHairOrFrame = (compW > sw * 0.85 && compH > sh * 0.7) ||
                                          (compPixelCount > (sw * sh * 0.45)) ||
                                          (compH > sh * 0.65 && (compMaxY === sh - 1 || compMinY === 0));
                const isTinyNoise = compPixelCount < 3 && compW < 2 && compH < 2;

                if (!isBorderLine && !isGiantHairOrFrame && !isTinyNoise) {
                    for (let i = 0; i < compPixels.length; i++) {
                        cleanTextMask[compPixels[i]] = 1;
                    }
                    validGlyphCount++;
                    glyphSizes.push(Math.max(compW, compH));
                }
            }
        }
    }

    if (validGlyphCount === 0) {
        return normalized;
    }

    let medianGlyphSize = 16;
    if (glyphSizes.length > 0) {
        glyphSizes.sort((a, b) => a - b);
        medianGlyphSize = glyphSizes[Math.floor(glyphSizes.length / 2)];
    } else {
        medianGlyphSize = Math.min(sw, sh) * 0.25;
    }

    const adaptiveRadX = Math.max(2, Math.min(8, Math.round(medianGlyphSize * 0.15)));
    const adaptiveRadY = Math.max(1, Math.min(6, Math.round(medianGlyphSize * 0.10)));

    const radX = options.dilationRadiusX !== undefined ? options.dilationRadiusX : (options.dilationRadius !== undefined ? options.dilationRadius : adaptiveRadX);
    const radY = options.dilationRadiusY !== undefined ? options.dilationRadiusY : (options.dilationRadius !== undefined ? options.dilationRadius : adaptiveRadY);
    const radXSq = radX * radX;
    const radYSq = radY * radY;

    let minX = sw;
    let minY = sh;
    let maxX = -1;
    let maxY = -1;

    for (let ly = 0; ly < sh; ly++) {
        for (let lx = 0; lx < sw; lx++) {
            if (cleanTextMask[ly * sw + lx] === 1) {
                const yMin = Math.max(0, ly - radY);
                const yMax = Math.min(sh - 1, ly + radY);
                const xMin = Math.max(0, lx - radX);
                const xMax = Math.min(sw - 1, lx + radX);

                for (let dy = yMin; dy <= yMax; dy++) {
                    const yDist = dy - ly;
                    for (let dx = xMin; dx <= xMax; dx++) {
                        const xDist = dx - lx;
                        if ((xDist * xDist) / radXSq + (yDist * yDist) / radYSq <= 1.0) {
                            if (dx < minX) minX = dx;
                            if (dx > maxX) maxX = dx;
                            if (dy < minY) minY = dy;
                            if (dy > maxY) maxY = dy;
                        }
                    }
                }
            }
        }
    }

    if (maxX === -1 || maxY === -1) {
        return normalized;
    }

    const roiMinX = Math.max(0, sx + minX - paddingPx);
    const roiMinY = Math.max(0, sy + minY - paddingPx);
    const roiMaxX = Math.min(imgW - 1, sx + maxX + paddingPx);
    const roiMaxY = Math.min(imgH - 1, sy + maxY + paddingPx);

    const roiW = roiMaxX - roiMinX + 1;
    const roiH = roiMaxY - roiMinY + 1;

    const inpaintBox: BoundingBox = {
        x: Math.round(((roiMinX / imgW) * 100) * 100) / 100,
        y: Math.round(((roiMinY / imgH) * 100) * 100) / 100,
        w: Math.round(((roiW / imgW) * 100) * 100) / 100,
        h: Math.round(((roiH / imgH) * 100) * 100) / 100
    };

    if (inpaintBox.w < 1 || inpaintBox.h < 1) {
        return normalized;
    }

    return inpaintBox;
}

export function detectSpeechBubbleAtPointFromBuffer(
    rgba: Uint8Array,
    imgW: number,
    imgH: number,
    clickPixelX: number,
    clickPixelY: number,
    _options: any = {}
): any {
    if (!rgba || imgW <= 0 || imgH <= 0) return null;

    const brightnessMap = getImageBrightnessMapFromBuffer(rgba, imgW, imgH);

    const startX = Math.max(0, Math.min(imgW - 1, Math.round(clickPixelX)));
    const startY = Math.max(0, Math.min(imgH - 1, Math.round(clickPixelY)));

    const probeRadius = Math.max(45, Math.min(120, Math.round(Math.min(imgW, imgH) * 0.06)));
    const lambda = 0.25;

    let bestSeedX = startX;
    let bestSeedY = startY;
    const initialBrightness = brightnessMap[startY * imgW + startX];
    let bestSeedScore = initialBrightness / 255;

    for (let dy = -probeRadius; dy <= probeRadius; dy += 2) {
        for (let dx = -probeRadius; dx <= probeRadius; dx += 2) {
            const px = startX + dx;
            const py = startY + dy;
            if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
                const dist = Math.hypot(dx, dy);
                if (dist <= probeRadius) {
                    const b = brightnessMap[py * imgW + px];
                    const normBrightness = b / 255;
                    const normDist = dist / probeRadius;
                    const score = normBrightness - (lambda * normDist);
                    if (score > bestSeedScore) {
                        bestSeedScore = score;
                        bestSeedX = px;
                        bestSeedY = py;
                    }
                }
            }
        }
    }

    const curStartX = bestSeedX;
    const curStartY = bestSeedY;

    const seedBrightness = brightnessMap[curStartY * imgW + curStartX];
    if (seedBrightness < 80) {
        return null;
    }

    const bubbleThreshold = Math.max(130, Math.min(238, Math.round(seedBrightness * 0.78)));
    const maxHalfW = Math.min(Math.round(imgW * 0.45), 600);
    const maxHalfH = Math.min(Math.round(imgH * 0.45), 700);

    const winMinX = Math.max(0, curStartX - maxHalfW);
    const winMaxX = Math.min(imgW - 1, curStartX + maxHalfW);
    const winMinY = Math.max(0, curStartY - maxHalfH);
    const winMaxY = Math.min(imgH - 1, curStartY + maxHalfH);

    const winW = winMaxX - winMinX + 1;
    const winH = winMaxY - winMinY + 1;

    const visited = new Uint8Array(winW * winH);
    const queueX = new Int32Array(winW * winH);
    const queueY = new Int32Array(winW * winH);
    let head = 0;
    let tail = 0;

    const startLocalX = curStartX - winMinX;
    const startLocalY = curStartY - winMinY;

    queueX[tail] = curStartX;
    queueY[tail] = curStartY;
    tail++;
    visited[startLocalY * winW + startLocalX] = 1;

    const maxAllowedPixels = Math.floor(imgW * imgH * 0.40);
    let initialCount = 0;

    while (head < tail && initialCount < maxAllowedPixels) {
        const cx = queueX[head];
        const cy = queueY[head];
        head++;
        initialCount++;

        const neighbors = [
            [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1],
            [cx + 1, cy + 1], [cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1]
        ];

        for (let i = 0; i < 8; i++) {
            const nx = neighbors[i][0];
            const ny = neighbors[i][1];

            if (nx >= winMinX && nx <= winMaxX && ny >= winMinY && ny <= winMaxY) {
                const lx = nx - winMinX;
                const ly = ny - winMinY;
                const vIdx = ly * winW + lx;

                if (!visited[vIdx]) {
                    const br = brightnessMap[ny * imgW + nx];
                    if (br >= bubbleThreshold) {
                        visited[vIdx] = 1;
                        queueX[tail] = nx;
                        queueY[tail] = ny;
                        tail++;
                    }
                }
            }
        }
    }

    const outside = new Uint8Array(winW * winH);
    let outHead = 0;
    let outTail = 0;

    const pushOutside = (lx: number, ly: number) => {
        const idx = ly * winW + lx;
        if (idx < 0 || idx >= visited.length) return;
        if (visited[idx] === 1 || outside[idx] === 1) return;
        outside[idx] = 1;
        queueX[outTail] = winMinX + lx;
        queueY[outTail] = winMinY + ly;
        outTail++;
    };

    for (let x = 0; x < winW; x++) {
        pushOutside(x, 0);
        if (winH > 1) pushOutside(x, winH - 1);
    }
    for (let y = 1; y < winH - 1; y++) {
        pushOutside(0, y);
        if (winW > 1) pushOutside(winW - 1, y);
    }

    while (outHead < outTail) {
        const cx = queueX[outHead];
        const cy = queueY[outHead];
        outHead++;

        const neighbors = [
            [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]
        ];

        for (let i = 0; i < 4; i++) {
            const nx = neighbors[i][0];
            const ny = neighbors[i][1];

            if (nx >= winMinX && nx <= winMaxX && ny >= winMinY && ny <= winMaxY) {
                const lx = nx - winMinX;
                const ly = ny - winMinY;
                const vIdx = ly * winW + lx;

                if (visited[vIdx] === 0 && outside[vIdx] === 0) {
                    outside[vIdx] = 1;
                    queueX[outTail] = nx;
                    queueY[outTail] = ny;
                    outTail++;
                }
            }
        }
    }

    const dt = new Int32Array(winW * winH);
    const INF = 999999;

    for (let y = 0; y < winH; y++) {
        for (let x = 0; x < winW; x++) {
            const idx = y * winW + x;
            const isInside = (visited[idx] === 1 || outside[idx] === 0);
            if (!isInside) {
                dt[idx] = 0;
            } else {
                let minNeighbor = INF;
                if (x > 0) minNeighbor = Math.min(minNeighbor, dt[idx - 1] + 5);
                if (y > 0) minNeighbor = Math.min(minNeighbor, dt[idx - winW] + 5);
                if (x > 0 && y > 0) minNeighbor = Math.min(minNeighbor, dt[idx - winW - 1] + 7);
                if (x < winW - 1 && y > 0) minNeighbor = Math.min(minNeighbor, dt[idx - winW + 1] + 7);
                dt[idx] = minNeighbor === INF ? 5 : minNeighbor;
            }
        }
    }

    let maxDistVal = 0;
    for (let y = winH - 1; y >= 0; y--) {
        for (let x = winW - 1; x >= 0; x--) {
            const idx = y * winW + x;
            if (dt[idx] > 0) {
                let minNeighbor = dt[idx];
                if (x < winW - 1) minNeighbor = Math.min(minNeighbor, dt[idx + 1] + 5);
                if (y < winH - 1) minNeighbor = Math.min(minNeighbor, dt[idx + winW] + 5);
                if (x < winW - 1 && y < winH - 1) minNeighbor = Math.min(minNeighbor, dt[idx + winW + 1] + 7);
                if (x > 0 && y < winH - 1) minNeighbor = Math.min(minNeighbor, dt[idx + winW - 1] + 7);
                dt[idx] = minNeighbor;
                if (minNeighbor > maxDistVal) maxDistVal = minNeighbor;
            }
        }
    }

    if (maxDistVal < 15) {
        return null;
    }

    const seedLocalX = curStartX - winMinX;
    const seedLocalY = curStartY - winMinY;

    const findPeak = (stX: number, stY: number) => {
        let cx = stX;
        let cy = stY;
        let cDt = dt[cy * winW + cx];

        let guard = 0;
        while (guard < 1000) {
            guard++;
            let bestNx = cx;
            let bestNy = cy;
            let bestNDt = cDt;

            const nbs = [
                [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1],
                [cx + 1, cy + 1], [cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1]
            ];

            for (let i = 0; i < 8; i++) {
                const nx = nbs[i][0];
                const ny = nbs[i][1];
                if (nx >= 0 && nx < winW && ny >= 0 && ny < winH) {
                    const nd = dt[ny * winW + nx];
                    if (nd > bestNDt) {
                        bestNDt = nd;
                        bestNx = nx;
                        bestNy = ny;
                    }
                }
            }

            if (bestNDt > cDt) {
                cx = bestNx;
                cy = bestNy;
                cDt = bestNDt;
            } else {
                break;
            }
        }
        return { peakX: cx, peakY: cy, peakDt: cDt };
    };

    const primaryPeak = findPeak(seedLocalX, seedLocalY);
    const primaryPeakX = primaryPeak.peakX;
    const primaryPeakY = primaryPeak.peakY;

    const labels = new Uint8Array(winW * winH);
    const path = new Int32Array(1500);

    const isSeparatedBySaddle = (destX: number, destY: number) => {
        const dx = destX - primaryPeakX;
        const dy = destY - primaryPeakY;
        const dist = Math.hypot(dx, dy);
        if (dist <= 30) return false;

        const steps = Math.min(100, Math.max(10, Math.floor(dist / 3)));
        let minDtOnLine = INF;

        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const px = Math.round(primaryPeakX + t * dx);
            const py = Math.round(primaryPeakY + t * dy);
            if (px >= 0 && px < winW && py >= 0 && py < winH) {
                const d = dt[py * winW + px];
                if (d < minDtOnLine) minDtOnLine = d;
            }
        }

        const neckThreshold = Math.max(12, Math.floor(primaryPeak.peakDt * 0.45));
        return (minDtOnLine <= neckThreshold);
    };

    for (let y = 0; y < winH; y++) {
        for (let x = 0; x < winW; x++) {
            const idx = y * winW + x;
            if (dt[idx] === 0 || labels[idx] > 0) continue;

            let pathLen = 0;
            let cx = x;
            let cy = y;
            let curD = dt[idx];
            let assignedLabel = 0;

            while (pathLen < 1450) {
                const pIdx = cy * winW + cx;
                if (labels[pIdx] > 0) {
                    assignedLabel = labels[pIdx];
                    break;
                }

                path[pathLen++] = pIdx;

                let bestNx = cx;
                let bestNy = cy;
                let bestNDt = curD;

                const nbs = [
                    [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1],
                    [cx + 1, cy + 1], [cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1]
                ];

                for (let i = 0; i < 8; i++) {
                    const nx = nbs[i][0];
                    const ny = nbs[i][1];
                    if (nx >= 0 && nx < winW && ny >= 0 && ny < winH) {
                        const nd = dt[ny * winW + nx];
                        if (nd > bestNDt) {
                            bestNDt = nd;
                            bestNx = nx;
                            bestNy = ny;
                        }
                    }
                }

                if (bestNDt > curD) {
                    cx = bestNx;
                    cy = bestNy;
                    curD = bestNDt;
                } else {
                    const isOtherBubble = isSeparatedBySaddle(cx, cy);
                    assignedLabel = isOtherBubble ? 2 : 1;
                    break;
                }
            }

            if (assignedLabel === 0) assignedLabel = 1;

            for (let i = 0; i < pathLen; i++) {
                labels[path[i]] = assignedLabel;
            }
        }
    }

    let minX = winMaxX;
    let maxX = winMinX;
    let minY = winMaxY;
    let maxY = winMinY;
    let filledCount = 0;

    for (let ly = 0; ly < winH; ly++) {
        for (let lx = 0; lx < winW; lx++) {
            const vIdx = ly * winW + lx;
            if (labels[vIdx] === 1) {
                const absX = winMinX + lx;
                const absY = winMinY + ly;
                if (absX < minX) minX = absX;
                if (absX > maxX) maxX = absX;
                if (absY < minY) minY = absY;
                if (absY > maxY) maxY = absY;
                filledCount++;
            }
        }
    }

    const bw = maxX - minX;
    const bh = maxY - minY;

    if (bw < 12 || bh < 12 || filledCount < 20) {
        return null;
    }

    const cleanMinX = Math.max(0, Math.min(imgW - 1, minX));
    const cleanMinY = Math.max(0, Math.min(imgH - 1, minY));
    const cleanBw = Math.max(12, Math.min(imgW - cleanMinX, bw));
    const cleanBh = Math.max(12, Math.min(imgH - cleanMinY, bh));

    const finalBox: BoundingBox = {
        x: (cleanMinX / imgW) * 100,
        y: (cleanMinY / imgH) * 100,
        w: (cleanBw / imgW) * 100,
        h: (cleanBh / imgH) * 100
    };

    return {
        box: finalBox,
        pixelBox: {
            bx: cleanMinX,
            by: cleanMinY,
            bw: cleanBw,
            bh: cleanBh
        }
    };
}

// Worker message handling
if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
    (self as any).onmessage = function (e: MessageEvent) {
        const data = e.data;
        if (!data) return;
        const { requestId, type } = data;

        try {
            if (type === 'DETECT_SPEECH_BUBBLE') {
                const rgba = new Uint8Array(data.rgbaBuffer);
                const result = detectSpeechBubbleAtPointFromBuffer(
                    rgba,
                    data.width,
                    data.height,
                    data.clickPixelX,
                    data.clickPixelY,
                    data.options
                );
                (self as any).postMessage({ requestId, type: 'DETECT_SPEECH_BUBBLE_RESULT', result });
            } else if (type === 'COMPUTE_TEXT_MASK_DILATED_ROI') {
                const rgba = new Uint8Array(data.rgbaBuffer);
                const result = computeTextMaskDilatedRoiFromBuffer(
                    rgba,
                    data.width,
                    data.height,
                    data.rawBox,
                    data.options
                );
                (self as any).postMessage({ requestId, type: 'COMPUTE_TEXT_MASK_DILATED_ROI_RESULT', result });
            }
        } catch (err: any) {
            (self as any).postMessage({ requestId, type: 'ERROR', error: err.message || String(err) });
        }
    };
}
