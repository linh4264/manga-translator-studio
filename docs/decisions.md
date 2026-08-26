## PERF-007 — Text layout measurement

Status: FROZEN  
Date: 2026-08-26  

Problem:
Repeated canvas text measurement inside layout loop.

Evidence:
- 20 pages
- Before: 142ms
- After: 91ms
- Improvement: 35.9%

Decision:
Cache repeated text measurements.

Why not optimize further:
Additional caching increased memory usage by ~18MB while reducing execution time by only ~3%.

Conclusion:
Current implementation is considered sufficiently optimized.

Rule:
Do not reopen this issue unless new profiling data shows that text measurement again becomes a significant bottleneck.

---

## PERF-010 — OCR Block Merging & String Similarity Normalization

Status: FROZEN  
Date: 2026-08-26  

Problem:
1. `mergeOverlappingAiBlocks` executed `O(N^2)` calls to `normalizeAiBlockBox(other.box)` inside the inner comparison loop (1,225 calls for 50 blocks).
2. `isTextDuplicateOrSimilar` eagerly allocated `(M+1) x (N+1)` 2D arrays on every pairwise comparison, regardless of spatial distance or block type.

Evidence:
- Workload: 1,000 runs on 50 AI-detected bounding boxes (with 10 overlapping duplicates).
- Before: 3,102.77 ms (3.103 ms / page)
- After: 84.56 ms (0.085 ms / page)
- Improvement: 97.3% reduction in execution time (36.7x speedup)
- Memory / GC: Eliminated thousands of 2D matrix allocations per page.

Chosen Solution:
1. Pre-normalize all candidate block coordinates in a single `O(N)` mapping pass before pairwise comparison.
2. Evaluate text similarity checks lazily only when spatial proximity (`centerDist <= 1.8%`) and block types match.
3. Replace 2D Levenshtein distance matrix with a 2-row rolling `Int32Array` buffer.

Trade-offs:
None. Algorithmic outputs and duplicate merge behavior remain 100% identical.

Why no further optimization is currently justified:
Execution time is now under 0.09 ms per page, which is completely imperceptible to users and negligible compared to network and rendering phases.

Rule:
Do not reopen this issue unless new benchmarks show OCR block merging becomes a hotspot.

---

## PERF-011 — Watershed Saddle Checking & Neighbor Allocations in Speech Bubble Detection

Status: FROZEN  
Date: 2026-08-26  
Component: `src/features/ocr/ocr-service.ts`, `src/workers/ocr.worker.ts`  

Problem:
1. In `detectSpeechBubbleAtPoint` and `ocr.worker.ts`, watershed gradient ascent climbs from every pixel `(x, y)` to its local peak `(cx, cy)`. At each peak, `isSeparatedBySaddle(cx, cy)` performed iterative ray-marching with `Math.hypot`. Thousands of pixels ascend to the same local peak, leading to massive redundant ray-marching calculations.
2. BFS, outside flood-fill, and gradient ascent loops allocated multi-element sub-arrays (`[ [cx+1, cy], ... ]`) on every pixel iteration.

Evidence:
- Workload: 80 speech bubble detections on 1000x1200 image canvas across 4 bubbles.
- Before: 3,317.73 ms (41.47 ms / bubble detection)
- After: 1,141.15 ms (14.26 ms / bubble detection)
- Improvement: 65.6% reduction in execution time (2.9x faster)
- Full test suite execution time reduced from 19.98s to 15.32s (~23% overall suite speedup).

Chosen Solution:
1. Memoize saddle separation results per peak index (`peakY * winW + peakX`) using a lookup cache, evaluating line-stepping only once per unique topological peak.
2. Replace dynamic neighbor array allocations with static directional offset arrays (`DX8`, `DY8`, `DX4`, `DY4`).
3. Mirror the exact same optimizations in `src/workers/ocr.worker.ts` for background web worker execution.

Trade-offs:
None. Peak detection, hole-filling, and contour boundaries match original behavior with zero precision loss.

Why no further optimization is currently justified:
Bubble detection latency dropped from 41.5ms down to 14.3ms, easily keeping Magic Wand interactions and auto-snapping responsive under 16ms (60 FPS interactive budget).

Rule:
Do not reopen this issue unless new profiling data on higher resolution manga (e.g. 4K+) demonstrates that watershed labeling becomes a bottleneck.

---

## PERF-012 — Plain Text Fast-Path in Rich Text Parser

Status: FROZEN  
Date: 2026-08-26  
Component: `src/core/utils.ts`  

Problem:
`parseRichTextLines` executed 5 multi-line regular expressions (`/\*\*(.*?)\*\*/gs`, etc.) followed by BBCode split regex unconditionally, even on standard plain text without any formatting markup (`*`, `_`, `~`, `[`).

