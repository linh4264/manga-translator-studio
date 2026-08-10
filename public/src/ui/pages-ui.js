import {
    globalState, saveProjectMeta, activatePage,
    garbageCollectPageCaches, pushStateToHistory, deletePageFromDB
} from '../core/state.js';
import { elements } from '../core/elements.js';
import { showToast, escapeHTML } from '../core/utils.js';
import { requestOverlayRender } from '../features/canvas/canvas-service.js';
import { restorePageEraserDrawing } from '../features/inpainting.js';
import { updateSplitView } from './layout-ui.js';
import { updateActiveBlockEditor } from './block-editor-ui.js';

export async function selectPage(index) {
    if (index < 0 || index >= globalState.pages.length) return;

    globalState.activePageIndex = index;
    globalState.selectedBlockId = null;

    saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);

    const page = globalState.pages[index];
    await activatePage(page);
    garbageCollectPageCaches();

    updatePageListUI();

    elements.workspaceEmptyState.classList.add('hidden');
    if (elements.btnActiveTranslate) elements.btnActiveTranslate.disabled = false;
    if (elements.btnAiErasePage) elements.btnAiErasePage.disabled = false;
    if (elements.btnExportPage) elements.btnExportPage.disabled = false;
    if (elements.btnEraserMode) elements.btnEraserMode.disabled = false;
    const btnReplace = document.getElementById('btn-replace-bg-image');
    if (btnReplace) btnReplace.disabled = false;

    if (globalState.viewMode === 'split') {
        updateSplitView();
    } else {
        elements.workspaceSplitWrapper.classList.add('hidden');
        elements.mangaCanvasContainer.classList.remove('hidden');

        elements.mangaBgImage.dataset.loadedSrc = "";
        elements.mangaBgImage.src = page.src;

        if (elements.mangaBgImage.complete && elements.mangaBgImage.naturalWidth > 0) {
            elements.mangaBgImage.dataset.loadedSrc = page.src;
            restorePageEraserDrawing(page);
            requestOverlayRender();
        } else {
            elements.mangaBgImage.onload = () => {
                const currentPage = globalState.pages[globalState.activePageIndex];
                if (!currentPage || currentPage.id !== page.id) return;

                elements.mangaBgImage.dataset.loadedSrc = page.src;
                restorePageEraserDrawing(page);
                requestOverlayRender();
            };
        }
    }

    updateActiveBlockEditor();
}

