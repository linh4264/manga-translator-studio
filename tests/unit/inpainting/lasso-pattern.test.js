import test from 'node:test';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import '../../setup/canvas-mock.js';
import '../../setup/indexeddb-mock.js';

import {
    createMangaPatternTile,
    setLassoFillTab,
    setLassoPatternType,
    setLassoFillTechnique,
    setLassoPatternOffsetX,
    setLassoPatternOffsetY,
    nudgeLassoPatternOffset,
    resetLassoPatternOffset,
    makeSeamlessTile,
    findBestAdjacentPatch,
    updateLassoButtons,
    runLassoPatternFill,
    clearLassoSelection,
    lassoPatternType,
    lassoFillTechnique,
    lassoActiveTab,
    lassoSampleCanvas,
    lassoPatternOffsetX,
    lassoPatternOffsetY,
    autoSampleNearbyLassoRect,
    pickLassoRectSample,
    setIsEraserModeActive
} from '../../../src/features/inpainting.ts';
import { patchCanvasElement } from '../../setup/canvas-mock.js';
import { globalState } from '../../../src/core/state.ts';

test('Lasso Pattern Fill - createMangaPatternTile generates valid tiles for all pattern presets', () => {
    // 1. Halftone Dot Screentone
    const halftoneTile = createMangaPatternTile({
        type: 'halftone',
        size: 10,
        density: 50,
        fgColor: '#000000',
        bgColor: '#ffffff',
        isTransparent: false
    });
    assert.ok(halftoneTile, 'Halftone tile canvas must be created');
    assert.strictEqual(halftoneTile.width, 10);
    assert.strictEqual(halftoneTile.height, 10);

    // 2. Horizontal Lines
    const horizTile = createMangaPatternTile({
        type: 'horizontal',
        size: 8,
        density: 25,
        fgColor: '#111111',
        bgColor: '#ffffff',
        isTransparent: true
    });
    assert.ok(horizTile);
    assert.strictEqual(horizTile.width, 16);
    assert.strictEqual(horizTile.height, 8);

    // 3. Vertical Lines
    const vertTile = createMangaPatternTile({
        type: 'vertical',
        size: 12,
        density: 50,
        fgColor: '#222222',
        bgColor: '#ffffff'
    });
    assert.ok(vertTile);
    assert.strictEqual(vertTile.width, 12);
    assert.strictEqual(vertTile.height, 16);

    // 4. Diagonal Lines (45°)
    const diagTile = createMangaPatternTile({
        type: 'diagonal',
        size: 16,
        density: 30,
        fgColor: '#000000'
    });
    assert.ok(diagTile);
    assert.strictEqual(diagTile.width, 16);
    assert.strictEqual(diagTile.height, 16);

    // 5. Crosshatch Grid
    const crossTile = createMangaPatternTile({
        type: 'crosshatch',
        size: 14,
        density: 40,
        fgColor: '#000000'
    });
    assert.ok(crossTile);
    assert.strictEqual(crossTile.width, 14);
    assert.strictEqual(crossTile.height, 14);

    // 6. Noise / Manga Grain
    const noiseTile = createMangaPatternTile({
        type: 'noise',
        size: 8,
        density: 30,
        fgColor: '#000000'
    });
    assert.ok(noiseTile);
    assert.ok(noiseTile.width >= 16);
    assert.ok(noiseTile.height >= 16);

    // 7. Sampled Texture Patch fallback
    const customSampleCanvas = document.createElement('canvas');
    customSampleCanvas.width = 32;
    customSampleCanvas.height = 32;
    const sampleTile = createMangaPatternTile({
        type: 'sample',
        sampleCanvas: customSampleCanvas
    });
    assert.strictEqual(sampleTile, customSampleCanvas, 'Sample tile must return provided sample canvas');
});

test('Lasso Pattern Fill - Tab Switching and Pattern Type Selection UI States', () => {
    // Setup DOM elements
    document.body.innerHTML = `
        <div id="tab-lasso-ai" class="bg-indigo-600 text-white"></div>
        <div id="tab-lasso-pattern" class="text-slate-400"></div>
        <div id="lasso-ai-controls"></div>
        <div id="lasso-pattern-controls" class="hidden"></div>
        <div id="btn-lasso-pat-halftone" class="bg-indigo-600"></div>
        <div id="btn-lasso-pat-crosshatch" class="bg-slate-900"></div>
        <div id="btn-lasso-pat-sample" class="bg-slate-900"></div>
        <div id="lasso-pattern-sample-notice" class="hidden"></div>
        <button id="btn-lasso-fill" disabled></button>
        <button id="btn-lasso-pattern-fill" disabled></button>
        <canvas id="eraser-canvas"></canvas>
        <img id="manga-bg-image" />
    `;

    // Switch to Pattern Tab
    setLassoFillTab('pattern');
    assert.strictEqual(lassoActiveTab, 'pattern');
    const tabPat = document.getElementById('tab-lasso-pattern');
    const panelPat = document.getElementById('lasso-pattern-controls');
    assert.ok(tabPat?.classList.contains('bg-indigo-600'), 'Pattern tab must have active style');
    assert.ok(!panelPat?.classList.contains('hidden'), 'Pattern panel must be visible');

    // Switch to Crosshatch pattern type
    setLassoPatternType('crosshatch');
    assert.strictEqual(lassoPatternType, 'crosshatch');
    const btnCross = document.getElementById('btn-lasso-pat-crosshatch');
    assert.ok(btnCross?.classList.contains('bg-indigo-600'), 'Crosshatch button must be highlighted');

    // Switch to Sample type and verify sample notice shows
    setLassoPatternType('sample');
    assert.strictEqual(lassoPatternType, 'sample');
    const sampleNotice = document.getElementById('lasso-pattern-sample-notice');
    assert.ok(!sampleNotice?.classList.contains('hidden'), 'Sample notice must be visible');

    // Test button enable / disable synchronization
    updateLassoButtons(true);
    const btnFill = document.getElementById('btn-lasso-fill');
    const btnPatFill = document.getElementById('btn-lasso-pattern-fill');
    assert.strictEqual(btnFill.disabled, false, 'AI fill button should be enabled');
    assert.strictEqual(btnPatFill.disabled, false, 'Pattern fill button should be enabled');

    updateLassoButtons(false);
    assert.strictEqual(btnFill.disabled, true, 'AI fill button should be disabled');
    assert.strictEqual(btnPatFill.disabled, true, 'Pattern fill button should be disabled');
});

