/**
 * Manga Translator Studio - Document Model: MangaPage
 * Provides schema validation, factories, normalizers, and cloning helpers for MangaPage.
 */
import { MangaPage, MangaBlock } from '../../types/index';
import { normalizeBlock, cloneBlock, cleanBlockForPersistence } from './block-model';

export function generatePageId(prefix: string = 'page'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function createDefaultPage(partial?: Partial<MangaPage>): MangaPage {
    const id = partial?.id || generatePageId();
    const name = partial?.name || 'Page 1';
    const width = typeof partial?.width === 'number' && partial.width > 0 ? partial.width : 800;
    const height = typeof partial?.height === 'number' && partial.height > 0 ? partial.height : 1200;
    const apiWidth = typeof partial?.apiWidth === 'number' && partial.apiWidth > 0 ? partial.apiWidth : width;
    const apiHeight = typeof partial?.apiHeight === 'number' && partial.apiHeight > 0 ? partial.apiHeight : height;
    const status = partial?.status || 'draft';
    const blocks = Array.isArray(partial?.blocks)
        ? partial!.blocks.map((b, idx) => normalizeBlock(b, `${id}_b${idx + 1}`))
        : [];

    return {
        id,
        name,
        width,
        height,
        apiWidth,
        apiHeight,
        status,
        blocks,
        file: partial?.file || null,
        originalFile: partial?.originalFile || null,
        eraserLayerBlob: partial?.eraserLayerBlob || null,
        thumbnailBlob: partial?.thumbnailBlob || null,
        thumbnailSrc: partial?.thumbnailSrc || null,
        src: partial?.src || null,
        apiSrc: partial?.apiSrc || null,
        imageDataCache: null,
        lastDisplayWidth: partial?.lastDisplayWidth,
        autoFitRevision: partial?.autoFitRevision || 0
    };
}

export function normalizePage(raw: any, fallbackIndex?: number): MangaPage {
    if (!raw || typeof raw !== 'object') {
        return createDefaultPage({ name: fallbackIndex !== undefined ? `Page ${fallbackIndex + 1}` : 'Page' });
    }

    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : generatePageId();
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : (fallbackIndex !== undefined ? `Page ${fallbackIndex + 1}` : 'Page');
    const width = typeof raw.width === 'number' && !isNaN(raw.width) && raw.width > 0 ? raw.width : 800;
    const height = typeof raw.height === 'number' && !isNaN(raw.height) && raw.height > 0 ? raw.height : 1200;
    const apiWidth = typeof raw.apiWidth === 'number' && !isNaN(raw.apiWidth) && raw.apiWidth > 0 ? raw.apiWidth : width;
    const apiHeight = typeof raw.apiHeight === 'number' && !isNaN(raw.apiHeight) && raw.apiHeight > 0 ? raw.apiHeight : height;
    const validStatuses = ['draft', 'queued', 'processing', 'done', 'error'];
    const status = validStatuses.includes(raw.status) ? raw.status : 'draft';

    const blocks: MangaBlock[] = Array.isArray(raw.blocks)
        ? raw.blocks.map((b: any, idx: number) => normalizeBlock(b, `${id}_b${idx + 1}`))
        : [];

    return {
        id,
        name,
        width,
        height,
        apiWidth,
        apiHeight,
        status: status as any,
        blocks,
        file: (raw.file instanceof Blob) ? raw.file : null,
        originalFile: (raw.originalFile instanceof Blob) ? raw.originalFile : null,
        eraserLayerBlob: (raw.eraserLayerBlob instanceof Blob) ? raw.eraserLayerBlob : null,
        thumbnailBlob: (raw.thumbnailBlob instanceof Blob) ? raw.thumbnailBlob : null,
        thumbnailSrc: typeof raw.thumbnailSrc === 'string' ? raw.thumbnailSrc : null,
        src: typeof raw.src === 'string' ? raw.src : null,
        apiSrc: typeof raw.apiSrc === 'string' ? raw.apiSrc : null,
        imageDataCache: null,
        lastDisplayWidth: raw.lastDisplayWidth,
        autoFitRevision: typeof raw.autoFitRevision === 'number' ? raw.autoFitRevision : 0
    };
}

export function clonePage(page: MangaPage, deepBlockClone = true, includeRuntimeCache = false): MangaPage {
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
        eraserLayerBlob: page.eraserLayerBlob || null,
        thumbnailBlob: page.thumbnailBlob || null,
        thumbnailSrc: page.thumbnailSrc || null,
        src: includeRuntimeCache ? page.src : null,
        apiSrc: includeRuntimeCache ? page.apiSrc : null,
        imageDataCache: includeRuntimeCache ? page.imageDataCache : null,
        lastDisplayWidth: page.lastDisplayWidth,
        autoFitRevision: page.autoFitRevision || 0,
        blocks: deepBlockClone && Array.isArray(page.blocks)
            ? page.blocks.map((b: MangaBlock) => cloneBlock(b, includeRuntimeCache))
            : (page.blocks ? [...page.blocks] : [])
    };
}

export function markPageAutoFitDirty(page: MangaPage | null | undefined): void {
    if (!page) return;
    page.autoFitRevision = (page.autoFitRevision || 0) + 1;
    if (page.blocks && Array.isArray(page.blocks)) {
        page.blocks.forEach((b: MangaBlock) => {
            if (b) {
                b.autoFitCache = null;
                b.maskCache = null;
            }
        });
    }
}

export function cleanPageForPersistence(page: MangaPage): any {
    const cleanBlocks = (page.blocks || []).map(b => cleanBlockForPersistence(b));
    return {
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
}

export function validatePage(page: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!page || typeof page !== 'object') {
        return { valid: false, errors: ['Page must be an object'] };
    }
    if (!page.id || typeof page.id !== 'string') {
        errors.push('Page missing valid string id');
    }
    if (!Array.isArray(page.blocks)) {
        errors.push('Page blocks must be an array');
    }
    return { valid: errors.length === 0, errors };
}
