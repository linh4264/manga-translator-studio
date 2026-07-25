// State & Database Management for Manga Translator Studio
export const DEFAULT_MODEL = "gemini-3.1-flash-lite";
export const CUSTOM_MODEL_VALUE = "__custom__";
export const VALID_MODEL_IDS = [
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro"
];

export function isWeakTranslationModel(modelId) {
    return String(modelId || '').includes('flash-lite');
}

export function isFlash31LiteModel(modelId) {
    return String(modelId || '') === 'gemini-3.1-flash-lite';
}

export const DEFAULT_VERTICAL_WRITING_MODE = false;
export const DEFAULT_AI_BLOCK_BOX = {
    x: 37.5,
    y: 37.5,
    w: 25,
    h: 25
};

export const MAX_HISTORY_LIMIT = 30;
export const apiKey = "";

export const TRANSLATION_GENRE_PRESETS = {
    custom: '',
    quality: '- GENRE PRESET: Best-quality scanlation. Keep meaning, tone, subtext, and character voice. Prefer natural Vietnamese over literal wording. Preserve honorifics and xưng hô when important.',
    comedy: '- GENRE PRESET: Comedy manga. Keep timing sharp, wording natural, and punchlines intact. Preserve exaggeration and rhythm.',
    school: '- GENRE PRESET: School-life manga. Use casual, youthful Vietnamese. Keep conversations believable, light, and natural.',
    shounen: '- GENRE PRESET: Shounen/action manga. Use short, punchy, energetic Vietnamese. Keep momentum, hype, and battle intensity.',
    fantasy: '- GENRE PRESET: Fantasy/isekai manga. Keep terms consistent, worldbuilding clear, and dialogue readable. Do not over-literalize titles or skill names.',
    drama: '- GENRE PRESET: Drama manga. Keep emotions subtle, restrained, and natural. Preserve tension and character nuance.',
    horror: '- GENRE PRESET: Horror/thriller manga. Keep the wording tense, cold, and unsettling. Do not soften fear or suspense.',
    polite: '- GENRE PRESET: Polite/formal dialogue. Use respectful Vietnamese, balanced xưng hô, and avoid slang unless the original is casual.',
    dark: '- GENRE PRESET: Dark/psychological manga. Keep the tone heavy, serious, mature, and grim. Preserve dark humor and intense character psychology without softening.',
    romance: '- GENRE PRESET: Romance manga. Use warm, delicate Vietnamese. Keep emotional beats soft and natural.',
    slice: '- GENRE PRESET: Slice-of-life manga. Use everyday Vietnamese, relaxed pacing, and simple, believable wording.',
    martial: '- GENRE PRESET: Martial arts/Wuxia/Xianxia. Use traditional martial arts vocabulary and Sino-Vietnamese (Hán-Việt) terms for techniques, sect rankings, and polite forms.',
    scifi: '- GENRE PRESET: Sci-fi/Mecha/Cyberpunk manga. Keep futuristic concepts, technical jargon, and mechanical names consistent and professional.',
    gag: '- GENRE PRESET: Gag comedy manga. Feel free to use localized Vietnamese internet slang, memes, and humorous adaptations to maximize comedic timing.',
    historical: '- GENRE PRESET: Historical/Period manga. Use formal, archaic Sino-Vietnamese (Hán-Việt) honorifics, courtly address forms, and expressions suitable for historical settings.'
};

export let undoStack = [];
export let redoStack = [];

// Callbacks to decouple UI updates from state logic
let onUndoRedoChange = null;
let onPageListChange = null;

// UI Bridge: allows ai.js / canvas.js to call UI functions without circular imports
const _uiBridge = {
    updatePageListUI: null,
    updateProcessingOverlay: null,
    updateBackgroundTaskOverlay: null,
    updateActiveBlockEditor: null,
    updateSplitView: null,
    setRightTab: null,
};

