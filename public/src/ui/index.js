import { debounceSavePage } from '../core/state.js';
import {
    setRightTab, updateProcessingOverlay, updateBackgroundTaskOverlay,
    setViewMode, updateSplitView, changeZoom, resetZoom,
    toggleSidebarToolsMenu, toggleMobileSidebar, syncMobileMenuState, syncMobileToolbarState,
    closeMobileMenus, toggleLeftSidebar, toggleRightSidebar, toggleQuickBilingualMode, toggleQuickAudioDrama
} from './layout-ui.js';

import { selectPage, removePage, updatePageListUI, filterPagesList, toggleExportRangeInputs, validateExportRange, setExportRangeToCurrent } from './pages-ui.js';

import {
    updateActiveBlockEditor, restoreBackgroundForBlock, restoreOriginalBackground,
    syncTextColorHex, syncBgColorHex, syncStrokeColorHex, syncShadowColorHex,
    setBilingualMode, setActiveBlockGender
} from './block-editor-ui.js';

import {
    toggleApiKeyVisibility, updateSelectedModel, updateModelDropdown, fetchGeminiModels,
    updateModelLockingUI, mountSettingsModal, openSettingsModal, closeSettingsModal,
    updateDefaultFont,
    updateSourceLanguage, updateTargetLanguage, updatePronounMatrix, updateGlossary,
    toggleStoryMemory, updateStoryMemoryBadge, togglePreserveNames, syncGenrePresetCheckboxes,
    saveTranslationGenrePresets, updateTranslationGenrePreset, updateTranslationContextPrompt,
    updateApiDelay, updateMaxRetries, updateAiProvider, updateApiEndpoint
} from './settings-ui.js';

import {
    previewCurrentPage, openPreviewMode, closePreviewMode,
    previewKeyHandler, previewPrevPage, previewNextPage, renderPreviewPage
} from './preview-ui.js';

import { populateCustomFontsDropdown, registerCustomFont, uploadCustomFonts } from './font-ui.js';

import {
    openLorebookModal, closeLorebookModal, switchLorebookTab,
    renderCharacterDossierUI, addCharacterDossierEntry, removeCharacterDossierEntry,
    renderLorebookUI, addLorebookTermEntry, removeLorebookTermEntry,
    exportLorebookJSON, importLorebookJSON
} from './lorebook-ui.js';

// Import từ các module Core & Features
import { globalState, stateEvents } from '../core/state.js';
import { CUSTOM_MODEL_VALUE } from '../config/constants.js';
import { globalBus } from '../core/events.js';
import { elements } from '../core/elements.js';
import { copyBlockStyle, pasteBlockStyle, navigateBlocks, syncActiveBlockStyle } from '../features/canvas/canvas-service.js';
import { safeSetLocalStorage } from '../core/utils/storage.js';

export {
    setRightTab, updateProcessingOverlay, updateBackgroundTaskOverlay,
    setViewMode, updateSplitView, changeZoom, resetZoom,
    toggleSidebarToolsMenu, toggleMobileSidebar, syncMobileMenuState, syncMobileToolbarState,
    closeMobileMenus, toggleLeftSidebar, toggleRightSidebar,
    selectPage, removePage, updatePageListUI, filterPagesList, toggleExportRangeInputs, validateExportRange,
    updateActiveBlockEditor, restoreBackgroundForBlock, restoreOriginalBackground,
    syncTextColorHex, syncBgColorHex, syncStrokeColorHex, syncShadowColorHex,
    setBilingualMode, setActiveBlockGender,
    toggleApiKeyVisibility, updateSelectedModel, updateModelDropdown, fetchGeminiModels,
    updateModelLockingUI, mountSettingsModal, openSettingsModal, closeSettingsModal,
    updateDefaultFont,
    updateSourceLanguage, updateTargetLanguage, updatePronounMatrix, updateGlossary,
    toggleStoryMemory, updateStoryMemoryBadge, togglePreserveNames, syncGenrePresetCheckboxes,
    saveTranslationGenrePresets, updateTranslationGenrePreset, updateTranslationContextPrompt,
    updateApiDelay, updateMaxRetries, updateAiProvider, updateApiEndpoint,
    previewCurrentPage, openPreviewMode, closePreviewMode,
    previewKeyHandler, previewPrevPage, previewNextPage, renderPreviewPage,
    populateCustomFontsDropdown, registerCustomFont, uploadCustomFonts,
    openLorebookModal, closeLorebookModal, switchLorebookTab,
    renderCharacterDossierUI, addCharacterDossierEntry, removeCharacterDossierEntry,
    renderLorebookUI, addLorebookTermEntry, removeLorebookTermEntry,
    exportLorebookJSON, importLorebookJSON
};