Evidence:
- Workload: 50,000 calls on realistic manga text samples (90% plain text, 10% Markdown).
- Before: 128.01 ms (2.56 µs / call)
- After: 32.66 ms (0.65 µs / call)
- Improvement: 74.5% reduction in execution time (3.9x speedup)

Chosen Solution:
Added a lightweight trigger check (`text.includes('*') || text.includes('_') || text.includes('~') || text.includes('[')`) that immediately fast-paths unformatted text into single-pass line splitting with base styles.

Trade-offs:
None. Formatting parsing and rich text styling are 100% preserved.

Why no further optimization is currently justified:
Plain text parsing now executes in 0.65 microseconds, effectively zero overhead.

Rule:
Do not reopen this issue unless text parsing profiling indicates a regression.

---

## PERF-015 — File Export Canvas Compositing & ImageData Optimization

Status: FROZEN  
Date: 2026-08-26  
Component: `src/features/canvas/canvas-exporter.ts`  

Problem:
1. In `renderPageToCanvas2DDirect`, extracting `imageDataCache` for `bubble-fit` speech bubble masks allocated a separate full-resolution `bgCanvas` ($W \times H$) and executed a redundant `drawImage` pass, wasting 4–16MB of memory per exported page.
2. Blocks with `maskSize: 'snug'` re-computed text layout twice across Pass 1 (to measure background mask bounds) and Pass 2 (to render text layers).

Evidence:
- Workload: 50 page export iterations (10 text blocks/page, with snug & bubble-fit masks).
- Before: 24.50 ms (0.49 ms / page)
- After: 20.47 ms (0.41 ms / page)
- Improvement: 16.4% reduction in canvas compositing time; eliminated secondary canvas allocation per exported page.

Chosen Solution:
1. Extract `activeImageData` directly from `ctx.getImageData(0, 0, W, H)` on the main export canvas immediately after drawing the raw image, eliminating the secondary `bgCanvas` buffer.
2. Memoize layout calculations per page (`memoizedLayouts`) so that Pass 2 reuses the exact layout computed during Pass 1.

Trade-offs:
None. Visual output, mask contours, text layout, and inpainting layers remain 100% pixel-perfect.

Why no further optimization is currently justified:
Page compositing now executes in 0.41ms per page, which easily scales to batch exports of hundreds of pages without GPU/RAM pressure.

Rule:
Do not reopen this issue unless profiling on 8K image batch exports indicates a bottleneck.

---

## PERF-016 — PatchMatch Organic Inpainting Zero-Allocation Synthesis & Early SSD Abort

Status: FROZEN  
Date: 2026-08-26  
Component: `src/features/patchmatch/patchmatch.worker.ts`  

Problem:
1. In `runExemplarInwardSynthesis`, boundary extraction allocated an array of JavaScript objects (`{ x, y }`) on every iteration of the synthesis `while` loop (up to 250 steps), generating thousands of short-lived objects.
2. Boundary search scanned the full ROI canvas ($W \times H$) even when the active masked region had shrunk to a smaller sub-window.
3. Candidate patch matching computed full $(2R+1)^2$ SSD iterations without early exit when accumulated distance exceeded current `bestCost`.

Evidence:
- Workload: 10 inpainting runs on organic manga texture (100x100 texture, 40x40 masked area).
- Before: 111.11 ms (11.11 ms / inpaint)
- After: 81.85 ms (8.19 ms / inpaint)
- Improvement: 26.3% reduction in execution time (1.36x speedup); eliminated 100% of object allocations in the synthesis loop.

Chosen Solution:
1. Pre-allocate flat `Int32Array` buffers (`boundaryX`, `boundaryY`) once before the synthesis loop.
2. Maintain active mask bounding box (`[minMaskX, maxMaskX, minMaskY, maxMaskY]`) to restrict boundary scanning.
3. Add early loop break in the inner SSD accumulation loop when partial normalized distance exceeds `bestCost`.

Trade-offs:
None. Texture synthesis fidelity, boundary feathering, and deterministic seeded reproducibility remain 100% identical.

Why no further optimization is currently justified:
Inpainting now executes in ~8.2ms per patch, well under interactive latency thresholds and fully executed in background WebWorkers.

Rule:
Do not reopen this issue unless real-world workloads on 4K multi-bubble inpainting indicate a bottleneck.

---

## PERF-017 — High-Resolution / 4K Speech Bubble Detection Memory & Ray-Marching Optimization

Status: FROZEN  
Date: 2026-08-26  
Component: `src/features/ocr/ocr-service.ts`, `src/workers/ocr.worker.ts`  

Problem:
1. In `detectSpeechBubbleAtPoint` and `detectSpeechBubbleAtPointFromLuminanceRoi`, probe radius seed selection executed `Math.hypot(dx, dy)` unconditionally across up to 14,641 iterations.
2. BFS and outside flood-fill maintained separate 2D coordinate arrays `queueX` and `queueY`, allocating ~13.4MB of typed arrays for large 4K bounding windows.
3. Ray-marching in `isSeparatedBySaddle` evaluated all line steps without terminating as soon as a neck bottleneck (`minDtOnLine <= neckThreshold`) was identified.

