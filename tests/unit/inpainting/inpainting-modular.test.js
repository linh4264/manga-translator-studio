import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import '../../setup/canvas-mock.js';
import '../../setup/indexeddb-mock.js';

import {
    createMangaPatternTile,
    makeSeamlessTile,
    findBestAdjacentPatch,
    setLassoPatternOffsetX,
    setLassoPatternOffsetY,
    nudgeLassoPatternOffset,
    resetLassoPatternOffset,
    lassoPatternOffsetX,
    lassoPatternOffsetY
} from '../../../src/features/inpainting/pattern-generator.ts';

import {
    getActiveLassoPoints,
    setActiveLassoPoints,
    setLassoFillTab,
    setLassoFillTechnique,
    setLassoPatternType,
    lassoActiveTab,
    lassoFillTechnique,
    lassoPatternType
} from '../../../src/features/inpainting/lasso-tool.ts';

import {
    isEraserModeActive,
    setIsEraserModeActive,
    setEraserBrushSize,
    eraserBrushSize,
    setEraserColor,
    eraserColor,
    setEraserBrushMode,
    brushMode
} from '../../../src/features/inpainting/eraser-tool.ts';

import {
    autoCleanBubbleBackground
} from '../../../src/features/inpainting/ai-inpaint-service.ts';

import { patchCanvasElement } from '../../setup/canvas-mock.js';

test('Inpainting Modular - Pattern Generator Tiling & Math', () => {
    const tile = createMangaPatternTile({ type: 'halftone', size: 8, density: 50 });
    assert.ok(tile, 'Pattern tile created successfully');
    assert.strictEqual(tile.width, 8);
    assert.strictEqual(tile.height, 8);

    const diagTile = createMangaPatternTile({ type: 'diagonal', size: 12, density: 40 });
    assert.strictEqual(diagTile.width, 12);
    assert.strictEqual(diagTile.height, 12);

    const seamless = makeSeamlessTile(tile, 4);
    assert.ok(seamless, 'Seamless tile generated');
    assert.strictEqual(seamless.width, 8);

    // Offset nudging
    resetLassoPatternOffset();
    assert.strictEqual(lassoPatternOffsetX, 0);
    assert.strictEqual(lassoPatternOffsetY, 0);

    nudgeLassoPatternOffset(5, -3);
    assert.strictEqual(lassoPatternOffsetX, 5);
    assert.strictEqual(lassoPatternOffsetY, -3);

    setLassoPatternOffsetX(10);
    setLassoPatternOffsetY(15);
    assert.strictEqual(lassoPatternOffsetX, 10);
    assert.strictEqual(lassoPatternOffsetY, 15);
});

test('Inpainting Modular - Adjacent Patch Boundary Search', () => {
    const fakeImg = { naturalWidth: 1000, naturalHeight: 1500 };
    const patch = findBestAdjacentPatch(fakeImg, 100, 200, 50, 60);
    assert.ok(patch.x >= 0 && patch.y >= 0);
    assert.strictEqual(patch.w, 50);
    assert.strictEqual(patch.h, 60);
});

test('Inpainting Modular - Lasso Tool State Management', () => {
    assert.strictEqual(getActiveLassoPoints(), null);

    const testPts = [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }];
    setActiveLassoPoints(testPts);
    assert.deepStrictEqual(getActiveLassoPoints(), testPts);

    setLassoFillTab('pattern');
    assert.strictEqual(lassoActiveTab, 'pattern');

    setLassoFillTechnique('seamless_tile');
    assert.strictEqual(lassoFillTechnique, 'seamless_tile');

    setLassoPatternType('diagonal');
    assert.strictEqual(lassoPatternType, 'diagonal');
});

test('Inpainting Modular - Eraser Tool Brush & Mode Controls', () => {
    setIsEraserModeActive(true);
    assert.strictEqual(isEraserModeActive, true);

    setEraserBrushSize(25);
    assert.strictEqual(eraserBrushSize, 25);

    setEraserColor('#ff0055');
    assert.strictEqual(eraserColor, '#ff0055');

    setEraserBrushMode('clone_stamp');
    assert.strictEqual(brushMode, 'clone_stamp');

    setEraserBrushMode('spot-inpaint');
    assert.strictEqual(brushMode, 'spot-inpaint');
});

test('Inpainting Modular - AI Inpaint Service Bubble Clean', () => {
    const mockCanvas = document.getElementById('eraser-canvas');
    patchCanvasElement(mockCanvas, 800, 1200);

    const page = { id: 'p1', blocks: [] };
    const block = { id: 'b1', box: { x: 10, y: 10, w: 20, h: 15 }, style: { bgColor: '#fff' } };

    const success = autoCleanBubbleBackground(page, block);
    assert.strictEqual(success, true);
});

test('Inpainting Modular - Lasso drawing interaction sets activeLassoPoints and enables fill button', () => {
    document.body.innerHTML = `
        <button id="btn-lasso-fill" disabled></button>
        <button id="btn-lasso-pattern-fill" disabled></button>
        <canvas id="eraser-canvas" width="800" height="1200"></canvas>
        <div id="manga-canvas-container"></div>
    `;

    const canvas = document.getElementById('eraser-canvas');
    patchCanvasElement(canvas, 800, 1200);

    setEraserBrushMode('lasso');
    assert.strictEqual(getActiveLassoPoints(), null);

    // Simulate drawing a triangular polygon with 3 points
    canvas.onmousedown({
        preventDefault: () => {},
        clientX: 100,
        clientY: 100,
        touches: null
    });

    canvas.onmousemove({
        preventDefault: () => {},
        clientX: 200,
        clientY: 100,
        touches: null
    });

    canvas.onmousemove({
        preventDefault: () => {},
        clientX: 150,
        clientY: 200,
        touches: null
    });

    canvas.onmouseup({
        preventDefault: () => {}
    });

    const pts = getActiveLassoPoints();
    assert.ok(pts, 'activeLassoPoints must not be null after completing lasso draw');
    assert.ok(pts.length >= 3, 'activeLassoPoints must have at least 3 points');

    const btnFill = document.getElementById('btn-lasso-fill');
    assert.strictEqual(btnFill.disabled, false, 'btn-lasso-fill button must be enabled');
});

