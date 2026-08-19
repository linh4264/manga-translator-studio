import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import {
    wrapCanvasText,
    wrapCanvasDiamondText,
    wrapRichTextTokens,
    balanceTextToDiamond,
    getDiamondWidthProfile,
    measureWordTokens,
    partitionWordsToTargetWidths,
    partitionWordsToDiamondLines
} from '../../../src/features/canvas/canvas-renderer.ts';
import { parseRichTextLines } from '../../../src/core/utils.ts';

test('Diamond Width Profile - 5 lines profile matches exact target ratios & 300px scale', () => {
    // 5 lines target ratios: 0.55, 0.82, 1.00, 0.82, 0.55
    const profile5 = getDiamondWidthProfile(5, 0.85);
    assert.deepStrictEqual(profile5, [0.55, 0.82, 1.00, 0.82, 0.55], '5 lines profile must be [0.55, 0.82, 1.00, 0.82, 0.55]');

    // Box width 300px test: [165, 246, 300, 246, 165]
    const boxW = 300;
    const scaledWidths = profile5.map(r => Math.round(r * boxW));
    assert.deepStrictEqual(scaledWidths, [165, 246, 300, 246, 165], 'Scaled widths for 300px box must be [165, 246, 300, 246, 165]');
});

test('Diamond Width Profile - adapts smoothly to boxAspect', () => {
    // Wide horizontal bubble (boxAspect = 1.5) -> Flatter oval (wider edge lines)
    const wideProfile = getDiamondWidthProfile(5, 1.5);
    assert.ok(wideProfile[0] > 0.55, 'Wide bubble should have wider edge line ratios');
    assert.strictEqual(wideProfile[2], 1.0, 'Middle line ratio must remain 1.0');

    // Tall vertical bubble (boxAspect = 0.4) -> Steeper oval (tapered edge lines)
    const tallProfile = getDiamondWidthProfile(5, 0.4);
    assert.ok(tallProfile[0] < 0.55, 'Tall narrow bubble should have more tapered edge lines');
    assert.strictEqual(tallProfile[2], 1.0, 'Middle line ratio must remain 1.0');
});

test('Rich Text Measurement - accounts for font, fontSize, bold, italic, sizeRatio, letterSpacing', () => {
    const text = 'Normal [size=150%]Normal[/size]';
    const mockCtx = {
        font: '16px sans-serif',
        measureText: function(str) {
            let fontSize = 16;
            const match = String(this.font || '').match(/(\d+)px/);
            if (match) fontSize = parseInt(match[1], 10);
            return { width: str.length * (fontSize * 0.55) };
        }
    };

    // 1. Test sizeRatio: 150% size must have strictly larger width than 100% size
    const tokens = measureWordTokens(text, { fontSize: 16 }, mockCtx);
    assert.strictEqual(tokens.length, 2);
    const normalWord = tokens[0];
    const largeWord = tokens[1];
    assert.strictEqual(largeWord.style.sizeRatio, 1.5);
    assert.ok(largeWord.width > normalWord.width, '150% word width must be strictly larger than normal word width');
    assert.strictEqual(Math.round(largeWord.width / normalWord.width * 10) / 10, 1.5, '150% word should be 1.5x width of normal word');

    // 2. Test letterSpacing: extra letter spacing must increase measured word width
    const wordWithoutSpacing = measureWordTokens('Hello', { fontSize: 16, letterSpacing: 0 }, mockCtx)[0];
    const wordWithSpacing = measureWordTokens('Hello', { fontSize: 16, letterSpacing: 4 }, mockCtx)[0];
    assert.ok(wordWithSpacing.width > wordWithoutSpacing.width, 'letterSpacing must increase total measured word width');
    assert.strictEqual(wordWithSpacing.width - wordWithoutSpacing.width, 4 * 4, '4 gaps of 4px letterSpacing = 16px extra');
});

