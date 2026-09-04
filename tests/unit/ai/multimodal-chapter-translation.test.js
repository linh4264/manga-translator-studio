import { test } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import {
    generateContextThumbnailBase64
} from '../../../src/features/ai/ai-client.ts';
import {
    executeChapterChunkTranslationStep,
    executeChapterTranslationStep,
    executeTextTranslationStep,
    formatBlockPayloadForAi
} from '../../../src/features/ai/translation-pipeline.ts';

test('Multimodal AI - generateContextThumbnailBase64 handles valid and edge cases', async () => {
    // Edge case: undefined/null page
    const nullResult = await generateContextThumbnailBase64(undefined);
    assert.strictEqual(nullResult, null, 'Should return null for undefined page');

    // Blob source fallback
    const fakeBlob = new Blob(['mock-binary-image-data'], { type: 'image/jpeg' });
    const mockPage = {
        id: 'p1',
        name: '001.jpg',
        width: 1000,
        height: 1400,
        status: 'draft',
        blocks: [],
        file: fakeBlob,
        originalFile: null
    };

    const b64 = await generateContextThumbnailBase64(mockPage, 900, 0.6);
    assert.ok(b64, 'Should generate base64 string for page with file');
    assert.ok(typeof b64 === 'string', 'Base64 must be a string');
    assert.ok(!b64.startsWith('data:'), 'Should strip data URL prefix for clean payload');
});

