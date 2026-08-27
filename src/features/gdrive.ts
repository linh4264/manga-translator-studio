// Google Drive Cloud Sync, Direct Image Export & Team Collaboration Module
import { globalState, savePageToDB, saveProjectMeta, getPageDataURL, clearProjectDB } from '../core/state';
import { showToast, escapeHTML, getCleanFileBaseName, waitForNextPaint, waitForImageReady } from '../core/utils';
import { safeSetLocalStorage } from '../core/utils/storage';
import { ensureModalElement } from '../core/component-loader';
import { dataURLtoBlob, getPageExportMimeType, getExportRange } from './io';
import {
    updatePageListUI,
    selectPage,
    updateSourceLanguage,
    updateTargetLanguage,
    updatePronounMatrix,
    updateGlossary,
    togglePreserveNames,
    updateProcessingOverlay
} from '../ui/index';
import { renderPageToCanvas2D, commitActiveEditingState } from './canvas/canvas-service';
import { saveEraserDrawingToPage } from './inpainting';
import { getTranslationContext } from './ai/ai-state';
import { getCharacterDossier, getLorebook, setCharacterDossier, setLorebook } from './dossier-lorebook';
import { elements } from '../core/elements';

let gdriveAccessToken: string = localStorage.getItem('gdrive_access_token') || '';
let selectedFolderId: string = localStorage.getItem('gdrive_selected_folder_id') || '';
let tokenClient: any = null;
let googleClientId: string = localStorage.getItem('gdrive_client_id') || '';

export function setGDriveAccessToken(token: string): void {
    gdriveAccessToken = (token || '').trim();
    if (gdriveAccessToken) {
        safeSetLocalStorage('gdrive_access_token', gdriveAccessToken);
    } else {
        localStorage.removeItem('gdrive_access_token');
    }
    syncGDriveAuthStatusUI();
}

export function getGDriveAccessToken(): string {
    const input = document.getElementById('gdrive-token-input') as HTMLInputElement | null;
    const inputVal = input ? input.value.trim() : '';
    if (inputVal) {
        gdriveAccessToken = inputVal;
        safeSetLocalStorage('gdrive_access_token', inputVal);
        return inputVal;
    }
    return gdriveAccessToken || localStorage.getItem('gdrive_access_token') || '';
}

export function getGDriveClientId(): string {
    const input = document.getElementById('gdrive-client-id-input') as HTMLInputElement | null;
    const inputVal = input ? input.value.trim() : '';
    if (inputVal) {
        googleClientId = inputVal;
        safeSetLocalStorage('gdrive_client_id', inputVal);
        return inputVal;
    }
    return googleClientId || localStorage.getItem('gdrive_client_id') || '';
}

export function saveGDriveClientIdFromUI(): void {
    const input = document.getElementById('gdrive-client-id-input') as HTMLInputElement | null;
    if (input) {
        const val = input.value.trim();
        googleClientId = val;
        if (val) {
            safeSetLocalStorage('gdrive_client_id', val);
            initGoogleGISClient(val);
            showToast("Đã lưu Google Client ID thành công!", "success");
        } else {
            localStorage.removeItem('gdrive_client_id');
            showToast("Đã xóa Google Client ID.", "info");
        }
        syncGDriveAuthStatusUI();
    }
}

export function logoutGDrive(): void {
    setGDriveAccessToken('');
    const tokenInput = document.getElementById('gdrive-token-input') as HTMLInputElement | null;
    if (tokenInput) tokenInput.value = '';
    showToast("Đã đăng xuất Google Drive.", "info");
    syncGDriveAuthStatusUI();
}

export function syncGDriveAuthStatusUI(): void {
    const token = getGDriveAccessToken();
    const statusBadge = document.getElementById('gdrive-auth-status-badge');
    const btnLogout = document.getElementById('btn-gdrive-logout');
    const clientIdInput = document.getElementById('gdrive-client-id-input') as HTMLInputElement | null;
    const tokenInput = document.getElementById('gdrive-token-input') as HTMLInputElement | null;

    if (clientIdInput && !clientIdInput.value) {
        clientIdInput.value = googleClientId || localStorage.getItem('gdrive_client_id') || '';
    }
    if (tokenInput && !tokenInput.value) {
        tokenInput.value = token;
    }

    if (statusBadge) {
        if (token) {
            statusBadge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold";
            statusBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Đã kết nối Google Drive';
        } else {
            statusBadge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-400 text-[11px] font-semibold";
            statusBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-500"></span> Chưa kết nối';
        }
    }

    if (btnLogout) {
        if (token) btnLogout.classList.remove('hidden');
        else btnLogout.classList.add('hidden');
    }
}

