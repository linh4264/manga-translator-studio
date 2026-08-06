// Automated Cleaning & Manual Eraser / Clone Stamp Tools
import { globalState, pushStateToHistory, savePageToDB, uiUpdateActiveBlockEditor } from '../core/state.js';
import { elements } from '../core/elements.js';
import { showToast } from '../core/utils.js';
import { requestOverlayRender } from './canvas/canvas-service.js';
import { computeBubbleMask } from './ocr/ocr-service.js';

export let isEraserModeActive = false;
export let isDrawingOnEraser = false;
export let eraserBrushSize = 15;
export let eraserColor = '#ffffff';
export let lastX = 0;
export let lastY = 0;
export let brushMode = 'eraser'; // 'eraser' or 'stamp'
export let isSelectingPatch = false;
export let isPatchStampActive = false;
export let patchCanvas = null;

export function setIsEraserModeActive(val) {
    isEraserModeActive = val;
}

export function autoCleanBubbleBackground(page, block) {
    if (!page || !block) {
        showToast('Không tìm thấy thông tin ô thoại để xóa chữ.', 'warn');
        return false;
    }

    const canvas = document.getElementById('eraser-canvas');
    if (!canvas) return false;

    const ctx = canvas.getContext('2d');
    const bx = Math.round((block.box.x / 100) * canvas.width);
    const by = Math.round((block.box.y / 100) * canvas.height);
    const bw = Math.round((block.box.w / 100) * canvas.width);
    const bh = Math.round((block.box.h / 100) * canvas.height);

    // Thử lấy dữ liệu ảnh để chạy thuật toán Flood Fill tạo mask chính xác
    let activeImageData = page.imageDataCache || null;
    const imgElement = elements.mangaBgImage;
    if (!activeImageData && imgElement && imgElement.naturalWidth > 0 && imgElement.naturalHeight > 0) {
        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imgElement.naturalWidth;
            tempCanvas.height = imgElement.naturalHeight;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(imgElement, 0, 0);
            activeImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            page.imageDataCache = activeImageData;
        } catch (e) {
            console.error("Không thể lấy dữ liệu ảnh để chạy inpainting mask:", e);
        }
    }

    let maskDrawn = false;
    if (activeImageData) {
        const maskCanvas = computeBubbleMask(page, block, activeImageData);
        if (maskCanvas && block.maskCache) {
            const { finalBx, finalBy } = block.maskCache;
            ctx.save();
            ctx.drawImage(maskCanvas, bx + finalBx, by + finalBy);
            ctx.restore();
            maskDrawn = true;
        }
    }

    // Fallback vẽ hình ellipse mặc định nếu thuật toán Flood Fill không nhận diện được bong bóng thoại
    if (!maskDrawn) {
        ctx.save();
        ctx.fillStyle = block.style?.bgColor || '#ffffff';
        ctx.beginPath();
        ctx.ellipse(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
    }

    return true;
}

export function autoCleanActiveBlock() {
    const activePage = globalState.pages[globalState.activePageIndex];
    if (!activePage || !globalState.selectedBlockId) {
        showToast('Hãy nhấp chọn một khung thoại để dùng cọ xóa chữ AI.', 'warn');
        return;
    }
    const block = activePage.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block) {
        pushStateToHistory();
        block.style.maskShape = 'bubble-fit';
        block.style.maskSize = 'full';
        block.style.bgOpacity = 100;
        autoCleanBubbleBackground(activePage, block);
        saveEraserDrawingToPage();
        requestOverlayRender();
        showToast(`🧹 Đã tự động phủ xóa chữ cũ cho khung thoại #${block.id.slice(-4)}`, 'success');
    }
}

export function toggleEraserMode() {
    if (globalState.activePageIndex === -1) return;

    isEraserModeActive = !isEraserModeActive;

    if (isEraserModeActive) {
        elements.eraserSettingsPanel.classList.remove('hidden');
        elements.btnEraserMode.classList.add('bg-indigo-600', 'text-white');
        elements.btnEraserMode.classList.remove('bg-slate-800', 'text-slate-300');

        elements.eraserCanvas.classList.add('drawing-active');
        elements.mangaOverlaysContainer.classList.add('pointer-events-none');

        initEraserDrawingEvents();
        showToast("Đã bật chế độ cọ tẩy. Dùng chuột/bút vẽ trực tiếp lên ảnh để xóa.", "info");
    } else {
        elements.eraserSettingsPanel.classList.add('hidden');
        elements.btnEraserMode.classList.remove('bg-indigo-600', 'text-white');
        elements.btnEraserMode.classList.add('bg-slate-800', 'text-slate-300');

        elements.eraserCanvas.classList.remove('drawing-active');
        elements.mangaOverlaysContainer.classList.remove('pointer-events-none');

        saveEraserDrawingToPage();
    }
}

