import { globalState, pushStateToHistory, savePageToDB, uiUpdateActiveBlockEditor, uiSetRightTab } from '../../core/state';
import { elements } from '../../core/elements';
import { showToast, setMultilineText, stripRichTextTags, parseRichTextLines } from '../../core/utils';
import { computeBubbleMask } from '../ocr/ocr-service';
import { autoFitAllBlocksOnPage, autoFitBlock, isBlockAutoFit } from './canvas-styling';
import { startBlockDrag, startBlockResize } from './canvas-interactions';
import { MangaBlock, MangaPage } from '../../types/index';

export let overlayRenderRafId: any = null;

export function requestOverlayRender(): void {
    if (overlayRenderRafId) return;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: any) => setTimeout(cb, 0);
    overlayRenderRafId = raf(() => {
        overlayRenderRafId = null;
        renderOverlays();
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

    container.innerHTML = '';

    const page = customPage || (globalState.activePageIndex !== -1 ? globalState.pages[globalState.activePageIndex] : null);
    if (!page) return;

    if (globalState.viewMode === 'original' && !isMirror) return;

    const imgElement = customImgElement || elements.mangaBgImage;
    if (imgElement && imgElement.clientWidth > 0) {
        const zoomScale = (globalState.zoom || 100) / 100;
        const normalizedWidth = Math.round(imgElement.clientWidth / zoomScale);
        if (!(page as any).lastDisplayWidth || Math.abs((page as any).lastDisplayWidth - normalizedWidth) > 5) {
            (page as any).lastDisplayWidth = normalizedWidth;
        }
    }

    if (globalState.autoFitEnabled) {
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
        } catch (e) {
            console.error("Không thể lấy dữ liệu ảnh để khớp bong bóng:", e);
        }
    }

    const coversLayer = document.createElement('div');
    coversLayer.className = 'manga-covers-layer absolute inset-0 pointer-events-none z-10';
    coversLayer.setAttribute('data-darkreader-ignore', 'true');
    coversLayer.style.position = 'absolute';
    coversLayer.style.top = '0';
    coversLayer.style.left = '0';
    coversLayer.style.width = '100%';
    coversLayer.style.height = '100%';
    coversLayer.style.zIndex = '1';
    coversLayer.style.pointerEvents = 'none';

    const textsLayer = document.createElement('div');
    textsLayer.className = 'manga-texts-layer absolute inset-0 z-20';
    textsLayer.setAttribute('data-darkreader-ignore', 'true');
    textsLayer.style.position = 'absolute';
    textsLayer.style.top = '0';
    textsLayer.style.left = '0';
    textsLayer.style.width = '100%';
    textsLayer.style.height = '100%';
    textsLayer.style.zIndex = '2';

    page.blocks.forEach((block) => {
        if (!block || !block.box) return;
        if (!block.style) block.style = {} as any;

        const coverEl = document.createElement('div');
        coverEl.id = isMirror ? `mirror-cover-${block.id}` : `cover-${block.id}`;
        coverEl.setAttribute('data-darkreader-ignore', 'true');
        coverEl.style.position = 'absolute';
        coverEl.style.top = `${block.box.y}%`;
        coverEl.style.left = `${block.box.x}%`;
        coverEl.style.width = `${block.box.w}%`;
        coverEl.style.height = `${block.box.h}%`;
        coverEl.style.pointerEvents = 'none';

        if (block.style.rotate) {
            coverEl.style.transform = `rotate(${block.style.rotate}deg)`;
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

        const coverMaskContent = document.createElement('div');
        coverMaskContent.setAttribute('data-darkreader-ignore', 'true');
        coverMaskContent.style.position = 'relative';
        coverMaskContent.style.overflow = 'hidden';
        coverMaskContent.style.boxSizing = 'border-box';

        if (block.type === 'image') {
            coverMaskContent.style.width = '100%';
            coverMaskContent.style.height = '100%';
            coverMaskContent.style.display = 'flex';
            coverMaskContent.style.alignItems = 'center';
            coverMaskContent.style.justifyContent = 'center';

            const imgEl = document.createElement('img');
            imgEl.src = block.imageUrl || '';
            imgEl.className = 'w-full h-full pointer-events-none select-none';
            imgEl.style.objectFit = block.style.fit || 'contain';
            const rad = block.style.borderRadius || 0;
            imgEl.style.borderRadius = `${rad}px`;
            const opacity = (block.style.opacity !== undefined ? block.style.opacity : 100) / 100;
            imgEl.style.opacity = `${opacity}`;

            coverMaskContent.appendChild(imgEl);
            coverEl.appendChild(coverMaskContent);
        } else {
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
                coverMaskContent.style.width = 'auto';
                coverMaskContent.style.height = 'auto';
                coverMaskContent.style.maxWidth = '100%';
                coverMaskContent.style.maxHeight = '100%';
                coverMaskContent.className = `${isBuiltInFont ? fontStyle : ''} pointer-events-none`;
            }

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
                const hexBgColor = block.style.bgColor || '#ffffff';
                const alpha = (block.style.bgOpacity !== undefined ? block.style.bgOpacity : 100) / 100;
                coverMaskContent.style.backgroundColor = convertHexToRGBA(hexBgColor, alpha);

                if (currentMaskShape === 'ellipse') {
                    coverMaskContent.style.borderRadius = '50%';
                } else if (currentMaskShape === 'rounded') {
                    coverMaskContent.style.borderRadius = '12px';
                } else {
                    coverMaskContent.style.borderRadius = '0px';
                }
            }
            coverEl.appendChild(coverMaskContent);
        }
        coversLayer.appendChild(coverEl);

        const bubble = document.createElement('div');
        bubble.id = isMirror ? `mirror-${block.id}` : block.id;

        bubble.style.top = `${block.box.y}%`;
        bubble.style.left = `${block.box.x}%`;
        bubble.style.width = `${block.box.w}%`;
        bubble.style.height = `${block.box.h}%`;

        if (block.style.rotate) {
            bubble.style.transform = `rotate(${block.style.rotate}deg)`;
        } else {
            bubble.style.transform = '';
        }

        bubble.className = `bubble-overlay ${block.id === globalState.selectedBlockId && !isMirror ? 'active' : ''}`;
        bubble.style.backgroundColor = 'transparent';
        bubble.style.display = 'flex';
        bubble.style.alignItems = 'center';
        if (block.style.vertical) {
            bubble.style.justifyContent = 'center';
            bubble.style.alignItems = 'center';
        } else if (block.style.align === 'left') {
            bubble.style.justifyContent = 'flex-start';
        } else if (block.style.align === 'right') {
            bubble.style.justifyContent = 'flex-end';
        } else {
            bubble.style.justifyContent = 'center';
        }

        const maskContent = document.createElement('div');
        maskContent.style.position = 'relative';
        maskContent.style.overflow = 'hidden';
        maskContent.style.boxSizing = 'border-box';
        maskContent.style.backgroundColor = 'transparent';
        maskContent.style.backgroundImage = 'none';

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
                maskContent.className = `${isBuiltInFont ? fontStyle : ''} pointer-events-none`;
            } else {
                maskContent.style.display = 'flex';
                maskContent.style.alignItems = 'center';
                maskContent.style.justifyContent = 'center';
                maskContent.style.width = 'auto';
                maskContent.style.height = 'auto';
                maskContent.style.maxWidth = '100%';
                maskContent.style.maxHeight = '100%';
                maskContent.className = `${isBuiltInFont ? fontStyle : ''} pointer-events-none`;
            }

            if (!isBuiltInFont) {
                maskContent.style.fontFamily = `'${fontStyle}', sans-serif`;
            } else {
                maskContent.style.fontFamily = '';
            }

            maskContent.style.wordBreak = 'keep-all';
            maskContent.style.overflowWrap = 'normal';
            maskContent.style.hyphens = 'none';

            maskContent.style.color = block.style.textColor || '#000000';
            const zoomScale = isMirror ? 1 : ((globalState.zoom || 100) / 100);

            const displayW = (page as any).lastDisplayWidth ? (page as any).lastDisplayWidth * zoomScale : (imgElement && imgElement.clientWidth > 0 ? imgElement.clientWidth : 800);
            const naturalW = (imgElement && imgElement.naturalWidth > 0) ? imgElement.naturalWidth : 800;
            const naturalH = (imgElement && imgElement.naturalHeight > 0) ? imgElement.naturalHeight : 1200;
            const displayH = displayW * (naturalH / Math.max(1, naturalW));
            const bubblePxW = (block.box.w / 100) * displayW;
            const bubblePxH = (block.box.h / 100) * displayH;

            if (block.style.padding !== undefined) {
                if (typeof block.style.padding === 'string' && block.style.padding.includes('%')) {
                    const parts = block.style.padding.trim().split(/\s+/);
                    const pctY = parseFloat(parts[0]) || 9;
                    const pctX = parseFloat(parts[1] || parts[0]) || 12;
                    const padY = forceExportScale !== 1 ? (bubblePxH * (pctY / 100) * forceExportScale) : (bubblePxH * (pctY / 100));
                    const padX = forceExportScale !== 1 ? (bubblePxW * (pctX / 100) * forceExportScale) : (bubblePxW * (pctX / 100));
                    maskContent.style.padding = `${padY}px ${padX}px`;
                } else if (typeof block.style.padding === 'string') {
                    maskContent.style.padding = block.style.padding;
                } else if (typeof block.style.padding === 'number') {
                    const displayPadding = forceExportScale !== 1 ? (block.style.padding * forceExportScale) : (block.style.padding * zoomScale);
                    maskContent.style.padding = `${displayPadding}px`;
                } else {
                    const displayPadding = forceExportScale !== 1 ? (4 * forceExportScale) : (4 * zoomScale);
                    maskContent.style.padding = `${displayPadding}px`;
                }
            } else {
                const displayPadding = forceExportScale !== 1 ? (4 * forceExportScale) : (4 * zoomScale);
                maskContent.style.padding = `${displayPadding}px`;
            }

            maskContent.style.textAlign = block.style.align || 'center';

            let displayFontSize = block.style.fontSize || 13;
            if (forceExportScale !== 1) {
                displayFontSize = displayFontSize * forceExportScale;
            } else {
                displayFontSize = displayFontSize * zoomScale;
            }
            maskContent.style.fontSize = `${displayFontSize}px`;
            const currentLineHeight = block.style.lineHeight !== undefined ? block.style.lineHeight : 1.15;
            const currentLetterSpacing = block.style.letterSpacing !== undefined ? block.style.letterSpacing : 0;
            const displayLetterSpacing = forceExportScale !== 1 ? (currentLetterSpacing * forceExportScale) : (currentLetterSpacing * zoomScale);

            maskContent.style.lineHeight = `${currentLineHeight}`;
            maskContent.style.letterSpacing = `${displayLetterSpacing}px`;
            maskContent.style.fontKerning = 'normal';
            maskContent.style.fontWeight = block.style.bold ? 'bold' : 'normal';
            maskContent.style.fontStyle = block.style.italic ? 'italic' : 'normal';

            if (block.style.textRotate) {
                maskContent.style.transform = `rotate(${block.style.textRotate}deg)`;
            } else {
                maskContent.style.transform = '';
            }

            if (block.style.vertical) {
                maskContent.classList.add('text-vertical');
                maskContent.style.writingMode = 'vertical-rl';
                maskContent.style.textOrientation = 'upright';
                maskContent.style.lineHeight = `${currentLineHeight}`;
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
                const displayStroke2 = strokeWidth2 * scaleToUse;
                shadowParts.push(`0px 0px ${displayStroke2}px ${strokeColor2}`);
                shadowParts.push(`0px 0px ${displayStroke2 * 0.75}px ${strokeColor2}`);
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

            const innerTextDiv = document.createElement('div');
            const isCenterAlign = !block.style.align || block.style.align === 'center';
            if (block.style.vertical) {
                innerTextDiv.style.writingMode = 'vertical-rl';
                innerTextDiv.style.textOrientation = 'upright';
                innerTextDiv.className = `max-h-full max-w-full inline-block`;
            } else {
                innerTextDiv.className = `w-full flex flex-col ${isCenterAlign ? 'items-center justify-center' : block.style.align === 'right' ? 'items-end' : 'items-start'}`;
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
            setMultilineText(innerTextDiv, block.translated, warpOpts);

            if ((globalState.bilingualMode === 'sub' || block.style.bilingualSub) && block.original && block.original.trim()) {
                const origSub = document.createElement('div');
                origSub.className = 'text-[0.7em] opacity-75 font-sans tracking-normal mt-0.5 select-none pointer-events-none';
                origSub.style.color = 'inherit';
                origSub.style.lineHeight = '1.1';
                setMultilineText(origSub, block.original, warpOpts);
                innerTextDiv.appendChild(origSub);
            }

            innerTextDiv.style.position = 'relative';
            innerTextDiv.style.zIndex = '1';
            maskContent.appendChild(innerTextDiv);

            bubble.setAttribute('data-original', block.original || '');
            bubble.setAttribute('data-translated', block.translated || '');
            bubble.appendChild(maskContent);
        }

        if (!isMirror) {
            let lastMousedownTime = 0;
            bubble.addEventListener('mousedown', (e: MouseEvent) => {
                const now = Date.now();
                if (now - lastMousedownTime < 350) {
                    lastMousedownTime = 0;
                    e.preventDefault();
                    e.stopPropagation();
                    if (block.type !== 'image') {
                        const innerText = maskContent.firstElementChild as HTMLElement;
                        startInlineEditing(block, bubble, maskContent, innerText);
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
                        const innerText = maskContent.firstElementChild as HTMLElement;
                        startInlineEditing(block, bubble, maskContent, innerText);
                    } else {
                        uiSetRightTab('edit');
                        if (elements.editTranslatedText) elements.editTranslatedText.focus();
                    }
                    return;
                }
                lastTouchTime = now;
                startBlockDrag(e, block);
            }, { passive: false });

            const handleSW = document.createElement('div');
            handleSW.className = "resize-handle resize-sw";
            handleSW.addEventListener('mousedown', (e) => startBlockResize(e, block, 'sw'));
            handleSW.addEventListener('touchstart', (e) => startBlockResize(e, block, 'sw'), { passive: false });

            const handleSE = document.createElement('div');
            handleSE.className = "resize-handle resize-se";
            handleSE.addEventListener('mousedown', (e) => startBlockResize(e, block, 'se'));
            handleSE.addEventListener('touchstart', (e) => startBlockResize(e, block, 'se'), { passive: false });

            const handleNW = document.createElement('div');
            handleNW.className = "resize-handle resize-nw";
            handleNW.addEventListener('mousedown', (e) => startBlockResize(e, block, 'nw'));
            handleNW.addEventListener('touchstart', (e) => startBlockResize(e, block, 'nw'), { passive: false });

            const handleNE = document.createElement('div');
            handleNE.className = "resize-handle resize-ne";
            handleNE.addEventListener('mousedown', (e) => startBlockResize(e, block, 'ne'));
            handleNE.addEventListener('touchstart', (e) => startBlockResize(e, block, 'ne'), { passive: false });

            bubble.appendChild(handleSW);
            bubble.appendChild(handleSE);
            bubble.appendChild(handleNW);
            bubble.appendChild(handleNE);
        }

        textsLayer.appendChild(bubble);
    });

    container.appendChild(coversLayer);
    container.appendChild(textsLayer);
}

