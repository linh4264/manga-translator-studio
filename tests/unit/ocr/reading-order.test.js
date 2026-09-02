import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import { sortMangaReadingOrder, sortManhwaReadingOrder } from '../../../src/features/ocr/ocr-service';

test('OCR Reading Order - Japanese Manga (Balanced: Top-to-Bottom tiers, Right-to-Left within tier)', () => {
    const blocks = [
        { id: 'b_left_top', box: { x: 10, y: 10, w: 20, h: 20 } },
        { id: 'b_right_top', box: { x: 70, y: 10, w: 20, h: 20 } },
        { id: 'b_left_bottom', box: { x: 20, y: 60, w: 20, h: 20 } },
        { id: 'b_right_bottom', box: { x: 80, y: 60, w: 20, h: 20 } }
    ];

    const sortedManga = sortMangaReadingOrder(blocks);

    // In balanced Manga reading flow:
    // 1st: Top-Right ('b_right_top')
    // 2nd: Top-Left ('b_left_top')
    // 3rd: Bottom-Right ('b_right_bottom')
    // 4th: Bottom-Left ('b_left_bottom')
    assert.strictEqual(sortedManga[0].id, 'b_right_top', 'Top-Right is 1st');
    assert.strictEqual(sortedManga[1].id, 'b_left_top', 'Top-Left is 2nd');
    assert.strictEqual(sortedManga[2].id, 'b_right_bottom', 'Bottom-Right is 3rd');
    assert.strictEqual(sortedManga[3].id, 'b_left_bottom', 'Bottom-Left is 4th');
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


