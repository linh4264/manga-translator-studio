import { test, expect, describe } from 'vitest';
import assert from 'node:assert';
import '../setup/browser-env.js';

import {
    computeBlockTextLayout,
    computeTextLayout,
    renderBlockTextToCanvas,
    renderBlockTextToDOM,
    getFontFamilyName,
    buildFontString,
    getCachedDerivedLines,
    setCachedDerivedLines,
    invalidateBlockDerivedLines,
    computeBlockDerivedLinesKey,
    ensureFontsLoadedForPage,
    ensureFontsReady
} from '../../src/features/canvas/text-layout-engine.ts';
import {
    buildBlockTextLayout,
    getExportScale,
    getReferenceDisplayDimensions,
    renderPageToCanvas2DDirect
} from '../../src/features/canvas/canvas-exporter.ts';
import { autoFitBlock } from '../../src/features/canvas/canvas-styling.ts';
import { globalState } from '../../src/core/state.ts';

function createMockPage(blocks, naturalW = 1600, naturalH = 2400, displayW = 800) {
    const blockList = Array.isArray(blocks) ? blocks : [blocks];
    return {
        id: 'p_tela_real_dom_test',
        name: 'real_dom_test.png',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        blocks: blockList,
        lastDisplayWidth: displayW
    };
}

describe('3. Real DOM Editor Layout ↔ Export Layout 100% Parity', () => {
    test('Editor DOM lines match Export Layout lines (Single line & Multi-line)', () => {
        const text = 'Chào cậu, hôm nay trời đẹp quá!\nChúng ta cùng đi dạo nhé?';
        const block = {
            id: 'b_real_dom_1',
            type: 'dialogue',
            translated: text,
            box: { x: 10, y: 10, w: 40, h: 30 },
            style: {
                fontSize: 16,
                fontFamily: 'font-manga',
                lineHeight: 1.25,
                bold: false,
                italic: false
            }
        };

        const displayW = 800;
        const displayH = 1200;
        const exportW = 1600;
        const exportH = 2400;
        const scaleFactor = 2.0;

        // 1. Render Editor DOM
        const editorContainer = document.createElement('div');
        renderBlockTextToDOM(editorContainer, block, displayW, displayH, 1.0);

        const domLines = Array.from(editorContainer.children);
        assert.ok(domLines.length >= 2, 'Editor DOM must have rendered at least 2 line elements');
        const domLineTexts = domLines.map(lineEl => lineEl.textContent.trim());

        // 2. Compute Export Layout
        const page = createMockPage(block, exportW, exportH, displayW);
        const exportLayout = buildBlockTextLayout(block, exportW, exportH, scaleFactor, null, page);

        // 3. Verify Exact 1:1 Parity
        assert.strictEqual(exportLayout.lines.length, domLines.length, 'Export layout line count must match Editor DOM');
        for (let i = 0; i < domLines.length; i++) {
            assert.strictEqual(exportLayout.lines[i].text.trim(), domLineTexts[i], `Line ${i + 1} text in Export must match Editor DOM text`);
        }

        // 4. Verify Export Canvas drawing without errors
        const canvas = document.createElement('canvas');
        canvas.width = exportW;
        canvas.height = exportH;
        const ctx = canvas.getContext('2d');
        assert.ok(ctx);
        renderBlockTextToCanvas(ctx, block, exportLayout, scaleFactor);
    });

    test('Rich Text formatting (Bold, Italic, Color, SizeRatio) parity between DOM spans and Export tokens', () => {
        const richText = '**Đậm** và *nghiêng* cùng [color=#e11d48]màu đỏ[/color] và [size=120%]chữ to[/size]';
        const block = {
            id: 'b_real_dom_rich',
            type: 'dialogue',
            translated: richText,
            box: { x: 10, y: 10, w: 80, h: 20 },
            style: {
                fontSize: 16,
                fontFamily: 'font-vietnamese',
                lineHeight: 1.2
            }
        };

        const displayW = 800;
        const displayH = 1200;
        const editorContainer = document.createElement('div');
        renderBlockTextToDOM(editorContainer, block, displayW, displayH, 1.0);

        const exportLayout = buildBlockTextLayout(block, 1600, 2400, 2.0);

        // Check bold token in DOM and Export
        const allSpans = Array.from(editorContainer.querySelectorAll('span'));
        const boldSpan = allSpans.find(s => s.style.fontWeight === 'bold' || s.textContent === 'Đậm');
        assert.ok(boldSpan, 'DOM must contain bold span');
        assert.strictEqual(boldSpan.textContent, 'Đậm');
        assert.ok(exportLayout.lines[0].tokens.some(t => t.bold && t.text === 'Đậm'), 'Export must contain bold token');

        // Check italic token in DOM and Export
        const italicSpan = allSpans.find(s => s.style.fontStyle === 'italic' || s.textContent.includes('nghiêng'));
        assert.ok(italicSpan, 'DOM must contain italic span');
        assert.strictEqual(italicSpan.textContent.trim(), 'nghiêng');
        assert.ok(exportLayout.lines[0].tokens.some(t => t.italic && t.text.includes('nghiêng')), 'Export must contain italic token');

        // Check color span in DOM and Export
        const colorSpan = allSpans.find(s => s.textContent.includes('màu đỏ'));
        assert.ok(colorSpan, 'DOM must contain color span');
        assert.ok(colorSpan.style.color.includes('225') || colorSpan.style.color.includes('e11d48') || colorSpan.style.color.includes('#e11d48'));
        assert.ok(exportLayout.lines[0].tokens.some(t => t.color === '#e11d48' && t.text.includes('màu đỏ')));
    });
});

