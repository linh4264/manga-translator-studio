// State & Database Management for Manga Translator Studio
import { globalBus } from './events';
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
    COMIC_TONE_PRESETS,
    DEFAULT_TYPE_FONTS
} from '../config/constants';
import { MangaBlock, MangaPage, BlockStyle, GlobalState } from '../types/index';
import { safeSetLocalStorage } from './utils/storage';

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
} from '../config/constants';

export function isWeakTranslationModel(modelId?: string): boolean {
    return String(modelId || '').includes('flash-lite');
}

export function isFlash31LiteModel(modelId?: string): boolean {
    return String(modelId || '') === 'gemini-3.1-flash-lite';
}

export let undoStack: any[] = [];
export let redoStack: any[] = [];

// Callbacks to decouple UI updates from state logic
let onUndoRedoChange: (() => void) | null = null;
let onPageListChange: ((page?: any) => void) | null = null;
let onSnapshotRestored: ((snapshot: any) => void) | null = null;

/**
 * UI Event Dispatchers
 */
export const stateEvents = {
    PAGE_LIST_UPDATED: 'ui:update-page-list',
    PROCESSING_OVERLAY: 'ui:update-processing-overlay',
    BACKGROUND_TASK_OVERLAY: 'ui:update-background-overlay',
    ACTIVE_BLOCK_EDITOR_UPDATED: 'ui:update-block-editor',
    SPLIT_VIEW_UPDATED: 'ui:update-split-view',
    RIGHT_TAB_CHANGED: 'ui:set-right-tab'
};

export function uiUpdatePageListUI(): void { globalBus.publish(stateEvents.PAGE_LIST_UPDATED); }
export function uiUpdateProcessingOverlay(show: boolean, message?: string, subtitle?: string, percent?: number): void { globalBus.publish(stateEvents.PROCESSING_OVERLAY, { show, message, subtitle, percent }); }
export function uiUpdateBackgroundTaskOverlay(show: boolean, message?: string, subtitle?: string | number, progress?: number): void {
    let subStr = '';
    let progVal = 0;
    if (typeof subtitle === 'number' && progress === undefined) {
        progVal = subtitle;
        subStr = '';
    } else {
        subStr = subtitle !== undefined && subtitle !== null ? String(subtitle) : '';
        progVal = progress !== undefined && progress !== null ? Number(progress) : 0;
    }
    globalBus.publish(stateEvents.BACKGROUND_TASK_OVERLAY, {
        show,
        message: message || '',
        subtitle: subStr,
        progress: Math.min(100, Math.max(0, progVal))
    });
}
export function uiUpdateActiveBlockEditor(): void { globalBus.publish(stateEvents.ACTIVE_BLOCK_EDITOR_UPDATED); }
export function uiUpdateSplitView(): void { globalBus.publish(stateEvents.SPLIT_VIEW_UPDATED); }
export function uiSetRightTab(tab: string): void { globalBus.publish(stateEvents.RIGHT_TAB_CHANGED, tab); }

export function registerStateCallbacks(callbacks: {
    onUndoRedoChange?: () => void;
    onPageListChange?: (page?: any) => void;
    onSnapshotRestored?: (snapshot: any) => void;
}): void {
    if (callbacks.onUndoRedoChange) onUndoRedoChange = callbacks.onUndoRedoChange;
    if (callbacks.onPageListChange) onPageListChange = callbacks.onPageListChange;
    if (callbacks.onSnapshotRestored) onSnapshotRestored = callbacks.onSnapshotRestored;
}

export function markPageAutoFitDirty(page: any): void {
    if (!page) return;
    page.autoFitRevision = (page.autoFitRevision || 0) + 1;
    if (page.blocks && Array.isArray(page.blocks)) {
        page.blocks.forEach((b: any) => {
            if (b) {
                b.autoFitCache = null;
                b.maskCache = null;
            }
        });
    }
}

