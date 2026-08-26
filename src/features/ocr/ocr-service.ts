import { isWeakTranslationModel, isFlash31LiteModel, globalState, pushStateToHistory, savePageToDB, uiUpdateProcessingOverlay } from '../../core/state';
import { DEFAULT_AI_BLOCK_BOX, DEFAULT_BLOCK_SIZE_PX, DEFAULT_SFX_BLOCK_SIZE_PX } from '../../config/constants';
import { detectLocalTextRegions } from './local-ocr';
import { elements } from '../../core/elements';
import { showToast } from '../../core/utils/dom';
import { requestOverlayRender } from '../canvas/canvas-service';
import { BoundingBox, MangaBlock, MangaPage } from '../../types/index';

let ocrWorker: Worker | null = null;
let ocrRequestIdCounter = 0;
const ocrPendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

export function getOcrWorker(): Worker | null {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
    if (ocrWorker) return ocrWorker;

    try {
        ocrWorker = new Worker(new URL('../../workers/ocr.worker.ts', import.meta.url), { type: 'module' });
        ocrWorker.onmessage = (e: MessageEvent) => {
            const { requestId, type, result, error } = e.data || {};
            const handler = ocrPendingRequests.get(requestId);
            if (!handler) return;
            ocrPendingRequests.delete(requestId);

            if (type === 'ERROR' || error) {
                handler.reject(new Error(error || 'Worker error'));
            } else {
                handler.resolve(result);
            }
        };
        ocrWorker.onerror = (err) => {
            console.warn("OCR Worker error, falling back to sync execution:", err);
            ocrPendingRequests.forEach(({ reject }) => reject(err));
            ocrPendingRequests.clear();
        };
        return ocrWorker;
    } catch (e) {
        console.warn("Could not instantiate OCR worker, will use main thread sync fallback:", e);
        return null;
    }
}

export async function detectSpeechBubbleAtPointAsync(
    imageData: ImageData,
    clickPixelX: number,
    clickPixelY: number,
    options: any = {}
): Promise<any> {
    const worker = getOcrWorker();
    if (!worker || !imageData?.data) {
        return detectSpeechBubbleAtPoint(imageData, clickPixelX, clickPixelY, options);
    }

    const requestId = ++ocrRequestIdCounter;
    return new Promise<any>((resolve, reject) => {
        ocrPendingRequests.set(requestId, { resolve, reject });
        const rgbaCopy = new Uint8Array(imageData.data);
        worker.postMessage(
            {
                type: 'DETECT_SPEECH_BUBBLE',
                requestId,
                rgbaBuffer: rgbaCopy.buffer,
                width: imageData.width,
                height: imageData.height,
                clickPixelX,
                clickPixelY,
                options
            },
            [rgbaCopy.buffer]
        );
    }).catch((err) => {
        console.warn("OCR Worker bubble detection failed, fallback to sync:", err);
        return detectSpeechBubbleAtPoint(imageData, clickPixelX, clickPixelY, options);
    });
}

export async function computeTextMaskDilatedRoiAsync(
    rawBox: any,
    imageData: ImageData | null,
    options: any = {}
): Promise<BoundingBox> {
    const worker = getOcrWorker();
    if (!worker || !imageData?.data) {
        return computeTextMaskDilatedRoi(rawBox, imageData, options);
    }

    const requestId = ++ocrRequestIdCounter;
    return new Promise<BoundingBox>((resolve, reject) => {
        ocrPendingRequests.set(requestId, { resolve, reject });
        const rgbaCopy = new Uint8Array(imageData.data);
        worker.postMessage(
            {
                type: 'COMPUTE_TEXT_MASK_DILATED_ROI',
                requestId,
                rgbaBuffer: rgbaCopy.buffer,
                width: imageData.width,
                height: imageData.height,
                rawBox,
                options
            },
            [rgbaCopy.buffer]
        );
    }).catch((err) => {
        console.warn("OCR Worker mask dilation failed, fallback to sync:", err);
        return computeTextMaskDilatedRoi(rawBox, imageData, options);
    });
}

