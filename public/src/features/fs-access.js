/**
 * Native File System Access API integration for Manga Translator Studio
 * Provides seamless direct folder reading, writing, and cross-session persistence via IndexedDB.
 */

import { globalState, saveMetaToDB, loadMetaFromDB, deleteMetaFromDB } from '../core/state.js';
import { elements } from '../core/elements.js';
import { showToast, getCleanFileBaseName } from '../core/utils.js';
import { updateProcessingOverlay } from '../ui/index.js';
import { getPageExportMimeType } from './io.js';
import { renderPageToCanvas2D } from './canvas/canvas-service.js';

export let activeDirectoryHandle = null;
export let pendingDirectoryHandle = null;

const STORAGE_KEY_DIR_HANDLE = 'active_directory_handle';

/**
 * Natural Alphanumeric Sort comparator for file names
 * (e.g. "page_1.png", "page_2.png", "page_10.png")
 */
export function naturalSortFiles(fileList) {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return [...fileList].sort((a, b) => collator.compare(a.name || '', b.name || ''));
}

/**
 * Checks whether the browser supports Native File System Access API
 */
export function isFileSystemAccessSupported() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Opens a local folder on the user's computer and loads all manga pages
 */
export async function openLocalFolderPicker() {
    if (!isFileSystemAccessSupported()) {
        const fallbackInput = document.getElementById('folder-upload-input');
        if (fallbackInput) {
            fallbackInput.click();
        } else {
            showToast("Trình duyệt không hỗ trợ File System Access API. Đang sử dụng chế độ chọn tệp thông thường.", "info");
        }
        return;
    }

    try {
        const dirHandle = await window.showDirectoryPicker({
            id: 'manga_folder_input',
            mode: 'readwrite'
        });

        if (!dirHandle) return;

        activeDirectoryHandle = dirHandle;
        pendingDirectoryHandle = null;

        // Persist directory handle across page reloads in IndexedDB
        await saveMetaToDB(STORAGE_KEY_DIR_HANDLE, dirHandle);
        updateConnectedFolderUI(dirHandle.name, true);

        updateProcessingOverlay(true, "Đang quét thư mục...", `Đang đọc các trang truyện từ: ${dirHandle.name}`, 15);

        const imageFiles = [];
        const validExtensions = /\.(png|jpe?g|webp|avif|bmp|gif)$/i;

        for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind === 'file' && validExtensions.test(name)) {
                try {
                    const file = await handle.getFile();
                    imageFiles.push(file);
                } catch (readErr) {
                    console.warn(`Không thể đọc tệp ${name}:`, readErr);
                }
            }
        }

        if (imageFiles.length === 0) {
            updateProcessingOverlay(false);
            showToast(`Thư mục "${dirHandle.name}" không chứa tệp hình ảnh hợp lệ nào.`, "warn");
            return;
        }

        const sortedFiles = naturalSortFiles(imageFiles);

        updateProcessingOverlay(true, "Đang nạp trang truyện...", `Đã tìm thấy ${sortedFiles.length} trang. Đang khởi tạo...`, 50);

        const io = await import('./io.js');
        await io.handleUploadedFiles(sortedFiles);

        updateProcessingOverlay(false);
        showToast(`📁 Đã liên kết thư mục "${dirHandle.name}" (${sortedFiles.length} trang truyện)`, "success");

    } catch (err) {
        updateProcessingOverlay(false);
        if (err.name === 'AbortError') return;
        console.error("Lỗi mở thư mục File System Access:", err);
        showToast(`Không thể mở thư mục: ${err.message}`, "error");
    }
}

/**
 * Restores stored DirectoryHandle from IndexedDB on startup
 */
