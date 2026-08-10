import { globalState } from '../../core/state.js';
import { elements } from '../../core/elements.js';
import { waitForNextPaint } from '../../core/utils.js';
import { computeBubbleMask } from '../ocr/ocr-service.js';
import { renderOverlays, convertHexToRGBA, wrapCanvasText, wrapCanvasVerticalText } from './canvas-renderer.js';

// Helper mapper cho phông chữ canvas kết xuất
function getFontFamilyName(fontClass) {
    const fontMap = {
        'font-comic': "'Patrick Hand', cursive",
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

    if (fontMap[fontClass]) return fontMap[fontClass];
    if (fontClass && !fontClass.startsWith('font-')) return `'${fontClass}', sans-serif`;
    return "'Patrick Hand', cursive";
}

export async function renderPageToCanvas2D(page, bgImageOverride = null) {
    const imgElement = bgImageOverride || elements.mangaBgImage;
    if (!imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) {
        throw new Error("Dữ liệu ảnh gốc chưa sẵn sàng.");
    }

    const W = imgElement.naturalWidth;
    const H = imgElement.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(imgElement, 0, 0, W, H);

    if (page.eraserLayerBlob) {
        await new Promise((resolve) => {
            const eraserImg = new Image();
            const url = URL.createObjectURL(page.eraserLayerBlob);
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
    } else if (page === globalState.pages[globalState.activePageIndex] && elements.eraserCanvas && elements.eraserCanvas.width > 0) {
        ctx.drawImage(elements.eraserCanvas, 0, 0, W, H);
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
            bgCtx.drawImage(imgElement, 0, 0);
            activeImageData = bgCtx.getImageData(0, 0, W, H);
            page.imageDataCache = activeImageData;
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

                await new Promise((resolve) => {
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
                                // Default: contain
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
                    img.src = block.imageUrl;
                });

                ctx.restore();
                continue;
            }

            if (!block.translated || !block.translated.trim()) continue;

            ctx.save();

            if (block.style.rotate) {
                const cx = bx + bw / 2;
                const cy = by + bh / 2;
                ctx.translate(cx, cy);
                ctx.rotate((block.style.rotate * Math.PI) / 180);
                ctx.translate(-cx, -cy);
            }

            const fontName = getFontFamilyName(block.style.fontFamily);
            let displayWidth = page.lastDisplayWidth;
            if (!displayWidth && imgElement) {
                const zoomScale = (globalState.zoom || 100) / 100;
                displayWidth = imgElement.clientWidth / zoomScale;
            }
            if (!displayWidth || isNaN(displayWidth)) displayWidth = 800;
            const scaleFactor = W / Math.max(1, displayWidth);
            const fontSizePx = (block.style.fontSize || 16) * scaleFactor;
            const fontWeight = block.style.bold ? 'bold' : 'normal';

            const fontSpec = `${fontWeight} ${fontSizePx}px ${fontName}`;
            ctx.font = fontSpec;
            try {
                if (document.fonts && document.fonts.load) {
                    await document.fonts.load(fontSpec);
                    ctx.font = fontSpec;
                }
            } catch (e) {}
            ctx.fillStyle = block.style.textColor || '#000000';

            const paddingPx = (block.style.padding !== undefined ? block.style.padding : 4) * scaleFactor;
            const strokeWidth = parseFloat(block.style.strokeWidth) || 0;
            const strokeColor = block.style.strokeColor || '#ffffff';
            const strokeWidthPx = strokeWidth * scaleFactor;

            const shadowBlur = parseFloat(block.style.shadowBlur) || 0;
            const shadowColor = block.style.shadowColor || '#000000';
            const shadowBlurPx = shadowBlur * scaleFactor;

            const maskShape = block.style.maskShape || 'bubble-fit';
            const maskSize = block.style.maskSize || 'full';

            let textLines = [];
            let columns = [];
            let totalTextWidth = 0;
            let totalTextHeight = 0;

            const insetPad = Math.max(1, Math.round(scaleFactor * 0.8));
            let fillBx = bx + insetPad;
            let fillBy = by + insetPad;
            let fillBw = Math.max(1, bw - (insetPad * 2));
            let fillBh = Math.max(1, bh - (insetPad * 2));

            const strokeExtra = strokeWidthPx > 0 ? (strokeWidthPx * 1.2) : 0;
            const safetyMargin = Math.max(2, Math.round(scaleFactor * 2));

            if (block.style.vertical) {
                const maxColHeight = Math.max(10, bh - (paddingPx * 2) - strokeExtra - safetyMargin);
                columns = wrapCanvasVerticalText(block.translated, maxColHeight, fontSizePx);
                const colStep = fontSizePx * 1.12;
                const charStep = fontSizePx * 1.12;
                totalTextWidth = columns.length * colStep;
                let maxColLength = 0;
                columns.forEach(c => { if (c.length > maxColLength) maxColLength = c.length; });
                totalTextHeight = maxColLength * charStep;

                if (maskSize === 'snug') {
                    const snugW = Math.min(fillBw, totalTextWidth + (paddingPx * 2));
                    const snugH = Math.min(fillBh, totalTextHeight + (paddingPx * 2));
                    fillBx = bx + (bw - snugW) / 2;
                    fillBy = by + (bh - snugH) / 2;
                    fillBw = snugW;
                    fillBh = snugH;
                }
            } else {
                const maxTextWidth = Math.max(10, bw - (paddingPx * 2) - strokeExtra - safetyMargin);
                textLines = wrapCanvasText(ctx, block.translated, maxTextWidth);
                const lineHeight = fontSizePx * 1.18;
                totalTextHeight = textLines.length * lineHeight;
                let maxLineWidth = 0;
                textLines.forEach(line => {
                    const w = ctx.measureText(line).width;
                    if (w > maxLineWidth) maxLineWidth = w;
                });
                totalTextWidth = maxLineWidth;

                if (maskSize === 'snug') {
                    const snugW = Math.min(fillBw, totalTextWidth + (paddingPx * 2));
                    const snugH = Math.min(fillBh, totalTextHeight + (paddingPx * 2));
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

            ctx.font = `${fontWeight} ${fontSizePx}px ${fontName}`;
            ctx.fillStyle = block.style.textColor || '#000000';

            const arcAngle = block.style.arcAngle || 0;
            const skewX = block.style.skewX || 0;
            const skewY = block.style.skewY || 0;
            const warpWave = block.style.warpWave || 0;
            const warpBulge = block.style.warpBulge || 0;

            const hasSkew = (skewX !== 0 || skewY !== 0);
            const hasCharWarp = (arcAngle !== 0) || (warpWave !== 0) || (warpBulge !== 0);

            if (block.style.vertical) {
                const colStep = fontSizePx * 1.12;
                const charStep = fontSizePx * 1.12;
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
                            const arcDepth = (arcAngle / 45) * 8 * scaleFactor;
                            const waveAmp = (warpWave / 50) * 10 * scaleFactor;
                            const bulgeFactor = (warpBulge / 50) * 0.4;

                            const t = count > 1 ? (k - (count - 1) / 2) / ((count - 1) / 2) : 0;
                            const arcOffset = (1 - t * t) * -arcDepth;
                            const waveOffset = Math.sin(t * Math.PI) * waveAmp;
                            const totalOffsetX = arcOffset + waveOffset;

                            rotRad = t * (arcAngle * 0.35) * (Math.PI / 180);
                            bulgeScale = 1 + (1 - t * t) * bulgeFactor;
                            charX += totalOffsetX;
                        }

                        ctx.save();
                        ctx.translate(charX, charY);
                        if (rotRad !== 0) ctx.rotate(rotRad);
                        if (bulgeScale !== 1) ctx.scale(bulgeScale, bulgeScale);

                        if (strokeWidth > 0) {
                            ctx.save();
                            if (shadowBlur > 0) {
                                ctx.shadowColor = shadowColor;
                                ctx.shadowBlur = shadowBlurPx;
                                ctx.shadowOffsetX = 0;
                                ctx.shadowOffsetY = 0;
                            }
                            ctx.lineWidth = strokeWidthPx;
                            ctx.strokeStyle = strokeColor;
                            ctx.lineJoin = 'round';
                            ctx.miterLimit = 2;
                            ctx.strokeText(char, 0, 0);
                            ctx.restore();
                        }

                        ctx.save();
                        if (strokeWidth === 0 && shadowBlur > 0) {
                            ctx.shadowColor = shadowColor;
                            ctx.shadowBlur = shadowBlurPx;
                            ctx.shadowOffsetX = 0;
                            ctx.shadowOffsetY = 0;
                        }
                        ctx.fillStyle = block.style.textColor || '#000000';
                        ctx.fillText(char, 0, 0);
                        ctx.restore();

                        ctx.restore();
                    }
                    ctx.restore();
                }
            } else {
                const lineHeight = fontSizePx * 1.18;
                let startY = by + (bh / 2) - (totalTextHeight / 2) + (lineHeight / 2) - (fontSizePx * 0.05);
                const minStartY = by + paddingPx + (lineHeight / 2);
                if (startY < minStartY) startY = minStartY;

                let startX = bx + bw / 2;
                if (block.style.align === 'left') startX = bx + paddingPx;
                else if (block.style.align === 'right') startX = bx + bw - paddingPx;

                ctx.textBaseline = 'middle';

                for (let i = 0; i < textLines.length; i++) {
                    const lineText = textLines[i];
                    const normLineText = String(lineText || '').normalize('NFC');
                    const lineY = startY + (i * lineHeight);

                    ctx.save();
                    if (hasSkew) {
                        const radX = (skewX * Math.PI) / 180;
                        const radY = (skewY * Math.PI) / 180;
                        ctx.translate(startX, lineY);
                        ctx.transform(1, Math.tan(radY), Math.tan(radX), 1, 0, 0);
                        ctx.translate(-startX, -lineY);
                    }

                    if (hasCharWarp && normLineText.length > 1) {
                        const chars = (typeof Intl !== 'undefined' && Intl.Segmenter)
                            ? Array.from(new Intl.Segmenter().segment(normLineText)).map(s => s.segment)
                            : Array.from(normLineText);
                        const count = chars.length;
                        const arcDepth = (arcAngle / 45) * 8 * scaleFactor;
                        const waveAmp = (warpWave / 50) * 10 * scaleFactor;
                        const bulgeFactor = (warpBulge / 50) * 0.4;

                        let lineW = 0;
                        chars.forEach(c => lineW += ctx.measureText(c).width);

                        let startCharX = startX - (lineW / 2);
                        if (block.style.align === 'left') startCharX = bx + paddingPx;
                        else if (block.style.align === 'right') startCharX = bx + bw - paddingPx - lineW;

                        let curX = startCharX;
                        ctx.textAlign = 'center';

                        for (let k = 0; k < count; k++) {
                            const char = chars[k];
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

                            if (strokeWidth > 0) {
                                ctx.save();
                                if (shadowBlur > 0) {
                                    ctx.shadowColor = shadowColor;
                                    ctx.shadowBlur = shadowBlurPx;
                                    ctx.shadowOffsetX = 0;
                                    ctx.shadowOffsetY = 0;
                                }
                                ctx.lineWidth = strokeWidthPx;
                                ctx.strokeStyle = strokeColor;
                                ctx.lineJoin = 'round';
                                ctx.miterLimit = 2;
                                ctx.strokeText(char, 0, 0);
                                ctx.restore();
                            }

                            ctx.save();
                            if (strokeWidth === 0 && shadowBlur > 0) {
                                ctx.shadowColor = shadowColor;
                                ctx.shadowBlur = shadowBlurPx;
                                ctx.shadowOffsetX = 0;
                                ctx.shadowOffsetY = 0;
                            }
                            ctx.fillStyle = block.style.textColor || '#000000';
                            ctx.fillText(char, 0, 0);
                            ctx.restore();

                            ctx.restore();

                            curX += cw;
                        }
                    } else {
                        ctx.textAlign = block.style.align || 'center';
                        if (strokeWidth > 0) {
                            ctx.save();
                            if (shadowBlur > 0) {
                                ctx.shadowColor = shadowColor;
                                ctx.shadowBlur = shadowBlurPx;
                                ctx.shadowOffsetX = 0;
                                ctx.shadowOffsetY = 0;
                            }
                            ctx.lineWidth = strokeWidthPx;
                            ctx.strokeStyle = strokeColor;
                            ctx.lineJoin = 'round';
                            ctx.miterLimit = 2;
                            ctx.strokeText(lineText, startX, lineY);
                            ctx.restore();
                        }

                        ctx.save();
                        if (strokeWidth === 0 && shadowBlur > 0) {
                            ctx.shadowColor = shadowColor;
                            ctx.shadowBlur = shadowBlurPx;
                            ctx.shadowOffsetX = 0;
                            ctx.shadowOffsetY = 0;
                        }
                        ctx.fillStyle = block.style.textColor || '#000000';
                        ctx.fillText(lineText, startX, lineY);
                        ctx.restore();
                    }
                    ctx.restore();
                }
            }

            ctx.restore();
        }
    }

    return canvas;
}

export async function renderPageToCanvasSVG(page) {
    const imgElement = elements.mangaBgImage;
    if (!imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) {
        throw new Error("Dữ liệu ảnh gốc chưa sẵn sàng.");
    }

    const W = imgElement.naturalWidth;
    const H = imgElement.naturalHeight;

    let displayWidth = page.lastDisplayWidth;
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

        ctx.drawImage(imgElement, 0, 0, W, H);

        if (page.eraserLayerBlob) {
            await new Promise((resolve) => {
                const eraserImg = new Image();
                const url = URL.createObjectURL(page.eraserLayerBlob);
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
        } else if (page.eraserCanvasDataUrl) {
            await new Promise((resolve) => {
                const eraserImg = new Image();
                eraserImg.onload = () => {
                    ctx.drawImage(eraserImg, 0, 0, W, H);
                    resolve();
                };
                eraserImg.onerror = resolve;
                eraserImg.src = page.eraserCanvasDataUrl;
            });
        } else if (elements.eraserCanvas && elements.eraserCanvas.width > 0) {
            ctx.drawImage(elements.eraserCanvas, 0, 0, W, H);
        }

        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        await new Promise((resolve, reject) => {
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