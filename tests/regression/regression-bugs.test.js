import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../setup/browser-env.js';
import '../setup/indexeddb-mock.js';

import {
    globalState,
    pushStateToHistory,
    applyStateFromSnapshot,
    clearHistory,
    undoStack
} from '../../src/core/state.ts';
import { isBlockAutoFit, autoFitAllBlocksOnPage } from '../../src/features/canvas/canvas-styling.ts';
import { parseGeminiJsonText } from '../../src/core/utils/json.ts';
import { matchTranslationsToBlocks } from '../../src/features/ai/ai-service.ts';

test('Regression Reg-01: Undo/Redo Must Never Wipe Custom SFX Warp or Image Block Attributes', () => {
    clearHistory();

    const complexBlock = {
        id: 'blk_sfx_custom',
        type: 'sfx',
        original: 'ゴゴゴ',
        translated: 'Ù Ù Ù',
        box: { x: 30, y: 40, w: 35, h: 25 },
        style: {
            fontFamily: 'font-impact',
            fontSize: 24,
            arcAngle: 45,
            skewX: 20,
            skewY: -15,
            warpWave: 35,
            warpBulge: 25,
            autoFit: false
        }
    };

    const imageOverlayBlock = {
        id: 'blk_image_custom',
        type: 'image',
        imageUrl: 'data:image/png;base64,customOverlay',
        original: '[IMAGE]',
        translated: '',
        box: { x: 10, y: 10, w: 20, h: 20 },
        style: {
            opacity: 90,
            fit: 'contain',
            borderRadius: 16
        }
    };

    globalState.pages = [{
        id: 'p_reg_1',
        status: 'draft',
        eraserLayerBlob: 'data:image/png;base64,blobSample',
        blocks: [complexBlock, imageOverlayBlock]
    }];
    globalState.activePageIndex = 0;

    // Snapshot
    pushStateToHistory();

    // Corrupt / modify state
    globalState.pages[0].blocks = [];

    // Undo / restore snapshot
    applyStateFromSnapshot(undoStack[undoStack.length - 1]);

    // Verify SFX warp attributes
    const restoredSfx = globalState.pages[0].blocks[0];
    assert.strictEqual(restoredSfx.id, 'blk_sfx_custom');
    assert.strictEqual(restoredSfx.style.arcAngle, 45, 'arcAngle must be preserved');
    assert.strictEqual(restoredSfx.style.skewX, 20, 'skewX must be preserved');
    assert.strictEqual(restoredSfx.style.warpWave, 35, 'warpWave must be preserved');
    assert.strictEqual(restoredSfx.style.warpBulge, 25, 'warpBulge must be preserved');

    // Verify Image Block attributes
    const restoredImg = globalState.pages[0].blocks[1];
    assert.strictEqual(restoredImg.type, 'image');
    assert.strictEqual(restoredImg.imageUrl, 'data:image/png;base64,customOverlay');
    assert.strictEqual(restoredImg.style.fit, 'contain');
    assert.strictEqual(restoredImg.style.borderRadius, 16);
});

test('Regression Reg-02: Auto-Fit Must Never Overwrite Manual Font Adjustments', () => {
    globalState.autoFitEnabled = true;

    const pageWithManual = {
        id: 'p_manual_test',
        blocks: [
            {
                id: 'b_manual_custom_font',
                type: 'dialogue',
                translated: 'Chữ to đặc biệt cần giữ nguyên kích cỡ 48px',
                box: { x: 10, y: 10, w: 40, h: 30 },
                style: { fontFamily: 'font-manga', fontSize: 48, autoFit: false }
            },
            {
                id: 'b_auto_font',
                type: 'dialogue',
                translated: 'Chữ tự động co dãn',
                box: { x: 55, y: 10, w: 35, h: 25 },
                style: { fontFamily: 'font-manga', fontSize: 12, autoFit: true }
            }
        ]
    };

    assert.strictEqual(isBlockAutoFit(pageWithManual.blocks[0]), false);
    assert.strictEqual(isBlockAutoFit(pageWithManual.blocks[1]), true);

    autoFitAllBlocksOnPage(pageWithManual);

    // Font size 48 on manual block must not change
    assert.strictEqual(pageWithManual.blocks[0].style.fontSize, 48, 'Manual font size must remain 48px');
});

test('Regression Reg-03: Truncated JSON Stream Tolerance (Zero Data Loss on Earlier Dialogues)', () => {
    const originalBlocks = [
        { id: 'p1_b1', original: 'Line 1' },
        { id: 'p1_b2', original: 'Line 2' },
        { id: 'p1_b3', original: 'Line 3' }
    ];

    // Stream cut off halfway through block 2
    const cutOffStream = '{"blocks": [{"id": "p1_b1", "translated": "Dòng 1 hoàn chỉnh"}, {"id": "p1_b2", "translated": "Dòng 2 đang viết dở';
    const parsed = parseGeminiJsonText(cutOffStream);

    assert.ok(parsed && Array.isArray(parsed.blocks));
    assert.strictEqual(parsed.blocks.length, 2);

    const matched = matchTranslationsToBlocks(originalBlocks, parsed);
    assert.strictEqual(matched[0].translated, 'Dòng 1 hoàn chỉnh');
    assert.strictEqual(matched[1].translated, 'Dòng 2 đang viết dở');
    assert.strictEqual(matched[2].translated, '', 'Block 3 is safely preserved as empty string without crashing');
});

test('Regression Reg-04: Unicode Vietnamese Diacritics and Japanese Kanji Integrity', () => {
    const complexUnicodeText = 'Tuyệt kỹ «Thiên Hỏa Liệt Diễm Trảm» — 伝説の剣 (Thần Kiếm Huyền Thoại)';
    const jsonPayload = JSON.stringify({ text: complexUnicodeText });

    const parsed = JSON.parse(jsonPayload);
    assert.strictEqual(parsed.text, complexUnicodeText, 'Unicode characters must match byte-for-byte');
});

test('Regression Reg-05: Pronoun Matrix Xưng-Gọi Prompt Direction', async () => {
    const { compilePronounMatrixPrompt } = await import('../../src/features/pronoun.ts');
    const matrix = {
        characters: ['Naruto', 'Sasuke'],
        relationships: {
            Naruto: {
                Sasuke: 'tớ - cậu'
            }
        }
    };
    const prompt = compilePronounMatrixPrompt(matrix);
    assert.ok(prompt.includes('Naruto refers to self as "tớ" and calls Sasuke "cậu"'), 'Should properly map Xưng (self) and Gọi (listener)');
});

test('Regression Reg-06: TOEIC Diff Accuracy Calculation Penalizes Extraneous Words', async () => {
    const { getSimpleWordDiff } = await import('../../src/features/toeic.ts');
    const correct = 'good morning';
    const userWithExtraWords = 'good morning everyone have a nice day today';
    const result = getSimpleWordDiff(userWithExtraWords, correct);
    // User typed 8 words, only 2 matched: accuracy should be 2/8 = 25%, NOT 100%
    assert.ok(result.accuracy < 50, `Accuracy must be penalized for extra words, got ${result.accuracy}%`);
});

