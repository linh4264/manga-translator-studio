// Google Drive Cloud Sync & Team Collaboration Module
import { globalState, pushStateToHistory, savePageToDB, saveProjectMeta, getPageDataURL } from '../core/state.js';
import { showToast, escapeHTML, getCleanFileBaseName } from '../core/utils.js';
import { dataURLtoBlob } from './io.js';
import { updatePageListUI, selectPage, updateSourceLanguage, updateTargetLanguage, updatePronounMatrix, updateGlossary, togglePreserveNames } from '../ui/index.js';

let gdriveAccessToken = localStorage.getItem('gdrive_access_token') || '';

export function setGDriveAccessToken(token) {
    gdriveAccessToken = (token || '').trim();
    if (gdriveAccessToken) {
        localStorage.setItem('gdrive_access_token', gdriveAccessToken);
    } else {
        localStorage.removeItem('gdrive_access_token');
    }
}

export function getGDriveAccessToken() {
    const input = document.getElementById('gdrive-token-input');
    const inputVal = input ? input.value.trim() : '';
    if (inputVal) {
        gdriveAccessToken = inputVal;
        localStorage.setItem('gdrive_access_token', inputVal);
        return inputVal;
    }
    return gdriveAccessToken || localStorage.getItem('gdrive_access_token') || '';
}

// Generate full project backup JSON object (async: converts image blobs → base64 data URLs)
export async function getProjectBackupJSON() {
    if (globalState.pages.length === 0) return null;

    const pagesData = [];
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
        sourceLanguage: globalState.sourceLanguage,
        targetLanguage: globalState.targetLanguage,
        pronounMatrix: globalState.pronounMatrix,
        preserveNames: globalState.preserveNames,
        glossaryNames: globalState.glossaryNames,
        characterDossier: globalState.characterDossier || [],
        lorebook: globalState.lorebook || [],
        pages: pagesData
    };
}

// Parse Google Drive shared link or ID
export function parseGDriveFileId(input) {
    if (!input) return '';
    const trimmed = input.trim();

    const matchD = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{25,})/);
    if (matchD && matchD[1]) return matchD[1];

    const matchId = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
    if (matchId && matchId[1]) return matchId[1];

    const matchD2 = trimmed.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
    if (matchD2 && matchD2[1]) return matchD2[1];

    if (/^[a-zA-Z0-9_-]{25,}$/.test(trimmed) && !trimmed.includes('/')) {
        return trimmed;
    }

    return trimmed;
}



// Parse Google Drive folder link or ID
export function parseGDriveFolderId(input) {
    if (!input) return '';
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{25,}$/.test(trimmed) && !trimmed.includes('/')) {
        return trimmed;
    }
    const matchFolder = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (matchFolder && matchFolder[1]) return matchFolder[1];

    const matchId = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (matchId && matchId[1]) return matchId[1];

    return trimmed;
}

let selectedFolderId = localStorage.getItem('gdrive_selected_folder_id') || '';

export function getSelectedFolderId() {
    const select = document.getElementById('gdrive-folder-select');
    if (select) {
        return select.value;
    }
    return selectedFolderId;
}

export async function onGDriveFolderChange() {
    const select = document.getElementById('gdrive-folder-select');
    if (!select) return;

    if (select.value === '__add_custom__') {
        const input = prompt("Dán ID hoặc Đường dẫn chia sẻ Thư mục Google Drive (Ví dụ: https://drive.google.com/drive/folders/1ABC...):");
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
                        console.warn("Fetch folder name error:", e);
                    }
                }
                selectedFolderId = cleanId;
                localStorage.setItem('gdrive_selected_folder_id', selectedFolderId);

                const opt = document.createElement('option');
                opt.value = cleanId;
                opt.textContent = `📂 ${folderName} (Tùy chỉnh)`;
                opt.selected = true;
                select.insertBefore(opt, select.lastElementChild);
                showToast(`📂 Đã chọn thư mục: ${folderName}`, "success");
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
    localStorage.setItem('gdrive_selected_folder_id', selectedFolderId);
    loadGDriveProjectList();
}

