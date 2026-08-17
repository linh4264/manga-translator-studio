// State & Database Management for Manga Translator Studio
import { globalBus } from './events.js';
import {
    DEFAULT_MODEL,
    DEFAULT_PIPELINE_MODE,
    DEFAULT_OCR_MODEL,
    DEFAULT_TRANSLATION_MODEL,
    DEFAULT_INPAINT_METHOD,
    DEFAULT_AI_BLOCK_BOX,
    DEFAULT_VERTICAL_WRITING_MODE,
    DEFAULT_BLOCK_STYLE,
    PRO_STYLE_PRESETS,
    MAX_HISTORY_LIMIT,
    TRANSLATION_GENRE_PRESETS,
    COMIC_UNIVERSE_PRESETS,
    COMIC_GENRE_PRESETS,
    COMIC_TONE_PRESETS
} from '../config/constants.js';

export {
    DEFAULT_MODEL,
    DEFAULT_PIPELINE_MODE,
    DEFAULT_OCR_MODEL,
    DEFAULT_TRANSLATION_MODEL,
    DEFAULT_INPAINT_METHOD,
    DEFAULT_BLOCK_STYLE,
    PRO_STYLE_PRESETS,
    CUSTOM_MODEL_VALUE,
    VALID_MODEL_IDS,
    VALID_OCR_MODEL_IDS,
    VALID_TRANSLATION_MODEL_IDS,
    TRANSLATION_GENRE_PRESETS,
    COMIC_UNIVERSE_PRESETS,
    COMIC_GENRE_PRESETS,
    COMIC_TONE_PRESETS
} from '../config/constants.js';

export function isWeakTranslationModel(modelId) {
    return String(modelId || '').includes('flash-lite');
}

export function isFlash31LiteModel(modelId) {
    return String(modelId || '') === 'gemini-3.1-flash-lite';
}

export const apiKey = "";

export let undoStack = [];
export let redoStack = [];

// Callbacks to decouple UI updates from state logic
let onUndoRedoChange = null;
let onPageListChange = null;
let onSnapshotRestored = null;

/**
 * UI Event Dispatchers
 * Thay thế cho UI Bridge cũ để tránh circular imports.
 */
export const stateEvents = {
    PAGE_LIST_UPDATED: 'ui:update-page-list',
    PROCESSING_OVERLAY: 'ui:update-processing-overlay',
    BACKGROUND_TASK_OVERLAY: 'ui:update-background-overlay',
    ACTIVE_BLOCK_EDITOR_UPDATED: 'ui:update-block-editor',
    SPLIT_VIEW_UPDATED: 'ui:update-split-view',
    RIGHT_TAB_CHANGED: 'ui:set-right-tab'
};

export function uiUpdatePageListUI() { globalBus.publish(stateEvents.PAGE_LIST_UPDATED); }
export function uiUpdateProcessingOverlay(show, message) { globalBus.publish(stateEvents.PROCESSING_OVERLAY, { show, message }); }
export function uiUpdateBackgroundTaskOverlay(show, message, progress) { globalBus.publish(stateEvents.BACKGROUND_TASK_OVERLAY, { show, message, progress }); }
export function uiUpdateActiveBlockEditor() { globalBus.publish(stateEvents.ACTIVE_BLOCK_EDITOR_UPDATED); }
export function uiUpdateSplitView() { globalBus.publish(stateEvents.SPLIT_VIEW_UPDATED); }
export function uiSetRightTab(tab) { globalBus.publish(stateEvents.RIGHT_TAB_CHANGED, tab); }


export function registerStateCallbacks(callbacks) {
    if (callbacks.onUndoRedoChange) onUndoRedoChange = callbacks.onUndoRedoChange;
    if (callbacks.onPageListChange) onPageListChange = callbacks.onPageListChange;
    if (callbacks.onSnapshotRestored) onSnapshotRestored = callbacks.onSnapshotRestored;
}

