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
    const newZoom = Math.max(25, Math.min(500, oldZoom + amount));
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
    if (elements.zoomIndicator) elements.zoomIndicator.innerText = `${globalState.zoom}%`;
    const dockZoomIndicator = document.getElementById('dock-zoom-indicator');
    if (dockZoomIndicator) dockZoomIndicator.innerText = `${globalState.zoom}%`;

    if (elements.mangaCanvasContainer) {
        elements.mangaCanvasContainer.style.height = `${globalState.zoom}%`;
        elements.mangaCanvasContainer.style.maxHeight = 'none';
        elements.mangaCanvasContainer.style.width = 'auto';

        if (newZoom > 100) {
            elements.mangaCanvasContainer.classList.remove('m-auto');
            elements.mangaCanvasContainer.classList.add('my-auto', 'mx-0');
        } else {
            elements.mangaCanvasContainer.classList.remove('my-auto', 'mx-0');
            elements.mangaCanvasContainer.classList.add('m-auto');
        }
    }

    if (elements.workspaceSplitWrapper) {
        elements.workspaceSplitWrapper.style.height = `${globalState.zoom}%`;
        elements.workspaceSplitWrapper.style.maxHeight = 'none';
        elements.workspaceSplitWrapper.style.transform = 'none';
    }

    requestOverlayRender();

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
    if (elements.zoomIndicator) elements.zoomIndicator.innerText = '100%';
    const dockZoomIndicator = document.getElementById('dock-zoom-indicator');
    if (dockZoomIndicator) dockZoomIndicator.innerText = '100%';

    if (elements.mangaCanvasContainer) {
        elements.mangaCanvasContainer.style.height = '100%';
        elements.mangaCanvasContainer.style.maxHeight = '100%';
        elements.mangaCanvasContainer.style.width = 'auto';
        elements.mangaCanvasContainer.classList.remove('my-auto', 'mx-0');
        elements.mangaCanvasContainer.classList.add('m-auto');
    }

    if (elements.workspaceSplitWrapper) {
        elements.workspaceSplitWrapper.style.height = '100%';
        elements.workspaceSplitWrapper.style.maxHeight = '100%';
        elements.workspaceSplitWrapper.style.transform = 'none';
    }

    requestOverlayRender();
}

export function fitCanvasToScreen() {
    resetZoom();
}

