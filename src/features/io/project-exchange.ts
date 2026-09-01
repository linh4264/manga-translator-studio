/**
 * Manga Translator Studio - IO: Project Exchange & Full Backup / Restore (.manga / .json)
 * Manages comprehensive serialization and deserialization of pages, layers, lorebooks, and translation settings.
 */
import {
    globalState,
    savePageToDB,
    saveProjectMeta,
    clearProjectDB,
    getPageDataURL
} from '../../core/state';
import { showToast, getCleanFileBaseName } from '../../core/utils';
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
import { dataURLtoBlob } from './file-loader';

export async function buildProjectBackupJSON(): Promise<any> {
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
            blocks: (page.blocks || []).map(b => ({
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
            }))
        });
    }

    const ctx = getTranslationContext();
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

export async function exportProjectBackup(): Promise<void> {
    if (globalState.pages.length === 0) {
        showToast("Không có dự án nào để sao lưu.", "warn");
        return;
    }

    let defaultName = `Manga_Project_${new Date().toISOString().slice(0, 10)}`;
    if (globalState.pages[0]?.name) {
        defaultName = getCleanFileBaseName(globalState.pages[0].name) + "_Backup";
    }

    const inputName = prompt("Nhập tên tệp sao lưu dự án (.manga):", defaultName);
    if (inputName === null) return;

    let fileName = inputName.trim() || defaultName;
    if (!fileName.toLowerCase().endsWith('.manga')) {
        fileName += '.manga';
    }

    try {
        showToast("Đang đóng gói file dự án (.manga)... Vui lòng chờ.", "info");

        const backupData = await buildProjectBackupJSON();

        const blob = new Blob([JSON.stringify(backupData)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Đã xuất file sao lưu dự án (${fileName}) thành công! (${backupData.pages.length} trang)`, "success");
    } catch (e) {
        console.error("Lỗi sao lưu dự án:", e);
        showToast("Không thể xuất file sao lưu dự án.", "error");
    }
}

export async function importProjectBackup(files: FileList | File[]): Promise<void> {
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
                        console.warn("Không thể chuyển data URL thành Blob cho trang:", p.name, err);
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
            showToast(`Đã khôi phục thành công ${data.pages.length} trang truyện!`, "success");
        }
    } catch (e: any) {
        console.error("Lỗi khôi phục dự án:", e);
        showToast(`Không thể đọc file dự án: ${e.message}`, "error");
    } finally {
        const inp = document.getElementById('import-project-input') as HTMLInputElement | null;
        if (inp) inp.value = '';
    }
}

export function exportProjectBackupJSON(): void {
    if (!globalState.pages || globalState.pages.length === 0) {
        showToast("Chưa có dữ liệu dự án để xuất sao lưu.", "warn");
        return;
    }

    const backupData = {
        version: "2.5.0",
        exportedAt: new Date().toISOString(),
        settings: {
            sourceLanguage: globalState.sourceLanguage,
            targetLanguage: globalState.targetLanguage,
            defaultFont: globalState.defaultFont,
            defaultFontSize: globalState.defaultFontSize,
            autoFitEnabled: globalState.autoFitEnabled,
            preserveNames: globalState.preserveNames,
            glossaryNames: globalState.glossaryNames,
            pronounMatrix: globalState.pronounMatrix
        },
        characterDossier: globalState.characterDossier,
        lorebook: globalState.lorebook,
        pages: globalState.pages.map(p => ({
            id: p.id,
            name: p.name,
            status: p.status,
            width: p.width,
            height: p.height,
            blocks: (p.blocks || []).map(b => ({
                id: b.id,
                type: b.type,
                original: b.original,
                translated: b.translated,
                box: b.box,
                style: b.style,
                speaker: b.speaker,
                target: b.target,
                vertical: b.vertical
            }))
        }))
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Manga_Project_Backup_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Đã xuất file sao lưu dự án (.JSON) thành công!", "success");
}
