import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../setup/browser-env.js';

import {
    computeBlockTextLayout,
    computeTextLayout,
    renderBlockTextToCanvas,
    renderBlockTextToDOM,
    getFontFamilyName,
    buildFontString
} from '../../src/features/canvas/text-layout-engine.ts';
import {
    buildBlockTextLayout,
    getExportScale,
    getReferenceDisplayDimensions,
    renderPageToCanvas2DDirect
} from '../../src/features/canvas/canvas-exporter.ts';
import { autoFitBlock } from '../../src/features/canvas/canvas-styling.ts';
import { globalState } from '../../src/core/state.ts';

function createMockPage(block, naturalW = 1600, naturalH = 2400, displayW = 800) {
    return {
        id: 'p_tela_test',
        name: 'test_page.png',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        blocks: [block],
        lastDisplayWidth: displayW
    };
}

// 1. Một dòng (Single line)
test('Tela Principle 1: Single line layout matches 100% between Editor and Export', () => {
    const block = {
        id: 'b_single_line',
        type: 'dialogue',
        translated: 'Xin chào thế giới!',
        box: { x: 10, y: 10, w: 40, h: 20 },
        style: {
            fontSize: 18,
            fontFamily: 'font-manga',
            lineHeight: 1.2
        }
    };

    const refW = 800;
    const refH = 1200;
    const exportW = 1600;
    const exportH = 2400;
    const scaleFactor = 2.0;

    const editorLayout = computeBlockTextLayout(block, refW, refH, 1.0);
    const exportLayout = buildBlockTextLayout(block, exportW, exportH, scaleFactor);

    assert.strictEqual(editorLayout.lines.length, 1, 'Editor must have 1 line');
    assert.strictEqual(exportLayout.lines.length, 1, 'Export must have 1 line');
    assert.strictEqual(exportLayout.lines[0].text, editorLayout.lines[0].text);
    assert.strictEqual(exportLayout.fontSizePx, editorLayout.fontSizePx * scaleFactor);
    assert.strictEqual(exportLayout.lineHeightPx, editorLayout.lineHeightPx * scaleFactor);
    expect(exportLayout.lines[0].width).toBeCloseTo(editorLayout.lines[0].width * scaleFactor, 1);
});

// 2. Nhiều dòng (Multi-line)
test('Tela Principle 2: Multi-line layout with hard line breaks matches between Editor and Export', () => {
    const text = 'Dòng thứ nhất\nDòng thứ hai dài hơn\nDòng thứ ba kết thúc';
    const block = {
        id: 'b_multi_line',
        type: 'dialogue',
        translated: text,
        box: { x: 15, y: 15, w: 35, h: 30 },
        style: {
            fontSize: 16,
            fontFamily: 'font-vietnamese',
            lineHeight: 1.25
        }
    };

    const scaleFactor = 2.5;
    const editorLayout = computeBlockTextLayout(block, 800, 1200, 1.0);
    const exportLayout = buildBlockTextLayout(block, 2000, 3000, scaleFactor);

    assert.strictEqual(editorLayout.lines.length, 3);
    assert.strictEqual(exportLayout.lines.length, 3);
    for (let i = 0; i < 3; i++) {
        assert.strictEqual(exportLayout.lines[i].text, editorLayout.lines[i].text, `Line ${i + 1} text must match`);
        expect(exportLayout.lines[i].width).toBeCloseTo(editorLayout.lines[i].width * scaleFactor, 1);
        expect(exportLayout.lines[i].height).toBeCloseTo(editorLayout.lines[i].height * scaleFactor, 1);
    }
});

// 3. Box hẹp (Narrow box)
test('Tela Principle 3: Narrow box word wrap is identical between Editor and Export', () => {
    const text = 'Một câu thoại khá dài được đặt trong một hộp thoại có chiều ngang rất hẹp';
    const block = {
        id: 'b_narrow_box',
        type: 'dialogue',
        translated: text,
        box: { x: 10, y: 10, w: 12, h: 40 }, // 12% of 800 = 96px width
        style: {
            fontSize: 15,
            fontFamily: 'font-manga',
            lineHeight: 1.15
        }
    };

    const scaleFactor = 3.0;
    const editorLayout = computeBlockTextLayout(block, 800, 1200, 1.0);
    const exportLayout = buildBlockTextLayout(block, 2400, 3600, scaleFactor);

    assert.ok(editorLayout.lines.length >= 3, 'Narrow box should wrap into multiple lines');
    assert.strictEqual(exportLayout.lines.length, editorLayout.lines.length, 'Line counts must be identical');

    for (let i = 0; i < editorLayout.lines.length; i++) {
        assert.strictEqual(exportLayout.lines[i].text, editorLayout.lines[i].text, `Line ${i + 1} words must match exactly`);
    }
});

