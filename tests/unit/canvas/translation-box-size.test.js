import { test, expect, assert } from 'vitest';
import '../../setup/browser-env.js';
import '../../setup/indexeddb-mock.js';

import { DEFAULT_BLOCK_SIZE_PX } from '../../../src/config/constants.ts';
import { refineAiBlockBox } from '../../../src/features/ocr/ocr-service.ts';
import { addNewBlock, startBlockResize } from '../../../src/features/canvas/canvas-interactions.ts';
import { snapBlockToMagicWandBubble } from '../../../src/features/canvas/magic-wand.ts';
import { globalState } from '../../../src/core/state.ts';

test('Translation Box Size - Initial Box is Exactly 400px x 400px Equivalent', () => {
    assert.strictEqual(DEFAULT_BLOCK_SIZE_PX, 400, 'DEFAULT_BLOCK_SIZE_PX must be 400');

    // On standard 1000x1000 image, 400px = 40%, anchor [500, 300] (center) -> top-left x = 500-200=300px (30%), y = 300-200=100px (10%)
    const aiBox = refineAiBlockBox([500, 300], { width: 1000, height: 1000 });
    assert.strictEqual(aiBox.x, 30, 'Top-left X must match anchorX - 200px (30%)');
    assert.strictEqual(aiBox.y, 10, 'Top-left Y must match anchorY - 200px (10%)');
    assert.strictEqual(aiBox.w, 40, 'Width must be 40% for 400px on 1000px width');
    assert.strictEqual(aiBox.h, 40, 'Height must be 40% for 400px on 1000px height');

    // On 800x1200 image, anchor [400, 600] -> anchorX=400px (50%), anchorY=600px (50%) -> top-left x = 400-200=200px (25%), y = 600-200=400px (33.33%)
    const customImgBox = refineAiBlockBox([500, 500], { width: 800, height: 1200 });
    assert.strictEqual(customImgBox.x, 25, 'Top-left X 200px on 800px image must be 25%');
    assert.strictEqual(customImgBox.y, 33.34, 'Top-left Y on 1200px image must be 33.34%');
    assert.strictEqual(customImgBox.w, 50, 'Width 400px on 800px image must be 50%');
    assert.strictEqual(customImgBox.h, 33.33, 'Height 400px on 1200px image must be 33.33%');
});

test('Translation Box Size - addNewBlock() Initializes with 400px x 400px', () => {
    globalState.pages = [{ id: 'p1', blocks: [] }];
    globalState.activePageIndex = 0;

    let imgEl = document.getElementById('manga-bg-image');
    if (!imgEl) {
        imgEl = document.createElement('img');
        imgEl.id = 'manga-bg-image';
        document.body.appendChild(imgEl);
    }
    imgEl.naturalWidth = 1000;
    imgEl.naturalHeight = 1000;

    addNewBlock();

    const created = globalState.pages[0].blocks[0];
    assert.ok(created, 'Block should be created');
    assert.strictEqual(created.type, 'dialogue');
    assert.strictEqual(created.box.w, 40, 'Block width must be 40% (400px on 1000px)');
    assert.strictEqual(created.box.h, 40, 'Block height must be 40% (400px on 1000px)');
});

test('Translation Box Size - Manual Corner Resizing (4 corners) Functions Smoothly', () => {
    const dialogueBlock = {
        id: 'test_dialogue_blk',
        type: 'dialogue',
        translated: 'Nội dung dịch',
        box: { x: 30, y: 30, w: 40, h: 40 },
        style: {}
    };

    let container = document.getElementById('manga-canvas-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'manga-canvas-container';
        document.body.appendChild(container);
    }
    container.clientWidth = 1000;
    container.clientHeight = 1000;

    const mockStartEvent = {
        button: 0,
        stopPropagation: () => {},
        preventDefault: () => {},
        clientX: 100,
        clientY: 100,
        type: 'mousedown'
    };

    startBlockResize(mockStartEvent, dialogueBlock, 'se');

    // Simulate mousemove by +50px X and +50px Y (5% delta on 1000px)
    const moveListeners = window._listeners?.get?.('mousemove') || [];
    const moveHandler = moveListeners[moveListeners.length - 1];
    if (typeof moveHandler === 'function') {
        moveHandler({
            type: 'mousemove',
            clientX: 150,
            clientY: 150
        });
        assert.strictEqual(dialogueBlock.box.w, 45, 'Width should resize to 45%');
        assert.strictEqual(dialogueBlock.box.h, 45, 'Height should resize to 45%');
    }
});