test('Token Measurement - measureWordTokens returns { text, width, style } structure with Rich Text', () => {
    const text = '[b][color=#ef4444]Monkey[/color][/b] [size=150%]D.[/size] [i]Luffy[/i]';
    const mockCtx = {
        font: '16px sans-serif',
        measureText: (str) => ({ width: str.length * 10 })
    };

    const tokens = measureWordTokens(text, { fontSize: 16, fontFamily: 'font-manga' }, mockCtx);

    assert.strictEqual(tokens.length, 3, 'Should tokenize into 3 words');

    // Word 1: Monkey (bold, red)
    assert.strictEqual(tokens[0].text, 'Monkey');
    assert.strictEqual(tokens[0].style.bold, true);
    assert.strictEqual(tokens[0].style.color, '#ef4444');
    assert.ok(tokens[0].width > 0, 'Width must be measured (>0)');
    assert.ok(tokens[0].raw.includes('[b][color=#ef4444]Monkey[/color][/b]'));

    // Word 2: D. (size=150%)
    assert.strictEqual(tokens[1].text, 'D.');
    assert.strictEqual(tokens[1].style.sizeRatio, 1.5);
    assert.ok(tokens[1].width > 0);

    // Word 3: Luffy (italic)
    assert.strictEqual(tokens[2].text, 'Luffy');
    assert.strictEqual(tokens[2].style.italic, true);
    assert.ok(tokens[2].width > 0);
});

test('DP Word Partition - partitionWordsToTargetWidths satisfies 5 priorities', () => {
    // 8 words with varying lengths
    const words = [
        { text: 'Xin', raw: 'Xin', width: 25, style: {}, spaceWidth: 6 },
        { text: 'chào', raw: 'chào', width: 35, style: {}, spaceWidth: 6 },
        { text: 'tất', raw: 'tất', width: 22, style: {}, spaceWidth: 6 },
        { text: 'cả', raw: 'cả', width: 18, style: {}, spaceWidth: 6 },
        { text: 'mọi', raw: 'mọi', width: 28, style: {}, spaceWidth: 6 },
        { text: 'người', raw: 'người', width: 45, style: {}, spaceWidth: 6 },
        { text: 'ở', raw: 'ở', width: 15, style: {}, spaceWidth: 6 },
        { text: 'đây', raw: 'đây', width: 30, style: {}, spaceWidth: 6 }
    ];

    // Target widths for 3 lines (Diamond curve: middle line is widest)
    const targetWidths = [70, 110, 70];
    const lines = partitionWordsToTargetWidths(words, targetWidths, 6);

    assert.strictEqual(lines.length, 3, 'Must partition into exactly 3 lines');

    // Priority 5: Entire words kept intact, no split words
    const joined = lines.join(' ');
    assert.strictEqual(joined, 'Xin chào tất cả mọi người ở đây');

    // Priority 3: No single-word orphan line on line 3
    const line3Words = lines[2].split(' ');
    assert.ok(line3Words.length >= 2, 'Last line should have at least 2 words (anti-orphan)');

    // Priority 2: Middle line contains more text / wider width than edge lines
    const line1Len = lines[0].length;
    const line2Len = lines[1].length;
    assert.ok(line2Len >= line1Len, 'Middle line should be equal or longer than first line');
});

test('Canvas Text - wrapCanvasText with Rich Text Tags', () => {
    const mockCtx = {
        measureText: (str) => ({ width: str.length * 10 })
    };

    const text = 'Tôi là **Monkey D. Luffy** người sẽ trở thành Vua Hải Tặc tương lai';
    const lines = wrapCanvasText(mockCtx, text, 200);

    assert.ok(lines.length > 1, 'Should wrap long sentence into multiple lines');
    const combined = lines.join(' ');
    assert.ok(combined.includes('**Monkey D. Luffy**'), 'Should preserve markdown tags in wrapped lines');
});

