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

export function changeZoom(amount, mouseEvent = null) {
    const viewport = document.getElementById('workspace-viewport');
    const oldZoom = globalState.zoom;
    const newZoom = Math.max(25, Math.min(250, oldZoom + amount));
    if (newZoom === oldZoom) return;

    let targetEl = null;
    let targetContentLeft = 0;
    let targetContentTop = 0;
    let mouseXOnTarget = 0;
    let mouseYOnTarget = 0;
    let vRect = null;

    if (mouseEvent && viewport) {
        vRect = viewport.getBoundingClientRect();
        targetEl = (elements.workspaceSplitWrapper && !elements.workspaceSplitWrapper.classList.contains('hidden'))
            ? elements.workspaceSplitWrapper
            : elements.mangaCanvasContainer;

        if (targetEl) {
            const tRect = targetEl.getBoundingClientRect();
            mouseXOnTarget = mouseEvent.clientX - tRect.left;
            mouseYOnTarget = mouseEvent.clientY - tRect.top;

            const targetViewportLeft = tRect.left - vRect.left;
            const targetViewportTop = tRect.top - vRect.top;

            targetContentLeft = viewport.scrollLeft + targetViewportLeft;
            targetContentTop = viewport.scrollTop + targetViewportTop;
        }
    }

    globalState.zoom = newZoom;
    elements.zoomIndicator.innerText = `${globalState.zoom}%`;
    elements.mangaCanvasContainer.style.height = `${globalState.zoom}%`;
    elements.mangaCanvasContainer.style.maxHeight = 'none';
    elements.mangaCanvasContainer.style.width = 'auto';
    elements.workspaceSplitWrapper.style.transform = `scale(${globalState.zoom / 100})`;

    if (newZoom > 100) {
        elements.mangaCanvasContainer.classList.remove('m-auto');
        elements.mangaCanvasContainer.classList.add('my-auto', 'mx-0');
    } else {
        elements.mangaCanvasContainer.classList.remove('my-auto', 'mx-0');
        elements.mangaCanvasContainer.classList.add('m-auto');
    }

    renderOverlays();

    if (mouseEvent && viewport && targetEl && vRect) {
        const ratio = newZoom / oldZoom;
        const mouseXOnTargetNew = mouseXOnTarget * ratio;
        const mouseYOnTargetNew = mouseYOnTarget * ratio;

        const mxInViewport = mouseEvent.clientX - vRect.left;
        const myInViewport = mouseEvent.clientY - vRect.top;

        const newTargetViewportLeft = mxInViewport - mouseXOnTargetNew;
        const newTargetViewportTop = myInViewport - mouseYOnTargetNew;

        viewport.scrollLeft = Math.max(0, targetContentLeft - newTargetViewportLeft);
        viewport.scrollTop = Math.max(0, targetContentTop - newTargetViewportTop);
    }
}

export function resetZoom() {
    globalState.zoom = 100;
    elements.zoomIndicator.innerText = '100%';
    elements.mangaCanvasContainer.style.height = '100%';
    elements.mangaCanvasContainer.style.maxHeight = '100%';
    elements.mangaCanvasContainer.style.width = 'auto';
    elements.mangaCanvasContainer.classList.remove('my-auto', 'mx-0');
    elements.mangaCanvasContainer.classList.add('m-auto');
    elements.workspaceSplitWrapper.style.transform = 'scale(1)';
    renderOverlays();
}

export function toggleSidebarToolsMenu() {
    const menu = document.getElementById('sidebar-tools-menu');
    const btn = document.getElementById('sidebar-tools-toggle');
    if (menu) {
        menu.classList.toggle('hidden');
        if (btn) {
            const isOpen = !menu.classList.contains('hidden');
            btn.classList.toggle('bg-indigo-600', isOpen);
            btn.classList.toggle('bg-slate-900', !isOpen);
            btn.classList.toggle('text-white', isOpen);
            btn.classList.toggle('border-indigo-500', isOpen);
        }
    }
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

function toggleSidebar(panelId, handleId, openIconClass, closeIconClass) {
    const panel = document.getElementById(panelId);
    const toggleBtn = document.getElementById(handleId);
    if (!panel) return;

    panel.classList.toggle('hidden');
    const icon = toggleBtn?.querySelector('i');
    if (icon) {
        const isHidden = panel.classList.contains('hidden');
        icon.className = `${isHidden ? openIconClass : closeIconClass} text-[10px] group-hover:scale-110 transition-transform`;
    }
}

export const toggleLeftSidebar = () => toggleSidebar('left-panel', 'left-sidebar-toggle-handle', 'fa-solid fa-chevron-right', 'fa-solid fa-chevron-left');
export const toggleRightSidebar = () => toggleSidebar('right-panel', 'right-sidebar-toggle-handle', 'fa-solid fa-chevron-left', 'fa-solid fa-chevron-right');

export function toggleQuickBilingualMode() {
    const newMode = globalState.bilingualMode === 'sub' ? 'off' : 'sub';
    import('./block-editor-ui.js').then(m => m.setBilingualMode(newMode));
    
    const btn = document.getElementById('btn-bilingual-toggle-quick');
    if (btn) {
        if (newMode === 'sub') {
            btn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-500');
            btn.classList.remove('bg-slate-950', 'text-slate-400', 'border-slate-800');
            import('../core/utils/dom.js').then(m => m.showToast("Đã bật hiển thị Song ngữ", "info"));
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-500');
            btn.classList.add('bg-slate-950', 'text-slate-400', 'border-slate-800');
            import('../core/utils/dom.js').then(m => m.showToast("Đã tắt hiển thị Song ngữ (Đơn ngữ)", "info"));
        }
    }
}

export function toggleQuickAudioDrama() {
    const btn = document.getElementById('btn-audio-toggle-quick');
    const icon = document.getElementById('icon-audio-quick');
    const isPlaying = icon && icon.classList.contains('text-emerald-400');
    
    if (isPlaying) {
        import('../features/audio.js').then(m => m.stopAudioDrama());
        if (icon) {
            icon.className = 'fa-solid fa-headphones text-xs';
        }
        if (btn) {
            btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-500');
            btn.classList.add('bg-slate-950', 'text-slate-400', 'border-slate-800');
        }
        import('../core/utils/dom.js').then(m => m.showToast("Đã dừng phát Audio Drama", "info"));
    } else {
        import('../features/audio.js').then(m => m.playPageAudioDrama());
        if (icon) {
            icon.className = 'fa-solid fa-circle-stop text-emerald-400 text-xs animate-pulse';
        }
        if (btn) {
            btn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-500');
            btn.classList.remove('bg-slate-950', 'text-slate-400', 'border-slate-800');
        }
        import('../core/utils/dom.js').then(m => m.showToast("Bắt đầu phát Audio Drama...", "info"));
    }
}