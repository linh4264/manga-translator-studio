import { globalState, activatePage, garbageCollectPageCaches, getSafeMediaUrl } from '../core/state';
import { elements } from '../core/elements';
import { showToast, escapeHTML, getCleanFileBaseName } from '../core/utils';
import { renderPageToCanvas2D } from '../features/canvas/canvas-service';
import { runBatchExport, runPdfExport, getPageExportMimeType } from '../features/io';

/**
 * Gets immediate image URL from available in-memory page properties.
 */
function getPageImmediateImageUrl(page: any): string | null {
    if (!page) return null;
    return (
        page.thumbnailSrc ||
        page.src ||
        (page.thumbnailBlob ? getSafeMediaUrl(page.thumbnailBlob) : null) ||
        (page.originalFile ? getSafeMediaUrl(page.originalFile) : null) ||
        (page.file ? getSafeMediaUrl(page.file) : null) ||
        null
    );
}

export let previewCurrentPage = 0;
export let previewViewMode: 'single' | 'continuous' | 'grid' = 'single';
export let previewFitMode: 'fit-page' | 'fit-width' | 'original' = 'fit-width';
export let previewZoom = 1.0;
export let selectedExportPages: Set<number> = new Set<number>();
export let activeExportTab: 'zip' | 'pdf' | 'gdrive' = 'zip';

// In-memory cache for rendered preview canvas blobs to prevent redundant renders and memory leaks
const renderedPreviewCache: Map<number, string> = new Map();

function safeReplaceChild(parent: HTMLElement, newChild: HTMLElement, oldChild: HTMLElement): void {
    if (!parent || !oldChild) return;
    if (typeof parent.replaceChild === 'function') {
        try {
            parent.replaceChild(newChild, oldChild);
            return;
        } catch {}
    }
    if (oldChild.parentNode === parent) {
        parent.removeChild(oldChild);
    }
    parent.appendChild(newChild);
}

export function openPreviewMode(defaultTab: 'zip' | 'pdf' | 'view' = 'view', targetPageIndex?: number): void {
    if (globalState.pages.length === 0) {
        showToast("Chưa có trang truyện nào để xem trước!", "warn");
        return;
    }

    // Default target page
    if (targetPageIndex !== undefined && targetPageIndex >= 0 && targetPageIndex < globalState.pages.length) {
        previewCurrentPage = targetPageIndex;
    } else {
        previewCurrentPage = globalState.activePageIndex >= 0 ? globalState.activePageIndex : 0;
    }

    // Initialize selected pages (default select all if empty or first open)
    if (selectedExportPages.size === 0) {
        selectAllExportPagesInternal();
    }

    if (defaultTab === 'pdf') {
        activeExportTab = 'pdf';
    } else if (defaultTab === 'zip') {
        activeExportTab = 'zip';
    }

    previewZoom = 1.0;

    if (elements.previewModal) {
        elements.previewModal.classList.remove('hidden');
    }
    document.body.style.overflow = 'hidden';

    syncPreviewControlsUI();
    renderPreviewViewport();

    document.removeEventListener('keydown', previewKeyHandler);
    document.addEventListener('keydown', previewKeyHandler);
}

export function openExportZipPreview(): void {
    openPreviewMode('zip');
}

export function openExportPdfPreview(): void {
    openPreviewMode('pdf');
}

export function closePreviewMode(): void {
    if (elements.previewModal) {
        elements.previewModal.classList.add('hidden');
    }
    document.body.style.overflow = '';
    
    // Revoke cached preview URLs to free RAM
    renderedPreviewCache.forEach((url) => {
        try {
            URL.revokeObjectURL(url);
        } catch {
            // ignore
        }
    });
    renderedPreviewCache.clear();

    const previewBody = document.getElementById('preview-body');
    if (previewBody) {
        previewBody.innerHTML = '';
    }
    document.removeEventListener('keydown', previewKeyHandler);
    garbageCollectPageCaches();
}

export function previewKeyHandler(e: KeyboardEvent): void {
    // Ignore keys if user is typing inside an input or textarea
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        if (e.key === 'Escape') {
            (activeEl as HTMLElement).blur();
        }
        return;
    }

    if (e.key === 'Escape') {
        e.preventDefault();
        closePreviewMode();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        previewPrevPage();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        previewNextPage();
    } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        changePreviewZoom(0.15);
    } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        changePreviewZoom(-0.15);
    } else if (e.key === '0') {
        e.preventDefault();
        resetPreviewZoom();
    }
}

export function previewPrevPage(): void {
    if (previewCurrentPage > 0) {
        previewCurrentPage--;
        syncPreviewControlsUI();
        renderPreviewViewport();
    }
}

export function previewNextPage(): void {
    if (previewCurrentPage < globalState.pages.length - 1) {
        previewCurrentPage++;
        syncPreviewControlsUI();
        renderPreviewViewport();
    }
}

