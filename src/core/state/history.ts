/**
 * Manga Translator Studio - State History & Undo/Redo Engine
 * Provides Page-level Delta and Full-Project History Snapshots.
 */
import { HistorySnapshot, MangaPage } from '../../types/index';
import { MAX_HISTORY_LIMIT } from '../../config/constants';
import { documentState, stateCallbacks, uiUpdatePageListUI, uiUpdateActiveBlockEditor } from './domain-document';
import { clonePage } from '../document-model/page-model';
import { cloneBlock } from '../document-model/block-model';
import { savePageToDB, deletePageFromDB, saveProjectMeta, garbageCollectPageCaches } from './database';

export let undoStack: HistorySnapshot[] = [];
export let redoStack: HistorySnapshot[] = [];

let savePageDebounceTimer: any = null;

export function pushStateToHistory(isProjectLevel: boolean = false): void {
    const activePage = (documentState.activePageIndex >= 0 && documentState.activePageIndex < documentState.pages.length)
        ? documentState.pages[documentState.activePageIndex]
        : null;

    if (!isProjectLevel && activePage) {
        const pageSnapshot = clonePage(activePage, true, false);
        const snapshotObj: HistorySnapshot = {
            scope: 'page',
            pageId: activePage.id,
            pageState: pageSnapshot,
            activePageIndex: documentState.activePageIndex,
            selectedBlockId: documentState.selectedBlockId,
            selectedBlockIds: [...(documentState.selectedBlockIds || [])],
            timestamp: Date.now(),
            get pagesState() {
                return this.pageState ? [this.pageState] : [];
            }
        };
        undoStack.push(snapshotObj);
    } else {
        const currentState = documentState.pages.map((page: MangaPage) => clonePage(page, true, false));
        undoStack.push({
            scope: 'project',
            pagesState: currentState,
            activePageIndex: documentState.activePageIndex,
            selectedBlockId: documentState.selectedBlockId,
            selectedBlockIds: [...(documentState.selectedBlockIds || [])],
            timestamp: Date.now()
        });
    }

    if (undoStack.length > MAX_HISTORY_LIMIT) {
        undoStack.shift();
    }

    redoStack.length = 0;
    if (stateCallbacks.onUndoRedoChange) stateCallbacks.onUndoRedoChange();
}

export function clearHistory(): void {
    undoStack = [];
    redoStack = [];
    if (stateCallbacks.onUndoRedoChange) stateCallbacks.onUndoRedoChange();
}

