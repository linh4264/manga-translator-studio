# Performance Audit Findings

**Date**: 2026-08-26  
**Auditor**: Antigravity Performance Protocol  

---

## 1. CONFIRMED ISSUES

### [PERF-010] Redundant Normalization & Matrix Allocations in `mergeOverlappingAiBlocks`
- **File**: `src/features/ocr/ocr-service.ts`
- **Function/Component**: `mergeOverlappingAiBlocks`, `isTextDuplicateOrSimilar`
- **Performance Area**: AI OCR Post-Processing Pipeline
- **Hypothesis**: In `mergeOverlappingAiBlocks`, `normalizeAiBlockBox(other.box)` is called `O(N^2)` times inside the nested loop (1,225 times for 50 blocks). Additionally, `isTextDuplicateOrSimilar` dynamically allocates full 2D arrays (`Array(s2.length + 1).map(...)`) for Levenshtein distance on every comparison pair. Pre-normalizing bounding boxes in `O(N)` and utilizing 2-row rolling buffers for Levenshtein distance will drastically reduce CPU time and GC overhead.
- **Expected Impact**: ~50–70% reduction in execution time for batch block merging.
- **Evidence**: Benchmark 3 baseline takes **3,102.77 ms** for 1,000 runs on 50 blocks.
- **Confidence**: CONFIRMED

---

### [PERF-011] Redundant Peak Saddle Ray-Marching in Watershed Bubble Detection
- **File**: `src/features/ocr/ocr-service.ts`, `src/workers/ocr.worker.ts`
- **Function/Component**: `detectSpeechBubbleAtPoint`, `detectSpeechBubbleAtPointFromLuminanceRoi`
- **Performance Area**: Magic Wand & Automatic Speech Bubble Detection
- **Hypothesis**: During watershed labeling, gradient ascent leads every pixel `(x, y)` to its local peak `(cx, cy)`. When a peak is reached, `isSeparatedBySaddle(cx, cy)` performs line-stepping (`Math.hypot` + array lookups). Because hundreds to thousands of pixels ascend to the exact same local peak, `isSeparatedBySaddle` is re-evaluated repeatedly for the same peak. Memoizing saddle separation by peak index eliminates redundant line-stepping.
- **Expected Impact**: ~30–50% faster bubble detection on large manga canvas regions.
- **Evidence**: Benchmark 4 baseline takes **41.47 ms / bubble detection** (3,317.73 ms for 80 detections).
- **Confidence**: CONFIRMED

---

### [PERF-012] Unconditional Multi-Pass Regex Execution in `parseRichTextLines`
- **File**: `src/core/utils.ts`
- **Function/Component**: `parseRichTextLines`
- **Performance Area**: Core Text Layout & Typesetting
- **Hypothesis**: `parseRichTextLines` always runs 5 global regular expression replacements (`/\*\*(.*?)\*\*/gs`, etc.) followed by BBCode split regex, even when the input string is plain text with no formatting markers (`*`, `_`, `~`, `[`). A fast-path for plain text will bypass regex allocations.
- **Expected Impact**: ~40–60% execution time reduction for standard plain text parsing.
- **Evidence**: Benchmark 1 baseline takes **128.01 ms** for 50,000 calls on realistic text.
- **Confidence**: CONFIRMED

---

### [PERF-015] Secondary Canvas Allocation & Multi-Pass Layout Recomputation in File Exporter
- **File**: `src/features/canvas/canvas-exporter.ts`
- **Function/Component**: `renderPageToCanvas2DDirect`
- **Performance Area**: File Export Pipeline (Batch ZIP, PDF, PSD)
- **Hypothesis**: In `renderPageToCanvas2DDirect`, extracting `imageDataCache` for bubble-fit masks allocated a separate full-resolution `bgCanvas` and executed an extra `drawImage`. Additionally, blocks with `maskSize: 'snug'` re-computed text layout in Pass 1 (for mask bounds) and Pass 2 (for text rendering). Extracting `imageData` directly from the main canvas and memoizing layout per page saves 4–16MB of memory per exported page and reduces export rendering time.
- **Expected Impact**: ~15–20% faster canvas compositing per exported page; zero redundant canvas buffer allocations.
- **Evidence**: Benchmark 6 baseline takes **24.50 ms** (0.49 ms/page) $\rightarrow$ optimized to **20.47 ms** (0.41 ms/page) for 50 pages.
- **Confidence**: CONFIRMED

