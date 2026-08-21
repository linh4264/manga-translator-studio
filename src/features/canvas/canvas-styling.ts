import { globalState, pushStateToHistory, savePageToDB, debounceSavePage, uiUpdateActiveBlockEditor, markPageAutoFitDirty, PRO_STYLE_PRESETS } from '../../core/state';
import { elements } from '../../core/elements';
import { showToast, setMultilineText, cleanMangaPunctuation } from '../../core/utils';
import { requestOverlayRender, balanceTextToDiamond, balanceSingleParagraphToBox } from './canvas-renderer';
import { updateFloatingToolbarPosition } from './canvas-interactions';
import { MangaBlock, MangaPage, BlockStyle } from '../../types/index';

let isCurrentlySliding = false;
export let copiedStyle: any = null;
export const FONT_SIZE_STEPS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

export function setCopiedStyle(val: any): void {
    copiedStyle = val;
}

export function isBlockAutoFit(block?: MangaBlock | null): boolean {
    if (!block) return globalState.autoFitEnabled;
    if (block.style && block.style.autoFit !== undefined) {
        return !!block.style.autoFit;
    }
    return globalState.autoFitEnabled;
}

export const DIAMOND_REFLOW_THRESHOLDS = {
    MIN_LINE_UTILIZATION: 0.55,       // Max line width < 55% of allowed width -> under-utilized
    MIN_WORD_COUNT: 4,               // Short text (1-3 words) never needs reflow
    MAX_ASPECT_LINE_DEVIATION: 1.5,  // Line count deviation based on box aspect
};

export function shouldReflowDiamond(
    block: MangaBlock,
    finalFontSize: number,
    maxAllowedWidth: number,
    maxAllowedHeight: number,
    targetWidth: number,
    targetHeight: number
): boolean {
    if (!block || !block.style?.diamondWrap || block.style?.vertical || block.type === 'sfx') {
        return false;
    }
    const text = (block.translated || '').trim();
    if (!text) return false;

    // Check word count - 1 to 3 words are short text tier, never reflow
    const words = text.replace(/\r\n/g, ' ').replace(/\n+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (words.length < DIAMOND_REFLOW_THRESHOLDS.MIN_WORD_COUNT) {
        return false;
    }

    const boxAspect = (targetWidth && targetHeight && targetHeight > 0) ? (targetWidth / targetHeight) : 0.85;

    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length <= 1) {
        if (words.length >= 4 && (boxAspect < 0.85 || finalFontSize < (block.style.baseFontSize || 16) * 0.85)) {
            return true;
        }
        return false;
    }

    // Measure line widths at finalFontSize
    const ruler = elements.autoFitRuler || (typeof document !== 'undefined' ? document.getElementById('auto-fit-ruler') : null);

    let maxLineWidth = 0;
    const lineWidths: number[] = [];

    const fontStyle = block.style.fontFamily || globalState.defaultFont || 'font-manga';
    const isBuiltInFont = ['font-sans', 'font-manga', 'font-comic', 'font-comicneue', 'font-impact', 'font-marker', 'font-bungee', 'font-caveat', 'font-tech', 'font-condensed', 'font-vietnamese'].includes(fontStyle);

    if (ruler) {
        const prevStyle = {
            fontSize: ruler.style.fontSize,
            fontFamily: ruler.style.fontFamily,
            fontWeight: ruler.style.fontWeight,
            fontStyle: ruler.style.fontStyle,
            letterSpacing: ruler.style.letterSpacing,
            className: ruler.className,
            whiteSpace: ruler.style.whiteSpace,
            display: ruler.style.display,
            width: ruler.style.width
        };

        if (isBuiltInFont) {
            ruler.className = fontStyle;
            ruler.style.fontFamily = '';
        } else {
            ruler.className = '';
            ruler.style.fontFamily = `'${fontStyle}', sans-serif`;
        }
        ruler.style.fontSize = `${finalFontSize}px`;
        ruler.style.fontWeight = block.style.bold ? 'bold' : 'normal';
        ruler.style.fontStyle = block.style.italic ? 'italic' : 'normal';
        ruler.style.letterSpacing = `${block.style.letterSpacing || 0}px`;
        ruler.style.whiteSpace = 'nowrap';
        ruler.style.display = 'inline-block';
        ruler.style.width = 'auto';

        for (const line of lines) {
            ruler.textContent = line;
            const w = ruler.scrollWidth || ruler.getBoundingClientRect().width;
            lineWidths.push(w);
            if (w > maxLineWidth) maxLineWidth = w;
        }

        // Restore ruler styles
        ruler.style.fontSize = prevStyle.fontSize;
        ruler.style.fontFamily = prevStyle.fontFamily;
        ruler.style.fontWeight = prevStyle.fontWeight;
        ruler.style.fontStyle = prevStyle.fontStyle;
        ruler.style.letterSpacing = prevStyle.letterSpacing;
        ruler.className = prevStyle.className;
        ruler.style.whiteSpace = prevStyle.whiteSpace;
        ruler.style.display = prevStyle.display;
        ruler.style.width = prevStyle.width;
    } else {
        // Fallback token/char measurement (e.g. headless unit tests)
        const letterSpacing = block.style.letterSpacing || 0;
        for (const line of lines) {
            const charCount = Array.from(line).length;
            const w = charCount * (finalFontSize * 0.55) + Math.max(0, charCount - 1) * letterSpacing;
            lineWidths.push(w);
            if (w > maxLineWidth) maxLineWidth = w;
        }
    }

    const maxLineUtilization = maxLineWidth / Math.max(1, maxAllowedWidth);
    const estHeight = lines.length * (finalFontSize * (block.style.lineHeight || 1.15));
    const heightUtilization = estHeight / Math.max(1, maxAllowedHeight);
    const textAspect = maxLineWidth / Math.max(1, estHeight);
    const baseFontSize = block.style.baseFontSize || 16;

    // 1. Width under-utilization: the widest line uses less than MIN_LINE_UTILIZATION (0.55) of available width
    if (maxLineUtilization < DIAMOND_REFLOW_THRESHOLDS.MIN_LINE_UTILIZATION) {
        return true;
    }

    // 2. Height under-utilization in tall boxes (aspect < 0.75) where text was squeezed into too few lines
    if (boxAspect < 0.75 && heightUtilization < 0.45 && words.length >= 4) {
        return true;
    }

    // 3. Severe font shrinkage while having plenty of vertical headroom
    if (finalFontSize < baseFontSize * 0.75 && heightUtilization < 0.55 && words.length >= 4) {
        return true;
    }

    // 4. Aspect ratio mismatch: wide text in tall box OR tall text in wide box
    if (boxAspect < 0.60 && textAspect > 1.15 && words.length >= 4) {
        return true;
    }
    if (boxAspect > 1.40 && textAspect < 0.65 && words.length >= 4) {
        return true;
    }

    return false;
}

