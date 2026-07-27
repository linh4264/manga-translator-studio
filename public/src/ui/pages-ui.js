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
    elements.btnActiveTranslate.disabled = false;
    elements.btnExportPage.disabled = false;
    elements.btnEraserMode.disabled = false;

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
        elements.btnActiveTranslate.disabled = true;
        elements.btnExportPage.disabled = true;
        elements.btnEraserMode.disabled = true;
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