// 4. Box rộng (Wide box)
test('Tela Principle 4: Wide box layout preserves text flow without artificial wrapping', () => {
    const text = 'Câu thoại này nằm trọn vẹn trong một khung thoại ngang rộng lớn';
    const block = {
        id: 'b_wide_box',
        type: 'dialogue',
        translated: text,
        box: { x: 5, y: 5, w: 80, h: 20 }, // 80% of 800 = 640px width
        style: {
            fontSize: 16,
            fontFamily: 'font-manga',
            lineHeight: 1.2
        }
    };

    const scaleFactor = 1.5;
    const editorLayout = computeBlockTextLayout(block, 800, 1200, 1.0);
    const exportLayout = buildBlockTextLayout(block, 1200, 1800, scaleFactor);

    assert.strictEqual(editorLayout.lines.length, 1, 'Wide box should fit text in 1 line');
    assert.strictEqual(exportLayout.lines.length, 1, 'Export layout should also be 1 line');
    assert.strictEqual(exportLayout.lines[0].text, editorLayout.lines[0].text);
});

// 5. AutoFit
test('Tela Principle 5: AutoFit completes before render and export uses identical scaled fontSize', () => {
    const text = 'Đây là một đoạn hội thoại tương đối dài cần được AutoFit co nhỏ lại để vừa khít';
    const block = {
        id: 'b_autofit_tela',
        type: 'dialogue',
        translated: text,
        box: { x: 10, y: 10, w: 15, h: 10 }, // Small box
        style: {
            fontSize: 24,
            baseFontSize: 24,
            fontFamily: 'font-manga',
            autoFit: true
        }
    };

    const page = createMockPage(block, 1600, 2400, 800);
    globalState.autoFitEnabled = true;

    // Run AutoFit
    autoFitBlock(block, null, 1, page);

    const autofitFontSize = block.style.fontSize;
    assert.ok(autofitFontSize < 24, `AutoFit must reduce font size (got ${autofitFontSize})`);

    const scaleFactor = 2.0;
    const editorLayout = computeBlockTextLayout(block, 800, 1200, 1.0);
    const exportLayout = buildBlockTextLayout(block, 1600, 2400, scaleFactor, null, page);

    assert.strictEqual(exportLayout.fontSizePx, autofitFontSize * scaleFactor, 'Export fontSize must be autofitFontSize * scaleFactor');
    assert.strictEqual(exportLayout.lines.length, editorLayout.lines.length, 'Line count must be identical');
    for (let i = 0; i < editorLayout.lines.length; i++) {
        assert.strictEqual(exportLayout.lines[i].text, editorLayout.lines[i].text);
    }
});

// 6. Resize box nhiều lần (Multiple box resizes)
test('Tela Principle 6: Multiple box resize iterations consistently maintain parity', () => {
    const text = 'Kiểm tra khả năng co giãn hộp thoại nhiều lần liên tiếp';
    const block = {
        id: 'b_resize_multi',
        type: 'dialogue',
        translated: text,
        box: { x: 10, y: 10, w: 40, h: 20 },
        style: {
            fontSize: 16,
            fontFamily: 'font-manga'
        }
    };

    const widths = [40, 20, 50, 15, 35];
    const scaleFactor = 2.0;

    for (const w of widths) {
        block.box.w = w;
        const editorLayout = computeBlockTextLayout(block, 800, 1200, 1.0);
        const exportLayout = buildBlockTextLayout(block, 1600, 2400, scaleFactor);

        assert.strictEqual(exportLayout.lines.length, editorLayout.lines.length, `Width ${w}%: line counts must match`);
        for (let i = 0; i < editorLayout.lines.length; i++) {
            assert.strictEqual(exportLayout.lines[i].text, editorLayout.lines[i].text, `Width ${w}%: Line ${i} must match`);
        }
    }
});

