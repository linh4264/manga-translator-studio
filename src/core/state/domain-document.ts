/**
 * Manga Translator Studio - Domain State: Document / Project
 * Manages pages, active page selection, blocks selection, and project metadata.
 */
import { MangaPage, MangaBlock, CharacterDossierEntry, LorebookEntry } from '../../types/index';
import { globalBus } from '../events';
import { markPageAutoFitDirty } from '../document-model/page-model';

export interface DocumentState {
    pages: MangaPage[];
    activePageIndex: number;
    selectedBlockId: string | null;
    selectedBlockIds: string[];
    characterDossier: CharacterDossierEntry[];
    lorebook: LorebookEntry[];
    chapterStoryMemory: any[];
}

export const documentState: DocumentState = {
    pages: [],
    activePageIndex: -1,
    selectedBlockId: null,
    selectedBlockIds: [],
    characterDossier: [],
    lorebook: [],
    chapterStoryMemory: []
};

// UI Event Types
export const stateEvents = {
    PAGE_LIST_UPDATED: 'ui:update-page-list',
    PROCESSING_OVERLAY: 'ui:update-processing-overlay',
    BACKGROUND_TASK_OVERLAY: 'ui:update-background-overlay',
    ACTIVE_BLOCK_EDITOR_UPDATED: 'ui:update-block-editor',
    SPLIT_VIEW_UPDATED: 'ui:update-split-view',
    RIGHT_TAB_CHANGED: 'ui:set-right-tab'
};

export function uiUpdatePageListUI(): void { globalBus.publish(stateEvents.PAGE_LIST_UPDATED); }
export function uiUpdateProcessingOverlay(show: boolean, message?: string, subtitle?: string, percent?: number): void {
    globalBus.publish(stateEvents.PROCESSING_OVERLAY, { show, message, subtitle, percent });
}
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

// Callbacks
export const stateCallbacks: {
    onUndoRedoChange: (() => void) | null;
    onPageListChange: ((page?: MangaPage) => void) | null;
    onSnapshotRestored: ((snapshot: any) => void) | null;
} = {
    onUndoRedoChange: null,
    onPageListChange: null,
    onSnapshotRestored: null
};

export function registerStateCallbacks(callbacks: {
    onUndoRedoChange?: () => void;
    onPageListChange?: (page?: MangaPage) => void;
    onSnapshotRestored?: (snapshot: any) => void;
}): void {
    if (callbacks.onUndoRedoChange) stateCallbacks.onUndoRedoChange = callbacks.onUndoRedoChange;
    if (callbacks.onPageListChange) stateCallbacks.onPageListChange = callbacks.onPageListChange;
    if (callbacks.onSnapshotRestored) stateCallbacks.onSnapshotRestored = callbacks.onSnapshotRestored;
}

export function getActivePage(): MangaPage | null {
    if (documentState.activePageIndex >= 0 && documentState.activePageIndex < documentState.pages.length) {
        return documentState.pages[documentState.activePageIndex];
    }
    return null;
}

export function getActiveBlock(): MangaBlock | null {
    const page = getActivePage();
    if (!page || !page.blocks || !documentState.selectedBlockId) return null;
    return page.blocks.find(b => b && b.id === documentState.selectedBlockId) || null;
}

export function setSelectedBlockId(id: string | null): void {
    documentState.selectedBlockId = id;
    documentState.selectedBlockIds = id ? [id] : [];
}

export function setSelectedBlockIds(ids: string[]): void {
    documentState.selectedBlockIds = Array.isArray(ids) ? [...ids] : [];
    documentState.selectedBlockId = documentState.selectedBlockIds.length > 0 ? documentState.selectedBlockIds[0] : null;
}

export { markPageAutoFitDirty };