export async function refineAiBlockBoxAsync(
    box: any,
    imageData?: ImageData | null,
    _modelId?: string,
    blockType?: string
): Promise<BoundingBox> {
    let effectiveImageData = imageData;
    if (!effectiveImageData) {
        if (typeof globalState !== 'undefined' && globalState.activePageIndex >= 0) {
            effectiveImageData = globalState.pages[globalState.activePageIndex]?.imageDataCache || null;
        }
    }

    const imgW = (effectiveImageData && effectiveImageData.width > 0)
        ? effectiveImageData.width
        : ((typeof elements !== 'undefined' && elements?.mangaBgImage?.naturalWidth! > 0) ? elements.mangaBgImage!.naturalWidth : 1000);
    const imgH = (effectiveImageData && effectiveImageData.height > 0)
        ? effectiveImageData.height
        : ((typeof elements !== 'undefined' && elements?.mangaBgImage?.naturalHeight! > 0) ? elements.mangaBgImage!.naturalHeight : 1000);

    const normalizedType = (blockType || 'dialogue').toLowerCase();
    const isSfx = normalizedType === 'sfx';
    const targetBlockSizePx = isSfx ? (DEFAULT_SFX_BLOCK_SIZE_PX || 200) : (DEFAULT_BLOCK_SIZE_PX || 400);

    const normalized = normalizeAiBlockBox(box, imgW, imgH, blockType);
    const defaultWPct = Math.round(((targetBlockSizePx / imgW) * 100) * 100) / 100;
    const defaultHPct = Math.round(((targetBlockSizePx / imgH) * 100) * 100) / 100;

    normalized.w = defaultWPct;
    normalized.h = defaultHPct;
    normalized.x = Math.max(0, Math.min(100 - defaultWPct, normalized.x));
    normalized.y = Math.max(0, Math.min(100 - defaultHPct, normalized.y));

    const isBubbleType = normalizedType === 'dialogue' || normalizedType === 'thought';

    if (isBubbleType && effectiveImageData && effectiveImageData.data && effectiveImageData.width > 0 && effectiveImageData.height > 0) {
        try {
            const centerX = (normalized.x + normalized.w / 2) * (imgW / 100);
            const centerY = (normalized.y + normalized.h / 2) * (imgH / 100);
            const bubbleResult = await detectSpeechBubbleAtPointAsync(effectiveImageData, centerX, centerY);
            if (bubbleResult && bubbleResult.box && bubbleResult.box.w >= 2 && bubbleResult.box.h >= 2) {
                normalized.x = Math.round(bubbleResult.box.x * 100) / 100;
                normalized.y = Math.round(bubbleResult.box.y * 100) / 100;
                normalized.w = Math.round(bubbleResult.box.w * 100) / 100;
                normalized.h = Math.round(bubbleResult.box.h * 100) / 100;
            }
        } catch (err) { }
    }

    return normalized;
}

