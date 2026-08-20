// Story Memory, Lorebook Context, AI State & Model Helpers
import {
    VALID_MODEL_IDS,
    DEFAULT_MODEL,
    TARGET_LANG_MAP
} from '../../config/constants';
import { showToast } from '../../core/utils/dom';
import { getConfiguredApiKey } from './ai-config';
import {
    getStoryMemoryState,
    setStoryMemoryEnabled,
    pushStoryMemorySummary,
    clearStoryMemoryState,
    getTranslationContext
} from './ai-state';
import { MangaBlock, CharacterDossierEntry, LorebookEntry } from '../../types/index';
import { globalState } from '../../core/state';

export let cancelTranslationFlag = false;
export let isBatchTranslating = false;

export function setCancelTranslationFlag(val: boolean): void {
    cancelTranslationFlag = val;
}

export function setIsBatchTranslating(val: boolean): void {
    isBatchTranslating = val;
}

export function getGeminiApiKey(): string {
    return getConfiguredApiKey();
}

export function normalizeModelId(modelId?: string): string {
    if (!modelId) return DEFAULT_MODEL;
    if (modelId.startsWith('gemini-')) return modelId;
    return (VALID_MODEL_IDS as readonly string[]).includes(modelId) ? modelId : DEFAULT_MODEL;
}

export function getDefaultFontForBlockType(type?: string): string {
    const ctx = getTranslationContext();
    const cleanType = String(type || '').trim().toLowerCase();
    if (cleanType === 'narration') return ctx.defaultNarrationFont || 'font-vietnamese';
    if (cleanType === 'thought') return ctx.defaultThoughtFont || 'font-comicneue';
    if (cleanType === 'sfx') return ctx.defaultSfxFont || 'font-impact';
    return ctx.defaultDialogueFont || ctx.defaultFont || 'font-manga';
}

export function getModelTranslationProfile(modelId?: string, targetLang?: string): string[] {
    const normalized = normalizeModelId(modelId);
    const lang = targetLang || getTranslationContext().targetLanguage || 'vi';
    const targetLangName = TARGET_LANG_MAP[lang] || 'Vietnamese';
    const pronounTerm = lang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';
    const pronounSimple = lang === 'vi' ? 'xưng hô (pronouns)' : 'pronouns';

    if (normalized === 'gemini-3.1-flash-lite') {
        return [
            '- MODEL PROFILE: Gemini 3.1 Flash-Lite.',
            `- MODEL RULE: Check the provided previous page dialogues context and reuse established ${pronounTerm} and tone for the same characters.`,
            `- MODEL RULE: Keep ${pronounSimple} stable and conversational across dialogue on the page, shifting naturally only when emotions or relations change.`,
            `- MODEL RULE: Translate to natural, everyday ${targetLangName} manga speech without forcing slang. Avoid overly formal, literal, or robotic wording.`,
            '- MODEL RULE: Keep translations short and compact so they fit inside speech bubbles easily without omitting core meaning.'
        ];
    }

    if (normalized.includes('flash-lite')) {
        return [
            '- MODEL PROFILE: Flash-Lite.',
            `- MODEL RULE: Prioritize short, natural, high-confidence ${targetLangName}. Prefer simple, stable pronouns and avoid ornate wording.`,
            `- MODEL RULE: If speaker relationship is unclear, use the safest neutral ${targetLangName} pronoun pair that still sounds natural in manga dialogue.`,
            '- MODEL RULE: Preserve consistency across repeated lines while respecting contextual nuance.'
        ];
    }

    if (normalized.includes('flash')) {
        return [
            '- MODEL PROFILE: Flash.',
            `- MODEL RULE: Balance naturalness, brevity, and fidelity. Keep tone faithful and maintain stable pronouns across nearby bubbles unless mood shifts.`,
            `- MODEL RULE: Prefer conversational ${targetLangName} that sounds like real manga dialogue instead of literal sentence-by-sentence translation.`
        ];
    }

    if (normalized.includes('pro')) {
        return [
            '- MODEL PROFILE: Pro.',
            `- MODEL RULE: Use the deepest available context to infer relationships, subtext, emotional tone, and honorific intent without hallucinating unsupported facts.`,
            `- MODEL RULE: Preserve nuanced pronouns, implied sarcasm, formality shifts, and character voice. Choose the most context-appropriate ${targetLangName} phrasing, not the most literal one.`,
            '- MODEL RULE: When dialogue is ambiguous, preserve the ambiguity unless surrounding context strongly resolves it. Prioritize consistent character speech patterns.'
        ];
    }

    return [
        '- MODEL PROFILE: Balanced.',
        `- MODEL RULE: Keep the translation natural, concise, and faithful to source meaning. Maintain stable pronouns and tone across the page.`
    ];
}