export async function getProjectBackupJSON(): Promise<any> {
    if (globalState.pages.length === 0) return null;
    const ctx = getTranslationContext();
    const pagesData: any[] = [];
    for (const page of globalState.pages) {
        const imgDataURL = await getPageDataURL(page);
        let eraserLayerDataURL: string | null = null;
        if (page.eraserLayerBlob) {
            try {
                eraserLayerDataURL = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
                    reader.onerror = () => resolve('');
                    reader.readAsDataURL(page.eraserLayerBlob as Blob);
                });
            } catch {
                eraserLayerDataURL = null;
            }
        }
        pagesData.push({
            id: page.id,
            name: page.name,
            status: page.status,
            width: page.width,
            height: page.height,
            apiWidth: page.apiWidth,
            apiHeight: page.apiHeight,
            src: imgDataURL,
            eraserLayerSrc: eraserLayerDataURL,
            blocks: page.blocks ? page.blocks.map(b => ({
                id: b.id,
                type: b.type,
                imageUrl: b.imageUrl || null,
                original: b.original,
                translated: b.translated,
                box: { ...b.box },
                style: { ...b.style },
                speaker: b.speaker !== undefined ? b.speaker : undefined,
                target: (b as any).target !== undefined ? (b as any).target : undefined,
                vertical: b.vertical !== undefined ? b.vertical : undefined,
                textAnchor: b.textAnchor ? { ...b.textAnchor } : undefined,
                positionKnown: b.positionKnown
            })) : []
        });
    }
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
        openGDriveModal();
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
        openGDriveModal();
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

        const result = await uploadBlobToGDrive(pageBlob, exportName, targetFolder, mimeType);
        updateProcessingOverlay(false);

        showToast(`🎉 Đã xuất ảnh "${exportName}" (${ext.toUpperCase()}) lên Google Drive thành công!`, "success");
    } catch (err: any) {
        console.error("Lỗi xuất ảnh lên Google Drive:", err);
        updateProcessingOverlay(false);
        showToast(`Lỗi tải lên Drive: ${err.message}`, "error");
        if (err.message && err.message.includes('Token')) {
            openGDriveModal();
        }
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
        openGDriveModal();
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

/**
 * Feature: Export full project .manga to Google Drive
 */
export async function uploadProjectToGDrive(customName: string = ''): Promise<void> {
    const token = getGDriveAccessToken();
    if (!token) {
        showToast("Vui lòng kết nối Google Drive trước khi lưu dự án!", "warn");
        openGDriveModal();
        return;
    }
    if (globalState.pages.length === 0) {
        showToast("Chưa có trang truyện nào để tải lên Drive!", "warn");
        return;
    }

    let defaultName = `Manga_Project_${new Date().toISOString().slice(0, 10)}`;
    if (globalState.pages[0]?.name) {
        defaultName = getCleanFileBaseName(globalState.pages[0].name) + "_Drive";
    }

    let fileName = (customName || '').trim() || defaultName;
    if (!fileName.toLowerCase().endsWith('.manga')) {
        fileName += '.manga';
    }

    showToast("Đang đóng gói dữ liệu... Vui lòng chờ.", "info");
    const backupObj = await getProjectBackupJSON();
    if (!backupObj) {
        showToast("Không thể tạo dữ liệu dự án!", "error");
        return;
    }

    try {
        showToast(`Đang tải tệp "${fileName}" lên Google Drive...`, "info");
        const jsonString = JSON.stringify(backupObj);
        const folderId = getSelectedFolderId();
        const metadata: any = {
            name: fileName,
            mimeType: 'application/json',
            description: 'Manga Translator Studio Project File'
        };
        if (folderId) {
            metadata.parents = [folderId];
        }

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([jsonString], { type: 'application/json' }));

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });

        if (!response.ok) {
            if (response.status === 401) {
                showToast("Access Token hết hạn hoặc không hợp lệ. Vui lòng lấy Token mới!", "error");
                openGDriveModal();
                return;
            }
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }
        const resData = await response.json();
        showToast(`Lưu lên Google Drive thành công! (ID: ${resData.id})`, "success");
        loadGDriveProjectList();
    } catch (e: any) {
        console.error("GDrive Upload Error:", e);
        showToast(`Không thể tải lên Drive: ${e.message}`, "error");
    }
}

