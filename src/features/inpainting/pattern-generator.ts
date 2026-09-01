/**
 * Manga Translator Studio - Inpainting: Pattern Generator & Texture Synthesizer
 * Provides Screentones, Halftone dots, Noise tiles, Seamless Tiling, and Offset Controls.
 */
import { showToast } from '../../core/utils';

export type LassoPatternType = 'halftone' | 'horizontal' | 'vertical' | 'diagonal' | 'crosshatch' | 'noise' | 'sample';
export type LassoFillTechnique = 'patch_1to1' | 'grid_tile' | 'preset_tone' | 'seamless_tile';

export let lassoPatternOffsetX = 0;
export let lassoPatternOffsetY = 0;
export let lassoCrossfadeOverlap = 8;
export let lassoPatternSize = 8;
export let lassoPatternDensity = 40;
export let lassoPatternFgColor = '#000000';
export let lassoPatternBgColor = '#ffffff';
export let lassoPatternTransparentBg = false;
export let lassoPatternOpacity = 100;
export let lassoPatternFeather = 2;

export function setLassoPatternOffsetX(val: number): void {
    lassoPatternOffsetX = Math.max(-64, Math.min(64, Math.round(val)));
    updateLassoNudgeUI();
}

export function setLassoPatternOffsetY(val: number): void {
    lassoPatternOffsetY = Math.max(-64, Math.min(64, Math.round(val)));
    updateLassoNudgeUI();
}

export function nudgeLassoPatternOffset(dx: number, dy: number): void {
    lassoPatternOffsetX = Math.max(-64, Math.min(64, lassoPatternOffsetX + dx));
    lassoPatternOffsetY = Math.max(-64, Math.min(64, lassoPatternOffsetY + dy));
    updateLassoNudgeUI();
}

export function resetLassoPatternOffset(): void {
    lassoPatternOffsetX = 0;
    lassoPatternOffsetY = 0;
    updateLassoNudgeUI();
    showToast("Đã đặt lại độ lệch pha hoa văn.", "info");
}

export function updateLassoNudgeUI(): void {
    if (typeof document === 'undefined') return;
    const lbl = document.getElementById('lbl-lasso-offset');
    if (lbl) {
        lbl.innerText = `X: ${lassoPatternOffsetX >= 0 ? '+' : ''}${lassoPatternOffsetX}px, Y: ${lassoPatternOffsetY >= 0 ? '+' : ''}${lassoPatternOffsetY}px`;
    }
    const rangeX = document.getElementById('num-lasso-offset-x') as HTMLInputElement | null;
    if (rangeX && parseInt(rangeX.value) !== lassoPatternOffsetX) {
        rangeX.value = String(lassoPatternOffsetX);
    }
    const rangeY = document.getElementById('num-lasso-offset-y') as HTMLInputElement | null;
    if (rangeY && parseInt(rangeY.value) !== lassoPatternOffsetY) {
        rangeY.value = String(lassoPatternOffsetY);
    }
    const lblX = document.getElementById('lbl-lasso-offset-x-val');
    if (lblX) lblX.innerText = `${lassoPatternOffsetX >= 0 ? '+' : ''}${lassoPatternOffsetX}px`;
    const lblY = document.getElementById('lbl-lasso-offset-y-val');
    if (lblY) lblY.innerText = `${lassoPatternOffsetY >= 0 ? '+' : ''}${lassoPatternOffsetY}px`;
}

export function makeSeamlessTile(sourceTile: HTMLCanvasElement, overlap: number = 8): HTMLCanvasElement {
    if (!sourceTile) return sourceTile;
    const W = sourceTile.width;
    const H = sourceTile.height;
    if (W <= 4 || H <= 4) return sourceTile;

    const ov = Math.max(1, Math.min(overlap, Math.floor(Math.min(W, H) / 4)));
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const oCtx = out.getContext('2d');
    if (!oCtx) return sourceTile;

    oCtx.drawImage(sourceTile, 0, 0);

    try {
        const imgData = oCtx.getImageData(0, 0, W, H);
        const data = imgData.data;

        // Horizontal cross-fade blending on left/right borders
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < ov; x++) {
                const alpha = x / ov;
                const leftIdx = (y * W + x) * 4;
                const rightIdx = (y * W + (W - ov + x)) * 4;

                for (let c = 0; c < 4; c++) {
                    const blended = Math.round(data[leftIdx + c] * alpha + data[rightIdx + c] * (1 - alpha));
                    data[leftIdx + c] = blended;
                    data[rightIdx + c] = blended;
                }
            }
        }

        // Vertical cross-fade blending on top/bottom borders
        for (let x = 0; x < W; x++) {
            for (let y = 0; y < ov; y++) {
                const alpha = y / ov;
                const topIdx = (y * W + x) * 4;
                const bottomIdx = ((H - ov + y) * W + x) * 4;

                for (let c = 0; c < 4; c++) {
                    const blended = Math.round(data[topIdx + c] * alpha + data[bottomIdx + c] * (1 - alpha));
                    data[topIdx + c] = blended;
                    data[bottomIdx + c] = blended;
                }
            }
        }

        oCtx.putImageData(imgData, 0, 0);
    } catch {
        // Canvas fallback
    }

    return out;
}

