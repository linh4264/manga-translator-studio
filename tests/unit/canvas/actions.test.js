import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import '../../setup/indexeddb-mock.js';

import { duplicateActiveBlock } from '../../../src/features/canvas/canvas-actions.ts';
import { globalState } from '../../../src/core/state.ts';

test('Canvas Actions - Duplicate Dialogue Block', () => {
    const originalBlock = {
        id: 'orig_1',
        type: 'dialogue',
        original: 'こんにちは',
        translated: 'Xin chào',
        box: { x: 20, y: 30, w: 25, h: 20 },
        style: { fontFamily: 'font-manga', fontSize: 16, bold: true }
    };

    globalState.pages = [{ id: 'p1', blocks: [originalBlock] }];
    globalState.activePageIndex = 0;
    globalState.selectedBlockId = 'orig_1';

    duplicateActiveBlock();

    assert.strictEqual(globalState.pages[0].blocks.length, 2, 'Should create cloned block');
    const cloned = globalState.pages[0].blocks[1];

    assert.notStrictEqual(cloned.id, 'orig_1', 'Cloned block must have unique ID');
    assert.strictEqual(cloned.translated, 'Xin chào');
    assert.strictEqual(cloned.style.fontFamily, 'font-manga');
    assert.strictEqual(cloned.box.x, 22, 'Duplicated block slightly offsets x by +2');
    assert.strictEqual(cloned.box.y, 32, 'Duplicated block slightly offsets y by +2');
    assert.strictEqual(globalState.selectedBlockId, cloned.id, 'New block should be selected');
});

test('Canvas Actions - Duplicate Image Overlay Block', () => {
    const imageBlock = {
        id: 'img_orig_1',
        type: 'image',
        imageUrl: 'data:image/png;base64,sampleBase64',
        original: '[IMAGE]',
        translated: '',
        box: { x: 40, y: 40, w: 20, h: 20 },
        style: { opacity: 80, fit: 'contain', borderRadius: 8 }
    };

    globalState.pages = [{ id: 'p1', blocks: [imageBlock] }];
    globalState.activePageIndex = 0;
    globalState.selectedBlockId = 'img_orig_1';

    duplicateActiveBlock();

    assert.strictEqual(globalState.pages[0].blocks.length, 2);
    const clonedImage = globalState.pages[0].blocks[1];

    assert.strictEqual(clonedImage.type, 'image');
    assert.strictEqual(clonedImage.imageUrl, 'data:image/png;base64,sampleBase64');
    assert.strictEqual(clonedImage.style.opacity, 80);
    assert.strictEqual(clonedImage.style.borderRadius, 8);
});