export function applyStateFromSnapshot(snapshot: HistorySnapshot | any): void {
    if (!snapshot) return;

    if (snapshot.scope === 'page' || (snapshot.pageState && !snapshot.pagesState)) {
        // 1. OPTIMIZED PAGE-LEVEL DELTA RESTORE
        let targetPage = snapshot.pageId ? documentState.pages.find((p: MangaPage) => p.id === snapshot.pageId) : null;
        if (!targetPage && typeof snapshot.activePageIndex === 'number' && snapshot.activePageIndex >= 0 && snapshot.activePageIndex < documentState.pages.length) {
            targetPage = documentState.pages[snapshot.activePageIndex];
        }

        if (targetPage && snapshot.pageState) {
            targetPage.name = snapshot.pageState.name || targetPage.name;
            targetPage.status = snapshot.pageState.status;
            targetPage.width = snapshot.pageState.width || targetPage.width;
            targetPage.height = snapshot.pageState.height || targetPage.height;
            targetPage.apiWidth = snapshot.pageState.apiWidth || targetPage.apiWidth;
            targetPage.apiHeight = snapshot.pageState.apiHeight || targetPage.apiHeight;
            targetPage.eraserLayerBlob = snapshot.pageState.eraserLayerBlob || null;
            targetPage.blocks = Array.isArray(snapshot.pageState.blocks)
                ? snapshot.pageState.blocks.map((b: any) => cloneBlock(b))
                : [];
            targetPage.autoFitRevision = (targetPage.autoFitRevision || 0) + 1;
            savePageToDB(targetPage);
        } else if (!targetPage && snapshot.pageState) {
            targetPage = {
                id: snapshot.pageState.id,
                name: snapshot.pageState.name || 'Page',
                width: snapshot.pageState.width || 800,
                height: snapshot.pageState.height || 1200,
                apiWidth: snapshot.pageState.apiWidth || snapshot.pageState.width || 800,
                apiHeight: snapshot.pageState.apiHeight || snapshot.pageState.height || 1200,
                status: snapshot.pageState.status || 'draft',
                file: null,
                originalFile: null,
                thumbnailBlob: null,
                thumbnailSrc: null,
                src: null,
                apiSrc: null,
                imageDataCache: null,
                eraserLayerBlob: snapshot.pageState.eraserLayerBlob || null,
                blocks: Array.isArray(snapshot.pageState.blocks)
                    ? snapshot.pageState.blocks.map((b: any) => cloneBlock(b))
                    : [],
                autoFitRevision: 1
            };
            const insertIdx = (typeof snapshot.activePageIndex === 'number' && snapshot.activePageIndex >= 0 && snapshot.activePageIndex <= documentState.pages.length)
                ? snapshot.activePageIndex
                : documentState.pages.length;
            documentState.pages.splice(insertIdx, 0, targetPage);
            savePageToDB(targetPage);
        }

        if (typeof snapshot.activePageIndex === 'number' && snapshot.activePageIndex >= 0 && snapshot.activePageIndex < documentState.pages.length) {
            documentState.activePageIndex = snapshot.activePageIndex;
        }

        documentState.selectedBlockId = snapshot.selectedBlockId || null;
        documentState.selectedBlockIds = Array.isArray(snapshot.selectedBlockIds)
            ? [...snapshot.selectedBlockIds]
            : (snapshot.selectedBlockId ? [snapshot.selectedBlockId] : []);

        saveProjectMeta(documentState.pages.map(p => p.id), documentState.activePageIndex);

        if (stateCallbacks.onUndoRedoChange) stateCallbacks.onUndoRedoChange();

        if (stateCallbacks.onSnapshotRestored) {
            stateCallbacks.onSnapshotRestored(snapshot);
        } else {
            uiUpdatePageListUI();
            if (documentState.activePageIndex !== -1) {
                import('../../ui/pages-ui').then(m => m.selectPage(documentState.activePageIndex));
            }
            documentState.selectedBlockId = snapshot.selectedBlockId;
            documentState.selectedBlockIds = Array.isArray(snapshot.selectedBlockIds)
                ? [...snapshot.selectedBlockIds]
                : (snapshot.selectedBlockId ? [snapshot.selectedBlockId] : []);
            uiUpdateActiveBlockEditor();
        }

        garbageCollectPageCaches(documentState.activePageIndex);
        return;
    }

    // 2. FULL PROJECT-LEVEL RESTORE
    if (!Array.isArray(snapshot.pagesState)) return;

    const snapshotPageIds = new Set(snapshot.pagesState.map((sp: MangaPage) => sp.id));

    // Remove pages from DB that are not in snapshot
    const pagesToDelete = documentState.pages.filter((p: MangaPage) => !snapshotPageIds.has(p.id));
    pagesToDelete.forEach((p: MangaPage) => {
        deletePageFromDB(p.id);
    });

    const existingPagesMap = new Map(documentState.pages.map((p: MangaPage) => [p.id, p]));
    const restoredPages: MangaPage[] = [];

    snapshot.pagesState.forEach((savedPage: MangaPage) => {
        let page = existingPagesMap.get(savedPage.id);
        if (page) {
            page.name = savedPage.name || page.name;
            page.status = savedPage.status;
            page.width = savedPage.width || page.width;
            page.height = savedPage.height || page.height;
            page.apiWidth = savedPage.apiWidth || page.apiWidth;
            page.apiHeight = savedPage.apiHeight || page.apiHeight;
            page.eraserLayerBlob = savedPage.eraserLayerBlob || null;
            page.blocks = Array.isArray(savedPage.blocks) ? savedPage.blocks.map((b: any) => cloneBlock(b)) : [];
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
                file: null,
                originalFile: null,
                thumbnailBlob: null,
                thumbnailSrc: null,
                src: null,
                apiSrc: null,
                imageDataCache: null,
                eraserLayerBlob: savedPage.eraserLayerBlob || null,
                blocks: Array.isArray(savedPage.blocks) ? savedPage.blocks.map((b: any) => cloneBlock(b)) : [],
                autoFitRevision: 1
            };
        }
        savePageToDB(page);
        restoredPages.push(page);
    });

    documentState.pages = restoredPages;

    documentState.activePageIndex = (typeof snapshot.activePageIndex === 'number' && snapshot.activePageIndex >= 0 && snapshot.activePageIndex < documentState.pages.length)
        ? snapshot.activePageIndex
        : (documentState.pages.length > 0 ? 0 : -1);

    documentState.selectedBlockId = snapshot.selectedBlockId || null;
    documentState.selectedBlockIds = Array.isArray(snapshot.selectedBlockIds)
        ? [...snapshot.selectedBlockIds]
        : (snapshot.selectedBlockId ? [snapshot.selectedBlockId] : []);

    saveProjectMeta(documentState.pages.map(p => p.id), documentState.activePageIndex);

    if (stateCallbacks.onUndoRedoChange) stateCallbacks.onUndoRedoChange();

    if (stateCallbacks.onSnapshotRestored) {
        stateCallbacks.onSnapshotRestored(snapshot);
    } else {
        uiUpdatePageListUI();
        if (documentState.activePageIndex !== -1) {
            import('../../ui/pages-ui').then(m => m.selectPage(documentState.activePageIndex));
        }
        documentState.selectedBlockId = snapshot.selectedBlockId;
        documentState.selectedBlockIds = Array.isArray(snapshot.selectedBlockIds)
            ? [...snapshot.selectedBlockIds]
            : (snapshot.selectedBlockId ? [snapshot.selectedBlockId] : []);
        uiUpdateActiveBlockEditor();
    }

    garbageCollectPageCaches(documentState.activePageIndex);
}

