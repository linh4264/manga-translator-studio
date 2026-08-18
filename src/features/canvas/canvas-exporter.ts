import { globalState } from '../../core/state';
import { elements } from '../../core/elements';
import { waitForNextPaint, transformCase, parseRichTextLines } from '../../core/utils';
import { computeBubbleMask } from '../ocr/ocr-service';
import { renderOverlays, convertHexToRGBA, wrapCanvasText, wrapCanvasVerticalText, wrapRichTextTokens } from './canvas-renderer';
import { MangaPage } from '../../types/index';

function getFontFamilyName(fontClass?: string): string {
    if (!fontClass) return "'Nunito', sans-serif";
    const cleanFont = String(fontClass).trim();

    const fontMap: Record<string, string> = {
        'font-comic': "'Patrick Hand', 'Pangolin', cursive",
        'font-manga': "'Nunito', sans-serif",
        'font-vietnamese': "'Be Vietnam Pro', 'Inter', sans-serif",
        'font-comicneue': "'Comic Neue', cursive",
        'font-impact': "'Bangers', cursive",
        'font-marker': "'Permanent Marker', cursive",
        'font-bungee': "'Bungee', cursive",
        'font-caveat': "'Caveat', cursive",
        'font-tech': "'Chakra Petch', sans-serif",
        'font-condensed': "'Saira Condensed', sans-serif"
    };

    if (fontMap[cleanFont]) return fontMap[cleanFont];
    const stripped = cleanFont.replace(/^font-/, '');
    return `'${cleanFont}', '${stripped}', 'Nunito', sans-serif`;
}

