/**
 * Manga Translator Studio - State Database & Media Persistence
 * Manages IndexedDB stores for Pages, Metadata, Custom Fonts, Translation Cache, and TOEIC Words.
 */
import { MangaPage, MangaBlock } from '../../types/index';
import { documentState, stateCallbacks, uiUpdatePageListUI } from './domain-document';
import { typographyState } from './domain-typography';
import { cleanPageForPersistence } from '../document-model/page-model';
import { showToast } from '../utils/dom';

export const DB_NAME = 'MangaTranslatorDB';
export const DB_VERSION = 3;
export const STORE_PAGES = 'pages';
export const STORE_META = 'meta';
export const STORE_FONTS = 'fonts';
export const STORE_TRANSLATION_CACHE = 'translation_cache';

let dbInstance: IDBDatabase | null = null;
let savePageDebounceTimer: any = null;

const blobUrlCache = new WeakMap<Blob, string>();

export function getSafeMediaUrl(item: any): string | null {
    if (!item) return null;
    if (typeof item === 'string') return item;
    if (item instanceof Blob) {
        if (blobUrlCache.has(item)) {
            return blobUrlCache.get(item)!;
        }
        try {
            const url = URL.createObjectURL(item);
            blobUrlCache.set(item, url);
            return url;
        } catch (e) {
            console.error("getSafeMediaUrl failed:", e);
            return null;
        }
    }
    return null;
}

export function revokeSafeMediaUrl(item: any): void {
    if (item instanceof Blob && blobUrlCache.has(item)) {
        const url = blobUrlCache.get(item)!;
        try {
            URL.revokeObjectURL(url);
        } catch (e) { }
        blobUrlCache.delete(item);
    }
}

