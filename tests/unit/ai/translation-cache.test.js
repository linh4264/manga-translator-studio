import { test } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import {
    fnv1a64,
    normalizeSourceText,
    computeTranslationCacheKey,
    getCachedTranslationSync,
    setCachedTranslation,
    setCachedTranslationsBatch,
    getTranslationCacheStats,
    clearTranslationCache,
    exportTranslationCacheJSON,
    importTranslationCacheJSON
} from '../../../src/features/ai/translation-cache.ts';

test('Translation Hash Cache - Deterministic FNV-1a Hashing Across CJK Languages', () => {
    // 1. Japanese
    const hashJa1 = fnv1a64("こんにちは、元気ですか？");
    const hashJa2 = fnv1a64("こんにちは、元気ですか？");
    assert.strictEqual(hashJa1, hashJa2, "Same Japanese string must produce exact same 64-bit hash");
    assert.strictEqual(typeof hashJa1, 'string');
    assert.strictEqual(hashJa1.length, 16, "FNV-1a 64-bit hash hex length must be 16 characters");

    // 2. Korean
    const hashKo = fnv1a64("안녕하세요! 오늘 날씨가 좋네요.");
    assert.strictEqual(hashKo.length, 16);

    // 3. Chinese
    const hashZh = fnv1a64("你好！今天天气真好。");
    assert.strictEqual(hashZh.length, 16);

    // 4. Different texts must produce different hashes
    assert.notStrictEqual(hashJa1, hashKo);
    assert.notStrictEqual(hashJa1, hashZh);
});

test('Translation Hash Cache - Source Text Normalization', () => {
    const raw1 = "   お前は   誰だ？！ \n\t  ";
    const raw2 = "お前は 誰だ？！";
    assert.strictEqual(normalizeSourceText(raw1), normalizeSourceText(raw2), "Whitespace and newlines must be normalized");

    const key1 = computeTranslationCacheKey(raw1, 'vi');
    const key2 = computeTranslationCacheKey(raw2, 'vi');
    assert.strictEqual(key1, key2, "Cache keys for equivalent texts must match");
});

test('Translation Hash Cache - L1 In-Memory LRU Cache Set & Get', async () => {
    await clearTranslationCache();

    const orig = "何をしているんだ？";
    const trans = "Cậu đang làm cái gì thế?";

    // 1. Initial lookup -> miss
    const missed = getCachedTranslationSync(orig, 'vi');
    assert.strictEqual(missed, null, "Should return null on cache miss");

    // 2. Set translation in cache
    const entry = setCachedTranslation(orig, trans, 'vi', { speaker: 'Hero' });
    assert.ok(entry, "Entry must be created");
    assert.strictEqual(entry.translated, trans);

    // 3. Subsequent lookup -> hit!
    const hit = getCachedTranslationSync(orig, 'vi', { speaker: 'Hero' });
    assert.ok(hit, "Should return cached entry");
    assert.strictEqual(hit.translated, trans);
    assert.strictEqual(hit.hitCount, 1);

    // 4. Lookup with different targetLang -> miss
    const enMiss = getCachedTranslationSync(orig, 'en', { speaker: 'Hero' });
    assert.strictEqual(enMiss, null, "Different target language must be a cache miss");
});

test('Translation Hash Cache - Batch Operations & Metrics Stats', async () => {
    await clearTranslationCache();

    const batch = [
        { original: "ドキドキ", translated: "Thình thịch", targetLang: 'vi' },
        { original: "ハァハァ", translated: "Hộc hộc", targetLang: 'vi' },
        { original: "ドカーン！", translated: "ĐÙNG!", targetLang: 'vi' }
    ];

    const savedCount = setCachedTranslationsBatch(batch);
    assert.strictEqual(savedCount, 3, "All 3 batch entries should be saved");

    // Check lookups
    const hit1 = getCachedTranslationSync("ドキドキ", 'vi');
    assert.ok(hit1 && hit1.translated === "Thình thịch");

    const hit2 = getCachedTranslationSync("ハァハァ", 'vi');
    assert.ok(hit2 && hit2.translated === "Hộc hộc");

    // Stats
    const stats = getTranslationCacheStats();
    assert.strictEqual(stats.totalEntries, 3);
    assert.ok(stats.hits >= 2);
    assert.ok(stats.estimatedTokensSaved > 0);
});

test('Translation Hash Cache - JSON Export and Import Roundtrip', async () => {
    await clearTranslationCache();

    setCachedTranslation("おはよう", "Chào buổi sáng", 'vi');
    setCachedTranslation("さようなら", "Tạm biệt", 'vi');

    const jsonStr = exportTranslationCacheJSON();
    assert.ok(jsonStr.includes("Chào buổi sáng"));
    assert.ok(jsonStr.includes("Tạm biệt"));

    // Clear and re-import
    await clearTranslationCache();
    assert.strictEqual(getTranslationCacheStats().totalEntries, 0);

    const importedCount = importTranslationCacheJSON(jsonStr);
    assert.strictEqual(importedCount, 2, "2 entries should be imported");

    const hit = getCachedTranslationSync("おはよう", 'vi');
    assert.ok(hit && hit.translated === "Chào buổi sáng");
});
