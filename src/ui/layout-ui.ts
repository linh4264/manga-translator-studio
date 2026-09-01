import { globalState } from '../core/state';
import { elements } from '../core/elements';
import { requestOverlayRender, renderOverlays } from '../features/canvas/canvas-renderer';
import { updateToeicTabUI } from '../features/toeic';

export function setRightTab(tab: string): void {
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

export function updateProcessingOverlay(show: boolean, title: string = "Đang xử lý...", subtitle: string = "Vui lòng đợi...", progress: number = 0): void {
    const overlay = elements.processingOverlay;
    if (!overlay) return;

    if (show) {
        overlay.classList.remove('hidden');
        const titleEl = document.getElementById('processing-title');
        const subtitleEl = document.getElementById('processing-subtitle');
        const progressEl = document.getElementById('processing-progress-bar') || document.getElementById('processing-bar');
        const percentageEl = document.getElementById('processing-percentage');

        const validProgress = Math.min(100, Math.max(0, isNaN(progress) ? 0 : Number(progress)));

        if (titleEl) titleEl.textContent = title || 'Đang xử lý...';
        if (subtitleEl) {
            if (subtitle && String(subtitle).trim()) {
                subtitleEl.textContent = String(subtitle);
                subtitleEl.classList.remove('hidden');
            } else {
                subtitleEl.textContent = '';
                subtitleEl.classList.add('hidden');
            }
        }
        if (progressEl) progressEl.style.width = `${validProgress}%`;
        if (percentageEl) percentageEl.textContent = `${validProgress}%`;
    } else {
        overlay.classList.add('hidden');
    }
}

export function updateBackgroundTaskOverlay(show: boolean, title: string = "", subtitle: string = "", progress: number = 0): void {
    const bar = elements.backgroundTaskBar;
    if (!bar) return;

    if (show) {
        bar.classList.remove('hidden');
        const titleEl = document.getElementById('bg-task-title');
        const subtitleEl = document.getElementById('bg-task-subtitle');
        const progressEl = document.getElementById('bg-task-progress-bar');
        const percentageEl = document.getElementById('bg-task-percentage');

        const validProgress = Math.min(100, Math.max(0, isNaN(progress) ? 0 : Number(progress)));

        if (titleEl) titleEl.textContent = title || 'Đang phân tích ngầm...';
        if (subtitleEl) {
            if (subtitle && String(subtitle).trim()) {
                subtitleEl.textContent = String(subtitle);
                subtitleEl.classList.remove('hidden');
            } else {
                subtitleEl.textContent = '';
                subtitleEl.classList.add('hidden');
            }
        }
        if (progressEl) progressEl.style.width = `${validProgress}%`;
        if (percentageEl) percentageEl.textContent = `${validProgress}%`;
    } else {
        bar.classList.add('hidden');
    }
}

export function setViewMode(mode: 'overlay' | 'split' | 'original'): void {
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
        if (elements.mangaCanvasContainer) elements.mangaCanvasContainer.classList.add('hidden');
        updateSplitView();
    } else {
        if (elements.workspaceSplitWrapper) elements.workspaceSplitWrapper.classList.add('hidden');
        if (elements.mangaCanvasContainer) elements.mangaCanvasContainer.classList.remove('hidden');
        requestOverlayRender();
    }
}

export function updateSplitView(): void {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page) return;

    if (elements.workspaceSplitWrapper) elements.workspaceSplitWrapper.classList.remove('hidden');
    if (elements.splitOriginalImg && page.src) elements.splitOriginalImg.src = page.src;

    let mirrorImg = document.getElementById('split-editor-img-clone') as HTMLImageElement | null;
    let overlaysDiv = document.getElementById('split-overlays-clone') as HTMLElement | null;
    let mirrorContainer = document.getElementById('split-editor-container-clone') as HTMLElement | null;

    if (!mirrorContainer || !mirrorImg || !overlaysDiv) {
        if (elements.splitEditorAnchor) elements.splitEditorAnchor.innerHTML = '';

        mirrorContainer = document.createElement('div');
        mirrorContainer.className = "manga-container";
        mirrorContainer.id = "split-editor-container-clone";
        mirrorContainer.style.position = 'relative';
        mirrorContainer.style.display = 'inline-block';
        mirrorContainer.style.height = '100%';

        mirrorImg = document.createElement('img');
        mirrorImg.id = "split-editor-img-clone";
        mirrorImg.src = page.src || '';
        mirrorImg.className = "block h-full w-auto max-w-none border border-slate-800 rounded shadow-2xl select-none";
        mirrorImg.style.pointerEvents = 'none';

        overlaysDiv = document.createElement('div');
        overlaysDiv.id = "split-overlays-clone";
        overlaysDiv.className = "absolute inset-0 select-none overflow-hidden rounded z-20";

        mirrorContainer.appendChild(mirrorImg);
        mirrorContainer.appendChild(overlaysDiv);
        if (elements.splitEditorAnchor) elements.splitEditorAnchor.appendChild(mirrorContainer);
    } else if (page.src && mirrorImg.src !== page.src) {
        mirrorImg.src = page.src;
    }

    if (overlaysDiv) renderOverlays(overlaysDiv);
}

