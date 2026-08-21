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

test('CASE K — Clean Text: Diamond balance on italic / thought block does not inject [i] tags', () => {
    const rawThought = 'Vì lúc đó ngượng lắm mà...!';
    const thoughtBlock = {
        id: 'b_thought_clean',
        type: 'thought',
        translated: rawThought,
        box: { x: 20, y: 20, w: 25, h: 25 },
        style: {
            fontSize: 18,
            fontFamily: 'font-comicneue',
            italic: true,
            bold: false,
            diamondWrap: true,
            maskShape: 'bubble-fit'
        }
    };

    balanceBlockDiamond(thoughtBlock);

    assert.ok(!thoughtBlock.translated.includes('[i]'), 'Translated text must not contain [i] tags');
    assert.ok(!thoughtBlock.translated.includes('[/i]'), 'Translated text must not contain [/i] tags');
    assert.ok(thoughtBlock.translated.includes('Vì lúc đó') || thoughtBlock.translated.includes('ngượng'), 'Content must be preserved');
});

test('CASE L — Vertical Alignment: Single line normal centered text glyph center matches editor logical center', () => {
    const block = {
        id: 'b_vert_single',
        type: 'dialogue',
        translated: 'Xin chào thế giới',
        box: { x: 20, y: 30, w: 40, h: 20 },
        style: {
            fontSize: 16,
            fontFamily: 'font-manga',
            lineHeight: 1.15
        }
    };

    const naturalW = 1000;
    const naturalH = 1000;
    const scaleFactor = 1.0;
    const layout = buildBlockTextLayout(block, naturalW, naturalH, scaleFactor);

    const bx = (block.box.x / 100) * naturalW; // 200
    const by = (block.box.y / 100) * naturalH; // 300
    const bh = (block.box.h / 100) * naturalH; // 200

    const editorBlockCenterY = by + (bh / 2); // 400
    const editorLogicalLineCenter = editorBlockCenterY;

    assert.strictEqual(layout.lines.length, 1);
    const line = layout.lines[0];

    // Assert logical line center
    assert.strictEqual(line.centerY, editorLogicalLineCenter, 'Line center must match editor vertical center');

    // Assert computed glyph center from font metrics
    const computedGlyphCenter = line.baselineY - ((line.ascent - line.descent) / 2);
    assert.strictEqual(computedGlyphCenter, editorLogicalLineCenter, 'Exported glyph center must match editor text center');
    assert.strictEqual(layout.textCenterY, editorBlockCenterY, 'Text block center must match speech bubble center');
});

test('CASE M — Vertical Alignment: Multiple lines (2, 4, 6 lines) centers match editor layout', () => {
    const lineCounts = [2, 4, 6];

    lineCounts.forEach(count => {
        const textLines = Array.from({ length: count }, (_, i) => `Dòng số ${i + 1}`);
        const block = {
            id: `b_vert_multi_${count}`,
            type: 'dialogue',
            translated: textLines.join('\n'),
            box: { x: 10, y: 10, w: 50, h: 60 },
            style: {
                fontSize: 18,
                fontFamily: 'font-manga',
                lineHeight: 1.2
            }
        };

        const naturalW = 1600;
        const naturalH = 2000;
        const scaleFactor = 2.0;
        const layout = buildBlockTextLayout(block, naturalW, naturalH, scaleFactor);

        const by = (block.box.y / 100) * naturalH; // 200
        const bh = (block.box.h / 100) * naturalH; // 1200
        const editorBlockCenterY = by + (bh / 2); // 800

        const fontSizePx = 18 * scaleFactor; // 36
        const lineHeightPx = fontSizePx * 1.2; // 43.2
        const totalHeight = count * lineHeightPx;
        const editorTextTop = editorBlockCenterY - (totalHeight / 2);

        assert.strictEqual(layout.lines.length, count);
        expect(layout.textCenterY).toBeCloseTo(editorBlockCenterY, 4);

        layout.lines.forEach((line, idx) => {
            const expectedLineCenter = editorTextTop + (idx + 0.5) * lineHeightPx;
            expect(line.centerY).toBeCloseTo(expectedLineCenter, 4);

            const computedGlyphCenter = line.baselineY - ((line.ascent - line.descent) / 2);
            expect(computedGlyphCenter).toBeCloseTo(expectedLineCenter, 4);
        });
    });
});

