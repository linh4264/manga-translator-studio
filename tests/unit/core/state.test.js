import test from 'node:test';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import '../../setup/indexeddb-mock.js';

import {
    globalState,
    initializeStateFromStorage,
    pushStateToHistory,
    undoStack,
    redoStack,
    clearHistory,
    applyStateFromSnapshot,
    markPageAutoFitDirty
} from '../../../public/src/core/state.js';
import { DEFAULT_MODEL, DEFAULT_PIPELINE_MODE, DEFAULT_OCR_MODEL, DEFAULT_TRANSLATION_MODEL } from '../../../public/src/config/constants.js';

test('Core State - Initialization and Defaults', () => {
    assert.strictEqual(globalState.selectedModel, DEFAULT_MODEL, 'Default model should match constant');
    assert.strictEqual(globalState.translationPipelineMode, DEFAULT_PIPELINE_MODE, 'Pipeline mode should match default');
    assert.strictEqual(globalState.ocrModel, DEFAULT_OCR_MODEL, 'OCR model should match default');
    assert.strictEqual(globalState.translationModel, DEFAULT_TRANSLATION_MODEL, 'Translation model should match default');
    assert.strictEqual(typeof globalState.globalStyle, 'object', 'globalStyle must be an object');
    assert.strictEqual(typeof globalState.globalStyle.fontFamily, 'string');
});

test('Core State - Storage Synchronization', () => {
    localStorage.setItem('gemini_manga_ai_provider', 'claude');
    localStorage.setItem('gemini_manga_source_lang', 'ja');
    localStorage.setItem('gemini_manga_target_lang', 'vi');
    localStorage.setItem('manga_comic_universe', 'manhwa');
    localStorage.setItem('gemini_manga_autofit_enabled', 'false');

    initializeStateFromStorage();

    assert.strictEqual(globalState.aiProvider, 'claude');
    assert.strictEqual(globalState.sourceLanguage, 'ja');
    assert.strictEqual(globalState.targetLanguage, 'vi');
    assert.strictEqual(globalState.comicUniverse, 'manhwa');
    assert.strictEqual(globalState.autoFitEnabled, false);
});

