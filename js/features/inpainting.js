// Automated Cleaning & Manual Eraser / Clone Stamp Tools
import { globalState, pushStateToHistory, savePageToDB } from '../core/state.js';
import { elements } from '../core/elements.js';
import { showToast } from '../core/utils.js';
import { requestOverlayRender } from './canvas.js';
import { computeBubbleMask } from './ocr.js';

export let isEraserModeActive = false;
export let isDrawingOnEraser = false;
export let eraserBrushSize = 15;
export let eraserColor = '#ffffff';
export let lastX = 0;
export let lastY = 0;

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

export function initEraserDrawingEvents() {
    const canvas = elements.eraserCanvas;
    const ctx = canvas.getContext('2d');

    canvas.onmousedown = null;
    canvas.onmousemove = null;
    canvas.onmouseup = null;
    canvas.onmouseleave = null;
    canvas.ontouchstart = null;
    canvas.ontouchmove = null;
    canvas.ontouchend = null;

    const getMousePos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const x = ((clientX - rect.left) / rect.width) * canvas.width;
        const y = ((clientY - rect.top) / rect.height) * canvas.height;
        return { x, y };
    };

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

// Window bindings for inline HTML onClick handlers
window.autoCleanActiveBlock = autoCleanActiveBlock;
window.toggleEraserMode = toggleEraserMode;
window.updateEraserBrushSize = updateEraserBrushSize;
window.setEraserColor = setEraserColor;
window.clearEraserDrawing = clearEraserDrawing;