export function autoFitBlock(
    block: MangaBlock,
    customImgElement: HTMLImageElement | null = null,
    _forceExportScale: number = 1,
    targetPage: MangaPage | null = null,
    allowDiamondReflow: boolean = true
): void {
    if (!block || !block.box || !block.style) return;
    if (!isBlockAutoFit(block)) return;

    if (!block.translated || block.translated.trim() === '') {
        block.style.fontSize = 12;
        return;
    }

    const page = targetPage || (globalState.activePageIndex !== -1 ? globalState.pages[globalState.activePageIndex] : null);
    const imgEl = customImgElement || elements.mangaBgImage;
    const zoomScale = (globalState.zoom || 100) / 100;

    let displayWidth = (page as any)?.lastDisplayWidth || 0;
    if (!displayWidth && imgEl && imgEl.clientWidth > 0) {
        displayWidth = imgEl.clientWidth / zoomScale;
        if (page) (page as any).lastDisplayWidth = displayWidth;
    }
    if (!displayWidth && elements.mangaCanvasContainer && elements.mangaCanvasContainer.clientWidth > 0) {
        displayWidth = elements.mangaCanvasContainer.clientWidth / zoomScale;
    }
    if (!displayWidth && elements.workspaceViewport && elements.workspaceViewport.clientWidth > 0) {
        displayWidth = Math.min((elements.workspaceViewport.clientWidth - 32) / zoomScale, 1000);
    }
    if (!displayWidth) {
        displayWidth = 800;
    }
    if (page && !(page as any).lastDisplayWidth) {
        (page as any).lastDisplayWidth = displayWidth;
    }

    const naturalW = (imgEl && imgEl.naturalWidth > 0) ? imgEl.naturalWidth : 800;
    const naturalH = (imgEl && imgEl.naturalHeight > 0) ? imgEl.naturalHeight : 1200;
    const aspect = naturalH / Math.max(1, naturalW);
    const displayHeight = displayWidth * aspect;

    const baseFontSize = block.style.baseFontSize || block.style.fontSize || 16;
    if (!block.style.baseFontSize) {
        block.style.baseFontSize = baseFontSize;
    }

    const fontStyle = block.style.fontFamily || globalState.defaultFont || 'font-manga';
    const isDiamondWrap = !!block.style.diamondWrap;
    const isVertical = !!block.style.vertical;
    const isBold = !!block.style.bold;
    const isItalic = !!block.style.italic;
    const isUnderline = !!block.style.underline;
    const maskShape = block.style.maskShape || 'bubble-fit';
    const strokeWidth = block.style.strokeWidth || 0;
    const strokeWidth2 = block.style.strokeWidth2 || 0;
    const lineHeight = block.style.lineHeight !== undefined ? block.style.lineHeight : 1.15;
    const letterSpacing = block.style.letterSpacing || 0;
    const textTransform = block.style.textTransform || 'none';
    const align = block.style.align || 'center';
    const arcAngle = block.style.arcAngle || 0;
    const skewX = block.style.skewX || 0;
    const skewY = block.style.skewY || 0;
    const warpWave = block.style.warpWave || 0;
    const warpBulge = block.style.warpBulge || 0;

    const quantWidth = Math.round(displayWidth / 2) * 2;
    const quantHeight = Math.round(displayHeight / 2) * 2;
    const cacheKey = `${block.translated}_${block.box.w}_${block.box.h}_${fontStyle}_${baseFontSize}_${isDiamondWrap}_${block.style.padding}_${strokeWidth}_${strokeWidth2}_${isVertical}_${isBold}_${isItalic}_${isUnderline}_${lineHeight}_${letterSpacing}_${textTransform}_${align}_${maskShape}_${arcAngle}_${skewX}_${skewY}_${warpWave}_${warpBulge}_${quantWidth}_${quantHeight}`;

    if (block.autoFitCache && block.autoFitCache.key === cacheKey) {
        block.style.fontSize = block.autoFitCache.fontSize;
        block.style.baseFontSize = block.autoFitCache.baseFontSize || baseFontSize;
        block.textWidth = block.autoFitCache.textWidth;
        block.textHeight = block.autoFitCache.textHeight;
        return;
    }

    const ruler = elements.autoFitRuler || document.getElementById('auto-fit-ruler');
    if (!ruler) {
        block.style.fontSize = 13;
        return;
    }

    const isBuiltInFont = ['font-sans', 'font-manga', 'font-comic', 'font-comicneue', 'font-impact', 'font-marker', 'font-bungee', 'font-caveat', 'font-tech', 'font-condensed', 'font-vietnamese'].includes(fontStyle);
    if (isBuiltInFont) {
        ruler.className = fontStyle;
        ruler.style.fontFamily = '';
    } else {
        ruler.className = '';
        ruler.style.fontFamily = `'${fontStyle}', sans-serif`;
    }

    if (typeof block.style.padding === 'string' && block.style.padding.includes('%')) {
        const parts = block.style.padding.trim().split(/\s+/);
        const pctY = parseFloat(parts[0]) || 9;
        const pctX = parseFloat(parts[1] || parts[0]) || 12;
        const padY = ((block.box.h / 100) * displayHeight) * (pctY / 100);
        const padX = ((block.box.w / 100) * displayWidth) * (pctX / 100);
        ruler.style.padding = `${padY}px ${padX}px`;
    } else if (typeof block.style.padding === 'number') {
        ruler.style.padding = `${block.style.padding}px`;
    } else {
        ruler.style.padding = '4px';
    }
    ruler.style.textAlign = align;
    ruler.style.letterSpacing = `${letterSpacing}px`;
    ruler.style.lineHeight = `${lineHeight}`;
    ruler.style.fontKerning = 'normal';
    ruler.style.whiteSpace = 'pre';
    ruler.style.wordBreak = 'keep-all';
    ruler.style.overflowWrap = 'normal';
    ruler.style.hyphens = 'none';
    ruler.style.boxSizing = 'border-box';

    if (isBold) {
        ruler.style.fontWeight = 'bold';
    } else {
        ruler.style.fontWeight = 'normal';
    }

    if (isItalic) {
        ruler.style.fontStyle = 'italic';
    } else {
        ruler.style.fontStyle = 'normal';
    }

    if (isUnderline) {
        ruler.style.textDecoration = 'underline';
    } else {
        ruler.style.textDecoration = 'none';
    }

    if (isVertical) {
        ruler.classList.add('text-vertical');
        ruler.style.writingMode = 'vertical-rl';
        ruler.style.textOrientation = 'upright';
    } else {
        ruler.classList.remove('text-vertical');
        ruler.style.writingMode = 'horizontal-tb';
        ruler.style.textOrientation = 'mixed';
    }

    const targetWidth = (block.box.w / 100) * displayWidth;
    const targetHeight = (block.box.h / 100) * displayHeight;

    const isEllipseShape = maskShape === 'ellipse' || maskShape === 'bubble-fit';
    const fitMargin = isEllipseShape ? 0.88 : 0.94;
    const totalExtraBorder = (strokeWidth + strokeWidth2) * 2;
    const maxAllowedWidth = Math.max(10, (targetWidth * fitMargin) - totalExtraBorder);
    const maxAllowedHeight = Math.max(10, (targetHeight * fitMargin) - totalExtraBorder);

    if (isVertical) {
        ruler.style.height = `${maxAllowedHeight}px`;
        ruler.style.maxHeight = `${maxAllowedHeight}px`;
        ruler.style.width = 'auto';
        ruler.style.maxWidth = `${maxAllowedWidth}px`;
    } else {
        ruler.style.width = `${maxAllowedWidth}px`;
        ruler.style.maxWidth = `${maxAllowedWidth}px`;
        ruler.style.height = 'auto';
        ruler.style.maxHeight = 'none';
    }

    const warpOpts = {
        arcAngle: arcAngle,
        skewX: skewX,
        skewY: skewY,
        warpWave: warpWave,
        warpBulge: warpBulge,
        textTransform: textTransform,
        letterSpacing: letterSpacing,
        underline: isUnderline
    };
    setMultilineText(ruler, block.translated, warpOpts);

    let minSize = 6;
    let maxSize = Math.min(80, Math.max(minSize, Math.floor(targetHeight * 0.9)));
    let optimalSize = minSize;

    while (minSize <= maxSize) {
        const mid = Math.floor((minSize + maxSize) / 2);
        ruler.style.fontSize = `${mid}px`;

        const contentWidth = ruler.scrollWidth;
        const contentHeight = ruler.scrollHeight;

        const fits = contentWidth <= maxAllowedWidth + 2 && contentHeight <= maxAllowedHeight + 2;

        if (fits) {
            optimalSize = mid;
            minSize = mid + 1;
        } else {
            maxSize = mid - 1;
        }
    }

    block.style.fontSize = optimalSize;

    // Coordination: Auto-reflow line breaks if layout is suboptimal or text is unbroken
    if (allowDiamondReflow && !isVertical && block.type !== 'sfx') {
        const needReflow = shouldReflowDiamond(block, optimalSize, maxAllowedWidth, maxAllowedHeight, targetWidth, targetHeight);
        if (needReflow) {
            const cleanText = block.translated.replace(/\r\n/g, ' ').replace(/\n+/g, ' ').trim();
            const reflowed = isDiamondWrap
                ? balanceTextToDiamond(cleanText, targetWidth, targetHeight, { ...block.style, fontSize: optimalSize, baseFontSize: optimalSize })
                : balanceSingleParagraphToBox(cleanText, targetWidth, targetHeight, { ...block.style, fontSize: optimalSize, baseFontSize: optimalSize });
            if (reflowed && reflowed !== block.translated) {
                block.translated = reflowed;
                block.autoFitCache = null;
                // Single final AutoFit pass (allowDiamondReflow = false to strictly prevent any loops)
                autoFitBlock(block, customImgElement, _forceExportScale, targetPage, false);
                return;
            }
        }
    }

    ruler.style.fontSize = `${optimalSize}px`;
    block.textWidth = ruler.scrollWidth;
    block.textHeight = ruler.scrollHeight;

    block.autoFitCache = {
        key: cacheKey,
        fontSize: optimalSize,
        baseFontSize: baseFontSize,
        textWidth: block.textWidth,
        textHeight: block.textHeight
    };
}