export async function runLocalOcrDetectionOnPage(): Promise<void> {
    const activePage = globalState.pages[globalState.activePageIndex];
    if (!activePage) {
        showToast("Vui lòng tải hoặc chọn trang truyện để quét khung thoại.", "warn");
        return;
    }

    const imgElement = elements.mangaBgImage;
    if (!imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) {
        showToast("Ảnh trang truyện chưa sẵn sàng.", "error");
        return;
    }

    uiUpdateProcessingOverlay(true, "Đang quét khung thoại Cục bộ...");

    try {
        pushStateToHistory();

        const canvas = document.createElement('canvas');
        canvas.width = imgElement.naturalWidth;
        canvas.height = imgElement.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(imgElement, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const localBoxes = detectLocalTextRegions(imageData);

        if (!localBoxes || localBoxes.length === 0) {
            showToast("Không tìm thấy khung thoại mới bằng OCR Cục bộ. Bạn có thể tự thêm ô thoại thủ công.", "info");
        } else {
            const localBlocks: MangaBlock[] = localBoxes.map((box, idx) => ({
                id: `local_ocr_${Date.now()}_${idx}`,
                type: 'dialogue',
                original: '',
                translated: 'Nhập nội dung dịch...',
                box,
                style: {
                    ...(globalState.globalStyle || {}),
                    fontFamily: globalState.defaultFont || 'font-manga'
                } as any
            }));

            activePage.blocks = [...(activePage.blocks || []), ...localBlocks];
            activePage.status = 'draft';
            savePageToDB(activePage);

            if (globalState.viewMode === 'original') {
                globalState.viewMode = 'overlay';
            }

            if (localBlocks[0]) {
                globalState.selectedBlockId = localBlocks[0].id;
            }

            requestOverlayRender();
            showToast(`Đã tự động khoanh vùng ${localBlocks.length} khung thoại trên trang!`, "success");
        }
    } catch (err: any) {
        console.error("Lỗi quét OCR Cục bộ:", err);
        showToast(`Lỗi quét OCR Cục bộ: ${err.message}`, "error");
    } finally {
        uiUpdateProcessingOverlay(false);
    }
}

const AI_EDGE_SAFETY_MARGIN = 4;

export function isSuspiciousAiBlockBox(box: any): boolean {
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

export function expandAiBox(box: BoundingBox, expandXRatio: number, expandYRatio: number): BoundingBox {
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

export function computeTextMaskDilatedRoi(rawBox: any, imageData: ImageData | null, options: any = {}): BoundingBox {
    const normalized = normalizeAiBlockBox(rawBox);
    if (!imageData || !imageData.width || !imageData.height) return normalized;

    const imgW = imageData.width;
    const imgH = imageData.height;
    const data = imageData.data;

    const searchBox = expandAiBox(normalized, 0.08, 0.08);
    let sx = Math.max(0, Math.min(imgW - 1, Math.round((searchBox.x / 100) * imgW)));
    let sy = Math.max(0, Math.min(imgH - 1, Math.round((searchBox.y / 100) * imgH)));
    let sw = Math.max(4, Math.min(imgW - sx, Math.round((searchBox.w / 100) * imgW)));
    let sh = Math.max(4, Math.min(imgH - sy, Math.round((searchBox.h / 100) * imgH)));

    const darkThreshold = options.darkThreshold || 140;
    const paddingPx = options.paddingPx !== undefined ? options.paddingPx : 6;

    const rawBinary = new Uint8Array(sw * sh);
    let darkPixelCount = 0;

    for (let ly = 0; ly < sh; ly++) {
        const rowOffset = (sy + ly) * imgW;
        for (let lx = 0; lx < sw; lx++) {
            const idx = (rowOffset + (sx + lx)) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
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

    // Adaptive dilation: scale with median glyph size
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

    if (inpaintBox.w < 1 || inpaintBox.h < 1 || isSuspiciousAiBlockBox(inpaintBox)) {
        return normalized;
    }

    return inpaintBox;
}

export function detectSpeechBubbleAtPoint(imageData: ImageData, clickPixelX: number, clickPixelY: number, _options: any = {}): any {
    if (!imageData) return null;

    const imgW = imageData.width;
    const imgH = imageData.height;
    const brightnessMap = getImageBrightnessMap(imageData);

    let startX = Math.max(0, Math.min(imgW - 1, Math.round(clickPixelX)));
    let startY = Math.max(0, Math.min(imgH - 1, Math.round(clickPixelY)));

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

    startX = bestSeedX;
    startY = bestSeedY;

    const seedBrightness = brightnessMap[startY * imgW + startX];
    if (seedBrightness < 80) {
        return null;
    }

    const bubbleThreshold = Math.max(130, Math.min(238, Math.round(seedBrightness * 0.78)));

    const maxHalfW = Math.min(Math.round(imgW * 0.45), 600);
    const maxHalfH = Math.min(Math.round(imgH * 0.45), 700);

    const winMinX = Math.max(0, startX - maxHalfW);
    const winMaxX = Math.min(imgW - 1, startX + maxHalfW);
    const winMinY = Math.max(0, startY - maxHalfH);
    const winMaxY = Math.min(imgH - 1, startY + maxHalfH);

    const winW = winMaxX - winMinX + 1;
    const winH = winMaxY - winMinY + 1;

    const visited = new Uint8Array(winW * winH);
    const queueX = new Int32Array(winW * winH);
    const queueY = new Int32Array(winW * winH);
    let head = 0;
    let tail = 0;

    const startLocalX = startX - winMinX;
    const startLocalY = startY - winMinY;

    queueX[tail] = startX;
    queueY[tail] = startY;
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

    const seedLocalX = startX - winMinX;
    const seedLocalY = startY - winMinY;

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

    let bw = maxX - minX;
    let bh = maxY - minY;

    if (bw < 12 || bh < 12 || filledCount < 20) {
        return null;
    }

    minX = Math.max(0, Math.min(imgW - 1, minX));
    minY = Math.max(0, Math.min(imgH - 1, minY));
    bw = Math.max(12, Math.min(imgW - minX, bw));
    bh = Math.max(12, Math.min(imgH - minY, bh));

    const finalBox: BoundingBox = {
        x: (minX / imgW) * 100,
        y: (minY / imgH) * 100,
        w: (bw / imgW) * 100,
        h: (bh / imgH) * 100
    };

    return {
        box: finalBox,
        pixelBox: {
            bx: minX,
            by: minY,
            bw: bw,
            bh: bh
        }
    };
}

export function refineAiBlockBox(
    box: any,
    imageData?: ImageData | null,
    _modelId?: string,
    blockType?: string
): BoundingBox {
    let effectiveImageData = imageData;
    if (!effectiveImageData) {
        if (typeof globalState !== 'undefined' && globalState.activePageIndex >= 0) {
            effectiveImageData = globalState.pages[globalState.activePageIndex]?.imageDataCache || null;
        }
        if (!effectiveImageData && typeof elements !== 'undefined' && (elements as any)?.mangaCanvas && (elements as any).mangaCanvas.width > 0) {
            try {
                effectiveImageData = (elements as any).mangaCanvas.getContext('2d', { willReadFrequently: true })?.getImageData(0, 0, (elements as any).mangaCanvas.width, (elements as any).mangaCanvas.height) || null;
            } catch (e) { }
        }
    }

    const imgW = (effectiveImageData && effectiveImageData.width > 0) 
        ? effectiveImageData.width 
        : ((typeof elements !== 'undefined' && elements?.mangaBgImage?.naturalWidth! > 0) ? elements.mangaBgImage!.naturalWidth : 1000);
    const imgH = (effectiveImageData && effectiveImageData.height > 0) 
        ? effectiveImageData.height 
        : ((typeof elements !== 'undefined' && elements?.mangaBgImage?.naturalHeight! > 0) ? elements.mangaBgImage!.naturalHeight : 1000);

    const normalizedType = (blockType || 'dialogue').toLowerCase();
    const isSfx = normalizedType === 'sfx';
    const targetBlockSizePx = isSfx ? (DEFAULT_SFX_BLOCK_SIZE_PX || 200) : (DEFAULT_BLOCK_SIZE_PX || 400);

    const normalized = normalizeAiBlockBox(box, imgW, imgH, blockType);
    const defaultWPct = Math.round(((targetBlockSizePx / imgW) * 100) * 100) / 100;
    const defaultHPct = Math.round(((targetBlockSizePx / imgH) * 100) * 100) / 100;

    normalized.w = defaultWPct;
    normalized.h = defaultHPct;
    normalized.x = Math.max(0, Math.min(100 - defaultWPct, normalized.x));
    normalized.y = Math.max(0, Math.min(100 - defaultHPct, normalized.y));

    // Differentiate block types:
    // - 'dialogue' & 'thought': speech bubbles with white/bright interiors and closed contours -> apply bubble CV snap.
    // - 'narration': rectangular caption boxes -> keep normalized center box without bubble watershed.
    // - 'sfx': sound effects directly over artwork/backgrounds (default 200x200px) -> never run bubble flood-fill to prevent false snapping and panel bleeding.
    const isBubbleType = normalizedType === 'dialogue' || normalizedType === 'thought';

    if (isBubbleType && effectiveImageData && effectiveImageData.data && effectiveImageData.width > 0 && effectiveImageData.height > 0) {
        try {
            const centerX = (normalized.x + normalized.w / 2) * (imgW / 100);
            const centerY = (normalized.y + normalized.h / 2) * (imgH / 100);
            const bubbleResult = detectSpeechBubbleAtPoint(effectiveImageData, centerX, centerY);
            if (bubbleResult && bubbleResult.box && bubbleResult.box.w >= 2 && bubbleResult.box.h >= 2) {
                normalized.x = Math.round(bubbleResult.box.x * 100) / 100;
                normalized.y = Math.round(bubbleResult.box.y * 100) / 100;
                normalized.w = Math.round(bubbleResult.box.w * 100) / 100;
                normalized.h = Math.round(bubbleResult.box.h * 100) / 100;
            }
        } catch (err) { }
    }

    return normalized;
}

export function normalizeAiBlockBox(
    box: any,
    imgW: number = 1000,
    imgH: number = 1000,
    blockType?: string
): BoundingBox {
    const isSfx = (blockType || '').toLowerCase() === 'sfx';
    const targetBlockSizePx = isSfx ? (DEFAULT_SFX_BLOCK_SIZE_PX || 200) : (DEFAULT_BLOCK_SIZE_PX || 400);

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
            // [centerX, centerY] on 0-1000 scale -> convert to 0-100% and offset to top-left
            const centerX = Number(box[0]) / 10;
            const centerY = Number(box[1]) / 10;
            x = centerX - (defaultWPct / 2);
            y = centerY - (defaultHPct / 2);
            w = defaultWPct;
            h = defaultHPct;
        } else if (box.length >= 4) {
            // [x, y, w, h] on 0-1000 scale -> convert to 0-100%
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
        // { x, y, w, h } on 0-1000 scale -> convert to 0-100%
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

export function calculateBoxIntersectionRatio(box1: any, box2: any): number {
    const b1 = normalizeAiBlockBox(box1);
    const b2 = normalizeAiBlockBox(box2);

    const x1 = Math.max(b1.x, b2.x);
    const y1 = Math.max(b1.y, b2.y);
    const x2 = Math.min(b1.x + b1.w, b2.x + b2.w);
    const y2 = Math.min(b1.y + b1.h, b2.y + b2.h);

    if (x2 <= x1 || y2 <= y1) return 0;

    const intersectionArea = (x2 - x1) * (y2 - y1);
    const area1 = b1.w * b1.h;
    const area2 = b2.w * b2.h;
    const unionArea = area1 + area2 - intersectionArea;

    if (unionArea <= 0) return 0;
    return intersectionArea / unionArea;
}

export function extractTextAnchor(rawBox: any): { x: number; y: number } | undefined {
    if (!rawBox) return undefined;

    if (Array.isArray(rawBox)) {
        if (rawBox.length === 2) {
            const x = Number(rawBox[0]) > 100 ? Number(rawBox[0]) / 10 : Number(rawBox[0]);
            const y = Number(rawBox[1]) > 100 ? Number(rawBox[1]) / 10 : Number(rawBox[1]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
            return {
                x: Math.max(0, Math.min(100, Math.round(x * 100) / 100)),
                y: Math.max(0, Math.min(100, Math.round(y * 100) / 100))
            };
        } else if (rawBox.length >= 4) {
            const x = Number(rawBox[0]) > 100 ? Number(rawBox[0]) / 10 : Number(rawBox[0]);
            const y = Number(rawBox[1]) > 100 ? Number(rawBox[1]) / 10 : Number(rawBox[1]);
            const w = Number(rawBox[2]) > 100 ? Number(rawBox[2]) / 10 : Number(rawBox[2]);
            const h = Number(rawBox[3]) > 100 ? Number(rawBox[3]) / 10 : Number(rawBox[3]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
            const cx = x + (Number.isFinite(w) ? w / 2 : 0);
            const cy = y + (Number.isFinite(h) ? h / 2 : 0);
            return {
                x: Math.max(0, Math.min(100, Math.round(cx * 100) / 100)),
                y: Math.max(0, Math.min(100, Math.round(cy * 100) / 100))
            };
        }
        return undefined;
    }

    if (typeof rawBox === 'object') {
        if (rawBox.textAnchor && typeof rawBox.textAnchor.x === 'number' && typeof rawBox.textAnchor.y === 'number') {
            return {
                x: Math.max(0, Math.min(100, Math.round(rawBox.textAnchor.x * 100) / 100)),
                y: Math.max(0, Math.min(100, Math.round(rawBox.textAnchor.y * 100) / 100))
            };
        }
        if (rawBox.x !== undefined || rawBox.left !== undefined) {
            const rawX = rawBox.x !== undefined ? rawBox.x : rawBox.left;
            const rawY = rawBox.y !== undefined ? rawBox.y : rawBox.top;
            const rawW = rawBox.w !== undefined ? rawBox.w : rawBox.width;
            const rawH = rawBox.h !== undefined ? rawBox.h : rawBox.height;

            const x = Number(rawX) > 100 ? Number(rawX) / 10 : Number(rawX);
            const y = Number(rawY) > 100 ? Number(rawY) / 10 : Number(rawY);
            const w = rawW !== undefined ? (Number(rawW) > 100 ? Number(rawW) / 10 : Number(rawW)) : 0;
            const h = rawH !== undefined ? (Number(rawH) > 100 ? Number(rawH) / 10 : Number(rawH)) : 0;

            if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
            const cx = x + (Number.isFinite(w) ? w / 2 : 0);
            const cy = y + (Number.isFinite(h) ? h / 2 : 0);
            return {
                x: Math.max(0, Math.min(100, Math.round(cx * 100) / 100)),
                y: Math.max(0, Math.min(100, Math.round(cy * 100) / 100))
            };
        }
    }

    return undefined;
}

function isTextDuplicateOrSimilar(t1: string, t2: string): boolean {
    const s1 = (t1 || '').trim().toLowerCase().replace(/[.,!?:;'"~`\s]/g, '');
    const s2 = (t2 || '').trim().toLowerCase().replace(/[.,!?:;'"~`\s]/g, '');
    if (!s1 || !s2) return false;
    if (s1 === s2) return true;
    if (s1.includes(s2) || s2.includes(s1)) return true;

    const lenMax = Math.max(s1.length, s2.length);
    if (lenMax === 0) return true;

    const track: number[][] = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(0));
    for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
    for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
    for (let j = 1; j <= s2.length; j += 1) {
        for (let i = 1; i <= s1.length; i += 1) {
            const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1,
                track[j - 1][i] + 1,
                track[j - 1][i - 1] + indicator
            );
        }
    }
    const dist = track[s2.length][s1.length];
    const similarity = 1 - (dist / lenMax);
    return similarity >= 0.7;
}

export function mergeOverlappingAiBlocks(blocks: any[], overlapThreshold: number = 0.70): any[] {
    if (!Array.isArray(blocks) || blocks.length <= 1) return blocks || [];

    const result: any[] = [];
    const merged = new Array(blocks.length).fill(false);

    for (let i = 0; i < blocks.length; i++) {
        if (merged[i]) continue;
        let current = { ...blocks[i] };
        let currentBox = normalizeAiBlockBox(current.box);

        const isPointAnchor1 = Array.isArray(current.box) && current.box.length === 2;
        const c1X = isPointAnchor1 ? (current.box[0] > 100 ? current.box[0] / 10 : current.box[0]) : (currentBox.x + currentBox.w / 2);
        const c1Y = isPointAnchor1 ? (current.box[1] > 100 ? current.box[1] / 10 : current.box[1]) : (currentBox.y + currentBox.h / 2);

        for (let j = i + 1; j < blocks.length; j++) {
            if (merged[j]) continue;
            const other = blocks[j];
            const otherBox = normalizeAiBlockBox(other.box);

            const isPointAnchor2 = Array.isArray(other.box) && other.box.length === 2;
            const c2X = isPointAnchor2 ? (other.box[0] > 100 ? other.box[0] / 10 : other.box[0]) : (otherBox.x + otherBox.w / 2);
            const c2Y = isPointAnchor2 ? (other.box[1] > 100 ? other.box[1] / 10 : other.box[1]) : (otherBox.y + otherBox.h / 2);

            const centerDist = Math.hypot(c1X - c2X, c1Y - c2Y);

            const type1 = (current.type || 'dialogue').toLowerCase();
            const type2 = (other.type || 'dialogue').toLowerCase();
            const sameType = type1 === type2;

            const orig1 = (current.original || '').trim();
            const orig2 = (other.original || '').trim();
            const trans1 = (current.translated || '').trim();
            const trans2 = (other.translated || '').trim();

            const hasTextDuplicateEvidence = isTextDuplicateOrSimilar(orig1, orig2) ||
                isTextDuplicateOrSimilar(trans1, trans2) ||
                (!orig1 && !orig2 && !trans1 && !trans2);

            let isDuplicate = false;

            if (isPointAnchor1 || isPointAnchor2) {
                // Point-anchor candidate: must be near enough (<= 1.8%), same type,
                // and have duplicate evidence (identical/similar text or both empty).
                // Distinct texts at neighboring points must NOT be merged.
                const isNearPoint = centerDist <= 1.8;
                isDuplicate = isNearPoint && sameType && hasTextDuplicateEvidence;
            } else {
                const overlapRatio = calculateBoxIntersectionRatio(currentBox, otherBox);
                isDuplicate = (overlapRatio >= overlapThreshold && centerDist <= 6.0);
            }

            if (isDuplicate) {
                merged[j] = true;

                const o1 = (current.original || '').trim();
                const o2 = (other.original || '').trim();
                if (o2 && !o1.includes(o2)) {
                    current.original = o1 ? `${o1} ${o2}` : o2;
                }

                const t1 = (current.translated || '').trim();
                const t2 = (other.translated || '').trim();
                if (t2 && !t1.includes(t2)) {
                    current.translated = t1 ? `${t1} ${t2}` : t2;
                }

                if (!isPointAnchor1 && !isPointAnchor2) {
                    const minX = Math.min(currentBox.x, otherBox.x);
                    const minY = Math.min(currentBox.y, otherBox.y);
                    const maxX = Math.max(currentBox.x + currentBox.w, otherBox.x + otherBox.w);
                    const maxY = Math.max(currentBox.y + currentBox.h, otherBox.y + otherBox.h);

                    currentBox = {
                        x: Math.round(minX * 100) / 100,
                        y: Math.round(minY * 100) / 100,
                        w: Math.round((maxX - minX) * 100) / 100,
                        h: Math.round((maxY - minY) * 100) / 100
                    };
                    current.box = currentBox;
                }
                if (other.vertical) current.vertical = true;
            }
        }

        result.push(current);
    }

    return result;
}

export function snapBoxToContours(box: BoundingBox, imageData: ImageData | null, options: any = {}): BoundingBox {
    if (!imageData) return box;

    const imgW = imageData.width;
    const imgH = imageData.height;
    const brightnessMap = getImageBrightnessMap(imageData);
    const darkThreshold = options.darkThreshold || 130;
    const searchScale = options.searchScale || 1;
    const sampleFractions = options.sampleFractions || [0.35, 0.5, 0.65];

    let bx = Math.round((box.x / 100) * imgW);
    let by = Math.round((box.y / 100) * imgH);
    let bw = Math.round((box.w / 100) * imgW);
    let bh = Math.round((box.h / 100) * imgH);

    bx = Math.max(0, Math.min(imgW - 1, bx));
    by = Math.max(0, Math.min(imgH - 1, by));
    bw = Math.max(1, Math.min(imgW - bx, bw));
    bh = Math.max(1, Math.min(imgH - by, bh));

    const isDark = (x: number, y: number) => {
        if (x < 0 || x >= imgW || y < 0 || y >= imgH) return false;
        const idx = Math.round(y) * imgW + Math.round(x);
        return brightnessMap[idx] < darkThreshold;
    };

    const maxScanX = Math.min(70, Math.round(imgW * 0.08 * searchScale));
    const maxScanY = Math.min(70, Math.round(imgH * 0.08 * searchScale));

    const sampleXs = sampleFractions.map((f: number) => bx + Math.floor(bw * f));
    const sampleYs = sampleFractions.map((f: number) => by + Math.floor(bh * f));

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

    let finalBx = newLeft;
    let finalBy = newTop;
    let finalBw = newRight - newLeft;
    let finalBh = newBottom - newTop;

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

export function getImageBrightnessMap(imageData: any): Uint8Array {
    if (!imageData) return new Uint8Array(0);
    if (imageData._brightnessMap) return imageData._brightnessMap;

    const w = imageData.width;
    const h = imageData.height;
    const data = imageData.data;
    const totalPixels = w * h;
    const map = new Uint8Array(totalPixels);

    let pIdx = 0;
    for (let i = 0; i < totalPixels; i++) {
        const r = data[pIdx];
        const g = data[pIdx + 1];
        const b = data[pIdx + 2];
        pIdx += 4;
        map[i] = (r * 77 + g * 150 + b * 29) >> 8;
    }

    imageData._brightnessMap = map;
    return map;
}

function getMaskCacheKey(page: MangaPage, block: MangaBlock): string {
    return `${page.id}_${block.id}_${block.box.x}_${block.box.y}_${block.box.w}_${block.box.h}_${block.style.bgColor}_${block.style.bgOpacity}`;
}

export function collectBubbleSamples(imageData: ImageData, bx: number, by: number, bw: number, bh: number, brightnessMap: Uint8Array): Array<{ x: number; y: number; brightness: number }> {
    const imgW = imageData.width;
    const step = Math.max(2, Math.floor(Math.min(bw, bh) / 18));
    const samples: Array<{ x: number; y: number; brightness: number }> = [];

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

export function pickBubbleSeed(samples: Array<{ x: number; y: number; brightness: number }>, bx: number, by: number, bw: number, bh: number): any {
    if (!samples.length) return null;

    const centerX = bx + (bw / 2);
    const centerY = by + (bh / 2);
    let best: any = null;
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

export function computeBubbleMask(page: MangaPage, block: MangaBlock, imageData: ImageData | null): HTMLCanvasElement | null {
    if (!imageData) return null;

    const cacheKey = getMaskCacheKey(page, block);
    if (block.maskCache && block.maskCache.key === cacheKey) {
        return block.maskCache.canvas;
    }

    const imgW = imageData.width;
    const imgH = imageData.height;
    const brightnessMap = getImageBrightnessMap(imageData);

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

    const isTextBridgePixel = (nx: number, ny: number) => {
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

    const outside = new Uint8Array(bw * bh);
    queueHead = 0;
    queueTail = 0;

    const pushOutside = (relX: number, relY: number) => {
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

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = bw;
    maskCanvas.height = bh;
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!maskCtx) return null;
    const maskImgData = maskCtx.createImageData(bw, bh);

    const hexBgColor = block.style.bgColor || '#ffffff';
    const bgOpacity = block.style.bgOpacity !== undefined ? block.style.bgOpacity : 100;

    const cleanHex = hexBgColor.replace('#', '');
    const br = parseInt(cleanHex.substring(0, 2), 16) || 0;
    const bg = parseInt(cleanHex.substring(2, 4), 16) || 0;
    const bb = parseInt(cleanHex.substring(4, 6), 16) || 0;
    const ba = Math.round((bgOpacity / 100) * 255);

    for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
            const idx = y * bw + x;
            const isInsideBubble = visited[idx] === 1 || outside[idx] === 0;
            const canvasIdx = idx * 4;

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
        finalBx: 0,
        finalBy: 0,
        finalBw: bw,
        finalBh: bh,
        dataUrl: maskDataUrl
    };

    return maskCanvas;
}
