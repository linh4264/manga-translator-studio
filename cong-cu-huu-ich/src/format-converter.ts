/**
 * Module 5: Format Converter (PNG ↔ JPG ↔ WEBP) (TypeScript)
 */

import { formatFileSize, getTargetFormatExt, openPreviewModal, escapeHTML, ensureJSZipLoaded } from './common';
import type { ConvertItem } from './types';

let convertList: ConvertItem[] = [];
let isConverting = false;

export async function handleConvertFilesSelect(files: File[]): Promise<void> {
    if (!files || files.length === 0) return;

    const uploadEl = document.getElementById('convert-upload');
    if (uploadEl) uploadEl.classList.add('hidden');
    const panelEl = document.getElementById('convert-panel');
    if (panelEl) panelEl.classList.remove('hidden');

    const statusBadge = document.getElementById('convert-status-badge');
    if (statusBadge) statusBadge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang đọc ${files.length} ảnh...`;

    const validFiles = files.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg|tiff)$/i.test(f.name));
    if (validFiles.length === 0) {
        alert("Vui lòng chọn các file định dạng hình ảnh hợp lệ (PNG, JPG, WEBP, ...)");
        return;
    }

    const newItems = await Promise.all(validFiles.map(f => new Promise<ConvertItem | null>((resolve) => {
        const tempUrl = URL.createObjectURL(f);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(tempUrl);
            resolve({ file: f, img, originalSize: f.size, convertedBlob: null, objectUrl: null, convertedExt: '' });
        };
        img.onerror = () => {
            URL.revokeObjectURL(tempUrl);
            resolve(null);
        };
        img.src = tempUrl;
    })));

    const filteredNewItems = newItems.filter((item): item is ConvertItem => item !== null);
    if (filteredNewItems.length === 0) {
        alert("Không thể đọc được file ảnh đã chọn.");
        return;
    }

    convertList = convertList.concat(filteredNewItems);
    await processConvertBatch();
}

export function addMoreConvertFiles(): void {
    const input = document.getElementById('convert-files') as HTMLInputElement | null;
    if (!input) return;
    input.value = '';
    input.click();
}

export function resetConvertBatch(): void {
    convertList.forEach(item => {
        if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
    });
    convertList = [];
    const grid = document.getElementById('convert-grid');
    if (grid) grid.innerHTML = '';
    const panel = document.getElementById('convert-panel');
    if (panel) panel.classList.add('hidden');
    const upload = document.getElementById('convert-upload');
    if (upload) upload.classList.remove('hidden');
    const input = document.getElementById('convert-files') as HTMLInputElement | null;
    if (input) input.value = '';
    const statusBadge = document.getElementById('convert-status-badge');
    if (statusBadge) statusBadge.innerText = 'Đã tải 0 ảnh';
}

export async function processConvertBatch(): Promise<void> {
    if (convertList.length === 0) return;
    if (isConverting) return;
    isConverting = true;

    const targetFormat = (document.getElementById('convert-target') as HTMLSelectElement)?.value || 'image/png';
    const ext = getTargetFormatExt(targetFormat);
    const grid = document.getElementById('convert-grid');
    const statusBadge = document.getElementById('convert-status-badge');

    if (statusBadge) {
        statusBadge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang chuyển sang .${ext.toUpperCase()}...`;
    }

    convertList.forEach(item => {
        if (item.objectUrl) {
            URL.revokeObjectURL(item.objectUrl);
            item.objectUrl = null;
        }
    });

    if (grid) grid.innerHTML = '';

    for (let i = 0; i < convertList.length; i++) {
        const item = convertList[i];
        const canvas = document.createElement('canvas');
        canvas.width = item.img.naturalWidth;
        canvas.height = item.img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        if (targetFormat === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(item.img, 0, 0);

        const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, targetFormat, 0.92));

        // Immediately release canvas GPU backing store
        canvas.width = 0;
        canvas.height = 0;

        item.convertedBlob = blob;
        item.convertedExt = ext;
        item.objectUrl = blob ? URL.createObjectURL(blob) : '';

        const origName = item.file.name;
        const baseName = origName.replace(/\.[^/.]+$/, '');
        const targetFilename = `${baseName}.${ext}`;
        const sizeDiff = blob ? (blob.size - item.originalSize) : 0;
        const sizeDiffPercent = item.originalSize > 0 ? Math.round((sizeDiff / item.originalSize) * 100) : 0;
        const sizeBadgeClass = sizeDiff <= 0 ? 'text-emerald-400' : 'text-amber-400';
        const sizeDiffStr = sizeDiff <= 0 ? `${sizeDiffPercent}%` : `+${sizeDiffPercent}%`;

        const card = document.createElement('div');
        card.className = "bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col justify-between text-xs font-mono shadow-md hover:border-slate-700 transition-all";
        card.innerHTML = `
            <div class="relative group cursor-pointer overflow-hidden rounded-xl bg-slate-950/50 border border-slate-855 flex items-center justify-center min-h-[140px]">
                <img loading="lazy" src="${item.objectUrl}" class="max-h-40 object-contain rounded transition-transform group-hover:scale-105">
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-sans text-xs gap-1.5 font-bold">
                    <i class="fa-solid fa-magnifying-glass-plus"></i> Xem ảnh
                </div>
            </div>
            <div class="flex flex-col gap-1.5 mt-2.5 pt-2 border-t border-slate-800">
                <div class="flex items-center justify-between gap-2">
                    <span class="truncate font-bold text-slate-200 text-[11px]" title="${escapeHTML(origName)}">${escapeHTML(origName)}</span>
                    <span class="${sizeBadgeClass} text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">${escapeHTML(sizeDiffStr)}</span>
                </div>
                <div class="flex items-center justify-between text-[10px] text-slate-400">
                    <span>${formatFileSize(item.originalSize)} ➔ <strong class="text-indigo-300">${formatFileSize(blob ? blob.size : 0)}</strong></span>
                    <a href="${item.objectUrl}" download="${escapeHTML(targetFilename)}" class="px-2 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 hover:border-transparent text-indigo-300 hover:text-white font-bold transition-colors flex items-center gap-1">
                        <i class="fa-solid fa-download"></i> .${escapeHTML(ext.toUpperCase())}
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

        // Yield to browser event loop between conversions
        await new Promise(r => setTimeout(r, 0));
    }

    if (statusBadge) {
        statusBadge.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400"></i> Đã đổi ${convertList.length} ảnh sang .${escapeHTML(ext.toUpperCase())}`;
    }
    isConverting = false;
}

export async function downloadConvertedZip(): Promise<void> {
    if (convertList.length === 0) return;
    const validItems = convertList.filter(item => item.convertedBlob);
    if (validItems.length === 0) {
        alert("Chưa có ảnh nào chuyển đổi hoàn tất để tải ZIP.");
        return;
    }

    const JSZipClass = await ensureJSZipLoaded();
    if (!JSZipClass) {
        alert("Không thể nạp thư viện nén ZIP.");
        return;
    }
    const zip = new JSZipClass();
    validItems.forEach(item => {
        if (item.convertedBlob) {
            const base = item.file.name.replace(/\.[^/.]+$/, '');
            zip.file(`${base}.${item.convertedExt}`, item.convertedBlob);
        }
    });
    const content = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = zipUrl;
    const extName = validItems[0]?.convertedExt ? validItems[0].convertedExt.toUpperCase() : 'CONVERTED';
    a.download = `Converted_${extName}_Images.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(zipUrl), 10000);
}

export function initFormatConverter(): void {
    const input = document.getElementById('convert-files');
    if (input) {
        input.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            const files = target.files ? Array.from(target.files) : [];
            handleConvertFilesSelect(files);
        });
    }
}