export async function removePage(index) {
    pushStateToHistory();
    const removedPage = globalState.pages[index];

    if (removedPage?.apiSrc?.startsWith('blob:')) URL.revokeObjectURL(removedPage.apiSrc);
    if (removedPage?.src?.startsWith('blob:')) URL.revokeObjectURL(removedPage.src);
    if (removedPage?.thumbnailSrc?.startsWith('blob:')) URL.revokeObjectURL(removedPage.thumbnailSrc);

    if (removedPage) {
        deletePageFromDB(removedPage.id);
    }

    globalState.pages.splice(index, 1);
    if (globalState.activePageIndex === index) {
        globalState.activePageIndex = -1;
        globalState.selectedBlockId = null;
        elements.mangaCanvasContainer.classList.add('hidden');
        elements.workspaceSplitWrapper.classList.add('hidden');
        elements.workspaceEmptyState.classList.remove('hidden');
        if (elements.btnActiveTranslate) elements.btnActiveTranslate.disabled = true;
        if (elements.btnAiErasePage) elements.btnAiErasePage.disabled = true;
        if (elements.btnExportPage) elements.btnExportPage.disabled = true;
        if (elements.btnEraserMode) elements.btnEraserMode.disabled = true;
        const btnReplace = document.getElementById('btn-replace-bg-image');
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
    showToast('Đã xóa trang truyện', 'info');
}

let replaceTargetPageIndex = null;

export function triggerReplaceBgImage(targetIndex = null) {
    const idx = targetIndex !== null ? targetIndex : globalState.activePageIndex;
    if (idx === null || idx === -1 || idx >= globalState.pages.length) {
        showToast("Vui lòng chọn một trang trước khi đổi ảnh gốc.", "warning");
        return;
    }
    replaceTargetPageIndex = idx;
    const input = document.getElementById('replace-bg-file-input');
    if (input) {
        input.value = '';
        input.click();
    }
}

export function handleReplaceBgFileInput(files) {
    if (files && files[0] && replaceTargetPageIndex !== null) {
        replacePageBackgroundImage(replaceTargetPageIndex, files[0]);
        replaceTargetPageIndex = null;
    }
}

export async function replacePageBackgroundImage(pageIndex, file) {
    if (!file || pageIndex < 0 || pageIndex >= globalState.pages.length) return;

    pushStateToHistory();
    const page = globalState.pages[pageIndex];

    const tempImg = new Image();
    const newSrc = URL.createObjectURL(file);

    await new Promise((resolve, reject) => {
        tempImg.onload = resolve;
        tempImg.onerror = reject;
        tempImg.src = newSrc;
    });

    const newWidth = tempImg.naturalWidth || 800;
    const newHeight = tempImg.naturalHeight || 1200;

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

    const { generateAndSaveThumbnailForPage, savePageToDB } = await import('../core/state.js');
    await generateAndSaveThumbnailForPage(page);
    await savePageToDB(page);

    if (globalState.activePageIndex === pageIndex) {
        elements.mangaBgImage.dataset.loadedSrc = "";
        elements.mangaBgImage.src = page.src;
        restorePageEraserDrawing(page);
        requestOverlayRender();
    }

    updatePageListUI();
    showToast(`Đã đổi ảnh gốc cho trang ${pageIndex + 1}! Giữ nguyên toàn bộ ô thoại.`, 'success');
}

export function updatePageListUI() {
    const searchContainer = document.getElementById('pages-search-container');
    const searchInput = document.getElementById('pages-search-input');
    const filterQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';

    if (globalState.pages.length === 0) {
        elements.pagesEmptyState.classList.remove('hidden');
        elements.pagesList.classList.add('hidden');
        if (searchContainer) searchContainer.classList.add('hidden');
        if (searchInput) searchInput.value = '';
        elements.pageCountBadge.innerText = '0';
        elements.btnBatchTranslate.disabled = true;
        elements.btnBatchExport.disabled = true;
        if (elements.btnExportPdf) elements.btnExportPdf.disabled = true;
        if (elements.btnExportProject) elements.btnExportProject.disabled = true;
        if (elements.btnExportScript) elements.btnExportScript.disabled = true;
        if (elements.btnImportScript) elements.btnImportScript.disabled = true;
        if (elements.btnPreviewMode) elements.btnPreviewMode.disabled = true;
        
        const rangeContainer = document.getElementById('export-range-container');
        if (rangeContainer) rangeContainer.classList.add('hidden');
        return;
    }

    elements.pagesEmptyState.classList.add('hidden');
    elements.pagesList.classList.remove('hidden');
    if (searchContainer) searchContainer.classList.remove('hidden');
    elements.pageCountBadge.innerText = globalState.pages.length;
    elements.btnBatchTranslate.disabled = false;
    elements.btnBatchExport.disabled = false;
    if (elements.btnExportPdf) elements.btnExportPdf.disabled = false;
    if (elements.btnExportProject) elements.btnExportProject.disabled = false;
    if (elements.btnExportScript) elements.btnExportScript.disabled = false;
    if (elements.btnImportScript) elements.btnImportScript.disabled = false;
    if (elements.btnPreviewMode) elements.btnPreviewMode.disabled = false;

    const rangeContainer = document.getElementById('export-range-container');
    if (rangeContainer) {
        rangeContainer.classList.remove('hidden');
        const numStart = document.getElementById('num-export-start');
        const numEnd = document.getElementById('num-export-end');
        if (numStart && numEnd) {
            numStart.max = globalState.pages.length;
            numEnd.max = globalState.pages.length;
            
            const currentStartVal = parseInt(numStart.value, 10);
            const currentEndVal = parseInt(numEnd.value, 10);
            
            if (isNaN(currentStartVal) || currentStartVal < 1 || currentStartVal > globalState.pages.length) {
                numStart.value = 1;
            }
            if (isNaN(currentEndVal) || currentEndVal < 1 || currentEndVal > globalState.pages.length) {
                numEnd.value = globalState.pages.length;
            }
            
            validateExportRange();
        }
    }

    elements.pagesList.innerHTML = '';
    globalState.pages.forEach((page, index) => {
        if (filterQuery && !page.name.toLowerCase().includes(filterQuery)) return;

        const isActive = index === globalState.activePageIndex;
        const safePageName = escapeHTML(page.name);

        let statusBadge = '';
        if (page.status === 'draft') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-800 text-slate-400">Bản nháp</span>`;
        } else if (page.status === 'queued') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-950 text-indigo-300 animate-pulse">Chờ dịch...</span>`;
        } else if (page.status === 'processing') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-950 text-amber-300 flex items-center gap-1"><i class="fa-solid fa-circle-notch animate-spin text-[8px]"></i> Đang dịch</span>`;
        } else if (page.status === 'done') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-950 text-emerald-300 flex items-center gap-0.5"><i class="fa-solid fa-check text-[8px]"></i> Hoàn thành</span>`;
        } else if (page.status === 'error') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-950 text-red-300">Lỗi</span>`;
        }

        const pageItem = document.createElement('div');
        pageItem.className = `group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${isActive ? 'bg-indigo-600/20 border border-indigo-500/50' : 'bg-slate-950 hover:bg-slate-900 border border-transparent'
            }`;
        pageItem.dataset.pageIndex = String(index);

        pageItem.innerHTML = `
            <div class="flex items-center space-x-2.5 min-w-0 flex-1">
                <div class="relative w-10 h-12 bg-slate-900 rounded overflow-hidden shrink-0 border border-slate-800">
                    <img id="thumb-${page.id}" src="${page.thumbnailSrc || ''}" class="w-full h-full object-cover select-none">
                    <div class="absolute bottom-0 inset-x-0 bg-slate-950/80 text-[8px] text-center text-slate-400 font-mono py-0.5">${index + 1}</div>
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-semibold text-slate-200 truncate pr-2" title="${safePageName}">${safePageName}</p>
                    <div class="flex items-center space-x-1.5 mt-1.5">${statusBadge}</div>
                </div>
            </div>
            <div class="flex items-center space-x-1 shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <button data-action="replace-bg-page" data-index="${index}" title="Đổi ảnh gốc (Giữ nguyên ô thoại)" class="w-6 h-6 rounded bg-slate-900 hover:bg-amber-600 border border-slate-800 hover:border-amber-500 text-slate-400 hover:text-white flex items-center justify-center transition-all">
                    <i class="fa-solid fa-file-image text-[10px]"></i>
                </button>
                <button data-action="translate-page" data-index="${index}" title="Dịch trang này" class="w-6 h-6 rounded bg-slate-900 hover:bg-indigo-600 border border-slate-800 hover:border-indigo-500 text-slate-400 hover:text-white flex items-center justify-center transition-all">
                    <i class="fa-solid fa-wand-magic-sparkles text-[10px]"></i>
                </button>
                <button data-action="remove-page" data-index="${index}" title="Xóa" class="w-6 h-6 rounded bg-slate-900 hover:bg-red-600 border border-slate-800 hover:border-red-500 text-slate-400 hover:text-white flex items-center justify-center transition-all">
                    <i class="fa-solid fa-trash-can text-[10px]"></i>
                </button>
            </div>
        `;
        elements.pagesList.appendChild(pageItem);
    });
}

