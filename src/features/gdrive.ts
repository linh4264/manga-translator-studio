// Google Drive Cloud Sync & Team Collaboration Module
import { globalState, savePageToDB, saveProjectMeta, getPageDataURL, clearProjectDB } from '../core/state';
import { showToast, escapeHTML, getCleanFileBaseName } from '../core/utils';
import { safeSetLocalStorage } from '../core/utils/storage';
import { ensureModalElement } from '../core/component-loader';
import { dataURLtoBlob } from './io';
import { updatePageListUI, selectPage, updateSourceLanguage, updateTargetLanguage, updatePronounMatrix, updateGlossary, togglePreserveNames } from '../ui/index';
import { getTranslationContext } from './ai/ai-state';
import { getCharacterDossier, getLorebook, setCharacterDossier, setLorebook } from './dossier-lorebook';

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

export async function getProjectBackupJSON(): Promise<any> {
    if (globalState.pages.length === 0) return null;
    const ctx = getTranslationContext();
    const pagesData: any[] = [];
    for (const page of globalState.pages) {
        const imgDataURL = await getPageDataURL(page);
        pagesData.push({
            id: page.id,
            name: page.name,
            status: page.status,
            src: imgDataURL,
            blocks: page.blocks ? page.blocks.map(b => ({
                id: b.id,
                type: b.type,
                imageUrl: b.imageUrl || null,
                original: b.original,
                translated: b.translated,
                box: { ...b.box },
                style: { ...b.style }
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
    const select = document.getElementById('gdrive-folder-select') as HTMLSelectElement | null;
    return select ? select.value : selectedFolderId;
}

export async function onGDriveFolderChange(): Promise<void> {
    const select = document.getElementById('gdrive-folder-select') as HTMLSelectElement | null;
    if (!select) return;

    if (select.value === '__add_custom__') {
        const input = prompt("Dán ID hoặc đường dẫn thư mục Google Drive (Ví dụ: https://drive.google.com/drive/folders/1ABC...):");
        if (input) {
            const cleanId = parseGDriveFolderId(input);
            if (cleanId) {
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
                const opt = document.createElement('option');
                opt.value = cleanId;
                opt.textContent = `📁 ${folderName} (Tùy chỉnh)`;
                opt.selected = true;
                select.insertBefore(opt, select.lastElementChild);
                showToast(`Đã chọn thư mục: ${folderName}`, "success");
                loadGDriveProjectList();
                return;
            } else {
                showToast("ID / Link thư mục không hợp lệ!", "error");
            }
        }
        select.value = selectedFolderId;
        return;
    }

    selectedFolderId = select.value;
    safeSetLocalStorage('gdrive_selected_folder_id', selectedFolderId);
    loadGDriveProjectList();
}

export async function loadGDriveFolders(): Promise<void> {
    const token = getGDriveAccessToken();
    const folderSelect = document.getElementById('gdrive-folder-select') as HTMLSelectElement | null;
    if (!folderSelect || !token) return;

    try {
        const q = encodeURIComponent("mimeType = 'application/vnd.google-apps.folder' and trashed = false");
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&orderBy=name&pageSize=100`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        folderSelect.innerHTML = '';
        const rootOpt = document.createElement('option');
        rootOpt.value = '';
        rootOpt.textContent = '📁 Google Drive gốc (Root)';
        folderSelect.appendChild(rootOpt);

        let foundSelected = !selectedFolderId;

        if (response.ok) {
            const data = await response.json();
            const folders = data.files || [];
            folders.forEach((f: any) => {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = `📁 ${f.name || ''}`;
                if (f.id === selectedFolderId) {
                    opt.selected = true;
                    foundSelected = true;
                }
                folderSelect.appendChild(opt);
            });
        }

        if (selectedFolderId && !foundSelected) {
            const customOpt = document.createElement('option');
            customOpt.value = selectedFolderId;
            customOpt.selected = true;
            customOpt.textContent = `📁 Tùy chỉnh (ID: ${selectedFolderId.slice(0, 8)}...)`;
            folderSelect.appendChild(customOpt);
        }

        const addCustomOpt = document.createElement('option');
        addCustomOpt.value = '__add_custom__';
        addCustomOpt.textContent = '+ Dán Link / ID Thư Mục Khác...';
        folderSelect.appendChild(addCustomOpt);
    } catch (err) {
        console.warn("Lỗi tải danh sách thư mục GDrive:", err);
    }
}

export async function createNewGDriveFolder(): Promise<void> {
    const token = getGDriveAccessToken();
    if (!token) {
        showToast("Vui lòng kết nối Google Drive / dán Access Token trước!", "warn");
        return;
    }
    const folderName = prompt("Nhập tên thư mục muốn tạo trên Google Drive:", "Dự Án Manga Dịch");
    if (!folderName || !folderName.trim()) return;

    try {
        showToast("Đang tạo thư mục trên Google Drive...", "info");
        const response = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: folderName.trim(),
                mimeType: 'application/vnd.google-apps.folder'
            })
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
    } catch (err: any) {
        console.error("Lỗi tạo thư mục GDrive:", err);
        showToast(`Không thể tạo thư mục: ${err.message}`, "error");
    }
}

export async function uploadProjectToGDrive(customName: string = ''): Promise<void> {
    const token = getGDriveAccessToken();
    if (!token) {
        showToast("Vui lòng nhập Access Token Google Drive trước!", "warn");
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
        listContainer.innerHTML = '<div class="text-center py-4 text-slate-500 text-xs">Vui lòng nhập Access Token bên trên để xem danh sách tệp.</div>';
        return;
    }

    try {
        listContainer.innerHTML = '<div class="text-center py-4 text-indigo-400 text-xs"><i class="fa-solid fa-spinner animate-spin"></i> Đang tải danh sách từ Drive...</div>';
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
                listContainer.innerHTML = '<div class="text-center py-4 text-amber-400 text-xs">Access Token hết hạn. Vui lòng dán Token mới!</div>';
                return;
            }
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const validFiles = (data.files || []).filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder');

        if (validFiles.length === 0) {
            listContainer.innerHTML = '<div class="text-center py-4 text-slate-500 text-xs">Không tìm thấy tệp .manga nào trong thư mục này.</div>';
            return;
        }

        listContainer.innerHTML = validFiles.map((file: any) => {
            const modDate = file.modifiedTime ? new Date(file.modifiedTime).toLocaleString('vi-VN') : 'Không rõ';
            const sizeKB = file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'N/A';
            const safeName = escapeHTML(file.name);
            return `
                <div class="flex items-center justify-between p-2.5 bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 transition-all">
                    <div class="min-w-0 flex-1 pr-2">
                        <div class="text-xs font-semibold text-slate-200 truncate flex items-center gap-1.5">
                            <i class="fa-solid fa-file-code text-indigo-400"></i> ${safeName}
                        </div>
                        <div class="text-[10px] text-slate-400">Cập nhật: ${modDate} | Dung lượng: ${sizeKB}</div>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <button onclick="importProjectFromGDrive('${file.id}')" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-lg transition-all shadow flex items-center gap-1">
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
        showToast("Vui lòng dán Access Token Google Drive trước khi nạp tệp!", "warn");
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
                showToast("Access Token hết hạn. Vui lòng lấy Token mới!", "error");
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
                        showToast("Đã đăng nhập & lấy Token từ Google!", "success");
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
    if (!googleClientId) {
        const inputId = prompt(
            "Tự động 1-Click Đăng Nhập Google:\nNhập Google OAuth Client ID của bạn (x.apps.googleusercontent.com):\n(Để trống nếu muốn mở OAuth Playground)",
            googleClientId
        );
        if (inputId && inputId.trim()) {
            googleClientId = inputId.trim();
            safeSetLocalStorage('gdrive_client_id', googleClientId);
        }
    }
    if (googleClientId) {
        const initialized = initGoogleGISClient(googleClientId);
        if (initialized && tokenClient) {
            tokenClient.requestAccessToken({ prompt: '' });
            return;
        }
    }
    window.open('https://developers.google.com/oauthplayground/', '_blank');
    showToast("Đã mở OAuth Playground. Chọn Drive API v3 (drive.file) để lấy Access Token!", "info");
}

export async function openGDriveModal(): Promise<void> {
    const modal = await ensureModalElement('gdrive-modal');
    if (modal) {
        modal.classList.remove('hidden');
        const tokenInput = document.getElementById('gdrive-token-input') as HTMLInputElement | null;
        if (tokenInput) {
            tokenInput.value = getGDriveAccessToken();
        }
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

