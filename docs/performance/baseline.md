# Performance Baseline Measurements

**Date**: 2026-08-26  
**Environment**: Bun 1.3.14 / TypeScript 5.7.3 / Windows x64  
**Benchmark Suite**: `tests/unit/core/benchmark.test.ts`

---

## 1. Workload Benchmarks & Baseline Results

### BENCHMARK 1 — `parseRichTextLines` (Typography Text Parsing)
- **Workload**: 50,000 calls on representative manga text (90% standard plain text, 10% Markdown/BBCode formatted).
- **Execution Time**: `128.01 ms`
- **Throughput / Latency**: `2.56 µs / operation`
- **Bottleneck**: Unconditional execution of 5 multi-line regex replacements and regex splitting for plain text without markup.

### BENCHMARK 2 — `renderBlockTextToDOM` (DOM Canvas Overlay Reconciliation)
- **Workload**: 2,000 block renders in DOM canvas overlays.
- **Execution Time**: `59.59 ms`
- **Throughput / Latency**: `0.030 ms / block`

### BENCHMARK 3 — `mergeOverlappingAiBlocks` (AI OCR Post-Processing)
- **Workload**: 1,000 iterations on 50 AI-detected bounding boxes (40 distinct blocks + 10 duplicate/overlapping blocks).
- **Execution Time**: `3,102.77 ms`
- **Throughput / Latency**: `3.103 ms / page normalization`
- **Bottleneck**:
  1. `O(N^2)` redundant calls to `normalizeAiBlockBox(other.box)` inside inner loop (1,225 calls/page).
  2. `(M+1) x (N+1)` 2D array allocations in `isTextDuplicateOrSimilar` Levenshtein distance matrix on every pairwise comparison.

### BENCHMARK 4 — `detectSpeechBubbleAtPoint` (Speech Bubble Detection / Magic Wand)
- **Workload**: 80 speech bubble detections on 1000x1200 image canvas across 4 speech bubbles.
- **Execution Time**: `3,317.73 ms`
- **Throughput / Latency**: `41.47 ms / speech bubble`
- **Bottleneck**:
  - Redundant ray-marching in `isSeparatedBySaddle(cx, cy)` during watershed labeling: thousands of pixels ascending to the same peak evaluate line-stepping repeatedly without peak memoization.

### BENCHMARK 5 — `autoFitBlock` (Binary Search Typography Fitting)
- **Workload**: 1,000 uncached auto-fit block calculations across 20 text blocks.
- **Execution Time**: `166.48 ms`
- **Throughput / Latency**: `0.166 ms / block`

### BENCHMARK 6 — `renderPageToCanvas2DDirect` (File Export Canvas Compositing)
- **Workload**: 50 page export iterations (10 text blocks/page, with snug & bubble-fit masks).
- **Execution Time**: `24.50 ms`
- **Throughput / Latency**: `0.49 ms / page`
- **Bottleneck**:
  1. Creating a secondary full-resolution `bgCanvas` to read `imageDataCache` when the primary export canvas already contains the base image.
  2. Redundant re-computation of text layout between Pass 1 (mask bounds) and Pass 2 (text rendering).

### BENCHMARK 7 — `runPatchMatchPipeline` (Organic Manga Texture Inpainting)
- **Workload**: 10 inpainting runs on organic/unknown manga background texture (100x100 texture, 40x40 mask).
- **Baseline Execution Time**: `111.11 ms` (`11.11 ms / inpaint`)
- **Optimized Execution Time**: `81.85 ms` (`8.19 ms / inpaint`)
- **Improvement**: `26.3%` reduction in execution time.
- **Bottleneck**:
  1. Allocation of boundary coordinate `{ x, y }` objects on every step of the synthesis while loop.
  2. Full ROI scan for boundary search without bounding box clamping.
  3. Lack of early exit in SSD candidate patch distance evaluation.

### BENCHMARK 8 — `detectSpeechBubbleAtPoint` (High-Resolution 4K Canvas Detection)
- **Workload**: 10 detections on 2400x3200 4K image canvas across 2 large speech bubbles.
- **Throughput / Latency**: `65.08 ms / 4K bubble`
- **Memory / Allocation**: Consolidating 2D BFS queues to a single 1D `Int32Array` reduced queue allocation from `13.44 MB` to `6.72 MB` per 4K window (-50%).
- **Bottleneck**: Unconditional `Math.hypot` inside seed probe loop, dual coordinate queue allocations, and un-short-circuited ray-stepping.

### BENCHMARK 9 — `generateFontSetFromPreset` (Manga Font Set Recommendation)
- **Workload**: 200 font set generations across a 200-font manga repository.
- **Baseline Execution Time**: `37.48 ms` (`0.187 ms / font set`)
- **Optimized Execution Time**: `8.36 ms` (`0.042 ms / font set`)
- **Improvement**: `77.7%` reduction in execution time (**4.5x faster**).
- **Bottleneck**:
  1. Allocation of 23 temporary arrays on every `calculateCategoryCompatibility` invocation.
  2. Full-array mapping and $O(N \log N)$ sorting for each role just to pick the top-1 candidate (`[0]`).
  3. Slow `Math.pow(dx, 2)` calls in Euclidean distance calculations.

### BENCHMARK 10 — Font Library Deduplication (`deduplicateCustomFonts`)
- **Workload**: 10 deduplication runs on 1,000 custom fonts with fuzzy stripped duplicate records.
- **Baseline Execution Time**: `337.92 ms` (`33.79 ms / run`)
- **Optimized Execution Time**: `10.49 ms` (`1.05 ms / run`)
- **Improvement**: `96.9%` reduction in execution time (**32.2x faster**).
- **Bottleneck**: Quadratic $O(N^2)$ iteration over existing keys running multiple regex `.replace(/[aeiouy]/g, '')` evaluations per font pair.