export function convertHexToRGBA(hex: string, alpha: number): string {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    if (!text) return [];
    const rawLines = text.split('\n');
    const resultLines: string[] = [];

    for (const line of rawLines) {
        const trimmed = line.trim();
        if (!trimmed) {
            resultLines.push('');
            continue;
        }

        const spaceTokens = trimmed.split(/\s+/);
        const words: string[] = [];

        for (const token of spaceTokens) {
            if (!token) continue;
            const parts = token.split(/([-–—])/);
            let subWord = '';
            for (let p = 0; p < parts.length; p++) {
                const part = parts[p];
                if (!part) continue;
                subWord += part;
                if (part === '-' || part === '–' || part === '—' || p === parts.length - 1) {
                    words.push(subWord);
                    subWord = '';
                }
            }
        }

        if (words.length === 0) continue;

        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const needsSpace = !currentLine.endsWith('-') && !currentLine.endsWith('–') && !currentLine.endsWith('—');
            const testLine = needsSpace ? currentLine + ' ' + word : currentLine + word;
            const measureLine = stripRichTextTags(testLine);

            if (ctx.measureText(measureLine).width <= maxWidth) {
                currentLine = testLine;
            } else {
                resultLines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) {
            resultLines.push(currentLine);
        }
    }
    return resultLines;
}

