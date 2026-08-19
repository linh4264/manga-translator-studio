// Test script to prototype improved JSON repairs
function sanitizeUnescapedNewlinesInJson(jsonStr) {
    let result = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        if (char === '"' && !escaped) {
            inString = !inString;
            result += char;
        } else if (inString && (char === '\n' || char === '\r')) {
            result += char === '\n' ? '\\n' : '\\r';
        } else if (inString && char === '\t') {
            result += '\\t';
        } else {
            result += char;
        }
        escaped = (char === '\\' && !escaped);
    }
    return result;
}

function balanceJsonBrackets(jsonStr) {
    let s = String(jsonStr || '').trim();
    if (!s) return "{}";

    let inString = false;
    let escaped = false;
    const stack = [];

    for (let i = 0; i < s.length; i++) {
        const char = s[i];
        if (char === '"' && !escaped) {
            inString = !inString;
        } else if (!inString) {
            if (char === '{' || char === '[') {
                stack.push(char === '{' ? '}' : ']');
            } else if (char === '}' || char === ']') {
                if (stack.length > 0 && stack[stack.length - 1] === char) {
                    stack.pop();
                }
            }
        }
        escaped = (char === '\\' && !escaped);
    }

    // If stream ended while inside an open string, close it
    if (inString) {
        s += '"';
    }

    // If trailing item is a key without a colon (e.g. `,\s*"incompleteKey"`), strip that incomplete key and trailing comma
    s = s.replace(/,\s*"[^"]*"\s*$/, '');
    s = s.replace(/\{\s*"[^"]*"\s*$/, '{');
    s = s.replace(/\[\s*"[^"]*"\s*$/, '[');

    // Clean up trailing incomplete property or key fragment before closing brackets
    s = s.replace(/:\s*$/, ': ""');
    s = s.replace(/,\s*$/, '');
    s = s.replace(/,\s*\{\s*$/, '');
    s = s.replace(/,\s*\[\s*$/, '');

    // Close remaining open brackets in reverse order
    while (stack.length > 0) {
        s += stack.pop();
    }
    return s;
}

function extractJsonFromText(text) {
    if (!text) return "";
    let candidate = String(text).trim();

    // 1. Remove markdown fences (```json ... ``` or unclosed ```json ...)
    const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch) {
        candidate = fenceMatch[1].trim();
    } else {
        const unclosedFenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*)/i);
        if (unclosedFenceMatch) {
            candidate = unclosedFenceMatch[1].trim();
        }
    }

    // 2. Locate starting brace or bracket
    const firstBrace = candidate.indexOf('{');
    const firstBracket = candidate.indexOf('[');
    let startIdx = -1;
    if (firstBrace !== -1 && firstBracket !== -1) {
        startIdx = Math.min(firstBrace, firstBracket);
    } else if (firstBrace !== -1) {
        startIdx = firstBrace;
    } else if (firstBracket !== -1) {
        startIdx = firstBracket;
    }

    if (startIdx !== -1) {
        candidate = candidate.slice(startIdx);
    }

    return candidate;
}

function fixUnescapedQuotesInJson(jsonStr) {
    // Escape unescaped double quotes inside string values
    // A valid JSON boundary for string ending is: quote followed by optional whitespace and (comma, colon, closing brace/bracket, or newline)
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        if (char === '"' && !escaped) {
            if (!inString) {
                inString = true;
                result += char;
            } else {
                // Peek ahead: is this quote closing a string (followed by :, ,, }, ], or whitespace then one of those)?
                const rest = jsonStr.slice(i + 1).trimStart();
                const isClosing = rest.length === 0 || /^[:,\]\}]/.test(rest);
                if (isClosing) {
                    inString = false;
                    result += char;
                } else {
                    // Inner unescaped quote -> escape it!
                    result += '\\"';
                }
            }
        } else {
            result += char;
        }
        escaped = (char === '\\' && !escaped);
    }
    return result;
}

