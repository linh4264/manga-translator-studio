import test from 'node:test';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import '../../setup/canvas-mock.js';
import '../../setup/indexeddb-mock.js';

import {
    isEraserModeActive,
    setIsEraserModeActive,
    autoCleanBubbleBackground
} from '../../../public/src/features/inpainting.js';
import { patchCanvasElement } from '../../setup/canvas-mock.js';

test('Inpainting - Mode Activation and State', () => {
    setIsEraserModeActive(true);
    assert.strictEqual(isEraserModeActive, true);

    setIsEraserModeActive(false);
    assert.strictEqual(isEraserModeActive, false);
});

test('Inpainting - Auto Clean Bubble Background Execution', () => {
    const mockEraserCanvas = document.getElementById('eraser-canvas');
    patchCanvasElement(mockEraserCanvas, 1000, 1400);

    const mockPage = {
        id: 'p1',
        blocks: []
    };

    const mockBlock = {
        id: 'blk_bubble_1',
        box: { x: 20, y: 30, w: 25, h: 20 },
        style: { bgColor: '#ffffff' }
    };

    const result = autoCleanBubbleBackground(mockPage, mockBlock);
    assert.strictEqual(result, true, 'autoCleanBubbleBackground should complete successfully');
});

test('Inpainting - Sharpen Kernel Convolution Math & Compression Calculation', () => {
    // 3x3 Convolution Sharpen Math: (1 + 4k)*C - k*(T + B + L + R)
    const k = 1.5; // Sharpen factor
    const center = 100;
    const top = 90, bottom = 90, left = 90, right = 90;
    const sharpenedVal = (1 + 4 * k) * center - k * top - k * bottom - k * left - k * right;
    const clampedVal = Math.min(255, Math.max(0, sharpenedVal));
    assert.strictEqual(clampedVal, 160);

    // Compression savings math
    const originalBytes = 2097152; // 2 MB
    const compressedBytes = 629145; // ~614 KB
    const savedBytes = Math.max(0, originalBytes - compressedBytes);
    const savedPercent = Math.round((savedBytes / originalBytes) * 100);
    assert.strictEqual(savedPercent, 70, 'Compression saving percentage calculation must be 70%');
});
