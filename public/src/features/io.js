// Input/Output Operations, ZIP Chapter Packs & Backup Restore
import {
    globalState,
    pushStateToHistory,
    savePageToDB,
    saveProjectMeta,
    deletePageFromDB,
    clearProjectDB,
    clearHistory,
    garbageCollectPageCaches,
    activatePage,
    createThumbnail,
    getPageDataURL,
    saveToeicWordsToDB
} from '../core/state.js';
import { elements } from '../core/elements.js';
import { showToast, getCleanFileBaseName, waitForNextPaint, escapeHTML, waitForImageReady } from '../core/utils.js';
import { renderPageToCanvas2D, renderOverlays, selectBlock } from './canvas/canvas-service.js';
import { restorePageEraserDrawing } from './inpainting.js';
import {
    updatePageListUI,
    selectPage,
    updateActiveBlockEditor,
    updateSplitView,
    updateSourceLanguage,
    updateTargetLanguage,
    updatePronounMatrix,
    updateGlossary,
    setViewMode,
    updateProcessingOverlay,
    togglePreserveNames
} from '../ui/index.js';

// --- SHARED EXPORT HELPERS ---

// Xác định MIME type và đuôi file tốt nhất cho xuất ảnh dựa trên file gốc
export function getPageExportMimeType(page) {
    let mimeType = 'image/png';
    let quality = undefined;
    let ext = 'png';

    if (page.originalFile && page.originalFile.type) {
        const origType = page.originalFile.type;
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

// Chuyển data URL base64 thành Blob (shared helper)
export function dataURLtoBlob(dataURL) {
    return fetch(dataURL).then(res => res.blob());
}

let exportPreviewObjectUrl = null;

// Tự động nén và co dãn hình ảnh để tránh quá tải bộ nhớ
export async function compressAndResizeImage(img, originalName) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

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

    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((resultBlob) => {
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

// Xử lý nạp ảnh đơn lẻ & ZIP manga
export function handleUploadedFiles(filesList) {
    const incomingFiles = Array.from(filesList);
    const imageFiles = incomingFiles.filter(file => file.type.startsWith('image/'));
    const skippedCount = incomingFiles.length - imageFiles.length;

    if (imageFiles.length === 0) {
        showToast("Vui lòng chọn ít nhất một tệp hình ảnh hợp lệ.", "warn");
        return;
    }

    if (skippedCount > 0) {
        showToast(`Đã bỏ qua ${skippedCount} tệp không phải hình ảnh.`, "warn");
    }

    const addedCount = imageFiles.length;
    const firstNewPageIndex = globalState.pages.length;
    let loaded = 0;
    let successCount = 0;

    const finishOne = () => {
        loaded++;
        if (loaded === addedCount) {
            updatePageListUI();
            if (successCount > 0) {
                showToast(`Đã tải và nén tối ưu thành công ${successCount} trang truyện!`, 'success');

                if (globalState.activePageIndex === -1) {
                    selectPage(firstNewPageIndex);
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
            let optimized = null;
            try {
                optimized = await compressAndResizeImage(img, file.name);
            } catch (error) {
                showToast(`Không thể nén ảnh ${file.name}: ${error.message}`, 'error');
                URL.revokeObjectURL(originalUrl);
                finishOne();
                return;
            }

            let thumbnailBlob = null;
            let thumbnailSrc = null;
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

            const newPage = {
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

// Sắp xếp trang theo thứ tự số tự nhiên
export function sortPagesByName() {
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

// Kết xuất ảnh & Tải xuống trang truyện hiện tại
export async function exportActivePage() {
    if (globalState.activePageIndex === -1) return;

    const page = globalState.pages[globalState.activePageIndex];
    updateProcessingOverlay(true, "Đang kết xuất ảnh...", "Đang xử lý từng nét vẽ ở độ phân giải gốc...", 30);

    const prevSelectedId = globalState.selectedBlockId;
    globalState.selectedBlockId = null;
    renderOverlays();
    await waitForNextPaint();

    const container = elements.mangaCanvasContainer;

    try {
        container.classList.add('exporting-mode');
        await waitForImageReady(elements.mangaBgImage, page.src);
        updateProcessingOverlay(true, "Đang xử lý xuất...", "Đang tạo bản vẽ ở độ phân giải gốc...", 60);

        await waitForNextPaint();
        await document.fonts.ready;

        const { mimeType, quality, ext } = getPageExportMimeType(page);

        let canvas;
        try {
            canvas = await renderPageToCanvas2D(page);
        } catch (c2dErr) {
            console.warn("Canvas 2D Export fallback to html2canvas:", c2dErr);
            canvas = await html2canvas(container, {
                useCORS: true,
                allowTaint: true,
                scale: 2,
                backgroundColor: null,
                logging: false,
                scrollX: 0,
                scrollY: 0
            });
        }

        const pngBlob = await new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Không thể chuyển canvas sang Blob.'));
            }, mimeType, quality);
        });
        const objectUrl = URL.createObjectURL(pngBlob);
        const exportName = `translated_${getCleanFileBaseName(page.name)}.${ext}`;

        if (exportPreviewObjectUrl) URL.revokeObjectURL(exportPreviewObjectUrl);
        exportPreviewObjectUrl = objectUrl;
        elements.exportPreviewImg.src = objectUrl;
        elements.lnkExportDirectDownload.href = objectUrl;
        elements.lnkExportDirectDownload.download = exportName;

        updateProcessingOverlay(false);
        elements.exportModal.classList.remove('hidden');

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

    } catch (err) {
        console.error("Export failure:", err);
        showToast(`Lỗi khi xuất ảnh: ${err.message}`, "error");
    } finally {
        container.classList.remove('exporting-mode');
        globalState.selectedBlockId = prevSelectedId;
        renderOverlays();
        updateProcessingOverlay(false);
    }
}

// Hộp thoại đóng xuất ảnh
export function closeExportModal() {
    elements.exportModal.classList.add('hidden');
    if (exportPreviewObjectUrl) {
        URL.revokeObjectURL(exportPreviewObjectUrl);
        exportPreviewObjectUrl = null;
    }
    elements.exportPreviewImg.src = '';
    elements.lnkExportDirectDownload.removeAttribute('href');
}

function getExportRange() {
    const chk = document.getElementById('chk-export-range');
    const numStart = document.getElementById('num-export-start');
    const numEnd = document.getElementById('num-export-end');
    
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

// Kết xuất toàn bộ chương và đóng gói ZIP
export async function runBatchExport() {
    if (globalState.pages.length === 0) return;

    const { startIndex, endIndex } = getExportRange();
    const totalToExport = endIndex - startIndex + 1;

    showToast('Đang khởi động tiến trình đóng gói trang...', 'info');
    const prevPageIndex = globalState.activePageIndex;
    const prevSelectedId = globalState.selectedBlockId;

    updateProcessingOverlay(true, "Đang khởi tạo...", "Đang thiết lập hệ thống nén dữ liệu ZIP...", 5);
    globalState.selectedBlockId = null;

    const filesToZip = [];
    let successCount = 0;

    try {
        await document.fonts.ready;
        const { autoFitAllBlocksOnPage } = globalState.autoFitEnabled 
            ? await import('./canvas/canvas-styling.js') 
            : { autoFitAllBlocksOnPage: null };

        for (let i = startIndex; i <= endIndex; i++) {
            const page = globalState.pages[i];
            const currentCount = i - startIndex + 1;
            updateProcessingOverlay(true, `Kết xuất trang ${currentCount}/${totalToExport}`, `Trang: ${page.name}`, Math.round((currentCount / totalToExport) * 90));

            try {
                const pageFile = page.originalFile || page.file;
                if (!pageFile) throw new Error("File ảnh không tồn tại.");

                // Load image offscreen
                const img = new Image();
                const blobUrl = URL.createObjectURL(pageFile);
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = () => reject(new Error("Không thể tải ảnh offscreen."));
                    img.src = blobUrl;
                });

                // Establish aligned displayWidth scale for consistent offscreen autoFit calculations
                const zoomScale = (globalState.zoom || 100) / 100;
                const displayWidth = (elements.mangaCanvasContainer?.clientWidth || 800) / zoomScale;
                page.lastDisplayWidth = displayWidth;

                if (globalState.autoFitEnabled && autoFitAllBlocksOnPage) {
                    autoFitAllBlocksOnPage(page, img);
                }

                // Render page to offscreen canvas
                const canvas = await renderPageToCanvas2D(page, img);
                URL.revokeObjectURL(blobUrl);

                const { mimeType, quality, ext } = getPageExportMimeType(page);

                const pageBlob = await new Promise((resolve, reject) => {
                    canvas.toBlob((blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error('Không thể chuyển canvas sang Blob.'));
                    }, mimeType, quality);
                });

                const finalExportName = `translated_${getCleanFileBaseName(page.name, `page_${i + 1}`)}.${ext}`;
                filesToZip.push({ name: finalExportName, blob: pageBlob });
                successCount++;
            } catch (err) {
                console.error(`Lỗi kết xuất tại trang ${i + 1}:`, err);
                showToast(`Lỗi kết xuất trang ${i + 1}: ${err.message}`, "error");
            }
        }

        if (successCount > 0) {
            updateProcessingOverlay(true, "Đang nén dữ liệu...", "Đang tạo file .zip tải về...", 95);
            
            let zipBlob;
            const JSZipClass = window.JSZip || (typeof JSZip !== 'undefined' ? JSZip : null);

            if (JSZipClass) {
                const zip = new JSZipClass();
                filesToZip.forEach(f => zip.file(f.name, f.blob));
                zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
            } else if (typeof Worker !== 'undefined') {
                zipBlob = await new Promise((resolve, reject) => {
                    const worker = new Worker('/src/workers/zip-worker.js');
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
                        options: { compression: 'STORE' },
                        jszipUrl: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
                    });
                });
            } else {
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
    } catch (err) {
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

// Ghép PDF toàn bộ manga HD
export async function runPdfExport() {
    if (globalState.pages.length === 0) {
        showToast("Không có trang truyện nào để xuất PDF.", "warn");
        return;
    }

    const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFClass) {
        showToast("Thư viện jsPDF chưa sẵn sàng. Vui lòng tải lại trang.", "error");
        return;
    }

    const prevPageIndex = globalState.activePageIndex;
    const prevSelectedId = globalState.selectedBlockId;
    globalState.selectedBlockId = null;

    updateProcessingOverlay(true, "Đang khởi tạo PDF...", "Đang thiết lập trang truyện...", 5);

    try {
        let pdf = null;
        const { startIndex, endIndex } = getExportRange();
        const totalPages = endIndex - startIndex + 1;

        for (let i = startIndex; i <= endIndex; i++) {
            const page = globalState.pages[i];
            const currentCount = i - startIndex + 1;
            const progressVal = Math.round((currentCount / totalPages) * 90);
            updateProcessingOverlay(true, `Đang ghép PDF (${currentCount}/${totalPages})`, `Trang: ${escapeHTML(page.name)}`, progressVal);

            selectPage(i);
            await waitForImageReady(elements.mangaBgImage, page.src);
            await restorePageEraserDrawing(page);
            renderOverlays();

            await waitForNextPaint();
            await document.fonts.ready;

            let canvas;
            try {
                canvas = await renderPageToCanvas2D(page);
            } catch (c2dErr) {
                canvas = await html2canvas(elements.mangaCanvasContainer, {
                    useCORS: true,
                    allowTaint: true,
                    scale: 1.5,
                    backgroundColor: null,
                    logging: false
                });
            }

            const imgData = canvas.toDataURL('image/jpeg', 0.90);
            const naturalW = canvas.width || 800;
            const naturalH = canvas.height || 1200;
            const orientation = naturalW > naturalH ? 'landscape' : 'portrait';

            if (!pdf) {
                pdf = new jsPDFClass({
                    orientation: orientation,
                    unit: 'px',
                    format: [naturalW, naturalH]
                });
                pdf.addImage(imgData, 'JPEG', 0, 0, naturalW, naturalH);
            } else {
                pdf.addPage([naturalW, naturalH], orientation);
                pdf.addImage(imgData, 'JPEG', 0, 0, naturalW, naturalH);
            }
        }

        updateProcessingOverlay(true, "Đang hoàn tất PDF...", "Đang lưu file về máy...", 98);
        pdf.save(`Manga_Chapter_${Date.now()}.pdf`);
        showToast("Đã xuất thành công toàn bộ chương truyện ra file PDF!", "success");
    } catch (err) {
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

// Trích xuất & kích hoạt nạp kịch bản từ máy tính (.json hoặc .txt)
export function triggerImportScript() {
    let inputEl = document.getElementById('import-script-input');
    if (!inputEl) {
        inputEl = document.createElement('input');
        inputEl.type = 'file';
        inputEl.id = 'import-script-input';
        inputEl.accept = '.json,.txt';
        inputEl.className = 'hidden';
        inputEl.onchange = (e) => importTranslationScript(e.target.files);
        document.body.appendChild(inputEl);
    }
    inputEl.click();
}

// Gợi ý phương thức quản lý kịch bản dịch thuật (Xuất / Nhập)
export function promptExportScript() {
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

// Xuất kịch bản ra tập tin TXT / JSON cho toàn bộ chương
export function exportTranslationScript(format) {
    if (globalState.pages.length === 0) {
        showToast("Không có trang truyện nào để xuất kịch bản.", "error");
        return;
    }

    let fileContent = "";
    let mimeType = "text/plain";
    let fileName = `chapter_script_${Date.now()}`;

    if (format === 'txt') {
        fileName += ".txt";
        fileContent += `==================================================\n`;
        fileContent += `  KỊCH BẢN DỊCH THUẬT MANGA - TOÀN BỘ CHƯƠNG (${globalState.pages.length} TRANG)\n`;
        fileContent += `  Thời gian xuất: ${new Date().toLocaleString()}\n`;
        fileContent += `==================================================\n\n`;

        globalState.pages.forEach((page, index) => {
            fileContent += `[TRANG ${index + 1}: ${page.name || 'Không rõ tên'}]\n`;
            fileContent += `--------------------------------------------------\n`;

            const dialogueBlocks = (page.blocks || []).filter(b => b.type === 'dialogue' || !b.type);
            const otherBlocks = (page.blocks || []).filter(b => b.type && b.type !== 'dialogue');

            fileContent += `* LỜI THOẠI (Dialogues):\n`;
            if (dialogueBlocks.length === 0) {
                fileContent += `  (Không có ô thoại nào)\n`;
            } else {
                dialogueBlocks.forEach((block, bIdx) => {
                    const speakerInfo = block.speaker ? ` [Nhân vật: ${block.speaker}]` : '';
                    fileContent += `  ${bIdx + 1}.${speakerInfo} [Gốc]: "${block.original || '(Rỗng)'}"\n`;
                    fileContent += `     [Dịch]: "${block.translated || ''}"\n\n`;
                });
            }

            if (otherBlocks.length > 0) {
                fileContent += `* DẪN CHUYỆN, SFX & KHÁC:\n`;
                otherBlocks.forEach((block, bIdx) => {
                    const typeLabel = block.type === 'narration' ? 'Dẫn truyện' : (block.type === 'sfx' ? 'SFX' : (block.type === 'image' ? 'Ảnh chèn' : 'Khác'));
                    fileContent += `  ${bIdx + 1}. [${typeLabel}] [Gốc]: "${block.original || '(Rỗng)'}"\n`;
                    if (block.type === 'image') {
                        fileContent += `     [Ảnh]: "${block.imageUrl ? 'Có dữ liệu ảnh' : 'Chưa chọn ảnh'}"\n\n`;
                    } else {
                        fileContent += `     [Dịch]: "${block.translated || ''}"\n\n`;
                    }
                });
            }
            fileContent += `\n`;
        });
    } else if (format === 'json') {
        fileName += ".json";
        mimeType = "application/json";

        const scriptData = {
            chapterName: "Manga Translation Script",
            totalPages: globalState.pages.length,
            exportedAt: new Date().toISOString(),
            pages: globalState.pages.map((page, index) => ({
                pageIndex: index,
                pageName: page.name,
                blocks: (page.blocks || []).map(b => {
                    const blockData = {
                        id: b.id,
                        type: b.type || 'dialogue',
                        original: b.original || '',
                        translated: b.translated || '',
                        speaker: b.speaker || undefined,
                        target: b.target || undefined,
                        positionPercent: {
                            x: b.box.x,
                            y: b.box.y,
                            w: b.box.w,
                            h: b.box.h
                        }
                    };
                    if (b.type === 'image') {
                        blockData.imageUrl = b.imageUrl || null;
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

// Nhập kịch bản dịch thuật JSON / TXT
export async function importTranslationScript(fileList) {
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
            let scriptData = JSON.parse(text);
            const pagesArray = Array.isArray(scriptData)
                ? scriptData
                : (scriptData && Array.isArray(scriptData.pages) ? scriptData.pages : null);

            if (!pagesArray) {
                showToast("Dữ liệu kịch bản JSON không hợp lệ (thiếu danh sách trang)!", "error");
                return;
            }

            pagesArray.forEach((scriptPage, pIdx) => {
                if (!scriptPage.blocks || !Array.isArray(scriptPage.blocks)) return;

                let targetPage = null;

                if (scriptPage.pageName) {
                    targetPage = globalState.pages.find(p => p.name === scriptPage.pageName);
                }
                if (!targetPage && scriptPage.page) {
                    targetPage = globalState.pages.find(p => p.name === scriptPage.page);
                }
                if (!targetPage && scriptPage.pageIndex !== undefined) {
                    if (scriptPage.pageIndex >= 0 && scriptPage.pageIndex < globalState.pages.length) {
                        targetPage = globalState.pages[scriptPage.pageIndex];
                    }
                }
                if (!targetPage && pIdx < globalState.pages.length) {
                    targetPage = globalState.pages[pIdx];
                }

                if (!targetPage) return;
                matchedPages++;

                scriptPage.blocks.forEach((scriptBlock, blockIdx) => {
                    let targetBlock = null;

                    if (scriptBlock.id) {
                        targetBlock = targetPage.blocks.find(b => b.id === scriptBlock.id);
                    }
                    if (!targetBlock && blockIdx < targetPage.blocks.length) {
                        targetBlock = targetPage.blocks[blockIdx];
                    }

                    if (!targetBlock) return;

                    if (scriptBlock.translated !== undefined && scriptBlock.translated !== null) {
                        targetBlock.translated = scriptBlock.translated;
                        matchedBlocks++;
                    }
                    if (scriptBlock.speaker) {
                        targetBlock.speaker = scriptBlock.speaker;
                    }
                });

                savePageToDB(targetPage);
            });
        } else if (fileName.endsWith('.txt')) {
            const pageHeaderRegex = /\[TRANG\s+(\d+)(?:\s*:\s*([^\]]+))?\]/gi;
            let match;
            let matches = [];
            while ((match = pageHeaderRegex.exec(text)) !== null) {
                matches.push({
                    index: match.index,
                    pageIndex: parseInt(match[1], 10) - 1,
                    pageName: (match[2] || '').trim(),
                    headerLength: match[0].length
                });
            }

            if (matches.length === 0) {
                showToast("Không tìm thấy cấu trúc [TRANG ...] trong file kịch bản TXT!", "error");
                return;
            }

            matches.forEach((m, idx) => {
                const startPos = m.index + m.headerLength;
                const endPos = (idx < matches.length - 1) ? matches[idx + 1].index : text.length;
                const sectionText = text.substring(startPos, endPos);

                let targetPage = null;
                if (m.pageName) {
                    targetPage = globalState.pages.find(p => p.name === m.pageName);
                }
                if (!targetPage && m.pageIndex >= 0 && m.pageIndex < globalState.pages.length) {
                    targetPage = globalState.pages[m.pageIndex];
                }

                if (!targetPage) return;
                matchedPages++;

                const blockRegex = /\[Gốc\]:\s*"([^"]*)"\s*\n\s*\[Dịch\]:\s*"([^"]*)"/gi;
                let bMatch;
                let bIdx = 0;
                while ((bMatch = blockRegex.exec(sectionText)) !== null) {
                    const translatedVal = bMatch[2];
                    if (bIdx < targetPage.blocks.length) {
                        targetPage.blocks[bIdx].translated = translatedVal;
                        matchedBlocks++;
                    }
                    bIdx++;
                }
                savePageToDB(targetPage);
            });
        }

        renderOverlays();
        updateActiveBlockEditor();

        showToast(`Đã nhập kịch bản thành công! Khớp ${matchedPages} trang, cập nhật ${matchedBlocks} ô dịch.`, "success");

    } catch (err) {
        console.error("Lỗi nhập kịch bản:", err);
        showToast(`Lỗi khi đọc/phân tích tệp kịch bản: ${err.message}`, "error");
    }

    const importScriptInput = document.getElementById('import-script-input');
    if (importScriptInput) importScriptInput.value = '';
}

// Sao lưu toàn bộ dự án .manga
export async function exportProjectBackup() {
    if (globalState.pages.length === 0) {
        showToast("Không có dự án nào để sao lưu.", "warn");
        return;
    }

    let defaultName = `Manga_Project_${new Date().toISOString().slice(0, 10)}`;
    if (globalState.pages[0]?.name) {
        defaultName = getCleanFileBaseName(globalState.pages[0].name) + "_Backup";
    }

    const inputName = prompt("Nhập tên tệp sao lưu dự án (.manga):", defaultName);
    if (inputName === null) return; // Hủy xuất file

    let fileName = inputName.trim() || defaultName;
    if (!fileName.toLowerCase().endsWith('.manga')) {
        fileName += '.manga';
    }

    try {
        showToast("Đang đóng gói file dự án (.manga)... Vui lòng chờ.", "info");

        // Lấy Data URL base64 cho mỗi trang (cả trang active và inactive)
        const pagesData = [];
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

        const backupData = {
            version: '2.0',
            exportedAt: new Date().toISOString(),
            sourceLanguage: globalState.sourceLanguage,
            targetLanguage: globalState.targetLanguage,
            pronounMatrix: globalState.pronounMatrix,
            preserveNames: globalState.preserveNames,
            glossaryNames: globalState.glossaryNames,
            characterDossier: globalState.characterDossier || [],
            lorebook: globalState.lorebook || [],
            pages: pagesData
        };

        const blob = new Blob([JSON.stringify(backupData)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Đã xuất file sao lưu dự án (${fileName}) thành công! (${pagesData.length} trang)`, "success");
    } catch (e) {
        console.error("Lỗi sao lưu dự án:", e);
        showToast("Không thể xuất file sao lưu dự án.", "error");
    }
}

// Khôi phục dự án .manga
export async function importProjectBackup(files) {
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

            // Chuyển data URL base64 → Blob cho mỗi trang
            for (const p of data.pages) {
                if (p.blocks) {
                    p.blocks.forEach(block => { delete block.maskCache; });
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

            if (data.characterDossier) globalState.characterDossier = data.characterDossier;
            if (data.lorebook) globalState.lorebook = data.lorebook;

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
    } catch (e) {
        console.error("Lỗi khôi phục dự án:", e);
        showToast(`Không thể đọc file dự án: ${e.message}`, "error");
    } finally {
        const inp = document.getElementById('import-project-input');
        if (inp) inp.value = '';
    }
}

// Giải phóng đệm Canvas & RAM Cache
export function clearMemoryCache() {
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


// Xóa toàn bộ dự án hiện tại
export async function clearCurrentProject() {
    if (globalState.pages.length === 0) {
        showToast('Không có dự án nào để xóa.', 'warn');
        return;
    }
    if (!confirm('Bạn có chắc muốn xóa toàn bộ dự án hiện tại? Tất cả trang và bản dịch sẽ bị mất!')) return;

    // Thu hồi các Object URL để giải phóng bộ nhớ RAM
    globalState.pages.forEach(page => {
        if (page?.apiSrc?.startsWith('blob:')) URL.revokeObjectURL(page.apiSrc);
        if (page?.src?.startsWith('blob:')) URL.revokeObjectURL(page.src);
        if (page?.thumbnailSrc?.startsWith('blob:')) URL.revokeObjectURL(page.thumbnailSrc);
    });

    // Xóa sạch cơ sở dữ liệu IndexedDB trước, sau đó lưu meta trống
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


    // Dọn dẹp vùng hiển thị Canvas & Overlays
    if (elements.mangaOverlaysContainer) {
        elements.mangaOverlaysContainer.innerHTML = '';
    }
    if (elements.mangaBgImage) {
        elements.mangaBgImage.removeAttribute('src');
        elements.mangaBgImage.dataset.loadedSrc = '';
    }
    if (elements.eraserCanvas) {
        const ctx = elements.eraserCanvas.getContext('2d');
        ctx.clearRect(0, 0, elements.eraserCanvas.width, elements.eraserCanvas.height);
    }

    // Ẩn vùng canvas & Hiển thị lại giao diện màn hình trống (Empty Dropzone)
    if (elements.mangaCanvasContainer) elements.mangaCanvasContainer.classList.add('hidden');
    if (elements.workspaceSplitWrapper) elements.workspaceSplitWrapper.classList.add('hidden');
    if (elements.workspaceEmptyState) elements.workspaceEmptyState.classList.remove('hidden');

    // Vô hiệu hóa các nút bấm khi chưa có trang
    if (elements.btnActiveTranslate) elements.btnActiveTranslate.disabled = true;
    if (elements.btnAiErasePage) elements.btnAiErasePage.disabled = true;
    if (elements.btnExportPage) elements.btnExportPage.disabled = true;
    if (elements.btnEraserMode) elements.btnEraserMode.disabled = true;

    const btnBatchTranslate = document.getElementById('btn-batch-translate');
    const btnBatchExport = document.getElementById('btn-batch-export');
    if (btnBatchTranslate) btnBatchTranslate.disabled = true;
    if (btnBatchExport) btnBatchExport.disabled = true;

    updatePageListUI();
    updateActiveBlockEditor();

    showToast('Đã xóa toàn bộ dự án. Sẵn sàng tạo dự án mới!', 'success');
}

// Mở modal Tìm & Thay thế
export function openFindReplaceModal() {
    const modal = document.getElementById('find-replace-modal');
    if (modal) {
        modal.classList.remove('hidden');
        const findInput = document.getElementById('find-input');
        if (findInput) setTimeout(() => findInput.focus(), 50);
    }
}

// Đóng modal Tìm & Thay thế
export function closeFindReplaceModal() {
    const modal = document.getElementById('find-replace-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Thực hiện Tìm & Thay thế trên tất cả các trang
export function executeFindReplaceAll() {
    const findText = document.getElementById('find-input')?.value || '';
    const replaceText = document.getElementById('replace-input')?.value || '';
    const matchCase = document.getElementById('match-case-chk')?.checked || false;
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
                        block.autoFitCache = null; // Clear auto-fit cache
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

// Window bindings for inline HTML onClick handlers
window.handleUploadedFiles = handleUploadedFiles;
window.sortPagesByName = sortPagesByName;
window.exportActivePage = exportActivePage;
window.closeExportModal = closeExportModal;
window.runBatchExport = runBatchExport;
window.runPdfExport = runPdfExport;
window.promptExportScript = promptExportScript;
window.exportTranslationScript = exportTranslationScript;
window.importTranslationScript = importTranslationScript;
window.triggerImportScript = triggerImportScript;
window.exportProjectBackup = exportProjectBackup;
window.importProjectBackup = importProjectBackup;
window.clearMemoryCache = clearMemoryCache;
window.clearCurrentProject = clearCurrentProject;
window.openFindReplaceModal = openFindReplaceModal;
window.closeFindReplaceModal = closeFindReplaceModal;
window.executeFindReplaceAll = executeFindReplaceAll;