export function previewJumpToPage(index: number): void {
    if (index >= 0 && index < globalState.pages.length) {
        previewCurrentPage = index;
        syncPreviewControlsUI();
        renderPreviewViewport();
    }
}

export function setPreviewViewMode(mode: 'single' | 'continuous' | 'grid'): void {
    previewViewMode = mode;
    syncPreviewControlsUI();
    renderPreviewViewport();
}

export function setPreviewFitMode(mode: 'fit-page' | 'fit-width' | 'original'): void {
    previewFitMode = mode;
    syncPreviewControlsUI();
    applySinglePageFitAndZoom();
}

export function togglePreviewFitMode(): void {
    if (previewFitMode === 'fit-page') {
        setPreviewFitMode('fit-width');
    } else if (previewFitMode === 'fit-width') {
        setPreviewFitMode('original');
    } else {
        setPreviewFitMode('fit-page');
    }
}

export function applySinglePageFitAndZoom(): void {
    const img = document.getElementById('preview-single-img') as HTMLImageElement | null;
    const container = document.getElementById('preview-zoomable-container');
    if (!img || !container) return;

    if (previewFitMode === 'fit-page') {
        img.style.maxWidth = '100%';
        img.style.maxHeight = `calc((100vh - 140px) * ${previewZoom})`;
        img.style.width = 'auto';
        img.style.height = 'auto';
        img.className = "block select-none shadow-lg rounded transition-all duration-150 cursor-zoom-in";
        container.style.width = 'auto';
        container.style.maxWidth = '100%';
    } else if (previewFitMode === 'fit-width') {
        const targetWidth = Math.round(920 * previewZoom);
        img.style.maxWidth = `${targetWidth}px`;
        img.style.maxHeight = 'none';
        img.style.width = '100%';
        img.style.height = 'auto';
        img.className = "block select-none shadow-lg rounded transition-all duration-150 cursor-zoom-in";
        container.style.width = '100%';
        container.style.maxWidth = `${targetWidth}px`;
    } else if (previewFitMode === 'original') {
        img.style.maxWidth = 'none';
        img.style.maxHeight = 'none';
        if (img.naturalWidth > 0) {
            img.style.width = `${Math.round(img.naturalWidth * previewZoom)}px`;
            img.style.height = `${Math.round(img.naturalHeight * previewZoom)}px`;
        } else {
            img.style.width = 'auto';
            img.style.height = 'auto';
        }
        img.className = "block select-none shadow-lg rounded transition-all duration-150 cursor-zoom-out";
        container.style.width = 'auto';
        container.style.maxWidth = 'none';
    }
}

export function setPreviewZoom(zoom: number): void {
    previewZoom = Math.min(Math.max(zoom, 0.25), 3.0);
    const zoomText = document.getElementById('preview-zoom-level');
    if (zoomText) {
        zoomText.textContent = `${Math.round(previewZoom * 100)}%`;
    }
    applySinglePageFitAndZoom();
}

export function changePreviewZoom(delta: number): void {
    setPreviewZoom(previewZoom + delta);
}

export function resetPreviewZoom(): void {
    setPreviewZoom(1.0);
}

export function togglePageExportSelection(pageIndex: number, event?: Event): void {
    if (event) {
        event.stopPropagation();
    }
    if (selectedExportPages.has(pageIndex)) {
        selectedExportPages.delete(pageIndex);
    } else {
        selectedExportPages.add(pageIndex);
    }
    syncPreviewControlsUI();
}

export function selectAllExportPages(): void {
    selectAllExportPagesInternal();
    syncPreviewControlsUI();
    renderPreviewViewport();
    showToast(`Đã chọn toàn bộ ${globalState.pages.length} trang để xuất.`, 'info');
}

function selectAllExportPagesInternal(): void {
    selectedExportPages.clear();
    for (let i = 0; i < globalState.pages.length; i++) {
        selectedExportPages.add(i);
    }
}

export function deselectAllExportPages(): void {
    selectedExportPages.clear();
    syncPreviewControlsUI();
    renderPreviewViewport();
    showToast("Đã bỏ chọn tất cả các trang.", 'info');
}

export function switchPreviewExportTab(tab: 'zip' | 'pdf' | 'gdrive'): void {
    activeExportTab = tab;
    syncPreviewControlsUI();
}