export async function restoreStoredDirectoryHandle() {
    if (!isFileSystemAccessSupported()) return;

    try {
        const storedHandle = await loadMetaFromDB(STORAGE_KEY_DIR_HANDLE);
        if (!storedHandle || !storedHandle.name) return;

        pendingDirectoryHandle = storedHandle;

        // Query existing permission state without popping any prompt
        const perm = await storedHandle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
            activeDirectoryHandle = storedHandle;
            pendingDirectoryHandle = null;
            updateConnectedFolderUI(storedHandle.name, true);
            console.log(`Đã tự động khôi phục liên kết thư mục ổ cứng: ${storedHandle.name}`);
        } else {
            // Permission needs user gesture re-authorization
            activeDirectoryHandle = null;
            updateConnectedFolderUI(storedHandle.name, false);
        }
    } catch (err) {
        console.warn("Không thể khôi phục DirectoryHandle từ IndexedDB:", err);
    }
}

/**
 * Re-authorizes permission for stored DirectoryHandle with 1 user click
 */
export async function reconnectDirectoryHandle() {
    const handleToAuth = pendingDirectoryHandle || activeDirectoryHandle;
    if (!handleToAuth) {
        return openLocalFolderPicker();
    }

    try {
        const perm = await handleToAuth.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
            activeDirectoryHandle = handleToAuth;
            pendingDirectoryHandle = null;
            await saveMetaToDB(STORAGE_KEY_DIR_HANDLE, activeDirectoryHandle);
            updateConnectedFolderUI(activeDirectoryHandle.name, true);
            showToast(`⚡ Đã kích hoạt liên kết thư mục "${activeDirectoryHandle.name}"!`, "success");
        } else {
            showToast("Chưa được cấp quyền truy cập thư mục.", "warn");
        }
    } catch (err) {
        console.error("Lỗi cấp quyền lại DirectoryHandle:", err);
        openLocalFolderPicker();
    }
}

/**
 * Unlinks the connected directory handle
 */
export async function unlinkConnectedFolder() {
    activeDirectoryHandle = null;
    pendingDirectoryHandle = null;
    await deleteMetaFromDB(STORAGE_KEY_DIR_HANDLE);
    updateConnectedFolderUI(null, false);
    showToast("Đã ngắt liên kết thư mục ổ cứng.", "info");
}

/**
 * Updates UI badge indicating the active or pending connected folder
 */
export function updateConnectedFolderUI(folderName, isConnected = true) {
    const badge = document.getElementById('connected-folder-badge');
    const label = document.getElementById('connected-folder-name');
    const actionBtnContainer = document.getElementById('connected-folder-action-container');

    if (!badge || !label) return;

    if (folderName) {
        label.textContent = folderName;
        badge.classList.remove('hidden');

        if (actionBtnContainer) {
            if (isConnected) {
                actionBtnContainer.innerHTML = `
                    <button onclick="exportPagesDirectlyToDisk()" class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/25 hover:bg-amber-500/40 text-amber-300 cursor-pointer transition-colors flex items-center gap-1 shadow-sm" title="Lưu nhanh toàn bộ vào thư mục /translated/">
                        <i class="fa-solid fa-bolt text-amber-400"></i> Xuất đĩa
                    </button>
                `;
            } else {
                actionBtnContainer.innerHTML = `
                    <button onclick="reconnectDirectoryHandle()" class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 cursor-pointer transition-all animate-pulse flex items-center gap-1 shadow-sm" title="Bấm để cấp lại quyền truy cập thư mục">
                        <i class="fa-solid fa-rotate text-emerald-400"></i> Kích hoạt lại
                    </button>
                `;
            }
        }
    } else {
        badge.classList.add('hidden');
    }
}

/**
 * Directly writes all rendered translated pages into a local folder without browser download popups
 */
