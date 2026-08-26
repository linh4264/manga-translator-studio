import { globalState } from '../../core/state';
import { elements } from '../../core/elements';
import { computeBubbleMask } from '../ocr/ocr-service';
import { convertHexToRGBA } from './canvas-renderer';
import {
    computeBlockTextLayout,
    renderBlockTextToCanvas,
    ensureFontsLoadedForPage,
    getFontFamilyName,
    getOpticalBaselineOffset,
    getCachedDerivedLines,
    setCachedDerivedLines,
    invalidateBlockDerivedLines,
    computeBlockDerivedLinesKey
} from './text-layout-engine';
import { MangaPage, MangaBlock } from '../../types/index';
import type { TextLayoutResult, LayoutLine, DerivedLinesCache } from './text-layout-engine';

export {
    getFontFamilyName,
    getOpticalBaselineOffset,
    computeBlockTextLayout,
    renderBlockTextToCanvas,
    getCachedDerivedLines,
    setCachedDerivedLines,
    invalidateBlockDerivedLines,
    computeBlockDerivedLinesKey
};
export type { TextLayoutResult as BlockTextLayout, LayoutLine as BlockTextLayoutLine, DerivedLinesCache };

/**
 * Gets reference display dimensions (width & height in editor coordinate system) for a page.
 * Isolates UI zoom and natural resolution so typesetting and line-breaks
 * always operate in reference display pixels consistent with layout calculation.
 */