export async function loadGDriveProjectList(): Promise<void> {
    const token = getGDriveAccessToken();
    const listContainer = document.getElementById('gdrive-file-list');
    if (!listContainer) return;

    if (!token) {
        listContainer.innerHTML = '<div class="text-center py-4 text-slate-500 text-xs">Vui lòng kết nối Google Drive để xem danh sách tệp dự án.</div>';
        return;
    }

    try {
        listContainer.innerHTML = '<div class="text-center py-4 text-sky-400 text-xs"><i class="fa-solid fa-spinner animate-spin"></i> Đang tải danh sách từ Drive...</div>';
        const folderId = getSelectedFolderId();
        let queryCondition = "mimeType != 'application/vnd.google-apps.folder' and name contains '.manga' and trashed = false";
        if (folderId) {
            queryCondition = `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and name contains '.manga' and trashed = false`;
        }
        const q = encodeURIComponent(queryCondition);
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime,size)&orderBy=modifiedTime desc`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status === 401) {
                listContainer.innerHTML = '<div class="text-center py-4 text-amber-400 text-xs">Access Token hết hạn. Vui lòng đăng nhập lại Google!</div>';
                return;
            }
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const validFiles = (data.files || []).filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder');

        if (validFiles.length === 0) {
            listContainer.innerHTML = '<div class="text-center py-4 text-slate-500 text-xs">Không tìm thấy tệp dự án .manga nào trong thư mục này.</div>';
            return;
        }

        listContainer.innerHTML = validFiles.map((file: any) => {
            const modDate = file.modifiedTime ? new Date(file.modifiedTime).toLocaleString('vi-VN') : 'Không rõ';
            const sizeKB = file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'N/A';
            const safeName = escapeHTML(file.name);
            return `
                <div class="flex items-center justify-between p-2.5 bg-slate-950 hover:bg-slate-900 rounded-xl border border-slate-800 transition-all">
                    <div class="min-w-0 flex-1 pr-2">
                        <div class="text-xs font-semibold text-slate-200 truncate flex items-center gap-1.5">
                            <i class="fa-solid fa-file-code text-sky-400"></i> ${safeName}
                        </div>
                        <div class="text-[10px] text-slate-400">Cập nhật: ${modDate} | Dung lượng: ${sizeKB}</div>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <button onclick="importProjectFromGDrive('${file.id}')" class="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold rounded-lg transition-all shadow flex items-center gap-1">
                            <i class="fa-solid fa-download"></i> Nạp
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e: any) {
        console.error("GDrive List Error:", e);
        listContainer.innerHTML = '';
        const errDiv = document.createElement('div');
        errDiv.className = "text-center py-4 text-red-400 text-xs";
        errDiv.textContent = `Lỗi Google Drive: ${e?.message || String(e)}`;
        listContainer.appendChild(errDiv);
    }
}

