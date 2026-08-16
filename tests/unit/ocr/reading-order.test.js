import test from 'node:test';
import assert from 'node:assert';
import '../../setup/browser-env.js';

// Manga Reading Order sorting utility (Top-to-Bottom, Right-to-Left for Manga)
function sortMangaReadingOrder(blocks) {
    return [...blocks].sort((a, b) => {
        // Vertical difference threshold: If vertically distant (> 8%), top comes first
        const yDiff = a.box.y - b.box.y;
        if (Math.abs(yDiff) > 8) {
            return yDiff;
        }
        // In the same horizontal tier: Right comes before Left (Manga RTL standard)
        return b.box.x - a.box.x;
    });
}

function sortManhwaReadingOrder(blocks) {
    return [...blocks].sort((a, b) => {
        const yDiff = a.box.y - b.box.y;
        if (Math.abs(yDiff) > 8) {
            return yDiff;
        }
        // In the same horizontal tier: Left comes before Right (Webtoon/Comic LTR standard)
        return a.box.x - b.box.x;
    });
}

test('OCR Reading Order - Japanese Manga (Right-to-Left, Top-to-Bottom)', () => {
    const blocks = [
        { id: 'b_left_top', box: { x: 10, y: 10, w: 20, h: 20 } },
        { id: 'b_right_top', box: { x: 70, y: 10, w: 20, h: 20 } },
        { id: 'b_middle_bottom', box: { x: 50, y: 60, w: 20, h: 20 } }
    ];

    const sortedManga = sortMangaReadingOrder(blocks);

    // In Japanese manga, top-right bubble should be read 1st, top-left 2nd, bottom 3rd
    assert.strictEqual(sortedManga[0].id, 'b_right_top', 'Top-Right is 1st');
    assert.strictEqual(sortedManga[1].id, 'b_left_top', 'Top-Left is 2nd');
    assert.strictEqual(sortedManga[2].id, 'b_middle_bottom', 'Bottom is 3rd');
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