export function autoFitAllBlocksOnPage(page: MangaPage | null = null, customImgElement: HTMLImageElement | null = null, forceExportScale: number = 1): void {
    const targetPage = page || (globalState.activePageIndex !== -1 ? globalState.pages[globalState.activePageIndex] : null);
    if (!targetPage) return;
    targetPage.blocks.forEach(block => autoFitBlock(block, customImgElement, forceExportScale, targetPage));
}

export function toggleAutoFit(enabled: boolean): void {
    globalState.autoFitEnabled = !!enabled;
    if (elements.styleAutoFit) {
        elements.styleAutoFit.checked = globalState.autoFitEnabled;
    }
    if (globalState.activePageIndex !== -1) {
        const page = globalState.pages[globalState.activePageIndex];
        if (page) {
            page.blocks.forEach(b => {
                if (b.style) delete b.style.autoFit;
                b.autoFitCache = null;
            });
            markPageAutoFitDirty(page);
        }
    }
    requestOverlayRender();
    uiUpdateActiveBlockEditor();
}

export function toggleBlockAutoFit(enabled: boolean): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page ? page.blocks.find(b => b.id === globalState.selectedBlockId) : null;
    if (!block) return;

    pushStateToHistory();
    if (!block.style) block.style = {} as BlockStyle;
    block.style.autoFit = !!enabled;
    block.autoFitCache = null;

    if (enabled) {
        autoFitBlock(block);
    }

    markPageAutoFitDirty(page);
    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    savePageToDB(page);
}

