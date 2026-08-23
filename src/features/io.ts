// Input/Output Operations, ZIP Chapter Packs & Backup Restore
import {
    globalState,
    pushStateToHistory,
    savePageToDB,
    saveProjectMeta,
    clearProjectDB,
    clearHistory,
    garbageCollectPageCaches,
    createThumbnail,
    getPageDataURL,
    saveToeicWordsToDB
} from '../core/state';
import { elements } from '../core/elements';
import { showToast, getCleanFileBaseName, waitForNextPaint, escapeHTML, waitForImageReady } from '../core/utils';
import { ensureModalElement } from '../core/component-loader';
import { renderPageToCanvas2D, renderOverlays, commitActiveEditingState } from './canvas/canvas-service';
import { restorePageEraserDrawing, saveEraserDrawingToPage } from './inpainting';
import {
    updatePageListUI,
    selectPage,
    updateActiveBlockEditor,
    updateSourceLanguage,
    updateTargetLanguage,
    updatePronounMatrix,
    updateGlossary,
    updateProcessingOverlay,
    togglePreserveNames
} from '../ui/index';
import { normalizeAiBlockBox } from './ocr/ocr-service';
import { getTranslationContext } from './ai/ai-state';
import { getCharacterDossier, getLorebook, setCharacterDossier, setLorebook } from './dossier-lorebook';
import { MangaPage } from '../types/index';


export function getPageExportMimeType(page: MangaPage): { mimeType: string; quality?: number; ext: string } {
    const formatOverride = globalState.exportFormat || 'auto';
    if (formatOverride === 'png') {
        return { mimeType: 'image/png', quality: undefined, ext: 'png' };
    }
    if (formatOverride === 'jpg') {
        return { mimeType: 'image/jpeg', quality: 0.92, ext: 'jpg' };
    }
    if (formatOverride === 'webp') {
        return { mimeType: 'image/webp', quality: 0.92, ext: 'webp' };
    }

    let mimeType = 'image/png';
    let quality: number | undefined = undefined;
    let ext = 'png';

    if (page.originalFile && (page.originalFile as any).type) {
        const origType = (page.originalFile as any).type;
        if (origType === 'image/jpeg' || origType === 'image/jpg') {
            mimeType = 'image/jpeg';
            quality = 0.95;
            ext = 'jpg';
        } else if (origType === 'image/webp') {
            mimeType = 'image/webp';
            quality = 0.95;
            ext = 'webp';
        }
    } else if (page.name) {
        const nameLower = page.name.toLowerCase();
        if (nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg')) {
            mimeType = 'image/jpeg';
            quality = 0.95;
            ext = 'jpg';
        } else if (nameLower.endsWith('.webp')) {
            mimeType = 'image/webp';
            quality = 0.95;
            ext = 'webp';
        }
    }

    return { mimeType, quality, ext };
}

export function dataURLtoBlob(dataURL: string): Promise<Blob> {
    return fetch(dataURL).then(res => res.blob());
}

let exportPreviewObjectUrl: string | null = null;

export async function compressAndResizeImage(img: HTMLImageElement, originalName: string): Promise<{ src: string; file: File; width: number; height: number }> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Không thể khởi tạo 2D context");

    const MAX_WIDTH = 1600;
    const MAX_HEIGHT = 1600;
    let width = img.width;
    let height = img.height;

    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        if (width > height) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
        } else {
            width *= MAX_HEIGHT / height;
            width = MAX_HEIGHT;
        }
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((resultBlob) => {
            canvas.width = 0;
            canvas.height = 0;
            if (resultBlob) {
                resolve(resultBlob);
            } else {
                reject(new Error('Không thể nén ảnh sang Blob.'));
            }
        }, 'image/jpeg', 0.85);
    });

    const optimizedFile = new File([blob], originalName, { type: blob.type || 'image/jpeg' });
    const optimizedPreviewUrl = URL.createObjectURL(optimizedFile);

    return {
        src: optimizedPreviewUrl,
        file: optimizedFile,
        width: width,
        height: height
    };
}

export function handleUploadedFiles(filesList: FileList | File[]): void {
    const incomingFiles = Array.from(filesList);
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const imageFiles = incomingFiles
        .filter(file => file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name))
        .sort((a, b) => collator.compare(a.name, b.name));

    const skippedCount = incomingFiles.length - imageFiles.length;

    if (imageFiles.length === 0) {
        showToast("Vui lòng chọn ít nhất một tệp hình ảnh hợp lệ.", "warn");
        return;
    }

    if (skippedCount > 0) {
        showToast(`Đã bỏ qua ${skippedCount} tệp không phải hình ảnh.`, "warn");
    }

    const addedCount = imageFiles.length;
    let loaded = 0;
    let successCount = 0;

    const finishOne = () => {
        loaded++;
        if (loaded === addedCount) {
            sortPagesByName();
            if (successCount > 0) {
                showToast(`Đã tải và nén tối ưu thành công ${successCount} trang truyện!`, 'success');

                if (globalState.activePageIndex === -1 && globalState.pages.length > 0) {
                    selectPage(0);
                }

                const pageIds = globalState.pages.map(p => p.id);
                saveProjectMeta(pageIds, globalState.activePageIndex);
            } else {
                showToast("Không có hình ảnh nào được tải thành công.", "error");
            }
        }
    };

    for (let i = 0; i < addedCount; i++) {
        const file = imageFiles[i];
        const originalUrl = URL.createObjectURL(file);

        const img = new Image();
        img.onload = async function () {
            let optimized: { src: string; file: File; width: number; height: number } | null = null;
            try {
                optimized = await compressAndResizeImage(img, file.name);
            } catch (error: any) {
                showToast(`Không thể nén ảnh ${file.name}: ${error.message}`, 'error');
                URL.revokeObjectURL(originalUrl);
                finishOne();
                return;
            }

            let thumbnailBlob: Blob | null = null;
            let thumbnailSrc: string | null = null;
            try {
                thumbnailBlob = await createThumbnail(file, 120);
                if (thumbnailBlob) {
                    thumbnailSrc = URL.createObjectURL(thumbnailBlob);
                }
            } catch (err) {
                console.error("Không thể tạo thumbnail cho ảnh:", file.name, err);
            }

            URL.revokeObjectURL(originalUrl);
            if (optimized.src) {
                URL.revokeObjectURL(optimized.src);
            }

            const newPage: MangaPage = {
                id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                file: optimized.file,
                originalFile: file,
                thumbnailBlob: thumbnailBlob,
                thumbnailSrc: thumbnailSrc || URL.createObjectURL(optimized.file),
                name: file.name,
                src: null,
                apiSrc: null,
                width: img.width,
                height: img.height,
                apiWidth: optimized.width,
                apiHeight: optimized.height,
                status: 'draft',
                blocks: []
            };

            globalState.pages.push(newPage);
            savePageToDB(newPage);

            successCount++;
            finishOne();
        };
        img.onerror = function () {
            showToast(`Không thể giải mã cấu trúc ảnh: ${file.name}`, 'error');
            URL.revokeObjectURL(originalUrl);
            finishOne();
        };
        img.src = originalUrl;
    }
}