export function filterPagesList() {
    const searchInput = document.getElementById('pages-search-input');
    const filterQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const pageItems = elements.pagesList?.querySelectorAll('[data-page-index]');

    if (!pageItems) return;
    pageItems.forEach((item) => {
        const index = Number(item.dataset.pageIndex);
        const page = globalState.pages[index];
        if (!page) return;

        const matches = !filterQuery || page.name.toLowerCase().includes(filterQuery);
        item.classList.toggle('hidden', !matches);
    });
}

export function toggleExportRangeInputs() {
    const chk = document.getElementById('chk-export-range');
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

export function validateExportRange() {
    const chk = document.getElementById('chk-export-range');
    const numStart = document.getElementById('num-export-start');
    const numEnd = document.getElementById('num-export-end');
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
    
    // Clamp values
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
    
    // Update value if needed
    if (document.activeElement !== numStart) {
        numStart.value = startVal;
    }
    if (document.activeElement !== numEnd) {
        numEnd.value = endVal;
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

export function setExportRangeToCurrent(type = 'start') {
    if (globalState.activePageIndex === -1) {
        import('../core/utils/dom.js').then(m => m.showToast("Vui lòng chọn một trang trước", "warning"));
        return;
    }
    const pageNum = globalState.activePageIndex + 1;
    if (type === 'start') {
        const numStart = document.getElementById('num-export-start');
        if (numStart) {
            numStart.value = pageNum;
            validateExportRange();
            import('../core/utils/dom.js').then(m => m.showToast(`Đã ghim trang bắt đầu là trang ${pageNum}`, "success"));
        }
    } else {
        const numEnd = document.getElementById('num-export-end');
        if (numEnd) {
            numEnd.value = pageNum;
            validateExportRange();
            import('../core/utils/dom.js').then(m => m.showToast(`Đã ghim trang kết thúc là trang ${pageNum}`, "success"));
        }
    }
}

window.toggleExportRangeInputs = toggleExportRangeInputs;
window.validateExportRange = validateExportRange;
window.setExportRangeToCurrent = setExportRangeToCurrent;
window.triggerReplaceBgImage = triggerReplaceBgImage;
window.handleReplaceBgFileInput = handleReplaceBgFileInput;
window.replacePageBackgroundImage = replacePageBackgroundImage;