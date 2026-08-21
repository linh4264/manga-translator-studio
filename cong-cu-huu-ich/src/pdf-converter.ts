/**
 * Module 1: PDF to PNG / Image Converter (TypeScript)
 */

import { formatFileSize, getTargetFormatExt, openPreviewModal } from './common';
import type { PdfBlobItem } from './types';

let pdfDoc: any = null;
let pdfName = '';
const pdfBlobsMap = new Map<number, PdfBlobItem>();
let pdfRenderToken = 0;
let pdfRenderDebounce: any = null;
let isPdfRendering = false;

export function initPdfWorker(): void {
    try {
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
    } catch (err) {
        console.warn("Lỗi cấu hình PDF Worker:", err);
    }
}

export function clearPdfBlobs(): void {
    pdfBlobsMap.forEach(item => {
        if (item.url) URL.revokeObjectURL(item.url);
    });
    pdfBlobsMap.clear();
}

export function resetPdfConverter(): void {
    pdfRenderToken++;
    clearPdfBlobs();
    pdfDoc = null;
    pdfName = '';
    const grid = document.getElementById('pdf-grid');
    if (grid) grid.innerHTML = '';
    const panel = document.getElementById('pdf-panel');
    if (panel) panel.classList.add('hidden');
    const upload = document.getElementById('pdf-upload');
    if (upload) upload.classList.remove('hidden');
    const fileInput = document.getElementById('pdf-file') as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';
    const status = document.getElementById('pdf-status');
    if (status) status.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400"></i> Sẵn sàng`;
    const prog = document.getElementById('pdf-progress-container');
    if (prog) prog.classList.add('hidden');
}

export function parsePageRange(rangeStr: string, totalPages: number): number[] {
    if (!rangeStr || !rangeStr.trim()) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = new Set<number>();
    const parts = rangeStr.split(/[,;\s]+/);
    for (const part of parts) {
        if (!part.trim()) continue;
        if (part.includes('-')) {
            const [startStr, endStr] = part.split('-');
            const start = parseInt(startStr, 10);
            const end = parseInt(endStr, 10);
            if (!isNaN(start) && !isNaN(end)) {
                const min = Math.max(1, Math.min(start, end));
                const max = Math.min(totalPages, Math.max(start, end));
                for (let p = min; p <= max; p++) pages.add(p);
            }
        } else {
            const p = parseInt(part, 10);
            if (!isNaN(p) && p >= 1 && p <= totalPages) {
                pages.add(p);
            }
        }
    }
    const result = Array.from(pages).sort((a, b) => a - b);
    return result.length > 0 ? result : Array.from({ length: totalPages }, (_, i) => i + 1);
}

