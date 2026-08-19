import {
    setRightTab, updateProcessingOverlay, updateBackgroundTaskOverlay,
    setViewMode, updateSplitView, changeZoom, resetZoom, fitCanvasToScreen,
    toggleSidebarToolsMenu, toggleMobileSidebar, syncMobileMenuState, syncMobileToolbarState,
    closeMobileMenus, toggleLeftSidebar, toggleRightSidebar, toggleQuickBilingualMode, toggleQuickAudioDrama,
    openHelpModal, closeHelpModal, switchHelpTab, toggleLeftSidebarMoreMenu,
    openMobileLeftPanel, openMobileRightPanel, toggleMobileLeftPanel, toggleMobileRightPanel,
    toggleMobileMoreMenu, closeMobileMoreMenu, navigateMobilePage, updateMobileNavUI
} from './layout-ui';
import { initTouchGestures, toggleMobileHandMode, isMobileHandModeActive } from '../features/canvas/touch-gestures';

import {
    selectPage, removePage, updatePageListUI, filterPagesList,
    toggleExportRangeInputs, validateExportRange, setExportRangeToCurrent,
    triggerReplaceBgImage, handleReplaceBgFileInput
} from './pages-ui';

import {
    updateActiveBlockEditor, restoreBackgroundForBlock, restoreOriginalBackground,
    syncTextColorHex, syncBgColorHex, syncStrokeColorHex, syncShadowColorHex,
    setBilingualMode, setActiveBlockGender, setBlockType,
    insertRichTextTag, applyRichColorToSelection, applyRichSizeToSelection, clearRichFormattingFromSelection, toggleDiamondWrapActiveBlock,
    toggleGradientEnabled, syncGradientStartHex, syncGradientEndHex, updateGradientAngle
} from './block-editor-ui';

import {
    toggleApiKeyVisibility, updateSelectedModel, updateModelDropdown, fetchGeminiModels,
    updateModelLockingUI, mountSettingsModal, openSettingsModal, closeSettingsModal, switchSettingsTab,
    updateDefaultFont, updateDefaultTypeFont,
    updateSourceLanguage, updateTargetLanguage, updatePronounMatrix, updateGlossary,
    toggleStoryMemory, updateStoryMemoryBadge, togglePreserveNames, syncGenrePresetCheckboxes,
    saveTranslationGenrePresets, updateTranslationGenrePreset, updateTranslationContextPrompt,
    updateComicUniverse, updateComicGenre, toggleComicGenre, updateComicTone,
    updateApiDelay, updateMaxRetries, updateAiProvider, updateApiEndpoint,
    updateExportFormat, updateExportPdfQuality
} from './settings-ui';

import {
    previewCurrentPage, openPreviewMode, closePreviewMode,
    previewKeyHandler, previewPrevPage, previewNextPage, renderPreviewPage
} from './preview-ui';

import { populateCustomFontsDropdown, registerCustomFont, uploadCustomFonts } from './font-ui';

import {
    openLorebookModal, closeLorebookModal, switchLorebookTab,
    renderCharacterDossierUI, addCharacterDossierEntry, removeCharacterDossierEntry,
    renderLorebookUI, addLorebookTermEntry, removeLorebookTermEntry,
    exportLorebookJSON, importLorebookJSON
} from './lorebook-ui';

import { globalState, stateEvents, debounceSavePage } from '../core/state';
import { CUSTOM_MODEL_VALUE } from '../config/constants';
import { globalBus } from '../core/events';
import { elements } from '../core/elements';
import { copyBlockStyle, pasteBlockStyle, navigateBlocks, syncActiveBlockStyle, selectAllBlocksOnPage, copiedStyle } from '../features/canvas/canvas-service';
import { safeSetLocalStorage } from '../core/utils/storage';
import { runLocalOcrDetectionOnPage } from '../features/ocr/ocr-service';