export function registerUIBridge(fns) {
    if (fns.updatePageListUI) _uiBridge.updatePageListUI = fns.updatePageListUI;
    if (fns.updateProcessingOverlay) _uiBridge.updateProcessingOverlay = fns.updateProcessingOverlay;
    if (fns.updateBackgroundTaskOverlay) _uiBridge.updateBackgroundTaskOverlay = fns.updateBackgroundTaskOverlay;
    if (fns.updateActiveBlockEditor) _uiBridge.updateActiveBlockEditor = fns.updateActiveBlockEditor;
    if (fns.updateSplitView) _uiBridge.updateSplitView = fns.updateSplitView;
    if (fns.setRightTab) _uiBridge.setRightTab = fns.setRightTab;
}

export function uiUpdatePageListUI() { _uiBridge.updatePageListUI?.(); }
export function uiUpdateProcessingOverlay(...args) { _uiBridge.updateProcessingOverlay?.(...args); }
export function uiUpdateBackgroundTaskOverlay(...args) { _uiBridge.updateBackgroundTaskOverlay?.(...args); }
export function uiUpdateActiveBlockEditor() { _uiBridge.updateActiveBlockEditor?.(); }
export function uiUpdateSplitView() { _uiBridge.updateSplitView?.(); }
export function uiSetRightTab(tab) { _uiBridge.setRightTab?.(tab); }


export function registerStateCallbacks(callbacks) {
    if (callbacks.onUndoRedoChange) onUndoRedoChange = callbacks.onUndoRedoChange;
    if (callbacks.onPageListChange) onPageListChange = callbacks.onPageListChange;
}

export const globalState = {
    apiKey: '',
    aiProvider: 'gemini', // 'gemini' | 'claude' | 'openai' | 'custom'
    apiEndpoint: 'http://localhost:11434/v1', // Base URL for custom/local LLM
    chapterStoryMemory: [], // Multi-page dialogue and character tone memory
    enableStoryMemory: true, // Toggle story context accumulation
    selectedModel: DEFAULT_MODEL,
    pages: [],
    activePageIndex: -1,
    selectedBlockId: null,
    viewMode: 'overlay', // 'overlay' | 'split' | 'original'
    zoom: 100,
    activeTab: 'edit', // 'edit' | 'style'
    toeicSavedWords: [],
    activeBlockToeicAnalysis: null,
    toeicMode: 'learn', // 'learn' | 'recall'
    activeToeicQuestionIndex: 0,
    toolbarCollapsedMobile: false,
    autoFitEnabled: true, // Auto-scale font size to perfectly fit bubbles (Default enabled)
    preserveNames: true, // Không dịch tên riêng / nhân vật
    glossaryNames: '',   // Danh sách tên riêng cụ thể giữ nguyên
    sourceLanguage: 'auto', // Ngôn ngữ nguồn ('ja' | 'zh' | 'ko' | 'en' | 'auto')
    pronounMatrix: '',   // Ma trận xưng hô 2 chiều giữa các nhân vật
    ocrEnhanceEnabled: true, // Tiền xử lý tương phản ảnh trước khi gửi OCR
    translationGenrePresets: ['quality'], // Mẫu prompt theo thể loại
    translationContextPrompt: '', // Prompt ngữ cảnh bổ sung cho dịch thuật
    apiDelay: 2,       // Giãn cách gửi yêu cầu API (giây) tránh lỗi 429
    maxRetries: 3,     // Số lần thử lại tối đa khi gặp lỗi API tạm thời
    // Global style presets for new/default blocks
    globalStyle: {
        fontFamily: 'font-comic',
        fontSize: 13,
        textColor: '#000000',
        bgColor: '#ffffff',
        bgOpacity: 100,
        padding: 4,
        rotate: 0,
        vertical: DEFAULT_VERTICAL_WRITING_MODE,
        bold: false,
        align: 'center',
        maskShape: 'bubble-fit', // Default to bubble-fit for perfect speech bubble fitting
        maskSize: 'full',      // Default to full width to perfectly erase old text
        strokeColor: '#ffffff',
        strokeWidth: 0,
        shadowColor: '#000000',
        shadowBlur: 0
    }
};

