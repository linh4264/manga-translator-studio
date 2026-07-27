// JSON Cleanup and Repair Utilities for AI Output

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

export function parseGeminiJsonText(text) {
    if (!text) return null;
    let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    cleaned = sanitizeUnescapedNewlinesInJson(cleaned);
    cleaned = balanceJsonBrackets(cleaned);
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Failed to parse AI JSON:", e, cleaned);
        return null;
    }
}