export function syncPreviewControlsUI(): void {
    const totalPages = globalState.pages.length;
    const currentPageObj = globalState.pages[previewCurrentPage];

    // Page indicator
    const indicator = document.getElementById('preview-page-indicator');
    if (indicator) {
        indicator.textContent = `Trang ${previewCurrentPage + 1}/${totalPages}`;
    }

    const nameLabel = document.getElementById('preview-page-name');
    if (nameLabel && currentPageObj) {
        nameLabel.textContent = currentPageObj.name || `page_${previewCurrentPage + 1}`;
    }

    // Selected count badge
    const selectedBadge = document.getElementById('preview-selected-count-badge');
    if (selectedBadge) {
        selectedBadge.textContent = `${selectedExportPages.size}/${totalPages} trang đã chọn`;
    }

    // Header current page checkbox
    const chkCurrent = document.getElementById('preview-chk-current-page') as HTMLInputElement | null;
    if (chkCurrent) {
        chkCurrent.checked = selectedExportPages.has(previewCurrentPage);
    }

    // Navigation buttons state
    const btnPrev = document.getElementById('preview-btn-prev') as HTMLButtonElement | null;
    const btnNext = document.getElementById('preview-btn-next') as HTMLButtonElement | null;
    if (btnPrev) btnPrev.disabled = (previewCurrentPage <= 0);
    if (btnNext) btnNext.disabled = (previewCurrentPage >= totalPages - 1);

    // Zoom level text
    const zoomText = document.getElementById('preview-zoom-level');
    if (zoomText) {
        zoomText.textContent = `${Math.round(previewZoom * 100)}%`;
    }

    // View mode button active highlights
    const modeButtons = document.querySelectorAll<HTMLElement>('[data-preview-mode]');
    modeButtons.forEach((btn) => {
        const mode = btn.getAttribute('data-preview-mode');
        if (mode === previewViewMode) {
            btn.classList.add('bg-indigo-600', 'text-white', 'shadow-sm');
            btn.classList.remove('bg-slate-800', 'text-slate-400');
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-sm');
            btn.classList.add('bg-slate-800', 'text-slate-400');
        }
    });

    // Single Page Fit Mode button active highlights
    const fitButtons = document.querySelectorAll<HTMLElement>('[data-fit-mode]');
    fitButtons.forEach((btn) => {
        const mode = btn.getAttribute('data-fit-mode');
        if (mode === previewFitMode) {
            btn.classList.add('bg-indigo-600', 'text-white', 'shadow-sm');
            btn.classList.remove('bg-slate-800', 'text-slate-400');
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-sm');
            btn.classList.add('bg-slate-800', 'text-slate-400');
        }
    });

    const fitContainer = document.getElementById('preview-fit-mode-controls');
    if (fitContainer) {
        if (previewViewMode === 'single') {
            fitContainer.classList.remove('hidden');
            fitContainer.classList.add('flex');
        } else {
            fitContainer.classList.add('hidden');
            fitContainer.classList.remove('flex');
        }
    }

    // Export panel tabs
    const tabZipBtn = document.getElementById('preview-tab-btn-zip');
    const tabPdfBtn = document.getElementById('preview-tab-btn-pdf');
    const tabGdriveBtn = document.getElementById('preview-tab-btn-gdrive');
    const panelZip = document.getElementById('preview-panel-zip');
    const panelPdf = document.getElementById('preview-panel-pdf');
    const panelGdrive = document.getElementById('preview-panel-gdrive');

    const inactiveTabClass = "h-8 py-1 px-1 text-[11px] font-semibold rounded-lg bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer";

    if (tabZipBtn && tabPdfBtn && panelZip && panelPdf) {
        if (activeExportTab === 'zip') {
            tabZipBtn.className = "h-8 py-1 px-1 text-[11px] font-bold rounded-lg bg-sky-600 text-white shadow-md shadow-sky-600/20 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer";
            tabPdfBtn.className = inactiveTabClass;
            if (tabGdriveBtn) tabGdriveBtn.className = inactiveTabClass;
            panelZip.classList.remove('hidden');
            panelPdf.classList.add('hidden');
            if (panelGdrive) panelGdrive.classList.add('hidden');
        } else if (activeExportTab === 'pdf') {
            tabZipBtn.className = inactiveTabClass;
            tabPdfBtn.className = "h-8 py-1 px-1 text-[11px] font-bold rounded-lg bg-emerald-600 text-white shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer";
            if (tabGdriveBtn) tabGdriveBtn.className = inactiveTabClass;
            panelZip.classList.add('hidden');
            panelPdf.classList.remove('hidden');
            if (panelGdrive) panelGdrive.classList.add('hidden');
        } else if (activeExportTab === 'gdrive') {
            tabZipBtn.className = inactiveTabClass;
            tabPdfBtn.className = inactiveTabClass;
            if (tabGdriveBtn) tabGdriveBtn.className = "h-8 py-1 px-1 text-[11px] font-bold rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer";
            panelZip.classList.add('hidden');
            panelPdf.classList.add('hidden');
            if (panelGdrive) panelGdrive.classList.remove('hidden');

            // Sync GDrive folders dropdown into preview
            const mainSelect = document.getElementById('gdrive-folder-select') as HTMLSelectElement | null;
            const previewSelect = document.getElementById('preview-gdrive-folder-select') as HTMLSelectElement | null;
            if (mainSelect && previewSelect && mainSelect.options.length > 1) {
                previewSelect.innerHTML = mainSelect.innerHTML;
                previewSelect.value = mainSelect.value;
            } else if (previewSelect && previewSelect.options.length <= 1) {
                import('../features/gdrive').then(({ loadGDriveFolders }) => {
                    loadGDriveFolders().catch(() => {});
                });
            }
        }
    }

    // Default filenames if empty
    const zipNameInput = document.getElementById('preview-zip-filename') as HTMLInputElement | null;
    if (zipNameInput && !zipNameInput.value) {
        zipNameInput.value = `manga_translated_${Date.now()}`;
    }

    const pdfNameInput = document.getElementById('preview-pdf-filename') as HTMLInputElement | null;
    if (pdfNameInput && !pdfNameInput.value) {
        pdfNameInput.value = `Manga_Chapter_${Date.now()}`;
    }

    const gdriveSubfolderInput = document.getElementById('preview-gdrive-subfolder-name') as HTMLInputElement | null;
    if (gdriveSubfolderInput && !gdriveSubfolderInput.value && globalState.pages[0]?.name) {
        gdriveSubfolderInput.value = `${getCleanFileBaseName(globalState.pages[0].name)}_Translated`;
    }

    // Update thumbnail bar if in single mode
    renderThumbnailStrip();
}

