import { test, expect, assert } from 'vitest';
import '../../setup/browser-env.js';

import {
    getCustomPresets,
    getPresetById,
    saveCustomPreset,
    deleteCustomPreset,
    createPresetFromActiveBlock,
    updatePresetFromActiveBlock,
    duplicatePreset,
    exportPresetsJSON,
    importPresetsJSON,
    generateStyleSummary,
    clearAllCustomPresets,
    extractStyleFromBlock
} from '../../../src/features/canvas/preset-manager.ts';
import { applyStylePreset } from '../../../src/features/canvas/canvas-styling.ts';
import { globalState } from '../../../src/core/state.ts';

test('Preset Manager - Extract Style from MangaBlock', () => {
    const mockBlock = {
        id: 'b1',
        type: 'dialogue',
        translated: 'Xin chào',
        box: { x: 10, y: 10, w: 20, h: 20 },
        style: {
            fontFamily: 'font-manga',
            fontSize: 18,
            bold: true,
            italic: false,
            textColor: '#ff0055',
            bgColor: '#ffffff',
            bgOpacity: 90,
            strokeWidth: 3,
            strokeColor: '#000000',
            align: 'center'
        }
    };

    const style = extractStyleFromBlock(mockBlock);
    assert.strictEqual(style.fontFamily, 'font-manga');
    assert.strictEqual(style.fontSize, 18);
    assert.strictEqual(style.bold, true);
    assert.strictEqual(style.textColor, '#ff0055');
    assert.strictEqual(style.bgOpacity, 90);
    assert.strictEqual(style.strokeWidth, 3);
});

test('Preset Manager - Style Summary Generation', () => {
    const s1 = { fontFamily: 'font-manga', bold: true, strokeWidth: 4, bgOpacity: 100 };
    const summary1 = generateStyleSummary(s1);
    assert.ok(summary1.includes('Nunito Bold'), 'Should contain font name');
    assert.ok(summary1.includes('Bold'), 'Should contain Bold');
    assert.ok(summary1.includes('Viền 4px'), 'Should contain Stroke info');

    const s2 = { fontFamily: 'font-impact', bgOpacity: 0, gradientEnabled: true };
    const summary2 = generateStyleSummary(s2);
    assert.ok(summary2.includes('Bangers'));
    assert.ok(summary2.includes('Nền 0%'));
});

test('Preset Manager - CRUD & Active Block Operations', () => {
    clearAllCustomPresets();
    assert.strictEqual(getCustomPresets().length, 0, 'Initial custom presets list should be empty');

    // 1. Create from active block
    const mockBlock = {
        id: 'b_custom',
        type: 'dialogue',
        translated: 'Lời thoại tùy chỉnh',
        box: { x: 5, y: 5, w: 30, h: 20 },
        style: {
            fontFamily: 'font-vietnamese',
            fontSize: 16,
            bold: true,
            italic: true,
            textColor: '#3b82f6',
            bgColor: '#0f172a',
            bgOpacity: 85,
            strokeWidth: 2,
            strokeColor: '#ffffff'
        }
    };

    globalState.pages = [{ id: 'p1', blocks: [mockBlock] }];
    globalState.activePageIndex = 0;
    globalState.selectedBlockId = 'b_custom';

    const preset1 = createPresetFromActiveBlock('Hội thoại Xanh', '💬');
    assert.ok(preset1, 'Preset 1 should be created');
    assert.strictEqual(preset1.name, 'Hội thoại Xanh');
    assert.strictEqual(preset1.icon, '💬');
    assert.strictEqual(preset1.style.textColor, '#3b82f6');
    assert.strictEqual(preset1.style.fontFamily, 'font-vietnamese');
    assert.strictEqual(getCustomPresets().length, 1);

    // 2. Duplicate Preset
    const dup = duplicatePreset(preset1.id);
    assert.ok(dup, 'Duplicated preset must exist');
    assert.strictEqual(dup.name, 'Hội thoại Xanh (Bản sao)');
    assert.strictEqual(getCustomPresets().length, 2);

    // 3. Update preset from active block
    mockBlock.style.textColor = '#ef4444';
    mockBlock.style.fontSize = 22;
    const updated = updatePresetFromActiveBlock(preset1.id);
    assert.strictEqual(updated, true);
    const reloaded = getPresetById(preset1.id);
    assert.strictEqual(reloaded.style.textColor, '#ef4444');
    assert.strictEqual(reloaded.style.fontSize, 22);

    // 4. Apply custom preset to another block
    const mockBlock2 = {
        id: 'b2',
        type: 'dialogue',
        translated: 'Ô thoại 2',
        box: { x: 10, y: 10, w: 20, h: 20 },
        style: { vertical: false }
    };
    globalState.pages[0].blocks.push(mockBlock2);
    globalState.selectedBlockId = 'b2';

    applyStylePreset(preset1.id);
    assert.strictEqual(mockBlock2.style.textColor, '#ef4444', 'Block 2 should have preset 1 text color');
    assert.strictEqual(mockBlock2.style.fontFamily, 'font-vietnamese', 'Block 2 should have preset 1 font');
    assert.strictEqual(mockBlock2.style.fontSize, 22, 'Block 2 should have preset 1 font size');

    // 5. Delete preset
    const deleted = deleteCustomPreset(dup.id);
    assert.strictEqual(deleted, true);
    assert.strictEqual(getCustomPresets().length, 1);
    assert.strictEqual(getPresetById(dup.id), null);
});

test('Preset Manager - JSON Export & Import', () => {
    clearAllCustomPresets();

    const samplePresets = [
        {
            id: 'preset_imp_1',
            name: 'Neon Shonen',
            icon: '⚡',
            desc: 'Chakra • Neon',
            style: { fontFamily: 'font-tech', textColor: '#00ffff', strokeWidth: 2 }
        },
        {
            id: 'preset_imp_2',
            name: 'Horror Blood',
            icon: '🩸',
            desc: 'Marker • Đỏ',
            style: { fontFamily: 'font-marker', textColor: '#ff0000', strokeWidth: 4 }
        }
    ];

    const jsonStr = JSON.stringify(samplePresets);
    const res = importPresetsJSON(jsonStr);

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.count, 2);
    assert.strictEqual(getCustomPresets().length, 2);

    const p1 = getPresetById('preset_imp_1');
    assert.ok(p1);
    assert.strictEqual(p1.name, 'Neon Shonen');
    assert.strictEqual(p1.style.textColor, '#00ffff');
});