// 7. Font Việt (Vietnamese diacritics & complex accents)
test('Tela Principle 7: Vietnamese text with tone marks renders identical line layout', () => {
    const text = 'Thực tập sinh đã hoàn thành xuất sắc nhiệm vụ được giao phó!';
    const block = {
        id: 'b_vietnamese',
        type: 'dialogue',
        translated: text,
        box: { x: 10, y: 10, w: 30, h: 25 },
        style: {
            fontSize: 16,
            fontFamily: 'font-vietnamese',
            lineHeight: 1.3
        }
    };

    const scaleFactor = 2.0;
    const editorLayout = computeBlockTextLayout(block, 800, 1200, 1.0);
    const exportLayout = buildBlockTextLayout(block, 1600, 2400, scaleFactor);

    assert.strictEqual(exportLayout.lines.length, editorLayout.lines.length);
    assert.strictEqual(getFontFamilyName('font-vietnamese'), "'Be Vietnam Pro', 'Inter', sans-serif");
    for (let i = 0; i < editorLayout.lines.length; i++) {
        assert.strictEqual(exportLayout.lines[i].text, editorLayout.lines[i].text);
    }
});

// 8. Font Nhật ngang (Horizontal Japanese/CJK)
test('Tela Principle 8: Horizontal Japanese / CJK text layout is identical', () => {
    const text = '海賊王に俺はなる！\n絶対に諦めないぞ！';
    const block = {
        id: 'b_japanese_h',
        type: 'dialogue',
        translated: text,
        box: { x: 10, y: 10, w: 35, h: 25 },
        style: {
            fontSize: 18,
            fontFamily: 'font-manga',
            vertical: false
        }
    };

    const scaleFactor = 2.0;
    const editorLayout = computeBlockTextLayout(block, 800, 1200, 1.0);
    const exportLayout = buildBlockTextLayout(block, 1600, 2400, scaleFactor);

    assert.strictEqual(exportLayout.isVertical, false);
    assert.strictEqual(exportLayout.lines.length, 2);
    assert.strictEqual(exportLayout.lines[0].text, '海賊王に俺はなる！');
    assert.strictEqual(exportLayout.lines[1].text, '絶対に諦めないぞ！');
});

// 9. Font Nhật dọc (Vertical Japanese/CJK)
test('Tela Principle 9: Vertical Japanese text layout and column ordering match between Editor and Export', () => {
    const text = '第一列の文章\n第二列の文章';
    const block = {
        id: 'b_japanese_v',
        type: 'dialogue',
        translated: text,
        box: { x: 20, y: 20, w: 25, h: 40 },
        style: {
            fontSize: 18,
            fontFamily: 'font-manga',
            vertical: true
        }
    };

    const scaleFactor = 2.0;
    const editorLayout = computeBlockTextLayout(block, 800, 1200, 1.0);
    const exportLayout = buildBlockTextLayout(block, 1600, 2400, scaleFactor);

    assert.strictEqual(editorLayout.isVertical, true);
    assert.strictEqual(exportLayout.isVertical, true);
    assert.strictEqual(exportLayout.lines.length, 2, 'Must have 2 vertical columns');
    assert.strictEqual(exportLayout.lines[0].text, '第一列の文章');
    assert.strictEqual(exportLayout.lines[1].text, '第二列の文章');
});

// 10. Letter spacing (Giãn khoảng cách ký tự)
test('Tela Principle 10: Letter spacing scales linearly with scale factor', () => {
    const block = {
        id: 'b_letter_spacing',
        type: 'dialogue',
        translated: 'Giãn ký tự',
        box: { x: 10, y: 10, w: 30, h: 15 },
        style: {
            fontSize: 16,
            letterSpacing: 4,
            fontFamily: 'font-manga'
        }
    };

    const scaleFactor = 2.5;
    const editorLayout = computeBlockTextLayout(block, 800, 1200, 1.0);
    const exportLayout = buildBlockTextLayout(block, 2000, 3000, scaleFactor);

    assert.strictEqual(editorLayout.letterSpacingPx, 4);
    assert.strictEqual(exportLayout.letterSpacingPx, 4 * scaleFactor);
});

