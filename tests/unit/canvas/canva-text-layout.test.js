import { test, expect } from 'vitest';
import assert from 'node:assert';
import {
    computeTextLayout,
    computeBlockTextLayout,
    wrapParagraphCanva,
    extractStyledWordsFromTokens,
    breakLongWordToFit,
    partitionWordsBalanced,
    wrapWordsGreedy,
    renderDerivedLinesToDOM
} from '../../../src/features/canvas/text-layout-engine.ts';
import { buildBlockTextLayout } from '../../../src/features/canvas/canvas-exporter.ts';
import { autoFitBlock } from '../../../src/features/canvas/canvas-styling.ts';
import { parseRichTextLines } from '../../../src/core/utils.ts';

test('Canva Layout - Priority 1: Word wrapping keeps whole words unbroken when box is wide enough', () => {
    const text = 'Tôi muốn nói với cậu chuyện này';
    const tokens = parseRichTextLines(text);
    
    // Narrow box width (e.g. 120px) at 16px font
    const lines = wrapParagraphCanva(tokens[0], 120, 16, 0, 'sans-serif', null);
    
    // All lines must consist of whole words (no broken words)
    const reconstituted = lines.map(line => line.map(t => t.text).join('')).join(' ');
    assert.strictEqual(reconstituted, text);
    
    // Ensure words like "muốn", "chuyện" are intact in their respective lines
    const lineTexts = lines.map(l => l.map(t => t.text).join(''));
    lineTexts.forEach(lt => {
        const words = lt.split(/\s+/);
        words.forEach(w => {
            assert.ok(['Tôi', 'muốn', 'nói', 'với', 'cậu', 'chuyện', 'này'].includes(w), `Word "${w}" should be unbroken`);
        });
    });
});

test('Canva Layout - Priority 2: Balanced line breaking partitions words evenly without orphans', () => {
    const text = 'Đây là một câu thoại có độ dài vừa phải để kiểm tra cân bằng dòng';
    const tokens = parseRichTextLines(text);
    
    // Width that fits in ~3 lines
    const lines = wrapParagraphCanva(tokens[0], 180, 16, 0, 'sans-serif', null);
    
    assert.ok(lines.length >= 2, 'Should break into multiple balanced lines');
    // No line should have a 1-word orphan if total words >= 4
    lines.forEach((line, idx) => {
        const lineStr = line.map(t => t.text).join('').trim();
        const wordCount = lineStr.split(/\s+/).length;
        assert.ok(wordCount >= 2, `Line ${idx} ("${lineStr}") should have at least 2 words to avoid orphans`);
    });
});

test('Canva Layout - Priority 3: Long word fallback breaks word ONLY when word width exceeds available box width', () => {
    const superLongWord = 'SupercalifragilisticexpialidociousLongWordWithoutAnySpaces';
    const normalSentence = 'Đây là ' + superLongWord + ' trong câu';
    const tokens = parseRichTextLines(normalSentence);
    
    // Extremely narrow box (80px) where superLongWord cannot fit on any line as a whole
    const lines = wrapParagraphCanva(tokens[0], 80, 16, 0, 'sans-serif', null);
    
    assert.ok(lines.length > 2, 'Should wrap into multiple lines with the long word split');
    const fullText = lines.map(l => l.map(t => t.text).join('')).join('');
    // Ensure all characters of the long word are preserved in order
    assert.ok(fullText.includes(superLongWord), 'All characters of super-long word must be preserved');
});

test('Canva Layout - Resize Reversibility: Changing box width reflows text dynamically without mutating block.translated', () => {
    const originalText = 'Tôi muốn nói với cậu chuyện này';
    const block = {
        id: 'b_reversible',
        type: 'dialogue',
        original: '...',
        translated: originalText,
        box: { x: 10, y: 10, w: 50, h: 20 }, // Wide box (50% of 800 = 400px)
        style: {
            fontFamily: 'font-manga',
            fontSize: 16
        }
    };

    // 1. Wide box -> Fits on 1 line
    const layoutWide1 = computeBlockTextLayout(block, 800, 1200, 1.0);
    assert.strictEqual(layoutWide1.lines.length, 1, 'Wide box should have 1 line');
    assert.strictEqual(block.translated, originalText, 'block.translated must NEVER be mutated');

    // 2. Narrow box -> Reflows to 2 or 3 lines
    block.box.w = 15; // 15% of 800 = 120px
    const layoutNarrow = computeBlockTextLayout(block, 800, 1200, 1.0);
    assert.ok(layoutNarrow.lines.length >= 2, 'Narrow box should reflow to 2+ lines');
    assert.strictEqual(block.translated, originalText, 'block.translated must remain clean after narrow resize');

    // 3. Wide box again -> Reflows back to 1 line
    block.box.w = 50;
    const layoutWide2 = computeBlockTextLayout(block, 800, 1200, 1.0);
    assert.strictEqual(layoutWide2.lines.length, 1, 'Wider box again should reflow back to 1 line');
    assert.strictEqual(block.translated, originalText, 'block.translated must remain clean after restoring width');
});

