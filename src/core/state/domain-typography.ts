/**
 * Manga Translator Studio - Domain State: Typography & Styling
 * Manages default fonts, typography metrics, global block styles, and custom style presets.
 */
import { BlockStyle, CustomStylePreset } from '../../types/index';
import {
    DEFAULT_TYPE_FONTS,
    DEFAULT_BLOCK_STYLE,
    DEFAULT_VERTICAL_WRITING_MODE
} from '../../config/constants';
import { safeSetLocalStorage } from '../utils/storage';

export interface TypographyState {
    defaultDialogueFont: string;
    defaultNarrationFont: string;
    defaultThoughtFont: string;
    defaultSfxFont: string;
    defaultFont: string;
    defaultFontSize: number;
    defaultLineHeight: number;
    defaultLetterSpacing: number;
    autoFitEnabled: boolean;
    globalStyle: BlockStyle;
    customStylePresets: CustomStylePreset[];
    fontSpecificMetrics: Record<string, any>;
    fontLibrary?: any[];
}

export const typographyState: TypographyState = {
    defaultDialogueFont: typeof localStorage !== 'undefined'
        ? (localStorage.getItem('manga_default_dialogue_font') || localStorage.getItem('manga_default_font') || DEFAULT_TYPE_FONTS.dialogue)
        : DEFAULT_TYPE_FONTS.dialogue,
    defaultNarrationFont: typeof localStorage !== 'undefined'
        ? (localStorage.getItem('manga_default_narration_font') || DEFAULT_TYPE_FONTS.narration)
        : DEFAULT_TYPE_FONTS.narration,
    defaultThoughtFont: typeof localStorage !== 'undefined'
        ? (localStorage.getItem('manga_default_thought_font') || DEFAULT_TYPE_FONTS.thought)
        : DEFAULT_TYPE_FONTS.thought,
    defaultSfxFont: typeof localStorage !== 'undefined'
        ? (localStorage.getItem('manga_default_sfx_font') || DEFAULT_TYPE_FONTS.sfx)
        : DEFAULT_TYPE_FONTS.sfx,
    defaultFont: typeof localStorage !== 'undefined'
        ? (localStorage.getItem('manga_default_dialogue_font') || localStorage.getItem('manga_default_font') || DEFAULT_TYPE_FONTS.dialogue)
        : DEFAULT_TYPE_FONTS.dialogue,
    defaultFontSize: typeof localStorage !== 'undefined'
        ? (() => {
            const val = localStorage.getItem('manga_default_font_size');
            const num = val ? parseFloat(val) : NaN;
            return !isNaN(num) && num > 0 ? num : (DEFAULT_BLOCK_STYLE.fontSize ?? 17);
        })()
        : (DEFAULT_BLOCK_STYLE.fontSize ?? 17),
    defaultLineHeight: typeof localStorage !== 'undefined'
        ? (() => {
            const val = localStorage.getItem('manga_default_line_height');
            const num = val ? parseFloat(val) : NaN;
            return !isNaN(num) && num > 0 ? num : (DEFAULT_BLOCK_STYLE.lineHeight ?? 1.15);
        })()
        : (DEFAULT_BLOCK_STYLE.lineHeight ?? 1.15),
    defaultLetterSpacing: typeof localStorage !== 'undefined'
        ? (() => {
            const val = localStorage.getItem('manga_default_letter_spacing');
            const num = val ? parseFloat(val) : NaN;
            return !isNaN(num) ? num : (DEFAULT_BLOCK_STYLE.letterSpacing !== undefined ? DEFAULT_BLOCK_STYLE.letterSpacing : 0);
        })()
        : (DEFAULT_BLOCK_STYLE.letterSpacing ?? 0),
    autoFitEnabled: typeof localStorage !== 'undefined'
        ? localStorage.getItem('gemini_manga_autofit_enabled') === 'true'
        : false,
    globalStyle: {
        ...DEFAULT_BLOCK_STYLE,
        fontFamily: typeof localStorage !== 'undefined'
            ? (localStorage.getItem('manga_default_font') || 'font-manga')
            : 'font-manga',
        fontSize: typeof localStorage !== 'undefined'
            ? (() => {
                const val = localStorage.getItem('manga_default_font_size');
                const num = val ? parseFloat(val) : NaN;
                return !isNaN(num) && num > 0 ? num : DEFAULT_BLOCK_STYLE.fontSize;
            })()
            : DEFAULT_BLOCK_STYLE.fontSize,
        lineHeight: typeof localStorage !== 'undefined'
            ? (() => {
                const val = localStorage.getItem('manga_default_line_height');
                const num = val ? parseFloat(val) : NaN;
                return !isNaN(num) && num > 0 ? num : DEFAULT_BLOCK_STYLE.lineHeight;
            })()
            : DEFAULT_BLOCK_STYLE.lineHeight,
        letterSpacing: typeof localStorage !== 'undefined'
            ? (() => {
                const val = localStorage.getItem('manga_default_letter_spacing');
                const num = val ? parseFloat(val) : NaN;
                return !isNaN(num) ? num : (DEFAULT_BLOCK_STYLE.letterSpacing !== undefined ? DEFAULT_BLOCK_STYLE.letterSpacing : 0);
            })()
            : (DEFAULT_BLOCK_STYLE.letterSpacing ?? 0),
        vertical: DEFAULT_VERTICAL_WRITING_MODE
    },
    customStylePresets: typeof localStorage !== 'undefined'
        ? (() => {
            try {
                const saved = localStorage.getItem('manga_custom_style_presets');
                return saved ? JSON.parse(saved) : [];
            } catch (e) {
                return [];
            }
        })()
        : [],
    fontSpecificMetrics: typeof localStorage !== 'undefined'
        ? (() => {
            try {
                const saved = localStorage.getItem('manga_font_specific_metrics');
                return saved ? JSON.parse(saved) : {};
            } catch (e) {
                return {};
            }
        })()
        : {}
};