export function initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            resolve({} as any);
            return;
        }
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
            if (!database.objectStoreNames.contains(STORE_TRANSLATION_CACHE)) {
                database.createObjectStore(STORE_TRANSLATION_CACHE, { keyPath: 'hash' });
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

export function savePageToDB(page: MangaPage | null | undefined): Promise<void> {
    if (!dbInstance || !page || !page.id) return Promise.resolve();
    return new Promise((resolve, reject) => {
        try {
            const transaction = dbInstance!.transaction([STORE_PAGES], 'readwrite');
            const store = transaction.objectStore(STORE_PAGES);
            const pageToSave = cleanPageForPersistence(page);

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
                characterDossier: documentState.characterDossier || [],
                lorebook: documentState.lorebook || []
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

export async function loadProjectFromDB(): Promise<{ pages: MangaPage[]; activePageIndex: number } | null> {
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
        if (meta.characterDossier) documentState.characterDossier = meta.characterDossier;
        if (meta.lorebook) documentState.lorebook = meta.lorebook;
    }

    let rawPages: MangaPage[] = [];
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

    const pagesMap = new Map(rawPages.map((p: MangaPage) => [p.id, p]));
    const pages: MangaPage[] = [];

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
            p.blocks.forEach((block: MangaBlock) => {
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
let cachedCustomFontNames: string[] | null = null;

export function invalidateCustomFontCache(): void {
    cachedCustomFontNames = null;
}

export function getAllFontFamiliesFromDB(): Promise<string[]> {
    if (cachedCustomFontNames) return Promise.resolve(cachedCustomFontNames);
    if (!dbInstance) return Promise.resolve([]);
    return new Promise((resolve) => {
        try {
            const transaction = dbInstance!.transaction([STORE_FONTS], 'readonly');
            const store = transaction.objectStore(STORE_FONTS);
            const request = store.getAllKeys();
            request.onsuccess = () => {
                const keys = (request.result || []).map(k => String(k));
                cachedCustomFontNames = keys;
                resolve(keys);
            };
            request.onerror = () => resolve([]);
        } catch (e) {
            resolve([]);
        }
    });
}

export function getFontBlobFromDB(family: string): Promise<Blob | null> {
    if (!dbInstance || !family) return Promise.resolve(null);
    const cleanFamily = String(family).replace(/^['"]|['"]$/g, '').trim();
    return new Promise((resolve) => {
        try {
            const transaction = dbInstance!.transaction([STORE_FONTS], 'readonly');
            const store = transaction.objectStore(STORE_FONTS);
            const request = store.get(cleanFamily);
            request.onsuccess = () => {
                const result = request.result;
                if (result?.blob) {
                    resolve(result.blob);
                    return;
                }
                const allKeysReq = store.getAllKeys();
                allKeysReq.onsuccess = () => {
                    const normTarget = cleanFamily.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
                    const matchedKey = (allKeysReq.result || []).find(k => {
                        const strK = String(k);
                        return strK.toLowerCase().replace(/[\s_-]+/g, ' ').trim() === normTarget;
                    });
                    if (matchedKey) {
                        const fallbackReq = store.get(matchedKey);
                        fallbackReq.onsuccess = () => resolve(fallbackReq.result?.blob || null);
                        fallbackReq.onerror = () => resolve(null);
                    } else {
                        resolve(null);
                    }
                };
                allKeysReq.onerror = () => resolve(null);
            };
            request.onerror = () => resolve(null);
        } catch (e) {
            resolve(null);
        }
    });
}

export function getAllFontsFromDB(): Promise<any[]> {
    if (!dbInstance) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
        try {
            const transaction = dbInstance!.transaction([STORE_FONTS], 'readonly');
            const store = transaction.objectStore(STORE_FONTS);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e: any) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}

export function saveFontToDB(family: string, blob: Blob): Promise<void> {
    invalidateCustomFontCache();
    if (!dbInstance) return Promise.resolve();
    return new Promise((resolve, reject) => {
        try {
            const transaction = dbInstance!.transaction([STORE_FONTS], 'readwrite');
            const store = transaction.objectStore(STORE_FONTS);
            const request = store.put({ family, blob });
            request.onsuccess = () => {
                invalidateCustomFontCache();
                resolve();
            };
            request.onerror = (e: any) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}

export function saveFontsBatchToDB(fontList: Array<{ family: string; blob: Blob }>): Promise<void> {
    invalidateCustomFontCache();
    if (!dbInstance || !fontList || fontList.length === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
        try {
            const transaction = dbInstance!.transaction([STORE_FONTS], 'readwrite');
            const store = transaction.objectStore(STORE_FONTS);
            let settled = false;
            let pendingCount = fontList.length;

            const finish = () => {
                if (!settled) {
                    settled = true;
                    invalidateCustomFontCache();
                    resolve();
                }
            };

            transaction.oncomplete = finish;
            transaction.onerror = (e: any) => {
                if (!settled) {
                    settled = true;
                    reject(e.target?.error || e);
                }
            };

            fontList.forEach(item => {
                const req = store.put({ family: item.family, blob: item.blob });
                if (req) {
                    req.onsuccess = () => {
                        pendingCount--;
                        if (pendingCount <= 0) {
                            finish();
                        }
                    };
                    req.onerror = (e: any) => {
                        if (!settled) {
                            settled = true;
                            reject(e.target?.error || e);
                        }
                    };
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

export function deleteFontFromDB(family: string): Promise<boolean> {
    invalidateCustomFontCache();
    return new Promise((resolve, reject) => {
        if (!dbInstance) {
            reject(new Error("Cơ sở dữ liệu chưa sẵn sàng."));
            return;
        }
        try {
            const tx = dbInstance.transaction([STORE_FONTS], 'readwrite');
            const store = tx.objectStore(STORE_FONTS);
            const req = store.delete(family);
            req.onsuccess = () => {
                loadedCustomFontFamilies.delete(family);
                invalidateCustomFontCache();
                resolve(true);
            };
            req.onerror = (e: any) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
    });
}

export function clearAllFontsFromDB(): Promise<boolean> {
    invalidateCustomFontCache();
    return new Promise((resolve, reject) => {
        if (!dbInstance) {
            reject(new Error("Cơ sở dữ liệu chưa sẵn sàng."));
            return;
        }
        try {
            const tx = dbInstance.transaction([STORE_FONTS], 'readwrite');
            const store = tx.objectStore(STORE_FONTS);
            const req = store.clear();
            req.onsuccess = () => {
                loadedCustomFontFamilies.clear();
                customFontsLoadedOnce = true;
                invalidateCustomFontCache();
                resolve(true);
            };
            req.onerror = (e: any) => reject(e.target.error);
        } catch (e) {
            reject(e);
        }
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
        if (typeof Image === 'undefined' || typeof document === 'undefined') {
            resolve(null);
            return;
        }
        const img = new Image();
        let tempUrl: string | null = null;
        try {
            tempUrl = URL.createObjectURL(file);
        } catch (e) {
            resolve(null);
            return;
        }
        img.onload = () => {
            if (tempUrl) URL.revokeObjectURL(tempUrl);
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
                canvas.width = 0;
                canvas.height = 0;
                resolve(blob);
            }, 'image/jpeg', 0.7);
        };
        img.onerror = () => {
            if (tempUrl) URL.revokeObjectURL(tempUrl);
            resolve(null);
        };
        img.src = tempUrl;
    });
}

export function getPageCanonicalFile(page: MangaPage | null | undefined): Blob | File | null {
    if (!page) return null;
    return page.originalFile || page.file || null;
}

export async function activatePage(page: MangaPage | null | undefined): Promise<void> {
    if (!page) return;

    if (!page.src) {
        const canonicalFile = getPageCanonicalFile(page);
        page.src = getSafeMediaUrl(canonicalFile);

        if (!page.src && page.id) {
            try {
                const dbPage: any = await _loadPageBlobFromDB(page.id);
                if (dbPage) {
                    if (dbPage.originalFile) page.originalFile = dbPage.originalFile;
                    if (dbPage.file) page.file = dbPage.file;
                    page.src = getSafeMediaUrl(getPageCanonicalFile(page));
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
        if (typeof indexedDB === 'undefined') {
            resolve(null);
            return;
        }
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

export async function getPageDataURL(page: MangaPage | null | undefined): Promise<string | null> {
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
        if (typeof FileReader !== 'undefined') {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }
        if (typeof Buffer !== 'undefined') {
            const buffer = Buffer.from(await blob.arrayBuffer());
            return `data:${blob.type || 'image/png'};base64,${buffer.toString('base64')}`;
        }
    }

    if (page.src && page.src.startsWith('data:')) {
        return page.src;
    }

    if (page.src && page.src.startsWith('blob:')) {
        try {
            const resp = await fetch(page.src);
            const b = await resp.blob();
            if (typeof FileReader !== 'undefined') {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(b);
                });
            }
            if (typeof Buffer !== 'undefined') {
                const buffer = Buffer.from(await b.arrayBuffer());
                return `data:${b.type || 'image/png'};base64,${buffer.toString('base64')}`;
            }
        } catch (err) {
            console.warn("getPageDataURL fetch blob error:", err);
        }
    }

    return null;
}

export function deactivatePage(page: MangaPage | null | undefined): void {
    if (!page) return;
    if (page.originalFile) revokeSafeMediaUrl(page.originalFile);
    if (page.file) revokeSafeMediaUrl(page.file);
    if (page.src && page.src.startsWith('blob:')) {
        URL.revokeObjectURL(page.src);
    }
    if (page.apiSrc && page.apiSrc.startsWith('blob:')) {
        URL.revokeObjectURL(page.apiSrc);
    }
    page.src = null;
    page.apiSrc = null;
    page.imageDataCache = null;
    if (page.blocks) {
        page.blocks.forEach((b: MangaBlock) => {
            b.maskCache = null;
            b.autoFitCache = null;
        });
    }
}

export function garbageCollectPageCaches(previewCurrentPage: number | null = null): void {
    const activePage = documentState.pages[documentState.activePageIndex];
    const previewPage = previewCurrentPage !== null ? documentState.pages[previewCurrentPage] : null;

    documentState.pages.forEach((p: MangaPage) => {
        if (p !== activePage && p !== previewPage) {
            deactivatePage(p);
        }
    });
}

export async function generateAndSaveThumbnailForPage(page: MangaPage): Promise<void> {
    if (page.thumbnailBlob) return;
    try {
        const fileToUse = page.file || page.originalFile;
        if (!fileToUse) return;
        const thumbBlob = await createThumbnail(fileToUse, 120);
        if (thumbBlob) {
            page.thumbnailBlob = thumbBlob;
            if (page.thumbnailSrc && page.thumbnailSrc.startsWith('blob:')) {
                revokeSafeMediaUrl(page.thumbnailBlob);
                URL.revokeObjectURL(page.thumbnailSrc);
            }
            page.thumbnailSrc = getSafeMediaUrl(thumbBlob);
            await savePageToDB(page);
            if (stateCallbacks.onPageListChange) stateCallbacks.onPageListChange(page);
        }
    } catch (err) {
        console.error("Lỗi tạo ảnh nhỏ (thumbnail) cho trang:", page.id, err);
    }
}

// --- FONT LOADER & CSS INJECTION ---
export const loadedCustomFontFamilies = new Set<string>();
let customFontsLoadingPromise: Promise<void> | null = null;
let customFontsLoadedOnce = false;
const customFontBlobUrls = new Map<string, string>();
let customFontsStyleTag: HTMLStyleElement | null = null;

function injectFontFaceCSS(family: string, blob: Blob): void {
    if (typeof document === 'undefined' || !document.head) return;
    try {
        if (!customFontsStyleTag) {
            customFontsStyleTag = document.getElementById('dynamic-custom-fonts-style') as HTMLStyleElement;
            if (!customFontsStyleTag) {
                customFontsStyleTag = document.createElement('style');
                customFontsStyleTag.id = 'dynamic-custom-fonts-style';
                document.head.appendChild(customFontsStyleTag);
            }
        }
        let blobUrl = customFontBlobUrls.get(family);
        if (!blobUrl && typeof URL !== 'undefined' && URL.createObjectURL) {
            try {
                blobUrl = URL.createObjectURL(blob);
                customFontBlobUrls.set(family, blobUrl);
            } catch {}
        }
        if (blobUrl) {
            const rule = `@font-face { font-family: '${family}'; src: url('${blobUrl}'); font-display: swap; }\n`;
            if (!customFontsStyleTag.textContent?.includes(`'${family}'`)) {
                customFontsStyleTag.appendChild(document.createTextNode(rule));
            }
        }
    } catch (e) {
        console.warn('Lỗi inject font CSS:', e);
    }
}

export const failedCustomFontFamilies: Set<string> = new Set<string>();

export async function ensureCustomFontLoaded(family: string, notifyUser = false): Promise<boolean> {
    if (!family) return false;
    const cleanFamily = String(family).replace(/^['"]|['"]$/g, '').trim();
    if (!cleanFamily) return false;
    if (loadedCustomFontFamilies.has(cleanFamily)) return true;
    if (failedCustomFontFamilies.has(cleanFamily)) return false;

    try {
        const blob = await getFontBlobFromDB(cleanFamily);
        if (!blob) {
            failedCustomFontFamilies.add(cleanFamily);
            if (notifyUser) {
                showToast(`Phông chữ "${cleanFamily}" không tìm thấy trong bộ nhớ → đang dùng phông chữ dự phòng.`, "warn");
            }
            return false;
        }

        injectFontFaceCSS(cleanFamily, blob);

        if (typeof FontFace !== 'undefined') {
            let loadedFace: FontFace | null = null;
            const buffer = typeof (blob as any).arrayBuffer === 'function'
                ? await (blob as any).arrayBuffer()
                : new ArrayBuffer(8);

            try {
                const fontFace = new FontFace(cleanFamily, buffer);
                loadedFace = await fontFace.load();
            } catch (bufErr) {
                if (typeof URL !== 'undefined' && URL.createObjectURL) {
                    try {
                        const blobUrl = customFontBlobUrls.get(cleanFamily) || URL.createObjectURL(blob);
                        customFontBlobUrls.set(cleanFamily, blobUrl);
                        const fontFace = new FontFace(cleanFamily, `url("${blobUrl}")`);
                        loadedFace = await fontFace.load();
                    } catch (urlErr) {
                        console.warn(`Lỗi nạp font qua blob URL "${cleanFamily}":`, urlErr);
                    }
                }
            }

            if (loadedFace && typeof document !== 'undefined' && document.fonts) {
                (document.fonts as any).add(loadedFace);
            }
        }

        loadedCustomFontFamilies.add(cleanFamily);
        return true;
    } catch (e: any) {
        failedCustomFontFamilies.add(cleanFamily);
        console.warn(`Không thể nạp phông chữ "${cleanFamily}":`, e);
        if (notifyUser) {
            showToast(`Phông chữ "${cleanFamily}" không thể nạp (${e?.message || 'Lỗi font'}) → đang dùng phông chữ dự phòng.`, "warn");
        }
        return false;
    }
}

export async function loadAndRegisterCustomFonts(forceReload = false): Promise<void> {
    if (customFontsLoadedOnce && !forceReload) {
        return;
    }
    if (customFontsLoadingPromise) {
        return customFontsLoadingPromise;
    }

    customFontsLoadingPromise = (async () => {
        try {
            const families = await getAllFontFamiliesFromDB();
            if (!families || families.length === 0) {
                customFontsLoadedOnce = true;
                return;
            }

            const neededFonts = new Set<string>();
            if (typographyState.defaultFont) neededFonts.add(typographyState.defaultFont);
            if (typographyState.defaultDialogueFont) neededFonts.add(typographyState.defaultDialogueFont);
            if (typographyState.defaultNarrationFont) neededFonts.add(typographyState.defaultNarrationFont);
            if (typographyState.defaultThoughtFont) neededFonts.add(typographyState.defaultThoughtFont);
            if (typographyState.defaultSfxFont) neededFonts.add(typographyState.defaultSfxFont);

            if (documentState.pages && Array.isArray(documentState.pages)) {
                documentState.pages.forEach(p => {
                    if (p && p.blocks) {
                        p.blocks.forEach((b: any) => {
                            if (b.style?.fontFamily) neededFonts.add(b.style.fontFamily);
                            if (b.style?.font) neededFonts.add(b.style.font);
                        });
                    }
                });
            }

            for (const font of neededFonts) {
                if (families.includes(font)) {
                    await ensureCustomFontLoaded(font, true);
                }
            }

            const remainingFonts = families.filter(f => !neededFonts.has(f) && !loadedCustomFontFamilies.has(f));
            if (remainingFonts.length > 0) {
                const loadNextBatch = (startIndex: number) => {
                    const batchSize = 10;
                    const batch = remainingFonts.slice(startIndex, startIndex + batchSize);
                    if (batch.length === 0) return;

                    Promise.all(batch.map(f => ensureCustomFontLoaded(f, false))).catch((batchErr) => {
                        console.warn("Lỗi nạp batch font tùy chỉnh:", batchErr);
                    });

                    if (startIndex + batchSize < remainingFonts.length) {
                        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
                            (window as any).requestIdleCallback(() => loadNextBatch(startIndex + batchSize), { timeout: 1000 });
                        } else {
                            setTimeout(() => loadNextBatch(startIndex + batchSize), 60);
                        }
                    }
                };

                if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
                    (window as any).requestIdleCallback(() => loadNextBatch(0), { timeout: 1000 });
                } else {
                    setTimeout(() => loadNextBatch(0), 100);
                }
            }

            customFontsLoadedOnce = true;
        } catch (err: any) {
            console.error("Lỗi tải phông chữ tùy chỉnh:", err);
            showToast(`Lỗi khi tải kho phông chữ: ${err.message}`, "error");
        } finally {
            customFontsLoadingPromise = null;
        }
    })();

    return customFontsLoadingPromise;
}
