import { test, expect } from 'vitest';
import assert from 'node:assert';

import { dilateMask, computeMaskROI, extractROI, generateValidSourceMap, computeAdaptiveDilationRadius } from '../../../src/features/patchmatch/maskUtils.ts';
import { rgbToGrayscale, analyzeMangaTexture } from '../../../src/features/patchmatch/textureAnalysis.ts';
import { computePatchDistance, createSeededRng } from '../../../src/features/patchmatch/patchDistance.ts';
import { reconstructFromNNF } from '../../../src/features/patchmatch/reconstruction.ts';
import { computeDistanceToBoundary, computeAdaptiveBlendRadius, applySeamlessBoundaryBlending } from '../../../src/features/patchmatch/blending.ts';
import { runPatchMatchPipeline, runPatchMatchNNFSynthesis } from '../../../src/features/patchmatch/patchmatch.worker.ts';
import { computeTextMaskDilatedRoi } from '../../../src/features/ocr/ocr-service.ts';

// ---------------------------------------------------------------------------
// TEST A: Deterministic Reproducibility
// same image + mask + options -> exact byte-for-byte identical output
// ---------------------------------------------------------------------------
test('Criteria A: Deterministic Inpainting Reproducibility (Seeded PRNG)', () => {
    const W = 64, H = 64;
    const rgba = new Uint8Array(W * H * 4);
    const mask = new Uint8Array(W * H);

    // Create pseudo-organic background texture
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const p = (y * W + x) * 4;
            const val = ((x * 17 + y * 31) ^ (x * y)) & 255;
            rgba[p] = val;
            rgba[p + 1] = val;
            rgba[p + 2] = val;
            rgba[p + 3] = 255;
        }
    }

    // Mask center region [20..44] x [20..44]
    for (let y = 20; y <= 44; y++) {
        for (let x = 20; x <= 44; x++) {
            mask[y * W + x] = 1;
            const p = (y * W + x) * 4;
            rgba[p] = 255;
            rgba[p + 1] = 0;
            rgba[p + 2] = 0;
        }
    }

    const options = {
        patchRadius: 4,
        iterations: 5,
        randomSearchRadius: 48,
        maskDilate: 0,
        enablePatternDetection: true,
        enableSeamBlending: true
    };

    // Run 1
    const res1 = runPatchMatchPipeline(rgba, mask, W, H, options);
    // Run 2
    const res2 = runPatchMatchPipeline(rgba, mask, W, H, options);

    // Assert 100% byte-for-byte match
    assert.strictEqual(res1.outputRgba.length, res2.outputRgba.length);
    let diffCount = 0;
    for (let i = 0; i < res1.outputRgba.length; i++) {
        if (res1.outputRgba[i] !== res2.outputRgba[i]) {
            diffCount++;
        }
    }
    assert.strictEqual(diffCount, 0, `Seeded PatchMatch must produce 100% deterministic output across runs!`);
});

// ---------------------------------------------------------------------------
// TEST B: Organic Texture Synthesis (Non-flat)
// text mask over irregular texture -> output is not a flat color
// ---------------------------------------------------------------------------
test('Criteria B: Organic Texture Synthesis Preserves Natural Variance (No Flat Mud)', () => {
    const W = 60, H = 60;
    const rgba = new Uint8Array(W * H * 4);
    const mask = new Uint8Array(W * H);

    // Create organic mottled texture
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const p = (y * W + x) * 4;
            const noise = ((Math.sin(x * 0.4) * Math.cos(y * 0.4) + 1.0) * 0.5 * 180 + (x ^ y) % 40) | 0;
            rgba[p] = noise;
            rgba[p + 1] = noise;
            rgba[p + 2] = noise;
            rgba[p + 3] = 255;
        }
    }

    // Mask center [22..38] x [22..38]
    for (let y = 22; y <= 38; y++) {
        for (let x = 22; x <= 38; x++) {
            mask[y * W + x] = 1;
            const p = (y * W + x) * 4;
            rgba[p] = 255; // White corrupt text
            rgba[p + 1] = 255;
            rgba[p + 2] = 255;
        }
    }

    const { outputRgba, confidence, confidenceLevel } = runPatchMatchPipeline(rgba, mask, W, H, {
        patchRadius: 3,
        iterations: 6,
        randomSearchRadius: 32,
        maskDilate: 0
    });

    // Compute standard deviation of synthesized pixels
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let y = 24; y <= 36; y++) {
        for (let x = 24; x <= 36; x++) {
            const val = outputRgba[(y * W + x) * 4];
            sum += val;
            sumSq += val * val;
            count++;
        }
    }
    const mean = sum / count;
    const variance = (sumSq / count) - (mean * mean);
    const stdDev = Math.sqrt(Math.max(0, variance));

    assert.ok(stdDev > 5, `Synthesized organic texture must have natural variation (stdDev=${stdDev.toFixed(2)} > 5), not flat grey!`);
    assert.ok(confidence > 0.4, `Confidence must be positive (${confidence})`);
    assert.ok(['high', 'medium', 'low'].includes(confidenceLevel));
});