export function toggleStoryMemory(enabled: boolean): void {
    setStoryMemoryEnabled(enabled);
    showToast(enabled ? 'Đã bật Bộ nhớ ngữ cảnh chương' : 'Đã tắt Bộ nhớ ngữ cảnh chương', 'info');
}

export function updateStoryMemoryBadge(): void {
    const badge = document.getElementById('story-memory-badge');
    if (badge) {
        const count = getStoryMemoryState().chapterStoryMemory.length;
        badge.textContent = `${count} trang`;
    }
}

export function clearStoryMemory(): void {
    clearStoryMemoryState();
    updateStoryMemoryBadge();
    showToast('Đã xóa bộ nhớ ngữ cảnh chương.', 'success');
}

export function recordPageToStoryMemory(pageIndex: number, blocks: MangaBlock[]): void {
    const memState = getStoryMemoryState();
    if (!blocks || !blocks.length || !memState.enableStoryMemory) return;
    const translatedLines = blocks.map(b => `${b.original} -> ${b.translated}`).filter(Boolean);
    if (!translatedLines.length) return;

    const summary = {
        pageIndex: pageIndex + 1,
        dialogueCount: blocks.length,
        excerpt: translatedLines.slice(0, 4).join('; ')
    };

    pushStoryMemorySummary(summary);
    updateStoryMemoryBadge();
}

export function viewStoryMemoryModal(): void {
    const memories = getStoryMemoryState().chapterStoryMemory;
    if (!memories.length) {
        showToast('Bộ nhớ ngữ cảnh hiện đang trống. Hãy dịch vài trang để tích lũy ngữ cảnh!', 'info');
        return;
    }
    const lines = memories.map(m => `Trang ${m.pageIndex}: ${m.excerpt}`);
    alert(`📖 BỘ NHỚ NGỮ CẢNH CHƯƠNG TRUYỆN (${memories.length} trang đã lưu):\n\n` + lines.join('\n\n'));
}

export function cancelBatchTranslation(): void {
    cancelTranslationFlag = true;
    showToast("Đang dừng tiến trình dịch thuật ngầm theo yêu cầu...", "warn");
}

export function buildLorebookPromptContext(
    dossier: CharacterDossierEntry[] = globalState.characterDossier || [],
    lorebook: LorebookEntry[] = globalState.lorebook || []
): string {
    const parts: string[] = [];

    if (dossier && dossier.length > 0) {
        const charLines = dossier.map(c => {
            let info = `${c.originalName || ''} -> ${c.translatedName || ''}`;
            if (c.gender) info += ` (${c.gender === 'male' ? 'Nam' : c.gender === 'female' ? 'Nữ' : 'Khác'})`;
            if (c.pronounSelf || c.pronounTarget) info += ` [Xưng hô: ${c.pronounSelf || 'tôi'} - ${c.pronounTarget || 'cậu'}]`;
            if (c.personality) info += ` - Tính cách: ${c.personality}`;
            if (c.notes) info += ` (${c.notes})`;
            return info;
        }).join('; ');
        parts.push(`- CHARACTER DOSSIER (STRICT NAMES & PRONOUNS): Enforce the following character names, gender, pronouns, and speech tone strictly across all pages: ${charLines}`);
    }

    if (lorebook && lorebook.length > 0) {
        const loreLines = lorebook.map(l => {
            let info = `${l.originalTerm || ''} -> ${l.translatedTerm || ''}`;
            if (l.category) info += ` [Thể loại: ${l.category}]`;
            if (l.note) info += ` (Ghi chú: ${l.note})`;
            return info;
        }).join('; ');
        parts.push(`- LOREBOOK & WORLD TERMINOLOGY: Strictly use these exact translations for world-building terms, skills, locations, and items: ${loreLines}`);
    }

    return parts.join('\n');
}

