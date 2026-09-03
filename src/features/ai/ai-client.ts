// AI HTTP Client, Vision OCR & Image Preprocessing
import { globalState } from '../../core/state';
import { elements } from '../../core/elements';
import { parseGeminiJsonText } from '../../core/utils/json';
import { mergeOverlappingAiBlocks } from '../ocr/ocr-service';
import { getGeminiGenerateContentUrl, GEMINI_SAFETY_SETTINGS_BLOCK_NONE } from './ai-config';
import { cancelTranslationFlag } from './story-memory';
import { getAiConfig } from './ai-state';
import { MangaPage } from '../../types/index';

export async function getBase64(file: Blob): Promise<string> {
    try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        let binary = '';

        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }

        return btoa(binary);
    } catch (error: any) {
        throw new Error(`Không thể đọc tệp hình ảnh. Chi tiết: ${error.message}`);
    }
}

export async function enhanceImageForOcr(file: File): Promise<File> {
    if (!file || !globalState.ocrEnhanceEnabled) {
        return file;
    }
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(file);
                return;
            }

            ctx.filter = 'contrast(125%) brightness(102%) grayscale(100%)';
            ctx.drawImage(img, 0, 0);

            canvas.toBlob((blob) => {
                canvas.width = 0;
                canvas.height = 0;
                if (blob) {
                    const enhancedFile = new File([blob], file.name, { type: 'image/jpeg' });
                    resolve(enhancedFile);
                } else {
                    resolve(file);
                }
            }, 'image/jpeg', 0.92);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(file);
        };
        img.src = url;
    });
}

export async function ensurePageImageData(page?: MangaPage): Promise<ImageData | null> {
    if (!page) return null;
    if (page.imageDataCache && page.imageDataCache.data && page.imageDataCache.width > 0) {
        return page.imageDataCache;
    }

    if (globalState.activePageIndex >= 0 && globalState.pages[globalState.activePageIndex] === page) {
        if (elements.mangaCanvas && elements.mangaCanvas.width > 0) {
            try {
                const ctx = elements.mangaCanvas.getContext('2d');
                if (ctx) {
                    const data = ctx.getImageData(0, 0, elements.mangaCanvas.width, elements.mangaCanvas.height);
                    page.imageDataCache = data;
                    return data;
                }
            } catch (e) { }
        }
    }

    if (page.file && typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(page.file);
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(bitmap, 0, 0);
                const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
                page.imageDataCache = data;
                if (typeof bitmap.close === 'function') bitmap.close();
                return data;
            }
        } catch (e) { }
    }

    if (page.src || (page.file && typeof URL !== 'undefined' && URL.createObjectURL)) {
        let createdBlobUrl: string | null = null;
        try {
            const srcUrl = page.src || (createdBlobUrl = URL.createObjectURL(page.file as Blob));
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = srcUrl;
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = reject;
                setTimeout(reject, 8000);
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            let data: ImageData | null = null;
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                data = ctx.getImageData(0, 0, canvas.width, canvas.height);
                page.imageDataCache = data;
            }
            canvas.width = 0;
            canvas.height = 0;
            return data;
        } catch (e) {
        } finally {
            if (createdBlobUrl) {
                URL.revokeObjectURL(createdBlobUrl);
            }
        }
    }

    return null;
}

export interface AiRetryInfo {
    attempt: number;
    maxRetries: number;
    delayMs: number;
    error: any;
    errorLabel: string;
    isRateLimit: boolean;
}

export interface AiFetchOptions {
    apiUrl: string;
    headers: Record<string, string>;
    body: string;
    isOpenAiFormat: boolean;
    timeoutMs?: number;
    maxRetries?: number;
    errorLabel?: string;
    onRetry?: (info: AiRetryInfo) => void;
}

