/**
 * Manga Translator Studio - Inpainting: AI & Smart Background Inpainting Service
 * Manages bubble mask computation, text removal, PatchMatch restoration, and Telea fallbacks.
 */
import { globalState, pushStateToHistory, uiUpdateActiveBlockEditor } from '../../core/state';
import { elements } from '../../core/elements';
import { showToast } from '../../core/utils';
import { MangaBlock, MangaPage } from '../../types/index';
import { computeBubbleMask } from '../ocr/ocr-service';
import { requestOverlayRender } from '../canvas/canvas-renderer';
import { runPatchMatchPipeline } from '../patchmatch/patchmatch.worker';
import { saveEraserDrawingToPage } from './eraser-tool';

export function cleanMangaBackgroundArtWithMask(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    maskBytes: Uint8Array
): void {
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

export async function cleanMangaBackgroundArtText(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
): Promise<void> {
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
        const { patchMatchInpaintImageData } = await import('../patchmatch/index');
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