export function markPageAutoFitDirty(page) {
    if (!page) return;
    page.autoFitRevision = (page.autoFitRevision || 0) + 1;
    if (page.blocks && Array.isArray(page.blocks)) {
        page.blocks.forEach(b => {
            if (b) {
                b.autoFitCache = null;
                b.maskCache = null;
            }
        });
    }
}

export const globalState = {
    apiKey: '',
    aiProvider: 'gemini', // 'gemini' | 'claude' | 'openai' | 'custom'
    apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta', // Base URL for Gemini-compatible APIs
    chapterStoryMemory: [], // Multi-page dialogue and character tone memory
    enableStoryMemory: true, // Toggle story context accumulation
    selectedModel: DEFAULT_MODEL,
    translationPipelineMode: DEFAULT_PIPELINE_MODE, // 'two-step' | 'single-step'
    ocrModel: DEFAULT_OCR_MODEL,                   // Vision + Bounding Box model
    translationModel: DEFAULT_TRANSLATION_MODEL,   // Text-only dialogue translation model
    defaultFont: localStorage.getItem('manga_default_font') || 'font-manga',
    pages: [],
    activePageIndex: -1,
    selectedBlockId: null,
    selectedBlockIds: [],
    magicWandActive: false,
    magicWandDetectedBox: null,
    viewMode: 'overlay', // 'overlay' | 'split' | 'original'
    zoom: 100,
    activeTab: 'edit', // 'edit' | 'style'
    bilingualMode: 'off', // 'off' | 'sub'
    enableHoverTooltip: true, // Show hover tooltip with raw original text
    characterDossier: [], // [{ id, originalName, translatedName, gender, pronounSelf, pronounTarget, personality, notes }]
    lorebook: [],         // [{ id, originalTerm, translatedTerm, category, note }]
    toeicSavedWords: [],
    activeBlockToeicAnalysis: null,
    toeicMode: 'learn', // 'learn' | 'recall'
    activeToeicQuestionIndex: 0,
    toolbarCollapsedMobile: false,
    autoFitEnabled: true, // Auto-scale font size to perfectly fit bubbles (Default enabled)
    preserveNames: true, // Không dịch tên riêng / nhân vật
    glossaryNames: '',   // Danh sách tên riêng cụ thể giữ nguyên
    sourceLanguage: 'auto', // Ngôn ngữ nguồn ('ja' | 'zh' | 'ko' | 'en' | 'auto')
    targetLanguage: 'vi', // Ngôn ngữ đích mặc định ('vi' | 'en' | 'es' | ...)
    uiLanguage: 'vi',     // Ngôn ngữ giao diện ('vi' | 'en')
    exportFormat: localStorage.getItem('manga_export_format') || 'auto', // 'auto' | 'png' | 'jpg' | 'webp'
    pdfQuality: localStorage.getItem('manga_pdf_quality') || 'hd',     // 'hd' | 'standard' | 'max'
    pronounMatrix: '',   // Ma trận xưng hô 2 chiều giữa các nhân vật
    ocrEnhanceEnabled: true, // Tiền xử lý tương phản ảnh trước khi gửi OCR
    translationGenrePresets: ['quality'], // Mẫu prompt theo thể loại (Legacy)
    comicUniverse: localStorage.getItem('manga_comic_universe') || 'auto', // 'auto' | 'manga' | 'manhwa' | 'manhua' | 'us_comic' | 'franco_belgian'
    comicGenres: (() => {
        try {
            const saved = localStorage.getItem('manga_comic_genres');
            if (saved) return JSON.parse(saved);
            const oldSingle = localStorage.getItem('manga_comic_genre');
            return oldSingle ? [oldSingle] : ['fantasy', 'isekai'];
        } catch (e) {
            return ['fantasy', 'isekai'];
        }
    })(),
    comicTone: localStorage.getItem('manga_comic_tone') || 'classic',      // 'classic' | 'comedy' | 'dark' | 'poetic'
    translationContextPrompt: localStorage.getItem('gemini_manga_translation_context_prompt') || '', // Prompt ngữ cảnh bổ sung cho dịch thuật
    apiDelay: 2,       // Giãn cách gửi yêu cầu API (giây) tránh lỗi 429
    maxRetries: 3,     // Số lần thử lại tối đa khi gặp lỗi API tạm thời
    // Global style presets for new/default blocks
    globalStyle: {
        ...DEFAULT_BLOCK_STYLE,
        fontFamily: localStorage.getItem('manga_default_font') || 'font-manga',
        vertical: DEFAULT_VERTICAL_WRITING_MODE
    }
};