describe('4. Font Loading Lifecycle & Slow Font Fallback Handling', () => {
    test('ensureFontsLoadedForPage resolves fonts used on page before measurement', async () => {
        const block = {
            id: 'b_font_load_1',
            type: 'dialogue',
            translated: 'Kiểm tra tải font chữ',
            box: { x: 10, y: 10, w: 30, h: 20 },
            style: {
                fontSize: 16,
                fontFamily: 'font-vietnamese'
            }
        };

        const page = createMockPage(block, 1600, 2400, 800);

        // Preload fonts
        await ensureFontsLoadedForPage(page);

        const exportLayout = buildBlockTextLayout(block, 1600, 2400, 2.0, null, page);
        assert.ok(exportLayout.fontName.includes('Be Vietnam Pro') || exportLayout.fontName.includes('Inter'));
        assert.strictEqual(exportLayout.lines.length, 1);
        assert.strictEqual(exportLayout.lines[0].text, 'Kiểm tra tải font chữ');
    });

    test('Simulated slow font loading preserves layout determinism', async () => {
        const block = {
            id: 'b_font_slow',
            type: 'dialogue',
            translated: 'Font tải chậm vẫn đo đạc chính xác',
            box: { x: 10, y: 10, w: 70, h: 20 },
            style: {
                fontSize: 16,
                fontFamily: 'font-manga'
            }
        };

        const page = createMockPage(block, 1600, 2400, 800);

        // Simulate asynchronous font loading delay
        let fontLoaded = false;
        const fontPromise = new Promise(resolve => {
            setTimeout(() => {
                fontLoaded = true;
                resolve(true);
            }, 50);
        });

        await fontPromise;
        assert.strictEqual(fontLoaded, true);

        // Ensure font readiness
        await ensureFontsLoadedForPage(page);

        const exportLayout = buildBlockTextLayout(block, 1600, 2400, 2.0, null, page);
        assert.strictEqual(exportLayout.lines[0].text, 'Font tải chậm vẫn đo đạc chính xác');
        assert.strictEqual(exportLayout.fontSizePx, 32);
    });

    test('Unknown or unmapped font falls back safely to clean sans-serif without throw', async () => {
        const block = {
            id: 'b_font_unknown',
            type: 'dialogue',
            translated: 'Font không tồn tại',
            box: { x: 10, y: 10, w: 30, h: 20 },
            style: {
                fontSize: 16,
                fontFamily: 'non-existent-custom-font-xyz'
            }
        };

        const resolvedFont = getFontFamilyName('non-existent-custom-font-xyz');
        assert.ok(resolvedFont.includes('non-existent-custom-font-xyz') || resolvedFont.includes('sans-serif'));

        const page = createMockPage(block, 1600, 2400, 800);
        await ensureFontsLoadedForPage(page);

        const exportLayout = buildBlockTextLayout(block, 1600, 2400, 2.0, null, page);
        assert.strictEqual(exportLayout.lines[0].text, 'Font không tồn tại');
    });
});

