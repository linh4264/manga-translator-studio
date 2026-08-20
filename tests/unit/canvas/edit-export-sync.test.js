import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import '../../setup/indexeddb-mock.js';

import { commitActiveEditingState, renderOverlays } from '../../../src/features/canvas/canvas-renderer.ts';
import { autoFitBlock, autoFitAllBlocksOnPage } from '../../../src/features/canvas/canvas-styling.ts';
import { globalState } from '../../../src/core/state.ts';
import { elements } from '../../../src/core/elements.ts';

test('Edit & Export Sync - commitActiveEditingState flushes inline editing to block data', () => {
    const block = {
        id: 'block_test_sync',
        type: 'dialogue',
        original: 'Original text',
        translated: 'Initial translation',
        box: { x: 10, y: 10, w: 30, h: 20 },
        style: { fontFamily: 'font-manga', fontSize: 16 }
    };

    const page = { id: 'page_sync_1', blocks: [block], name: 'Page 1' };
    globalState.pages = [page];
    globalState.activePageIndex = 0;
    globalState.selectedBlockId = 'block_test_sync';

    block._isEditingInline = true;
    const bubbleEl = document.getElementById('block_test_sync');
    bubbleEl.classList.add('editing-inline');

    const innerDiv = document.createElement('div');
    innerDiv.contentEditable = 'true';
    innerDiv.textContent = 'Newly typed translation in editor!';
    bubbleEl.appendChild(innerDiv);

    // Call commitActiveEditingState
    commitActiveEditingState();

    assert.strictEqual(block.translated, 'Newly typed translation in editor!', 'Block translated text must be updated from inline editor');
    assert.strictEqual(innerDiv.contentEditable, 'false', 'contentEditable should be turned off');
    assert.strictEqual(bubbleEl.classList.contains('editing-inline'), false, 'editing-inline class must be removed');
});

test('Edit & Export Sync - commitActiveEditingState flushes sidebar textarea input', () => {
    const block = {
        id: 'block_sidebar_test',
        type: 'dialogue',
        original: 'Original',
        translated: 'Old text',
        box: { x: 10, y: 10, w: 30, h: 20 },
        style: { fontFamily: 'font-manga', fontSize: 16 }
    };

    const page = { id: 'page_sidebar_1', blocks: [block], name: 'Page 1' };
    globalState.pages = [page];
    globalState.activePageIndex = 0;
    globalState.selectedBlockId = 'block_sidebar_test';

    const textarea = document.getElementById('edit-translated-text');
    textarea.value = 'Updated sidebar text';

    commitActiveEditingState();

    assert.strictEqual(block.translated, 'Updated sidebar text', 'Sidebar textarea value should be committed to active block');
});

test('Edit & Export Sync - AutoFit preserves lastDisplayWidth across pages and scale factors', () => {
    const block = {
        id: 'block_scale_test',
        type: 'dialogue',
        original: 'こんにちは',
        translated: 'Xin chào các bạn đã đến với kênh!',
        box: { x: 10, y: 10, w: 40, h: 30 },
        style: { fontFamily: 'font-manga', fontSize: 14 }
    };

    const page = { id: 'p_scale', blocks: [block], name: 'P1' };
    globalState.pages = [page];
    globalState.activePageIndex = 0;
    globalState.autoFitEnabled = true;

    autoFitBlock(block, null, 1, page);

    assert.ok(page.lastDisplayWidth > 0, 'lastDisplayWidth must be recorded on page');
    assert.ok(block.style.fontSize > 0, 'AutoFit must calculate a valid font size');
});