test('CASE N — Vertical Alignment: Different line heights (1.0, 1.15, 1.35, 1.6, 2.0)', () => {
    const lineHeights = [1.0, 1.15, 1.35, 1.6, 2.0];

    lineHeights.forEach(lh => {
        const block = {
            id: `b_vert_lh_${lh}`,
            type: 'dialogue',
            translated: 'Hàng trên\nHàng dưới',
            box: { x: 20, y: 20, w: 40, h: 40 },
            style: {
                fontSize: 20,
                fontFamily: 'font-manga',
                lineHeight: lh
            }
        };

        const W = 1000;
        const H = 1000;
        const layout = buildBlockTextLayout(block, W, H, 1.0);

        const by = (block.box.y / 100) * H; // 200
        const bh = (block.box.h / 100) * H; // 400
        const blockCenterY = by + (bh / 2); // 400

        const expectedLhPx = 20 * lh;
        const expectedTotalH = 2 * expectedLhPx;
        const expectedTop = blockCenterY - (expectedTotalH / 2);

        expect(layout.lineHeightPx).toBeCloseTo(expectedLhPx, 4);
        expect(layout.totalHeight).toBeCloseTo(expectedTotalH, 4);

        layout.lines.forEach((line, idx) => {
            const expectedCenter = expectedTop + (idx + 0.5) * expectedLhPx;
            expect(line.centerY).toBeCloseTo(expectedCenter, 4);
            const glyphCenter = line.baselineY - ((line.ascent - line.descent) / 2);
            expect(glyphCenter).toBeCloseTo(expectedCenter, 4);
        });
    });
});

test('CASE O — Vertical Alignment: Small and large font sizes (9px, 14px, 24px, 48px, 72px)', () => {
    const fontSizes = [9, 14, 24, 48, 72];

    fontSizes.forEach(fs => {
        const block = {
            id: `b_vert_fs_${fs}`,
            type: 'dialogue',
            translated: 'Kích thước chữ mẫu',
            box: { x: 10, y: 10, w: 80, h: 80 },
            style: {
                fontSize: fs,
                fontFamily: 'font-manga',
                lineHeight: 1.25
            }
        };

        const W = 2000;
        const H = 2000;
        const scaleFactor = 1.5;
        const layout = buildBlockTextLayout(block, W, H, scaleFactor);

        const expectedFsPx = fs * scaleFactor;
        const by = (block.box.y / 100) * H;
        const bh = (block.box.h / 100) * H;
        const blockCenterY = by + (bh / 2);

        expect(layout.fontSizePx).toBeCloseTo(expectedFsPx, 4);
        const line = layout.lines[0];
        expect(line.centerY).toBeCloseTo(blockCenterY, 4);

        const glyphCenter = line.baselineY - ((line.ascent - line.descent) / 2);
        expect(glyphCenter).toBeCloseTo(blockCenterY, 4);
    });
});

