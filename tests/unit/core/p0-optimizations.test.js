import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import '../../setup/indexeddb-mock.js';
import { globalState, pushStateToHistory, applyStateFromSnapshot, undoStack, redoStack, executeUndo, executeRedo, clearHistory } from '../../../src/core/state.ts';
import { detectSpeechBubbleAtPointFromLuminanceRoi, computeTextMaskDilatedRoiFromLuminanceRoi } from '../../../src/workers/ocr.worker.ts';

test('P0-1: Delta Scoped Undo/Redo - Page Level Snapshot only clones active page', async () => {
    clearHistory();

    const page1 = {
        id: 'page_1',
        name: 'Page 1',
        blocks: [{ id: 'b1', original: 'Page 1 text', translated: 'Trang 1' }],
        width: 800,
        height: 1200,
        status: 'completed'
    };

    const page2 = {
        id: 'page_2',
        name: 'Page 2',
        blocks: [{ id: 'b2', original: 'Page 2 text', translated: 'Trang 2' }],
        width: 800,
        height: 1200,
        status: 'draft'
    };

    globalState.pages = [page1, page2];
    globalState.activePageIndex = 1;

    // 1. Perform a page-level action on Page 2
    pushStateToHistory(); // default: page-level

    assert.strictEqual(undoStack.length, 1);
    const topSnapshot = undoStack[0];
    assert.strictEqual(topSnapshot.scope, 'page');
    assert.strictEqual(topSnapshot.pageId, 'page_2');
    assert.ok(topSnapshot.pageState);
    assert.strictEqual(topSnapshot.pageState.name, 'Page 2');
    // pagesState getter ensures backward compatibility without cloning all pages
    assert.strictEqual(topSnapshot.pagesState.length, 1);
    assert.strictEqual(topSnapshot.pagesState[0].id, 'page_2');

    // 2. Modify Page 2 text
    globalState.pages[1].blocks[0].translated = 'Trang 2 đã chỉnh sửa';

    // 3. Execute Undo
    executeUndo();

    // Verify Page 2 is restored and Page 1 remains untouched
    assert.strictEqual(globalState.pages.length, 2);
    assert.strictEqual(globalState.pages[1].blocks[0].translated, 'Trang 2');
    assert.strictEqual(globalState.pages[0].blocks[0].translated, 'Trang 1');

    // 4. Execute Redo
    executeRedo();
    assert.strictEqual(globalState.pages[1].blocks[0].translated, 'Trang 2 đã chỉnh sửa');
});

test('P0-1: Project Level Snapshot captures whole project structure', async () => {
    clearHistory();

    const page1 = { id: 'p1', name: 'P1', blocks: [] };
    const page2 = { id: 'p2', name: 'P2', blocks: [] };
    globalState.pages = [page1, page2];
    globalState.activePageIndex = 0;

    pushStateToHistory(true); // project-level snapshot

    assert.strictEqual(undoStack.length, 1);
    assert.strictEqual(undoStack[0].scope, 'project');
    assert.strictEqual(undoStack[0].pagesState.length, 2);
});

test('P0-2: OCR Worker - Luminance ROI computation functions correctly', async () => {
    const roiW = 100;
    const roiH = 100;
    const roiLuminance = new Uint8Array(roiW * roiH);

    // Create a bright speech bubble (white = 255) surrounded by dark background (black = 0)
    for (let y = 0; y < roiH; y++) {
        for (let x = 0; x < roiW; x++) {
            const distFromCenter = Math.hypot(x - 50, y - 50);
            if (distFromCenter <= 30) {
                roiLuminance[y * roiW + x] = 240; // white bubble
            } else {
                roiLuminance[y * roiW + x] = 20;  // dark background
            }
        }
    }

    // Detect speech bubble inside ROI
    const result = detectSpeechBubbleAtPointFromLuminanceRoi(
        roiLuminance,
        roiW,
        roiH,
        200, // roiOffsetX in full image
        300, // roiOffsetY in full image
        1000, // imgWidth
        1000, // imgHeight
        250,  // clickPixelX
        350   // clickPixelY
    );

    assert.ok(result, 'Speech bubble should be detected');
    assert.ok(result.box, 'Should return bounding box');
    assert.ok(result.pixelBox, 'Should return pixelBox in full image coordinates');

    // Verify coordinates map accurately back to image coordinates (around 200..300 X, 300..400 Y)
    assert.ok(result.pixelBox.bx >= 200 && result.pixelBox.bx <= 230);
    assert.ok(result.pixelBox.by >= 300 && result.pixelBox.by <= 330);
    assert.ok(result.pixelBox.bw >= 40 && result.pixelBox.bw <= 80);
    assert.ok(result.pixelBox.bh >= 40 && result.pixelBox.bh <= 80);
});

test('P0-2: Text Mask Dilation on Cropped Luminance ROI', async () => {
    const sw = 80;
    const sh = 40;
    const roiLuminance = new Uint8Array(sw * sh);
    roiLuminance.fill(255); // background white

    // Draw some dark text glyphs
    for (let ly = 10; ly < 30; ly++) {
        for (let lx = 15; lx < 65; lx++) {
            if ((lx % 5 === 0) || (ly % 4 === 0)) {
                roiLuminance[ly * sw + lx] = 20; // dark text pixel
            }
        }
    }

    const rawBox = { x: 10, y: 10, w: 8, h: 4 };
    const dilatedBox = computeTextMaskDilatedRoiFromLuminanceRoi(
        roiLuminance,
        100, // sx
        100, // sy
        sw,
        sh,
        1000, // imgW
        1000, // imgH
        rawBox
    );

    assert.ok(dilatedBox, 'Dilated box must be calculated');
    assert.ok(dilatedBox.w > 0 && dilatedBox.h > 0);
    assert.strictEqual(typeof dilatedBox.x, 'number');
    assert.strictEqual(typeof dilatedBox.y, 'number');
});
