/**
 * Module 2: Vertical Image Slicer (Webtoon & Smart Gap) (TypeScript)
 */

import { formatFileSize, getTargetFormatExt, openPreviewModal, escapeHTML, ensureJSZipLoaded } from './common';
import type { SliceItem } from './types';

let sliceImg: HTMLImageElement | null = null;
let sliceFile: File | null = null;
let sliceName = '';
let sliceList: SliceItem[] = [];
let sliceDebounceTimer: any = null;
let isSlicing = false;
let currentSliceMode: 'count' | 'height' = 'count';

export function clearSliceList(): void {
    sliceList.forEach(item => {
        if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
    });
    sliceList = [];
}

export function resetSlice(): void {
    clearSliceList();
    sliceImg = null;
    sliceFile = null;
    sliceName = '';
    const grid = document.getElementById('slice-grid');
    if (grid) grid.innerHTML = '';
    const panel = document.getElementById('slice-panel');
    if (panel) panel.classList.add('hidden');
    const upload = document.getElementById('slice-upload');
    if (upload) upload.classList.remove('hidden');
    const input = document.getElementById('slice-file') as HTMLInputElement | null;
    if (input) input.value = '';
}

export function setSliceMode(mode: 'count' | 'height'): void {
    currentSliceMode = mode;
    const btnCount = document.getElementById('btn-mode-count');
    const btnHeight = document.getElementById('btn-mode-height');
    const boxCount = document.getElementById('box-slice-count');
    const boxHeight = document.getElementById('box-slice-height');

    if (mode === 'count') {
        if (btnCount) btnCount.className = "flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white shadow flex items-center justify-center gap-1.5";
        if (btnHeight) btnHeight.className = "flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5";
        if (boxCount) { boxCount.classList.remove('hidden'); boxCount.classList.add('flex'); }
        if (boxHeight) { boxHeight.classList.add('hidden'); boxHeight.classList.remove('flex'); }
    } else {
        if (btnHeight) btnHeight.className = "flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white shadow flex items-center justify-center gap-1.5";
        if (btnCount) btnCount.className = "flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5";
        if (boxHeight) { boxHeight.classList.remove('hidden'); boxHeight.classList.add('flex'); }
        if (boxCount) { boxCount.classList.add('hidden'); boxCount.classList.remove('flex'); }
    }
    processSlicingDebounced();
}

export function setSliceCountPreset(countVal: number): void {
    const input = document.getElementById('slice-count') as HTMLInputElement | null;
    if (input) input.value = String(countVal);
    processSlicingDebounced();
}

export function setSliceHeightPreset(heightVal: number): void {
    const input = document.getElementById('slice-max-height') as HTMLInputElement | null;
    if (input) input.value = String(heightVal);
    processSlicingDebounced();
}

export function onSliceFormatChange(): void {
    const format = (document.getElementById('slice-format') as HTMLSelectElement)?.value;
    const boxQ = document.getElementById('box-slice-quality');
    if (boxQ) {
        if (format === 'image/png') {
            boxQ.classList.add('opacity-40', 'pointer-events-none');
        } else {
            boxQ.classList.remove('opacity-40', 'pointer-events-none');
        }
    }
    processSlicingDebounced();
}

export function processSlicingDebounced(): void {
    if (sliceDebounceTimer) clearTimeout(sliceDebounceTimer);
    sliceDebounceTimer = setTimeout(() => {
        processSlicing();
    }, 100);
}

export function handleSliceFileSelect(file: File): void {
    if (!file || !file.type.startsWith('image/')) {
        alert("Vui lòng chọn một tệp hình ảnh hợp lệ (PNG, JPG, WEBP, v.v.)");
        return;
    }
    sliceFile = file;
    sliceName = file.name;
    const reader = new FileReader();
    reader.onload = (evt) => {
        const img = new Image();
        img.onload = () => {
            sliceImg = img;
            const filenameEl = document.getElementById('slice-filename');
            if (filenameEl) {
                filenameEl.innerText = file.name;
                filenameEl.title = file.name;
            }
            const sizeStr = formatFileSize(file.size);
            const dimEl = document.getElementById('slice-dim');
            if (dimEl) dimEl.innerText = `${img.naturalWidth} x ${img.naturalHeight} px • ${sizeStr}`;
            const uploadEl = document.getElementById('slice-upload');
            if (uploadEl) uploadEl.classList.add('hidden');
            const panelEl = document.getElementById('slice-panel');
            if (panelEl) panelEl.classList.remove('hidden');
            processSlicing();
        };
        img.onerror = () => {
            alert("Không thể đọc định dạng ảnh này. Vui lòng thử lại với ảnh khác.");
        };
        img.src = evt.target?.result as string;
    };
    reader.readAsDataURL(file);
}

/**
 * Fast Smart Gap Detector: Finds horizontal blank bands (white, black, uniform color)
 * within [targetY - searchRange, targetY + searchRange] around cut point
 */
