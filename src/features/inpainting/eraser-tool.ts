/**
 * Manga Translator Studio - Inpainting: Manual Eraser, Brush, Clone Stamp & Eyedropper
 * Manages drawing interactions on eraser overlay canvas, clone stamping, and UI controls.
 */
import { globalState, pushStateToHistory, savePageToDB } from '../../core/state';
import { elements } from '../../core/elements';
import { showToast } from '../../core/utils';
import { closeMobileMenus } from '../../ui/layout-ui';
import { MangaPage } from '../../types/index';
import { requestOverlayRender } from '../canvas/canvas-renderer';
import {
    getActiveLassoPoints,
    setActiveLassoPoints,
    getLassoOriginalImageData,
    setLassoOriginalImageData,
    getIsSelectingLassoSample,
    setIsSelectingLassoSample,
    getLassoSampleCanvas,
    setLassoSampleCanvas,
    getLassoSampleSrc,
    setLassoSampleSrc,
    updateLassoButtons,
    updateLassoSampleUI,
    renderActiveLassoPreview,
    setLassoPatternType
} from './lasso-tool';
import { cleanMangaBackgroundArtWithMask } from './ai-inpaint-service';

export let isEraserModeActive = false;
export let isDrawingOnEraser = false;
export let eraserBrushSize = 15;
export let eraserColor = '#ffffff';
export let lastX = 0;
export let lastY = 0;
export let brushMode = 'eraser'; // 'eraser' | 'stamp' | 'clone_stamp' | 'spot-inpaint' | 'lasso'
export let isSelectingPatch = false;
export let isPatchStampActive = false;
export let patchCanvas: HTMLCanvasElement | null = null;
export let cloneSourcePoint: { x: number; y: number } | null = null;

export function setIsEraserModeActive(val: boolean): void {
    isEraserModeActive = val;
}

export function openEraserMode(): void {
    if (globalState.activePageIndex === -1) return;
    if (isEraserModeActive) {
        if (elements.eraserSettingsPanel) elements.eraserSettingsPanel.classList.remove('hidden');
        const trigger = document.getElementById('btn-eraser-floating-trigger');
        if (trigger) trigger.classList.add('hidden');
        return;
    }
    setEraserMode(true);
}

export function closeEraserMode(): void {
    if (!isEraserModeActive) return;
    setEraserMode(false);
}

export function setEraserMode(active: boolean): void {
    if (globalState.activePageIndex === -1) return;

    isEraserModeActive = active;

    const floatingBtn = document.getElementById('btn-eraser-mode-floating');

    if (isEraserModeActive) {
        closeMobileMenus();
        const rightPanel = document.getElementById('right-panel');
        if (rightPanel && rightPanel.classList.contains('hidden')) {
            rightPanel.classList.remove('hidden');
            const toggleBtn = document.getElementById('right-sidebar-toggle-handle');
            const icon = toggleBtn?.querySelector('i');
            if (icon) icon.className = 'fa-solid fa-chevron-right text-[10px] group-hover:scale-110 transition-transform';
        }

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

        if (elements.eraserCanvas) elements.eraserCanvas.classList.add('drawing-active');
        if (elements.mangaOverlaysContainer) elements.mangaOverlaysContainer.classList.add('pointer-events-none');

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

        if (elements.eraserCanvas) elements.eraserCanvas.classList.remove('drawing-active');
        if (elements.mangaOverlaysContainer) elements.mangaOverlaysContainer.classList.remove('pointer-events-none');

        saveEraserDrawingToPage();
    }
}

export function toggleEraserMode(forcedState?: boolean): void {
    if (typeof forcedState === 'boolean') {
        setEraserMode(forcedState);
    } else {
        openEraserMode();
    }
}

export function updateEraserBrushSize(val: string | number): void {
    eraserBrushSize = typeof val === 'number' ? val : parseInt(val, 10);
    if (elements.lblEraserBrushSize) {
        elements.lblEraserBrushSize.innerText = `${val}px`;
    }
}
export const setEraserBrushSize = updateEraserBrushSize;