export function initializeStateFromStorage() {
    const keysToLoad = {
        'gemini_manga_api_key': 'apiKey',
        'gemini_manga_ai_provider': 'aiProvider',
        'gemini_manga_api_endpoint': 'apiEndpoint',
        'gemini_manga_model': 'selectedModel',
        'gemini_manga_pipeline_mode': 'translationPipelineMode',
        'gemini_manga_ocr_model': 'ocrModel',
        'gemini_manga_translation_model': 'translationModel',
        'gemini_manga_inpaint_method': 'inpaintMethod',
        'gemini_manga_inpaint_endpoint': 'customInpaintEndpoint',
        'gemini_manga_autofit_enabled': 'autoFitEnabled',
        'gemini_manga_preserve_names': 'preserveNames',
        'gemini_manga_glossary': 'glossaryNames',
        'gemini_manga_translation_context_prompt': 'translationContextPrompt',
        'gemini_manga_source_lang': 'sourceLanguage',
        'gemini_manga_target_lang': 'targetLanguage',
        'gemini_manga_pronoun_matrix': 'pronounMatrix',
        'gemini_manga_ocr_enhance': 'ocrEnhanceEnabled',
        'gemini_manga_api_delay': 'apiDelay',
        'gemini_manga_max_retries': 'maxRetries',
        'manga_comic_universe': 'comicUniverse',
        'manga_comic_tone': 'comicTone',
        'manga_default_dialogue_font': 'defaultDialogueFont',
        'manga_default_sfx_font': 'defaultSfxFont',
        'manga_default_narration_font': 'defaultNarrationFont',
        'manga_default_font': 'defaultFont',
        'manga_export_format': 'exportFormat',
        'manga_pdf_quality': 'pdfQuality'
    };

    Object.entries(keysToLoad).forEach(([storageKey, stateKey]) => {
        const val = localStorage.getItem(storageKey);
        if (val !== null) {
            if (stateKey === 'autoFitEnabled' || stateKey === 'preserveNames') {
                globalState[stateKey] = val === 'true';
            } else if (stateKey === 'apiDelay' || stateKey === 'maxRetries') {
                globalState[stateKey] = parseInt(val, 10);
            } else if (stateKey === 'ocrEnhanceEnabled') {
                try { globalState[stateKey] = JSON.parse(val); } catch (e) { globalState[stateKey] = true; }
            } else if (stateKey === 'audioSettings') {
                try { globalState[stateKey] = JSON.parse(val); } catch (e) { console.error("Lỗi parse audioSettings:", e); }
            } else if (stateKey === 'defaultFont') {
                globalState.defaultFont = val;
                if (globalState.globalStyle) globalState.globalStyle.fontFamily = val;
            } else {
                globalState[stateKey] = val;
            }
        }
    });

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
}

// --- UNDO / REDO CONTROLLERS ---
export function pushStateToHistory() {
    const currentState = globalState.pages.map(page => ({
        id: page.id,
        status: page.status,
        eraserLayerBlob: page.eraserLayerBlob || null,
        blocks: page.blocks.map(block => ({
            id: block.id,
            type: block.type,
            imageUrl: block.imageUrl || null,
            original: block.original,
            translated: block.translated,
            box: { ...block.box },
            style: { ...block.style }
        }))
    }));

    undoStack.push({
        pagesState: currentState,
        activePageIndex: globalState.activePageIndex,
        selectedBlockId: globalState.selectedBlockId,
        selectedBlockIds: [...(globalState.selectedBlockIds || [])]
    });

    if (undoStack.length > MAX_HISTORY_LIMIT) {
        undoStack.shift();
    }

    redoStack.length = 0;
    if (onUndoRedoChange) onUndoRedoChange();
}