test('Multimodal Chapter Translation - Gemini Interleaves Images and Text Per Page in 1 Single Request', async () => {
    const originalFetch = globalThis.fetch;
    let interceptedRequestBody = null;

    globalThis.fetch = async (url, options) => {
        interceptedRequestBody = JSON.parse(String(options?.body || '{}'));
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
                                            { id: 'p1_b1', translated: 'Chào cậu!' },
                                            { id: 'p1_b2', translated: 'Hôm nay trời đẹp thật đấy.' },
                                            { id: 'p2_b1', translated: 'Đi thôi nào.' }
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
        const chunkBlocks = [
            { id: 'p1_b1', original: 'Hello!', pageIndex: 0 },
            { id: 'p1_b2', original: 'Nice weather today.', pageIndex: 0 },
            { id: 'p2_b1', original: "Let's go.", pageIndex: 1 }
        ];

        const pageImagesMap = new Map();
        pageImagesMap.set(0, 'MOCK_BASE64_IMAGE_PAGE_1');
        pageImagesMap.set(1, 'MOCK_BASE64_IMAGE_PAGE_2');

        const translated = await executeChapterChunkTranslationStep({
            chunkBlocks,
            translationModel: 'gemini-3.8-flash',
            targetLangName: 'Vietnamese',
            glossaryNames: '',
            keyToUse: 'test-key',
            isOpenAiFormat: false,
            endpoint: 'https://generativelanguage.googleapis.com/v1beta',
            requestHeaders: { 'Content-Type': 'application/json' },
            pageImagesMap
        });

        assert.strictEqual(translated.length, 3, 'All 3 blocks must be translated');
        assert.strictEqual(translated[0].translated, 'Chào cậu!');
        assert.strictEqual(translated[1].translated, 'Hôm nay trời đẹp thật đấy.');
        assert.strictEqual(translated[2].translated, 'Đi thôi nào.');

        assert.ok(interceptedRequestBody, 'Fetch request body must be captured');
        const contents = interceptedRequestBody.contents;
        assert.ok(Array.isArray(contents) && contents.length === 1, 'Should have 1 contents item');
        const parts = contents[0].parts;
        assert.ok(Array.isArray(parts) && parts.length > 0, 'Should have parts array');

        // Verify interleaved image parts
        const inlineDataParts = parts.filter(p => p.inlineData);
        assert.strictEqual(inlineDataParts.length, 2, 'Must contain 2 image inlineData parts for Page 1 and Page 2');
        assert.strictEqual(inlineDataParts[0].inlineData.data, 'MOCK_BASE64_IMAGE_PAGE_1');
        assert.strictEqual(inlineDataParts[0].inlineData.mimeType, 'image/jpeg');
        assert.strictEqual(inlineDataParts[1].inlineData.data, 'MOCK_BASE64_IMAGE_PAGE_2');

        // Verify system instruction contains multimodal visual context guidance
        const sysParts = interceptedRequestBody.systemInstruction?.parts || [];
        const sysText = sysParts.map(p => p.text).join(' ');
        assert.ok(sysText.includes('MULTIMODAL VISUAL CONTEXT'), 'System prompt must include multimodal visual guidance');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('Multimodal Chapter Translation - OpenAI format interleaves images and text', async () => {
    const originalFetch = globalThis.fetch;
    let interceptedRequestBody = null;

    globalThis.fetch = async (url, options) => {
        interceptedRequestBody = JSON.parse(String(options?.body || '{}'));
        return {
            ok: true,
            status: 200,
            json: async () => ({
                choices: [
                    {
                        message: {
                            content: JSON.stringify({
                                blocks: [
                                    { id: 'p1_b1', translated: 'Em chào anh!' }
                                ]
                            })
                        }
                    }
                ]
            })
        };
    };

    try {
        const chunkBlocks = [
            { id: 'p1_b1', original: 'Good morning, Senpai!', pageIndex: 0 }
        ];

        const pageImagesMap = new Map();
        pageImagesMap.set(0, 'MOCK_OPENAI_IMAGE_B64');

        const translated = await executeChapterChunkTranslationStep({
            chunkBlocks,
            translationModel: 'gpt-4o',
            targetLangName: 'Vietnamese',
            glossaryNames: '',
            keyToUse: 'test-openai-key',
            isOpenAiFormat: true,
            endpoint: 'https://api.openai.com/v1',
            requestHeaders: { 'Content-Type': 'application/json' },
            pageImagesMap
        });

        assert.strictEqual(translated.length, 1);
        assert.strictEqual(translated[0].translated, 'Em chào anh!');

        const userMsg = interceptedRequestBody.messages.find(m => m.role === 'user');
        assert.ok(userMsg, 'Must have user message');
        assert.ok(Array.isArray(userMsg.content), 'User message content must be multimodal array');

        const imgParts = userMsg.content.filter(p => p.type === 'image_url');
        assert.strictEqual(imgParts.length, 1, 'Must have 1 image_url part');
        assert.strictEqual(imgParts[0].image_url.url, 'data:image/jpeg;base64,MOCK_OPENAI_IMAGE_B64');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('Multimodal Chapter Translation - Adaptive Chunking handles large chapters safely', async () => {
    const originalFetch = globalThis.fetch;
    let requestCount = 0;

    globalThis.fetch = async (url, options) => {
        requestCount++;
        const parsed = JSON.parse(String(options?.body || '{}'));
        // Return dummy response with all requested block IDs
        const parts = parsed.contents?.[0]?.parts || [];
        const foundBlocks = [];
        parts.forEach(p => {
            if (p.text && p.text.includes('p')) {
                const regex = /"id":\s*"(p\d+_b\d+)"/g;
                let match;
                while ((match = regex.exec(p.text)) !== null) {
                    const id = match[1];
                    foundBlocks.push({ id, translated: `Dịch: ${id}` });
                }
            }
        });

        return {
            ok: true,
            status: 200,
            json: async () => ({
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify({ blocks: foundBlocks })
                                }
                            ]
                        }
                    }
                ]
            })
        };
    };

    try {
        // Case 1: Chapter with 45 blocks (~1,400 tokens <= 2200 budget) -> EXACTLY 1 Request (1 RPD)!
        const smallChapterBlocks = [];
        for (let p = 0; p < 15; p++) {
            for (let b = 0; b < 3; b++) {
                smallChapterBlocks.push({
                    id: `p${p + 1}_b${b + 1}`,
                    original: `Speech bubble ${b + 1} on page ${p + 1}`,
                    pageIndex: p
                });
            }
        }
        assert.strictEqual(smallChapterBlocks.length, 45);

        requestCount = 0;
        const smallRes = await executeChapterTranslationStep({
            allChapterBlocks: smallChapterBlocks,
            translationModel: 'gemini-3.8-flash',
            targetLangName: 'Vietnamese',
            glossaryNames: '',
            keyToUse: 'key',
            isOpenAiFormat: false,
            endpoint: 'https://generativelanguage.googleapis.com/v1beta',
            requestHeaders: {},
            pageImagesMap: new Map()
        });

        assert.strictEqual(smallRes.length, 45);
        assert.strictEqual(requestCount, 1, 'Chap vừa phải dưới ngân sách token phải chạy trong ĐÚNG 1 REQUEST (1 RPD)!');

        // Case 2: Dense chapter with 250 blocks -> safely splits across multiple requests
        const denseChapterBlocks = [];
        for (let p = 0; p < 25; p++) {
            for (let b = 0; b < 10; b++) {
                denseChapterBlocks.push({
                    id: `p${p + 1}_b${b + 1}`,
                    original: `Dense bubble ${b + 1} on page ${p + 1}`,
                    pageIndex: p
                });
            }
        }
        assert.strictEqual(denseChapterBlocks.length, 250);

        requestCount = 0;
        const denseRes = await executeChapterTranslationStep({
            allChapterBlocks: denseChapterBlocks,
            translationModel: 'gemini-3.8-flash',
            targetLangName: 'Vietnamese',
            glossaryNames: '',
            keyToUse: 'key',
            isOpenAiFormat: false,
            endpoint: 'https://generativelanguage.googleapis.com/v1beta',
            requestHeaders: {},
            pageImagesMap: new Map()
        });

        assert.strictEqual(denseRes.length, 250);
        assert.strictEqual(requestCount, 2, '250 câu trên Flash hiện đại chia đúng 2 mẻ để tiết kiệm RPD (tối đa 2 RPD/chap)!');
    } finally {
        globalThis.fetch = originalFetch;
    }
}, 20000);

test('Multimodal AI - formatBlockPayloadForAi calculates spatial location and preserves bubble type', () => {
    // Top-Right bubble (like 'Suki' in user uploaded image)
    const topRt = formatBlockPayloadForAi({
        id: 'p1_b1',
        original: '好き',
        type: 'thought',
        box: [800, 100]
    });
    assert.strictEqual(topRt.id, 'p1_b1');
    assert.strictEqual(topRt.original, '好き');
    assert.strictEqual(topRt.type, 'thought');
    assert.strictEqual(topRt.location, 'Top-Right');

    // Bottom-Left bubble (like 'Sakkino' in classroom panel)
    const btmLt = formatBlockPayloadForAi({
        id: 'p1_b3',
        original: 'さっきの',
        type: 'thought',
        box: { x: 200, y: 800, w: 100, h: 100 }
    });
    assert.strictEqual(btmLt.id, 'p1_b3');
    assert.strictEqual(btmLt.type, 'thought');
    assert.strictEqual(btmLt.location, 'Bottom-Left');
});

test('Multimodal AI - executeTextTranslationStep attaches page image when rawBase64 is provided', async () => {
    const originalFetch = globalThis.fetch;
    let interceptedBody = null;

    globalThis.fetch = async (url, options) => {
        interceptedBody = JSON.parse(String(options?.body || '{}'));
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
                                            { id: 'p1_b1', translated: 'Tớ thích cậu...' }
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
        const res = await executeTextTranslationStep({
            blocksToTranslate: [
                { id: 'p1_b1', original: '好き', type: 'thought', box: [800, 100] }
            ],
            translationModel: 'gemini-3.6-flash',
            targetLangName: 'Vietnamese',
            prevPageContext: '',
            glossaryNames: '',
            keyToUse: 'key',
            isOpenAiFormat: false,
            endpoint: 'https://generativelanguage.googleapis.com/v1beta',
            requestHeaders: {},
            rawBase64: 'MOCK_PAGE_IMAGE_BASE64',
            mimeType: 'image/jpeg'
        });

        assert.strictEqual(res.length, 1);
        assert.strictEqual(res[0].translated, 'Tớ thích cậu...');

        // Verify that Gemini parts included the image!
        const parts = interceptedBody.contents[0].parts;
        const inlineImg = parts.find(p => p.inlineData);
        assert.ok(inlineImg, 'Must have inlineData with attached image');
        assert.strictEqual(inlineImg.inlineData.data, 'MOCK_PAGE_IMAGE_BASE64');

        // Verify spatial grounding and type are present in user prompt
        const promptPart = parts.find(p => p.text && p.text.includes('Dialogue blocks to translate'));
        assert.ok(promptPart, 'Must include dialogue blocks JSON');
        assert.ok(promptPart.text.includes('Top-Right'), 'Must specify Top-Right location for spatial grounding');
        assert.ok(promptPart.text.includes('thought'), 'Must specify thought bubble type');
    } finally {
        globalThis.fetch = originalFetch;
    }
});