export function autoMatchBlockStyle(block: MangaBlock, imgElement: HTMLImageElement): void {
    if (!block || !imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) return;

    if (!block.style) block.style = {} as BlockStyle;

    const W = imgElement.naturalWidth;
    const H = imgElement.naturalHeight;

    const cropX = Math.max(0, Math.round((block.box.x / 100) * W));
    const cropY = Math.max(0, Math.round((block.box.y / 100) * H));
    const cropW = Math.min(W - cropX, Math.round((block.box.w / 100) * W));
    const cropH = Math.min(H - cropY, Math.round((block.box.h / 100) * H));

    if (cropW <= 0 || cropH <= 0) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    tempCtx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const imgData = tempCtx.getImageData(0, 0, cropW, cropH);
    tempCanvas.width = 0;
    tempCanvas.height = 0;
    const data = imgData.data;

    let rimLumSum = 0, rimCount = 0;
    let centerLumSum = 0, centerCount = 0;

    const borderMarginX = Math.max(1, Math.floor(cropW * 0.15));
    const borderMarginY = Math.max(1, Math.floor(cropH * 0.15));

    for (let y = 0; y < cropH; y++) {
        for (let x = 0; x < cropW; x++) {
            const idx = (y * cropW + x) * 4;
            const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            const isRim = (x < borderMarginX || x >= cropW - borderMarginX || y < borderMarginY || y >= cropH - borderMarginY);
            if (isRim) {
                rimLumSum += lum;
                rimCount++;
            } else {
                centerLumSum += lum;
                centerCount++;
            }
        }
    }

    const avgRimLum = rimCount > 0 ? (rimLumSum / rimCount) : 255;
    const avgCenterLum = centerCount > 0 ? (centerLumSum / centerCount) : 128;

    if (!block.style.fontFamily) {
        block.style.fontFamily = globalState.defaultFont || 'font-manga';
    }
    block.style.align = 'center';

    if (avgRimLum < 140) {
        if (avgCenterLum > avgRimLum + 30) {
            block.style.textColor = '#ffffff';
            block.style.strokeColor = '#000000';
            block.style.strokeWidth = 2;
            block.style.shadowColor = '#000000';
            block.style.shadowBlur = 4;
            block.style.bgColor = '#ffffff';
            block.style.bgOpacity = 0;
        } else {
            block.style.textColor = '#000000';
            block.style.bgColor = '#ffffff';
            block.style.bgOpacity = 100;
            block.style.maskShape = 'bubble-fit';
        }
    } else {
        block.style.textColor = '#000000';
        block.style.bgColor = '#ffffff';
        block.style.bgOpacity = 100;
        block.style.maskShape = 'bubble-fit';
        block.style.strokeWidth = 0;
    }

    block.style.align = 'center';
    block.maskCache = null;
    block.autoFitCache = null;
}

export function autoMatchActiveBlockStyle(): void {
    if (globalState.activePageIndex === -1 || !globalState.selectedBlockId) {
        showToast("Vui lòng chọn một ô thoại để tự động khớp phong cách chữ.", "warn");
        return;
    }
    const page = globalState.pages[globalState.activePageIndex];
    const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
    const imgElement = elements.mangaBgImage;
    if (block && imgElement) {
        pushStateToHistory();
        autoMatchBlockStyle(block, imgElement);
        if (block.style?.diamondWrap && block.translated && !block.style?.vertical && block.type !== 'sfx') {
            const W = imgElement.naturalWidth || 800;
            const H = imgElement.naturalHeight || 1200;
            const pixelW = block.box ? (block.box.w / 100) * W : 200;
            const pixelH = block.box ? (block.box.h / 100) * H : 200;
            const cleanText = block.translated.replace(/\r\n/g, ' ').replace(/\n+/g, ' ').trim();
            block.translated = balanceTextToDiamond(cleanText, pixelW, pixelH, block.style);
            if (elements.editTranslatedText) {
                elements.editTranslatedText.value = block.translated;
            }
        }
        markPageAutoFitDirty(page);
        if (isBlockAutoFit(block)) {
            autoFitBlock(block, imgElement);
        }
        requestOverlayRender();
        uiUpdateActiveBlockEditor();
        savePageToDB(page);
        showToast("✨ Đã tự động khớp phông chữ và màu sắc cho ô thoại!", "success");
    }
}

export function applyStylePreset(presetKey: string): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        showToast("Vui lòng nhấp chọn một ô thoại trước khi áp dụng preset mẫu.", "warn");
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    if (!page) return;
    const targetIds = (globalState.selectedBlockIds && globalState.selectedBlockIds.length > 0 && globalState.selectedBlockIds.includes(globalState.selectedBlockId))
        ? globalState.selectedBlockIds
        : (globalState.selectedBlockId ? [globalState.selectedBlockId] : []);

    const targetBlocks = page.blocks.filter(b => targetIds.includes(b.id));
    if (targetBlocks.length === 0) return;

    pushStateToHistory();

    if (presetKey === 'transparent-stroke4' || presetKey === 'no-bg-stroke4' || presetKey === 'outline-4px' || presetKey === 'transparent_sfx') {
        targetBlocks.forEach(block => {
            if (!block.style) block.style = {} as BlockStyle;
            block.style.bgOpacity = 0;
            block.style.maskShape = 'none';
            block.style.strokeWidth = 4;
            if (!block.style.strokeColor) {
                const textCol = (block.style.textColor || '#000000').toLowerCase();
                block.style.strokeColor = (textCol === '#ffffff' || textCol === '#fff') ? '#000000' : '#ffffff';
            }
            block.maskCache = null;
            block.autoFitCache = null;
        });

        markPageAutoFitDirty(page);
        requestOverlayRender();
        uiUpdateActiveBlockEditor();
        updateFloatingToolbarPosition();
        savePageToDB(page);
        showToast("✨ Đã áp dụng: Nền 0% + Viền 4px", "success");
        return;
    }

    // 1. Kiểm tra trong danh sách Custom Presets của người dùng
    const customPreset = (globalState.customStylePresets || []).find(p => p.id === presetKey);
    if (customPreset && customPreset.style) {
        targetBlocks.forEach(block => {
            if (!block.style) block.style = {} as BlockStyle;
            Object.assign(block.style, JSON.parse(JSON.stringify(customPreset.style)));
            block.maskCache = null;
            block.autoFitCache = null;
        });

        markPageAutoFitDirty(page);
        requestOverlayRender();
        uiUpdateActiveBlockEditor();
        updateFloatingToolbarPosition();
        savePageToDB(page);

        showToast(`✨ Đã áp dụng mẫu "${customPreset.name}"`, "success");
        return;
    }

    const legacyMap: Record<string, string> = {
        'manga-std': 'dialogue',
        'shout-sfx': 'scream',
        'whisper-old': 'whisper'
    };

    const targetKey = legacyMap[presetKey] || presetKey;
    const targetPreset = PRO_STYLE_PRESETS[targetKey];

    if (!targetPreset) {
        showToast(`Không tìm thấy mẫu định dạng "${presetKey}"`, "warn");
        return;
    }

    targetBlocks.forEach(block => {
        if (!block.style) block.style = {} as BlockStyle;
        Object.assign(block.style, JSON.parse(JSON.stringify(targetPreset.style)));
        block.maskCache = null;
        block.autoFitCache = null;
    });

    markPageAutoFitDirty(page);
    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    updateFloatingToolbarPosition();
    savePageToDB(page);

    showToast(`💥 Đã áp dụng mẫu chữ "${targetPreset.name}"`, "success");
}