export function clearHistory() {
    undoStack = [];
    redoStack = [];
    if (onUndoRedoChange) onUndoRedoChange();
}

export function applyStateFromSnapshot(snapshot) {
    if (!snapshot) return;

    snapshot.pagesState.forEach(savedPage => {
        const targetPage = globalState.pages.find(p => p.id === savedPage.id);
        if (targetPage) {
            targetPage.status = savedPage.status;
            targetPage.eraserLayerBlob = savedPage.eraserLayerBlob || null;
            targetPage.blocks = savedPage.blocks.map(b => ({
                id: b.id,
                type: b.type,
                imageUrl: b.imageUrl || null,
                original: b.original,
                translated: b.translated,
                box: { ...b.box },
                style: { ...b.style },
                textWidth: b.textWidth,
                textHeight: b.textHeight
            }));
            targetPage.autoFitRevision = (targetPage.autoFitRevision || 0) + 1;
            savePageToDB(targetPage);
        }
    });

    globalState.activePageIndex = snapshot.activePageIndex;
    globalState.selectedBlockId = snapshot.selectedBlockId;
    globalState.selectedBlockIds = Array.isArray(snapshot.selectedBlockIds)
        ? [...snapshot.selectedBlockIds]
        : (snapshot.selectedBlockId ? [snapshot.selectedBlockId] : []);

    if (onUndoRedoChange) onUndoRedoChange();

    if (onSnapshotRestored) {
        onSnapshotRestored(snapshot);
    } else {
        uiUpdatePageListUI();
        if (typeof window !== 'undefined' && typeof window.selectPage === 'function' && globalState.activePageIndex !== -1) {
            window.selectPage(globalState.activePageIndex);
        }
        globalState.selectedBlockId = snapshot.selectedBlockId;
        globalState.selectedBlockIds = Array.isArray(snapshot.selectedBlockIds)
            ? [...snapshot.selectedBlockIds]
            : (snapshot.selectedBlockId ? [snapshot.selectedBlockId] : []);
        uiUpdateActiveBlockEditor();
    }
}

export function executeUndo() {
    if (undoStack.length === 0) return;
    const currentState = globalState.pages.map(page => ({
        id: page.id,
        status: page.status,
        eraserLayerBlob: page.eraserLayerBlob || null,
        blocks: page.blocks.map(block => ({
            id: block.id,
            type: block.type,
            imageUrl: block.imageUrl || null,
            original: block.original,
            translated: block.translated,
            box: { ...block.box },
            style: { ...block.style }
        }))
    }));

    redoStack.push({
        pagesState: currentState,
        activePageIndex: globalState.activePageIndex,
        selectedBlockId: globalState.selectedBlockId,
        selectedBlockIds: [...(globalState.selectedBlockIds || [])]
    });

    const previous = undoStack.pop();
    applyStateFromSnapshot(previous);
}

export function executeRedo() {
    if (redoStack.length === 0) return;
    const currentState = globalState.pages.map(page => ({
        id: page.id,
        status: page.status,
        eraserLayerBlob: page.eraserLayerBlob || null,
        blocks: page.blocks.map(block => ({
            id: block.id,
            type: block.type,
            imageUrl: block.imageUrl || null,
            original: block.original,
            translated: block.translated,
            box: { ...block.box },
            style: { ...block.style }
        }))
    }));

    undoStack.push({
        pagesState: currentState,
        activePageIndex: globalState.activePageIndex,
        selectedBlockId: globalState.selectedBlockId,
        selectedBlockIds: [...(globalState.selectedBlockIds || [])]
    });

    const next = redoStack.pop();
    applyStateFromSnapshot(next);
}

if (typeof window !== 'undefined') {
    window.executeUndo = executeUndo;
    window.executeRedo = executeRedo;
}

