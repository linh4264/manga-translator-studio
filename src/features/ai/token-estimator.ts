// Token Estimation & Dynamic Chapter Chunking Engine
// Provides client-side input measurement and output token prediction for Multimodal Manga Translation

export interface TokenEstimationResult {
    inputTokens: number;
    predictedOutputTokens: number;
    estimatedDurationSec: number;
}

/**
 * Estimates input token count for arbitrary text (Japanese/Korean/Chinese/English/Vietnamese)
 */
export function estimateTextTokens(text: string): number {
    if (!text) return 0;
    const clean = String(text).trim();
    if (!clean) return 0;

    // Detect CJK characters (Kanji, Hiragana, Katakana, Hanzi, Hangul)
    const cjkMatches = clean.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g);
    const cjkCount = cjkMatches ? cjkMatches.length : 0;

    // Non-CJK text
    const nonCjkText = clean.replace(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g, ' ').trim();
    const words = nonCjkText ? nonCjkText.split(/\s+/).filter(Boolean) : [];

    // CJK: ~1.2 tokens per character
    // Non-CJK: ~1.3 tokens per word (especially Vietnamese with tone marks)
    const cjkTokens = Math.ceil(cjkCount * 1.2);
    const wordTokens = Math.ceil(words.length * 1.3);

    return Math.max(1, cjkTokens + wordTokens);
}

/**
 * Estimates input tokens for attached thumbnail manga images in Gemini multimodal prompt.
 * Each 900px downscaled image typically consumes ~258 base tokens (single tile) up to ~500 tokens.
 */
export function estimateImageTokens(imageCount: number = 1): number {
    if (imageCount <= 0) return 0;
    return imageCount * 450;
}

/**
 * Determines a strictly safe output token budget based on the model architecture.
 * - Flash Lite / 8B models (4,096 ceiling): safe budget ~2,200 tokens (~55-65 blocks).
 * - Standard Flash / Pro models (Gemini 2.5, 3.6 Flash, 3.8 Flash, Pro, GPT-4o with 65k token ceiling):
 *   Safe budget ~8,000 tokens (~180-200 blocks, corresponding to ~20-22 manga pages).
 *   This ensures a 30-43 page chapter takes only 1-2 requests (1-2 RPD) without truncating!
 */
export function getSafeTokenBudgetForModel(modelName?: string): number {
    const m = (modelName || '').toLowerCase();
    // Match 'lite', '8b', 'small', or '-mini' (ensure 'gemini' is not falsely matched as 'mini')
    if (m.includes('lite') || m.includes('8b') || m.includes('small') || m.includes('-mini') || m.includes(' mini')) {
        return 2200;
    }
    // Standard models (Gemini 3.6 Flash, 3.8 Flash, 2.5 Flash, Pro):
    // 6,500 output token budget comfortably fits ~140-180 dialogue blocks (~20-22 pages) per request.
    // This ensures a 40-43 page chapter takes at most 2 requests (2 RPD), and 20-30 pages takes 1-2 requests!
    return 6500;
}

/**
 * Predicts the output tokens that Gemini will generate for a given dialogue block in JSON format.
 * Format: {"id": "p1_b1", "translated": "..."}
 * Overhead per block: ~16 tokens.
 * Vietnamese translation length: heavily expanded due to multi-token Vietnamese diacritics and particles.
 */
export function estimateBlockOutputTokens(block: { original?: string; id?: string }): number {
    const orig = (block.original || '').trim();
    if (!orig) return 18;

    const origTokens = estimateTextTokens(orig);
    // Vietnamese translation expansion: diacritics, tone marks, and publication-grade phrasing
    // average ~1.8x token count of source, plus 16 tokens for JSON syntax ({"id":"pX_bY","translated":"..."})
    const translatedTokens = Math.max(16, Math.ceil(origTokens * 1.8));
    const jsonOverhead = 16;

    return translatedTokens + jsonOverhead;
}

/**
 * Calculates complete input, predicted output, and estimated latency for a chapter chunk
 */
export function estimateChapterChunkTokens(
    chunkBlocks: Array<{ original?: string; id?: string; pageIndex?: number }>,
    imageCount: number = 0,
    systemPromptLength: number = 600
): TokenEstimationResult {
    const blocksOutputTokens = chunkBlocks.reduce((sum, b) => sum + estimateBlockOutputTokens(b), 0);
    // JSON root wrapper overhead: {"blocks": [...]}
    const predictedOutputTokens = blocksOutputTokens + 20;

    // Input estimation: System prompt + block originals + image parts + structural JSON in prompt
    const systemTokens = Math.ceil(systemPromptLength / 3);
    const blocksInputTokens = chunkBlocks.reduce((sum, b) => sum + estimateTextTokens(b.original || '') + 12, 0);
    const imagesInputTokens = estimateImageTokens(imageCount);
    const inputTokens = systemTokens + blocksInputTokens + imagesInputTokens + 50;

    // Estimated duration: Gemini Flash typically generates ~60-80 tokens/sec
    // Plus 3s for vision encoder pass on attached images
    const visionEncodingTime = Math.min(8, imageCount * 0.3);
    const generationTime = predictedOutputTokens / 70;
    const estimatedDurationSec = Math.max(5, Math.round(visionEncodingTime + generationTime));

    return {
        inputTokens,
        predictedOutputTokens,
        estimatedDurationSec
    };
}

/**
 * Dynamic Token-based Chapter Chunking
 * Partitions blocks page-by-page so that no chunk exceeds the safe token budget.
 * For Flash Lite models (4,096 ceiling), budget is ~1,800 tokens (~45-55 blocks).
 * For Standard models, budget is ~2,200 tokens (~55-70 blocks).
 */
export function partitionBlocksByTokenBudget<T extends { pageIndex?: number; original?: string; id?: string }>(
    allBlocks: T[],
    modelOrBudget: string | number = 2200
): T[][] {
    if (!allBlocks || allBlocks.length === 0) return [];

    const budget = typeof modelOrBudget === 'number'
        ? modelOrBudget
        : getSafeTokenBudgetForModel(modelOrBudget);

    // Group blocks by pageIndex
    const pagesMap = new Map<number, T[]>();
    const pageOrder: number[] = [];

    for (const b of allBlocks) {
        const pIdx = b.pageIndex !== undefined ? b.pageIndex : 0;
        if (!pagesMap.has(pIdx)) {
            pagesMap.set(pIdx, []);
            pageOrder.push(pIdx);
        }
        pagesMap.get(pIdx)!.push(b);
    }

    const chunks: T[][] = [];
    let currentChunk: T[] = [];
    let currentChunkTokens = 0;

    for (const pIdx of pageOrder) {
        const pageBlocks = pagesMap.get(pIdx) || [];
        const pageTokens = pageBlocks.reduce((sum, b) => sum + estimateBlockOutputTokens(b), 0);

        // If adding this page exceeds the budget and we already have blocks in currentChunk, seal it
        if (currentChunk.length > 0 && (currentChunkTokens + pageTokens > budget)) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentChunkTokens = 0;
        }

        currentChunk.push(...pageBlocks);
        currentChunkTokens += pageTokens;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}
