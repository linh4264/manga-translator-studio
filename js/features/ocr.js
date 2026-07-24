// OCR Processing & Bubble Snap to Contours
import { DEFAULT_AI_BLOCK_BOX, isWeakTranslationModel, isFlash31LiteModel } from '../core/state.js';

const AI_EDGE_SAFETY_MARGIN = 4;

export function isSuspiciousAiBlockBox(box) {
    if (!box) return true;

    const x = Number(box.x);
    const y = Number(box.y);
    const w = Number(box.w);
    const h = Number(box.h);

    if (![x, y, w, h].every(Number.isFinite)) return true;
    if (w <= 0 || h <= 0) return true;
    if (x < 0 || y < 0 || x > 100 || y > 100 || x + w > 100 || y + h > 100) return true;

    const touchesEdge = (
        x <= AI_EDGE_SAFETY_MARGIN ||
        y <= AI_EDGE_SAFETY_MARGIN ||
        x + w >= 100 - AI_EDGE_SAFETY_MARGIN ||
        y + h >= 100 - AI_EDGE_SAFETY_MARGIN
    );

    const isSmallBubble = w <= 35 && h <= 35;

    return touchesEdge && isSmallBubble;
}

export function expandAiBox(box, expandXRatio, expandYRatio) {
    const xPad = Math.max(1, box.w * expandXRatio);
    const yPad = Math.max(1, box.h * expandYRatio);
    const nextX = Math.max(0, box.x - xPad);
    const nextY = Math.max(0, box.y - yPad);
    const nextW = Math.min(100 - nextX, box.w + (xPad * 2));
    const nextH = Math.min(100 - nextY, box.h + (yPad * 2));
    return {
        x: nextX,
        y: nextY,
        w: nextW,
        h: nextH
    };
}

export function refineAiBlockBox(box, imageData, modelId) {
    const normalized = normalizeAiBlockBox(box);
    if (!imageData) return normalized;

    const weakModel = isWeakTranslationModel(modelId) || isFlash31LiteModel(modelId);
    const lightExpanded = weakModel ? expandAiBox(normalized, 0.05, 0.06) : expandAiBox(normalized, 0.04, 0.05);

    // Dùng độ giãn vừa phải đối với mô hình Lite để snap không bị văng sang nét vẽ nhân vật bên ngoài
    const seedBox = weakModel ? expandAiBox(normalized, 0.06, 0.08) : expandAiBox(normalized, 0.04, 0.05);
    const refined = snapBoxToContours(seedBox, imageData, {
        searchScale: weakModel ? 1.25 : 1.05,
        sampleFractions: weakModel ? [0.3, 0.5, 0.7] : [0.35, 0.5, 0.65],
        darkThreshold: weakModel ? 132 : 130
    });

    const fallbackBox = weakModel ? (isSuspiciousAiBlockBox(lightExpanded) ? normalized : lightExpanded) : normalized;

    if (!refined || isSuspiciousAiBlockBox(refined)) {
        return fallbackBox;
    }

    const normalizedCenterX = normalized.x + (normalized.w / 2);
    const normalizedCenterY = normalized.y + (normalized.h / 2);
    const refinedCenterX = refined.x + (refined.w / 2);
    const refinedCenterY = refined.y + (refined.h / 2);
    const centerShift = Math.max(
        Math.abs(refinedCenterX - normalizedCenterX),
        Math.abs(refinedCenterY - normalizedCenterY)
    );
    const areaRatio = (refined.w * refined.h) / Math.max(1, normalized.w * normalized.h);

    if (weakModel && (centerShift > 12 || areaRatio < 0.5 || areaRatio > 2.4)) {
        return fallbackBox;
    }

    return refined;
}

