/**
 * Manga Translator Studio - GDrive: Folder Resolution & Navigation Manager
 * Handles URL parsing for file/folder IDs, active folder selection, custom folder links, and Google Drive folder trees.
 */
import { showToast } from '../../core/utils';
import { safeSetLocalStorage } from '../../core/utils/storage';
import { getGDriveAccessToken } from './gdrive-auth';
import { loadGDriveProjectList } from './gdrive-project-sync';

export let selectedFolderId: string = localStorage.getItem('gdrive_selected_folder_id') || '';

export function parseGDriveFileId(input: string): string {
    if (!input) return '';
    const trimmed = input.trim();
    const matchD = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{25,})/);
    if (matchD && matchD[1]) return matchD[1];
    const matchId = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
    if (matchId && matchId[1]) return matchId[1];
    const matchD2 = trimmed.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
    if (matchD2 && matchD2[1]) return matchD2[1];
    return trimmed;
}

export function parseGDriveFolderId(input: string): string {
    if (!input) return '';
    const trimmed = input.trim();
    const matchFolder = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (matchFolder && matchFolder[1]) return matchFolder[1];
    const matchId = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (matchId && matchId[1]) return matchId[1];
    return trimmed;
}

export function getSelectedFolderId(): string {
    const previewModal = document.getElementById('preview-modal');
    const previewSelect = document.getElementById('preview-gdrive-folder-select') as HTMLSelectElement | null;
    if (previewSelect && previewModal && !previewModal.classList.contains('hidden')) {
        return previewSelect.value || selectedFolderId;
    }
    const select = document.getElementById('gdrive-folder-select') as HTMLSelectElement | null;
    return select ? select.value : selectedFolderId;
}

export function openSelectedFolderOnGDrive(): void {
    const folderId = getSelectedFolderId();
    if (folderId && folderId !== '__add_custom__') {
        window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
    } else {
        window.open('https://drive.google.com/drive/my-drive', '_blank');
    }
}

/**
 * Prompt user to paste a Google Drive folder link or folder ID, resolve the folder name, and select it across UI
 */
