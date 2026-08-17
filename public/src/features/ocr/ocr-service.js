// OCR Processing & Bubble Snap to Contours
import { isWeakTranslationModel, isFlash31LiteModel, globalState, pushStateToHistory, savePageToDB, uiUpdateProcessingOverlay } from '../../core/state.js';
import { DEFAULT_AI_BLOCK_BOX, DEFAULT_BLOCK_SIZE_PX } from '../../config/constants.js';
import { detectLocalTextRegions } from './local-ocr.js';
import { elements } from '../../core/elements.js';
import { showToast } from '../../core/utils/dom.js';
import { requestOverlayRender } from '../canvas/canvas-service.js';

export async function runLocalOcrDetectionOnPage() {
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

    uiUpdateProcessingOverlay(true, "Đang quét khung thoại Cục bộ...", "Thuật toán offline đang nhận diện vị trí các bong bóng thoại...", 30);

    try {
        pushStateToHistory();

        const canvas = document.createElement('canvas');
        canvas.width = imgElement.naturalWidth;
        canvas.height = imgElement.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgElement, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const localBlocks = detectLocalTextRegions(imageData);

        if (!localBlocks || localBlocks.length === 0) {
            showToast("Không tìm thấy khung thoại mới bằng OCR Cục bộ. Bạn có thể tự thêm ô thoại thủ công.", "info");
        } else {
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
    } catch (err) {
        console.error("Lỗi quét OCR Cục bộ:", err);
        showToast(`Lỗi quét OCR Cục bộ: ${err.message}`, "error");
    } finally {
        uiUpdateProcessingOverlay(false);
    }
}

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

/**
 * ⚡ TEXT MASK -> DILATE / EXPAND -> INPAINT REGION Pipeline
 * Pinpoints the exact inpaint bounding box by segmenting text ink glyphs and dilating them.
 * 
 * @param {object|Array} rawBox - Input bounding box (percentage or 0-1000 array)
 * @param {ImageData} imageData - Full page canvas ImageData
 * @param {object} options - Configuration options { dilationRadius, paddingPx, darkThreshold }
 * @returns {{ x: number, y: number, w: number, h: number }} - Precise Inpaint Region Bounding Box (%)
 */
export function computeTextMaskDilatedRoi(rawBox, imageData, options = {}) {
    const normalized = normalizeAiBlockBox(rawBox);
    if (!imageData || !imageData.width || !imageData.height) return normalized;

    const imgW = imageData.width;
    const imgH = imageData.height;
    const data = imageData.data;

    // Vùng tìm kiếm lân cận (+8% viền)
    const searchBox = expandAiBox(normalized, 0.08, 0.08);
    let sx = Math.max(0, Math.min(imgW - 1, Math.round((searchBox.x / 100) * imgW)));
    let sy = Math.max(0, Math.min(imgH - 1, Math.round((searchBox.y / 100) * imgH)));
    let sw = Math.max(4, Math.min(imgW - sx, Math.round((searchBox.w / 100) * imgW)));
    let sh = Math.max(4, Math.min(imgH - sy, Math.round((searchBox.h / 100) * imgH)));

    const darkThreshold = options.darkThreshold || 140;
    const dilationRadius = options.dilationRadius || 3;
    const paddingPx = options.paddingPx !== undefined ? options.paddingPx : 6;

    // 1. TEXT MASK: Phân tách điểm ảnh tối màu
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

    // 2. CONNECTED COMPONENT ANALYSIS: Lọc bỏ tóc nhân vật, viền khung tranh và mảng màu tối nền
    const visited = new Uint8Array(sw * sh);
    const cleanTextMask = new Uint8Array(sw * sh);
    let validGlyphCount = 0;

    for (let ly = 0; ly < sh; ly++) {
        for (let lx = 0; lx < sw; lx++) {
            const pos = ly * sw + lx;
            if (rawBinary[pos] === 1 && visited[pos] === 0) {
                let compMinX = lx, compMaxX = lx, compMinY = ly, compMaxY = ly;
                let compPixelCount = 0;
                const compPixels = [];

                const queue = [pos];
                visited[pos] = 1;

                while (queue.length > 0) {
                    const curr = queue.pop();
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

                // Loại trừ viền khung tranh dài hoặc mảng tóc/quần áo lớn của nhân vật
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
                }
            }
        }
    }

    if (validGlyphCount === 0) {
        return normalized;
    }

    // 3. DILATE / EXPAND: Giãn nở hình thái học dạng ellipse kết nối các cột dọc tiếng Nhật và Furigana
    const dilatedMask = new Uint8Array(sw * sh);
    const radX = options.dilationRadiusX || 6; // Kết nối các cột dọc song song và lề Furigana
    const radY = options.dilationRadiusY || 3; // Giữ chặt viền trên/dưới tránh tràn vào tóc/viền tranh
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
                    const dRowOffset = dy * sw;
                    for (let dx = xMin; dx <= xMax; dx++) {
                        const xDist = dx - lx;
                        if ((xDist * xDist) / radXSq + (yDist * yDist) / radYSq <= 1.0) {
                            dilatedMask[dRowOffset + dx] = 1;
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

    // 4. INPAINT REGION: Tính hộp bao chính xác của vùng chữ kèm padding
    const roiMinX = Math.max(0, sx + minX - paddingPx);
    const roiMinY = Math.max(0, sy + minY - paddingPx);
    const roiMaxX = Math.min(imgW - 1, sx + maxX + paddingPx);
    const roiMaxY = Math.min(imgH - 1, sy + maxY + paddingPx);

    const roiW = roiMaxX - roiMinX + 1;
    const roiH = roiMaxY - roiMinY + 1;

    const inpaintBox = {
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

/**
 * Thuật toán nhận diện bong bóng thoại chính xác 100% (Strict Anti-Leak Flood Fill & Tail Pruning)
 */
export function detectSpeechBubbleAtPoint(imageData, clickPixelX, clickPixelY, options = {}) {
    if (!imageData) return null;

    const imgW = imageData.width;
    const imgH = imageData.height;
    const brightnessMap = getImageBrightnessMap(imageData);

    let startX = Math.max(0, Math.min(imgW - 1, Math.round(clickPixelX)));
    let startY = Math.max(0, Math.min(imgH - 1, Math.round(clickPixelY)));

    // 1. Tìm điểm hạt giống sáng nhất trong bán kính thăm dò mở rộng (tránh trường hợp AI/user click trúng nét chữ đen)
    let bestSeedX = startX;
    let bestSeedY = startY;
    let maxSeedBrightness = brightnessMap[startY * imgW + startX];

    const probeRadius = Math.max(45, Math.min(120, Math.round(Math.min(imgW, imgH) * 0.06)));
    for (let dy = -probeRadius; dy <= probeRadius; dy += 2) {
        for (let dx = -probeRadius; dx <= probeRadius; dx += 2) {
            const px = startX + dx;
            const py = startY + dy;
            if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
                const b = brightnessMap[py * imgW + px];
                if (b > maxSeedBrightness) {
                    maxSeedBrightness = b;
                    bestSeedX = px;
                    bestSeedY = py;
                }
            }
        }
    }

    startX = bestSeedX;
    startY = bestSeedY;

    // Ngưỡng độ sáng của ruột bóng thoại (Bóng thoại manga ruột trắng hoặc screentone nhẹ >= 80)
    const seedBrightness = brightnessMap[startY * imgW + startX];
    if (seedBrightness < 80) {
        return null;
    }

    // Ngưỡng chặn viền đen nghiêm ngặt (Strict Barrier Threshold): không bao giờ nhảy qua viền đen
    const bubbleThreshold = Math.max(130, Math.min(238, Math.round(seedBrightness * 0.78)));

    // Giới hạn vùng tìm kiếm tối đa (đảm bảo bao phủ toàn bộ bóng thoại trong panel)
    const maxHalfW = Math.min(Math.round(imgW * 0.45), 600);
    const maxHalfH = Math.min(Math.round(imgH * 0.45), 700);

    const winMinX = Math.max(0, startX - maxHalfW);
    const winMaxX = Math.min(imgW - 1, startX + maxHalfW);
    const winMinY = Math.max(0, startY - maxHalfH);
    const winMaxY = Math.min(imgH - 1, startY + maxHalfH);

    const winW = winMaxX - winMinX + 1;
    const winH = winMaxY - winMinY + 1;

    // 1. LOANG MÀU RUỘT TRẮNG NGHIÊM NGẶT (Strict White-Only Flood Fill)
    // Tuyệt đối không loang qua bất kỳ nét vẽ đen nào -> BẢO VỆ 100% ĐƯỜNG VIỀN BÓNG THOẠI
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

        // 8 hướng lân cận liên tục
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

                    // CHỈ loang vào vùng ruột trắng sáng, DỪNG TUYỆT ĐỐI tại mọi nét đen (viền & chữ)
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

    // 2. THUẬT TOÁN LẤP LỖ KÍN NÉT CHỮ TỰ ĐỘNG TỪ BÊN NGOÀI (Topological Hole-Filling via Outside BFS)
    // Quét loang từ 4 mép ngoài cùng của cửa sổ vào trong để xác định vùng "Nằm bên ngoài bóng thoại"
    const outside = new Uint8Array(winW * winH);
    let outHead = 0;
    let outTail = 0;

    const pushOutside = (lx, ly) => {
        const idx = ly * winW + lx;
        if (idx < 0 || idx >= visited.length) return;
        if (visited[idx] === 1 || outside[idx] === 1) return;
        outside[idx] = 1;
        queueX[outTail] = winMinX + lx;
        queueY[outTail] = winMinY + ly;
        outTail++;
    };

    // Khởi tạo các điểm ở 4 cạnh biên ngoài cửa sổ
    for (let x = 0; x < winW; x++) {
        pushOutside(x, 0);
        if (winH > 1) pushOutside(x, winH - 1);
    }
    for (let y = 1; y < winH - 1; y++) {
        pushOutside(0, y);
        if (winW > 1) pushOutside(winW - 1, y);
    }

    // Loang vùng bên ngoài (Outside Flood Fill)
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

    // 3. TÍNH BẢN ĐỒ KHOẢNG CÁCH EUCLID 2 CHIỀU (2D Chamfer Distance Transform trên mặt nạ ruột bóng thoại)
    // dt[idx] đo khoảng cách chính xác từ pixel (x, y) tới đường viền gần nhất (tỉ lệ 5:1 để giữ độ mịn)
    const dt = new Int32Array(winW * winH);
    const INF = 999999;

    // Pass 1: Quét xuôi từ trên-trái xuống dưới-phải (Forward Pass)
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

    // Pass 2: Quét ngược từ dưới-phải lên trên-trái (Backward Pass)
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

    // 4. PHÂN TÁCH BÓNG THOẠI DÍNH NHAU BẰNG THỦY PHÂN GRADIENT (Steepest Ascent Morphological Watershed)
    // Leo dốc từ điểm bắt đầu (startX, startY) để tìm đỉnh cực đại chính (Primary Catchment Basin)
    const seedLocalX = startX - winMinX;
    const seedLocalY = startY - winMinY;

    // Hàm leo dốc tìm đỉnh cực đại của một điểm (Gradient Ascent to Peak)
    const findPeak = (startX, startY) => {
        let cx = startX;
        let cy = startY;
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

    // Đỉnh hồ chứa của bóng thoại chính
    const primaryPeak = findPeak(seedLocalX, seedLocalY);
    const primaryPeakX = primaryPeak.peakX;
    const primaryPeakY = primaryPeak.peakY;

    // 5. GÁN NHÃN BÓNG THOẠI BẰNG THỦY PHÂN GRADIENT VÀ KIỂM TRA ĐÈO YÊN NGỰA (Saddle-Valley Watershed)
    // 0: chưa gán, 1: thuộc bóng thoại chính, 2: thuộc bóng thoại khác (dính bên cạnh)
    const labels = new Uint8Array(winW * winH);
    const path = new Int32Array(1500);

    // Kiểm tra xem từ một đỉnh đích (cx, cy) nối về đỉnh chính (primaryPeakX, primaryPeakY) có bị chặn bởi eo thắt không
    const isSeparatedBySaddle = (destX, destY) => {
        const dx = destX - primaryPeakX;
        const dy = destY - primaryPeakY;
        const dist = Math.hypot(dx, dy);
        if (dist <= 30) return false; // Quá gần, cùng 1 đỉnh

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

        // Nếu trên đường nối thẳng tồn tại điểm eo thắt tụt xuống dưới 45% bán kính đỉnh -> Tách rời 2 bóng
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

                // Tìm lân cận có dt cao nhất
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
                    // Đã tới đỉnh của đường leo: Kiểm tra xem có bị ngăn cách bởi đèo yên ngựa (saddle valley) không
                    const isOtherBubble = isSeparatedBySaddle(cx, cy);
                    assignedLabel = isOtherBubble ? 2 : 1;
                    break;
                }
            }

            if (assignedLabel === 0) assignedLabel = 1;

            // Nén đường đi (Path compression)
            for (let i = 0; i < pathLen; i++) {
                labels[path[i]] = assignedLabel;
            }
        }
    }

    // 6. TRÍCH XUẤT HỘP BAO CHÍNH XÁC CỦA BÓNG THOẠI CHÍNH (Label 1)
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

    // Giới hạn an toàn [0, imgW, imgH]
    minX = Math.max(0, Math.min(imgW - 1, minX));
    minY = Math.max(0, Math.min(imgH - 1, minY));
    bw = Math.max(12, Math.min(imgW - minX, bw));
    bh = Math.max(12, Math.min(imgH - minY, bh));

    const finalBox = {
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

export function refineAiBlockBox(box, imageData, modelId) {
    let effectiveImageData = imageData;
    if (!effectiveImageData) {
        if (typeof globalState !== 'undefined' && globalState.activePageIndex >= 0) {
            effectiveImageData = globalState.pages[globalState.activePageIndex]?.imageDataCache || null;
        }
        if (!effectiveImageData && typeof elements !== 'undefined' && elements?.mangaCanvas && elements.mangaCanvas.width > 0) {
            try {
                effectiveImageData = elements.mangaCanvas.getContext('2d').getImageData(0, 0, elements.mangaCanvas.width, elements.mangaCanvas.height);
            } catch (e) { }
        }
    }

    const imgW = (effectiveImageData && effectiveImageData.width > 0) 
        ? effectiveImageData.width 
        : ((typeof elements !== 'undefined' && elements?.mangaBgImage?.naturalWidth > 0) ? elements.mangaBgImage.naturalWidth : 1000);
    const imgH = (effectiveImageData && effectiveImageData.height > 0) 
        ? effectiveImageData.height 
        : ((typeof elements !== 'undefined' && elements?.mangaBgImage?.naturalHeight > 0) ? elements.mangaBgImage.naturalHeight : 1000);

    const normalized = normalizeAiBlockBox(box, imgW, imgH);
    const wPx = DEFAULT_BLOCK_SIZE_PX || 400;
    const hPx = DEFAULT_BLOCK_SIZE_PX || 400;
    const defaultWPct = Math.round(((wPx / imgW) * 100) * 100) / 100;
    const defaultHPct = Math.round(((hPx / imgH) * 100) * 100) / 100;

    // Khởi tạo kích thước ban đầu 400px x 400px căn giữa theo tâm neo [anchorX, anchorY]
    normalized.w = defaultWPct;
    normalized.h = defaultHPct;
    normalized.x = Math.max(0, Math.min(100 - defaultWPct, normalized.x));
    normalized.y = Math.max(0, Math.min(100 - defaultHPct, normalized.y));

    // Thao tác làm khít viền (Magic Wand Snap): Kích hoạt tại tâm ô thoại để tự động làm khít viền bóng thoại
    if (effectiveImageData && effectiveImageData.data && effectiveImageData.width > 0 && effectiveImageData.height > 0) {
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

export function normalizeAiBlockBox(box, imgW = 1000, imgH = 1000) {
    const wPx = DEFAULT_BLOCK_SIZE_PX || 400;
    const hPx = DEFAULT_BLOCK_SIZE_PX || 400;

    const defaultWPct = Math.round(((wPx / imgW) * 100) * 100) / 100;
    const defaultHPct = Math.round(((hPx / imgH) * 100) * 100) / 100;

    if (!box) {
        return {
            x: Math.max(0, Math.round((50 - defaultWPct / 2) * 100) / 100),
            y: Math.max(0, Math.round((50 - defaultHPct / 2) * 100) / 100),
            w: defaultWPct,
            h: defaultHPct
        };
    }

    let x, y, w, h;

    if (Array.isArray(box)) {
        if (box.length === 2) {
            x = Number(box[0]);
            y = Number(box[1]);
            // Nếu x, y ở hệ 0-1000
            if (x > 100 || y > 100) {
                x /= 10;
                y /= 10;
            } else if (x <= 1.0 && y <= 1.0 && (x > 0 || y > 0)) {
                x *= 100;
                y *= 100;
            }
            // Tâm của ô dịch khớp với tọa độ tâm text box (x = anchorX - 200px, y = anchorY - 200px)
            x = x - (defaultWPct / 2);
            y = y - (defaultHPct / 2);
            w = defaultWPct;
            h = defaultHPct;
        } else if (box.length >= 4) {
            x = Number(box[0]);
            y = Number(box[1]);
            w = Number(box[2]);
            h = Number(box[3]);

            if (x <= 1.0 && y <= 1.0 && w <= 1.0 && h <= 1.0) {
                x *= 100;
                y *= 100;
                w *= 100;
                h *= 100;
            } else if ((x > 100 || y > 100 || w > 100 || h > 100 || (x + w > 100) || (y + h > 100)) && (x <= 1000 && y <= 1000 && w <= 1000 && h <= 1000)) {
                x /= 10;
                y /= 10;
                w /= 10;
                h /= 10;
            }
        } else {
            return {
                x: Math.max(0, Math.round((50 - defaultWPct / 2) * 100) / 100),
                y: Math.max(0, Math.round((50 - defaultHPct / 2) * 100) / 100),
                w: defaultWPct,
                h: defaultHPct
            };
        }
    } else if (typeof box === 'object') {
        x = Number(box.x !== undefined ? box.x : box.left);
        y = Number(box.y !== undefined ? box.y : box.top);
        const rawW = box.w !== undefined ? box.w : box.width;
        const rawH = box.h !== undefined ? box.h : box.height;

        w = rawW !== undefined ? Number(rawW) : defaultWPct;
        h = rawH !== undefined ? Number(rawH) : defaultHPct;

        if (x <= 1.0 && y <= 1.0 && w <= 1.0 && h <= 1.0) {
            x *= 100;
            y *= 100;
            w *= 100;
            h *= 100;
        } else if ((x > 100 || y > 100 || w > 100 || h > 100 || (x + w > 100) || (y + h > 100)) && (x <= 1000 && y <= 1000 && w <= 1000 && h <= 1000)) {
            x /= 10;
            y /= 10;
            w /= 10;
            h /= 10;
        }
    } else {
        return {
            x: Math.max(0, Math.round((50 - defaultWPct / 2) * 100) / 100),
            y: Math.max(0, Math.round((50 - defaultHPct / 2) * 100) / 100),
            w: defaultWPct,
            h: defaultHPct
        };
    }

    // Kiểm tra tính hợp lệ cơ bản
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

    // Giới hạn giá trị trong khoảng hợp lệ [0, 100]
    const cleanX = Math.max(0, Math.min(100, x));
    const cleanY = Math.max(0, Math.min(100, y));
    const cleanW = Math.max(1, Math.min(100 - cleanX, w));
    const cleanH = Math.max(1, Math.min(100 - cleanY, h));

    return {
        x: Math.round(cleanX * 100) / 100,
        y: Math.round(cleanY * 100) / 100,
        w: Math.round(cleanW * 100) / 100,
        h: Math.round(cleanH * 100) / 100
    };
}

// Tính tỷ lệ diện tích giao nhau trên diện tích hợp (Intersection over Union - IoU)
export function calculateBoxIntersectionRatio(box1, box2) {
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

// Tự động hợp nhất các block AI bị trùng lặp vị trí thực sự (loại bỏ block clone/rác, KHÔNG gộp bóng thoại khác nhau)
export function mergeOverlappingAiBlocks(blocks, overlapThreshold = 0.70) {
    if (!Array.isArray(blocks) || blocks.length <= 1) return blocks || [];

    const result = [];
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

            let isDuplicate = false;

            if (isPointAnchor1 || isPointAnchor2) {
                // Với tọa độ tâm [x, y], chỉ coi là trùng lặp nếu 2 điểm neo cách nhau cực gần (<= 3.5%)
                // Tuyệt đối không gộp các bóng thoại cách xa nhau!
                isDuplicate = (centerDist <= 3.5);
            } else {
                // Với bounding box đầy đủ [x, y, w, h], kiểm tra IoU và khoảng cách tâm
                const overlapRatio = calculateBoxIntersectionRatio(currentBox, otherBox);
                isDuplicate = (overlapRatio >= overlapThreshold && centerDist <= 6.0);
            }

            if (isDuplicate) {
                merged[j] = true;

                // Ghép nối câu chữ gốc theo thứ tự xuất hiện
                const orig1 = (current.original || '').trim();
                const orig2 = (other.original || '').trim();
                if (orig2 && !orig1.includes(orig2)) {
                    current.original = orig1 ? `${orig1} ${orig2}` : orig2;
                }

                const trans1 = (current.translated || '').trim();
                const trans2 = (other.translated || '').trim();
                if (trans2 && !trans1.includes(trans2)) {
                    current.translated = trans1 ? `${trans1} ${trans2}` : trans2;
                }

                if (!isPointAnchor1 && !isPointAnchor2) {
                    // Hợp nhất (Union) vùng biên của cả 2 bounding box
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

