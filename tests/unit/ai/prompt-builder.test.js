import { test, expect, assert } from 'vitest';
import '../../setup/browser-env.js';

import { globalState } from '../../../src/core/state.ts';
import { getTranslationGuidancePrompt } from '../../../src/features/ai/ai-service.ts';

test('AI Prompt Builder - Japanese to Vietnamese Scanlation Master Spec', () => {
    globalState.sourceLanguage = 'ja';
    globalState.targetLanguage = 'vi';
    globalState.comicUniverse = 'manga';

    const prompt = getTranslationGuidancePrompt();

    assert.ok(prompt.includes('JAPANESE TO VIETNAMESE') || prompt.includes('JAPANESE MANGA SCANLATION'));
    assert.ok(prompt.includes('XƯNG HÔ') || prompt.includes('PRONOUN') || prompt.includes('Watashi') || prompt.includes('Ore'));
    assert.ok(prompt.includes('SFX') || prompt.includes('TỪ TƯỢNG THANH'));
});

test('AI Prompt Builder - Chinese to Vietnamese Manhua Master Spec', () => {
    globalState.sourceLanguage = 'zh';
    globalState.targetLanguage = 'vi';
    globalState.comicUniverse = 'manhua';

    const prompt = getTranslationGuidancePrompt();

    assert.ok(prompt.includes('CHINESE TO VIETNAMESE') || prompt.includes('MANHUA'));
    assert.ok(prompt.includes('HÁN VIỆT') || prompt.includes('THÀNH NGỮ') || prompt.includes('Chengyu'));
    assert.ok(prompt.includes('CẢNH GIỚI') || prompt.includes('TU VI') || prompt.includes('Cultivation'));
});

test('AI Prompt Builder - 3-Tier Matrix (Universe x Genres x Tone Profile)', () => {
    globalState.comicUniverse = 'manhwa';
    globalState.comicGenres = ['action', 'fantasy', 'isekai'];
    globalState.comicTone = 'dark';
    globalState.sourceLanguage = 'ko';
    globalState.targetLanguage = 'vi';

    const prompt = getTranslationGuidancePrompt();

    assert.ok(prompt.includes('MANHWA') || prompt.includes('WEBTOON'));
    assert.ok(prompt.includes('ACTION') || prompt.includes('HÀNH ĐỘNG'));
    assert.ok(prompt.includes('FANTASY') || prompt.includes('ISEKAI'));
    assert.ok(prompt.includes('DARK') || prompt.includes('GRITTY') || prompt.includes('U TỐI'));
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
    assert.ok(prompt.includes('Excalibur') || prompt.includes('Thánh Kiếm Excalibur'));
    assert.ok(prompt.includes('Naruto') || prompt.includes('Sasuke'));
    assert.ok(prompt.includes('Thung Lũng Tận Cùng') || prompt.includes('STORY MEMORY') || prompt.includes('BỐI CẢNH'));
});
