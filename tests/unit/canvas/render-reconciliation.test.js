import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import { renderOverlays, updateActiveSelectionUI } from '../../../src/features/canvas/canvas-renderer.ts';
import { clearTextMeasureCache, measureStyledSegmentWidth } from '../../../src/features/canvas/text-layout-engine.ts';
import { globalState } from '../../../src/core/state.ts';

test('Canvas Render - DOM Element Reconciliation & Persistent Layers', () => {
    const container = document.createElement('div');
    container.id = 'test-overlays-container';

    const page = {
        id: 'p1',
        name: 'page_1.png',
        width: 1000,
        height: 1500,
        blocks: [
            {
                id: 'blk_1',
                type: 'dialogue',
                translated: 'Hello World',
                box: { x: 10, y: 10, w: 20, h: 15 },
                style: { fontSize: 18, align: 'center', textColor: '#000000' }
            },
            {
                id: 'blk_2',
                type: 'dialogue',
                translated: 'Second Bubble',
                box: { x: 50, y: 40, w: 25, h: 20 },
                style: { fontSize: 16, align: 'center', textColor: '#ff0000' }
            }
        ]
    };

    globalState.pages = [page];
    globalState.activePageIndex = 0;
    globalState.selectedBlockId = 'blk_1';
    globalState.selectedBlockIds = ['blk_1'];
    globalState.viewMode = 'overlay';

    // 1. First Render: creates coversLayer and textsLayer
    renderOverlays(container, page);

    const coversLayer1 = container.querySelector('.manga-covers-layer');
    const textsLayer1 = container.querySelector('.manga-texts-layer');
    assert.ok(coversLayer1, 'Covers layer should exist');
    assert.ok(textsLayer1, 'Texts layer should exist');

    const cover1 = container.querySelector('#mirror-cover-blk_1');
    const bubble1 = container.querySelector('#mirror-blk_1');
    assert.ok(cover1, 'Cover element 1 should exist');
    assert.ok(bubble1, 'Bubble element 1 should exist');

    // 2. Second Render with modified text/box: reuses identical DOM nodes without wiping container
    page.blocks[0].translated = 'Updated Text';
    page.blocks[0].box.x = 15;
    renderOverlays(container, page);

    const coversLayer2 = container.querySelector('.manga-covers-layer');
    const textsLayer2 = container.querySelector('.manga-texts-layer');
    assert.strictEqual(coversLayer1, coversLayer2, 'Covers layer should be persisted and reused');
    assert.strictEqual(textsLayer1, textsLayer2, 'Texts layer should be persisted and reused');

    const cover1Updated = container.querySelector('#mirror-cover-blk_1');
    const bubble1Updated = container.querySelector('#mirror-blk_1');
    assert.strictEqual(cover1, cover1Updated, 'Cover DOM element should be reused (keyed reconciliation)');
    assert.strictEqual(bubble1, bubble1Updated, 'Bubble DOM element should be reused (keyed reconciliation)');
    assert.strictEqual(cover1Updated?.style.left, '15%', 'Updated coordinate should be reflected');

    // 3. Third Render: remove block 2 -> orphan element should be cleanly deleted
    page.blocks.pop(); // remove blk_2
    renderOverlays(container, page);

    assert.strictEqual(container.querySelector('#mirror-cover-blk_2'), null, 'Orphan cover should be removed');
    assert.strictEqual(container.querySelector('#mirror-blk_2'), null, 'Orphan bubble should be removed');
    assert.ok(container.querySelector('#mirror-cover-blk_1'), 'Active block cover should remain');
});

test('Text Layout Engine - LRU Measurement Cache Hit & Clear', () => {
    clearTextMeasureCache();

    const tok = { text: 'Testing Cache', bold: true, italic: false, sizeRatio: 1.0 };
    const mockCtx = {
        font: '',
        measureText: (str) => ({ width: str.length * 10 })
    };

    const width1 = measureStyledSegmentWidth('Testing Cache', tok, 18, 0, 'sans-serif', mockCtx);
    assert.ok(width1 > 0, 'First measurement should succeed');

    const width2 = measureStyledSegmentWidth('Testing Cache', tok, 18, 0, 'sans-serif', mockCtx);
    assert.strictEqual(width1, width2, 'Subsequent measurement should return exact identical cached width');

    clearTextMeasureCache();
    const width3 = measureStyledSegmentWidth('Testing Cache', tok, 18, 0, 'sans-serif', mockCtx);
    assert.strictEqual(width1, width3, 'Measurement after clear should recompute correctly');
});