export async function promptGDriveFolderLink(defaultInput?: string): Promise<string | null> {
    const input = prompt(
        "Dán ID hoặc đường link thư mục Google Drive (Ví dụ: https://drive.google.com/drive/folders/1ABC...):",
        defaultInput || ""
    );
    if (!input || !input.trim()) return null;

    const cleanId = parseGDriveFolderId(input);
    if (!cleanId) {
        showToast("ID hoặc đường link thư mục không hợp lệ!", "error");
        return null;
    }

    let folderName = `Thư mục (${cleanId.slice(0, 8)}...)`;
    const token = getGDriveAccessToken();
    if (token) {
        try {
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${cleanId}?fields=name`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const info = await res.json();
                if (info.name) folderName = info.name;
            }
        } catch (e) {
            console.warn("Lỗi lấy tên thư mục:", e);
        }
    }

    selectedFolderId = cleanId;
    safeSetLocalStorage('gdrive_selected_folder_id', selectedFolderId);

    const selects = [
        document.getElementById('gdrive-folder-select') as HTMLSelectElement | null,
        document.getElementById('preview-gdrive-folder-select') as HTMLSelectElement | null
    ];

    selects.forEach(select => {
        if (!select) return;
        let opt = Array.from(select.options).find(o => o.value === cleanId);
        if (!opt) {
            opt = document.createElement('option');
            opt.value = cleanId;
            opt.textContent = `📁 ${folderName} (Tùy chỉnh)`;
            const customAddOpt = select.querySelector('option[value="__add_custom__"]');
            if (customAddOpt) {
                select.insertBefore(opt, customAddOpt);
            } else {
                select.appendChild(opt);
            }
        }
        select.value = cleanId;
    });

    showToast(`Đã chọn thư mục: ${folderName}`, "success");
    loadGDriveProjectList();
    return cleanId;
}

export async function onGDriveFolderChange(eventOrSelectId?: any): Promise<void> {
    let selectEl: HTMLSelectElement | null = null;
    if (eventOrSelectId) {
        if (typeof eventOrSelectId === 'string') {
            selectEl = document.getElementById(eventOrSelectId) as HTMLSelectElement | null;
        } else if (eventOrSelectId.target && eventOrSelectId.target instanceof HTMLSelectElement) {
            selectEl = eventOrSelectId.target;
        }
    }
    if (!selectEl) {
        const previewModal = document.getElementById('preview-modal');
        if (previewModal && !previewModal.classList.contains('hidden')) {
            selectEl = document.getElementById('preview-gdrive-folder-select') as HTMLSelectElement | null;
        }
    }
    if (!selectEl) {
        selectEl = document.getElementById('gdrive-folder-select') as HTMLSelectElement | null;
    }
    if (!selectEl) return;

    if (selectEl.value === '__add_custom__') {
        const newId = await promptGDriveFolderLink();
        if (!newId) {
            selectEl.value = selectedFolderId;
        }
        return;
    }

    selectedFolderId = selectEl.value;
    safeSetLocalStorage('gdrive_selected_folder_id', selectedFolderId);

    // Sync across dropdowns
    const selects = [
        document.getElementById('gdrive-folder-select') as HTMLSelectElement | null,
        document.getElementById('preview-gdrive-folder-select') as HTMLSelectElement | null
    ];
    selects.forEach(s => {
        if (s && s !== selectEl && s.value !== selectedFolderId) {
            s.value = selectedFolderId;
        }
    });

    loadGDriveProjectList();
}

export async function loadGDriveFolders(): Promise<void> {
    const token = getGDriveAccessToken();
    const folderSelect = document.getElementById('gdrive-folder-select') as HTMLSelectElement | null;
    const previewSelect = document.getElementById('preview-gdrive-folder-select') as HTMLSelectElement | null;
    if (!token) {
        showToast("Vui lòng kết nối Google Drive trước để tải danh sách thư mục!", "warn");
        return;
    }
    if (!folderSelect && !previewSelect) return;

    try {
        const q = encodeURIComponent("mimeType = 'application/vnd.google-apps.folder' and trashed = false");
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&orderBy=name&pageSize=100`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const targetSelects = [folderSelect, previewSelect].filter((s): s is HTMLSelectElement => s !== null);

        let fetchedFolders: { id: string; name: string }[] = [];
        if (response.ok) {
            const data = await response.json();
            fetchedFolders = data.files || [];
        }

        targetSelects.forEach(select => {
            select.innerHTML = '';
            const rootOpt = document.createElement('option');
            rootOpt.value = '';
            rootOpt.textContent = '📁 Google Drive gốc (Root / My Drive)';
            select.appendChild(rootOpt);

            let foundSelected = !selectedFolderId;

            fetchedFolders.forEach((f: any) => {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = `📁 ${f.name || ''}`;
                if (f.id === selectedFolderId) {
                    opt.selected = true;
                    foundSelected = true;
                }
                select.appendChild(opt);
            });

            if (selectedFolderId && !foundSelected) {
                const customOpt = document.createElement('option');
                customOpt.value = selectedFolderId;
                customOpt.selected = true;
                customOpt.textContent = `📁 Tùy chỉnh (ID: ${selectedFolderId.slice(0, 8)}...)`;
                select.appendChild(customOpt);
            }

            const addCustomOpt = document.createElement('option');
            addCustomOpt.value = '__add_custom__';
            addCustomOpt.textContent = '+ Dán Link / ID Thư Mục Khác...';
            select.appendChild(addCustomOpt);

            select.value = selectedFolderId;
        });
        showToast("Đã làm mới danh sách thư mục Google Drive!", "info");
    } catch (err) {
        console.warn("Lỗi tải danh sách thư mục GDrive:", err);
    }
}

export async function createNewGDriveFolder(defaultNameInput: string = "Dự Án Manga Dịch"): Promise<string | null> {
    const token = getGDriveAccessToken();
    if (!token) {
        showToast("Vui lòng kết nối Google Drive / dán Access Token trước!", "warn");
        return null;
    }
    const folderName = prompt("Nhập tên thư mục muốn tạo trên Google Drive:", defaultNameInput);
    if (!folderName || !folderName.trim()) return null;

    try {
        showToast("Đang tạo thư mục trên Google Drive...", "info");
        const parentFolder = getSelectedFolderId();
        const requestBody: any = {
            name: folderName.trim(),
            mimeType: 'application/vnd.google-apps.folder'
        };
        if (parentFolder) {
            requestBody.parents = [parentFolder];
        }

        const response = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }
        const newFolder = await response.json();
        selectedFolderId = newFolder.id;
        safeSetLocalStorage('gdrive_selected_folder_id', selectedFolderId);
        showToast(`Tạo thư mục "${newFolder.name}" thành công!`, "success");
        await loadGDriveFolders();
        loadGDriveProjectList();
        return newFolder.id;
    } catch (err: any) {
        console.error("Lỗi tạo thư mục GDrive:", err);
        showToast(`Không thể tạo thư mục: ${err.message}`, "error");
        return null;
    }
}
