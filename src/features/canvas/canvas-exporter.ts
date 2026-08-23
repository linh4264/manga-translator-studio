import { globalState } from '../../core/state';
import { elements } from '../../core/elements';
import { waitForNextPaint, transformCase, parseRichTextLines, extractDomRenderedLines } from '../../core/utils';
import { computeBubbleMask } from '../ocr/ocr-service';
import { renderOverlays, convertHexToRGBA } from './canvas-renderer';
import { computeBlockTextLayout } from './text-layout-engine';
import { MangaPage, MangaBlock } from '../../types/index';

export { getFontFamilyName } from './text-layout-engine';
import { getFontFamilyName } from './text-layout-engine';

/**
 * Gets reference display dimensions (width & height in editor coordinate system) for a page.
 * Isolates UI zoom and natural resolution so typesetting, line-breaks, and Diamond balancing
 * always operate in reference display pixels consistent with CSS rendering.
 */
export function getReferenceDisplayDimensions(page?: MangaPage | null, imgElement?: HTMLImageElement | null): { width: number; height: number } {
    let displayWidth = (page as any)?.lastDisplayWidth;
    const imgEl = imgElement || (typeof document !== 'undefined' ? elements.mangaBgImage : null);
    const zoomScale = (globalState.zoom || 100) / 100;

    const isCurrentActiveEl = (typeof document !== 'undefined' && imgEl === elements.mangaBgImage);

    if (!displayWidth && isCurrentActiveEl && imgEl && imgEl.clientWidth > 0) {
        displayWidth = imgEl.clientWidth / Math.max(0.01, zoomScale);
    }

    const naturalW = (imgEl && imgEl.naturalWidth > 0) ? imgEl.naturalWidth : (page?.width || 800);
    const naturalH = (imgEl && imgEl.naturalHeight > 0) ? imgEl.naturalHeight : (page?.height || 1200);
    const aspect = naturalH / Math.max(1, naturalW);

    if (!displayWidth) {
        // If it's the active page, check container / viewport
        if (isCurrentActiveEl) {
            if (typeof document !== 'undefined' && elements.mangaCanvasContainer && elements.mangaCanvasContainer.clientWidth > 0) {
                displayWidth = elements.mangaCanvasContainer.clientWidth / Math.max(0.01, zoomScale);
            } else if (typeof document !== 'undefined' && elements.workspaceViewport && elements.workspaceViewport.clientWidth > 0) {
                displayWidth = Math.min((elements.workspaceViewport.clientWidth - 32) / Math.max(0.01, zoomScale), 1000);
            }
        }
    }

    if (!displayWidth || isNaN(displayWidth) || displayWidth <= 0) {
        // Calculate standard viewport-equivalent display width tailored to page aspect ratio
        if (aspect <= 1.0) {
            // Landscape / Double-page spread
            displayWidth = Math.min(1400, Math.round(900 / Math.max(0.4, aspect)));
        } else {
            // Standard portrait page
            displayWidth = 800;
        }
    }

    if (page && !(page as any).lastDisplayWidth) {
        (page as any).lastDisplayWidth = displayWidth;
    }

    const displayHeight = displayWidth * aspect;
    return { width: displayWidth, height: displayHeight };
}

/**
 * Calculates the exact output scale factor from editor display reference resolution to natural image resolution.
 * Isolates UI zoom so zooming in/out in the workspace has ZERO impact on export resolution or line-breaks.
 */
export function getExportScale(page: MangaPage, naturalWidth: number, imgElement?: HTMLImageElement | null): number {
    const { width: displayWidth } = getReferenceDisplayDimensions(page, imgElement);
    return naturalWidth / Math.max(1, displayWidth);
}

export interface BlockTextLayoutLine {
    tokens: any[];
    text: string;
    width: number;
    height: number;
    top: number;
    centerY: number;
    baselineY: number;
    ascent: number;
    descent: number;
    rawChars?: Array<{ char: string; token: any }>;
}

export interface BlockTextLayout {
    isVertical: boolean;
    lines: BlockTextLayoutLine[];
    fontSizePx: number;
    lineHeightPx: number;
    letterSpacingPx: number;
    totalWidth: number;
    totalHeight: number;
    align: string;
    padXPx: number;
    padYPx: number;
    bx: number;
    by: number;
    bw: number;
    bh: number;
    blockCenterX: number;
    blockCenterY: number;
    textCenterX: number;
    textCenterY: number;
    fontName: string;
    getFontFn: (tok: any) => string;
}

let sharedMeasureCanvas: HTMLCanvasElement | null = null;
let sharedMeasureCtx: CanvasRenderingContext2D | null = null;

function getSharedMeasureContext(): CanvasRenderingContext2D | null {
    if (sharedMeasureCtx) return sharedMeasureCtx;
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        try {
            sharedMeasureCanvas = document.createElement('canvas');
            sharedMeasureCtx = sharedMeasureCanvas.getContext('2d');
            return sharedMeasureCtx;
        } catch {
            return null;
        }
    }
    return null;
}