export async function renderPageToCanvas2D(page: MangaPage, bgImageOverride: HTMLImageElement | null = null): Promise<HTMLCanvasElement> {
    let imgElement = bgImageOverride || elements.mangaBgImage;
    if (!imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) {
        const pageFile = page.originalFile || page.file;
        const srcToLoad = pageFile ? URL.createObjectURL(pageFile as Blob) : page.src;
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

    await document.fonts.ready;

    let activeImageData = page.imageDataCache || null;
    const hasBubbleFit = page.blocks && page.blocks.some(block => (block.style.maskShape || 'bubble-fit') === 'bubble-fit');
    if (hasBubbleFit && !activeImageData) {
        try {
            const bgCanvas = document.createElement('canvas');
            bgCanvas.width = W;
            bgCanvas.height = H;
            const bgCtx = bgCanvas.getContext('2d');
            if (bgCtx) {
                bgCtx.drawImage(imgElement, 0, 0);
                activeImageData = bgCtx.getImageData(0, 0, W, H);
                page.imageDataCache = activeImageData;
            }
        } catch (e) {
            console.error("Lỗi tạo imageDataCache khi xuất canvas:", e);
        }
    }

    if (page.blocks && page.blocks.length > 0) {
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

            let displayWidth = (page as any).lastDisplayWidth;
            if (!displayWidth && imgElement && imgElement.clientWidth > 0) {
                const zoomScale = (globalState.zoom || 100) / 100;
                displayWidth = imgElement.clientWidth / zoomScale;
            }
            if (!displayWidth) {
                const activePage = globalState.activePageIndex !== -1 ? globalState.pages[globalState.activePageIndex] : null;
                if (activePage && (activePage as any).lastDisplayWidth) {
                    displayWidth = (activePage as any).lastDisplayWidth;
                }
            }
            if (!displayWidth || isNaN(displayWidth)) displayWidth = 800;
            const scaleFactor = W / Math.max(1, displayWidth);
            const fontSizePx = (block.style.fontSize || 13) * scaleFactor;
            let padXPx = 4 * scaleFactor;
            let padYPx = 4 * scaleFactor;
            if (typeof block.style.padding === 'string' && block.style.padding.includes('%')) {
                const parts = block.style.padding.trim().split(/\s+/);
                const pctY = parseFloat(parts[0]) || 9;
                const pctX = parseFloat(parts[1] || parts[0]) || 12;
                padYPx = bh * (pctY / 100);
                padXPx = bw * (pctX / 100);
            } else if (typeof block.style.padding === 'number') {
                padXPx = block.style.padding * scaleFactor;
                padYPx = block.style.padding * scaleFactor;
            } else {
                padYPx = bh * 0.09;
                padXPx = bw * 0.12;
            }

            const maskShape = block.style.maskShape || 'bubble-fit';
            const maskSize = block.style.maskSize || 'full';

            const insetPad = Math.max(1, Math.round(scaleFactor * 0.8));
            let fillBx = bx + insetPad;
            let fillBy = by + insetPad;
            let fillBw = Math.max(1, bw - (insetPad * 2));
            let fillBh = Math.max(1, bh - (insetPad * 2));

            if (maskSize === 'snug' && block.translated && block.translated.trim()) {
                if (block.style.vertical) {
                    const maxColHeight = Math.max(10, bh - (padYPx * 2));
                    const cols = wrapCanvasVerticalText(block.translated, maxColHeight, fontSizePx);
                    const colStep = fontSizePx * 1.15;
                    const charStep = fontSizePx * 1.15;
                    const totalTextWidth = cols.length * colStep;
                    let maxColLength = 0;
                    cols.forEach(c => { if (c.length > maxColLength) maxColLength = c.length; });
                    const totalTextHeight = maxColLength * charStep;

                    const snugW = Math.min(fillBw, totalTextWidth + (padXPx * 2));
                    const snugH = Math.min(fillBh, totalTextHeight + (padYPx * 2));
                    fillBx = bx + (bw - snugW) / 2;
                    fillBy = by + (bh - snugH) / 2;
                    fillBw = snugW;
                    fillBh = snugH;
                } else {
                    const maxTextWidth = Math.max(10, bw - (padXPx * 2));
                    const textLines = wrapCanvasText(ctx, block.translated, maxTextWidth);
                    const lineHeight = fontSizePx * 1.15;
                    const totalTextHeight = textLines.length * lineHeight;
                    let maxLineWidth = 0;
                    textLines.forEach(line => {
                        const w = ctx.measureText(line).width;
                        if (w > maxLineWidth) maxLineWidth = w;
                    });
                    const totalTextWidth = maxLineWidth;

                    const snugW = Math.min(fillBw, totalTextWidth + (padXPx * 2));
                    const snugH = Math.min(fillBh, totalTextHeight + (padYPx * 2));
                    fillBx = bx + (bw - snugW) / 2;
                    if (block.style.align === 'left') fillBx = bx + insetPad;
                    else if (block.style.align === 'right') fillBx = bx + bw - snugW - insetPad;
                    fillBy = by + (bh - snugH) / 2;
                    fillBw = snugW;
                    fillBh = snugH;
                }
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

        for (const block of page.blocks) {
            if (block.type === 'image') continue;
            if (!block.translated || !block.translated.trim()) continue;

            const bx = (block.box.x / 100) * W;
            const by = (block.box.y / 100) * H;
            const bw = (block.box.w / 100) * W;
            const bh = (block.box.h / 100) * H;
            const maskShape = block.style.maskShape || 'bubble-fit';

            ctx.save();

            const totalTextAngle = (parseFloat(block.style.rotate as any) || 0) + (parseFloat(block.style.textRotate as any) || 0);
            if (totalTextAngle !== 0) {
                const cx = bx + bw / 2;
                const cy = by + bh / 2;
                ctx.translate(cx, cy);
                ctx.rotate((totalTextAngle * Math.PI) / 180);
                ctx.translate(-cx, -cy);
            }

            const fontName = getFontFamilyName(block.style.fontFamily);
            let displayWidth = (page as any).lastDisplayWidth;
            if (!displayWidth && imgElement && imgElement.clientWidth > 0) {
                const zoomScale = (globalState.zoom || 100) / 100;
                displayWidth = imgElement.clientWidth / zoomScale;
            }
            if (!displayWidth) {
                const activePage = globalState.activePageIndex !== -1 ? globalState.pages[globalState.activePageIndex] : null;
                if (activePage && (activePage as any).lastDisplayWidth) {
                    displayWidth = (activePage as any).lastDisplayWidth;
                }
            }
            if (!displayWidth || isNaN(displayWidth)) displayWidth = 800;
            const scaleFactor = W / Math.max(1, displayWidth);
            const fontSizePx = (block.style.fontSize || 13) * scaleFactor;
            const fontWeight = block.style.bold ? 'bold ' : '';
            const fontItalic = block.style.italic ? 'italic ' : '';

            const fontSpec = `${fontItalic}${fontWeight}${fontSizePx}px ${fontName}`;
            ctx.font = fontSpec;
            try {
                if (document.fonts && document.fonts.load) {
                    await document.fonts.load(fontSpec);
                    ctx.font = fontSpec;
                }
            } catch (e) {}
            ctx.fillStyle = block.style.textColor || '#000000';

            const letterSpacingPx = (block.style.letterSpacing || 0) * scaleFactor;
            if ('letterSpacing' in ctx) {
                (ctx as any).letterSpacing = `${letterSpacingPx}px`;
            }

            let padXPx = 4 * scaleFactor;
            let padYPx = 4 * scaleFactor;
            if (typeof block.style.padding === 'string' && block.style.padding.includes('%')) {
                const parts = block.style.padding.trim().split(/\s+/);
                const pctY = parseFloat(parts[0]) || 9;
                const pctX = parseFloat(parts[1] || parts[0]) || 12;
                padYPx = bh * (pctY / 100);
                padXPx = bw * (pctX / 100);
            } else if (typeof block.style.padding === 'number') {
                padXPx = block.style.padding * scaleFactor;
                padYPx = block.style.padding * scaleFactor;
            } else {
                padYPx = bh * 0.09;
                padXPx = bw * 0.12;
            }
            const paddingPx = Math.max(padXPx, padYPx);

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

            const transformedText = transformCase(block.translated, block.style.textTransform || 'none');
            const currentLineHeight = block.style.lineHeight !== undefined ? block.style.lineHeight : 1.15;

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

            let columns: string[][] = [];
            let totalTextWidth = 0;
            let totalTextHeight = 0;

            if (block.style.vertical) {
                const maxColHeight = Math.max(10, bh - (padYPx * 2));
                columns = wrapCanvasVerticalText(transformedText, maxColHeight, fontSizePx);
                const colStep = fontSizePx * currentLineHeight;
                const charStep = fontSizePx * currentLineHeight;
                totalTextWidth = columns.length * colStep;
                let maxColLength = 0;
                columns.forEach(c => { if (c.length > maxColLength) maxColLength = c.length; });
                totalTextHeight = maxColLength * charStep;
            } else {
                const isEllipseShape = maskShape === 'ellipse';
                const fitMargin = isEllipseShape ? 0.88 : 1.0;
                const maxTextWidth = Math.max(10, (bw - (padXPx * 2)) * fitMargin);
                const lineHeight = fontSizePx * currentLineHeight;
                const isDiamond = !!block.style.diamondWrap;

                const tokenLines = parseRichTextLines(transformedText, {
                    bold: !!block.style.bold,
                    italic: !!block.style.italic,
                    underline: !!block.style.underline
                });

                const getFontFn = (tok: any) => {
                    const tokItalic = tok.italic ? 'italic ' : '';
                    const tokWeight = tok.bold ? 'bold ' : '';
                    const tokSize = fontSizePx * (tok.sizeRatio || 1.0);
                    const tokFont = tok.font ? getFontFamilyName(tok.font) : fontName;
                    return `${tokItalic}${tokWeight}${tokSize}px ${tokFont}`;
                };

                const wrappedTokenLines = wrapRichTextTokens(ctx, tokenLines, maxTextWidth, isDiamond, Math.max(10, bh - (padYPx * 2)), lineHeight, getFontFn);
                totalTextHeight = wrappedTokenLines.length * lineHeight;

                let maxLineWidth = 0;
                wrappedTokenLines.forEach(lineToks => {
                    let w = 0;
                    lineToks.forEach(t => {
                        ctx.font = getFontFn(t);
                        w += ctx.measureText(t.text).width;
                    });
                    if (w > maxLineWidth) maxLineWidth = w;
                });
                totalTextWidth = maxLineWidth;
            }

            ctx.font = `${fontItalic}${fontWeight}${fontSizePx}px ${fontName}`;
            ctx.fillStyle = block.style.textColor || '#000000';

            const arcAngle = block.style.arcAngle || 0;
            const skewX = block.style.skewX || 0;
            const skewY = block.style.skewY || 0;
            const warpWave = block.style.warpWave || 0;
            const warpBulge = block.style.warpBulge || 0;

            const hasSkew = (skewX !== 0 || skewY !== 0);
            const hasCharWarp = (arcAngle !== 0) || (warpWave !== 0) || (warpBulge !== 0);

            if (block.style.vertical) {
                const colStep = fontSizePx * currentLineHeight;
                const charStep = fontSizePx * currentLineHeight;
                let rightX = bx + bw / 2 + totalTextWidth / 2 - colStep / 2;

                for (let j = 0; j < columns.length; j++) {
                    const colChars = columns[j];
                    const colX = rightX - (j * colStep);
                    const colHeight = colChars.length * charStep;
                    let startY = by + (bh / 2) - (colHeight / 2) + (charStep / 2);
                    const minStartY = by + paddingPx + (charStep / 2);
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
                        const char = colChars[k];
                        let charY = startY + (k * charStep);
                        let charX = colX;
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
                            charX += totalOffsetX;
                        }

                        ctx.save();
                        ctx.translate(charX, charY);
                        if (rotRad !== 0) ctx.rotate(rotRad);
                        if (bulgeScale !== 1) ctx.scale(bulgeScale, bulgeScale);
                        if (char === '…' || char === '―' || char === '—' || char === '~' || char === '～' || char === '-') {
                            ctx.rotate(Math.PI / 2);
                        }

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
                        ctx.fillStyle = blockGradient || (block.style.textColor || '#000000');
                        ctx.fillText(char, 0, 0);
                        ctx.restore();

                        ctx.restore();
                    }
                    ctx.restore();
                }
            } else {
                const lineHeight = fontSizePx * currentLineHeight;
                let startY = by + (bh / 2) - (totalTextHeight / 2) + (lineHeight / 2) - (fontSizePx * 0.05);
                const minStartY = by + padYPx + (lineHeight / 2);
                if (startY < minStartY) startY = minStartY;

                let startX = bx + bw / 2;
                if (block.style.align === 'left') startX = bx + padXPx;
                else if (block.style.align === 'right') startX = bx + bw - padXPx;

                ctx.textBaseline = 'middle';

                const tokenLines = parseRichTextLines(transformedText, {
                    bold: !!block.style.bold,
                    italic: !!block.style.italic,
                    underline: !!block.style.underline
                });

                const isEllipseShape = maskShape === 'ellipse';
                const fitMargin = isEllipseShape ? 0.88 : 1.0;
                const maxTextWidth = Math.max(10, (bw - (padXPx * 2)) * fitMargin);
                const isDiamond = !!block.style.diamondWrap;

                const getFontFn = (tok: any) => {
                    const tokItalic = tok.italic ? 'italic ' : '';
                    const tokWeight = tok.bold ? 'bold ' : '';
                    const tokSize = fontSizePx * (tok.sizeRatio || 1.0);
                    const tokFont = tok.font ? getFontFamilyName(tok.font) : fontName;
                    return `${tokItalic}${tokWeight}${tokSize}px ${tokFont}`;
                };

                const wrappedTokenLines = wrapRichTextTokens(ctx, tokenLines, maxTextWidth, isDiamond, Math.max(10, bh - (padYPx * 2)), lineHeight, getFontFn);

                for (let i = 0; i < wrappedTokenLines.length; i++) {
                    const lineTokens = wrappedTokenLines[i];
                    const lineY = startY + (i * lineHeight);

                    ctx.save();
                    if (hasSkew) {
                        const radX = (skewX * Math.PI) / 180;
                        const radY = (skewY * Math.PI) / 180;
                        ctx.translate(startX, lineY);
                        ctx.transform(1, Math.tan(radY), Math.tan(radX), 1, 0, 0);
                        ctx.translate(-startX, -lineY);
                    }

                    if (hasCharWarp) {
                        const rawChars: Array<{ char: string; token: any }> = [];
                        lineTokens.forEach(tok => {
                            const segs = (typeof Intl !== 'undefined' && (Intl as any).Segmenter)
                                ? Array.from(new (Intl as any).Segmenter().segment(tok.text)).map((s: any) => s.segment)
                                : Array.from(tok.text);
                            segs.forEach((s: any) => rawChars.push({ char: s as string, token: tok }));
                        });

                        const count = rawChars.length;
                        const arcDepth = (arcAngle / 45) * 8 * scaleFactor;
                        const waveAmp = (warpWave / 50) * 10 * scaleFactor;
                        const bulgeFactor = (warpBulge / 50) * 0.4;

                        let lineW = 0;
                        rawChars.forEach(({ char: c, token: t }) => {
                            ctx.font = getFontFn(t);
                            lineW += ctx.measureText(c).width;
                        });

                        let startCharX = startX - (lineW / 2);
                        if (block.style.align === 'left') startCharX = bx + paddingPx;
                        else if (block.style.align === 'right') startCharX = bx + bw - paddingPx - lineW;

                        let curX = startCharX;
                        ctx.textAlign = 'center';

                        for (let k = 0; k < count; k++) {
                            const { char, token: tok } = rawChars[k];
                            ctx.font = getFontFn(tok);
                            const cw = ctx.measureText(char).width;
                            const charCenterX = curX + (cw / 2);
                            const t = count > 1 ? (k - (count - 1) / 2) / ((count - 1) / 2) : 0;

                            const arcOffset = (1 - t * t) * -arcDepth;
                            const waveOffset = Math.sin(t * Math.PI) * waveAmp;
                            const totalOffsetY = arcOffset + waveOffset;

                            const rotRad = t * (arcAngle * 0.35) * (Math.PI / 180);
                            const bulgeScale = 1 + (1 - t * t) * bulgeFactor;

                            ctx.save();
                            ctx.translate(charCenterX, lineY + totalOffsetY);
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

                            curX += cw;
                        }
                    } else {
                        let measuredLineWidth = 0;
                        const tokenMeasures = lineTokens.map(tok => {
                            const tokFontSpec = getFontFn(tok);
                            ctx.font = tokFontSpec;
                            const w = ctx.measureText(tok.text).width;
                            measuredLineWidth += w;
                            const tokSize = fontSizePx * (tok.sizeRatio || 1.0);
                            return { tok, w, fontSpec: tokFontSpec, tokSize };
                        });

                        let curTokenX = startX;
                        if (!block.style.align || block.style.align === 'center') {
                            curTokenX = startX - (measuredLineWidth / 2);
                        } else if (block.style.align === 'right') {
                            curTokenX = startX - measuredLineWidth;
                        }

                        ctx.textAlign = 'left';

                        tokenMeasures.forEach(({ tok, w: tokenW, fontSpec: tokFontSpec, tokSize }) => {
                            ctx.font = tokFontSpec;

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
                                ctx.strokeText(tok.text, curTokenX, lineY);
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
                                ctx.strokeText(tok.text, curTokenX, lineY);
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

                            let fillToApply: any = tok.color || (block.style.gradientEnabled && blockGradient ? blockGradient : (block.style.textColor || '#000000'));

                            ctx.fillStyle = fillToApply;
                            ctx.fillText(tok.text, curTokenX, lineY);
                            ctx.restore();

                            if (tok.underline || block.style.underline) {
                                ctx.save();
                                ctx.strokeStyle = tok.color || block.style.textColor || '#000000';
                                ctx.lineWidth = Math.max(1, tokSize * 0.08);
                                ctx.beginPath();
                                const underlineY = lineY + (tokSize * 0.55);
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
                                ctx.moveTo(curTokenX, lineY);
                                ctx.lineTo(curTokenX + tokenW, lineY);
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
                    const subY = startY + (wrappedTokenLines.length * lineHeight) + (subFontSizePx * 0.5);
                    const subLines = wrapCanvasText(ctx, block.original, maxTextWidth);
                    const subLineHeight = subFontSizePx * 1.1;
                    ctx.textAlign = (!block.style.align || block.style.align === 'center') ? 'center' : (block.style.align === 'right' ? 'right' : 'left');
                    let subStartX = startX;
                    for (let si = 0; si < subLines.length; si++) {
                        ctx.fillText(subLines[si], subStartX, subY + (si * subLineHeight));
                    }
                    ctx.restore();
                }
            }

            ctx.restore();
        }
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

    let displayWidth = (page as any).lastDisplayWidth;
    if (!displayWidth && imgElement) {
        const zoomScale = (globalState.zoom || 100) / 100;
        displayWidth = imgElement.clientWidth / zoomScale;
    }
    if (!displayWidth || isNaN(displayWidth)) displayWidth = 800;
    const forceExportScale = W / Math.max(1, displayWidth);

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
        await document.fonts.ready;
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