export function toggleLeftSidebarMoreMenu() {
    const menu = document.getElementById('left-more-actions-menu');
    if (menu) {
        menu.classList.toggle('hidden');
    }
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
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-500');
            btn.classList.add('bg-slate-950', 'text-slate-400', 'border-slate-800');
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

export function openHelpModal() {
    const modal = document.getElementById('help-modal');
    if (modal) {
        modal.classList.remove('hidden');
        switchHelpTab('shortcuts');
    }
}

export function closeHelpModal() {
    const modal = document.getElementById('help-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

export function switchHelpTab(tabName) {
    const tabs = ['shortcuts', 'features'];
    tabs.forEach(t => {
        const btn = document.getElementById(`help-tab-btn-${t}`);
        const content = document.getElementById(`help-tab-content-${t}`);
        if (t === tabName) {
            if (btn) {
                btn.className = "help-tab-btn pb-2.5 px-1 text-xs font-bold border-b-2 border-sky-400 text-sky-400 transition-all flex items-center gap-2";
            }
            if (content) content.classList.remove('hidden');
        } else {
            if (btn) {
                btn.className = "help-tab-btn pb-2.5 px-1 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition-all flex items-center gap-2";
            }
            if (content) content.classList.add('hidden');
        }
    });
}

export function updateStepperUI() {
    const hasKey = !!(globalState.apiKey || localStorage.getItem('gemini_api_key'));
    const pageCount = globalState.pages?.length || 0;
    let translatedCount = 0;
    if (pageCount > 0) {
        translatedCount = globalState.pages.filter(p => p.blocks && p.blocks.some(b => b.text && b.text.trim().length > 0)).length;
    }

    // Step 1: API Key
    const step1Pill = document.getElementById('stepper-step-1');
    const step1Icon = document.getElementById('stepper-step-1-icon');
    const step1Text = document.getElementById('stepper-step-1-text');
    const headerApiKeyDot = document.getElementById('header-api-status-dot');
    const emptyStateApiBanner = document.getElementById('empty-state-api-banner');

    if (step1Pill && step1Icon && step1Text) {
        if (hasKey) {
            step1Pill.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 cursor-pointer hover:bg-emerald-500/20 transition-all";
            step1Icon.className = "fa-solid fa-circle-check text-[11px] text-emerald-400";
            step1Text.innerText = "1. API Key (Sẵn sàng)";
            if (headerApiKeyDot) {
                headerApiKeyDot.className = "w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]";
            }
            if (emptyStateApiBanner) {
                emptyStateApiBanner.classList.add('hidden');
            }
        } else {
            step1Pill.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 border border-amber-500/40 text-amber-300 cursor-pointer animate-pulse hover:bg-amber-500/25 transition-all";
            step1Icon.className = "fa-solid fa-triangle-exclamation text-[11px] text-amber-400";
            step1Text.innerText = "1. Nhập API Key (Chưa có)";
            if (headerApiKeyDot) {
                headerApiKeyDot.className = "w-2 h-2 rounded-full bg-amber-400 animate-ping";
            }
            if (emptyStateApiBanner) {
                emptyStateApiBanner.classList.remove('hidden');
            }
        }
    }

    // Step 2: Upload Pages
    const step2Pill = document.getElementById('stepper-step-2');
    const step2Icon = document.getElementById('stepper-step-2-icon');
    const step2Text = document.getElementById('stepper-step-2-text');
    if (step2Pill && step2Icon && step2Text) {
        if (pageCount > 0) {
            step2Pill.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-500/10 border border-sky-500/30 text-sky-400 cursor-pointer hover:bg-sky-500/20 transition-all";
            step2Icon.className = "fa-solid fa-circle-check text-[11px] text-sky-400";
            step2Text.innerText = `2. Đã nạp (${pageCount} trang)`;
        } else {
            step2Pill.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-900 border border-slate-800 text-slate-400 cursor-pointer hover:border-slate-700 transition-all";
            step2Icon.className = "fa-regular fa-images text-[11px] text-slate-500";
            step2Text.innerText = "2. Tải ảnh truyện";
        }
    }

    // Step 3: Translate & Export
    const step3Pill = document.getElementById('stepper-step-3');
    const step3Icon = document.getElementById('stepper-step-3-icon');
    const step3Text = document.getElementById('stepper-step-3-text');
    if (step3Pill && step3Icon && step3Text) {
        if (translatedCount > 0) {
            step3Pill.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 cursor-pointer hover:bg-indigo-500/25 transition-all";
            step3Icon.className = "fa-solid fa-wand-magic-sparkles text-[11px] text-indigo-400";
            step3Text.innerText = `3. Đã dịch (${translatedCount}/${pageCount})`;
        } else if (pageCount > 0) {
            step3Pill.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-900 border border-slate-800 text-slate-300 cursor-pointer hover:border-slate-700 transition-all";
            step3Icon.className = "fa-solid fa-bolt text-[11px] text-yellow-400";
            step3Text.innerText = "3. Sẵn sàng dịch";
        } else {
            step3Pill.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-normal bg-slate-900/50 border border-slate-800/60 text-slate-500";
            step3Icon.className = "fa-solid fa-bolt text-[11px] text-slate-600";
            step3Text.innerText = "3. Dịch & Xuất bản";
        }
    }

    // Header Action Buttons Sync
    const headerBtnBatchTranslate = document.getElementById('header-btn-batch-translate');
    const headerBtnBatchExport = document.getElementById('header-btn-batch-export');
    const headerPageCountText = document.getElementById('header-page-count-text');

    if (headerBtnBatchTranslate) {
        headerBtnBatchTranslate.disabled = pageCount === 0;
    }
    if (headerBtnBatchExport) {
        headerBtnBatchExport.disabled = pageCount === 0;
    }
    if (headerPageCountText) {
        headerPageCountText.innerText = pageCount > 0 ? `${pageCount} trang` : "Chưa có trang";
    }
}

window.updateStepperUI = updateStepperUI;
window.fitCanvasToScreen = fitCanvasToScreen;
window.toggleLeftSidebarMoreMenu = toggleLeftSidebarMoreMenu;