export function getReferenceDisplayDimensions(page?: MangaPage | null, imgElement?: HTMLImageElement | null): { width: number; height: number } {
    let displayWidth = (page as any)?.lastDisplayWidth;
    const imgEl = imgElement || (typeof document !== 'undefined' ? elements.mangaBgImage : null);
    const zoomScale = (globalState.zoom || 100) / 100;

    const isCurrentActiveEl = (typeof document !== 'undefined' && imgEl === elements.mangaBgImage);

    if (!displayWidth && isCurrentActiveEl && imgEl && imgEl.clientWidth > 0) {
        displayWidth = Math.round(imgEl.clientWidth / Math.max(0.01, zoomScale));
    }

    const naturalW = (imgEl && imgEl.naturalWidth > 0) ? imgEl.naturalWidth : (page?.width || 800);
    const naturalH = (imgEl && imgEl.naturalHeight > 0) ? imgEl.naturalHeight : (page?.height || 1200);
    const aspect = naturalH / Math.max(1, naturalW);

    if (!displayWidth) {
        // Inherit lastDisplayWidth from active page or any configured page in project
        if (globalState.activePageIndex >= 0 && globalState.pages[globalState.activePageIndex]?.lastDisplayWidth) {
            displayWidth = globalState.pages[globalState.activePageIndex].lastDisplayWidth;
        } else if (globalState.pages && globalState.pages.length > 0) {
            const anyPageWithWidth = globalState.pages.find(p => p.lastDisplayWidth && p.lastDisplayWidth > 0);
            if (anyPageWithWidth) {
                displayWidth = anyPageWithWidth.lastDisplayWidth;
            }
        }
    }

    if (!displayWidth) {
        // Check active DOM container/viewport if available
        if (typeof document !== 'undefined' && elements.mangaBgImage && elements.mangaBgImage.clientWidth > 0) {
            displayWidth = elements.mangaBgImage.clientWidth / Math.max(0.01, zoomScale);
        } else if (typeof document !== 'undefined' && elements.mangaCanvasContainer && elements.mangaCanvasContainer.clientWidth > 0) {
            displayWidth = elements.mangaCanvasContainer.clientWidth / Math.max(0.01, zoomScale);
        } else if (typeof document !== 'undefined' && elements.workspaceViewport && elements.workspaceViewport.clientWidth > 0) {
            displayWidth = Math.min((elements.workspaceViewport.clientWidth - 32) / Math.max(0.01, zoomScale), 1000);
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

/**
 * Shared canonical layout representation: Computes exact block layout adhering
 * strictly to the Single Source of Truth layout engine with key-validated derived lines cache.
 */
export function buildBlockTextLayout(
    block: MangaBlock,
    W: number,
    H: number,
    scaleFactor: number = 1.0,
    ctx?: CanvasRenderingContext2D | null,
    page?: MangaPage | null
): TextLayoutResult {
    const { width: refW, height: refH } = page ? getReferenceDisplayDimensions(page) : { width: W / Math.max(0.0001, scaleFactor), height: H / Math.max(0.0001, scaleFactor) };
    let lockedLines: any = getCachedDerivedLines(block, refW);

    if (!lockedLines) {
        const refLayout = computeBlockTextLayout(block, refW, refH, 1.0, ctx);
        if (refLayout && refLayout.lines && refLayout.lines.length > 0) {
            lockedLines = refLayout.lines.map(l => l.tokens);
            setCachedDerivedLines(block, lockedLines, refW);
        }
    }

    return computeBlockTextLayout(block, W, H, scaleFactor, ctx, lockedLines || undefined);
}

/**
 * Renders an entire MangaPage onto an Offscreen Canvas 2D.
 * Guarantees that fonts are fully loaded before rendering.
 */
export async function renderPageToCanvas2D(page: MangaPage, bgImageOverride: HTMLImageElement | null = null): Promise<HTMLCanvasElement> {
    // 1. Ensure custom and remote fonts are loaded
    await ensureFontsLoadedForPage(page);

    // 2. Render directly onto Offscreen Canvas 2D
    return renderPageToCanvas2DDirect(page, bgImageOverride);
}

/**
 * Direct Canvas 2D page compositing pipeline:
 * 1. Base image
 * 2. Inpainting / eraser masks
 * 3. Speech bubble background masks / covers
 * 4. Pure text rendering using canonical TextLayoutResult
 */
export async function renderPageToCanvas2DDirect(page: MangaPage, bgImageOverride: HTMLImageElement | null = null): Promise<HTMLCanvasElement> {
    const isCurrentActivePage = (globalState.activePageIndex >= 0 && page === globalState.pages[globalState.activePageIndex]);
    let imgElement = bgImageOverride || (isCurrentActivePage ? elements.mangaBgImage : null);
    let createdBlobUrl: string | null = null;

    if (!imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) {
        if (!page.originalFile && !page.file && !page.src && page.id) {
            try {
                const { activatePage } = await import('../../core/state');
                await activatePage(page);
            } catch (e) {
                console.warn("Could not activate page from DB:", e);
            }
        }
        const pageFile = page.originalFile || page.file;
        let srcToLoad = pageFile ? (createdBlobUrl = URL.createObjectURL(pageFile as Blob)) : page.src;
        if (!srcToLoad && page.thumbnailBlob) {
            srcToLoad = (createdBlobUrl = URL.createObjectURL(page.thumbnailBlob as Blob));
        } else if (!srcToLoad && page.thumbnailSrc) {
            srcToLoad = page.thumbnailSrc;
        }

        if (srcToLoad) {
            const offImg = new Image();
            offImg.crossOrigin = 'anonymous';
            await new Promise<void>((resolve) => {
                offImg.onload = () => resolve();
                offImg.onerror = () => resolve();
                offImg.src = srcToLoad!;
            });
            if (offImg.naturalWidth > 0) {
                imgElement = offImg;
            }
        }
    }

    if (!imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) {
        if (createdBlobUrl) URL.revokeObjectURL(createdBlobUrl);
        throw new Error(`Trang "${page.name || page.id}" không có dữ liệu ảnh gốc hợp lệ để kết xuất.`);
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

    let activeImageData = page.imageDataCache || null;
    const hasBubbleFit = page.blocks && page.blocks.some(block => (block.style?.maskShape || 'bubble-fit') === 'bubble-fit');
    if (hasBubbleFit && !activeImageData) {
        try {
            activeImageData = ctx.getImageData(0, 0, W, H);
            page.imageDataCache = activeImageData;
        } catch (e) {
            console.error("Lỗi trích xuất imageDataCache khi xuất canvas:", e);
        }
    }

    // Overlay inpainting / eraser layer
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

    const scaleFactor = getExportScale(page, W, imgElement);

    if (page.blocks && page.blocks.length > 0) {
        const memoizedLayouts = new Map<string, TextLayoutResult>();
        const getOrComputeLayout = (block: MangaBlock) => {
            const cached = memoizedLayouts.get(block.id);
            if (cached) return cached;
            const l = buildBlockTextLayout(block, W, H, scaleFactor, ctx, page);
            memoizedLayouts.set(block.id, l);
            return l;
        };

        // PASS 1: Render masks / bubble backgrounds / image blocks
        for (const block of page.blocks) {
            const bx = (block.box.x / 100) * W;
            const by = (block.box.y / 100) * H;
            const bw = (block.box.w / 100) * W;
            const bh = (block.box.h / 100) * H;

            if (block.type === 'image') {
                if (!block.imageUrl) continue;
                ctx.save();
                if (block.style?.rotate) {
                    const cx = bx + bw / 2;
                    const cy = by + bh / 2;
                    ctx.translate(cx, cy);
                    ctx.rotate((block.style.rotate * Math.PI) / 180);
                    ctx.translate(-cx, -cy);
                }

                ctx.globalAlpha = (block.style?.opacity !== undefined ? block.style.opacity : 100) / 100;

                await new Promise<void>((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        if (block.style?.borderRadius && block.style.borderRadius > 0) {
                            const rad = (block.style.borderRadius / 100) * Math.min(bw, bh);
                            ctx.beginPath();
                            if (typeof ctx.roundRect === 'function') {
                                ctx.roundRect(bx, by, bw, bh, rad);
                            } else {
                                ctx.rect(bx, by, bw, bh);
                            }
                            ctx.clip();
                        }

                        const fitMode = block.style?.fit || 'contain';
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

            if (block.style?.rotate) {
                const cx = bx + bw / 2;
                const cy = by + bh / 2;
                ctx.translate(cx, cy);
                ctx.rotate((block.style.rotate * Math.PI) / 180);
                ctx.translate(-cx, -cy);
            }

            const maskShape = block.style?.maskShape || 'bubble-fit';
            const maskSize = block.style?.maskSize || 'full';

            const insetPad = Math.max(1, Math.round(scaleFactor * 0.8));
            let fillBx = bx + insetPad;
            let fillBy = by + insetPad;
            let fillBw = Math.max(1, bw - (insetPad * 2));
            let fillBh = Math.max(1, bh - (insetPad * 2));

            if (maskSize === 'snug' && block.translated && block.translated.trim()) {
                const layout = getOrComputeLayout(block);
                const snugW = Math.min(fillBw, layout.totalWidth + (layout.padXPx * 2));
                const snugH = Math.min(fillBh, layout.totalHeight + (layout.padYPx * 2));
                fillBx = bx + (bw - snugW) / 2;
                if (!layout.isVertical) {
                    if (block.style?.align === 'left') fillBx = bx + insetPad;
                    else if (block.style?.align === 'right') fillBx = bx + bw - snugW - insetPad;
                }
                fillBy = by + (bh - snugH) / 2;
                fillBw = snugW;
                fillBh = snugH;
            }

            const hexBgColor = block.style?.bgColor || '#ffffff';
            const alpha = (block.style?.bgOpacity !== undefined ? block.style.bgOpacity : 100) / 100;

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

        // PASS 2: Render pure text layers using canonical renderBlockTextToCanvas
        for (const block of page.blocks) {
            if (block.type === 'image') continue;
            if (!block.translated || !block.translated.trim()) continue;

            const layout = getOrComputeLayout(block);
            renderBlockTextToCanvas(ctx, block, layout, scaleFactor, {
                bilingualMode: globalState.bilingualMode
            });
        }
    }

    if (!isCurrentActivePage) {
        page.imageDataCache = null;
    }

    return canvas;
}
