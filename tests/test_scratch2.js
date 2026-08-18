import { parseGeminiJsonText, repairJsonString, balanceJsonBrackets } from '../src/core/utils/json.ts';

const caseSingle = `{"blocks": [{"id": "p1_b1", "translated": "Xin chào mọi người, hôm nay tôi`;
console.log("Single item cut off:", parseGeminiJsonText(caseSingle));

const caseInsideBracesInString = `{"blocks": [{"id": "p1_b1", "translated": "Xin chào {người anh em} và tôi`;
console.log("Inside braces in string:", parseGeminiJsonText(caseInsideBracesInString));