// --- INDEXEDDB PERSISTENCE MANAGER FOR AUTO-SAVE & RESTORE ---
const DB_NAME = 'MangaTranslatorDB';
const DB_VERSION = 2; // Nâng cấp lên v2 để hỗ trợ lưu phông chữ cá nhân
const STORE_PAGES = 'pages';
const STORE_META = 'meta';
const STORE_FONTS = 'fonts'; // Bảng lưu phông chữ nhị phân
let dbInstance = null;
let savePageDebounceTimer = null;

export function getSafeMediaUrl(item) {
    if (!item) return null;
    if (typeof item === 'string') return item;
    if (item instanceof Blob) {
        try {
            return URL.createObjectURL(item);
        } catch (e) {
            console.error("getSafeMediaUrl failed:", e);
            return null;
        }
    }
    return null;
}

export function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains(STORE_PAGES)) {
                database.createObjectStore(STORE_PAGES, { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains(STORE_META)) {
                database.createObjectStore(STORE_META);
            }
            if (!database.objectStoreNames.contains(STORE_FONTS)) {
                database.createObjectStore(STORE_FONTS, { keyPath: 'family' });
            }
        };
        request.onsuccess = (e) => {
            dbInstance = e.target.result;
            resolve(dbInstance);
        };
        request.onerror = (e) => {
            reject(e.target.error);
        };
    });
}

export function savePageToDB(page) {
    if (!dbInstance || !page || !page.id) return Promise.resolve();
    return new Promise((resolve, reject) => {
        try {
            const transaction = dbInstance.transaction([STORE_PAGES], 'readwrite');
            const store = transaction.objectStore(STORE_PAGES);

            // Dọn dẹp các khối blocks để loại bỏ các thuộc tính DOM không thể clone (như HTMLCanvasElement trong maskCache)
            const cleanBlocks = (page.blocks || []).map(block => {
                const cleanBlock = {
                    id: block.id,
                    type: block.type || 'dialogue',
                    imageUrl: block.imageUrl || null,
                    original: block.original || '',
                    translated: block.translated || '',
                    box: block.box ? { ...block.box } : { x: 0, y: 0, w: 10, h: 10 },
                    style: block.style ? { ...block.style } : {}
                };
                if (block.speaker !== undefined) cleanBlock.speaker = block.speaker;
                if (block.target !== undefined) cleanBlock.target = block.target;
                if (block.textWidth !== undefined) cleanBlock.textWidth = block.textWidth;
                if (block.textHeight !== undefined) cleanBlock.textHeight = block.textHeight;
                cleanBlock.maskCache = null;
                cleanBlock.autoFitCache = null;
                return cleanBlock;
            });

            // Clone dữ liệu trang nhưng bỏ qua các blob URL tạm thời sẽ bị hỏng khi reload
            const pageToSave = {
                id: page.id,
                name: page.name || 'Page',
                width: page.width || 800,
                height: page.height || 1200,
                apiWidth: page.apiWidth || page.width || 800,
                apiHeight: page.apiHeight || page.height || 1200,
                status: page.status || 'draft',
                blocks: cleanBlocks,
                file: (page.file instanceof Blob) ? page.file : null,
                originalFile: (page.originalFile instanceof Blob) ? page.originalFile : null,
                eraserLayerBlob: (page.eraserLayerBlob instanceof Blob) ? page.eraserLayerBlob : null,
                thumbnailBlob: (page.thumbnailBlob instanceof Blob) ? page.thumbnailBlob : null
            };

            const request = store.put(pageToSave);
            request.onsuccess = () => resolve();
            request.onerror = (e) => {
                console.error(`Lỗi DB store.put cho trang ${page.id}:`, e.target.error);
                reject(e.target.error);
            };
        } catch (err) {
            console.error(`Ngoại lệ savePageToDB cho trang ${page?.id}:`, err);
            reject(err);
        }
    });
}

export function debounceSavePage(page) {
    clearTimeout(savePageDebounceTimer);
    savePageDebounceTimer = setTimeout(() => {
        pushStateToHistory(); // Lưu trạng thái văn bản sau khi gõ xong
        savePageToDB(page);
    }, 1000);
}

