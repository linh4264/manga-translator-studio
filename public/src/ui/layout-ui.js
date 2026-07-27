import { globalState } from '../core/state.js';
import { elements } from '../core/elements.js';
import { requestOverlayRender, renderOverlays } from '../features/canvas/canvas-service.js';
import { updateToeicTabUI } from '../features/toeic.js';

export function setRightTab(tab) {
    const tabs = ['edit', 'style', 'toeic'];
    tabs.forEach((t) => {
        const btn = document.getElementById(`tab-${t}`);
        const panel = document.getElementById(`panel-tab-${t}`);
        if (t === tab) {
            if (btn) btn.className = "flex-1 py-3 text-xs font-bold text-indigo-400 border-b-2 border-indigo-500 uppercase tracking-wider";
            if (panel) panel.classList.remove('hidden');
        } else {
            if (btn) btn.className = "flex-1 py-3 text-xs font-bold text-slate-400 hover:text-slate-200 uppercase tracking-wider";
            if (panel) panel.classList.add('hidden');
        }
    });

    if (tab === 'toeic') {
        updateToeicTabUI();
    }
}

export function updateProcessingOverlay(show, title = "Đang xử lý...", subtitle = "Vui lòng đợi...", progress = 0) {
    const overlay = elements.processingOverlay;
    if (!overlay) return;

    if (show) {
        overlay.classList.remove('hidden');
        const titleEl = document.getElementById('processing-title');
        const subtitleEl = document.getElementById('processing-subtitle');
        const progressEl = document.getElementById('processing-progress-bar');
        const percentageEl = document.getElementById('processing-percentage');

        if (titleEl) titleEl.innerText = title;
        if (subtitleEl) subtitleEl.innerText = subtitle;
        if (progressEl) progressEl.style.width = `${progress}%`;
        if (percentageEl) percentageEl.innerText = `${progress}%`;
    } else {
        overlay.classList.add('hidden');
    }
}

export function updateBackgroundTaskOverlay(show, title = "", subtitle = "", progress = 0) {
    const bar = elements.backgroundTaskBar;
    if (!bar) return;

    if (show) {
        bar.classList.remove('hidden');
        const titleEl = document.getElementById('bg-task-title');
        const subtitleEl = document.getElementById('bg-task-subtitle');
        const progressEl = document.getElementById('bg-task-progress-bar');
        const percentageEl = document.getElementById('bg-task-percentage');

        if (titleEl) titleEl.innerText = title;
        if (subtitleEl) subtitleEl.innerText = subtitle;
        if (progressEl) progressEl.style.width = `${progress}%`;
        if (percentageEl) percentageEl.innerText = `${progress}%`;
    } else {
        bar.classList.add('hidden');
    }
}

export function setViewMode(mode) {
    globalState.viewMode = mode;

    const modes = ['overlay', 'split', 'original'];
    modes.forEach(m => {
        const btn = document.getElementById(`view-mode-${m}`);
        if (btn) {
            btn.className = (m === mode)
                ? "px-3 py-1 text-xs font-semibold rounded bg-indigo-600 text-white transition-all flex items-center gap-1"
                : "px-3 py-1 text-xs font-semibold rounded text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1";
        }
    });

    if (globalState.activePageIndex === -1) return;

    if (mode === 'split') {
        elements.mangaCanvasContainer.classList.add('hidden');
        updateSplitView();
    } else {
        elements.workspaceSplitWrapper.classList.add('hidden');
        elements.mangaCanvasContainer.classList.remove('hidden');
        requestOverlayRender();
    }
}