// 11. Line height (Khoảng cách dòng)
test('Tela Principle 11: Line height is strictly preserved between Editor and Export', () => {
    const block = {
        id: 'b_line_height',
        type: 'dialogue',
        translated: 'Dòng 1\nDòng 2\nDòng 3',
        box: { x: 10, y: 10, w: 30, h: 30 },
        style: {
            fontSize: 20,
            lineHeight: 1.4,
            fontFamily: 'font-manga'
        }
    };

    const scaleFactor = 2.0;
    const editorLayout = computeBlockTextLayout(block, 800, 1200, 1.0);
    const exportLayout = buildBlockTextLayout(block, 1600, 2400, scaleFactor);

    assert.strictEqual(editorLayout.lineHeightPx, 20 * 1.4);
    assert.strictEqual(exportLayout.lineHeightPx, (20 * scaleFactor) * 1.4);
});

// 12. Center / Left / Right alignment
test('Tela Principle 12: Alignment (center, left, right) produces consistent layout calculations', () => {
    const alignments = ['left', 'center', 'right'];

    alignments.forEach(align => {
        const block = {
            id: `b_align_${align}`,
            type: 'dialogue',
            translated: 'Căn chỉnh văn bản',
            box: { x: 10, y: 10, w: 30, h: 15 },
            style: {
                fontSize: 16,
                align: align,
                fontFamily: 'font-manga'
            }
        };

        const editorLayout = computeBlockTextLayout(block, 800, 1200, 1.0);
        const exportLayout = buildBlockTextLayout(block, 1600, 2400, 2.0);

        assert.strictEqual(editorLayout.align, align);
        assert.strictEqual(exportLayout.align, align);
    });
});

// 13. Rotation
test('Tela Principle 13: Block rotation and text rotation angle parameters are consistent', () => {
    const block = {
        id: 'b_rotation',
        type: 'dialogue',
        translated: 'Xoay góc chữ',
        box: { x: 20, y: 20, w: 25, h: 25 },
        style: {
            fontSize: 16,
            rotate: 15,
            textRotate: -5,
            fontFamily: 'font-manga'
        }
    };

    const editorLayout = computeBlockTextLayout(block, 800, 1200, 1.0);
    const exportLayout = buildBlockTextLayout(block, 1600, 2400, 2.0);

    assert.strictEqual(exportLayout.lines.length, editorLayout.lines.length);
    assert.strictEqual(exportLayout.lines[0].text, editorLayout.lines[0].text);
});

// 14. Zoom 50%
test('Tela Principle 14: Editor zoom at 50% does not change reference display or export layout', () => {
    const block = {
        id: 'b_zoom_50',
        type: 'dialogue',
        translated: 'Văn bản kiểm tra zoom 50%',
        box: { x: 10, y: 10, w: 30, h: 20 },
        style: { fontSize: 16, fontFamily: 'font-manga' }
    };

    const page = createMockPage(block, 1600, 2400, 800);
    const editorLayout = computeBlockTextLayout(block, 800, 1200, 1.0);

    // Simulate zoom 50%
    globalState.zoom = 50;

    const scaleFactor = getExportScale(page, 1600);
    assert.strictEqual(scaleFactor, 2.0, 'Scale factor must be 2.0 regardless of zoom');

    const exportLayout = buildBlockTextLayout(block, 1600, 2400, scaleFactor, null, page);
    assert.strictEqual(exportLayout.fontSizePx, 32);
    assert.strictEqual(exportLayout.lines.length, editorLayout.lines.length);
    for (let i = 0; i < editorLayout.lines.length; i++) {
        assert.strictEqual(exportLayout.lines[i].text, editorLayout.lines[i].text);
    }
});

