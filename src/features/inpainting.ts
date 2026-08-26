// Automated Cleaning & Manual Eraser / Clone Stamp Tools
import { globalState, pushStateToHistory, savePageToDB, uiUpdateActiveBlockEditor } from '../core/state';
import { elements } from '../core/elements';
import { showToast } from '../core/utils';
import { closeMobileMenus } from '../ui/layout-ui';
import { MangaBlock, MangaPage } from '../types/index';
import { computeBubbleMask } from './ocr/ocr-service';
import { requestOverlayRender } from './canvas/canvas-renderer';
import { runPatchMatchPipeline } from './patchmatch/patchmatch.worker';

let activeLassoPoints: { x: number; y: number }[] | null = null;
let lassoOriginalImageData: ImageData | null = null;
let cloneSourcePoint: { x: number; y: number } | null = null;

export function getActiveLassoPoints(): { x: number; y: number }[] | null {
    return activeLassoPoints;
}

export function setActiveLassoPoints(points: { x: number; y: number }[] | null): void {
    activeLassoPoints = points;
}

export let isEraserModeActive = false;
export let isDrawingOnEraser = false;
export let eraserBrushSize = 15;
export let eraserColor = '#ffffff';
export let lastX = 0;
export let lastY = 0;
export let brushMode = 'eraser'; // 'eraser' or 'stamp'
export let isSelectingPatch = false;
export let isPatchStampActive = false;
export let patchCanvas: HTMLCanvasElement | null = null;

// Lasso Pattern Fill Types & State
export type LassoPatternType = 'halftone' | 'horizontal' | 'vertical' | 'diagonal' | 'crosshatch' | 'noise' | 'sample';
export type LassoFillTechnique = 'patch_1to1' | 'grid_tile' | 'preset_tone' | 'seamless_tile';
export let lassoActiveTab: 'ai' | 'pattern' = 'ai';
export let lassoFillTechnique: LassoFillTechnique = 'grid_tile';
export let lassoPatternType: LassoPatternType = 'sample';
export let isSelectingLassoSample = false;
export let lassoSampleCanvas: HTMLCanvasElement | null = null;
export let lassoSampleSrc: { x: number; y: number; w: number; h: number } | null = null;
export let lassoPatternOffsetX = 0;
export let lassoPatternOffsetY = 0;
export let lassoCrossfadeOverlap = 8;
export let lassoPatternSize = 8;
export let lassoPatternDensity = 40;
export let lassoPatternFgColor = '#000000';
export let lassoPatternBgColor = '#ffffff';
export let lassoPatternTransparentBg = false;
export let lassoPatternOpacity = 100;
export let lassoPatternFeather = 2;

export function updateLassoButtons(hasPoints: boolean): void {
    const fillBtn = document.getElementById('btn-lasso-fill') as HTMLButtonElement | null;
    if (fillBtn) fillBtn.disabled = !hasPoints;
    const patternBtn = document.getElementById('btn-lasso-pattern-fill') as HTMLButtonElement | null;
    if (patternBtn) patternBtn.disabled = !hasPoints;
}

export function setLassoFillTechnique(tech: LassoFillTechnique): void {
    lassoFillTechnique = tech;
    const techPatch = document.getElementById('btn-lasso-tech-patch');
    const techTile = document.getElementById('btn-lasso-tech-tile');
    const techPreset = document.getElementById('btn-lasso-tech-preset');

    const secPatch = document.getElementById('lasso-sec-patch');
    const secPresets = document.getElementById('lasso-sec-presets');

    [techPatch, techTile, techPreset].forEach(b => {
        b?.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-400');
        b?.classList.add('bg-slate-900', 'text-slate-400', 'border-slate-800');
    });

    if (tech === 'patch_1to1') {
        techPatch?.classList.add('bg-indigo-600', 'text-white', 'border-indigo-400');
        techPatch?.classList.remove('bg-slate-900', 'text-slate-400', 'border-slate-800');
        secPatch?.classList.remove('hidden');
        secPresets?.classList.add('hidden');
        setLassoPatternType('sample');
    } else if (tech === 'grid_tile' || tech === 'seamless_tile') {
        techTile?.classList.add('bg-indigo-600', 'text-white', 'border-indigo-400');
        techTile?.classList.remove('bg-slate-900', 'text-slate-400', 'border-slate-800');
        secPatch?.classList.remove('hidden');
        secPresets?.classList.add('hidden');
        setLassoPatternType('sample');
    } else {
        techPreset?.classList.add('bg-indigo-600', 'text-white', 'border-indigo-400');
        techPreset?.classList.remove('bg-slate-900', 'text-slate-400', 'border-slate-800');
        secPatch?.classList.add('hidden');
        secPresets?.classList.remove('hidden');
        setLassoPatternType('halftone');
    }
    renderActiveLassoPreview();
}

export function setLassoPatternOffsetX(val: number): void {
    lassoPatternOffsetX = Math.max(-64, Math.min(64, Math.round(val)));
    updateLassoNudgeUI();
    renderActiveLassoPreview();
}

export function setLassoPatternOffsetY(val: number): void {
    lassoPatternOffsetY = Math.max(-64, Math.min(64, Math.round(val)));
    updateLassoNudgeUI();
    renderActiveLassoPreview();
}

export function nudgeLassoPatternOffset(dx: number, dy: number): void {
    lassoPatternOffsetX = Math.max(-64, Math.min(64, lassoPatternOffsetX + dx));
    lassoPatternOffsetY = Math.max(-64, Math.min(64, lassoPatternOffsetY + dy));
    updateLassoNudgeUI();
    renderActiveLassoPreview();
}

export function resetLassoPatternOffset(): void {
    lassoPatternOffsetX = 0;
    lassoPatternOffsetY = 0;
    updateLassoNudgeUI();
    renderActiveLassoPreview();
    showToast("Đã đặt lại độ lệch pha hoa văn.", "info");
}