export function normalizeAiBlockBox(box) {
    if (!box) {
        return { ...DEFAULT_AI_BLOCK_BOX };
    }

    let x = Number(box.x);
    let y = Number(box.y);
    let w = Number(box.w);
    let h = Number(box.h);

    // Kiểm tra tính hợp lệ cơ bản
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
        return { ...DEFAULT_AI_BLOCK_BOX };
    }

    // Tự động nhận dạng hệ toạ độ 0.0 - 1.0 (Nếu tất cả đều <= 1.0 và chiều rộng, chiều cao > 0)
    if (x <= 1.0 && y <= 1.0 && w <= 1.0 && h <= 1.0) {
        x *= 100;
        y *= 100;
        w *= 100;
        h *= 100;
    }
    // Tự động nhận dạng hệ toạ độ 0 - 1000 (Thang đo Object Detection chuẩn của Gemini)
    else if ((x > 100 || y > 100 || w > 100 || h > 100 || (x + w > 100) || (y + h > 100)) && (x <= 1000 && y <= 1000 && w <= 1000 && h <= 1000)) {
        x /= 10;
        y /= 10;
        w /= 10;
        h /= 10;
    }

    // Giới hạn giá trị trong khoảng hợp lệ [0, 100]
    const cleanX = Math.max(0, Math.min(100, x));
    const cleanY = Math.max(0, Math.min(100, y));
    const cleanW = Math.max(1, Math.min(100 - cleanX, w));
    const cleanH = Math.max(1, Math.min(100 - cleanY, h));

    return {
        x: cleanX,
        y: cleanY,
        w: cleanW,
        h: cleanH
    };
}