export function deletePageFromDB(pageId) {
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_PAGES], 'readwrite');
        const store = transaction.objectStore(STORE_PAGES);
        const request = store.delete(pageId);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

export function saveProjectMeta(pageIds, activePageIndex) {
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        try {
            const transaction = dbInstance.transaction([STORE_META], 'readwrite');
            const store = transaction.objectStore(STORE_META);
            const request = store.put({
                pageIds: Array.isArray(pageIds) ? pageIds : [],
                activePageIndex: typeof activePageIndex === 'number' ? activePageIndex : 0,
                characterDossier: globalState.characterDossier || [],
                lorebook: globalState.lorebook || []
            }, 'project_meta');
            request.onsuccess = () => resolve();
            request.onerror = (e) => {
                console.error("Lỗi lưu metadata dự án:", e.target.error);
                reject(e.target.error);
            };
        } catch (err) {
            console.error("Lỗi ngoại lệ khi lưu metadata dự án:", err);
            reject(err);
        }
    });
}

export async function loadProjectFromDB() {
    if (!dbInstance) return null;

    // Transaction 1: Đọc metadata
    let meta = null;
    try {
        meta = await new Promise((resolve) => {
            const tx = dbInstance.transaction([STORE_META], 'readonly');
            const store = tx.objectStore(STORE_META);
            const req = store.get('project_meta');
            req.onsuccess = (e) => resolve(e.target.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (err) {
        console.error('loadProjectFromDB: Lỗi đọc metadata:', err);
    }

    if (meta) {
        if (meta.characterDossier) globalState.characterDossier = meta.characterDossier;
        if (meta.lorebook) globalState.lorebook = meta.lorebook;
    }

    // Transaction 2: Đọc tất cả các trang đã lưu
    let rawPages = [];
    try {
        rawPages = await new Promise((resolve) => {
            const tx = dbInstance.transaction([STORE_PAGES], 'readonly');
            const store = tx.objectStore(STORE_PAGES);
            const req = store.getAll();
            req.onsuccess = (e) => resolve(e.target.result || []);
            req.onerror = () => resolve([]);
        });
    } catch (err) {
        console.error('loadProjectFromDB: Lỗi đọc rawPages:', err);
    }

    if (!rawPages || rawPages.length === 0) {
        return null;
    }

    const pagesMap = new Map(rawPages.map(p => [p.id, p]));
    const pages = [];

    // Lần lượt đọc theo thứ tự meta.pageIds nếu có
    if (meta && Array.isArray(meta.pageIds) && meta.pageIds.length > 0) {
        for (const id of meta.pageIds) {
            const p = pagesMap.get(id);
            if (p) {
                pages.push(p);
                pagesMap.delete(id);
            }
        }
    }

    // Nếu còn trang nào trong IndexedDB chưa có trong pageIds thì giữ lại nốt (tránh mất dữ liệu)
    for (const p of pagesMap.values()) {
        pages.push(p);
    }

    if (pages.length === 0) {
        return null;
    }

    for (const p of pages) {
        p.src = null;
        p.apiSrc = null;

        if (p.thumbnailBlob && (p.thumbnailBlob instanceof Blob)) {
            p.thumbnailSrc = getSafeMediaUrl(p.thumbnailBlob);
        } else if (p.file || p.originalFile) {
            const fileToUse = (p.file instanceof Blob) ? p.file : ((p.originalFile instanceof Blob) ? p.originalFile : null);
            p.thumbnailSrc = getSafeMediaUrl(fileToUse);
            if (fileToUse) {
                setTimeout(() => generateAndSaveThumbnailForPage(p), 100);
            }
        } else {
            p.thumbnailSrc = null;
        }

        if (p.blocks) {
            p.blocks.forEach(block => {
                delete block.maskCache;
                delete block.autoFitCache;
            });
        }
    }

    const activePageIndex = meta && typeof meta.activePageIndex === 'number' && meta.activePageIndex >= 0 && meta.activePageIndex < pages.length
        ? meta.activePageIndex
        : 0;

    return { pages, activePageIndex };
}

export function clearProjectDB() {
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_PAGES, STORE_META], 'readwrite');
        transaction.objectStore(STORE_PAGES).clear();
        transaction.objectStore(STORE_META).clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = (e) => reject(e.target.error);
    });
}