test('Lasso Pattern Fill - Global Phase Alignment Formula', () => {
    // Adjacent or split lasso regions must share global phase coordinates
    const tileW = 8;
    const tileH = 8;

    const startX1 = 123;
    const startY1 = 456;
    const shiftX1 = -(startX1 % tileW);
    const shiftY1 = -(startY1 % tileH);

    const startX2 = 131; // Exactly 8px offset (1 period away)
    const startY2 = 464; // Exactly 8px offset (1 period away)
    const shiftX2 = -(startX2 % tileW);
    const shiftY2 = -(startY2 % tileH);

    assert.strictEqual(shiftX1, shiftX2, 'Global phase shift X must match across period boundaries');
    assert.strictEqual(shiftY1, shiftY2, 'Global phase shift Y must match across period boundaries');
});

test('Lasso Pattern Fill - runLassoPatternFill with Rectangular Sample Tiling and Masking', async () => {
    const mockEraserCanvas = document.getElementById('eraser-canvas');
    patchCanvasElement(mockEraserCanvas, 800, 1200);

    const mockBgImg = document.getElementById('manga-bg-image');
    mockBgImg.naturalWidth = 800;
    mockBgImg.naturalHeight = 1200;

    const mockPage = {
        id: 'p_test_rect_1',
        blocks: [],
        eraserDrawing: null
    };
    globalState.pages = [mockPage];
    globalState.activePageIndex = 0;

    // 1. Test autoSampleNearbyLassoRect
    globalThis.activeLassoPoints = [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
        { x: 100, y: 200 }
    ];

    const sampled = autoSampleNearbyLassoRect();
    assert.strictEqual(sampled, true, 'autoSampleNearbyLassoRect should succeed when image is available');
    assert.ok(lassoSampleCanvas, 'lassoSampleCanvas must be set');
    assert.strictEqual(lassoSampleCanvas.width, 32);
    assert.strictEqual(lassoSampleCanvas.height, 32);
    assert.strictEqual(lassoPatternType, 'sample');

    // 2. Test runLassoPatternFill with rectangular sample
    await runLassoPatternFill();

    // Verify completion
    assert.strictEqual(globalThis.activeLassoPoints, null, 'Active lasso points must be cleared');
    const patBtn = document.getElementById('btn-lasso-pattern-fill');
    assert.strictEqual(patBtn.disabled, true, 'Pattern fill button must be disabled after completion');
});

test('Lasso Pattern Fill - Fill Techniques Switching & Offset Nudge Controls', () => {
    // 1. Technique switching
    setLassoFillTechnique('patch_1to1');
    assert.strictEqual(lassoFillTechnique, 'patch_1to1');

    setLassoFillTechnique('grid_tile');
    assert.strictEqual(lassoFillTechnique, 'grid_tile');

    setLassoFillTechnique('seamless_tile');
    assert.strictEqual(lassoFillTechnique, 'seamless_tile');

    setLassoFillTechnique('preset_tone');
    assert.strictEqual(lassoFillTechnique, 'preset_tone');

    // 2. Direct offset setters (Sliders)
    setLassoPatternOffsetX(12);
    assert.strictEqual(lassoPatternOffsetX, 12);
    setLassoPatternOffsetY(-15);
    assert.strictEqual(lassoPatternOffsetY, -15);

    // 3. Nudge offset calculations
    resetLassoPatternOffset();
    assert.strictEqual(lassoPatternOffsetX, 0);
    assert.strictEqual(lassoPatternOffsetY, 0);

    nudgeLassoPatternOffset(1, 0); // +1 X
    assert.strictEqual(lassoPatternOffsetX, 1);
    assert.strictEqual(lassoPatternOffsetY, 0);

    nudgeLassoPatternOffset(-2, -3); // -1 X, -3 Y
    assert.strictEqual(lassoPatternOffsetX, -1);
    assert.strictEqual(lassoPatternOffsetY, -3);

    resetLassoPatternOffset();
    assert.strictEqual(lassoPatternOffsetX, 0);
    assert.strictEqual(lassoPatternOffsetY, 0);
});

test('Lasso Pattern Fill - makeSeamlessTile & findBestAdjacentPatch algorithms', () => {
    // 1. makeSeamlessTile
    const sample = document.createElement('canvas');
    sample.width = 32;
    sample.height = 32;
    const seamless = makeSeamlessTile(sample, 8);
    assert.ok(seamless, 'makeSeamlessTile should return canvas');
    assert.strictEqual(seamless.width, 32);
    assert.strictEqual(seamless.height, 32);

    // 2. findBestAdjacentPatch
    const mockImg = { naturalWidth: 1000, naturalHeight: 1400 };
    const patch = findBestAdjacentPatch(mockImg, 100, 100, 50, 50);
    assert.ok(patch, 'findBestAdjacentPatch should return valid coords');
    assert.strictEqual(patch.w, 50);
    assert.strictEqual(patch.h, 50);
    assert.ok(patch.x >= 0 && patch.y >= 0);
});
