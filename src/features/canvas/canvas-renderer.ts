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
    const hasBubbleFit = page.blocks.some(block => (block.style.maskShape || 'bubble-fit') === 'bubble-fit');

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
                    const padY = forceExportScale !== 1 ? (bubblePxH * 0.09 * forceExportScale) : (bubblePxH * 0.09);
                    const padX = forceExportScale !== 1 ? (bubblePxW * 0.12 * forceExportScale) : (bubblePxW * 0.12);
                    maskContent.style.padding = `${padY}px ${padX}px`;
                }
            } else {
                const padY = forceExportScale !== 1 ? (bubblePxH * 0.09 * forceExportScale) : (bubblePxH * 0.09);
                const padX = forceExportScale !== 1 ? (bubblePxW * 0.12 * forceExportScale) : (bubblePxW * 0.12);
                maskContent.style.padding = `${padY}px ${padX}px`;
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

export function wrapCanvasDiamondText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxH: number, lineHeight: number = 20): string[] {
    if (!text) return [];
    const rawParagraphs = text.split('\n');
    const resultLines: string[] = [];

    for (const para of rawParagraphs) {
        const trimmed = para.trim();
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

        if (words.length <= 1) {
            resultLines.push(trimmed);
            continue;
        }

        const totalCleanWidth = words.reduce((acc, w) => acc + ctx.measureText(stripRichTextTags(w) + ' ').width, 0);
        const avgAvailableWidth = maxW * 0.76;
        let targetLines = Math.max(2, Math.min(Math.floor(maxH / Math.max(1, lineHeight)), Math.ceil(totalCleanWidth / Math.max(10, avgAvailableWidth))));
        targetLines = Math.max(2, Math.min(words.length, targetLines));

        let currentLine = words[0];
        let currentLineIdx = 0;

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const needsSpace = !currentLine.endsWith('-') && !currentLine.endsWith('–') && !currentLine.endsWith('—');
            const testLine = needsSpace ? currentLine + ' ' + word : currentLine + word;

            const normalizedY = targetLines > 1 ? -0.5 + (currentLineIdx + 0.5) / targetLines : 0;
            const widthFactor = Math.sqrt(Math.max(0.18, 1 - 4 * normalizedY * normalizedY));
            const lineMaxW = Math.max(20, maxW * widthFactor);

            const testMeasure = stripRichTextTags(testLine);
            if (ctx.measureText(testMeasure).width <= lineMaxW) {
                currentLine = testLine;
            } else {
                resultLines.push(currentLine);
                currentLine = word;
                currentLineIdx++;
            }
        }
        if (currentLine) {
            resultLines.push(currentLine);
        }
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

        const totalCleanWidth = wordTokens.reduce((acc, wt) => acc + measureTokenWidth(wt), 0);
        const avgAvailableWidth = maxW * 0.76;
        let targetLines = isDiamond
            ? Math.max(2, Math.min(Math.floor(maxH / Math.max(1, lineHeight)), Math.ceil(totalCleanWidth / Math.max(10, avgAvailableWidth))))
            : 1;

        let currentLine: any[] = [];
        let currentLineWidth = 0;
        let currentLineIdx = 0;

        const getLineMaxW = (idx: number) => {
            if (!isDiamond) return maxW;
            const normalizedY = targetLines > 1 ? -0.5 + (idx + 0.5) / targetLines : 0;
            const widthFactor = Math.sqrt(Math.max(0.18, 1 - 4 * normalizedY * normalizedY));
            return Math.max(20, maxW * widthFactor);
        };

        for (let i = 0; i < wordTokens.length; i++) {
            const wt = wordTokens[i];
            if (wt.isSpace && currentLine.length === 0) {
                continue;
            }

            const tokW = measureTokenWidth(wt);
            const lineMaxW = getLineMaxW(currentLineIdx);

            if (currentLine.length === 0 || (currentLineWidth + tokW <= lineMaxW) || wt.isSpace) {
                currentLine.push(wt);
                currentLineWidth += tokW;
            } else {
                while (currentLine.length > 0 && currentLine[currentLine.length - 1].isSpace) {
                    currentLine.pop();
                }
                wrappedLines.push(currentLine);
                currentLineIdx++;
                currentLine = wt.isSpace ? [] : [wt];
                currentLineWidth = wt.isSpace ? 0 : tokW;
            }
        }

        if (currentLine.length > 0) {
            while (currentLine.length > 0 && currentLine[currentLine.length - 1].isSpace) {
                currentLine.pop();
            }
            if (currentLine.length > 0) {
                wrappedLines.push(currentLine);
            }
        }
    }

    return wrappedLines;
}