// --- CUSTOM FONTS DATABASE OPERATIONS ---
export function getAllFontsFromDB() {
    if (!dbInstance) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_FONTS], 'readonly');
        const store = transaction.objectStore(STORE_FONTS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (e) => reject(e.target.error);
    });
}

export function saveFontToDB(family, blob) {
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_FONTS], 'readwrite');
        const store = transaction.objectStore(STORE_FONTS);
        const request = store.put({ family, blob });
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

// --- INDEXEDDB EXTENSION FOR TOEIC WORDS ---
export function loadToeicWordsFromDB() {
    if (!dbInstance) return Promise.resolve([]);
    return new Promise((resolve) => {
        const transaction = dbInstance.transaction([STORE_META], 'readonly');
        const store = transaction.objectStore(STORE_META);
        const request = store.get('saved_toeic_words');
        request.onsuccess = (e) => {
            const data = e.target.result;
            resolve(data || []);
        };
        request.onerror = () => {
            resolve([]);
        };
    });
}

export function saveToeicWordsToDB(words) {
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_META], 'readwrite');
        const store = transaction.objectStore(STORE_META);
        const request = store.put(words, 'saved_toeic_words');
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

// --- PAGE RESOURCE MANAGEMENT UTILITIES ---
export async function createThumbnail(file, maxDim = 120) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = getSafeMediaUrl(file);
        if (!url) {
            resolve(null);
            return;
        }
        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height *= maxDim / width;
                    width = maxDim;
                } else {
                    width *= maxDim / height;
                    height = maxDim;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/jpeg', 0.7);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        img.src = url;
    });
}

export async function activatePage(page) {
    if (!page) return;

    if (!page.src) {
        page.src = getSafeMediaUrl(page.originalFile) || getSafeMediaUrl(page.file);

        if (!page.src && page.id) {
            try {
                const dbPage = await _loadPageBlobFromDB(page.id);
                if (dbPage) {
                    if (dbPage.originalFile) page.originalFile = dbPage.originalFile;
                    if (dbPage.file) page.file = dbPage.file;
                    page.src = getSafeMediaUrl(page.originalFile) || getSafeMediaUrl(page.file);
                }
            } catch (err) {
                console.warn("activatePage DB load error:", err);
            }
        }
    }

    if (!page.apiSrc) {
        page.apiSrc = getSafeMediaUrl(page.file) || getSafeMediaUrl(page.originalFile) || page.src;
    }
}

