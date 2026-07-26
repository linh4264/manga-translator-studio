// Main Application Entry & Bootstrap
import './core/elements.js';
import {
    globalState,
    initDB,
    loadAndRegisterCustomFonts,
    loadProjectFromDB,
    loadToeicWordsFromDB,
    VALID_MODEL_IDS,
    CUSTOM_MODEL_VALUE,
    DEFAULT_MODEL,
    apiKey,
    TRANSLATION_GENRE_PRESETS,
    registerUIBridge,
    registerStateCallbacks,
    initializeStateFromStorage // Added
} from './core/state.js';
import { elements } from './core/elements.js';

import { showToast } from './core/utils.js';
import { registerAction, initEventDelegation } from './core/events.js';
import { renderPronounMatrixTable } from './features/pronoun.js';

import './features/ocr.js';
import './features/ai.js';
import { updateToeicNotebookUI } from './features/toeic.js';
import { toggleEraserMode, aiSmartInpaintBlock } from './features/inpainting.js';
import { copyBlockStyle, pasteBlockStyle, applyStylePreset } from './features/canvas.js';
import './features/io.js';
import './features/gdrive.js';
import { playPageAudioDrama, pauseAudioDrama, stopAudioDrama, speakActiveBlock, openAudioSettingsModal, closeAudioSettingsModal } from './features/audio.js';
import { initI18n, changeUILanguage } from './core/i18n.js';

import {
    mountSettingsModal,
    initEventListeners,
    syncMobileToolbarState,
    syncMobileMenuState,
    updateModelLockingUI,
    togglePreserveNames,
    syncGenrePresetCheckboxes,
    saveTranslationGenrePresets,
    selectPage,
    updatePageListUI,
    updateProcessingOverlay,
    updateBackgroundTaskOverlay,
    updateActiveBlockEditor,
    updateSplitView,
    setRightTab,
    populateCustomFontsDropdown,
    updateUndoRedoUI,
    openSettingsModal,
    closeSettingsModal,
    fetchGeminiModels,
    setBilingualMode,
    setActiveBlockGender,
    openPreviewMode,
    closePreviewMode,
    previewPrevPage,
    previewNextPage
} from './ui/ui.js';

window.setBilingualMode = setBilingualMode;
window.setActiveBlockGender = setActiveBlockGender;
window.openAudioSettingsModal = openAudioSettingsModal;
window.closeAudioSettingsModal = closeAudioSettingsModal;
window.openPreviewMode = openPreviewMode;
window.closePreviewMode = closePreviewMode;
window.previewPrevPage = previewPrevPage;
window.previewNextPage = previewNextPage;

document.addEventListener('DOMContentLoaded', async () => {
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
    registerAction('autoMatchActiveBlockStyle', () => import('./features/canvas.js').then(m => m.autoMatchActiveBlockStyle()));
    registerAction('copyBlockStyle', copyBlockStyle);
    registerAction('pasteBlockStyle', pasteBlockStyle);
    registerAction('applyStylePreset', (target) => {
        const preset = target.getAttribute('data-preset');
        applyStylePreset(preset);
    });
    initEventDelegation();

    // Register UI bridge so ai.js and canvas.js can call UI functions without circular imports
    registerUIBridge({ updatePageListUI, updateProcessingOverlay, updateBackgroundTaskOverlay, updateActiveBlockEditor, updateSplitView, setRightTab });
    registerStateCallbacks({
        onUndoRedoChange: updateUndoRedoUI,
        onPageListChange: updatePageListUI
    });

    mountSettingsModal();
    initEventListeners();
    import('./features/canvas.js').then(m => m.initBilingualTooltipEvents?.());
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
        if (project) {
            globalState.pages = project.pages;
            globalState.activePageIndex = project.activePageIndex;

            updatePageListUI();
            if (globalState.activePageIndex !== -1 && globalState.pages.length > 0) {
                if (globalState.activePageIndex >= globalState.pages.length) {
                    globalState.activePageIndex = 0;
                }
                selectPage(globalState.activePageIndex);
            }
            // Khôi phục từ vựng TOEIC đã lưu
            globalState.toeicSavedWords = await loadToeicWordsFromDB();
            updateToeicNotebookUI();

            showToast("Đã khôi phục phiên làm việc trước đó!", "success");
        }
    } catch (dbErr) {
        console.error("Lỗi khởi tạo/khôi phục dữ liệu từ IndexedDB:", dbErr);
    }
});
