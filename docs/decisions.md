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
