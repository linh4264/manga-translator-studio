// 2-Step & Chapter Chunk Translation Pipelines
import { uiUpdateBackgroundTaskOverlay } from '../../core/state';
import { parseGeminiJsonText } from '../../core/utils/json';
import { getGeminiGenerateContentUrl } from './ai-config';
import { executeAiJsonRequestWithRetry, AiRetryInfo } from './ai-client';
import { matchTranslationsToBlocks } from './matching-engine';
import { getTranslationGuidancePrompt } from './prompt-builder';
import { cancelTranslationFlag } from './story-memory';
import { getTranslationContext, TranslationContextOptions } from './ai-state';

export async function executeTextTranslationStep({
    blocksToTranslate,
    translationModel,
    targetLangName,
    prevPageContext,
    glossaryNames,
    keyToUse,
    isOpenAiFormat,
    endpoint,
    requestHeaders,
    contextOptions,
    maxRetries,
    onRetry
}: {
    blocksToTranslate: any[];
    translationModel: string;
    targetLangName: string;
    prevPageContext: string;
    glossaryNames: string;
    keyToUse: string;
    isOpenAiFormat: boolean;
    endpoint: string;
    requestHeaders: Record<string, string>;
    contextOptions?: Partial<TranslationContextOptions>;
    maxRetries?: number;
    onRetry?: (info: AiRetryInfo) => void;
}): Promise<any[]> {
    const ctx = getTranslationContext(contextOptions);
    const targetLang = ctx.targetLanguage || 'vi';
    const pronounTerm = targetLang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';

    const transSystemInstruction = [
        `You are a master manga translator and publication editor specializing in translating Japanese/Korean/Chinese comic dialogues into natural, expressive, and fluent ${targetLangName}.`,
        `SEQUENTIAL DIALOGUE CONTEXT: The input dialogue blocks are arranged in sequential manga reading order (Top-Right to Bottom-Left). Treat them as continuous, interactive conversational turns between characters.`,
        `COMPACT MANGA DIALOGUE: Speech bubble space is limited. Keep ${targetLangName} translations natural, crisp, punchy, and concise.`,
        `Ensure ${pronounTerm} are consistent across the dialogue blocks and faithfully reflect character dynamics.`,
        ctx.preserveNames ? "Keep proper names unchanged unless the glossary says otherwise." : "",
        glossaryNames ? `Keep these names exactly as written: ${glossaryNames}.` : "",
        getTranslationGuidancePrompt(contextOptions).trim(),
        "Strict Rule: Maintain the exact same block IDs. Return valid JSON only with schema: {\"blocks\": [{\"id\": \"...\", \"translated\": \"...\"}]}"
    ].filter(Boolean).join("\n\n");

    const textPayloadList = blocksToTranslate.map(b => ({
        id: b.id,
        original: b.original || ''
    }));

    let requestBody: string;
    let apiUrl: string;

    const userPromptText = [
        `Translate the following manga dialogue blocks into natural ${targetLangName}:`,
        prevPageContext ? `\n${prevPageContext}\n` : '',
        `\nDialogue Blocks to Translate:\n${JSON.stringify(textPayloadList, null, 2)}`
    ].filter(Boolean).join("\n");

    if (isOpenAiFormat) {
        apiUrl = `${endpoint.replace(/\/$/, '')}/chat/completions`;
        requestBody = JSON.stringify({
            model: translationModel,
            messages: [
                { role: "system", content: transSystemInstruction },
                { role: "user", content: userPromptText }
            ],
            temperature: 0.35,
            max_tokens: 16384,
            response_format: { type: "json_object" }
        });
    } else {
        apiUrl = getGeminiGenerateContentUrl(translationModel, keyToUse);
        requestBody = JSON.stringify({
            contents: [{
                parts: [
                    { text: userPromptText }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.35,
                maxOutputTokens: 16384,
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        blocks: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    id: { type: "STRING" },
                                    translated: { type: "STRING" }
                                },
                                required: ["id", "translated"]
                            }
                        }
                    },
                    required: ["blocks"]
                }
            },
            systemInstruction: {
                parts: [{ text: transSystemInstruction }]
            }
        });
    }

    return executeAiJsonRequestWithRetry<any[]>({
        apiUrl,
        headers: requestHeaders,
        body: requestBody,
        isOpenAiFormat,
        errorLabel: "Dịch thuật",
        maxRetries,
        onRetry
    }, (jsonText) => {
        const data = parseGeminiJsonText(jsonText);
        return matchTranslationsToBlocks(blocksToTranslate, data);
    });
}

