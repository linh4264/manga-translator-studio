import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import {
    sanitizeUnescapedNewlinesInJson,
    balanceJsonBrackets,
    extractJsonFromText,
    repairJsonString,
    parseGeminiJsonText
} from '../../../src/core/utils/json.ts';

test('AI JSON Repair - Sanitize Unescaped Newlines', () => {
    const raw = '{"text": "Line 1\nLine 2\rLine 3\tTab"}';
    const sanitized = sanitizeUnescapedNewlinesInJson(raw);
    assert.strictEqual(sanitized, '{"text": "Line 1\\nLine 2\\rLine 3\\tTab"}');
});

test('AI JSON Repair - Balance Incomplete Brackets', () => {
    // Unclosed string and array
    const unclosedArray = '{"blocks": [{"id": "b1", "translated": "Xin chào';
    const balanced1 = balanceJsonBrackets(unclosedArray);
    assert.doesNotThrow(() => JSON.parse(balanced1));

    // Trailing colon
    const trailingColon = '{"blocks": [{"id": "b1", "translated": ';
    const balanced2 = balanceJsonBrackets(trailingColon);
    assert.doesNotThrow(() => JSON.parse(balanced2));

    // Trailing comma
    const trailingComma = '{"blocks": [{"id": "b1"}, ';
    const balanced3 = balanceJsonBrackets(trailingComma);
    assert.doesNotThrow(() => JSON.parse(balanced3));
});

test('AI JSON Repair - Extract JSON from Markdown and Conversational Wrappers', () => {
    const markdownWithJson = 'Dưới đây là kết quả dịch:\n```json\n{"blocks": [{"id": "b1", "translated": "Chào"}]}\n```\nHy vọng bạn hài lòng!';
    const extracted = extractJsonFromText(markdownWithJson);
    assert.strictEqual(extracted, '{"blocks": [{"id": "b1", "translated": "Chào"}]}');

    const unclosedMarkdown = '```json\n{"blocks": [{"id": "b1", "translated": "Chào"}';
    const extractedUnclosed = extractJsonFromText(unclosedMarkdown);
    assert.strictEqual(extractedUnclosed, '{"blocks": [{"id": "b1", "translated": "Chào"}');
});

test('AI JSON Repair - Truncated Stream & Corrupted Responses (Comprehensive Parsing)', () => {
    // Case 1: Truncated inside second item string
    const truncatedStr = '{"blocks": [{"id": "p1_b1", "translated": "Câu 1"}, {"id": "p1_b2", "translated": "Câu 2 đang dịch dở';
    const parsed1 = parseGeminiJsonText(truncatedStr);
    assert.ok(parsed1 && Array.isArray(parsed1.blocks));
    assert.strictEqual(parsed1.blocks.length, 2);
    assert.strictEqual(parsed1.blocks[0].translated, 'Câu 1');
    assert.strictEqual(parsed1.blocks[1].translated, 'Câu 2 đang dịch dở');

    // Case 2: Braces inside dialogue string
    const withBraces = '{"blocks": [{"id": "b1", "translated": "Chiêu {Hỏa Long Chưởng} siêu mạnh"}]}';
    const parsed2 = parseGeminiJsonText(withBraces);
    assert.strictEqual(parsed2.blocks[0].translated, 'Chiêu {Hỏa Long Chưởng} siêu mạnh');

    // Case 3: Top-level Array
    const topArray = '[{"id": "b1", "translated": "T1"}, {"id": "b2", "translated": "T2"}]';
    const parsed3 = parseGeminiJsonText(topArray);
    assert.strictEqual(parsed3.blocks.length, 2);
    assert.strictEqual(parsed3.blocks[0].id, 'b1');

    // Case 4: Key-Value Map format
    const kvMap = '{"p1_b1": "Bản dịch 1", "p1_b2": "Bản dịch 2"}';
    const parsed4 = parseGeminiJsonText(kvMap);
    assert.strictEqual(parsed4.blocks.length, 2);
    assert.strictEqual(parsed4.blocks[0].id, 'p1_b1');
    assert.strictEqual(parsed4.blocks[0].translated, 'Bản dịch 1');

    // Case 5: Corrupted stream recoverable by Regex Fallback
    const severelyBroken = 'Log: AI output -> {"id": "b1", "translated": "Dòng A"} garbage {"id": "b2", "translated": "Dòng B"} end';
    const parsed5 = parseGeminiJsonText(severelyBroken);
    assert.ok(parsed5 && parsed5.blocks.length === 2);
    assert.strictEqual(parsed5.blocks[0].translated, 'Dòng A');
    assert.strictEqual(parsed5.blocks[1].translated, 'Dòng B');
});