export function isRetryableAiError(error: any, httpStatus?: number): boolean {
    if (!error) return false;

    if (httpStatus !== undefined) {
        if (httpStatus === 429) return true;
        if (httpStatus >= 500 && httpStatus <= 599) return true;
        if (httpStatus === 400 || httpStatus === 401 || httpStatus === 403 || httpStatus === 404) return false;
    }

    const errName = error.name || '';
    if (errName === 'AbortError' || errName === 'TimeoutError') {
        return !cancelTranslationFlag;
    }

    const msg = (error.message || String(error)).toLowerCase();
    if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('resource_exhausted')) {
        return true;
    }
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
        return true;
    }
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('time out') || msg.includes('failed to fetch') || msg.includes('network') || msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('aborted')) {
        return true;
    }
    if (msg.includes('401') || msg.includes('403') || msg.includes('api key') || msg.includes('unauthorized') || msg.includes('forbidden')) {
        return false;
    }

    return false;
}

export async function interruptibleDelay(ms: number): Promise<boolean> {
    const checkInterval = 100;
    let elapsed = 0;
    while (elapsed < ms) {
        if (cancelTranslationFlag) {
            return false;
        }
        const waitTime = Math.min(checkInterval, ms - elapsed);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        elapsed += waitTime;
    }
    return !cancelTranslationFlag;
}

export async function executeAiJsonRequestWithRetry<T = any>(
    opts: AiFetchOptions,
    parser?: (jsonText: string) => T
): Promise<T> {
    const aiConfig = getAiConfig();
    const maxRetries = typeof opts.maxRetries === 'number'
        ? Math.max(0, opts.maxRetries)
        : (typeof aiConfig.maxRetries === 'number' ? Math.max(0, aiConfig.maxRetries) : 3);
    const timeoutMs = opts.timeoutMs ?? 120000;
    const errorLabel = opts.errorLabel ?? "AI API";
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (cancelTranslationFlag) {
            throw new Error("Tiến trình đã bị dừng bởi người dùng.");
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            try { controller.abort(); } catch (e) { }
        }, timeoutMs);

        try {
            const response = await fetch(opts.apiUrl, {
                method: 'POST',
                headers: opts.headers,
                body: opts.body,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorDetail = "";
                try {
                    const errorJson = await response.json();
                    errorDetail = errorJson.error?.message || errorJson.message || "";
                } catch (e) { }

                let contextualHint = "";
                if (response.status === 401 || response.status === 403) {
                    contextualHint = " - API Key không hợp lệ hoặc thiếu quyền";
                } else if (response.status === 429) {
                    contextualHint = " - Đã vượt giới hạn Quota / Rate Limit";
                } else if (response.status === 404) {
                    contextualHint = " - Không tìm thấy Model hoặc Endpoint";
                } else if (response.status >= 500) {
                    contextualHint = " - Máy chủ AI tạm thời quá tải";
                }

                const statusError: any = new Error(
                    errorDetail
                        ? `Lỗi ${errorLabel} (HTTP ${response.status}${contextualHint}): ${errorDetail}`
                        : `Lỗi ${errorLabel}: HTTP ${response.status}${contextualHint}`
                );
                statusError.status = response.status;
                throw statusError;
            }

            const result = await response.json();
            const jsonText = opts.isOpenAiFormat
                ? (result.choices?.[0]?.message?.content || result.choices?.[0]?.text)
                : result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (parser) {
                return parser(jsonText || "");
            }
            return parseGeminiJsonText(jsonText) as T;
        } catch (fetchErr: any) {
            clearTimeout(timeoutId);
            lastError = fetchErr;

            if (cancelTranslationFlag) {
                throw new Error("Tiến trình đã bị dừng bởi người dùng.");
            }

            const httpStatus = fetchErr.status;
            const isRetryable = isRetryableAiError(fetchErr, httpStatus);

            if (isRetryable && attempt < maxRetries) {
                const is429 = httpStatus === 429 || (fetchErr.message && (fetchErr.message.includes('429') || fetchErr.message.includes('quota') || fetchErr.message.includes('rate limit')));
                const jitter = Math.floor(Math.random() * 500);
                const baseDelay = is429
                    ? Math.min(30000, 4000 * Math.pow(2, attempt) + jitter)
                    : Math.min(16000, 2000 * Math.pow(2, attempt) + jitter);

                const retryInfo: AiRetryInfo = {
                    attempt: attempt + 1,
                    maxRetries,
                    delayMs: baseDelay,
                    error: fetchErr,
                    errorLabel,
                    isRateLimit: is429
                };

                if (opts.onRetry) {
                    try {
                        opts.onRetry(retryInfo);
                    } catch (cbErr) {
                        console.warn("Lỗi trong onRetry callback:", cbErr);
                    }
                }

                const completed = await interruptibleDelay(baseDelay);
                if (!completed || cancelTranslationFlag) {
                    throw new Error("Tiến trình đã bị dừng bởi người dùng.");
                }
                continue;
            }

            throw fetchErr;
        }
    }

    throw lastError || new Error(`Không thể hoàn tất ${errorLabel}.`);
}