export async function executeChapterChunkTranslationStep({
    chunkBlocks,
    translationModel,
    targetLangName,
    prevChunkContext = "",
    glossaryNames,
    keyToUse,
    isOpenAiFormat,
    endpoint,
    requestHeaders,
    contextOptions,
    maxRetries,
    onRetry
}: {
    chunkBlocks: any[];
    translationModel: string;
    targetLangName: string;
    prevChunkContext?: string;
    glossaryNames: string;
    keyToUse: string;
    isOpenAiFormat: boolean;
    endpoint: string;
    requestHeaders: Record<string, string>;
    contextOptions?: Partial<TranslationContextOptions>;
    maxRetries?: number;
    onRetry?: (info: AiRetryInfo) => void;
}): Promise<any[]> {
    const ctx = getTranslationContext(contextOptions);
    const targetLang = ctx.targetLanguage || 'vi';
    const pronounTerm = targetLang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';

    const transSystemInstruction = [
        `You are a master manga translator and senior editor specializing in translating entire manga chapters with coherent storytelling, seamless conversational flow, and natural, expressive, publication-grade ${targetLangName} dialogue.`,
        `CHAPTER NARRATIVE CONTEXT: The input dialogues are grouped by page in chronological reading sequence. Maintain consistent character voices across the entire chapter.`,
        `COMPACT MANGA DIALOGUE: Speech bubble space is limited. Keep ${targetLangName} translations natural, punchy, concise, and rhythmically flowing.`,
        `Ensure ${pronounTerm} are 100% consistent across all pages.`,
        ctx.preserveNames ? "Keep proper names unchanged unless the glossary says otherwise." : "",
        glossaryNames ? `Keep these names exactly as written: ${glossaryNames}.` : "",
        getTranslationGuidancePrompt(contextOptions).trim(),
        "Strict Rule: Maintain the exact same block IDs. Return valid JSON only containing all block translations with schema: {\"blocks\": [{\"id\": \"...\", \"translated\": \"...\"}]}"
    ].filter(Boolean).join("\n\n");


    const groupedNarrative: string[] = [];
    let currentPage = -1;
    let pageItems: any[] = [];

    chunkBlocks.forEach(b => {
        if (b.pageIndex !== currentPage) {
            if (pageItems.length > 0) {
                groupedNarrative.push(`[--- TRANG / PAGE ${currentPage + 1} ---]\n` + JSON.stringify(pageItems, null, 2));
            }
            currentPage = b.pageIndex;
            pageItems = [];
        }
        pageItems.push({ id: b.id, original: b.original || '' });
    });
    if (pageItems.length > 0) {
        groupedNarrative.push(`[--- TRANG / PAGE ${currentPage + 1} ---]\n` + JSON.stringify(pageItems, null, 2));
    }

    const userPromptText = [
        `Translate the following full-chapter manga dialogue blocks into natural ${targetLangName}:`,
        prevChunkContext ? `\n${prevChunkContext}\n` : '',
        groupedNarrative.join("\n\n"),
        `\nStrict Requirement: Return a JSON object with schema: {"blocks": [{"id": "...", "translated": "..."}]}`
    ].filter(Boolean).join("\n");

    let requestBody: string;
    let apiUrl: string;

    if (isOpenAiFormat) {
        apiUrl = `${endpoint.replace(/\/$/, '')}/chat/completions`;
        requestBody = JSON.stringify({
            model: translationModel,
            messages: [
                { role: "system", content: transSystemInstruction },
                { role: "user", content: userPromptText }
            ],
            temperature: 0.35,
            max_tokens: 16384,
            response_format: { type: "json_object" }
        });
    } else {
        apiUrl = getGeminiGenerateContentUrl(translationModel, keyToUse);
        requestBody = JSON.stringify({
            contents: [{
                parts: [
                    { text: userPromptText }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.35,
                maxOutputTokens: 16384,
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        blocks: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    id: { type: "STRING" },
                                    translated: { type: "STRING" }
                                },
                                required: ["id", "translated"]
                            }
                        }
                    },
                    required: ["blocks"]
                }
            },
            systemInstruction: {
                parts: [{ text: transSystemInstruction }]
            }
        });
    }

    return executeAiJsonRequestWithRetry<any[]>({
        apiUrl,
        headers: requestHeaders,
        body: requestBody,
        isOpenAiFormat,
        timeoutMs: 180000,
        errorLabel: "Dịch thuật Chapter",
        maxRetries,
        onRetry
    }, (jsonText) => {
        const data = parseGeminiJsonText(jsonText);
        return matchTranslationsToBlocks(chunkBlocks, data);
    });
}