export function wrapTokenLineToWidth(
    measureCtx: CanvasRenderingContext2D | null,
    lineToks: any[],
    maxW: number,
    getFontFn: (tok: any) => string,
    letterSpacingPx: number = 0,
    scaledFontSize: number = 16
): any[][] {
    if (!lineToks || lineToks.length === 0) return [];
    if (maxW <= 0) return [lineToks];

    let totalLineWidth = 0;
    lineToks.forEach(tok => {
        if (!tok.text) return;
        if (measureCtx) {
            const prevFont = measureCtx.font;
            measureCtx.font = getFontFn(tok);
            const effLetterSpacing = letterSpacingPx * (tok.sizeRatio || 1.0);
            let w = measureCtx.measureText(tok.text).width;
            if (!w && tok.text.length > 0) {
                w = Array.from(tok.text).length * (scaledFontSize * 0.55);
            }
            if (!('letterSpacing' in measureCtx) && effLetterSpacing > 0) {
                const charCount = Array.from(tok.text).length;
                w += Math.max(0, charCount - 1) * effLetterSpacing;
            }
            totalLineWidth += w;
            measureCtx.font = prevFont;
        } else {
            const effLetterSpacing = letterSpacingPx * (tok.sizeRatio || 1.0);
            const charCount = Array.from(tok.text).length;
            totalLineWidth += charCount * (scaledFontSize * 0.55) + Math.max(0, charCount - 1) * effLetterSpacing;
        }
    });

    if (totalLineWidth <= maxW + 2) {
        return [lineToks];
    }

    const wordTokens: Array<{
        text: string;
        isSpace: boolean;
        token: any;
        width: number;
    }> = [];

    lineToks.forEach(tok => {
        if (!tok.text) return;
        const chunks = tok.text.split(/(\s+)/);
        chunks.forEach((chunk: string) => {
            if (!chunk) return;
            const isSpace = /^\s+$/.test(chunk);
            let w = 0;
            if (measureCtx) {
                const prevFont = measureCtx.font;
                measureCtx.font = getFontFn(tok);
                const effLetterSpacing = letterSpacingPx * (tok.sizeRatio || 1.0);
                w = measureCtx.measureText(chunk).width;
                if (!w && chunk.length > 0) {
                    const charCount = Array.from(chunk).length;
                    w = charCount * (scaledFontSize * 0.55);
                }
                if (!('letterSpacing' in measureCtx) && effLetterSpacing > 0) {
                    const charCount = Array.from(chunk).length;
                    w += Math.max(0, charCount - 1) * effLetterSpacing;
                }
                measureCtx.font = prevFont;
            } else {
                const effLetterSpacing = letterSpacingPx * (tok.sizeRatio || 1.0);
                const charCount = Array.from(chunk).length;
                w = charCount * (scaledFontSize * 0.55) + Math.max(0, charCount - 1) * effLetterSpacing;
            }

            wordTokens.push({
                text: chunk,
                isSpace,
                token: tok,
                width: w
            });
        });
    });

    const mergedWords: typeof wordTokens = [];
    for (let i = 0; i < wordTokens.length; i++) {
        const wt = wordTokens[i];
        const isPureTrailing = !wt.isSpace && /^[.,!?:;~～…\-)\]”’]+$/.test(wt.text);
        if (isPureTrailing && mergedWords.length > 0 && !mergedWords[mergedWords.length - 1].isSpace) {
            const prev = mergedWords[mergedWords.length - 1];
            prev.text += wt.text;
            prev.width += wt.width;
            continue;
        }
        mergedWords.push(wt);
    }

    const subLines: any[][] = [];
    let currentLineTokens: any[] = [];
    let currentLineWidth = 0;
    let pendingSpaceTok: typeof wordTokens[0] | null = null;

    for (let i = 0; i < mergedWords.length; i++) {
        const wt = mergedWords[i];
        if (wt.isSpace) {
            if (currentLineTokens.length > 0) {
                pendingSpaceTok = wt;
            }
            continue;
        }

        const spaceW = pendingSpaceTok ? pendingSpaceTok.width : 0;
        const testWidth = currentLineWidth + spaceW + wt.width;

        if (currentLineTokens.length === 0) {
            currentLineTokens.push({
                ...wt.token,
                text: wt.text
            });
            currentLineWidth = wt.width;
            pendingSpaceTok = null;
        } else if (testWidth <= maxW + 2) {
            if (pendingSpaceTok) {
                const prev = currentLineTokens[currentLineTokens.length - 1];
                if (prev.bold === pendingSpaceTok.token.bold &&
                    prev.italic === pendingSpaceTok.token.italic &&
                    prev.color === pendingSpaceTok.token.color &&
                    prev.sizeRatio === pendingSpaceTok.token.sizeRatio &&
                    prev.font === pendingSpaceTok.token.font) {
                    prev.text += pendingSpaceTok.text;
                } else {
                    currentLineTokens.push({ ...pendingSpaceTok.token, text: pendingSpaceTok.text });
                }
                currentLineWidth += spaceW;
                pendingSpaceTok = null;
            }

            const prev = currentLineTokens[currentLineTokens.length - 1];
            if (prev.bold === wt.token.bold &&
                prev.italic === wt.token.italic &&
                prev.color === wt.token.color &&
                prev.sizeRatio === wt.token.sizeRatio &&
                prev.font === wt.token.font) {
                prev.text += wt.text;
            } else {
                currentLineTokens.push({ ...wt.token, text: wt.text });
            }
            currentLineWidth += wt.width;
        } else {
            subLines.push(currentLineTokens);
            currentLineTokens = [{
                ...wt.token,
                text: wt.text
            }];
            currentLineWidth = wt.width;
            pendingSpaceTok = null;
        }
    }

    if (currentLineTokens.length > 0) {
        subLines.push(currentLineTokens);
    }

    return subLines.length > 0 ? subLines : [lineToks];
}

/**
 * Shared canonical layout representation: Builds exact line tokens and measurements strictly adhering
 * to Canva-style layout engine without re-partitioning words,
 * computing font-metric based vertical baseline positions that align perfectly with DOM CSS line boxes.
 */
