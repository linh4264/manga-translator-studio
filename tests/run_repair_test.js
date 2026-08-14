import { parseGeminiJsonText } from './test_repair_robust.js';

const testCases = [
    {
        name: "Case 1: Cut off inside string with braces",
        input: `{"blocks": [{"id": "p1_b1", "translated": "Xin chào {người anh em} và tôi`,
        expectedCount: 1
    },
    {
        name: "Case 2: Cut off inside second item string",
        input: `{"blocks": [{"id": "p1_b1", "translated": "Xin chào"}, {"id": "p1_b2", "translated": "Hôm nay thời tiết đẹp quá`,
        expectedCount: 2
    },
    {
        name: "Case 3: Cut off right after key colon",
        input: `{"blocks": [{"id": "p1_b1", "translated": "Xin chào"}, {"id": "p1_b2", "translated": `,
        expectedCount: 1
    },
    {
        name: "Case 4: Cut off in middle of key name",
        input: `{"blocks": [{"id": "p1_b1", "translated": "Xin chào"}, {"id": "p1_b2"`,
        expectedCount: 1
    },
    {
        name: "Case 5: Top-level array",
        input: `[{"id": "p1_b1", "translated": "Xin chào"}, {"id": "p1_b2", "translated": "Tạm biệt"}]`,
        expectedCount: 2
    },
    {
        name: "Case 6: Unclosed markdown block with markdown prefix",
        input: "```json\n" + `{"blocks": [{"id": "p1_b1", "translated": "Xin chào"}, {"id": "p1_b2", "translated": "Cứu hộ thành công`,
        expectedCount: 2
    },
    {
        name: "Case 7: Key-value map",
        input: `{"p1_b1": "Xin chào", "p1_b2": "Tạm biệt"}`,
        expectedCount: 2
    },
    {
        name: "Case 8: Corrupted / severely malformed json recoverable by regex",
        input: `Some conversational text { "id": "p1_b1", "translated": "Câu 1" } and { "id": "p1_b2", "translated": "Câu 2" broken syntax`,
        expectedCount: 2
    }
];

let allPassed = true;
for (const tc of testCases) {
    const result = parseGeminiJsonText(tc.input);
    const count = result?.blocks?.length || 0;
    const ok = count === tc.expectedCount;
    console.log(`${ok ? '✅' : '❌'} ${tc.name}: got ${count} blocks, expected ${tc.expectedCount}`);
    if (!ok) {
        console.log("   Result was:", JSON.stringify(result, null, 2));
        allPassed = false;
    } else {
        console.log("   Sample block:", JSON.stringify(result.blocks[result.blocks.length - 1]));
    }
}

if (!allPassed) {
    process.exit(1);
} else {
    console.log("\n🎉 ALL TRUNCATION AND REPAIR TEST CASES PASSED PERFECTLY!");
}
