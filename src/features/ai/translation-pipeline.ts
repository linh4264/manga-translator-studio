// 2-Step & Chapter Chunk Translation Pipelines
import { uiUpdateBackgroundTaskOverlay } from '../../core/state';
import { parseGeminiJsonText } from '../../core/utils/json';
import { getGeminiGenerateContentUrl, GEMINI_SAFETY_SETTINGS_BLOCK_NONE } from './ai-config';
import { executeAiJsonRequestWithRetry, AiRetryInfo } from './ai-client';
import { matchTranslationsToBlocks } from './matching-engine';
import { getTranslationGuidancePrompt } from './prompt-builder';
import { cancelTranslationFlag } from './story-memory';
import { getTranslationContext, TranslationContextOptions } from './ai-state';
import { estimateChapterChunkTokens, partitionBlocksByTokenBudget } from './token-estimator';


/**
 * Formats a block payload for AI translation, extracting type, spatial location, and speaker/target.
 * Provides spatial grounding (e.g. Top-Right, Bottom-Left) so Vision models can accurately correlate
 * each text block with its speech bubble on the manga page.
 */
export function formatBlockPayloadForAi(b: any): any {
    const item: any = {
        id: b.id,
        original: b.original || ''
    };
    if (b.type && b.type !== 'dialogue') {
        item.type = b.type;
    }
    const box = b.box;
    if (box) {
        let cx: number | undefined;
        let cy: number | undefined;
        if (Array.isArray(box) && box.length >= 2) {
            cx = box[0];
            cy = box[1];
        } else if (typeof box.x === 'number' && typeof box.y === 'number') {
            cx = box.x + (box.w || 0) / 2;
            cy = box.y + (box.h || 0) / 2;
        }
        if (cx !== undefined && cy !== undefined) {
            const vPos = cy < 350 ? 'Top' : (cy > 650 ? 'Bottom' : 'Middle');
            const hPos = cx < 350 ? 'Left' : (cx > 650 ? 'Right' : 'Center');
            item.location = `${vPos}-${hPos}`;
        }
    }
    if (b.speaker && b.speaker.trim()) item.speaker = b.speaker.trim();
    if (b.target && b.target.trim()) item.target = b.target.trim();
    return item;
}

export function buildMultimodalGroundingInstruction(hasVisualImage: boolean): string {
    if (!hasVisualImage) return "";
    return [
        "MULTIMODAL VISUAL CONTEXT & SCENE GROUNDING:",
        "1. High-resolution image(s) of the manga page(s) are attached. Each dialogue block includes a 'location' (e.g. Top-Right, Middle-Right, Bottom-Left) and optional 'type' ('thought', 'dialogue', 'narration') indicating its position and bubble style on the page.",
        "2. GENDER & RELATIONSHIP INSPECTION: Inspect characters in the scene (hair, school uniforms, skirts, ribbons, facial features, blushing/embarrassment, and body language).",
        "   - SAME-GENDER / SCHOOLGIRL SCENES: If two female students / schoolgirls are speaking or confessing, NEVER use romantic heterosexual pronouns like 'anh - em'! Use natural peer pronouns: 'cậu - tớ', 'mình - bạn', or senior/junior 'chị - em'.",
        "   - MALE-MALE PEERS: Use 'cậu - tớ', 'mày - tao', or 'anh - em' depending on intimacy.",
        "   - Only use 'anh - em' when there is clear visual proof of a heterosexual male-female romance or an older brother/younger sister relationship.",
        "3. THOUGHT vs DIALOGUE BUBBLES: Blocks with type 'thought' or circular/cloud-like floating bubbles without tail pointers are internal monologues or recollections (e.g. remembering a confession 「好き」 ➔ 'Tớ thích cậu...', pondering 「さっきの なんだったんだろう」 ➔ 'Chuyện lúc nãy... rốt cuộc là sao chứ?').",
        "4. NATURAL MANGA CONVERSATIONAL IDIOMS: Translate situational phrases idiomatically into natural publication-grade Vietnamese dialogue (e.g. 「〜そういうことだから」 ➔ 'Vậy... chuyện là thế đấy nhé!' / 'Thế nên là vậy đấy...')."
    ].join("\n");
}