export function updateEraserBrushSize(val) {
    eraserBrushSize = parseInt(val);
    if (elements.lblEraserBrushSize) {
        elements.lblEraserBrushSize.innerText = `${val}px`;
    }
}

export function setEraserColor(color) {
    eraserColor = color;
    if (elements.eraserColorCustom) {
        elements.eraserColorCustom.value = color;
    }
}

export function setEraserBrushMode(mode) {
    brushMode = mode;
    
    const btnEraser = document.getElementById('btn-brush-mode-eraser');
    const btnStamp = document.getElementById('btn-brush-mode-stamp');
    const stampControls = document.getElementById('stamp-controls');
    const brushColorContainer = document.getElementById('brush-color-container');
    const brushSizeContainer = document.getElementById('brush-size-container');

    if (mode === 'stamp') {
        if (btnStamp) {
            btnStamp.classList.add('bg-indigo-600', 'text-white');
            btnStamp.classList.remove('text-slate-400', 'hover:text-slate-200');
        }
        if (btnEraser) {
            btnEraser.classList.remove('bg-indigo-600', 'text-white');
            btnEraser.classList.add('text-slate-400', 'hover:text-slate-200');
        }
        
        if (stampControls) stampControls.classList.remove('hidden');
        if (brushColorContainer) brushColorContainer.classList.add('hidden');
        if (brushSizeContainer) brushSizeContainer.classList.add('hidden');
        
        isPatchStampActive = patchCanvas !== null;
    } else {
        if (btnEraser) {
            btnEraser.classList.add('bg-indigo-600', 'text-white');
            btnEraser.classList.remove('text-slate-400', 'hover:text-slate-200');
        }
        if (btnStamp) {
            btnStamp.classList.remove('bg-indigo-600', 'text-white');
            btnStamp.classList.add('text-slate-400', 'hover:text-slate-200');
        }
        
        if (stampControls) stampControls.classList.add('hidden');
        if (brushColorContainer) brushColorContainer.classList.remove('hidden');
        if (brushSizeContainer) brushSizeContainer.classList.remove('hidden');
        
        isPatchStampActive = false;
        isSelectingPatch = false;
        
        const selectionBox = document.getElementById('patch-selection-box');
        if (selectionBox) selectionBox.classList.add('hidden');
        
        const previewCanvas = elements.patchPreviewCanvas;
        if (previewCanvas) previewCanvas.classList.add('hidden');
    }

    initEraserDrawingEvents();
}

export function startTexturePatchSelection() {
    isSelectingPatch = true;
    isPatchStampActive = false;
    
    const previewCanvas = elements.patchPreviewCanvas;
    if (previewCanvas) previewCanvas.classList.add('hidden');
    
    const lblStatus = document.getElementById('lbl-stamp-status');
    if (lblStatus) {
        lblStatus.innerText = 'Đang quét vùng...';
        lblStatus.classList.remove('text-slate-400');
        lblStatus.classList.add('text-teal-400');
    }

    showToast("Nhấp giữ và kéo chuột vẽ để khoanh vùng họa tiết hình tròn.", "info");
    initEraserDrawingEvents();
}