// --- UNDO / REDO CONTROLLERS ---
export function pushStateToHistory() {
    const currentState = globalState.pages.map(page => ({
        id: page.id,
        status: page.status,
        blocks: page.blocks.map(block => ({
            id: block.id,
            type: block.type,
            original: block.original,
            translated: block.translated,
            box: { ...block.box },
            style: { ...block.style }
        }))
    }));

    undoStack.push({
        pagesState: currentState,
        activePageIndex: globalState.activePageIndex,
        selectedBlockId: globalState.selectedBlockId
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
            targetPage.blocks = savedPage.blocks.map(b => ({
                id: b.id,
                type: b.type,
                original: b.original,
                translated: b.translated,
                box: { ...b.box },
                style: { ...b.style },
                textWidth: b.textWidth,
                textHeight: b.textHeight
            }));
            savePageToDB(targetPage);
        }
    });

    globalState.activePageIndex = snapshot.activePageIndex;
    globalState.selectedBlockId = snapshot.selectedBlockId;

    if (onUndoRedoChange) onUndoRedoChange();

    import('../ui/ui.js').then(ui => {
        ui.updatePageListUI();
        if (globalState.activePageIndex !== -1) {
            ui.selectPage(globalState.activePageIndex);
        } else {
            const container = document.getElementById('manga-canvas-container');
            const split = document.getElementById('workspace-split-wrapper');
            const empty = document.getElementById('workspace-empty-state');
            if (container) container.classList.add('hidden');
            if (split) split.classList.add('hidden');
            if (empty) empty.classList.remove('hidden');
        }
        ui.updateActiveBlockEditor();
    });
    import('../features/canvas.js').then(canvas => {
        canvas.requestOverlayRender();
    });
}

export function executeUndo() {
    if (undoStack.length === 0) return;
    const currentState = globalState.pages.map(page => ({
        id: page.id,
        status: page.status,
        blocks: page.blocks.map(block => ({
            id: block.id,
            type: block.type,
            original: block.original,
            translated: block.translated,
            box: { ...block.box },
            style: { ...block.style }
        }))
    }));

    redoStack.push({
        pagesState: currentState,
        activePageIndex: globalState.activePageIndex,
        selectedBlockId: globalState.selectedBlockId
    });

    const previous = undoStack.pop();
    applyStateFromSnapshot(previous);
}

export function executeRedo() {
    if (redoStack.length === 0) return;
    const currentState = globalState.pages.map(page => ({
        id: page.id,
        status: page.status,
        blocks: page.blocks.map(block => ({
            id: block.id,
            type: block.type,
            original: block.original,
            translated: block.translated,
            box: { ...block.box },
            style: { ...block.style }
        }))
    }));

    undoStack.push({
        pagesState: currentState,
        activePageIndex: globalState.activePageIndex,
        selectedBlockId: globalState.selectedBlockId
    });

    const next = redoStack.pop();
    applyStateFromSnapshot(next);
}

window.executeUndo = executeUndo;
window.executeRedo = executeRedo;


