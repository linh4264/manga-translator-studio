/**
 * Manga Translator Studio - Domain State: AI & Application Settings
 * Manages API keys, model choices, translation prompts, retry logic, and pipeline modes.
 */
import {
    DEFAULT_MODEL,
    DEFAULT_PIPELINE_MODE,
    DEFAULT_OCR_MODEL,
    DEFAULT_TRANSLATION_MODEL,
    DEFAULT_INPAINT_METHOD,
    TRANSLATION_GENRE_PRESETS
} from '../../config/constants';

export interface SettingsState {
    apiKey: string;
    aiProvider: 'gemini' | 'claude' | 'openai' | 'custom';
    apiEndpoint: string;
    enableStoryMemory: boolean;
    selectedModel: string;
    ocrModel: string;
    translationModel: string;
    translationPipelineMode: 'two-step' | 'legacy' | 'single-step';
    preserveNames: boolean;
    glossaryNames: string;
    sourceLanguage: string;
    targetLanguage: string;
    uiLanguage: 'vi' | 'en';
    pronounMatrix: string;
    ocrEnhanceEnabled: boolean;
    comicUniverse: string;
    comicGenre?: string;
    comicGenres: string[];
    comicTone: string;
    translationGenrePresets: string[];
    translationContextPrompt: string;
    apiDelay: number;
    maxRetries: number;
    exportFormat: string;
    pdfQuality: string;
    inpaintMethod: string;
    customInpaintEndpoint: string;
}

export function isWeakTranslationModel(modelId?: string): boolean {
    return String(modelId || '').includes('flash-lite');
}

export function isFlash31LiteModel(modelId?: string): boolean {
    return String(modelId || '') === 'gemini-3.1-flash-lite';
}

export const settingsState: SettingsState = {
    apiKey: '',
    aiProvider: 'gemini',
    apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
    enableStoryMemory: true,
    selectedModel: DEFAULT_MODEL,
    translationPipelineMode: DEFAULT_PIPELINE_MODE as any,
    ocrModel: DEFAULT_OCR_MODEL,
    translationModel: DEFAULT_TRANSLATION_MODEL,
    preserveNames: true,
    glossaryNames: '',
    sourceLanguage: 'auto',
    targetLanguage: 'vi',
    uiLanguage: 'vi',
    exportFormat: typeof localStorage !== 'undefined' ? (localStorage.getItem('manga_export_format') || 'auto') : 'auto',
    pdfQuality: typeof localStorage !== 'undefined' ? (localStorage.getItem('manga_pdf_quality') || 'hd') : 'hd',
    pronounMatrix: '',
    ocrEnhanceEnabled: true,
    translationGenrePresets: ['quality'],
    comicUniverse: typeof localStorage !== 'undefined' ? (localStorage.getItem('manga_comic_universe') || 'auto') : 'auto',
    comicGenres: (() => {
        if (typeof localStorage === 'undefined') return ['fantasy', 'isekai'];
        try {
            const saved = localStorage.getItem('manga_comic_genres');
            if (saved) return JSON.parse(saved);
            const oldSingle = localStorage.getItem('manga_comic_genre');
            return oldSingle ? [oldSingle] : ['fantasy', 'isekai'];
        } catch (e) {
            return ['fantasy', 'isekai'];
        }
    })(),
    comicTone: typeof localStorage !== 'undefined' ? (localStorage.getItem('manga_comic_tone') || 'classic') : 'classic',
    translationContextPrompt: typeof localStorage !== 'undefined' ? (localStorage.getItem('gemini_manga_translation_context_prompt') || '') : '',
    apiDelay: 2,
    maxRetries: 1,
    inpaintMethod: DEFAULT_INPAINT_METHOD,
    customInpaintEndpoint: ''
};

export function loadSettingsFromStorage(): void {
    if (typeof localStorage === 'undefined') return;

    const keysToLoad: Record<string, keyof SettingsState> = {
        'gemini_manga_api_key': 'apiKey',
        'gemini_manga_ai_provider': 'aiProvider',
        'gemini_manga_api_endpoint': 'apiEndpoint',
        'gemini_manga_model': 'selectedModel',
        'gemini_manga_pipeline_mode': 'translationPipelineMode',
        'gemini_manga_ocr_model': 'ocrModel',
        'gemini_manga_translation_model': 'translationModel',
        'gemini_manga_inpaint_method': 'inpaintMethod',
        'gemini_manga_inpaint_endpoint': 'customInpaintEndpoint',
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
        'manga_export_format': 'exportFormat',
        'manga_pdf_quality': 'pdfQuality'
    };

    Object.entries(keysToLoad).forEach(([storageKey, stateKey]) => {
        const val = localStorage.getItem(storageKey);
        if (val !== null) {
            if (stateKey === 'preserveNames') {
                settingsState[stateKey] = val === 'true';
            } else if (stateKey === 'apiDelay' || stateKey === 'maxRetries') {
                settingsState[stateKey] = parseInt(val, 10) || 0;
            } else if (stateKey === 'ocrEnhanceEnabled') {
                try { settingsState[stateKey] = JSON.parse(val); } catch (e) { settingsState[stateKey] = true; }
            } else {
                (settingsState as any)[stateKey] = val;
            }
        }
    });

    const savedGenrePreset = localStorage.getItem('gemini_manga_translation_genre_preset');
    if (savedGenrePreset !== null) {
        try {
            const savedPresets: string[] = savedGenrePreset.startsWith('[')
                ? JSON.parse(savedGenrePreset)
                : savedGenrePreset.split(',').map((item: string) => item.trim()).filter(Boolean);
            const validPresets = savedPresets.filter((item: string) => (TRANSLATION_GENRE_PRESETS as any)[item] !== undefined);
            if (validPresets.length > 0) {
                settingsState.translationGenrePresets = validPresets;
            }
        } catch (error) {
            console.warn('Không thể đọc preset thể loại đã lưu:', error);
        }
    }
}