export function findOptimalCutLine(
    ctxSample: CanvasRenderingContext2D,
    targetY: number,
    searchRange: number,
    width: number,
    totalHeight: number
): number {
    const minY = Math.max(10, Math.floor(targetY - searchRange));
    const maxY = Math.min(totalHeight - 10, Math.floor(targetY + searchRange));
    if (minY >= maxY) return targetY;

    const sampleHeight = maxY - minY + 1;
    const imgData = ctxSample.getImageData(0, minY, width, sampleHeight);
    const data = imgData.data;

    let bestY = targetY;
    let bestScore = Infinity;

    for (let r = 0; r < sampleHeight; r++) {
        const currentY = minY + r;
        let rSum = 0, gSum = 0, bSum = 0;
        const sampleStep = Math.max(1, Math.floor(width / 80));
        let sampleCount = 0;

        for (let x = 0; x < width; x += sampleStep) {
            const idx = (r * width + x) * 4;
            rSum += data[idx];
            gSum += data[idx + 1];
            bSum += data[idx + 2];
            sampleCount++;
        }

        const rAvg = rSum / sampleCount;
        const gAvg = gSum / sampleCount;
        const bAvg = bSum / sampleCount;

        let variance = 0;
        for (let x = 0; x < width; x += sampleStep) {
            const idx = (r * width + x) * 4;
            const dr = data[idx] - rAvg;
            const dg = data[idx + 1] - gAvg;
            const db = data[idx + 2] - bAvg;
            variance += Math.abs(dr) + Math.abs(dg) + Math.abs(db);
        }
        variance = variance / sampleCount;

        const isWhiteOrBlack = (rAvg > 242 && gAvg > 242 && bAvg > 242) || (rAvg < 15 && gAvg < 15 && bAvg < 15);
        const solidBonus = isWhiteOrBlack ? 0.3 : 1.0;

        const dist = Math.abs(currentY - targetY);
        const distPenalty = (dist / searchRange) * 15;

        const score = (variance * solidBonus) + distPenalty;

        if (score < bestScore) {
            bestScore = score;
            bestY = currentY;
        }
    }

    return bestY;
}