export function copyBlockStyle(): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        showToast("Vui lòng chọn một ô thoại để sao chép định dạng.", "warn");
        return;
    }
    const page = globalState.pages[globalState.activePageIndex];
    const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block) {
        copiedStyle = JSON.parse(JSON.stringify(block.style));
        if (elements.btnPasteStyle) elements.btnPasteStyle.disabled = false;
        showToast("Đã sao chép định dạng ô thoại!", "success");
    }
}

export function pasteBlockStyle(): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        showToast("Vui lòng chọn một ô thoại để dán định dạng.", "warn");
        return;
    }
    if (!copiedStyle) {
        showToast("Chưa có định dạng nào được sao chép.", "warn");
        return;
    }
    const page = globalState.pages[globalState.activePageIndex];
    const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block && page) {
        pushStateToHistory();
        block.style = JSON.parse(JSON.stringify(copiedStyle));
        block.maskCache = null;
        block.autoFitCache = null;
        markPageAutoFitDirty(page);
        requestOverlayRender();
        uiUpdateActiveBlockEditor();
        savePageToDB(page);
        showToast("Đã áp dụng định dạng ô thoại!", "success");
    }
}

export function syncActiveBlockStyle(property: string, value: any): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page) return;
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);

    if (block) {
        const targetBlocks = (globalState.selectedBlockIds && globalState.selectedBlockIds.length > 1)
            ? page.blocks.filter(b => globalState.selectedBlockIds.includes(b.id))
            : [block];

        if (property === 'fontSize') {
            targetBlocks.forEach(b => { if (b.style) b.style.autoFit = false; });
            if (elements.styleAutoFit) elements.styleAutoFit.checked = false;
        }

        const rangeProperties = [
            'fontSize', 'bgOpacity', 'padding', 'rotate', 'textRotate',
            'lineHeight', 'letterSpacing',
            'strokeWidth', 'strokeWidth2', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY',
            'arcAngle', 'skewX', 'skewY', 'warpWave', 'warpBulge'
        ];
        if (rangeProperties.includes(property)) {
            if (!isCurrentlySliding) {
                isCurrentlySliding = true;
                pushStateToHistory();
                const stopSlide = () => {
                    isCurrentlySliding = false;
                    uiUpdateActiveBlockEditor();
                    updateFloatingToolbarPosition();
                    window.removeEventListener('mouseup', stopSlide);
                    window.removeEventListener('touchend', stopSlide);
                };
                window.addEventListener('mouseup', stopSlide);
                window.addEventListener('touchend', stopSlide);
            }
        } else {
            pushStateToHistory();
        }

        targetBlocks.forEach(b => {
            if (!b.style) b.style = {} as BlockStyle;
            (b.style as any)[property] = value;
            if (property === 'fontSize') {
                b.style.baseFontSize = value;
            }
            b.maskCache = null;
            b.autoFitCache = null;

            if (['fontFamily', 'bold', 'italic', 'letterSpacing', 'diamondWrap'].includes(property)) {
                if (b.style?.diamondWrap && b.translated && !b.style?.vertical && b.type !== 'sfx') {
                    const cleanText = b.translated.replace(/\r\n/g, ' ').replace(/\n+/g, ' ').trim();
                    const imgEl = elements.mangaBgImage;
                    const W = imgEl?.naturalWidth || 800;
                    const H = imgEl?.naturalHeight || 1200;
                    const pixelW = (b.box.w / 100) * W;
                    const pixelH = (b.box.h / 100) * H;
                    b.translated = balanceTextToDiamond(cleanText, pixelW, pixelH, b.style);
                    if (elements.editTranslatedText && b.id === globalState.selectedBlockId) {
                        elements.editTranslatedText.value = b.translated;
                    }
                }
            }

            if (isBlockAutoFit(b)) {
                autoFitBlock(b);
            }
        });

        if (property === 'fontSize') {
            if (elements.lblFontSize) elements.lblFontSize.innerText = `${value}px`;
            if (elements.styleFontSize) elements.styleFontSize.value = value;
        } else if (property === 'bgOpacity') {
            if (elements.lblBgOpacity) elements.lblBgOpacity.innerText = `${value}%`;
        } else if (property === 'padding') {
            if (elements.lblPadding) elements.lblPadding.innerText = `${value}px`;
        } else if (property === 'rotate') {
            if (elements.lblRotate) elements.lblRotate.innerText = `${value}°`;
            if (elements.styleRotate) elements.styleRotate.value = value;
            const sfxRotateLbl = document.getElementById('lbl-sfx-rotate');
            if (sfxRotateLbl) sfxRotateLbl.textContent = `${value}°`;
        } else if (property === 'textRotate') {
            const lbl = document.getElementById('lbl-text-rotate');
            if (lbl) lbl.textContent = `${value}°`;
            const slider = document.getElementById('slider-text-rotate') as HTMLInputElement | null;
            if (slider) slider.value = value;
        } else if (property === 'lineHeight') {
            const lbl = document.getElementById('lbl-line-height');
            if (lbl) lbl.innerText = `${value}`;
        } else if (property === 'letterSpacing') {
            const lbl = document.getElementById('lbl-letter-spacing');
            if (lbl) lbl.innerText = `${value}px`;
        } else if (property === 'strokeWidth') {
            if (elements.lblStrokeWidth) elements.lblStrokeWidth.innerText = `${value}px`;
            if (elements.styleStrokeWidth) elements.styleStrokeWidth.value = value;
        } else if (property === 'strokeWidth2') {
            const lbl = document.getElementById('lbl-stroke-width2');
            if (lbl) lbl.innerText = `${value}px`;
        } else if (property === 'shadowBlur') {
            if (elements.lblShadowBlur) elements.lblShadowBlur.innerText = `${value}px`;
            if (elements.styleShadowBlur) elements.styleShadowBlur.value = value;
        } else if (property === 'shadowOffsetX') {
            const lbl = document.getElementById('lbl-shadow-offset-x');
            if (lbl) lbl.innerText = `${value}px`;
        } else if (property === 'shadowOffsetY') {
            const lbl = document.getElementById('lbl-shadow-offset-y');
            if (lbl) lbl.innerText = `${value}px`;
        }

        block.maskCache = null;
        block.autoFitCache = null;
        markPageAutoFitDirty(page);
        requestOverlayRender();
        if (!isCurrentlySliding) {
            uiUpdateActiveBlockEditor();
            updateFloatingToolbarPosition();
        }
        debounceSavePage(page);
    }
}