// Tự động tinh chỉnh (snap) 4 cạnh của bounding box khớp sát vào đường viền đen gần nhất của bong bóng thoại
export function snapBoxToContours(box, imageData, options = {}) {
    if (!imageData) return box;

    const imgW = imageData.width;
    const imgH = imageData.height;
    const brightnessMap = getImageBrightnessMap(imageData);
    const darkThreshold = options.darkThreshold || 130;
    const searchScale = options.searchScale || 1;
    const sampleFractions = options.sampleFractions || [0.35, 0.5, 0.65];

    // Chuyển sang pixel
    let bx = Math.round((box.x / 100) * imgW);
    let by = Math.round((box.y / 100) * imgH);
    let bw = Math.round((box.w / 100) * imgW);
    let bh = Math.round((box.h / 100) * imgH);

    bx = Math.max(0, Math.min(imgW - 1, bx));
    by = Math.max(0, Math.min(imgH - 1, by));
    bw = Math.max(1, Math.min(imgW - bx, bw));
    bh = Math.max(1, Math.min(imgH - by, bh));

    const isDark = (x, y) => {
        if (x < 0 || x >= imgW || y < 0 || y >= imgH) return false;
        const idx = Math.round(y) * imgW + Math.round(x);
        return brightnessMap[idx] < darkThreshold; // Ngưỡng màu tối cho nét vẽ viền đen
    };

    // Giới hạn quét tối đa (8% kích thước hoặc 50px)
    const maxScanX = Math.min(70, Math.round(imgW * 0.08 * searchScale));
    const maxScanY = Math.min(70, Math.round(imgH * 0.08 * searchScale));

    const sampleXs = sampleFractions.map(f => bx + Math.floor(bw * f));
    const sampleYs = sampleFractions.map(f => by + Math.floor(bh * f));

    // 1. Tìm cạnh trên (Top) mới
    let newTop = by;
    for (let d = 0; d <= maxScanY; d++) {
        let hitCount = 0;
        for (let i = 0; i < sampleXs.length; i++) {
            if (isDark(sampleXs[i], by - d)) hitCount++;
        }
        if (hitCount >= Math.max(2, Math.ceil(sampleXs.length / 2))) {
            newTop = by - d;
            break;
        }
        hitCount = 0;
        for (let i = 0; i < sampleXs.length; i++) {
            if (isDark(sampleXs[i], by + d)) hitCount++;
        }
        if (hitCount >= Math.max(2, Math.ceil(sampleXs.length / 2)) && by + d < by + bh / 2) {
            newTop = by + d;
            break;
        }
    }

    // 2. Tìm cạnh dưới (Bottom) mới
    let newBottom = by + bh;
    for (let d = 0; d <= maxScanY; d++) {
        let hitCount = 0;
        for (let i = 0; i < sampleXs.length; i++) {
            if (isDark(sampleXs[i], by + bh + d)) hitCount++;
        }
        if (hitCount >= Math.max(2, Math.ceil(sampleXs.length / 2))) {
            newBottom = by + bh + d;
            break;
        }
        hitCount = 0;
        for (let i = 0; i < sampleXs.length; i++) {
            if (isDark(sampleXs[i], by + bh - d)) hitCount++;
        }
        if (hitCount >= Math.max(2, Math.ceil(sampleXs.length / 2)) && by + bh - d > by + bh / 2) {
            newBottom = by + bh - d;
            break;
        }
    }

    // 3. Tìm cạnh trái (Left) mới
    let newLeft = bx;
    for (let d = 0; d <= maxScanX; d++) {
        let hitCount = 0;
        for (let i = 0; i < sampleYs.length; i++) {
            if (isDark(bx - d, sampleYs[i])) hitCount++;
        }
        if (hitCount >= Math.max(2, Math.ceil(sampleYs.length / 2))) {
            newLeft = bx - d;
            break;
        }
        hitCount = 0;
        for (let i = 0; i < sampleYs.length; i++) {
            if (isDark(bx + d, sampleYs[i])) hitCount++;
        }
        if (hitCount >= Math.max(2, Math.ceil(sampleYs.length / 2)) && bx + d < bx + bw / 2) {
            newLeft = bx + d;
            break;
        }
    }

    // 4. Tìm cạnh phải (Right) mới
    let newRight = bx + bw;
    for (let d = 0; d <= maxScanX; d++) {
        let hitCount = 0;
        for (let i = 0; i < sampleYs.length; i++) {
            if (isDark(bx + bw + d, sampleYs[i])) hitCount++;
        }
        if (hitCount >= Math.max(2, Math.ceil(sampleYs.length / 2))) {
            newRight = bx + bw + d;
            break;
        }
        hitCount = 0;
        for (let i = 0; i < sampleYs.length; i++) {
            if (isDark(bx + bw - d, sampleYs[i])) hitCount++;
        }
        if (hitCount >= Math.max(2, Math.ceil(sampleYs.length / 2)) && bx + bw - d > bx + bw / 2) {
            newRight = bx + bw - d;
            break;
        }
    }

    // Tính toán kích thước mới
    let finalBx = newLeft;
    let finalBy = newTop;
    let finalBw = newRight - newLeft;
    let finalBh = newBottom - newTop;

    // Fallback nếu kết quả bất thường
    if (finalBw <= 5 || finalBh <= 5) {
        return box;
    }

    return {
        x: (finalBx / imgW) * 100,
        y: (finalBy / imgH) * 100,
        w: (finalBw / imgW) * 100,
        h: (finalBh / imgH) * 100
    };
}

export function getImageBrightnessMap(imageData) {
    if (!imageData) return [];
    if (imageData._brightnessMap) return imageData._brightnessMap;

    const w = imageData.width;
    const h = imageData.height;
    const data = imageData.data;
    const map = new Uint8Array(w * h);

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        map[i / 4] = brightness;
    }

    imageData._brightnessMap = map;
    return map;
}

function getMaskCacheKey(page, block) {
    return `${page.id}_${block.id}_${block.box.x}_${block.box.y}_${block.box.w}_${block.box.h}_${block.style.bgColor}_${block.style.bgOpacity}`;
}