export async function exportPagesDirectlyToDisk() {
    if (!globalState.pages || globalState.pages.length === 0) {
        showToast("Chưa có trang truyện nào để xuất.", "warn");
        return;
    }

    let targetDirHandle = activeDirectoryHandle;

    if (!targetDirHandle && pendingDirectoryHandle) {
        await reconnectDirectoryHandle();
        targetDirHandle = activeDirectoryHandle;
    }

    if (!targetDirHandle || !isFileSystemAccessSupported()) {
        if (isFileSystemAccessSupported()) {
            try {
                targetDirHandle = await window.showDirectoryPicker({
                    id: 'manga_folder_output',
                    mode: 'readwrite'
                });
                activeDirectoryHandle = targetDirHandle;
                pendingDirectoryHandle = null;
                await saveMetaToDB(STORAGE_KEY_DIR_HANDLE, targetDirHandle);
                updateConnectedFolderUI(targetDirHandle.name, true);
            } catch (err) {
                if (err.name === 'AbortError') return;
                console.error("Lỗi chọn thư mục xuất:", err);
                showToast("Không thể chọn thư mục lưu.", "error");
                return;
            }
        } else {
            showToast("Trình duyệt không hỗ trợ ghi trực tiếp ổ cứng. Đang chuyển sang chế độ tải về ZIP.", "info");
            const io = await import('./io.js');
            return io.exportAllPagesZip();
        }
    }

    try {
        const outDirHandle = await targetDirHandle.getDirectoryHandle('translated', { create: true });

        const total = globalState.pages.length;
        updateProcessingOverlay(true, "Đang ghi trực tiếp vào ổ cứng...", `Khởi tạo thư mục /translated (${total} trang)...`, 0);

        let successCount = 0;

        for (let i = 0; i < total; i++) {
            const page = globalState.pages[i];
            const pct = Math.round(((i + 1) / total) * 100);
            updateProcessingOverlay(true, `Đang lưu trang ${i + 1}/${total}...`, `${page.name} → /translated/`, pct);

            const { mimeType, quality, ext } = getPageExportMimeType(page);
            const canvas = await renderPageToCanvas2D(page);

            const blob = await new Promise((resolve, reject) => {
                canvas.toBlob((b) => {
                    if (b) resolve(b);
                    else reject(new Error('Không thể tạo blob từ canvas'));
                }, mimeType, quality);
            });

            const fileName = `translated_${getCleanFileBaseName(page.name)}.${ext}`;

            const fileHandle = await outDirHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();

            successCount++;
        }

        updateProcessingOverlay(false);
        showToast(`⚡ Đã ghi thành công ${successCount}/${total} trang thẳng vào thư mục "${targetDirHandle.name}/translated/"!`, "success");

    } catch (err) {
        updateProcessingOverlay(false);
        console.error("Lỗi ghi trực tiếp vào ổ cứng:", err);
        showToast(`Lỗi khi ghi tệp: ${err.message}`, "error");
    }
}

/**
 * Saves project .manga backup directly into the connected folder
 */
export async function saveProjectDirectlyToDisk() {
    let targetHandle = activeDirectoryHandle;
    if (!targetHandle && pendingDirectoryHandle) {
        await reconnectDirectoryHandle();
        targetHandle = activeDirectoryHandle;
    }

    if (!targetHandle || !isFileSystemAccessSupported()) {
        showToast("Vui lòng mở thư mục ổ cứng trước khi lưu dự án trực tiếp.", "warn");
        return;
    }

    try {
        updateProcessingOverlay(true, "Đang lưu dự án...", `Ghi project.manga vào: ${targetHandle.name}`, 50);

        const io = await import('./io.js');
        const backupData = await io.buildProjectBackupJSON();

        const fileHandle = await targetHandle.getFileHandle('project.manga', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(backupData, null, 2));
        await writable.close();

        updateProcessingOverlay(false);
        showToast(`💾 Đã lưu file dự án "project.manga" thẳng vào thư mục "${targetHandle.name}"!`, "success");
    } catch (err) {
        updateProcessingOverlay(false);
        console.error("Lỗi lưu dự án trực tiếp:", err);
        showToast(`Không thể lưu dự án: ${err.message}`, "error");
    }
}
