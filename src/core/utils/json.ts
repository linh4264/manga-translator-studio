export function sanitizeUnescapedNewlinesInJson(jsonStr: string): string {
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

export function balanceJsonBrackets(jsonStr: string): string {
    let s = String(jsonStr || '').trim();
    if (!s) return "{}";

    let inString = false;
    let escaped = false;
    const stack: string[] = [];

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
        s += stack.pop()!;
    }
    return s;
}

export function extractJsonFromText(text: string): string {
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

export function fixUnescapedQuotesInJson(jsonStr: string): string {
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
                const rest = jsonStr.slice(i + 1).trimStart();
                const isClosing = rest.length === 0 || /^[:,\]\}]/.test(rest);
                if (isClosing) {
                    inString = false;
                    result += char;
                } else {
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

export function repairJsonString(jsonStr: string): string {
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


export function extractBlocksWithRegex(rawText: string): Array<{ id: string; translated: string }> {
    if (!rawText) return [];
    const blocks: Array<{ id: string; translated: string }> = [];
    const text = String(rawText);

    // Pattern 1: Find any key-value pair of id and translated anywhere in text
    const regex1 = /"id"\s*:\s*(?:"([^"]+)"|(\d+))[\s\S]*?"translated"\s*:\s*"((?:[^"\\]|\\.)*)"/gi;
    let m: RegExpExecArray | null;
    while ((m = regex1.exec(text)) !== null) {
        const id = m[1] || m[2];
        const translated = m[3] ? m[3].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '';
        if (translated && !blocks.some(b => b.id === id)) {
            blocks.push({ id, translated });
        }
    }
    if (blocks.length > 0) return blocks;

    // Pattern 2: Incomplete trailing block at the very end of truncated output with partial translated text
    const regex2 = /"id"\s*:\s*(?:"([^"]+)"|(\d+))[\s\S]*?"translated"\s*:\s*"([^"]*)$/i;
    const m2 = regex2.exec(text);
    if (m2) {
        const id = m2[1] || m2[2];
        const translated = m2[3] || '';
        if (translated && !blocks.some(b => b.id === id)) {
            blocks.push({ id, translated });
        }
    }

    return blocks;
}

function cleanBlocksList(rawList: any[]): any[] {
    if (!Array.isArray(rawList)) return [];
    return rawList.filter(b => {
        if (!b) return false;
        if (typeof b === 'string' && b.trim()) return true;
        if (typeof b === 'object') {
            const hasTranslated = typeof b.translated === 'string' && b.translated.trim().length > 0;
            const hasTranslation = typeof b.translation === 'string' && b.translation.trim().length > 0;
            const hasText = typeof b.text === 'string' && b.text.trim().length > 0;
            const hasOriginal = typeof b.original === 'string' && b.original.trim().length > 0;
            const hasBox = b.box !== undefined;
            return hasTranslated || hasTranslation || hasText || hasOriginal || hasBox;
        }
        return false;
    });
}

export function normalizeParsedAiData(data: any): any {
    if (!data) return null;

    if (Array.isArray(data)) {
        return { blocks: cleanBlocksList(data) };
    }
    if (typeof data === 'object') {
        if (Array.isArray(data.blocks)) return { ...data, blocks: cleanBlocksList(data.blocks) };
        if (Array.isArray(data.translations)) return { ...data, blocks: cleanBlocksList(data.translations) };
        if (Array.isArray(data.dialogues)) return { ...data, blocks: cleanBlocksList(data.dialogues) };
        if (Array.isArray(data.items)) return { ...data, blocks: cleanBlocksList(data.items) };
        if (Array.isArray(data.regions)) return { ...data, blocks: cleanBlocksList(data.regions) };
        if (Array.isArray(data.data)) return { ...data, blocks: cleanBlocksList(data.data) };

        // Key-value map format e.g. { "p1_b1": "Chào bạn", "p1_b2": "Tạm biệt" }
        const keys = Object.keys(data);
        const isGeneralNonBlockObject = keys.some(k => ['grammar', 'vocabulary', 'practice_questions', 'practice_question', 'characterDossier', 'lorebook', 'version', 'pages'].includes(k));

        if (!isGeneralNonBlockObject && keys.length > 0 && keys.every(k => typeof data[k] === 'string')) {
            const mappedBlocks = keys
                .filter(k => data[k].trim().length > 0)
                .map(k => ({ id: k, translated: data[k] }));
            return { blocks: mappedBlocks };
        }
    }
    return data;
}

export function isValidAiJson(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    if (Array.isArray(obj)) return obj.length > 0;
    if (Array.isArray(obj.blocks)) return obj.blocks.length > 0;
    return Object.keys(obj).length > 0;
}

export function parseGeminiJsonText(rawText: string): any {
    const text = String(rawText || '').trim();
    if (!text) return null;

    // 1. Direct parse attempt
    try {
        const parsed = JSON.parse(text);
        const norm = normalizeParsedAiData(parsed);
        if (isValidAiJson(norm)) return norm;
    } catch (e) { }

    // 2. Extracted text direct parse
    const extracted = extractJsonFromText(text);
    try {
        const parsed = JSON.parse(extracted);
        const norm = normalizeParsedAiData(parsed);
        if (isValidAiJson(norm)) return norm;
    } catch (e) { }

    // 3. Multi-layer repair parse
    try {
        const cleaned = repairJsonString(text);
        const parsed = JSON.parse(cleaned);
        const norm = normalizeParsedAiData(parsed);
        if (isValidAiJson(norm)) return norm;
    } catch (e) { }

    // 4. Secondary repair on raw extracted
    try {
        const balanced = balanceJsonBrackets(extracted);
        const parsed = JSON.parse(balanced);
        const norm = normalizeParsedAiData(parsed);
        if (isValidAiJson(norm)) return norm;
    } catch (e) { }

    // 5. Regex rescue fallback for cut-off / malformed outputs (translation blocks)
    try {
        const extractedBlocks = extractBlocksWithRegex(text);
        if (extractedBlocks.length > 0) {
            console.warn("Đã cứu hộ thành công JSON bị cắt đuôi bằng Regex Extraction:", extractedBlocks);
            return { blocks: extractedBlocks };
        }
    } catch (e) { }

    // 6. Regex rescue fallback for TOEIC structured analysis
    try {
        const toeicFallback = extractStructuredToeicWithRegex(text);
        if (toeicFallback) {
            console.warn("Đã cứu hộ thành công JSON TOEIC bị cắt đuôi bằng Structured Extraction:", toeicFallback);
            return toeicFallback;
        }
    } catch (e) { }

    console.warn("JSON parse failed for AI output:", text.slice(0, 200));
    return null;
}

export function extractStructuredToeicWithRegex(rawText: string): any {
    if (!rawText) return null;
    const text = String(rawText);

    // Extract grammar
    const grammarMatch = text.match(/"grammar"\s*:\s*"((?:[^"\\]|\\.)*?)(?:"|$)/i);
    const grammar = grammarMatch ? grammarMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '';

    // Extract vocabulary items
    const vocabList: any[] = [];
    const vocabRegex = /\{\s*"word"\s*:\s*"([^"]+)"[\s\S]*?"pos"\s*:\s*"([^"]*)"[\s\S]*?"vietnamese"\s*:\s*"([^"]*)"(?:[\s\S]*?"toeic_example"\s*:\s*"([^"]*)")?/gi;
    let vm: RegExpExecArray | null;
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
    const questions: any[] = [];
    const qRegex = /\{\s*"type"\s*:\s*"([^"]+)"[\s\S]*?"question"\s*:\s*"([^"]+)"[\s\S]*?"correct_answer"\s*:\s*"([^"]+)"[\s\S]*?"explanation"\s*:\s*"([^"]*)"/gi;
    let qm: RegExpExecArray | null;
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

