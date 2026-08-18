// Automated Cleaning & Manual Eraser / Clone Stamp Tools
import { globalState, pushStateToHistory, savePageToDB, uiUpdateActiveBlockEditor } from '../core/state.js';
import { elements } from '../core/elements.js';
import { showToast } from '../core/utils.js';
import { requestOverlayRender } from './canvas/canvas-service.js';
import { computeBubbleMask } from './ocr/ocr-service.js';
import { getConfiguredApiKey, getGeminiGenerateContentUrl } from './ai/ai-config.js';

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
            tempCanvas.width = 0;
            tempCanvas.height = 0;
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

export function openEraserMode() {
    if (globalState.activePageIndex === -1) return;
    if (isEraserModeActive) {
        if (elements.eraserSettingsPanel) elements.eraserSettingsPanel.classList.remove('hidden');
        const trigger = document.getElementById('btn-eraser-floating-trigger');
        if (trigger) trigger.classList.add('hidden');
        return;
    }
    setEraserMode(true);
}

export function closeEraserMode() {
    if (!isEraserModeActive) return;
    setEraserMode(false);
}

export function setEraserMode(active) {
    if (globalState.activePageIndex === -1) return;

    isEraserModeActive = active;

    const floatingBtn = document.getElementById('btn-eraser-mode-floating');

    if (isEraserModeActive) {
        if (elements.eraserSettingsPanel) elements.eraserSettingsPanel.classList.remove('hidden');
        const trigger = document.getElementById('btn-eraser-floating-trigger');
        if (trigger) trigger.classList.add('hidden');

        if (elements.btnEraserMode) {
            elements.btnEraserMode.classList.add('bg-indigo-600', 'text-white');
            elements.btnEraserMode.classList.remove('bg-slate-800', 'text-slate-300');
        }
        if (floatingBtn) {
            floatingBtn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-500');
            floatingBtn.classList.remove('bg-slate-900', 'text-slate-300');
        }

        elements.eraserCanvas.classList.add('drawing-active');
        elements.mangaOverlaysContainer.classList.add('pointer-events-none');

        initEraserDrawingEvents();
        showToast("Đã bật chế độ cọ tẩy. Dùng chuột/bút vẽ trực tiếp lên ảnh để xóa.", "info");
    } else {
        if (elements.eraserSettingsPanel) elements.eraserSettingsPanel.classList.add('hidden');
        const trigger = document.getElementById('btn-eraser-floating-trigger');
        if (trigger) trigger.classList.add('hidden');

        if (elements.btnEraserMode) {
            elements.btnEraserMode.classList.remove('bg-indigo-600', 'text-white');
            elements.btnEraserMode.classList.add('bg-slate-800', 'text-slate-300');
        }
        if (floatingBtn) {
            floatingBtn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-500');
            floatingBtn.classList.add('bg-slate-900', 'text-slate-300');
        }

        elements.eraserCanvas.classList.remove('drawing-active');
        elements.mangaOverlaysContainer.classList.remove('pointer-events-none');

        saveEraserDrawingToPage();
    }
}

export function toggleEraserMode(forcedState) {
    if (typeof forcedState === 'boolean') {
        setEraserMode(forcedState);
    } else {
        openEraserMode();
    }
}