/**
 * Renders the main preview viewport based on previewViewMode.
 */
export async function renderPreviewViewport(): Promise<void> {
    const previewBody = document.getElementById('preview-body');
    if (!previewBody) return;

    previewBody.innerHTML = '';

    if (previewViewMode === 'single') {
        await renderSinglePageView(previewBody);
    } else if (previewViewMode === 'continuous') {
        await renderContinuousView(previewBody);
    } else if (previewViewMode === 'grid') {
        renderGridView(previewBody);
    }
}

/**
 * 1. Single Page View with High-Fidelity Canvas 2D Direct Render
 */
async function renderSinglePageView(container: HTMLElement): Promise<void> {
    if (previewCurrentPage < 0 || previewCurrentPage >= globalState.pages.length) return;
    const page = globalState.pages[previewCurrentPage];
    if (!page) return;

    const pageWrapper = document.createElement('div');
    pageWrapper.className = "relative flex flex-col items-center justify-start py-4 px-2 sm:px-4 min-h-full w-full";

    const zoomableContainer = document.createElement('div');
    zoomableContainer.id = "preview-zoomable-container";
    zoomableContainer.className = "relative shadow-2xl rounded-xl transition-all duration-150 flex items-center justify-center bg-slate-950/90 border border-slate-800/80 max-w-full";

    // Loading skeleton placeholder
    const loader = document.createElement('div');
    loader.className = "flex flex-col items-center justify-center p-12 text-slate-400 gap-3";
    loader.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-3xl text-indigo-400"></i><span class="text-xs font-semibold">Đang kết xuất trang truyện...</span>`;
    zoomableContainer.appendChild(loader);
    pageWrapper.appendChild(zoomableContainer);
    container.appendChild(pageWrapper);

    try {
        await activatePage(page);
        garbageCollectPageCaches(previewCurrentPage);

        // Check if we already rendered and cached a blob URL
        let renderedUrl = renderedPreviewCache.get(previewCurrentPage);
        if (!renderedUrl) {
            const canvas = await renderPageToCanvas2D(page);
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
            if (blob) {
                renderedUrl = URL.createObjectURL(blob);
                renderedPreviewCache.set(previewCurrentPage, renderedUrl);
            }
            if (canvas) {
                canvas.width = 0;
                canvas.height = 0;
            }
        }

        if (renderedUrl && loader.parentNode === zoomableContainer) {
            zoomableContainer.removeChild(loader);
            const img = document.createElement('img');
            img.id = "preview-single-img";
            img.src = renderedUrl;
            img.draggable = false;
            img.onclick = () => togglePreviewFitMode();
            img.title = "Bấm để đổi chế độ xem: Khớp rộng <-> 100% Gốc <-> Khớp toàn trang";
            zoomableContainer.appendChild(img);
            applySinglePageFitAndZoom();
        }
    } catch (err: any) {
        console.error("Lỗi khi render preview canvas:", err);
        const fallbackSrc = getPageImmediateImageUrl(page);
        if (fallbackSrc && loader.parentNode === zoomableContainer) {
            zoomableContainer.removeChild(loader);
            const img = document.createElement('img');
            img.id = "preview-single-img";
            img.src = fallbackSrc;
            img.draggable = false;
            img.onclick = () => togglePreviewFitMode();
            img.title = "Bấm để đổi chế độ xem: Khớp rộng <-> 100% Gốc <-> Khớp toàn trang";
            zoomableContainer.appendChild(img);
            applySinglePageFitAndZoom();
        } else {
            loader.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-3xl text-red-400"></i><span class="text-xs text-red-300">Không thể kết xuất trang này: ${escapeHTML(err.message)}</span>`;
        }
    }
}

