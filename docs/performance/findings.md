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
