import { test, expect, assert } from 'vitest';
import '../../setup/browser-env.js';

import {
    normalizeAiBlockBox,
    isSuspiciousAiBlockBox,
    expandAiBox
} from '../../../src/features/ocr/ocr-service.ts';

test('OCR Normalization - Coordinate Scale Conversions (0-1000, 0-1, 0-100)', () => {
    // 1. Scale 0-1000 (Gemini Vision Object Detection standard)
    const geminiBox = { x: 250, y: 180, w: 300, h: 420 };
    const norm1 = normalizeAiBlockBox(geminiBox);
    assert.deepStrictEqual(norm1, { x: 25, y: 18, w: 30, h: 42 });

    // 2. Scale 0-1 (Float percentage)
    const floatBox = { x: 0.15, y: 0.20, w: 0.40, h: 0.35 };
    const norm2 = normalizeAiBlockBox(floatBox);
    assert.deepStrictEqual(norm2, { x: 15, y: 20, w: 40, h: 35 });

    // 3. Scale 0-100 (Standard percentage)
    const standardBox = { x: 10, y: 15, w: 50, h: 60 };
    const norm3 = normalizeAiBlockBox(standardBox);
    assert.deepStrictEqual(norm3, { x: 10, y: 15, w: 50, h: 60 });

    // 4. Scale 0-1000 2-Element Array [x, y] Center Anchor (x = anchorX - 200px, y = anchorY - 200px -> w=400px, h=400px)
    const array2DBox = [500, 300];
    const norm4 = normalizeAiBlockBox(array2DBox);
    assert.deepStrictEqual(norm4, { x: 30, y: 10, w: 40, h: 40 });
});

test('OCR Normalization - Boundary Clamping & Invalid Box Sanitization', () => {
    // 0-1000 scale overflow box that normalizes to percentage and clamps to bounds
    const overflowGeminiBox = { x: 900, y: 800, w: 300, h: 500 };
    const clamped = normalizeAiBlockBox(overflowGeminiBox);
    assert.strictEqual(clamped.x, 90);
    assert.strictEqual(clamped.y, 80);
    assert.strictEqual(clamped.w, 10, 'Width clamped to remaining space 100 - x');
    assert.strictEqual(clamped.h, 20, 'Height clamped to remaining space 100 - y');

    // Negative coordinates
    const negativeBox = { x: -10, y: -20, w: 50, h: 60 };
    const clampedNeg = normalizeAiBlockBox(negativeBox);
    assert.strictEqual(clampedNeg.x, 0);
    assert.strictEqual(clampedNeg.y, 0);

    // Null or invalid input fallback
    const nullBox = normalizeAiBlockBox(null);
    assert.ok(nullBox && typeof nullBox.x === 'number');

    const nanBox = normalizeAiBlockBox({ x: NaN, y: 'bad', w: 0, h: -5 });
    assert.ok(nanBox && typeof nanBox.w === 'number');
});

test('OCR Normalization - Suspicious Box Detection and Expansion', () => {
    // Touching image outer border and small (suspicious artifact)
    const borderArtifact = { x: 2, y: 2, w: 10, h: 10 };
    assert.strictEqual(isSuspiciousAiBlockBox(borderArtifact), true);

    // Normal bubble in center
    const validCenterBubble = { x: 30, y: 40, w: 30, h: 25 };
    assert.strictEqual(isSuspiciousAiBlockBox(validCenterBubble), false);

    // Expansion test
    const expanded = expandAiBox(validCenterBubble, 0.1, 0.1);
    assert.ok(expanded.w > validCenterBubble.w, 'Expanded width should be larger');
    assert.ok(expanded.h > validCenterBubble.h, 'Expanded height should be larger');
    assert.ok(expanded.x < validCenterBubble.x, 'Expanded X should move left');
});

test('OCR Normalization - Merge Overlapping Stacked AI Blocks (Eliminates Piles)', async () => {
    const { calculateBoxIntersectionRatio, mergeOverlappingAiBlocks } = await import('../../../src/features/ocr/ocr-service.ts');

    // 2 overlapping boxes covering almost identical bubble area
    const boxA = { x: 50, y: 50, w: 30, h: 40 };
    const boxB = { x: 52, y: 51, w: 28, h: 38 };
    const overlap = calculateBoxIntersectionRatio(boxA, boxB);
    assert.ok(overlap > 0.8, 'Overlap ratio should be high for nearly identical boxes');

    // Multi-line split blocks from same speech bubble
    const stackedBlocks = [
        { id: 'b1', original: '組織', box: [500, 500, 300, 400] },
        { id: 'b2', original: 'として', box: [510, 505, 290, 390] },
        { id: 'b3', original: '存在', box: [500, 500, 300, 400] },
        { id: 'b4', original: '別の枠', box: [100, 100, 200, 200] } // Separate bubble
    ];

    const merged = mergeOverlappingAiBlocks(stackedBlocks, 0.65);
    assert.strictEqual(merged.length, 2, 'Should merge 3 stacked fragments into 1 block and keep separate bubble');
    assert.ok(merged[0].original.includes('組織') && merged[0].original.includes('として') && merged[0].original.includes('存在'), 'Original text should be concatenated');
    assert.strictEqual(merged[1].original, '別の枠', 'Separate bubble must remain untouched');

    // 2D Point Anchor Bubbles: Must NEVER merge distinct bubbles across panels/distances
    const pointAnchorBlocks = [
        { id: 'b1', original: 'Bóng thoại 1', box: [300, 300] },
        { id: 'b2', original: 'Bóng thoại 2', box: [380, 360] }, // ~100px away on 1000px scale
        { id: 'b3', original: 'Bóng thoại 3', box: [650, 200] },
        { id: 'b4', original: 'Trùng lặp với 1', box: [305, 302] } // Duplicate of b1 (<1% distance)
    ];

    const mergedPoints = mergeOverlappingAiBlocks(pointAnchorBlocks);
    assert.strictEqual(mergedPoints.length, 3, 'Must keep 3 distinct speech bubbles and only merge the near-identical duplicate');
    assert.strictEqual(mergedPoints[0].original, 'Bóng thoại 1 Trùng lặp với 1');
    assert.strictEqual(mergedPoints[1].original, 'Bóng thoại 2');
    assert.strictEqual(mergedPoints[2].original, 'Bóng thoại 3');
});

