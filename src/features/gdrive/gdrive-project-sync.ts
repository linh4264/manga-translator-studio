/**
 * Manga Translator Studio - GDrive: Project Backup & Cloud Sync Manager (.manga)
 * Handles serializing projects to JSON, uploading full backups to Drive, listing cloud projects, and downloading/restoring projects.
 */
import { globalState, savePageToDB, saveProjectMeta, getPageDataURL, clearProjectDB } from '../../core/state';
import { showToast, escapeHTML, getCleanFileBaseName } from '../../core/utils';
import {
    updatePageListUI,
    selectPage,
    updateSourceLanguage,
    updateTargetLanguage,
    updatePronounMatrix,
    updateGlossary,
    togglePreserveNames
} from '../../ui/index';
import { getTranslationContext } from '../ai/ai-state';
import { getCharacterDossier, getLorebook, setCharacterDossier, setLorebook } from '../dossier-lorebook';
import { dataURLtoBlob } from '../io';
import { getGDriveAccessToken } from './gdrive-auth';
import { getSelectedFolderId, parseGDriveFileId } from './gdrive-folder';

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

export async function uploadProjectToGDrive(customName: string = ''): Promise<void> {
    const token = getGDriveAccessToken();
    if (!token) {
        showToast("Vui lòng kết nối Google Drive trước khi lưu dự án!", "warn");
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
            const modal = document.getElementById('gdrive-modal');
            if (modal) modal.classList.add('hidden');
            showToast(`Nạp dự án từ Google Drive thành công (${data.pages.length} trang)!`, "success");
        }
    } catch (e: any) {
        console.error("GDrive Import Error:", e);
        showToast(`Không thể nạp tệp: ${e.message}`, "error");
    }
}
