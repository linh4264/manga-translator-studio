import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import {
    applyStylePreset,
    updateSfxRotate,
    updateSfxArc,
    updateSfxSkewX,
    updateSfxSkewY,
    updateSfxWave,
    updateSfxBulge,
    resetWarpTransformControls,
    setCopiedStyle,
    copiedStyle,
    alignActiveBlockPosition
} from '../../../src/features/canvas/canvas-styling.ts';
import { globalState } from '../../../src/core/state.ts';

test('Canvas Styling - 1-Click Style Presets Application', () => {
    const mockBlock = {
        id: 'test_blk',
        type: 'dialogue',
        translated: 'Xin chào!',
        box: { x: 20, y: 20, w: 30, h: 25 },
        style: { vertical: false }
    };

    globalState.pages = [{ id: 'p1', blocks: [mockBlock] }];
    globalState.activePageIndex = 0;
    globalState.selectedBlockId = 'test_blk';

    // 1. Dialogue Preset
    applyStylePreset('dialogue');
    assert.strictEqual(mockBlock.style.fontFamily, 'font-manga');
    assert.strictEqual(mockBlock.style.bold, true);
    assert.strictEqual(mockBlock.style.bgOpacity, 100);
    assert.strictEqual(mockBlock.style.strokeWidth, 0);

    // 2. Scream Preset
    applyStylePreset('scream');
    assert.strictEqual(mockBlock.style.fontFamily, 'font-impact');
    assert.strictEqual(mockBlock.style.strokeWidth, 4);
    assert.strictEqual(mockBlock.style.bgOpacity, 0);

    // 3. Whisper Preset
    applyStylePreset('whisper');
    assert.strictEqual(mockBlock.style.fontFamily, 'font-caveat');
    assert.strictEqual(mockBlock.style.maskShape, 'ellipse');

    // 4. Narration Preset
    applyStylePreset('narration');
    assert.strictEqual(mockBlock.style.fontFamily, 'font-vietnamese');
    assert.strictEqual(mockBlock.style.maskShape, 'rect');
});

test('Canvas Styling - SFX Warp Controls & Reset', () => {
    const sfxBlock = {
        id: 'sfx_blk',
        type: 'sfx',
        box: { x: 40, y: 40, w: 30, h: 20 },
        style: { vertical: false }
    };

    globalState.pages = [{ id: 'p1', blocks: [sfxBlock] }];
    globalState.activePageIndex = 0;
    globalState.selectedBlockId = 'sfx_blk';

    updateSfxRotate(25);
    updateSfxArc(45);
    updateSfxSkewX(15);
    updateSfxSkewY(-10);
    updateSfxWave(30);
    updateSfxBulge(20);

    assert.strictEqual(sfxBlock.style.rotate, 25);
    assert.strictEqual(sfxBlock.style.arcAngle, 45);
    assert.strictEqual(sfxBlock.style.skewX, 15);
    assert.strictEqual(sfxBlock.style.skewY, -10);
    assert.strictEqual(sfxBlock.style.warpWave, 30);
    assert.strictEqual(sfxBlock.style.warpBulge, 20);

    // Reset controls
    resetWarpTransformControls();
    assert.strictEqual(sfxBlock.style.rotate, 0);
    assert.strictEqual(sfxBlock.style.arcAngle, 0);
    assert.strictEqual(sfxBlock.style.skewX, 0);
    assert.strictEqual(sfxBlock.style.skewY, 0);
    assert.strictEqual(sfxBlock.style.warpWave, 0);
    assert.strictEqual(sfxBlock.style.warpBulge, 0);
});

test('Canvas Styling - Multi-Block Alignment Engine', () => {
    const b1 = { id: 'b1', box: { x: 10, y: 10, w: 20, h: 20 }, style: { vertical: false } };
    const b2 = { id: 'b2', box: { x: 40, y: 30, w: 30, h: 20 }, style: { vertical: false } };

    globalState.pages = [{ id: 'p1', blocks: [b1, b2] }];
    globalState.activePageIndex = 0;
    globalState.selectedBlockIds = ['b1', 'b2'];

    // Align Left (aligns to minimum X of group = 10)
    alignActiveBlockPosition('left');
    assert.strictEqual(b1.box.x, 10);
    assert.strictEqual(b2.box.x, 10);

    // Single Block Center Canvas
    globalState.selectedBlockIds = [];
    globalState.selectedBlockId = 'b1';
    alignActiveBlockPosition('center-h');
    assert.strictEqual(b1.box.x, 40, '(100 - 20) / 2 = 40');
});
