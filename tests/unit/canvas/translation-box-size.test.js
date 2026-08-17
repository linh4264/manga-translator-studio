import test from 'node:test';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import '../../setup/indexeddb-mock.js';

import { DEFAULT_BLOCK_SIZE_PX } from '../../../public/src/config/constants.js';
import { refineAiBlockBox } from '../../../public/src/features/ocr/ocr-service.js';
import { addNewBlock, startBlockResize } from '../../../public/src/features/canvas/canvas-interactions.js';
import { snapBlockToMagicWandBubble } from '../../../public/src/features/canvas/magic-wand.js';
import { globalState } from '../../../public/src/core/state.js';

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
