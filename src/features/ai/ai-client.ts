// AI HTTP Client, Vision OCR & Image Preprocessing
import { globalState } from '../../core/state';
import { elements } from '../../core/elements';
import { parseGeminiJsonText } from '../../core/utils/json';
import { mergeOverlappingAiBlocks } from '../ocr/ocr-service';
import { getGeminiGenerateContentUrl } from './ai-config';
import { cancelTranslationFlag } from './story-memory';
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
        try {
            const srcUrl = page.src || URL.createObjectURL(page.file as Blob);
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
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
                page.imageDataCache = data;
                return data;
            }
        } catch (e) { }
    }

    return null;
}

export interface AiFetchOptions {
    apiUrl: string;
    headers: Record<string, string>;
    body: string;
    isOpenAiFormat: boolean;
    timeoutMs?: number;
    maxRetries?: number;
    errorLabel?: string;
}

export async function executeAiJsonRequestWithRetry<T = any>(
    opts: AiFetchOptions,
    parser?: (jsonText: string) => T
): Promise<T> {
    const maxRetries = opts.maxRetries ?? 2;
    const timeoutMs = opts.timeoutMs ?? 120000;
    const errorLabel = opts.errorLabel ?? "AI API";
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (cancelTranslationFlag) break;

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
                throw new Error(errorDetail ? `Lỗi ${errorLabel} (${response.status}): ${errorDetail}` : `Lỗi ${errorLabel}: ${response.status}`);
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

            const isRetryable = fetchErr.name === 'AbortError' || fetchErr.name === 'TimeoutError' ||
                (fetchErr.message && (fetchErr.message.includes('429') || fetchErr.message.includes('503') || fetchErr.message.includes('500') || fetchErr.message.includes('Timeout') || fetchErr.message.includes('aborted') || fetchErr.message.includes('Failed to fetch')));

            if (isRetryable && attempt < maxRetries) {
                const waitSec = (attempt + 1) * 2;
                await new Promise(r => setTimeout(r, waitSec * 1000));
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
    isOpenAiFormat
}: {
    apiUrl: string;
    requestHeaders: Record<string, string>;
    requestBody: string;
    isOpenAiFormat: boolean;
}): Promise<any[]> {
    return executeAiJsonRequestWithRetry<any[]>({
        apiUrl,
        headers: requestHeaders,
        body: requestBody,
        isOpenAiFormat,
        errorLabel: "OCR"
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
    requestHeaders
}: {
    rawBase64: string;
    mimeType: string;
    ocrModel: string;
    keyToUse: string;
    isOpenAiFormat: boolean;
    endpoint: string;
    requestHeaders: Record<string, string>;
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
        "STRICT SEPARATION RULE: Every individual speech bubble must be output as its own separate block with distinct center anchor [x, y].",
        "POSITION FORMULA (Scale 0 to 1000): output 2 integers [x, y] representing the exact CENTER anchor point of the text bubble: x = centerX, y = centerY.",
        "Return valid JSON only matching schema {\"blocks\": [{\"id\": \"b1\", \"type\": \"dialogue\", \"original\": \"...\", \"box\": [500, 300], \"vertical\": true}]}."
    ].join(" ");

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
                        { type: "text", text: "Detect each speech bubble, narration box, thought bubble, and SFX with its 0-1000 center anchor [x, y] coordinates (x = centerX, y = centerY), type ('dialogue'|'narration'|'thought'|'sfx'), and raw original text. Return JSON." },
                        { type: "image_url", image_url: { url: `data:${mimeType};base64,${rawBase64}` } }
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
                    { text: "Detect each speech bubble, narration box, thought bubble, SFX with its 0-1000 integer center [x, y] coordinates (x = centerX, y = centerY), classified type ('dialogue'|'narration'|'thought'|'sfx'), and raw original text. Return JSON." },
                    { inlineData: { mimeType, data: rawBase64 } }
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
                                        items: { type: "NUMBER" }
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
            systemInstruction: {
                parts: [{ text: ocrSystemInstruction }]
            }
        });
    }

    return fetchOCRWithRetry({
        apiUrl,
        requestHeaders,
        requestBody,
        isOpenAiFormat
    });
}