export function saveCustomPresetsToStorage(): void {
    safeSetLocalStorage('manga_custom_style_presets', typographyState.customStylePresets || []);
}

export function loadTypographyFromStorage(): void {
    if (typeof localStorage === 'undefined') return;

    const valDialogue = localStorage.getItem('manga_default_dialogue_font');
    if (valDialogue) typographyState.defaultDialogueFont = valDialogue;
    const valNarration = localStorage.getItem('manga_default_narration_font');
    if (valNarration) typographyState.defaultNarrationFont = valNarration;
    const valThought = localStorage.getItem('manga_default_thought_font');
    if (valThought) typographyState.defaultThoughtFont = valThought;
    const valSfx = localStorage.getItem('manga_default_sfx_font');
    if (valSfx) typographyState.defaultSfxFont = valSfx;
    const valFont = localStorage.getItem('manga_default_font');
    if (valFont) {
        typographyState.defaultFont = valFont;
        if (typographyState.globalStyle) typographyState.globalStyle.fontFamily = valFont;
    }

    const valSize = localStorage.getItem('manga_default_font_size');
    if (valSize) {
        const num = parseFloat(valSize);
        if (!isNaN(num) && num > 0) {
            typographyState.defaultFontSize = num;
            if (typographyState.globalStyle) typographyState.globalStyle.fontSize = num;
        }
    }

    const valLH = localStorage.getItem('manga_default_line_height');
    if (valLH) {
        const num = parseFloat(valLH);
        if (!isNaN(num) && num > 0) {
            typographyState.defaultLineHeight = num;
            if (typographyState.globalStyle) typographyState.globalStyle.lineHeight = num;
        }
    }

    const valLS = localStorage.getItem('manga_default_letter_spacing');
    if (valLS) {
        const num = parseFloat(valLS);
        if (!isNaN(num)) {
            typographyState.defaultLetterSpacing = num;
            if (typographyState.globalStyle) typographyState.globalStyle.letterSpacing = num;
        }
    }

    const valAutofit = localStorage.getItem('gemini_manga_autofit_enabled');
    if (valAutofit !== null) {
        typographyState.autoFitEnabled = valAutofit === 'true';
    }

    try {
        const savedCustomPresets = localStorage.getItem('manga_custom_style_presets');
        if (savedCustomPresets) {
            typographyState.customStylePresets = JSON.parse(savedCustomPresets);
        }
    } catch (e) {
        typographyState.customStylePresets = [];
    }

    try {
        const savedMetrics = localStorage.getItem('manga_font_specific_metrics');
        if (savedMetrics) {
            typographyState.fontSpecificMetrics = JSON.parse(savedMetrics);
        }
    } catch (e) {
        typographyState.fontSpecificMetrics = {};
    }
}

export function getFontMetrics(fontFamily?: string): { fontSize: number; lineHeight: number; letterSpacing: number } {
    const globalSize = typographyState.defaultFontSize || 17;
    const globalLH = typographyState.defaultLineHeight !== undefined ? typographyState.defaultLineHeight : 1.15;
    const globalLS = typographyState.defaultLetterSpacing !== undefined ? typographyState.defaultLetterSpacing : 0;

    if (!fontFamily || !typographyState.fontSpecificMetrics || !typographyState.fontSpecificMetrics[fontFamily]) {
        return { fontSize: globalSize, lineHeight: globalLH, letterSpacing: globalLS };
    }

    const specific = typographyState.fontSpecificMetrics[fontFamily];
    return {
        fontSize: typeof specific.fontSize === 'number' && specific.fontSize > 0 ? specific.fontSize : globalSize,
        lineHeight: typeof specific.lineHeight === 'number' && specific.lineHeight > 0 ? specific.lineHeight : globalLH,
        letterSpacing: typeof specific.letterSpacing === 'number' ? specific.letterSpacing : globalLS
    };
}
