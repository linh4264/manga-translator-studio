import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import {
    getExportScale,
    buildBlockTextLayout,
    getFontFamilyName,
    renderPageToCanvas2D
} from '../../../src/features/canvas/canvas-exporter.ts';
import {
    balanceBlockDiamond,
    balanceTextToDiamond
} from '../../../src/features/canvas/canvas-renderer.ts';
import { autoFitBlock } from '../../../src/features/canvas/canvas-styling.ts';
import { parseRichTextLines } from '../../../src/core/utils.ts';
import { globalState } from '../../../src/core/state.ts';

function createMockPage(block, naturalW = 1600, naturalH = 2400, displayW = 800) {
    const page = {
        id: 'p_gold_test',
        name: 'test_page.png',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        blocks: [block],
        lastDisplayWidth: displayW
    };
    return page;
}

test('CASE A — Diamond: Editor 4 lines Diamond exports with exact same 4 lines', () => {
    const text = 'Tôi không biết.\nNhưng có lẽ...\nanh ấy đã đúng\nvề mọi chuyện.';
    const block = {
        id: 'b_case_a',
        type: 'dialogue',
        original: 'orig',
        translated: text,
        box: { x: 10, y: 10, w: 20, h: 20 },
        style: {
            fontSize: 16,
            diamondWrap: true,
            fontFamily: 'font-manga',
            lineHeight: 1.15
        }
    };

    const naturalW = 1600;
    const naturalH = 2400;
    const scaleFactor = 2.0; // 1600 / 800

    const layout = buildBlockTextLayout(block, naturalW, naturalH, scaleFactor);

    // Assert exact 4 lines
    assert.strictEqual(layout.lines.length, 4, 'Export text layout must have exactly 4 lines');
    assert.strictEqual(layout.lines[0].text, 'Tôi không biết.', 'Line 1 text must match editor');
    assert.strictEqual(layout.lines[1].text, 'Nhưng có lẽ...', 'Line 2 text must match editor');
    assert.strictEqual(layout.lines[2].text, 'anh ấy đã đúng', 'Line 3 text must match editor');
    assert.strictEqual(layout.lines[3].text, 'về mọi chuyện.', 'Line 4 text must match editor');
});

test('CASE B — Long text: Editor 6 lines exports as exact 6 lines', () => {
    const lines = [
        'Dòng thứ nhất của đoạn văn dài',
        'Dòng thứ hai tiếp tục mạch truyện',
        'Dòng thứ ba diễn biến gay cấn',
        'Dòng thứ tư đến hồi cao trào',
        'Dòng thứ năm sắp kết thúc',
        'Dòng thứ sáu là kết luận'
    ];
    const block = {
        id: 'b_case_b',
        type: 'dialogue',
        translated: lines.join('\n'),
        box: { x: 10, y: 10, w: 40, h: 50 },
        style: {
            fontSize: 14,
            fontFamily: 'font-vietnamese',
            lineHeight: 1.2
        }
    };

    const layout = buildBlockTextLayout(block, 1200, 1800, 1.5);
    assert.strictEqual(layout.lines.length, 6, 'Long text layout must have exactly 6 lines');
    lines.forEach((l, idx) => {
        assert.strictEqual(layout.lines[idx].text, l, `Line ${idx + 1} must match editor text`);
    });
});

test('CASE C — Custom font: Editor custom font family name is mapped correctly', () => {
    assert.strictEqual(getFontFamilyName('font-comic'), "'Patrick Hand', 'Pangolin', cursive");
    assert.strictEqual(getFontFamilyName('font-manga'), "'Nunito', sans-serif");
    assert.strictEqual(getFontFamilyName('font-vietnamese'), "'Be Vietnam Pro', 'Inter', sans-serif");
    assert.strictEqual(getFontFamilyName('font-impact'), "'Bangers', cursive");
    assert.strictEqual(getFontFamilyName('font-tech'), "'Chakra Petch', sans-serif");
    assert.strictEqual(getFontFamilyName('font-sans'), 'sans-serif');

    // Custom uploaded font
    const customFontName = 'MyCustomMangaFont';
    const customResult = getFontFamilyName(customFontName);
    assert.ok(customResult.includes('MyCustomMangaFont'), 'Custom font name must be included');
});