export function syncActiveBlockTranslation(val: string): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page) return;
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block) {
        block.translated = val;
        markPageAutoFitDirty(page);

        const autoFitActive = isBlockAutoFit(block);
        if (autoFitActive) {
            block.autoFitCache = null;
            autoFitBlock(block);
        }

        const overlayElem = document.getElementById(block.id);
        if (overlayElem) {
            const textContainer = overlayElem.querySelector('div > div') as HTMLElement | null;
            if (textContainer) {
                setMultilineText(textContainer, val);
            }
            if (autoFitActive) {
                const maskElem = overlayElem.firstElementChild as HTMLElement | null;
                const zoomScale = (globalState.zoom || 100) / 100;
                if (maskElem) {
                    maskElem.style.fontSize = `${(block.style.fontSize || 13) * zoomScale}px`;
                }
                const isAutoFit = isBlockAutoFit(block);
                if (elements.lblFontSize) elements.lblFontSize.innerText = `${block.style.fontSize}px${isAutoFit ? ' (Auto)' : ''}`;
                if (elements.styleFontSize) elements.styleFontSize.value = String(block.style.fontSize || 13);
            }
        }

        if (globalState.viewMode === 'split') {
            const cloneOverlay = document.getElementById(`mirror-${block.id}`);
            if (cloneOverlay) {
                const cloneTextContainer = cloneOverlay.querySelector('div > div') as HTMLElement | null;
                if (cloneTextContainer) setMultilineText(cloneTextContainer, val);
                if (autoFitActive) {
                    const cloneMask = cloneOverlay.firstElementChild as HTMLElement | null;
                    if (cloneMask) {
                        cloneMask.style.fontSize = `${block.style.fontSize}px`;
                    }
                }
            }
        }
        debounceSavePage(page);
    }
}

export function toggleActiveBlockOrientation(): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    const nextVertical = !block.style.vertical;
    syncActiveBlockStyle('vertical', nextVertical);
}

export function normalizeAllBlocksToHorizontal(): void {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks || page.blocks.length === 0) return;

    let count = 0;
    page.blocks.forEach(b => {
        if (b.style && b.style.vertical) {
            b.style.vertical = false;
            count++;
        }
    });

    if (count > 0) {
        markPageAutoFitDirty(page);
        pushStateToHistory();
        import('../../ui/pages-ui').then(m => m.selectPage(globalState.activePageIndex));
        showToast(`✅ Đã chuyển ${count} ô thoại thành chữ viết Ngang!`, "success");
    }
}

export function updateTextRotate(val: string | number): void {
    const angle = typeof val === 'number' ? val : parseInt(val, 10) || 0;
    const lbl = document.getElementById('lbl-text-rotate');
    if (lbl) lbl.textContent = `${angle}°`;
    syncActiveBlockStyle('textRotate', angle);
}

export function updateSfxRotate(val: string | number): void {
    const angle = typeof val === 'number' ? val : parseInt(val, 10) || 0;
    const lbl = document.getElementById('lbl-sfx-rotate');
    if (lbl) lbl.textContent = `${angle}°`;
    syncActiveBlockStyle('rotate', angle);
}

export function updateSfxArc(val: string | number): void {
    const arc = typeof val === 'number' ? val : parseInt(val, 10) || 0;
    const lbl = document.getElementById('lbl-sfx-arc');
    if (lbl) lbl.textContent = `${arc}°`;
    syncActiveBlockStyle('arcAngle', arc);
}

export function updateSfxSkewX(val: string | number): void {
    const skew = typeof val === 'number' ? val : parseInt(val, 10) || 0;
    const lbl = document.getElementById('lbl-sfx-skew-x');
    if (lbl) lbl.textContent = `${skew}°`;
    syncActiveBlockStyle('skewX', skew);
}

export function updateSfxSkewY(val: string | number): void {
    const skew = typeof val === 'number' ? val : parseInt(val, 10) || 0;
    const lbl = document.getElementById('lbl-sfx-skew-y');
    if (lbl) lbl.textContent = `${skew}°`;
    syncActiveBlockStyle('skewY', skew);
}

export function updateSfxWave(val: string | number): void {
    const wave = typeof val === 'number' ? val : parseInt(val, 10) || 0;
    const lbl = document.getElementById('lbl-sfx-wave');
    if (lbl) lbl.textContent = `${wave}`;
    syncActiveBlockStyle('warpWave', wave);
}

export function updateSfxBulge(val: string | number): void {
    const bulge = typeof val === 'number' ? val : parseInt(val, 10) || 0;
    const lbl = document.getElementById('lbl-sfx-bulge');
    if (lbl) lbl.textContent = `${bulge}`;
    syncActiveBlockStyle('warpBulge', bulge);
}

