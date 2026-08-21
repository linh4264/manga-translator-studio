import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import {
    isBlockAutoFit,
    autoFitBlock,
    autoFitAllBlocksOnPage
} from '../../../src/features/canvas/canvas-styling.ts';
import { globalState } from '../../../src/core/state.ts';

test('Canvas AutoFit - Toggle and Override Precedence', () => {
    globalState.autoFitEnabled = true;

    // 1. Block with no explicit style.autoFit should fallback to globalState.autoFitEnabled
    const defaultBlock = { id: 'b1', style: { fontSize: 14 } };
    assert.strictEqual(isBlockAutoFit(defaultBlock), true);

    // 2. Block with style.autoFit = false must override global true
    const manualBlock = { id: 'b2', style: { fontSize: 24, autoFit: false } };
    assert.strictEqual(isBlockAutoFit(manualBlock), false);

    // 3. Block with style.autoFit = true must override global false
    globalState.autoFitEnabled = false;
    const explicitAutoBlock = { id: 'b3', style: { fontSize: 14, autoFit: true } };
    assert.strictEqual(isBlockAutoFit(explicitAutoBlock), true);

    // Reset
    globalState.autoFitEnabled = true;
});

test('Canvas AutoFit - Strict Manual Font Preservation During Batch Auto-Fit', () => {
    globalState.autoFitEnabled = true;

    const mockPage = {
        id: 'p_test',
        blocks: [
            {
                id: 'auto_b1',
                type: 'dialogue',
                translated: 'Đoạn văn tự động co dãn kích cỡ',
                box: { x: 20, y: 20, w: 30, h: 20 },
                style: { fontFamily: 'font-manga', fontSize: 12 }
            },
            {
                id: 'manual_b2',
                type: 'dialogue',
                translated: 'Đoạn văn chỉnh tay cố định 36px',
                box: { x: 50, y: 50, w: 30, h: 20 },
                style: { fontFamily: 'font-impact', fontSize: 36, autoFit: false }
            }
        ]
    };

    // Run batch autoFit
    autoFitAllBlocksOnPage(mockPage);

    // Manual block must retain exact 36px font size without being touched
    assert.strictEqual(mockPage.blocks[1].style.fontSize, 36, 'Manual block font size must be strictly preserved');
    assert.strictEqual(mockPage.blocks[1].style.autoFit, false);
});

test('Default Style - diamondWrap defaults to false', () => {
    import('../../../src/config/constants.ts').then(({ DEFAULT_BLOCK_STYLE }) => {
        assert.strictEqual(DEFAULT_BLOCK_STYLE.diamondWrap, false, 'DEFAULT_BLOCK_STYLE.diamondWrap must be false');
    });
});

test('Canvas AutoFit & Manual Line Breaks - Multi-line manual breaks scale font size appropriately', () => {
    globalState.autoFitEnabled = true;

    // Single long line block vs 3-line manually broken block in a square speech bubble (20% x 20%)
    const singleLineBlock = {
        id: 'b_single',
        type: 'dialogue',
        translated: 'Đây là một câu thoại dài cần được hiển thị',
        box: { x: 30, y: 30, w: 20, h: 20 },
        style: { fontFamily: 'font-manga', fontSize: 14 }
    };

    const multiLineBlock = {
        id: 'b_multi',
        type: 'dialogue',
        translated: 'Đây là một\ncâu thoại dài\ncần được hiển thị',
        box: { x: 30, y: 30, w: 20, h: 20 },
        style: { fontFamily: 'font-manga', fontSize: 14 }
    };

    autoFitBlock(singleLineBlock);
    autoFitBlock(multiLineBlock);

    // Multi-line block has shorter individual line widths, so AutoFit can fit larger font size in the same box
    assert.ok(multiLineBlock.style.fontSize >= singleLineBlock.style.fontSize,
        `Multi-line block font size (${multiLineBlock.style.fontSize}px) should be >= single-line block font size (${singleLineBlock.style.fontSize}px)`);

    // Ensure manual breaks are preserved without being flattened
    assert.strictEqual(multiLineBlock.translated, 'Đây là một\ncâu thoại dài\ncần được hiển thị', 'Manual line breaks must be strictly preserved');
});

test('Standard Balanced Line Wrap - balanceTextToBox breaks unbroken sentences into balanced lines for box aspect', () => {
    const { balanceTextToBox } = require('../../../src/features/canvas/canvas-renderer.ts');

    // Tall bubble aspect (150px x 280px) with 8 words sentence
    const text = 'Thế này thì còn ý nghĩa gì nữa chứ.';
    const balanced = balanceTextToBox(text, 150, 280, { fontFamily: 'font-manga', fontSize: 16 });

    assert.ok(balanced.includes('\n'), 'Sentence must be broken into multiple lines');
    const lines = balanced.split('\n');
    assert.ok(lines.length >= 2 && lines.length <= 4, `Should be broken into 2-4 lines, got ${lines.length}`);

    // Verify all original words are preserved
    const wordsInLines = lines.flatMap(l => l.split(' '));
    assert.strictEqual(wordsInLines.join(' '), text);

    // AutoFit on balanced text produces a readable font size (> 12px) instead of collapsing
    const block = {
        id: 'b_user_case',
        type: 'dialogue',
        translated: balanced,
        box: { x: 20, y: 20, w: 20, h: 40 },
        style: { fontFamily: 'font-manga', fontSize: 14 }
    };
    autoFitBlock(block);
    assert.ok(block.style.fontSize >= 12, `Font size should be readable (>=12px), got ${block.style.fontSize}px`);
});


