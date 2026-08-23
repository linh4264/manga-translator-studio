/**
 * Module 4: Batch Image Compressor (TypeScript)
 */

import { openPreviewModal } from './common';
import type { CompressItem } from './types';
import JSZip from 'jszip';

let compressList: CompressItem[] = [];
let isCompressing = false;

export function applySharpenFilterToCtx(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    sharpAmount: number
): void {
    if (!sharpAmount || sharpAmount <= 0) return;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const copy = new Uint8ClampedArray(data);
    const k = sharpAmount;
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;
            for (let c = 0; c < 3; c++) {
                const val = (1 + 4 * k) * copy[idx + c]
                    - k * copy[((y - 1) * width + x) * 4 + c]
                    - k * copy[((y + 1) * width + x) * 4 + c]
                    - k * copy[(y * width + x - 1) * 4 + c]
                    - k * copy[(y * width + x + 1) * 4 + c];
                data[idx + c] = Math.min(255, Math.max(0, val));
            }
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

export async function handleCompressFilesSelect(files: File[]): Promise<void> {
    if (!files || files.length === 0) return;

    const uploadEl = document.getElementById('compress-upload');
    if (uploadEl) uploadEl.classList.add('hidden');
    const panelEl = document.getElementById('compress-panel');
    if (panelEl) panelEl.classList.remove('hidden');

    const validFiles = files.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name));
    if (validFiles.length === 0) {
        alert("Vui lòng chọn file hình ảnh hợp lệ (PNG, JPG, WEBP).");
        return;
    }

    const newItems = await Promise.all(validFiles.map(f => new Promise<CompressItem | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
            const img = new Image();
            img.onload = () => resolve({ file: f, img, originalSize: f.size, compressedBlob: null, objectUrl: null, compressedSize: 0 });
            img.onerror = () => resolve(null);
            img.src = evt.target?.result as string;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(f);
    })));

    const filteredNewItems = newItems.filter((item): item is CompressItem => item !== null);
    if (filteredNewItems.length === 0) {
        alert("Không thể mở được dữ liệu ảnh.");
        return;
    }

    compressList = compressList.concat(filteredNewItems);
    await processCompressBatch();
}

export function addMoreCompressFiles(): void {
    const input = document.getElementById('compress-files') as HTMLInputElement | null;
    if (!input) return;
    input.value = '';
    input.click();
}

export function resetCompressBatch(): void {
    compressList.forEach(item => {
        if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
    });
    compressList = [];
    const grid = document.getElementById('compress-grid');
    if (grid) grid.innerHTML = '';
    const panel = document.getElementById('compress-panel');
    if (panel) panel.classList.add('hidden');
    const upload = document.getElementById('compress-upload');
    if (upload) upload.classList.remove('hidden');
    const savedEl = document.getElementById('compress-total-saved');
    if (savedEl) savedEl.innerText = 'Tiết kiệm: 0 KB';
    const input = document.getElementById('compress-files') as HTMLInputElement | null;
    if (input) input.value = '';
}