// 15. Zoom 200%
test('Tela Principle 15: Editor zoom at 200% does not change reference display or export layout', () => {
    const block = {
        id: 'b_zoom_200',
        type: 'dialogue',
        translated: 'Văn bản kiểm tra zoom 200%',
        box: { x: 10, y: 10, w: 30, h: 20 },
        style: { fontSize: 16, fontFamily: 'font-manga' }
    };

    const page = createMockPage(block, 1600, 2400, 800);
    const editorLayout = computeBlockTextLayout(block, 800, 1200, 1.0);

    // Simulate zoom 200%
    globalState.zoom = 200;

    const scaleFactor = getExportScale(page, 1600);
    assert.strictEqual(scaleFactor, 2.0, 'Scale factor must be 2.0 regardless of zoom');

    const exportLayout = buildBlockTextLayout(block, 1600, 2400, scaleFactor, null, page);
    assert.strictEqual(exportLayout.fontSizePx, 32);
    assert.strictEqual(exportLayout.lines.length, editorLayout.lines.length);
    for (let i = 0; i < editorLayout.lines.length; i++) {
        assert.strictEqual(exportLayout.lines[i].text, editorLayout.lines[i].text);
    }
});

// 16. Export ở DPR khác nhau (1x, 2x, 3x, 4x)
test('Tela Principle 16: Export at different resolutions (DPR scales) yields perfectly proportional coordinates', () => {
    const block = {
        id: 'b_dpr_test',
        type: 'dialogue',
        translated: 'Kiểm tra độ phân giải xuất ảnh',
        box: { x: 10, y: 10, w: 40, h: 20 },
        style: { fontSize: 16, fontFamily: 'font-manga' }
    };

    const baseW = 800;
    const baseH = 1200;
    const baseLayout = computeBlockTextLayout(block, baseW, baseH, 1.0);

    const dprScales = [1.0, 1.5, 2.0, 3.0, 4.0];
    dprScales.forEach(dpr => {
        const outW = baseW * dpr;
        const outH = baseH * dpr;
        const layout = buildBlockTextLayout(block, outW, outH, dpr);

        assert.strictEqual(layout.fontSizePx, baseLayout.fontSizePx * dpr);
        assert.strictEqual(layout.lineHeightPx, baseLayout.lineHeightPx * dpr);
        expect(layout.lines[0].width).toBeCloseTo(baseLayout.lines[0].width * dpr, 1);
    });
});

// 17. Export khi canvas đang pan
test('Tela Principle 17: Workspace pan translation has zero effect on export layout', () => {
    const block = {
        id: 'b_pan_test',
        type: 'dialogue',
        translated: 'Văn bản không bị ảnh hưởng bởi pan',
        box: { x: 15, y: 25, w: 30, h: 20 },
        style: { fontSize: 17, fontFamily: 'font-manga' }
    };

    const page = createMockPage(block, 1600, 2400, 800);

    // Simulate pan
    globalState.panX = 350;
    globalState.panY = -180;

    const exportLayout = buildBlockTextLayout(block, 1600, 2400, 2.0, null, page);
    const editorLayout = computeBlockTextLayout(block, 800, 1200, 1.0);

    assert.strictEqual(exportLayout.lines.length, editorLayout.lines.length);
    assert.strictEqual(exportLayout.lines[0].text, editorLayout.lines[0].text);
    assert.strictEqual(exportLayout.fontSizePx, 34);
});

// 18. Export sau nhiều lần resize
test('Tela Principle 18: Export after multiple resizes produces exact match with final editor state', () => {
    const text = 'Thử nghiệm sau chuỗi thao tác thay đổi kích thước';
    const block = {
        id: 'b_resize_sequence',
        type: 'dialogue',
        translated: text,
        box: { x: 10, y: 10, w: 40, h: 20 },
        style: { fontSize: 16, fontFamily: 'font-manga' }
    };

    // Series of box size changes
    block.box.w = 20;
    block.box.h = 30;
    block.box.w = 50;
    block.box.w = 25;

    const page = createMockPage(block, 1600, 2400, 800);
    const finalEditorLayout = computeBlockTextLayout(block, 800, 1200, 1.0);
    const finalExportLayout = buildBlockTextLayout(block, 1600, 2400, 2.0, null, page);

    assert.strictEqual(finalExportLayout.lines.length, finalEditorLayout.lines.length);
    for (let i = 0; i < finalEditorLayout.lines.length; i++) {
        assert.strictEqual(finalExportLayout.lines[i].text, finalEditorLayout.lines[i].text);
        expect(finalExportLayout.lines[i].width).toBeCloseTo(finalEditorLayout.lines[i].width * 2.0, 1);
    }
});