test('CASE D — AutoFit: Editor fontSize = 17 scales to 17 * scaleFactor without reduction', () => {
    const block = {
        id: 'b_case_d',
        type: 'dialogue',
        translated: 'Chữ này có kích thước 17',
        box: { x: 10, y: 10, w: 20, h: 20 },
        style: {
            fontSize: 17,
            baseFontSize: 17,
            fontFamily: 'font-manga'
        }
    };

    const naturalW = 2000;
    const naturalH = 3000;
    const page = createMockPage(block, naturalW, naturalH, 1000);
    const scaleFactor = getExportScale(page, naturalW);

    assert.strictEqual(scaleFactor, 2.0, 'Scale factor for 2000px / 1000px display width must be 2.0');

    const layout = buildBlockTextLayout(block, naturalW, naturalH, scaleFactor);
    assert.strictEqual(layout.fontSizePx, 34, 'Export font size must be 17 * 2 = 34px');
    assert.strictEqual(block.style.fontSize, 17, 'Editor block fontSize must NOT be altered by export');
});

test('CASE E — Letter spacing: Editor letterSpacing scales linearly', () => {
    const block = {
        id: 'b_case_e',
        type: 'dialogue',
        translated: 'Giãn chữ 3px',
        box: { x: 5, y: 5, w: 30, h: 20 },
        style: {
            fontSize: 15,
            letterSpacing: 3,
            fontFamily: 'font-manga'
        }
    };

    const scaleFactor = 2.5;
    const layout = buildBlockTextLayout(block, 2000, 3000, scaleFactor);
    assert.strictEqual(layout.letterSpacingPx, 3 * 2.5, 'Letter spacing must scale to 7.5px');
});

test('CASE F — Line height: Line height adheres strictly to block.style.lineHeight', () => {
    const block = {
        id: 'b_case_f',
        type: 'dialogue',
        translated: 'Dòng 1\nDòng 2',
        box: { x: 10, y: 10, w: 25, h: 25 },
        style: {
            fontSize: 20,
            lineHeight: 1.35,
            fontFamily: 'font-manga'
        }
    };

    const scaleFactor = 1.5;
    const layout = buildBlockTextLayout(block, 1200, 1800, scaleFactor);
    const expectedFontSizePx = 20 * 1.5; // 30
    const expectedLineHeightPx = expectedFontSizePx * 1.35; // 40.5

    assert.strictEqual(layout.fontSizePx, expectedFontSizePx);
    assert.strictEqual(layout.lineHeightPx, expectedLineHeightPx, 'Line height in px must be fontSizePx * 1.35');
    assert.strictEqual(layout.totalHeight, 2 * expectedLineHeightPx, 'Total height must be 2 * lineHeightPx');
});

test('CASE G — Rich text: mixed bold/italic/sizeRatio preserves line boundaries and styles', () => {
    const richText = '**Dòng đậm 1**\n*[size=120%]Dòng nghiêng lớn 2[/size]*\n[color=#ff0000]Dòng đỏ 3[/color]';
    const block = {
        id: 'b_case_g',
        type: 'dialogue',
        translated: richText,
        box: { x: 10, y: 10, w: 30, h: 30 },
        style: {
            fontSize: 16,
            fontFamily: 'font-manga'
        }
    };

    const layout = buildBlockTextLayout(block, 1600, 2400, 2.0);
    assert.strictEqual(layout.lines.length, 3, 'Rich text must retain exact 3 lines');

    // Line 1: bold
    const l1Toks = layout.lines[0].tokens;
    assert.ok(l1Toks.some(t => t.bold && t.text.includes('Dòng đậm 1')));

    // Line 2: italic + sizeRatio 1.2
    const l2Toks = layout.lines[1].tokens;
    assert.ok(l2Toks.some(t => t.italic && t.sizeRatio === 1.2));

    // Line 3: color #ff0000
    const l3Toks = layout.lines[2].tokens;
    assert.ok(l3Toks.some(t => t.color === '#ff0000'));
});

