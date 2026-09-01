/**
 * Manga Translator Studio - IO: File Loader, Image Compressor & Project Lifecycle Reset
 * Manages image ingestion, compression, thumbnailing, natural sorting, and project clearing.
 */
import {
    globalState,
    pushStateToHistory,
    savePageToDB,
    saveProjectMeta,
    clearProjectDB,
    clearHistory,
    garbageCollectPageCaches,
    createThumbnail,
    saveToeicWordsToDB
} from '../../core/state';
import { elements } from '../../core/elements';
import { showToast } from '../../core/utils';
import { updatePageListUI, selectPage, updateActiveBlockEditor } from '../../ui/index';
import { MangaPage } from '../../types/index';

export function getPageExportMimeType(
    page: MangaPage,
    formatOverrideParam?: string,
    qualityOverrideParam?: number
): { mimeType: string; quality?: number; ext: string } {
    const formatOverride = formatOverrideParam || globalState.exportFormat || 'auto';
    if (formatOverride === 'png') {
        return { mimeType: 'image/png', quality: undefined, ext: 'png' };
    }
    if (formatOverride === 'jpg' || formatOverride === 'jpeg') {
        return { mimeType: 'image/jpeg', quality: qualityOverrideParam !== undefined ? qualityOverrideParam : 0.95, ext: 'jpg' };
    }
    if (formatOverride === 'webp') {
        return { mimeType: 'image/webp', quality: qualityOverrideParam !== undefined ? qualityOverrideParam : 0.95, ext: 'webp' };
    }

    let mimeType = 'image/png';
    let quality: number | undefined = undefined;
    let ext = 'png';

    if (page.originalFile && (page.originalFile as any).type) {
        const origType = (page.originalFile as any).type;
        if (origType === 'image/jpeg' || origType === 'image/jpg') {
            mimeType = 'image/jpeg';
            quality = qualityOverrideParam !== undefined ? qualityOverrideParam : 0.95;
            ext = 'jpg';
        } else if (origType === 'image/webp') {
            mimeType = 'image/webp';
            quality = qualityOverrideParam !== undefined ? qualityOverrideParam : 0.95;
            ext = 'webp';
        }
    } else if (page.name) {
        const nameLower = page.name.toLowerCase();
        if (nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg')) {
            mimeType = 'image/jpeg';
            quality = qualityOverrideParam !== undefined ? qualityOverrideParam : 0.95;
            ext = 'jpg';
        } else if (nameLower.endsWith('.webp')) {
            mimeType = 'image/webp';
            quality = qualityOverrideParam !== undefined ? qualityOverrideParam : 0.95;
            ext = 'webp';
        }
    }

    return { mimeType, quality, ext };
}

export function dataURLtoBlob(dataURL: string): Promise<Blob> {
    return fetch(dataURL).then(res => res.blob());
}

export async function compressAndResizeImage(
    img: HTMLImageElement,
    originalName: string
): Promise<{ src: string; file: File; width: number; height: number }> {
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

    pushStateToHistory(true);

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
    if (elements.canvasFloatingToolbar) elements.canvasFloatingToolbar.classList.add('hidden');

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