// --- INDEXEDDB PERSISTENCE MANAGER FOR AUTO-SAVE & RESTORE ---
const DB_NAME = 'MangaTranslatorDB';
const DB_VERSION = 2; // Nâng cấp lên v2 để hỗ trợ lưu phông chữ cá nhân
const STORE_PAGES = 'pages';
const STORE_META = 'meta';
const STORE_FONTS = 'fonts'; // Bảng lưu phông chữ nhị phân
let dbInstance = null;
let savePageDebounceTimer = null;

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
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_PAGES], 'readwrite');
        const store = transaction.objectStore(STORE_PAGES);

        // Dọn dẹp các khối blocks để loại bỏ các thuộc tính DOM không thể clone (như HTMLCanvasElement trong maskCache)
        const cleanBlocks = (page.blocks || []).map(block => {
            const cleanBlock = {
                id: block.id,
                type: block.type,
                original: block.original,
                translated: block.translated,
                box: { ...block.box },
                style: { ...block.style }
            };
            if (block.textWidth !== undefined) cleanBlock.textWidth = block.textWidth;
            if (block.textHeight !== undefined) cleanBlock.textHeight = block.textHeight;
            cleanBlock.maskCache = null;
            cleanBlock.autoFitCache = null;
            return cleanBlock;
        });

        // Clone dữ liệu trang nhưng bỏ qua các blob URL tạm thời sẽ bị hỏng khi reload
        const pageToSave = {
            id: page.id,
            name: page.name,
            width: page.width,
            height: page.height,
            apiWidth: page.apiWidth,
            apiHeight: page.apiHeight,
            status: page.status,
            blocks: cleanBlocks,
            file: page.file,
            originalFile: page.originalFile,
            eraserLayerBlob: page.eraserLayerBlob,
            thumbnailBlob: page.thumbnailBlob
        };

        const request = store.put(pageToSave);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
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
        const transaction = dbInstance.transaction([STORE_META], 'readwrite');
        const store = transaction.objectStore(STORE_META);
        const request = store.put({ pageIds, activePageIndex }, 'project_meta');
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

export function loadProjectFromDB() {
    if (!dbInstance) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_PAGES, STORE_META], 'readonly');
        const metaStore = transaction.objectStore(STORE_META);
        const pagesStore = transaction.objectStore(STORE_PAGES);

        let metaRequest = metaStore.get('project_meta');
        metaRequest.onsuccess = (e) => {
            const meta = e.target.result;
            if (!meta || !meta.pageIds || meta.pageIds.length === 0) {
                resolve(null);
                return;
            }

            let pagesRequest = pagesStore.getAll();
            pagesRequest.onsuccess = (ev) => {
                const rawPages = ev.target.result;
                const pagesMap = new Map(rawPages.map(p => [p.id, p]));

                const pages = [];
                meta.pageIds.forEach(id => {
                    const p = pagesMap.get(id);
                    if (p) {
                        // Thiết lập null ban đầu để tiết kiệm RAM, sẽ kích hoạt động khi hiển thị
                        p.src = null;
                        p.apiSrc = null;

                        // Tạo thumbnailSrc từ thumbnailBlob đã lưu trữ
                        if (p.thumbnailBlob) {
                            p.thumbnailSrc = URL.createObjectURL(p.thumbnailBlob);
                        } else {
                            // Tương thích ngược: sử dụng tạm ảnh file và chạy nền tạo thumbnail cho lần sau
                            p.thumbnailSrc = URL.createObjectURL(p.file || p.originalFile);
                            setTimeout(() => generateAndSaveThumbnailForPage(p), 100);
                        }

                        if (p.blocks) {
                            p.blocks.forEach(block => {
                                delete block.maskCache;
                            });
                        }
                        pages.push(p);
                    }
                });

                resolve({
                    pages,
                    activePageIndex: meta.activePageIndex
                });
            };
            pagesRequest.onerror = (ev) => reject(ev.target.error);
        };
        metaRequest.onerror = (e) => reject(e.target.error);
    });
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
        const url = URL.createObjectURL(file);
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

export function activatePage(page) {
    if (!page) return;
    if (!page.src && page.originalFile) {
        page.src = URL.createObjectURL(page.originalFile);
    }
    if (!page.apiSrc && page.file) {
        page.apiSrc = URL.createObjectURL(page.file);
    }
}

export function deactivatePage(page) {
    if (!page) return;
    if (page.src) {
        URL.revokeObjectURL(page.src);
        page.src = null;
    }
    if (page.apiSrc) {
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
export async function loadAndRegisterCustomFonts() {
    try {
        const fonts = await getAllFontsFromDB();
        for (const fontEntry of fonts) {
            try {
                const fontUrl = URL.createObjectURL(fontEntry.blob);
                const fontFace = new FontFace(fontEntry.family, `url(${fontUrl})`);
                await fontFace.load();
                document.fonts.add(fontFace);
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
