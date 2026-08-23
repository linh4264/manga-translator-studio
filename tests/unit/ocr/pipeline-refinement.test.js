import { test } from 'vitest';
import assert from 'node:assert';
import { extractTextAnchor, refineAiBlockBox, detectSpeechBubbleAtPoint, mergeOverlappingAiBlocks } from '../../../src/features/ocr/ocr-service.ts';
import { computeBlockTextLayout } from '../../../src/features/canvas/text-layout-engine.ts';
import { autoMatchBlockStyle } from '../../../src/features/canvas/canvas-styling.ts';
import { getDefaultFontForBlockType } from '../../../src/features/ai/story-memory.ts';

// =========================================================================
// ISSUE 1: Retaining Text Anchor after Bubble Refinement (CASE A)
// =========================================================================
test('Pipeline Refinement - CASE A: textAnchor is extracted and preserved after box refinement', () => {
    const rawBox = [500, 400]; // AI returns [centerX, centerY] = [500, 400] on 0-1000 scale
    const textAnchor = extractTextAnchor(rawBox);

    assert.ok(textAnchor, 'textAnchor must be defined');
    assert.strictEqual(textAnchor.x, 50, 'textAnchor.x must be 50%');
    assert.strictEqual(textAnchor.y, 40, 'textAnchor.y must be 40%');

    // Create a mock image with a speech bubble at [300, 200, 400, 400] (30%, 20%, 40%, 40%)
    const W = 1000;
    const H = 1000;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 50; data[i + 1] = 50; data[i + 2] = 50; data[i + 3] = 255;
    }
    for (let y = 200; y <= 600; y++) {
        for (let x = 300; x <= 700; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 240; data[idx + 1] = 240; data[idx + 2] = 240;
        }
    }
    const mockImageData = { width: W, height: H, data };

    const refinedBox = refineAiBlockBox(rawBox, mockImageData, undefined, 'dialogue');

    // block.box must be the refined bubble box
    assert.strictEqual(refinedBox.x, 30, 'refinedBox.x must snap to bubble left (30%)');
    assert.strictEqual(refinedBox.y, 20, 'refinedBox.y must snap to bubble top (20%)');
    assert.strictEqual(refinedBox.w, 40, 'refinedBox.w must snap to bubble width (40%)');
    assert.strictEqual(refinedBox.h, 40, 'refinedBox.h must snap to bubble height (40%)');

    // Simulated MangaBlock retains textAnchor alongside refined box
    const block = {
        id: 'block_case_a',
        type: 'dialogue',
        original: 'Test anchor',
        translated: 'Dịch anchor',
        box: refinedBox,
        style: { fontFamily: 'font-manga' },
        textAnchor: textAnchor
    };

    assert.strictEqual(block.textAnchor.x, 50);
    assert.strictEqual(block.textAnchor.y, 40);
    assert.strictEqual(block.box.x, 30);
    assert.strictEqual(block.box.y, 20);
});

// =========================================================================
// ISSUE 2: Proximity-Weighted Bubble Seed Selection (CASE C)
// =========================================================================
test('Pipeline Refinement - CASE C: Proximity-weighted seed selection chooses closer Bubble A over brighter distant Bubble B', () => {
    const W = 500;
    const H = 500;
    const data = new Uint8ClampedArray(W * H * 4);

    // Dark background (brightness 30)
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 30; data[i + 1] = 30; data[i + 2] = 30; data[i + 3] = 255;
    }

    // Bubble A: located around (200, 200), width=80, height=80, brightness = 210
    // Anchor will be at (200, 200)
    for (let y = 160; y <= 240; y++) {
        for (let x = 160; x <= 240; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 210; data[idx + 1] = 210; data[idx + 2] = 210;
        }
    }

    // Bubble B: located around (250, 200) [distance = 50px away from anchor], width=80, height=80, brightness = 255 (maximum brightness)
    for (let y = 160; y <= 240; y++) {
        for (let x = 250; x <= 330; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 255; data[idx + 1] = 255; data[idx + 2] = 255;
        }
    }

    const mockImageData = { width: W, height: H, data };

    // Anchor clicked at (200, 200) inside Bubble A (brightness 210)
    const result = detectSpeechBubbleAtPoint(mockImageData, 200, 200);

    assert.ok(result, 'Bubble detection must succeed');
    assert.ok(result.box, 'Result must have a bounding box');

    // The detected bubble center must be inside Bubble A (~200px = 40%), not Bubble B (~290px = 58%)
    const bubbleCenterX = result.box.x + result.box.w / 2;
    assert.ok(bubbleCenterX >= 35 && bubbleCenterX <= 45, `Detected bubble center (${bubbleCenterX}%) must be Bubble A (~40%), not Bubble B`);
});

