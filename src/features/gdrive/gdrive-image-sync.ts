/**
 * Manga Translator Studio - GDrive: Image & Batch Page Cloud Exporter
 * Handles rendering pages to full-resolution images and directly uploading single or batch pages to Google Drive.
 */
import { globalState } from '../../core/state';
import { showToast, getCleanFileBaseName, waitForNextPaint } from '../../core/utils';
import { updateProcessingOverlay } from '../../ui/index';
import { renderPageToCanvas2D, commitActiveEditingState } from '../canvas/canvas-service';
import { saveEraserDrawingToPage } from '../inpainting';
import { getPageExportMimeType, getExportRange } from '../io';
import { getGDriveAccessToken } from './gdrive-auth';
import { getSelectedFolderId } from './gdrive-folder';

/**
 * Core Helper: Upload a Blob (image, zip, json) to Google Drive
 */
export async function uploadBlobToGDrive(
    blob: Blob,
    fileName: string,
    folderId?: string,
    mimeTypeOverride?: string
): Promise<{ id: string; name: string; webViewLink?: string }> {
    const token = getGDriveAccessToken();
    if (!token) {
        throw new Error("Chưa kết nối Google Drive hoặc Access Token đã hết hạn.");
    }

    const mimeType = mimeTypeOverride || blob.type || 'application/octet-stream';
    const targetFolder = folderId !== undefined ? folderId : getSelectedFolderId();

    const metadata: any = {
        name: fileName,
        mimeType: mimeType
    };
    if (targetFolder) {
        metadata.parents = [targetFolder];
    }

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error("Access Token hết hạn. Vui lòng đăng nhập lại Google Drive!");
        }
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${response.status}`);
    }

    return await response.json();
}

/**
 * Feature: Upload Active Page Image directly to Google Drive
 */
export async function uploadActivePageToGDrive(options?: {
    format?: 'auto' | 'png' | 'jpg' | 'jpeg' | 'webp';
    quality?: number;
    folderId?: string;
}): Promise<void> {
    if (globalState.activePageIndex === -1 || globalState.pages.length === 0) {
        showToast("Chưa có trang truyện nào được chọn để xuất!", "warn");
        return;
    }

    const token = getGDriveAccessToken();
    if (!token) {
        showToast("Vui lòng kết nối Google Drive trước khi xuất ảnh!", "warn");
        return;
    }

    commitActiveEditingState();
    await saveEraserDrawingToPage();

    const page = globalState.pages[globalState.activePageIndex];

    // Read format and quality from UI or options
    const formatSelect = document.getElementById('gdrive-export-format') as HTMLSelectElement | null;
    const qualitySelect = document.getElementById('gdrive-export-quality') as HTMLSelectElement | null;
    let chosenFormat = options?.format || (formatSelect ? formatSelect.value : globalState.exportFormat) || 'png';
    if ((chosenFormat as string) === 'jpeg') chosenFormat = 'jpg';
    const chosenQuality = options?.quality !== undefined ? options.quality : (qualitySelect ? parseFloat(qualitySelect.value) : 0.95);

    updateProcessingOverlay(true, "Đang kết xuất ảnh...", `Đang tạo bản vẽ trang "${page.name}" (${chosenFormat.toUpperCase()})...`, 40);

    const prevSelectedId = globalState.selectedBlockId;
    globalState.selectedBlockId = null;

    try {
        await waitForNextPaint();
        if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }

        const { mimeType, quality, ext } = getPageExportMimeType(page, chosenFormat, chosenQuality);
        const canvas = await renderPageToCanvas2D(page);

        const pageBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Không thể chuyển canvas sang Blob.'));
            }, mimeType, quality);
        });

        const targetFolder = options?.folderId !== undefined ? options.folderId : getSelectedFolderId();
        const exportName = `translated_${getCleanFileBaseName(page.name)}.${ext}`;
        updateProcessingOverlay(true, "Đang tải lên Google Drive...", `Đang upload ${exportName}...`, 80);

        await uploadBlobToGDrive(pageBlob, exportName, targetFolder, mimeType);
        updateProcessingOverlay(false);

        showToast(`🎉 Đã xuất ảnh "${exportName}" (${ext.toUpperCase()}) lên Google Drive thành công!`, "success");
    } catch (err: any) {
        console.error("Lỗi xuất ảnh lên Google Drive:", err);
        updateProcessingOverlay(false);
        showToast(`Lỗi tải lên Drive: ${err.message}`, "error");
    } finally {
        globalState.selectedBlockId = prevSelectedId;
        updateProcessingOverlay(false);
    }
}

/**
 * Feature: Batch Upload all translated images to Google Drive
 */
export async function uploadBatchPagesToGDrive(options?: {
    targetIndices?: number[];
    createSubfolder?: boolean;
    folderName?: string;
    format?: 'auto' | 'png' | 'jpg' | 'jpeg' | 'webp';
    quality?: number;
    folderId?: string;
}): Promise<void> {
    if (globalState.pages.length === 0) {
        showToast("Không có trang truyện nào để xuất lên Drive.", "warn");
        return;
    }

    const token = getGDriveAccessToken();
    if (!token) {
        showToast("Vui lòng kết nối Google Drive trước khi xuất hàng loạt!", "warn");
        return;
    }

    commitActiveEditingState();
    await saveEraserDrawingToPage();

    // Determine target page indices
    let targetIndices: number[] = options?.targetIndices || [];
    if (!targetIndices || targetIndices.length === 0) {
        const { startIndex, endIndex } = getExportRange();
        for (let i = startIndex; i <= endIndex; i++) {
            if (i >= 0 && i < globalState.pages.length) targetIndices.push(i);
        }
    }

    if (targetIndices.length === 0) {
        showToast("Không có trang nào được chọn để xuất.", "warn");
        return;
    }

    // Read format and quality from UI or options
    const formatSelect = document.getElementById('gdrive-export-format') as HTMLSelectElement | null;
    const qualitySelect = document.getElementById('gdrive-export-quality') as HTMLSelectElement | null;
    let chosenFormat = options?.format || (formatSelect ? formatSelect.value : globalState.exportFormat) || 'png';
    if ((chosenFormat as string) === 'jpeg') chosenFormat = 'jpg';
    const chosenQuality = options?.quality !== undefined ? options.quality : (qualitySelect ? parseFloat(qualitySelect.value) : 0.95);

    let destinationFolderId = options?.folderId !== undefined ? options.folderId : getSelectedFolderId();

    // Check if subfolder creation is desired
    const subfolderChk = document.getElementById('gdrive-create-subfolder-chk') as HTMLInputElement | null;
    const subfolderNameInput = document.getElementById('gdrive-subfolder-name-input') as HTMLInputElement | null;
    const shouldCreateFolder = options?.createSubfolder !== undefined 
        ? options.createSubfolder 
        : (subfolderChk ? subfolderChk.checked : true);

    if (shouldCreateFolder) {
        let defaultFolderName = `Manga_Chapter_${new Date().toISOString().slice(0, 10)}`;
        if (globalState.pages[0]?.name) {
            defaultFolderName = `${getCleanFileBaseName(globalState.pages[0].name)}_Translated`;
        }
        const uiFolderName = subfolderNameInput ? subfolderNameInput.value.trim() : '';
        const customName = options?.folderName || uiFolderName || prompt("Nhập tên thư mục trên Google Drive để chứa toàn bộ ảnh dịch:", defaultFolderName);
        if (customName) {
            updateProcessingOverlay(true, "Đang tạo thư mục trên Drive...", `Thư mục: ${customName}`, 10);
            try {
                const parent = destinationFolderId;
                const meta: any = {
                    name: customName.trim(),
                    mimeType: 'application/vnd.google-apps.folder'
                };
                if (parent) meta.parents = [parent];

                const folderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(meta)
                });
                if (folderRes.ok) {
                    const folderData = await folderRes.json();
                    destinationFolderId = folderData.id;
                }
            } catch (fErr) {
                console.warn("Không thể tạo thư mục con, lưu trực tiếp vào thư mục hiện tại:", fErr);
            }
        }
    }

    const totalToExport = targetIndices.length;
    const prevSelectedId = globalState.selectedBlockId;
    globalState.selectedBlockId = null;

    let successCount = 0;
    const failedPages: string[] = [];

    try {
        if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }

        for (let seq = 0; seq < targetIndices.length; seq++) {
            const i = targetIndices[seq];
            const page = globalState.pages[i];
            const currentNum = seq + 1;
            const progress = Math.round((currentNum / totalToExport) * 90);

            updateProcessingOverlay(
                true,
                `Đang xuất lên Google Drive (${currentNum}/${totalToExport})`,
                `Trang: ${page.name} (${chosenFormat.toUpperCase()})`,
                progress
            );

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

                const { mimeType, quality, ext } = getPageExportMimeType(page, chosenFormat, chosenQuality);

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
                await uploadBlobToGDrive(pageBlob, finalExportName, destinationFolderId, mimeType);
                successCount++;
            } catch (err: any) {
                console.error(`Lỗi upload trang ${i + 1} lên Drive:`, err);
                failedPages.push(page.name || `Trang ${i + 1}`);
            }
        }

        updateProcessingOverlay(false);

        if (successCount > 0) {
            if (failedPages.length > 0) {
                showToast(`Đã tải lên Drive ${successCount}/${totalToExport} trang! (Lỗi: ${failedPages.join(', ')})`, "warn");
            } else {
                showToast(`🎉 Xuất trọn bộ ${successCount} trang ảnh (${chosenFormat.toUpperCase()}) lên Google Drive thành công!`, "success");
            }
        } else {
            showToast(`Không thể tải trang nào lên Drive. Vui lòng kiểm tra lại quyền truy cập!`, "error");
        }
    } catch (err: any) {
        console.error("Batch Drive upload error:", err);
        updateProcessingOverlay(false);
        showToast(`Lỗi xuất hàng loạt lên Drive: ${err.message}`, "error");
    } finally {
        globalState.selectedBlockId = prevSelectedId;
        updateProcessingOverlay(false);
    }
}