// ---------------------------------------------------------------------------
// TEST C: Repeating Screentone (45° Halftone Dot Grid)
// ---------------------------------------------------------------------------
test('Criteria C: Repeating Screentone Halftone Dot Matrix Synthesis', () => {
    const W = 64, H = 64;
    const rgba = new Uint8Array(W * H * 4);
    const mask = new Uint8Array(W * H);
    const P = 6;

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const u = (((x + y) % P) + P) % P;
            const v = (((x - y) % P) + P) % P;
            const isDot = (u === 0 && v === 0);
            const col = isDot ? 15 : 240;
            const p = (y * W + x) * 4;
            rgba[p] = col;
            rgba[p + 1] = col;
            rgba[p + 2] = col;
            rgba[p + 3] = 255;
        }
    }

    for (let y = 20; y <= 44; y++) {
        for (let x = 20; x <= 44; x++) {
            mask[y * W + x] = 1;
            const p = (y * W + x) * 4;
            rgba[p] = 128;
            rgba[p + 1] = 128;
            rgba[p + 2] = 128;
        }
    }

    const { outputRgba, patternInfo, confidence } = runPatchMatchPipeline(rgba, mask, W, H, {
        patchRadius: 3,
        iterations: 4,
        maskDilate: 0
    });

    assert.strictEqual(patternInfo.type, 'screentone');
    assert.ok(patternInfo.confidence >= 0.75, `Pattern confidence ${patternInfo.confidence} should be high`);
    assert.ok(confidence >= 0.75, `Inpaint confidence ${confidence} should be high`);

    // Verify discrete dots vs background in synthesized center
    let blackDotCount = 0;
    let whiteSpaceCount = 0;
    for (let y = 24; y <= 40; y++) {
        for (let x = 24; x <= 40; x++) {
            const val = outputRgba[(y * W + x) * 4];
            if (val < 50) blackDotCount++;
            if (val > 200) whiteSpaceCount++;
        }
    }
    assert.ok(blackDotCount >= 8, `Must reconstruct distinct halftone dots (got ${blackDotCount})`);
    assert.ok(whiteSpaceCount >= 40, `Must reconstruct clean whitespace between dots (got ${whiteSpaceCount})`);
});

// ---------------------------------------------------------------------------
// TEST D: Low-Confidence Pattern Fallback to Organic PatchMatch
// ---------------------------------------------------------------------------
test('Criteria D: Ambiguous / Low-Confidence Pattern Safely Falls Back to Organic PatchMatch', () => {
    const W = 50, H = 50;
    const rgba = new Uint8Array(W * H * 4);
    const mask = new Uint8Array(W * H);

    // Create chaotic noisy texture without clear periodic pitch
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const p = (y * W + x) * 4;
            const noise = ((x * 13 + y * 7 + (x % 7) * (y % 5)) * 11) % 256;
            rgba[p] = noise;
            rgba[p + 1] = noise;
            rgba[p + 2] = noise;
            rgba[p + 3] = 255;
        }
    }

    // Mask center
    for (let y = 18; y <= 32; y++) {
        for (let x = 18; x <= 32; x++) {
            mask[y * W + x] = 1;
        }
    }

    const { outputRgba, patternInfo } = runPatchMatchPipeline(rgba, mask, W, H, {
        patchRadius: 3,
        iterations: 3,
        maskDilate: 0
    });

    // Pattern should not falsely trigger high-confidence specialized path
    assert.ok(patternInfo.confidence < 0.80 || patternInfo.type === 'unknown',
        `Pattern confidence (${patternInfo.confidence}) should be < 0.80 for ambiguous noise`);

    // Output must be filled without crashing
    for (let y = 20; y <= 30; y++) {
        for (let x = 20; x <= 30; x++) {
            const p = (y * W + x) * 4;
            assert.ok(outputRgba[p] >= 0 && outputRgba[p] <= 255);
            assert.strictEqual(outputRgba[p + 3], 255);
        }
    }
});