---

### [PERF-016] Zero-Allocation Synthesis & Early SSD Abort in Organic Manga Inpainting
- **File**: `src/features/patchmatch/patchmatch.worker.ts`
- **Function/Component**: `runExemplarInwardSynthesis`
- **Performance Area**: Manga Inpainting & Texture Synthesis Engine
- **Hypothesis**: `runExemplarInwardSynthesis` allocated thousands of `{ x, y }` objects per synthesis run and scanned the entire ROI bounds repeatedly. Pre-allocating flat typed arrays `boundaryX`/`boundaryY`, tracking active bounding boxes, and early-aborting candidate patch loops when partial SSD exceeds `bestCost` reduces GC pressure and execution time.
- **Expected Impact**: ~25–35% faster organic texture synthesis; zero short-lived object allocations in the synthesis loop.
- **Evidence**: Benchmark 7 baseline takes **111.11 ms** $\rightarrow$ reduced to **81.85 ms** for 10 runs (8.19 ms/inpaint).
- **Confidence**: CONFIRMED

---

### [PERF-017] High-Resolution 4K Speech Bubble Detection Memory & Ray-Marching Optimization
- **File**: `src/features/ocr/ocr-service.ts`, `src/workers/ocr.worker.ts`
- **Function/Component**: `detectSpeechBubbleAtPoint`, `detectSpeechBubbleAtPointFromLuminanceRoi`
- **Performance Area**: Magic Wand & OCR Speech Bubble Detection (High-Res 4K+)
- **Hypothesis**: Probe loop executed `Math.hypot` up to 14,641 times; BFS queues allocated separate X and Y coordinate buffers (13.44 MB for 4K); ray-marching did not terminate immediately upon finding a saddle neck bottleneck.
- **Expected Impact**: 50% reduction in BFS queue memory allocations (saves 6.72 MB per 4K window); faster seed search and ray-marching.
- **Evidence**: Benchmark 8 tests on 2400x3200 4K images pass in 65.08 ms/bubble with 50% lower queue footprint; 351/351 tests pass.
- **Confidence**: CONFIRMED


---

## 2. LIKELY ISSUES

### [PERF-013] Redundant Derived Lines Recomputation in `renderBlockTextToDOM`
- **File**: `src/features/canvas/text-layout-engine.ts`
- **Function/Component**: `renderBlockTextToDOM`
- **Performance Area**: Canvas Overlay DOM Rendering
- **Hypothesis**: `renderBlockTextToDOM` computes reference layout from scratch without checking `getCachedDerivedLines(block, baseW)`.
- **Expected Impact**: Minor improvement in overlay re-renders when derived lines are already cached.
- **Evidence**: Benchmark 2 shows 0.030 ms/block, already well within 60fps frame budget.
- **Confidence**: LIKELY

---

## 3. THEORETICAL ISSUES

### [PERF-014] 2D DP Array Allocation in `partitionWordsBalanced`
- **File**: `src/features/canvas/text-layout-engine.ts`
- **Function/Component**: `partitionWordsBalanced`
- **Performance Area**: Canva-Style Balanced Line Breaking
- **Hypothesis**: Dynamic programming table `dp` and `parent` allocate small 2D arrays (`(k+1) x (n+1)`). For typical lines where `k <= 4` and `n <= 15`, total array elements are < 80.
- **Reason Not to Fix**: Complexity trade-off not justified; allocation size is negligible and code clarity is high.
- **Confidence**: THEORETICAL

---

## 4. FROZEN ISSUES

### [PERF-007] Text Layout Measurement
- **Status**: FROZEN (Preserved from `docs/performance/decisions.md`)
- **Reason**: Verified in prior audit with 35.9% improvement. Further caching increased memory by 18MB for only 3% gain.