export function sortPagesByName(): void {
    if (globalState.pages.length === 0) return;

    const activePageId = globalState.activePageIndex !== -1 ? globalState.pages[globalState.activePageIndex].id : null;

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    globalState.pages.sort((a, b) => collator.compare(a.name, b.name));

    if (activePageId !== null) {
        globalState.activePageIndex = globalState.pages.findIndex(p => p.id === activePageId);
    }

    updatePageListUI();
    saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);
    showToast("Đã sắp xếp danh sách trang theo số tự nhiên!", "success");
}

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

export function closeExportModal(): void {
    if (elements.exportModal) elements.exportModal.classList.add('hidden');
    if (exportPreviewObjectUrl) {
        URL.revokeObjectURL(exportPreviewObjectUrl);
        exportPreviewObjectUrl = null;
    }
    if (elements.exportPreviewImg) elements.exportPreviewImg.src = '';
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

        const { createMangaPSD } = await import('./psd-exporter');
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

        updateProcessingOverlay(false);
        showToast(`🎉 Đã xuất file Photoshop (${fileName}) phân lớp thành công!`, "success");
    } catch (e: any) {
        console.error("Lỗi xuất file PSD:", e);
        updateProcessingOverlay(false);
        showToast(`Không thể tạo file PSD: ${e.message}`, "error");
    }
}

function getExportRange(): { startIndex: number; endIndex: number } {
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

export async function runBatchExport(): Promise<void> {
    if (globalState.pages.length === 0) return;

    commitActiveEditingState();
    await saveEraserDrawingToPage();

    const { startIndex, endIndex } = getExportRange();
    const totalToExport = endIndex - startIndex + 1;

    showToast('Đang khởi động tiến trình đóng gói trang...', 'info');
    const prevPageIndex = globalState.activePageIndex;
    const prevSelectedId = globalState.selectedBlockId;

    updateProcessingOverlay(true, "Đang khởi tạo...", "Đang thiết lập hệ thống nén dữ liệu ZIP...", 5);
    globalState.selectedBlockId = null;

    const filesToZip: Array<{ name: string; blob: Blob }> = [];
    let successCount = 0;

    try {
        await document.fonts.ready;
        for (let i = startIndex; i <= endIndex; i++) {
            const page = globalState.pages[i];
            const currentCount = i - startIndex + 1;
            updateProcessingOverlay(true, `Kết xuất trang ${currentCount}/${totalToExport}`, `Trang: ${page.name}`, Math.round((currentCount / totalToExport) * 90));

            try {
                const pageFile = page.originalFile || page.file;
                if (!pageFile) throw new Error("File ảnh không tồn tại.");

                const img = new Image();
                const blobUrl = URL.createObjectURL(pageFile as Blob);
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = () => reject(new Error("Không thể tải ảnh offscreen."));
                    img.src = blobUrl;
                });

                const canvas = await renderPageToCanvas2D(page, img);
                URL.revokeObjectURL(blobUrl);

                const { mimeType, quality, ext } = getPageExportMimeType(page);

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
                showToast(`Lỗi kết xuất trang ${i + 1}: ${err.message}`, "error");
            }
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
                        const worker = new Worker(new URL('../workers/zip-worker.ts', import.meta.url), { type: 'module' });
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

            const zipDownloadUrl = URL.createObjectURL(zipBlob);
            const tempDownloadLink = document.createElement('a');
            tempDownloadLink.href = zipDownloadUrl;
            tempDownloadLink.download = `manga_studio_translated_${Date.now()}.zip`;
            document.body.appendChild(tempDownloadLink);
            tempDownloadLink.click();
            document.body.removeChild(tempDownloadLink);
            setTimeout(() => URL.revokeObjectURL(zipDownloadUrl), 1000);

            showToast(`Tải xuống tệp ZIP thành công! Đã nén ${successCount} trang.`, "success");
        } else {
            showToast("Không có trang nào được xuất thành công.", "error");
        }
    } catch (err: any) {
        console.error("Lỗi xuất ZIP:", err);
        showToast(`Lỗi khi xuất ZIP: ${err.message}`, "error");
    } finally {
        if (prevPageIndex !== -1 && prevPageIndex < globalState.pages.length) {
            await selectPage(prevPageIndex);
            if (globalState.pages[prevPageIndex] && elements.mangaBgImage) {
                await waitForImageReady(elements.mangaBgImage, globalState.pages[prevPageIndex].src);
            }
            globalState.selectedBlockId = prevSelectedId;
            renderOverlays();
        }
        updateProcessingOverlay(false);
    }
}

