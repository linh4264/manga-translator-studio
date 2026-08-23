import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import '../../setup/indexeddb-mock.js';

import {
    globalState,
    initializeStateFromStorage,
    getFontMetrics,
    initDB,
    saveFontToDB,
    getAllFontsFromDB,
    clearAllFontsFromDB
} from '../../../src/core/state.ts';
import {
    updateDefaultFontSize,
    updateDefaultLineHeight,
    updateDefaultLetterSpacing,
    resetDefaultFontMetrics,
    onTypographyTargetFontChange,
    syncSettingsUI
} from '../../../src/ui/settings-ui.ts';

test('Font Defaults - Initial Defaults and Fallback', () => {
    localStorage.clear();
    initializeStateFromStorage();

    assert.strictEqual(globalState.defaultFontSize, 17, 'Default font size should be 17px');
    assert.strictEqual(globalState.defaultLineHeight, 1.15, 'Default line height should be 1.15');
    assert.strictEqual(globalState.defaultLetterSpacing, 0, 'Default letter spacing should be 0px');
    assert.strictEqual(globalState.globalStyle.fontSize, 17);
    assert.strictEqual(globalState.globalStyle.lineHeight, 1.15);
    assert.strictEqual(globalState.globalStyle.letterSpacing, 0);
});

test('Font Defaults - Load from LocalStorage via initializeStateFromStorage', () => {
    localStorage.setItem('manga_default_font_size', '24');
    localStorage.setItem('manga_default_line_height', '1.4');
    localStorage.setItem('manga_default_letter_spacing', '1.5');

    initializeStateFromStorage();

    assert.strictEqual(globalState.defaultFontSize, 24);
    assert.strictEqual(globalState.defaultLineHeight, 1.4);
    assert.strictEqual(globalState.defaultLetterSpacing, 1.5);
    assert.strictEqual(globalState.globalStyle.fontSize, 24);
    assert.strictEqual(globalState.globalStyle.lineHeight, 1.4);
    assert.strictEqual(globalState.globalStyle.letterSpacing, 1.5);
});

test('Font Defaults - updateDefaultFontSize mutates state, globalStyle, and storage', () => {
    // Valid update
    updateDefaultFontSize(20);
    assert.strictEqual(globalState.defaultFontSize, 20);
    assert.strictEqual(globalState.globalStyle.fontSize, 20);
    assert.strictEqual(localStorage.getItem('manga_default_font_size'), '20');

    // String input
    updateDefaultFontSize('28');
    assert.strictEqual(globalState.defaultFontSize, 28);
    assert.strictEqual(globalState.globalStyle.fontSize, 28);
    assert.strictEqual(localStorage.getItem('manga_default_font_size'), '28');

    // Clamping lower bound
    updateDefaultFontSize(2);
    assert.strictEqual(globalState.defaultFontSize, 8);

    // Clamping upper bound
    updateDefaultFontSize(200);
    assert.strictEqual(globalState.defaultFontSize, 120);
});

test('Font Defaults - updateDefaultLineHeight mutates state, globalStyle, and storage', () => {
    // Valid update
    updateDefaultLineHeight(1.35);
    assert.strictEqual(globalState.defaultLineHeight, 1.35);
    assert.strictEqual(globalState.globalStyle.lineHeight, 1.35);
    assert.strictEqual(localStorage.getItem('manga_default_line_height'), '1.35');

    // String input
    updateDefaultLineHeight('1.6');
    assert.strictEqual(globalState.defaultLineHeight, 1.6);
    assert.strictEqual(globalState.globalStyle.lineHeight, 1.6);
    assert.strictEqual(localStorage.getItem('manga_default_line_height'), '1.6');

    // Clamping
    updateDefaultLineHeight(0.2);
    assert.strictEqual(globalState.defaultLineHeight, 0.5);

    updateDefaultLineHeight(5.0);
    assert.strictEqual(globalState.defaultLineHeight, 3.0);
});

test('Font Defaults - updateDefaultLetterSpacing mutates state, globalStyle, and storage', () => {
    // Valid update
    updateDefaultLetterSpacing(2.5);
    assert.strictEqual(globalState.defaultLetterSpacing, 2.5);
    assert.strictEqual(globalState.globalStyle.letterSpacing, 2.5);
    assert.strictEqual(localStorage.getItem('manga_default_letter_spacing'), '2.5');

    // Negative letter spacing
    updateDefaultLetterSpacing(-1.5);
    assert.strictEqual(globalState.defaultLetterSpacing, -1.5);
    assert.strictEqual(globalState.globalStyle.letterSpacing, -1.5);

    // Clamping
    updateDefaultLetterSpacing(-10);
    assert.strictEqual(globalState.defaultLetterSpacing, -5);

    updateDefaultLetterSpacing(50);
    assert.strictEqual(globalState.defaultLetterSpacing, 30);
});