export function buildBlockTextLayout(
    block: MangaBlock,
    W: number,
    H: number,
    scaleFactor: number,
    ctx?: CanvasRenderingContext2D | null,
    page?: MangaPage | null
): BlockTextLayout {
    let lockedLines: any = (block as any)._derivedLines || null;

    if (!lockedLines && typeof document !== 'undefined') {
        const overlayEl = document.getElementById(block.id);
        if (overlayEl) {
            const textContainer = overlayEl.querySelector(':scope > .mask-content-container > .inner-text-container') as HTMLElement | null
                || overlayEl.querySelector('.inner-text-container') as HTMLElement | null
                || overlayEl.querySelector('div > div') as HTMLElement | null;
            if (textContainer) {
                lockedLines = extractDomRenderedLines(textContainer);
            }
        }
    }

    if (!lockedLines && page) {
        const { width: refW, height: refH } = getReferenceDisplayDimensions(page);
        const refLayout = computeBlockTextLayout(block, refW, refH, 1.0, ctx);
        if (refLayout && refLayout.lines && refLayout.lines.length > 0) {
            lockedLines = refLayout.lines.map(l => l.tokens);
        }
    }

    return computeBlockTextLayout(block, W, H, scaleFactor, ctx, lockedLines || undefined) as BlockTextLayout;
}

