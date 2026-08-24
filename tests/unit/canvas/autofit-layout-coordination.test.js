import { test } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import {
    autoFitBlock,
    isBlockAutoFit
} from '../../../src/features/canvas/canvas-styling.ts';
import { computeBlockTextLayout } from '../../../src/features/canvas/text-layout-engine.ts';
import { globalState } from '../../../src/core/state.ts';

function setupMockEnvironment(mockBlock) {
    globalState.autoFitEnabled = true;
    globalState.pages = [{
        id: 'p_test',
        blocks: [mockBlock],
        lastDisplayWidth: 800
    }];
    globalState.activePageIndex = 0;
    globalState.selectedBlockId = mockBlock.id;
}

test('AutoFit - Scales fontSize to fit box without mutating translated text', () => {
    const rawText = 'Tôi nhất định sẽ trở thành một hải tặc vĩ đại được cả thế giới công nhận!';
    const mockBlock = {
        id: 'b_test_a',
        type: 'dialogue',
        original: '海賊王に俺はなる',
        translated: rawText,
        box: { x: 20, y: 20, w: 15, h: 15 },
        style: {
            fontFamily: 'font-manga',
            fontSize: 24,
            baseFontSize: 24,
            bold: false,
            vertical: false,
            padding: '9% 12%'
        }
    };

    setupMockEnvironment(mockBlock);

    autoFitBlock(mockBlock);

    assert.ok(mockBlock.style.fontSize > 0, 'Computed fontSize must be positive');
    assert.ok(mockBlock.style.fontSize <= 24, 'AutoFit should decrease font size for tight box');
    assert.strictEqual(mockBlock.translated, rawText, 'AutoFit must never alter translated text content');
});

test('AutoFit - Respects user manual newlines without altering breaks', () => {
    const multiLine = 'Dòng 1: Ngắn\nDòng 2: Rất dài hơn một chút ở đây';
    const mockBlock = {
        id: 'b_test_breaks',
        type: 'dialogue',
        translated: multiLine,
        box: { x: 10, y: 10, w: 25, h: 25 },
        style: {
            fontFamily: 'font-manga',
            fontSize: 20,
            baseFontSize: 20
        }
    };

    setupMockEnvironment(mockBlock);

    autoFitBlock(mockBlock);

    assert.strictEqual(mockBlock.translated, multiLine, 'AutoFit must strictly preserve manual newlines');
    const layout = computeBlockTextLayout(mockBlock, 800, 1200, 1);
    assert.ok(layout.lines.length >= 2, 'Layout must contain at least 2 lines');
});
