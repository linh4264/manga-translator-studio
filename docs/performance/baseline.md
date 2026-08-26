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