export function resetWarpTransformControls(): void {
    updateTextRotate(0);
    updateSfxRotate(0);
    updateSfxArc(0);
    updateSfxSkewX(0);
    updateSfxSkewY(0);
    updateSfxWave(0);
    updateSfxBulge(0);

    const trSlider = document.getElementById('slider-text-rotate') as HTMLInputElement | null;
    const rSlider = (document.getElementById('slider-sfx-rotate') || document.getElementById('style-rotate')) as HTMLInputElement | null;
    const aSlider = document.getElementById('slider-sfx-arc') as HTMLInputElement | null;
    const sxSlider = document.getElementById('slider-sfx-skew-x') as HTMLInputElement | null;
    const sySlider = document.getElementById('slider-sfx-skew-y') as HTMLInputElement | null;
    const wSlider = document.getElementById('slider-sfx-wave') as HTMLInputElement | null;
    const bSlider = document.getElementById('slider-sfx-bulge') as HTMLInputElement | null;

    if (trSlider) trSlider.value = '0';
    if (rSlider) rSlider.value = '0';
    if (aSlider) aSlider.value = '0';
    if (sxSlider) sxSlider.value = '0';
    if (sySlider) sySlider.value = '0';
    if (wSlider) wSlider.value = '0';
    if (bSlider) bSlider.value = '0';
}

export function toggleActiveBlockBold(): void {
    const activePage = globalState.pages[globalState.activePageIndex];
    if (!activePage || !globalState.selectedBlockId) return;
    const block = activePage.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;
    const newBold = !block.style.bold;
    syncActiveBlockStyle('bold', newBold);
}

export function alignActiveBlockPosition(mode: string): void {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks || page.blocks.length === 0) return;

    const selectedIds = globalState.selectedBlockIds && globalState.selectedBlockIds.length > 0
        ? globalState.selectedBlockIds
        : (globalState.selectedBlockId ? [globalState.selectedBlockId] : []);

    const targetBlocks = page.blocks.filter(b => selectedIds.includes(b.id));
    if (targetBlocks.length === 0) return;

    pushStateToHistory();

    const round1 = (val: number) => Math.round(val * 10) / 10;

    if (targetBlocks.length === 1) {
        const block = targetBlocks[0];
        if (mode === 'left') {
            block.box.x = 0;
        } else if (mode === 'center-h') {
            block.box.x = Math.max(0, round1((100 - block.box.w) / 2));
        } else if (mode === 'right') {
            block.box.x = Math.max(0, round1(100 - block.box.w));
        } else if (mode === 'top') {
            block.box.y = 0;
        } else if (mode === 'center-v') {
            block.box.y = Math.max(0, round1((100 - block.box.h) / 2));
        } else if (mode === 'bottom') {
            block.box.y = Math.max(0, round1(100 - block.box.h));
        }
        block.maskCache = null;
        block.autoFitCache = null;
    } else {
        const minX = Math.min(...targetBlocks.map(b => b.box.x));
        const maxX = Math.max(...targetBlocks.map(b => b.box.x + b.box.w));
        const minY = Math.min(...targetBlocks.map(b => b.box.y));
        const maxY = Math.max(...targetBlocks.map(b => b.box.y + b.box.h));
        const groupCenterX = minX + (maxX - minX) / 2;
        const groupCenterY = minY + (maxY - minY) / 2;

        targetBlocks.forEach(block => {
            if (mode === 'left') {
                block.box.x = minX;
            } else if (mode === 'center-h') {
                block.box.x = Math.max(0, round1(groupCenterX - block.box.w / 2));
            } else if (mode === 'right') {
                block.box.x = Math.max(0, round1(maxX - block.box.w));
            } else if (mode === 'top') {
                block.box.y = minY;
            } else if (mode === 'center-v') {
                block.box.y = Math.max(0, round1(groupCenterY - block.box.h / 2));
            } else if (mode === 'bottom') {
                block.box.y = Math.max(0, round1(maxY - block.box.h));
            }
            block.maskCache = null;
            block.autoFitCache = null;
        });
    }

    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    updateFloatingToolbarPosition();
    savePageToDB(page);
}

export function resetSfxAngleControls(): void {
    resetWarpTransformControls();
}

export function toggleActiveBlockItalic(): void {
    const activePage = globalState.pages[globalState.activePageIndex];
    if (!activePage || !globalState.selectedBlockId) return;
    const block = activePage.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;
    const newItalic = !block.style.italic;
    syncActiveBlockStyle('italic', newItalic);
}

export function toggleActiveBlockUnderline(): void {
    const activePage = globalState.pages[globalState.activePageIndex];
    if (!activePage || !globalState.selectedBlockId) return;
    const block = activePage.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;
    const newUnderline = !block.style.underline;
    syncActiveBlockStyle('underline', newUnderline);
}

export function setActiveBlockTextTransform(transformMode: string): void {
    const activePage = globalState.pages[globalState.activePageIndex];
    if (!activePage || !globalState.selectedBlockId) return;
    const block = activePage.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;
    syncActiveBlockStyle('textTransform', transformMode);
}

export function updateLineHeight(val: string | number): void {
    const num = typeof val === 'number' ? val : parseFloat(val) || 1.18;
    syncActiveBlockStyle('lineHeight', num);
}

export function updateLetterSpacing(val: string | number): void {
    const num = typeof val === 'number' ? val : parseFloat(val) || 0;
    syncActiveBlockStyle('letterSpacing', num);
}

export function updateStrokeWidth2(val: string | number): void {
    const num = typeof val === 'number' ? val : parseFloat(val) || 0;
    syncActiveBlockStyle('strokeWidth2', num);
}

export function syncStrokeColor2Hex(val: string): void {
    let color = val;
    if (color && !color.startsWith('#') && color.length <= 6) {
        color = '#' + color;
    }
    const picker = document.getElementById('style-stroke-color2') as HTMLInputElement | null;
    const hexInput = document.getElementById('style-stroke-color2-hex') as HTMLInputElement | null;
    if (picker) picker.value = color;
    if (hexInput) hexInput.value = color.toUpperCase();
    syncActiveBlockStyle('strokeColor2', color);
}