export async function fetchOCRWithRetry({
    apiUrl,
    requestHeaders,
    requestBody,
    isOpenAiFormat,
    maxRetries,
    onRetry
}: {
    apiUrl: string;
    requestHeaders: Record<string, string>;
    requestBody: string;
    isOpenAiFormat: boolean;
    maxRetries?: number;
    onRetry?: (info: AiRetryInfo) => void;
}): Promise<any[]> {
    return executeAiJsonRequestWithRetry<any[]>({
        apiUrl,
        headers: requestHeaders,
        body: requestBody,
        isOpenAiFormat,
        errorLabel: "OCR",
        maxRetries,
        onRetry
    }, (jsonText) => {
        const data = parseGeminiJsonText(jsonText);
        let rawBlocks: any[] = [];
        if (Array.isArray(data)) {
            rawBlocks = data;
        } else if (data && Array.isArray(data.blocks)) {
            rawBlocks = data.blocks;
        } else if (data && Array.isArray(data.dialogues)) {
            rawBlocks = data.dialogues;
        } else if (data && Array.isArray(data.regions)) {
            rawBlocks = data.regions;
        } else if (data && Array.isArray(data.items)) {
            rawBlocks = data.items;
        }
        return mergeOverlappingAiBlocks(rawBlocks);
    });
}