export function updateEraserBrushSize(val) {
    eraserBrushSize = parseInt(val, 10);
    if (elements.lblEraserBrushSize) {
        elements.lblEraserBrushSize.innerText = `${val}px`;
    }
}
export const setEraserBrushSize = updateEraserBrushSize;

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
    const btnLasso = document.getElementById('btn-brush-mode-lasso');
    const stampControls = document.getElementById('stamp-controls');
    const lassoControls = document.getElementById('lasso-controls');
    const brushColorContainer = document.getElementById('brush-color-container');
    const brushSizeContainer = document.getElementById('brush-size-container');

    // Reset button states
    [btnEraser, btnStamp, btnSpotInpaint, btnLasso].forEach(btn => {
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
        if (lassoControls) lassoControls.classList.add('hidden');
        if (brushColorContainer) brushColorContainer.classList.add('hidden');
        if (brushSizeContainer) brushSizeContainer.classList.add('hidden');

        isPatchStampActive = patchCanvas !== null;
    } else if (mode === 'spot-inpaint') {
        if (btnSpotInpaint) {
            btnSpotInpaint.classList.add('bg-indigo-600', 'text-white');
            btnSpotInpaint.classList.remove('text-slate-400', 'hover:text-slate-200');
        }
        if (stampControls) stampControls.classList.add('hidden');
        if (lassoControls) lassoControls.classList.add('hidden');
        if (brushColorContainer) brushColorContainer.classList.add('hidden');
        if (brushSizeContainer) brushSizeContainer.classList.remove('hidden');

        isPatchStampActive = false;
        isSelectingPatch = false;
    } else if (mode === 'lasso') {
        if (btnLasso) {
            btnLasso.classList.add('bg-indigo-600', 'text-white');
            btnLasso.classList.remove('text-slate-400', 'hover:text-slate-200');
        }
        if (stampControls) stampControls.classList.add('hidden');
        if (lassoControls) lassoControls.classList.remove('hidden');
        if (brushColorContainer) brushColorContainer.classList.add('hidden');
        if (brushSizeContainer) brushSizeContainer.classList.add('hidden');

        isPatchStampActive = false;
        isSelectingPatch = false;

        // Clear lasso selection on mode enter
        window.activeLassoPoints = null;
        const fillBtn = document.getElementById('btn-lasso-fill');
        if (fillBtn) fillBtn.disabled = true;
    } else { // mode === 'eraser'
        if (btnEraser) {
            btnEraser.classList.add('bg-indigo-600', 'text-white');
            btnEraser.classList.remove('text-slate-400', 'hover:text-slate-200');
        }
        if (stampControls) stampControls.classList.add('hidden');
        if (lassoControls) lassoControls.classList.add('hidden');
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

    // --- CASE 0.5: Lasso Selection Mode (Freehand Polygon & Rectangular Box Selection) ---
    if (brushMode === 'lasso') {
        let isDrawing = false;
        let points = [];
        let startPos = null;
        let preLassoImageData = null;

        const startLasso = (e) => {
            e.preventDefault();
            const pos = getMousePos(e);
            isDrawing = true;
            startPos = pos;
            points = [pos];

            // 1. Wipe any previous lasso selection outline/overlay from canvas
            if (window.lassoOriginalImageData) {
                ctx.putImageData(window.lassoOriginalImageData, 0, 0);
            }

            // 2. Capture clean canvas state before this new lasso begins
            preLassoImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            window.lassoOriginalImageData = preLassoImageData;
            window.activeLassoPoints = null;

            const fillBtn = document.getElementById('btn-lasso-fill');
            if (fillBtn) fillBtn.disabled = true;

            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
        };

        const drawLasso = (e) => {
            if (!isDrawing) return;
            e.preventDefault();
            const pos = getMousePos(e);

            if (e.shiftKey) {
                // Chế độ vẽ Khung chữ nhật / hình vuông (Shift Drag Rectangular Box)
                points = [
                    { x: startPos.x, y: startPos.y },
                    { x: pos.x, y: startPos.y },
                    { x: pos.x, y: pos.y },
                    { x: startPos.x, y: pos.y }
                ];
            } else {
                points.push(pos);
            }

            // Redraw backed-up canvas first to remove old lasso path lines
            ctx.putImageData(preLassoImageData, 0, 0);

            // Draw selection line path
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            if (e.shiftKey) ctx.closePath();
            ctx.strokeStyle = '#a855f7'; // Purple dashed line
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            if (e.shiftKey) {
                ctx.fillStyle = 'rgba(168, 85, 247, 0.12)';
                ctx.fill();
            }
            ctx.restore();
        };

        const stopLasso = (e) => {
            if (!isDrawing) return;
            isDrawing = false;

            if (points.length < 3) {
                // Not enough points (e.g. single click) -> Restore clean canvas and clear selection
                if (preLassoImageData) {
                    ctx.putImageData(preLassoImageData, 0, 0);
                }
                points = [];
                window.activeLassoPoints = null;
                const fillBtn = document.getElementById('btn-lasso-fill');
                if (fillBtn) fillBtn.disabled = true;
                return;
            }

            // Close the path and redraw cleanly on the original image
            ctx.putImageData(preLassoImageData, 0, 0);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.closePath();

            // Draw finalized marching ants closed polygon
            ctx.strokeStyle = '#a855f7';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.stroke();

            // Draw transparent overlay
            ctx.fillStyle = 'rgba(168, 85, 247, 0.12)';
            ctx.fill();
            ctx.restore();

            // Strictly ONLY the single newest selection is active
            window.activeLassoPoints = points;

            const fillBtn = document.getElementById('btn-lasso-fill');
            if (fillBtn) fillBtn.disabled = false;
        };

        canvas.onmousedown = startLasso;
        canvas.onmousemove = drawLasso;
        canvas.onmouseup = stopLasso;
        canvas.onmouseleave = stopLasso;

        canvas.ontouchstart = startLasso;
        canvas.ontouchmove = drawLasso;
        canvas.ontouchend = stopLasso;
        return;
    }

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
                        const patchCtx = patchCanvas.getContext('2d', { willReadFrequently: true });
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
        if (isDrawingOnEraser) {
            isDrawingOnEraser = false;
            saveEraserDrawingToPage();
        }
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
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    pushStateToHistory();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveEraserDrawingToPage();
    showToast("Đã xóa nét vẽ trên trang.", "info");
}

export async function saveEraserDrawingToPage() {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    const canvas = elements.eraserCanvas;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

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

export async function cleanMangaBackgroundArtWithMask(ctx, width, height, maskBytes) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const P = 3; // 7x7 patch radius
    const MASK_RADIUS = 2;

    // 1. Dilate target mask to cover text antialiasing fringes
    const targetMask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (maskBytes[idx]) {
                for (let dy = -MASK_RADIUS; dy <= MASK_RADIUS; dy++) {
                    const ny = y + dy;
                    if (ny < 0 || ny >= height) continue;
                    for (let dx = -MASK_RADIUS; dx <= MASK_RADIUS; dx++) {
                        const nx = x + dx;
                        if (nx < 0 || nx >= width) continue;
                        targetMask[ny * width + nx] = 1;
                    }
                }
            }
        }
    }

    // 2. Scan bounding box of mask to determine structure
    let minMaskX = width, maxMaskX = 0, minMaskY = height, maxMaskY = 0;
    let maskedRowCount = 0;
    let horizontalMatchCount = 0;

    for (let y = 0; y < height; y++) {
        let rowHasMask = false;
        let leftValid = -1, rightValid = -1;

        for (let x = 0; x < width; x++) {
            if (targetMask[y * width + x]) {
                rowHasMask = true;
                minMaskX = Math.min(minMaskX, x);
                maxMaskX = Math.max(maxMaskX, x);
                minMaskY = Math.min(minMaskY, y);
                maxMaskY = Math.max(maxMaskY, y);
            } else {
                if (leftValid === -1 && !rowHasMask) leftValid = x;
                if (rowHasMask) rightValid = x;
            }
        }

        if (rowHasMask && leftValid !== -1 && rightValid !== -1) {
            maskedRowCount++;
            const pL = (y * width + leftValid) * 4;
            const pR = (y * width + rightValid) * 4;
            const diff = Math.abs(data[pL] - data[pR]) + Math.abs(data[pL + 1] - data[pR + 1]) + Math.abs(data[pL + 2] - data[pR + 2]);
            if (diff < 45) {
                horizontalMatchCount++;
            }
        }
    }

    // A. Check for Horizontal Line Screentone
    if (maskedRowCount > 4 && (horizontalMatchCount / maskedRowCount) > 0.65) {
        // Continuous Horizontal Line Synthesis: Fill row by row from immediate left/right valid neighbor
        for (let y = minMaskY; y <= maxMaskY; y++) {
            // Find left and right valid border pixels for this specific row
            let srcP = -1;
            for (let x = 0; x < width; x++) {
                if (!targetMask[y * width + x]) {
                    srcP = (y * width + x) * 4;
                    break;
                }
            }
            if (srcP !== -1) {
                for (let x = 0; x < width; x++) {
                    const idx = y * width + x;
                    if (targetMask[idx]) {
                        const p = idx * 4;
                        data[p] = data[srcP];
                        data[p + 1] = data[srcP + 1];
                        data[p + 2] = data[srcP + 2];
                        data[p + 3] = 255;
                    }
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return;
    }

    // B. Global 2D Periodic Lattice Synthesis for Halftone Dot Grids (Zero Voronoi Lines)
    // 1. Build a pool of clean background pixels
    const cleanPixels = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!targetMask[y * width + x]) {
                cleanPixels.push({ x, y, p: (y * width + x) * 4 });
            }
        }
    }

    if (cleanPixels.length === 0) return;

    // 2. Find dominant 2D pitch P and mode (Axis-aligned vs Diagonal 45°)
    const testPitches = [3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16];
    let bestPitch = 6;
    let bestCorrelation = Infinity;
    let isDiagonal = true;

    for (const P of testPitches) {
        // Test Diagonal 45°
        let diagDiff = 0, diagCount = 0;
        for (let i = 0; i < Math.min(250, cleanPixels.length); i += 2) {
            const cp = cleanPixels[i];
            const nx = cp.x + P;
            const ny = cp.y + P;
            if (nx < width && ny < height && !targetMask[ny * width + nx]) {
                const p2 = (ny * width + nx) * 4;
                diagDiff += Math.abs(data[cp.p] - data[p2]) + Math.abs(data[cp.p + 1] - data[p2 + 1]) + Math.abs(data[cp.p + 2] - data[p2 + 2]);
                diagCount++;
            }
        }
        if (diagCount > 10) {
            const score = diagDiff / diagCount;
            if (score < bestCorrelation) {
                bestCorrelation = score;
                bestPitch = P;
                isDiagonal = true;
            }
        }

        // Test Axis-aligned
        let axisDiff = 0, axisCount = 0;
        for (let i = 0; i < Math.min(250, cleanPixels.length); i += 2) {
            const cp = cleanPixels[i];
            const nx = cp.x + P;
            const ny = cp.y;
            if (nx < width && !targetMask[cp.y * width + nx]) {
                const p2 = (cp.y * width + nx) * 4;
                axisDiff += Math.abs(data[cp.p] - data[p2]) + Math.abs(data[cp.p + 1] - data[p2 + 1]) + Math.abs(data[cp.p + 2] - data[p2 + 2]);
                axisCount++;
            }
        }
        if (axisCount > 10) {
            const score = axisDiff / axisCount;
            if (score < bestCorrelation) {
                bestCorrelation = score;
                bestPitch = P;
                isDiagonal = false;
            }
        }
    }

    // 3. Build a Global Phase Map T[u][v] from clean samples with canonical averaging
    const phaseSums = Array.from({ length: bestPitch }, () => Array.from({ length: bestPitch }, () => ({ r: 0, g: 0, b: 0, count: 0 })));

    for (let i = 0; i < cleanPixels.length; i++) {
        const cp = cleanPixels[i];
        let u, v;
        if (isDiagonal) {
            u = (((cp.x + cp.y) % bestPitch) + bestPitch) % bestPitch;
            v = (((cp.x - cp.y) % bestPitch) + bestPitch) % bestPitch;
        } else {
            u = ((cp.x % bestPitch) + bestPitch) % bestPitch;
            v = ((cp.y % bestPitch) + bestPitch) % bestPitch;
        }
        phaseSums[u][v].r += data[cp.p];
        phaseSums[u][v].g += data[cp.p + 1];
        phaseSums[u][v].b += data[cp.p + 2];
        phaseSums[u][v].count++;
    }

    const phaseMap = Array.from({ length: bestPitch }, () => Array.from({ length: bestPitch }, () => null));
    for (let u = 0; u < bestPitch; u++) {
        for (let v = 0; v < bestPitch; v++) {
            if (phaseSums[u][v].count > 0) {
                phaseMap[u][v] = {
                    r: Math.round(phaseSums[u][v].r / phaseSums[u][v].count),
                    g: Math.round(phaseSums[u][v].g / phaseSums[u][v].count),
                    b: Math.round(phaseSums[u][v].b / phaseSums[u][v].count)
                };
            }
        }
    }

    // Fill any missing phase slots with closest known phase
    for (let u = 0; u < bestPitch; u++) {
        for (let v = 0; v < bestPitch; v++) {
            if (!phaseMap[u][v]) {
                phaseMap[u][v] = cleanPixels[0] ? { r: data[cleanPixels[0].p], g: data[cleanPixels[0].p + 1], b: data[cleanPixels[0].p + 2] } : { r: 255, g: 255, b: 255 };
            }
        }
    }

    // 4. Synthesize the Entire Mask Using the Global Phase Map (Seamless Rigid Crystal Lattice)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (targetMask[idx]) {
                let u, v;
                if (isDiagonal) {
                    u = (((x + y) % bestPitch) + bestPitch) % bestPitch;
                    v = (((x - y) % bestPitch) + bestPitch) % bestPitch;
                } else {
                    u = ((x % bestPitch) + bestPitch) % bestPitch;
                    v = ((y % bestPitch) + bestPitch) % bestPitch;
                }
                const sample = phaseMap[u][v];
                const p = idx * 4;
                data[p] = sample.r;
                data[p + 1] = sample.g;
                data[p + 2] = sample.b;
                data[p + 3] = 255;
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);
}