export async function runPdfExport(): Promise<void> {
    if (globalState.pages.length === 0) {
        showToast("Không có trang truyện nào để xuất PDF.", "warn");
        return;
    }

    commitActiveEditingState();
    await saveEraserDrawingToPage();

    const jsPDFClass = typeof window !== 'undefined' ? ((window.jspdf && window.jspdf.jsPDF) || window.jsPDF) : undefined;
    if (!jsPDFClass) {
        showToast("Thư viện jsPDF chưa sẵn sàng. Vui lòng tải lại trang.", "error");
        return;
    }

    const prevPageIndex = globalState.activePageIndex;
    const prevSelectedId = globalState.selectedBlockId;
    globalState.selectedBlockId = null;

    updateProcessingOverlay(true, "Đang khởi tạo PDF...", "Đang thiết lập trang truyện...", 5);

    try {
        let pdf: any = null;
        const { startIndex, endIndex } = getExportRange();
        const totalPages = endIndex - startIndex + 1;

        for (let i = startIndex; i <= endIndex; i++) {
            const page = globalState.pages[i];
            const currentCount = i - startIndex + 1;
            const progressVal = Math.round((currentCount / totalPages) * 90);
            updateProcessingOverlay(true, `Đang ghép PDF (${currentCount}/${totalPages})`, `Trang: ${escapeHTML(page.name)}`, progressVal);

            selectPage(i);
            if (elements.mangaBgImage) {
                await waitForImageReady(elements.mangaBgImage, page.src);
            }
            await restorePageEraserDrawing(page);
            renderOverlays();

            await waitForNextPaint();
            await document.fonts.ready;

            const canvas = await renderPageToCanvas2D(page);

            const pdfQualityMode = globalState.pdfQuality || 'hd';
            let imgData: string;
            let imgFormat = 'JPEG';
            if (pdfQualityMode === 'max') {
                imgData = canvas.toDataURL('image/png');
                imgFormat = 'PNG';
            } else if (pdfQualityMode === 'standard') {
                imgData = canvas.toDataURL('image/jpeg', 0.90);
                imgFormat = 'JPEG';
            } else {
                imgData = canvas.toDataURL('image/jpeg', 0.98);
                imgFormat = 'JPEG';
            }

            const naturalW = canvas.width || 800;
            const naturalH = canvas.height || 1200;
            const orientation = naturalW > naturalH ? 'landscape' : 'portrait';

            if (!pdf) {
                pdf = new jsPDFClass({
                    orientation: orientation,
                    unit: 'px',
                    format: [naturalW, naturalH]
                });
                pdf.addImage(imgData, imgFormat, 0, 0, naturalW, naturalH);
            } else {
                pdf.addPage([naturalW, naturalH], orientation);
                pdf.addImage(imgData, imgFormat, 0, 0, naturalW, naturalH);
            }

            if (canvas) {
                canvas.width = 0;
                canvas.height = 0;
            }
        }

        updateProcessingOverlay(true, "Đang hoàn tất PDF...", "Đang lưu file về máy...", 98);
        pdf.save(`Manga_Chapter_${Date.now()}.pdf`);
        showToast("Đã xuất thành công toàn bộ chương truyện ra file PDF!", "success");
    } catch (err: any) {
        console.error("Lỗi xuất PDF:", err);
        showToast(`Lỗi khi xuất PDF: ${err.message}`, "error");
    } finally {
        globalState.selectedBlockId = prevSelectedId;
        if (prevPageIndex !== -1 && prevPageIndex < globalState.pages.length) {
            selectPage(prevPageIndex);
        }
        updateProcessingOverlay(false);
    }
}

export function triggerImportScript(): void {
    let inputEl = document.getElementById('import-script-input') as HTMLInputElement | null;
    if (!inputEl) {
        inputEl = document.createElement('input');
        inputEl.type = 'file';
        inputEl.id = 'import-script-input';
        inputEl.accept = '.json,.txt';
        inputEl.className = 'hidden';
        inputEl.onchange = (e: any) => importTranslationScript(e.target.files);
        document.body.appendChild(inputEl);
    }
    inputEl.click();
}

export function promptExportScript(): void {
    if (globalState.pages.length === 0) {
        showToast("Không có trang truyện nào trong dự án.", "warn");
        return;
    }

    const choice = prompt(
        "QUẢN LÝ KỊCH BẢN DỊCH THUẬT:\n\n" +
        "1 - Xuất kịch bản Văn Bản (.txt)\n" +
        "2 - Xuất kịch bản Cấu Trúc (.json)\n" +
        "3 - Nhập kịch bản từ tệp (.json hoặc .txt)\n\n" +
        "Vui lòng nhập số 1, 2 hoặc 3:",
        "1"
    );

    if (choice === '1') {
        exportTranslationScript('txt');
    } else if (choice === '2') {
        exportTranslationScript('json');
    } else if (choice === '3') {
        triggerImportScript();
    }
}

