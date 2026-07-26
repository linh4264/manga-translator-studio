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
    registerStateCallbacks
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
    setBilingualMode
} from './ui/ui.js';

window.setBilingualMode = setBilingualMode;

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize UI language translation (i18n)
    initI18n();
    window.changeUILanguage = changeUILanguage;

    // Register actions for global event delegation router
    registerAction('openSettingsModal', openSettingsModal);
    registerAction('closeSettingsModal', closeSettingsModal);
    registerAction('setBilingualOff', () => setBilingualMode('off'));
    registerAction('setBilingualSub', () => setBilingualMode('sub'));
    registerAction('setBilingualMode', (target) => {
        const mode = target.getAttribute('data-mode') || 'off';
        setBilingualMode(mode);
    });
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

    // Tải API key đã lưu nếu có
    const savedKey = localStorage.getItem('gemini_manga_api_key');
    if (savedKey) {
        globalState.apiKey = savedKey;
        if (elements.apiKeyInput) {
            elements.apiKeyInput.value = savedKey;
        }
        fetchGeminiModels();
    }

    // Load saved model if available
    const savedModel = localStorage.getItem('gemini_manga_model');
    if (savedModel) {
        const modelSelect = document.getElementById('model-select');
        if (VALID_MODEL_IDS.includes(savedModel)) {
            globalState.selectedModel = savedModel;
            localStorage.setItem('gemini_manga_model', savedModel);
            if (modelSelect) modelSelect.value = savedModel;
        } else {
            globalState.selectedModel = savedModel;
            if (modelSelect) modelSelect.value = CUSTOM_MODEL_VALUE;
            if (elements.customModelInput) {
                elements.customModelInput.value = savedModel;
            }
        }
    }

    // Kiểm tra và khóa mô hình dựa trên trạng thái API Key khi khởi chạy
    updateModelLockingUI();

    const savedAutoFit = localStorage.getItem('gemini_manga_autofit_enabled');
    if (savedAutoFit !== null) {
        globalState.autoFitEnabled = savedAutoFit === 'true';
    }
    if (elements.styleAutoFit) {
        elements.styleAutoFit.checked = globalState.autoFitEnabled;
    }

    const savedPreserve = localStorage.getItem('gemini_manga_preserve_names');
    if (savedPreserve !== null) {
        globalState.preserveNames = savedPreserve === 'true';
        const preserveChk = document.getElementById('preserve-names-chk');
        if (preserveChk) preserveChk.checked = globalState.preserveNames;
        togglePreserveNames(globalState.preserveNames);
    }

    const savedGlossary = localStorage.getItem('gemini_manga_glossary');
    if (savedGlossary !== null) {
        globalState.glossaryNames = savedGlossary;
        const glossaryInp = document.getElementById('glossary-input');
        if (glossaryInp) glossaryInp.value = savedGlossary;
    }

    const savedGenrePreset = localStorage.getItem('gemini_manga_translation_genre_preset');
    if (savedGenrePreset !== null) {
        try {
            const savedPresets = savedGenrePreset.startsWith('[')
                ? JSON.parse(savedGenrePreset)
                : savedGenrePreset.split(',').map(item => item.trim()).filter(Boolean);
            const validPresets = savedPresets.filter(item => TRANSLATION_GENRE_PRESETS[item] !== undefined);
            if (validPresets.length > 0) {
                globalState.translationGenrePresets = validPresets;
            }
        } catch (error) {
            console.warn('Không thể đọc preset thể loại đã lưu:', error);
        }
    }

    syncGenrePresetCheckboxes();
    saveTranslationGenrePresets();

    const savedTranslationContextPrompt = localStorage.getItem('gemini_manga_translation_context_prompt');
    if (savedTranslationContextPrompt !== null) {
        globalState.translationContextPrompt = savedTranslationContextPrompt;
        const contextPromptInp = document.getElementById('translation-context-prompt');
        if (contextPromptInp) contextPromptInp.value = savedTranslationContextPrompt;
    }

    // Tải cấu hình Ngôn ngữ nguồn, Ngôn ngữ đích, Ma trận xưng hô và Tăng cường OCR
    const savedSourceLang = localStorage.getItem('gemini_manga_source_lang');
    if (savedSourceLang) {
        globalState.sourceLanguage = savedSourceLang;
        if (elements.sourceLangSelect) elements.sourceLangSelect.value = savedSourceLang;
    }

    const savedTargetLang = localStorage.getItem('gemini_manga_target_lang');
    if (savedTargetLang) {
        globalState.targetLanguage = savedTargetLang;
        if (elements.targetLangSelect) elements.targetLangSelect.value = savedTargetLang;
    }

    const savedPronounMatrix = localStorage.getItem('gemini_manga_pronoun_matrix');
    if (savedPronounMatrix !== null) {
        globalState.pronounMatrix = savedPronounMatrix;
        renderPronounMatrixTable();
    }

    const savedOcrEnhance = localStorage.getItem('gemini_manga_ocr_enhance');
    if (savedOcrEnhance !== null) {
        try {
            globalState.ocrEnhanceEnabled = JSON.parse(savedOcrEnhance);
        } catch (e) {
            globalState.ocrEnhanceEnabled = true;
        }
        if (elements.ocrEnhanceChk) elements.ocrEnhanceChk.checked = globalState.ocrEnhanceEnabled;
    }

    // Tải cấu hình apiDelay và maxRetries đã lưu nếu có
    const savedApiDelay = localStorage.getItem('gemini_manga_api_delay');
    if (savedApiDelay !== null) {
        globalState.apiDelay = parseInt(savedApiDelay, 10);
    } else {
        globalState.apiDelay = 8;
    }
    const apiDelayInp = document.getElementById('api-delay-input');
    if (apiDelayInp) apiDelayInp.value = globalState.apiDelay;

    const savedMaxRetries = localStorage.getItem('gemini_manga_max_retries');
    if (savedMaxRetries !== null) {
        globalState.maxRetries = parseInt(savedMaxRetries, 10);
    } else {
        globalState.maxRetries = 5;
    }
    const maxRetriesInp = document.getElementById('max-retries-input');
    if (maxRetriesInp) maxRetriesInp.value = globalState.maxRetries;

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