export {
    setRightTab, updateProcessingOverlay, updateBackgroundTaskOverlay,
    setViewMode, updateSplitView, changeZoom, resetZoom,
    toggleSidebarToolsMenu, toggleMobileSidebar, syncMobileMenuState, syncMobileToolbarState,
    closeMobileMenus, toggleLeftSidebar, toggleRightSidebar,
    selectPage, removePage, updatePageListUI, filterPagesList, toggleExportRangeInputs, validateExportRange,
    updateActiveBlockEditor, restoreBackgroundForBlock, restoreOriginalBackground,
    syncTextColorHex, syncBgColorHex, syncStrokeColorHex, syncShadowColorHex,
    setBilingualMode, setActiveBlockGender, setBlockType,
    toggleApiKeyVisibility, updateSelectedModel, updateModelDropdown, fetchGeminiModels,
    updateModelLockingUI, mountSettingsModal, openSettingsModal, closeSettingsModal,
    updateDefaultFont, updateDefaultTypeFont,
    updateSourceLanguage, updateTargetLanguage, updatePronounMatrix, updateGlossary,
    toggleStoryMemory, updateStoryMemoryBadge, togglePreserveNames, syncGenrePresetCheckboxes,
    saveTranslationGenrePresets, updateTranslationGenrePreset, updateTranslationContextPrompt,
    updateApiDelay, updateMaxRetries, updateAiProvider, updateApiEndpoint,
    updateExportFormat, updateExportPdfQuality,
    previewCurrentPage, openPreviewMode, closePreviewMode,
    previewKeyHandler, previewPrevPage, previewNextPage, renderPreviewPage,
    populateCustomFontsDropdown, registerCustomFont, uploadCustomFonts,
    openLorebookModal, closeLorebookModal, switchLorebookTab,
    renderCharacterDossierUI, addCharacterDossierEntry, removeCharacterDossierEntry,
    renderLorebookUI, addLorebookTermEntry, removeLorebookTermEntry,
    exportLorebookJSON, importLorebookJSON
};

export async function updateUndoRedoUI(): Promise<void> {
    const { undoStack, redoStack } = await import('../core/state');
    if (elements.btnUndo) elements.btnUndo.disabled = undoStack.length === 0;
    if (elements.btnRedo) elements.btnRedo.disabled = redoStack.length === 0;
}