export interface MeasuredWordToken {
    text: string;
    raw: string;
    width: number;
    style: {
        font?: string | null;
        fontFamily?: string | null;
        fontSize?: number;
        sizeRatio?: number;
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        strikethrough?: boolean;
        color?: string | null;
    };
    spaceWidth: number;
}

let measureCanvas: HTMLCanvasElement | null = null;
let measureCtx: CanvasRenderingContext2D | null = null;

export function getMeasureContext(): CanvasRenderingContext2D | null {
    if (!measureCtx && typeof document !== 'undefined') {
        try {
            measureCanvas = document.createElement('canvas');
            measureCtx = measureCanvas.getContext('2d');
        } catch (e) {
            measureCtx = null;
        }
    }
    return measureCtx;
}

export const BUILTIN_FONT_MAP: Record<string, string> = {
    'font-comic': "'Patrick Hand', 'Pangolin', cursive",
    'font-manga': "'Nunito', sans-serif",
    'font-vietnamese': "'Be Vietnam Pro', 'Inter', sans-serif",
    'font-comicneue': "'Comic Neue', cursive",
    'font-impact': "'Bangers', cursive",
    'font-marker': "'Permanent Marker', cursive",
    'font-bungee': "'Bungee', cursive",
    'font-caveat': "'Caveat', cursive",
    'font-tech': "'Chakra Petch', sans-serif",
    'font-condensed': "'Saira Condensed', sans-serif",
    'font-sans': 'sans-serif'
};

export function buildFontString(style: any = {}, baseFontSize: number = 16, baseFontFamily: string = 'sans-serif'): string {
    const fontStyle = style.italic ? 'italic ' : 'normal ';
    const fontWeight = style.bold ? 'bold ' : 'normal ';
    const sizeRatio = typeof style.sizeRatio === 'number' ? style.sizeRatio : 1.0;
    const fontSize = Math.max(1, Math.round((style.fontSize || baseFontSize) * sizeRatio));
    let fontFam = style.font || style.fontFamily || baseFontFamily || 'sans-serif';
    if (BUILTIN_FONT_MAP[fontFam]) {
        fontFam = BUILTIN_FONT_MAP[fontFam];
    }
    return `${fontStyle}${fontWeight}${fontSize}px ${fontFam}`.trim();
}

/**
 * Calculate diamond / oval width profile factors for N lines.
 * For 5 lines with standard aspect ratio: [0.55, 0.82, 1.00, 0.82, 0.55].
 * Dynamically adjusts edge tapering based on box aspect ratio (boxW / boxH).
 */
export function getDiamondWidthProfile(numLines: number, boxAspect: number = 0.85): number[] {
    if (numLines <= 0) return [];
    if (numLines === 1) return [1.0];
    if (numLines === 2) {
        const base2 = Math.min(0.95, Math.max(0.70, 0.82 + 0.1 * (boxAspect - 0.85)));
        return [Number(base2.toFixed(2)), Number(base2.toFixed(2))];
    }

    // Edge taper factor adjusted by aspect ratio (standard = 0.55 for 0.85 aspect)
    const beta = Math.min(0.75, Math.max(0.42, 0.55 + 0.15 * (boxAspect - 0.85)));
    const p = 1.321928; // Calibrated for [0.55, 0.82, 1.00, 0.82, 0.55] when N = 5

    const profile: number[] = [];
    const n = numLines;
    for (let i = 0; i < n; i++) {
        const y = (2 * i) / (n - 1) - 1; // Range [-1.0, 1.0]
        const val = 1.0 - (1.0 - beta) * Math.pow(Math.abs(y), p);
        profile.push(Number(val.toFixed(2)));
    }
    return profile;
}