test('CASE H — Manual newline: Hard \\n boundaries are strictly preserved', () => {
    const textWithNewlines = 'A\nB\nC\nD';
    const block = {
        id: 'b_case_h',
        type: 'dialogue',
        translated: textWithNewlines,
        box: { x: 10, y: 10, w: 20, h: 20 },
        style: {
            fontSize: 16,
            diamondWrap: false
        }
    };

    const layout = buildBlockTextLayout(block, 1000, 1500, 1.0);
    assert.strictEqual(layout.lines.length, 4);
    assert.strictEqual(layout.lines[0].text, 'A');
    assert.strictEqual(layout.lines[1].text, 'B');
    assert.strictEqual(layout.lines[2].text, 'C');
    assert.strictEqual(layout.lines[3].text, 'D');
});

test('CASE I — Zoom Invariance: Zoom level does not alter export scale or line breaks', () => {
    const block = {
        id: 'b_case_i',
        type: 'dialogue',
        translated: 'Dòng 1\nDòng 2\nDòng 3',
        box: { x: 10, y: 10, w: 20, h: 20 },
        style: { fontSize: 18 }
    };

    const naturalW = 1600;
    const page = createMockPage(block, naturalW, 2400, 800);

    // Zoom 50%
    globalState.zoom = 50;
    const scale50 = getExportScale(page, naturalW);
    const layout50 = buildBlockTextLayout(block, naturalW, 2400, scale50);

    // Zoom 100%
    globalState.zoom = 100;
    const scale100 = getExportScale(page, naturalW);
    const layout100 = buildBlockTextLayout(block, naturalW, 2400, scale100);

    // Zoom 200%
    globalState.zoom = 200;
    const scale200 = getExportScale(page, naturalW);
    const layout200 = buildBlockTextLayout(block, naturalW, 2400, scale200);

    assert.strictEqual(scale50, 2.0, 'Scale at 50% zoom must be 2.0 (1600 / 800)');
    assert.strictEqual(scale100, 2.0, 'Scale at 100% zoom must be 2.0 (1600 / 800)');
    assert.strictEqual(scale200, 2.0, 'Scale at 200% zoom must be 2.0 (1600 / 800)');

    assert.strictEqual(layout50.lines.length, 3);
    assert.strictEqual(layout100.lines.length, 3);
    assert.strictEqual(layout200.lines.length, 3);
    assert.strictEqual(layout50.fontSizePx, 36);
    assert.strictEqual(layout100.fontSizePx, 36);
    assert.strictEqual(layout200.fontSizePx, 36);
});

test('CASE J — Pure Rendering: Export does not mutate block properties', async () => {
    const block = {
        id: 'b_case_j',
        type: 'dialogue',
        original: 'orig text',
        translated: 'Cậu bé\nmặc áo đỏ\nđang chạy',
        box: { x: 15, y: 15, w: 25, h: 25 },
        style: {
            fontSize: 18,
            diamondWrap: true,
            fontFamily: 'font-manga'
        },
        autoFitCache: { key: 'sample_key', fontSize: 18 }
    };

    const originalBlockSnapshot = JSON.parse(JSON.stringify(block));
    const page = createMockPage(block, 800, 1200, 800);

    // Perform export canvas rendering
    const canvas = await renderPageToCanvas2D(page);
    assert.ok(canvas, 'Canvas must be returned');

    // Block properties must remain 100% untouched
    assert.strictEqual(block.translated, originalBlockSnapshot.translated, 'Export must not mutate block.translated');
    assert.strictEqual(block.style.fontSize, originalBlockSnapshot.style.fontSize, 'Export must not mutate block.style.fontSize');
    assert.strictEqual(block.style.diamondWrap, originalBlockSnapshot.style.diamondWrap, 'Export must not mutate block.style.diamondWrap');
    assert.deepStrictEqual(block.box, originalBlockSnapshot.box, 'Export must not mutate block.box');
    assert.deepStrictEqual(block.autoFitCache, originalBlockSnapshot.autoFitCache, 'Export must not mutate block.autoFitCache');
});