test('Font Defaults - resetDefaultFontMetrics resets all values to standard defaults', () => {
    updateDefaultFontSize(32);
    updateDefaultLineHeight(1.8);
    updateDefaultLetterSpacing(4);

    assert.strictEqual(globalState.defaultFontSize, 32);

    resetDefaultFontMetrics();

    assert.strictEqual(globalState.defaultFontSize, 17);
    assert.strictEqual(globalState.defaultLineHeight, 1.15);
    assert.strictEqual(globalState.defaultLetterSpacing, 0);
    assert.strictEqual(globalState.globalStyle.fontSize, 17);
    assert.strictEqual(globalState.globalStyle.lineHeight, 1.15);
    assert.strictEqual(globalState.globalStyle.letterSpacing, 0);
});

test('Font Defaults - UI Synchronization with DOM Elements', () => {
    document.body.innerHTML = `
        <input type="range" id="slider-default-font-size" value="17">
        <span id="lbl-default-font-size">17px</span>
        <input type="range" id="slider-default-line-height" value="1.15">
        <span id="lbl-default-line-height">1.15</span>
        <input type="range" id="slider-default-letter-spacing" value="0">
        <span id="lbl-default-letter-spacing">0px</span>
    `;

    globalState.defaultFontSize = 26;
    globalState.defaultLineHeight = 1.45;
    globalState.defaultLetterSpacing = 3;

    syncSettingsUI();

    const sizeSlider = document.getElementById('slider-default-font-size');
    const sizeLbl = document.getElementById('lbl-default-font-size');
    const lhSlider = document.getElementById('slider-default-line-height');
    const lhLbl = document.getElementById('lbl-default-line-height');
    const lsSlider = document.getElementById('slider-default-letter-spacing');
    const lsLbl = document.getElementById('lbl-default-letter-spacing');

    assert.strictEqual(sizeSlider.value, '26');
    assert.strictEqual(sizeLbl.textContent, '26px');
    assert.strictEqual(lhSlider.value, '1.45');
    assert.strictEqual(lhLbl.textContent, '1.45');
    assert.strictEqual(lsSlider.value, '3');
    assert.strictEqual(lsLbl.textContent, '3px');
});

test('Font Defaults - Per-Font Typography Metrics Configuration', () => {
    document.body.innerHTML = `
        <select id="typography-target-font">
            <option value="__global__">Mặc định chung</option>
            <option value="font-impact">Kỳ vĩ / SFX (Bangers)</option>
            <option value="MyCustomFont">MyCustomFont (Tùy chỉnh)</option>
        </select>
        <span id="typography-font-badge">Mặc định chung</span>
        <input type="range" id="slider-default-font-size" value="17">
        <span id="lbl-default-font-size">17px</span>
        <input type="range" id="slider-default-line-height" value="1.15">
        <span id="lbl-default-line-height">1.15</span>
        <input type="range" id="slider-default-letter-spacing" value="0">
        <span id="lbl-default-letter-spacing">0px</span>
    `;

    globalState.defaultFontSize = 17;
    globalState.defaultLineHeight = 1.15;
    globalState.defaultLetterSpacing = 0;
    globalState.fontSpecificMetrics = {};

    const typoSelect = document.getElementById('typography-target-font');

    // 1. Initially check global metrics
    const initialMetrics = getFontMetrics('font-impact');
    assert.strictEqual(initialMetrics.fontSize, 17);
    assert.strictEqual(initialMetrics.lineHeight, 1.15);
    assert.strictEqual(initialMetrics.letterSpacing, 0);

    // 2. Select specific font
    typoSelect.value = 'font-impact';
    onTypographyTargetFontChange('font-impact');

    // 3. Update metrics for font-impact
    updateDefaultFontSize(26);
    updateDefaultLineHeight(1.05);
    updateDefaultLetterSpacing(2);

    // 4. Verify font-specific metrics
    const impactMetrics = getFontMetrics('font-impact');
    assert.strictEqual(impactMetrics.fontSize, 26);
    assert.strictEqual(impactMetrics.lineHeight, 1.05);
    assert.strictEqual(impactMetrics.letterSpacing, 2);

    // 5. Global defaults remain intact
    assert.strictEqual(globalState.defaultFontSize, 17);
    assert.strictEqual(globalState.defaultLineHeight, 1.15);
    assert.strictEqual(globalState.defaultLetterSpacing, 0);

    // 6. Reset font-specific metrics
    resetDefaultFontMetrics();
    const resetImpact = getFontMetrics('font-impact');
    assert.strictEqual(resetImpact.fontSize, 17);
    assert.strictEqual(resetImpact.lineHeight, 1.15);
    assert.strictEqual(resetImpact.letterSpacing, 0);
});

