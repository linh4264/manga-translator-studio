import { parseGeminiJsonText, repairJsonString, balanceJsonBrackets } from '../src/core/utils/json.ts';

console.log("Testing current json.js...");

const case1 = `{"blocks": [{"id": "p1_b1", "translated": "Xin chào"}, {"id": "p1_b2", "translated": "Hôm nay tôi`;
console.log("Case 1 (cut off inside string):", parseGeminiJsonText(case1));

const case2 = `{"blocks": [{"id": "p1_b1", "translated": "Xin chào"}, {"id": "p1_b2", "translated": `;
console.log("Case 2 (cut off after key):", parseGeminiJsonText(case2));

const case3 = `[{"id": "p1_b1", "translated": "Xin chào"}]`;
console.log("Case 3 (top-level array):", parseGeminiJsonText(case3));
