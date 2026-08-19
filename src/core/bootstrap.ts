import * as io from '../features/io';
import '../features/gdrive';
import { loadUIComponents } from './component-loader';
import { registerAction, initEventDelegation } from './events';
import {
    initEventListeners,
    syncMobileToolbarState,
    syncMobileMenuState,
    updateUndoRedoUI
} from '../ui/index';
import {
    mountSettingsModal,
    updateModelLockingUI,
    togglePreserveNames,
    syncGenrePresetCheckboxes,
    saveTranslationGenrePresets,
    openSettingsModal,
    closeSettingsModal,
    fetchGeminiModels
} from '../ui/settings-ui';
import { selectPage, updatePageListUI, triggerReplaceBgImage } from '../ui/pages-ui';
import { populateCustomFontsDropdown } from '../ui/font-ui';
import { setBilingualMode } from '../ui/block-editor-ui';
import {
    openPreviewMode,
    closePreviewMode,
    previewPrevPage,
    previewNextPage
} from '../ui/preview-ui';
import { elements } from './elements';
import { globalState, initDB, loadAndRegisterCustomFonts, initializeStateFromStorage, loadProjectFromDB, loadToeicWordsFromDB } from './state';
import { VALID_MODEL_IDS, CUSTOM_MODEL_VALUE } from '../config/constants';
import { showToast } from './utils/dom';
import { renderPronounMatrixTable } from '../features/pronoun';
import { updateToeicNotebookUI, persistToeicWordsToStorage } from '../features/toeic';
import { toggleEraserMode } from '../features/inpainting';
import { copyBlockStyle, pasteBlockStyle, applyStylePreset } from '../features/canvas/canvas-service';
import { renderCustomPresetsUI, openPresetModal, closePresetModal, savePresetFromActiveBlockUI } from '../ui/preset-ui';
import { playPageAudioDrama, pauseAudioDrama, stopAudioDrama, speakActiveBlock, openAudioSettingsModal, closeAudioSettingsModal } from '../features/audio';
import { initI18n, changeUILanguage } from './i18n';
import { initGlobalBridge } from './global-bridge';