test('Font Defaults - clearAllFontsFromDB removes all custom font records', async () => {
    await initDB();

    const fakeBlob1 = new Blob(['font1'], { type: 'font/ttf' });
    const fakeBlob2 = new Blob(['font2'], { type: 'font/ttf' });

    await saveFontToDB('CustomFontA', fakeBlob1);
    await saveFontToDB('CustomFontB', fakeBlob2);

    let fonts = await getAllFontsFromDB();
    assert.strictEqual(fonts.length >= 2, true);

    await clearAllFontsFromDB();

    fonts = await getAllFontsFromDB();
    assert.strictEqual(fonts.length, 0);
});

test('Font Defaults - Modifying font metrics actively updates matching canvas blocks', async () => {
    document.body.innerHTML = `
        <select id="typography-target-font">
            <option value="ZombieFont">ZombieFont (Tùy chỉnh)</option>
        </select>
        <span id="typography-font-badge">Riêng: ZombieFont</span>
        <input type="range" id="slider-default-font-size" value="17">
        <span id="lbl-default-font-size">17px</span>
        <input type="range" id="slider-default-line-height" value="1.15">
        <span id="lbl-default-line-height">1.15</span>
        <input type="range" id="slider-default-letter-spacing" value="0">
        <span id="lbl-default-letter-spacing">0px</span>
    `;

    const testBlock1 = {
        id: 'b1',
        style: { fontFamily: 'ZombieFont', fontSize: 17, baseFontSize: 17, lineHeight: 1.15, letterSpacing: 0 }
    };
    const testBlock2 = {
        id: 'b2',
        style: { fontFamily: 'OtherFont', fontSize: 17, baseFontSize: 17, lineHeight: 1.15, letterSpacing: 0 }
    };

    globalState.pages = [
        { id: 'p1', blocks: [testBlock1, testBlock2] }
    ];

    onTypographyTargetFontChange('ZombieFont');

    updateDefaultFontSize(25);
    updateDefaultLineHeight(1.3);
    updateDefaultLetterSpacing(3);

    // Block with ZombieFont must be actively updated
    assert.strictEqual(testBlock1.style.fontSize, 25);
    assert.strictEqual(testBlock1.style.baseFontSize, 25);
    assert.strictEqual(testBlock1.style.lineHeight, 1.3);
    assert.strictEqual(testBlock1.style.letterSpacing, 3);

    // Other blocks must NOT be modified
    assert.strictEqual(testBlock2.style.fontSize, 17);
    assert.strictEqual(testBlock2.style.lineHeight, 1.15);
    assert.strictEqual(testBlock2.style.letterSpacing, 0);
});

test('Font Defaults - Batch Font Operations and Instant Search Filtering for Large Font Libraries', async () => {
    const { saveFontsBatchToDB, getAllFontFamiliesFromDB, clearAllFontsFromDB } = await import('../../../src/core/state.ts');
    const { renderCustomFontsListUI, onSearchCustomFonts } = await import('../../../src/ui/font-ui.ts');

    await clearAllFontsFromDB();

    // Create 60 test fonts
    const batch = [];
    for (let i = 1; i <= 60; i++) {
        batch.push({
            family: `MangaFont_${i.toString().padStart(3, '0')}`,
            blob: new Blob([`font_${i}`], { type: 'font/ttf' })
        });
    }

    await saveFontsBatchToDB(batch);

    const families = await getAllFontFamiliesFromDB();
    assert.strictEqual(families.length, 60);

    document.body.innerHTML = `
        <span id="custom-fonts-count">0</span>
        <div id="custom-fonts-list"></div>
    `;

    await renderCustomFontsListUI(families);

    const listContainer = document.getElementById('custom-fonts-list');
    const countBadge = document.getElementById('custom-fonts-count');

    assert.strictEqual(countBadge.textContent, '60');
    // Initially renders 40 items + load more button
    assert.strictEqual(listContainer.querySelectorAll('[data-action="delete-custom-font"]').length, 40);
    assert.strictEqual(listContainer.querySelectorAll('[data-action="load-more-custom-fonts"]').length, 1);

    // Search filter
    onSearchCustomFonts('045');
    assert.strictEqual(listContainer.querySelectorAll('[data-action="delete-custom-font"]').length, 1);
    assert.strictEqual(listContainer.textContent.includes('MangaFont_045'), true);

    // Reset search
    onSearchCustomFonts('');
    assert.strictEqual(listContainer.querySelectorAll('[data-action="delete-custom-font"]').length, 40);
});


