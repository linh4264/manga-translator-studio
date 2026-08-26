import { globalState, pushStateToHistory, savePageToDB, uiUpdateActiveBlockEditor, uiSetRightTab } from '../../core/state';
import { elements } from '../../core/elements';
import { showToast, setMultilineText, stripRichTextTags, parseRichTextLines, extractDomRenderedLines } from '../../core/utils';
import { computeBubbleMask } from '../ocr/ocr-service';
import { autoFitAllBlocksOnPage, autoFitBlock, isBlockAutoFit } from './canvas-styling';
import { startBlockDrag, startBlockResize } from './canvas-interactions';
import { MangaBlock, MangaPage } from '../../types/index';
export { getReferenceDisplayDimensions } from './canvas-exporter';
import { getReferenceDisplayDimensions } from './canvas-exporter';
export {
    computeTextLayout,
    computeBlockTextLayout,
    renderDerivedLinesToDOM,
    renderBlockTextToDOM,
    getFontFamilyName,
    buildFontString,
    BUILTIN_FONT_MAP,
    wrapParagraphCanva
} from './text-layout-engine';
export type {
    TextLayoutInput,
    TextLayoutResult,
    LayoutLine,
    LayoutLineRect
} from './text-layout-engine';
import { renderBlockTextToDOM, computeBlockTextLayout, getFontFamilyName } from './text-layout-engine';


export let overlayRenderRafId: any = null;

export function requestOverlayRender(): void {
    if (overlayRenderRafId) return;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: any) => setTimeout(cb, 0);
    overlayRenderRafId = raf(() => {
        overlayRenderRafId = null;
        renderOverlays();
    });
}

export function updateActiveSelectionUI(): void {
    const container = elements.mangaOverlaysContainer;
    if (!container) return;
    const textsLayer = container.querySelector('.manga-texts-layer');
    if (!textsLayer) return;

    const selectedId = globalState.selectedBlockId;
    const multiSelectedIds = globalState.selectedBlockIds || [];

    Array.from(textsLayer.children).forEach((child: any) => {
        if (!child.id || child.id.startsWith('mirror-')) return;
        const isSelected = child.id === selectedId || multiSelectedIds.includes(child.id);
        if (isSelected) {
            child.classList.add('active');
        } else {
            child.classList.remove('active');
        }
    });
}