export function measureWordTokens(
    text: string,
    baseStyle: any = {},
    customCtx: CanvasRenderingContext2D | null = null
): MeasuredWordToken[] {
    if (!text) return [];
    const cleanText = text.replace(/\r\n/g, ' ').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) return [];

    const tokenLines = parseRichTextLines(cleanText, baseStyle);
    const tokens = tokenLines.flat();
    if (tokens.length === 0) return [];

    const ctx = customCtx || getMeasureContext();
    const baseFontSize = baseStyle.baseFontSize || baseStyle.fontSize || 16;
    const baseFontFamily = baseStyle.fontFamily || 'sans-serif';
    const baseLetterSpacing = typeof baseStyle.letterSpacing === 'number' ? baseStyle.letterSpacing : 0;

    const words: MeasuredWordToken[] = [];

    tokens.forEach(tok => {
        const segs = tok.text.trim().split(/\s+/);
        segs.forEach((seg: string) => {
            if (!seg) return;

            let tagPrefix = '';
            let tagSuffix = '';
            if (tok.bold && !baseStyle.bold) { tagPrefix += '[b]'; tagSuffix = '[/b]' + tagSuffix; }
            if (tok.italic && !baseStyle.italic) { tagPrefix += '[i]'; tagSuffix = '[/i]' + tagSuffix; }
            if (tok.underline && !baseStyle.underline) { tagPrefix += '[u]'; tagSuffix = '[/u]' + tagSuffix; }
            if (tok.strikethrough && !baseStyle.strikethrough) { tagPrefix += '[s]'; tagSuffix = '[/s]' + tagSuffix; }
            if (tok.color && tok.color !== baseStyle.color && tok.color !== baseStyle.textColor) { tagPrefix += `[color=${tok.color}]`; tagSuffix = '[/color]' + tagSuffix; }
            if (tok.sizeRatio && tok.sizeRatio !== 1 && tok.sizeRatio !== baseStyle.sizeRatio) {
                tagPrefix += `[size=${Math.round(tok.sizeRatio * 100)}%]`;
                tagSuffix = '[/size]' + tagSuffix;
            }
            if (tok.font && tok.font !== baseStyle.font && tok.font !== baseStyle.fontFamily) { tagPrefix += `[font=${tok.font}]`; tagSuffix = '[/font]' + tagSuffix; }

            const sizeRatio = tok.sizeRatio || 1.0;
            const wordStyle = {
                bold: !!tok.bold || !!baseStyle.bold,
                italic: !!tok.italic || !!baseStyle.italic,
                underline: !!tok.underline || !!baseStyle.underline,
                strikethrough: !!tok.strikethrough || !!baseStyle.strikethrough,
                color: tok.color || null,
                sizeRatio: sizeRatio,
                font: tok.font || null,
                fontFamily: tok.font || baseFontFamily,
                fontSize: baseFontSize,
                letterSpacing: baseLetterSpacing
            };

            const effLetterSpacing = baseLetterSpacing * sizeRatio;
            const charCount = Array.from(seg).length;
            const extraLetterSpacing = Math.max(0, charCount - 1) * effLetterSpacing;

            let width = 0;
            let spaceWidth = 0;

            if (ctx) {
                const prevFont = ctx.font;
                const fontStr = buildFontString(wordStyle, baseFontSize, baseFontFamily);
                ctx.font = fontStr;
                width = ctx.measureText(seg).width + extraLetterSpacing;
                spaceWidth = ctx.measureText(' ').width + effLetterSpacing;
                ctx.font = prevFont;
            } else {
                // Secondary engine: autoFitRuler DOM measurement (same engine as autoFitBlock)
                const ruler = typeof document !== 'undefined' ? (elements.autoFitRuler || document.getElementById('auto-fit-ruler')) : null;
                if (ruler) {
                    const prevFont = ruler.style.font;
                    const prevLetterSpacing = ruler.style.letterSpacing;
                    ruler.style.font = buildFontString(wordStyle, baseFontSize, baseFontFamily);
                    ruler.style.letterSpacing = `${effLetterSpacing}px`;
                    ruler.textContent = seg;
                    width = ruler.scrollWidth || ruler.getBoundingClientRect().width;
                    ruler.textContent = ' ';
                    spaceWidth = ruler.scrollWidth || ruler.getBoundingClientRect().width;
                    ruler.style.font = prevFont;
                    ruler.style.letterSpacing = prevLetterSpacing;
                } else {
                    const effSize = baseFontSize * sizeRatio;
                    width = Array.from(seg).length * (effSize * 0.6) + extraLetterSpacing;
                    spaceWidth = effSize * 0.35 + effLetterSpacing;
                }
            }

            words.push({
                text: seg,
                raw: `${tagPrefix}${seg}${tagSuffix}`,
                width: Math.max(1, width),
                style: wordStyle,
                spaceWidth: Math.max(1, spaceWidth)
            });
        });
    });

    return words;
}

export function wrapCanvasDiamondText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxW: number,
    maxH: number,
    lineHeight: number = 20,
    baseStyle: any = {}
): string[] {
    if (!text) return [];
    const normalized = text.replace(/\r\n/g, '\n');
    const rawParagraphs = normalized.split('\n');
    const resultLines: string[] = [];

    for (const para of rawParagraphs) {
        const trimmed = para.trim();
        if (!trimmed) {
            resultLines.push('');
            continue;
        }

        // Diamond pipeline: Text -> Measure actual width -> Diamond profile -> Optimal DP Partition
        const balanced = balanceSingleParagraphToDiamond(trimmed, maxW, maxH, {
            ...baseStyle,
            lineHeight: lineHeight / (baseStyle.fontSize || 16)
        });
        const paraLines = balanced.split('\n');
        resultLines.push(...paraLines);
    }

    return resultLines;
}

export function wrapCanvasVerticalText(text: string, maxHeight: number, fontSizePx: number): string[][] {
    if (!text) return [];
    const charStep = fontSizePx * 1.12;
    const maxCharsPerCol = Math.max(1, Math.floor(maxHeight / charStep));
    const paragraphs = text.split('\n');
    const columns: string[][] = [];

    for (const para of paragraphs) {
        if (!para.trim()) {
            columns.push([]);
            continue;
        }

        const normPara = String(para.trim() || '').normalize('NFC');
        const chars = (typeof Intl !== 'undefined' && (Intl as any).Segmenter)
            ? Array.from(new (Intl as any).Segmenter().segment(normPara)).map((s: any) => s.segment)
            : Array.from(normPara);
        let currentCol: string[] = [];

        for (const char of chars) {
            if (currentCol.length >= maxCharsPerCol) {
                columns.push(currentCol);
                currentCol = [];
            }
            currentCol.push(char as string);
        }
        if (currentCol.length > 0) {
            columns.push(currentCol);
        }
    }

    return columns;
}