export const globalState: GlobalState & Record<string, any> = {
    apiKey: '',
    aiProvider: 'gemini', // 'gemini' | 'claude' | 'openai' | 'custom'
    apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta', // Base URL for Gemini-compatible APIs
    chapterStoryMemory: [], // Multi-page dialogue and character tone memory
    enableStoryMemory: true, // Toggle story context accumulation
    selectedModel: DEFAULT_MODEL,
    translationPipelineMode: DEFAULT_PIPELINE_MODE, // 'two-step' | 'single-step'
    ocrModel: DEFAULT_OCR_MODEL,                   // Vision + Bounding Box model
    translationModel: DEFAULT_TRANSLATION_MODEL,   // Text-only dialogue translation model
    defaultDialogueFont: localStorage.getItem('manga_default_dialogue_font') || localStorage.getItem('manga_default_font') || DEFAULT_TYPE_FONTS.dialogue,
    defaultNarrationFont: localStorage.getItem('manga_default_narration_font') || DEFAULT_TYPE_FONTS.narration,
    defaultThoughtFont: localStorage.getItem('manga_default_thought_font') || DEFAULT_TYPE_FONTS.thought,
    defaultSfxFont: localStorage.getItem('manga_default_sfx_font') || DEFAULT_TYPE_FONTS.sfx,
    defaultFont: localStorage.getItem('manga_default_dialogue_font') || localStorage.getItem('manga_default_font') || DEFAULT_TYPE_FONTS.dialogue,
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
    autoFitEnabled: true, // Auto-scale font size enabled by default
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
    },
    customStylePresets: (() => {
        try {
            const saved = localStorage.getItem('manga_custom_style_presets');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    })()
};

export function saveCustomPresetsToStorage(): void {
    safeSetLocalStorage('manga_custom_style_presets', globalState.customStylePresets || []);
}

export function initializeStateFromStorage(): void {
    const keysToLoad: Record<string, string> = {
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
        'manga_default_narration_font': 'defaultNarrationFont',
        'manga_default_thought_font': 'defaultThoughtFont',
        'manga_default_sfx_font': 'defaultSfxFont',
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
            } else if (stateKey === 'defaultDialogueFont' || stateKey === 'defaultFont') {
                globalState.defaultDialogueFont = val;
                globalState.defaultFont = val;
                if (globalState.globalStyle) globalState.globalStyle.fontFamily = val;
            } else {
                globalState[stateKey] = val;
            }
        }
    });

    try {
        const savedCustomPresets = localStorage.getItem('manga_custom_style_presets');
        if (savedCustomPresets) {
            globalState.customStylePresets = JSON.parse(savedCustomPresets);
        } else if (!globalState.customStylePresets) {
            globalState.customStylePresets = [];
        }
    } catch (e) {
        console.warn('Lỗi đọc manga_custom_style_presets:', e);
        globalState.customStylePresets = [];
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
}

// Helper to deep clone block array for Undo/Redo history snapshots
function cloneBlocksForHistory(blocks: any[]): any[] {
    if (!Array.isArray(blocks)) return [];
    return blocks.map((block: any) => ({
        id: block.id,
        type: block.type || 'dialogue',
        imageUrl: block.imageUrl || null,
        original: block.original || '',
        translated: block.translated || '',
        box: block.box ? { ...block.box } : { x: 0, y: 0, w: 10, h: 10 },
        style: block.style ? { ...block.style } : {},
        speaker: block.speaker !== undefined ? block.speaker : undefined,
        target: block.target !== undefined ? block.target : undefined,
        vertical: block.vertical !== undefined ? block.vertical : undefined,
        originalBackgroundBackup: block.originalBackgroundBackup || undefined,
        textWidth: block.textWidth,
        textHeight: block.textHeight
    }));
}

function clonePageForHistory(page: any): any {
    return {
        id: page.id,
        name: page.name || 'Page',
        width: page.width,
        height: page.height,
        apiWidth: page.apiWidth,
        apiHeight: page.apiHeight,
        status: page.status,
        file: page.file || null,
        originalFile: page.originalFile || null,
        thumbnailBlob: page.thumbnailBlob || null,
        thumbnailSrc: page.thumbnailSrc || null,
        src: page.src || null,
        apiSrc: page.apiSrc || null,
        eraserLayerBlob: page.eraserLayerBlob || null,
        autoFitRevision: page.autoFitRevision || 0,
        blocks: cloneBlocksForHistory(page.blocks)
    };
}