export function findBestAdjacentPatch(
    imgElement: HTMLImageElement | HTMLCanvasElement,
    minX: number,
    minY: number,
    cropW: number,
    cropH: number
): { x: number; y: number; w: number; h: number } {
    const imgW = (imgElement as any).naturalWidth || (imgElement as any).width || 1000;
    const imgH = (imgElement as any).naturalHeight || (imgElement as any).height || 1400;

    // Try top
    if (minY - cropH - 4 >= 0) {
        return { x: Math.max(0, Math.min(imgW - cropW, minX)), y: minY - cropH - 4, w: cropW, h: cropH };
    }
    // Try left
    if (minX - cropW - 4 >= 0) {
        return { x: minX - cropW - 4, y: Math.max(0, Math.min(imgH - cropH, minY)), w: cropW, h: cropH };
    }
    // Try right
    if (minX + cropW + 4 + cropW <= imgW) {
        return { x: minX + cropW + 4, y: Math.max(0, Math.min(imgH - cropH, minY)), w: cropW, h: cropH };
    }
    // Try bottom
    if (minY + cropH + 4 + cropH <= imgH) {
        return { x: Math.max(0, Math.min(imgW - cropW, minX)), y: minY + cropH + 4, w: cropW, h: cropH };
    }

    return { x: Math.max(0, Math.min(imgW - cropW, minX)), y: Math.max(0, Math.min(imgH - cropH, minY)), w: cropW, h: cropH };
}

export interface PatternTileOptions {
    type: LassoPatternType;
    size?: number;
    density?: number;
    fgColor?: string;
    bgColor?: string;
    isTransparent?: boolean;
    sampleCanvas?: HTMLCanvasElement | null;
}

export function createMangaPatternTile(options: PatternTileOptions): HTMLCanvasElement {
    const type = options.type || 'halftone';
    const size = Math.max(2, Math.min(64, options.size || 8));
    const density = Math.max(5, Math.min(95, options.density ?? 40));
    const fgColor = options.fgColor || '#000000';
    const bgColor = options.bgColor || '#ffffff';
    const isTransparent = options.isTransparent ?? false;

    if (type === 'sample' && options.sampleCanvas && options.sampleCanvas.width > 0 && options.sampleCanvas.height > 0) {
        return options.sampleCanvas;
    }

    const tile = document.createElement('canvas');
    let S = size;

    if (type === 'halftone') {
        S = Math.max(4, size);
        tile.width = S;
        tile.height = S;
        const ctx = tile.getContext('2d');
        if (!ctx) return tile;

        if (!isTransparent) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, S, S);
        }

        const radius = Math.max(0.75, (S / 2) * Math.sqrt(density / 100));

        ctx.fillStyle = fgColor;

        // Center dot
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, radius, 0, Math.PI * 2);
        ctx.fill();

        // 4 corner dots for 45° offset screentone grid
        const corners = [[0, 0], [S, 0], [0, S], [S, S]];
        for (const [cx, cy] of corners) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (type === 'horizontal') {
        S = Math.max(2, size);
        const W = 16;
        tile.width = W;
        tile.height = S;
        const ctx = tile.getContext('2d');
        if (!ctx) return tile;

        if (!isTransparent) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, W, S);
        }

        const lineH = Math.max(1, Math.round(S * (density / 100)));
        ctx.fillStyle = fgColor;
        ctx.fillRect(0, 0, W, lineH);
    } else if (type === 'vertical') {
        S = Math.max(2, size);
        const H = 16;
        tile.width = S;
        tile.height = H;
        const ctx = tile.getContext('2d');
        if (!ctx) return tile;

        if (!isTransparent) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, S, H);
        }

        const lineW = Math.max(1, Math.round(S * (density / 100)));
        ctx.fillStyle = fgColor;
        ctx.fillRect(0, 0, lineW, H);
    } else if (type === 'diagonal') {
        S = Math.max(4, size);
        tile.width = S;
        tile.height = S;
        const ctx = tile.getContext('2d');
        if (!ctx) return tile;

        if (!isTransparent) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, S, S);
        }

        const lineW = Math.max(1, Math.round(S * (density / 100) * 0.75));
        ctx.strokeStyle = fgColor;
        ctx.lineWidth = lineW;
        ctx.lineCap = 'square';

        const drawDiag = (ox: number, oy: number) => {
            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.lineTo(ox + S, oy + S);
            ctx.stroke();
        };

        drawDiag(0, 0);
        drawDiag(-S, 0);
        drawDiag(0, -S);
        drawDiag(S, -S);
        drawDiag(-S, S);
    } else if (type === 'crosshatch') {
        S = Math.max(4, size);
        tile.width = S;
        tile.height = S;
        const ctx = tile.getContext('2d');
        if (!ctx) return tile;

        if (!isTransparent) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, S, S);
        }

        const lineW = Math.max(1, Math.round(S * (density / 100) * 0.5));
        ctx.fillStyle = fgColor;
        ctx.fillRect(0, 0, S, lineW);
        ctx.fillRect(0, 0, lineW, S);
    } else if (type === 'noise') {
        S = Math.max(16, size * 2);
        tile.width = S;
        tile.height = S;
        const ctx = tile.getContext('2d');
        if (!ctx) return tile;

        if (!isTransparent) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, S, S);
        }

        const imgData = ctx.getImageData(0, 0, S, S);
        const data = imgData.data;

        let fr = 0, fg = 0, fb = 0;
        if (fgColor.startsWith('#')) {
            const hex = fgColor.replace('#', '');
            if (hex.length === 3) {
                fr = parseInt(hex[0] + hex[0], 16);
                fg = parseInt(hex[1] + hex[1], 16);
                fb = parseInt(hex[2] + hex[2], 16);
            } else if (hex.length >= 6) {
                fr = parseInt(hex.substring(0, 2), 16);
                fg = parseInt(hex.substring(2, 4), 16);
                fb = parseInt(hex.substring(4, 6), 16);
            }
        }

        const threshold = density / 100;
        for (let i = 0; i < S * S; i++) {
            if (Math.random() < threshold) {
                const p = i * 4;
                data[p] = fr;
                data[p + 1] = fg;
                data[p + 2] = fb;
                data[p + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }

    return tile;
}