export function renderOverlays(
    targetContainer: HTMLElement | null = null,
    customPage: MangaPage | null = null,
    customImgElement: HTMLImageElement | null = null,
    forceExportScale: number = 1
): void {
    const isMirror = targetContainer !== null;
    const container = targetContainer || elements.mangaOverlaysContainer;
    if (!container) return;

    const page = customPage || (globalState.activePageIndex !== -1 ? globalState.pages[globalState.activePageIndex] : null);
    if (!page) {
        const existingCovers = (Array.from(container.children).find((c: any) => c.classList && c.classList.contains('manga-covers-layer')) ||
            container.querySelector('.manga-covers-layer')) as HTMLElement | null;
        const existingTexts = (Array.from(container.children).find((c: any) => c.classList && c.classList.contains('manga-texts-layer')) ||
            container.querySelector('.manga-texts-layer')) as HTMLElement | null;
        if (existingCovers) existingCovers.replaceChildren();
        if (existingTexts) existingTexts.replaceChildren();
        if (!existingCovers && !existingTexts) container.replaceChildren();
        return;
    }

    let coversLayer = (Array.from(container.children).find((c: any) => c.classList && c.classList.contains('manga-covers-layer')) ||
        container.querySelector('.manga-covers-layer')) as HTMLElement | null;
    let textsLayer = (Array.from(container.children).find((c: any) => c.classList && c.classList.contains('manga-texts-layer')) ||
        container.querySelector('.manga-texts-layer')) as HTMLElement | null;

    if (!coversLayer || !textsLayer) {
        container.replaceChildren();
        coversLayer = document.createElement('div');
        coversLayer.className = 'manga-covers-layer absolute inset-0 pointer-events-none z-10';
        coversLayer.setAttribute('data-darkreader-ignore', 'true');
        coversLayer.style.position = 'absolute';
        coversLayer.style.top = '0';
        coversLayer.style.left = '0';
        coversLayer.style.width = '100%';
        coversLayer.style.height = '100%';
        coversLayer.style.zIndex = '1';
        coversLayer.style.pointerEvents = 'none';

        textsLayer = document.createElement('div');
        textsLayer.className = 'manga-texts-layer absolute inset-0 z-20';
        textsLayer.setAttribute('data-darkreader-ignore', 'true');
        textsLayer.style.position = 'absolute';
        textsLayer.style.top = '0';
        textsLayer.style.left = '0';
        textsLayer.style.width = '100%';
        textsLayer.style.height = '100%';
        textsLayer.style.zIndex = '2';

        container.appendChild(coversLayer);
        container.appendChild(textsLayer);
    }

    if (globalState.viewMode === 'original' && !isMirror) {
        coversLayer.style.display = 'none';
        textsLayer.style.display = 'none';
        return;
    } else {
        coversLayer.style.display = '';
        textsLayer.style.display = '';
    }

    const imgElement = customImgElement || elements.mangaBgImage;
    if (imgElement && imgElement.clientWidth > 0) {
        const zoomScale = (globalState.zoom || 100) / 100;
        const normalizedWidth = Math.round(imgElement.clientWidth / Math.max(0.01, zoomScale));
        (page as any).lastDisplayWidth = normalizedWidth;
    }

    if (globalState.autoFitEnabled && !isMirror) {
        autoFitAllBlocksOnPage(page, customImgElement, forceExportScale);
    }

    let activeImageData = page.imageDataCache || null;
    const hasBubbleFit = page.blocks.some(block => (block.style?.maskShape || 'bubble-fit') === 'bubble-fit');

    if (hasBubbleFit && !activeImageData && imgElement && imgElement.naturalWidth > 0 && imgElement.naturalHeight > 0) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = imgElement.naturalWidth;
            canvas.height = imgElement.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(imgElement, 0, 0);
                activeImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                page.imageDataCache = activeImageData;
            }
            canvas.width = 0;
            canvas.height = 0;
        } catch (e) {
            console.error("Không thể lấy dữ liệu ảnh để khớp bong bóng:", e);
        }
    }

    const activeCoverIds = new Set<string>();
    const activeBubbleIds = new Set<string>();

    const existingCoversMap = new Map<string, HTMLElement>();
    if (coversLayer) {
        for (let i = 0; i < coversLayer.children.length; i++) {
            const el = coversLayer.children[i] as HTMLElement;
            if (el.id) existingCoversMap.set(el.id, el);
        }
    }
    const existingTextsMap = new Map<string, HTMLElement>();
    if (textsLayer) {
        for (let i = 0; i < textsLayer.children.length; i++) {
            const el = textsLayer.children[i] as HTMLElement;
            if (el.id) existingTextsMap.set(el.id, el);
        }
    }

    const { width: refW, height: refH } = getReferenceDisplayDimensions(page, imgElement);
    const naturalW = (imgElement && imgElement.naturalWidth > 0) ? imgElement.naturalWidth : (page?.width || 800);
    const naturalH = (imgElement && imgElement.naturalHeight > 0) ? imgElement.naturalHeight : (page?.height || 1200);
    const zoomScale = isMirror ? 1 : ((globalState.zoom || 100) / 100);

    const currentImgWidth = (imgElement && imgElement.clientWidth > 0) ? imgElement.clientWidth : (refW * zoomScale);
    const currentImgHeight = (imgElement && imgElement.clientHeight > 0) ? imgElement.clientHeight : (currentImgWidth * (naturalH / Math.max(1, naturalW)));

    const screenScale = isMirror ? forceExportScale : (currentImgWidth / Math.max(1, refW));
    const displayW = isMirror ? naturalW : currentImgWidth;
    const displayH = isMirror ? naturalH : currentImgHeight;

    page.blocks.forEach((block) => {
        if (!block || !block.box) return;
        if (!block.style) block.style = {} as any;

        const bubblePxW = (block.box.w / 100) * displayW;
        const bubblePxH = (block.box.h / 100) * displayH;

        const coverId = isMirror ? `mirror-cover-${block.id}` : `cover-${block.id}`;
        const bubbleId = isMirror ? `mirror-${block.id}` : block.id;
        activeCoverIds.add(coverId);
        activeBubbleIds.add(bubbleId);

        // 1. Cover Layer Node Reconciliation (O(1) lookup)
        let coverEl = existingCoversMap.get(coverId) || null;
        let isNewCover = false;
        if (!coverEl) {
            coverEl = document.createElement('div');
            coverEl.id = coverId;
            coverEl.setAttribute('data-darkreader-ignore', 'true');
            coverEl.style.position = 'absolute';
            coverEl.style.pointerEvents = 'none';
            isNewCover = true;
        }

        coverEl.style.top = `${block.box.y}%`;
        coverEl.style.left = `${block.box.x}%`;
        coverEl.style.width = `${block.box.w}%`;
        coverEl.style.height = `${block.box.h}%`;

        if (block.style.rotate) {
            coverEl.style.transform = `rotate(${block.style.rotate}deg)`;
        } else {
            coverEl.style.transform = '';
        }

        coverEl.style.display = 'flex';
        coverEl.style.alignItems = 'center';
        if (block.style.align === 'left') {
            coverEl.style.justifyContent = 'flex-start';
        } else if (block.style.align === 'right') {
            coverEl.style.justifyContent = 'flex-end';
        } else {
            coverEl.style.justifyContent = 'center';
        }

        let coverMaskContent = coverEl.firstElementChild as HTMLElement | null;
        if (!coverMaskContent) {
            coverMaskContent = document.createElement('div');
            coverMaskContent.setAttribute('data-darkreader-ignore', 'true');
            coverMaskContent.style.position = 'relative';
            coverMaskContent.style.overflow = 'hidden';
            coverMaskContent.style.boxSizing = 'border-box';
            coverEl.appendChild(coverMaskContent);
        }

        if (block.type === 'image') {
            coverMaskContent.style.width = '100%';
            coverMaskContent.style.height = '100%';
            coverMaskContent.style.display = 'flex';
            coverMaskContent.style.alignItems = 'center';
            coverMaskContent.style.justifyContent = 'center';

            let imgEl = coverMaskContent.querySelector('img') as HTMLImageElement | null;
            if (!imgEl) {
                coverMaskContent.replaceChildren();
                imgEl = document.createElement('img');
                imgEl.className = 'w-full h-full pointer-events-none select-none';
                coverMaskContent.appendChild(imgEl);
            }
            imgEl.src = block.imageUrl || '';
            imgEl.style.objectFit = block.style.fit || 'contain';
            const rad = block.style.borderRadius || 0;
            imgEl.style.borderRadius = `${rad}px`;
            const opacity = (block.style.opacity !== undefined ? block.style.opacity : 100) / 100;
            imgEl.style.opacity = `${opacity}`;
        } else {
            if (coverMaskContent.querySelector('img')) {
                coverMaskContent.replaceChildren();
            }

            const fontStyle = block.style.fontFamily || globalState.defaultFont || 'font-manga';
            const isBuiltInFont = fontStyle.startsWith('font-');

            const currentMaskSize = block.style.maskSize || 'full';
            if (currentMaskSize === 'full') {
                coverMaskContent.style.width = '100%';
                coverMaskContent.style.height = '100%';
                coverMaskContent.style.display = 'flex';
                if (block.style.vertical) {
                    coverMaskContent.style.justifyContent = 'center';
                    coverMaskContent.style.alignItems = 'center';
                } else {
                    coverMaskContent.style.alignItems = 'center';
                    coverMaskContent.style.justifyContent = block.style.align === 'left' ? 'flex-start' : block.style.align === 'right' ? 'flex-end' : 'center';
                }
                coverMaskContent.className = `${isBuiltInFont ? fontStyle : ''} pointer-events-none`;
            } else {
                coverMaskContent.style.display = 'flex';
                coverMaskContent.style.alignItems = 'center';
                coverMaskContent.style.justifyContent = 'center';
                if (block.translated && block.translated.trim()) {
                    const baseW = Math.max(1, displayW / Math.max(0.001, zoomScale));
                    const baseH = Math.max(1, displayH / Math.max(0.001, zoomScale));
                    const refLayout = computeBlockTextLayout(block, baseW, baseH, 1.0);
                    const lockedLines = (refLayout.lines && refLayout.lines.length > 0) ? refLayout.lines.map(l => l.tokens) : undefined;
                    const blockLayout = computeBlockTextLayout(block, displayW, displayH, zoomScale, null, lockedLines);
                    const snugW = Math.min(bubblePxW, blockLayout.totalWidth + (blockLayout.padXPx * 2));
                    const snugH = Math.min(bubblePxH, blockLayout.totalHeight + (blockLayout.padYPx * 2));
                    coverMaskContent.style.width = `${snugW}px`;
                    coverMaskContent.style.height = `${snugH}px`;
                } else {
                    coverMaskContent.style.width = 'auto';
                    coverMaskContent.style.height = 'auto';
                }
                coverMaskContent.style.maxWidth = '100%';
                coverMaskContent.style.maxHeight = '100%';
                coverMaskContent.className = `${isBuiltInFont ? fontStyle : ''} pointer-events-none`;
            }

            coverMaskContent.style.fontFamily = getFontFamilyName(fontStyle);
            const currentMaskShape = block.style.maskShape || 'bubble-fit';
            let hasBubbleFitMask = false;

            if (currentMaskShape === 'bubble-fit') {
                let dataUrl = block.maskCache ? block.maskCache.dataUrl : null;
                if (!dataUrl && activeImageData) {
                    const maskCanvas = computeBubbleMask(page, block, activeImageData);
                    if (maskCanvas) {
                        dataUrl = block.maskCache?.dataUrl || (maskCanvas.toDataURL ? maskCanvas.toDataURL() : null);
                    }
                }
                if (dataUrl) {
                    coverMaskContent.style.backgroundImage = `url(${dataUrl})`;
                    coverMaskContent.style.backgroundSize = '100% 100%';
                    coverMaskContent.style.backgroundRepeat = 'no-repeat';
                    coverMaskContent.style.backgroundColor = 'transparent';
                    coverMaskContent.style.borderRadius = '0px';
                    hasBubbleFitMask = true;
                }
            }

            if (!hasBubbleFitMask) {
                coverMaskContent.style.backgroundImage = 'none';
                coverMaskContent.style.backgroundColor = block.style.bgColor || '#FFFFFF';
                const opacity = (block.style.bgOpacity !== undefined ? block.style.bgOpacity : 100) / 100;
                coverMaskContent.style.opacity = `${opacity}`;
                const rad = block.style.borderRadius !== undefined ? block.style.borderRadius : 4;
                coverMaskContent.style.borderRadius = `${rad}px`;
            }
        }

        if (isNewCover) {
            coversLayer!.appendChild(coverEl);
        }

        // 2. Text/Content Layer Node Reconciliation (O(1) lookup)
        let bubble = existingTextsMap.get(bubbleId) || null;
        let isNewBubble = false;
        if (!bubble) {
            bubble = document.createElement('div');
            bubble.id = bubbleId;
            bubble.setAttribute('data-darkreader-ignore', 'true');
            bubble.style.position = 'absolute';
            bubble.style.cursor = 'move';
            isNewBubble = true;
        }

        bubble.style.top = `${block.box.y}%`;
        bubble.style.left = `${block.box.x}%`;
        bubble.style.width = `${block.box.w}%`;
        bubble.style.height = `${block.box.h}%`;
        bubble.setAttribute('data-block-id', block.id);

        const isSelected = (block.id === globalState.selectedBlockId || (globalState.selectedBlockIds && globalState.selectedBlockIds.includes(block.id))) && !isMirror;
        bubble.className = `bubble-overlay ${isSelected ? 'active' : ''}`;

        if (block.style.rotate) {
            bubble.style.transform = `rotate(${block.style.rotate}deg)`;
        } else {
            bubble.style.transform = '';
        }

        bubble.style.display = 'flex';
        bubble.style.alignItems = 'center';
        if (block.style.align === 'left') {
            bubble.style.justifyContent = 'flex-start';
        } else if (block.style.align === 'right') {
            bubble.style.justifyContent = 'flex-end';
        } else {
            bubble.style.justifyContent = 'center';
        }

        let maskContent = bubble.firstElementChild as HTMLElement | null;
        if (!maskContent) {
            maskContent = document.createElement('div');
            maskContent.setAttribute('data-darkreader-ignore', 'true');
            maskContent.style.position = 'relative';
            maskContent.style.boxSizing = 'border-box';
            maskContent.style.overflow = 'visible';
            bubble.appendChild(maskContent);
        }

        if (block.type !== 'image') {
            const fontStyle = block.style.fontFamily || globalState.defaultFont || 'font-manga';
            const isBuiltInFont = fontStyle.startsWith('font-');

            const currentMaskSize = block.style.maskSize || 'full';
            if (currentMaskSize === 'full') {
                maskContent.style.width = '100%';
                maskContent.style.height = '100%';
                maskContent.style.display = 'flex';
                if (block.style.vertical) {
                    maskContent.style.justifyContent = 'center';
                    maskContent.style.alignItems = 'center';
                } else {
                    maskContent.style.alignItems = 'center';
                    maskContent.style.justifyContent = block.style.align === 'left' ? 'flex-start' : block.style.align === 'right' ? 'flex-end' : 'center';
                }
                maskContent.className = `mask-content-container ${isBuiltInFont ? fontStyle : ''} pointer-events-none`;
            } else {
                maskContent.style.display = 'flex';
                maskContent.style.alignItems = 'center';
                maskContent.style.justifyContent = 'center';
                maskContent.style.width = 'auto';
                maskContent.style.height = 'auto';
                maskContent.style.maxWidth = '100%';
                maskContent.style.maxHeight = '100%';
                maskContent.className = `mask-content-container ${isBuiltInFont ? fontStyle : ''} pointer-events-none`;
            }

            maskContent.style.fontFamily = getFontFamilyName(fontStyle);
            maskContent.style.wordBreak = 'keep-all';
            maskContent.style.overflowWrap = 'break-word';
            maskContent.style.hyphens = 'none';

            maskContent.style.color = block.style.textColor || '#000000';

            const bubblePxW = (block.box.w / 100) * displayW;
            const bubblePxH = (block.box.h / 100) * displayH;

            if (block.style.padding !== undefined) {
                if (typeof block.style.padding === 'string' && block.style.padding.includes('%')) {
                    const parts = block.style.padding.trim().split(/\s+/);
                    const pctY = parseFloat(parts[0]) || 9;
                    const pctX = parseFloat(parts[1] || parts[0]) || 12;
                    const padY = bubblePxH * (pctY / 100);
                    const padX = bubblePxW * (pctX / 100);
                    maskContent.style.padding = `${padY}px ${padX}px`;
                } else if (typeof block.style.padding === 'string') {
                    maskContent.style.padding = block.style.padding;
                } else if (typeof block.style.padding === 'number') {
                    const displayPadding = block.style.padding * screenScale;
                    maskContent.style.padding = `${displayPadding}px`;
                } else {
                    const displayPadding = 4 * screenScale;
                    maskContent.style.padding = `${displayPadding}px`;
                }
            } else {
                const displayPadding = 4 * screenScale;
                maskContent.style.padding = `${displayPadding}px`;
            }

            maskContent.style.textAlign = block.style.align || 'center';

            let displayFontSize = (block.style.fontSize || 17) * screenScale;
            maskContent.style.fontSize = `${displayFontSize}px`;
            const currentLineHeight = block.style.lineHeight !== undefined ? block.style.lineHeight : 1.15;
            const currentLetterSpacing = block.style.letterSpacing !== undefined ? block.style.letterSpacing : 0;
            const displayLetterSpacing = currentLetterSpacing * screenScale;

            maskContent.style.lineHeight = `${currentLineHeight}`;
            maskContent.style.letterSpacing = `${displayLetterSpacing}px`;
            maskContent.style.fontKerning = 'normal';
            maskContent.style.fontWeight = block.style.bold ? 'bold' : 'normal';
            maskContent.style.fontStyle = block.style.italic ? 'italic' : 'normal';

            const textOffX = (block.style.textOffsetX || 0) * screenScale;
            const textOffY = (block.style.textOffsetY || 0) * screenScale;
            const textRot = block.style.textRotate || 0;
            const transforms: string[] = [];
            if (textOffX !== 0 || textOffY !== 0) {
                transforms.push(`translate(${textOffX}px, ${textOffY}px)`);
            }
            if (textRot !== 0) {
                transforms.push(`rotate(${textRot}deg)`);
            }
            maskContent.style.transform = transforms.join(' ');

            if (block.style.vertical) {
                maskContent.classList.add('text-vertical');
                maskContent.style.writingMode = 'vertical-rl';
                maskContent.style.textOrientation = 'upright';
                maskContent.style.lineHeight = `${currentLineHeight}`;
            } else {
                maskContent.classList.remove('text-vertical');
                maskContent.style.writingMode = '';
                maskContent.style.textOrientation = '';
            }

            const strokeWidth = block.style.strokeWidth || 0;
            const strokeColor = block.style.strokeColor || '#ffffff';
            if (strokeWidth > 0) {
                const displayStroke = forceExportScale !== 1 ? strokeWidth * forceExportScale : strokeWidth;
                maskContent.style.webkitTextStroke = `${displayStroke}px ${strokeColor}`;
                maskContent.style.paintOrder = 'stroke fill';
            } else {
                maskContent.style.webkitTextStroke = '0px transparent';
            }

            const strokeWidth2 = block.style.strokeWidth2 || 0;
            const strokeColor2 = block.style.strokeColor2 || '#000000';
            const shadowBlur = block.style.shadowBlur || 0;
            const shadowColor = block.style.shadowColor || '#000000';
            const shadowOffsetX = block.style.shadowOffsetX || 0;
            const shadowOffsetY = block.style.shadowOffsetY || 0;

            const shadowParts: string[] = [];
            const scaleToUse = forceExportScale !== 1 ? forceExportScale : zoomScale;

            if (strokeWidth2 > 0) {
                const displayStroke1 = (strokeWidth || 0) * scaleToUse;
                const displayStroke2 = strokeWidth2 * scaleToUse;
                const r = (displayStroke1 / 2) + displayStroke2;
                const numSteps = 16;
                for (let a = 0; a < 360; a += 360 / numSteps) {
                    const rad = (a * Math.PI) / 180;
                    const ox = (Math.cos(rad) * r).toFixed(1);
                    const oy = (Math.sin(rad) * r).toFixed(1);
                    shadowParts.push(`${ox}px ${oy}px 0px ${strokeColor2}`);
                }
            }

            if (shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0) {
                const displayBlur = shadowBlur * scaleToUse;
                const displayOffX = shadowOffsetX * scaleToUse;
                const displayOffY = shadowOffsetY * scaleToUse;
                shadowParts.push(`${displayOffX}px ${displayOffY}px ${displayBlur}px ${shadowColor}`);
            }

            if (shadowParts.length > 0) {
                maskContent.style.textShadow = shadowParts.join(', ');
            } else {
                maskContent.style.textShadow = 'none';
            }

            if (block.style.gradientEnabled) {
                const angle = block.style.gradientAngle || 90;
                const startCol = block.style.gradientColorStart || '#ff7e5f';
                const endCol = block.style.gradientColorEnd || '#feb47b';
                if (block.style.gradientType === 'radial') {
                    maskContent.style.backgroundImage = `radial-gradient(circle, ${startCol}, ${endCol})`;
                } else {
                    maskContent.style.backgroundImage = `linear-gradient(${angle}deg, ${startCol}, ${endCol})`;
                }
                maskContent.style.webkitBackgroundClip = 'text';
                maskContent.style.webkitTextFillColor = 'transparent';
            } else {
                maskContent.style.backgroundImage = 'none';
                maskContent.style.webkitBackgroundClip = 'initial';
                maskContent.style.webkitTextFillColor = 'initial';
            }

            if (block.style.blendMode && block.style.blendMode !== 'normal') {
                maskContent.style.mixBlendMode = block.style.blendMode;
            } else {
                maskContent.style.mixBlendMode = 'normal';
            }

            let innerTextDiv = maskContent.querySelector(':scope > .inner-text-container') as HTMLElement | null;
            if (!innerTextDiv) {
                innerTextDiv = document.createElement('div');
                innerTextDiv.className = 'inner-text-container';
                maskContent.appendChild(innerTextDiv);
            }

            const isCenterAlign = !block.style.align || block.style.align === 'center';
            if (block.style.vertical) {
                innerTextDiv.style.writingMode = 'vertical-rl';
                innerTextDiv.style.textOrientation = 'upright';
                innerTextDiv.className = 'inner-text-container max-h-full max-w-full inline-block';
            } else {
                innerTextDiv.style.writingMode = '';
                innerTextDiv.style.textOrientation = '';
                innerTextDiv.className = `inner-text-container w-full flex flex-col ${isCenterAlign ? 'items-center justify-center' : block.style.align === 'right' ? 'items-end' : 'items-start'}`;
            }
            innerTextDiv.style.margin = '0';
            innerTextDiv.style.padding = '0';
            innerTextDiv.style.lineHeight = `${currentLineHeight}`;
            innerTextDiv.style.letterSpacing = `${displayLetterSpacing}px`;
            innerTextDiv.style.textAlign = block.style.align || 'center';

            const warpOpts = {
                arcAngle: block.style.arcAngle || 0,
                skewX: block.style.skewX || 0,
                skewY: block.style.skewY || 0,
                warpWave: block.style.warpWave || 0,
                warpBulge: block.style.warpBulge || 0,
                textTransform: block.style.textTransform || 'none',
                letterSpacing: displayLetterSpacing,
                underline: !!block.style.underline
            };
            const scaleForLayout = screenScale;
            renderBlockTextToDOM(innerTextDiv, block, displayW, displayH, scaleForLayout, warpOpts);

            if ((globalState.bilingualMode === 'sub' || block.style.bilingualSub) && block.original && block.original.trim()) {
                let origSub = innerTextDiv.querySelector(':scope > .bilingual-sub-line') as HTMLElement | null;
                if (!origSub) {
                    origSub = document.createElement('div');
                    origSub.className = 'bilingual-sub-line text-[0.7em] opacity-75 font-sans tracking-normal mt-0.5 select-none pointer-events-none';
                    innerTextDiv.appendChild(origSub);
                }
                origSub.style.color = 'inherit';
                origSub.style.lineHeight = '1.1';
                renderBlockTextToDOM(origSub, { ...block, translated: block.original }, displayW, displayH, screenScale, warpOpts);
            } else {
                const existingSub = innerTextDiv.querySelector(':scope > .bilingual-sub-line');
                if (existingSub) existingSub.remove();
            }

            innerTextDiv.style.position = 'relative';
            innerTextDiv.style.zIndex = '1';

            bubble.setAttribute('data-original', block.original || '');
            bubble.setAttribute('data-translated', block.translated || '');
        }

        if (isNewBubble) {
            if (!isMirror) {
                let lastMousedownTime = 0;
                bubble.addEventListener('mousedown', (e: MouseEvent) => {
                    const now = Date.now();
                    if (now - lastMousedownTime < 350) {
                        lastMousedownTime = 0;
                        e.preventDefault();
                        e.stopPropagation();
                        if (block.type !== 'image') {
                            const innerText = maskContent!.querySelector('.inner-text-container') as HTMLElement || maskContent!.firstElementChild as HTMLElement;
                            startInlineEditing(block, bubble!, maskContent!, innerText);
                        } else {
                            uiSetRightTab('edit');
                            if (elements.editTranslatedText) elements.editTranslatedText.focus();
                        }
                        return;
                    }
                    lastMousedownTime = now;
                    startBlockDrag(e, block);
                });

                let lastTouchTime = 0;
                bubble.addEventListener('touchstart', (e: TouchEvent) => {
                    if (globalState.isMobileHandMode) return;
                    const now = Date.now();
                    if (now - lastTouchTime < 350) {
                        lastTouchTime = 0;
                        e.preventDefault();
                        e.stopPropagation();
                        if (window.innerWidth < 1024) {
                            import('../../ui/layout-ui').then(m => m.openMobileQuickEditor(block.id));
                            return;
                        }
                        if (block.type !== 'image') {
                            const innerText = maskContent!.querySelector('.inner-text-container') as HTMLElement || maskContent!.firstElementChild as HTMLElement;
                            startInlineEditing(block, bubble!, maskContent!, innerText);
                        } else {
                            uiSetRightTab('edit');
                            if (elements.editTranslatedText) elements.editTranslatedText.focus();
                        }
                        return;
                    }
                    lastTouchTime = now;
                    if (e.touches.length === 1) {
                        startBlockDrag(e, block);
                    }
                }, { passive: false });

                const handleSW = document.createElement('div');
                handleSW.className = "resize-handle resize-sw";
                handleSW.addEventListener('mousedown', (e) => startBlockResize(e, block, 'sw'));
                handleSW.addEventListener('touchstart', (e) => {
                    if (!globalState.isMobileHandMode && e.touches.length === 1) startBlockResize(e, block, 'sw');
                }, { passive: false });

                const handleSE = document.createElement('div');
                handleSE.className = "resize-handle resize-se";
                handleSE.addEventListener('mousedown', (e) => startBlockResize(e, block, 'se'));
                handleSE.addEventListener('touchstart', (e) => {
                    if (!globalState.isMobileHandMode && e.touches.length === 1) startBlockResize(e, block, 'se');
                }, { passive: false });

                const handleNW = document.createElement('div');
                handleNW.className = "resize-handle resize-nw";
                handleNW.addEventListener('mousedown', (e) => startBlockResize(e, block, 'nw'));
                handleNW.addEventListener('touchstart', (e) => {
                    if (!globalState.isMobileHandMode && e.touches.length === 1) startBlockResize(e, block, 'nw');
                }, { passive: false });

                const handleNE = document.createElement('div');
                handleNE.className = "resize-handle resize-ne";
                handleNE.addEventListener('mousedown', (e) => startBlockResize(e, block, 'ne'));
                handleNE.addEventListener('touchstart', (e) => {
                    if (!globalState.isMobileHandMode && e.touches.length === 1) startBlockResize(e, block, 'ne');
                }, { passive: false });

                bubble.appendChild(handleSW);
                bubble.appendChild(handleSE);
                bubble.appendChild(handleNW);
                bubble.appendChild(handleNE);
            }

            textsLayer!.appendChild(bubble);
        }
    });

    // 3. Cleanup Orphan Elements (In-place loop without array allocation)
    if (coversLayer) {
        for (let i = coversLayer.children.length - 1; i >= 0; i--) {
            const child = coversLayer.children[i] as HTMLElement;
            if (child.id && !activeCoverIds.has(child.id)) {
                coversLayer.removeChild(child);
            }
        }
    }
    if (textsLayer) {
        for (let i = textsLayer.children.length - 1; i >= 0; i--) {
            const child = textsLayer.children[i] as HTMLElement;
            if (child.id && !activeBubbleIds.has(child.id)) {
                textsLayer.removeChild(child);
            }
        }
    }
}

