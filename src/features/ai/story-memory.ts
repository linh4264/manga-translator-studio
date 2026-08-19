// Story Memory, Lorebook Context, AI State & Model Helpers
import { globalState } from '../../core/state';
import {
    VALID_MODEL_IDS,
    DEFAULT_MODEL,
    TARGET_LANG_MAP
} from '../../config/constants';
import { showToast } from '../../core/utils/dom';
import { safeSetLocalStorage } from '../../core/utils/storage';
import { getConfiguredApiKey } from './ai-config';
import { MangaBlock } from '../../types/index';

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
    const cleanType = String(type || '').trim().toLowerCase();
    if (cleanType === 'narration') return globalState.defaultNarrationFont || 'font-vietnamese';
    if (cleanType === 'thought') return globalState.defaultThoughtFont || 'font-comicneue';
    if (cleanType === 'sfx') return globalState.defaultSfxFont || 'font-impact';
    return globalState.defaultDialogueFont || globalState.defaultFont || 'font-manga';
}

export function getModelTranslationProfile(modelId?: string): string[] {
    const normalized = normalizeModelId(modelId);
    const targetLang = globalState.targetLanguage || 'vi';
    const targetLangName = TARGET_LANG_MAP[targetLang] || 'Vietnamese';
    const pronounTerm = targetLang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';
    const pronounSimple = targetLang === 'vi' ? 'xưng hô (pronouns)' : 'pronouns';

    if (normalized === 'gemini-3.1-flash-lite') {
        return [
            '- MODEL PROFILE: Gemini 3.1 Flash-Lite.',
            `- MODEL RULE: You must check the provided previous page dialogues context and strictly reuse the exact same ${pronounTerm} and tone for the same characters.`,
            `- MODEL RULE: Keep the ${pronounSimple} simple, conversational, and highly consistent across all bubbles on the page.`,
            `- MODEL RULE: Translate to natural, everyday ${targetLangName} manga speech. Avoid overly formal, literal, or robotic wording.`,
            '- MODEL RULE: Keep translations short and compact so they fit inside speech bubbles easily.'
        ];
    }

    if (normalized.includes('flash-lite')) {
        return [
            '- MODEL PROFILE: Flash-Lite.',
            `- MODEL RULE: Prioritize short, natural, high-confidence ${targetLangName}. Prefer simple pronouns and avoid ornate wording.`,
            `- MODEL RULE: If speaker relationship is unclear, use the safest neutral ${targetLangName} pronoun pair that still sounds natural in manga dialogue.`,
            '- MODEL RULE: Preserve consistency across repeated lines, even if a later line is slightly more literal.'
        ];
    }

    if (normalized.includes('flash')) {
        return [
            '- MODEL PROFILE: Flash.',
            `- MODEL RULE: Balance naturalness, brevity, and context. Keep tone faithful and pronouns consistent across nearby bubbles.`,
            `- MODEL RULE: Prefer conversational ${targetLangName} that sounds like real manga dialogue instead of literal sentence-by-sentence translation.`
        ];
    }

    if (normalized.includes('pro')) {
        return [
            '- MODEL PROFILE: Pro.',
            `- MODEL RULE: Use the deepest available context to infer relationships, subtext, emotional tone, and honorific intent.`,
            `- MODEL RULE: Preserve nuanced pronouns, implied sarcasm, formality shifts, and character voice. Choose the most context-appropriate ${targetLangName} phrasing, not the most literal one.`,
            '- MODEL RULE: When dialogue is ambiguous, keep the scene coherent and prioritize consistent character speech patterns over isolated word-level accuracy.'
        ];
    }

    return [
        '- MODEL PROFILE: Balanced.',
        `- MODEL RULE: Keep the translation natural, concise, and faithful to context. Use consistent pronouns and tone across the page.`
    ];
}

export function toggleStoryMemory(enabled: boolean): void {
    globalState.enableStoryMemory = Boolean(enabled);
    safeSetLocalStorage('manga_enable_story_memory', globalState.enableStoryMemory);
    showToast(enabled ? 'Đã bật Bộ nhớ ngữ cảnh chương' : 'Đã tắt Bộ nhớ ngữ cảnh chương', 'info');
}

export function updateStoryMemoryBadge(): void {
    const badge = document.getElementById('story-memory-badge');
    if (badge) {
        const count = (globalState.chapterStoryMemory || []).length;
        badge.textContent = `${count} trang`;
    }
}

export function clearStoryMemory(): void {
    globalState.chapterStoryMemory = [];
    localStorage.removeItem('manga_chapter_story_memory');
    updateStoryMemoryBadge();
    showToast('Đã xóa bộ nhớ ngữ cảnh chương.', 'success');
}

export function recordPageToStoryMemory(pageIndex: number, blocks: MangaBlock[]): void {
    if (!blocks || !blocks.length || !globalState.enableStoryMemory) return;
    const translatedLines = blocks.map(b => `${b.original} -> ${b.translated}`).filter(Boolean);
    if (!translatedLines.length) return;

    const summary = {
        pageIndex: pageIndex + 1,
        dialogueCount: blocks.length,
        excerpt: translatedLines.slice(0, 4).join('; ')
    };

    if (!globalState.chapterStoryMemory) globalState.chapterStoryMemory = [];
    globalState.chapterStoryMemory = globalState.chapterStoryMemory.filter(m => m.pageIndex !== summary.pageIndex);
    globalState.chapterStoryMemory.push(summary);
    if (globalState.chapterStoryMemory.length > 10) {
        globalState.chapterStoryMemory.shift();
    }
    updateStoryMemoryBadge();
}

export function viewStoryMemoryModal(): void {
    const memories = globalState.chapterStoryMemory || [];
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

export function buildLorebookPromptContext(): string {
    const parts: string[] = [];

    if (globalState.characterDossier && globalState.characterDossier.length > 0) {
        const charLines = globalState.characterDossier.map(c => {
            let info = `${c.originalName || ''} -> ${c.translatedName || ''}`;
            if (c.gender) info += ` (${c.gender === 'male' ? 'Nam' : c.gender === 'female' ? 'Nữ' : 'Khác'})`;
            if (c.pronounSelf || c.pronounTarget) info += ` [Xưng hô: ${c.pronounSelf || 'tôi'} - ${c.pronounTarget || 'cậu'}]`;
            if (c.personality) info += ` - Tính cách: ${c.personality}`;
            if (c.notes) info += ` (${c.notes})`;
            return info;
        }).join('; ');
        parts.push(`- CHARACTER DOSSIER (STRICT NAMES & PRONOUNS): Enforce the following character names, gender, pronouns, and speech tone strictly across all pages: ${charLines}`);
    }

    if (globalState.lorebook && globalState.lorebook.length > 0) {
        const loreLines = globalState.lorebook.map(l => {
            let info = `${l.originalTerm || ''} -> ${l.translatedTerm || ''}`;
            if (l.category) info += ` [Thể loại: ${l.category}]`;
            if (l.note) info += ` (Ghi chú: ${l.note})`;
            return info;
        }).join('; ');
        parts.push(`- LOREBOOK & WORLD TERMINOLOGY: Strictly use these exact translations for world-building terms, skills, locations, and items: ${loreLines}`);
    }

    return parts.join('\n');
}
