import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import { matchTranslationsToBlocks } from '../../../src/features/ai/ai-service.ts';

test('AI Matching Engine - 5-Layer Bulletproof Matching', () => {
    const inputBlocks = [
        { id: 'page1_blk_1', original: 'おはよう' },
        { id: 'page1_blk_2', original: '元気ですか？' },
        { id: 'page1_blk_3', original: 'うん、元気！' },
        { id: 'page1_blk_4', original: 'また明日ね' },
        { id: 'page1_blk_5', original: 'バイバイ' }
    ];

    const mockAiResponse = {
        blocks: [
            // Layer 1 & 2: Case-insensitive match
            { id: 'PAGE1_BLK_1', translated: 'Chào buổi sáng' },
            // Layer 3: Suffix / Numeric ID match (e.g. blk_2 or 2)
            { id: 'blk_2', translated: 'Bạn khỏe không?' },
            // Layer 4: Original text content match
            { original: 'うん、元気！', translated: 'Ừ, mình khỏe!' },
            // Layer 5: Positional order fallback
            { translated: 'Hẹn mai gặp lại nhé' },
            { translated: 'Tạm biệt!' }
        ]
    };

    const resolved = matchTranslationsToBlocks(inputBlocks, mockAiResponse);

    assert.strictEqual(resolved.length, 5);
    assert.strictEqual(resolved[0].translated, 'Chào buổi sáng', 'Layer 1/2 Match');
    assert.strictEqual(resolved[1].translated, 'Bạn khỏe không?', 'Layer 3 Suffix Match');
    assert.strictEqual(resolved[2].translated, 'Ừ, mình khỏe!', 'Layer 4 Text Match');
    assert.strictEqual(resolved[3].translated, 'Hẹn mai gặp lại nhé', 'Layer 5 Position Match 1');
    assert.strictEqual(resolved[4].translated, 'Tạm biệt!', 'Layer 5 Position Match 2');
});

test('AI Matching Engine - Missing & Extra AI Blocks Handling', () => {
    const inputBlocks = [
        { id: 'b1', original: 'Hello' },
        { id: 'b2', original: 'World' },
        { id: 'b3', original: 'Extra question' }
    ];

    // AI returned only 2 translations
    const partialResponse = {
        blocks: [
            { id: 'b1', translated: 'Xin chào' },
            { id: 'b2', translated: 'Thế giới' }
        ]
    };

    const resolved = matchTranslationsToBlocks(inputBlocks, partialResponse);
    assert.strictEqual(resolved.length, 3);
    assert.strictEqual(resolved[0].translated, 'Xin chào');
    assert.strictEqual(resolved[1].translated, 'Thế giới');
    assert.strictEqual(resolved[2].translated, '', 'Missing 3rd block should gracefully remain empty');
});