export function generateTxtScript(pages: MangaPage[]): string {
    let fileContent = "";
    fileContent += `==================================================\n`;
    fileContent += `  KỊCH BẢN DỊCH THUẬT MANGA - TOÀN BỘ CHƯƠNG (${pages.length} TRANG)\n`;
    fileContent += `  Thời gian xuất: ${new Date().toLocaleString()}\n`;
    fileContent += `==================================================\n\n`;

    pages.forEach((page, index) => {
        fileContent += `[TRANG ${index + 1}: ${page.name || `Trang ${index + 1}`}]\n`;
        fileContent += `--------------------------------------------------\n`;

        const blocks = page.blocks || [];
        if (blocks.length === 0) {
            fileContent += `  (Trang này chưa có ô văn bản nào)\n\n`;
        } else {
            blocks.forEach((block, bIdx) => {
                const blockId = block.id ? ` [id: ${block.id}]` : '';
                const typeLabel = block.type === 'narration' ? 'Dẫn truyện' :
                    (block.type === 'thought' ? 'Nghĩ thầm' :
                        (block.type === 'sfx' ? 'SFX' :
                            (block.type === 'image' ? 'Ảnh chèn' : 'Thoại')));
                const speakerInfo = block.speaker ? ` [Nhân vật: ${block.speaker}]` : '';

                fileContent += `#${bIdx + 1}${blockId} [${typeLabel}]${speakerInfo}\n`;
                if (block.type === 'image') {
                    fileContent += `[Ảnh]: ${block.imageUrl ? 'Có dữ liệu ảnh' : 'Chưa chọn ảnh'}\n\n`;
                } else {
                    fileContent += `[Gốc]:\n${block.original || '(Rỗng)'}\n`;
                    fileContent += `[Dịch]:\n${block.translated || ''}\n\n`;
                }
            });
        }
        fileContent += `\n`;
    });
    return fileContent;
}

export function parseTxtBlocksSection(sectionText: string): any[] {
    const blocks: any[] = [];
    if (!sectionText) return blocks;

    const lines = sectionText.split('\n');
    let currentBlock: any = null;
    let currentField: 'original' | 'translated' | null = null;
    let originalLines: string[] = [];
    let translatedLines: string[] = [];

    function commitCurrentBlock() {
        if (!currentBlock && originalLines.length === 0 && translatedLines.length === 0) return;

        let origText = originalLines.join('\n').trim();
        let transText = translatedLines.join('\n').trim();

        if (origText.startsWith('"') && origText.endsWith('"') && origText.length >= 2) {
            origText = origText.substring(1, origText.length - 1);
        }
        if (transText.startsWith('"') && transText.endsWith('"') && transText.length >= 2) {
            transText = transText.substring(1, transText.length - 1);
        }

        if (origText === '(Rỗng)') origText = '';

        const blockObj = {
            id: currentBlock?.id || null,
            blockIndex: currentBlock?.blockIndex !== undefined ? currentBlock.blockIndex : null,
            type: currentBlock?.type || 'dialogue',
            speaker: currentBlock?.speaker || null,
            original: origText,
            translated: transText
        };

        blocks.push(blockObj);

        currentBlock = null;
        currentField = null;
        originalLines = [];
        translatedLines = [];
    }

    for (const line of lines) {
        const trimmed = line.trim();

        if (/^[-=]{3,}$/.test(trimmed)) {
            continue;
        }

        if (/^\*\s+[A-ZÀ-Ỹ\s,()&]+:?$/i.test(trimmed)) {
            continue;
        }

        if (/^\(.*\)$/.test(trimmed) && trimmed.toLowerCase().includes('không có')) {
            continue;
        }

        const blockHeaderMatch = trimmed.match(/^#(\d+)(?:\s+\[id:\s*([^\]]+)\])?(?:\s+\[([^\]]+)\])?(?:\s+\[(?:Nhân vật|Speaker):\s*([^\]]+)\])?/i);
        const legacyLineMatch = trimmed.match(/^(\d+)\.(?:\s+\[([^\]]+)\])?(?:\s+\[(?:Gốc|Original)\]\s*:\s*(.*))?$/i);

        if (blockHeaderMatch) {
            commitCurrentBlock();
            const bIdx = parseInt(blockHeaderMatch[1], 10) - 1;
            const bId = blockHeaderMatch[2]?.trim() || null;
            const rawType = (blockHeaderMatch[3] || '').trim().toLowerCase();
            const speaker = blockHeaderMatch[4]?.trim() || null;

            let type = 'dialogue';
            if (rawType.includes('dẫn') || rawType.includes('narration')) type = 'narration';
            else if (rawType.includes('nghĩ') || rawType.includes('thought')) type = 'thought';
            else if (rawType.includes('sfx')) type = 'sfx';
            else if (rawType.includes('ảnh') || rawType.includes('image')) type = 'image';

            currentBlock = {
                blockIndex: bIdx,
                id: bId,
                type: type,
                speaker: speaker
            };
            currentField = null;
            continue;
        }

        const origTagMatch = trimmed.match(/^\[(?:Gốc|Original)\]\s*:\s*(.*)$/i);
        if (origTagMatch) {
            if (currentField === 'translated' || (currentField === 'original' && originalLines.length > 0)) {
                commitCurrentBlock();
            }
            currentField = 'original';
            const inlineContent = origTagMatch[1].trim();
            if (inlineContent) {
                originalLines.push(inlineContent);
            }
            continue;
        }

        const transTagMatch = trimmed.match(/^\[(?:Dịch|Translated|Translation)\]\s*:\s*(.*)$/i);
        if (transTagMatch) {
            currentField = 'translated';
            const inlineContent = transTagMatch[1].trim();
            if (inlineContent) {
                translatedLines.push(inlineContent);
            }
            continue;
        }

        if (legacyLineMatch && !blockHeaderMatch) {
            commitCurrentBlock();
            const bIdx = parseInt(legacyLineMatch[1], 10) - 1;
            const tag = legacyLineMatch[2] || '';
            let speaker = null;
            let type = 'dialogue';
            if (tag.toLowerCase().startsWith('nhân vật:') || tag.toLowerCase().startsWith('speaker:')) {
                speaker = tag.replace(/^(?:nhân vật|speaker):\s*/i, '').trim();
            } else if (tag.toLowerCase().includes('dẫn') || tag.toLowerCase().includes('narration')) {
                type = 'narration';
            } else if (tag.toLowerCase().includes('nghĩ') || tag.toLowerCase().includes('thought')) {
                type = 'thought';
            } else if (tag.toLowerCase().includes('sfx')) {
                type = 'sfx';
            }

            currentBlock = {
                blockIndex: bIdx,
                id: null,
                type: type,
                speaker: speaker
            };

            if (legacyLineMatch[3] !== undefined) {
                currentField = 'original';
                originalLines.push(legacyLineMatch[3].trim());
            } else {
                currentField = null;
            }
            continue;
        }

        if (currentField === 'original') {
            originalLines.push(line);
        } else if (currentField === 'translated') {
            translatedLines.push(line);
        }
    }

    commitCurrentBlock();
    return blocks;
}

