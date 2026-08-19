import {
    globalState, saveProjectMeta, activatePage,
    garbageCollectPageCaches, pushStateToHistory, deletePageFromDB,
    revokeSafeMediaUrl
} from '../core/state';
import { elements } from '../core/elements';
import { showToast, escapeHTML } from '../core/utils';
import { requestOverlayRender, clearMagicWandPreview } from '../features/canvas/canvas-service';
import { restorePageEraserDrawing } from '../features/inpainting';
import { updateSplitView } from './layout-ui';
import { updateActiveBlockEditor } from './block-editor-ui';

export async function selectPage(index: number): Promise<void> {
    if (index < 0 || index >= globalState.pages.length) return;

    globalState.activePageIndex = index;
    globalState.selectedBlockId = null;
    clearMagicWandPreview?.();

    saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);

    const page = globalState.pages[index];
    if (page) {
        await activatePage(page);
    }
    garbageCollectPageCaches();

    if (elements.mangaCanvasContainer) elements.mangaCanvasContainer.classList.remove('hidden');
    if (elements.workspaceSplitWrapper) elements.workspaceSplitWrapper.classList.remove('hidden');
    if (elements.workspaceEmptyState) elements.workspaceEmptyState.classList.add('hidden');

    if (elements.btnActiveTranslate) elements.btnActiveTranslate.disabled = false;
    if (elements.btnAiErasePage) elements.btnAiErasePage.disabled = false;
    if (elements.btnExportPage) elements.btnExportPage.disabled = false;
    if (elements.btnEraserMode) elements.btnEraserMode.disabled = false;
    const btnReplace = document.getElementById('btn-replace-bg-image') as HTMLButtonElement | null;
    if (btnReplace) btnReplace.disabled = false;

    if (globalState.viewMode === 'split') {
        updateSplitView();
    } else {
        if (elements.workspaceSplitWrapper) elements.workspaceSplitWrapper.classList.add('hidden');
        if (elements.mangaCanvasContainer) elements.mangaCanvasContainer.classList.remove('hidden');

        if (elements.mangaBgImage) {
            elements.mangaBgImage.dataset.loadedSrc = "";
            if (page && page.src) elements.mangaBgImage.src = page.src;

            if (elements.mangaBgImage.complete && elements.mangaBgImage.naturalWidth > 0) {
                elements.mangaBgImage.dataset.loadedSrc = page?.src || '';
                if (page) restorePageEraserDrawing(page);
                requestOverlayRender();
            } else {
                elements.mangaBgImage.onload = () => {
                    const currentPage = globalState.pages[globalState.activePageIndex];
                    if (!currentPage || (page && currentPage.id !== page.id)) return;

                    if (elements.mangaBgImage) {
                        elements.mangaBgImage.dataset.loadedSrc = page?.src || '';
                    }
                    if (page) restorePageEraserDrawing(page);
                    requestOverlayRender();
                };
            }
        }
    }

    updatePageListUI();
    updateActiveBlockEditor();
}

