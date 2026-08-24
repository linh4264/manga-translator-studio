import { test } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import {
    computeBlockTextLayout,
    wrapParagraphCanva
} from '../../../src/features/canvas/text-layout-engine.ts';
import { parseRichTextLines } from '../../../src/core/utils.ts';

test('Text Layout Engine - wrapParagraphCanva wraps long text by availableWidth', () => {
    const text = 'Đây là một câu thoại có độ dài tương đối dài trong truyện tranh';
    const tokens = parseRichTextLines(text, {})[0];

    const lines = wrapParagraphCanva(tokens, 150, 16, 0, 'sans-serif', null);
    assert.ok(lines.length >= 2, 'Should wrap into multiple lines when text exceeds width');

    // All original words should be preserved across lines
    const reconstructed = lines.map(line => line.map(t => t.text).join('')).join(' ');
    assert.strictEqual(
        reconstructed.replace(/\s+/g, ' ').trim(),
        text.replace(/\s+/g, ' ').trim(),
        'All words must be preserved across wrapped lines'
    );
});

test('Text Layout Engine - preserves manual newlines (hard line breaks)', () => {
    const multiLine = 'Dòng 1\nDòng 2 ngắn\nDòng 3 dài hơn một chút';
    const block = {
        translated: multiLine,
        box: { x: 10, y: 10, w: 30, h: 30 },
        style: { fontSize: 16, fontFamily: 'font-manga' }
    };

    const layout = computeBlockTextLayout(block, 800, 1200, 1);
    assert.ok(layout.lines.length >= 3, 'Must have at least 3 lines matching manual breaks');
    assert.strictEqual(layout.lines[0].text.trim(), 'Dòng 1');
    assert.strictEqual(layout.lines[1].text.trim(), 'Dòng 2 ngắn');
});

test('Text Layout Engine - vertical text column layout', () => {
    const vertText = 'CÂU THOẠI DỌC\nTRONG MANGA';
    const block = {
        translated: vertText,
        box: { x: 20, y: 20, w: 20, h: 40 },
        style: { fontSize: 18, fontFamily: 'font-manga', vertical: true }
    };

    const layout = computeBlockTextLayout(block, 800, 1200, 1);
    assert.strictEqual(layout.isVertical, true);
    assert.strictEqual(layout.lines.length, 2, 'Should have 2 vertical columns for 2 paragraphs');
});

test('Text Layout Engine - rich text styling and inline tag parsing', () => {
    const rich = '[b]In đậm[/b] và [i]in nghiêng[/i] cùng [color=#ff0000]màu đỏ[/color]';
    const block = {
        translated: rich,
        box: { x: 10, y: 10, w: 40, h: 20 },
        style: { fontSize: 16, fontFamily: 'font-manga' }
    };

    const layout = computeBlockTextLayout(block, 800, 1200, 1);
    assert.ok(layout.lines.length >= 1);
    const tokens = layout.lines[0].tokens;
    assert.ok(tokens.some(t => t.bold && t.text.includes('In đậm')), 'Should parse bold token');
    assert.ok(tokens.some(t => t.italic && t.text.includes('in nghiêng')), 'Should parse italic token');
    assert.ok(tokens.some(t => t.color === '#ff0000' && t.text.includes('màu đỏ')), 'Should parse color token');
});
