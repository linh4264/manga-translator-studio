/**
 * Manga Translator Studio - Unified State Facade & Domain Sub-systems
 * 
 * Provides domain-specific stores:
 * - DocumentState (pages, blocks, selections, dossier, lorebook)
 * - EditorState (zoom, viewMode, active tab, tool flags)
 * - SettingsState (API keys, AI providers, pipeline modes, translation presets)
 * - TypographyState (default fonts, style presets, metrics)
 * - LearningState (TOEIC words, SRS state, questions)
 * 
 * Provides 100% backward-compatible `globalState` proxy.
 */

import { GlobalState } from '../../types/index';
import { documentState, DocumentState, stateEvents, uiUpdatePageListUI, uiUpdateProcessingOverlay, uiUpdateBackgroundTaskOverlay, uiUpdateActiveBlockEditor, uiUpdateSplitView, uiSetRightTab, registerStateCallbacks, getActivePage, getActiveBlock, setSelectedBlockId, setSelectedBlockIds, markPageAutoFitDirty } from './domain-document';
import { editorState, EditorState } from './domain-editor';
import { settingsState, SettingsState, isWeakTranslationModel, isFlash31LiteModel, loadSettingsFromStorage } from './domain-settings';
import { typographyState, TypographyState, getFontMetrics, saveCustomPresetsToStorage, loadTypographyFromStorage } from './domain-typography';
import { learningState, LearningState } from './domain-learning';

export * from './domain-document';
export * from './domain-editor';
export * from './domain-settings';
export * from './domain-typography';
export * from './domain-learning';
export * from './history';
export * from './database';

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
} from '../../config/constants';

export function getDocumentState(): DocumentState { return documentState; }
export function getEditorState(): EditorState { return editorState; }
export function getSettingsState(): SettingsState { return settingsState; }
export function getTypographyState(): TypographyState { return typographyState; }
export function getLearningState(): LearningState { return learningState; }

// Target lookup mapping for globalState proxy
function getDomainTarget(prop: string | symbol): any {
    if (typeof prop !== 'string') return documentState;

    if (prop in documentState) return documentState;
    if (prop in editorState) return editorState;
    if (prop in typographyState) return typographyState;
    if (prop in learningState) return learningState;
    if (prop in settingsState) return settingsState;

    // Fallback based on naming conventions
    if (prop.startsWith('default') || prop.includes('Font') || prop.includes('Style') || prop === 'fontLibrary' || prop === 'fontSpecificMetrics' || prop === 'autoFitEnabled') {
        return typographyState;
    }
    if (prop.startsWith('toeic') || prop.includes('Toeic')) {
        return learningState;
    }
    if (prop.startsWith('magicWand') || prop === 'viewMode' || prop === 'zoom' || prop === 'activeTab' || prop === 'bilingualMode' || prop === 'enableHoverTooltip' || prop === 'toolbarCollapsedMobile' || prop === 'isMobileHandMode') {
        return editorState;
    }
    if (prop === 'pages' || prop === 'activePageIndex' || prop === 'selectedBlockId' || prop === 'selectedBlockIds' || prop === 'characterDossier' || prop === 'lorebook' || prop === 'chapterStoryMemory') {
        return documentState;
    }

    return settingsState;
}

export const globalState: GlobalState = new Proxy({} as GlobalState, {
    get(_target, prop) {
        const domain = getDomainTarget(prop);
        return domain[prop];
    },
    set(_target, prop, value) {
        const domain = getDomainTarget(prop);
        domain[prop] = value;
        return true;
    },
    has(_target, prop) {
        return (
            prop in documentState ||
            prop in editorState ||
            prop in settingsState ||
            prop in typographyState ||
            prop in learningState
        );
    },
    ownKeys() {
        const keys = new Set([
            ...Object.keys(documentState),
            ...Object.keys(editorState),
            ...Object.keys(settingsState),
            ...Object.keys(typographyState),
            ...Object.keys(learningState)
        ]);
        return Array.from(keys);
    },
    getOwnPropertyDescriptor(_target, prop) {
        const domain = getDomainTarget(prop);
        return Object.getOwnPropertyDescriptor(domain, prop) || {
            enumerable: true,
            configurable: true,
            writable: true,
            value: domain[prop]
        };
    }
});

export function initializeStateFromStorage(): void {
    loadSettingsFromStorage();
    loadTypographyFromStorage();
}