export function initEraserDrawingEvents() {
    const canvas = elements.eraserCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Clean up all mouse and touch events
    canvas.onmousedown = null;
    canvas.onmousemove = null;
    canvas.onmouseup = null;
    canvas.onmouseleave = null;
    canvas.ontouchstart = null;
    canvas.ontouchmove = null;
    canvas.ontouchend = null;

    // Element references
    const selectionBox = document.getElementById('patch-selection-box');
    const previewCanvas = elements.patchPreviewCanvas;
    const container = elements.mangaCanvasContainer;

    const getMousePos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const x = ((clientX - rect.left) / rect.width) * canvas.width;
        const y = ((clientY - rect.top) / rect.height) * canvas.height;
        return { x, y, clientX, clientY };
    };

    // --- CASE 1: Drag to Crop Texture Mode ---
    if (isSelectingPatch) {
        let isDragging = false;
        let startClientX = 0;
        let startClientY = 0;

        const startSelect = (e) => {
            e.preventDefault();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            isDragging = true;
            startClientX = clientX;
            startClientY = clientY;

            const rect = container.getBoundingClientRect();
            if (selectionBox) {
                selectionBox.style.left = `${clientX - rect.left}px`;
                selectionBox.style.top = `${clientY - rect.top}px`;
                selectionBox.style.width = '0px';
                selectionBox.style.height = '0px';
                selectionBox.classList.remove('hidden');
            }
        };

        const dragSelect = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            const rect = container.getBoundingClientRect();
            const x1 = Math.min(startClientX, clientX);
            const y1 = Math.min(startClientY, clientY);
            const w = Math.abs(clientX - startClientX);
            const h = Math.abs(clientY - startClientY);

            if (selectionBox) {
                selectionBox.style.left = `${x1 - rect.left}px`;
                selectionBox.style.top = `${y1 - rect.top}px`;
                selectionBox.style.width = `${w}px`;
                selectionBox.style.height = `${h}px`;
            }
        };

        const stopSelect = (e) => {
            if (!isDragging) return;
            isDragging = false;

            if (selectionBox) selectionBox.classList.add('hidden');

            const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
            const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

            // Project selection box coordinates to original image coordinates
            const rect = canvas.getBoundingClientRect();
            
            const startX = Math.round(((Math.min(startClientX, clientX) - rect.left) / rect.width) * canvas.width);
            const startY = Math.round(((Math.min(startClientY, clientY) - rect.top) / rect.height) * canvas.height);
            const endX = Math.round(((Math.max(startClientX, clientX) - rect.left) / rect.width) * canvas.width);
            const endY = Math.round(((Math.max(startClientY, clientY) - rect.top) / rect.height) * canvas.height);

            const cropW = endX - startX;
            const cropH = endY - startY;

            if (cropW > 3 && cropH > 3) {
                const imgElement = elements.mangaBgImage;
                if (imgElement && imgElement.naturalWidth) {
                    try {
                        patchCanvas = document.createElement('canvas');
                        patchCanvas.width = cropW;
                        patchCanvas.height = cropH;
                        const patchCtx = patchCanvas.getContext('2d');

                        // Copy cropped texture from original background image as a circular patch
                        patchCtx.save();
                        patchCtx.beginPath();
                        const r = Math.min(cropW, cropH) / 2;
                        const cx = cropW / 2;
                        const cy = cropH / 2;
                        patchCtx.arc(cx, cy, r, 0, Math.PI * 2);
                        patchCtx.clip();

                        patchCtx.drawImage(imgElement, startX, startY, cropW, cropH, 0, 0, cropW, cropH);
                        patchCtx.restore();

                        showToast(`Đã copy thành công họa tiết ${cropW}x${cropH}px. Click chuột vào bất kỳ đâu để dán!`, "success");
                        
                        isSelectingPatch = false;
                        isPatchStampActive = true;

                        const lblStatus = document.getElementById('lbl-stamp-status');
                        if (lblStatus) {
                            lblStatus.innerText = `Mẫu: ${cropW}x${cropH}px`;
                            lblStatus.classList.remove('text-teal-400');
                            lblStatus.classList.add('text-indigo-400');
                        }

                        setEraserBrushMode('stamp');
                    } catch (err) {
                        console.error("Cropping texture error:", err);
                        showToast("Không thể sao chép họa tiết từ ảnh.", "error");
                    }
                }
            } else {
                showToast("Vùng quét quá nhỏ, vui lòng thử lại.", "warn");
                isSelectingPatch = false;
                setEraserBrushMode('stamp');
            }
        };

        canvas.onmousedown = startSelect;
        canvas.onmousemove = dragSelect;
        canvas.onmouseup = stopSelect;
        canvas.onmouseleave = () => { isDragging = false; if (selectionBox) selectionBox.classList.add('hidden'); };

        canvas.ontouchstart = startSelect;
        canvas.ontouchmove = dragSelect;
        canvas.ontouchend = stopSelect;
        return;
    }

    // --- CASE 2: Stamp Texture Mode ---
    if (brushMode === 'stamp' && isPatchStampActive && patchCanvas) {
        const updatePreview = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            // Display size matches current zoom on screen
            const displayW = Math.round(patchCanvas.width * (rect.width / canvas.width));
            const displayH = Math.round(patchCanvas.height * (rect.height / canvas.height));

            const containerRect = container.getBoundingClientRect();
            const x = clientX - containerRect.left - displayW / 2;
            const y = clientY - containerRect.top - displayH / 2;

            if (previewCanvas) {
                previewCanvas.width = displayW;
                previewCanvas.height = displayH;
                const pCtx = previewCanvas.getContext('2d');
                pCtx.clearRect(0, 0, displayW, displayH);
                pCtx.drawImage(patchCanvas, 0, 0, displayW, displayH);

                previewCanvas.style.left = `${x}px`;
                previewCanvas.style.top = `${y}px`;
                previewCanvas.style.width = `${displayW}px`;
                previewCanvas.style.height = `${displayH}px`;
                previewCanvas.classList.remove('hidden');
            }
        };

        const applyStamp = (e) => {
            e.preventDefault();
            const pos = getMousePos(e);
            pushStateToHistory();

            // Center patch drawing at click coordinates
            const drawX = Math.round(pos.x - patchCanvas.width / 2);
            const drawY = Math.round(pos.y - patchCanvas.height / 2);

            ctx.drawImage(patchCanvas, drawX, drawY);

            saveEraserDrawingToPage();
            showToast("Đã đóng dấu dán đè họa tiết thành công!", "success");
        };

        canvas.onmousemove = updatePreview;
        canvas.onmousedown = applyStamp;
        canvas.onmouseleave = () => { if (previewCanvas) previewCanvas.classList.add('hidden'); };

        canvas.ontouchmove = updatePreview;
        canvas.ontouchstart = applyStamp;
        return;
    }

    // --- CASE 3: Standard solid color brush ---
    if (previewCanvas) previewCanvas.classList.add('hidden');

    const startDraw = (e) => {
        e.preventDefault();
        const pos = getMousePos(e);

        isDrawingOnEraser = true;
        lastX = pos.x;
        lastY = pos.y;

        ctx.beginPath();
        ctx.arc(lastX, lastY, eraserBrushSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = eraserColor;
        ctx.fill();

        pushStateToHistory();
    };

    const draw = (e) => {
        const pos = getMousePos(e);

        if (!isDrawingOnEraser) return;
        e.preventDefault();

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = eraserColor;
        ctx.lineWidth = eraserBrushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        lastX = pos.x;
        lastY = pos.y;
    };

    const stopDraw = () => {
        isDrawingOnEraser = false;
    };

    canvas.onmousedown = startDraw;
    canvas.onmousemove = draw;
    canvas.onmouseup = stopDraw;
    canvas.onmouseleave = stopDraw;

    canvas.ontouchstart = startDraw;
    canvas.ontouchmove = draw;
    canvas.ontouchend = stopDraw;
}

