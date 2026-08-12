export function sanitizeUnescapedNewlinesInJson(jsonStr) {
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

export function balanceJsonBrackets(jsonStr) {
    let s = jsonStr.trim();
    let inString = false;
    let escaped = false;
    const stack = [];
    for (let i = 0; i < s.length; i++) {
        const char = s[i];
        if (char === '"' && !escaped) inString = !inString;
        else if (!inString) {
            if (char === '{' || char === '[') stack.push(char === '{' ? '}' : ']');
            else if (char === '}' || char === ']') {
                if (stack.length > 0 && stack[stack.length - 1] === char) stack.pop();
            }
        }
        escaped = (char === '\\' && !escaped);
    }
    if (inString) s += '"';
    s = s.replace(/,\s*$/, '');
    while (stack.length > 0) s += stack.pop();
    return s;
}

export function extractJsonFromText(text) {
    if (!text) return "";
    let cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    // Extract content between first { and last }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    return cleaned;
}

export function repairJsonString(jsonStr) {
    let cleaned = extractJsonFromText(jsonStr);

    // Remove trailing commas before } or ]
    cleaned = cleaned.replace(/,\s*([\}\]])/g, '$1');

    // Fix unescaped control characters
    cleaned = sanitizeUnescapedNewlinesInJson(cleaned);

    // Balance unclosed brackets
    cleaned = balanceJsonBrackets(cleaned);

    return cleaned;
}

export function parseGeminiJsonText(text) {
    if (!text) return null;

    const cleaned = repairJsonString(text);

    try {
        const parsed = JSON.parse(cleaned);
        if (parsed && Array.isArray(parsed.blocks)) {
            return parsed;
        }
    } catch (e) {
        console.warn("JSON parse failed for AI output:", e, cleaned);
    }

    return null;
}
