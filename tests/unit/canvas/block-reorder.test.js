import { test, expect, beforeEach } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import { globalState } from '../../../src/core/state';
import {
    isNumberingModeActive,
    startNumberingMode,
    handleNumberingClick,
    getNumberedIndex,
    finishNumberingMode,
    cancelNumberingMode,
    applyMangaSortToActivePage,
    applyManhwaSortToActivePage,
    moveBlockOrder,
    setBlockOrderIndex
} from '../../../src/features/canvas/block-reorder';

beforeEach(() => {
    globalState.pages = [
        {
            name: '001.png',
            blocks: [
                { id: 'p1_b1', original: 'A', translated: 'Câu A', box: { x: 10, y: 10, w: 20, h: 20 } },
                { id: 'p1_b2', original: 'B', translated: 'Câu B', box: { x: 80, y: 12, w: 20, h: 20 } },
                { id: 'p1_b3', original: 'C', translated: 'Câu C', box: { x: 50, y: 50, w: 20, h: 20 } }
            ]
        }
    ];
    globalState.activePageIndex = 0;
});

test('Manual Block Numbering - Interactive click sequence assigns new order', () => {
    startNumberingMode();
    assert.strictEqual(isNumberingModeActive(), true);

    // Click B first, then C, then A
    handleNumberingClick('p1_b2');
    assert.strictEqual(getNumberedIndex('p1_b2'), 1);

    handleNumberingClick('p1_b3');
    assert.strictEqual(getNumberedIndex('p1_b3'), 2);

    handleNumberingClick('p1_b1');
    assert.strictEqual(getNumberedIndex('p1_b1'), 3);

    finishNumberingMode();
    assert.strictEqual(isNumberingModeActive(), false);

    const blocks = globalState.pages[0].blocks;
    assert.strictEqual(blocks[0].original, 'B');
    assert.strictEqual(blocks[0].id, 'p1_b1');
    assert.strictEqual(blocks[1].original, 'C');
    assert.strictEqual(blocks[1].id, 'p1_b2');
    assert.strictEqual(blocks[2].original, 'A');
    assert.strictEqual(blocks[2].id, 'p1_b3');
});

test('Manual Block Numbering - Move block up and down', () => {
    // Move p1_b3 (C) up
    moveBlockOrder(0, 'p1_b3', 'up');
    let blocks = globalState.pages[0].blocks;
    assert.strictEqual(blocks[1].original, 'C');
    assert.strictEqual(blocks[2].original, 'B');

    // Move first block up (no-op)
    moveBlockOrder(0, 'p1_b1', 'up');
    blocks = globalState.pages[0].blocks;
    assert.strictEqual(blocks[0].original, 'A');

    // Move p1_b1 down
    moveBlockOrder(0, 'p1_b1', 'down');
    blocks = globalState.pages[0].blocks;
    assert.strictEqual(blocks[0].original, 'C');
    assert.strictEqual(blocks[1].original, 'A');
});

test('Manual Block Numbering - 1-Click Manga (RTL) vs Manhwa (TTB) presets', () => {
    // Apply Manga (RTL)
    applyMangaSortToActivePage();
    let blocks = globalState.pages[0].blocks;
    // In balanced Manga: Top Row (B -> A), then Bottom Row (C)
    assert.strictEqual(blocks[0].original, 'B', 'Top-Right block is #1 in Manga');
    assert.strictEqual(blocks[1].original, 'A', 'Top-Left block is #2 in Manga');
    assert.strictEqual(blocks[2].original, 'C', 'Bottom block is #3 in Manga');

    // Apply Manhwa (TTB)
    applyManhwaSortToActivePage();
    blocks = globalState.pages[0].blocks;
    // A is at y=10 (Top), B is at y=20 (Middle), C is at y=50 (Bottom)
    assert.strictEqual(blocks[0].original, 'A', 'Top block is #1 in Webtoon');
    assert.strictEqual(blocks[1].original, 'B', 'Middle block is #2 in Webtoon');
    assert.strictEqual(blocks[2].original, 'C', 'Bottom block is #3 in Webtoon');
});