test('Canvas Text - wrapCanvasDiamondText (Oval / Diamond Shaping with Unified Token Measurement)', () => {
    const mockCtx = {
        font: '16px sans-serif',
        measureText: (str) => ({ width: str.length * 8 })
    };

    const text = 'Một hai ba bốn năm sáu bảy tám chín mười mười một mười hai';
    const lines = wrapCanvasDiamondText(mockCtx, text, 250, 200, 24);

    assert.ok(lines.length >= 2, 'Should create balanced diamond lines');
    if (lines.length >= 3) {
        const midIdx = Math.floor(lines.length / 2);
        const midLen = lines[midIdx].length;
        const firstLen = lines[0].length;
        assert.ok(midLen >= firstLen, 'Middle line should be equal or longer than first line in diamond wrap');
    }
});

test('Canvas Text - wrapRichTextTokens preserves colors across wrapped lines', () => {
    const mockCtx = {
        measureText: (str) => ({ width: str.length * 10 })
    };

    const fullText = '[color=#ef4444]ĐANG Ở LỚP TIỀN BỐI MÀ,[/color] [color=#3b82f6][u]SAO MÀ KHÔNG CĂNG THẲNG CHO ĐƯỢC...![/u][/color]';
    const tokenLines = parseRichTextLines(fullText);
    const wrapped = wrapRichTextTokens(mockCtx, tokenLines, 120, false);

    assert.ok(wrapped.length >= 3, 'Should wrap long colored phrase into at least 3 lines');

    wrapped.forEach((lineToks) => {
        lineToks.forEach(tok => {
            if (['ĐANG', 'Ở', 'LỚP', 'TIỀN', 'BỐI', 'MÀ,'].includes(tok.text.trim())) {
                assert.strictEqual(tok.color, '#ef4444', `Word "${tok.text}" must have red color`);
            } else if (['SAO', 'MÀ', 'KHÔNG', 'CĂNG', 'THẲNG', 'CHO', 'ĐƯỢC...!'].includes(tok.text.trim())) {
                assert.strictEqual(tok.color, '#3b82f6', `Word "${tok.text}" must have blue color`);
                assert.strictEqual(tok.underline, true, `Word "${tok.text}" must be underlined`);
            }
        });
    });
});

test('Canvas Text - balanceTextToDiamond balances text based on actual width', () => {
    const richText = '[color=#ef4444]ĐANG Ở LỚP TIỀN BỐI MÀ,[/color] [color=#3b82f6][u]SAO MÀ KHÔNG CĂNG THẲNG CHO ĐƯỢC...![/u][/color]';
    const balanced = balanceTextToDiamond(richText, 300, 400);

    assert.ok(balanced.includes('\n'), 'Should contain line breaks');
    const lines = balanced.split('\n');
    assert.ok(lines.length >= 2 && lines.length <= 5, `Balanced lines count should be between 2 and 5, got: ${lines.length}`);
    assert.ok(balanced.includes('[color=#ef4444]'), 'Should preserve red color tag');
    assert.ok(balanced.includes('[color=#3b82f6]'), 'Should preserve blue color tag');
});

test('Manual Line Breaks - Preserves user explicit newlines without merging', () => {
    // Exact user test case
    const userInput = 'Đừng đi.\nTôi xin cậu.';
    const balanced = balanceTextToDiamond(userInput, 300, 400);

    assert.strictEqual(balanced, 'Đừng đi.\nTôi xin cậu.', 'User manual line breaks must be strictly preserved without merging');

    // Multi-paragraph test: Paragraph 1 is short, Paragraph 2 is long
    const multiPara = 'Chào các bạn!\nĐây là một câu thoại rất dài trong truyện tranh cần được chia theo hình oval kim cương đẹp mắt.';
    const balancedMulti = balanceTextToDiamond(multiPara, 250, 200);
    const lines = balancedMulti.split('\n');

    assert.strictEqual(lines[0], 'Chào các bạn!', 'First paragraph should remain on its own line');
    assert.ok(lines.length >= 3, 'Second paragraph should be diamond-balanced into multiple lines');
});