export function wrapRichTextTokens(
    ctx: CanvasRenderingContext2D,
    tokenLines: any[][],
    maxW: number,
    isDiamond: boolean = false,
    maxH: number = 200,
    lineHeight: number = 20,
    getFontFn: ((token: any) => string) | null = null
): any[][] {
    if (!tokenLines || tokenLines.length === 0) return [];
    const wrappedLines: any[][] = [];

    for (const lineTokens of tokenLines) {
        if (!lineTokens || lineTokens.length === 0) {
            wrappedLines.push([]);
            continue;
        }

        const wordTokens: any[] = [];
        for (const tok of lineTokens) {
            if (!tok.text) continue;
            const spaceChunks = tok.text.split(/(\s+)/);
            for (const chunk of spaceChunks) {
                if (!chunk) continue;
                if (/^\s+$/.test(chunk)) {
                    wordTokens.push({
                        text: chunk,
                        isSpace: true,
                        bold: !!tok.bold,
                        italic: !!tok.italic,
                        underline: !!tok.underline,
                        strikethrough: !!tok.strikethrough,
                        color: tok.color || null,
                        sizeRatio: tok.sizeRatio || 1.0,
                        font: tok.font || null
                    });
                } else {
                    const subParts = chunk.split(/([-–—/])/);
                    let acc = '';
                    for (let p = 0; p < subParts.length; p++) {
                        const part = subParts[p];
                        if (!part) continue;
                        acc += part;
                        if (part === '-' || part === '–' || part === '—' || part === '/' || p === subParts.length - 1) {
                            wordTokens.push({
                                text: acc,
                                isSpace: false,
                                bold: !!tok.bold,
                                italic: !!tok.italic,
                                underline: !!tok.underline,
                                strikethrough: !!tok.strikethrough,
                                color: tok.color || null,
                                sizeRatio: tok.sizeRatio || 1.0,
                                font: tok.font || null
                            });
                            acc = '';
                        }
                    }
                }
            }
        }

        if (wordTokens.length === 0) {
            wrappedLines.push([]);
            continue;
        }

        const measureTokenWidth = (wt: any) => {
            if (getFontFn) {
                const prevFont = ctx.font;
                ctx.font = getFontFn(wt);
                const w = ctx.measureText(wt.text).width;
                ctx.font = prevFont;
                return w;
            }
            return ctx.measureText(wt.text).width;
        };

        const onlyWords = wordTokens.filter(wt => !wt.isSpace);
        const totalCleanWidth = onlyWords.reduce((acc, wt) => acc + measureTokenWidth(wt), 0);
        const avgAvailableWidth = maxW * 0.78;
        let targetLines = isDiamond
            ? Math.max(2, Math.min(Math.floor(maxH / Math.max(1, lineHeight)), Math.ceil(totalCleanWidth / Math.max(10, avgAvailableWidth))))
            : 1;

        if (isDiamond) {
            while (targetLines < onlyWords.length && (targetLines * lineHeight) < (totalCleanWidth / targetLines)) {
                targetLines++;
            }
            targetLines = Math.max(2, Math.min(onlyWords.length, targetLines));
        }

        const boxAspect = (maxW && maxH && maxH > 0) ? (maxW / maxH) : 0.85;
        const profile = isDiamond ? getDiamondWidthProfile(targetLines, boxAspect) : [];

        let currentLine: any[] = [];
        let currentLineWidth = 0;
        let currentLineIdx = 0;

        const getLineMaxW = (idx: number) => {
            if (!isDiamond) return maxW;
            const factor = profile[Math.min(idx, profile.length - 1)] || 0.8;
            return Math.max(20, maxW * factor);
        };

        // Strict whitespace logic: space is only a separator, not a token that permits overflow
        let pendingSpaceToken: any = null;

        for (let i = 0; i < wordTokens.length; i++) {
            const wt = wordTokens[i];

            if (wt.isSpace) {
                if (currentLine.length > 0) {
                    pendingSpaceToken = wt;
                }
                continue;
            }

            const wordW = measureTokenWidth(wt);
            const spaceW = pendingSpaceToken ? measureTokenWidth(pendingSpaceToken) : 0;
            const lineMaxW = getLineMaxW(currentLineIdx);

            if (currentLine.length === 0) {
                currentLine.push(wt);
                currentLineWidth = wordW;
                pendingSpaceToken = null;
            } else if (currentLineWidth + spaceW + wordW <= lineMaxW) {
                if (pendingSpaceToken) {
                    currentLine.push(pendingSpaceToken);
                    currentLineWidth += spaceW;
                    pendingSpaceToken = null;
                }
                currentLine.push(wt);
                currentLineWidth += wordW;
            } else {
                wrappedLines.push(currentLine);
                currentLine = [wt];
                currentLineWidth = wordW;
                currentLineIdx++;
                pendingSpaceToken = null;
            }
        }

        if (currentLine.length > 0) {
            wrappedLines.push(currentLine);
        }
    }

    return wrappedLines;
}

/**
 * Partition words into K lines matching target line widths using Dynamic Programming.
 * 
 * Priorities:
 * 1. Asymmetric penalty for exceeding target width (do not overflow target width excessively).
 * 2. High fidelity to target width profile (minimize variance from targetWidths[line]).
 * 3. Anti-single-word penalty (avoid lines with only 1 word unless necessary).
 * 4. Anti-too-short penalty (avoid lines that are excessively short / hollow).
 * 5. Strict word boundary preservation (never split words).
 */
export function partitionWordsToTargetWidths(
    words: MeasuredWordToken[],
    targetWidths: number[],
    avgSpaceWidth: number = 6
): string[] {
    const n = words.length;
    const k = targetWidths.length;

    if (k <= 0 || n <= 0) return [];
    if (k === 1 || n === 1) return [words.map(w => w.raw).join(' ')];
    if (k >= n) return words.map(w => w.raw);

    // Precompute prefix sums of word widths for O(1) range queries
    const prefixWidth = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
        prefixWidth[i + 1] = prefixWidth[i] + words[i].width;
    }

    const getLineWidth = (start: number, end: number): number => {
        if (start >= end) return 0;
        const wordsW = prefixWidth[end] - prefixWidth[start];
        const spacesW = (end - start - 1) * avgSpaceWidth;
        return wordsW + spacesW;
    };

    // DP table: dp[lineIdx][wordIdx] = minimum cost
    // parent[lineIdx][wordIdx] = starting word index p for this line
    const dp: number[][] = Array.from({ length: k + 1 }, () => Array(n + 1).fill(Infinity));
    const parent: number[][] = Array.from({ length: k + 1 }, () => Array(n + 1).fill(-1));

    dp[0][0] = 0;

    for (let line = 1; line <= k; line++) {
        const targetW = Math.max(1, targetWidths[line - 1]);
        const isLastLine = (line === k);
        const isFirstLine = (line === 1);

        for (let i = line; i <= n - (k - line); i++) {
            for (let p = line - 1; p < i; p++) {
                if (dp[line - 1][p] === Infinity) continue;

                const actualW = getLineWidth(p, i);
                const wordCountInLine = i - p;
                if (wordCountInLine <= 0) continue;

                let cost = 0;

                // Priority 2: Base profile fidelity (squared normalized difference)
                const diff = (actualW - targetW) / targetW;
                cost += diff * diff * 1000;

                // Priority 1: Heavy asymmetric penalty for overflowing target width
                if (actualW > targetW) {
                    const overflowRatio = (actualW - targetW) / targetW;
                    cost += overflowRatio * 1500;
                    if (overflowRatio > 0.25) {
                        cost += Math.pow(overflowRatio, 2) * 5000;
                    }
                    if (overflowRatio > 0.50) {
                        cost += 10000; // severe overflow penalty
                    }
                }

                // Priority 3: Avoid 1-word lines if total words >= 4
                if (wordCountInLine === 1 && n >= 4) {
                    if (isLastLine) {
                        cost += 1500; // anti-orphan on last line
                    } else if (isFirstLine) {
                        cost += 900;
                    } else {
                        cost += 700;
                    }
                }

                // Priority 4: Avoid too short / hollow lines (< 50% of target width)
                if (actualW < targetW * 0.50) {
                    const underflowRatio = (targetW * 0.50 - actualW) / targetW;
                    cost += Math.pow(underflowRatio, 2) * 3000;
                }

                const totalCost = dp[line - 1][p] + cost;
                if (totalCost < dp[line][i]) {
                    dp[line][i] = totalCost;
                    parent[line][i] = p;
                }
            }
        }
    }

    // Reconstruct lines from DP parents
    const resultLines: string[] = [];
    let curr = n;
    for (let line = k; line >= 1; line--) {
        const p = parent[line][curr];
        if (p === -1) break;
        const lineWords = words.slice(p, curr);
        resultLines.unshift(lineWords.map(w => w.raw).join(' '));
        curr = p;
    }

    if (resultLines.length === 0 || curr > 0) {
        return [words.map(w => w.raw).join(' ')];
    }

    return resultLines;
}