export function convertHexToRGBA(hex: string, alpha: number): string {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function startInlineEditing(block: MangaBlock, bubble: HTMLElement, maskContent: HTMLElement, innerTextDiv: HTMLElement): void {
    if (!block || block.type === 'image') return;
    if ((block as any)._isEditingInline) return;

    (block as any)._isEditingInline = true;
    uiSetRightTab('edit');

    maskContent.style.pointerEvents = 'auto';
    innerTextDiv.style.pointerEvents = 'auto';
    innerTextDiv.contentEditable = 'true';
    innerTextDiv.style.outline = '2px dashed #6366f1';
    innerTextDiv.style.outlineOffset = '2px';
    innerTextDiv.style.borderRadius = '4px';
    innerTextDiv.style.cursor = 'text';
    bubble.classList.add('editing-inline');

    innerTextDiv.focus();
    try {
        const range = document.createRange();
        range.selectNodeContents(innerTextDiv);
        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }
    } catch (err) { }

    let isComposing = false;

    function handleInput() {
        if (isComposing) return;
        let newText = innerTextDiv.innerText || innerTextDiv.textContent || '';
        newText = newText.replace(/\r\n/g, '\n');
        if (newText.endsWith('\n') && !(block.translated || '').endsWith('\n')) {
            newText = newText.slice(0, -1);
        }

        block.translated = newText;
        bubble.setAttribute('data-translated', newText);

        if (elements.editTranslatedText) {
            elements.editTranslatedText.value = newText;
        }

        if (isBlockAutoFit(block)) {
            const imgElement = elements.mangaBgImage;
            block.autoFitCache = null;
            autoFitBlock(block, imgElement);
            const zoomScale = (globalState.zoom || 100) / 100;
            maskContent.style.fontSize = `${(block.style.fontSize || 13) * zoomScale}px`;
            if (elements.lblFontSize) elements.lblFontSize.innerText = `${block.style.fontSize}px (Auto)`;
            if (elements.styleFontSize) elements.styleFontSize.value = String(block.style.fontSize || 13);
        }
    }

    function stopInlineEditing() {
        if (!(block as any)._isEditingInline) return;
        (block as any)._isEditingInline = false;
        innerTextDiv.contentEditable = 'false';
        innerTextDiv.style.outline = 'none';
        innerTextDiv.style.cursor = '';
        maskContent.style.pointerEvents = 'none';
        innerTextDiv.style.pointerEvents = 'none';
        bubble.classList.remove('editing-inline');

        innerTextDiv.removeEventListener('input', handleInput);
        innerTextDiv.removeEventListener('blur', stopInlineEditing);
        innerTextDiv.removeEventListener('keydown', handleKeydown);

        const page = globalState.pages[globalState.activePageIndex];
        if (page) {
            savePageToDB(page);
        }
        requestOverlayRender();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape' || (e.ctrlKey && e.key === 'Enter')) {
            e.preventDefault();
            e.stopPropagation();
            stopInlineEditing();
        }
    }

    innerTextDiv.addEventListener('compositionstart', () => { isComposing = true; });
    innerTextDiv.addEventListener('compositionend', () => {
        isComposing = false;
        handleInput();
    });
    innerTextDiv.addEventListener('input', handleInput);
    innerTextDiv.addEventListener('blur', stopInlineEditing);
    innerTextDiv.addEventListener('keydown', handleKeydown);
}

