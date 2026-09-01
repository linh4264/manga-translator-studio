/**
 * Manga Translator Studio - IO: PDF Exporter
 * Manages rendering manga pages and compiling them into multi-page PDF documents.
 */
import { globalState } from '../../core/state';
import { showToast, escapeHTML } from '../../core/utils';
import { renderPageToCanvas2D, commitActiveEditingState } from '../canvas/canvas-service';
import { saveEraserDrawingToPage } from '../inpainting';
import { selectPage, updateProcessingOverlay } from '../../ui/index';
import { getExportRange } from './image-exporter';

export interface PdfExportOptions {
    startIndex?: number;
    endIndex?: number;
    pageIndices?: number[];
    quality?: 'hd' | 'standard' | 'max';
    filename?: string;
}

export async function runPdfExport(options?: PdfExportOptions): Promise<void> {
    if (globalState.pages.length === 0) {
        showToast("Không có trang truyện nào để xuất PDF.", "warn");
        return;
    }

    commitActiveEditingState();
    await saveEraserDrawingToPage();

    const jsPDFClass = typeof window !== 'undefined' ? ((window as any).jspdf && (window as any).jspdf.jsPDF) || (window as any).jsPDF : undefined;
    if (!jsPDFClass) {
        showToast("Thư viện jsPDF chưa sẵn sàng. Vui lòng tải lại trang.", "error");
        return;
    }

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
        showToast("Không có trang nào được chọn để xuất PDF.", "warn");
        return;
    }

    const prevPageIndex = globalState.activePageIndex;
    const prevSelectedId = globalState.selectedBlockId;
    globalState.selectedBlockId = null;

    updateProcessingOverlay(true, "Đang khởi tạo PDF...", "Đang thiết lập trang truyện...", 5);

    const failedPdfPages: Array<{ index: number; name: string; error: string }> = [];
    let pdfPagesRendered = 0;

    try {
        let pdf: any = null;
        const totalPages = targetIndices.length;

        if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }

        for (let seq = 0; seq < targetIndices.length; seq++) {
            const i = targetIndices[seq];
            const page = globalState.pages[i];
            const currentCount = seq + 1;
            const progressVal = Math.round((currentCount / totalPages) * 90);
            updateProcessingOverlay(true, `Đang ghép PDF (${currentCount}/${totalPages})`, `Trang: ${escapeHTML(page.name)}`, progressVal);

            try {
                let img: HTMLImageElement | null = null;
                let blobUrl: string | null = null;
                const pageFile = page.originalFile || page.file;

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

                const pdfQualityMode = options?.quality || globalState.pdfQuality || 'hd';
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
                pdfPagesRendered++;
            } catch (pageErr: any) {
                console.error(`Lỗi render trang ${i + 1} vào PDF:`, pageErr);
                failedPdfPages.push({ index: i + 1, name: page.name || `page_${i + 1}`, error: pageErr?.message || 'Lỗi kết xuất' });
                showToast(`Lỗi ghép PDF trang ${i + 1} (${page.name}): ${pageErr.message}`, "warn");
            }
        }

        if (pdfPagesRendered > 0 && pdf) {
            updateProcessingOverlay(true, "Đang hoàn tất PDF...", "Đang lưu file về máy...", 98);

            const defaultPdfName = `Manga_Chapter_${Date.now()}.pdf`;
            let finalPdfName = options?.filename?.trim() || defaultPdfName;
            if (!finalPdfName.toLowerCase().endsWith('.pdf')) {
                finalPdfName += '.pdf';
            }

            pdf.save(finalPdfName);
            if (failedPdfPages.length > 0) {
                const failedStr = failedPdfPages.map(f => `Trang ${f.index}`).join(', ');
                showToast(`Đã xuất PDF thành công ${pdfPagesRendered}/${totalPages} trang! (Cảnh báo: ${failedPdfPages.length} trang bị lỗi: ${failedStr})`, "warn");
            } else {
                showToast("Đã xuất thành công toàn bộ chương truyện ra file PDF!", "success");
            }
        } else {
            const failedStr = failedPdfPages.map(f => `Trang ${f.index} (${f.error})`).join('; ');
            showToast(`Xuất PDF thất bại: 0/${totalPages} trang thành công. Chi tiết: ${failedStr}`, "error");
        }
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