export function partitionWordsToStandardLines(
    words: MeasuredWordToken[],
    k: number,
    avgSpaceWidth: number = 6
): string[] {
    const n = words.length;
    if (k <= 1 || n <= 1) {
        return [words.map(w => w.raw).join(' ')];
    }
    if (k >= n) {
        return words.map(w => w.raw);
    }

    const totalWordsWidth = words.reduce((sum, w) => sum + w.width, 0);
    const totalTextWidth = totalWordsWidth + (n - 1) * avgSpaceWidth;
    const targetWidth = totalTextWidth / k;
    const targetWidths = Array(k).fill(targetWidth);

    return partitionWordsToTargetWidths(words, targetWidths, avgSpaceWidth);
}

export function partitionWordsToDiamondLines(
    words: MeasuredWordToken[],
    k: number,
    boxAspect: number = 0.85,
    avgSpaceWidth: number = 6
): string[] {
    const n = words.length;
    if (k <= 1 || n <= 1) {
        return [words.map(w => w.raw).join(' ')];
    }
    if (k >= n) {
        return words.map(w => w.raw);
    }

    const totalWordsWidth = words.reduce((sum, w) => sum + w.width, 0);
    const totalTextWidth = totalWordsWidth + (n - 1) * avgSpaceWidth;

    const profile = getDiamondWidthProfile(k, boxAspect);
    const totalWeight = profile.reduce((a, b) => a + b, 0);
    const targetWidths = profile.map(w => (w / totalWeight) * totalTextWidth);

    return partitionWordsToTargetWidths(words, targetWidths, avgSpaceWidth);
}

export function balanceSingleParagraphToBox(
    text: string,
    boxW: number | null = null,
    boxH: number | null = null,
    styleOptions: any = {}
): string {
    if (!text) return '';
    const cleanText = text.replace(/\r\n/g, ' ').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) return '';

    const words = measureWordTokens(cleanText, styleOptions);
    const wordCount = words.length;
    if (wordCount <= 1) return words.map(w => w.raw).join(' ');

    const boxAspect = (boxW && boxH && boxH > 0) ? (boxW / boxH) : 0.85;
    const avgSpaceWidth = words.reduce((acc, w) => acc + w.spaceWidth, 0) / wordCount;
    const totalWordsWidth = words.reduce((acc, w) => acc + w.width, 0);
    const totalTextWidth = totalWordsWidth + (wordCount - 1) * avgSpaceWidth;
    const totalCleanChars = words.reduce((sum, w) => sum + w.text.length, 0) + (wordCount - 1);

    const baseFontSize = styleOptions.baseFontSize || styleOptions.fontSize || 16;
    const lineHeight = (styleOptions.lineHeight !== undefined ? styleOptions.lineHeight : 1.18) * baseFontSize;

    // ==========================================
    // EXTREME CASES:
    // 1. Extreme Tall / Narrow (boxAspect <= 0.28): 1 word per line (1 vertical column)
    // 2. Extreme Wide (boxAspect >= 2.4 or boxAspect >= 1.8 with short-medium text): 1 single horizontal row
    // ==========================================
    if (boxAspect <= 0.28 && wordCount >= 2) {
        return words.map(w => w.raw).join('\n');
    }
    if ((boxAspect >= 2.4 || (boxAspect >= 1.8 && wordCount <= 8)) && wordCount >= 2) {
        return words.map(w => w.raw).join(' ');
    }

    // ==========================================
    // TIER 1: Ultra Short (2 - 3 words)
    // ==========================================
    if (wordCount <= 3) {
        if (wordCount === 2) {
            if (boxAspect < 0.6) {
                return `${words[0].raw}\n${words[1].raw}`;
            }
            return words.map(w => w.raw).join(' ');
        }
        if (wordCount === 3) {
            if (boxAspect < 0.4) {
                return `${words[0].raw}\n${words[1].raw}\n${words[2].raw}`;
            }
            if (boxAspect >= 1.1 || (totalCleanChars <= 12 && boxAspect >= 0.85)) {
                return words.map(w => w.raw).join(' ');
            }
            const len1 = words[0].width + words[1].width;
            const len2 = words[1].width + words[2].width;
            if (len1 <= len2) {
                return `${words[0].raw} ${words[1].raw}\n${words[2].raw}`;
            } else {
                return `${words[0].raw}\n${words[1].raw} ${words[2].raw}`;
            }
        }
    }

    // ==========================================
    // TIER 2 & 3: Multi-word text (>= 4 words)
    // Determine candidate line range [minLines, maxAllowedLines] based on boxAspect
    // ==========================================
    let minLines = 2;
    let maxAllowedLines = 3;

    if (boxAspect < 0.38) {
        // Very tall narrow box -> allow up to 1 word per line
        minLines = Math.min(wordCount, Math.max(3, Math.ceil(wordCount / 2.0)));
        maxAllowedLines = wordCount;
    } else if (boxAspect < 0.75) {
        // Moderate vertical box (e.g. standard tall manga oval bubble)
        minLines = Math.min(wordCount, Math.max(2, Math.ceil(wordCount / 3.5)));
        maxAllowedLines = Math.min(wordCount, Math.max(minLines, Math.ceil(wordCount / 2.4)));
    } else if (boxAspect < 1.40) {
        // Standard balanced box
        minLines = Math.min(wordCount, Math.max(2, Math.ceil(wordCount / 4.5)));
        maxAllowedLines = Math.min(wordCount, Math.max(minLines, Math.ceil(wordCount / 3.0)));
    } else if (boxAspect < 2.40) {
        // Wide box
        minLines = 1;
        maxAllowedLines = Math.min(wordCount, Math.max(1, Math.ceil(wordCount / 4.5)));
    } else {
        // Very wide box
        minLines = 1;
        maxAllowedLines = 1;
    }

    minLines = Math.max(1, Math.min(minLines, wordCount));
    maxAllowedLines = Math.max(minLines, Math.min(maxAllowedLines, wordCount));

    let bestNumLines = minLines;
    let bestScore = Infinity;

    for (let k = minLines; k <= maxAllowedLines; k++) {
        const candidateLines = partitionWordsToStandardLines(words, k, avgSpaceWidth);
        let maxLineWidth = 0;
        let wordIdx = 0;
        candidateLines.forEach(lineStr => {
            const segs = lineStr.split(' ');
            const lineTokens = words.slice(wordIdx, wordIdx + segs.length);
            const lineW = lineTokens.reduce((sum, t) => sum + t.width, 0) + (lineTokens.length - 1) * avgSpaceWidth;
            if (lineW > maxLineWidth) maxLineWidth = lineW;
            wordIdx += segs.length;
        });

        const estHeight = k * lineHeight;
        const candidateTextAspect = maxLineWidth / Math.max(1, estHeight);

        let score = 0;
        const aspectDiff = (candidateTextAspect - boxAspect) / Math.max(0.2, boxAspect);
        score += aspectDiff * aspectDiff * 25;

        if (boxW && boxH && boxH > 0) {
            const availableW = boxW * 0.9;
            const availableH = boxH * 0.9;
            const widthFill = maxLineWidth / Math.max(1, availableW);
            const heightFill = estHeight / Math.max(1, availableH);

            if (widthFill > 1.0) {
                score += (widthFill - 1.0) * 350;
            }
            if (heightFill > 1.0) {
                score += (heightFill - 1.0) * 350;
            }
            const fillImbalance = Math.abs(widthFill - heightFill);
            score += fillImbalance * 20;
        }

        if (score < bestScore) {
            bestScore = score;
            bestNumLines = k;
        }
    }

    const finalLines = partitionWordsToStandardLines(words, bestNumLines, avgSpaceWidth);
    return finalLines.join('\n');
}

