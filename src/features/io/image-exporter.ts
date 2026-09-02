/**
 * Manga Translator Studio - IO: Image & Batch ZIP Exporter, PSD Exporter & Preview Modal
 * Manages rendering pages to full-resolution images, ZIP packaging (via Worker or JSZip), PSD layer export, and Export Modal UI.
 */
import { globalState } from '../../core/state';
import { elements } from '../../core/elements';
import { showToast, getCleanFileBaseName, waitForNextPaint, waitForImageReady } from '../../core/utils';
import { renderPageToCanvas2D, renderOverlays, commitActiveEditingState } from '../canvas/canvas-service';
import { saveEraserDrawingToPage } from '../inpainting';
import { selectPage, updateProcessingOverlay } from '../../ui/index';
import { getPageExportMimeType } from './file-loader';
import { analytics } from '../../core/analytics';

declare const JSZip: any;

export interface BatchExportOptions {
    startIndex?: number;
    endIndex?: number;
    pageIndices?: number[];
    format?: 'auto' | 'png' | 'jpg' | 'jpeg' | 'webp';
    quality?: number;
    filename?: string;
}

export let exportPreviewObjectUrl: string | null = null;
export let exportModalIsFullSize = false;

export async function exportActivePage(): Promise<void> {
    if (globalState.activePageIndex === -1) return;

    commitActiveEditingState();
    await saveEraserDrawingToPage();

    const page = globalState.pages[globalState.activePageIndex];
    updateProcessingOverlay(true, "Đang kết xuất ảnh...", "Đang xử lý từng nét vẽ ở độ phân giải gốc...", 30);

    const prevSelectedId = globalState.selectedBlockId;
    globalState.selectedBlockId = null;
    renderOverlays();
    await waitForNextPaint();

    const container = elements.mangaCanvasContainer;
    if (!container) return;

    try {
        container.classList.add('exporting-mode');
        if (elements.mangaBgImage) {
            await waitForImageReady(elements.mangaBgImage, page.src);
        }
        updateProcessingOverlay(true, "Đang xử lý xuất...", "Đang tạo bản vẽ ở độ phân giải gốc...", 60);

        await waitForNextPaint();
        await document.fonts.ready;

        const { mimeType, quality, ext } = getPageExportMimeType(page);
        const canvas = await renderPageToCanvas2D(page);

        const pngBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Không thể chuyển canvas sang Blob.'));
            }, mimeType, quality);
        });
        const objectUrl = URL.createObjectURL(pngBlob);
        const exportName = `translated_${getCleanFileBaseName(page.name)}.${ext}`;

        if (exportPreviewObjectUrl) URL.revokeObjectURL(exportPreviewObjectUrl);
        exportPreviewObjectUrl = objectUrl;
        if (elements.exportPreviewImg) elements.exportPreviewImg.src = objectUrl;
        if (elements.lnkExportDirectDownload) {
            elements.lnkExportDirectDownload.href = objectUrl;
            elements.lnkExportDirectDownload.download = exportName;
        }

        updateProcessingOverlay(false);
        if (elements.exportModal) elements.exportModal.classList.remove('hidden');

        try {
            const tempDownloadLink = document.createElement('a');
            tempDownloadLink.href = objectUrl;
            tempDownloadLink.download = exportName;
            document.body.appendChild(tempDownloadLink);
            tempDownloadLink.click();
            document.body.removeChild(tempDownloadLink);
            analytics.trackExportSingle('single');
            showToast("Đã bắt đầu tải ảnh xuống máy!", "success");
        } catch (downloadErr) {
            console.warn("Direct programmatic download failed:", downloadErr);
        }

    } catch (err: any) {
        console.error("Export failure:", err);
        showToast(`Lỗi khi xuất ảnh: ${err.message}`, "error");
    } finally {
        container.classList.remove('exporting-mode');
        globalState.selectedBlockId = prevSelectedId;
        renderOverlays();
        updateProcessingOverlay(false);
    }
}

