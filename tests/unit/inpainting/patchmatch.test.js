import { test, expect, assert } from 'vitest';

import { dilateMask, computeMaskROI, extractROI, generateValidSourceMap } from '../../../src/features/patchmatch/maskUtils.ts';
import { rgbToGrayscale, analyzeMangaTexture } from '../../../src/features/patchmatch/textureAnalysis.ts';
import { computePatchDistance } from '../../../src/features/patchmatch/patchDistance.ts';
import { reconstructFromNNF } from '../../../src/features/patchmatch/reconstruction.ts';
import { computeDistanceToBoundary, applySeamlessBoundaryBlending } from '../../../src/features/patchmatch/blending.ts';
import { runPatchMatchPipeline } from '../../../src/features/patchmatch/patchmatch.worker.ts';

test('PatchMatch - Mask Dilation and ROI Bounding Box Calculation', () => {
    const W = 50, H = 50;
    const mask = new Uint8Array(W * H);
    // 1 masked pixel at (25, 25)
    mask[25 * W + 25] = 1;

    const dilated = dilateMask(mask, W, H, 2);
    assert.strictEqual(dilated[25 * W + 25], 1);
    assert.strictEqual(dilated[25 * W + 27], 1); // 2px right
    assert.strictEqual(dilated[25 * W + 28], 0); // 3px right (outside radius 2)

    const roi = computeMaskROI(dilated, W, H, 10);
    assert.ok(roi !== null);
    assert.ok(roi.minX <= 23 && roi.maxX >= 27);
    assert.ok(roi.minY <= 23 && roi.maxY >= 27);
    assert.strictEqual(roi.width, roi.maxX - roi.minX + 1);
});

test('PatchMatch - Valid Source Map Integrity (Zero Mask Intrusion)', () => {
    const W = 30, H = 30;
    const mask = new Uint8Array(W * H);
    // Place mask block in center [10..20] x [10..20]
    for (let y = 10; y <= 20; y++) {
        for (let x = 10; x <= 20; x++) {
            mask[y * W + x] = 1;
        }
    }

    const { validSource, validCount, validCoords } = generateValidSourceMap(mask, W, H, 3);
    assert.ok(validCount > 0);
    assert.strictEqual(validCoords.length, validCount * 2);

    // Verify every declared valid source center contains ZERO masked pixels in its 7x7 patch
    for (let i = 0; i < validCount; i++) {
        const sx = validCoords[i * 2];
        const sy = validCoords[i * 2 + 1];
        assert.strictEqual(validSource[sy * W + sx], 1);

        for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
                assert.strictEqual(mask[(sy + dy) * W + (sx + dx)], 0, `Source patch at (${sx}, ${sy}) must not touch mask!`);
            }
        }
    }
});

test('PatchMatch - Texture Analysis (Horizontal Lines vs Screentone Detection)', () => {
    const W = 64, H = 64;
    const rgba = new Uint8Array(W * H * 4);
    const mask = new Uint8Array(W * H);

    // Create horizontal stripe pattern: period = 4px (alternating 2 black lines, 2 white lines)
    for (let y = 0; y < H; y++) {
        const isBlack = (y % 4) < 2;
        const col = isBlack ? 0 : 255;
        for (let x = 0; x < W; x++) {
            const p = (y * W + x) * 4;
            rgba[p] = col;
            rgba[p + 1] = col;
            rgba[p + 2] = col;
            rgba[p + 3] = 255;
        }
    }

    // Mask center 20x20
    for (let y = 22; y <= 42; y++) {
        for (let x = 22; x <= 42; x++) {
            mask[y * W + x] = 1;
        }
    }

    const gray = rgbToGrayscale(rgba, W, H);
    const { validSource } = generateValidSourceMap(mask, W, H, 3);
    const pattern = analyzeMangaTexture(gray, mask, validSource, W, H);

    assert.strictEqual(pattern.type, 'horizontal');
    assert.strictEqual(pattern.orientation, 0);
    assert.strictEqual(pattern.periodY, 4);
    assert.ok(pattern.confidence > 0.6);
});

test('PatchMatch - Distance Transform and Boundary Feathering', () => {
    const W = 20, H = 20;
    const mask = new Uint8Array(W * H);
    // Center 6x6 mask
    for (let y = 7; y <= 12; y++) {
        for (let x = 7; x <= 12; x++) {
            mask[y * W + x] = 1;
        }
    }

    const dist = computeDistanceToBoundary(mask, W, H);
    // Boundary edge pixels (x=7) have distance ~1.0
    assert.ok(dist[7 * W + 7] >= 1.0 && dist[7 * W + 7] <= 1.5);
    // Inner center pixel (x=9, y=9) has larger distance >= 2.0
    assert.ok(dist[9 * W + 9] >= 2.0);

    const orig = new Uint8Array(W * H * 4).fill(100);
    const recon = new Uint8Array(W * H * 4).fill(200);
    const blended = applySeamlessBoundaryBlending(orig, recon, mask, W, H, 2.5);

    // Outside mask: exactly original (100)
    assert.strictEqual(blended[0], 100);
    // Deep center: exactly reconstructed (200)
    assert.strictEqual(blended[(9 * W + 9) * 4], 200);
    // Edge: smooth intermediate value between 100 and 200
    const edgeVal = blended[(7 * W + 7) * 4];
    assert.ok(edgeVal > 100 && edgeVal < 200, `Edge value ${edgeVal} should be smoothly blended`);
});