export function updateLassoNudgeUI(): void {
    const lbl = document.getElementById('lbl-lasso-offset');
    if (lbl) {
        lbl.innerText = `X: ${lassoPatternOffsetX >= 0 ? '+' : ''}${lassoPatternOffsetX}px, Y: ${lassoPatternOffsetY >= 0 ? '+' : ''}${lassoPatternOffsetY}px`;
    }
    const rangeX = document.getElementById('num-lasso-offset-x') as HTMLInputElement | null;
    if (rangeX && parseInt(rangeX.value) !== lassoPatternOffsetX) {
        rangeX.value = String(lassoPatternOffsetX);
    }
    const rangeY = document.getElementById('num-lasso-offset-y') as HTMLInputElement | null;
    if (rangeY && parseInt(rangeY.value) !== lassoPatternOffsetY) {
        rangeY.value = String(lassoPatternOffsetY);
    }
    const lblX = document.getElementById('lbl-lasso-offset-x-val');
    if (lblX) lblX.innerText = `${lassoPatternOffsetX >= 0 ? '+' : ''}${lassoPatternOffsetX}px`;
    const lblY = document.getElementById('lbl-lasso-offset-y-val');
    if (lblY) lblY.innerText = `${lassoPatternOffsetY >= 0 ? '+' : ''}${lassoPatternOffsetY}px`;
}

export function makeSeamlessTile(sourceTile: HTMLCanvasElement, overlap: number = 8): HTMLCanvasElement {
    const W = sourceTile.width;
    const H = sourceTile.height;
    if (W <= 4 || H <= 4) return sourceTile;

    const ov = Math.max(1, Math.min(overlap, Math.floor(Math.min(W, H) / 4)));
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const oCtx = out.getContext('2d');
    if (!oCtx) return sourceTile;

    oCtx.drawImage(sourceTile, 0, 0);

    try {
        const imgData = oCtx.getImageData(0, 0, W, H);
        const data = imgData.data;

        // Horizontal cross-fade blending on left/right borders
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < ov; x++) {
                const alpha = x / ov;
                const leftIdx = (y * W + x) * 4;
                const rightIdx = (y * W + (W - ov + x)) * 4;

                for (let c = 0; c < 4; c++) {
                    const blended = Math.round(data[leftIdx + c] * alpha + data[rightIdx + c] * (1 - alpha));
                    data[leftIdx + c] = blended;
                    data[rightIdx + c] = blended;
                }
            }
        }

        // Vertical cross-fade blending on top/bottom borders
        for (let x = 0; x < W; x++) {
            for (let y = 0; y < ov; y++) {
                const alpha = y / ov;
                const topIdx = (y * W + x) * 4;
                const bottomIdx = ((H - ov + y) * W + x) * 4;

                for (let c = 0; c < 4; c++) {
                    const blended = Math.round(data[topIdx + c] * alpha + data[bottomIdx + c] * (1 - alpha));
                    data[topIdx + c] = blended;
                    data[bottomIdx + c] = blended;
                }
            }
        }

        oCtx.putImageData(imgData, 0, 0);
    } catch {
        // Canvas security fallback
    }

    return out;
}

export function findBestAdjacentPatch(
    imgElement: HTMLImageElement | HTMLCanvasElement,
    minX: number,
    minY: number,
    cropW: number,
    cropH: number
): { x: number; y: number; w: number; h: number } {
    const imgW = (imgElement as any).naturalWidth || (imgElement as any).width || 1000;
    const imgH = (imgElement as any).naturalHeight || (imgElement as any).height || 1400;

    // Try top
    if (minY - cropH - 4 >= 0) {
        return { x: Math.max(0, Math.min(imgW - cropW, minX)), y: minY - cropH - 4, w: cropW, h: cropH };
    }
    // Try left
    if (minX - cropW - 4 >= 0) {
        return { x: minX - cropW - 4, y: Math.max(0, Math.min(imgH - cropH, minY)), w: cropW, h: cropH };
    }
    // Try right
    if (minX + cropW + 4 + cropW <= imgW) {
        return { x: minX + cropW + 4, y: Math.max(0, Math.min(imgH - cropH, minY)), w: cropW, h: cropH };
    }
    // Try bottom
    if (minY + cropH + 4 + cropH <= imgH) {
        return { x: Math.max(0, Math.min(imgW - cropW, minX)), y: minY + cropH + 4, w: cropW, h: cropH };
    }

    return { x: Math.max(0, Math.min(imgW - cropW, minX)), y: Math.max(0, Math.min(imgH - cropH, minY)), w: cropW, h: cropH };
}

export function updateLassoSampleUI(w: number, h: number, sampleCanvas: HTMLCanvasElement | null): void {
    const lbl = document.getElementById('lbl-lasso-sample-status');
    if (lbl) {
        lbl.innerText = `Mẫu: ${w}x${h}px`;
        lbl.classList.remove('text-slate-400', 'text-slate-500');
        lbl.classList.add('text-teal-400');
    }
    const preview = document.getElementById('lasso-sample-thumb-preview') as HTMLCanvasElement | null;
    if (preview && sampleCanvas) {
        preview.width = 32;
        preview.height = 32;
        const pCtx = preview.getContext('2d');
        if (pCtx) {
            pCtx.clearRect(0, 0, 32, 32);
            pCtx.drawImage(sampleCanvas, 0, 0, 32, 32);
        }
        preview.classList.remove('hidden');
    }
}

export function pickLassoRectSample(): void {
    isSelectingLassoSample = true;
    showToast("⛶ Kéo chuột để quét chọn một hình chữ nhật mẫu vân trên tranh!", "info");
    initEraserDrawingEvents();
}