export function updateSplitView() {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];

    elements.workspaceSplitWrapper.classList.remove('hidden');
    elements.splitOriginalImg.src = page.src;

    let mirrorImg = document.getElementById('split-editor-img-clone');
    let overlaysDiv = document.getElementById('split-overlays-clone');
    let mirrorContainer = document.getElementById('split-editor-container-clone');

    if (!mirrorContainer || !mirrorImg || !overlaysDiv) {
        elements.splitEditorAnchor.innerHTML = '';

        mirrorContainer = document.createElement('div');
        mirrorContainer.className = "manga-container";
        mirrorContainer.id = "split-editor-container-clone";
        mirrorContainer.style.position = 'relative';
        mirrorContainer.style.display = 'inline-block';
        mirrorContainer.style.height = '100%';

        mirrorImg = document.createElement('img');
        mirrorImg.id = "split-editor-img-clone";
        mirrorImg.src = page.src;
        mirrorImg.className = "block h-full w-auto max-w-none border border-slate-800 rounded shadow-2xl select-none";
        mirrorImg.style.pointerEvents = 'none';

        overlaysDiv = document.createElement('div');
        overlaysDiv.id = "split-overlays-clone";
        overlaysDiv.className = "absolute inset-0 select-none overflow-hidden rounded z-20";

        mirrorContainer.appendChild(mirrorImg);
        mirrorContainer.appendChild(overlaysDiv);
        elements.splitEditorAnchor.appendChild(mirrorContainer);
    } else if (mirrorImg.src !== page.src) {
        mirrorImg.src = page.src;
    }

    renderOverlays(overlaysDiv);
}

export function changeZoom(amount) {
    globalState.zoom = Math.max(25, Math.min(250, globalState.zoom + amount));
    elements.zoomIndicator.innerText = `${globalState.zoom}%`;
    elements.mangaCanvasContainer.style.height = `${globalState.zoom}%`;
    elements.mangaCanvasContainer.style.width = 'auto';
    elements.workspaceSplitWrapper.style.transform = `scale(${globalState.zoom / 100})`;
}

export function resetZoom() {
    globalState.zoom = 100;
    elements.zoomIndicator.innerText = '100%';
    elements.mangaCanvasContainer.style.height = '100%';
    elements.mangaCanvasContainer.style.width = 'auto';
    elements.workspaceSplitWrapper.style.transform = 'scale(1)';
}

export function toggleSidebarToolsMenu() {
    document.getElementById('sidebar-tools-menu')?.classList.toggle('hidden');
}

export function toggleMobileSidebar() {
    elements.sidebarPanel?.classList.toggle('mobile-open');
}

export function syncMobileMenuState() {
    if (window.innerWidth >= 1024) {
        elements.sidebarPanel?.classList.remove('mobile-open');
    }
}

export function syncMobileToolbarState() {
    const toolbar = document.getElementById('mobile-bottom-toolbar');
    if (toolbar) toolbar.classList.toggle('hidden', window.innerWidth >= 1024);
}

export function closeMobileMenus() {
    elements.sidebarPanel?.classList.remove('mobile-open');
    document.getElementById('right-panel')?.classList.remove('mobile-open');
}

export function toggleLeftSidebar() {
    const leftPanel = document.getElementById('left-panel');
    const toggleBtn = document.getElementById('left-sidebar-toggle-handle');
    if (leftPanel) {
        leftPanel.classList.toggle('hidden');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            if (icon) {
                icon.className = leftPanel.classList.contains('hidden')
                    ? 'fa-solid fa-chevron-right text-[10px] group-hover:scale-110 transition-transform'
                    : 'fa-solid fa-chevron-left text-[10px] group-hover:scale-110 transition-transform';
            }
        }
    }
}

export function toggleRightSidebar() {
    const rightPanel = document.getElementById('right-panel');
    const toggleBtn = document.getElementById('right-sidebar-toggle-handle');
    if (rightPanel) {
        rightPanel.classList.toggle('hidden');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            if (icon) {
                icon.className = rightPanel.classList.contains('hidden')
                    ? 'fa-solid fa-chevron-left text-[10px] group-hover:scale-110 transition-transform'
                    : 'fa-solid fa-chevron-right text-[10px] group-hover:scale-110 transition-transform';
            }
        }
    }
}