// --- UNDO / REDO CONTROLLERS ---
export function pushStateToHistory(): void {
    const currentState = globalState.pages.map((page: any) => clonePageForHistory(page));

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

export function clearHistory(): void {
    undoStack = [];
    redoStack = [];
    if (onUndoRedoChange) onUndoRedoChange();
}

export function applyStateFromSnapshot(snapshot: any): void {
    if (!snapshot || !Array.isArray(snapshot.pagesState)) return;

    const snapshotPageIds = new Set(snapshot.pagesState.map((sp: any) => sp.id));

    // 1. Remove pages from DB that are not in snapshot
    const pagesToDelete = globalState.pages.filter((p: any) => !snapshotPageIds.has(p.id));
    pagesToDelete.forEach((p: any) => {
        deletePageFromDB(p.id);
    });

    // 2. Restore or update all pages from snapshot
    const existingPagesMap = new Map(globalState.pages.map((p: any) => [p.id, p]));
    const restoredPages: any[] = [];

    snapshot.pagesState.forEach((savedPage: any) => {
        let page = existingPagesMap.get(savedPage.id);
        if (page) {
            page.name = savedPage.name || page.name;
            page.status = savedPage.status;
            page.width = savedPage.width || page.width;
            page.height = savedPage.height || page.height;
            page.apiWidth = savedPage.apiWidth || page.apiWidth;
            page.apiHeight = savedPage.apiHeight || page.apiHeight;
            page.file = savedPage.file || page.file;
            page.originalFile = savedPage.originalFile || page.originalFile;
            page.thumbnailBlob = savedPage.thumbnailBlob || page.thumbnailBlob;
            page.eraserLayerBlob = savedPage.eraserLayerBlob || null;
            page.blocks = cloneBlocksForHistory(savedPage.blocks);
            page.autoFitRevision = (page.autoFitRevision || 0) + 1;
        } else {
            page = {
                id: savedPage.id,
                name: savedPage.name || 'Page',
                width: savedPage.width || 800,
                height: savedPage.height || 1200,
                apiWidth: savedPage.apiWidth || savedPage.width || 800,
                apiHeight: savedPage.apiHeight || savedPage.height || 1200,
                status: savedPage.status || 'draft',
                file: savedPage.file || null,
                originalFile: savedPage.originalFile || null,
                thumbnailBlob: savedPage.thumbnailBlob || null,
                thumbnailSrc: savedPage.thumbnailSrc || null,
                src: null,
                apiSrc: null,
                eraserLayerBlob: savedPage.eraserLayerBlob || null,
                blocks: cloneBlocksForHistory(savedPage.blocks),
                autoFitRevision: 1
            };
        }
        savePageToDB(page);
        restoredPages.push(page);
    });

    globalState.pages = restoredPages;

    globalState.activePageIndex = (typeof snapshot.activePageIndex === 'number' && snapshot.activePageIndex >= 0 && snapshot.activePageIndex < globalState.pages.length)
        ? snapshot.activePageIndex
        : (globalState.pages.length > 0 ? 0 : -1);

    globalState.selectedBlockId = snapshot.selectedBlockId || null;
    globalState.selectedBlockIds = Array.isArray(snapshot.selectedBlockIds)
        ? [...snapshot.selectedBlockIds]
        : (snapshot.selectedBlockId ? [snapshot.selectedBlockId] : []);

    saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);

    if (onUndoRedoChange) onUndoRedoChange();

    if (onSnapshotRestored) {
        onSnapshotRestored(snapshot);
    } else {
        uiUpdatePageListUI();
        if (typeof window !== 'undefined' && typeof (window as any).selectPage === 'function' && globalState.activePageIndex !== -1) {
            (window as any).selectPage(globalState.activePageIndex);
        }
        globalState.selectedBlockId = snapshot.selectedBlockId;
        globalState.selectedBlockIds = Array.isArray(snapshot.selectedBlockIds)
            ? [...snapshot.selectedBlockIds]
            : (snapshot.selectedBlockId ? [snapshot.selectedBlockId] : []);
        uiUpdateActiveBlockEditor();
    }
}

