import { test } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import {
    estimateTextTokens,
    estimateImageTokens,
    estimateBlockOutputTokens,
    estimateChapterChunkTokens,
    partitionBlocksByTokenBudget,
    getSafeTokenBudgetForModel
} from '../../../src/features/ai/token-estimator.ts';

test('Token Estimator - text and image tokens calculation', () => {
    // Empty text
    assert.strictEqual(estimateTextTokens(''), 0);

    // English text
    const engTokens = estimateTextTokens('Hello, how are you today?');
    assert.ok(engTokens > 0 && engTokens < 15, `Expected 5-15 tokens, got ${engTokens}`);

    // Japanese/CJK text
    const jpTokens = estimateTextTokens('お前は誰だ？ここで何をしている？');
    assert.ok(jpTokens >= 15, `Expected >= 15 tokens for Japanese text, got ${jpTokens}`);

    // Image tokens
    assert.strictEqual(estimateImageTokens(0), 0);
    assert.strictEqual(estimateImageTokens(1), 450);
    assert.strictEqual(estimateImageTokens(10), 4500);
});

test('Token Estimator - estimateBlockOutputTokens accounts for JSON overhead and Vietnamese expansion', () => {
    const shortBlock = { id: 'p1_b1', original: 'Hi!' };
    const shortTokens = estimateBlockOutputTokens(shortBlock);
    assert.ok(shortTokens >= 25, `Short block should be at least 25 tokens with Vietnamese expansion, got ${shortTokens}`);

    const longBlock = {
        id: 'p1_b2',
        original: 'Actually, according to the secret treaty signed ten years ago in the imperial capital, none of this was supposed to happen.'
    };
    const longTokens = estimateBlockOutputTokens(longBlock);
    assert.ok(longTokens > shortTokens, 'Longer monologue block must have higher predicted output tokens');
});

test('Token Estimator - getSafeTokenBudgetForModel identifies Lite vs Standard models', () => {
    assert.strictEqual(getSafeTokenBudgetForModel('gemini-3.5-flash-lite'), 2200, 'Flash Lite must have ~2200 token budget');
    assert.strictEqual(getSafeTokenBudgetForModel('3.6 flash lite'), 2200);
    assert.strictEqual(getSafeTokenBudgetForModel('gemini-1.5-flash-8b'), 2200);
    assert.strictEqual(getSafeTokenBudgetForModel('gemini-3.8-flash'), 6500, 'Standard Flash models get generous 6500 budget for 2-request chapters');
    assert.strictEqual(getSafeTokenBudgetForModel('gemini-3.6-flash'), 6500);
});

test('Token Estimator - partitionBlocksByTokenBudget clusters blocks safely within token limits', () => {
    // Generate 15 pages with 3 short blocks each (~45 blocks total)
    // Should fit under token budget -> exactly 1 chunk!
    const smallChapterBlocks = [];
    for (let p = 0; p < 15; p++) {
        for (let b = 0; b < 3; b++) {
            smallChapterBlocks.push({
                id: `p${p + 1}_b${b + 1}`,
                original: `Line ${b + 1}`,
                pageIndex: p
            });
        }
    }
    const smallChunks = partitionBlocksByTokenBudget(smallChapterBlocks, '3.6 flash lite');
    assert.strictEqual(smallChunks.length, 1, 'Small chapter with 45 short dialogues should fit in 1 single chunk');

    // Generate dense 43-page chapter with 258 blocks (like user scenario)
    const denseChapterBlocks = [];
    for (let p = 0; p < 43; p++) {
        for (let b = 0; b < 6; b++) {
            denseChapterBlocks.push({
                id: `p${p + 1}_b${b + 1}`,
                original: `This is a dialogue line with critical information on scene ${p + 1} item ${b + 1}.`,
                pageIndex: p
            });
        }
    }
    // Using Standard 3.6 Flash budget (8000 tokens)
    // Must result in at most 2 chunks (preserving 2 RPD for 43-page chapter!)
    const standardChunks = partitionBlocksByTokenBudget(denseChapterBlocks, 'gemini-3.6-flash');
    assert.ok(standardChunks.length <= 2, `43-page chapter with 258 blocks on 3.6 Flash must take <= 2 requests (2 RPD), got ${standardChunks.length}`);

    // Flash Lite splits into more chunks safely
    const liteChunks = partitionBlocksByTokenBudget(denseChapterBlocks, '3.6 flash lite');
    assert.ok(liteChunks.length >= 3, `Dense chapter with Flash Lite should be safely split into 3+ chunks, got ${liteChunks.length}`);
});

test('Token Estimator - estimateChapterChunkTokens returns realistic duration and token counts', () => {
    const blocks = [
        { id: 'p1_b1', original: 'Stop right there!', pageIndex: 0 },
        { id: 'p1_b2', original: 'Who gave you permission to enter?', pageIndex: 0 }
    ];
    const metrics = estimateChapterChunkTokens(blocks, 1);
    assert.ok(metrics.inputTokens > 450, 'Input tokens must include image tokens');
    assert.ok(metrics.predictedOutputTokens > 30, 'Output tokens must include JSON overhead');
    assert.ok(metrics.estimatedDurationSec >= 5, 'Duration should be at least 5s');
});