export function changeZoom(amount: number, mouseEvent: MouseEvent | null = null): void {
    const viewport = document.getElementById('workspace-viewport');
    const oldZoom = globalState.zoom;
    const newZoom = Math.max(25, Math.min(500, oldZoom + amount));
    if (newZoom === oldZoom) return;

    let targetEl: HTMLElement | null = null;
    let targetContentLeft = 0;
    let targetContentTop = 0;
    let mouseXOnTarget = 0;
    let mouseYOnTarget = 0;
    let vRect: DOMRect | null = null;

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
        elements.mangaCanvasContainer.style.width = 'max-content';

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

export function resetZoom(): void {
    globalState.zoom = 100;
    if (elements.zoomIndicator) elements.zoomIndicator.innerText = '100%';
    const dockZoomIndicator = document.getElementById('dock-zoom-indicator');
    if (dockZoomIndicator) dockZoomIndicator.innerText = '100%';

    if (elements.mangaCanvasContainer) {
        elements.mangaCanvasContainer.style.height = '100%';
        elements.mangaCanvasContainer.style.maxHeight = '100%';
        elements.mangaCanvasContainer.style.width = 'max-content';
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

export function fitCanvasToScreen(): void {
    resetZoom();
}

export function toggleLeftSidebarMoreMenu(): void {
    const menu = document.getElementById('left-more-actions-menu');
    if (menu) {
        menu.classList.toggle('hidden');
    }
}

export function toggleSidebarToolsMenu(): void {
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

export function toggleMobileSidebar(): void {
    toggleMobileLeftPanel();
}

export function openMobileLeftPanel(): void {
    document.body.classList.remove('mobile-menu-right-open');
    document.body.classList.add('mobile-menu-left-open');
    closeMobileMoreMenu();
}

export function openMobileRightPanel(tab?: string): void {
    document.body.classList.remove('mobile-menu-left-open');
    document.body.classList.add('mobile-menu-right-open');
    closeMobileMoreMenu();
    if (tab) {
        setRightTab(tab);
    }
}

export function toggleMobileLeftPanel(): void {
    if (document.body.classList.contains('mobile-menu-left-open')) {
        closeMobileMenus();
    } else {
        openMobileLeftPanel();
    }
}

export function toggleMobileRightPanel(tab?: string): void {
    if (document.body.classList.contains('mobile-menu-right-open')) {
        closeMobileMenus();
    } else {
        openMobileRightPanel(tab);
    }
}

export function closeMobileMenus(): void {
    document.body.classList.remove('mobile-menu-left-open');
    document.body.classList.remove('mobile-menu-right-open');
    elements.sidebarPanel?.classList.remove('mobile-open');
    document.getElementById('right-panel')?.classList.remove('mobile-open');
    closeMobileMoreMenu();
}

export function toggleMobileMoreMenu(): void {
    const sheet = document.getElementById('mobile-more-sheet');
    const backdrop = document.getElementById('mobile-more-backdrop');
    if (!sheet) return;

    const isHidden = sheet.classList.contains('hidden');
    if (isHidden) {
        closeMobileMenus();
        sheet.classList.remove('hidden');
        if (backdrop) backdrop.classList.remove('hidden');
    } else {
        closeMobileMoreMenu();
    }
}

export function closeMobileMoreMenu(): void {
    const sheet = document.getElementById('mobile-more-sheet');
    const backdrop = document.getElementById('mobile-more-backdrop');
    if (sheet) sheet.classList.add('hidden');
    if (backdrop) backdrop.classList.add('hidden');
}

export function navigateMobilePage(direction: number): void {
    const total = globalState.pages?.length || 0;
    if (total === 0) return;

    let nextIndex = globalState.activePageIndex + direction;
    if (nextIndex < 0) nextIndex = 0;
    if (nextIndex >= total) nextIndex = total - 1;

    if (nextIndex !== globalState.activePageIndex) {
        import('./pages-ui').then(m => m.selectPage(nextIndex));
    }
}

export function updateMobileNavUI(): void {
    const pageCount = globalState.pages?.length || 0;
    const curIndex = globalState.activePageIndex;

    const mobileCanvasDock = document.getElementById('mobile-canvas-dock');
    const mobilePageIndicator = document.getElementById('mobile-dock-page-indicator');
    const mobileNavPageText = document.getElementById('mobile-nav-page-text');
    const mobileBtnPrev = document.getElementById('btn-mobile-prev-page') as HTMLButtonElement | null;
    const mobileBtnNext = document.getElementById('btn-mobile-next-page') as HTMLButtonElement | null;
    const mobileBadgePages = document.getElementById('mobile-nav-page-badge');
    const mobileBtnTranslate = document.getElementById('btn-mobile-dock-translate') as HTMLButtonElement | null;

    const pageStr = pageCount > 0 ? `${curIndex + 1} / ${pageCount}` : "0 / 0";
    if (mobilePageIndicator) {
        mobilePageIndicator.innerText = pageStr;
    }
    if (mobileNavPageText) {
        mobileNavPageText.innerText = pageStr;
    }

    if (mobileCanvasDock) {
        if (pageCount > 0 && curIndex !== -1) {
            mobileCanvasDock.classList.remove('hidden');
        } else {
            mobileCanvasDock.classList.add('hidden');
        }
    }

    if (mobileBadgePages) {
        if (pageCount > 0) {
            mobileBadgePages.innerText = String(pageCount);
            mobileBadgePages.classList.remove('hidden');
        } else {
            mobileBadgePages.classList.add('hidden');
        }
    }

    if (mobileBtnPrev) {
        mobileBtnPrev.disabled = curIndex <= 0;
    }
    if (mobileBtnNext) {
        mobileBtnNext.disabled = curIndex >= pageCount - 1 || curIndex === -1;
    }
    if (mobileBtnTranslate) {
        mobileBtnTranslate.disabled = pageCount === 0 || curIndex === -1;
    }
}

export function openMobileQuickEditor(blockId?: string): void {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks || page.blocks.length === 0) {
        import('../core/utils/dom').then(m => m.showToast("Chưa có ô thoại nào. Nhấn [+ Thêm ô] để tạo!", "info"));
        return;
    }

    if (blockId) {
        globalState.selectedBlockId = blockId;
    } else if (!globalState.selectedBlockId || !page.blocks.some(b => b.id === globalState.selectedBlockId)) {
        globalState.selectedBlockId = page.blocks[0].id;
    }

    const activeBlock = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!activeBlock) return;

    const sheet = document.getElementById('mobile-quick-edit-sheet');
    const backdrop = document.getElementById('mobile-quick-edit-backdrop');
    const title = document.getElementById('mobile-quick-edit-title');
    const origPreview = document.getElementById('mobile-quick-edit-orig-preview');
    const textarea = document.getElementById('mobile-quick-edit-textarea') as HTMLTextAreaElement | null;
    const fontSizeText = document.getElementById('mobile-quick-font-size-text');
    const orientText = document.getElementById('mobile-quick-orientation-text');

    if (title) title.innerText = `Ô thoại #${activeBlock.id.slice(-4)}`;
    if (origPreview) origPreview.innerText = activeBlock.original ? `Gốc: ${activeBlock.original}` : '';
    if (textarea) {
        textarea.value = activeBlock.translated || '';
        if (!textarea.dataset.bound) {
            textarea.dataset.bound = "true";
            textarea.addEventListener('input', () => {
                const curPage = globalState.pages[globalState.activePageIndex];
                const curBlock = curPage?.blocks?.find(b => b.id === globalState.selectedBlockId);
                if (curBlock) {
                    curBlock.translated = textarea.value;
                    curBlock.autoFitCache = null;
                    requestOverlayRender();
                }
            });
        }
    }

    const curSize = activeBlock.style?.fontSize || 17;
    if (fontSizeText) fontSizeText.innerText = `${curSize}px`;
    if (orientText) orientText.innerText = activeBlock.style?.vertical ? "Dọc" : "Ngang";

    if (backdrop) backdrop.classList.remove('hidden');
    if (sheet) sheet.classList.remove('hidden');

    closeMobileMenus();

    setTimeout(() => {
        textarea?.focus();
    }, 100);
}

export function closeMobileQuickEditor(): void {
    const sheet = document.getElementById('mobile-quick-edit-sheet');
    const backdrop = document.getElementById('mobile-quick-edit-backdrop');
    if (sheet) sheet.classList.add('hidden');
    if (backdrop) backdrop.classList.add('hidden');

    if (globalState.activePageIndex !== -1) {
        const page = globalState.pages[globalState.activePageIndex];
        if (page) {
            import('../core/state').then(m => m.savePageToDB(page));
        }
    }
}

export function triggerMobileQuickEdit(): void {
    if (window.innerWidth < 1024) {
        openMobileQuickEditor();
    } else {
        openMobileRightPanel('edit');
    }
}

export function changeMobileActiveFontSize(delta: number): void {
    if (globalState.activePageIndex === -1 || !globalState.selectedBlockId) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page?.blocks?.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    if (!block.style) block.style = {} as any;
    const curSize = block.style.fontSize || 17;
    const newSize = Math.max(8, Math.min(120, curSize + delta));
    block.style.fontSize = newSize;
    block.autoFitCache = null;

    const fontSizeText = document.getElementById('mobile-quick-font-size-text');
    if (fontSizeText) fontSizeText.innerText = `${newSize}px`;

    requestOverlayRender();
}

export function toggleMobileActiveOrientation(): void {
    if (globalState.activePageIndex === -1 || !globalState.selectedBlockId) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page?.blocks?.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    if (!block.style) block.style = {} as any;
    block.style.vertical = !block.style.vertical;
    block.autoFitCache = null;

    const orientText = document.getElementById('mobile-quick-orientation-text');
    if (orientText) orientText.innerText = block.style.vertical ? "Dọc" : "Ngang";

    requestOverlayRender();
}

export function deleteMobileActiveBlock(): void {
    if (globalState.activePageIndex === -1 || !globalState.selectedBlockId) return;
    import('../features/canvas/canvas-actions').then(m => {
        (m as any).deleteSelectedBlock?.();
        closeMobileQuickEditor();
    });
}

export function syncMobileMenuState(): void {
    if (window.innerWidth >= 1024) {
        closeMobileMenus();
    }
    updateMobileNavUI();
}

export function syncMobileToolbarState(): void {
    const toolbar = document.getElementById('mobile-bottom-toolbar');
    if (toolbar) toolbar.classList.toggle('hidden', window.innerWidth >= 1024);
    updateMobileNavUI();
}

function toggleSidebar(panelId: string, handleId: string, openIconClass: string, closeIconClass: string): void {
    if (window.innerWidth < 1024) {
        if (panelId === 'left-panel') {
            toggleMobileLeftPanel();
        } else {
            toggleMobileRightPanel();
        }
        return;
    }

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

export const toggleLeftSidebar = (): void => toggleSidebar('left-panel', 'left-sidebar-toggle-handle', 'fa-solid fa-chevron-right', 'fa-solid fa-chevron-left');
export const toggleRightSidebar = (): void => toggleSidebar('right-panel', 'right-sidebar-toggle-handle', 'fa-solid fa-chevron-left', 'fa-solid fa-chevron-right');

export function toggleQuickBilingualMode(): void {
    const newMode = globalState.bilingualMode === 'sub' ? 'off' : 'sub';
    import('./block-editor-ui').then(m => m.setBilingualMode(newMode));

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

export function toggleQuickAudioDrama(): void {
    const btn = document.getElementById('btn-audio-toggle-quick');
    const icon = document.getElementById('icon-audio-quick');
    const isPlaying = icon && icon.classList.contains('text-emerald-400');

    if (isPlaying) {
        import('../features/audio').then(m => m.stopAudioDrama());
        if (icon) {
            icon.className = 'fa-solid fa-headphones text-xs';
        }
        if (btn) {
            btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-500');
            btn.classList.add('bg-slate-950', 'text-slate-400', 'border-slate-800');
        }
    } else {
        import('../features/audio').then(m => m.playPageAudioDrama());
        if (icon) {
            icon.className = 'fa-solid fa-circle-stop text-emerald-400 text-xs animate-pulse';
        }
        if (btn) {
            btn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-500');
            btn.classList.remove('bg-slate-950', 'text-slate-400', 'border-slate-800');
        }
    }
}

export function openHelpModal(): void {
    const modal = document.getElementById('help-modal');
    if (modal) {
        modal.classList.remove('hidden');
        switchHelpTab('shortcuts');
    }
}

export function closeHelpModal(): void {
    const modal = document.getElementById('help-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

export function switchHelpTab(tabName: string): void {
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

export function updateStepperUI(): void {
    const hasKey = !!(
        (globalState.apiKey && globalState.apiKey.trim().length > 0) ||
        (localStorage.getItem('gemini_manga_api_key') && localStorage.getItem('gemini_manga_api_key')!.trim().length > 0) ||
        (localStorage.getItem('gemini_api_key') && localStorage.getItem('gemini_api_key')!.trim().length > 0)
    );
    const pageCount = globalState.pages?.length || 0;
    let translatedCount = 0;
    if (pageCount > 0) {
        translatedCount = globalState.pages.filter(p => p.blocks && p.blocks.some(b => b.translated && b.translated.trim().length > 0)).length;
    }

    const headerApiKeyDot = document.getElementById('header-api-status-dot');
    const emptyStateApiBanner = document.getElementById('empty-state-api-banner');

    if (headerApiKeyDot) {
        if (hasKey) {
            headerApiKeyDot.className = "w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]";
            headerApiKeyDot.setAttribute('title', 'API Key: Đã sẵn sàng');
        } else {
            headerApiKeyDot.className = "w-2 h-2 rounded-full bg-amber-400 animate-ping";
            headerApiKeyDot.setAttribute('title', 'API Key: Chưa nhập');
        }
    }

    if (emptyStateApiBanner) {
        if (hasKey) {
            emptyStateApiBanner.classList.add('hidden');
        } else {
            emptyStateApiBanner.classList.remove('hidden');
        }
    }

    const step1Pill = document.getElementById('stepper-step-1');
    const step1Icon = document.getElementById('stepper-step-1-icon');
    const step1Text = document.getElementById('stepper-step-1-text');

    if (step1Pill && step1Icon && step1Text) {
        if (hasKey) {
            step1Pill.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 cursor-pointer hover:bg-emerald-500/20 transition-all";
            step1Icon.className = "fa-solid fa-circle-check text-[11px] text-emerald-400";
            step1Text.innerText = "1. API Key (Sẵn sàng)";
        } else {
            step1Pill.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 border border-amber-500/40 text-amber-300 cursor-pointer animate-pulse hover:bg-amber-500/25 transition-all";
            step1Icon.className = "fa-solid fa-triangle-exclamation text-[11px] text-amber-400";
            step1Text.innerText = "1. Nhập API Key (Chưa có)";
        }
    }

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

    const headerBtnBatchTranslate = document.getElementById('header-btn-batch-translate') as HTMLButtonElement | null;
    const headerBtnBatchExport = document.getElementById('header-btn-batch-export') as HTMLButtonElement | null;
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

    updateMobileNavUI();
}

/**
 * Synchronize UI layout based on User Tier (Basic vs Pro) and Expert Mode state
 */
export function syncUserTierLayout(): void {
    import('../features/auth/auth-manager').then(({ isProUser, isExpertMode }) => {
        const isPro = isProUser();
        const expert = isExpertMode();

        // 1. Right Panel controls - keep core typesetting accessible
        const sfxControls = document.getElementById('sfx-controls-container');
        const textOffsetControls = document.getElementById('text-offset-controls-container');
        const tabToeicBtn = document.getElementById('tab-toeic');

        if (sfxControls) sfxControls.classList.remove('hidden');
        if (textOffsetControls) textOffsetControls.classList.remove('hidden');

        if (tabToeicBtn) {
            if (isPro && expert) tabToeicBtn.classList.remove('hidden');
            else tabToeicBtn.classList.add('hidden');
        }

        // 2. Left Panel quick pipeline triggers - always accessible for fast workflow
        const pipelineQuickTriggers = document.getElementById('chapter-pipeline-quick-triggers');
        if (pipelineQuickTriggers) {
            pipelineQuickTriggers.classList.remove('hidden');
        }

        // 3. Update Pipeline Header Stepper
        import('./pipeline-header-ui').then(m => m.renderPipelineHeaderStepper());
    });

}

// Subscribe to auth events
import('../core/events').then(({ globalBus }) => {
    globalBus.subscribe('auth:tier-changed', () => syncUserTierLayout());
    globalBus.subscribe('auth:state-changed', () => syncUserTierLayout());
});