export function updateShadowOffsetX(val: string | number): void {
    const num = typeof val === 'number' ? val : parseInt(val, 10) || 0;
    syncActiveBlockStyle('shadowOffsetX', num);
}

export function updateShadowOffsetY(val: string | number): void {
    const num = typeof val === 'number' ? val : parseInt(val, 10) || 0;
    syncActiveBlockStyle('shadowOffsetY', num);
}

export function cleanActiveBlockPunctuation(): void {
    if (globalState.activePageIndex === -1 || !globalState.selectedBlockId) {
        showToast("Vui lòng chọn ô thoại để dọn dẹp dấu câu.", "warn");
        return;
    }
    const page = globalState.pages[globalState.activePageIndex];
    const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block || !block.translated) return;

    pushStateToHistory();
    const cleaned = cleanMangaPunctuation(block.translated);
    if (cleaned !== block.translated) {
        block.translated = cleaned;
        if (elements.editTranslatedText) elements.editTranslatedText.value = cleaned;
        syncActiveBlockTranslation(cleaned);
        requestOverlayRender();
        savePageToDB(page);
        showToast("✨ Đã chuẩn hóa dấu câu Manga thành công!", "success");
    } else {
        showToast("Dấu câu đã chuẩn định dạng Manga.", "info");
    }
}

export function cleanAllBlocksPunctuation(): void {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks || page.blocks.length === 0) return;

    pushStateToHistory();
    let count = 0;
    page.blocks.forEach(b => {
        if (b.translated) {
            const cleaned = cleanMangaPunctuation(b.translated);
            if (cleaned !== b.translated) {
                b.translated = cleaned;
                b.autoFitCache = null;
                count++;
            }
        }
    });

    if (count > 0) {
        markPageAutoFitDirty(page);
        requestOverlayRender();
        uiUpdateActiveBlockEditor();
        savePageToDB(page);
        showToast(`✨ Đã chuẩn hóa dấu câu cho ${count} ô thoại trên trang này!`, "success");
    } else {
        showToast("Tất cả dấu câu trên trang đã chuẩn Manga.", "info");
    }
}

export function applyCurrentStyleToPage(): void {
    if (globalState.activePageIndex === -1 || !globalState.selectedBlockId) {
        showToast("Vui lòng chọn ô thoại mẫu trước khi áp dụng toàn trang.", "warn");
        return;
    }
    const page = globalState.pages[globalState.activePageIndex];
    const sourceBlock = page?.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!sourceBlock || !sourceBlock.style || !page) return;

    pushStateToHistory();
    const styleCopy = JSON.parse(JSON.stringify(sourceBlock.style));
    let count = 0;

    page.blocks.forEach(b => {
        if (b.id !== sourceBlock.id && b.type !== 'image') {
            b.style = JSON.parse(JSON.stringify(styleCopy));
            b.autoFitCache = null;
            b.maskCache = null;
            count++;
        }
    });

    markPageAutoFitDirty(page);
    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    savePageToDB(page);
    showToast(`🎨 Đã đồng bộ style cho ${count} ô thoại trên trang!`, "success");
}

export function applyCurrentStyleToAllPages(): void {
    if (globalState.activePageIndex === -1 || !globalState.selectedBlockId) {
        showToast("Vui lòng chọn ô thoại mẫu trước khi áp dụng toàn bộ chương.", "warn");
        return;
    }
    const page = globalState.pages[globalState.activePageIndex];
    const sourceBlock = page?.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!sourceBlock || !sourceBlock.style || !page) return;

    if (!confirm("Bạn có chắc chắn muốn áp dụng định dạng của ô thoại này cho TOÀN BỘ các ô thoại trong TẤT CẢ các trang?")) {
        return;
    }

    pushStateToHistory();
    const styleCopy = JSON.parse(JSON.stringify(sourceBlock.style));
    let totalCount = 0;

    globalState.pages.forEach(p => {
        (p.blocks || []).forEach(b => {
            if (b.type !== 'image') {
                b.style = JSON.parse(JSON.stringify(styleCopy));
                b.autoFitCache = null;
                b.maskCache = null;
                totalCount++;
            }
        });
        savePageToDB(p);
    });

    markPageAutoFitDirty(page);
    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    showToast(`⚡ Đã đồng bộ style cho ${totalCount} ô thoại trên toàn bộ chương!`, "success");
}

export function toggleSelectedBlocksOrientation(): void {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks) return;

    const targetIds = (globalState.selectedBlockIds && globalState.selectedBlockIds.length > 0)
        ? globalState.selectedBlockIds
        : (globalState.selectedBlockId ? [globalState.selectedBlockId] : []);

    if (targetIds.length === 0) return;

    pushStateToHistory();

    const targetBlocks = page.blocks.filter(b => targetIds.includes(b.id));
    const firstVertical = targetBlocks[0]?.style?.vertical || false;
    const newVertical = !firstVertical;

    targetBlocks.forEach(b => {
        if (!b.style) b.style = {} as BlockStyle;
        b.style.vertical = newVertical;
        b.maskCache = null;
        b.autoFitCache = null;
        if (isBlockAutoFit(b)) {
            autoFitBlock(b);
        }
    });

    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    updateFloatingToolbarPosition();
    savePageToDB(page);

    showToast(`🔠 Đã chuyển ${targetBlocks.length} ô sang kiểu chữ ${newVertical ? 'Dọc' : 'Ngang'}!`, 'success');
}

export function batchDiamondBalanceSelectedBlocks(): void {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks) return;

    const targetIds = (globalState.selectedBlockIds && globalState.selectedBlockIds.length > 0)
        ? globalState.selectedBlockIds
        : (globalState.selectedBlockId ? [globalState.selectedBlockId] : []);

    if (targetIds.length === 0) return;

    pushStateToHistory();
    import('./canvas-renderer').then(r => {
        targetIds.forEach(id => {
            const block = page.blocks.find(b => b.id === id);
            if (block && block.type !== 'image') {
                r.balanceBlockDiamond?.(block);
            }
        });
        requestOverlayRender();
        uiUpdateActiveBlockEditor();
        savePageToDB(page);
        showToast(`💎 Đã cân đối Diamond cho ${targetIds.length} ô thoại!`, 'success');
    });
}