export function balanceTextToDiamond(text: string, boxW: number | null = null, boxH: number | null = null): string {
    if (!text) return '';
    const cleanText = text.replace(/\r\n/g, ' ').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) return '';

    const tokenLines = parseRichTextLines(cleanText);
    const tokens = tokenLines.flat();
    if (tokens.length === 0) return cleanText;

    const wordsWithTags: Array<{ raw: string; clean: string }> = [];
    tokens.forEach(tok => {
        const segs = tok.text.trim().split(/\s+/);
        segs.forEach((seg: string) => {
            if (!seg) return;
            let tagPrefix = '';
            let tagSuffix = '';
            if (tok.bold) { tagPrefix += '[b]'; tagSuffix = '[/b]' + tagSuffix; }
            if (tok.italic) { tagPrefix += '[i]'; tagSuffix = '[/i]' + tagSuffix; }
            if (tok.underline) { tagPrefix += '[u]'; tagSuffix = '[/u]' + tagSuffix; }
            if (tok.strikethrough) { tagPrefix += '[s]'; tagSuffix = '[/s]' + tagSuffix; }
            if (tok.color) { tagPrefix += `[color=${tok.color}]`; tagSuffix = '[/color]' + tagSuffix; }
            if (tok.sizeRatio && tok.sizeRatio !== 1) {
                tagPrefix += `[size=${Math.round(tok.sizeRatio * 100)}%]`;
                tagSuffix = '[/size]' + tagSuffix;
            }
            if (tok.font) { tagPrefix += `[font=${tok.font}]`; tagSuffix = '[/font]' + tagSuffix; }
            wordsWithTags.push({
                raw: `${tagPrefix}${seg}${tagSuffix}`,
                clean: seg
            });
        });
    });

    const wordCount = wordsWithTags.length;
    if (wordCount <= 3) return wordsWithTags.map(w => w.raw).join(' ');

    let numLines = 3;
    if (wordCount <= 5) numLines = 2;
    else if (wordCount <= 10) numLines = 3;
    else if (wordCount <= 18) numLines = 4;
    else numLines = Math.min(5, Math.ceil(wordCount / 4));

    if (boxW && boxH && boxH > 0) {
        const aspect = boxW / boxH;
        if (aspect < 0.65 && wordCount >= 6) {
            numLines = Math.min(wordCount, Math.max(3, Math.min(5, Math.ceil(wordCount / 3))));
        } else if (aspect > 1.5 && wordCount >= 4) {
            numLines = Math.max(2, Math.min(3, Math.floor(wordCount / 4)));
        }
    }
    numLines = Math.max(2, Math.min(wordCount, numLines));

    let weights: number[] = [];
    for (let i = 0; i < numLines; i++) {
        const y = -0.5 + (i + 0.5) / numLines;
        const widthFactor = Math.sqrt(Math.max(0.25, 1 - 4 * y * y));
        weights.push(widthFactor);
    }
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let lineCounts = weights.map(w => Math.max(1, Math.round((w / totalWeight) * wordCount)));
    let sum = lineCounts.reduce((a, b) => a + b, 0);

    while (sum < wordCount) {
        const mid = Math.floor(numLines / 2);
        lineCounts[mid]++;
        sum++;
    }
    while (sum > wordCount) {
        const maxIdx = lineCounts.indexOf(Math.max(...lineCounts));
        if (lineCounts[maxIdx] > 1) {
            lineCounts[maxIdx]--;
            sum--;
        } else {
            break;
        }
    }

    if (lineCounts.length >= 2 && lineCounts[lineCounts.length - 1] === 1 && wordCount >= 5) {
        const prevIdx = lineCounts.length - 2;
        if (lineCounts[prevIdx] > 2) {
            lineCounts[prevIdx]--;
            lineCounts[lineCounts.length - 1]++;
        }
    }

    let resultLines: string[] = [];
    let wordIdx = 0;
    lineCounts.forEach(count => {
        const lineWords = wordsWithTags.slice(wordIdx, wordIdx + count);
        if (lineWords.length > 0) {
            resultLines.push(lineWords.map(w => w.raw).join(' '));
        }
        wordIdx += count;
    });

    return resultLines.join('\n');
}

export function balanceBlockDiamond(block: MangaBlock): void {
    if (!block || block.type === 'image') return;
    const formatted = balanceTextToDiamond(block.translated, block.box ? block.box.w : null, block.box ? block.box.h : null);
    block.translated = formatted;
    block.autoFitCache = null;
    block.maskCache = null;
}

export function applyDiamondFormat(): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block && page) {
        const formatted = balanceTextToDiamond(block.translated, block.box ? block.box.w : null, block.box ? block.box.h : null);
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

    globalState.pages.forEach(page => {
        (page.blocks || []).forEach(block => {
            if (block.translated && block.type !== 'sfx') {
                const balanced = balanceTextToDiamond(block.translated, block.box.w, block.box.h);
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

if (typeof window !== 'undefined') {
    (window as any).triggerInlineEditActiveBlock = triggerInlineEditActiveBlock;
    (window as any).commitActiveEditingState = commitActiveEditingState;
}