export async function processSlicing(): Promise<void> {
    if (!sliceImg || isSlicing) return;
    isSlicing = true;

    const indicator = document.getElementById('slice-process-indicator');
    if (indicator) indicator.classList.remove('hidden');

    const format = (document.getElementById('slice-format') as HTMLSelectElement)?.value || 'image/webp';
    const quality = parseFloat((document.getElementById('slice-quality') as HTMLInputElement)?.value || '92') / 100;
    const enableSmartGap = (document.getElementById('slice-smart-gap') as HTMLInputElement)?.checked ?? false;
    const ext = getTargetFormatExt(format);

    const W = sliceImg.naturalWidth;
    const H = sliceImg.naturalHeight;

    let cutPoints: number[] = [0];

    if (currentSliceMode === 'count') {
        const count = Math.max(2, Math.min(100, parseInt((document.getElementById('slice-count') as HTMLInputElement)?.value) || 4));
        const h = Math.floor(H / count);
        for (let i = 1; i < count; i++) {
            cutPoints.push(i * h);
        }
        const countCalc = document.getElementById('slice-count-calc-info');
        if (countCalc) countCalc.innerText = `(= ${count} mảnh ~${h}px chia đều)`;
    } else {
        const targetH = Math.max(200, parseInt((document.getElementById('slice-max-height') as HTMLInputElement)?.value) || 2000);
        let currentY = targetH;
        while (currentY < H) {
            cutPoints.push(currentY);
            currentY += targetH;
        }
        const heightCalc = document.getElementById('slice-height-calc-info');
        if (heightCalc) heightCalc.innerText = `(~${Math.ceil(H / targetH)} mảnh)`;
    }

    // If Smart Gap is enabled, adjust cut points to blank comic gutters
    if (enableSmartGap && cutPoints.length > 1) {
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = W;
        sampleCanvas.height = H;
        const sampleCtx = sampleCanvas.getContext('2d');
        if (sampleCtx) {
            sampleCtx.drawImage(sliceImg, 0, 0);

            for (let i = 1; i < cutPoints.length; i++) {
                const prevCut = cutPoints[i - 1];
                const rawTarget = cutPoints[i];
                const nextTarget = (i + 1 < cutPoints.length) ? cutPoints[i + 1] : H;
                const maxSearch = Math.min(300, Math.floor((rawTarget - prevCut) * 0.3), Math.floor((nextTarget - rawTarget) * 0.3));
                if (maxSearch > 20) {
                    const optimalY = findOptimalCutLine(sampleCtx, rawTarget, maxSearch, W, H);
                    cutPoints[i] = optimalY;
                }
            }
        }
    }

    cutPoints.push(H);
    cutPoints = Array.from(new Set(cutPoints)).sort((a, b) => a - b);

    const numSlices = cutPoints.length - 1;
    const avgH = Math.round(H / numSlices);
    const sumText = document.getElementById('slice-summary-text');
    if (sumText) sumText.innerText = `Đã tạo ${numSlices} mảnh cắt`;
    const sizeCalc = document.getElementById('slice-size-calc');
    if (sizeCalc) sizeCalc.innerText = `Trung bình ~${avgH}px/mảnh • .${ext.toUpperCase()}`;

    const grid = document.getElementById('slice-grid');
    clearSliceList();
    if (grid) grid.innerHTML = '';

    const baseName = sliceName.replace(/\.[^/.]+$/, '') || 'slice';

    for (let i = 0; i < numSlices; i++) {
        const sy = cutPoints[i];
        const sh = cutPoints[i + 1] - sy;
        if (sh <= 0) continue;

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        if (format === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, sh);
        }

        ctx.drawImage(sliceImg, 0, sy, W, sh, 0, 0, W, sh);

        const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, format, quality));
        const objectUrl = blob ? URL.createObjectURL(blob) : '';
        const partIdx = String(i + 1).padStart(2, '0');
        const targetFilename = `${baseName}_part_${partIdx}.${ext}`;
        const sizeFormatted = formatFileSize(blob ? blob.size : 0);

        sliceList.push({
            idx: i + 1,
            blob,
            objectUrl,
            width: W,
            height: sh,
            size: blob ? blob.size : 0,
            ext,
            filename: targetFilename
        });

        const card = document.createElement('div');
        card.className = "bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col justify-between text-xs font-mono shadow-md hover:border-slate-700 transition-all";
        card.innerHTML = `
            <div class="relative group cursor-pointer overflow-hidden rounded-xl bg-slate-950/60 border border-slate-855 flex items-center justify-center min-h-[140px]">
                <img src="${objectUrl}" class="max-h-48 object-contain rounded transition-transform group-hover:scale-105" alt="Slice ${escapeHTML(i+1)}">
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-sans text-xs gap-1.5 font-bold">
                    <i class="fa-solid fa-magnifying-glass-plus"></i> Phóng to xem
                </div>
            </div>
            <div class="flex flex-col gap-2 mt-3 pt-2.5 border-t border-slate-800">
                <div class="flex items-center justify-between text-xs font-bold text-slate-200">
                    <span class="text-indigo-400">Mảnh #${escapeHTML(partIdx)} / ${escapeHTML(String(numSlices).padStart(2,'0'))}</span>
                    <span class="text-[11px] text-slate-400 font-normal font-mono">${escapeHTML(W)}x${escapeHTML(sh)}px</span>
                </div>
                <div class="flex items-center justify-between text-[10px] text-slate-400">
                    <span class="text-slate-300 font-bold">${escapeHTML(sizeFormatted)}</span>
                    <a href="${objectUrl}" download="${escapeHTML(targetFilename)}" class="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 text-indigo-300 hover:text-white font-bold transition-all flex items-center gap-1.5 shadow-sm">
                        <i class="fa-solid fa-download"></i> Tải .${escapeHTML(ext.toUpperCase())}
                    </a>
                </div>
            </div>
        `;
        const previewTarget = card.querySelector('.relative.group');
        if (previewTarget) {
            previewTarget.addEventListener('click', () => openPreviewModal(objectUrl));
        }
        if (grid) grid.appendChild(card);
    }

    if (indicator) indicator.classList.add('hidden');
    isSlicing = false;
}

export async function downloadSlicedZip(): Promise<void> {
    if (sliceList.length === 0) return;
    const validItems = sliceList.filter(item => item.blob);
    if (validItems.length === 0) {
        alert("Chưa có ảnh mảnh cắt nào sẵn sàng để tải ZIP.");
        return;
    }

    const btn = document.getElementById('btn-slice-zip');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang nén ZIP...`;

    try {
        const JSZipClass = await ensureJSZipLoaded();
        if (!JSZipClass) {
            throw new Error("Không thể nạp thư viện nén ZIP.");
        }
        const zip = new JSZipClass();
        validItems.forEach(item => {
            if (item.blob) {
                zip.file(item.filename, item.blob);
            }
        });

        const content = await zip.generateAsync({ type: 'blob' });
        const zipUrl = URL.createObjectURL(content);
        const a = document.createElement('a');
        const baseName = sliceName.replace(/\.[^/.]+$/, '') || 'sliced_webtoon';
        a.href = zipUrl;
        a.download = `${baseName}_sliced.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(zipUrl), 10000);
    } catch (err: any) {
        console.error("Lỗi tạo ZIP:", err);
        alert("Lỗi khi tạo file ZIP: " + err.message);
    } finally {
        if (btn) btn.innerHTML = origHtml;
    }
}

export function initImageSlicer(): void {
    const input = document.getElementById('slice-file');
    if (input) {
        input.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (!target.files || !target.files[0]) return;
            handleSliceFileSelect(target.files[0]);
        });
    }
}