export function parseTxtScript(text: string): any[] {
    if (!text || typeof text !== 'string') return [];

    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const pageHeaderRegex = /\[(?:TRANG|PAGE)\s+(\d+)(?:\s*:\s*([^\]]+))?\]/gi;
    let match: RegExpExecArray | null;
    const pageMatches: any[] = [];

    while ((match = pageHeaderRegex.exec(normalizedText)) !== null) {
        pageMatches.push({
            index: match.index,
            pageIndex: parseInt(match[1], 10) - 1,
            pageName: (match[2] || '').trim(),
            headerLength: match[0].length
        });
    }

    if (pageMatches.length === 0) {
        const blocks = parseTxtBlocksSection(normalizedText);
        if (blocks.length > 0) {
            return [{ pageIndex: 0, pageName: '', blocks }];
        }
        return [];
    }

    const pages: any[] = [];
    for (let i = 0; i < pageMatches.length; i++) {
        const cur = pageMatches[i];
        const startPos = cur.index + cur.headerLength;
        const endPos = (i < pageMatches.length - 1) ? pageMatches[i + 1].index : normalizedText.length;
        const sectionText = normalizedText.substring(startPos, endPos);

        const blocks = parseTxtBlocksSection(sectionText);
        pages.push({
            pageIndex: cur.pageIndex,
            pageName: cur.pageName,
            blocks: blocks
        });
    }

    return pages;
}

export function applyScriptPagesToProject(pagesArray: any[]): { matchedPages: number; matchedBlocks: number } {
    let matchedPages = 0;
    let matchedBlocks = 0;

    if (!Array.isArray(pagesArray)) return { matchedPages, matchedBlocks };

    pagesArray.forEach((scriptPage, pIdx) => {
        if (!scriptPage.blocks || !Array.isArray(scriptPage.blocks)) return;

        let targetPage: MangaPage | undefined = undefined;

        if (scriptPage.pageName) {
            targetPage = globalState.pages.find(p => p.name === scriptPage.pageName);
        }
        if (!targetPage && scriptPage.page) {
            targetPage = globalState.pages.find(p => p.name === scriptPage.page);
        }
        if (!targetPage && scriptPage.pageIndex !== undefined && scriptPage.pageIndex !== null) {
            const idx = typeof scriptPage.pageIndex === 'number' ? scriptPage.pageIndex : parseInt(scriptPage.pageIndex, 10);
            if (!isNaN(idx) && idx >= 0 && idx < globalState.pages.length) {
                targetPage = globalState.pages[idx];
            }
        }
        if (!targetPage && pIdx < globalState.pages.length) {
            targetPage = globalState.pages[pIdx];
        }

        if (!targetPage) return;
        matchedPages++;

        const matchedInTarget = new Set();

        scriptPage.blocks.forEach((scriptBlock: any, blockIdx: number) => {
            let targetBlock: any = null;
            const blockId = scriptBlock.id || scriptBlock.blockId;

            if (blockId && targetPage) {
                targetBlock = targetPage.blocks.find(b => b.id === blockId && !matchedInTarget.has(b));
            }
            if (!targetBlock && scriptBlock.original && targetPage) {
                const origClean = String(scriptBlock.original).trim();
                if (origClean) {
                    targetBlock = targetPage.blocks.find(b => b.original && b.original.trim() === origClean && !matchedInTarget.has(b));
                }
            }
            if (!targetBlock && scriptBlock.blockIndex !== null && scriptBlock.blockIndex !== undefined && targetPage) {
                const idx = typeof scriptBlock.blockIndex === 'number' ? scriptBlock.blockIndex : parseInt(scriptBlock.blockIndex, 10);
                if (!isNaN(idx) && idx >= 0 && idx < targetPage.blocks.length && !matchedInTarget.has(targetPage.blocks[idx])) {
                    targetBlock = targetPage.blocks[idx];
                }
            }
            if (!targetBlock && targetPage && blockIdx < targetPage.blocks.length && !matchedInTarget.has(targetPage.blocks[blockIdx])) {
                targetBlock = targetPage.blocks[blockIdx];
            }

            if (!targetBlock) return;
            matchedInTarget.add(targetBlock);

            if (scriptBlock.translated !== undefined && scriptBlock.translated !== null) {
                targetBlock.translated = scriptBlock.translated;
                matchedBlocks++;
            }
            if (scriptBlock.box || scriptBlock.positionPercent) {
                targetBlock.box = normalizeAiBlockBox(scriptBlock.box || scriptBlock.positionPercent);
            }
            if (scriptBlock.speaker) {
                targetBlock.speaker = scriptBlock.speaker;
            }
            if (scriptBlock.vertical !== undefined) {
                targetBlock.vertical = scriptBlock.vertical;
                if (targetBlock.style) targetBlock.style.vertical = scriptBlock.vertical;
            }
        });

        savePageToDB(targetPage);
    });

    return { matchedPages, matchedBlocks };
}

