import test from 'node:test';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import {
    normalizeAiBlockBox,
    isSuspiciousAiBlockBox,
    expandAiBox
} from '../../../public/src/features/ocr/ocr-service.js';

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