// ---------------------------------------------------------------------------
// TEST E: High-Confidence Horizontal Stripes with Local Gradient
// ---------------------------------------------------------------------------
test('Criteria E: High-Confidence Horizontal Stripe Reconstruction Preserves Local Lighting Gradient', () => {
    const W = 80, H = 40;
    const rgba = new Uint8Array(W * H * 4);
    const mask = new Uint8Array(W * H);

    // Horizontal stripes (period 4px) with a left-to-right lighting gradient (x=0 is dark, x=79 is bright)
    for (let y = 0; y < H; y++) {
        const isStripe = (y % 4) < 2;
        for (let x = 0; x < W; x++) {
            const grad = Math.round((x / W) * 100); // 0 to 100 gradient
            const baseCol = isStripe ? 10 : 155;
            const finalCol = Math.min(255, baseCol + grad);

            const p = (y * W + x) * 4;
            rgba[p] = finalCol;
            rgba[p + 1] = finalCol;
            rgba[p + 2] = finalCol;
            rgba[p + 3] = 255;
        }
    }

    // Mask center [25..55] on X, [12..28] on Y
    for (let y = 12; y <= 28; y++) {
        for (let x = 25; x <= 55; x++) {
            mask[y * W + x] = 1;
            const p = (y * W + x) * 4;
            rgba[p] = 255;
            rgba[p + 1] = 0;
            rgba[p + 2] = 255;
        }
    }

    const { outputRgba, patternInfo } = runPatchMatchPipeline(rgba, mask, W, H, {
        patchRadius: 3,
        iterations: 4,
        maskDilate: 0
    });

    assert.strictEqual(patternInfo.type, 'horizontal');
    assert.ok(patternInfo.confidence >= 0.75);

    // Verify left-to-right gradient is preserved across the reconstructed mask:
    // Left side of reconstructed span (x=28) should be darker than right side of reconstructed span (x=52)
    const leftLum = outputRgba[(20 * W + 28) * 4];
    const rightLum = outputRgba[(20 * W + 52) * 4];
    assert.ok(rightLum > leftLum, `Right side of span (${rightLum}) must be brighter than left side (${leftLum}) preserving gradient`);
});

// ---------------------------------------------------------------------------
// TEST F: Adaptive Mask Dilation
// small glyphs -> smaller dilation; large glyphs -> larger dilation
// ---------------------------------------------------------------------------
test('Criteria F: Adaptive Mask Dilation Scaled by Glyph Dimensions', () => {
    const W = 100, H = 100;

    // 1. Small text mask (e.g. furigana 8x8px)
    const smallMask = new Uint8Array(W * H);
    for (let y = 46; y <= 54; y++) {
        for (let x = 46; x <= 54; x++) {
            smallMask[y * W + x] = 1;
        }
    }
    const smallRad = computeAdaptiveDilationRadius(smallMask, W, H);
    assert.ok(smallRad <= 2, `Small 8px glyph should yield dilation radius <= 2 (got ${smallRad})`);

    // 2. Large SFX mask (e.g. 50x50px)
    const largeMask = new Uint8Array(W * H);
    for (let y = 25; y <= 75; y++) {
        for (let x = 25; x <= 75; x++) {
            largeMask[y * W + x] = 1;
        }
    }
    const largeRad = computeAdaptiveDilationRadius(largeMask, W, H);
    assert.ok(largeRad >= 4, `Large 50px SFX glyph should yield dilation radius >= 4 (got ${largeRad})`);
    assert.ok(largeRad > smallRad, `Large text dilation (${largeRad}) must be greater than small text dilation (${smallRad})`);

    // 3. dilateMask with 'auto' option
    const dilatedAuto = dilateMask(smallMask, W, H, 'auto');
    assert.strictEqual(dilatedAuto[50 * W + 50], 1);
});