export async function renderPageToCanvas2D(page: MangaPage, bgImageOverride: HTMLImageElement | null = null): Promise<HTMLCanvasElement> {
    const isCurrentActivePage = (globalState.activePageIndex >= 0 && page === globalState.pages[globalState.activePageIndex]);
    let imgElement = bgImageOverride || (isCurrentActivePage ? elements.mangaBgImage : null);
    let createdBlobUrl: string | null = null;

    if (!imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) {
        const pageFile = page.originalFile || page.file;
        const srcToLoad = pageFile ? (createdBlobUrl = URL.createObjectURL(pageFile as Blob)) : page.src;
        if (srcToLoad) {
            const offImg = new Image();
            offImg.crossOrigin = 'anonymous';
            await new Promise<void>((resolve) => {
                offImg.onload = () => resolve();
                offImg.onerror = () => resolve();
                offImg.src = srcToLoad;
            });
            if (offImg.naturalWidth > 0) {
                imgElement = offImg;
            }
        }
    }

    if (!imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) {
        if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl);
        throw new Error("Dữ liệu ảnh gốc chưa sẵn sàng.");
    }

    const W = imgElement.naturalWidth;
    const H = imgElement.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Không thể tạo 2D context cho canvas");

    ctx.drawImage(imgElement, 0, 0, W, H);
    if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
    }

    if (page === globalState.pages[globalState.activePageIndex] && elements.eraserCanvas && elements.eraserCanvas.width > 0) {
        ctx.drawImage(elements.eraserCanvas, 0, 0, W, H);
    } else if (page.eraserLayerBlob) {
        await new Promise<void>((resolve) => {
            const eraserImg = new Image();
            const url = URL.createObjectURL(page.eraserLayerBlob!);
            eraserImg.onload = () => {
                ctx.drawImage(eraserImg, 0, 0, W, H);
                URL.revokeObjectURL(url);
                resolve();
            };
            eraserImg.onerror = () => {
                URL.revokeObjectURL(url);
                resolve();
            };
            eraserImg.src = url;
        });
    } else if ((page as any).eraserCanvasDataUrl) {
        await new Promise<void>((resolve) => {
            const eraserImg = new Image();
            eraserImg.onload = () => {
                ctx.drawImage(eraserImg, 0, 0, W, H);
                resolve();
            };
            eraserImg.onerror = () => resolve();
            eraserImg.src = (page as any).eraserCanvasDataUrl;
        });
    }

    // 1. Ensure custom fonts from DB are loaded into document.fonts
    try {
        const { loadAndRegisterCustomFonts } = await import('../../core/state');
        await loadAndRegisterCustomFonts();
    } catch (e) {}

    // 2. Preload and warm up only the fonts actually used on this page
    if (typeof document !== 'undefined' && document.fonts) {
        try {
            await document.fonts.ready;
        } catch (e) {}

        if (document.fonts.load) {
            const fontFamiliesToLoad = new Set<string>();

            if (page.blocks && page.blocks.length > 0) {
                for (const block of page.blocks) {
                    if (block.type === 'image' || !block.translated || !block.translated.trim()) continue;
                    const blockFont = block.style?.fontFamily;
                    if (blockFont) {
                        const fontNameResolved = getFontFamilyName(blockFont);
                        const parts = fontNameResolved.split(',').map(s => s.replace(/['"]/g, '').trim()).filter(s => s && s !== 'sans-serif' && s !== 'cursive' && s !== 'serif');
                        parts.forEach(p => fontFamiliesToLoad.add(p));
                    }
                    const transformed = transformCase(block.translated, block.style?.textTransform || 'none');
                    const tokenLines = parseRichTextLines(transformed);
                    tokenLines.flat().forEach(tok => {
                        if (tok.font) {
                            const tokFontResolved = getFontFamilyName(tok.font);
                            const parts = tokFontResolved.split(',').map(s => s.replace(/['"]/g, '').trim()).filter(s => s && s !== 'sans-serif' && s !== 'cursive' && s !== 'serif');
                            parts.forEach(p => fontFamiliesToLoad.add(p));
                        }
                    });
                }
            }

            if (fontFamiliesToLoad.size === 0) {
                fontFamiliesToLoad.add('Nunito');
            }

            const fontLoadPromises: Promise<any>[] = [];
            fontFamiliesToLoad.forEach(family => {
                fontLoadPromises.push(document.fonts.load(`16px '${family}'`).catch(() => {}));
            });

            try {
                await Promise.all(fontLoadPromises);
                await document.fonts.ready;
            } catch (e) {}
        }
    }

    let activeImageData = page.imageDataCache || null;
    const hasBubbleFit = page.blocks && page.blocks.some(block => (block.style.maskShape || 'bubble-fit') === 'bubble-fit');
    if (hasBubbleFit && !activeImageData) {
        try {
            const bgCanvas = document.createElement('canvas');
            bgCanvas.width = W;
            bgCanvas.height = H;
            const bgCtx = bgCanvas.getContext('2d', { willReadFrequently: true });
            if (bgCtx) {
                bgCtx.drawImage(imgElement, 0, 0);
                activeImageData = bgCtx.getImageData(0, 0, W, H);
                page.imageDataCache = activeImageData;
            }
        } catch (e) {
            console.error("Lỗi tạo imageDataCache khi xuất canvas:", e);
        }
    }

    const scaleFactor = getExportScale(page, W, imgElement);

    if (page.blocks && page.blocks.length > 0) {
        // PASS 1: Render masks / bubble backgrounds / image blocks
        for (const block of page.blocks) {
            const bx = (block.box.x / 100) * W;
            const by = (block.box.y / 100) * H;
            const bw = (block.box.w / 100) * W;
            const bh = (block.box.h / 100) * H;

            if (block.type === 'image') {
                if (!block.imageUrl) continue;
                ctx.save();
                if (block.style.rotate) {
                    const cx = bx + bw / 2;
                    const cy = by + bh / 2;
                    ctx.translate(cx, cy);
                    ctx.rotate((block.style.rotate * Math.PI) / 180);
                    ctx.translate(-cx, -cy);
                }

                ctx.globalAlpha = (block.style.opacity !== undefined ? block.style.opacity : 100) / 100;

                await new Promise<void>((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        if (block.style.borderRadius && block.style.borderRadius > 0) {
                            const rad = (block.style.borderRadius / 100) * Math.min(bw, bh);
                            ctx.beginPath();
                            if (typeof ctx.roundRect === 'function') {
                                ctx.roundRect(bx, by, bw, bh, rad);
                            } else {
                                ctx.rect(bx, by, bw, bh);
                            }
                            ctx.clip();
                        }

                        const fitMode = block.style.fit || 'contain';
                        const imgW = img.naturalWidth || img.width;
                        const imgH = img.naturalHeight || img.height;

                        if (!imgW || !imgH || fitMode === 'fill') {
                            ctx.drawImage(img, bx, by, bw, bh);
                        } else {
                            const imgAspect = imgW / imgH;
                            const boxAspect = bw / bh;

                            if (fitMode === 'cover') {
                                let sx = 0, sy = 0, sw = imgW, sh = imgH;
                                if (imgAspect > boxAspect) {
                                    sh = imgH;
                                    sw = imgH * boxAspect;
                                    sx = (imgW - sw) / 2;
                                } else {
                                    sw = imgW;
                                    sh = imgW / boxAspect;
                                    sy = (imgH - sh) / 2;
                                }
                                ctx.drawImage(img, sx, sy, sw, sh, bx, by, bw, bh);
                            } else {
                                let dx = bx, dy = by, dw = bw, dh = bh;
                                if (imgAspect > boxAspect) {
                                    dw = bw;
                                    dh = bw / imgAspect;
                                    dy = by + (bh - dh) / 2;
                                } else {
                                    dh = bh;
                                    dw = bh * imgAspect;
                                    dx = bx + (bw - dw) / 2;
                                }
                                ctx.drawImage(img, dx, dy, dw, dh);
                            }
                        }
                        resolve();
                    };
                    img.onerror = () => resolve();
                    img.src = block.imageUrl!;
                });

                ctx.restore();
                continue;
            }

            ctx.save();

            if (block.style.rotate) {
                const cx = bx + bw / 2;
                const cy = by + bh / 2;
                ctx.translate(cx, cy);
                ctx.rotate((block.style.rotate * Math.PI) / 180);
                ctx.translate(-cx, -cy);
            }

            const maskShape = block.style.maskShape || 'bubble-fit';
            const maskSize = block.style.maskSize || 'full';

            const insetPad = Math.max(1, Math.round(scaleFactor * 0.8));
            let fillBx = bx + insetPad;
            let fillBy = by + insetPad;
            let fillBw = Math.max(1, bw - (insetPad * 2));
            let fillBh = Math.max(1, bh - (insetPad * 2));

            if (maskSize === 'snug' && block.translated && block.translated.trim()) {
                const layout = buildBlockTextLayout(block, W, H, scaleFactor, ctx, page);
                const snugW = Math.min(fillBw, layout.totalWidth + (layout.padXPx * 2));
                const snugH = Math.min(fillBh, layout.totalHeight + (layout.padYPx * 2));
                fillBx = bx + (bw - snugW) / 2;
                if (!layout.isVertical) {
                    if (block.style.align === 'left') fillBx = bx + insetPad;
                    else if (block.style.align === 'right') fillBx = bx + bw - snugW - insetPad;
                }
                fillBy = by + (bh - snugH) / 2;
                fillBw = snugW;
                fillBh = snugH;
            }

            const hexBgColor = block.style.bgColor || '#ffffff';
            const alpha = (block.style.bgOpacity !== undefined ? block.style.bgOpacity : 100) / 100;

            let maskDrawn = false;
            if (maskShape === 'bubble-fit') {
                if (!block.maskCache && activeImageData) {
                    computeBubbleMask(page, block, activeImageData);
                }
                const maskCanvasObj = block.maskCache ? (block.maskCache.canvas || block.maskCache) : null;
                if (maskCanvasObj && typeof ctx.drawImage === 'function') {
                    try {
                        ctx.drawImage(maskCanvasObj, bx, by, bw, bh);
                        maskDrawn = true;
                    } catch (e) {
                        maskDrawn = false;
                    }
                }
            }

            if (!maskDrawn && alpha > 0) {
                ctx.fillStyle = convertHexToRGBA(hexBgColor, alpha);
                if (maskShape === 'ellipse') {
                    ctx.beginPath();
                    ctx.ellipse(fillBx + fillBw / 2, fillBy + fillBh / 2, fillBw / 2, fillBh / 2, 0, 0, 2 * Math.PI);
                    ctx.fill();
                } else if (maskShape === 'rounded') {
                    const r = Math.min(16 * scaleFactor, fillBw / 4, fillBh / 4);
                    ctx.beginPath();
                    if (typeof ctx.roundRect === 'function') {
                        ctx.roundRect(fillBx, fillBy, fillBw, fillBh, r);
                    } else {
                        ctx.rect(fillBx, fillBy, fillBw, fillBh);
                    }
                    ctx.fill();
                } else {
                    ctx.fillRect(fillBx, fillBy, fillBw, fillBh);
                }
            }

            ctx.restore();
        }

        // PASS 2: Render pure text layers
        for (const block of page.blocks) {
            if (block.type === 'image') continue;
            if (!block.translated || !block.translated.trim()) continue;

            const layout = buildBlockTextLayout(block, W, H, scaleFactor, ctx, page);
            const { bx, by, bw, bh, fontSizePx, lineHeightPx, letterSpacingPx, fontName } = layout;

            ctx.save();

            const totalTextAngle = (parseFloat(block.style.rotate as any) || 0) + (parseFloat(block.style.textRotate as any) || 0);
            if (totalTextAngle !== 0) {
                const cx = bx + bw / 2;
                const cy = by + bh / 2;
                ctx.translate(cx, cy);
                ctx.rotate((totalTextAngle * Math.PI) / 180);
                ctx.translate(-cx, -cy);
            }

            const fontWeight = block.style.bold ? 'bold ' : '';
            const fontItalic = block.style.italic ? 'italic ' : '';
            const fontSpec = `${fontItalic}${fontWeight}${fontSizePx}px ${fontName}`;
            ctx.font = fontSpec;
            ctx.fillStyle = block.style.textColor || '#000000';

            if ('letterSpacing' in ctx) {
                (ctx as any).letterSpacing = `${letterSpacingPx}px`;
            }

            const strokeWidth = parseFloat(block.style.strokeWidth as any) || 0;
            const strokeColor = block.style.strokeColor || '#ffffff';
            const strokeWidthPx = strokeWidth * scaleFactor;

            const strokeWidth2 = parseFloat(block.style.strokeWidth2 as any) || 0;
            const strokeColor2 = block.style.strokeColor2 || '#000000';
            const strokeWidth2Px = strokeWidth2 * scaleFactor;

            const shadowBlur = parseFloat(block.style.shadowBlur as any) || 0;
            const shadowColor = block.style.shadowColor || '#000000';
            const shadowBlurPx = shadowBlur * scaleFactor;
            const shadowOffsetX = (parseFloat(block.style.shadowOffsetX as any) || 0) * scaleFactor;
            const shadowOffsetY = (parseFloat(block.style.shadowOffsetY as any) || 0) * scaleFactor;

            const arcAngle = block.style.arcAngle || 0;
            const skewX = block.style.skewX || 0;
            const skewY = block.style.skewY || 0;
            const warpWave = block.style.warpWave || 0;
            const warpBulge = block.style.warpBulge || 0;

            const hasSkew = (skewX !== 0 || skewY !== 0);
            const hasCharWarp = (arcAngle !== 0) || (warpWave !== 0) || (warpBulge !== 0);

            let blockGradient: CanvasGradient | null = null;
            if (block.style.gradientEnabled) {
                const startCol = block.style.gradientColorStart || '#ff7e5f';
                const endCol = block.style.gradientColorEnd || '#feb47b';
                if (block.style.gradientType === 'radial') {
                    const cx = bx + bw / 2;
                    const cy = by + bh / 2;
                    const r = Math.max(bw, bh) / 2;
                    const radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                    radGrad.addColorStop(0, startCol);
                    radGrad.addColorStop(1, endCol);
                    blockGradient = radGrad;
                } else {
                    const angle = block.style.gradientAngle !== undefined ? block.style.gradientAngle : 90;
                    const rad = ((angle - 90) * Math.PI) / 180;
                    const cx = bx + bw / 2;
                    const cy = by + bh / 2;
                    const halfDiag = Math.sqrt(bw * bw + bh * bh) / 2;
                    const gx1 = cx - halfDiag * Math.cos(rad);
                    const gy1 = cy - halfDiag * Math.sin(rad);
                    const gx2 = cx + halfDiag * Math.cos(rad);
                    const gy2 = cy + halfDiag * Math.sin(rad);
                    const linGrad = ctx.createLinearGradient(gx1, gy1, gx2, gy2);
                    linGrad.addColorStop(0, startCol);
                    linGrad.addColorStop(1, endCol);
                    blockGradient = linGrad;
                }
            }

            if (layout.isVertical) {
                const colStep = layout.lineHeightPx;
                const charStep = layout.lineHeightPx;
                const rightX = bx + bw / 2 + layout.totalWidth / 2 - colStep / 2;

                for (let j = 0; j < layout.lines.length; j++) {
                    const colLine = layout.lines[j];
                    const colChars = colLine.rawChars || [];
                    const colX = rightX - (j * colStep);
                    const colHeight = colChars.length * charStep;
                    let startY = by + (bh / 2) - (colHeight / 2) + (charStep / 2);
                    const minStartY = by + layout.padYPx + (charStep / 2);
                    if (startY < minStartY) startY = minStartY;

                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    ctx.save();
                    if (hasSkew) {
                        const radX = (skewX * Math.PI) / 180;
                        const radY = (skewY * Math.PI) / 180;
                        ctx.translate(colX, by + bh / 2);
                        ctx.transform(1, Math.tan(radY), Math.tan(radX), 1, 0, 0);
                        ctx.translate(-colX, -(by + bh / 2));
                    }

                    for (let k = 0; k < colChars.length; k++) {
                        const { char, token: tok } = colChars[k];
                        let charCellCenterY = startY + (k * charStep);
                        let charCellCenterX = colX;
                        let rotRad = 0;
                        let bulgeScale = 1;

                        if (hasCharWarp && colChars.length > 1) {
                            const count = colChars.length;
                            const t = (k - (count - 1) / 2) / ((count - 1) / 2);
                            const arcOffset = (1 - t * t) * -((arcAngle / 45) * 8 * scaleFactor);
                            const waveOffset = Math.sin(t * Math.PI) * ((warpWave / 50) * 10 * scaleFactor);
                            const totalOffsetX = arcOffset + waveOffset;
                            rotRad = t * (arcAngle * 0.35) * (Math.PI / 180);
                            bulgeScale = 1 + (1 - t * t) * ((warpBulge / 50) * 0.4);
                            charCellCenterX += totalOffsetX;
                        }

                        ctx.save();
                        ctx.translate(charCellCenterX, charCellCenterY);
                        if (rotRad !== 0) ctx.rotate(rotRad);
                        if (bulgeScale !== 1) ctx.scale(bulgeScale, bulgeScale);
                        if (char === '…' || char === '―' || char === '—' || char === '~' || char === '～' || char === '-') {
                            ctx.rotate(Math.PI / 2);
                        }

                        ctx.font = layout.getFontFn(tok);

                        if (strokeWidth2 > 0) {
                            ctx.save();
                            if (shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0) {
                                ctx.shadowColor = shadowColor;
                                ctx.shadowBlur = shadowBlurPx;
                                ctx.shadowOffsetX = shadowOffsetX;
                                ctx.shadowOffsetY = shadowOffsetY;
                            }
                            ctx.lineWidth = strokeWidthPx + (strokeWidth2Px * 2);
                            ctx.strokeStyle = strokeColor2;
                            ctx.lineJoin = 'round';
                            ctx.miterLimit = 2;
                            ctx.strokeText(char, 0, 0);
                            ctx.restore();
                        }

                        if (strokeWidth > 0) {
                            ctx.save();
                            if (strokeWidth2 === 0 && (shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0)) {
                                ctx.shadowColor = shadowColor;
                                ctx.shadowBlur = shadowBlurPx;
                                ctx.shadowOffsetX = shadowOffsetX;
                                ctx.shadowOffsetY = shadowOffsetY;
                            }
                            ctx.lineWidth = strokeWidthPx;
                            ctx.strokeStyle = strokeColor;
                            ctx.lineJoin = 'round';
                            ctx.miterLimit = 2;
                            ctx.strokeText(char, 0, 0);
                            ctx.restore();
                        }

                        ctx.save();
                        if (strokeWidth === 0 && strokeWidth2 === 0 && (shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0)) {
                            ctx.shadowColor = shadowColor;
                            ctx.shadowBlur = shadowBlurPx;
                            ctx.shadowOffsetX = shadowOffsetX;
                            ctx.shadowOffsetY = shadowOffsetY;
                        }
                        ctx.fillStyle = tok.color || (block.style.gradientEnabled && blockGradient ? blockGradient : (block.style.textColor || '#000000'));
                        ctx.fillText(char, 0, 0);
                        ctx.restore();

                        ctx.restore();
                    }
                    ctx.restore();
                }
            } else {
                const lineHeight = layout.lineHeightPx;
                let startX = bx + bw / 2;
                if (block.style.align === 'left') startX = bx + layout.padXPx;
                else if (block.style.align === 'right') startX = bx + bw - layout.padXPx;

                for (let i = 0; i < layout.lines.length; i++) {
                    const lineLayout = layout.lines[i];
                    const lineTokens = lineLayout.tokens;
                    const lineCenterY = lineLayout.centerY;

                    ctx.save();
                    if (hasSkew) {
                        const radX = (skewX * Math.PI) / 180;
                        const radY = (skewY * Math.PI) / 180;
                        ctx.translate(startX, lineCenterY);
                        ctx.transform(1, Math.tan(radY), Math.tan(radX), 1, 0, 0);
                        ctx.translate(-startX, -lineCenterY);
                    }

                    if (hasCharWarp) {
                        const rawChars = lineLayout.rawChars || [];
                        const count = rawChars.length;
                        const arcDepth = (arcAngle / 45) * 8 * scaleFactor;
                        const waveAmp = (warpWave / 50) * 10 * scaleFactor;
                        const bulgeFactor = (warpBulge / 50) * 0.4;

                        let lineW = 0;
                        rawChars.forEach(({ char: c, token: t }, ci) => {
                            ctx.font = layout.getFontFn(t);
                            const effLetterSpacing = letterSpacingPx * (t.sizeRatio || 1.0);
                            lineW += ctx.measureText(c).width;
                            if (ci < count - 1) {
                                lineW += effLetterSpacing;
                            }
                        });

                        let startCharX = startX - (lineW / 2);
                        if (block.style.align === 'left') startCharX = bx + layout.padXPx;
                        else if (block.style.align === 'right') startCharX = bx + bw - layout.padXPx - lineW;

                        let curX = startCharX;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';

                        for (let k = 0; k < count; k++) {
                            const { char, token: tok } = rawChars[k];
                            ctx.font = layout.getFontFn(tok);
                            const cw = ctx.measureText(char).width;
                            const effLetterSpacing = letterSpacingPx * (tok.sizeRatio || 1.0);
                            const charCenterX = curX + (cw / 2);
                            const t = count > 1 ? (k - (count - 1) / 2) / ((count - 1) / 2) : 0;

                            const arcOffset = (1 - t * t) * -arcDepth;
                            const waveOffset = Math.sin(t * Math.PI) * waveAmp;
                            const totalOffsetY = arcOffset + waveOffset;

                            const rotRad = t * (arcAngle * 0.35) * (Math.PI / 180);
                            const bulgeScale = 1 + (1 - t * t) * bulgeFactor;

                            ctx.save();
                            ctx.translate(charCenterX, lineCenterY + totalOffsetY);
                            if (rotRad !== 0) ctx.rotate(rotRad);
                            if (bulgeScale !== 1) ctx.scale(bulgeScale, bulgeScale);

                            if (strokeWidth2 > 0) {
                                ctx.save();
                                if (shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0) {
                                    ctx.shadowColor = shadowColor;
                                    ctx.shadowBlur = shadowBlurPx;
                                    ctx.shadowOffsetX = shadowOffsetX;
                                    ctx.shadowOffsetY = shadowOffsetY;
                                }
                                ctx.lineWidth = strokeWidthPx + (strokeWidth2Px * 2);
                                ctx.strokeStyle = strokeColor2;
                                ctx.lineJoin = 'round';
                                ctx.miterLimit = 2;
                                ctx.strokeText(char, 0, 0);
                                ctx.restore();
                            }

                            if (strokeWidth > 0) {
                                ctx.save();
                                if (strokeWidth2 === 0 && (shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0)) {
                                    ctx.shadowColor = shadowColor;
                                    ctx.shadowBlur = shadowBlurPx;
                                    ctx.shadowOffsetX = shadowOffsetX;
                                    ctx.shadowOffsetY = shadowOffsetY;
                                }
                                ctx.lineWidth = strokeWidthPx;
                                ctx.strokeStyle = strokeColor;
                                ctx.lineJoin = 'round';
                                ctx.miterLimit = 2;
                                ctx.strokeText(char, 0, 0);
                                ctx.restore();
                            }

                            ctx.save();
                            if (strokeWidth === 0 && strokeWidth2 === 0 && (shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0)) {
                                ctx.shadowColor = shadowColor;
                                ctx.shadowBlur = shadowBlurPx;
                                ctx.shadowOffsetX = shadowOffsetX;
                                ctx.shadowOffsetY = shadowOffsetY;
                            }
                            ctx.fillStyle = tok.color || (block.style.gradientEnabled && blockGradient ? blockGradient : (block.style.textColor || '#000000'));
                            ctx.fillText(char, 0, 0);
                            ctx.restore();

                            ctx.restore();

                            curX += cw + effLetterSpacing;
                        }
                    } else {
                        const measuredLineWidth = lineLayout.width;
                        let curTokenX = startX;
                        if (!block.style.align || block.style.align === 'center') {
                            curTokenX = startX - (measuredLineWidth / 2);
                        } else if (block.style.align === 'right') {
                            curTokenX = startX - measuredLineWidth;
                        }

                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';

                        lineTokens.forEach(tok => {
                            const tokFontSpec = layout.getFontFn(tok);
                            ctx.font = tokFontSpec;
                            const tokenW = ctx.measureText(tok.text).width;
                            const tokSize = fontSizePx * (tok.sizeRatio || 1.0);

                            if (strokeWidth2 > 0) {
                                ctx.save();
                                if (shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0) {
                                    ctx.shadowColor = shadowColor;
                                    ctx.shadowBlur = shadowBlurPx;
                                    ctx.shadowOffsetX = shadowOffsetX;
                                    ctx.shadowOffsetY = shadowOffsetY;
                                }
                                ctx.lineWidth = strokeWidthPx + (strokeWidth2Px * 2);
                                ctx.strokeStyle = strokeColor2;
                                ctx.lineJoin = 'round';
                                ctx.miterLimit = 2;
                                ctx.strokeText(tok.text, curTokenX, lineCenterY);
                                ctx.restore();
                            }

                            if (strokeWidth > 0) {
                                ctx.save();
                                if (strokeWidth2 === 0 && (shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0)) {
                                    ctx.shadowColor = shadowColor;
                                    ctx.shadowBlur = shadowBlurPx;
                                    ctx.shadowOffsetX = shadowOffsetX;
                                    ctx.shadowOffsetY = shadowOffsetY;
                                }
                                ctx.lineWidth = strokeWidthPx;
                                ctx.strokeStyle = strokeColor;
                                ctx.lineJoin = 'round';
                                ctx.miterLimit = 2;
                                ctx.strokeText(tok.text, curTokenX, lineCenterY);
                                ctx.restore();
                            }

                            ctx.save();
                            if (block.style.blendMode && block.style.blendMode !== 'normal' && (!block.style.bgOpacity || block.style.bgOpacity === 0)) {
                                ctx.globalCompositeOperation = (block.style.blendMode as GlobalCompositeOperation) || 'source-over';
                            } else {
                                ctx.globalCompositeOperation = 'source-over';
                            }
                            if (strokeWidth === 0 && strokeWidth2 === 0 && (shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0)) {
                                ctx.shadowColor = shadowColor;
                                ctx.shadowBlur = shadowBlurPx;
                                ctx.shadowOffsetX = shadowOffsetX;
                                ctx.shadowOffsetY = shadowOffsetY;
                            }

                            const fillToApply: any = tok.color || (block.style.gradientEnabled && blockGradient ? blockGradient : (block.style.textColor || '#000000'));

                            ctx.fillStyle = fillToApply;
                            ctx.fillText(tok.text, curTokenX, lineCenterY);
                            ctx.restore();

                            if (tok.underline || block.style.underline) {
                                ctx.save();
                                ctx.strokeStyle = tok.color || block.style.textColor || '#000000';
                                ctx.lineWidth = Math.max(1, tokSize * 0.08);
                                ctx.beginPath();
                                const underlineY = lineCenterY + Math.max(2, tokSize * 0.45);
                                ctx.moveTo(curTokenX, underlineY);
                                ctx.lineTo(curTokenX + tokenW, underlineY);
                                ctx.stroke();
                                ctx.restore();
                            }

                            if (tok.strikethrough) {
                                ctx.save();
                                ctx.strokeStyle = tok.color || block.style.textColor || '#000000';
                                ctx.lineWidth = Math.max(1, tokSize * 0.08);
                                ctx.beginPath();
                                const strikethroughY = lineCenterY;
                                ctx.moveTo(curTokenX, strikethroughY);
                                ctx.lineTo(curTokenX + tokenW, strikethroughY);
                                ctx.stroke();
                                ctx.restore();
                            }

                            curTokenX += tokenW;
                        });
                    }
                    ctx.restore();
                }

                // Render bilingual subtitles below translated text if enabled
                if ((globalState.bilingualMode === 'sub' || block.style.bilingualSub) && block.original && block.original.trim()) {
                    const subFontSizePx = Math.max(8, fontSizePx * 0.7);
                    const subFontSpec = `italic ${subFontSizePx}px ${fontName}`;
                    ctx.save();
                    ctx.font = subFontSpec;
                    ctx.fillStyle = block.style.textColor || '#000000';
                    ctx.globalAlpha = 0.75;
                    ctx.textBaseline = 'middle';
                    const subLineHeight = subFontSizePx * 1.1;
                    const subLines = (block.original || '').split('\n');
                    const lastLineBottom = layout.lines.length > 0 ? (layout.lines[layout.lines.length - 1].top + layout.lines[layout.lines.length - 1].height) : (by + bh / 2);
                    const subStartY = lastLineBottom + (subFontSizePx * 0.3);
                    ctx.textAlign = (!block.style.align || block.style.align === 'center') ? 'center' : (block.style.align === 'right' ? 'right' : 'left');
                    const subStartX = startX;

                    for (let si = 0; si < subLines.length; si++) {
                        const subLineCenterY = subStartY + (si * subLineHeight) + (subLineHeight / 2);
                        ctx.fillText(subLines[si], subStartX, subLineCenterY);
                    }
                    ctx.restore();
                }
            }

            ctx.restore();
        }
    }

    if (!isCurrentActivePage) {
        page.imageDataCache = null;
    }

    return canvas;
}

export async function renderPageToCanvasSVG(page: MangaPage): Promise<HTMLCanvasElement> {
    const imgElement = elements.mangaBgImage;
    if (!imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) {
        throw new Error("Dữ liệu ảnh gốc chưa sẵn sàng.");
    }

    const W = imgElement.naturalWidth;
    const H = imgElement.naturalHeight;
    const forceExportScale = getExportScale(page, W, imgElement);

    const mirrorContainer = document.createElement('div');
    mirrorContainer.style.position = 'absolute';
    mirrorContainer.style.left = '-99999px';
    mirrorContainer.style.top = '0';
    mirrorContainer.style.width = `${W}px`;
    mirrorContainer.style.height = `${H}px`;
    mirrorContainer.style.overflow = 'hidden';
    mirrorContainer.style.boxSizing = 'border-box';
    document.body.appendChild(mirrorContainer);

    try {
        if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
            try {
                await document.fonts.ready;
            } catch (e) {}
        }
        renderOverlays(mirrorContainer, page, imgElement, forceExportScale);
        await waitForNextPaint();

        const cssStyles = `
            @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,700;1,400&family=Comic+Neue:wght@400;700&family=Nunito:wght@400;700&family=Patrick+Hand&family=Bangers&family=Permanent+Marker&family=Bungee&family=Caveat:wght@400;700&family=Chakra+Petch:wght@400;700&family=Saira+Condensed:wght@400;700&display=swap');
            * { box-sizing: border-box; }
            .bubble-overlay { position: absolute; box-sizing: border-box; }
            .text-vertical { writing-mode: vertical-rl; text-orientation: upright; }
            .font-comic { font-family: 'Patrick Hand', cursive; }
            .font-manga { font-family: 'Nunito', sans-serif; }
            .font-vietnamese { font-family: 'Be Vietnam Pro', 'Inter', sans-serif; }
            .font-comicneue { font-family: 'Comic Neue', cursive; }
            .font-impact { font-family: 'Bangers', cursive; }
            .font-marker { font-family: 'Permanent Marker', cursive; }
            .font-bungee { font-family: 'Bungee', cursive; }
            .font-caveat { font-family: 'Caveat', cursive; }
            .font-tech { font-family: 'Chakra Petch', sans-serif; }
            .font-condensed { font-family: 'Saira Condensed', sans-serif; }
            .resize-handle { display: none !important; }
        `;

        const svgString = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
                <style>${cssStyles}</style>
                <foreignObject width="100%" height="100%">
                    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px; height:${H}px; position:relative; background:transparent;">
                        ${mirrorContainer.innerHTML}
                    </div>
                </foreignObject>
            </svg>
        `;

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Không thể tạo 2D context");

        ctx.drawImage(imgElement, 0, 0, W, H);

        if (page.eraserLayerBlob) {
            await new Promise<void>((resolve) => {
                const eraserImg = new Image();
                const url = URL.createObjectURL(page.eraserLayerBlob!);
                eraserImg.onload = () => {
                    ctx.drawImage(eraserImg, 0, 0, W, H);
                    URL.revokeObjectURL(url);
                    resolve();
                };
                eraserImg.onerror = () => {
                    URL.revokeObjectURL(url);
                    resolve();
                };
                eraserImg.src = url;
            });
        } else if ((page as any).eraserCanvasDataUrl) {
            await new Promise<void>((resolve) => {
                const eraserImg = new Image();
                eraserImg.onload = () => {
                    ctx.drawImage(eraserImg, 0, 0, W, H);
                    resolve();
                };
                eraserImg.onerror = () => resolve();
                eraserImg.src = (page as any).eraserCanvasDataUrl;
            });
        } else if (elements.eraserCanvas && elements.eraserCanvas.width > 0) {
            ctx.drawImage(elements.eraserCanvas, 0, 0, W, H);
        }

        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        await new Promise<void>((resolve, reject) => {
            const svgImg = new Image();
            svgImg.onload = () => {
                ctx.drawImage(svgImg, 0, 0, W, H);
                URL.revokeObjectURL(svgUrl);
                resolve();
            };
            svgImg.onerror = (err) => {
                URL.revokeObjectURL(svgUrl);
                reject(err);
            };
            svgImg.src = svgUrl;
        });

        return canvas;
    } finally {
        if (mirrorContainer.parentNode) {
            mirrorContainer.parentNode.removeChild(mirrorContainer);
        }
    }
}