/**
 * 2. Continuous / Webtoon vertical scroll view
 */
async function renderContinuousView(container: HTMLElement): Promise<void> {
    const scrollContainer = document.createElement('div');
    scrollContainer.className = "flex flex-col items-center gap-6 py-6 w-full max-w-4xl px-4";

    const totalPages = globalState.pages.length;
    for (let i = 0; i < totalPages; i++) {
        const page = globalState.pages[i];
        const pageCard = document.createElement('div');
        pageCard.className = "relative w-full flex flex-col items-center bg-slate-900/60 rounded-xl p-3 border border-slate-800/80 shadow-lg";

        const cardHeader = document.createElement('div');
        cardHeader.className = "w-full flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs text-slate-400";
        cardHeader.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="font-bold text-slate-200">Trang ${i + 1}</span>
                <span class="text-[11px] text-slate-500 font-mono">(${escapeHTML(page.name)})</span>
            </div>
            <label class="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white select-none">
                <input type="checkbox" ${selectedExportPages.has(i) ? 'checked' : ''} onchange="togglePageExportSelection(${i}, event)" class="rounded text-indigo-600 focus:ring-0">
                <span class="text-[11px]">Xuất trang này</span>
            </label>
        `;
        pageCard.appendChild(cardHeader);

        const imgPlaceholder = document.createElement('div');
        imgPlaceholder.className = "min-h-[300px] w-full flex items-center justify-center bg-slate-950/60 rounded";
        imgPlaceholder.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-2xl text-indigo-400"></i>`;
        pageCard.appendChild(imgPlaceholder);

        scrollContainer.appendChild(pageCard);

        // Render page canvas lazily
        (async () => {
            try {
                let url = renderedPreviewCache.get(i);
                if (!url) {
                    await activatePage(page);
                    const canvas = await renderPageToCanvas2D(page);
                    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
                    if (blob) {
                        url = URL.createObjectURL(blob);
                        renderedPreviewCache.set(i, url);
                    }
                    if (canvas) {
                        canvas.width = 0;
                        canvas.height = 0;
                    }
                }
                if (url && imgPlaceholder.parentNode === pageCard) {
                    const img = document.createElement('img');
                    img.src = url;
                    img.className = "max-w-full h-auto block rounded select-none shadow";
                    img.draggable = false;
                    safeReplaceChild(pageCard, img, imgPlaceholder);
                }
            } catch (err) {
                const fallbackSrc = getPageImmediateImageUrl(page);
                if (fallbackSrc && imgPlaceholder.parentNode === pageCard) {
                    const img = document.createElement('img');
                    img.src = fallbackSrc;
                    img.className = "max-w-full h-auto block rounded select-none shadow";
                    img.draggable = false;
                    safeReplaceChild(pageCard, img, imgPlaceholder);
                } else {
                    imgPlaceholder.innerHTML = `<span class="text-xs text-red-400">Lỗi nạp trang ${i + 1}</span>`;
                }
            }
        })();
    }

    container.appendChild(scrollContainer);
}

/**
 * 3. Grid Overview View with fast cards and multi-selection
 */