export async function executeTextTranslationStep({
    blocksToTranslate,
    translationModel,
    targetLangName,
    prevPageContext = "",
    glossaryNames,
    keyToUse,
    isOpenAiFormat,
    endpoint,
    requestHeaders,
    contextOptions,
    rawBase64,
    mimeType = 'image/jpeg',
    maxRetries,
    onRetry
}: {
    blocksToTranslate: any[];
    translationModel: string;
    targetLangName: string;
    prevPageContext?: string;
    glossaryNames: string;
    keyToUse: string;
    isOpenAiFormat: boolean;
    endpoint: string;
    requestHeaders: Record<string, string>;
    contextOptions?: Partial<TranslationContextOptions>;
    rawBase64?: string;
    mimeType?: string;
    maxRetries?: number;
    onRetry?: (info: AiRetryInfo) => void;
}): Promise<any[]> {
    const ctx = getTranslationContext(contextOptions);
    const targetLang = ctx.targetLanguage || 'vi';
    const pronounTerm = targetLang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';
    const hasVisualImage = Boolean(rawBase64 && rawBase64.trim());
    const multimodalGuidance = buildMultimodalGroundingInstruction(hasVisualImage);

    const transSystemInstruction = [
        `You are a master manga translator and publication editor specializing in translating Japanese/Korean/Chinese comic dialogues into natural, expressive, and fluent ${targetLangName}.`,
        `SEQUENTIAL DIALOGUE CONTEXT: The input dialogue blocks are arranged in sequential manga reading order (Top-Right to Bottom-Left). Treat them as continuous, interactive conversational turns between characters.`,
        multimodalGuidance,
        `COMPACT MANGA DIALOGUE: Speech bubble space is limited. Keep ${targetLangName} translations natural, crisp, punchy, and concise without sacrificing core meaning. Translate directly for speech bubbles without verbose exposition or internal monologue.`,
        `Maintain stable default ${pronounTerm} pairs across dialogue blocks, allowing natural shifts when emotions or relationship dynamics change.`,
        ctx.preserveNames ? "Keep proper names unchanged unless the glossary says otherwise." : "",
        glossaryNames ? `Keep these names exactly as written: ${glossaryNames}.` : "",
        getTranslationGuidancePrompt(contextOptions).trim(),
        "Strict Rule: Maintain the exact same block IDs. Each translation must be a single complete sentence/paragraph without arbitrary newline characters (\\n). Return valid JSON only with schema: {\"blocks\": [{\"id\": \"...\", \"translated\": \"...\"}]}"
    ].filter(Boolean).join("\n\n");

    const textPayloadList = blocksToTranslate.map(formatBlockPayloadForAi);

    let requestBody: string;
    let apiUrl: string;

    if (isOpenAiFormat) {
        apiUrl = `${endpoint.replace(/\/$/, '')}/chat/completions`;
        const openAiContent: any[] = [];
        if (prevPageContext) {
            openAiContent.push({ type: "text", text: prevPageContext });
        }
        openAiContent.push({
            type: "text",
            text: `Translate the following manga dialogue blocks into natural ${targetLangName}:`
        });
        if (hasVisualImage) {
            openAiContent.push({
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${rawBase64}` }
            });
        }
        openAiContent.push({
            type: "text",
            text: `Dialogue blocks to translate:\n${JSON.stringify(textPayloadList, null, 2)}\n\nStrict Requirement: Return JSON only matching schema: {"blocks": [{"id": "...", "translated": "..."}]}`
        });

        requestBody = JSON.stringify({
            model: translationModel,
            messages: [
                { role: "system", content: transSystemInstruction },
                { role: "user", content: openAiContent }
            ],
            temperature: 0.6,
            max_tokens: 16384,
            response_format: { type: "json_object" }
        });
    } else {
        apiUrl = getGeminiGenerateContentUrl(translationModel, keyToUse);
        const isLegacyGemini15 = translationModel.includes('1.5');
        const maxOutputTokens = isLegacyGemini15 ? 8192 : 65536;

        const geminiParts: any[] = [];
        if (prevPageContext) {
            geminiParts.push({ text: prevPageContext });
        }
        geminiParts.push({
            text: `Translate the following manga dialogue blocks into natural ${targetLangName}. Refer to the attached page image for character, emotional, and social context:`
        });
        if (hasVisualImage) {
            geminiParts.push({
                inlineData: {
                    mimeType: mimeType || 'image/jpeg',
                    data: rawBase64
                }
            });
        }
        geminiParts.push({
            text: `Dialogue blocks to translate:\n${JSON.stringify(textPayloadList, null, 2)}\n\nStrict Requirement: Return JSON only matching schema: {"blocks": [{"id": "...", "translated": "..."}]}`
        });

        requestBody = JSON.stringify({
            contents: [{ parts: geminiParts }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.6,
                maxOutputTokens,
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
            safetySettings: GEMINI_SAFETY_SETTINGS_BLOCK_NONE,
            systemInstruction: {
                parts: [{ text: transSystemInstruction }]
            }
        });
    }

    const translatedBlocks = await executeAiJsonRequestWithRetry<any[]>({
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

    return translatedBlocks;
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
    pageImagesMap,
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
    pageImagesMap?: Map<number, string>;
    maxRetries?: number;
    onRetry?: (info: AiRetryInfo) => void;
}): Promise<any[]> {
    const ctx = getTranslationContext(contextOptions);
    const targetLang = ctx.targetLanguage || 'vi';
    const pronounTerm = targetLang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';

    // Group blocks by pageIndex to pair each page with its visual context
    interface PageChunkGroup {
        pageIndex: number;
        items: any[];
    }
    const pageGroups: PageChunkGroup[] = [];
    let currentGroup: PageChunkGroup | null = null;

    chunkBlocks.forEach(b => {
        if (!currentGroup || currentGroup.pageIndex !== b.pageIndex) {
            currentGroup = { pageIndex: b.pageIndex, items: [] };
            pageGroups.push(currentGroup);
        }
        currentGroup.items.push(formatBlockPayloadForAi(b));
    });

    const hasMultimodalImages = Boolean(
        pageImagesMap &&
        pageImagesMap.size > 0 &&
        pageGroups.some(g => pageImagesMap.has(g.pageIndex))
    );

    const multimodalGuidance = buildMultimodalGroundingInstruction(hasMultimodalImages);

    const transSystemInstruction = [
        `You are a master manga translator and senior editor specializing in translating entire manga chapters with coherent storytelling, seamless conversational flow, and natural, expressive, publication-grade ${targetLangName} dialogue.`,
        `CHAPTER NARRATIVE CONTEXT: The input dialogues are grouped by page in chronological reading sequence. Maintain consistent character voices across the entire chapter.`,
        multimodalGuidance,
        `COMPACT MANGA DIALOGUE: Speech bubble space is limited. Keep ${targetLangName} translations natural, punchy, concise, and rhythmically flowing without sacrificing core meaning. Translate directly for speech bubbles without verbose exposition or internal monologue.`,
        `Maintain stable default ${pronounTerm} pairs across pages, while allowing natural shifts when character emotions or relationships evolve.`,
        ctx.preserveNames ? "Keep proper names unchanged unless the glossary says otherwise." : "",
        glossaryNames ? `Keep these names exactly as written: ${glossaryNames}.` : "",
        getTranslationGuidancePrompt(contextOptions).trim(),
        "Strict Rule: Maintain the exact same block IDs. Each translation must be a single complete sentence/paragraph without arbitrary newline characters (\\n). Return valid JSON only containing all block translations with schema: {\"blocks\": [{\"id\": \"...\", \"translated\": \"...\"}]}"
    ].filter(Boolean).join("\n\n");

    let requestBody: string;
    let apiUrl: string;

    if (isOpenAiFormat) {
        apiUrl = `${endpoint.replace(/\/$/, '')}/chat/completions`;
        let openAiUserContent: any;

        if (hasMultimodalImages) {
            const parts: any[] = [];
            if (prevChunkContext) {
                parts.push({ type: "text", text: prevChunkContext });
            }
            parts.push({
                type: "text",
                text: `Translate the following manga dialogue blocks into natural ${targetLangName}. Refer to each page's attached visual image for character and conversational context:`
            });
            for (const group of pageGroups) {
                const pageNum = group.pageIndex + 1;
                const imgB64 = pageImagesMap?.get(group.pageIndex);
                parts.push({ type: "text", text: `=== [TRANG / PAGE ${pageNum}] ===` });
                if (imgB64) {
                    parts.push({
                        type: "image_url",
                        image_url: { url: `data:image/jpeg;base64,${imgB64}` }
                    });
                }
                parts.push({
                    type: "text",
                    text: `Dialogue blocks in Page ${pageNum} to translate:\n${JSON.stringify(group.items, null, 2)}`
                });
            }
            parts.push({
                type: "text",
                text: `\nStrict Requirement: Return a JSON object with schema: {"blocks": [{"id": "...", "translated": "..."}]}`
            });
            openAiUserContent = parts;
        } else {
            const userPromptText = [
                `Translate the following full-chapter manga dialogue blocks into natural ${targetLangName}:`,
                prevChunkContext ? `\n${prevChunkContext}\n` : '',
                pageGroups.map(g => `[--- TRANG / PAGE ${g.pageIndex + 1} ---]\n` + JSON.stringify(g.items, null, 2)).join("\n\n"),
                `\nStrict Requirement: Return a JSON object with schema: {"blocks": [{"id": "...", "translated": "..."}]}`
            ].filter(Boolean).join("\n");
            openAiUserContent = userPromptText;
        }

        requestBody = JSON.stringify({
            model: translationModel,
            messages: [
                { role: "system", content: transSystemInstruction },
                { role: "user", content: openAiUserContent }
            ],
            temperature: 0.6,
            max_tokens: 16384,
            response_format: { type: "json_object" }
        });
    } else {
        apiUrl = getGeminiGenerateContentUrl(translationModel, keyToUse);
        const geminiParts: any[] = [];

        if (hasMultimodalImages) {
            if (prevChunkContext) {
                geminiParts.push({ text: prevChunkContext });
            }
            geminiParts.push({
                text: `Translate the following manga dialogue blocks into natural ${targetLangName}. Refer to each page's attached visual image for character, emotional, and social context:`
            });
            for (const group of pageGroups) {
                const pageNum = group.pageIndex + 1;
                const imgB64 = pageImagesMap?.get(group.pageIndex);
                geminiParts.push({
                    text: `=== [TRANG / PAGE ${pageNum}] ===`
                });
                if (imgB64) {
                    geminiParts.push({
                        inlineData: {
                            mimeType: "image/jpeg",
                            data: imgB64
                        }
                    });
                }
                geminiParts.push({
                    text: `Dialogue blocks in Page ${pageNum} to translate:\n${JSON.stringify(group.items, null, 2)}`
                });
            }
            geminiParts.push({
                text: `\nStrict Requirement: Return a JSON object with schema: {"blocks": [{"id": "...", "translated": "..."}]}`
            });
        } else {
            const userPromptText = [
                `Translate the following full-chapter manga dialogue blocks into natural ${targetLangName}:`,
                prevChunkContext ? `\n${prevChunkContext}\n` : '',
                pageGroups.map(g => `[--- TRANG / PAGE ${g.pageIndex + 1} ---]\n` + JSON.stringify(g.items, null, 2)).join("\n\n"),
                `\nStrict Requirement: Return a JSON object with schema: {"blocks": [{"id": "...", "translated": "..."}]}`
            ].filter(Boolean).join("\n");
            geminiParts.push({ text: userPromptText });
        }

        const isLegacyGemini15 = translationModel.includes('1.5');
        const maxOutputTokens = isLegacyGemini15 ? 8192 : 65536;

        requestBody = JSON.stringify({
            contents: [{
                parts: geminiParts
            }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.6,
                maxOutputTokens,
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
            safetySettings: GEMINI_SAFETY_SETTINGS_BLOCK_NONE,
            systemInstruction: {
                parts: [{ text: transSystemInstruction }]
            }
        });
    }

    const translatedChunkBlocks = await executeAiJsonRequestWithRetry<any[]>({
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

    return translatedChunkBlocks;
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
    pageImagesMap,
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
    pageImagesMap?: Map<number, string>;
    maxRetries?: number;
    onRetry?: (info: AiRetryInfo) => void;
}): Promise<any[]> {
    if (!allChapterBlocks || allChapterBlocks.length === 0) return [];

    // Model-aware dynamic token budget:
    // Lite models (4,096 token limit) receive 1,800 token budget (~45-55 blocks) to prevent truncation.
    // Standard models receive 2,200 token budget.
    const chunks = partitionBlocksByTokenBudget(allChapterBlocks, translationModel);

    const allTranslatedBlocks: any[] = [];
    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        if (cancelTranslationFlag) break;

        const chunk = chunks[cIdx];
        const chunkPageIndices = new Set(chunk.map((b: any) => b.pageIndex));
        const chunkMetrics = estimateChapterChunkTokens(chunk, chunkPageIndices.size);

        const chunkTitle = chunks.length > 1
            ? `Giai đoạn 2/2: Đang dịch Chapter (Nhóm ${cIdx + 1}/${chunks.length})...`
            : "Giai đoạn 2/2: Đang dịch toàn bộ Chapter...";

        const initialDetail = `Đang dịch ${chunk.length} câu thoại (~${chunkMetrics.predictedOutputTokens.toLocaleString()} tokens • Ước tính ~${chunkMetrics.estimatedDurationSec}s)...`;
        const initialProgress = Math.round(50 + ((cIdx + 0.1) / chunks.length) * 45);

        uiUpdateBackgroundTaskOverlay(true, chunkTitle, initialDetail, initialProgress);

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

        // Live Heartbeat Timer: Updates the UI every second with active runtime
        const startTime = Date.now();
        const timer = setInterval(() => {
            if (cancelTranslationFlag) {
                clearInterval(timer);
                return;
            }
            const elapsedSec = Math.round((Date.now() - startTime) / 1000);
            const liveProgress = Math.round(50 + ((cIdx + Math.min(0.9, elapsedSec / Math.max(10, chunkMetrics.estimatedDurationSec))) / chunks.length) * 45);
            uiUpdateBackgroundTaskOverlay(
                true,
                chunkTitle,
                `Đang dịch ${chunk.length} câu thoại (~${chunkMetrics.predictedOutputTokens.toLocaleString()} tokens • Ước tính ~${chunkMetrics.estimatedDurationSec}s) • Đang xử lý: ${elapsedSec}s...`,
                liveProgress
            );
        }, 1000);

        try {
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
                pageImagesMap,
                maxRetries,
                onRetry
            });

            // Auto-Rescue: Detect any blocks in this chunk that were cut off or left blank by the AI
            const missingBlocks = chunk.filter(origB => {
                const found = translatedChunk.find(t => String(t.id).toLowerCase() === String(origB.id).toLowerCase());
                return !found || !found.translated || !found.translated.trim();
            });

            if (missingBlocks.length > 0 && !cancelTranslationFlag) {
                console.warn(`[Auto-Rescue] Phát hiện ${missingBlocks.length} câu thoại bị thiếu/cắt đuôi trong Nhóm ${cIdx + 1}. Đang tự động cứu hộ...`);
                uiUpdateBackgroundTaskOverlay(
                    true,
                    `Giai đoạn 2/2: Đang cứu hộ ${missingBlocks.length} câu thoại bị thiếu...`,
                    `Đang dịch bù các câu bị đứt đuôi JSON để đảm bảo không bị ô thoại trắng...`,
                    Math.round(50 + ((cIdx + 0.95) / chunks.length) * 45)
                );
                try {
                    const rescueResult = await executeTextTranslationStep({
                        blocksToTranslate: missingBlocks,
                        translationModel,
                        targetLangName,
                        prevPageContext: prevChunkContext,
                        glossaryNames,
                        keyToUse,
                        isOpenAiFormat,
                        endpoint,
                        requestHeaders,
                        contextOptions,
                        maxRetries: 2
                    });
                    const rescueMap = new Map<string, string>();
                    rescueResult.forEach(rb => {
                        if (rb && rb.id && rb.translated) {
                            rescueMap.set(String(rb.id).toLowerCase(), rb.translated);
                        }
                    });
                    translatedChunk.forEach(b => {
                        if (!b.translated || !b.translated.trim()) {
                            const rescued = rescueMap.get(String(b.id).toLowerCase());
                            if (rescued) {
                                b.translated = rescued;
                            }
                        }
                    });
                } catch (rescueErr) {
                    console.warn("Lỗi khi tự động cứu hộ câu thoại:", rescueErr);
                }
            }

            allTranslatedBlocks.push(...translatedChunk);
        } finally {
            clearInterval(timer);
        }

        if (cIdx < chunks.length - 1 && !cancelTranslationFlag) {
            await new Promise(r => setTimeout(r, 1500));
        }
    }

    return allTranslatedBlocks;
}