export async function executeChapterTranslationStep({
    allChapterBlocks,
    translationModel,
    targetLangName,
    glossaryNames,
    keyToUse,
    isOpenAiFormat,
    endpoint,
    requestHeaders,
    contextOptions,
    maxRetries,
    onRetry
}: {
    allChapterBlocks: any[];
    translationModel: string;
    targetLangName: string;
    glossaryNames: string;
    keyToUse: string;
    isOpenAiFormat: boolean;
    endpoint: string;
    requestHeaders: Record<string, string>;
    contextOptions?: Partial<TranslationContextOptions>;
    maxRetries?: number;
    onRetry?: (info: AiRetryInfo) => void;
}): Promise<any[]> {
    if (!allChapterBlocks || allChapterBlocks.length === 0) return [];

    const MAX_CHUNK_BLOCKS = 200;

    if (allChapterBlocks.length <= MAX_CHUNK_BLOCKS) {
        return executeChapterChunkTranslationStep({
            chunkBlocks: allChapterBlocks,
            translationModel,
            targetLangName,
            glossaryNames,
            keyToUse,
            isOpenAiFormat,
            endpoint,
            requestHeaders,
            contextOptions,
            maxRetries,
            onRetry
        });
    }

    const chunks: any[][] = [];
    let currentChunk: any[] = [];
    let currentPageIndex = -1;

    for (const block of allChapterBlocks) {
        if (currentChunk.length >= MAX_CHUNK_BLOCKS && block.pageIndex !== currentPageIndex) {
            chunks.push(currentChunk);
            currentChunk = [];
        }
        currentChunk.push(block);
        currentPageIndex = block.pageIndex;
    }
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    const allTranslatedBlocks: any[] = [];
    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        if (cancelTranslationFlag) break;

        const chunk = chunks[cIdx];
        uiUpdateBackgroundTaskOverlay(
            true,
            `Giai đoạn 2/2: Đang dịch Chapter (Nhóm ${cIdx + 1}/${chunks.length})...`,
            `Đang dịch ${chunk.length} câu thoại với ${translationModel}...`,
            Math.round(50 + ((cIdx + 1) / chunks.length) * 45)
        );

        let prevChunkContext = "";
        if (allTranslatedBlocks.length > 0) {
            const recentTranslated = allTranslatedBlocks
                .filter(b => b.translated && b.translated.trim())
                .slice(-8)
                .map(b => `[ID ${b.id}]: "${b.translated}"`)
                .join("\n");
            if (recentTranslated) {
                prevChunkContext = `[PREVIOUS SCENE CONTEXT (FOR NARRATIVE & PRONOUN CONTINUITY)]\n${recentTranslated}`;
            }
        }

        const translatedChunk = await executeChapterChunkTranslationStep({
            chunkBlocks: chunk,
            translationModel,
            targetLangName,
            prevChunkContext,
            glossaryNames,
            keyToUse,
            isOpenAiFormat,
            endpoint,
            requestHeaders,
            contextOptions,
            maxRetries,
            onRetry
        });

        allTranslatedBlocks.push(...translatedChunk);

        if (cIdx < chunks.length - 1 && !cancelTranslationFlag) {
            await new Promise(r => setTimeout(r, 1500));
        }
    }

    return allTranslatedBlocks;
}