export function toggleExportModalFit(): void {
    const img = elements.exportPreviewImg;
    const btnLbl = document.getElementById('lbl-export-toggle-fit');
    if (!img) return;

    exportModalIsFullSize = !exportModalIsFullSize;
    if (exportModalIsFullSize) {
        img.className = "max-w-none max-h-none w-auto h-auto border border-slate-800 rounded-lg shadow-xl cursor-zoom-out transition-all duration-150 m-auto";
        img.title = "Bấm vào ảnh để thu nhỏ khớp khung";
        if (btnLbl) btnLbl.textContent = "Khớp khung";
    } else {
        img.className = "max-w-full h-auto max-h-[70vh] object-contain border border-slate-800 rounded-lg shadow-xl cursor-zoom-in transition-all duration-150 m-auto";
        img.title = "Bấm vào ảnh để phóng to xem 100% full ảnh";
        if (btnLbl) btnLbl.textContent = "Xem 100% full ảnh";
    }
}

export function closeExportModal(): void {
    exportModalIsFullSize = false;
    const btnLbl = document.getElementById('lbl-export-toggle-fit');
    if (btnLbl) btnLbl.textContent = "Xem 100% full ảnh";
    if (elements.exportModal) elements.exportModal.classList.add('hidden');
    if (exportPreviewObjectUrl) {
        URL.revokeObjectURL(exportPreviewObjectUrl);
        exportPreviewObjectUrl = null;
    }
    if (elements.exportPreviewImg) {
        elements.exportPreviewImg.src = '';
        elements.exportPreviewImg.className = "max-w-full h-auto max-h-[70vh] object-contain border border-slate-800 rounded-lg shadow-xl cursor-zoom-in transition-all duration-150 m-auto";
    }
    if (elements.lnkExportDirectDownload) elements.lnkExportDirectDownload.removeAttribute('href');
}

export async function exportCurrentPagePSD(): Promise<void> {
    if (globalState.activePageIndex === -1) {
        showToast("Vui lòng chọn hoặc tải lên ít nhất một trang truyện trước khi xuất PSD.", "warn");
        return;
    }

    commitActiveEditingState();
    await saveEraserDrawingToPage();

    const page = globalState.pages[globalState.activePageIndex];
    if (!page) return;

    try {
        updateProcessingOverlay(true, "Đang tạo file Photoshop PSD...", "Đang phân tầng Background, Inpaint Mask và Text...", 50);
        if (elements.mangaBgImage) {
            await waitForImageReady(elements.mangaBgImage, page.src);
        }

        const { createMangaPSD } = await import('../psd-exporter');
        const psdBlob = await createMangaPSD(page, elements.mangaBgImage, elements.eraserCanvas);

        const url = URL.createObjectURL(psdBlob);
        const fileName = `${getCleanFileBaseName(page.name)}_layers.psd`;
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        analytics.trackExportSingle('psd');
        updateProcessingOverlay(false);
        showToast(`🎉 Đã xuất file Photoshop (${fileName}) phân lớp thành công!`, "success");
    } catch (e: any) {
        console.error("Lỗi xuất file PSD:", e);
        updateProcessingOverlay(false);
        showToast(`Không thể tạo file PSD: ${e.message}`, "error");
    }
}

export function getExportRange(): { startIndex: number; endIndex: number } {
    const chk = document.getElementById('chk-export-range') as HTMLInputElement | null;
    const numStart = document.getElementById('num-export-start') as HTMLInputElement | null;
    const numEnd = document.getElementById('num-export-end') as HTMLInputElement | null;

    let startIndex = 0;
    let endIndex = globalState.pages.length - 1;

    if (chk && chk.checked && numStart && numEnd) {
        const startVal = parseInt(numStart.value, 10);
        const endVal = parseInt(numEnd.value, 10);
        if (!isNaN(startVal) && !isNaN(endVal) && startVal >= 1 && endVal <= globalState.pages.length && startVal <= endVal) {
            startIndex = startVal - 1;
            endIndex = endVal - 1;
        }
    }

    return { startIndex, endIndex };
}

