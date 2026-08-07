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
    const btnSpotInpaint = document.getElementById('btn-brush-mode-spot-inpaint');
    const stampControls = document.getElementById('stamp-controls');
    const brushColorContainer = document.getElementById('brush-color-container');
    const brushSizeContainer = document.getElementById('brush-size-container');

    // Reset button states
    [btnEraser, btnStamp, btnSpotInpaint].forEach(btn => {
        if (btn) {
            btn.classList.remove('bg-indigo-600', 'text-white');
            btn.classList.add('text-slate-400', 'hover:text-slate-200');
        }
    });

    if (mode === 'stamp') {
        if (btnStamp) {
            btnStamp.classList.add('bg-indigo-600', 'text-white');
            btnStamp.classList.remove('text-slate-400', 'hover:text-slate-200');
        }
        if (stampControls) stampControls.classList.remove('hidden');
        if (brushColorContainer) brushColorContainer.classList.add('hidden');
        if (brushSizeContainer) brushSizeContainer.classList.add('hidden');
        
        isPatchStampActive = patchCanvas !== null;
    } else if (mode === 'spot-inpaint') {
        if (btnSpotInpaint) {
            btnSpotInpaint.classList.add('bg-indigo-600', 'text-white');
            btnSpotInpaint.classList.remove('text-slate-400', 'hover:text-slate-200');
        }
        if (stampControls) stampControls.classList.add('hidden');
        if (brushColorContainer) brushColorContainer.classList.add('hidden');
        if (brushSizeContainer) brushSizeContainer.classList.remove('hidden');
        
        isPatchStampActive = false;
        isSelectingPatch = false;
    } else { // mode === 'eraser'
        if (btnEraser) {
            btnEraser.classList.add('bg-indigo-600', 'text-white');
            btnEraser.classList.remove('text-slate-400', 'hover:text-slate-200');
        }
        if (stampControls) stampControls.classList.add('hidden');
        if (brushColorContainer) brushColorContainer.classList.remove('hidden');
        if (brushSizeContainer) brushSizeContainer.classList.remove('hidden');
        
        isPatchStampActive = false;
        isSelectingPatch = false;
    }

    const selectionBox = document.getElementById('patch-selection-box');
    if (selectionBox) selectionBox.classList.add('hidden');
    
    const previewCanvas = elements.patchPreviewCanvas;
    if (previewCanvas) previewCanvas.classList.add('hidden');

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

    // --- CASE 2.5: Spot Inpaint Brush Mode ---
    if (brushMode === 'spot-inpaint') {
        let isDrawing = false;
        let preStrokeImageData = null;
        let strokeCanvas = null;
        let strokeCtx = null;
        let minX = 0, minY = 0, maxX = 0, maxY = 0;

        const startSpot = (e) => {
            e.preventDefault();
            const pos = getMousePos(e);
            
            isDrawing = true;
            lastX = pos.x;
            lastY = pos.y;
            minX = pos.x;
            minY = pos.y;
            maxX = pos.x;
            maxY = pos.y;

            // Backup main canvas state
            preStrokeImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            // Create temporary mask canvas
            strokeCanvas = document.createElement('canvas');
            strokeCanvas.width = canvas.width;
            strokeCanvas.height = canvas.height;
            strokeCtx = strokeCanvas.getContext('2d');

            // Draw initial dot on both
            const r = eraserBrushSize / 2;
            
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(168, 85, 247, 0.55)';
            ctx.fill();

            strokeCtx.beginPath();
            strokeCtx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
            strokeCtx.fillStyle = '#ffffff';
            strokeCtx.fill();
        };

        const drawSpot = (e) => {
            if (!isDrawing) return;
            e.preventDefault();
            const pos = getMousePos(e);

            minX = Math.min(minX, pos.x);
            minY = Math.min(minY, pos.y);
            maxX = Math.max(maxX, pos.x);
            maxY = Math.max(maxY, pos.y);

            // Draw line on main canvas (purple overlay)
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(pos.x, pos.y);
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.55)';
            ctx.lineWidth = eraserBrushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            // Draw line on mask canvas (white mask)
            strokeCtx.beginPath();
            strokeCtx.moveTo(lastX, lastY);
            strokeCtx.lineTo(pos.x, pos.y);
            strokeCtx.strokeStyle = '#ffffff';
            strokeCtx.lineWidth = eraserBrushSize;
            strokeCtx.lineCap = 'round';
            strokeCtx.lineJoin = 'round';
            strokeCtx.stroke();

            lastX = pos.x;
            lastY = pos.y;
        };

        const applySpotInpaint = async (e) => {
            if (!isDrawing) return;
            isDrawing = false;

            // Restore canvas to hide purple lines
            if (preStrokeImageData) {
                ctx.putImageData(preStrokeImageData, 0, 0);
            }

            const pad = Math.ceil(eraserBrushSize / 2 + 5);
            const startX = Math.max(0, Math.floor(minX - pad));
            const startY = Math.max(0, Math.floor(minY - pad));
            const endX = Math.min(canvas.width, Math.ceil(maxX + pad));
            const endY = Math.min(canvas.height, Math.ceil(maxY + pad));
            const cropW = endX - startX;
            const cropH = endY - startY;

            if (cropW > 3 && cropH > 3) {
                const imgElement = elements.mangaBgImage;
                const page = globalState.pages[globalState.activePageIndex];
                if (imgElement && imgElement.naturalWidth && page) {
                    try {
                        pushStateToHistory();

                        // Get mask bytes from strokeCanvas
                        const strokeImgData = strokeCtx.getImageData(startX, startY, cropW, cropH);
                        const sData = strokeImgData.data;
                        const maskBytes = new Uint8Array(cropW * cropH);
                        for (let i = 0; i < cropW * cropH; i++) {
                            if (sData[i * 4 + 3] > 10) {
                                maskBytes[i] = 1;
                            }
                        }

                        // Crop background image
                        const patchCanvas = document.createElement('canvas');
                        patchCanvas.width = cropW;
                        patchCanvas.height = cropH;
                        const patchCtx = patchCanvas.getContext('2d');
                        patchCtx.drawImage(imgElement, startX, startY, cropW, cropH, 0, 0, cropW, cropH);

                        // Run Telea Inpainting on crop using maskBytes
                        cleanMangaBackgroundArtWithMask(patchCtx, cropW, cropH, maskBytes);

                        // Draw clean patch onto eraserCanvas
                        ctx.drawImage(patchCanvas, startX, startY);

                        await saveEraserDrawingToPage();
                        requestOverlayRender();
                        showToast("✨ Đã tẩy sạch vùng chọn và vẽ bù kết cấu nền!", "success");
                    } catch (err) {
                        console.error("Spot inpaint error:", err);
                        showToast("Không thể thực hiện Spot Inpainting.", "error");
                    }
                }
            }
        };

        canvas.onmousedown = startSpot;
        canvas.onmousemove = drawSpot;
        canvas.onmouseup = applySpotInpaint;
        canvas.onmouseleave = applySpotInpaint;

        canvas.ontouchstart = startSpot;
        canvas.ontouchmove = drawSpot;
        canvas.ontouchend = applySpotInpaint;
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