export function triggerInlineEditActiveBlock(): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page ? page.blocks.find(b => b.id === globalState.selectedBlockId) : null;
    if (!block || block.type === 'image') return;

    const bubble = document.getElementById(block.id);
    if (!bubble) return;
    const maskContent = bubble.firstElementChild as HTMLElement | null;
    const innerTextDiv = maskContent ? maskContent.firstElementChild as HTMLElement | null : null;
    if (maskContent && innerTextDiv) {
        startInlineEditing(block, bubble, maskContent, innerTextDiv);
    }
}

export function commitActiveEditingState(): void {
    try {
        const page = globalState.activePageIndex !== -1 ? globalState.pages[globalState.activePageIndex] : null;
        if (page && page.blocks) {
            page.blocks.forEach(b => {
                if ((b as any)._isEditingInline) {
                    (b as any)._isEditingInline = false;
                    const bubble = typeof document !== 'undefined' ? (document.getElementById(b.id) || (document.querySelector && document.querySelector(`#${b.id}`))) : null;
                    if (bubble) {
                        if (bubble.classList && typeof bubble.classList.remove === 'function') {
                            bubble.classList.remove('editing-inline');
                        }
                        const inner = (typeof bubble.querySelector === 'function' && bubble.querySelector('[contenteditable="true"]'))
                            ? (bubble.querySelector('[contenteditable="true"]') as HTMLElement | null)
                            : ((bubble.children && bubble.children.length > 0)
                                ? (Array.isArray(bubble.children) ? (bubble.children.find((c: any) => c.contentEditable === 'true' || c.contentEditable === true) || bubble.children[0]) : bubble.children[0])
                                : null);
                        if (inner) {
                            let newText = (inner.textContent || inner.innerText || '').replace(/\r\n/g, '\n');
                            if (newText.endsWith('\n') && !(b.translated || '').endsWith('\n')) {
                                newText = newText.slice(0, -1);
                            }
                            if (newText) b.translated = newText;
                            inner.contentEditable = 'false';
                            if (inner.style) {
                                inner.style.outline = 'none';
                                inner.style.cursor = '';
                            }
                        }
                    }
                }
            });
        }

        const activeEditingEl = (typeof document !== 'undefined' && typeof document.querySelector === 'function')
            ? (document.querySelector('.editing-inline') as HTMLElement | null)
            : null;
        if (activeEditingEl) {
            const rawId = String(activeEditingEl.id || '');
            const blockId = rawId.replace('mirror-', '');
            const block = page?.blocks?.find(b => b.id === blockId);
            const innerTextDiv = (typeof activeEditingEl.querySelector === 'function')
                ? (activeEditingEl.querySelector('[contenteditable="true"]') as HTMLElement | null)
                : null;
            if (block && innerTextDiv) {
                let newText = innerTextDiv.textContent || innerTextDiv.innerText || '';
                newText = newText.replace(/\r\n/g, '\n');
                if (newText.endsWith('\n') && !(block.translated || '').endsWith('\n')) {
                    newText = newText.slice(0, -1);
                }
                if (newText) block.translated = newText;
                (block as any)._isEditingInline = false;
                innerTextDiv.contentEditable = 'false';
                if (innerTextDiv.style) {
                    innerTextDiv.style.outline = 'none';
                    innerTextDiv.style.cursor = '';
                }
                if (activeEditingEl.classList && typeof activeEditingEl.classList.remove === 'function') {
                    activeEditingEl.classList.remove('editing-inline');
                }
            }
        }

        if (typeof document !== 'undefined') {
            const transInput = elements.editTranslatedText || (document.getElementById('edit-translated-text') as HTMLTextAreaElement | null);
            if (transInput && (document.activeElement === transInput || (transInput.value && globalState.selectedBlockId))) {
                const block = page?.blocks?.find(b => b.id === globalState.selectedBlockId);
                if (block && transInput.value !== undefined) {
                    block.translated = transInput.value;
                }
            }
            const origInput = elements.editOriginalText || (document.getElementById('edit-original-text') as HTMLTextAreaElement | null);
            if (origInput && (document.activeElement === origInput || (origInput.value && globalState.selectedBlockId))) {
                const block = page?.blocks?.find(b => b.id === globalState.selectedBlockId);
                if (block && origInput.value !== undefined) {
                    block.original = origInput.value;
                }
            }

            if (document.activeElement && typeof (document.activeElement as HTMLElement).blur === 'function') {
                (document.activeElement as HTMLElement).blur();
            }
        }

        if (page) {
            savePageToDB(page);
        }
    } catch (e) {
        console.warn("commitActiveEditingState error:", e);
    }
}