Evidence:
- Workload: 10 speech bubble detections on 2400x3200 4K canvas (across 2 large bubbles).
- Queue Allocation: Reduced from 13.44 MB to 6.72 MB per 4K window (-50% queue memory footprint).
- Test Suite: 351/351 tests pass with zero regressions.

Chosen Solution:
1. Use squared distance check (`dx*dx + dy*dy <= probeRadiusSq`) and compute `Math.sqrt` only for points within the probe circle.
2. Consolidate separate X/Y queues into a single 1D `Int32Array` queue storing packed pixel indices `ly * winW + lx`.
3. Add early exit in `isSeparatedBySaddle` ray-stepping as soon as `minDtOnLine <= neckThreshold`.

Trade-offs:
None. Bounding box coordinates, contour snapping, and multi-bubble segmentation remain pixel-accurate.

Why no further optimization is currently justified:
Bubble detection maintains consistent performance across all resolutions and operates seamlessly within the 16ms interactive UI budget on standard sizes.

Rule:
Do not reopen this issue unless profiling on 8K image processing shows a new hotspot.

---

## PERF-018 — Font Recommendation Engine & Single-Pass Top-1 Role Matching

Status: FROZEN  
Date: 2026-08-26  
Component: `cong-cu-huu-ich/src/font-matcher.ts`  

Problem:
1. `calculateCategoryCompatibility` created and allocated 23 sub-arrays and 3 closure iterations on every single call ($500 \times 6 = 3,000$ calls per set generation $= 69,000$ array allocations).
2. In `generateFontSetFromPreset` and `generateFontSetFromCustomProfile`, each role called `rankFontsForRole`, which mapped the entire font library into `{font, score}` objects and executed an $O(N \log N)$ sort across the entire list just to extract the single best match (`[0]`).
3. `calculateRoleSimilarity` and `rankFontsAgainstAnalysis` used `Math.pow(delta, 2)` instead of direct multiplication `delta * delta`.

Evidence:
- Benchmark 9 (200 font set generations across 200 fonts):
  - Baseline: **37.48 ms** (0.187 ms/set)
  - Optimized: **8.36 ms** (0.042 ms/set)
  - Result: **4.5x faster (77.7% reduction in time)**; zero temporary sorting array allocations.
- Test Suite: 353/353 tests pass (1,612 assertions).

Chosen Solution:
1. Replaced array pairs in `calculateCategoryCompatibility` with a static lookup map `CATEGORY_COMPATIBILITY_MAP`.
2. Created `findBestFontForRole(fontList, roleConfig, preferredFontName)` to find the top-1 candidate in a single linear $O(N)$ pass without object allocations or sorting.
3. Replaced `Math.pow(x, 2)` with `x * x` in Euclidean distance evaluations.

Trade-offs:
None. Generated font sets, role rankings, and score percentages remain 100% identical.

Why no further optimization is currently justified:
Generating a complete 6-role manga font set takes only 0.042 ms (over 23,000 font sets/second).

Rule:
Do not reopen this issue unless profiling indicates a bottleneck on font libraries exceeding 10,000 fonts.

---

## PERF-019 — Font Library Deduplication & Consonant Skeleton O(N) Hash Indexing

Status: FROZEN  
Date: 2026-08-26  
Component: `cong-cu-huu-ich/src/font-matcher.ts`  

Problem:
In `loadAndRegisterCustomFontsFromDB` and `deduplicateCustomFonts`, checking for fuzzy duplicates looped over all existing keys in $O(N^2)$ time, calling `isFuzzyDuplicate` which executed regex consonant strip `.replace(/[aeiouy]/g, '')` twice per pair (up to 250,000 regex operations on a 1,000-font library).

Evidence:
- Benchmark 10 (10 deduplication runs on 1,000 custom fonts with fuzzy stripped duplicates):
  - Baseline: **337.92 ms** (33.79 ms/run)
  - Optimized: **10.49 ms** (1.05 ms/run)
  - Result: **32.2x faster (96.9% reduction in time)**.
- Test Suite: 353/353 tests pass (1,612 assertions).

Chosen Solution:
Maintained a `consonantSkeletonMap = new Map<string, string>()` during deduplication. When checking a candidate key, its consonant skeleton is computed once and queried in $O(1)$ constant time against the map instead of looping through all existing keys.

Trade-offs:
None. Deduplication accuracy across diacritics, CSS wrappers, and stripped ASCII font names remains 100% identical.

Why no further optimization is currently justified:
Deduplication of 1,000 fonts takes ~1.0ms, executing instantaneously during font repository ingestion.

Rule:
Do not reopen this issue unless real-world workloads demonstrate a regression.