export function collectBubbleSamples(imageData, bx, by, bw, bh, brightnessMap) {
    const imgW = imageData.width;
    const step = Math.max(2, Math.floor(Math.min(bw, bh) / 18));
    const samples = [];

    for (let y = by; y < by + bh; y += step) {
        for (let x = bx; x < bx + bw; x += step) {
            if (x >= 0 && x < imageData.width && y >= 0 && y < imageData.height) {
                samples.push({
                    x: x,
                    y: y,
                    brightness: brightnessMap[y * imgW + x]
                });
            }
        }
    }

    samples.sort((a, b) => a.brightness - b.brightness);
    return samples;
}

export function pickBubbleSeed(samples, bx, by, bw, bh) {
    if (!samples.length) return null;

    const centerX = bx + (bw / 2);
    const centerY = by + (bh / 2);
    let best = null;
    let bestScore = -Infinity;

    const minCenterX = bx + (bw * 0.2);
    const maxCenterX = bx + (bw * 0.8);
    const minCenterY = by + (bh * 0.2);
    const maxCenterY = by + (bh * 0.8);

    samples.forEach((sample) => {
        if (sample.x < minCenterX || sample.x > maxCenterX || sample.y < minCenterY || sample.y > maxCenterY) {
            return;
        }

        const distX = Math.abs(sample.x - centerX) / Math.max(1, bw);
        const distY = Math.abs(sample.y - centerY) / Math.max(1, bh);
        const centerBias = (distX + distY) * 42;
        const score = sample.brightness - centerBias;

        if (score > bestScore) {
            bestScore = score;
            best = sample;
        }
    });

    return best || samples[samples.length - 1];
}