export function executeUndo(): void {
    if (undoStack.length === 0) return;
    const targetSnapshot = undoStack[undoStack.length - 1];

    const activePage = (documentState.activePageIndex >= 0 && documentState.activePageIndex < documentState.pages.length)
        ? documentState.pages[documentState.activePageIndex]
        : null;

    if (targetSnapshot.scope === 'page' && activePage) {
        redoStack.push({
            scope: 'page',
            pageId: activePage.id,
            pageState: clonePage(activePage, true, false),
            activePageIndex: documentState.activePageIndex,
            selectedBlockId: documentState.selectedBlockId,
            selectedBlockIds: [...(documentState.selectedBlockIds || [])],
            timestamp: Date.now()
        });
    } else {
        const currentState = documentState.pages.map((page: MangaPage) => clonePage(page, true, false));
        redoStack.push({
            scope: 'project',
            pagesState: currentState,
            activePageIndex: documentState.activePageIndex,
            selectedBlockId: documentState.selectedBlockId,
            selectedBlockIds: [...(documentState.selectedBlockIds || [])],
            timestamp: Date.now()
        });
    }

    const previous = undoStack.pop();
    if (previous) {
        applyStateFromSnapshot(previous);
    }
}

export function executeRedo(): void {
    if (redoStack.length === 0) return;
    const targetSnapshot = redoStack[redoStack.length - 1];

    const activePage = (documentState.activePageIndex >= 0 && documentState.activePageIndex < documentState.pages.length)
        ? documentState.pages[documentState.activePageIndex]
        : null;

    if (targetSnapshot.scope === 'page' && activePage) {
        undoStack.push({
            scope: 'page',
            pageId: activePage.id,
            pageState: clonePage(activePage, true, false),
            activePageIndex: documentState.activePageIndex,
            selectedBlockId: documentState.selectedBlockId,
            selectedBlockIds: [...(documentState.selectedBlockIds || [])],
            timestamp: Date.now()
        });
    } else {
        const currentState = documentState.pages.map((page: MangaPage) => clonePage(page, true, false));
        undoStack.push({
            scope: 'project',
            pagesState: currentState,
            activePageIndex: documentState.activePageIndex,
            selectedBlockId: documentState.selectedBlockId,
            selectedBlockIds: [...(documentState.selectedBlockIds || [])],
            timestamp: Date.now()
        });
    }

    const next = redoStack.pop();
    if (next) {
        applyStateFromSnapshot(next);
    }
}

export function debounceSavePage(page: MangaPage | null | undefined): void {
    clearTimeout(savePageDebounceTimer);
    savePageDebounceTimer = setTimeout(() => {
        pushStateToHistory();
        savePageToDB(page);
    }, 1000);
}
