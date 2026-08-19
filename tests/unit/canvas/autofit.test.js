import { test, expect, assert } from 'vitest';
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