export async function removePage(index: number): Promise<void> {
    pushStateToHistory();
    const removedPage = globalState.pages[index];

    if (removedPage) {
        if (removedPage.file) revokeSafeMediaUrl(removedPage.file);
        if (removedPage.originalFile) revokeSafeMediaUrl(removedPage.originalFile);
        if (removedPage.thumbnailBlob) revokeSafeMediaUrl(removedPage.thumbnailBlob);
        if (removedPage.eraserLayerBlob) revokeSafeMediaUrl(removedPage.eraserLayerBlob);
        if (removedPage.apiSrc?.startsWith('blob:')) URL.revokeObjectURL(removedPage.apiSrc);
        if (removedPage.src?.startsWith('blob:')) URL.revokeObjectURL(removedPage.src);
        if (removedPage.thumbnailSrc?.startsWith('blob:')) URL.revokeObjectURL(removedPage.thumbnailSrc);
        deletePageFromDB(removedPage.id);
    }

    globalState.pages.splice(index, 1);
    if (globalState.activePageIndex === index) {
        globalState.activePageIndex = -1;
        globalState.selectedBlockId = null;
        if (elements.mangaCanvasContainer) elements.mangaCanvasContainer.classList.add('hidden');
        if (elements.workspaceSplitWrapper) elements.workspaceSplitWrapper.classList.add('hidden');
        if (elements.workspaceEmptyState) elements.workspaceEmptyState.classList.remove('hidden');
        if (elements.btnActiveTranslate) elements.btnActiveTranslate.disabled = true;
        if (elements.btnAiErasePage) elements.btnAiErasePage.disabled = true;
        if (elements.btnExportPage) elements.btnExportPage.disabled = true;
        if (elements.btnEraserMode) elements.btnEraserMode.disabled = true;
        const btnReplace = document.getElementById('btn-replace-bg-image') as HTMLButtonElement | null;
        if (btnReplace) btnReplace.disabled = true;
    } else if (globalState.activePageIndex > index) {
        globalState.activePageIndex--;
    }

    saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);

    if (globalState.activePageIndex !== -1) {
        await activatePage(globalState.pages[globalState.activePageIndex]);
    }
    garbageCollectPageCaches();

    updatePageListUI();
}

let replaceTargetPageIndex: number | null = null;

export function triggerReplaceBgImage(targetIndex: number | null = null): void {
    const idx = targetIndex !== null ? targetIndex : globalState.activePageIndex;
    if (idx === null || idx === -1 || idx >= globalState.pages.length) {
        showToast("Vui lòng chọn một trang trước khi đổi ảnh gốc.", "warn");
        return;
    }
    replaceTargetPageIndex = idx;
    const input = document.getElementById('replace-bg-file-input') as HTMLInputElement | null;
    if (input) {
        input.value = '';
        input.click();
    }
}

export function handleReplaceBgFileInput(files: Event | FileList | any): void {
    const fileList = (files && files.target && files.target.files) ? files.target.files : files;
    const targetIdx = replaceTargetPageIndex !== null ? replaceTargetPageIndex : globalState.activePageIndex;
    if (fileList && fileList[0] && targetIdx !== null && targetIdx >= 0 && targetIdx < globalState.pages.length) {
        replacePageBackgroundImage(targetIdx, fileList[0]);
        replaceTargetPageIndex = null;
    }
}

export async function replacePageBackgroundImage(pageIndex: number, file: File): Promise<void> {
    if (!file || pageIndex < 0 || pageIndex >= globalState.pages.length) return;

    pushStateToHistory();
    const page = globalState.pages[pageIndex];

    const tempImg = new Image();
    const newSrc = URL.createObjectURL(file);

    await new Promise<void>((resolve, reject) => {
        tempImg.onload = () => resolve();
        tempImg.onerror = reject;
        tempImg.src = newSrc;
    });

    const newWidth = tempImg.naturalWidth || 800;
    const newHeight = tempImg.naturalHeight || 1200;

    if (page.originalFile) revokeSafeMediaUrl(page.originalFile);
    if (page.file) revokeSafeMediaUrl(page.file);
    if (page.thumbnailBlob) revokeSafeMediaUrl(page.thumbnailBlob);
    if (page.src?.startsWith('blob:')) URL.revokeObjectURL(page.src);
    if (page.apiSrc?.startsWith('blob:')) URL.revokeObjectURL(page.apiSrc);
    if (page.thumbnailSrc?.startsWith('blob:')) URL.revokeObjectURL(page.thumbnailSrc);

    page.file = file;
    page.originalFile = file;
    page.src = newSrc;
    page.apiSrc = newSrc;
    page.width = newWidth;
    page.height = newHeight;
    page.apiWidth = newWidth;
    page.apiHeight = newHeight;
    page.thumbnailBlob = null;
    page.imageDataCache = null;
    delete page.lastDisplayWidth;

    const { generateAndSaveThumbnailForPage, savePageToDB } = await import('../core/state');
    await generateAndSaveThumbnailForPage(page);
    await savePageToDB(page);

    if (globalState.activePageIndex === pageIndex) {
        await selectPage(pageIndex);
    } else {
        updatePageListUI();
    }

    showToast(`Đã đổi ảnh gốc cho trang ${pageIndex + 1}! Giữ nguyên toàn bộ ô thoại.`, 'success');
}