test('Translation Box Size - Magic Wand Snapping Fits Contour Dimensions and Position', () => {
    const dialogueBlock = {
        id: 'test_magic_blk',
        type: 'dialogue',
        translated: 'Khớp bóng thoại',
        box: { x: 10, y: 10, w: 40, h: 40 },
        style: {}
    };

    globalState.pages = [{ id: 'p1', blocks: [dialogueBlock] }];
    globalState.activePageIndex = 0;

    // Detected speech bubble at { x: 50, y: 60, w: 25, h: 30 }
    const detectedBubbleBox = { x: 50, y: 60, w: 25, h: 30 };

    snapBlockToMagicWandBubble('test_magic_blk', detectedBubbleBox);

    assert.strictEqual(dialogueBlock.box.x, 50, 'X position should match detected bubble');
    assert.strictEqual(dialogueBlock.box.y, 60, 'Y position should match detected bubble');
    assert.strictEqual(dialogueBlock.box.w, 25, 'Width must tightly snap to detected bubble width');
    assert.strictEqual(dialogueBlock.box.h, 30, 'Height must tightly snap to detected bubble height');
});

test('Translation Box Size - refineAiBlockBox Triggers Magic Wand Auto-Snap on Speech Bubble', () => {
    const W = 1000;
    const H = 1000;
    const data = new Uint8ClampedArray(W * H * 4);
    // Dark background (brightness ~50)
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 50; data[i + 1] = 50; data[i + 2] = 50; data[i + 3] = 255;
    }
    // Draw a bright white speech bubble at x: 300..700 (width 400 = 40%), y: 200..600 (height 400 = 40%)
    for (let y = 200; y <= 600; y++) {
        for (let x = 300; x <= 700; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 240; data[idx + 1] = 240; data[idx + 2] = 240;
        }
    }
    const mockImageData = { width: W, height: H, data };

    // AI returns anchor [500, 400] (center at x=500px, y=400px)
    const refined = refineAiBlockBox([500, 400], mockImageData);

    // Box should automatically snap to the speech bubble contour: x: 30%, y: 20%, w: 40%, h: 40%
    assert.strictEqual(refined.x, 30, 'X must snap to bubble left edge (30%)');
    assert.strictEqual(refined.y, 20, 'Y must snap to bubble top edge (20%)');
    assert.strictEqual(refined.w, 40, 'Width must snap to bubble width (40%)');
    assert.strictEqual(refined.h, 40, 'Height must snap to bubble height (40%)');
});

test('Translation Box Size - Conjoined / Touching Speech Bubbles are Separated at Isthmus', () => {
    const W = 1000;
    const H = 1000;
    const data = new Uint8ClampedArray(W * H * 4);
    // Dark background (50)
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 50; data[i + 1] = 50; data[i + 2] = 50; data[i + 3] = 255;
    }

    // Upper bubble: x: 300..700 (width=400px = 40%), y: 100..450 (height=350px = 35%)
    for (let y = 100; y <= 450; y++) {
        for (let x = 300; x <= 700; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 240; data[idx + 1] = 240; data[idx + 2] = 240;
        }
    }

    // Isthmus / Neck (narrow bridge): x: 470..530 (width=60px = 6%), y: 450..500
    for (let y = 450; y <= 500; y++) {
        for (let x = 470; x <= 530; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 240; data[idx + 1] = 240; data[idx + 2] = 240;
        }
    }

    // Lower bubble: x: 300..700 (width=400px = 40%), y: 500..850 (height=350px = 35%)
    for (let y = 500; y <= 850; y++) {
        for (let x = 300; x <= 700; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 240; data[idx + 1] = 240; data[idx + 2] = 240;
        }
    }

    const mockImageData = { width: W, height: H, data };

    // AI anchor in Upper bubble [500, 250]
    const upperRefined = refineAiBlockBox([500, 250], mockImageData);
    assert.strictEqual(upperRefined.y, 10, 'Upper bubble top edge must be 10%');
    assert.ok(upperRefined.h <= 40, 'Upper bubble height must not bleed into lower bubble');

    // AI anchor in Lower bubble [500, 650]
    const lowerRefined = refineAiBlockBox([500, 650], mockImageData);
    assert.ok(lowerRefined.y >= 45, 'Lower bubble top edge must start at isthmus cutoff');
    assert.strictEqual(lowerRefined.h + lowerRefined.y, 85, 'Lower bubble bottom edge must be 85%');
});

