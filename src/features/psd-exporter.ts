/**
 * Pure JavaScript Layered PSD Exporter for Manga Translator Studio
 * Creates multi-layer Adobe Photoshop (.psd) files with:
 * - Layer 1: Clean Background (Inpainted Manga Page)
 * - Layer 2: Original Raw Manga Background (for comparison)
 * - Layer 3+: Individual Text Layers for every translated speech bubble
 */

import { MangaPage, MangaBlock } from '../types/index';
import { renderBlockTextToCanvas, ensureFontsLoadedForPage } from './canvas/text-layout-engine';
import { getExportScale, buildBlockTextLayout } from './canvas/canvas-exporter';

export async function createMangaPSD(page: MangaPage, originalImgEl?: HTMLImageElement | null, eraserCanvas?: HTMLCanvasElement | null): Promise<Blob> {
    if (!page) {
        throw new Error("Không có dữ liệu trang manga để xuất PSD.");
    }

    const width = originalImgEl?.naturalWidth || originalImgEl?.width || page.width || 800;
    const height = originalImgEl?.naturalHeight || originalImgEl?.height || page.height || 1200;

    await ensureFontsLoadedForPage(page);

    // 1. Prepare Original Raw Canvas
    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = width;
    rawCanvas.height = height;
    const rawCtx = rawCanvas.getContext('2d');
    if (!rawCtx) throw new Error("Không thể tạo 2D context");
    if (originalImgEl) {
        rawCtx.drawImage(originalImgEl, 0, 0, width, height);
    }

    // 2. Prepare Clean / Inpaint Canvas
    const cleanCanvas = document.createElement('canvas');
    cleanCanvas.width = width;
    cleanCanvas.height = height;
    const cleanCtx = cleanCanvas.getContext('2d');
    if (!cleanCtx) throw new Error("Không thể tạo 2D context");
    cleanCtx.drawImage(rawCanvas, 0, 0);
    if (eraserCanvas && eraserCanvas.width > 0 && eraserCanvas.height > 0) {
        cleanCtx.drawImage(eraserCanvas, 0, 0, width, height);
    }

    // Try loading ag-psd from CDN first for full PSD features
    try {
        let agPsd = typeof window !== 'undefined' ? window.agPsd : undefined;
        if (!agPsd) {
            try {
                // @ts-ignore
                const mod = await import('https://esm.sh/ag-psd@14.3.0');
                agPsd = mod;
            } catch (e) {
                console.warn("Could not load ag-psd ESM, checking window fallback...", e);
            }
        }

        if (agPsd && (agPsd.writePsd || agPsd.writePsdUint8Array)) {
            const writeFn = agPsd.writePsdUint8Array || agPsd.writePsd;
            const scaleFactor = getExportScale(page, width, originalImgEl);

            const textChildren = (page.blocks || []).map((block, idx) => {
                if (block.type === 'image') return null;
                if (!block.translated || !block.translated.trim()) return null;

                const bx = Math.round((block.box.x / 100) * width);
                const by = Math.round((block.box.y / 100) * height);
                const bw = Math.max(10, Math.round((block.box.w / 100) * width));
                const bh = Math.max(10, Math.round((block.box.h / 100) * height));

                const textOffX = (parseFloat(block.style?.textOffsetX as any) || 0) * scaleFactor;
                const textOffY = (parseFloat(block.style?.textOffsetY as any) || 0) * scaleFactor;
                const padX = textOffX !== 0 ? Math.ceil(Math.abs(textOffX)) + 20 : 0;
                const padY = textOffY !== 0 ? Math.ceil(Math.abs(textOffY)) + 20 : 0;

                const tCanvas = document.createElement('canvas');
                tCanvas.width = bw + padX * 2;
                tCanvas.height = bh + padY * 2;
                const tCtx = tCanvas.getContext('2d');
                if (!tCtx) return null;

                const layout = buildBlockTextLayout(block, width, height, scaleFactor, tCtx, page);

                // Optional Background Mask for the block
                const hexBgColor = block.style?.bgColor || '#ffffff';
                const alpha = (block.style?.bgOpacity !== undefined ? block.style.bgOpacity : 100) / 100;
                const maskShape = block.style?.maskShape || 'bubble-fit';

                if (alpha > 0 && block.style?.bgOpacity !== 0 && block.style?.maskShape !== 'none') {
                    tCtx.fillStyle = hexBgColor;
                    tCtx.globalAlpha = alpha;
                    if (maskShape === 'ellipse') {
                        tCtx.beginPath();
                        tCtx.ellipse(padX + bw / 2, padY + bh / 2, bw / 2, bh / 2, 0, 0, 2 * Math.PI);
                        tCtx.fill();
                    } else if (maskShape === 'rounded') {
                        const r = Math.min(16 * scaleFactor, bw / 4, bh / 4);
                        tCtx.beginPath();
                        if (typeof tCtx.roundRect === 'function') tCtx.roundRect(padX, padY, bw, bh, r);
                        else tCtx.rect(padX, padY, bw, bh);
                        tCtx.fill();
                    } else {
                        tCtx.fillRect(padX, padY, bw, bh);
                    }
                    tCtx.globalAlpha = 1.0;
                }

                // Text Layer rendering via shared canonical canvas text renderer
                renderBlockTextToCanvas(tCtx, block, layout, scaleFactor, {
                    originOffsetX: -(layout.bx || 0) + padX,
                    originOffsetY: -(layout.by || 0) + padY
                });

                return {
                    name: `Text ${idx + 1}: ${(block.translated || '').slice(0, 16)}`,
                    canvas: tCanvas,
                    left: bx - padX,
                    top: by - padY,
                    blendMode: block.style?.blendMode || 'normal',
                    opacity: 1
                };
            }).filter(Boolean);

            const psdDoc = {
                width,
                height,
                children: [
                    {
                        name: 'Ảnh Manga Gốc (Raw Background)',
                        canvas: rawCanvas,
                        opacity: 1,
                        blendMode: 'normal'
                    },
                    {
                        name: 'Ảnh Đã Xóa Chữ (Clean Background)',
                        canvas: cleanCanvas,
                        opacity: 1,
                        blendMode: 'normal'
                    },
                    ...textChildren
                ]
            };

            const buffer = writeFn(psdDoc);

            // Release GPU backing store of layer canvases
            rawCanvas.width = 0; rawCanvas.height = 0;
            cleanCanvas.width = 0; cleanCanvas.height = 0;
            textChildren.forEach((child: any) => {
                if (child && child.canvas) {
                    child.canvas.width = 0;
                    child.canvas.height = 0;
                }
            });

            return new Blob([buffer], { type: 'image/vnd.adobe.photoshop' });
        }
    } catch (cdnErr) {
        console.warn("ag-psd online bundle unavailable, using standalone pure-JS binary PSD writer", cdnErr);
    }

    return writeStandalonePSD(width, height, cleanCanvas, rawCanvas);
}