export function clearEraserDrawing() {
    if (globalState.activePageIndex === -1) return;
    const canvas = elements.eraserCanvas;
    const ctx = canvas.getContext('2d');
    pushStateToHistory();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveEraserDrawingToPage();
    showToast("Đã xóa nét vẽ trên trang.", "info");
}

export async function saveEraserDrawingToPage() {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    const canvas = elements.eraserCanvas;

    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasDrawings = imgData.data.some(val => val !== 0);

    if (hasDrawings) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        page.eraserLayerBlob = blob;
    } else {
        page.eraserLayerBlob = null;
    }

    savePageToDB(page);
}

export function restorePageEraserDrawing(page) {
    const canvas = elements.eraserCanvas;
    if (!canvas) return Promise.resolve();
    const ctx = canvas.getContext('2d');

    canvas.width = elements.mangaBgImage.naturalWidth || page.width || 1200;
    canvas.height = elements.mangaBgImage.naturalHeight || page.height || 1600;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (page.eraserLayerBlob) {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(page.eraserLayerBlob);
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
                resolve();
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve();
            };
            img.src = url;
        });
    }
    return Promise.resolve();
}

export function cleanMangaBackgroundArtText(ctx, width, height) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Step 1: Calculate average luminance of the surrounding background (outer 12% rim)
    let bgLumSum = 0, bgCount = 0;
    const rimX = Math.max(1, Math.floor(width * 0.12));
    const rimY = Math.max(1, Math.floor(height * 0.12));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const isRim = (x < rimX || x >= width - rimX || y < rimY || y >= height - rimY);
            if (isRim) {
                const p = (y * width + x) * 4;
                const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
                bgLumSum += lum;
                bgCount++;
            }
        }
    }
    const avgBgLum = bgCount > 0 ? (bgLumSum / bgCount) : 120;

    // Step 2: Mark text pixels (Both dark strokes AND white characters with black outlines)
    const mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const p = idx * 4;
            const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];

            // Mark dark text/outlines OR bright white Katakana/SFX glyphs
            const isDarkStroke = lum < Math.min(140, avgBgLum - 20);
            const isWhiteGlyph = lum > Math.max(160, avgBgLum + 20);
            const isHighContrast = Math.abs(lum - avgBgLum) > 25;

            if (isDarkStroke || isWhiteGlyph || isHighContrast) {
                mask[idx] = 1;
            }
        }
    }

    // Step 3: Morphological Dilation (expand text mask by 3px to cover outlines)
    const dilatedMask = new Uint8Array(width * height);
    const dilateRadius = 3;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (mask[idx]) {
                for (let dy = -dilateRadius; dy <= dilateRadius; dy++) {
                    const ny = y + dy;
                    if (ny < 0 || ny >= height) continue;
                    for (let dx = -dilateRadius; dx <= dilateRadius; dx++) {
                        const nx = x + dx;
                        if (nx < 0 || nx >= width) continue;
                        dilatedMask[ny * width + nx] = 1;
                    }
                }
            }
        }
    }

    // Step 4: Multi-pass Telea Inpainting using surrounding background pixels
    const radius = 5;
    const r2 = radius * radius;

    for (let pass = 0; pass < 4; pass++) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (!dilatedMask[idx]) continue;

                let sumR = 0, sumG = 0, sumB = 0, totalWeight = 0;
                for (let dy = -radius; dy <= radius; dy++) {
                    const ny = y + dy;
                    if (ny < 0 || ny >= height) continue;
                    for (let dx = -radius; dx <= radius; dx++) {
                        const nx = x + dx;
                        if (nx < 0 || nx >= width) continue;

                        const d2 = dx * dx + dy * dy;
                        if (d2 === 0 || d2 > r2) continue;

                        const nIdx = ny * width + nx;
                        if (dilatedMask[nIdx]) continue; // Only sample clean background pixels

                        const weight = 1 / Math.sqrt(d2);
                        const p = nIdx * 4;
                        sumR += data[p] * weight;
                        sumG += data[p + 1] * weight;
                        sumB += data[p + 2] * weight;
                        totalWeight += weight;
                    }
                }

                if (totalWeight > 0) {
                    const p = idx * 4;
                    data[p] = Math.round(sumR / totalWeight);
                    data[p + 1] = Math.round(sumG / totalWeight);
                    data[p + 2] = Math.round(sumB / totalWeight);
                    data[p + 3] = 255;
                }
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);
}