export function applyFlatScriptBlocksToProject(flatBlocksArray: any[]): { matchedPages: number; matchedBlocks: number } {
    let matchedBlocks = 0;
    const touchedPages = new Set<MangaPage>();
    const matchedInTarget = new Set();

    if (!Array.isArray(flatBlocksArray)) return { matchedPages: 0, matchedBlocks: 0 };

    flatBlocksArray.forEach((scriptBlock) => {
        const blockId = scriptBlock.id || scriptBlock.blockId;
        let targetBlock: any = null;
        let targetPage: MangaPage | null = null;

        for (const p of globalState.pages) {
            if (blockId) {
                const found = (p.blocks || []).find(b => b.id === blockId && !matchedInTarget.has(b));
                if (found) {
                    targetBlock = found;
                    targetPage = p;
                    break;
                }
            }
        }

        if (!targetBlock && scriptBlock.original) {
            const origClean = String(scriptBlock.original).trim();
            if (origClean) {
                for (const p of globalState.pages) {
                    const found = (p.blocks || []).find(b => b.original && b.original.trim() === origClean && !matchedInTarget.has(b));
                    if (found) {
                        targetBlock = found;
                        targetPage = p;
                        break;
                    }
                }
            }
        }

        if (targetBlock && targetPage) {
            matchedInTarget.add(targetBlock);
            if (scriptBlock.translated !== undefined && scriptBlock.translated !== null) {
                targetBlock.translated = scriptBlock.translated;
                matchedBlocks++;
            }
            if (scriptBlock.box || scriptBlock.positionPercent) {
                targetBlock.box = normalizeAiBlockBox(scriptBlock.box || scriptBlock.positionPercent);
            }
            if (scriptBlock.speaker) {
                targetBlock.speaker = scriptBlock.speaker;
            }
            if (scriptBlock.vertical !== undefined) {
                targetBlock.vertical = scriptBlock.vertical;
                if (targetBlock.style) targetBlock.style.vertical = scriptBlock.vertical;
            }
            touchedPages.add(targetPage);
        }
    });

    touchedPages.forEach(p => savePageToDB(p));
    return { matchedPages: touchedPages.size, matchedBlocks };
}