export async function initApplication(): Promise<void> {

    await loadUIComponents();

    // Initialize UI language translation (i18n)
    initI18n();

    // Initialize Centralized Global Bridge for HTML inline event handlers
    initGlobalBridge();

    // Register actions for global event delegation router
    registerAction('openSettingsModal', openSettingsModal);
    registerAction('closeSettingsModal', closeSettingsModal);
    registerAction('openPresetModal', () => openPresetModal('create'));
    registerAction('closePresetModal', closePresetModal);
    registerAction('savePresetFromActiveBlockUI', savePresetFromActiveBlockUI);
    registerAction('openHelpModal', () => import('../ui/layout-ui').then(m => m.openHelpModal()));
    registerAction('closeHelpModal', () => import('../ui/layout-ui').then(m => m.closeHelpModal()));
    registerAction('openLorebookModal', () => import('../ui/lorebook-ui').then(m => m.openLorebookModal()));
    registerAction('closeLorebookModal', () => import('../ui/lorebook-ui').then(m => m.closeLorebookModal()));
    registerAction('openGDriveModal', () => import('../features/gdrive').then(m => m.openGDriveModal()));
    registerAction('closeGDriveModal', () => import('../features/gdrive').then(m => m.closeGDriveModal()));
    registerAction('openFindReplaceModal', () => import('../features/io').then(m => m.openFindReplaceModal()));
    registerAction('closeFindReplaceModal', () => import('../features/io').then(m => m.closeFindReplaceModal()));
    registerAction('openSrsReviewModal', () => import('../features/toeic').then(m => m.openSrsReviewModal()));
    registerAction('closeSrsReviewModal', () => import('../features/toeic').then(m => m.closeSrsReviewModal()));
    registerAction('openAudioSettingsModal', openAudioSettingsModal);
    registerAction('closeAudioSettingsModal', closeAudioSettingsModal);
    registerAction('openPreviewMode', openPreviewMode);
    registerAction('closePreviewMode', closePreviewMode);
    registerAction('previewPrevPage', previewPrevPage);
    registerAction('previewNextPage', previewNextPage);
    registerAction('setBilingualOff', () => setBilingualMode('off'));
    registerAction('setBilingualSub', () => setBilingualMode('sub'));
    registerAction('setBilingualMode', (target) => {
        const mode = target.getAttribute('data-mode') || 'off';
        setBilingualMode(mode as any);
    });
    registerAction('playPageAudioDrama', playPageAudioDrama);
    registerAction('pauseAudioDrama', pauseAudioDrama);
    registerAction('stopAudioDrama', stopAudioDrama);
    registerAction('speakActiveBlock', speakActiveBlock);
    registerAction('toggleEraserMode', () => toggleEraserMode());
    registerAction('aiSmartInpaintBlock', () => import('../features/inpainting').then(m => m.aiSmartInpaintBlock()));
    registerAction('activateEyedropper', () => import('../features/inpainting').then(m => m.activateEyedropper()));
    registerAction('runAIEraseTextPage', () => import('../features/ai/ai-service').then(m => m.runAIEraseTextPage()));
    registerAction('setEraserBrushMode', (target) => {
        const mode = target.getAttribute('data-mode') || 'eraser';
        import('../features/inpainting').then(m => m.setEraserBrushMode(mode as any));
    });
    registerAction('startTexturePatchSelection', () => import('../features/inpainting').then(m => m.startTexturePatchSelection()));
    registerAction('runLassoContentAwareFill', () => import('../features/inpainting').then(m => m.runLassoContentAwareFill()));
    registerAction('runLassoPatternFill', () => import('../features/inpainting').then(m => m.runLassoPatternFill()));
    registerAction('clearLassoSelection', () => import('../features/inpainting').then(m => m.clearLassoSelection()));
    registerAction('setLassoFillTab', (target) => {
        const tab = (target.getAttribute('data-tab') || 'ai') as 'ai' | 'pattern';
        import('../features/inpainting').then(m => m.setLassoFillTab(tab));
    });
    registerAction('setLassoPatternType', (target) => {
        const type = (target.getAttribute('data-type') || 'halftone') as any;
        import('../features/inpainting').then(m => m.setLassoPatternType(type));
    });
    registerAction('setLassoFillTechnique', (target) => {
        const tech = (target.getAttribute('data-tech') || 'patch_1to1') as any;
        import('../features/inpainting').then(m => m.setLassoFillTechnique(tech));
    });
    registerAction('nudgeLassoPatternOffset', (target) => {
        const dx = parseInt(target.getAttribute('data-dx') || '0', 10);
        const dy = parseInt(target.getAttribute('data-dy') || '0', 10);
        import('../features/inpainting').then(m => m.nudgeLassoPatternOffset(dx, dy));
    });
    registerAction('setLassoPatternOffsetX', (target) => {
        const val = parseInt((target as HTMLInputElement).value || '0', 10);
        import('../features/inpainting').then(m => m.setLassoPatternOffsetX(val));
    });
    registerAction('setLassoPatternOffsetY', (target) => {
        const val = parseInt((target as HTMLInputElement).value || '0', 10);
        import('../features/inpainting').then(m => m.setLassoPatternOffsetY(val));
    });
    registerAction('resetLassoPatternOffset', () => import('../features/inpainting').then(m => m.resetLassoPatternOffset()));
    registerAction('pickLassoSamplePatch', () => import('../features/inpainting').then(m => m.pickLassoSamplePatch()));
    registerAction('pickLassoRectSample', () => import('../features/inpainting').then(m => m.pickLassoRectSample()));
    registerAction('autoSampleNearbyLassoRect', () => import('../features/inpainting').then(m => m.autoSampleNearbyLassoRect()));
    registerAction('autoMatchActiveBlockStyle', () => import('../features/canvas/canvas-service').then(m => m.autoMatchActiveBlockStyle()));
    registerAction('copyBlockStyle', copyBlockStyle);
    registerAction('pasteBlockStyle', pasteBlockStyle);
    registerAction('applyStylePreset', (target) => {
        const preset = target.getAttribute('data-preset');
        if (preset) applyStylePreset(preset);
    });
    registerAction('triggerReplaceBgImage', () => triggerReplaceBgImage());
    registerAction('loadDemoManga', () => import('../ui/pages-ui').then(m => m.loadDemoManga()));
    registerAction('triggerUploadFiles', () => document.getElementById('file-input')?.click());
    registerAction('triggerBatchTranslate', () => import('../features/ai/ai-service').then(m => m.runBatchTranslation()));
    registerAction('triggerBatchExport', () => import('../features/io').then(m => m.runBatchExport()));
    registerAction('fitCanvasToScreen', () => import('../ui/layout-ui').then(m => m.fitCanvasToScreen()));
    registerAction('toggleLeftSidebarMoreMenu', () => import('../ui/layout-ui').then(m => m.toggleLeftSidebarMoreMenu()));
    registerAction('addNewBlock', () => import('../features/canvas/canvas-service').then(m => m.addNewBlock()));
    registerAction('triggerAddImageBlock', () => import('../features/canvas/canvas-service').then(m => m.triggerAddImageBlock()));
    registerAction('toggleMagicWandMode', () => import('../features/canvas/canvas-service').then(m => m.toggleMagicWandMode()));
    registerAction('executeUndo', () => import('../core/state').then(s => s.executeUndo()));
    registerAction('executeRedo', () => import('../core/state').then(s => s.executeRedo()));
    initEventDelegation();

    mountSettingsModal();
    initEventListeners();
    import('../features/canvas/canvas-service').then(m => {
        (m as any).initBilingualTooltipEvents?.();
        (m as any).initMagicWandEvents?.();
        (m as any).initMarqueeSelection?.();
    });
    syncMobileToolbarState();
    syncMobileMenuState();

    // Centralized state initialization
    initializeStateFromStorage();
    import('../ui/layout-ui').then(m => m.updateStepperUI());
    renderCustomPresetsUI();

    // UI synchronization based on initialized state
    if (elements.apiKeyInput) elements.apiKeyInput.value = globalState.apiKey;
    if (globalState.apiKey) fetchGeminiModels();

    const modelSelect = document.getElementById('model-select') as HTMLSelectElement | null;
    if (modelSelect) {
        if (VALID_MODEL_IDS.includes(globalState.selectedModel)) {
            modelSelect.value = globalState.selectedModel;
        } else {
            modelSelect.value = CUSTOM_MODEL_VALUE;
            if (elements.customModelInput) elements.customModelInput.value = globalState.selectedModel;
        }
    }

    updateModelLockingUI();
    if (elements.styleAutoFit) elements.styleAutoFit.checked = globalState.autoFitEnabled;
    const preserveChk = document.getElementById('preserve-names-chk') as HTMLInputElement | null;
    if (preserveChk) {
        preserveChk.checked = globalState.preserveNames;
        togglePreserveNames(globalState.preserveNames);
    }
    const glossaryInput = document.getElementById('glossary-names-input') as HTMLInputElement | null;
    if (glossaryInput) glossaryInput.value = globalState.glossaryNames;

    syncGenrePresetCheckboxes();
    saveTranslationGenrePresets();
    if (elements.contextPromptInput) elements.contextPromptInput.value = globalState.translationContextPrompt;
    if (elements.sourceLangSelect) elements.sourceLangSelect.value = globalState.sourceLanguage;
    if (elements.targetLangSelect) elements.targetLangSelect.value = globalState.targetLanguage;
    if (globalState.pronounMatrix) renderPronounMatrixTable();
    if (elements.ocrEnhanceChk) elements.ocrEnhanceChk.checked = globalState.ocrEnhanceEnabled;
    const apiDelayInput = document.getElementById('api-delay-input') as HTMLInputElement | null;
    if (apiDelayInput) apiDelayInput.value = String(globalState.apiDelay);
    const maxRetriesInput = document.getElementById('max-retries-input') as HTMLInputElement | null;
    if (maxRetriesInput) maxRetriesInput.value = String(globalState.maxRetries);

    const isLocal = window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) {
        const localModeIndicator = document.getElementById('local-mode-indicator');
        if (localModeIndicator) localModeIndicator.classList.remove('hidden');
    }

    // Khởi tạo IndexedDB và tự động khôi phục phiên làm việc cũ
    try {
        await initDB();
        await loadAndRegisterCustomFonts();
        await populateCustomFontsDropdown();

        // 1. NẠP TỪ VỰNG TOEIC ĐỘC LẬP
        try {
            const localWords = localStorage.getItem('manga_permanent_toeic_words');
            if (localWords) {
                globalState.toeicSavedWords = JSON.parse(localWords);
            } else {
                globalState.toeicSavedWords = await loadToeicWordsFromDB();
                if (globalState.toeicSavedWords.length > 0) {
                    persistToeicWordsToStorage(globalState.toeicSavedWords);
                }
            }
        } catch (e) {
            globalState.toeicSavedWords = await loadToeicWordsFromDB();
        }
        updateToeicNotebookUI();

        // 2. KHÔI PHỤC TRANG TRUYỆN DỰ ÁN
        const project = await loadProjectFromDB();
        console.log("Project loaded from DB:", project);
        if (project && project.pages && project.pages.length > 0) {
            globalState.pages = project.pages;
            globalState.activePageIndex = (typeof project.activePageIndex === 'number' && project.activePageIndex >= 0 && project.activePageIndex < project.pages.length) ? project.activePageIndex : 0;

            updatePageListUI();
            await selectPage(globalState.activePageIndex);

            showToast("Đã khôi phục phiên làm việc trước đó!", "success");
        }

        // 3. KHÔI PHỤC THƯ MỤC LIÊN KẾT Ổ CỨNG
        import('../features/fs-access').then(fs => fs.restoreStoredDirectoryHandle());

        // Register Undo/Redo UI update callback
        import('./state').then(state => {
            state.registerStateCallbacks({
                onUndoRedoChange: updateUndoRedoUI,
                onSnapshotRestored: (_snapshot) => {
                    updatePageListUI();
                    if (globalState.activePageIndex !== -1) {
                        selectPage(globalState.activePageIndex);
                    } else {
                        const container = document.getElementById('manga-canvas-container');
                        const split = document.getElementById('workspace-split-wrapper');
                        const empty = document.getElementById('workspace-empty-state');
                        if (container) container.classList.add('hidden');
                        if (split) split.classList.add('hidden');
                        if (empty) empty.classList.remove('hidden');
                    }
                    import('../ui/block-editor-ui').then(m => m.updateActiveBlockEditor());
                }
            });
        });
        updateUndoRedoUI();
    } catch (dbErr) {
        console.error("Lỗi khởi tạo/khôi phục dữ liệu từ IndexedDB:", dbErr);
    }
}