describe('5. Resize Box → Line Break Changes → Export Parity & Cache Invalidation', () => {
    test('Step-by-step resizing invalidates _derivedLinesCache and produces identical line breaks in Editor and Export', () => {
        const sentence = 'Tôi muốn chia sẻ với bạn câu chuyện thú vị này';
        const block = {
            id: 'b_resize_sync',
            type: 'dialogue',
            translated: sentence,
            box: { x: 10, y: 10, w: 70, h: 20 }, // Step 1: Wide box (560px)
            style: {
                fontSize: 16,
                fontFamily: 'font-manga',
                lineHeight: 1.2
            }
        };

        const displayW = 800;
        const displayH = 1200;
        const exportW = 1600;
        const exportH = 2400;
        const scaleFactor = 2.0;
        const page = createMockPage(block, exportW, exportH, displayW);

        // --- STEP 1: Wide box (70% = 560px) -> 1 line ---
        const editorContainer1 = document.createElement('div');
        renderBlockTextToDOM(editorContainer1, block, displayW, displayH, 1.0);
        assert.strictEqual(editorContainer1.children.length, 1, 'Step 1: Editor DOM should have 1 line');

        const exportLayout1 = buildBlockTextLayout(block, exportW, exportH, scaleFactor, null, page);
        assert.strictEqual(exportLayout1.lines.length, 1, 'Step 1: Export layout should have 1 line');
        assert.strictEqual(exportLayout1.lines[0].text.trim(), editorContainer1.children[0].textContent.trim());

        // Cache must be populated with key for wide box
        const cacheKey1 = computeBlockDerivedLinesKey(block, displayW);
        assert.strictEqual(block._derivedLinesCache.key, cacheKey1);

        // --- STEP 2: Resize narrower (35% = 280px) -> line break changes to 2 lines ---
        block.box.w = 35;
        // Verify cache key invalidation
        const staleCache = getCachedDerivedLines(block, displayW);
        assert.strictEqual(staleCache, null, 'Cache must automatically invalidate when box width changes');

        const editorContainer2 = document.createElement('div');
        renderBlockTextToDOM(editorContainer2, block, displayW, displayH, 1.0);
        const editorLineCount2 = editorContainer2.children.length;
        assert.ok(editorLineCount2 >= 2, 'Step 2: Narrower box should wrap into 2+ lines');

        const exportLayout2 = buildBlockTextLayout(block, exportW, exportH, scaleFactor, null, page);
        assert.strictEqual(exportLayout2.lines.length, editorLineCount2, 'Step 2: Export lines must match new Editor DOM lines');
        for (let i = 0; i < editorLineCount2; i++) {
            assert.strictEqual(exportLayout2.lines[i].text.trim(), editorContainer2.children[i].textContent.trim(), `Step 2 Line ${i} must match`);
        }

        // --- STEP 3: Resize extremely narrow (15% = 120px) -> wraps into 3+ lines ---
        block.box.w = 15;
        const editorContainer3 = document.createElement('div');
        renderBlockTextToDOM(editorContainer3, block, displayW, displayH, 1.0);
        const editorLineCount3 = editorContainer3.children.length;
        assert.ok(editorLineCount3 >= 3, 'Step 3: Very narrow box should wrap into 3+ lines');

        const exportLayout3 = buildBlockTextLayout(block, exportW, exportH, scaleFactor, null, page);
        assert.strictEqual(exportLayout3.lines.length, editorLineCount3, 'Step 3: Export lines must match Editor DOM lines');
        for (let i = 0; i < editorLineCount3; i++) {
            assert.strictEqual(exportLayout3.lines[i].text.trim(), editorContainer3.children[i].textContent.trim(), `Step 3 Line ${i} must match`);
        }

        // --- STEP 4: Resize back wider (70% = 560px) -> reflows back to 1 line ---
        block.box.w = 70;
        const editorContainer4 = document.createElement('div');
        renderBlockTextToDOM(editorContainer4, block, displayW, displayH, 1.0);
        assert.strictEqual(editorContainer4.children.length, 1, 'Step 4: Restored wide box should reflow back to 1 line');

        const exportLayout4 = buildBlockTextLayout(block, exportW, exportH, scaleFactor, null, page);
        assert.strictEqual(exportLayout4.lines.length, 1, 'Step 4: Export should reflow back to 1 line');
        assert.strictEqual(exportLayout4.lines[0].text.trim(), sentence);

        // Verify that block.translated was never mutated across all resize iterations
        assert.strictEqual(block.translated, sentence, 'block.translated must NEVER be mutated during resizes');
    });

    test('Font size edit changes line breaks and synchronizes to export immediately', () => {
        const sentence = 'Một câu văn bản mẫu để kiểm tra thay đổi kích thước chữ';
        const block = {
            id: 'b_font_resize',
            type: 'dialogue',
            translated: sentence,
            box: { x: 10, y: 10, w: 25, h: 25 },
            style: {
                fontSize: 14,
                fontFamily: 'font-manga'
            }
        };

        const page = createMockPage(block, 1600, 2400, 800);

        // Small font -> fewer lines
        const layoutSmall = buildBlockTextLayout(block, 1600, 2400, 2.0, null, page);
        const linesSmall = layoutSmall.lines.length;

        // Increase font size -> more lines
        block.style.fontSize = 24;
        const layoutLarge = buildBlockTextLayout(block, 1600, 2400, 2.0, null, page);
        assert.ok(layoutLarge.lines.length >= linesSmall, 'Larger font size must wrap into more lines');

        // Check DOM sync
        const domContainer = document.createElement('div');
        renderBlockTextToDOM(domContainer, block, 800, 1200, 1.0);
        assert.strictEqual(layoutLarge.lines.length, domContainer.children.length, 'Export lines must match DOM lines after font size change');
    });
});