export function executeUndo(): void {
    if (undoStack.length === 0) return;
    const currentState = globalState.pages.map((page: any) => clonePageForHistory(page));

    redoStack.push({
        pagesState: currentState,
        activePageIndex: globalState.activePageIndex,
        selectedBlockId: globalState.selectedBlockId,
        selectedBlockIds: [...(globalState.selectedBlockIds || [])]
    });

    const previous = undoStack.pop();
    applyStateFromSnapshot(previous);
}

export function executeRedo(): void {
    if (redoStack.length === 0) return;
    const currentState = globalState.pages.map((page: any) => clonePageForHistory(page));

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
    (window as any).executeUndo = executeUndo;
    (window as any).executeRedo = executeRedo;
}

// --- INDEXEDDB PERSISTENCE MANAGER FOR AUTO-SAVE & RESTORE ---
const DB_NAME = 'MangaTranslatorDB';
const DB_VERSION = 2;
const STORE_PAGES = 'pages';
const STORE_META = 'meta';
const STORE_FONTS = 'fonts';
let dbInstance: IDBDatabase | null = null;
let savePageDebounceTimer: any = null;

export function getSafeMediaUrl(item: any): string | null {
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

export function initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e: any) => {
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
        request.onsuccess = (e: any) => {
            dbInstance = e.target.result;
            resolve(dbInstance!);
        };
        request.onerror = (e: any) => {
            reject(e.target.error);
        };
    });
}

export function savePageToDB(page: any): Promise<void> {
    if (!dbInstance || !page || !page.id) return Promise.resolve();
    return new Promise((resolve, reject) => {
        try {
            const transaction = dbInstance!.transaction([STORE_PAGES], 'readwrite');
            const store = transaction.objectStore(STORE_PAGES);

            const cleanBlocks = (page.blocks || []).map((block: any) => {
                const cleanBlock: any = {
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
            request.onerror = (e: any) => {
                console.error(`Lỗi DB store.put cho trang ${page.id}:`, e.target.error);
                reject(e.target.error);
            };
        } catch (err) {
            console.error(`Ngoại lệ savePageToDB cho trang ${page?.id}:`, err);
            reject(err);
        }
    });
}

export function debounceSavePage(page: any): void {
    clearTimeout(savePageDebounceTimer);
    savePageDebounceTimer = setTimeout(() => {
        pushStateToHistory();
        savePageToDB(page);
    }, 1000);
}

export function deletePageFromDB(pageId: string): Promise<void> {
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance!.transaction([STORE_PAGES], 'readwrite');
        const store = transaction.objectStore(STORE_PAGES);
        const request = store.delete(pageId);
        request.onsuccess = () => resolve();
        request.onerror = (e: any) => reject(e.target.error);
    });
}

export function saveProjectMeta(pageIds: string[], activePageIndex: number): Promise<void> {
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        try {
            const transaction = dbInstance!.transaction([STORE_META], 'readwrite');
            const store = transaction.objectStore(STORE_META);
            const request = store.put({
                pageIds: Array.isArray(pageIds) ? pageIds : [],
                activePageIndex: typeof activePageIndex === 'number' ? activePageIndex : 0,
                characterDossier: globalState.characterDossier || [],
                lorebook: globalState.lorebook || []
            }, 'project_meta');
            request.onsuccess = () => resolve();
            request.onerror = (e: any) => {
                console.error("Lỗi lưu metadata dự án:", e.target.error);
                reject(e.target.error);
            };
        } catch (err) {
            console.error("Lỗi ngoại lệ khi lưu metadata dự án:", err);
            reject(err);
        }
    });
}

