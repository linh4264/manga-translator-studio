import test from 'node:test';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import '../../setup/canvas-mock.js';
import '../../setup/indexeddb-mock.js';

import {
    cleanMangaBackgroundArtWithMask
} from '../../../src/features/inpainting.ts';
import { patchCanvasElement } from '../../setup/canvas-mock.js';

test('Inpainting Advanced - Phase-Locked Horizontal Line Screentone Synthesis', async () => {
    const width = 80;
    const height = 80;
    const canvas = document.createElement('canvas');
    patchCanvasElement(canvas, width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // 1. Create a synthetic canvas with exact 4px horizontal line screentone
    // y % 4 === 0 -> Black line (0), other lines -> White (255)
    const imgData = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
        const isLine = (y % 4 === 0);
        const val = isLine ? 0 : 255;
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            imgData.data[idx] = val;
            imgData.data[idx + 1] = val;
            imgData.data[idx + 2] = val;
            imgData.data[idx + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);

    // 2. Create a 30x30 mask in the center (simulating erased speech bubble text)
    const maskBytes = new Uint8Array(width * height);
    for (let y = 25; y < 55; y++) {
        for (let x = 25; x < 55; x++) {
            maskBytes[y * width + x] = 1;
            // Corrupt center pixels with grey noise
            const p = (y * width + x) * 4;
            imgData.data[p] = 128;
            imgData.data[p + 1] = 128;
            imgData.data[p + 2] = 128;
        }
    }
    ctx.putImageData(imgData, 0, 0);

    // 3. Run Phase-Locked inpainting
    await cleanMangaBackgroundArtWithMask(ctx, width, height, maskBytes);

    // 4. Verify center pixels strictly match the 4px line period
    const resData = ctx.getImageData(0, 0, width, height).data;
    for (let y = 30; y <= 40; y++) {
        const isExpectedLine = (y % 4 === 0);
        const centerP = (y * width + 40) * 4;
        const lum = resData[centerP];

        if (isExpectedLine) {
            assert.strictEqual(lum, 0, `Line at y=${y} must be sharp black (0), got ${lum}`);
        } else {
            assert.strictEqual(lum, 255, `Gap at y=${y} must be white (255), got ${lum}`);
        }
    }
});

test('Inpainting Advanced - Discrete Halftone Dot Grid Reconstruction Without Grey Smears', async () => {
    const width = 60;
    const height = 60;
    const canvas = document.createElement('canvas');
    patchCanvasElement(canvas, width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // 1. Create a 4x4 halftone dot pattern (dot at x%4===0 && y%4===0)
    const imgData = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const isDot = (x % 4 === 0 && y % 4 === 0);
            const val = isDot ? 20 : 240;
            imgData.data[idx] = val;
            imgData.data[idx + 1] = val;
            imgData.data[idx + 2] = val;
            imgData.data[idx + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);

    // 2. Corrupt center area with text
    const maskBytes = new Uint8Array(width * height);
    for (let y = 20; y < 40; y++) {
        for (let x = 20; x < 40; x++) {
            maskBytes[y * width + x] = 1;
            const p = (y * width + x) * 4;
            imgData.data[p] = 0;
            imgData.data[p + 1] = 0;
            imgData.data[p + 2] = 0;
        }
    }
    ctx.putImageData(imgData, 0, 0);

    // 3. Execute inpainting
    await cleanMangaBackgroundArtWithMask(ctx, width, height, maskBytes);

    // 4. Verify center retains contrast between dots and background (not smeared into flat grey)
    const resData = ctx.getImageData(0, 0, width, height).data;
    const dotLum = resData[(28 * width + 28) * 4]; // (28%4===0, 28%4===0) -> Dot
    const bgLum = resData[(29 * width + 29) * 4];  // (29%4!==0, 29%4!==0) -> Background

    assert.ok(bgLum > 200, `Background luminance should be > 200, got ${bgLum}`);
    assert.ok(dotLum < 100, `Dot luminance should be < 100, got ${dotLum}`);
    assert.ok(bgLum - dotLum > 100, 'Must preserve sharp contrast between halftone dots and background');
});