export function balanceTextToBox(
    text: string,
    boxW: number | null = null,
    boxH: number | null = null,
    styleOptions: any = {}
): string {
    if (!text) return '';
    const normalized = text.replace(/\r\n/g, '\n');
    if (!normalized.trim()) return '';

    if (normalized.includes('\n')) {
        const paragraphs = normalized.split('\n');
        const balancedParagraphs = paragraphs.map(p => {
            const trimmed = p.trim();
            if (!trimmed) return '';
            const words = trimmed.split(/\s+/);
            if (words.length >= 7) {
                return balanceSingleParagraphToBox(trimmed, boxW, boxH, styleOptions);
            }
            return trimmed;
        });
        return balancedParagraphs.join('\n');
    }

    return balanceSingleParagraphToBox(normalized.trim(), boxW, boxH, styleOptions);
}

export function balanceSingleParagraphToDiamond(
    text: string,
    boxW: number | null = null,
    boxH: number | null = null,
    styleOptions: any = {}
): string {
    if (!text) return '';
    const cleanText = text.replace(/\r\n/g, ' ').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) return '';

    const words = measureWordTokens(cleanText, styleOptions);
    const wordCount = words.length;
    if (wordCount <= 1) return words.map(w => w.raw).join(' ');

    const boxAspect = (boxW && boxH && boxH > 0) ? (boxW / boxH) : 0.85;
    const avgSpaceWidth = words.reduce((acc, w) => acc + w.spaceWidth, 0) / wordCount;
    const totalWordsWidth = words.reduce((acc, w) => acc + w.width, 0);
    const totalTextWidth = totalWordsWidth + (wordCount - 1) * avgSpaceWidth;
    const totalCleanChars = words.reduce((sum, w) => sum + w.text.length, 0) + (wordCount - 1);

    const baseFontSize = styleOptions.baseFontSize || styleOptions.fontSize || 16;
    const lineHeight = (styleOptions.lineHeight !== undefined ? styleOptions.lineHeight : 1.18) * baseFontSize;

    // ==========================================
    // TIER 1: Siêu ngắn (1 - 3 từ)
    // ==========================================
    // - Dưới 14 ký tự (VD: "Cảm ơn!", "Đi thôi nào!", "Thật vậy sao?"): giữ 1 dòng duy nhất để chữ to tròn, nằm giữa bóng thoại
    // - Nếu dài hơn: chia tối đa 2 dòng. Tuyệt đối KHÔNG chia 3 dòng 1 chữ.
    if (wordCount <= 3) {
        if (totalCleanChars <= 14 || wordCount === 2) {
            if (boxAspect < 0.45 && wordCount === 2) {
                return `${words[0].raw}\n${words[1].raw}`;
            }
            if (totalCleanChars <= 14 || totalTextWidth < 180 || boxAspect >= 0.75) {
                return words.map(w => w.raw).join(' ');
            }
            return `${words[0].raw}\n${words[1].raw}`;
        }
        if (wordCount === 3) {
            const len1 = words[0].width + words[1].width;
            const len2 = words[1].width + words[2].width;
            if (len1 <= len2) {
                return `${words[0].raw} ${words[1].raw}\n${words[2].raw}`;
            } else {
                return `${words[0].raw}\n${words[1].raw} ${words[2].raw}`;
            }
        }
    }

    // ==========================================
    // TIER 2: Ngắn (4 - 6 từ)
    // ==========================================
    // - Dáng Oval nhẹ tự nhiên (2 - 3 dòng). Dòng dài nhất phải có ít nhất 2 từ.
    if (wordCount <= 6) {
        let candidateLines = 2;
        if (wordCount >= 5 && (totalCleanChars >= 22 || totalTextWidth >= 220)) {
            candidateLines = 3;
        }
        if (boxAspect < 0.65) {
            candidateLines = Math.min(3, Math.ceil(wordCount / 2));
        }

        const lines = partitionWordsToDiamondLines(words, candidateLines, boxAspect, avgSpaceWidth);
        return lines.join('\n');
    }

    // ==========================================
    // TIER 3: Trung bình & Dài (>= 7 từ)
    // ==========================================
    let minLines = 3;
    let maxAllowedLines = 4;

    if (boxAspect < 0.55) {
        // Very tall box (vertical/narrow bubble): allow more lines with fewer words per line
        minLines = Math.min(wordCount, Math.max(3, Math.ceil(wordCount / 3)));
        maxAllowedLines = Math.min(wordCount, Math.max(minLines, Math.ceil(wordCount / 1.7)));
    } else if (boxAspect < 0.70) {
        // Moderate vertical bubble
        minLines = 3;
        maxAllowedLines = Math.min(wordCount, Math.max(4, Math.ceil(wordCount / 2.2)));
    } else if (boxAspect > 1.4) {
        // Wide horizontal bubble: prefer fewer wider lines
        minLines = 2;
        maxAllowedLines = Math.min(wordCount, Math.max(3, Math.ceil(wordCount / 3.5)));
    } else {
        // Standard bubble (0.70 - 1.4)
        if (wordCount >= 14 && wordCount < 22) {
            minLines = 3;
            maxAllowedLines = 5;
        } else if (wordCount >= 22) {
            minLines = 4;
            maxAllowedLines = Math.min(wordCount, Math.max(5, Math.ceil(wordCount / 3)));
        }
    }

    let bestNumLines = minLines;
    let bestScore = Infinity;

    for (let k = minLines; k <= maxAllowedLines; k++) {
        const candidateLines = partitionWordsToDiamondLines(words, k, boxAspect, avgSpaceWidth);
        let maxLineWidth = 0;
        let wordIdx = 0;
        candidateLines.forEach(lineStr => {
            const segs = lineStr.split(' ');
            const lineTokens = words.slice(wordIdx, wordIdx + segs.length);
            const lineW = lineTokens.reduce((sum, t) => sum + t.width, 0) + (lineTokens.length - 1) * avgSpaceWidth;
            if (lineW > maxLineWidth) maxLineWidth = lineW;
            wordIdx += segs.length;
        });

        const estHeight = k * lineHeight;
        const candidateTextAspect = maxLineWidth / Math.max(1, estHeight);

        let score = 0;
        const aspectDiff = (candidateTextAspect - boxAspect) / boxAspect;
        score += aspectDiff * aspectDiff * 100;

        if (boxW && boxH && boxH > 0) {
            const availableW = boxW * 0.9;
            const availableH = boxH * 0.9;
            const widthFill = maxLineWidth / Math.max(1, availableW);
            const heightFill = estHeight / Math.max(1, availableH);

            if (widthFill > 1.0) {
                score += (widthFill - 1.0) * 150;
            }
            const fillImbalance = Math.abs(widthFill - heightFill);
            score += fillImbalance * 80;
        }

        if (score < bestScore) {
            bestScore = score;
            bestNumLines = k;
        }
    }

    const finalLines = partitionWordsToDiamondLines(words, bestNumLines, boxAspect, avgSpaceWidth);
    return finalLines.join('\n');
}