export async function cleanMangaBackgroundArtText(ctx, width, height) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

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

    const mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const p = idx * 4;
            const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];

            const isDarkStroke = lum < Math.min(100, avgBgLum - 35);
            const isWhiteGlyph = lum > Math.max(200, avgBgLum + 35);
            if (isDarkStroke || isWhiteGlyph) {
                mask[idx] = 1;
            }
        }
    }

    await cleanMangaBackgroundArtWithMask(ctx, width, height, mask);
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

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const W = canvas.width;
    const H = canvas.height;

    const marginX = (block.box.w || 20) * 0.06;
    const marginY = (block.box.h || 20) * 0.06;
    const cropX = Math.max(0, Math.round(((block.box.x - marginX) / 100) * W));
    const cropY = Math.max(0, Math.round(((block.box.y - marginY) / 100) * H));
    const cropW = Math.min(W - cropX, Math.round(((block.box.w + marginX * 2) / 100) * W));
    const cropH = Math.min(H - cropY, Math.round(((block.box.h + marginY * 2) / 100) * H));

    if (cropW <= 3 || cropH <= 3) {
        showToast('Kích thước ô thoại không hợp lệ.', 'warn');
        return;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    tempCtx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // Measure background luminance and texture variance
    const cropImgData = tempCtx.getImageData(0, 0, cropW, cropH);
    const cData = cropImgData.data;
    let bgLumSum = 0, bgSqSum = 0, bgCount = 0;
    const rimX = Math.max(1, Math.floor(cropW * 0.12));
    const rimY = Math.max(1, Math.floor(cropH * 0.12));

    for (let y = 0; y < cropH; y++) {
        for (let x = 0; x < cropW; x++) {
            const isRim = (x < rimX || x >= cropW - rimX || y < rimY || y >= cropH - rimY);
            if (isRim) {
                const p = (y * cropW + x) * 4;
                const lum = 0.299 * cData[p] + 0.587 * cData[p + 1] + 0.114 * cData[p + 2];
                bgLumSum += lum;
                bgSqSum += lum * lum;
                bgCount++;
            }
        }
    }
    const avgBgLum = bgCount > 0 ? (bgLumSum / bgCount) : 255;
    const bgVariance = bgCount > 0 ? (bgSqSum / bgCount - avgBgLum * avgBgLum) : 0;
    const bgStdDev = Math.sqrt(Math.max(0, bgVariance));

    const isSpeechBubble = (block.type === 'dialogue' || block.type === 'narration');
    const isPureWhiteBubble = isSpeechBubble && (avgBgLum > 235 && bgStdDev < 12);

    if (isPureWhiteBubble) {
        // Bong bóng thoại trắng tinh thông thường
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

    // Bong bóng nền Trame / Screentone / SFX phức tạp
    try {
        const textMaskBytes = new Uint8Array(cropW * cropH);
        for (let y = 0; y < cropH; y++) {
            for (let x = 0; x < cropW; x++) {
                const idx = y * cropW + x;
                const p = idx * 4;
                const lum = 0.299 * cData[p] + 0.587 * cData[p + 1] + 0.114 * cData[p + 2];
                if (lum < Math.min(100, avgBgLum - 35) || lum > Math.max(200, avgBgLum + 35)) {
                    textMaskBytes[idx] = 1;
                }
            }
        }
        const { patchMatchInpaintImageData } = await import('./patchmatch/index.js');
        const cropImgData = tempCtx.getImageData(0, 0, cropW, cropH);
        const { outputImageData } = await patchMatchInpaintImageData({
            imageData: cropImgData,
            mask: textMaskBytes,
            width: cropW,
            height: cropH,
            options: { patchRadius: 4, maskDilate: 1 }
        });
        if (outputImageData) {
            tempCtx.putImageData(outputImageData, 0, 0);
            ctx.drawImage(tempCanvas, cropX, cropY);
        } else {
            await cleanMangaBackgroundArtText(tempCtx, cropW, cropH);
            ctx.drawImage(tempCanvas, cropX, cropY);
        }
    } catch (pmErr) {
        console.warn("PatchMatch smart inpaint fallback:", pmErr);
        await cleanMangaBackgroundArtText(tempCtx, cropW, cropH);
        ctx.drawImage(tempCanvas, cropX, cropY);
    }
    block.style.bgOpacity = 0;
    block.maskCache = null;

    saveEraserDrawingToPage();
    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    showToast('✨ Đã khôi phục hoàn hảo kết cấu trame & hoa văn nền manga!', 'success');
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

export function clearLassoSelection() {
    window.activeLassoPoints = null;
    const fillBtn = document.getElementById('btn-lasso-fill');
    if (fillBtn) fillBtn.disabled = true;

    const canvas = elements.eraserCanvas;
    const ctx = canvas?.getContext('2d');
    if (window.lassoOriginalImageData && ctx) {
        ctx.putImageData(window.lassoOriginalImageData, 0, 0);
        window.lassoOriginalImageData = null;
    } else {
        const activePage = globalState.pages[globalState.activePageIndex];
        if (activePage) {
            restorePageEraserDrawing(activePage).then(() => {
                requestOverlayRender();
            });
        }
    }
    showToast("Đã hủy vùng chọn Lasso.", "info");
}

export async function runLassoContentAwareFill() {
    const points = window.activeLassoPoints;
    if (!points || points.length < 3) {
        showToast("Vui lòng vẽ khoanh vùng chọn Lasso trước.", "warn");
        return;
    }

    const canvas = elements.eraserCanvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imgElement = elements.mangaBgImage;
    const page = globalState.pages[globalState.activePageIndex];

    if (!imgElement || !imgElement.naturalWidth || !page) {
        showToast("Không tìm thấy ảnh gốc để xử lý.", "error");
        return;
    }

    // Read UI controls
    const fuzzinessInput = document.getElementById('num-lasso-fuzziness');
    const fuzziness = fuzzinessInput ? parseInt(fuzzinessInput.value) || 25 : 25;

    const expandInput = document.getElementById('num-lasso-expand');
    const expandSize = expandInput ? parseInt(expandInput.value) || 0 : 3;

    // 1. Calculate bounding box of selection
    let minX = points[0].x;
    let minY = points[0].y;
    let maxX = points[0].x;
    let maxY = points[0].y;
    for (let i = 1; i < points.length; i++) {
        minX = Math.min(minX, points[i].x);
        minY = Math.min(minY, points[i].y);
        maxX = Math.max(maxX, points[i].x);
        maxY = Math.max(maxY, points[i].y);
    }

    // Pad selection box
    const pad = Math.ceil(expandSize + 8);
    const startX = Math.max(0, Math.floor(minX - pad));
    const startY = Math.max(0, Math.floor(minY - pad));
    const endX = Math.min(canvas.width, Math.ceil(maxX + pad));
    const endY = Math.min(canvas.height, Math.ceil(maxY + pad));
    const cropW = endX - startX;
    const cropH = endY - startY;

    if (cropW <= 3 || cropH <= 3) {
        showToast("Vùng chọn quá nhỏ, vui lòng vẽ lại.", "warn");
        return;
    }

    // Show processing state
    let showGlobalOverlay = typeof elements.processingOverlay !== 'undefined';
    if (showGlobalOverlay) {
        const { uiUpdateProcessingOverlay: updateOverlay } = await import('../core/state.js');
        updateOverlay(true, "Đang xử lý vẽ bù...", "Thuật toán PatchMatch đang khôi phục họa tiết vùng chọn...", 30);
    } else {
        showToast("Đang vẽ bù nền thông minh...", "info");
    }

    try {
        pushStateToHistory();

        // 1. Ensure any lasso stroke/overlay is completely erased from canvas before capture
        if (window.lassoOriginalImageData) {
            ctx.putImageData(window.lassoOriginalImageData, 0, 0);
        } else {
            await restorePageEraserDrawing(page);
        }

        // 2. Capture the composite screen (original background + saved drawings)
        const compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = canvas.width;
        compositeCanvas.height = canvas.height;
        const compCtx = compositeCanvas.getContext('2d', { willReadFrequently: true });
        compCtx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
        compCtx.drawImage(canvas, 0, 0);

        // Crop this composite image
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
        cropCtx.drawImage(compositeCanvas, startX, startY, cropW, cropH, 0, 0, cropW, cropH);

        // Remove any chromatic noise from cropCanvas if image is black & white manga
        const cropRaw = cropCtx.getImageData(0, 0, cropW, cropH);
        const crd = cropRaw.data;
        let isMono = true;
        for (let i = 0; i < crd.length; i += 16) {
            if (Math.abs(crd[i] - crd[i + 1]) > 10 || Math.abs(crd[i] - crd[i + 2]) > 10) {
                isMono = false;
                break;
            }
        }
        if (isMono) {
            for (let i = 0; i < crd.length; i += 4) {
                const gray = Math.round(0.299 * crd[i] + 0.587 * crd[i + 1] + 0.114 * crd[i + 2]);
                crd[i] = gray;
                crd[i + 1] = gray;
                crd[i + 2] = gray;
            }
            cropCtx.putImageData(cropRaw, 0, 0);
        }

        // 3. Create initial selection mask (Rough Lasso selection)
        const lassoMaskCanvas = document.createElement('canvas');
        lassoMaskCanvas.width = cropW;
        lassoMaskCanvas.height = cropH;
        const lmCtx = lassoMaskCanvas.getContext('2d', { willReadFrequently: true });
        lmCtx.fillStyle = '#ffffff';
        lmCtx.beginPath();
        lmCtx.moveTo(points[0].x - startX, points[0].y - startY);
        for (let i = 1; i < points.length; i++) {
            lmCtx.lineTo(points[i].x - startX, points[i].y - startY);
        }
        lmCtx.closePath();
        lmCtx.fill();

        const lassoMaskImgData = lmCtx.getImageData(0, 0, cropW, cropH);
        const lmData = lassoMaskImgData.data;

        // 4. Color Range Isolation (Refine Mask to text only based on contrast with background)
        const cropImgData = cropCtx.getImageData(0, 0, cropW, cropH);
        const cData = cropImgData.data;

        let bgLumSum = 0, bgCount = 0;
        const rimX = Math.max(1, Math.floor(cropW * 0.12));
        const rimY = Math.max(1, Math.floor(cropH * 0.12));
        for (let y = 0; y < cropH; y++) {
            for (let x = 0; x < cropW; x++) {
                const isRim = (x < rimX || x >= cropW - rimX || y < rimY || y >= cropH - rimY);
                if (isRim) {
                    const p = (y * cropW + x) * 4;
                    const lum = 0.299 * cData[p] + 0.587 * cData[p + 1] + 0.114 * cData[p + 2];
                    bgLumSum += lum;
                    bgCount++;
                }
            }
        }
        const avgBgLum = bgCount > 0 ? (bgLumSum / bgCount) : 120;

        const maskBytes = new Uint8Array(cropW * cropH);
        let activeMaskCount = 0;
        for (let y = 0; y < cropH; y++) {
            for (let x = 0; x < cropW; x++) {
                const idx = y * cropW + x;
                if (lmData[idx * 4 + 3] > 0) {
                    if (fuzziness >= 25) {
                        // Lấp đầy trọn vẹn toàn bộ vùng chọn bên trong Lasso / Khung hình chữ nhật
                        maskBytes[idx] = 1;
                        activeMaskCount++;
                    } else {
                        const p = idx * 4;
                        const lum = 0.299 * cData[p] + 0.587 * cData[p + 1] + 0.114 * cData[p + 2];
                        const diff = Math.abs(lum - avgBgLum);
                        if (diff >= fuzziness || (avgBgLum > 180 && lum < 120) || (avgBgLum < 80 && lum > 140)) {
                            maskBytes[idx] = 1;
                            activeMaskCount++;
                        }
                    }
                }
            }
        }

        // Fallback: nếu không lọc được pixel nào thì phủ trọn vẹn polygon vùng chọn
        if (activeMaskCount === 0) {
            for (let y = 0; y < cropH; y++) {
                for (let x = 0; x < cropW; x++) {
                    const idx = y * cropW + x;
                    if (lmData[idx * 4 + 3] > 0) {
                        maskBytes[idx] = 1;
                    }
                }
            }
        }

        // 5. Dilate mask by expandSize
        const finalMaskBytes = new Uint8Array(cropW * cropH);
        for (let y = 0; y < cropH; y++) {
            for (let x = 0; x < cropW; x++) {
                const idx = y * cropW + x;
                if (maskBytes[idx]) {
                    for (let dy = -expandSize; dy <= expandSize; dy++) {
                        const ny = y + dy;
                        if (ny < 0 || ny >= cropH) continue;
                        for (let dx = -expandSize; dx <= expandSize; dx++) {
                            const nx = x + dx;
                            if (nx < 0 || nx >= cropW) continue;
                            finalMaskBytes[ny * cropW + nx] = 1;
                        }
                    }
                }
            }
        }

        const finalMaskCanvas = document.createElement('canvas');
        finalMaskCanvas.width = cropW;
        finalMaskCanvas.height = cropH;
        const fmCtx = finalMaskCanvas.getContext('2d', { willReadFrequently: true });
        const fmImgData = fmCtx.createImageData(cropW, cropH);
        for (let i = 0; i < cropW * cropH; i++) {
            const p = i * 4;
            if (finalMaskBytes[i]) {
                fmImgData.data[p] = 255;
                fmImgData.data[p + 1] = 255;
                fmImgData.data[p + 2] = 255;
                fmImgData.data[p + 3] = 255;
            }
        }
        fmCtx.putImageData(fmImgData, 0, 0);

        // 6. Perform inpainting / Content-Aware Fill with PatchMatch
        let rawInpaintedCanvas = null;
        try {
            const { patchMatchInpaintImageData } = await import('./patchmatch/index.js');
            const cropImgData = cropCtx.getImageData(0, 0, cropW, cropH);

            const { outputImageData } = await patchMatchInpaintImageData({
                imageData: cropImgData,
                mask: finalMaskBytes,
                width: cropW,
                height: cropH,
                options: {
                    patchRadius: 5,
                    iterations: 6,
                    randomSearchRadius: 64,
                    maskDilate: 0, // already dilated above
                    enablePatternDetection: true,
                    enableSeamBlending: true
                },
                onProgress: (percent, msg) => {
                    if (showGlobalOverlay) {
                        import('../core/state.js').then(st => {
                            st.uiUpdateProcessingOverlay(true, msg);
                        });
                    }
                }
            });

            const patchCanvas = document.createElement('canvas');
            patchCanvas.width = cropW;
            patchCanvas.height = cropH;
            const patchCtx = patchCanvas.getContext('2d');
            patchCtx.putImageData(outputImageData, 0, 0);
            rawInpaintedCanvas = patchCanvas;
        } catch (pmErr) {
            console.warn("PatchMatch Worker failed, falling back to direct crystal phase synthesizer:", pmErr);
            const patchCanvas = document.createElement('canvas');
            patchCanvas.width = cropW;
            patchCanvas.height = cropH;
            const patchCtx = patchCanvas.getContext('2d', { willReadFrequently: true });
            patchCtx.drawImage(cropCanvas, 0, 0);

            await cleanMangaBackgroundArtWithMask(patchCtx, cropW, cropH, finalMaskBytes);
            rawInpaintedCanvas = patchCanvas;
        }

        if (rawInpaintedCanvas) {
            // High-Precision Soft-Mask Alpha Blending:
            // Only update pixels strictly within the masked region, preserving 100% of original border pixels!
            const compCanvas = document.createElement('canvas');
            compCanvas.width = cropW;
            compCanvas.height = cropH;
            const compCtx = compCanvas.getContext('2d', { willReadFrequently: true });

            // 1. Draw raw inpainted result
            compCtx.drawImage(rawInpaintedCanvas, 0, 0, cropW, cropH);

            // 2. Composite with 'destination-in' to isolate strictly the masked pixels
            compCtx.globalCompositeOperation = 'destination-in';
            compCtx.drawImage(finalMaskCanvas, 0, 0);
            compCtx.globalCompositeOperation = 'source-over';

            // 3. Draw only the masked interior onto the main eraser canvas
            ctx.drawImage(compCanvas, startX, startY);
        }

        // 7. Save and redraw
        await saveEraserDrawingToPage();
        requestOverlayRender();

        window.activeLassoPoints = null;
        window.lassoOriginalImageData = null;
        const fillBtn = document.getElementById('btn-lasso-fill');
        if (fillBtn) fillBtn.disabled = true;

        showToast("✨ Đã lấp đầy vùng chọn Lasso thành công!", "success");
    } catch (err) {
        console.error("Lasso fill error:", err);
        showToast(`Không thể vẽ bù vùng chọn: ${err.message}`, "error");

        // Restore canvas state to saved state
        await restorePageEraserDrawing(page);
        requestOverlayRender();
    } finally {
        if (showGlobalOverlay) {
            const { uiUpdateProcessingOverlay: updateOverlay } = await import('../core/state.js');
            updateOverlay(false);
        }
    }
}

// Window bindings for inline HTML onClick handlers
window.autoCleanActiveBlock = autoCleanActiveBlock;
window.toggleEraserMode = toggleEraserMode;
window.openEraserMode = openEraserMode;
window.closeEraserMode = closeEraserMode;
window.updateEraserBrushSize = updateEraserBrushSize;
window.setEraserColor = setEraserColor;
window.clearEraserDrawing = clearEraserDrawing;
window.aiSmartInpaintBlock = aiSmartInpaintBlock;
window.activateEyedropper = activateEyedropper;
window.setEraserBrushMode = setEraserBrushMode;
window.startTexturePatchSelection = startTexturePatchSelection;
window.clearLassoSelection = clearLassoSelection;
window.runLassoContentAwareFill = runLassoContentAwareFill;

export function minimizeEraserPanel() {
    const panel = document.getElementById('eraser-settings-panel');
    const trigger = document.getElementById('btn-eraser-floating-trigger');
    if (panel) panel.classList.add('hidden');
    if (trigger) trigger.classList.remove('hidden');
}
window.minimizeEraserPanel = minimizeEraserPanel;

export function expandEraserPanel() {
    const panel = document.getElementById('eraser-settings-panel');
    const trigger = document.getElementById('btn-eraser-floating-trigger');
    if (panel) panel.classList.remove('hidden');
    if (trigger) trigger.classList.add('hidden');
}
window.expandEraserPanel = expandEraserPanel;