function writeStandalonePSD(width: number, height: number, cleanCanvas: HTMLCanvasElement, rawCanvas: HTMLCanvasElement): Blob {
    const cleanCtx = cleanCanvas.getContext('2d');
    const rawCtx = rawCanvas.getContext('2d');
    if (!cleanCtx || !rawCtx) throw new Error("Không thể tạo 2D context");

    const cleanImgData = cleanCtx.getImageData(0, 0, width, height).data;
    const rawImgData = rawCtx.getImageData(0, 0, width, height).data;

    // Immediately release source canvas backing stores
    cleanCanvas.width = 0; cleanCanvas.height = 0;
    rawCanvas.width = 0; rawCanvas.height = 0;

    const pixelCount = width * height;
    const parts: Uint8Array[] = [];

    function writeStr(str: string) {
        const buf = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
        parts.push(buf);
    }

    function writeUint16(val: number) {
        const buf = new Uint8Array(2);
        new DataView(buf.buffer).setUint16(0, val, false);
        parts.push(buf);
    }

    function writeUint32(val: number) {
        const buf = new Uint8Array(4);
        new DataView(buf.buffer).setUint32(0, val, false);
        parts.push(buf);
    }

    function writeBytes(arr: number[]) {
        parts.push(new Uint8Array(arr));
    }

    // 1. PSD Header (26 bytes)
    writeStr('8BPS');          // Signature
    writeUint16(1);            // Version 1
    writeBytes([0, 0, 0, 0, 0, 0]); // 6 reserved bytes
    writeUint16(3);            // 3 Channels (RGB composite)
    writeUint32(height);       // Height
    writeUint32(width);        // Width
    writeUint16(8);            // 8 bits per channel
    writeUint16(3);            // ColorMode 3 = RGB

    // 2. Color Mode Data (Empty for RGB)
    writeUint32(0);

    // 3. Image Resources
    writeUint32(28); // Image resources length (4 + 2 + 2 + 4 + 16 = 28 bytes)
    writeStr('8BIM');
    writeUint16(0x03ED);
    writeUint16(0); // Name length 0
    writeUint32(16); // Data length
    writeUint32(72); writeUint16(1); writeUint16(1); // 72 dpi H
    writeUint32(72); writeUint16(1); writeUint16(1); // 72 dpi V

    // 4. Layer and Mask Information
    const layerCount = 2;

    function extractPlanarChannels(imgData: Uint8ClampedArray) {
        const r = new Uint8Array(pixelCount);
        const g = new Uint8Array(pixelCount);
        const b = new Uint8Array(pixelCount);
        const a = new Uint8Array(pixelCount);
        for (let i = 0; i < pixelCount; i++) {
            r[i] = imgData[i * 4];
            g[i] = imgData[i * 4 + 1];
            b[i] = imgData[i * 4 + 2];
            a[i] = imgData[i * 4 + 3];
        }
        return { r, g, b, a };
    }

    const cleanChannels = extractPlanarChannels(cleanImgData);
    const rawChannels = extractPlanarChannels(rawImgData);

    const layerInfoParts: Uint8Array[] = [];
    const pushL32 = (v: number) => {
        const b = new Uint8Array(4);
        new DataView(b.buffer).setUint32(0, v, false);
        layerInfoParts.push(b);
    };
    const pushL16 = (v: number) => {
        const b = new Uint8Array(2);
        new DataView(b.buffer).setUint16(0, v, false);
        layerInfoParts.push(b);
    };
    const pushLStr = (s: string) => {
        const b = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
        layerInfoParts.push(b);
    };
    const pushLBytes = (arr: number[]) => {
        layerInfoParts.push(new Uint8Array(arr));
    };

    pushL16(layerCount);

    // Layer 1 Record: Clean Background
    pushL32(0); pushL32(0); pushL32(height); pushL32(width);
    pushL16(4);
    pushL16(0); pushL32(2 + pixelCount);
    pushL16(1); pushL32(2 + pixelCount);
    pushL16(2); pushL32(2 + pixelCount);
    pushL16(-1); pushL32(2 + pixelCount);
    pushLStr('8BIM'); pushLStr('norm');
    pushLBytes([255, 0, 0, 0]);
    const name1 = "Clean Background";
    const name1Len = name1.length;
    const pad1 = (4 - ((1 + name1Len) % 4)) % 4;
    pushL32(4 + 4 + (1 + name1Len + pad1));
    pushL32(0);
    pushL32(0);
    pushLBytes([name1Len]);
    pushLStr(name1);
    for (let i = 0; i < pad1; i++) pushLBytes([0]);

    // Layer 2 Record: Raw Background
    pushL32(0); pushL32(0); pushL32(height); pushL32(width);
    pushL16(4);
    pushL16(0); pushL32(2 + pixelCount);
    pushL16(1); pushL32(2 + pixelCount);
    pushL16(2); pushL32(2 + pixelCount);
    pushL16(-1); pushL32(2 + pixelCount);
    pushLStr('8BIM'); pushLStr('norm');
    pushLBytes([255, 0, 0, 0]);
    const name2 = "Raw Background";
    const name2Len = name2.length;
    const pad2 = (4 - ((1 + name2Len) % 4)) % 4;
    pushL32(4 + 4 + (1 + name2Len + pad2));
    pushL32(0);
    pushL32(0);
    pushLBytes([name2Len]);
    pushLStr(name2);
    for (let i = 0; i < pad2; i++) pushLBytes([0]);

    const zeroComp = new Uint8Array([0, 0]);
    layerInfoParts.push(zeroComp); layerInfoParts.push(cleanChannels.r);
    layerInfoParts.push(zeroComp); layerInfoParts.push(cleanChannels.g);
    layerInfoParts.push(zeroComp); layerInfoParts.push(cleanChannels.b);
    layerInfoParts.push(zeroComp); layerInfoParts.push(cleanChannels.a);

    layerInfoParts.push(zeroComp); layerInfoParts.push(rawChannels.r);
    layerInfoParts.push(zeroComp); layerInfoParts.push(rawChannels.g);
    layerInfoParts.push(zeroComp); layerInfoParts.push(rawChannels.b);
    layerInfoParts.push(zeroComp); layerInfoParts.push(rawChannels.a);

    let layerInfoLength = 0;
    layerInfoParts.forEach(p => layerInfoLength += p.length);

    writeUint32(layerInfoLength + 4);
    writeUint32(layerInfoLength);
    parts.push(...layerInfoParts);

    // 5. Global Image Data
    writeUint16(0);
    parts.push(cleanChannels.r);
    parts.push(cleanChannels.g);
    parts.push(cleanChannels.b);

    return new Blob(parts as any, { type: 'image/vnd.adobe.photoshop' });
}