export async function executeOcrVisionStep({
    rawBase64,
    mimeType,
    ocrModel,
    keyToUse,
    isOpenAiFormat,
    endpoint,
    requestHeaders,
    maxRetries,
    onRetry
}: {
    rawBase64: string;
    mimeType: string;
    ocrModel: string;
    keyToUse: string;
    isOpenAiFormat: boolean;
    endpoint: string;
    requestHeaders: Record<string, string>;
    maxRetries?: number;
    onRetry?: (info: AiRetryInfo) => void;
}): Promise<any[]> {
    const ocrSystemInstruction = [
        "You are an expert manga Vision OCR system specialized in pixel-accurate speech bubble, narration box, thought bubble, and sound effect (SFX) detection.",
        "EXHAUSTIVE OCR COMPLETENESS MANDATE (BẢO TOÀN 100% NỘI DUNG CHỮ, TUYỆT ĐỐI KHÔNG BỎ SÓT):",
        "- Detect, classify, and transcribe 100% of text on this manga page without skipping:",
        "  1. Main dialogue speech bubbles (all bubble styles: round, oval, scream/burst, polygon).",
        "  2. Narration boxes (rectangular captions, exposition boxes, inner monologue text).",
        "  3. Thought bubbles (cloud shapes, dashed/dotted bubbles, bubbles with small circular tail nodes).",
        "  4. Floating / Handwritten / Whisper text outside bubbles.",
        "  5. Multi-column vertical Japanese text (縦書き): Read EVERY column from Right to Left.",
        "  6. Hand-drawn Sound Effects (SFX) and background text signs.",
        "BLOCK TYPE CLASSIFICATION RULE: 'dialogue', 'narration', 'thought', 'sfx'.",
        "MANGA READING ORDER MANDATE: Output blocks in authentic Manga reading order: From Right to Left (RTL) first across columns/panels, then Top to Bottom (TTB) within each column/panel.",
        "STRICT SEPARATION RULE: Every individual speech bubble must be output as its own separate block with distinct center anchor [x, y].",
        "POSITION FORMULA:",
        "Output exactly two integers [x, y] on a 0–1000 coordinate scale.",
        "[x, y] is the center point of the VISIBLE TEXT GLYPHS, not the center of the speech bubble.",
        "Estimate the center of the actual characters:",
        "- For horizontal text, center the entire text line/block.",
        "- For vertical Japanese/Korean/Chinese text, center the entire vertical text column/block.",
        "- Do not use the bubble center when text is offset inside the bubble.",
        "- Do not use the center of the empty bubble area.",
        "- For SFX outside bubbles, use the center of the visible glyphs.",
        "Return valid JSON only matching schema {\"blocks\": [{\"id\": \"b1\", \"type\": \"dialogue\", \"original\": \"...\", \"box\": [500, 300], \"vertical\": true}]}."
    ].join(" ");

    const safeMimeType = mimeType || 'image/png';
    let requestBody: string;
    let apiUrl: string;

    if (isOpenAiFormat) {
        apiUrl = `${endpoint.replace(/\/$/, '')}/chat/completions`;
        requestBody = JSON.stringify({
            model: ocrModel,
            messages: [
                { role: "system", content: ocrSystemInstruction },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Detect each speech bubble, narration box, thought bubble, and SFX with exact 2-integer center coordinates [x, y] of its VISIBLE TEXT GLYPHS on a 0-1000 scale (x = centerX, y = centerY), type ('dialogue'|'narration'|'thought'|'sfx'), and raw original text. Return JSON matching schema: {\"blocks\": [{\"id\": \"b1\", \"type\": \"dialogue\", \"original\": \"...\", \"box\": [x, y], \"vertical\": true}]}." },
                        { type: "image_url", image_url: { url: `data:${safeMimeType};base64,${rawBase64}` } }
                    ]
                }
            ],
            temperature: 0.1,
            max_tokens: 4096,
            response_format: { type: "json_object" }
        });
    } else {
        apiUrl = getGeminiGenerateContentUrl(ocrModel, keyToUse);
        requestBody = JSON.stringify({
            contents: [{
                parts: [
                    { text: "Detect each speech bubble, narration box, thought bubble, SFX with exact 2-integer center coordinates [x, y] of its VISIBLE TEXT GLYPHS on a 0-1000 scale (x = centerX, y = centerY), classified type ('dialogue'|'narration'|'thought'|'sfx'), and raw original text. Return JSON." },
                    { inlineData: { mimeType: safeMimeType, data: rawBase64 } }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                maxOutputTokens: 4096,
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        blocks: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    id: { type: "STRING" },
                                    type: {
                                        type: "STRING",
                                        enum: ["dialogue", "narration", "thought", "sfx"]
                                    },
                                    original: { type: "STRING" },
                                    box: {
                                        type: "ARRAY",
                                        items: { type: "INTEGER" },
                                        minItems: 2,
                                        maxItems: 2,
                                        description: "Exactly two 0-1000 integers [x, y] representing text glyph center (x = centerX, y = centerY)."
                                    },
                                    vertical: { type: "BOOLEAN" }
                                },
                                required: ["id", "type", "original", "box"]
                            }
                        }
                    },
                    required: ["blocks"]
                }
            },
            safetySettings: GEMINI_SAFETY_SETTINGS_BLOCK_NONE,
            systemInstruction: {
                parts: [{ text: ocrSystemInstruction }]
            }
        });
    }

    return fetchOCRWithRetry({
        apiUrl,
        requestHeaders,
        requestBody,
        isOpenAiFormat,
        maxRetries,
        onRetry
    });
}