export function cleanMangaBackgroundArtWithMask(ctx, width, height, maskBytes) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Step 1: Dilate the brush mask by 4px to completely cover outlines
    const dilatedMask = new Uint8Array(width * height);
    const dilateRadius = 4;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (maskBytes[idx]) {
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

    // Step 1.5: Sample boundary pixels to measure surrounding noise/grain (screentone intensity)
    let boundaryPixels = [];
    const step = Math.max(1, Math.floor(dilatedMask.length / 500)); // Sample up to 500 boundary pixels
    for (let i = 0; i < dilatedMask.length; i += step) {
        if (!dilatedMask[i]) {
            const x = i % width;
            const y = Math.floor(i / width);
            let isBoundary = false;
            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= height) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= width) continue;
                    if (dilatedMask[ny * width + nx]) {
                        isBoundary = true;
                        break;
                    }
                }
                if (isBoundary) break;
            }
            if (isBoundary) {
                const p = i * 4;
                const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
                boundaryPixels.push(lum);
            }
        }
    }

    let stdDev = 0;
    if (boundaryPixels.length > 0) {
        const sum = boundaryPixels.reduce((a, b) => a + b, 0);
        const avgLum = sum / boundaryPixels.length;
        const sqSum = boundaryPixels.reduce((a, b) => a + (b - avgLum) * (b - avgLum), 0);
        stdDev = Math.sqrt(sqSum / boundaryPixels.length);
    }

    // Calculate noise amplitude (higher contrast background -> more grain to prevent flat blurry regions)
    // For flat black or white backgrounds, stdDev is low, so noiseAmp is nearly 0.
    const noiseAmp = Math.min(16, stdDev * 0.45);

    // Step 2: 8-Directional Boundary Interpolation (Harmonic Inpainting)
    const dirs = [
        { x: 0, y: -1 },  // Up
        { x: 0, y: 1 },   // Down
        { x: -1, y: 0 },  // Left
        { x: 1, y: 0 },   // Right
        { x: -1, y: -1 }, // Up-Left
        { x: 1, y: -1 },  // Up-Right
        { x: -1, y: 1 },  // Down-Left
        { x: 1, y: 1 }    // Down-Right
    ];

    const outR = new Uint8Array(width * height);
    const outG = new Uint8Array(width * height);
    const outB = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (!dilatedMask[idx]) continue;

            let sumR = 0, sumG = 0, sumB = 0, totalWeight = 0;

            for (const dir of dirs) {
                let dist = 1;
                while (dist < 100) {
                    const nx = x + dir.x * dist;
                    const ny = y + dir.y * dist;

                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
                        break;
                    }

                    const nIdx = ny * width + nx;
                    if (!dilatedMask[nIdx]) {
                        const p = nIdx * 4;
                        const weight = 1 / (dist * dist); // Inverse distance squared
                        sumR += data[p] * weight;
                        sumG += data[p + 1] * weight;
                        sumB += data[p + 2] * weight;
                        totalWeight += weight;
                        break;
                    }
                    dist++;
                }
            }

            if (totalWeight > 0) {
                outR[idx] = Math.round(sumR / totalWeight);
                outG[idx] = Math.round(sumG / totalWeight);
                outB[idx] = Math.round(sumB / totalWeight);
            } else {
                // Fallback to surrounding color if no boundary found in direction
                const p = idx * 4;
                outR[idx] = data[p];
                outG[idx] = data[p + 1];
                outB[idx] = data[p + 2];
            }
        }
    }

    // Write back to image data with monochrome grain matching
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (dilatedMask[idx]) {
                const p = idx * 4;
                // Add gray noise offset to prevent digital blur
                const noise = (Math.random() - 0.5) * noiseAmp;
                data[p] = Math.min(255, Math.max(0, outR[idx] + noise));
                data[p + 1] = Math.min(255, Math.max(0, outG[idx] + noise));
                data[p + 2] = Math.min(255, Math.max(0, outB[idx] + noise));
                data[p + 3] = 255;
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);
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

            const isDarkStroke = lum < Math.min(140, avgBgLum - 20);
            const isWhiteGlyph = lum > Math.max(160, avgBgLum + 20);
            const isHighContrast = Math.abs(lum - avgBgLum) > 25;

            if (isDarkStroke || isWhiteGlyph || isHighContrast) {
                mask[idx] = 1;
            }
        }
    }

    // Step 3: Run 8-Directional Boundary Interpolation using this auto-detected mask!
    cleanMangaBackgroundArtWithMask(ctx, width, height, mask);
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