export async function handlePdfFileSelect(file: File): Promise<void> {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        alert("Vui lòng chọn tệp định dạng PDF (.pdf)");
        return;
    }

    initPdfWorker();
    resetPdfConverter();
    pdfName = file.name;
    const nameEl = document.getElementById('pdf-name');
    if (nameEl) {
        nameEl.innerText = file.name;
        nameEl.title = file.name;
    }
    const status = document.getElementById('pdf-status');
    if (status) status.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-indigo-400"></i> Đang đọc tệp PDF...`;

    try {
        const buffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(buffer),
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
            cMapPacked: true,
            standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/'
        });
        pdfDoc = await loadingTask.promise;

        const infoEl = document.getElementById('pdf-info');
        if (infoEl) infoEl.innerText = `${pdfDoc.numPages} trang • ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
        const uploadEl = document.getElementById('pdf-upload');
        if (uploadEl) uploadEl.classList.add('hidden');
        const panelEl = document.getElementById('pdf-panel');
        if (panelEl) panelEl.classList.remove('hidden');

        renderPdfPages();
    } catch (err: any) {
        console.error("Lỗi nạp PDF:", err);
        alert("Không thể đọc tệp PDF này. Tệp có thể bị hỏng hoặc có mật khẩu bảo vệ.\nChi tiết: " + (err?.message || err));
        resetPdfConverter();
    }
}

export function onPdfFormatChange(): void {
    renderPdfPagesDebounced();
}

export function renderPdfPagesDebounced(): void {
    if (pdfRenderDebounce) clearTimeout(pdfRenderDebounce);
    pdfRenderDebounce = setTimeout(() => {
        renderPdfPages();
    }, 250);
}

export async function renderPdfPages(): Promise<void> {
    if (!pdfDoc) return;
    const currentToken = ++pdfRenderToken;
    isPdfRendering = true;

    const scale = parseFloat((document.getElementById('pdf-scale') as HTMLSelectElement)?.value) || 2.0;
    const format = (document.getElementById('pdf-format') as HTMLSelectElement)?.value || 'image/png';
    const rangeStr = (document.getElementById('pdf-range') as HTMLInputElement)?.value || '';
    const ext = getTargetFormatExt(format);
    const quality = (format === 'image/jpeg' || format === 'image/webp') ? 0.92 : 1.0;

    const pagesToRender = parsePageRange(rangeStr, pdfDoc.numPages);
    const grid = document.getElementById('pdf-grid');
    if (grid) grid.innerHTML = '';
    clearPdfBlobs();

    const status = document.getElementById('pdf-status');
    const progCont = document.getElementById('pdf-progress-container');
    const progBar = document.getElementById('pdf-progress-bar');
    if (progCont) progCont.classList.remove('hidden');

    const baseName = pdfName.replace(/\.[^/.]+$/, '') || 'pdf_page';
    const total = pagesToRender.length;

    for (let i = 0; i < total; i++) {
        if (pdfRenderToken !== currentToken) return;

        const pageNum = pagesToRender[i];
        const percent = Math.round(((i + 1) / total) * 100);
        if (status) status.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-indigo-400"></i> Trang ${pageNum} (${i + 1}/${total} • ${percent}%)`;
        if (progBar) progBar.style.width = `${percent}%`;

        try {
            const page = await pdfDoc.getPage(pageNum);
            const vp = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.width = Math.round(vp.width);
            canvas.height = Math.round(vp.height);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) continue;

            // Clean white background for all pages
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({
                canvasContext: ctx,
                viewport: vp,
                background: 'rgb(255, 255, 255)'
            }).promise;

            if (pdfRenderToken !== currentToken) return;

            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, format, quality));
            const blobUrl = blob ? URL.createObjectURL(blob) : '';
            const targetFilename = `${baseName}_trang_${String(pageNum).padStart(3, '0')}.${ext}`;
            const sizeStr = formatFileSize(blob ? blob.size : 0);

            pdfBlobsMap.set(pageNum, {
                blob,
                url: blobUrl,
                filename: targetFilename,
                width: Math.round(vp.width),
                height: Math.round(vp.height),
                sizeStr
            });

            const card = document.createElement('div');
            card.className = "bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-md flex flex-col p-3 hover:border-slate-700 transition-all";
            card.innerHTML = `
                <div class="relative group cursor-pointer overflow-hidden rounded-xl bg-slate-950/60 border border-slate-855 flex items-center justify-center min-h-[160px]">
                    <img src="${blobUrl}" class="max-h-60 object-contain rounded transition-transform group-hover:scale-105" alt="Trang ${pageNum}">
                    <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-sans text-xs gap-1.5 font-bold">
                        <i class="fa-solid fa-magnifying-glass-plus"></i> Phóng to xem
                    </div>
                </div>
                <div class="flex flex-col gap-2 mt-3 pt-2.5 border-t border-slate-800">
                    <div class="flex items-center justify-between text-xs font-bold text-slate-200">
                        <span class="text-indigo-400 font-mono">Trang ${pageNum}</span>
                        <span class="text-[11px] text-slate-400 font-normal font-mono">${Math.round(vp.width)}x${Math.round(vp.height)}px</span>
                    </div>
                    <div class="flex items-center justify-between text-[10px] text-slate-400">
                        <span class="text-slate-300 font-mono font-semibold">${sizeStr}</span>
                        <a href="${blobUrl}" download="${targetFilename}" class="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 text-indigo-300 hover:text-white font-bold transition-all flex items-center gap-1.5 shadow-sm">
                            <i class="fa-solid fa-download"></i> Tải .${ext.toUpperCase()}
                        </a>
                    </div>
                </div>
            `;
            const previewTarget = card.querySelector('.relative.group');
            if (previewTarget) {
                previewTarget.addEventListener('click', () => openPreviewModal(blobUrl));
            }
            if (grid) grid.appendChild(card);
        } catch (pageErr) {
            console.error(`Lỗi render trang ${pageNum}:`, pageErr);
        }
    }

    if (pdfRenderToken === currentToken) {
        if (status) status.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400"></i> Đã xuất ${pdfBlobsMap.size} trang (.${ext.toUpperCase()})`;
        if (progCont) progCont.classList.add('hidden');
        isPdfRendering = false;
    }
}

export async function downloadPdfZip(): Promise<void> {
    if (pdfBlobsMap.size === 0) {
        alert("Chưa có trang ảnh nào được tạo để tải ZIP.");
        return;
    }

    const btn = document.getElementById('btn-pdf-zip');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang nén ZIP...`;

    try {
        const zip = new JSZip();
        pdfBlobsMap.forEach((item) => {
            if (item.blob) {
                zip.file(item.filename, item.blob);
            }
        });

        const content = await zip.generateAsync({ type: 'blob' }, (metadata: any) => {
            if (btn && metadata.percent) {
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Nén ZIP ${Math.round(metadata.percent)}%...`;
            }
        });

        const zipUrl = URL.createObjectURL(content);
        const a = document.createElement('a');
        const baseName = pdfName.replace(/\.[^/.]+$/, '') || 'pdf_pages';
        a.href = zipUrl;
        a.download = `${baseName}_Images.zip`;
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

export function initPdfConverter(): void {
    initPdfWorker();
    const fileInput = document.getElementById('pdf-file');
    if (fileInput) {
        fileInput.addEventListener('change', async (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (!target.files || !target.files[0]) return;
            handlePdfFileSelect(target.files[0]);
        });
    }
}
