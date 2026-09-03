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

test('AI Pipeline - Translates All Blocks Directly Without Cache Bypassing to Preserve Context', async () => {
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
                                            { id: 'b1', translated: "Ngươi là ai?" },
                                            { id: 'b2', translated: "Đứng lại!" }
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
        const blocksToTranslate = [
            { id: 'b1', original: 'お前は誰だ？', translated: '' },
            { id: 'b2', original: '待て！', translated: '' }
        ];

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

        // Verify both blocks were sent to AI model to preserve dialogue context
        assert.ok(requestedPayload.includes('お前は誰だ？'));
        assert.ok(requestedPayload.includes('待て！'));
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].translated, "Ngươi là ai?");
        assert.strictEqual(result[1].translated, "Đứng lại!");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('AI Pipeline - Bypasses Stale Cache To Preserve Full Conversational Context', async () => {
    await clearTranslationCache();

    // Pre-populate cache with old data
    setCachedTranslation("逃げるぞ！", "Chạy thôi!", 'vi');

    const blocksToTranslate = [
        { id: 'b1', original: '逃げるぞ！', translated: '' },
        { id: 'b2', original: '新しい文章', translated: '' }
    ];

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
                                            { id: 'b1', translated: 'Mau chạy thôi!' },
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

        // Verify BOTH blocks are sent to AI together (not split/filtered by cache)
        assert.ok(requestedPayload.includes('逃げるぞ！'), "Must include all blocks for full dialogue context");
        assert.ok(requestedPayload.includes('新しい文章'), "Must include all blocks for full dialogue context");

        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].id, 'b1');
        assert.strictEqual(result[0].translated, "Mau chạy thôi!");
        assert.strictEqual(result[1].id, 'b2');
        assert.strictEqual(result[1].translated, "Câu văn mới");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('AI Pipeline - Chapter Chunk Translation Sends All Page Dialogues Together', async () => {
    const chunkBlocks = [
        { id: 'p1_b1', pageIndex: 0, original: 'はい！', translated: '' },
        { id: 'p1_b2', pageIndex: 0, original: 'いいえ', translated: '' },
        { id: 'p2_b1', pageIndex: 1, original: 'はい！', translated: '' }
    ];

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
                                            { id: 'p1_b1', translated: "Vâng!" },
                                            { id: 'p1_b2', translated: "Không" },
                                            { id: 'p2_b1', translated: "Vâng ạ!" }
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
        const result = await executeChapterChunkTranslationStep({
            chunkBlocks,
            translationModel: 'gemini-1.5-flash',
            targetLangName: 'Vietnamese',
            prevChunkContext: '',
            glossaryNames: '',
            keyToUse: 'dummy_key',
            isOpenAiFormat: false,
            endpoint: 'https://generativelanguage.googleapis.com',
            requestHeaders: {},
            contextOptions: { targetLanguage: 'vi' }
        });

        // Verify chapter narrative sends all dialogues together
        assert.ok(requestedPayload.includes('はい！'));
        assert.ok(requestedPayload.includes('いいえ'));
        assert.strictEqual(result.length, 3);
        assert.strictEqual(result[0].translated, "Vâng!");
        assert.strictEqual(result[1].translated, "Không");
        assert.strictEqual(result[2].translated, "Vâng ạ!");
    } finally {
        globalThis.fetch = originalFetch;
    }
});