test('CASE P — Vertical Alignment: Fonts Nunito, Be Vietnam Pro, Patrick Hand, Bangers', () => {
    const fonts = [
        { key: 'font-manga', name: 'Nunito' },
        { key: 'font-vietnamese', name: 'Be Vietnam Pro' },
        { key: 'font-comic', name: 'Patrick Hand' },
        { key: 'font-impact', name: 'Bangers' }
    ];

    fonts.forEach(({ key, name }) => {
        const block = {
            id: `b_vert_font_${key}`,
            type: 'dialogue',
            translated: `Font ${name} tiếng Việt có dấu sắc huyền hỏi ngã nặng`,
            box: { x: 15, y: 15, w: 70, h: 30 },
            style: {
                fontSize: 22,
                fontFamily: key,
                lineHeight: 1.2
            }
        };

        const layout = buildBlockTextLayout(block, 1200, 1600, 2.0);
        const line = layout.lines[0];

        assert.ok(line.ascent > 0, `Ascent for ${name} must be positive`);
        assert.ok(line.descent > 0, `Descent for ${name} must be positive`);

        // Baseline must be offset by half of (ascent - descent) from line centerY
        const expectedBaselineOffset = (line.ascent - line.descent) / 2;
        expect(line.baselineY).toBeCloseTo(line.centerY + expectedBaselineOffset, 4);

        // Visual glyph center must match line centerY exactly
        const glyphCenter = line.baselineY - expectedBaselineOffset;
        expect(glyphCenter).toBeCloseTo(line.centerY, 4);
    });
});

test('CASE Q — Vertical Alignment: Japanese vertical writing mode', () => {
    const japaneseText = 'お前はもう\n死んでいる';
    const block = {
        id: 'b_vert_japanese',
        type: 'dialogue',
        translated: japaneseText,
        box: { x: 20, y: 20, w: 30, h: 50 },
        style: {
            fontSize: 20,
            fontFamily: 'font-manga',
            vertical: true,
            lineHeight: 1.2
        }
    };

    const W = 1000;
    const H = 1500;
    const layout = buildBlockTextLayout(block, W, H, 1.0);

    assert.strictEqual(layout.isVertical, true, 'Layout must be vertical');
    assert.strictEqual(layout.lines.length, 2, 'Must have 2 vertical columns');

    const by = (block.box.y / 100) * H; // 300
    const bh = (block.box.h / 100) * H; // 750
    const blockCenterY = by + (bh / 2); // 675

    // Check each column
    layout.lines.forEach((col, idx) => {
        expect(col.centerY).toBeCloseTo(blockCenterY, 4);
        assert.ok(col.rawChars && col.rawChars.length > 0, 'Vertical column must have character tokens');
        expect(col.width).toBeCloseTo(layout.lineHeightPx, 4);
    });
});

test('CASE R — Vertical Alignment: Rich text with mixed font sizes preserves baseline and center', () => {
    const richText = 'Bình thường [size=150%]Chữ To Hơn[/size] bình thường';
    const block = {
        id: 'b_vert_rich_mixed',
        type: 'dialogue',
        translated: richText,
        box: { x: 10, y: 20, w: 80, h: 40 },
        style: {
            fontSize: 20,
            fontFamily: 'font-manga',
            lineHeight: 1.3
        }
    };

    const layout = buildBlockTextLayout(block, 1200, 1600, 1.5);
    assert.strictEqual(layout.lines.length, 1);

    const line = layout.lines[0];
    const glyphCenter = line.baselineY - ((line.ascent - line.descent) / 2);

    expect(glyphCenter).toBeCloseTo(line.centerY, 4);
    assert.strictEqual(layout.lines[0].tokens.length, 3, 'Must parse into 3 rich text tokens');
    assert.strictEqual(layout.lines[0].tokens[1].sizeRatio, 1.5, 'Middle token must have sizeRatio 1.5');
});

test('CASE S — Pure Alignment: Zero magic offset constants in layout calculation', () => {
    const block = {
        id: 'b_vert_pure',
        type: 'dialogue',
        translated: 'Kiểm tra độ chính xác tuyệt đối',
        box: { x: 25, y: 25, w: 50, h: 50 },
        style: {
            fontSize: 16,
            lineHeight: 1.15
        }
    };

    const layout = buildBlockTextLayout(block, 1000, 1000, 1.0);
    const line = layout.lines[0];

    // Verification: baseline - centerY must equal exactly (ascent - descent) / 2 with 0 arbitrary constants
    const diff = line.baselineY - line.centerY;
    const expectedDiff = (line.ascent - line.descent) / 2;
    expect(diff).toBeCloseTo(expectedDiff, 4);
});