export function exportTranslationScript(format: 'txt' | 'json'): void {
    if (globalState.pages.length === 0) {
        showToast("Không có trang truyện nào để xuất kịch bản.", "error");
        return;
    }

    let fileContent = "";
    let mimeType = "text/plain";
    let fileName = `chapter_script_${Date.now()}`;

    if (format === 'txt') {
        fileName += ".txt";
        fileContent = generateTxtScript(globalState.pages);
    } else if (format === 'json') {
        fileName += ".json";
        mimeType = "application/json";

        const scriptData = {
            chapterName: "Manga Translation Script",
            totalPages: globalState.pages.length,
            exportedAt: new Date().toISOString(),
            pages: globalState.pages.map((page, index) => ({
                pageIndex: index,
                pageName: page.name || `Trang ${index + 1}`,
                blocks: (page.blocks || []).map(b => {
                    const isVertical = (b.vertical !== undefined) ? !!b.vertical : !!(b.style?.vertical);
                    const boxArray = b.box ? [
                        Math.round((b.box.x || 0) * 100) / 100,
                        Math.round((b.box.y || 0) * 100) / 100,
                        Math.round((b.box.w || 0) * 100) / 100,
                        Math.round((b.box.h || 0) * 100) / 100
                    ] : [0, 0, 0, 0];
                    const blockData: any = {
                        id: b.id,
                        type: b.type || 'dialogue',
                        original: b.original || '',
                        translated: b.translated || '',
                        box: boxArray
                    };
                    if (isVertical) {
                        blockData.vertical = true;
                    }
                    if (b.speaker) blockData.speaker = b.speaker;
                    if ((b as any).target) blockData.target = (b as any).target;
                    if (b.type === 'image' && b.imageUrl) {
                        blockData.imageUrl = b.imageUrl;
                    }
                    return blockData;
                })
            }))
        };
        fileContent = JSON.stringify(scriptData, null, 2);
    }

    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Đã xuất kịch bản thành công dưới định dạng ${format.toUpperCase()}!`, "success");
}

export async function importTranslationScript(fileList: FileList | File[]): Promise<void> {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    const fileName = file.name.toLowerCase();

    if (!fileName.endsWith('.json') && !fileName.endsWith('.txt')) {
        showToast("Chỉ hỗ trợ nhập kịch bản định dạng .JSON hoặc .TXT!", "error");
        return;
    }

    try {
        const text = await file.text();
        pushStateToHistory();

        let matchedPages = 0;
        let matchedBlocks = 0;

        if (fileName.endsWith('.json')) {
            const scriptData = JSON.parse(text);

            let pagesArray: any = null;
            let flatBlocksArray: any = null;

            if (scriptData && Array.isArray(scriptData.pages)) {
                pagesArray = scriptData.pages;
            } else if (Array.isArray(scriptData)) {
                if (scriptData.length > 0 && Array.isArray(scriptData[0].blocks)) {
                    pagesArray = scriptData;
                } else {
                    flatBlocksArray = scriptData;
                }
            } else if (scriptData && Array.isArray(scriptData.blocks)) {
                flatBlocksArray = scriptData.blocks;
            }

            if (pagesArray) {
                const res = applyScriptPagesToProject(pagesArray);
                matchedPages = res.matchedPages;
                matchedBlocks = res.matchedBlocks;
            } else if (flatBlocksArray) {
                const res = applyFlatScriptBlocksToProject(flatBlocksArray);
                matchedPages = res.matchedPages;
                matchedBlocks = res.matchedBlocks;
            } else {
                showToast("Dữ liệu kịch bản JSON không hợp lệ!", "error");
                return;
            }
        } else if (fileName.endsWith('.txt')) {
            const parsedPages = parseTxtScript(text);
            if (parsedPages.length === 0) {
                showToast("Không tìm thấy cấu trúc [TRANG ...] trong file kịch bản TXT!", "error");
                return;
            }

            const res = applyScriptPagesToProject(parsedPages);
            matchedPages = res.matchedPages;
            matchedBlocks = res.matchedBlocks;
        }

        renderOverlays();
        updateActiveBlockEditor();

        showToast(`Đã nhập kịch bản thành công! Khớp ${matchedPages} trang, cập nhật ${matchedBlocks} ô dịch.`, "success");

    } catch (err: any) {
        console.error("Lỗi nhập kịch bản:", err);
        showToast(`Lỗi khi đọc/phân tích tệp kịch bản: ${err.message}`, "error");
    }

    const importScriptInput = document.getElementById('import-script-input') as HTMLInputElement | null;
    if (importScriptInput) importScriptInput.value = '';
}

export async function buildProjectBackupJSON(): Promise<any> {
    const pagesData: any[] = [];
    for (const page of globalState.pages) {
        const imgDataURL = await getPageDataURL(page);
        pagesData.push({
            id: page.id,
            name: page.name,
            status: page.status,
            src: imgDataURL,
            blocks: (page.blocks || []).map(b => ({
                id: b.id,
                type: b.type,
                imageUrl: b.imageUrl || null,
                original: b.original,
                translated: b.translated,
                box: { ...b.box },
                style: { ...b.style }
            }))
        });
    }

    const ctx = getTranslationContext();
    return {
        version: '2.0',
        exportedAt: new Date().toISOString(),
        sourceLanguage: ctx.sourceLanguage,
        targetLanguage: ctx.targetLanguage,
        pronounMatrix: globalState.pronounMatrix,
        preserveNames: ctx.preserveNames,
        glossaryNames: ctx.glossaryNames,
        characterDossier: getCharacterDossier(),
        lorebook: getLorebook(),
        pages: pagesData
    };
}


export async function exportProjectBackup(): Promise<void> {
    if (globalState.pages.length === 0) {
        showToast("Không có dự án nào để sao lưu.", "warn");
        return;
    }

    let defaultName = `Manga_Project_${new Date().toISOString().slice(0, 10)}`;
    if (globalState.pages[0]?.name) {
        defaultName = getCleanFileBaseName(globalState.pages[0].name) + "_Backup";
    }

    const inputName = prompt("Nhập tên tệp sao lưu dự án (.manga):", defaultName);
    if (inputName === null) return;

    let fileName = inputName.trim() || defaultName;
    if (!fileName.toLowerCase().endsWith('.manga')) {
        fileName += '.manga';
    }

    try {
        showToast("Đang đóng gói file dự án (.manga)... Vui lòng chờ.", "info");

        const backupData = await buildProjectBackupJSON();

        const blob = new Blob([JSON.stringify(backupData)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Đã xuất file sao lưu dự án (${fileName}) thành công! (${backupData.pages.length} trang)`, "success");
    } catch (e) {
        console.error("Lỗi sao lưu dự án:", e);
        showToast("Không thể xuất file sao lưu dự án.", "error");
    }
}

export async function importProjectBackup(files: FileList | File[]): Promise<void> {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
        showToast("Đang đọc file sao lưu dự án...", "info");
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data || !Array.isArray(data.pages)) {
            throw new Error("File sao lưu không đúng định dạng .manga chuẩn.");
        }

        if (confirm(`Khôi phục dự án chứa ${data.pages.length} trang truyện? Thao tác này sẽ thay thế dự án hiện tại.`)) {
            globalState.pages.forEach(page => {
                if (page?.apiSrc?.startsWith('blob:')) URL.revokeObjectURL(page.apiSrc);
                if (page?.src?.startsWith('blob:')) URL.revokeObjectURL(page.src);
                if (page?.thumbnailSrc?.startsWith('blob:')) URL.revokeObjectURL(page.thumbnailSrc);
            });

            await clearProjectDB();

            for (const p of data.pages) {
                if (p.blocks) {
                    p.blocks.forEach((block: any) => { delete block.maskCache; });
                }
                if (p.src && p.src.startsWith('data:')) {
                    try {
                        const blob = await dataURLtoBlob(p.src);
                        p.originalFile = blob;
                        p.file = blob;
                        p.src = URL.createObjectURL(blob);
                        p.thumbnailSrc = URL.createObjectURL(blob);
                    } catch (err) {
                        console.warn("Không thể chuyển data URL thành Blob cho trang:", p.name, err);
                    }
                }
            }

            globalState.pages = data.pages;
            globalState.activePageIndex = data.pages.length > 0 ? 0 : -1;
            if (data.sourceLanguage) updateSourceLanguage(data.sourceLanguage);
            if (data.targetLanguage) updateTargetLanguage(data.targetLanguage);
            if (data.pronounMatrix) updatePronounMatrix(data.pronounMatrix);
            if (data.glossaryNames) updateGlossary(data.glossaryNames);
            if (data.preserveNames !== undefined) togglePreserveNames(!!data.preserveNames);

            if (data.characterDossier) setCharacterDossier(data.characterDossier, false);
            if (data.lorebook) setLorebook(data.lorebook, false);


            for (const page of globalState.pages) {
                await savePageToDB(page);
            }
            await saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);

            updatePageListUI();
            if (globalState.activePageIndex !== -1) {
                selectPage(globalState.activePageIndex);
            }
            showToast(`Đã khôi phục thành công ${data.pages.length} trang truyện!`, "success");
        }
    } catch (e: any) {
        console.error("Lỗi khôi phục dự án:", e);
        showToast(`Không thể đọc file dự án: ${e.message}`, "error");
    } finally {
        const inp = document.getElementById('import-project-input') as HTMLInputElement | null;
        if (inp) inp.value = '';
    }
}