// Fetch list of user folders from Google Drive
export async function loadGDriveFolders() {
    const token = getGDriveAccessToken();
    const folderSelect = document.getElementById('gdrive-folder-select');
    if (!folderSelect || !token) return;

    try {
        const q = encodeURIComponent("mimeType = 'application/vnd.google-apps.folder' and trashed = false");
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&orderBy=name&pageSize=100`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let html = '<option value="">📁 Google Drive gốc (Root)</option>';

        if (response.ok) {
            const data = await response.json();
            const folders = data.files || [];

            folders.forEach(f => {
                const isSel = f.id === selectedFolderId ? 'selected' : '';
                html += `<option value="${f.id}" ${isSel}>📂 ${escapeHTML(f.name)}</option>`;
            });
        }

        if (selectedFolderId && !html.includes(`value="${selectedFolderId}"`)) {
            html += `<option value="${selectedFolderId}" selected>📂 Thư mục tùy chỉnh (ID: ${selectedFolderId.slice(0, 8)}...)</option>`;
        }

        html += '<option value="__add_custom__">➕ Dán Link / ID Thư Mục Khác...</option>';
        folderSelect.innerHTML = html;
    } catch (err) {
        console.warn("Lỗi tải danh sách thư mục GDrive:", err);
    }
}

// Create a new folder on Google Drive
export async function createNewGDriveFolder() {
    const token = getGDriveAccessToken();
    if (!token) {
        showToast("Vui lòng kết nối Google Drive / dán Access Token trước!", "warn");
        return;
    }

    const folderName = prompt("Nhập tên thư mục mới muốn tạo trên Google Drive:", "Dự Án Manga Dịch");
    if (!folderName || !folderName.trim()) return;

    try {
        showToast("📁 Đang tạo thư mục mới trên Google Drive...", "info");
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
        localStorage.setItem('gdrive_selected_folder_id', selectedFolderId);

        showToast(`🎉 Đã tạo thư mục "${newFolder.name}" thành công!`, "success");
        await loadGDriveFolders();
        loadGDriveProjectList();
    } catch (err) {
        console.error("Lỗi tạo thư mục GDrive:", err);
        showToast(`Không thể tạo thư mục: ${err.message}`, "error");
    }
}

// Upload project to Google Drive
export async function uploadProjectToGDrive(customName = '') {
    const token = getGDriveAccessToken();
    if (!token) {
        showToast("Vui lòng nhập Access Token Google Drive trước!", "warn");
        openGDriveModal();
        return;
    }

    if (globalState.pages.length === 0) {
        showToast("Chưa có dữ liệu trang truyện nào để xuất lên Drive!", "warn");
        return;
    }

    let defaultName = `Manga_Project_${new Date().toISOString().slice(0, 10)}`;
    if (globalState.pages[0]?.name) {
        defaultName = getCleanFileBaseName(globalState.pages[0].name) + "_Drive";
    }

    let fileName = (customName || '').trim();
    if (!fileName) {
        const inputName = prompt("Nhập tên tệp dự án để lưu lên Google Drive:", defaultName);
        if (inputName === null) return; // Người dùng bấm Hủy
        fileName = inputName.trim() || defaultName;
    }

    if (!fileName.toLowerCase().endsWith('.manga')) {
        fileName += '.manga';
    }

    showToast("☁️ Đang đóng gói ảnh dự án... Vui lòng chờ.", "info");
    const backupObj = await getProjectBackupJSON();
    if (!backupObj) {
        showToast("Không thể tạo dữ liệu dự án!", "error");
        return;
    }

    try {
        showToast(`☁️ Đang tải tệp "${fileName}" lên Google Drive...`, "info");
        const jsonString = JSON.stringify(backupObj);

        const folderId = getSelectedFolderId();
        const metadata = {
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
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: form
        });

        if (!response.ok) {
            if (response.status === 401) {
                showToast("🔑 Access Token hết hạn hoặc không hợp lệ. Vui lòng bấm 'Lấy Access Token Nhanh' để lấy Token mới!", "error");
                openGDriveModal();
                return;
            }
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }

        const resData = await response.json();
        showToast(`🎉 Tải lên Google Drive thành công! (ID: ${resData.id})`, "success");
        loadGDriveProjectList();
    } catch (e) {
        console.error("GDrive Upload Error:", e);
        showToast(`Không thể tải tệp lên Drive: ${e.message}`, "error");
    }
}

// Fetch list of .manga project files from Google Drive
export async function loadGDriveProjectList() {
    const token = getGDriveAccessToken();
    const listContainer = document.getElementById('gdrive-file-list');
    if (!listContainer) return;

    if (!token) {
        listContainer.innerHTML = '<div class="text-center py-4 text-slate-500 text-xs">Vui lòng nhập Access Token bên trên để xem danh sách tệp trên Drive.</div>';
        return;
    }

    try {
        listContainer.innerHTML = '<div class="text-center py-4 text-indigo-400 text-xs"><i class="fa-solid fa-spinner animate-spin"></i> Đang tải danh sách tệp từ Drive...</div>';
        const folderId = getSelectedFolderId();
        let queryCondition = "mimeType != 'application/vnd.google-apps.folder' and name contains '.manga' and trashed = false";
        if (folderId) {
            queryCondition = `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and name contains '.manga' and trashed = false`;
        }
        const q = encodeURIComponent(queryCondition);
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime,size)&orderBy=modifiedTime desc`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                listContainer.innerHTML = '<div class="text-center py-4 text-amber-400 text-xs">🔑 Access Token đã hết hạn (chỉ có hiệu lực 1 giờ). Vui lòng dán Token mới!</div>';
                return;
            }
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const validFiles = (data.files || []).filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

        if (validFiles.length === 0) {
            listContainer.innerHTML = '<div class="text-center py-4 text-slate-500 text-xs">Không tìm thấy tệp dự án .manga nào trên Google Drive.</div>';
            return;
        }

        listContainer.innerHTML = validFiles.map(file => {
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
    } catch (e) {
        console.error("GDrive List Error:", e);
        listContainer.innerHTML = `<div class="text-center py-4 text-red-400 text-xs">Lỗi đọc Google Drive: ${escapeHTML(e.message)}</div>`;
    }
}

// Download and import project from Google Drive ID
export async function importProjectFromGDrive(fileId) {
    const cleanId = parseGDriveFileId(fileId);
    if (!cleanId) {
        showToast("Vui lòng nhập ID tệp hoặc Liên kết chia sẻ Google Drive hợp lệ!", "warn");
        return;
    }

    const token = getGDriveAccessToken();
    try {
        showToast("☁️ Đang nạp tệp dự án từ Google Drive...", "info");
        let response = null;

        // 1. Thử qua Google Drive API (với token nếu có)
        if (token) {
            try {
                const apiRes = await fetch(`https://www.googleapis.com/drive/v3/files/${cleanId}?alt=media`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (apiRes.ok) response = apiRes;
            } catch (err) {
                console.warn("GDrive API fetch with token failed:", err);
            }
        }

        // 2. Thử qua Google Drive API không có Authorization header (nếu file public)
        if (!response || !response.ok) {
            try {
                const unauthRes = await fetch(`https://www.googleapis.com/drive/v3/files/${cleanId}?alt=media`);
                if (unauthRes.ok) response = unauthRes;
            } catch (err) {
                console.warn("GDrive unauth API fetch failed:", err);
            }
        }

        // 3. Thử qua CORS Proxy (Vượt qua giới hạn CORS trình duyệt cho file công khai)
        if (!response || !response.ok) {
            try {
                const proxyRes = await fetch(`https://corsproxy.io/?https://drive.google.com/uc?export=download&id=${cleanId}`);
                if (proxyRes.ok) response = proxyRes;
            } catch (e) {
                console.warn("CORS proxy 1 failed:", e);
            }
        }

        // 4. Dự phòng 2 qua AllOrigins Proxy
        if (!response || !response.ok) {
            try {
                const proxy2Url = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${cleanId}`)}`;
                const proxy2Res = await fetch(proxy2Url);
                if (proxy2Res.ok) response = proxy2Res;
            } catch (e) {
                console.warn("CORS proxy 2 failed:", e);
            }
        }

        if (!response || !response.ok) {
            throw new Error(`Không thể nạp tệp từ Google Drive.\nVui lòng bấm "Lấy Access Token Nhanh" để dán Token mới (Google yêu cầu Token hợp lệ để tải tệp).`);
        }

        const text = await response.text();
        let data = null;
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error("Tệp nạp về không phải định dạng JSON dự án .manga chuẩn.");
        }

        if (!data || !Array.isArray(data.pages)) {
            throw new Error("Dữ liệu tệp không đúng định dạng .manga chuẩn.");
        }

        if (confirm(`Nạp dự án từ Google Drive (${data.pages.length} trang)? Thao tác này sẽ thay thế dự án hiện tại trên trình duyệt.`)) {
            pushStateToHistory();

            // Chuyển data URL → Blob cho mỗi trang
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

            closeGDriveModal();
            showToast(`🎉 Nạp dự án Google Drive thành công (${data.pages.length} trang)!`, "success");
        }
    } catch (e) {
        console.error("GDrive Import Error:", e);
        showToast(`Không thể nạp tệp từ Drive: ${e.message}`, "error");
    }
}

let tokenClient = null;
let googleClientId = localStorage.getItem('gdrive_client_id') || '';

export function initGoogleGISClient(customClientId = '') {
    const idToUse = customClientId || googleClientId || localStorage.getItem('gdrive_client_id');
    if (!idToUse) return false;

    if (window.google?.accounts?.oauth2) {
        try {
            googleClientId = idToUse;
            localStorage.setItem('gdrive_client_id', idToUse);
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: idToUse,
                scope: 'https://www.googleapis.com/auth/drive.file',
                callback: (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        setGDriveAccessToken(tokenResponse.access_token);
                        const tokenInput = document.getElementById('gdrive-token-input');
                        if (tokenInput) tokenInput.value = tokenResponse.access_token;
                        showToast("🎉 Đã tự động nhận Token từ Google (1-Click)! Đồng bộ đã sẵn sàng.", "success");
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

export function loginWithGoogleOAuth() {
    if (!googleClientId) {
        const inputId = prompt(
            "Để bật Tự Động 1-Click Đăng Nhập Google:\nNhập Google OAuth Client ID của dự án (x.apps.googleusercontent.com):\n(Để trống nếu muốn mở OAuth Playground thủ công 30s)",
            googleClientId
        );
        if (inputId && inputId.trim()) {
            googleClientId = inputId.trim();
            localStorage.setItem('gdrive_client_id', googleClientId);
        }
    }

    if (googleClientId) {
        const initialized = initGoogleGISClient(googleClientId);
        if (initialized && tokenClient) {
            tokenClient.requestAccessToken({ prompt: '' });
            return;
        }
    }

    // Fallback nếu không có Client ID riêng: mở OAuth Playground
    window.open('https://developers.google.com/oauthplayground/', '_blank');
    showToast("🌐 Đã mở OAuth Playground — chọn Drive API v3 (drive.file) để lấy Access Token!", "info");
}

export function openGDriveModal() {
    const modal = document.getElementById('gdrive-modal');
    if (modal) {
        modal.classList.remove('hidden');
        const tokenInput = document.getElementById('gdrive-token-input');
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

export function closeGDriveModal() {
    const modal = document.getElementById('gdrive-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

export function saveGDriveTokenFromUI() {
    const tokenInput = document.getElementById('gdrive-token-input');
    if (tokenInput) {
        const val = tokenInput.value.trim();
        setGDriveAccessToken(val);
        if (val) {
            showToast("🔑 Đã lưu Google Access Token thành công!", "success");
            loadGDriveFolders();
            loadGDriveProjectList();
        } else {
            showToast("Đã xóa Access Token.", "info");
        }
    }
}

// Global window bindings
window.openGDriveModal = openGDriveModal;
window.closeGDriveModal = closeGDriveModal;
window.saveGDriveTokenFromUI = saveGDriveTokenFromUI;
window.loginWithGoogleOAuth = loginWithGoogleOAuth;
window.uploadProjectToGDrive = uploadProjectToGDrive;
window.importProjectFromGDrive = importProjectFromGDrive;
window.loadGDriveProjectList = loadGDriveProjectList;
window.createNewGDriveFolder = createNewGDriveFolder;
window.onGDriveFolderChange = onGDriveFolderChange;