test('OCR Normalization - TEXT MASK -> DILATE -> INPAINT REGION Pipeline', async () => {
    const { computeTextMaskDilatedRoi, refineAiBlockBox } = await import('../../../src/features/ocr/ocr-service.ts');

    // Create a mock 200x200 ImageData with dark text in center [80, 80] to [120, 120]
    const W = 200;
    const H = 200;
    const data = new Uint8ClampedArray(W * H * 4);
    data.fill(255); // White canvas

    // Draw dark text ink pixels
    for (let y = 80; y <= 120; y++) {
        for (let x = 80; x <= 120; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 20;     // R
            data[idx + 1] = 20; // G
            data[idx + 2] = 20; // B
            data[idx + 3] = 255;
        }
    }

    const mockImageData = { width: W, height: H, data };
    const rawBox = { x: 35, y: 35, w: 30, h: 30 }; // ~ 70px to 130px

    const inpaintRoi = computeTextMaskDilatedRoi(rawBox, mockImageData, {
        dilationRadius: 4,
        paddingPx: 6,
        darkThreshold: 140
    });

    assert.ok(inpaintRoi, 'Inpaint ROI must be computed');
    assert.ok(typeof inpaintRoi.x === 'number' && typeof inpaintRoi.w === 'number');
    assert.ok(inpaintRoi.w > 0 && inpaintRoi.h > 0);

    // Test refineAiBlockBox
    const refined = refineAiBlockBox(rawBox, mockImageData);
    assert.ok(refined && typeof refined.x === 'number');
});

test('OCR Normalization - Japanese Multi-Column Vertical Text & Furigana Grouping', async () => {
    const { computeTextMaskDilatedRoi } = await import('../../../src/features/ocr/ocr-service.ts');

    // Create a 300x300 mock canvas with 3 parallel vertical columns and furigana
    const W = 300;
    const H = 300;
    const data = new Uint8ClampedArray(W * H * 4);
    data.fill(255); // White speech bubble background

    // Column 1 (Right): x from 180 to 200, y from 50 to 120 (Short column)
    for (let y = 50; y <= 120; y++) {
        for (let x = 180; x <= 200; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 15; data[idx + 1] = 15; data[idx + 2] = 15; data[idx + 3] = 255;
        }
    }
    // Furigana next to Column 1: x from 204 to 212, y from 55 to 80
    for (let y = 55; y <= 80; y++) {
        for (let x = 204; x <= 212; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 15; data[idx + 1] = 15; data[idx + 2] = 15; data[idx + 3] = 255;
        }
    }
    // Column 2 (Middle): x from 140 to 160, y from 50 to 220 (Long column)
    for (let y = 50; y <= 220; y++) {
        for (let x = 140; x <= 160; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 15; data[idx + 1] = 15; data[idx + 2] = 15; data[idx + 3] = 255;
        }
    }
    // Column 3 (Left): x from 100 to 120, y from 70 to 200 (Medium column)
    for (let y = 70; y <= 200; y++) {
        for (let x = 100; x <= 120; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 15; data[idx + 1] = 15; data[idx + 2] = 15; data[idx + 3] = 255;
        }
    }

    const mockImageData = { width: W, height: H, data };
    const rawBox = { x: 30, y: 15, w: 45, h: 65 }; // Rough box covering the area

    const resultBox = computeTextMaskDilatedRoi(rawBox, mockImageData, {
        dilationRadiusX: 6,
        dilationRadiusY: 3,
        paddingPx: 6,
        darkThreshold: 140
    });

    assert.ok(resultBox, 'Should compute unified multi-column box');
    // Bounding box must span from left of Column 3 (~100px) to right of Furigana (~212px)
    const pxLeft = (resultBox.x / 100) * W;
    const pxRight = ((resultBox.x + resultBox.w) / 100) * W;
    const pxTop = (resultBox.y / 100) * H;
    const pxBottom = ((resultBox.y + resultBox.h) / 100) * H;

    assert.ok(pxLeft <= 100, `Left edge should encompass Column 3 (got ${pxLeft})`);
    assert.ok(pxRight >= 210, `Right edge should encompass Furigana (got ${pxRight})`);
    assert.ok(pxTop <= 52, `Top edge should encompass highest character (got ${pxTop})`);
    assert.ok(pxBottom >= 220, `Bottom edge should encompass lowest character (got ${pxBottom})`);
});