export async function updateUndoRedoUI() {
    const { undoStack, redoStack } = await import('../core/state.js');
    if (elements.btnUndo) elements.btnUndo.disabled = undoStack.length === 0;
    if (elements.btnRedo) elements.btnRedo.disabled = redoStack.length === 0;
}

export function initEventListeners() {
    globalBus.subscribe(stateEvents.PAGE_LIST_UPDATED, () => updatePageListUI());
    globalBus.subscribe(stateEvents.PROCESSING_OVERLAY, (data) => updateProcessingOverlay(data.show, data.message));
    globalBus.subscribe(stateEvents.BACKGROUND_TASK_OVERLAY, (data) => updateBackgroundTaskOverlay(data.show, data.message, data.progress));
    globalBus.subscribe(stateEvents.ACTIVE_BLOCK_EDITOR_UPDATED, () => updateActiveBlockEditor());
    globalBus.subscribe(stateEvents.SPLIT_VIEW_UPDATED, () => updateSplitView());
    globalBus.subscribe(stateEvents.RIGHT_TAB_CHANGED, (tab) => setRightTab(tab));

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');

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
            if (e.dataTransfer.files?.length) {
                import('../features/io.js').then(io => io.handleUploadedFiles(e.dataTransfer.files));
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files?.length) {
                import('../features/io.js').then(io => io.handleUploadedFiles(e.target.files));
            }
        });
    }

    const viewport = document.getElementById('workspace-viewport');
    if (viewport) {
        viewport.addEventListener('dragover', (e) => {
            if (globalState.activePageIndex !== -1) {
                e.preventDefault();
            }
        });
        viewport.addEventListener('drop', (e) => {
            if (globalState.activePageIndex !== -1 && e.dataTransfer.files?.length) {
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith('image/')) {
                    e.preventDefault();
                    import('./pages-ui.js').then(p => p.replacePageBackgroundImage(globalState.activePageIndex, file));
                }
            }
        });
    }

    if (elements.pagesList) {
        elements.pagesList.addEventListener('click', (e) => {
            const replaceBtn = e.target.closest('[data-action="replace-bg-page"]');
            if (replaceBtn) {
                e.stopPropagation();
                const index = Number(replaceBtn.dataset.index);
                if (Number.isInteger(index)) {
                    import('./pages-ui.js').then(p => p.triggerReplaceBgImage(index));
                }
                return;
            }

            const translateBtn = e.target.closest('[data-action="translate-page"]');
            if (translateBtn) {
                e.stopPropagation();
                const index = Number(translateBtn.dataset.index);
                if (Number.isInteger(index)) {
                    import('../features/ai/ai-service.js').then(ai => ai.translateSinglePageInBatch(index));
                }
                return;
            }

            const removeBtn = e.target.closest('[data-action="remove-page"]');
            if (removeBtn) {
                e.stopPropagation();
                const index = Number(removeBtn.dataset.index);
                if (Number.isInteger(index)) removePage(index);
                return;
            }

            const pageItem = e.target.closest('[data-page-index]');
            if (pageItem) {
                const index = Number(pageItem.dataset.pageIndex);
                if (Number.isInteger(index)) selectPage(index);
            }
        });
    }

    if (elements.apiKeyInput) {
        elements.apiKeyInput.addEventListener('input', (e) => {
            const key = e.target.value.trim();
            globalState.apiKey = key;
            safeSetLocalStorage('gemini_manga_api_key', key);
            updateModelLockingUI();
            if (key.startsWith('AIzaSy') && key.length >= 35) {
                fetchGeminiModels();
            }
        });
    }

    if (elements.editOriginalText) {
        elements.editOriginalText.addEventListener('input', (e) => {
            if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
            const page = globalState.pages[globalState.activePageIndex];
            const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
            if (block) {
                block.original = e.target.value;
                globalState.activeBlockToeicAnalysis = null;
                debounceSavePage(page);
            }
        });
    }

    if (elements.customModelInput) {
        elements.customModelInput.addEventListener('input', () => {
            if (document.getElementById('model-select')?.value === CUSTOM_MODEL_VALUE && !document.getElementById('model-select')?.disabled) {
                updateSelectedModel(CUSTOM_MODEL_VALUE);
            }
        });
    }

    document.querySelectorAll('.genre-preset-option').forEach((checkbox) => {
        checkbox.addEventListener('change', () => updateTranslationGenrePreset());
    });

    // Ctrl + Mouse Wheel Zoom (bound to window with passive:false to block default browser scale zoom)
    window.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            const isInsideViewport = e.target && e.target.closest && e.target.closest('#workspace-viewport');
            if (isInsideViewport) {
                e.preventDefault();
                const amount = e.deltaY < 0 ? 10 : -10;
                changeZoom(amount);
            }
        }
    }, { passive: false });

    document.addEventListener('keydown', (e) => {
        // Ctrl + Shortcuts for zooming
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
        }

        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

        if (globalState.selectedBlockId !== null) {
            const activePage = globalState.pages[globalState.activePageIndex];
            if (!activePage) return;
            const block = activePage.blocks.find(b => b.id === globalState.selectedBlockId);
            if (!block) return;

            if (e.key === 'F2' || e.key === 'Enter') {
                e.preventDefault();
                import('../features/canvas/canvas-renderer.js').then(canvas => canvas.triggerInlineEditActiveBlock());
                return;
            }

            if (e.key === '[') {
                e.preventDefault();
                syncActiveBlockStyle('fontSize', Math.max(8, block.style.fontSize - 1));
            } else if (e.key === ']') {
                e.preventDefault();
                syncActiveBlockStyle('fontSize', Math.min(100, block.style.fontSize + 1));
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                import('../features/canvas/canvas-service.js').then(canvas => canvas.deleteActiveBlock());
            }
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            navigateBlocks(e.shiftKey ? -1 : 1);
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            if (globalState.selectedBlockId) {
                const prevEl = document.getElementById(globalState.selectedBlockId);
                if (prevEl) prevEl.classList.remove('active');
                globalState.selectedBlockId = null;
                if (elements.btnCopyStyle) elements.btnCopyStyle.disabled = true;
                if (elements.btnPasteStyle) elements.btnPasteStyle.disabled = true;
                updateActiveBlockEditor();
            }
            return;
        }

        if (e.key === 'PageUp') {
            e.preventDefault();
            if (globalState.activePageIndex > 0) selectPage(globalState.activePageIndex - 1);
            return;
        }
        if (e.key === 'PageDown') {
            e.preventDefault();
            if (globalState.activePageIndex < globalState.pages.length - 1) selectPage(globalState.activePageIndex + 1);
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            copyBlockStyle();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
            e.preventDefault();
            pasteBlockStyle();
            return;
        }
    });
}

Object.assign(window, {
    uploadCustomFonts,
    updateUndoRedoUI,
    setRightTab,
    setViewMode,
    changeZoom,
    resetZoom,
    toggleApiKeyVisibility,
    updateSelectedModel,
    openSettingsModal,
    closeSettingsModal,
    updateSourceLanguage,
    updateTargetLanguage,
    updatePronounMatrix,
    updateGlossary,
    toggleStoryMemory,
    togglePreserveNames,
    updateTranslationGenrePreset,
    updateTranslationContextPrompt,
    updateApiDelay,
    updateMaxRetries,
    updateAiProvider,
    updateDefaultFont,
    updateApiEndpoint,
    toggleSidebarToolsMenu,
    toggleMobileSidebar,
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
    setActiveBlockGender
});