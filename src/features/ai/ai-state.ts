// AI Domain State & Context Manager
import { globalState } from '../../core/state';
import {
    DEFAULT_MODEL,
    DEFAULT_PIPELINE_MODE,
    DEFAULT_OCR_MODEL,
    DEFAULT_TRANSLATION_MODEL,
    DEFAULT_TYPE_FONTS
} from '../../config/constants';
import { safeSetLocalStorage } from '../../core/utils/storage';

export interface AiConfigState {
    apiKey: string;
    aiProvider: 'gemini' | 'claude' | 'openai' | 'custom';
    apiEndpoint: string;
    selectedModel: string;
    ocrModel: string;
    translationModel: string;
    apiDelay: number;
    maxRetries: number;
}

export interface TranslationContextOptions {
    sourceLanguage: string;
    targetLanguage: string;
    preserveNames: boolean;
    glossaryNames: string;
    comicUniverse: string;
    comicGenres: string[];
    comicTone: string;
    translationContextPrompt: string;
    translationPipelineMode: 'two-step' | 'single-step' | 'legacy';
    ocrEnhanceEnabled: boolean;
    defaultDialogueFont?: string;
    defaultNarrationFont?: string;
    defaultThoughtFont?: string;
    defaultSfxFont?: string;
    defaultFont?: string;
}

export interface StoryMemoryItem {
    pageIndex: number;
    dialogueCount: number;
    excerpt: string;
}

export interface StoryMemoryState {
    enableStoryMemory: boolean;
    chapterStoryMemory: StoryMemoryItem[];
}

export function getAiConfig(): AiConfigState {
    return {
        apiKey: (globalState.apiKey || '').trim(),
        aiProvider: (globalState.aiProvider || 'gemini') as any,
        apiEndpoint: (globalState.apiEndpoint || 'https://generativelanguage.googleapis.com/v1beta').trim(),
        selectedModel: globalState.selectedModel || DEFAULT_MODEL,
        ocrModel: globalState.ocrModel || DEFAULT_OCR_MODEL,
        translationModel: globalState.translationModel || DEFAULT_TRANSLATION_MODEL,
        apiDelay: typeof globalState.apiDelay === 'number' ? globalState.apiDelay : 2,
        maxRetries: typeof globalState.maxRetries === 'number' ? globalState.maxRetries : 3
    };
}

export function getTranslationContext(override?: Partial<TranslationContextOptions>): TranslationContextOptions {
    const defaultGenres = Array.isArray(globalState.comicGenres) && globalState.comicGenres.length > 0
        ? globalState.comicGenres
        : [globalState.comicGenre || 'fantasy'];

    const base: TranslationContextOptions = {
        sourceLanguage: globalState.sourceLanguage || 'auto',
        targetLanguage: globalState.targetLanguage || 'vi',
        preserveNames: globalState.preserveNames !== false,
        glossaryNames: (globalState.glossaryNames || '').trim(),
        comicUniverse: globalState.comicUniverse || 'auto',
        comicGenres: defaultGenres,
        comicTone: globalState.comicTone || 'classic',
        translationContextPrompt: (globalState.translationContextPrompt || '').trim(),
        translationPipelineMode: (globalState.translationPipelineMode || DEFAULT_PIPELINE_MODE) as any,
        ocrEnhanceEnabled: globalState.ocrEnhanceEnabled !== false,
        defaultDialogueFont: globalState.defaultDialogueFont || DEFAULT_TYPE_FONTS.dialogue,
        defaultNarrationFont: globalState.defaultNarrationFont || DEFAULT_TYPE_FONTS.narration,
        defaultThoughtFont: globalState.defaultThoughtFont || DEFAULT_TYPE_FONTS.thought,
        defaultSfxFont: globalState.defaultSfxFont || DEFAULT_TYPE_FONTS.sfx,
        defaultFont: globalState.defaultFont || DEFAULT_TYPE_FONTS.dialogue
    };

    return override ? { ...base, ...override } : base;
}

export function getStoryMemoryState(): StoryMemoryState {
    return {
        enableStoryMemory: globalState.enableStoryMemory !== false,
        chapterStoryMemory: Array.isArray(globalState.chapterStoryMemory)
            ? globalState.chapterStoryMemory
            : []
    };
}

export function setStoryMemoryEnabled(enabled: boolean): void {
    globalState.enableStoryMemory = Boolean(enabled);
    safeSetLocalStorage('manga_enable_story_memory', globalState.enableStoryMemory);
}

export function pushStoryMemorySummary(summary: StoryMemoryItem, maxLimit: number = 10): void {
    if (!globalState.chapterStoryMemory) {
        globalState.chapterStoryMemory = [];
    }
    globalState.chapterStoryMemory = globalState.chapterStoryMemory.filter(
        (m: StoryMemoryItem) => m.pageIndex !== summary.pageIndex
    );
    globalState.chapterStoryMemory.push(summary);
    if (globalState.chapterStoryMemory.length > maxLimit) {
        globalState.chapterStoryMemory.shift();
    }
}

export function clearStoryMemoryState(): void {
    globalState.chapterStoryMemory = [];
    localStorage.removeItem('manga_chapter_story_memory');
}