export function setEraserColor(color: string): void {
    eraserColor = color;
    if (elements.eraserColorCustom) {
        elements.eraserColorCustom.value = color;
    }
}

export function setEraserBrushMode(mode: string): void {
    brushMode = mode;

    const btnEraser = document.getElementById('btn-brush-mode-eraser');
    const btnStamp = document.getElementById('btn-brush-mode-stamp');
    const btnCloneStamp = document.getElementById('btn-brush-mode-clone-stamp');
    const btnSpotInpaint = document.getElementById('btn-brush-mode-spot-inpaint');
    const btnLasso = document.getElementById('btn-brush-mode-lasso');
    const stampControls = document.getElementById('stamp-controls');
    const lassoControls = document.getElementById('lasso-controls');
    const brushColorContainer = document.getElementById('brush-color-container');
    const brushSizeContainer = document.getElementById('brush-size-container');

    [btnEraser, btnStamp, btnCloneStamp, btnSpotInpaint, btnLasso].forEach(btn => {
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
    } else if (mode === 'clone_stamp') {
        if (btnCloneStamp) {
            btnCloneStamp.classList.add('bg-indigo-600', 'text-white');
            btnCloneStamp.classList.remove('text-slate-400', 'hover:text-slate-200');
        }
        if (stampControls) stampControls.classList.add('hidden');
        if (lassoControls) lassoControls.classList.add('hidden');
        if (brushColorContainer) brushColorContainer.classList.add('hidden');
        if (brushSizeContainer) brushSizeContainer.classList.remove('hidden');

        isPatchStampActive = false;
        isSelectingPatch = false;
        showToast("🎯 Clone Stamp: Giữ phím Alt + Click để lấy mẫu vân, sau đó quét cọ để lấp chữ!", "info");
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

        setActiveLassoPoints(null);
        updateLassoButtons(false);
    } else {
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

export function startTexturePatchSelection(): void {
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

export function initEraserDrawingEvents(): void {
    const canvas = elements.eraserCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.onmousedown = null;
    canvas.onmousemove = null;
    canvas.onmouseup = null;
    canvas.onmouseleave = null;
    canvas.ontouchstart = null;
    canvas.ontouchmove = null;
    canvas.ontouchend = null;

    const selectionBox = document.getElementById('patch-selection-box');
    const floatingHud = document.getElementById('lasso-sample-floating-hud');
    const hudDims = document.getElementById('lasso-sample-hud-dims');
    const hudPatch = document.getElementById('lasso-sample-hud-patch') as HTMLCanvasElement | null;
    const hudTiled = document.getElementById('lasso-sample-hud-tiled') as HTMLCanvasElement | null;
    const previewCanvas = elements.patchPreviewCanvas;
    const container = elements.mangaCanvasContainer;

    const getMousePos = (e: any) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const x = ((clientX - rect.left) / rect.width) * canvas.width;
        const y = ((clientY - rect.top) / rect.height) * canvas.height;
        return { x, y, clientX, clientY };
    };

    if (getIsSelectingLassoSample()) {
        let isDragging = false;
        let startClientX = 0;
        let startClientY = 0;
        let liveSampleCanvas: HTMLCanvasElement | null = null;

        if (selectionBox) {
            selectionBox.classList.remove('rounded-full');
            selectionBox.classList.add('rounded-sm');
        }

        const startSelect = (e: any) => {
            e.preventDefault();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            isDragging = true;
            startClientX = clientX;
            startClientY = clientY;

            if (container && selectionBox) {
                const rect = container.getBoundingClientRect();
                selectionBox.style.left = `${clientX - rect.left}px`;
                selectionBox.style.top = `${clientY - rect.top}px`;
                selectionBox.style.width = '0px';
                selectionBox.style.height = '0px';
                selectionBox.classList.remove('hidden');
            }
        };

        const dragSelect = (e: any) => {
            if (!isDragging || !container || !selectionBox) return;
            e.preventDefault();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            const rect = container.getBoundingClientRect();
            const x1 = Math.min(startClientX, clientX);
            const y1 = Math.min(startClientY, clientY);
            const w = Math.abs(clientX - startClientX);
            const h = Math.abs(clientY - startClientY);

            selectionBox.style.left = `${x1 - rect.left}px`;
            selectionBox.style.top = `${y1 - rect.top}px`;
            selectionBox.style.width = `${w}px`;
            selectionBox.style.height = `${h}px`;

            const canvasRect = canvas.getBoundingClientRect();
            const startX = Math.round(((x1 - canvasRect.left) / canvasRect.width) * canvas.width);
            const startY = Math.round(((y1 - canvasRect.top) / canvasRect.height) * canvas.height);
            const endX = Math.round(((x1 + w - canvasRect.left) / canvasRect.width) * canvas.width);
            const endY = Math.round(((y1 + h - canvasRect.top) / canvasRect.height) * canvas.height);

            const cropW = endX - startX;
            const cropH = endY - startY;

            if (cropW >= 3 && cropH >= 3) {
                const imgElement = elements.mangaBgImage;
                if (imgElement && imgElement.naturalWidth) {
                    try {
                        if (!liveSampleCanvas) {
                            liveSampleCanvas = document.createElement('canvas');
                        }
                        liveSampleCanvas.width = cropW;
                        liveSampleCanvas.height = cropH;
                        const tCtx = liveSampleCanvas.getContext('2d');
                        if (tCtx) {
                            tCtx.drawImage(imgElement, startX, startY, cropW, cropH, 0, 0, cropW, cropH);
                            setLassoSampleCanvas(liveSampleCanvas);
                            setLassoSampleSrc({ x: startX, y: startY, w: cropW, h: cropH });
                            patchCanvas = liveSampleCanvas;

                            if (floatingHud) {
                                floatingHud.classList.remove('hidden');
                                const hudLeft = Math.min(container.clientWidth - 150, Math.max(10, x1 - rect.left + w + 10));
                                const hudTop = Math.min(container.clientHeight - 90, Math.max(10, y1 - rect.top));
                                floatingHud.style.left = `${hudLeft}px`;
                                floatingHud.style.top = `${hudTop}px`;

                                if (hudDims) hudDims.innerText = `${cropW} × ${cropH} px`;

                                if (hudPatch) {
                                    const pCtx = hudPatch.getContext('2d');
                                    if (pCtx) {
                                        pCtx.clearRect(0, 0, hudPatch.width, hudPatch.height);
                                        pCtx.drawImage(liveSampleCanvas, 0, 0, hudPatch.width, hudPatch.height);
                                    }
                                }

                                if (hudTiled) {
                                    const tCtx2 = hudTiled.getContext('2d');
                                    if (tCtx2) {
                                        tCtx2.clearRect(0, 0, hudTiled.width, hudTiled.height);
                                        const sW = hudTiled.width / 3;
                                        const sH = hudTiled.height / 3;
                                        for (let ty = 0; ty < 3; ty++) {
                                            for (let tx = 0; tx < 3; tx++) {
                                                tCtx2.drawImage(liveSampleCanvas, tx * sW, ty * sH, sW, sH);
                                            }
                                        }
                                    }
                                }
                            }

                            updateLassoSampleUI(cropW, cropH, liveSampleCanvas);

                            if (getActiveLassoPoints()) {
                                renderActiveLassoPreview();
                            }
                        }
                    } catch (err) {
                        console.error("Live texture sampling error:", err);
                    }
                }
            }
        };

        const stopSelect = (e: any) => {
            if (!isDragging) return;
            isDragging = false;

            if (selectionBox) selectionBox.classList.add('hidden');
            if (floatingHud) floatingHud.classList.add('hidden');

            const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
            const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

            const rect = canvas.getBoundingClientRect();

            const startX = Math.round(((Math.min(startClientX, clientX) - rect.left) / rect.width) * canvas.width);
            const startY = Math.round(((Math.min(startClientY, clientY) - rect.top) / rect.height) * canvas.height);
            const endX = Math.round(((Math.max(startClientX, clientX) - rect.left) / rect.width) * canvas.width);
            const endY = Math.round(((Math.max(startClientY, clientY) - rect.top) / rect.height) * canvas.height);

            const cropW = endX - startX;
            const cropH = endY - startY;

            if (cropW > 2 && cropH > 2) {
                const imgElement = elements.mangaBgImage;
                if (imgElement && imgElement.naturalWidth) {
                    try {
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = cropW;
                        tempCanvas.height = cropH;
                        const patchCtx = tempCanvas.getContext('2d');
                        if (patchCtx) {
                            patchCtx.drawImage(imgElement, startX, startY, cropW, cropH, 0, 0, cropW, cropH);
                            setLassoSampleCanvas(tempCanvas);
                            setLassoSampleSrc({ x: startX, y: startY, w: cropW, h: cropH });
                            patchCanvas = tempCanvas;

                            showToast(`🎯 Đã lấy mẫu vân chữ nhật ${cropW}x${cropH}px. Bấm 'Tô họa tiết' để lấp vào vùng Lasso!`, "success");
                            setLassoPatternType('sample');
                            updateLassoSampleUI(cropW, cropH, tempCanvas);
                            renderActiveLassoPreview();
                        }
                    } catch (err) {
                        console.error("Cropping lasso texture error:", err);
                        showToast("Không thể sao chép mẫu từ ảnh.", "error");
                    }
                }
            } else {
                showToast("Vùng quét quá nhỏ, vui lòng thử lại.", "warn");
            }

            setIsSelectingLassoSample(false);
            initEraserDrawingEvents();

            const activePts = getActiveLassoPoints();
            if (activePts && activePts.length >= 3) {
                updateLassoButtons(true);
            }
        };

        canvas.onmousedown = startSelect;
        canvas.onmousemove = dragSelect;
        canvas.onmouseup = stopSelect;
        canvas.onmouseleave = () => {
            isDragging = false;
            if (selectionBox) selectionBox.classList.add('hidden');
            if (floatingHud) floatingHud.classList.add('hidden');
        };

        canvas.ontouchstart = startSelect;
        canvas.ontouchmove = dragSelect;
        canvas.ontouchend = stopSelect;
        return;
    }

    if (brushMode === 'lasso') {
        let isDrawing = false;
        let points: Array<{ x: number; y: number }> = [];
        let startPos: { x: number; y: number } | null = null;
        let preLassoImageData: ImageData | null = null;

        const startLasso = (e: any) => {
            e.preventDefault();
            const pos = getMousePos(e);
            isDrawing = true;
            startPos = pos;
            points = [pos];

            const prevOrig = getLassoOriginalImageData();
            if (prevOrig) {
                ctx.putImageData(prevOrig, 0, 0);
            }

            preLassoImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            setLassoOriginalImageData(preLassoImageData);
            setActiveLassoPoints(null);
            updateLassoButtons(false);

            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
        };

        const drawLasso = (e: any) => {
            if (!isDrawing || !startPos || !preLassoImageData) return;
            e.preventDefault();
            const pos = getMousePos(e);

            if (e.shiftKey) {
                points = [
                    { x: startPos.x, y: startPos.y },
                    { x: pos.x, y: startPos.y },
                    { x: pos.x, y: pos.y },
                    { x: startPos.x, y: pos.y }
                ];
            } else {
                const lastPt = points[points.length - 1];
                if (!lastPt || Math.hypot(pos.x - lastPt.x, pos.y - lastPt.y) >= 2) {
                    points.push(pos);
                }
            }

            ctx.putImageData(preLassoImageData, 0, 0);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            if (e.shiftKey) ctx.closePath();
            ctx.strokeStyle = '#a855f7';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            if (e.shiftKey) {
                ctx.fillStyle = 'rgba(168, 85, 247, 0.12)';
                ctx.fill();
            }
            ctx.restore();
        };

        const stopLasso = (_e: any) => {
            if (!isDrawing) return;
            isDrawing = false;

            if (points.length < 3) {
                if (preLassoImageData) {
                    ctx.putImageData(preLassoImageData, 0, 0);
                }
                points = [];
                setActiveLassoPoints(null);
                updateLassoButtons(false);
                return;
            }

            if (preLassoImageData) ctx.putImageData(preLassoImageData, 0, 0);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.closePath();

            ctx.strokeStyle = '#a855f7';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.stroke();

            ctx.fillStyle = 'rgba(168, 85, 247, 0.12)';
            ctx.fill();
            ctx.restore();

            setActiveLassoPoints(points);
            updateLassoButtons(true);
            renderActiveLassoPreview();
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

    if (isSelectingPatch) {
        let isDragging = false;
        let startClientX = 0;
        let startClientY = 0;

        const startSelect = (e: any) => {
            e.preventDefault();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            isDragging = true;
            startClientX = clientX;
            startClientY = clientY;

            if (container && selectionBox) {
                const rect = container.getBoundingClientRect();
                selectionBox.style.left = `${clientX - rect.left}px`;
                selectionBox.style.top = `${clientY - rect.top}px`;
                selectionBox.style.width = '0px';
                selectionBox.style.height = '0px';
                selectionBox.classList.remove('hidden');
            }
        };

        const dragSelect = (e: any) => {
            if (!isDragging || !container || !selectionBox) return;
            e.preventDefault();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            const rect = container.getBoundingClientRect();
            const x1 = Math.min(startClientX, clientX);
            const y1 = Math.min(startClientY, clientY);
            const w = Math.abs(clientX - startClientX);
            const h = Math.abs(clientY - startClientY);

            selectionBox.style.left = `${x1 - rect.left}px`;
            selectionBox.style.top = `${y1 - rect.top}px`;
            selectionBox.style.width = `${w}px`;
            selectionBox.style.height = `${h}px`;
        };

        const stopSelect = (e: any) => {
            if (!isDragging) return;
            isDragging = false;

            if (selectionBox) selectionBox.classList.add('hidden');

            const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
            const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

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
                        if (!patchCtx) return;

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

    if (brushMode === 'stamp' && isPatchStampActive && patchCanvas) {
        const updatePreview = (e: any) => {
            if (!container || !patchCanvas) return;
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            const displayW = Math.round(patchCanvas.width * (rect.width / canvas.width));
            const displayH = Math.round(patchCanvas.height * (rect.height / canvas.height));

            const containerRect = container.getBoundingClientRect();
            const x = clientX - containerRect.left - displayW / 2;
            const y = clientY - containerRect.top - displayH / 2;

            if (previewCanvas) {
                previewCanvas.width = displayW;
                previewCanvas.height = displayH;
                const pCtx = previewCanvas.getContext('2d');
                if (pCtx) {
                    pCtx.clearRect(0, 0, displayW, displayH);
                    pCtx.drawImage(patchCanvas, 0, 0, displayW, displayH);
                }

                previewCanvas.style.left = `${x}px`;
                previewCanvas.style.top = `${y}px`;
                previewCanvas.style.width = `${displayW}px`;
                previewCanvas.style.height = `${displayH}px`;
                previewCanvas.classList.remove('hidden');
            }
        };

        const applyStamp = (e: any) => {
            if (!patchCanvas) return;
            e.preventDefault();
            const pos = getMousePos(e);
            pushStateToHistory();

            const drawX = Math.round(pos.x - patchCanvas.width / 2);
            const drawY = Math.round(pos.y - patchCanvas.height / 2);

            ctx.drawImage(patchCanvas, drawX, drawY);

            saveEraserDrawingToPage();
        };

        canvas.onmousemove = updatePreview;
        canvas.onmousedown = applyStamp;
        canvas.onmouseleave = () => { if (previewCanvas) previewCanvas.classList.add('hidden'); };

        canvas.ontouchmove = updatePreview;
        canvas.ontouchstart = applyStamp;
        return;
    }

    if (brushMode === 'spot-inpaint') {
        let isDrawing = false;
        let preStrokeImageData: ImageData | null = null;
        let strokeCanvas: HTMLCanvasElement | null = null;
        let strokeCtx: CanvasRenderingContext2D | null = null;
        let minX = 0, minY = 0, maxX = 0, maxY = 0;

        const startSpot = (e: any) => {
            e.preventDefault();
            const pos = getMousePos(e);

            isDrawing = true;
            lastX = pos.x;
            lastY = pos.y;
            minX = pos.x;
            minY = pos.y;
            maxX = pos.x;
            maxY = pos.y;

            preStrokeImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            strokeCanvas = document.createElement('canvas');
            strokeCanvas.width = canvas.width;
            strokeCanvas.height = canvas.height;
            strokeCtx = strokeCanvas.getContext('2d');
            if (!strokeCtx) return;

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

        const drawSpot = (e: any) => {
            if (!isDrawing || !strokeCtx) return;
            e.preventDefault();
            const pos = getMousePos(e);

            minX = Math.min(minX, pos.x);
            minY = Math.min(minY, pos.y);
            maxX = Math.max(maxX, pos.x);
            maxY = Math.max(maxY, pos.y);

            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(pos.x, pos.y);
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.55)';
            ctx.lineWidth = eraserBrushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

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

        const applySpotInpaint = async (_e: any) => {
            if (!isDrawing || !strokeCtx) return;
            isDrawing = false;

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

                        const strokeImgData = strokeCtx.getImageData(startX, startY, cropW, cropH);
                        const sData = strokeImgData.data;
                        const maskBytes = new Uint8Array(cropW * cropH);
                        for (let i = 0; i < cropW * cropH; i++) {
                            if (sData[i * 4 + 3] > 10) {
                                maskBytes[i] = 1;
                            }
                        }

                        const pCanvas = document.createElement('canvas');
                        pCanvas.width = cropW;
                        pCanvas.height = cropH;
                        const patchCtx = pCanvas.getContext('2d', { willReadFrequently: true });
                        if (patchCtx) {
                            patchCtx.drawImage(imgElement, startX, startY, cropW, cropH, 0, 0, cropW, cropH);
                            cleanMangaBackgroundArtWithMask(patchCtx, cropW, cropH, maskBytes);
                            ctx.drawImage(pCanvas, startX, startY);
                            await saveEraserDrawingToPage();
                            requestOverlayRender();
                            showToast("✨ Đã tẩy sạch vùng chọn và vẽ bù kết cấu nền!", "success");
                        }
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

    if (brushMode === 'clone_stamp') {
        let isDrawingClone = false;
        let strokeStartPos: { x: number; y: number } | null = null;
        let sourceAnchor: { x: number; y: number } | null = null;

        const drawCloneAt = (curX: number, curY: number) => {
            if (!sourceAnchor || !strokeStartPos) return;
            const offsetX = curX - strokeStartPos.x;
            const offsetY = curY - strokeStartPos.y;
            const sampleX = sourceAnchor.x + offsetX;
            const sampleY = sourceAnchor.y + offsetY;

            const img = elements.mangaBgImage;
            if (!img || !img.naturalWidth) return;

            const r = Math.max(3, eraserBrushSize || 15);
            const diameter = r * 2;

            const tempC = document.createElement('canvas');
            tempC.width = diameter;
            tempC.height = diameter;
            const tCtx = tempC.getContext('2d');
            if (!tCtx) return;

            const grad = tCtx.createRadialGradient(r, r, r * 0.4, r, r, r);
            grad.addColorStop(0, 'rgba(0,0,0,1)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');

            tCtx.save();
            tCtx.drawImage(img, sampleX - r, sampleY - r, diameter, diameter, 0, 0, diameter, diameter);
            tCtx.globalCompositeOperation = 'destination-in';
            tCtx.fillStyle = grad;
            tCtx.beginPath();
            tCtx.arc(r, r, r, 0, Math.PI * 2);
            tCtx.fill();
            tCtx.restore();

            ctx.drawImage(tempC, curX - r, curY - r);
        };

        const startClone = (e: any) => {
            e.preventDefault();
            const pos = getMousePos(e);
            if (e.altKey) {
                cloneSourcePoint = { x: pos.x, y: pos.y };
                showToast(`🎯 Đã ghim điểm mẫu tại (${Math.round(pos.x)}, ${Math.round(pos.y)})`, "success");
                return;
            }

            if (!cloneSourcePoint) {
                showToast("⚠️ Vui lòng giữ phím Alt và Click chuột lên vùng ảnh mẫu trước!", "warn");
                return;
            }

            isDrawingClone = true;
            strokeStartPos = { x: pos.x, y: pos.y };
            sourceAnchor = { x: cloneSourcePoint.x, y: cloneSourcePoint.y };
            pushStateToHistory();
            drawCloneAt(pos.x, pos.y);
        };

        const moveClone = (e: any) => {
            if (!isDrawingClone) return;
            e.preventDefault();
            const pos = getMousePos(e);
            drawCloneAt(pos.x, pos.y);
        };

        const stopClone = () => {
            if (isDrawingClone) {
                isDrawingClone = false;
                saveEraserDrawingToPage();
            }
        };

        canvas.onmousedown = startClone;
        canvas.onmousemove = moveClone;
        canvas.onmouseup = stopClone;
        canvas.onmouseleave = stopClone;

        canvas.ontouchstart = startClone;
        canvas.ontouchmove = moveClone;
        canvas.ontouchend = stopClone;
        return;
    }

    if (previewCanvas) previewCanvas.classList.add('hidden');

    const startDraw = (e: any) => {
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

    const draw = (e: any) => {
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

export function clearEraserDrawing(): void {
    if (globalState.activePageIndex === -1) return;
    const canvas = elements.eraserCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    pushStateToHistory();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveEraserDrawingToPage();
    showToast("Đã xóa nét vẽ trên trang.", "info");
}

export async function saveEraserDrawingToPage(): Promise<void> {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    const canvas = elements.eraserCanvas;
    if (!canvas || !page) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasDrawings = imgData.data.some(val => val !== 0);

    if (hasDrawings) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        page.eraserLayerBlob = blob || undefined;
    } else {
        page.eraserLayerBlob = undefined;
    }

    savePageToDB(page);
}

export function restorePageEraserDrawing(page: MangaPage): Promise<void> {
    const canvas = elements.eraserCanvas;
    if (!canvas) return Promise.resolve();
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return Promise.resolve();

    canvas.width = elements.mangaBgImage?.naturalWidth || page.width || 1200;
    canvas.height = elements.mangaBgImage?.naturalHeight || page.height || 1600;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (page.eraserLayerBlob) {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(page.eraserLayerBlob!);
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

export async function activateEyedropper(): Promise<void> {
    if (globalState.activePageIndex === -1) return;

    if (!isEraserModeActive) {
        toggleEraserMode();
    }

    if (typeof window !== 'undefined' && window.EyeDropper) {
        const eyeDropper = new window.EyeDropper();
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

    const onCanvasClick = (e: MouseEvent) => {
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
                if (tempCtx) {
                    tempCtx.drawImage(imgElement, x, y, 1, 1, 0, 0, 1, 1);
                    const pixelData = tempCtx.getImageData(0, 0, 1, 1).data;
                    const hexColor = '#' + [pixelData[0], pixelData[1], pixelData[2]].map(val => {
                        const hex = val.toString(16);
                        return hex.length === 1 ? '0' + hex : hex;
                    }).join('');

                    setEraserColor(hexColor);
                    showToast(`Đã chọn màu: ${hexColor}`, "success");
                }
            } catch (err) {
                console.error("Custom Eyedropper error:", err);
            }
        }

        canvas.style.cursor = originalCursor;
        canvas.removeEventListener('click', onCanvasClick);
    };

    canvas.addEventListener('click', onCanvasClick);
}

export function minimizeEraserPanel(): void {
    if (typeof document === 'undefined') return;
    const panel = document.getElementById('eraser-settings-panel');
    const trigger = document.getElementById('btn-eraser-floating-trigger');
    if (panel) panel.classList.add('hidden');
    if (trigger) trigger.classList.remove('hidden');
}

export function expandEraserPanel(): void {
    if (typeof document === 'undefined') return;
    const panel = document.getElementById('eraser-settings-panel');
    const trigger = document.getElementById('btn-eraser-floating-trigger');
    if (panel) panel.classList.remove('hidden');
    if (trigger) trigger.classList.add('hidden');
}