test('PatchMatch - End-to-End Pipeline on Horizontal Screentone Bubble', () => {
    const W = 64, H = 64;
    const rgba = new Uint8Array(W * H * 4);
    const mask = new Uint8Array(W * H);

    // Ground truth: 4px horizontal stripes
    for (let y = 0; y < H; y++) {
        const isBlack = (y % 4) < 2;
        const col = isBlack ? 10 : 240;
        for (let x = 0; x < W; x++) {
            const p = (y * W + x) * 4;
            rgba[p] = col;
            rgba[p + 1] = col;
            rgba[p + 2] = col;
            rgba[p + 3] = 255;
        }
    }

    // Mask center region where text was placed
    for (let y = 20; y <= 44; y++) {
        for (let x = 16; x <= 48; x++) {
            mask[y * W + x] = 1;
            // Simulate corrupt text
            const p = (y * W + x) * 4;
            rgba[p] = 128;
            rgba[p + 1] = 0;
            rgba[p + 2] = 128;
        }
    }

    const { outputRgba, patternInfo } = runPatchMatchPipeline(rgba, mask, W, H, {
        patchRadius: 3,
        iterations: 4,
        randomSearchRadius: 32,
        maskDilate: 0
    });

    assert.strictEqual(patternInfo.type, 'horizontal');
    // Inside the reconstructed region, verify that horizontal stripe structure is restored without grey smudge
    let reconstructedBlackCount = 0;
    let reconstructedWhiteCount = 0;
    for (let y = 25; y <= 40; y++) {
        for (let x = 20; x <= 40; x++) {
            const val = outputRgba[(y * W + x) * 4];
            if (val < 50) reconstructedBlackCount++;
            if (val > 200) reconstructedWhiteCount++;
        }
    }

    assert.ok(reconstructedBlackCount > 20, "Must synthesize crisp black stripe lines");
    assert.ok(reconstructedWhiteCount > 20, "Must synthesize crisp white stripe lines");

    // Outside the mask, output must be byte-for-byte identical to input
    for (let y = 0; y < 15; y++) {
        for (let x = 0; x < W; x++) {
            const p = (y * W + x) * 4;
            assert.strictEqual(outputRgba[p], rgba[p]);
            assert.strictEqual(outputRgba[p + 1], rgba[p + 1]);
            assert.strictEqual(outputRgba[p + 2], rgba[p + 2]);
        }
    }
});

test('PatchMatch - End-to-End Pipeline on 45-degree Halftone Screentone Dot Matrix (Zero Grey Smudge)', () => {
    const W = 64, H = 64;
    const rgba = new Uint8Array(W * H * 4);
    const mask = new Uint8Array(W * H);
    const P = 6;

    // Ground truth: 45-degree halftone dots
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const u = (((x + y) % P) + P) % P;
            const v = (((x - y) % P) + P) % P;
            const isDot = (u === 0 && v === 0);
            const col = isDot ? 20 : 235;
            const p = (y * W + x) * 4;
            rgba[p] = col;
            rgba[p + 1] = col;
            rgba[p + 2] = col;
            rgba[p + 3] = 255;
        }
    }

    // Mask center region [20..44] x [20..44]
    for (let y = 20; y <= 44; y++) {
        for (let x = 20; x <= 44; x++) {
            mask[y * W + x] = 1;
            const p = (y * W + x) * 4;
            rgba[p] = 255; // Corrupted white text
            rgba[p + 1] = 255;
            rgba[p + 2] = 255;
        }
    }

    const { outputRgba, patternInfo } = runPatchMatchPipeline(rgba, mask, W, H, {
        patchRadius: 3,
        iterations: 4,
        randomSearchRadius: 32,
        maskDilate: 0
    });

    assert.strictEqual(patternInfo.type, 'screentone');

    // Verify discrete dots exist in synthesized center (not flat grey)
    let dotCount = 0;
    let whiteCount = 0;
    for (let y = 24; y <= 40; y++) {
        for (let x = 24; x <= 40; x++) {
            const val = outputRgba[(y * W + x) * 4];
            if (val < 60) dotCount++;
            if (val > 180) whiteCount++;
        }
    }

    assert.ok(dotCount > 10, "Must synthesize sharp discrete halftone dots");
    assert.ok(whiteCount > 50, "Must synthesize clean white background between dots");
});