export async function runBatchExport(options?: BatchExportOptions): Promise<void> {
    if (globalState.pages.length === 0) {
        showToast("Không có trang truyện nào để xuất ZIP.", "warn");
        return;
    }

    commitActiveEditingState();
    await saveEraserDrawingToPage();

    let targetIndices: number[] = [];
    if (options && Array.isArray(options.pageIndices) && options.pageIndices.length > 0) {
        targetIndices = options.pageIndices.filter(idx => idx >= 0 && idx < globalState.pages.length);
    } else {
        const { startIndex, endIndex } = getExportRange();
        const start = (options && options.startIndex !== undefined) ? options.startIndex : startIndex;
        const end = (options && options.endIndex !== undefined) ? options.endIndex : endIndex;
        for (let i = start; i <= end; i++) {
            if (i >= 0 && i < globalState.pages.length) targetIndices.push(i);
        }
    }

    if (targetIndices.length === 0) {
        showToast("Không có trang nào được chọn để xuất.", "warn");
        return;
    }

    const totalToExport = targetIndices.length;
    showToast('Đang khởi động tiến trình đóng gói trang...', 'info');
    const prevPageIndex = globalState.activePageIndex;
    const prevSelectedId = globalState.selectedBlockId;

    updateProcessingOverlay(true, "Đang khởi tạo...", "Đang thiết lập hệ thống nén dữ liệu ZIP...", 5);
    globalState.selectedBlockId = null;

    const filesToZip: Array<{ name: string; blob: Blob }> = [];
    const failedPages: Array<{ index: number; name: string; error: string }> = [];
    let successCount = 0;

    try {
        if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }
        for (let seq = 0; seq < targetIndices.length; seq++) {
            const i = targetIndices[seq];
            const page = globalState.pages[i];
            const currentCount = seq + 1;
            updateProcessingOverlay(true, `Kết xuất trang ${currentCount}/${totalToExport}`, `Trang: ${page.name}`, Math.round((currentCount / totalToExport) * 90));

            try {
                const pageFile = page.originalFile || page.file;
                let img: HTMLImageElement | null = null;
                let blobUrl: string | null = null;

                if (pageFile) {
                    img = new Image();
                    blobUrl = URL.createObjectURL(pageFile as Blob);
                    await new Promise((resolve, reject) => {
                        img!.onload = resolve;
                        img!.onerror = () => reject(new Error("Không thể tải ảnh offscreen."));
                        img!.src = blobUrl!;
                    });
                } else if (page.src) {
                    img = new Image();
                    const targetSrc = page.src;
                    await new Promise((resolve, reject) => {
                        img!.onload = resolve;
                        img!.onerror = () => reject(new Error("Không thể tải ảnh offscreen."));
                        img!.src = targetSrc;
                    });
                }

                const canvas = await renderPageToCanvas2D(page, img);
                if (blobUrl) URL.revokeObjectURL(blobUrl);

                const { mimeType, quality, ext } = getPageExportMimeType(page, options?.format, options?.quality);

                const pageBlob = await new Promise<Blob>((resolve, reject) => {
                    canvas.toBlob((blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error('Không thể chuyển canvas sang Blob.'));
                    }, mimeType, quality);
                });

                if (canvas) {
                    canvas.width = 0;
                    canvas.height = 0;
                }

                const finalExportName = `translated_${getCleanFileBaseName(page.name, `page_${i + 1}`)}.${ext}`;
                filesToZip.push({ name: finalExportName, blob: pageBlob });
                successCount++;
            } catch (err: any) {
                console.error(`Lỗi kết xuất tại trang ${i + 1}:`, err);
                failedPages.push({ index: i + 1, name: page.name || `page_${i + 1}`, error: err?.message || 'Lỗi không xác định' });
                showToast(`Lỗi kết xuất trang ${i + 1} (${page.name}): ${err.message}`, "error");
            }

            // Yield to browser event loop for smooth progress update and garbage collection
            await new Promise(r => setTimeout(r, 0));
        }

        if (successCount > 0) {
            updateProcessingOverlay(true, "Đang nén dữ liệu...", "Đang tạo file .zip tải về...", 95);

            let zipBlob: Blob | null = null;
            const JSZipGlobal = (typeof window !== 'undefined' && typeof (window as any).JSZip === 'function')
                ? (window as any).JSZip
                : (typeof JSZip === 'function' ? JSZip : undefined);

            if (JSZipGlobal) {
                const zip = new JSZipGlobal();
                filesToZip.forEach(f => zip.file(f.name, f.blob));
                zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
            } else if (typeof Worker !== 'undefined') {
                try {
                    zipBlob = await new Promise<Blob>((resolve, reject) => {
                        const worker = new Worker(new URL('../../workers/zip-worker.ts', import.meta.url), { type: 'module' });
                        worker.onmessage = (e) => {
                            if (e.data.type === 'DONE') {
                                resolve(e.data.zipBlob);
                                worker.terminate();
                            } else if (e.data.type === 'ERROR') {
                                reject(new Error(e.data.message));
                                worker.terminate();
                            } else if (e.data.type === 'PROGRESS') {
                                updateProcessingOverlay(true, "Đang đóng gói file ZIP...", `Đang lưu file: ${e.data.fileName} (${e.data.current}/${e.data.total})`, e.data.progress);
                            }
                        };
                        worker.onerror = (err) => {
                            reject(err);
                            worker.terminate();
                        };
                        worker.postMessage({
                            type: 'CREATE_ZIP',
                            files: filesToZip,
                            options: { compression: 'STORE' }
                        });
                    });
                } catch (workerErr) {
                    console.warn("Worker ZIP thất bại, thử nạp lại JSZip trên main thread:", workerErr);
                    const fallbackJSZip = (typeof window !== 'undefined' ? (window as any).JSZip : undefined) || (typeof JSZip === 'function' ? JSZip : null);
                    if (fallbackJSZip) {
                        const zip = new fallbackJSZip();
                        filesToZip.forEach(f => zip.file(f.name, f.blob));
                        zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
                    } else {
                        throw workerErr;
                    }
                }
            }

            if (!zipBlob) {
                throw new Error("Thư viện nén ZIP chưa sẵn sàng.");
            }

            const defaultZipName = `manga_studio_translated_${Date.now()}.zip`;
            let finalZipName = options?.filename?.trim() || defaultZipName;
            if (!finalZipName.toLowerCase().endsWith('.zip')) {
                finalZipName += '.zip';
            }

            const zipDownloadUrl = URL.createObjectURL(zipBlob);
            const tempDownloadLink = document.createElement('a');
            tempDownloadLink.href = zipDownloadUrl;
            tempDownloadLink.download = finalZipName;
            document.body.appendChild(tempDownloadLink);
            tempDownloadLink.click();
            document.body.removeChild(tempDownloadLink);
            setTimeout(() => URL.revokeObjectURL(zipDownloadUrl), 1000);

            analytics.trackExportChapter('zip');

            if (failedPages.length > 0) {
                const failedStr = failedPages.map(f => `Trang ${f.index}`).join(', ');
                showToast(`Đã xuất ZIP thành công ${successCount}/${totalToExport} trang! (${failedPages.length} trang bị lỗi: ${failedStr})`, "warn");
            } else {
                showToast(`Tải xuống tệp ZIP thành công! Đã nén đầy đủ ${successCount} trang.`, "success");
            }
        } else {
            const failedStr = failedPages.map(f => `Trang ${f.index} (${f.error})`).join('; ');
            showToast(`Xuất ZIP thất bại: 0/${totalToExport} trang thành công. Chi tiết: ${failedStr}`, "error");
        }
    } catch (err: any) {
        console.error("Lỗi xuất ZIP:", err);
        showToast(`Lỗi khi xuất ZIP: ${err.message}`, "error");
    } finally {
        globalState.selectedBlockId = prevSelectedId;
        if (prevPageIndex !== -1 && prevPageIndex < globalState.pages.length) {
            selectPage(prevPageIndex);
        }
        updateProcessingOverlay(false);
    }
}

export { runBatchExport as exportAllPagesZip };
