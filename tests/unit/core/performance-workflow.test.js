import test from 'node:test';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import { segmentString, setMultilineText } from '../../../src/core/utils.ts';
import { autoFitBlock, isBlockAutoFit } from '../../../src/features/canvas/canvas-styling.ts';
import { updateEraserBrushSize, eraserBrushSize } from '../../../src/features/inpainting.ts';
import { globalState } from '../../../src/core/state.ts';

test('Performance - Intl.Segmenter Singleton and segmentString', () => {
    const text = 'Xin chào thế giới! 🌸 日本語テスト';
    const segments = segmentString(text);
    assert.ok(Array.isArray(segments), 'Should return an array of segments');
    assert.ok(segments.length > 0, 'Segments length should be positive');
    assert.strictEqual(segments.join(''), text, 'Rejoined segments must match original string');
});

test('Performance - setMultilineText Fast Path for Non-Warped Horizontal Text', () => {
    const container = document.createElement('div');
    const text = 'Dòng 1 không có warp\nDòng 2 hiệu năng cao';
    setMultilineText(container, text, { arcAngle: 0, warpWave: 0, warpBulge: 0 });

    assert.strictEqual(container.children.length, 2, 'Should create 2 line divs');
    // In fast path, child div textContent is set directly without creating individual child span elements
    assert.strictEqual(container.children[0].children.length, 0, 'Line 1 should have 0 child spans in fast path');
    assert.strictEqual(container.children[1].children.length, 0, 'Line 2 should have 0 child spans in fast path');
    assert.strictEqual(container.children[0].textContent, 'Dòng 1 không có warp');
    assert.strictEqual(container.children[1].textContent, 'Dòng 2 hiệu năng cao');
});

test('Performance - autoFitBlock Quantized Caching', () => {
    const mockBlock = {
        id: 'test_perf_block',
        type: 'dialogue',
        translated: 'Văn bản kiểm tra Auto-Fit',
        box: { x: 10, y: 10, w: 30, h: 20 },
        style: {
            fontFamily: 'font-manga',
            fontSize: 16,
            padding: '9% 12%',
            vertical: false,
            autoFit: true
        }
    };

    globalState.pages = [{
        id: 'p1',
        blocks: [mockBlock],
        lastDisplayWidth: 800
    }];
    globalState.activePageIndex = 0;

    autoFitBlock(mockBlock);
    assert.ok(mockBlock.autoFitCache, 'autoFitCache should be populated after autoFitBlock');
    assert.ok(mockBlock.style.fontSize > 0, 'Computed fontSize should be positive');

    const firstComputedSize = mockBlock.style.fontSize;
    const firstKey = mockBlock.autoFitCache.key;

    // Second run should use cached result
    mockBlock.style.fontSize = 999;
    autoFitBlock(mockBlock);
    assert.strictEqual(mockBlock.style.fontSize, firstComputedSize, 'Should retrieve cached font size instantly');
    assert.strictEqual(mockBlock.autoFitCache.key, firstKey, 'Cache key should match');
});

test('Workflow - Eraser Brush Size Update and Alias Function', () => {
    updateEraserBrushSize(35);
    assert.strictEqual(eraserBrushSize, 35, 'Eraser brush size should update to 35px');

    updateEraserBrushSize(20);
    assert.strictEqual(eraserBrushSize, 20, 'Eraser brush size should update to 20px');
});