function renderGridView(container: HTMLElement): Promise<void> {
    const gridContainer = document.createElement('div');
    gridContainer.className = "w-full max-w-6xl p-6";

    const topActions = document.createElement('div');
    topActions.className = "flex items-center justify-between mb-4 pb-3 border-b border-slate-800";
    topActions.innerHTML = `
        <div class="flex items-center gap-3">
            <span class="text-sm font-bold text-white">Tổng quan tất cả các trang</span>
            <span class="text-xs text-indigo-400 bg-indigo-950/60 px-2.5 py-1 rounded-full border border-indigo-500/30">
                Đã chọn: <b>${selectedExportPages.size}</b> / ${globalState.pages.length} trang
            </span>
        </div>
        <div class="flex items-center gap-2">
            <button onclick="selectAllExportPages()" class="px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-semibold transition-all cursor-pointer">
                <i class="fa-solid fa-check-double mr-1"></i> Chọn tất cả
            </button>
            <button onclick="deselectAllExportPages()" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer">
                <i class="fa-solid fa-xmark mr-1"></i> Bỏ chọn tất cả
            </button>
        </div>
    `;
    gridContainer.appendChild(topActions);

    const cardsGrid = document.createElement('div');
    cardsGrid.className = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4";

    const totalPages = globalState.pages.length;
    for (let i = 0; i < totalPages; i++) {
        const page = globalState.pages[i];
        const isSelected = selectedExportPages.has(i);
        const isCurrent = (i === previewCurrentPage);

        const card = document.createElement('div');
        card.className = `group relative flex flex-col rounded-xl overflow-hidden border transition-all cursor-pointer ${
            isSelected ? 'bg-slate-900/90 border-indigo-500/50 shadow-md ring-1 ring-indigo-500/30' : 'bg-slate-950/60 border-slate-800 opacity-60 hover:opacity-100'
        } ${isCurrent ? 'ring-2 ring-yellow-400/80' : ''}`;

        card.onclick = () => {
            previewCurrentPage = i;
            setPreviewViewMode('single');
        };

        const thumbBox = document.createElement('div');
        thumbBox.className = "relative w-full aspect-[3/4] bg-slate-950 flex items-center justify-center overflow-hidden";

        const thumbImg = document.createElement('img');
        thumbImg.className = "w-full h-full object-cover transition-transform group-hover:scale-105 select-none";

        const immediateSrc = renderedPreviewCache.get(i) || getPageImmediateImageUrl(page);

        if (immediateSrc) {
            thumbImg.src = immediateSrc;
            thumbBox.appendChild(thumbImg);
        } else {
            const placeholderIcon = document.createElement('div');
            placeholderIcon.className = "flex items-center justify-center w-full h-full text-slate-600";
            placeholderIcon.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-lg text-indigo-400"></i>`;
            thumbBox.appendChild(placeholderIcon);

            // Asynchronously activate page to load image from IndexedDB if not in memory
            (async () => {
                try {
                    await activatePage(page);
                    const loadedSrc = getPageImmediateImageUrl(page);
                    if (loadedSrc && placeholderIcon.parentNode === thumbBox) {
                        thumbImg.src = loadedSrc;
                        safeReplaceChild(thumbBox, thumbImg, placeholderIcon);
                    }
                } catch {
                    if (placeholderIcon.parentNode === thumbBox) {
                        placeholderIcon.innerHTML = `<i class="fa-regular fa-image text-2xl text-slate-700"></i>`;
                    }
                }
            })();
        }

        // Lazily render high-fidelity translated canvas in background if not already in cache and has blocks
        if (!renderedPreviewCache.has(i) && page.blocks && page.blocks.length > 0) {
            (async () => {
                try {
                    await activatePage(page);
                    const canvas = await renderPageToCanvas2D(page);
                    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.90));
                    if (blob) {
                        const url = URL.createObjectURL(blob);
                        renderedPreviewCache.set(i, url);
                        if (thumbImg.isConnected) {
                            thumbImg.src = url;
                        }
                    }
                    if (canvas) {
                        canvas.width = 0;
                        canvas.height = 0;
                    }
                } catch {
                    // Fallback to initial base thumbnail is already displayed
                }
            })();
        }

        // Top-left page badge
        const badge = document.createElement('span');
        badge.className = "absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-md text-[10px] font-bold text-white font-mono";
        badge.textContent = `#${i + 1}`;
        thumbBox.appendChild(badge);

        // Top-right checkbox
        const chkLabel = document.createElement('label');
        chkLabel.className = "absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 backdrop-blur-md cursor-pointer hover:bg-black/80 transition-all";
        chkLabel.onclick = (e) => e.stopPropagation();
        chkLabel.innerHTML = `
            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="togglePageExportSelection(${i}, event)" class="w-4 h-4 rounded text-indigo-600 focus:ring-0 cursor-pointer">
        `;
        thumbBox.appendChild(chkLabel);

        card.appendChild(thumbBox);

        const cardFooter = document.createElement('div');
        cardFooter.className = "p-2 text-left";
        cardFooter.innerHTML = `
            <p class="text-[11px] font-bold text-slate-200 truncate" title="${escapeHTML(page.name)}">${escapeHTML(page.name)}</p>
            <p class="text-[10px] text-slate-500">${page.blocks ? page.blocks.length : 0} bong bóng thoại</p>
        `;
        card.appendChild(cardFooter);

        cardsGrid.appendChild(card);
    }

    gridContainer.appendChild(cardsGrid);
    container.appendChild(gridContainer);
    return Promise.resolve();
}

/**
 * Bottom interactive thumbnail navigation bar for Single Page Mode
 */