export function balanceTextToDiamond(
    text: string,
    boxW: number | null = null,
    boxH: number | null = null,
    styleOptions: any = {}
): string {
    if (!text) return '';
    const normalized = text.replace(/\r\n/g, '\n');
    if (!normalized.trim()) return '';

    // Preserve user manual line breaks (\n): balance each paragraph independently
    if (normalized.includes('\n')) {
        const paragraphs = normalized.split('\n');
        const balancedParagraphs = paragraphs.map(p => {
            const trimmed = p.trim();
            if (!trimmed) return '';
            return balanceSingleParagraphToDiamond(trimmed, boxW, boxH, styleOptions);
        });
        return balancedParagraphs.join('\n');
    }

    return balanceSingleParagraphToDiamond(normalized.trim(), boxW, boxH, styleOptions);
}

export function balanceBlockDiamond(block: MangaBlock): void {
    if (!block || block.type === 'image' || block.type === 'sfx') return;
    if (!block.style) block.style = {} as any;
    block.style.diamondWrap = true;
    const cleanText = (block.translated || '').replace(/\r\n/g, ' ').replace(/\n+/g, ' ').trim();
    const imgEl = typeof document !== 'undefined' ? (elements.mangaBgImage || document.querySelector('#manga-bg-image')) as HTMLImageElement | null : null;
    const naturalW = (imgEl && imgEl.naturalWidth > 0) ? imgEl.naturalWidth : 800;
    const naturalH = (imgEl && imgEl.naturalHeight > 0) ? imgEl.naturalHeight : 1200;
    const pixelW = block.box ? (block.box.w / 100) * naturalW : 200;
    const pixelH = block.box ? (block.box.h / 100) * naturalH : 200;
    const formatted = balanceTextToDiamond(cleanText, pixelW, pixelH, block.style);
    block.translated = formatted;
    block.autoFitCache = null;
    block.maskCache = null;
}

export function applyDiamondFormat(): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block && page && block.type !== 'image' && block.type !== 'sfx') {
        if (!block.style) block.style = {} as any;
        block.style.diamondWrap = true;
        const cleanText = (block.translated || '').replace(/\r\n/g, ' ').replace(/\n+/g, ' ').trim();
        const imgEl = typeof document !== 'undefined' ? (elements.mangaBgImage || document.querySelector('#manga-bg-image')) as HTMLImageElement | null : null;
        const naturalW = (imgEl && imgEl.naturalWidth > 0) ? imgEl.naturalWidth : 800;
        const naturalH = (imgEl && imgEl.naturalHeight > 0) ? imgEl.naturalHeight : 1200;
        const pixelW = block.box ? (block.box.w / 100) * naturalW : 200;
        const pixelH = block.box ? (block.box.h / 100) * naturalH : 200;
        const formatted = balanceTextToDiamond(cleanText, pixelW, pixelH, block.style);
        block.translated = formatted;
        if (elements.editTranslatedText) {
            elements.editTranslatedText.value = formatted;
        }
        block.autoFitCache = null;
        block.maskCache = null;

        import('./canvas-styling').then(m => m.syncActiveBlockTranslation(formatted));
        requestOverlayRender();
        savePageToDB(page);
    }
}

export function batchDiamondBalanceAllPages(): void {
    if (!globalState.pages.length) {
        showToast("Chưa có trang truyện nào để cân đối layout.", "warn");
        return;
    }

    pushStateToHistory();
    let totalBalanced = 0;

    const imgEl = typeof document !== 'undefined' ? (elements.mangaBgImage || document.querySelector('#manga-bg-image')) as HTMLImageElement | null : null;
    const naturalW = (imgEl && imgEl.naturalWidth > 0) ? imgEl.naturalWidth : 800;
    const naturalH = (imgEl && imgEl.naturalHeight > 0) ? imgEl.naturalHeight : 1200;

    globalState.pages.forEach(page => {
        (page.blocks || []).forEach(block => {
            if (block.translated && block.type !== 'sfx' && !block.style?.vertical) {
                if (!block.style) block.style = {} as any;
                block.style.diamondWrap = true;
                const cleanText = block.translated.replace(/\r\n/g, ' ').replace(/\n+/g, ' ').trim();
                const pixelW = block.box ? (block.box.w / 100) * naturalW : null;
                const pixelH = block.box ? (block.box.h / 100) * naturalH : null;
                const balanced = balanceTextToDiamond(cleanText, pixelW, pixelH, block.style);
                if (balanced && balanced !== block.translated) {
                    block.translated = balanced;
                    block.autoFitCache = null;
                    if (globalState.autoFitEnabled) {
                        autoFitBlock(block);
                    }
                    totalBalanced++;
                }
            }
        });
        savePageToDB(page);
    });

    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    showToast(`⚡ Đã tự động cân đối layout Diamond cho ${totalBalanced} ô thoại trên toàn chương!`, "success");
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

