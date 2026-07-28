import * as io from '../features/io.js';
import { loadUIComponents } from './component-loader.js';
import { registerAction, initEventDelegation } from './events.js';
import {
    initEventListeners,
    syncMobileToolbarState,
    syncMobileMenuState,
    updateUndoRedoUI
} from '../ui/index.js';
import {
    mountSettingsModal,
    updateModelLockingUI,
    togglePreserveNames,
    syncGenrePresetCheckboxes,
    saveTranslationGenrePresets,
    openSettingsModal,
    closeSettingsModal,
    fetchGeminiModels
} from '../ui/settings-ui.js';
import { selectPage, updatePageListUI } from '../ui/pages-ui.js';
import { populateCustomFontsDropdown } from '../ui/font-ui.js';
import { setBilingualMode } from '../ui/block-editor-ui.js';
import {
    openPreviewMode,
    closePreviewMode,
    previewPrevPage,
    previewNextPage
} from '../ui/preview-ui.js';
import { elements } from './elements.js';
import { globalState, initDB, loadAndRegisterCustomFonts, initializeStateFromStorage, loadProjectFromDB, loadToeicWordsFromDB } from './state.js';
import { VALID_MODEL_IDS, CUSTOM_MODEL_VALUE } from '../config/constants.js';
import { showToast } from './utils/dom.js';
import { renderPronounMatrixTable } from '../features/pronoun.js';
import { updateToeicNotebookUI } from '../features/toeic.js';
import { toggleEraserMode } from '../features/inpainting.js';
import { copyBlockStyle, pasteBlockStyle, applyStylePreset } from '../features/canvas/canvas-service.js';
import { playPageAudioDrama, pauseAudioDrama, stopAudioDrama, speakActiveBlock, openAudioSettingsModal, closeAudioSettingsModal } from '../features/audio.js';
import { initI18n, changeUILanguage } from './i18n.js';

export async function initApplication() {

    await loadUIComponents();

    // Initialize UI language translation (i18n)
    initI18n();
    window.changeUILanguage = changeUILanguage;

    // Register actions for global event delegation router
    registerAction('openSettingsModal', openSettingsModal);
    registerAction('closeSettingsModal', closeSettingsModal);
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
        setBilingualMode(mode);
    });
    registerAction('playPageAudioDrama', playPageAudioDrama);
    registerAction('pauseAudioDrama', pauseAudioDrama);
    registerAction('stopAudioDrama', stopAudioDrama);
    registerAction('speakActiveBlock', speakActiveBlock);
    registerAction('toggleEraserMode', toggleEraserMode);
    registerAction('autoMatchActiveBlockStyle', () => import('../features/canvas/canvas-service.js').then(m => m.autoMatchActiveBlockStyle()));
    registerAction('copyBlockStyle', copyBlockStyle);
    registerAction('pasteBlockStyle', pasteBlockStyle);
    registerAction('applyStylePreset', (target) => {
        const preset = target.getAttribute('data-preset');
        applyStylePreset(preset);
    });
    initEventDelegation();

    mountSettingsModal();
    initEventListeners();
    import('../features/canvas/canvas-service.js').then(m => m.initBilingualTooltipEvents?.());
    syncMobileToolbarState();
    syncMobileMenuState();

    // Centralized state initialization
    initializeStateFromStorage();

    // UI synchronization based on initialized state
    if (elements.apiKeyInput) elements.apiKeyInput.value = globalState.apiKey;
    if (globalState.apiKey) fetchGeminiModels();

    const modelSelect = document.getElementById('model-select');
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
    const preserveChk = document.getElementById('preserve-names-chk');
    if (preserveChk) {
        preserveChk.checked = globalState.preserveNames;
        togglePreserveNames(globalState.preserveNames);
    }
    if (elements.glossaryInput) elements.glossaryInput.value = globalState.glossaryNames;

    syncGenrePresetCheckboxes();
    saveTranslationGenrePresets();
    if (elements.contextPromptInput) elements.contextPromptInput.value = globalState.translationContextPrompt;
    if (elements.sourceLangSelect) elements.sourceLangSelect.value = globalState.sourceLanguage;
    if (elements.targetLangSelect) elements.targetLangSelect.value = globalState.targetLanguage;
    if (globalState.pronounMatrix) renderPronounMatrixTable();
    if (elements.ocrEnhanceChk) elements.ocrEnhanceChk.checked = globalState.ocrEnhanceEnabled;
    if (elements.apiDelayInput) elements.apiDelayInput.value = globalState.apiDelay;
    if (elements.maxRetriesInput) elements.maxRetriesInput.value = globalState.maxRetries;

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
        const project = await loadProjectFromDB();
        console.log("Project loaded from DB:", project);
        if (project && project.pages && project.pages.length > 0) {
            globalState.pages = project.pages;
            globalState.activePageIndex = (typeof project.activePageIndex === 'number' && project.activePageIndex >= 0 && project.activePageIndex < project.pages.length) ? project.activePageIndex : 0;

            updatePageListUI();
            await selectPage(globalState.activePageIndex);

            // Khôi phục từ vựng TOEIC đã lưu
            globalState.toeicSavedWords = await loadToeicWordsFromDB();
            updateToeicNotebookUI();

            showToast("Đã khôi phục phiên làm việc trước đó!", "success");
        }

        // Register Undo/Redo UI update callback
        import('./state.js').then(state => {
            state.registerStateCallbacks({
                onUndoRedoChange: updateUndoRedoUI
            });
        });
        updateUndoRedoUI();
    } catch (dbErr) {
        console.error("Lỗi khởi tạo/khôi phục dữ liệu từ IndexedDB:", dbErr);
    }
}
