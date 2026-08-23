import { test } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import {
    executeTextTranslationStep,
    executeChapterChunkTranslationStep
} from '../../../src/features/ai/translation-pipeline.ts';
import {
    clearTranslationCache,
    setCachedTranslation
} from '../../../src/features/ai/translation-cache.ts';

test('AI Pipeline Cache - 100% Cache HIT Bypasses API Request Completely', async () => {
    await clearTranslationCache();

    // Pre-populate cache
    setCachedTranslation("お前は誰だ？", "Ngươi là ai?", 'vi');
    setCachedTranslation("待て！", "Đứng lại!", 'vi');

    const blocksToTranslate = [
        { id: 'b1', original: 'お前は誰だ？', translated: '' },
        { id: 'b2', original: '待て！', translated: '' }
    ];

    let apiWasCalled = false;
    const mockEndpoint = 'http://invalid-endpoint-that-should-never-be-called.example.com';

    const result = await executeTextTranslationStep({
        blocksToTranslate,
        translationModel: 'gemini-1.5-flash',
        targetLangName: 'Vietnamese',
        prevPageContext: '',
        glossaryNames: '',
        keyToUse: 'dummy_key',
        isOpenAiFormat: false,
        endpoint: mockEndpoint,
        requestHeaders: {},
        contextOptions: { targetLanguage: 'vi' }
    });

    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].translated, "Ngươi là ai?");
    assert.strictEqual(result[1].translated, "Đứng lại!");
});

test('AI Pipeline Cache - Partial Cache HIT Only Requests Uncached Blocks and Merges Result', async () => {
    await clearTranslationCache();

    // Cache contains b1
    setCachedTranslation("逃げるぞ！", "Chạy thôi!", 'vi');

    const blocksToTranslate = [
        { id: 'b1', original: '逃げるぞ！', translated: '' },
        { id: 'b2', original: '新しい文章', translated: '' } // Not in cache
    ];

    // Mock global fetch for uncached blocks
    const originalFetch = globalThis.fetch;
    let requestedPayload = '';

    globalThis.fetch = async (url, options) => {
        requestedPayload = String(options?.body || '');
        return {
            ok: true,
            status: 200,
            json: async () => ({
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify({
                                        blocks: [
                                            { id: 'b2', translated: 'Câu văn mới' }
                                        ]
                                    })
                                }
                            ]
                        }
                    }
                ]
            })
        };
    };

    try {
        const result = await executeTextTranslationStep({
            blocksToTranslate,
            translationModel: 'gemini-1.5-flash',
            targetLangName: 'Vietnamese',
            prevPageContext: '',
            glossaryNames: '',
            keyToUse: 'dummy_key',
            isOpenAiFormat: false,
            endpoint: 'https://generativelanguage.googleapis.com',
            requestHeaders: {},
            contextOptions: { targetLanguage: 'vi' }
        });

        // 1. Verify prompt payload only sent uncached block b2
        assert.ok(requestedPayload.includes('新しい文章'), "Payload must include uncached block");
        assert.strictEqual(requestedPayload.includes('逃げるぞ！'), false, "Payload must NOT include cached block b1");

        // 2. Verify merged result
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].id, 'b1');
        assert.strictEqual(result[0].translated, "Chạy thôi!");
        assert.strictEqual(result[1].id, 'b2');
        assert.strictEqual(result[1].translated, "Câu văn mới");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('AI Pipeline Cache - Chapter Chunk Cache Reuse Across Multiple Pages', async () => {
    await clearTranslationCache();

    setCachedTranslation("はい！", "Vâng!", 'vi');
    setCachedTranslation("いいえ", "Không", 'vi');

    const chunkBlocks = [
        { id: 'p1_b1', pageIndex: 0, original: 'はい！', translated: '' },
        { id: 'p1_b2', pageIndex: 0, original: 'いいえ', translated: '' },
        { id: 'p2_b1', pageIndex: 1, original: 'はい！', translated: '' }
    ];

    const result = await executeChapterChunkTranslationStep({
        chunkBlocks,
        translationModel: 'gemini-1.5-flash',
        targetLangName: 'Vietnamese',
        prevChunkContext: '',
        glossaryNames: '',
        keyToUse: 'dummy_key',
        isOpenAiFormat: false,
        endpoint: 'http://invalid-endpoint.example.com',
        requestHeaders: {},
        contextOptions: { targetLanguage: 'vi' }
    });

    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].translated, "Vâng!");
    assert.strictEqual(result[1].translated, "Không");
    assert.strictEqual(result[2].translated, "Vâng!");
});
