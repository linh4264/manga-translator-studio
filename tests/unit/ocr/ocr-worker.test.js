import { test } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import {
    detectSpeechBubbleAtPointFromBuffer,
    computeTextMaskDilatedRoiFromBuffer,
    getImageBrightnessMapFromBuffer
} from '../../../src/workers/ocr.worker.ts';
import {
    detectSpeechBubbleAtPointAsync,
    computeTextMaskDilatedRoiAsync,
    refineAiBlockBoxAsync
} from '../../../src/features/ocr/ocr-service.ts';

test('OCR Worker - Luminance Brightness Map Calculation from Transferable Buffer', () => {
    const W = 10;
    const H = 10;
    const rgba = new Uint8Array(W * H * 4);

    // Fill first pixel with white (255, 255, 255) and second with black (0, 0, 0)
    rgba[0] = 255; rgba[1] = 255; rgba[2] = 255; rgba[3] = 255;
    rgba[4] = 0; rgba[5] = 0; rgba[6] = 0; rgba[7] = 255;

    const brightnessMap = getImageBrightnessMapFromBuffer(rgba, W, H);
    assert.strictEqual(brightnessMap[0], 255, 'White pixel must have 255 brightness');
    assert.strictEqual(brightnessMap[1], 0, 'Black pixel must have 0 brightness');
});

test('OCR Worker - Bubble Detection from Buffer', () => {
    const W = 400;
    const H = 400;
    const rgba = new Uint8Array(W * H * 4);

    // Dark background
    for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = 30; rgba[i + 1] = 30; rgba[i + 2] = 30; rgba[i + 3] = 255;
    }

    // Bright rectangular speech bubble at [100, 100, 200, 200]
    for (let y = 100; y <= 300; y++) {
        for (let x = 100; x <= 300; x++) {
            const idx = (y * W + x) * 4;
            rgba[idx] = 245; rgba[idx + 1] = 245; rgba[idx + 2] = 245;
        }
    }

    const result = detectSpeechBubbleAtPointFromBuffer(rgba, W, H, 200, 200);
    assert.ok(result, 'Bubble result must be found');
    assert.ok(result.box, 'Bounding box must exist');
    assert.strictEqual(Math.round(result.box.x), 25, 'Bubble x should be 25%');
    assert.strictEqual(Math.round(result.box.y), 25, 'Bubble y should be 25%');
    assert.strictEqual(Math.round(result.box.w), 50, 'Bubble width should be 50%');
    assert.strictEqual(Math.round(result.box.h), 50, 'Bubble height should be 50%');
});

test('OCR Worker - Text Mask Dilation from Buffer', () => {
    const W = 200;
    const H = 200;
    const rgba = new Uint8Array(W * H * 4);

    // White background
    for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = 255; rgba[i + 1] = 255; rgba[i + 2] = 255; rgba[i + 3] = 255;
    }

    // Dark text glyphs in center [90..110, 90..110]
    for (let y = 90; y <= 110; y++) {
        for (let x = 90; x <= 110; x++) {
            const idx = (y * W + x) * 4;
            rgba[idx] = 10; rgba[idx + 1] = 10; rgba[idx + 2] = 10;
        }
    }

    const rawBox = { x: 40, y: 40, w: 20, h: 20 };
    const inpaintRoi = computeTextMaskDilatedRoiFromBuffer(rgba, W, H, rawBox);
    assert.ok(inpaintRoi, 'Inpaint ROI should be computed');
    assert.ok(inpaintRoi.w > 0, 'Inpaint ROI width should be valid');
    assert.ok(inpaintRoi.h > 0, 'Inpaint ROI height should be valid');
});

test('OCR Service - Async Worker-Accelerated Functions', async () => {
    const W = 300;
    const H = 300;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 40; data[i + 1] = 40; data[i + 2] = 40; data[i + 3] = 255;
    }
    for (let y = 50; y <= 250; y++) {
        for (let x = 50; x <= 250; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 250; data[idx + 1] = 250; data[idx + 2] = 250;
        }
    }

    const mockImageData = { width: W, height: H, data };

    // 1. detectSpeechBubbleAtPointAsync
    const bubbleRes = await detectSpeechBubbleAtPointAsync(mockImageData, 150, 150);
    assert.ok(bubbleRes && bubbleRes.box, 'Async bubble detection must succeed');

    // 2. refineAiBlockBoxAsync
    const refined = await refineAiBlockBoxAsync([500, 500], mockImageData, undefined, 'dialogue');
    assert.ok(refined && refined.w > 0, 'Async box refinement must succeed');
});