export async function aiSmartInpaintBlock(mode = 'local') {
    const activePage = globalState.pages[globalState.activePageIndex];
    if (!activePage || !globalState.selectedBlockId) {
        showToast('Hãy chọn một ô thoại để thực hiện Smart Inpainting.', 'warn');
        return;
    }
    const block = activePage.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    const imgElement = elements.mangaBgImage;
    if (!imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) {
        showToast('Ảnh gốc chưa sẵn sàng để thực hiện Inpainting.', 'warn');
        return;
    }

    pushStateToHistory();

    const canvas = elements.eraserCanvas;
    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;

    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    const isSpeechBubble = (block.type === 'dialogue' || block.type === 'narration');

    if (isSpeechBubble) {
        // TRƯỜNG HỢP 1: BONG BÓNG THOẠI TRẮNG (Phủ trắng bong bóng, giữ đường viền cong)
        block.style.maskShape = 'bubble-fit';
        block.style.maskSize = 'full';
        block.style.bgColor = '#ffffff';
        block.style.bgOpacity = 100;
        block.maskCache = null;

        autoCleanBubbleBackground(activePage, block);
        saveEraserDrawingToPage();
        requestOverlayRender();
        uiUpdateActiveBlockEditor();
        showToast('✨ Đã làm sạch & phủ trắng hoàn hảo cho bong bóng thoại!', 'success');
        return;
    }

    // TRƯỜNG HỢP 2: CHỮ SFX / NỀN TRANH TRANH PHỨC TẠP (Chữ Katakana trắng viền đen trên trần nhà tối)
    const marginX = block.box.w * 0.06;
    const marginY = block.box.h * 0.06;
    const cropX = Math.max(0, Math.round(((block.box.x - marginX) / 100) * W));
    const cropY = Math.max(0, Math.round(((block.box.y - marginY) / 100) * H));
    const cropW = Math.min(W - cropX, Math.round(((block.box.w + marginX * 2) / 100) * W));
    const cropH = Math.min(H - cropY, Math.round(((block.box.h + marginY * 2) / 100) * H));

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // Chạy thuật toán Telea Inpainting nhận diện cả chữ trắng + viền đen trên nền tối
    cleanMangaBackgroundArtText(tempCtx, cropW, cropH);

    // Dán mảnh vá đã xóa chữ lên eraserCanvas
    ctx.drawImage(tempCanvas, cropX, cropY);

    // Chuyển nền ô thoại thành trong suốt để hiện phần tranh nền đã Inpaint bên dưới
    block.style.bgOpacity = 0;
    block.maskCache = null;

    saveEraserDrawingToPage();
    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    showToast('✨ Đã xóa chữ SFX & khôi phục kết cấu nền manga!', 'success');
}