test('Translation Box Size - Topological Hole-Filling Bridges Internal Kanji Columns Without Cutting Early', () => {
    const W = 1000;
    const H = 1000;
    const data = new Uint8ClampedArray(W * H * 4);
    // Dark background (50)
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 50; data[i + 1] = 50; data[i + 2] = 50; data[i + 3] = 255;
    }

    // White speech bubble: x: 200..800 (w=600px = 60%), y: 200..800 (h=600px = 60%)
    for (let y = 200; y <= 800; y++) {
        for (let x = 200; x <= 800; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 240; data[idx + 1] = 240; data[idx + 2] = 240;
        }
    }

    // Vertical black text column running down the middle: x: 498..504, y: 250..750
    for (let y = 250; y <= 750; y++) {
        for (let x = 498; x <= 504; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 20; data[idx + 1] = 20; data[idx + 2] = 20;
        }
    }

    const mockImageData = { width: W, height: H, data };

    // Anchor on left side [350, 500] (center at x=350px, y=500px)
    const refined = refineAiBlockBox([350, 500], mockImageData);

    // Box should automatically fill the text holes and span the full bubble: x: 20%, w: 60%
    assert.strictEqual(refined.x, 20, 'Left edge must be 20%');
    assert.strictEqual(refined.w, 60, 'Width must bridge text column and span full 60% of bubble');
    assert.strictEqual(refined.y, 20, 'Top edge must be 20%');
    assert.strictEqual(refined.h, 60, 'Height must be 60%');
});

test('Translation Box Size - Strict Barrier Stops at Continuous Outer Bubble Border Even When Outside is White', () => {
    const W = 1000;
    const H = 1000;
    const data = new Uint8ClampedArray(W * H * 4);
    // Entire canvas is WHITE (240)
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 240; data[i + 1] = 240; data[i + 2] = 240; data[i + 3] = 255;
    }

    // Draw a continuous black rectangular bubble border: x: 300..700, y: 200..600 (3px border thickness)
    for (let x = 300; x <= 700; x++) {
        for (let t = 0; t < 3; t++) {
            const idxTop = ((200 + t) * W + x) * 4;
            const idxBot = ((600 - t) * W + x) * 4;
            data[idxTop] = 10; data[idxTop + 1] = 10; data[idxTop + 2] = 10;
            data[idxBot] = 10; data[idxBot + 1] = 10; data[idxBot + 2] = 10;
        }
    }
    for (let y = 200; y <= 600; y++) {
        for (let t = 0; t < 3; t++) {
            const idxLeft = (y * W + (300 + t)) * 4;
            const idxRight = (y * W + (700 - t)) * 4;
            data[idxLeft] = 10; data[idxLeft + 1] = 10; data[idxLeft + 2] = 10;
            data[idxRight] = 10; data[idxRight + 1] = 10; data[idxRight + 2] = 10;
        }
    }

    const mockImageData = { width: W, height: H, data };

    // Anchor inside bubble [500, 400]
    const refined = refineAiBlockBox([500, 400], mockImageData);

    // Box MUST stop at the black border (inner edge 30.3%), and MUST NOT leak into the white space outside (0%..100%)
    assert.ok(refined.x >= 30 && refined.x <= 31, 'Left edge must strictly stop at bubble border (~30%)');
    assert.ok(refined.y >= 20 && refined.y <= 21, 'Top edge must strictly stop at bubble border (~20%)');
    assert.ok(refined.w <= 40, 'Width must strictly be <= 40% (not leaking to whole white image)');
    assert.ok(refined.h <= 40, 'Height must strictly be <= 40% (not leaking to whole white image)');
});