export function updatePageListUI(): void {
    const searchContainer = document.getElementById('pages-search-container');
    const searchInput = document.getElementById('pages-search-input') as HTMLInputElement | null;
    const filterQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';

    if (globalState.pages.length === 0) {
        if (elements.pagesEmptyState) elements.pagesEmptyState.classList.remove('hidden');
        if (elements.pagesList) elements.pagesList.classList.add('hidden');
        if (searchContainer) searchContainer.classList.add('hidden');
        if (searchInput) searchInput.value = '';
        if (elements.pageCountBadge) elements.pageCountBadge.innerText = '0';
        if (elements.btnBatchTranslate) elements.btnBatchTranslate.disabled = true;
        if (elements.btnBatchExport) elements.btnBatchExport.disabled = true;
        if (elements.btnExportPdf) elements.btnExportPdf.disabled = true;
        if (elements.btnExportProject) elements.btnExportProject.disabled = true;
        if (elements.btnExportScript) elements.btnExportScript.disabled = true;
        if (elements.btnImportScript) elements.btnImportScript.disabled = true;
        if (elements.btnPreviewMode) elements.btnPreviewMode.disabled = true;

        const rangeContainer = document.getElementById('export-range-container');
        if (rangeContainer) rangeContainer.classList.add('hidden');
        return;
    }

    if (elements.pagesEmptyState) elements.pagesEmptyState.classList.add('hidden');
    if (elements.pagesList) elements.pagesList.classList.remove('hidden');
    if (searchContainer) searchContainer.classList.remove('hidden');
    if (elements.pageCountBadge) elements.pageCountBadge.innerText = String(globalState.pages.length);
    if (elements.btnBatchTranslate) elements.btnBatchTranslate.disabled = false;
    if (elements.btnBatchExport) elements.btnBatchExport.disabled = false;
    if (elements.btnExportPdf) elements.btnExportPdf.disabled = false;
    if (elements.btnExportProject) elements.btnExportProject.disabled = false;
    if (elements.btnExportScript) elements.btnExportScript.disabled = false;
    if (elements.btnImportScript) elements.btnImportScript.disabled = false;
    if (elements.btnPreviewMode) elements.btnPreviewMode.disabled = false;

    const rangeContainer = document.getElementById('export-range-container');
    if (rangeContainer) {
        rangeContainer.classList.remove('hidden');
        const numStart = document.getElementById('num-export-start') as HTMLInputElement | null;
        const numEnd = document.getElementById('num-export-end') as HTMLInputElement | null;
        if (numStart && numEnd) {
            numStart.max = String(globalState.pages.length);
            numEnd.max = String(globalState.pages.length);

            const currentStartVal = parseInt(numStart.value, 10);
            const currentEndVal = parseInt(numEnd.value, 10);

            if (isNaN(currentStartVal) || currentStartVal < 1 || currentStartVal > globalState.pages.length) {
                numStart.value = '1';
            }
            if (isNaN(currentEndVal) || currentEndVal < 1 || currentEndVal > globalState.pages.length) {
                numEnd.value = String(globalState.pages.length);
            }

            validateExportRange();
        }
    }

    if (!elements.pagesList) return;
    elements.pagesList.innerHTML = '';
    globalState.pages.forEach((page, index) => {
        if (filterQuery && !page.name.toLowerCase().includes(filterQuery)) return;

        const isActive = index === globalState.activePageIndex;
        const safePageName = escapeHTML(page.name);

        let statusBadge = '';
        if (page.status === 'draft') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-700 text-slate-100 border border-black shadow-[1px_1px_0px_#000]">Bản nháp</span>`;
        } else if (page.status === 'queued') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-600 text-white border border-black shadow-[1.5px_1.5px_0px_#000] animate-pulse">Chờ dịch...</span>`;
        } else if (page.status === 'processing') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500 text-black border border-black shadow-[1.5px_1.5px_0px_#000] flex items-center gap-1"><i class="fa-solid fa-circle-notch animate-spin text-[8px]"></i> Đang dịch</span>`;
        } else if (page.status === 'done') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500 text-white border border-black shadow-[1.5px_1.5px_0px_#000] flex items-center gap-1 shrink-0"><i class="fa-solid fa-check text-[9px] text-yellow-300"></i> H.thành</span>`;
        } else if (page.status === 'error') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-600 text-white border border-black shadow-[1.5px_1.5px_0px_#000]">Lỗi</span>`;
        }

        const pageItem = document.createElement('div');
        pageItem.className = `group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
            isActive ? 'page-item-active bg-sky-600 text-white border-2 border-black shadow-[3.5px_3.5px_0px_#000]' : 'bg-slate-800 hover:bg-slate-750 border-2 border-black shadow-[2px_2px_0px_#000]'
        }`;
        pageItem.dataset.pageIndex = String(index);

        const activeBadge = isActive
            ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-pink-500 text-white border border-black flex items-center gap-1 shadow-[1px_1px_0px_#000] shrink-0"><i class="fa-solid fa-eye text-[8px]"></i> Sửa</span>`
            : '';

        pageItem.innerHTML = `
            <div class="flex items-center space-x-2.5 min-w-0 flex-1">
                <div class="relative w-10 h-12 bg-slate-900 rounded overflow-hidden shrink-0 thumb-frame ${isActive ? 'border-2 border-pink-400 ring-2 ring-pink-500 shadow-[2px_2px_0px_#ff2a85]' : 'border border-slate-700'}">
                    <img id="thumb-${page.id}" src="${page.thumbnailSrc || ''}" class="w-full h-full object-cover select-none">
                    <div class="absolute bottom-0 inset-x-0 ${isActive ? 'bg-pink-500 text-white' : 'bg-slate-950/80 text-slate-400'} text-[8px] text-center font-mono py-0.5 font-bold">${index + 1}</div>
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-bold truncate pr-2 ${isActive ? 'text-white' : 'text-slate-200'}" title="${safePageName}">${safePageName}</p>
                    <div class="flex items-center space-x-1.5 mt-1.5 flex-wrap gap-1">${activeBadge}${statusBadge}</div>
                </div>
            </div>
            <div class="flex items-center space-x-1 shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <button data-action="replace-bg-page" data-index="${index}" title="Đổi ảnh gốc (Giữ nguyên ô thoại)" class="w-6 h-6 rounded bg-slate-900 hover:bg-amber-500 border border-black text-slate-300 hover:text-white flex items-center justify-center transition-all">
                    <i class="fa-solid fa-file-image text-[10px]"></i>
                </button>
                <button data-action="translate-page" data-index="${index}" title="Dịch trang này" class="w-6 h-6 rounded bg-slate-900 hover:bg-sky-500 border border-black text-slate-300 hover:text-white flex items-center justify-center transition-all">
                    <i class="fa-solid fa-wand-magic-sparkles text-[10px]"></i>
                </button>
                <button data-action="remove-page" data-index="${index}" title="Xóa" class="w-6 h-6 rounded bg-slate-900 hover:bg-red-500 border border-black text-slate-300 hover:text-white flex items-center justify-center transition-all">
                    <i class="fa-solid fa-trash-can text-[10px]"></i>
                </button>
            </div>
        `;
        elements.pagesList.appendChild(pageItem);
    });

    import('./layout-ui').then(m => m.updateStepperUI());
}

export function filterPagesList(): void {
    const searchInput = document.getElementById('pages-search-input') as HTMLInputElement | null;
    const filterQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const pageItems = elements.pagesList?.querySelectorAll('[data-page-index]');

    if (!pageItems) return;
    pageItems.forEach((item) => {
        const el = item as HTMLElement;
        const index = Number(el.dataset.pageIndex);
        const page = globalState.pages[index];
        if (!page) return;

        const matches = !filterQuery || page.name.toLowerCase().includes(filterQuery);
        el.classList.toggle('hidden', !matches);
    });
}

export function toggleExportRangeInputs(): void {
    const chk = document.getElementById('chk-export-range') as HTMLInputElement | null;
    const inputsDiv = document.getElementById('export-range-inputs');
    if (chk && inputsDiv) {
        if (chk.checked) {
            inputsDiv.classList.remove('hidden');
        } else {
            inputsDiv.classList.add('hidden');
        }
        validateExportRange();
    }
}

export function validateExportRange(): void {
    const chk = document.getElementById('chk-export-range') as HTMLInputElement | null;
    const numStart = document.getElementById('num-export-start') as HTMLInputElement | null;
    const numEnd = document.getElementById('num-export-end') as HTMLInputElement | null;
    const totalSpan = document.getElementById('export-range-total');

    if (!numStart || !numEnd || !totalSpan) return;

    const maxVal = globalState.pages.length;
    if (maxVal === 0) {
        totalSpan.innerText = '';
        return;
    }

    let startVal = parseInt(numStart.value, 10);
    let endVal = parseInt(numEnd.value, 10);

    if (isNaN(startVal) || isNaN(endVal)) {
        totalSpan.innerText = '';
        return;
    }

    if (startVal < 1) startVal = 1;
    if (startVal > maxVal) startVal = maxVal;
    if (endVal < 1) endVal = 1;
    if (endVal > maxVal) endVal = maxVal;

    if (startVal > endVal) {
        if (document.activeElement === numStart) {
            endVal = startVal;
        } else {
            startVal = endVal;
        }
    }

    if (document.activeElement !== numStart) {
        numStart.value = String(startVal);
    }
    if (document.activeElement !== numEnd) {
        numEnd.value = String(endVal);
    }

    if (chk && chk.checked) {
        const count = endVal - startVal + 1;
        const lang = globalState.uiLanguage || 'vi';
        if (lang === 'vi') {
            totalSpan.innerText = `Đã chọn ${count}/${maxVal} trang`;
        } else {
            totalSpan.innerText = `Selected ${count}/${maxVal} pages`;
        }
    } else {
        totalSpan.innerText = '';
    }
}

export function setExportRangeToCurrent(type: 'start' | 'end' = 'start'): void {
    if (globalState.activePageIndex === -1) {
        import('../core/utils/dom').then(m => m.showToast("Vui lòng chọn một trang trước", "warn"));
        return;
    }
    const pageNum = globalState.activePageIndex + 1;
    if (type === 'start') {
        const numStart = document.getElementById('num-export-start') as HTMLInputElement | null;
        if (numStart) {
            numStart.value = String(pageNum);
            validateExportRange();
            import('../core/utils/dom').then(m => m.showToast(`Đã ghim trang bắt đầu là trang ${pageNum}`, "success"));
        }
    } else {
        const numEnd = document.getElementById('num-export-end') as HTMLInputElement | null;
        if (numEnd) {
            numEnd.value = String(pageNum);
            validateExportRange();
            import('../core/utils/dom').then(m => m.showToast(`Đã ghim trang kết thúc là trang ${pageNum}`, "success"));
        }
    }
}

export async function loadDemoManga(): Promise<void> {
    try {
        const res = await fetch('./demo.jpg');
        if (!res.ok) {
            throw new Error('Không thể tải file demo.jpg');
        }
        const blob = await res.blob();
        const demoFile = new File([blob], 'demo_manga_page.jpg', { type: 'image/jpeg' });
        const { handleUploadedFiles } = await import('../features/io');
        handleUploadedFiles([demoFile]);
        showToast('Đã nạp trang truyện mẫu thành công!', 'success');
    } catch (err: any) {
        showToast('Lỗi nạp ảnh demo: ' + (err.message || err), 'error');
    }
}

if (typeof window !== 'undefined') {
    Object.assign(window, {
        toggleExportRangeInputs,
        validateExportRange,
        setExportRangeToCurrent,
        triggerReplaceBgImage,
        handleReplaceBgFileInput,
        replacePageBackgroundImage,
        loadDemoManga
    });
}