// Thuật toán loang màu Flood Fill để tự động tạo mặt nạ đè bong bóng thoại
export function computeBubbleMask(page, block, imageData) {
    if (!imageData) return null;

    // Khởi tạo key bộ nhớ tạm
    const cacheKey = getMaskCacheKey(page, block);
    if (block.maskCache && block.maskCache.key === cacheKey) {
        return block.maskCache.canvas;
    }

    const imgW = imageData.width;
    const imgH = imageData.height;
    const brightnessMap = getImageBrightnessMap(imageData);

    // Chuyển độ tọa độ box (%) thành pixel thực tế
    let bx = Math.round((block.box.x / 100) * imgW);
    let by = Math.round((block.box.y / 100) * imgH);
    let bw = Math.round((block.box.w / 100) * imgW);
    let bh = Math.round((block.box.h / 100) * imgH);

    bx = Math.max(0, Math.min(imgW - 1, bx));
    by = Math.max(0, Math.min(imgH - 1, by));
    bw = Math.max(1, Math.min(imgW - bx, bw));
    bh = Math.max(1, Math.min(imgH - by, bh));

    const samples = collectBubbleSamples(imageData, bx, by, bw, bh, brightnessMap);
    if (!samples.length) {
        return null;
    }

    const sampleMedian = samples[Math.floor(samples.length / 2)].brightness;
    const sampleP75 = samples[Math.floor(samples.length * 0.75)].brightness;
    const sampleP90 = samples[Math.floor(samples.length * 0.9)].brightness;
    const threshold = Math.max(
        142,
        Math.min(236, Math.round((sampleMedian * 0.35) + (sampleP75 * 0.45) + (sampleP90 * 0.20) - 12))
    );
    const bridgeThreshold = Math.max(118, threshold - 28);
    const textBridgeMargin = Math.max(2, Math.round(Math.min(bw, bh) * 0.04));

    // Nếu vùng này quá tối (không phải bong bóng thoại), trả về null để fallback vẽ hình dạng mặc định
    if (sampleP75 < 155) {
        return null;
    }

    const visited = new Uint8Array(bw * bh);
    const seed = pickBubbleSeed(samples, bx, by, bw, bh);
    if (!seed || seed.brightness < threshold) {
        return null;
    }

    const maxQueueSize = bw * bh;
    const queue = new Int32Array(maxQueueSize);
    let queueHead = 0;
    let queueTail = 0;

    const relSeedX = Math.max(0, Math.min(bw - 1, Math.round(seed.x - bx)));
    const relSeedY = Math.max(0, Math.min(bh - 1, Math.round(seed.y - by)));
    const seedIdx = relSeedY * bw + relSeedX;
    visited[seedIdx] = 1;
    queue[queueTail++] = (Math.round(seed.x) << 14) | (Math.round(seed.y) << 2) | 0;

    const dx = [0, 0, 1, -1];
    const dy = [1, -1, 0, 0];
    const maxDarkSteps = 1;
    let minX = relSeedX;
    let minY = relSeedY;
    let maxX = relSeedX;
    let maxY = relSeedY;

    let count = 0;
    const maxPixels = bw * bh;

    const isTextBridgePixel = (nx, ny) => {
        if (nx < bx + textBridgeMargin || nx >= bx + bw - textBridgeMargin) return false;
        if (ny < by + textBridgeMargin || ny >= by + bh - textBridgeMargin) return false;

        const centerBrightness = brightnessMap[ny * imgW + nx];
        if (centerBrightness >= bridgeThreshold) return true;
        if (centerBrightness < 28) return false;

        let brightNeighbors = 0;
        let darkNeighbors = 0;

        for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
                if (ox === 0 && oy === 0) continue;

                const px = nx + ox;
                const py = ny + oy;
                if (px < bx || px >= bx + bw || py < by || py >= by + bh) continue;

                const neighborBrightness = brightnessMap[py * imgW + px];
                if (neighborBrightness >= threshold) {
                    brightNeighbors++;
                } else if (neighborBrightness < bridgeThreshold) {
                    darkNeighbors++;
                }
            }
        }

        return brightNeighbors >= 5 && darkNeighbors <= 4;
    };

    // BFS loang tìm bong bóng thoại
    while (queueHead < queueTail) {
        const val = queue[queueHead++];
        const curX = val >> 14;
        const curY = (val >> 2) & 0xFFF;
        const darkSteps = val & 3;

        count++;
        if (count > maxPixels) break;

        const relCurX = curX - bx;
        const relCurY = curY - by;
        if (relCurX < minX) minX = relCurX;
        if (relCurY < minY) minY = relCurY;
        if (relCurX > maxX) maxX = relCurX;
        if (relCurY > maxY) maxY = relCurY;

        for (let i = 0; i < 4; i++) {
            const nx = curX + dx[i];
            const ny = curY + dy[i];

            if (nx >= bx && nx < bx + bw && ny >= by && ny < by + bh) {
                const rxVal = nx - bx;
                const ryVal = ny - by;
                const vIdx = ryVal * bw + rxVal;

                if (visited[vIdx] === 0) {
                    const brightness = brightnessMap[ny * imgW + nx];

                    if (brightness >= threshold) {
                        visited[vIdx] = 1;
                        if (queueTail < maxQueueSize) {
                            queue[queueTail++] = (nx << 14) | (ny << 2) | 0;
                        }
                    } else if (darkSteps < maxDarkSteps && (brightness >= bridgeThreshold || isTextBridgePixel(nx, ny))) {
                        visited[vIdx] = 1;
                        if (queueTail < maxQueueSize) {
                            queue[queueTail++] = (nx << 14) | (ny << 2) | (darkSteps + 1);
                        }
                    }
                }
            }
        }
    }

    // Lấp các lỗ kín bên trong bubble (để nền che không bị thủng qua chữ)
    const outside = new Uint8Array(bw * bh);
    queueHead = 0;
    queueTail = 0;

    const pushOutside = (relX, relY) => {
        const idx = relY * bw + relX;
        if (idx < 0 || idx >= visited.length) return;
        if (visited[idx] === 1 || outside[idx] === 1) return;
        outside[idx] = 1;
        const absX = bx + relX;
        const absY = by + relY;
        if (queueTail < maxQueueSize) {
            queue[queueTail++] = (absX << 14) | (absY << 2) | 0;
        }
    };

    for (let x = 0; x < bw; x++) {
        pushOutside(x, 0);
        if (bh > 1) pushOutside(x, bh - 1);
    }
    for (let y = 1; y < bh - 1; y++) {
        pushOutside(0, y);
        if (bw > 1) pushOutside(bw - 1, y);
    }

    while (queueHead < queueTail) {
        const val = queue[queueHead++];
        const curX = val >> 14;
        const curY = (val >> 2) & 0xFFF;

        for (let i = 0; i < 4; i++) {
            const nx = curX + dx[i];
            const ny = curY + dy[i];

            if (nx >= bx && nx < bx + bw && ny >= by && ny < by + bh) {
                const rxVal = nx - bx;
                const ryVal = ny - by;
                const vIdx = ryVal * bw + rxVal;
                if (visited[vIdx] === 0 && outside[vIdx] === 0) {
                    outside[vIdx] = 1;
                    if (queueTail < maxQueueSize) {
                        queue[queueTail++] = (nx << 14) | (ny << 2) | 0;
                    }
                }
            }
        }
    }

    const visitedRatio = count / maxPixels;
    const boxSpanX = maxX - minX + 1;
    const boxSpanY = maxY - minY + 1;
    const touchesEdge = minX <= 1 || minY <= 1 || maxX >= bw - 2 || maxY >= bh - 2;

    if (visitedRatio < 0.04 || (touchesEdge && visitedRatio < 0.18)) {
        return null;
    }

    const trimPad = Math.max(1, Math.round(Math.min(bw, bh) * 0.03));
    const finalBx = Math.max(0, minX - trimPad);
    const finalBy = Math.max(0, minY - trimPad);
    const finalBw = Math.min(bw - finalBx, boxSpanX + trimPad * 2);
    const finalBh = Math.min(bh - finalBy, boxSpanY + trimPad * 2);

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = finalBw;
    maskCanvas.height = finalBh;
    const maskCtx = maskCanvas.getContext('2d');
    const maskImgData = maskCtx.createImageData(finalBw, finalBh);

    const hexBgColor = block.style.bgColor || '#ffffff';
    const bgOpacity = block.style.bgOpacity !== undefined ? block.style.bgOpacity : 100;

    const cleanHex = hexBgColor.replace('#', '');
    const br = parseInt(cleanHex.substring(0, 2), 16) || 0;
    const bg = parseInt(cleanHex.substring(2, 4), 16) || 0;
    const bb = parseInt(cleanHex.substring(4, 6), 16) || 0;
    const ba = Math.round((bgOpacity / 100) * 255);

    for (let y = 0; y < finalBh; y++) {
        for (let x = 0; x < finalBw; x++) {
            const idx = (y + finalBy) * bw + (x + finalBx);
            const isInsideBubble = visited[idx] === 1 || outside[idx] === 0;
            const canvasIdx = (y * finalBw + x) * 4;

            if (isInsideBubble) {
                maskImgData.data[canvasIdx] = br;
                maskImgData.data[canvasIdx + 1] = bg;
                maskImgData.data[canvasIdx + 2] = bb;
                maskImgData.data[canvasIdx + 3] = ba;
            } else {
                maskImgData.data[canvasIdx] = 0;
                maskImgData.data[canvasIdx + 1] = 0;
                maskImgData.data[canvasIdx + 2] = 0;
                maskImgData.data[canvasIdx + 3] = 0;
            }
        }
    }

    maskCtx.putImageData(maskImgData, 0, 0);

    const maskDataUrl = maskCanvas.toDataURL();
    block.maskCache = {
        key: cacheKey,
        canvas: maskCanvas,
        finalBx,
        finalBy,
        finalBw,
        finalBh,
        dataUrl: maskDataUrl
    };

    return maskCanvas;
}