export async function activateEyedropper() {
    if (globalState.activePageIndex === -1) return;

    if (!isEraserModeActive) {
        toggleEraserMode();
    }

    if (window.EyeDropper) {
        const eyeDropper = new EyeDropper();
        try {
            const result = await eyeDropper.open();
            setEraserColor(result.sRGBHex);
            showToast(`Đã chọn màu: ${result.sRGBHex}`, "success");
            return;
        } catch (e) {
            console.log("Native EyeDropper closed or cancelled:", e);
        }
    }

    const canvas = elements.eraserCanvas;
    if (!canvas) return;

    const originalCursor = canvas.style.cursor;
    canvas.style.cursor = 'crosshair';
    showToast("Nhấp chuột lên vùng tranh truyện trên ảnh để chọn màu xóa.", "info");

    const onCanvasClick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX;
        const clientY = e.clientY;

        const x = Math.round(((clientX - rect.left) / rect.width) * canvas.width);
        const y = Math.round(((clientY - rect.top) / rect.height) * canvas.height);

        const imgElement = elements.mangaBgImage;
        if (imgElement && imgElement.naturalWidth) {
            try {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = 1;
                tempCanvas.height = 1;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(imgElement, x, y, 1, 1, 0, 0, 1, 1);
                const pixelData = tempCtx.getImageData(0, 0, 1, 1).data;
                const hexColor = '#' + [pixelData[0], pixelData[1], pixelData[2]].map(val => {
                    const hex = val.toString(16);
                    return hex.length === 1 ? '0' + hex : hex;
                }).join('');

                setEraserColor(hexColor);
                showToast(`Đã chọn màu: ${hexColor}`, "success");
            } catch (err) {
                console.error("Custom Eyedropper error:", err);
            }
        }

        canvas.style.cursor = originalCursor;
        canvas.removeEventListener('click', onCanvasClick);
    };

    canvas.addEventListener('click', onCanvasClick);
}

// Window bindings for inline HTML onClick handlers
window.autoCleanActiveBlock = autoCleanActiveBlock;
window.toggleEraserMode = toggleEraserMode;
window.updateEraserBrushSize = updateEraserBrushSize;
window.setEraserColor = setEraserColor;
window.clearEraserDrawing = clearEraserDrawing;
window.aiSmartInpaintBlock = aiSmartInpaintBlock;
window.activateEyedropper = activateEyedropper;
window.setEraserBrushMode = setEraserBrushMode;
window.startTexturePatchSelection = startTexturePatchSelection;