export function saveMetaToDB(key: string, val: any): Promise<boolean> {
    if (!dbInstance) return Promise.resolve(false);
    return new Promise((resolve) => {
        try {
            const tx = dbInstance!.transaction([STORE_META], 'readwrite');
            const store = tx.objectStore(STORE_META);
            store.put(val, key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        } catch (e) {
            resolve(false);
        }
    });
}

export function loadMetaFromDB(key: string): Promise<any> {
    if (!dbInstance) return Promise.resolve(null);
    return new Promise((resolve) => {
        try {
            const tx = dbInstance!.transaction([STORE_META], 'readonly');
            const store = tx.objectStore(STORE_META);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        } catch (e) {
            resolve(null);
        }
    });
}

export function deleteMetaFromDB(key: string): Promise<boolean> {
    if (!dbInstance) return Promise.resolve(false);
    return new Promise((resolve) => {
        try {
            const tx = dbInstance!.transaction([STORE_META], 'readwrite');
            const store = tx.objectStore(STORE_META);
            store.delete(key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        } catch (e) {
            resolve(false);
        }
    });
}

export async function loadProjectFromDB(): Promise<{ pages: any[]; activePageIndex: number } | null> {
    if (!dbInstance) return null;

    let meta: any = null;
    try {
        meta = await new Promise((resolve) => {
            const tx = dbInstance!.transaction([STORE_META], 'readonly');
            const store = tx.objectStore(STORE_META);
            const req = store.get('project_meta');
            req.onsuccess = (e: any) => resolve(e.target.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (err) {
        console.error('loadProjectFromDB: Lỗi đọc metadata:', err);
    }

    if (meta) {
        if (meta.characterDossier) globalState.characterDossier = meta.characterDossier;
        if (meta.lorebook) globalState.lorebook = meta.lorebook;
    }

    let rawPages: any[] = [];
    try {
        rawPages = await new Promise((resolve) => {
            const tx = dbInstance!.transaction([STORE_PAGES], 'readonly');
            const store = tx.objectStore(STORE_PAGES);
            const req = store.getAll();
            req.onsuccess = (e: any) => resolve(e.target.result || []);
            req.onerror = () => resolve([]);
        });
    } catch (err) {
        console.error('loadProjectFromDB: Lỗi đọc rawPages:', err);
    }

    if (!rawPages || rawPages.length === 0) {
        return null;
    }

    const pagesMap = new Map(rawPages.map((p: any) => [p.id, p]));
    const pages: any[] = [];

    if (meta && Array.isArray(meta.pageIds) && meta.pageIds.length > 0) {
        for (const id of meta.pageIds) {
            const p = pagesMap.get(id);
            if (p) {
                pages.push(p);
                pagesMap.delete(id);
            }
        }
    }

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
            p.blocks.forEach((block: any) => {
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

export function clearProjectDB(): Promise<void> {
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance!.transaction([STORE_PAGES, STORE_META], 'readwrite');
        transaction.objectStore(STORE_PAGES).clear();
        transaction.objectStore(STORE_META).clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = (e: any) => reject(e.target.error);
    });
}

// --- CUSTOM FONTS DATABASE OPERATIONS ---
export function getAllFontsFromDB(): Promise<any[]> {
    if (!dbInstance) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
        const transaction = dbInstance!.transaction([STORE_FONTS], 'readonly');
        const store = transaction.objectStore(STORE_FONTS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (e: any) => reject(e.target.error);
    });
}

export function saveFontToDB(family: string, blob: Blob): Promise<void> {
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance!.transaction([STORE_FONTS], 'readwrite');
        const store = transaction.objectStore(STORE_FONTS);
        const request = store.put({ family, blob });
        request.onsuccess = () => resolve();
        request.onerror = (e: any) => reject(e.target.error);
    });
}

// --- INDEXEDDB EXTENSION FOR TOEIC WORDS ---
export function loadToeicWordsFromDB(): Promise<any[]> {
    if (!dbInstance) return Promise.resolve([]);
    return new Promise((resolve) => {
        const transaction = dbInstance!.transaction([STORE_META], 'readonly');
        const store = transaction.objectStore(STORE_META);
        const request = store.get('saved_toeic_words');
        request.onsuccess = (e: any) => {
            const data = e.target.result;
            resolve(data || []);
        };
        request.onerror = () => {
            resolve([]);
        };
    });
}

export function saveToeicWordsToDB(words: any[]): Promise<void> {
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance!.transaction([STORE_META], 'readwrite');
        const store = transaction.objectStore(STORE_META);
        const request = store.put(words, 'saved_toeic_words');
        request.onsuccess = () => resolve();
        request.onerror = (e: any) => reject(e.target.error);
    });
}

// --- PAGE RESOURCE MANAGEMENT UTILITIES ---
export async function createThumbnail(file: Blob, maxDim: number = 120): Promise<Blob | null> {
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
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
            }
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

export async function activatePage(page: any): Promise<void> {
    if (!page) return;

    if (!page.src) {
        page.src = getSafeMediaUrl(page.originalFile) || getSafeMediaUrl(page.file);

        if (!page.src && page.id) {
            try {
                const dbPage: any = await _loadPageBlobFromDB(page.id);
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

export function _loadPageBlobFromDB(pageId: string): Promise<any> {
    if (dbInstance) {
        return new Promise((resolve) => {
            try {
                const tx = dbInstance!.transaction([STORE_PAGES], 'readonly');
                const store = tx.objectStore(STORE_PAGES);
                const req = store.get(pageId);
                req.onsuccess = (e: any) => resolve(e.target.result || null);
                req.onerror = () => resolve(null);
            } catch {
                resolve(null);
            }
        });
    }
    return new Promise((resolve) => {
        try {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onsuccess = (e: any) => {
                const db = e.target.result;
                const tx = db.transaction([STORE_PAGES], 'readonly');
                const store = tx.objectStore(STORE_PAGES);
                const getReq = store.get(pageId);
                getReq.onsuccess = (ev: any) => resolve(ev.target.result || null);
                getReq.onerror = () => resolve(null);
            };
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

export async function getPageDataURL(page: any): Promise<string | null> {
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
            reader.onloadend = () => resolve(reader.result as string);
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
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(b);
            });
        } catch (err) {
            console.warn("getPageDataURL fetch blob error:", err);
        }
    }

    return null;
}

export function deactivatePage(page: any): void {
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
        page.blocks.forEach((b: any) => {
            b.maskCache = null;
        });
    }
}

export function garbageCollectPageCaches(previewCurrentPage: number | null = null): void {
    const activePage = globalState.pages[globalState.activePageIndex];
    const previewPage = previewCurrentPage !== null ? globalState.pages[previewCurrentPage] : null;

    globalState.pages.forEach((p: any) => {
        if (p !== activePage && p !== previewPage) {
            deactivatePage(p);
        }
    });
}

export async function generateAndSaveThumbnailForPage(page: any): Promise<void> {
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

const loadedCustomFontFamilies = new Set<string>();

export async function loadAndRegisterCustomFonts(): Promise<void> {
    try {
        const fonts = await getAllFontsFromDB();
        for (const fontEntry of fonts) {
            if (!fontEntry?.family || loadedCustomFontFamilies.has(fontEntry.family)) {
                continue;
            }

            try {
                const buffer = await fontEntry.blob.arrayBuffer();
                const fontFace = new FontFace(fontEntry.family, buffer);
                await fontFace.load();
                (document.fonts as any).add(fontFace);
                loadedCustomFontFamilies.add(fontEntry.family);
            } catch (fontErr) {
                console.warn(`Không thể tải phông chữ "${fontEntry.family}":`, fontErr);
            }
        }
        if (fonts.length > 0) {
            console.log(`Đã tải ${fonts.length} phông chữ tùy chỉnh từ IndexedDB.`);
        }
    } catch (err) {
        console.error("Lỗi tải phông chữ tùy chỉnh:", err);
    }
}

export async function deleteFontFromDB(family: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        if (!dbInstance) {
            reject(new Error("Cơ sở dữ liệu chưa sẵn sàng."));
            return;
        }
        const tx = dbInstance.transaction(STORE_FONTS, 'readwrite');
        const store = tx.objectStore(STORE_FONTS);
        const req = store.delete(family);
        req.onsuccess = () => resolve(true);
        req.onerror = (e: any) => reject(e.target.error);
    });
}