export function autoSampleNearbyLassoRect(): boolean {
    const points = activeLassoPoints;
    const imgElement = elements.mangaBgImage;
    if (!imgElement || !imgElement.naturalWidth) {
        showToast("Không tìm thấy ảnh gốc để lấy mẫu.", "warn");
        return false;
    }

    let minX = 0, minY = 0, maxX = 100, maxY = 100;
    if (points && points.length >= 3) {
        minX = points[0].x; minY = points[0].y; maxX = points[0].x; maxY = points[0].y;
        for (let i = 1; i < points.length; i++) {
            minX = Math.min(minX, points[i].x);
            minY = Math.min(minY, points[i].y);
            maxX = Math.max(maxX, points[i].x);
            maxY = Math.max(maxY, points[i].y);
        }
    }

    const sampleSize = 32;
    // Try above lasso box
    let sampleX = Math.max(0, Math.floor(minX));
    let sampleY = Math.max(0, Math.floor(minY - sampleSize - 4));
    if (sampleY + sampleSize > minY && minX - sampleSize - 4 >= 0) {
        sampleX = Math.max(0, Math.floor(minX - sampleSize - 4));
        sampleY = Math.max(0, Math.floor(minY));
    } else if (sampleY + sampleSize > minY && maxX + 4 + sampleSize <= imgElement.naturalWidth) {
        sampleX = Math.floor(maxX + 4);
        sampleY = Math.max(0, Math.floor(minY));
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sampleSize;
    tempCanvas.height = sampleSize;
    const tCtx = tempCanvas.getContext('2d');
    if (!tCtx) return false;
    tCtx.drawImage(imgElement, sampleX, sampleY, sampleSize, sampleSize, 0, 0, sampleSize, sampleSize);

    lassoSampleCanvas = tempCanvas;
    lassoSampleSrc = { x: sampleX, y: sampleY, w: sampleSize, h: sampleSize };
    patchCanvas = tempCanvas;

    setLassoPatternType('sample');
    updateLassoSampleUI(sampleSize, sampleSize, tempCanvas);
    showToast(`⚡ Đã tự động lấy mẫu vân ${sampleSize}x${sampleSize}px từ vùng lân cận!`, "success");
    return true;
}

export function setIsEraserModeActive(val: boolean): void {
    isEraserModeActive = val;
}

export function autoCleanBubbleBackground(page: MangaPage, block: MangaBlock): boolean {
    if (!page || !block) {
        showToast('Không tìm thấy thông tin ô thoại để xóa chữ.', 'warn');
        return false;
    }

    const canvas = document.getElementById('eraser-canvas') as HTMLCanvasElement | null;
    if (!canvas) return false;

    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    const bx = Math.round((block.box.x / 100) * canvas.width);
    const by = Math.round((block.box.y / 100) * canvas.height);
    const bw = Math.round((block.box.w / 100) * canvas.width);
    const bh = Math.round((block.box.h / 100) * canvas.height);

    let activeImageData = page.imageDataCache || null;
    const imgElement = elements.mangaBgImage;
    if (!activeImageData && imgElement && imgElement.naturalWidth > 0 && imgElement.naturalHeight > 0) {
        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imgElement.naturalWidth;
            tempCanvas.height = imgElement.naturalHeight;
            const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
            if (tempCtx) {
                tempCtx.drawImage(imgElement, 0, 0);
                activeImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                tempCanvas.width = 0;
                tempCanvas.height = 0;
                page.imageDataCache = activeImageData;
            }
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

export function autoCleanActiveBlock(): void {
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

        activeLassoPoints = null;
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

    if (isSelectingLassoSample) {
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

            // Live Real-Time Texture Preview while dragging sample
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
                            lassoSampleCanvas = liveSampleCanvas;
                            lassoSampleSrc = { x: startX, y: startY, w: cropW, h: cropH };
                            patchCanvas = liveSampleCanvas;

                            // 1. Update Floating Preview HUD
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

                            // 2. Update Sidebar thumbnail
                            updateLassoSampleUI(cropW, cropH, liveSampleCanvas);

                            // 3. Update Live Preview in active Lasso Polygon
                            if (activeLassoPoints) {
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
                            lassoSampleCanvas = tempCanvas;
                            lassoSampleSrc = { x: startX, y: startY, w: cropW, h: cropH };
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

            isSelectingLassoSample = false;
            initEraserDrawingEvents();

            const activePts = activeLassoPoints;
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

            if (lassoOriginalImageData) {
                ctx.putImageData(lassoOriginalImageData, 0, 0);
            }

            preLassoImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            lassoOriginalImageData = preLassoImageData;
            activeLassoPoints = null;
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
                activeLassoPoints = null;
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

            activeLassoPoints = points;
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

export function cleanMangaBackgroundArtWithMask(ctx: CanvasRenderingContext2D, width: number, height: number, maskBytes: Uint8Array): void {
    const imgData = ctx.getImageData(0, 0, width, height);
    const { outputRgba } = runPatchMatchPipeline(
        new Uint8Array(imgData.data),
        maskBytes,
        width,
        height,
        {
            patchRadius: 4,
            maskDilate: 0,
            enablePatternDetection: true,
            enableSeamBlending: true
        }
    );
    const outImgData = ctx.createImageData(width, height);
    outImgData.data.set(outputRgba);
    ctx.putImageData(outImgData, 0, 0);
}

export async function cleanMangaBackgroundArtText(ctx: CanvasRenderingContext2D, width: number, height: number): Promise<void> {
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

    cleanMangaBackgroundArtWithMask(ctx, width, height, mask);
}

export async function aiSmartInpaintBlock(_mode: string = 'local'): Promise<void> {
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
    if (!canvas) return;
    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
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
    if (!tempCtx) return;
    tempCtx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

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
        const { patchMatchInpaintImageData } = await import('./patchmatch/index');
        const cImgData = tempCtx.getImageData(0, 0, cropW, cropH);
        const { outputImageData } = await patchMatchInpaintImageData({
            imageData: cImgData,
            mask: textMaskBytes,
            width: cropW,
            height: cropH,
            options: { patchRadius: 4, maskDilate: 1 }
        });
        let usedFallback = false;
        if (outputImageData) {
            tempCtx.putImageData(outputImageData, 0, 0);
            ctx.drawImage(tempCanvas, cropX, cropY);
        } else {
            usedFallback = true;
            await cleanMangaBackgroundArtText(tempCtx, cropW, cropH);
            ctx.drawImage(tempCanvas, cropX, cropY);
        }
        
        block.style.bgOpacity = 0;
        block.maskCache = null;

        saveEraserDrawingToPage();
        requestOverlayRender();
        uiUpdateActiveBlockEditor();

        if (usedFallback) {
            showToast("Hoa văn ô thoại được xử lý bằng bộ lọc làm sạch Telea dự phòng.", "info");
        } else {
            showToast('✨ Đã khôi phục hoàn hảo kết cấu trame & hoa văn nền manga!', 'success');
        }
    } catch (pmErr: any) {
        console.warn("PatchMatch smart inpaint fallback:", pmErr);
        await cleanMangaBackgroundArtText(tempCtx, cropW, cropH);
        ctx.drawImage(tempCanvas, cropX, cropY);

        block.style.bgOpacity = 0;
        block.maskCache = null;

        saveEraserDrawingToPage();
        requestOverlayRender();
        uiUpdateActiveBlockEditor();
        showToast(`Không thể chạy PatchMatch (${pmErr?.message || 'Lỗi thuật toán'}) → Đã chuyển sang làm sạch Telea dự phòng.`, "warn");
    }
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

export function clearLassoSelection(): void {
    activeLassoPoints = null;
    updateLassoButtons(false);

    const canvas = elements.eraserCanvas;
    const ctx = canvas?.getContext('2d');
    if (lassoOriginalImageData && ctx) {
        ctx.putImageData(lassoOriginalImageData, 0, 0);
        lassoOriginalImageData = null;
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

export async function runLassoContentAwareFill(): Promise<void> {
    const points = activeLassoPoints;
    if (!points || points.length < 3) {
        showToast("Vui lòng vẽ khoanh vùng chọn Lasso trước.", "warn");
        return;
    }

    const canvas = elements.eraserCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const imgElement = elements.mangaBgImage;
    const page = globalState.pages[globalState.activePageIndex];

    if (!imgElement || !imgElement.naturalWidth || !page) {
        showToast("Không tìm thấy ảnh gốc để xử lý.", "error");
        return;
    }

    const fuzzinessInput = document.getElementById('num-lasso-fuzziness') as HTMLInputElement | null;
    const fuzziness = fuzzinessInput ? parseInt(fuzzinessInput.value) || 25 : 25;

    const expandInput = document.getElementById('num-lasso-expand') as HTMLInputElement | null;
    const expandSize = expandInput ? parseInt(expandInput.value) || 0 : 3;

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

    let showGlobalOverlay = typeof elements.processingOverlay !== 'undefined';
    if (showGlobalOverlay) {
        const { uiUpdateProcessingOverlay: updateOverlay } = await import('../core/state');
        updateOverlay(true, "Đang xử lý vẽ bù...");
    } else {
        showToast("Đang vẽ bù nền thông minh...", "info");
    }

    try {
        pushStateToHistory();

        if (lassoOriginalImageData) {
            ctx.putImageData(lassoOriginalImageData, 0, 0);
        } else {
            await restorePageEraserDrawing(page);
        }

        const compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = canvas.width;
        compositeCanvas.height = canvas.height;
        const compCtx = compositeCanvas.getContext('2d', { willReadFrequently: true });
        if (!compCtx) return;
        compCtx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
        compCtx.drawImage(canvas, 0, 0);

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
        if (!cropCtx) return;
        cropCtx.drawImage(compositeCanvas, startX, startY, cropW, cropH, 0, 0, cropW, cropH);

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

        const lassoMaskCanvas = document.createElement('canvas');
        lassoMaskCanvas.width = cropW;
        lassoMaskCanvas.height = cropH;
        const lmCtx = lassoMaskCanvas.getContext('2d', { willReadFrequently: true });
        if (!lmCtx) return;
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
        if (!fmCtx) return;
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

        let rawInpaintedCanvas: HTMLCanvasElement | null = null;
        try {
            const { patchMatchInpaintImageData } = await import('./patchmatch/index');
            const cImgData = cropCtx.getImageData(0, 0, cropW, cropH);

            const { outputImageData } = await patchMatchInpaintImageData({
                imageData: cImgData,
                mask: finalMaskBytes,
                width: cropW,
                height: cropH,
                options: {
                    patchRadius: 5,
                    iterations: 6,
                    randomSearchRadius: 64,
                    maskDilate: 0,
                    enablePatternDetection: true,
                    enableSeamBlending: true
                },
                onProgress: (_percent: number, msg: string) => {
                    if (showGlobalOverlay) {
                        import('../core/state').then(st => {
                            st.uiUpdateProcessingOverlay(true, msg);
                        });
                    }
                }
            });

            if (outputImageData) {
                const patchC = document.createElement('canvas');
                patchC.width = cropW;
                patchC.height = cropH;
                const pCtx = patchC.getContext('2d');
                if (pCtx) {
                    pCtx.putImageData(outputImageData, 0, 0);
                    rawInpaintedCanvas = patchC;
                }
            }
        } catch (pmErr) {
            console.warn("PatchMatch Worker failed, falling back to direct crystal phase synthesizer:", pmErr);
            const patchC = document.createElement('canvas');
            patchC.width = cropW;
            patchC.height = cropH;
            const pCtx = patchC.getContext('2d', { willReadFrequently: true });
            if (pCtx) {
                pCtx.drawImage(cropCanvas, 0, 0);
                cleanMangaBackgroundArtWithMask(pCtx, cropW, cropH, finalMaskBytes);
                rawInpaintedCanvas = patchC;
            }
        }

        if (rawInpaintedCanvas) {
            const compCanvas = document.createElement('canvas');
            compCanvas.width = cropW;
            compCanvas.height = cropH;
            const cCtx = compCanvas.getContext('2d', { willReadFrequently: true });
            if (cCtx) {
                cCtx.drawImage(rawInpaintedCanvas, 0, 0, cropW, cropH);
                cCtx.globalCompositeOperation = 'destination-in';
                cCtx.drawImage(finalMaskCanvas, 0, 0);
                cCtx.globalCompositeOperation = 'source-over';
                ctx.drawImage(compCanvas, startX, startY);
            }
        }

        await saveEraserDrawingToPage();
        requestOverlayRender();

        activeLassoPoints = null;
        lassoOriginalImageData = null;
        updateLassoButtons(false);

        showToast("✨ Đã lấp đầy vùng chọn Lasso thành công!", "success");
    } catch (err: any) {
        console.error("Lasso fill error:", err);
        showToast(`Không thể vẽ bù vùng chọn: ${err.message}`, "error");

        await restorePageEraserDrawing(page);
        requestOverlayRender();
    } finally {
        if (showGlobalOverlay) {
            const { uiUpdateProcessingOverlay: updateOverlay } = await import('../core/state');
            updateOverlay(false);
        }
    }
}

export function setLassoFillTab(tab: 'ai' | 'pattern'): void {
    lassoActiveTab = tab;
    const tabAi = document.getElementById('tab-lasso-ai');
    const tabPattern = document.getElementById('tab-lasso-pattern');
    const panelAi = document.getElementById('lasso-ai-controls');
    const panelPattern = document.getElementById('lasso-pattern-controls');

    if (tab === 'ai') {
        tabAi?.classList.add('bg-indigo-600', 'text-white');
        tabAi?.classList.remove('text-slate-400', 'hover:text-slate-200');
        tabPattern?.classList.remove('bg-indigo-600', 'text-white');
        tabPattern?.classList.add('text-slate-400', 'hover:text-slate-200');
        panelAi?.classList.remove('hidden');
        panelPattern?.classList.add('hidden');
    } else {
        tabPattern?.classList.add('bg-indigo-600', 'text-white');
        tabPattern?.classList.remove('text-slate-400', 'hover:text-slate-200');
        tabAi?.classList.remove('bg-indigo-600', 'text-white');
        tabAi?.classList.add('text-slate-400', 'hover:text-slate-200');
        panelPattern?.classList.remove('hidden');
        panelAi?.classList.add('hidden');
    }
    renderActiveLassoPreview();
}

export function setLassoPatternType(type: LassoPatternType): void {
    lassoPatternType = type;
    if (type !== 'sample' && lassoFillTechnique !== 'preset_tone') {
        lassoFillTechnique = 'preset_tone';
        const techPatch = document.getElementById('btn-lasso-tech-patch');
        const techTile = document.getElementById('btn-lasso-tech-tile');
        const techPreset = document.getElementById('btn-lasso-tech-preset');
        const secPatch = document.getElementById('lasso-sec-patch');
        const secPresets = document.getElementById('lasso-sec-presets');

        [techPatch, techTile].forEach(b => {
            b?.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-400');
            b?.classList.add('bg-slate-900', 'text-slate-400', 'border-slate-800');
        });
        techPreset?.classList.add('bg-indigo-600', 'text-white', 'border-indigo-400');
        techPreset?.classList.remove('bg-slate-900', 'text-slate-400', 'border-slate-800');
        secPatch?.classList.add('hidden');
        secPresets?.classList.remove('hidden');
    }

    const types: LassoPatternType[] = ['halftone', 'horizontal', 'vertical', 'diagonal', 'crosshatch', 'noise', 'sample'];
    types.forEach(t => {
        const btn = document.getElementById(`btn-lasso-pat-${t}`);
        if (btn) {
            if (t === type) {
                btn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-400');
                btn.classList.remove('bg-slate-900', 'text-slate-400', 'border-slate-800');
            } else {
                btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-400');
                btn.classList.add('bg-slate-900', 'text-slate-400', 'border-slate-800');
            }
        }
    });

    const sampleNotice = document.getElementById('lasso-pattern-sample-notice');
    if (sampleNotice) {
        if (type === 'sample') {
            sampleNotice.classList.remove('hidden');
        } else {
            sampleNotice.classList.add('hidden');
        }
    }
    renderActiveLassoPreview();
}

export function renderActiveLassoPreview(): void {
    const points = activeLassoPoints;
    if (!points || points.length < 3) return;

    const canvas = elements.eraserCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (lassoOriginalImageData) {
        ctx.putImageData(lassoOriginalImageData, 0, 0);
    }

    if (lassoActiveTab === 'pattern') {
        const featherInput = document.getElementById('num-lasso-pat-feather') as HTMLInputElement | null;
        const feather = featherInput ? parseInt(featherInput.value) || 0 : Math.max(1, lassoPatternFeather);

        const opacityInput = document.getElementById('num-lasso-pat-opacity') as HTMLInputElement | null;
        const opacity = opacityInput ? (parseInt(opacityInput.value) || 100) / 100 : (lassoPatternOpacity / 100);

        let minX = points[0].x, minY = points[0].y, maxX = points[0].x, maxY = points[0].y;
        for (let i = 1; i < points.length; i++) {
            minX = Math.min(minX, points[i].x);
            minY = Math.min(minY, points[i].y);
            maxX = Math.max(maxX, points[i].x);
            maxY = Math.max(maxY, points[i].y);
        }

        const pad = Math.ceil(feather + 4);
        const startX = Math.max(0, Math.floor(minX - pad));
        const startY = Math.max(0, Math.floor(minY - pad));
        const endX = Math.min(canvas.width, Math.ceil(maxX + pad));
        const endY = Math.min(canvas.height, Math.ceil(maxY + pad));
        const cropW = endX - startX;
        const cropH = endY - startY;

        if (cropW > 2 && cropH > 2) {
            const patternCanvas = document.createElement('canvas');
            patternCanvas.width = cropW;
            patternCanvas.height = cropH;
            const pCtx = patternCanvas.getContext('2d');

            const imgElement = elements.mangaBgImage;

            if (pCtx) {
                if (lassoFillTechnique === 'patch_1to1' && imgElement && imgElement.naturalWidth) {
                    let srcX = 0, srcY = 0;
                    if (lassoSampleSrc) {
                        srcX = lassoSampleSrc.x + lassoPatternOffsetX;
                        srcY = lassoSampleSrc.y + lassoPatternOffsetY;
                    } else {
                        const autoPatch = findBestAdjacentPatch(imgElement, startX, startY, cropW, cropH);
                        srcX = autoPatch.x + lassoPatternOffsetX;
                        srcY = autoPatch.y + lassoPatternOffsetY;
                    }
                    srcX = Math.max(0, Math.min(imgElement.naturalWidth - cropW, srcX));
                    srcY = Math.max(0, Math.min(imgElement.naturalHeight - cropH, srcY));
                    pCtx.drawImage(imgElement, srcX, srcY, cropW, cropH, 0, 0, cropW, cropH);
                } else {
                    let rawTile: HTMLCanvasElement;
                    if (lassoFillTechnique === 'grid_tile' || lassoPatternType === 'sample') {
                        const rawSample = lassoSampleCanvas || patchCanvas;
                        if (rawSample && rawSample.width > 0) {
                            rawTile = rawSample;
                        } else if (imgElement && imgElement.naturalWidth) {
                            rawTile = lassoSampleCanvas || patchCanvas || createMangaPatternTile({ type: 'halftone', size: lassoPatternSize, density: lassoPatternDensity });
                        } else {
                            rawTile = createMangaPatternTile({ type: 'halftone', size: lassoPatternSize, density: lassoPatternDensity });
                        }
                    } else if (lassoFillTechnique === 'seamless_tile') {
                        const rawSample = lassoSampleCanvas || patchCanvas;
                        if (rawSample && rawSample.width > 0) {
                            rawTile = makeSeamlessTile(rawSample, lassoCrossfadeOverlap);
                        } else {
                            rawTile = createMangaPatternTile({ type: 'halftone', size: lassoPatternSize, density: lassoPatternDensity });
                        }
                    } else {
                        const sizeInput = document.getElementById('num-lasso-pat-size') as HTMLInputElement | null;
                        const patternSize = sizeInput ? parseInt(sizeInput.value) || lassoPatternSize : lassoPatternSize;
                        const densityInput = document.getElementById('num-lasso-pat-density') as HTMLInputElement | null;
                        const patternDensity = densityInput ? parseInt(densityInput.value) || lassoPatternDensity : lassoPatternDensity;
                        const fgColorInput = document.getElementById('color-lasso-pat-fg') as HTMLInputElement | null;
                        const fgColor = fgColorInput ? fgColorInput.value : lassoPatternFgColor;
                        const bgColorInput = document.getElementById('color-lasso-pat-bg') as HTMLInputElement | null;
                        const bgColor = bgColorInput ? bgColorInput.value : lassoPatternBgColor;
                        const transCheck = document.getElementById('chk-lasso-pat-trans') as HTMLInputElement | null;
                        const isTransparent = transCheck ? transCheck.checked : lassoPatternTransparentBg;

                        rawTile = createMangaPatternTile({
                            type: lassoPatternType,
                            size: patternSize,
                            density: patternDensity,
                            fgColor,
                            bgColor,
                            isTransparent
                        });
                    }

                    const tileW = Math.max(1, rawTile.width);
                    const tileH = Math.max(1, rawTile.height);
                    const originX = (lassoFillTechnique === 'preset_tone' || lassoPatternType !== 'sample' ? 0 : (lassoSampleSrc ? lassoSampleSrc.x : 0)) + lassoPatternOffsetX;
                    const originY = (lassoFillTechnique === 'preset_tone' || lassoPatternType !== 'sample' ? 0 : (lassoSampleSrc ? lassoSampleSrc.y : 0)) + lassoPatternOffsetY;

                    let shiftX = (startX - originX) % tileW;
                    if (shiftX < 0) shiftX += tileW;
                    let shiftY = (startY - originY) % tileH;
                    if (shiftY < 0) shiftY += tileH;

                    for (let py = -shiftY; py < cropH; py += tileH) {
                        for (let px = -shiftX; px < cropW; px += tileW) {
                            pCtx.drawImage(rawTile, px, py);
                        }
                    }
                }

                // Mask with lasso polygon
                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = cropW;
                maskCanvas.height = cropH;
                const mCtx = maskCanvas.getContext('2d');
                if (mCtx) {
                    if (feather > 0) mCtx.filter = `blur(${feather}px)`;
                    mCtx.fillStyle = '#ffffff';
                    mCtx.beginPath();
                    mCtx.moveTo(points[0].x - startX, points[0].y - startY);
                    for (let i = 1; i < points.length; i++) {
                        mCtx.lineTo(points[i].x - startX, points[i].y - startY);
                    }
                    mCtx.closePath();
                    mCtx.fill();

                    const outputCanvas = document.createElement('canvas');
                    outputCanvas.width = cropW;
                    outputCanvas.height = cropH;
                    const oCtx = outputCanvas.getContext('2d');
                    if (oCtx) {
                        oCtx.drawImage(patternCanvas, 0, 0);
                        oCtx.globalCompositeOperation = 'destination-in';
                        oCtx.drawImage(maskCanvas, 0, 0);

                        ctx.save();
                        ctx.globalAlpha = Math.max(0.05, Math.min(1.0, opacity));
                        ctx.drawImage(outputCanvas, startX, startY);
                        ctx.restore();
                    }
                }
            }
        }
    } else {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(168, 85, 247, 0.12)';
        ctx.fill();
        ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1.5;
    if (typeof ctx.setLineDash === 'function') {
        ctx.setLineDash([4, 4]);
    }
    ctx.stroke();
    ctx.restore();
}

export interface PatternTileOptions {
    type: LassoPatternType;
    size?: number;
    density?: number;
    fgColor?: string;
    bgColor?: string;
    isTransparent?: boolean;
    sampleCanvas?: HTMLCanvasElement | null;
}

export function createMangaPatternTile(options: PatternTileOptions): HTMLCanvasElement {
    const type = options.type || 'halftone';
    const size = Math.max(2, Math.min(64, options.size || 8));
    const density = Math.max(5, Math.min(95, options.density ?? 40));
    const fgColor = options.fgColor || '#000000';
    const bgColor = options.bgColor || '#ffffff';
    const isTransparent = options.isTransparent ?? false;

    if (type === 'sample') {
        const sample = options.sampleCanvas || lassoSampleCanvas || patchCanvas;
        if (sample && sample.width > 0 && sample.height > 0) {
            return sample;
        }
    }

    const tile = document.createElement('canvas');
    let S = size;

    if (type === 'halftone') {
        S = Math.max(4, size);
        tile.width = S;
        tile.height = S;
        const ctx = tile.getContext('2d');
        if (!ctx) return tile;

        if (!isTransparent) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, S, S);
        }

        const radius = Math.max(0.75, (S / 2) * Math.sqrt(density / 100));

        ctx.fillStyle = fgColor;

        // Center dot
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, radius, 0, Math.PI * 2);
        ctx.fill();

        // 4 corner dots for 45° offset screentone grid
        const corners = [[0, 0], [S, 0], [0, S], [S, S]];
        for (const [cx, cy] of corners) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (type === 'horizontal') {
        S = Math.max(2, size);
        const W = 16;
        tile.width = W;
        tile.height = S;
        const ctx = tile.getContext('2d');
        if (!ctx) return tile;

        if (!isTransparent) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, W, S);
        }

        const lineH = Math.max(1, Math.round(S * (density / 100)));
        ctx.fillStyle = fgColor;
        ctx.fillRect(0, 0, W, lineH);
    } else if (type === 'vertical') {
        S = Math.max(2, size);
        const H = 16;
        tile.width = S;
        tile.height = H;
        const ctx = tile.getContext('2d');
        if (!ctx) return tile;

        if (!isTransparent) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, S, H);
        }

        const lineW = Math.max(1, Math.round(S * (density / 100)));
        ctx.fillStyle = fgColor;
        ctx.fillRect(0, 0, lineW, H);
    } else if (type === 'diagonal') {
        S = Math.max(4, size);
        tile.width = S;
        tile.height = S;
        const ctx = tile.getContext('2d');
        if (!ctx) return tile;

        if (!isTransparent) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, S, S);
        }

        const lineW = Math.max(1, Math.round(S * (density / 100) * 0.75));
        ctx.strokeStyle = fgColor;
        ctx.lineWidth = lineW;
        ctx.lineCap = 'square';

        const drawDiag = (ox: number, oy: number) => {
            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.lineTo(ox + S, oy + S);
            ctx.stroke();
        };

        drawDiag(0, 0);
        drawDiag(-S, 0);
        drawDiag(0, -S);
        drawDiag(S, -S);
        drawDiag(-S, S);
    } else if (type === 'crosshatch') {
        S = Math.max(4, size);
        tile.width = S;
        tile.height = S;
        const ctx = tile.getContext('2d');
        if (!ctx) return tile;

        if (!isTransparent) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, S, S);
        }

        const lineW = Math.max(1, Math.round(S * (density / 100) * 0.5));
        ctx.fillStyle = fgColor;
        ctx.fillRect(0, 0, S, lineW);
        ctx.fillRect(0, 0, lineW, S);
    } else if (type === 'noise') {
        S = Math.max(16, size * 2);
        tile.width = S;
        tile.height = S;
        const ctx = tile.getContext('2d');
        if (!ctx) return tile;

        if (!isTransparent) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, S, S);
        }

        const imgData = ctx.getImageData(0, 0, S, S);
        const data = imgData.data;

        let fr = 0, fg = 0, fb = 0;
        if (fgColor.startsWith('#')) {
            const hex = fgColor.replace('#', '');
            if (hex.length === 3) {
                fr = parseInt(hex[0] + hex[0], 16);
                fg = parseInt(hex[1] + hex[1], 16);
                fb = parseInt(hex[2] + hex[2], 16);
            } else if (hex.length >= 6) {
                fr = parseInt(hex.substring(0, 2), 16);
                fg = parseInt(hex.substring(2, 4), 16);
                fb = parseInt(hex.substring(4, 6), 16);
            }
        }

        const threshold = density / 100;
        for (let i = 0; i < S * S; i++) {
            if (Math.random() < threshold) {
                const p = i * 4;
                data[p] = fr;
                data[p + 1] = fg;
                data[p + 2] = fb;
                data[p + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }

    return tile;
}

export async function runLassoPatternFill(): Promise<void> {
    const points = activeLassoPoints;
    if (!points || points.length < 3) {
        showToast("Vui lòng vẽ khoanh vùng chọn Lasso trước.", "warn");
        return;
    }

    const canvas = elements.eraserCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page) {
        showToast("Không tìm thấy trang hiện tại để xử lý.", "error");
        return;
    }

    const sizeInput = document.getElementById('num-lasso-pat-size') as HTMLInputElement | null;
    const patternSize = sizeInput ? parseInt(sizeInput.value) || lassoPatternSize : lassoPatternSize;

    const densityInput = document.getElementById('num-lasso-pat-density') as HTMLInputElement | null;
    const patternDensity = densityInput ? parseInt(densityInput.value) || lassoPatternDensity : lassoPatternDensity;

    const fgColorInput = document.getElementById('color-lasso-pat-fg') as HTMLInputElement | null;
    const fgColor = fgColorInput ? fgColorInput.value : lassoPatternFgColor;

    const bgColorInput = document.getElementById('color-lasso-pat-bg') as HTMLInputElement | null;
    const bgColor = bgColorInput ? bgColorInput.value : lassoPatternBgColor;

    const transCheck = document.getElementById('chk-lasso-pat-trans') as HTMLInputElement | null;
    const isTransparent = transCheck ? transCheck.checked : lassoPatternTransparentBg;

    const opacityInput = document.getElementById('num-lasso-pat-opacity') as HTMLInputElement | null;
    const opacity = opacityInput ? (parseInt(opacityInput.value) || 100) / 100 : (lassoPatternOpacity / 100);

    const featherInput = document.getElementById('num-lasso-pat-feather') as HTMLInputElement | null;
    const feather = featherInput ? parseInt(featherInput.value) || 0 : Math.max(1, lassoPatternFeather);

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

    const pad = Math.ceil(feather + 4);
    const startX = Math.max(0, Math.floor(minX - pad));
    const startY = Math.max(0, Math.floor(minY - pad));
    const endX = Math.min(canvas.width, Math.ceil(maxX + pad));
    const endY = Math.min(canvas.height, Math.ceil(maxY + pad));
    const cropW = endX - startX;
    const cropH = endY - startY;

    if (cropW <= 2 || cropH <= 2) {
        showToast("Vùng chọn quá nhỏ, vui lòng vẽ lại.", "warn");
        return;
    }

    try {
        pushStateToHistory();

        if (lassoOriginalImageData) {
            ctx.putImageData(lassoOriginalImageData, 0, 0);
        } else {
            await restorePageEraserDrawing(page);
        }

        const patternCanvas = document.createElement('canvas');
        patternCanvas.width = cropW;
        patternCanvas.height = cropH;
        const pCtx = patternCanvas.getContext('2d');
        if (!pCtx) return;

        const imgElement = elements.mangaBgImage;

        if (lassoFillTechnique === 'patch_1to1' && imgElement && imgElement.naturalWidth) {
            // METHOD 1: Photoshop Patch Tool 1:1 direct texture shift
            let srcX = 0, srcY = 0;
            if (lassoSampleSrc) {
                srcX = lassoSampleSrc.x + lassoPatternOffsetX;
                srcY = lassoSampleSrc.y + lassoPatternOffsetY;
            } else {
                const autoPatch = findBestAdjacentPatch(imgElement, startX, startY, cropW, cropH);
                srcX = autoPatch.x + lassoPatternOffsetX;
                srcY = autoPatch.y + lassoPatternOffsetY;
            }
            srcX = Math.max(0, Math.min(imgElement.naturalWidth - cropW, srcX));
            srcY = Math.max(0, Math.min(imgElement.naturalHeight - cropH, srcY));

            pCtx.drawImage(imgElement, srcX, srcY, cropW, cropH, 0, 0, cropW, cropH);
        } else {
            // METHOD 2: Grid Tiling (Ghép ô) or Preset Screentone with Phase Shift Adjustment
            let rawTile: HTMLCanvasElement;
            if (lassoFillTechnique === 'grid_tile' || lassoPatternType === 'sample') {
                const rawSample = lassoSampleCanvas || patchCanvas;
                if (rawSample && rawSample.width > 0) {
                    rawTile = rawSample;
                } else if (imgElement && imgElement.naturalWidth) {
                    autoSampleNearbyLassoRect();
                    rawTile = lassoSampleCanvas || patchCanvas || createMangaPatternTile({ type: 'halftone', size: patternSize, density: patternDensity });
                } else {
                    rawTile = createMangaPatternTile({ type: 'halftone', size: patternSize, density: patternDensity });
                }
            } else if (lassoFillTechnique === 'seamless_tile') {
                const rawSample = lassoSampleCanvas || patchCanvas;
                if (rawSample && rawSample.width > 0) {
                    rawTile = makeSeamlessTile(rawSample, lassoCrossfadeOverlap);
                } else if (imgElement && imgElement.naturalWidth) {
                    autoSampleNearbyLassoRect();
                    rawTile = makeSeamlessTile(lassoSampleCanvas || patchCanvas || createMangaPatternTile({ type: 'halftone', size: patternSize, density: patternDensity }), lassoCrossfadeOverlap);
                } else {
                    rawTile = createMangaPatternTile({ type: 'halftone', size: patternSize, density: patternDensity });
                }
            } else {
                rawTile = createMangaPatternTile({
                    type: lassoPatternType,
                    size: patternSize,
                    density: patternDensity,
                    fgColor,
                    bgColor,
                    isTransparent
                });
            }

            const tileW = Math.max(1, rawTile.width);
            const tileH = Math.max(1, rawTile.height);

            const originX = (lassoFillTechnique === 'preset_tone' || lassoPatternType !== 'sample' ? 0 : (lassoSampleSrc ? lassoSampleSrc.x : 0)) + lassoPatternOffsetX;
            const originY = (lassoFillTechnique === 'preset_tone' || lassoPatternType !== 'sample' ? 0 : (lassoSampleSrc ? lassoSampleSrc.y : 0)) + lassoPatternOffsetY;

            let shiftX = (startX - originX) % tileW;
            if (shiftX < 0) shiftX += tileW;
            let shiftY = (startY - originY) % tileH;
            if (shiftY < 0) shiftY += tileH;

            // Direct Grid Tiling (Ghép ô) across the bounding box
            for (let py = -shiftY; py < cropH; py += tileH) {
                for (let px = -shiftX; px < cropW; px += tileW) {
                    pCtx.drawImage(rawTile, px, py);
                }
            }
        }

        // 2. Render Polygon Mask with Feathering
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = cropW;
        maskCanvas.height = cropH;
        const mCtx = maskCanvas.getContext('2d');
        if (!mCtx) return;

        if (feather > 0) {
            mCtx.filter = `blur(${feather}px)`;
        }

        mCtx.fillStyle = '#ffffff';
        mCtx.beginPath();
        mCtx.moveTo(points[0].x - startX, points[0].y - startY);
        for (let i = 1; i < points.length; i++) {
            mCtx.lineTo(points[i].x - startX, points[i].y - startY);
        }
        mCtx.closePath();
        mCtx.fill();

        // 3. Composite Pattern through Mask (chỉ hiển thị trong vùng lasso)
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = cropW;
        outputCanvas.height = cropH;
        const oCtx = outputCanvas.getContext('2d');
        if (!oCtx) return;

        oCtx.drawImage(patternCanvas, 0, 0);
        oCtx.globalCompositeOperation = 'destination-in';
        oCtx.drawImage(maskCanvas, 0, 0);

        // 4. Draw to Main Eraser Canvas
        ctx.save();
        ctx.globalAlpha = Math.max(0.05, Math.min(1.0, opacity));
        ctx.drawImage(outputCanvas, startX, startY);
        ctx.restore();

        await saveEraserDrawingToPage();
        requestOverlayRender();

        activeLassoPoints = null;
        lassoOriginalImageData = null;
        updateLassoButtons(false);

        showToast("✨ Đã lấp đầy vùng chọn Lasso bằng mảng vân thành công!", "success");
    } catch (err: any) {
        console.error("Lasso pattern fill error:", err);
        showToast(`Lỗi khi tô hoa văn: ${err.message}`, "error");
        await restorePageEraserDrawing(page);
        requestOverlayRender();
    }
}

export function pickLassoSamplePatch(): void {
    setEraserBrushMode('stamp');
    startTexturePatchSelection();
    showToast("🎯 Đã chuyển sang chế độ quét vân. Hãy quét một vùng trên tranh để lấy mẫu vân cho Lasso Pattern Fill!", "info");
}

export function minimizeEraserPanel(): void {
    const panel = document.getElementById('eraser-settings-panel');
    const trigger = document.getElementById('btn-eraser-floating-trigger');
    if (panel) panel.classList.add('hidden');
    if (trigger) trigger.classList.remove('hidden');
}

export function expandEraserPanel(): void {
    const panel = document.getElementById('eraser-settings-panel');
    const trigger = document.getElementById('btn-eraser-floating-trigger');
    if (panel) panel.classList.remove('hidden');
    if (trigger) trigger.classList.add('hidden');
}