export async function processCompressBatch(): Promise<void> {
    if (compressList.length === 0) return;
    if (isCompressing) return;
    isCompressing = true;

    const q = parseFloat((document.getElementById('compress-quality') as HTMLInputElement)?.value || '75') / 100;
    const format = (document.getElementById('compress-format') as HTMLSelectElement)?.value || 'image/webp';
    const enableSharp = (document.getElementById('compress-enable-sharp') as HTMLInputElement)?.checked ?? false;
    const sharpVal = enableSharp ? parseFloat((document.getElementById('compress-sharp-val') as HTMLInputElement)?.value || '1.0') : 0;
    const ext = format === 'image/webp' ? 'webp' : format === 'image/png' ? 'png' : 'jpg';

    const grid = document.getElementById('compress-grid');
    let totalSavedBytes = 0;

    // Revoke old object URLs
    compressList.forEach(item => {
        if (item.objectUrl) {
            URL.revokeObjectURL(item.objectUrl);
            item.objectUrl = null;
        }
    });

    if (grid) grid.innerHTML = '';

    for (let i = 0; i < compressList.length; i++) {
        const item = compressList[i];
        const canvas = document.createElement('canvas');
        canvas.width = item.img.naturalWidth;
        canvas.height = item.img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        if (format === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(item.img, 0, 0);

        if (enableSharp && sharpVal > 0) {
            applySharpenFilterToCtx(ctx, canvas.width, canvas.height, sharpVal);
        }

        const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, format, q));
        item.compressedBlob = blob;
        item.compressedSize = blob ? blob.size : item.originalSize;
        item.objectUrl = blob ? URL.createObjectURL(blob) : '';

        const savedBytes = Math.max(0, item.originalSize - item.compressedSize);
        totalSavedBytes += savedBytes;
        const savedPercent = item.originalSize > 0 ? Math.round((savedBytes / item.originalSize) * 100) : 0;

        const baseName = item.file.name.replace(/\.[^/.]+$/, '');
        const targetFilename = `${baseName}_compressed.${ext}`;

        const card = document.createElement('div');
        card.className = "bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col justify-between text-xs font-mono shadow-md hover:border-slate-700 transition-all";
        card.innerHTML = `
            <div class="relative group cursor-pointer overflow-hidden rounded-xl bg-slate-950/50 border border-slate-855 flex items-center justify-center min-h-[130px]">
                <img src="${item.objectUrl}" class="max-h-36 object-contain rounded transition-transform group-hover:scale-105">
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-sans text-xs gap-1.5 font-bold">
                    <i class="fa-solid fa-magnifying-glass-plus"></i> So sánh ảnh
                </div>
            </div>
            <div class="flex flex-col gap-1.5 mt-2.5 pt-2 border-t border-slate-800">
                <div class="flex items-center justify-between text-xs font-bold text-slate-200">
                    <span class="truncate max-w-[140px]" title="${item.file.name}">${item.file.name}</span>
                    <span class="text-emerald-400 font-mono font-bold">-${savedPercent}%</span>
                </div>
                <div class="flex items-center justify-between text-[10px] text-slate-400">
                    <span>${(item.originalSize / 1024).toFixed(1)} KB ➔ <strong class="text-indigo-300">${(item.compressedSize / 1024).toFixed(1)} KB</strong></span>
                    <a href="${item.objectUrl}" download="${targetFilename}" class="px-2 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 text-indigo-300 hover:text-white font-bold transition-colors flex items-center gap-1">
                        <i class="fa-solid fa-download"></i> .${ext.toUpperCase()}
                    </a>
                </div>
            </div>
        `;

        const previewTarget = card.querySelector('.relative.group');
        if (previewTarget && item.objectUrl) {
            const url = item.objectUrl;
            previewTarget.addEventListener('click', () => openPreviewModal(url));
        }

        if (grid) grid.appendChild(card);
    }

    const savedEl = document.getElementById('compress-total-saved');
    if (savedEl) savedEl.innerText = `Tiết kiệm: ${(totalSavedBytes / 1024).toFixed(1)} KB (${compressList.length} ảnh)`;
    isCompressing = false;
}

export async function downloadCompressedZip(): Promise<void> {
    if (compressList.length === 0) return;
    const validItems = compressList.filter(item => item.compressedBlob);
    if (validItems.length === 0) {
        alert("Chưa có dữ liệu nén để tải ZIP.");
        return;
    }

    const zip = new JSZip();
    const format = (document.getElementById('compress-format') as HTMLSelectElement)?.value || 'image/webp';
    const ext = format === 'image/webp' ? 'webp' : format === 'image/png' ? 'png' : 'jpg';

    validItems.forEach(item => {
        const base = item.file.name.replace(/\.[^/.]+$/, '');
        zip.file(`${base}_compressed.${ext}`, item.compressedBlob);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = zipUrl;
    a.download = `Compressed_Manga_Images.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(zipUrl), 10000);
}

export function initImageCompressor(): void {
    const input = document.getElementById('compress-files');
    if (input) {
        input.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            const files = target.files ? Array.from(target.files) : [];
            handleCompressFilesSelect(files);
        });
    }
}
