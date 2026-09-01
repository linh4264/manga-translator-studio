/**
 * Manga Translator Studio - Inpainting: Lasso Tool & Content-Aware Texture Fill
 * Manages polygonal lasso contouring, pattern sampling, and content-aware inpainting.
 */
import { globalState, pushStateToHistory } from '../../core/state';
import { elements } from '../../core/elements';
import { showToast } from '../../core/utils';
import { requestOverlayRender } from '../canvas/canvas-renderer';
import {
    LassoPatternType,
    LassoFillTechnique,
    lassoPatternOffsetX,
    lassoPatternOffsetY,
    lassoCrossfadeOverlap,
    lassoPatternSize,
    lassoPatternDensity,
    lassoPatternFgColor,
    lassoPatternBgColor,
    lassoPatternTransparentBg,
    lassoPatternOpacity,
    lassoPatternFeather,
    setLassoPatternOffsetX,
    setLassoPatternOffsetY,
    nudgeLassoPatternOffset,
    resetLassoPatternOffset,
    updateLassoNudgeUI,
    makeSeamlessTile,
    findBestAdjacentPatch,
    createMangaPatternTile
} from './pattern-generator';
import {
    isPatchStampActive,
    patchCanvas,
    setEraserBrushMode,
    startTexturePatchSelection,
    initEraserDrawingEvents,
    saveEraserDrawingToPage,
    restorePageEraserDrawing
} from './eraser-tool';
import { cleanMangaBackgroundArtWithMask } from './ai-inpaint-service';

export let activeLassoPoints: { x: number; y: number }[] | null = null;
export let lassoOriginalImageData: ImageData | null = null;
export let isSelectingLassoSample = false;
export let lassoSampleCanvas: HTMLCanvasElement | null = null;
export let lassoSampleSrc: { x: number; y: number; w: number; h: number } | null = null;
export let lassoActiveTab: 'ai' | 'pattern' = 'ai';
export let lassoFillTechnique: LassoFillTechnique = 'grid_tile';
export let lassoPatternType: LassoPatternType = 'sample';

export function getActiveLassoPoints(): { x: number; y: number }[] | null {
    return activeLassoPoints;
}

export function setActiveLassoPoints(points: { x: number; y: number }[] | null): void {
    activeLassoPoints = points;
}

export function getLassoOriginalImageData(): ImageData | null {
    return lassoOriginalImageData;
}

export function setLassoOriginalImageData(data: ImageData | null): void {
    lassoOriginalImageData = data;
}

export function getIsSelectingLassoSample(): boolean {
    return isSelectingLassoSample;
}

export function setIsSelectingLassoSample(val: boolean): void {
    isSelectingLassoSample = val;
}

export function getLassoSampleCanvas(): HTMLCanvasElement | null {
    return lassoSampleCanvas;
}

export function setLassoSampleCanvas(canvas: HTMLCanvasElement | null): void {
    lassoSampleCanvas = canvas;
}

export function getLassoSampleSrc(): { x: number; y: number; w: number; h: number } | null {
    return lassoSampleSrc;
}

export function setLassoSampleSrc(src: { x: number; y: number; w: number; h: number } | null): void {
    lassoSampleSrc = src;
}

export function updateLassoButtons(hasPoints: boolean): void {
    if (typeof document === 'undefined') return;
    const fillBtn = document.getElementById('btn-lasso-fill') as HTMLButtonElement | null;
    if (fillBtn) fillBtn.disabled = !hasPoints;
    const patternBtn = document.getElementById('btn-lasso-pattern-fill') as HTMLButtonElement | null;
    if (patternBtn) patternBtn.disabled = !hasPoints;
}

export function updateLassoSampleUI(w: number, h: number, sampleCanvas: HTMLCanvasElement | null): void {
    if (typeof document === 'undefined') return;
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

export function setLassoFillTechnique(tech: LassoFillTechnique): void {
    lassoFillTechnique = tech;
    if (typeof document === 'undefined') return;

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

export function setLassoFillTab(tab: 'ai' | 'pattern'): void {
    lassoActiveTab = tab;
    if (typeof document === 'undefined') return;

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
    if (typeof document === 'undefined') return;

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

export function pickLassoRectSample(): void {
    isSelectingLassoSample = true;
    showToast("⛶ Kéo chuột để quét chọn một hình chữ nhật mẫu vân trên tranh!", "info");
    initEraserDrawingEvents();
}

export function pickLassoSamplePatch(): void {
    setEraserBrushMode('stamp');
    startTexturePatchSelection();
    showToast("🎯 Đã chuyển sang chế độ quét vân. Hãy quét một vùng trên tranh để lấy mẫu vân cho Lasso Pattern Fill!", "info");
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

    setLassoPatternType('sample');
    updateLassoSampleUI(sampleSize, sampleSize, tempCanvas);
    showToast(`⚡ Đã tự động lấy mẫu vân ${sampleSize}x${sampleSize}px từ vùng lân cận!`, "success");
    return true;
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

            for (let py = -shiftY; py < cropH; py += tileH) {
                for (let px = -shiftX; px < cropW; px += tileW) {
                    pCtx.drawImage(rawTile, px, py);
                }
            }
        }

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

        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = cropW;
        outputCanvas.height = cropH;
        const oCtx = outputCanvas.getContext('2d');
        if (!oCtx) return;

        oCtx.drawImage(patternCanvas, 0, 0);
        oCtx.globalCompositeOperation = 'destination-in';
        oCtx.drawImage(maskCanvas, 0, 0);

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
        const { uiUpdateProcessingOverlay: updateOverlay } = await import('../../core/state');
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
            const { patchMatchInpaintImageData } = await import('../patchmatch/index');
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
                        import('../../core/state').then(st => {
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
            const { uiUpdateProcessingOverlay: updateOverlay } = await import('../../core/state');
            updateOverlay(false);
        }
    }
}