test('Pipeline Refinement - CASE C2: Seed selection on dark character glyph inside bright bubble still finds the bubble', () => {
    const W = 300;
    const H = 300;
    const data = new Uint8ClampedArray(W * H * 4);

    // Dark background (30)
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 30; data[i + 1] = 30; data[i + 2] = 30; data[i + 3] = 255;
    }

    // White Bubble at x: 100..200, y: 100..200 (brightness 240)
    for (let y = 100; y <= 200; y++) {
        for (let x = 100; x <= 200; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 240; data[idx + 1] = 240; data[idx + 2] = 240;
        }
    }

    // Black character glyph at center x: 148..152, y: 148..152 (brightness 10)
    for (let y = 148; y <= 152; y++) {
        for (let x = 148; x <= 152; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 10; data[idx + 1] = 10; data[idx + 2] = 10;
        }
    }

    const mockImageData = { width: W, height: H, data };

    // Anchor at exact center of black glyph (150, 150)
    const result = detectSpeechBubbleAtPoint(mockImageData, 150, 150);
    assert.ok(result, 'Must successfully escape glyph and detect bubble');
    assert.ok(result.box.w >= 20, 'Box width should be detected');
});

test('Pipeline Refinement - CASE C3: Bubble detection in pure dark area returns null', () => {
    const W = 200;
    const H = 200;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 40; data[i + 1] = 40; data[i + 2] = 40; data[i + 3] = 255;
    }
    const mockImageData = { width: W, height: H, data };
    const result = detectSpeechBubbleAtPoint(mockImageData, 100, 100);
    assert.strictEqual(result, null, 'Must return null when no bright region exists');
});

// =========================================================================
// ISSUE 3: Final Style & Font Layout Measurement (CASE D)
// =========================================================================
test('Pipeline Refinement - CASE D: Text layout measurement is based on final font, not default font', () => {
    const text = 'Đây là một câu thoại có độ dài trung bình trong manga';

    const defaultBlock = {
        translated: text,
        box: { x: 10, y: 10, w: 30, h: 20 },
        style: { fontFamily: 'font-manga', fontSize: 18, bold: false }
    };
    const wideBlock = {
        translated: text,
        box: { x: 10, y: 10, w: 30, h: 20 },
        style: { fontFamily: 'font-impact', fontSize: 24, bold: true, letterSpacing: 2 }
    };

    const defaultLayout = computeBlockTextLayout(defaultBlock, 800, 1200, 1);
    const wideLayout = computeBlockTextLayout(wideBlock, 800, 1200, 1);

    assert.ok(wideLayout.textWidth > defaultLayout.textWidth, 'Wide font must have greater measured text width');
    assert.ok(defaultLayout.lines.length >= 1, 'Default text layout must produce lines');
    assert.ok(wideLayout.lines.length >= 1, 'Wide text layout must produce lines');
});

// =========================================================================
// ISSUE 4: Reduce False Merges in Point Anchors (CASE B)
// =========================================================================
test('Pipeline Refinement - CASE B: Two close bubbles (~1.5-3% distance) with different texts must NOT merge', () => {
    const blocks = [
        {
            id: 'b1',
            type: 'dialogue',
            original: 'Xin chào người lạ',
            translated: 'Hello stranger',
            box: [500, 400] // 50%, 40%
        },
        {
            id: 'b2',
            type: 'dialogue',
            original: 'Tạm biệt hẹn gặp lại',
            translated: 'Goodbye see you again',
            box: [515, 400] // 51.5%, 40% -> distance = 1.5%
        }
    ];

    const merged = mergeOverlappingAiBlocks(blocks);
    assert.strictEqual(merged.length, 2, 'Must keep both blocks separated because original text is completely different');
    assert.strictEqual(merged[0].original, 'Xin chào người lạ');
    assert.strictEqual(merged[1].original, 'Tạm biệt hẹn gặp lại');
});

test('Pipeline Refinement - CASE B2: Same bubble detected twice by AI with duplicate text MUST merge', () => {
    const blocks = [
        {
            id: 'b1',
            type: 'dialogue',
            original: 'Năng lực của ta là vô địch!',
            box: [500, 400]
        },
        {
            id: 'b2',
            type: 'dialogue',
            original: 'Năng lực của ta là vô địch!',
            box: [508, 402] // distance = 0.82% (< 1.8%)
        }
    ];

    const merged = mergeOverlappingAiBlocks(blocks);
    assert.strictEqual(merged.length, 1, 'Duplicate detection of same bubble must be merged into 1 block');
    assert.strictEqual(merged[0].original, 'Năng lực của ta là vô địch!');
});

test('Pipeline Refinement - CASE B3: Same anchor point but completely different text must NOT merge without duplicate evidence', () => {
    const blocks = [
        {
            id: 'b1',
            type: 'dialogue',
            original: 'Ai đó đang tới!',
            box: [500, 400]
        },
        {
            id: 'b2',
            type: 'dialogue',
            original: 'Coi chừng phía sau!',
            box: [502, 401] // distance = 0.22%
        }
    ];

    const merged = mergeOverlappingAiBlocks(blocks);
    assert.strictEqual(merged.length, 2, 'Distinct lines with no duplicate evidence must not merge even if anchor is very close');
});

test('Pipeline Refinement - CASE B4: Different block types at nearby anchors must NOT merge', () => {
    const blocks = [
        {
            id: 'b1',
            type: 'dialogue',
            original: 'Áaaaa!',
            box: [500, 400]
        },
        {
            id: 'b2',
            type: 'sfx',
            original: 'BÙM!',
            box: [510, 400] // 1.0% distance
        }
    ];

    const merged = mergeOverlappingAiBlocks(blocks);
    assert.strictEqual(merged.length, 2, 'Blocks of different types (dialogue vs sfx) must never merge');
});