export function initEventListeners(): void {
    globalBus.subscribe(stateEvents.PAGE_LIST_UPDATED, () => updatePageListUI());
    globalBus.subscribe(stateEvents.PROCESSING_OVERLAY, (data: any) => updateProcessingOverlay(data.show, data.message, data.subtitle, data.percent));
    globalBus.subscribe(stateEvents.BACKGROUND_TASK_OVERLAY, (data: any) => updateBackgroundTaskOverlay(data.show, data.message, data.subtitle, data.progress));
    globalBus.subscribe(stateEvents.ACTIVE_BLOCK_EDITOR_UPDATED, () => updateActiveBlockEditor());
    globalBus.subscribe(stateEvents.SPLIT_VIEW_UPDATED, () => updateSplitView());
    globalBus.subscribe(stateEvents.RIGHT_TAB_CHANGED, (tab: any) => setRightTab(tab));

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input') as HTMLInputElement | null;

    if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('border-indigo-500', 'bg-indigo-600/5');
        });
        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('border-indigo-500', 'bg-indigo-600/5');
        });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('border-indigo-500', 'bg-indigo-600/5');
            if (e.dataTransfer?.files?.length) {
                const fontFiles = Array.from(e.dataTransfer.files).filter(f => /\.(ttf|otf|woff|woff2)$/i.test(f.name));
                if (fontFiles.length > 0) {
                    import('./font-ui').then(f => f.uploadCustomFonts(fontFiles));
                }
                const nonFontFiles = Array.from(e.dataTransfer.files).filter(f => !/\.(ttf|otf|woff|woff2)$/i.test(f.name));
                if (nonFontFiles.length > 0) {
                    import('../features/io').then(io => io.handleUploadedFiles(nonFontFiles));
                }
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.files?.length) {
                const fontFiles = Array.from(target.files).filter(f => /\.(ttf|otf|woff|woff2)$/i.test(f.name));
                if (fontFiles.length > 0) {
                    import('./font-ui').then(f => f.uploadCustomFonts(fontFiles));
                }
                const nonFontFiles = Array.from(target.files).filter(f => !/\.(ttf|otf|woff|woff2)$/i.test(f.name));
                if (nonFontFiles.length > 0) {
                    import('../features/io').then(io => io.handleUploadedFiles(nonFontFiles));
                }
            }
        });
    }

    const viewport = document.getElementById('workspace-viewport');
    if (viewport) {
        initTouchGestures();
        viewport.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        viewport.addEventListener('drop', (e) => {
            if (e.dataTransfer?.files?.length) {
                const fontFiles = Array.from(e.dataTransfer.files).filter(f => /\.(ttf|otf|woff|woff2)$/i.test(f.name));
                if (fontFiles.length > 0) {
                    e.preventDefault();
                    import('./font-ui').then(f => f.uploadCustomFonts(fontFiles));
                    return;
                }
                if (globalState.activePageIndex !== -1) {
                    const file = e.dataTransfer.files[0];
                    if (file && file.type.startsWith('image/')) {
                        e.preventDefault();
                        import('./pages-ui').then(p => p.replacePageBackgroundImage(globalState.activePageIndex, file));
                    }
                }
            }
        });
    }

    if (elements.pagesList) {
        elements.pagesList.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const replaceBtn = target.closest('[data-action="replace-bg-page"]') as HTMLElement | null;
            if (replaceBtn) {
                e.stopPropagation();
                const index = Number(replaceBtn.dataset.index);
                if (Number.isInteger(index)) {
                    triggerReplaceBgImage(index);
                }
                return;
            }

            const translateBtn = target.closest('[data-action="translate-page"]') as HTMLElement | null;
            if (translateBtn) {
                e.stopPropagation();
                const index = Number(translateBtn.dataset.index);
                if (Number.isInteger(index)) {
                    import('../features/ai/ai-service').then(ai => ai.translateSinglePageInBatch(index));
                }
                return;
            }

            const removeBtn = target.closest('[data-action="remove-page"]') as HTMLElement | null;
            if (removeBtn) {
                e.stopPropagation();
                const index = Number(removeBtn.dataset.index);
                if (Number.isInteger(index)) removePage(index);
                return;
            }

            const pageItem = target.closest('[data-page-index]') as HTMLElement | null;
            if (pageItem) {
                const index = Number(pageItem.dataset.pageIndex);
                if (Number.isInteger(index)) selectPage(index);
            }
        });
    }

    if (elements.apiKeyInput) {
        elements.apiKeyInput.addEventListener('input', (e: Event) => {
            const target = e.target as HTMLInputElement;
            const key = target.value.trim();
            globalState.apiKey = key;
            safeSetLocalStorage('gemini_manga_api_key', key);
            updateModelLockingUI();
            import('./layout-ui').then(m => m.updateStepperUI());
            if (key.startsWith('AIzaSy') && key.length >= 35) {
                fetchGeminiModels();
            }
        });
    }

    if (elements.editOriginalText) {
        elements.editOriginalText.addEventListener('input', (e: Event) => {
            if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
            const target = e.target as HTMLTextAreaElement;
            const page = globalState.pages[globalState.activePageIndex];
            const block = page?.blocks?.find(b => b.id === globalState.selectedBlockId);
            if (block && page) {
                block.original = target.value;
                globalState.activeBlockToeicAnalysis = null;
                debounceSavePage(page);
            }
        });
    }

    if (elements.customModelInput) {
        elements.customModelInput.addEventListener('input', () => {
            const select = document.getElementById('model-select') as HTMLSelectElement | null;
            if (select?.value === CUSTOM_MODEL_VALUE && !select?.disabled) {
                updateSelectedModel(CUSTOM_MODEL_VALUE);
            }
        });
    }

    document.querySelectorAll('.genre-preset-option').forEach((checkbox) => {
        checkbox.addEventListener('change', () => updateTranslationGenrePreset());
    });

    window.addEventListener('wheel', (e: WheelEvent) => {
        const target = e.target as HTMLElement | null;
        const isInsideViewport = target?.closest?.('#workspace-viewport');
        if (isInsideViewport) {
            const viewport = document.getElementById('workspace-viewport');
            if (e.altKey) {
                e.preventDefault();
                const amount = e.deltaY < 0 ? 10 : -10;
                changeZoom(amount, e);
            } else if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                if (viewport) {
                    const delta = e.deltaY || e.deltaX;
                    const targetEl = (elements.workspaceSplitWrapper && !elements.workspaceSplitWrapper.classList.contains('hidden'))
                        ? elements.workspaceSplitWrapper
                        : elements.mangaCanvasContainer;

                    if (targetEl && delta < 0) {
                        const vRect = viewport.getBoundingClientRect();
                        const tRect = targetEl.getBoundingClientRect();
                        const currentLeftOffset = tRect.left - vRect.left;

                        if (currentLeftOffset >= 0) {
                            return;
                        }

                        const deltaToApply = Math.max(delta, currentLeftOffset);
                        viewport.scrollLeft += deltaToApply;
                    } else {
                        viewport.scrollLeft += delta;
                    }
                }
            }
        }
    }, { passive: false });

    window.addEventListener('resize', () => {
        syncMobileMenuState();
        syncMobileToolbarState();
    });

    (window as any).__isSpacePanPressed = false;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let scrollStartX = 0;
    let scrollStartY = 0;

    function isTextInputActive(target: any): boolean {
        if (!target) return false;
        const active = document.activeElement;
        const isTargetInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable || target.classList?.contains('inline-text-editor');
        const isActiveInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable || active.classList?.contains('inline-text-editor'));
        return isTargetInput || isActiveInput;
    }

    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.code === 'Space' || e.key === ' ') {
            if (isTextInputActive(e.target)) return;
            if (!(window as any).__isSpacePanPressed) {
                (window as any).__isSpacePanPressed = true;
                const viewport = document.getElementById('workspace-viewport');
                if (viewport) viewport.classList.add('space-pan-active');
                document.body?.classList.add('space-pan-active');
            }
            e.preventDefault();
        }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
        if (e.code === 'Space' || e.key === ' ') {
            (window as any).__isSpacePanPressed = false;
            const viewport = document.getElementById('workspace-viewport');
            if (viewport) viewport.classList.remove('space-pan-active');
            document.body?.classList.remove('space-pan-active');
            if (!isPanning && viewport) {
                viewport.classList.remove('space-panning');
                document.body?.classList.remove('space-panning');
            }
        }
    });

    window.addEventListener('blur', () => {
        (window as any).__isSpacePanPressed = false;
        isPanning = false;
        const viewport = document.getElementById('workspace-viewport');
        if (viewport) {
            viewport.classList.remove('space-pan-active');
            viewport.classList.remove('space-panning');
        }
        document.body?.classList.remove('space-pan-active');
        document.body?.classList.remove('space-panning');
    });

    window.addEventListener('mousedown', (e: MouseEvent) => {
        const isMiddleClick = e.button === 1;
        const isLeftSpaceDrag = e.button === 0 && (window as any).__isSpacePanPressed;

        if (isMiddleClick || isLeftSpaceDrag) {
            const viewport = document.getElementById('workspace-viewport');
            if (viewport) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                isPanning = true;
                panStartX = e.clientX;
                panStartY = e.clientY;
                scrollStartX = viewport.scrollLeft;
                scrollStartY = viewport.scrollTop;

                viewport.classList.add('space-panning');
                document.body?.classList.add('space-panning');
            }
        }
    }, true);

    window.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isPanning) return;
        const viewport = document.getElementById('workspace-viewport');
        if (!viewport) return;

        e.preventDefault();
        const dx = e.clientX - panStartX;
        const dy = e.clientY - panStartY;

        viewport.scrollLeft = scrollStartX - dx;
        viewport.scrollTop = scrollStartY - dy;
    }, { passive: false } as any);

    window.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            const viewport = document.getElementById('workspace-viewport');
            if (viewport) {
                viewport.classList.remove('space-panning');
                if (!(window as any).__isSpacePanPressed) {
                    viewport.classList.remove('space-pan-active');
                }
            }
            document.body?.classList.remove('space-panning');
            if (!(window as any).__isSpacePanPressed) {
                document.body?.classList.remove('space-pan-active');
            }
        }
    }, true);

    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === '=' || e.key === '+') {
                e.preventDefault();
                changeZoom(10);
                return;
            }
            if (e.key === '-') {
                e.preventDefault();
                changeZoom(-10);
                return;
            }
            if (e.key === '0') {
                e.preventDefault();
                resetZoom();
                return;
            }
            if (!e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                import('../core/state').then(s => s.executeUndo());
                return;
            }
            if (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) {
                e.preventDefault();
                import('../core/state').then(s => s.executeRedo());
                return;
            }
            if (e.key === 'Enter' || e.code === 'Enter') {
                e.preventDefault();
                if (globalState.activePageIndex !== -1) {
                    import('../features/ai/ai-service').then(m => m.translateActivePage());
                } else {
                    import('../core/utils').then(m => m.showToast("Hãy chọn một trang truyện trước khi dịch.", "warn"));
                }
                return;
            }
            if (e.key.toLowerCase() === 'f' && !e.shiftKey) {
                e.preventDefault();
                import('../features/io').then(m => m.openFindReplaceModal());
                return;
            }
            if (e.key.toLowerCase() === 'd' && !e.shiftKey) {
                if (globalState.selectedBlockId !== null) {
                    e.preventDefault();
                    import('../features/canvas/canvas-actions').then(m => m.duplicateActiveBlock());
                    return;
                }
            }
            if (e.key.toLowerCase() === 'b' && !e.shiftKey) {
                e.preventDefault();
                import('../features/canvas/canvas-service').then(canvas => canvas.addNewBlock());
                return;
            }
        }

        if (isTextInputActive(e.target)) {
            const targetEl = e.target as HTMLElement;
            if ((e.ctrlKey || e.metaKey) && targetEl.id === 'edit-translated-text') {
                if (e.key.toLowerCase() === 'b') {
                    e.preventDefault();
                    insertRichTextTag('[b]', '[/b]');
                    return;
                }
                if (e.key.toLowerCase() === 'i') {
                    e.preventDefault();
                    insertRichTextTag('[i]', '[/i]');
                    return;
                }
                if (e.key.toLowerCase() === 'u') {
                    e.preventDefault();
                    insertRichTextTag('[u]', '[/u]');
                    return;
                }
            }
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            selectAllBlocksOnPage();
            return;
        }

        if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            fitCanvasToScreen();
            return;
        }

        if ((e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            import('../features/canvas/canvas-service').then(canvas => canvas.toggleMagicWandMode());
            return;
        }

        if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            import('../features/inpainting').then(inpainting => inpainting.toggleEraserMode());
            return;
        }

        if ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            import('../features/canvas/canvas-service').then(canvas => canvas.addNewBlock());
            return;
        }

        if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (globalState.selectedBlockId !== null) {
                import('../features/canvas/canvas-renderer').then(canvas => canvas.triggerInlineEditActiveBlock());
            } else {
                import('../features/canvas/canvas-service').then(canvas => canvas.addNewBlock());
            }
            return;
        }

        if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            return;
        }

        if ((e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            changeZoom(e.altKey || e.shiftKey ? -15 : 15);
            return;
        }

        if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            import('../features/canvas/canvas-service').then(canvas => canvas.addNewBlock());
            return;
        }

        if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (globalState.selectedBlockId !== null) {
                globalState.selectedBlockId = null;
                globalState.selectedBlockIds = [];
                updateActiveBlockEditor();
                import('../features/canvas/canvas-service').then(cs => cs.requestOverlayRender());
            } else {
                const nextMode = globalState.viewMode === 'overlay' ? 'split' : (globalState.viewMode === 'split' ? 'original' : 'overlay');
                setViewMode(nextMode);
            }
            return;
        }

        if (globalState.selectedBlockId !== null && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && (e.shiftKey || e.altKey)) {
            const activePage = globalState.pages[globalState.activePageIndex];
            const block = activePage ? activePage.blocks.find(b => b.id === globalState.selectedBlockId) : null;
            if (block && block.box) {
                e.preventDefault();
                import('../core/state').then(st => st.pushStateToHistory());
                const step = e.altKey ? 0.1 : 0.5;
                if (e.key === 'ArrowLeft') block.box.x = Math.max(0, Number((block.box.x - step).toFixed(2)));
                if (e.key === 'ArrowRight') block.box.x = Math.min(100 - block.box.w, Number((block.box.x + step).toFixed(2)));
                if (e.key === 'ArrowUp') block.box.y = Math.max(0, Number((block.box.y - step).toFixed(2)));
                if (e.key === 'ArrowDown') block.box.y = Math.min(100 - block.box.h, Number((block.box.y + step).toFixed(2)));
                block.maskCache = null;
                import('../features/canvas/canvas-service').then(cs => cs.requestOverlayRender());
                import('../core/state').then(st => st.savePageToDB(activePage));
                return;
            }
        }

        if (globalState.selectedBlockId === null && !e.shiftKey && !e.altKey) {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (globalState.activePageIndex > 0) selectPage(globalState.activePageIndex - 1);
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (globalState.activePageIndex < globalState.pages.length - 1) selectPage(globalState.activePageIndex + 1);
                return;
            }
        }

        if (globalState.selectedBlockId !== null) {
            const activePage = globalState.pages[globalState.activePageIndex];
            if (!activePage) return;
            const block = activePage.blocks.find(b => b.id === globalState.selectedBlockId);
            if (!block) return;

            if (e.key === 'F2' || e.key === 'Enter') {
                e.preventDefault();
                import('../features/canvas/canvas-renderer').then(canvas => canvas.triggerInlineEditActiveBlock());
                return;
            }

            const FONT_SIZE_STEPS = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
            if (e.key === '[') {
                e.preventDefault();
                const cur = block.style.fontSize || 13;
                const prev = [...FONT_SIZE_STEPS].reverse().find(s => s < cur) || FONT_SIZE_STEPS[0];
                syncActiveBlockStyle('fontSize', prev);
            } else if (e.key === ']') {
                e.preventDefault();
                const cur = block.style.fontSize || 13;
                const next = FONT_SIZE_STEPS.find(s => s > cur) || FONT_SIZE_STEPS[FONT_SIZE_STEPS.length - 1];
                syncActiveBlockStyle('fontSize', next);
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                import('../features/canvas/canvas-service').then(canvas => canvas.deleteActiveBlock());
            }
        }

        if ((e.key === '[' || e.key === ']') && globalState.selectedBlockId === null) {
            import('../features/inpainting').then(inpainting => {
                if (inpainting.isEraserModeActive) {
                    e.preventDefault();
                    const delta = e.key === '[' ? -5 : 5;
                    const newSize = Math.max(3, Math.min(100, (inpainting.eraserBrushSize || 15) + delta));
                    inpainting.setEraserBrushSize?.(newSize);
                    const slider = document.getElementById('slider-eraser-size') as HTMLInputElement | null;
                    const lbl = document.getElementById('lbl-eraser-size');
                    if (slider) slider.value = String(newSize);
                    if (lbl) lbl.textContent = `${newSize}px`;
                }
            });
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            navigateBlocks(e.shiftKey ? -1 : 1);
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();

            if (globalState.magicWandDetectedBox || globalState.magicWandActive) {
                import('../features/canvas/canvas-service').then(canvas => {
                    canvas.clearMagicWandPreview();
                });
            }

            const modalIds = [
                'help-modal',
                'settings-modal',
                'lorebook-dossier-modal',
                'gdrive-modal',
                'audio-settings-modal',
                'srs-review-modal',
                'find-replace-modal',
                'export-modal',
                'preview-modal',
                'left-more-actions-menu'
            ];

            let closedAnyModal = false;
            for (const id of modalIds) {
                const m = document.getElementById(id);
                if (m && !m.classList.contains('hidden')) {
                    m.classList.add('hidden');
                    closedAnyModal = true;
                }
            }
            if (closedAnyModal) return;

            if (globalState.selectedBlockId) {
                const prevEl = document.getElementById(globalState.selectedBlockId);
                if (prevEl) prevEl.classList.remove('active');
                globalState.selectedBlockId = null;
                globalState.selectedBlockIds = [];
                if (elements.btnCopyStyle) elements.btnCopyStyle.disabled = true;
                if (elements.btnPasteStyle) elements.btnPasteStyle.disabled = true;
                updateActiveBlockEditor();
            }
            return;
        }

        if (e.key === 'PageUp' || (e.shiftKey && e.key === 'ArrowLeft') || (e.altKey && e.key === 'ArrowLeft')) {
            e.preventDefault();
            if (globalState.activePageIndex > 0) selectPage(globalState.activePageIndex - 1);
            return;
        }
        if (e.key === 'PageDown' || (e.shiftKey && e.key === 'ArrowRight') || (e.altKey && e.key === 'ArrowRight')) {
            e.preventDefault();
            if (globalState.activePageIndex < globalState.pages.length - 1) selectPage(globalState.activePageIndex + 1);
            return;
        }

        if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key.toLowerCase() === 'c') || (e.key.toLowerCase() === 'c' && globalState.selectedBlockId !== null))) {
            e.preventDefault();
            copyBlockStyle();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key.toLowerCase() === 'v') || (e.key.toLowerCase() === 'v' && globalState.selectedBlockId !== null && copiedStyle))) {
            e.preventDefault();
            pasteBlockStyle();
            return;
        }
    });

    window.addEventListener('paste', async (e: ClipboardEvent) => {
        const active = document.activeElement;
        const isEditingText = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable || active.classList?.contains('inline-text-editor'));
        if (isEditingText) {
            return;
        }

        const items = e.clipboardData?.items;
        const files = e.clipboardData?.files;
        const imageFiles: File[] = [];

        if (items && items.length > 0) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type && item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    if (blob) {
                        const now = new Date();
                        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
                        const ext = blob.type.split('/')[1] || 'png';
                        const file = new File([blob], `clipboard_page_${timestamp}.${ext}`, { type: blob.type });
                        imageFiles.push(file);
                    }
                }
            }
        }

        if (imageFiles.length === 0 && files && files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                if ((f.type && f.type.startsWith('image/')) || /\.(png|jpe?g|webp|avif|bmp|gif)$/i.test(f.name)) {
                    imageFiles.push(f);
                }
            }
        }

        if (imageFiles.length > 0) {
            e.preventDefault();
            const io = await import('../features/io');
            await io.handleUploadedFiles(imageFiles);
            const { showToast: toast } = await import('../core/utils');
            toast(`Đã dán ${imageFiles.length} trang ảnh từ Clipboard thành công!`, "success");
            return;
        }

        const pastedText = e.clipboardData?.getData('text');
        if (pastedText && globalState.selectedBlockId !== null) {
            const activePage = globalState.pages[globalState.activePageIndex];
            if (activePage) {
                const block = activePage.blocks.find(b => b.id === globalState.selectedBlockId);
                if (block) {
                    e.preventDefault();
                    const { pushStateToHistory, savePageToDB } = await import('../core/state');
                    const { requestOverlayRender: render } = await import('../features/canvas/canvas-renderer');
                    const { showToast: toast } = await import('../core/utils');
                    pushStateToHistory();
                    block.translated = pastedText;
                    render();
                    updateActiveBlockEditor();
                    savePageToDB(activePage);
                    toast("Đã dán văn bản vào ô thoại đang chọn!", "success");
                }
            }
        }
    });

    const replaceBgInput = document.getElementById('replace-bg-file-input');
    if (replaceBgInput) {
        replaceBgInput.addEventListener('change', (e: Event) => {
            handleReplaceBgFileInput(e);
        });
    }

    const btnReplaceBg = document.getElementById('btn-replace-bg-image');
    if (btnReplaceBg) {
        btnReplaceBg.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            triggerReplaceBgImage();
        });
    }
}

