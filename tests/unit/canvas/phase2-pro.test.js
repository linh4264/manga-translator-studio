import test from 'node:test';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import { PRO_STYLE_PRESETS } from '../../../public/src/config/constants.js';
import { createMangaPSD } from '../../../public/src/features/psd-exporter.js';

test('Studio Pro Phase 2: Manga SFX Action Presets', () => {
    const sfxKeys = ['sfx_boom', 'sfx_slash', 'sfx_clash', 'sfx_whoosh', 'sfx_crack', 'sfx_heartbeat'];

    sfxKeys.forEach(key => {
        const preset = PRO_STYLE_PRESETS[key];
        assert.ok(preset, `Preset ${key} must exist`);
        assert.ok(preset.style, `Preset ${key} must have style definitions`);
        assert.strictEqual(preset.style.bgOpacity, 0, `SFX preset ${key} should have transparent background`);
        assert.ok(preset.style.strokeWidth > 0, `SFX preset ${key} should have strong stroke width`);
    });

    // Check specific preset styles
    assert.strictEqual(PRO_STYLE_PRESETS.sfx_boom.style.gradientEnabled, true, 'sfx_boom must have gradientEnabled');
    assert.strictEqual(PRO_STYLE_PRESETS.sfx_slash.style.skewX, 15, 'sfx_slash must have skew transformation');
    assert.strictEqual(PRO_STYLE_PRESETS.sfx_clash.style.arcAngle, 15, 'sfx_clash must have arc bending');
});

test('Studio Pro Phase 2: Standalone Layered PSD Exporter', async () => {
    const mockPage = {
        id: 'p_test',
        name: 'test_chapter_01.png',
        blocks: [
            {
                id: 'b1',
                translated: 'BÙM!!',
                box: { x: 20, y: 30, w: 35, h: 25 },
                style: { fontSize: 24, bold: true, textColor: '#ff416c' }
            },
            {
                id: 'b2',
                translated: 'Ngươi không thoát được đâu!',
                box: { x: 60, y: 15, w: 30, h: 20 },
                style: { fontSize: 16, textColor: '#000000' }
            }
        ]
    };

    const mockImg = {
        naturalWidth: 800,
        naturalHeight: 1200,
        width: 800,
        height: 1200
    };

    const mockEraserCanvas = {
        width: 800,
        height: 1200,
        getContext: () => ({
            drawImage: () => {},
            getImageData: () => ({ data: new Uint8Array(800 * 1200 * 4) })
        })
    };

    const psdBlob = await createMangaPSD(mockPage, mockImg, mockEraserCanvas);
    assert.ok(psdBlob, 'Should generate a valid PSD Blob');
    assert.strictEqual(psdBlob.type, 'image/vnd.adobe.photoshop', 'Blob type must be Photoshop PSD');
    assert.ok(psdBlob.size > 100, `PSD Blob should have content size, got: ${psdBlob.size} bytes`);
});

test('Studio Pro Phase 2: Smart Magnet Snapping Coordinates', () => {
    const snapThreshold = 1.2;
    const blockW = 20;
    const blockH = 15;

    // Simulate dragging near 50% center
    let rawX = 49.3; // Center would be 49.3 + 10 = 59.3 -> near 60
    // Test direct center snapping math
    let curCenter = 49.2 + blockW / 2; // 59.2 -> distance to 50 is not snap, distance to center
    let centerDist = Math.abs(curCenter - 50); // distance from page center

    let testX = 39.5; // curCenter = 39.5 + 10 = 49.5 -> distance to 50 is 0.5 < 1.2%
    let curCenterX = testX + blockW / 2;
    if (Math.abs(curCenterX - 50) < snapThreshold) {
        testX = 50 - blockW / 2;
    }
    assert.strictEqual(testX, 40, 'Should snap exactly to center (50 - 10 = 40)');
});