export function clearMemoryCache(): void {
    let count = 0;
    globalState.pages.forEach(page => {
        page.imageDataCache = null;
        if (page.blocks) {
            page.blocks.forEach(b => {
                b.maskCache = null;
                b.autoFitCache = null;
                count++;
            });
        }
    });
    showToast(`Đã giải phóng đệm Canvas của ${globalState.pages.length} trang (${count} ô thoại). RAM mượt mà 60 FPS!`, "success");
}

export async function clearCurrentProject(): Promise<void> {
    if (globalState.pages.length === 0) {
        showToast('Không có dự án nào để xóa.', 'warn');
        return;
    }
    if (!confirm('Bạn có chắc muốn xóa toàn bộ dự án hiện tại? Tất cả trang và bản dịch sẽ bị mất!')) return;

    globalState.pages.forEach(page => {
        if (page?.apiSrc?.startsWith('blob:')) URL.revokeObjectURL(page.apiSrc);
        if (page?.src?.startsWith('blob:')) URL.revokeObjectURL(page.src);
        if (page?.thumbnailSrc?.startsWith('blob:')) URL.revokeObjectURL(page.thumbnailSrc);
    });

    await clearProjectDB();
    clearHistory();

    globalState.pages = [];
    globalState.activePageIndex = -1;
    globalState.selectedBlockId = null;

    if (globalState.toeicSavedWords && globalState.toeicSavedWords.length > 0) {
        await saveToeicWordsToDB(globalState.toeicSavedWords);
    }

    await saveProjectMeta([], -1);
    garbageCollectPageCaches();

    if (elements.mangaOverlaysContainer) {
        elements.mangaOverlaysContainer.innerHTML = '';
    }
    if (elements.mangaBgImage) {
        elements.mangaBgImage.removeAttribute('src');
        elements.mangaBgImage.dataset.loadedSrc = '';
    }
    if (elements.eraserCanvas) {
        const ctx = elements.eraserCanvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, elements.eraserCanvas.width, elements.eraserCanvas.height);
    }

    if (elements.mangaCanvasContainer) elements.mangaCanvasContainer.classList.add('hidden');
    if (elements.workspaceSplitWrapper) elements.workspaceSplitWrapper.classList.add('hidden');
    if (elements.workspaceEmptyState) elements.workspaceEmptyState.classList.remove('hidden');

    if (elements.btnActiveTranslate) elements.btnActiveTranslate.disabled = true;
    if (elements.btnAiErasePage) elements.btnAiErasePage.disabled = true;
    if (elements.btnExportPage) elements.btnExportPage.disabled = true;
    if (elements.btnEraserMode) elements.btnEraserMode.disabled = true;

    const btnBatchTranslate = document.getElementById('btn-batch-translate') as HTMLButtonElement | null;
    const btnBatchExport = document.getElementById('btn-batch-export') as HTMLButtonElement | null;
    if (btnBatchTranslate) btnBatchTranslate.disabled = true;
    if (btnBatchExport) btnBatchExport.disabled = true;

    updatePageListUI();
    updateActiveBlockEditor();

    showToast('Đã xóa toàn bộ dự án. Sẵn sàng tạo dự án mới!', 'success');
}

export async function openFindReplaceModal(): Promise<void> {
    const modal = await ensureModalElement('find-replace-modal');
    if (modal) {
        modal.classList.remove('hidden');
        const findInput = document.getElementById('find-input');
        if (findInput) setTimeout(() => findInput.focus(), 50);
    }
}

export function closeFindReplaceModal(): void {
    const modal = document.getElementById('find-replace-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

export function executeFindReplaceAll(): void {
    const findText = (document.getElementById('find-input') as HTMLInputElement)?.value || '';
    const replaceText = (document.getElementById('replace-input') as HTMLInputElement)?.value || '';
    const matchCase = (document.getElementById('match-case-chk') as HTMLInputElement)?.checked || false;
    const badge = document.getElementById('find-replace-result-badge');

    if (!findText) {
        showToast("Vui lòng nhập từ hoặc cụm từ cần tìm kiếm.", "warn");
        return;
    }

    pushStateToHistory();

    let count = 0;
    const flags = matchCase ? 'g' : 'gi';
    const escapedFindText = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedFindText, flags);

    globalState.pages.forEach(page => {
        let pageChanged = false;
        if (page.blocks) {
            page.blocks.forEach(block => {
                if (block.translated) {
                    const newText = block.translated.replace(regex, replaceText);
                    if (newText !== block.translated) {
                        block.translated = newText;
                        block.autoFitCache = null;
                        count++;
                        pageChanged = true;
                    }
                }
            });
        }
        if (pageChanged) {
            savePageToDB(page);
        }
    });

    if (badge) {
        badge.innerText = `Đã sửa ${count} từ`;
        badge.classList.remove('hidden');
    }

    renderOverlays();
    updateActiveBlockEditor();
    showToast(`⚡ Đã tìm và thay thế thành công ${count} vị trí trên tất cả các trang!`, "success");
    closeFindReplaceModal();
}

export { runBatchExport as exportAllPagesZip };