export async function importProjectFromGDrive(fileId: string): Promise<void> {
    const cleanId = parseGDriveFileId(fileId);
    if (!cleanId) {
        showToast("Vui lòng nhập ID tệp hoặc Link chia sẻ Google Drive hợp lệ!", "warn");
        return;
    }
    const token = getGDriveAccessToken();
    if (!token) {
        showToast("Vui lòng kết nối Google Drive trước khi nạp tệp!", "warn");
        openGDriveModal();
        return;
    }

    try {
        showToast("Đang nạp dữ liệu từ Google Drive...", "info");
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${cleanId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status === 401) {
                showToast("Access Token hết hạn. Vui lòng đăng nhập lại!", "error");
                openGDriveModal();
                return;
            }
            throw new Error(`Không thể nạp tệp từ Google Drive (HTTP ${response.status}). Đảm bảo tệp thuộc về bạn hoặc đã được chia sẻ quyền.`);
        }

        const text = await response.text();
        let data: any = null;
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error("Tệp không đúng định dạng JSON/ .manga chuẩn.");
        }

        if (!data || !Array.isArray(data.pages)) {
            throw new Error("Dữ liệu dự án không đúng định dạng .manga chuẩn.");
        }

        if (confirm(`Nạp dự án từ Google Drive (${data.pages.length} trang)? Thao tác này sẽ thay thế dự án hiện tại.`)) {
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
                        console.warn("Không thể chuyển data URL cho trang:", p.name, err);
                    }
                }
                if (p.eraserLayerSrc && p.eraserLayerSrc.startsWith('data:')) {
                    try {
                        const eraserBlob = await dataURLtoBlob(p.eraserLayerSrc);
                        p.eraserLayerBlob = eraserBlob;
                    } catch (err) {
                        console.warn("Không thể chuyển eraserLayerSrc sang Blob cho trang:", p.name, err);
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
            closeGDriveModal();
            showToast(`Nạp dự án từ Google Drive thành công (${data.pages.length} trang)!`, "success");
        }
    } catch (e: any) {
        console.error("GDrive Import Error:", e);
        showToast(`Không thể nạp tệp: ${e.message}`, "error");
    }
}

export function initGoogleGISClient(customClientId: string = ''): boolean {
    const idToUse = customClientId || googleClientId || localStorage.getItem('gdrive_client_id') || '';
    if (!idToUse) return false;
    if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
        try {
            googleClientId = idToUse;
            safeSetLocalStorage('gdrive_client_id', idToUse);
            tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: idToUse,
                scope: 'https://www.googleapis.com/auth/drive.file',
                callback: (tokenResponse: any) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        setGDriveAccessToken(tokenResponse.access_token);
                        const tokenInput = document.getElementById('gdrive-token-input') as HTMLInputElement | null;
                        if (tokenInput) tokenInput.value = tokenResponse.access_token;
                        showToast("Đã kết nối Google Drive thành công!", "success");
                        loadGDriveFolders();
                        loadGDriveProjectList();
                    } else if (tokenResponse.error) {
                        showToast(`Lỗi đăng nhập Google: ${tokenResponse.error}`, "error");
                    }
                }
            });
            return true;
        } catch (e) {
            console.warn("GIS Client init error:", e);
        }
    }
    return false;
}

export function loginWithGoogleOAuth(): void {
    const clientId = getGDriveClientId();
    if (clientId) {
        const initialized = initGoogleGISClient(clientId);
        if (initialized && tokenClient) {
            tokenClient.requestAccessToken({ prompt: '' });
            return;
        }
    }

    const inputId = prompt(
        "Tự động Đăng nhập 1-Click:\nNhập Google OAuth Client ID của bạn (dạng: xxx.apps.googleusercontent.com):\n(Bấm Cancel nếu muốn mở trang tạo Client ID)",
        googleClientId
    );
    if (inputId && inputId.trim()) {
        googleClientId = inputId.trim();
        safeSetLocalStorage('gdrive_client_id', googleClientId);
        const initialized = initGoogleGISClient(googleClientId);
        if (initialized && tokenClient) {
            tokenClient.requestAccessToken({ prompt: '' });
            return;
        }
    }

    window.open('https://console.cloud.google.com/apis/credentials?hl=vi', '_blank');
    showToast("Đã mở Google Cloud Console. Hãy tạo OAuth Client ID và dán vào ô bên trên!", "info");
}

export async function openGDriveModal(): Promise<void> {
    const modal = await ensureModalElement('gdrive-modal');
    if (modal) {
        modal.classList.remove('hidden');
        syncGDriveAuthStatusUI();
        if (googleClientId && !tokenClient) {
            initGoogleGISClient(googleClientId);
        }
        loadGDriveFolders();
        loadGDriveProjectList();
    }
}

export function closeGDriveModal(): void {
    const modal = document.getElementById('gdrive-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

export function saveGDriveTokenFromUI(): void {
    const tokenInput = document.getElementById('gdrive-token-input') as HTMLInputElement | null;
    if (tokenInput) {
        const val = tokenInput.value.trim();
        setGDriveAccessToken(val);
        if (val) {
            showToast("Lưu Google Access Token thành công!", "success");
            loadGDriveFolders();
            loadGDriveProjectList();
        } else {
            showToast("Đã xóa Access Token.", "info");
        }
    }
}
