import { test, expect, assert } from 'vitest';
import '../../setup/browser-env.js';

import { wrapCanvasText, wrapCanvasDiamondText, wrapRichTextTokens, balanceTextToDiamond } from '../../../src/features/canvas/canvas-renderer.ts';
import { parseRichTextLines } from '../../../src/core/utils.ts';

test('Canvas Text - wrapCanvasText with Rich Text Tags', () => {
    const mockCtx = {
        measureText: (str) => ({ width: str.length * 10 })
    };

    const text = 'Tôi là **Monkey D. Luffy** người sẽ trở thành Vua Hải Tặc tương lai';
    const lines = wrapCanvasText(mockCtx, text, 200);

    assert.ok(lines.length > 1, 'Should wrap long sentence into multiple lines');
    // Ensure tags are preserved in wrapped output
    const combined = lines.join(' ');
    assert.ok(combined.includes('**Monkey D. Luffy**'), 'Should preserve markdown tags in wrapped lines');
});

test('Canvas Text - wrapCanvasDiamondText (Oval / Diamond Shaping)', () => {
    const mockCtx = {
        measureText: (str) => ({ width: str.length * 8 })
    };

    const text = 'Một hai ba bốn năm sáu bảy tám chín mười mười một mười hai';
    const lines = wrapCanvasDiamondText(mockCtx, text, 250, 200, 24);

    assert.ok(lines.length >= 2, 'Should create balanced diamond lines');
    // In diamond wrap, middle lines are longer than edge lines
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

    // Verify that all tokens in all lines retain their expected colors
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

test('Canvas Text - balanceTextToDiamond preserves rich text formatting', () => {
    const richText = '[color=#ef4444]ĐANG Ở LỚP TIỀN BỐI MÀ,[/color] [color=#3b82f6][u]SAO MÀ KHÔNG CĂNG THẲNG CHO ĐƯỢC...![/u][/color]';
    const balanced = balanceTextToDiamond(richText, 30, 40);

    assert.ok(balanced.includes('\n'), 'Should contain line breaks');
    const lines = balanced.split('\n');
    assert.ok(lines.length >= 2 && lines.length <= 4, `Balanced lines count should be between 2 and 4, got: ${lines.length}`);
    assert.ok(balanced.includes('[color=#ef4444]'), 'Should preserve red color tag');
    assert.ok(balanced.includes('[color=#3b82f6]'), 'Should preserve blue color tag');
});

