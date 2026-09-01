import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import { sortMangaReadingOrder, sortManhwaReadingOrder } from '../../../src/features/ocr/ocr-service';

test('OCR Reading Order - Japanese Manga (Right-to-Left priority, then Top-to-Bottom)', () => {
    // 4 blocks mimicking manga page layout (Right column, Center column, Left top, Left bottom)
    const blocks = [
        { id: 'b_left_top', box: { x: 15, y: 15, w: 15, h: 20 } },
        { id: 'b_center', box: { x: 45, y: 30, w: 15, h: 20 } },
        { id: 'b_right_bottom', box: { x: 75, y: 70, w: 15, h: 20 } },
        { id: 'b_left_bottom', box: { x: 12, y: 75, w: 15, h: 20 } }
    ];

    const sortedManga = sortMangaReadingOrder(blocks);

    // In Japanese manga RTL priority:
    // 1st: Rightmost panel/column ('b_right_bottom')
    // 2nd: Center panel/column ('b_center')
    // 3rd: Left column Top ('b_left_top')
    // 4th: Left column Bottom ('b_left_bottom')
    assert.strictEqual(sortedManga[0].id, 'b_right_bottom', 'Rightmost panel is 1st');
    assert.strictEqual(sortedManga[1].id, 'b_center', 'Center panel is 2nd');
    assert.strictEqual(sortedManga[2].id, 'b_left_top', 'Left-Top is 3rd');
    assert.strictEqual(sortedManga[3].id, 'b_left_bottom', 'Left-Bottom is 4th');
});

test('OCR Reading Order - Korean Webtoon / Western Comic (Left-to-Right, Top-to-Bottom)', () => {
    const blocks = [
        { id: 'b_right_top', box: { x: 70, y: 10, w: 20, h: 20 } },
        { id: 'b_left_top', box: { x: 10, y: 10, w: 20, h: 20 } },
        { id: 'b_bottom', box: { x: 30, y: 70, w: 20, h: 20 } }
    ];

    const sortedManhwa = sortManhwaReadingOrder(blocks);

    // In Manhwa / Western comic, top-left is read 1st, top-right is 2nd, bottom is 3rd
    assert.strictEqual(sortedManhwa[0].id, 'b_left_top', 'Top-Left is 1st');
    assert.strictEqual(sortedManhwa[1].id, 'b_right_top', 'Top-Right is 2nd');
    assert.strictEqual(sortedManhwa[2].id, 'b_bottom', 'Bottom is 3rd');
});