// Helper: Load page blob from IndexedDB by ID
export function _loadPageBlobFromDB(pageId) {
    if (dbInstance) {
        return new Promise((resolve) => {
            try {
                const tx = dbInstance.transaction([STORE_PAGES], 'readonly');
                const store = tx.objectStore(STORE_PAGES);
                const req = store.get(pageId);
                req.onsuccess = (e) => resolve(e.target.result || null);
                req.onerror = () => resolve(null);
            } catch {
                resolve(null);
            }
        });
    }
    return new Promise((resolve) => {
        try {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onsuccess = (e) => {
                const db = e.target.result;
                const tx = db.transaction([STORE_PAGES], 'readonly');
                const store = tx.objectStore(STORE_PAGES);
                const getReq = store.get(pageId);
                getReq.onsuccess = (ev) => resolve(ev.target.result || null);
                getReq.onerror = () => resolve(null);
            };
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

// Lấy base64 Data URL của trang (dành cho xuất dự án, hoạt động với cả trang active & inactive)
export async function getPageDataURL(page) {
    if (!page) return null;

    let blob = page.originalFile || page.file;
    if (!blob && page.id) {
        try {
            const dbPage = await _loadPageBlobFromDB(page.id);
            if (dbPage) {
                blob = dbPage.originalFile || dbPage.file;
                if (dbPage.originalFile) page.originalFile = dbPage.originalFile;
                if (dbPage.file) page.file = dbPage.file;
            }
        } catch (err) {
            console.warn("getPageDataURL DB load error:", err);
        }
    }

    if (blob && blob instanceof Blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    if (page.src && page.src.startsWith('data:')) {
        return page.src;
    }

    if (page.src && page.src.startsWith('blob:')) {
        try {
            const resp = await fetch(page.src);
            const b = await resp.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(b);
            });
        } catch (err) {
            console.warn("getPageDataURL fetch blob error:", err);
        }
    }

    return null;
}

export function deactivatePage(page) {
    if (!page) return;
    if (page.src && page.src.startsWith('blob:')) {
        URL.revokeObjectURL(page.src);
        page.src = null;
    }
    if (page.apiSrc && page.apiSrc.startsWith('blob:')) {
        URL.revokeObjectURL(page.apiSrc);
        page.apiSrc = null;
    }
    page.imageDataCache = null;
    if (page.blocks) {
        page.blocks.forEach(b => {
            b.maskCache = null;
        });
    }
}

export function garbageCollectPageCaches(previewCurrentPage = null) {
    const activePage = globalState.pages[globalState.activePageIndex];
    const previewPage = previewCurrentPage !== null ? globalState.pages[previewCurrentPage] : null;

    globalState.pages.forEach((p) => {
        if (p !== activePage && p !== previewPage) {
            deactivatePage(p);
        }
    });
}

export async function generateAndSaveThumbnailForPage(page) {
    if (page.thumbnailBlob) return;
    try {
        const fileToUse = page.file || page.originalFile;
        if (!fileToUse) return;
        const thumbBlob = await createThumbnail(fileToUse, 120);
        if (thumbBlob) {
            page.thumbnailBlob = thumbBlob;
            if (page.thumbnailSrc && page.thumbnailSrc.startsWith('blob:')) {
                URL.revokeObjectURL(page.thumbnailSrc);
            }
            page.thumbnailSrc = URL.createObjectURL(thumbBlob);
            await savePageToDB(page);
            if (onPageListChange) onPageListChange(page);
        }
    } catch (err) {
        console.error("Lỗi tạo ảnh nhỏ (thumbnail) cho trang:", page.id, err);
    }
}

// --- LOAD AND REGISTER CUSTOM FONTS FROM INDEXEDDB ---
const loadedCustomFontFamilies = new Set();

export async function loadAndRegisterCustomFonts() {
    try {
        const fonts = await getAllFontsFromDB();
        for (const fontEntry of fonts) {
            if (!fontEntry?.family || loadedCustomFontFamilies.has(fontEntry.family)) {
                continue;
            }

            let fontUrl = null;
            try {
                fontUrl = URL.createObjectURL(fontEntry.blob);
                const fontFace = new FontFace(fontEntry.family, `url(${fontUrl})`);
                await fontFace.load();
                document.fonts.add(fontFace);
                loadedCustomFontFamilies.add(fontEntry.family);
            } catch (fontErr) {
                console.warn(`Không thể tải phông chữ "${fontEntry.family}":`, fontErr);
            } finally {
                if (fontUrl) {
                    URL.revokeObjectURL(fontUrl);
                }
            }
        }
        if (fonts.length > 0) {
            console.log(`Đã tải ${fonts.length} phông chữ tùy chỉnh từ IndexedDB.`);
        }
    } catch (err) {
        console.error("Lỗi tải phông chữ tùy chỉnh:", err);
    }
}

export async function deleteFontFromDB(family) {
    return new Promise((resolve, reject) => {
        if (!dbInstance) {
            reject(new Error("Cơ sở dữ liệu chưa sẵn sàng."));
            return;
        }
        const tx = dbInstance.transaction(STORE_FONTS, 'readwrite');
        const store = tx.objectStore(STORE_FONTS);
        const req = store.delete(family);
        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e.target.error);
    });
}