// ---------------------------------------------------------------------------
// TEST G: Local-Aware Source Selection (Texture Similarity > Distance)
// ---------------------------------------------------------------------------
test('Criteria G: Source Selection Prioritizes Texture Fidelity Over Spatial Distance', () => {
    const W = 60, H = 60;
    const gray = new Uint8Array(W * H).fill(255);
    const mask = new Uint8Array(W * H);

    // Target at (30, 30): dark checkerboard
    const tx = 30, ty = 30;
    mask[ty * W + tx] = 1;

    // Source 1 (Near at 30, 25): solid white (wrong texture, distance = 5)
    const s1x = 30, s1y = 25;

    // Source 2 (Far at 10, 10): dark checkerboard (correct texture, distance = ~28)
    const s2x = 10, s2y = 10;

    // Fill surrounding known context for target and source 2 with dark values
    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            if (dx !== 0 || dy !== 0) {
                gray[(ty + dy) * W + (tx + dx)] = 30; // Dark surrounding
            }
            gray[(s2y + dy) * W + (s2x + dx)] = 30;   // Source 2 has matching dark texture
            gray[(s1y + dy) * W + (s1x + dx)] = 255;  // Source 1 has mismatching white texture
        }
    }

    const costNearMismatch = computePatchDistance(gray, mask, W, H, tx, ty, s1x, s1y, 2);
    const costFarMatch = computePatchDistance(gray, mask, W, H, tx, ty, s2x, s2y, 2);

    assert.ok(costFarMatch < costNearMismatch,
        `Matching texture patch (${costFarMatch.toFixed(1)}) must have lower cost than near mismatching patch (${costNearMismatch.toFixed(1)})`);

    // When textures match equally, closer patch should win due to distance bias
    const s3x = 22, s3y = 22; // Closer matching patch (dist ~11.3 vs ~28.3)
    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            gray[(s3y + dy) * W + (s3x + dx)] = 30;
        }
    }
    const costNearMatch = computePatchDistance(gray, mask, W, H, tx, ty, s3x, s3y, 2);
    assert.ok(costNearMatch <= costFarMatch,
        `When texture matches equally, closer patch (${costNearMatch.toFixed(2)}) should have <= cost than far patch (${costFarMatch.toFixed(2)})`);
});

// ---------------------------------------------------------------------------
// TEST H: Adaptive Seam Blending (Halo-free)
// ---------------------------------------------------------------------------
test('Criteria H: Adaptive Seam Blending Is Smooth and Free of Outer Halos', () => {
    const W = 30, H = 30;
    const mask = new Uint8Array(W * H);
    // Center 10x10 mask
    for (let y = 10; y <= 20; y++) {
        for (let x = 10; x <= 20; x++) {
            mask[y * W + x] = 1;
        }
    }

    const orig = new Uint8Array(W * H * 4).fill(100);
    const recon = new Uint8Array(W * H * 4).fill(180);

    const blended = applySeamlessBoundaryBlending(orig, recon, mask, W, H, 3.0);

    // Outside mask: completely untouched (100)
    assert.strictEqual(blended[0], 100);
    assert.strictEqual(blended[(5 * W + 5) * 4], 100);

    // Deep center: completely reconstructed (180)
    assert.strictEqual(blended[(15 * W + 15) * 4], 180);

    // Boundary edge: strictly bounded between 100 and 180 (no underflow/overflow halo)
    for (let y = 10; y <= 20; y++) {
        for (let x = 10; x <= 20; x++) {
            const val = blended[(y * W + x) * 4];
            assert.ok(val >= 100 && val <= 180, `Value ${val} at (${x}, ${y}) must stay strictly within [100, 180] (no halo)`);
        }
    }
});

// ---------------------------------------------------------------------------
// TEST I: PatchMatch Options (iterations & randomSearchRadius)
// ---------------------------------------------------------------------------
test('Criteria I: Iterations and Random Search Radius Actively Drive NNF Convergence', () => {
    const W = 50, H = 50;
    const rgba = new Uint8Array(W * H * 4);
    const mask = new Uint8Array(W * H);

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const p = (y * W + x) * 4;
            const val = ((x * 19 + y * 23) ^ (x * y)) & 255;
            rgba[p] = val;
            rgba[p + 1] = val;
            rgba[p + 2] = val;
            rgba[p + 3] = 255;
        }
    }

    for (let y = 15; y <= 35; y++) {
        for (let x = 15; x <= 35; x++) {
            mask[y * W + x] = 1;
        }
    }

    const gray = rgbToGrayscale(rgba, W, H);
    const { validSource, validCount, validCoords } = generateValidSourceMap(mask, W, H, 3);
    const patternInfo = { type: "unknown", orientation: 0, periodX: null, periodY: null, confidence: 0 };

    // 1 Iteration
    const res1 = runPatchMatchNNFSynthesis(
        rgba, mask, gray, W, H, 3, validCoords, validCount, validSource, patternInfo,
        { iterations: 1, randomSearchRadius: 16 }
    );

    // 8 Iterations with larger random search
    const res8 = runPatchMatchNNFSynthesis(
        rgba, mask, gray, W, H, 3, validCoords, validCount, validSource, patternInfo,
        { iterations: 8, randomSearchRadius: 64 }
    );

    // 8 iterations must achieve lower or equal residual average cost than 1 iteration
    assert.ok(res8.avgCost <= res1.avgCost,
        `8 iterations avgCost (${res8.avgCost.toFixed(2)}) should be <= 1 iteration avgCost (${res1.avgCost.toFixed(2)})`);
});