function renderThumbnailStrip(): void {
    const stripContainer = document.getElementById('preview-thumbnail-strip');
    if (!stripContainer) return;

    if (previewViewMode !== 'single') {
        stripContainer.classList.add('hidden');
        return;
    }
    stripContainer.classList.remove('hidden');
    stripContainer.innerHTML = '';

    const totalPages = globalState.pages.length;
    for (let i = 0; i < totalPages; i++) {
        const page = globalState.pages[i];
        const isCurrent = (i === previewCurrentPage);
        const isSelected = selectedExportPages.has(i);

        const item = document.createElement('button');
        item.className = `relative shrink-0 w-12 h-16 rounded-lg overflow-hidden border transition-all cursor-pointer ${
            isCurrent ? 'border-indigo-400 ring-2 ring-indigo-500 shadow-md scale-105 z-10' : 'border-slate-800 opacity-60 hover:opacity-100'
        } ${isSelected ? '' : 'grayscale'}`;

        item.onclick = () => previewJumpToPage(i);

        const thumbSrc = renderedPreviewCache.get(i) || getPageImmediateImageUrl(page);
        if (thumbSrc) {
            const img = document.createElement('img');
            img.src = thumbSrc;
            img.className = "w-full h-full object-cover select-none";
            item.appendChild(img);
        } else {
            const fallbackIcon = document.createElement('span');
            fallbackIcon.className = "flex items-center justify-center w-full h-full";
            fallbackIcon.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-indigo-400 text-xs"></i>`;
            item.appendChild(fallbackIcon);

            (async () => {
                try {
                    await activatePage(page);
                    const loadedSrc = getPageImmediateImageUrl(page);
                    if (loadedSrc && fallbackIcon.parentNode === item) {
                        const img = document.createElement('img');
                        img.src = loadedSrc;
                        img.className = "w-full h-full object-cover select-none";
                        safeReplaceChild(item, img, fallbackIcon);
                    }
                } catch {
                    if (fallbackIcon.parentNode === item) {
                        fallbackIcon.innerHTML = `<i class="fa-regular fa-image text-slate-600 text-xs"></i>`;
                    }
                }
            })();
        }

        const num = document.createElement('span');
        num.className = "absolute bottom-0 inset-x-0 bg-black/80 text-center text-[9px] font-mono font-bold text-white py-0.5";
        num.textContent = `${i + 1}`;
        item.appendChild(num);

        if (!isSelected) {
            const unselectedDot = document.createElement('span');
            unselectedDot.className = "absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-1 ring-white";
            item.appendChild(unselectedDot);
        }

        stripContainer.appendChild(item);
    }

    // Scroll active thumbnail into view
    const activeThumb = stripContainer.children[previewCurrentPage] as HTMLElement;
    if (activeThumb && typeof activeThumb.scrollIntoView === 'function') {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

/**
 * Gets targeted page indices based on user scope selection in the Export Panel
 */
function getSelectedIndicesFromScope(scopeId: string): number[] {
    const totalPages = globalState.pages.length;
    const scopeRadio = document.querySelector<HTMLInputElement>(`input[name="${scopeId}"]:checked`);
    const scopeVal = scopeRadio ? scopeRadio.value : 'all';

    if (scopeVal === 'current') {
        return [previewCurrentPage];
    }

    if (scopeVal === 'selected') {
        const arr = Array.from(selectedExportPages).sort((a, b) => a - b);
        return arr.length > 0 ? arr : Array.from({ length: totalPages }, (_, idx) => idx);
    }

    if (scopeVal === 'range') {
        const startInput = document.getElementById('preview-export-range-start') as HTMLInputElement | null;
        const endInput = document.getElementById('preview-export-range-end') as HTMLInputElement | null;
        let s = startInput ? parseInt(startInput.value, 10) - 1 : 0;
        let e = endInput ? parseInt(endInput.value, 10) - 1 : totalPages - 1;
        if (isNaN(s) || s < 0) s = 0;
        if (isNaN(e) || e >= totalPages) e = totalPages - 1;
        if (s > e) s = e;

        const rangeIndices: number[] = [];
        for (let i = s; i <= e; i++) rangeIndices.push(i);
        return rangeIndices;
    }

    // Default: 'all'
    return Array.from({ length: totalPages }, (_, idx) => idx);
}

/**
 * Trigger ZIP Export directly from the Preview Modal
 */
export async function executeZipExportFromPreview(): Promise<void> {
    const pageIndices = getSelectedIndicesFromScope('preview-zip-scope');
    if (pageIndices.length === 0) {
        showToast("Vui lòng chọn ít nhất một trang để xuất ZIP!", "warn");
        return;
    }

    const formatSelect = document.getElementById('preview-zip-format') as HTMLSelectElement | null;
    const format = (formatSelect ? formatSelect.value : 'auto') as 'auto' | 'png' | 'jpeg' | 'webp';

    const qualitySelect = document.getElementById('preview-zip-quality') as HTMLSelectElement | null;
    const quality = qualitySelect ? parseFloat(qualitySelect.value) : 0.95;

    const filenameInput = document.getElementById('preview-zip-filename') as HTMLInputElement | null;
    const filename = filenameInput ? filenameInput.value.trim() : undefined;

    const btn = document.getElementById('preview-btn-do-export-zip') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;

    try {
        await runBatchExport({
            pageIndices,
            format,
            quality,
            filename
        });
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * Trigger Google Drive Batch Export directly from the Preview Modal with selected format/quality/folder
 */
export async function executeGDriveExportFromPreview(): Promise<void> {
    const isGDriveTab = (activeExportTab === 'gdrive');
    const scopeId = isGDriveTab ? 'preview-gdrive-scope' : 'preview-zip-scope';
    const pageIndices = getSelectedIndicesFromScope(scopeId);
    if (pageIndices.length === 0) {
        showToast("Vui lòng chọn ít nhất một trang để xuất lên Google Drive!", "warn");
        return;
    }

    const formatSelect = document.getElementById(isGDriveTab ? 'preview-gdrive-format' : 'preview-zip-format') as HTMLSelectElement | null;
    let format = (formatSelect ? formatSelect.value : 'png') as 'auto' | 'png' | 'jpeg' | 'webp' | 'jpg';
    if ((format as string) === 'jpeg') format = 'jpg';

    const qualitySelect = document.getElementById(isGDriveTab ? 'preview-gdrive-quality' : 'preview-zip-quality') as HTMLSelectElement | null;
    const quality = qualitySelect ? parseFloat(qualitySelect.value) : 0.95;

    const folderSelect = document.getElementById('preview-gdrive-folder-select') as HTMLSelectElement | null;
    const folderId = folderSelect && folderSelect.value ? folderSelect.value : undefined;

    const subfolderChk = document.getElementById('preview-gdrive-create-subfolder-chk') as HTMLInputElement | null;
    const createSubfolder = subfolderChk ? subfolderChk.checked : true;

    const subfolderInput = document.getElementById('preview-gdrive-subfolder-name') as HTMLInputElement | null;
    const folderName = subfolderInput ? subfolderInput.value.trim() : undefined;

    const btn = document.getElementById(isGDriveTab ? 'preview-btn-do-export-gdrive' : 'preview-btn-do-export-zip') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;

    try {
        const { uploadBatchPagesToGDrive } = await import('../features/gdrive');
        await uploadBatchPagesToGDrive({
            targetIndices: pageIndices,
            format: format as any,
            quality,
            folderId,
            createSubfolder,
            folderName
        });
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * Trigger PDF Export directly from the Preview Modal
 */
export async function executePdfExportFromPreview(): Promise<void> {
    const pageIndices = getSelectedIndicesFromScope('preview-pdf-scope');
    if (pageIndices.length === 0) {
        showToast("Vui lòng chọn ít nhất một trang để xuất PDF!", "warn");
        return;
    }

    const qualitySelect = document.getElementById('preview-pdf-quality') as HTMLSelectElement | null;
    const quality = (qualitySelect ? qualitySelect.value : 'hd') as 'hd' | 'standard' | 'max';

    const filenameInput = document.getElementById('preview-pdf-filename') as HTMLInputElement | null;
    const filename = filenameInput ? filenameInput.value.trim() : undefined;

    const btn = document.getElementById('preview-btn-do-export-pdf') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;

    try {
        await runPdfExport({
            pageIndices,
            quality,
            filename
        });
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * Trigger Instant Single Page Download from Preview
 */
export async function executeSinglePageExportFromPreview(): Promise<void> {
    if (previewCurrentPage < 0 || previewCurrentPage >= globalState.pages.length) return;
    const page = globalState.pages[previewCurrentPage];
    if (!page) return;

    showToast(`Đang kết xuất ảnh trang ${previewCurrentPage + 1}...`, 'info');

    try {
        const canvas = await renderPageToCanvas2D(page);
        const { mimeType, quality, ext } = getPageExportMimeType(page);

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, quality));
        if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
        }

        if (!blob) {
            throw new Error("Không thể tạo dữ liệu Blob từ Canvas.");
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `translated_${getCleanFileBaseName(page.name, `page_${previewCurrentPage + 1}`)}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        showToast(`Đã tải về ảnh trang ${previewCurrentPage + 1}!`, "success");
    } catch (err: any) {
        console.error("Lỗi xuất ảnh đơn:", err);
        showToast(`Lỗi khi xuất ảnh: ${err.message}`, "error");
    }
}

/**
 * Copy Rendered Page directly to Clipboard
 */
export async function copyPreviewPageToClipboard(): Promise<void> {
    if (previewCurrentPage < 0 || previewCurrentPage >= globalState.pages.length) return;
    const page = globalState.pages[previewCurrentPage];
    if (!page) return;

    if (typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.write) {
        showToast("Trình duyệt không hỗ trợ sao chép hình ảnh vào Clipboard.", "warn");
        return;
    }

    try {
        showToast("Đang kết xuất để sao chép ảnh...", "info");
        const canvas = await renderPageToCanvas2D(page);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
        }

        if (!blob) throw new Error("Không thể chuyển đổi canvas thành ảnh.");

        const clipboardItem = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([clipboardItem]);
        showToast(`Đã sao chép ảnh trang ${previewCurrentPage + 1} vào Clipboard!`, "success");
    } catch (err: any) {
        console.error("Lỗi sao chép ảnh vào Clipboard:", err);
        showToast(`Không thể sao chép ảnh: ${err.message}`, "error");
    }
}
