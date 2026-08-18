import test from 'node:test';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import '../../setup/indexeddb-mock.js';

import { toggleMobileHandMode, isMobileHandModeActive } from '../../../src/features/canvas/touch-gestures.ts';
import { globalState } from '../../../src/core/state.ts';
import {
    openMobileLeftPanel, openMobileRightPanel, closeMobileMenus,
    toggleMobileLeftPanel, toggleMobileRightPanel, updateMobileNavUI
} from '../../../src/ui/layout-ui.ts';

test('Touch Gestures - Mobile Hand Mode Toggle', () => {
    // Initial state
    globalState.isMobileHandMode = false;
    assert.strictEqual(isMobileHandModeActive(), false);

    // Toggle on
    const state1 = toggleMobileHandMode();
    assert.strictEqual(state1, true);
    assert.strictEqual(isMobileHandModeActive(), true);
    assert.strictEqual(globalState.isMobileHandMode, true);

    // Toggle off
    const state2 = toggleMobileHandMode();
    assert.strictEqual(state2, false);
    assert.strictEqual(isMobileHandModeActive(), false);
    assert.strictEqual(globalState.isMobileHandMode, false);

    // Force state
    toggleMobileHandMode(true);
    assert.strictEqual(isMobileHandModeActive(), true);
    toggleMobileHandMode(false);
    assert.strictEqual(isMobileHandModeActive(), false);
});

test('Mobile Drawers - Left & Right Panel Open/Close States', () => {
    document.body.className = '';

    // Open Left Drawer
    openMobileLeftPanel();
    assert.strictEqual(document.body.classList.contains('mobile-menu-left-open'), true);
    assert.strictEqual(document.body.classList.contains('mobile-menu-right-open'), false);

    // Open Right Drawer (should close Left Drawer)
    openMobileRightPanel('style');
    assert.strictEqual(document.body.classList.contains('mobile-menu-left-open'), false);
    assert.strictEqual(document.body.classList.contains('mobile-menu-right-open'), true);

    // Close all mobile menus
    closeMobileMenus();
    assert.strictEqual(document.body.classList.contains('mobile-menu-left-open'), false);
    assert.strictEqual(document.body.classList.contains('mobile-menu-right-open'), false);

    // Toggle Left Drawer
    toggleMobileLeftPanel();
    assert.strictEqual(document.body.classList.contains('mobile-menu-left-open'), true);
    toggleMobileLeftPanel();
    assert.strictEqual(document.body.classList.contains('mobile-menu-left-open'), false);

    // Toggle Right Drawer
    toggleMobileRightPanel('edit');
    assert.strictEqual(document.body.classList.contains('mobile-menu-right-open'), true);
    toggleMobileRightPanel('edit');
    assert.strictEqual(document.body.classList.contains('mobile-menu-right-open'), false);
});

test('Mobile Navigation UI - Page indicator & Dock State', () => {
    // Setup dummy DOM elements
    document.body.innerHTML = `
        <div id="mobile-canvas-dock" class="hidden"></div>
        <span id="mobile-dock-page-indicator"></span>
        <button id="btn-mobile-prev-page"></button>
        <button id="btn-mobile-next-page"></button>
        <span id="mobile-nav-page-badge" class="hidden"></span>
        <button id="btn-mobile-dock-translate"></button>
    `;

    globalState.pages = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
    globalState.activePageIndex = 1;

    updateMobileNavUI();

    const indicator = document.getElementById('mobile-dock-page-indicator');
    const badge = document.getElementById('mobile-nav-page-badge');
    const dock = document.getElementById('mobile-canvas-dock');
    const prevBtn = document.getElementById('btn-mobile-prev-page');
    const nextBtn = document.getElementById('btn-mobile-next-page');

    assert.strictEqual(indicator?.innerText, '2 / 3');
    assert.strictEqual(badge?.innerText, '3');
    assert.strictEqual(badge?.classList.contains('hidden'), false);
    assert.strictEqual(dock?.classList.contains('hidden'), false);
    assert.strictEqual(prevBtn?.disabled, false);
    assert.strictEqual(nextBtn?.disabled, false);
});

test('Mobile Quick Editor - Open, Text Sync & Font Size Adjustment', async () => {
    document.body.innerHTML = `
        <div id="mobile-quick-edit-sheet" class="hidden"></div>
        <div id="mobile-quick-edit-backdrop" class="hidden"></div>
        <span id="mobile-quick-edit-title"></span>
        <span id="mobile-quick-edit-orig-preview"></span>
        <textarea id="mobile-quick-edit-textarea"></textarea>
        <span id="mobile-quick-font-size-text"></span>
        <span id="mobile-quick-orientation-text"></span>
    `;

    const sampleBlock = {
        id: 'block_test_1',
        type: 'dialogue',
        original: 'ヤッホー',
        translated: 'Xin chào',
        box: { x: 10, y: 10, w: 20, h: 20 },
        style: { fontSize: 18, vertical: false }
    };

    globalState.pages = [{ id: 'p1', blocks: [sampleBlock] }];
    globalState.activePageIndex = 0;
    globalState.selectedBlockId = 'block_test_1';

    const {
        openMobileQuickEditor, closeMobileQuickEditor,
        changeMobileActiveFontSize, toggleMobileActiveOrientation
    } = await import('../../../src/ui/layout-ui.ts');

    // Open Quick Editor
    openMobileQuickEditor('block_test_1');

    const sheet = document.getElementById('mobile-quick-edit-sheet');
    const backdrop = document.getElementById('mobile-quick-edit-backdrop');
    const textarea = document.getElementById('mobile-quick-edit-textarea');
    const fontLabel = document.getElementById('mobile-quick-font-size-text');
    const orientLabel = document.getElementById('mobile-quick-orientation-text');

    assert.strictEqual(sheet?.classList.contains('hidden'), false);
    assert.strictEqual(backdrop?.classList.contains('hidden'), false);
    assert.strictEqual(textarea?.value, 'Xin chào');
    assert.strictEqual(fontLabel?.innerText, '18px');
    assert.strictEqual(orientLabel?.innerText, 'Ngang');

    // Change Font Size (+4px)
    changeMobileActiveFontSize(4);
    assert.strictEqual(sampleBlock.style.fontSize, 22);
    assert.strictEqual(fontLabel?.innerText, '22px');

    // Toggle Orientation
    toggleMobileActiveOrientation();
    assert.strictEqual(sampleBlock.style.vertical, true);
    assert.strictEqual(orientLabel?.innerText, 'Dọc');

    // Close Quick Editor
    closeMobileQuickEditor();
    assert.strictEqual(sheet?.classList.contains('hidden'), true);
    assert.strictEqual(backdrop?.classList.contains('hidden'), true);
});
