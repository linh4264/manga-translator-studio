import { describe, it, expect } from 'vitest';
import { parseGeminiJsonText } from '../../../src/core/utils/json.ts';

describe('AI JSON Stream Truncation and Recovery', () => {
    it('Case 1: Cut off inside string with braces', () => {
        const input = `{"blocks": [{"id": "p1_b1", "translated": "Xin chào {người anh em} và tôi`;
        const result = parseGeminiJsonText(input);
        expect(result?.blocks).toBeDefined();
        expect(result.blocks.length).toBe(1);
        expect(result.blocks[0].id).toBe('p1_b1');
    });

    it('Case 2: Cut off inside second item string', () => {
        const input = `{"blocks": [{"id": "p1_b1", "translated": "Xin chào"}, {"id": "p1_b2", "translated": "Hôm nay thời tiết đẹp quá`;
        const result = parseGeminiJsonText(input);
        expect(result?.blocks).toBeDefined();
        expect(result.blocks.length).toBe(2);
        expect(result.blocks[1].id).toBe('p1_b2');
    });

    it('Case 3: Cut off right after key colon', () => {
        const input = `{"blocks": [{"id": "p1_b1", "translated": "Xin chào"}, {"id": "p1_b2", "translated": `;
        const result = parseGeminiJsonText(input);
        expect(result?.blocks).toBeDefined();
        expect(result.blocks.length).toBe(1);
    });

    it('Case 4: Cut off in middle of key name', () => {
        const input = `{"blocks": [{"id": "p1_b1", "translated": "Xin chào"}, {"id": "p1_b2"`;
        const result = parseGeminiJsonText(input);
        expect(result?.blocks).toBeDefined();
        expect(result.blocks.length).toBe(1);
    });

    it('Case 5: Top-level array', () => {
        const input = `[{"id": "p1_b1", "translated": "Xin chào"}, {"id": "p1_b2", "translated": "Tạm biệt"}]`;
        const result = parseGeminiJsonText(input);
        expect(result?.blocks).toBeDefined();
        expect(result.blocks.length).toBe(2);
    });

    it('Case 6: Unclosed markdown block with markdown prefix', () => {
        const input = "```json\n" + `{"blocks": [{"id": "p1_b1", "translated": "Xin chào"}, {"id": "p1_b2", "translated": "Cứu hộ thành công`;
        const result = parseGeminiJsonText(input);
        expect(result?.blocks).toBeDefined();
        expect(result.blocks.length).toBe(2);
    });

    it('Case 7: Key-value map', () => {
        const input = `{"p1_b1": "Xin chào", "p1_b2": "Tạm biệt"}`;
        const result = parseGeminiJsonText(input);
        expect(result?.blocks).toBeDefined();
        expect(result.blocks.length).toBe(2);
    });

    it('Case 8: Corrupted / severely malformed json recoverable by regex', () => {
        const input = `Some conversational text { "id": "p1_b1", "translated": "Câu 1" } and { "id": "p1_b2", "translated": "Câu 2" broken syntax`;
        const result = parseGeminiJsonText(input);
        expect(result?.blocks).toBeDefined();
        expect(result.blocks.length).toBe(2);
    });

    it('Case 9: Grammar analysis cut-off recovery', () => {
        const input = `{\n  "grammar": "Câu này sử dụng cấu trúc bị động (Passive Voice) với dạng 'be + past participle' (was picked). Cấu trúc bị động thường xuyên xuất hiện trong Part 5 & 6 để nhấn mạnh vào hành động thay `;
        const result = parseGeminiJsonText(input);
        expect(result).toBeDefined();
        expect(result.grammar).toBeDefined();
    });
});