test('Canva Layout - Manual Newlines: Explicit \\n creates independent paragraphs that wrap separately', () => {
    const textWithHardBreaks = 'Đoạn 1 là một câu khá dài cần tự wrap trong đoạn\nĐoạn 2 ngắn\nĐoạn 3 cũng là một câu dài khác cần tự wrap';
    const block = {
        id: 'b_hard_breaks',
        type: 'dialogue',
        translated: textWithHardBreaks,
        box: { x: 10, y: 10, w: 20, h: 40 }, // 160px width
        style: {
            fontSize: 16,
            fontFamily: 'font-manga'
        }
    };

    const layout = computeBlockTextLayout(block, 800, 1200, 1.0);
    assert.ok(layout.lines.length >= 4, 'Should wrap each paragraph independently yielding 4+ total lines');
    assert.strictEqual(block.translated, textWithHardBreaks, 'Hard breaks in block.translated must remain intact');
});

test('Canva Layout - Rich Text Styling: Tokens are measured with actual styling and adjacent styled spans merged', () => {
    const richText = '**Đậm 1** *nghiêng 2* [color=#ff0000]đỏ 3[/color]';
    const block = {
        id: 'b_rich',
        type: 'dialogue',
        translated: richText,
        box: { x: 10, y: 10, w: 40, h: 20 },
        style: {
            fontSize: 16,
            fontFamily: 'font-manga'
        }
    };

    const layout = computeBlockTextLayout(block, 800, 1200, 1.0);
    assert.strictEqual(layout.lines.length, 1);
    const tokens = layout.lines[0].tokens;
    
    // Bold token check
    assert.ok(tokens.some(t => t.bold && t.text.includes('Đậm 1')), 'Bold token should be preserved');
    // Italic token check
    assert.ok(tokens.some(t => t.italic && t.text.includes('nghiêng 2')), 'Italic token should be preserved');
    // Color token check
    assert.ok(tokens.some(t => t.color === '#ff0000' && t.text.includes('đỏ 3')), 'Color token should be preserved');
});

test('Canva Layout - Parity: Exporter layout matches DOM layout exactly', () => {
    const text = 'Một câu thoại cần xuất ảnh chính xác 100% như trên trình chỉnh sửa';
    const block = {
        id: 'b_parity',
        type: 'dialogue',
        translated: text,
        box: { x: 20, y: 20, w: 25, h: 25 },
        style: {
            fontSize: 16,
            fontFamily: 'font-manga'
        }
    };

    const domLayout = computeBlockTextLayout(block, 800, 1200, 1.0);
    const exportLayout = buildBlockTextLayout(block, 800, 1200, 1.0);

    assert.strictEqual(exportLayout.lines.length, domLayout.lines.length, 'Line counts must match');
    for (let i = 0; i < domLayout.lines.length; i++) {
        assert.strictEqual(exportLayout.lines[i].text, domLayout.lines[i].text, `Line ${i} text must match exactly`);
        expect(exportLayout.lines[i].width).toBeCloseTo(domLayout.lines[i].width, 2);
        expect(exportLayout.lines[i].top).toBeCloseTo(domLayout.lines[i].top, 2);
        expect(exportLayout.lines[i].centerY).toBeCloseTo(domLayout.lines[i].centerY, 2);
    }
});

test('Canva AutoFit - Scales font size down on overflow and up on enlarge without mutating text', () => {
    const originalText = 'Một đoạn văn bản dài cần kiểm tra tính năng AutoFit tự động co giãn kích thước chữ';
    const block = {
        id: 'b_autofit',
        type: 'dialogue',
        translated: originalText,
        box: { x: 10, y: 10, w: 10, h: 5 }, // Tiny box: 80px x 60px
        style: {
            fontSize: 24,
            baseFontSize: 24,
            fontFamily: 'font-manga',
            autoFit: true
        }
    };

    // 1. In tiny box, AutoFit reduces font size
    autoFitBlock(block);
    const reducedFontSize = block.style.fontSize;
    assert.ok(reducedFontSize < 24, `Font size should reduce from 24px in tiny box (got ${reducedFontSize}px)`);
    assert.strictEqual(block.translated, originalText, 'block.translated must NEVER be mutated during AutoFit');

    // 2. In larger box, AutoFit scales back up towards baseFontSize
    block.box.w = 50;
    block.box.h = 40;
    block.autoFitCache = null;
    autoFitBlock(block);
    assert.ok(block.style.fontSize > reducedFontSize, `Font size should scale back up in larger box (got ${block.style.fontSize}px)`);
    assert.strictEqual(block.translated, originalText, 'block.translated must remain clean');
});