if (typeof window !== 'undefined') {
    Object.assign(window, {
        triggerReplaceBgImage,
        handleReplaceBgFileInput,
        uploadCustomFonts,
        updateUndoRedoUI,
        setRightTab,
        setViewMode,
        changeZoom,
        resetZoom,
        fitCanvasToScreen,
        toggleLeftSidebarMoreMenu,
        toggleApiKeyVisibility,
        updateSelectedModel,
        openSettingsModal,
        closeSettingsModal,
        switchSettingsTab,
        openHelpModal,
        closeHelpModal,
        switchHelpTab,
        updateSourceLanguage,
        updateTargetLanguage,
        updatePronounMatrix,
        updateGlossary,
        toggleStoryMemory,
        togglePreserveNames,
        updateTranslationGenrePreset,
        updateComicUniverse,
        updateComicGenre,
        toggleComicGenre,
        updateComicTone,
        updateTranslationContextPrompt,
        updateApiDelay,
        updateMaxRetries,
        updateAiProvider,
        updateDefaultFont,
        updateDefaultTypeFont,
        setBlockType,
        updateApiEndpoint,
        updateExportFormat,
        updateExportPdfQuality,
        toggleSidebarToolsMenu,
        toggleMobileSidebar,
        openMobileLeftPanel,
        openMobileRightPanel,
        toggleMobileLeftPanel,
        toggleMobileRightPanel,
        toggleMobileMoreMenu,
        closeMobileMoreMenu,
        navigateMobilePage,
        updateMobileNavUI,
        toggleMobileHandMode,
        isMobileHandModeActive,
        syncMobileMenuState,
        syncMobileToolbarState,
        closeMobileMenus,
        toggleLeftSidebar,
        toggleRightSidebar,
        toggleQuickBilingualMode,
        toggleQuickAudioDrama,
        openPreviewMode,
        closePreviewMode,
        previewPrevPage,
        previewNextPage,
        restoreOriginalBackground,
        copyBlockStyle,
        pasteBlockStyle,
        selectPage,
        removePage,
        toggleExportRangeInputs,
        validateExportRange,
        syncTextColorHex,
        syncBgColorHex,
        syncStrokeColorHex,
        syncShadowColorHex,
        openLorebookModal,
        closeLorebookModal,
        switchLorebookTab,
        addCharacterDossierEntry,
        removeCharacterDossierEntry,
        addLorebookTermEntry,
        removeLorebookTermEntry,
        exportLorebookJSON,
        importLorebookJSON,
        filterPagesList,
        setBilingualMode,
        setActiveBlockGender,
        runLocalOcrDetectionOnPage,
        insertRichTextTag,
        applyRichColorToSelection,
        applyRichSizeToSelection,
        clearRichFormattingFromSelection,
        toggleDiamondWrapActiveBlock,
        toggleGradientEnabled,
        syncGradientStartHex,
        syncGradientEndHex,
        updateGradientAngle,
        exportCurrentPagePSD: async () => {
            const io = await import('../features/io');
            return io.exportCurrentPagePSD();
        },
        openLocalFolderPicker: async () => {
            const fs = await import('../features/fs-access');
            return fs.openLocalFolderPicker();
        },
        exportPagesDirectlyToDisk: async () => {
            const fs = await import('../features/fs-access');
            return fs.exportPagesDirectlyToDisk();
        },
        saveProjectDirectlyToDisk: async () => {
            const fs = await import('../features/fs-access');
            return fs.saveProjectDirectlyToDisk();
        },
        reconnectDirectoryHandle: async () => {
            const fs = await import('../features/fs-access');
            return fs.reconnectDirectoryHandle();
        },
        unlinkConnectedFolder: async () => {
            const fs = await import('../features/fs-access');
            return fs.unlinkConnectedFolder();
        }
    });
}
