import { test, expect } from 'vitest';
import '../../setup/browser-env.js';

import { globalState } from '../../../src/core/state.ts';
import { getTranslationGuidancePrompt } from '../../../src/features/ai/ai-service.ts';

test('AI Prompt Builder - Japanese to Vietnamese Scanlation Master Spec', () => {
    globalState.sourceLanguage = 'ja';
    globalState.targetLanguage = 'vi';
    globalState.comicUniverse = 'manga';

    const prompt = getTranslationGuidancePrompt();

    expect(prompt).toContain('PRIORITY ORDER');
    expect(prompt).toContain('SOURCE FIDELITY / NO HALLUCINATION');
    expect(prompt).toContain('NATURAL ≠ ALWAYS SLANGY');
    expect(prompt).toContain('JAPANESE TO VIETNAMESE');
    expect(prompt).toContain('Watashi');
    expect(prompt).toContain('SFX');
});

test('AI Prompt Builder - Priority Order and Override Rules', () => {
    globalState.sourceLanguage = 'ja';
    globalState.targetLanguage = 'vi';

    const prompt = getTranslationGuidancePrompt();

    expect(prompt).toContain('1. Preserve source meaning.');
    expect(prompt).toContain('2. Preserve speaker intent and emotional nuance.');
    expect(prompt).toContain('3. Preserve scene/context/character relationship.');
    expect(prompt).toContain('4. Produce natural Vietnamese.');
    expect(prompt).toContain('Higher-priority rules always override lower-priority stylistic preferences.');
    expect(prompt).toContain('Compactness must NEVER remove important meaning.');
});

test('AI Prompt Builder - Source Fidelity & Anti-Hallucination Guardrails', () => {
    globalState.sourceLanguage = 'ja';
    globalState.targetLanguage = 'vi';

    const prompt = getTranslationGuidancePrompt();

    expect(prompt).toContain('When the source is ambiguous, preserve the ambiguity unless the surrounding context strongly resolves it.');
    expect(prompt).toContain('Context chỉ được dùng để disambiguate khi có bằng chứng rõ ràng');
});

test('AI Prompt Builder - Chinese to Vietnamese Manhua Master Spec', () => {
    globalState.sourceLanguage = 'zh';
    globalState.targetLanguage = 'vi';
    globalState.comicUniverse = 'manhua';

    const prompt = getTranslationGuidancePrompt();

    expect(prompt).toContain('CHINESE TO VIETNAMESE');
    expect(prompt).toContain('HÁN VIỆT');
    expect(prompt).toContain('CẢNH GIỚI');
});

test('AI Prompt Builder - 3-Tier Matrix (Universe x Genres x Tone Profile)', () => {
    globalState.comicUniverse = 'manhwa';
    globalState.comicGenres = ['action', 'fantasy', 'isekai'];
    globalState.comicTone = 'dark';
    globalState.sourceLanguage = 'ko';
    globalState.targetLanguage = 'vi';

    const prompt = getTranslationGuidancePrompt();

    expect(prompt).toContain('MANHWA');
    expect(prompt).toContain('ACTION');
    expect(prompt).toContain('FANTASY');
    expect(prompt).toContain('DARK');
});

test('AI Prompt Builder - Lorebook, Character Dossier and Pronoun Matrix Injection', () => {
    globalState.lorebook = [
        { id: 'l1', originalTerm: 'Excalibur', translatedTerm: 'Thánh Kiếm Excalibur', category: 'weapon' },
        { id: 'l2', originalTerm: 'Konoha', translatedTerm: 'Làng Lá', category: 'location' }
    ];

    globalState.characterDossier = [
        { id: 'c1', originalName: 'Naruto', translatedName: 'Naruto', gender: 'male', personality: 'Nhiệt huyết' }
    ];

    globalState.pronounMatrix = JSON.stringify([
        { character1: 'Naruto', character2: 'Sasuke', addressSelf: 'Tớ', addressTarget: 'Cậu' }
    ]);
    globalState.chapterStoryMemory = [
        'Trang 1: Naruto gặp lại Sasuke tại Thung Lũng Tận Cùng.'
    ];

    const prompt = getTranslationGuidancePrompt();

    // Check if custom context elements are properly injected into the prompt
    expect(prompt).toContain('Excalibur');
    expect(prompt).toContain('Naruto');
});