test('Core State - Undo/Redo Invariant Test (Complete Data Preservation)', () => {
    clearHistory();
    assert.strictEqual(undoStack.length, 0);
    assert.strictEqual(redoStack.length, 0);

    // Setup full-featured page with dialogue, sfx warp, and image overlay blocks
    const fullFeaturedPage = {
        id: 'p_alpha',
        name: 'Chapter 1 Page 1',
        status: 'translated',
        autoFitRevision: 5,
        eraserLayerBlob: 'data:image/png;base64,eraserBlobData',
        blocks: [
            {
                id: 'blk_dialogue_1',
                type: 'dialogue',
                original: 'こんにちは！',
                translated: 'Xin chào bạn!',
                box: { x: 20, y: 15, w: 30, h: 25 },
                style: {
                    fontFamily: 'font-manga',
                    fontSize: 18,
                    textColor: '#112233',
                    bgColor: '#ffffff',
                    bgOpacity: 90,
                    bold: true,
                    align: 'center',
                    vertical: false,
                    strokeColor: '#000000',
                    strokeWidth: 2,
                    shadowColor: '#333333',
                    shadowBlur: 4,
                    padding: 6,
                    rotate: 5,
                    maskShape: 'bubble-fit',
                    maskSize: 'full',
                    autoFit: false
                }
            },
            {
                id: 'blk_sfx_2',
                type: 'sfx',
                original: 'ドカーン',
                translated: 'BÙM!!',
                box: { x: 60, y: 50, w: 35, h: 20 },
                style: {
                    fontFamily: 'font-impact',
                    fontSize: 28,
                    textColor: '#ff0000',
                    bold: true,
                    strokeWidth: 5,
                    strokeColor: '#ffffff',
                    arcAngle: 35,
                    skewX: 15,
                    skewY: -10,
                    warpWave: 25,
                    warpBulge: 15
                }
            },
            {
                id: 'blk_image_3',
                type: 'image',
                imageUrl: 'data:image/png;base64,stickerImageBase64',
                original: '[IMAGE]',
                translated: '',
                box: { x: 10, y: 70, w: 20, h: 20 },
                style: {
                    opacity: 85,
                    fit: 'contain',
                    borderRadius: 12,
                    rotate: -15
                }
            }
        ]
    };

    globalState.pages = [JSON.parse(JSON.stringify(fullFeaturedPage))];
    globalState.activePageIndex = 0;
    globalState.selectedBlockId = 'blk_dialogue_1';
    globalState.selectedBlockIds = ['blk_dialogue_1', 'blk_sfx_2'];

    // 1. Push state to history
    pushStateToHistory();
    assert.strictEqual(undoStack.length, 1, 'Undo stack must have 1 snapshot');

    // 2. Modify state destructively
    globalState.pages[0].blocks = [];
    globalState.pages[0].status = 'empty';
    globalState.selectedBlockId = null;
    globalState.selectedBlockIds = [];

    // 3. Restore state from snapshot
    const snapshot = undoStack[undoStack.length - 1];
    applyStateFromSnapshot(snapshot);

    // 4. Validate 100% data integrity
    const restoredPage = globalState.pages[0];
    assert.strictEqual(restoredPage.id, 'p_alpha');
    assert.strictEqual(restoredPage.status, 'translated');
    assert.strictEqual(restoredPage.eraserLayerBlob, 'data:image/png;base64,eraserBlobData');
    assert.strictEqual(restoredPage.blocks.length, 3, 'All 3 blocks must be restored');

    // Dialogue block assertions
    const b1 = restoredPage.blocks[0];
    assert.strictEqual(b1.id, 'blk_dialogue_1');
    assert.strictEqual(b1.translated, 'Xin chào bạn!');
    assert.strictEqual(b1.style.fontFamily, 'font-manga');
    assert.strictEqual(b1.style.autoFit, false);
    assert.strictEqual(b1.style.maskShape, 'bubble-fit');

    // SFX block assertions
    const b2 = restoredPage.blocks[1];
    assert.strictEqual(b2.id, 'blk_sfx_2');
    assert.strictEqual(b2.translated, 'BÙM!!');
    assert.strictEqual(b2.style.arcAngle, 35);
    assert.strictEqual(b2.style.skewX, 15);

    // Image block assertions
    const b3 = restoredPage.blocks[2];
    assert.strictEqual(b3.type, 'image');
    assert.strictEqual(b3.imageUrl, 'data:image/png;base64,stickerImageBase64');
    assert.strictEqual(b3.style.fit, 'contain');
    assert.strictEqual(b3.style.borderRadius, 12);

    // Selection assertions
    assert.strictEqual(globalState.selectedBlockId, 'blk_dialogue_1');
    assert.deepStrictEqual(globalState.selectedBlockIds, ['blk_dialogue_1', 'blk_sfx_2']);
});

test('Core State - AutoFit Cache Dirty Invalidation', () => {
    const page = {
        id: 'p_dirty_test',
        autoFitRevision: 1,
        blocks: [
            { id: 'b1', autoFitCache: { fontSize: 16 }, maskCache: { finalBx: 0 } },
            { id: 'b2', autoFitCache: { fontSize: 20 }, maskCache: { finalBx: 10 } }
        ]
    };

    markPageAutoFitDirty(page);

    assert.strictEqual(page.autoFitRevision, 2, 'autoFitRevision should be incremented');
    assert.strictEqual(page.blocks[0].autoFitCache, null, 'autoFitCache should be cleared');
    assert.strictEqual(page.blocks[0].maskCache, null, 'maskCache should be cleared');
    assert.strictEqual(page.blocks[1].autoFitCache, null);
    assert.strictEqual(page.blocks[1].maskCache, null);
});