function repairJsonString(jsonStr) {
    let cleaned = extractJsonFromText(jsonStr);
    if (!cleaned) return "{}";

    // Replace Python constants
    cleaned = cleaned.replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null');

    // Fix unescaped inner quotes
    cleaned = fixUnescapedQuotesInJson(cleaned);

    // Fix missing commas between adjacent objects/arrays
    cleaned = cleaned.replace(/\}\s*\{/g, '},{')
        .replace(/\]\s*\[/g, '],[')
        .replace(/\}\s*\"/g, '},"')
        .replace(/\"\s*\{/g, '",{');

    // Fix missing commas on multiline items
    cleaned = cleaned.replace(/(["\d]|true|false|null)\s*\n\s*(["{])/g, '$1,$2');

    // Remove trailing commas before } or ]
    cleaned = cleaned.replace(/,\s*([\}\]])/g, '$1');

    // Fix unescaped control characters
    cleaned = sanitizeUnescapedNewlinesInJson(cleaned);

    // Balance unclosed brackets & unterminated strings
    cleaned = balanceJsonBrackets(cleaned);

    return cleaned;
}

function extractStructuredToeicWithRegex(rawText) {
    if (!rawText) return null;
    const text = String(rawText);

    // Extract grammar
    const grammarMatch = text.match(/"grammar"\s*:\s*"((?:[^"\\]|\\.)*?)(?:"|$)/i);
    const grammar = grammarMatch ? grammarMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '';

    // Extract vocabulary items
    const vocabList = [];
    const vocabRegex = /\{\s*"word"\s*:\s*"([^"]+)"[\s\S]*?"pos"\s*:\s*"([^"]*)"[\s\S]*?"vietnamese"\s*:\s*"([^"]*)"(?:[\s\S]*?"toeic_example"\s*:\s*"([^"]*)")?/gi;
    let vm;
    while ((vm = vocabRegex.exec(text)) !== null) {
        vocabList.push({
            word: vm[1],
            pos: vm[2] || '',
            phonetic: '',
            vietnamese: vm[3] || '',
            toeic_example: vm[4] || ''
        });
    }

    // Extract practice questions
    const questions = [];
    const qRegex = /\{\s*"type"\s*:\s*"([^"]+)"[\s\S]*?"question"\s*:\s*"([^"]+)"[\s\S]*?"correct_answer"\s*:\s*"([^"]+)"[\s\S]*?"explanation"\s*:\s*"([^"]*)"/gi;
    let qm;
    while ((qm = qRegex.exec(text)) !== null) {
        questions.push({
            type: qm[1],
            question: qm[2],
            options: [],
            correct_answer: qm[3],
            explanation: qm[4]
        });
    }

    if (grammar || vocabList.length > 0 || questions.length > 0) {
        return {
            grammar: grammar || 'Phân tích ngữ pháp được khôi phục từ phản hồi AI.',
            vocabulary: vocabList,
            practice_questions: questions
        };
    }
    return null;
}

// Run test cases
const testCases = [
    {
        name: "Case 1: User's reported exact cut-off",
        raw: `{\n  "grammar": "Câu này sử dụng cấu trúc bị động (Passive Voice) với dạng 'be + past participle' (was picked). Cấu trúc bị động thường xuyên xuất hiện trong Part 5 & 6 để nhấn mạnh vào hành động thay `
    },
    {
        name: "Case 5: Cut off right after key name",
        raw: "{\n  \"grammar\": \"Cấu trúc bị động\",\n  \"vocab"
    },
    {
        name: "Case 8: Inner unescaped double quotes inside text",
        raw: '{\n  "grammar": "Câu này dùng "be + V3" để nhấn mạnh."\n}'
    },
    {
        name: "Case 9: Severely truncated TOEIC response with partial vocab",
        raw: '{\n  "grammar": "Cấu trúc câu",\n  "vocabulary": [\n    {\n      "word": "pick",\n      "pos": "v",\n      "vietnamese": "chọn",\n      "toeic_example": "Please pick one."'
    }
];

testCases.forEach(tc => {
    console.log(`\n=== ${tc.name} ===`);
    const repaired = repairJsonString(tc.raw);
    console.log('Repaired JSON:', repaired);
    try {
        const parsed = JSON.parse(repaired);
        console.log('✅ Parsed successfully:', parsed);
    } catch (e) {
        console.log('❌ Parse failed:', e.message);
        const fallback = extractStructuredToeicWithRegex(tc.raw);
        console.log('Fallback TOEIC result:', fallback);
    }
});
