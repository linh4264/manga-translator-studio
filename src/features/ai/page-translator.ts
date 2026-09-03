// Single-Page and Full-Chapter Batch Translation Orchestration
import {
    globalState,
    pushStateToHistory,
    savePageToDB,
    activatePage,
    deactivatePage,
    garbageCollectPageCaches,
    uiUpdatePageListUI,
    uiUpdateProcessingOverlay,
    uiUpdateBackgroundTaskOverlay,
    uiUpdateActiveBlockEditor
} from '../../core/state';
import {
    DEFAULT_AI_BLOCK_BOX,
    TARGET_LANG_MAP
} from '../../config/constants';
import { elements } from '../../core/elements';
import { showToast } from '../../core/utils';
import { refineAiBlockBox, mergeOverlappingAiBlocks, extractTextAnchor, sortMangaReadingOrder } from '../ocr/ocr-service';
import { requestOverlayRender, autoMatchBlockStyle, autoFitBlock, isBlockAutoFit, getReferenceDisplayDimensions } from '../canvas/canvas-service';
import { getConfiguredApiEndpoint, getGeminiGenerateContentUrl, GEMINI_SAFETY_SETTINGS_BLOCK_NONE } from './ai-config';
import {
    cancelTranslationFlag,
    isBatchTranslating,
    setCancelTranslationFlag,
    setIsBatchTranslating,
    getGeminiApiKey,
    getDefaultFontForBlockType,
    recordPageToStoryMemory
} from './story-memory';
import { getTranslationGuidancePrompt } from './prompt-builder';
import {
    getBase64,
    enhanceImageForOcr,
    ensurePageImageData,
    executeAiJsonRequestWithRetry,
    executeOcrVisionStep,
    AiRetryInfo
} from './ai-client';
import { executeTextTranslationStep, executeChapterTranslationStep } from './translation-pipeline';
import { getAiConfig, getTranslationContext } from './ai-state';
import { analytics } from '../../core/analytics';


export async function translateActivePage(force: boolean = false): Promise<void> {
    if (globalState.activePageIndex === -1) {
        showToast("Vui lòng chọn một trang trước khi dịch.", "warn");
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    if (page && !force && page.status !== 'error' && (page.status === 'done' || (page.blocks && page.blocks.length > 0 && page.blocks.some(b => b.translated && b.translated.trim())))) {
        showToast(`Trang ${globalState.activePageIndex + 1} đã được dịch hoàn tất! Giữ nguyên toàn bộ vị trí ô thoại.`, "info");
        return;
    }

    await translatePage(globalState.activePageIndex, false, force);
}

export async function translateSinglePageInBatch(index: number, force: boolean = false): Promise<void> {
    if (isBatchTranslating) {
        showToast("Tiến trình dịch hàng loạt đang chạy. Vui lòng dừng hoặc chờ hoàn tất trước.", "warn");
        return;
    }

    const page = globalState.pages[index];
    if (page && !force && page.status !== 'error' && (page.status === 'done' || (page.blocks && page.blocks.length > 0 && page.blocks.some(b => b.translated && b.translated.trim())))) {
        showToast(`Trang ${index + 1} đã được dịch hoàn tất! Giữ nguyên toàn bộ vị trí ô thoại.`, "info");
        return;
    }

    await translatePage(index, true, force);
}

export async function translatePage(pageIndex: number, isBackgroundMode: boolean = false, force: boolean = false): Promise<boolean> {
    if (pageIndex < 0 || pageIndex >= globalState.pages.length) return false;
    const page = globalState.pages[pageIndex];

    // If page is already translated and has valid translated blocks, do not re-run or overwrite positions unless forced
    const isAlreadyTranslated = (page.status === 'done' || (page.blocks && page.blocks.length > 0 && page.blocks.some(b => b.translated && b.translated.trim())));
    if (isAlreadyTranslated && !force && page.status !== 'error') {
        page.status = 'done';
        savePageToDB(page);
        uiUpdatePageListUI();
        showToast(`Trang ${pageIndex + 1} đã được dịch hoàn tất! Giữ nguyên toàn bộ vị trí ô thoại.`, "info");
        return true;
    }

    await activatePage(page);


    const aiConfig = getAiConfig();
    const ctx = getTranslationContext();
    const provider = aiConfig.aiProvider;
    const keyToUse = aiConfig.apiKey || (provider === 'custom' ? 'local' : '');
    if (!keyToUse && provider !== 'custom') {
        showToast("Vui lòng nhập Gemini API Key trước khi dịch.", "error");
        if (elements.apiKeyInput) elements.apiKeyInput.focus();
        return false;
    }

    const totalPages = globalState.pages.length;
    const progressVal = Math.round((pageIndex / totalPages) * 100);

    page.status = 'processing';
    uiUpdatePageListUI();
    savePageToDB(page);

    const updateProgressMsg = (title: string, subtitle: string, percent: number) => {
        if (isBackgroundMode) {
            uiUpdateBackgroundTaskOverlay(true, title, subtitle, percent);
        } else {
            uiUpdateProcessingOverlay(true, title, subtitle, percent);
        }
    };

    const handleRetry = (info: AiRetryInfo) => {
        const delaySec = Math.max(1, Math.round(info.delayMs / 1000));
        const reason = info.isRateLimit
            ? "API quá tải / chạm hạn mức (429)"
            : (info.error?.message?.includes("Timeout") || info.error?.name === 'TimeoutError'
                ? "Quá hạn (Timeout)"
                : (info.error?.status ? `Lỗi máy chủ (${info.error.status})` : "Lỗi mạng"));

        showToast(
            `Trang ${pageIndex + 1}: ${reason}. Tự động thử lại (${info.attempt}/${info.maxRetries}) sau ${delaySec}s...`,
            "warn"
        );

        updateProgressMsg(
            `Đang tự động kết nối lại (${info.attempt}/${info.maxRetries})...`,
            `${info.errorLabel}: ${reason}. Tạm nghỉ ${delaySec}s để gửi lại...`,
            isBackgroundMode ? progressVal : 50
        );
    };

    updateProgressMsg(
        "Đang nhận diện & dịch...",
        `Trang ${pageIndex + 1}/${totalPages}: Đang đọc ảnh thô...`,
        isBackgroundMode ? progressVal : 20
    );

    let activeStep = "Xử lý ảnh ban đầu";

    try {
        if (cancelTranslationFlag) {
            page.status = 'draft';
            uiUpdatePageListUI();
            savePageToDB(page);
            return false;
        }

        const pageFile = (page.file || page.originalFile) as File;
        const fileForOcr = ctx.ocrEnhanceEnabled ? await enhanceImageForOcr(pageFile) : pageFile;
        const rawBase64 = await getBase64(fileForOcr);
        const mimeType = fileForOcr.type || pageFile.type || 'image/png';
        const targetLang = ctx.targetLanguage || 'vi';
        const targetLangName = TARGET_LANG_MAP[targetLang] || 'Vietnamese';
        const glossaryNames = ctx.preserveNames ? (ctx.glossaryNames || '').trim() : "";

        let prevPageContext = "";
        if (pageIndex > 0) {
            const prevPage = globalState.pages[pageIndex - 1];
            if (prevPage && prevPage.blocks && prevPage.blocks.length > 0) {
                const prevDialogues = prevPage.blocks
                    .filter(b => b.translated && b.translated.trim())
                    .map((b, idx) => {
                        const hasSpeaker = Boolean(b.speaker && b.speaker.trim());
                        const hasTarget = Boolean(b.target && b.target.trim());
                        if (hasSpeaker || hasTarget) {
                            const lines: string[] = [];
                            lines.push(`- Speaker: ${b.speaker?.trim() || 'Unknown'}`);
                            if (hasTarget) lines.push(`  Target: ${b.target?.trim()}`);
                            if (b.original && b.original.trim()) {
                                lines.push(`  Original: ${b.original.trim()}`);
                            }
                            lines.push(`  Translation: ${b.translated.trim()}`);
                            return lines.join("\n");
                        }
                        return `Bubble #${idx + 1}: "${b.translated.trim()}"`;
                    })
                    .join("\n\n");
                if (prevDialogues) prevPageContext = `[PREVIOUS PAGE DIALOGUE HISTORY]\n${prevDialogues}`;
            }
        }

        const pipelineMode = ctx.translationPipelineMode;
        const ocrModelToUse = aiConfig.ocrModel;
        const transModelToUse = aiConfig.translationModel;
        const endpoint = getConfiguredApiEndpoint();
        const isOpenAiFormat = provider === 'openai' || (provider === 'custom' && !endpoint.includes('generateContent'));
        const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (isOpenAiFormat && keyToUse) {
            requestHeaders['Authorization'] = `Bearer ${keyToUse}`;
        }

        const hasExistingBlocks = page.blocks && page.blocks.length > 0 && page.blocks.some(b => b.original && b.original.trim());
        let finalBlocks: any[] = [];

        if (pipelineMode === 'two-step') {
            let detectedRawBlocks: any[] = [];

            if (hasExistingBlocks) {
                detectedRawBlocks = page.blocks;
            } else {
                activeStep = "Quét OCR phát hiện thoại";
                updateProgressMsg(
                    "Bước 1/2: Đang quét khung thoại & chữ gốc...",
                    `Trang ${pageIndex + 1}/${totalPages}: Sử dụng ${ocrModelToUse} (Vision)...`,
                    isBackgroundMode ? progressVal : 35
                );

                analytics.trackOCR(isBackgroundMode ? 'batch' : 'single');
                detectedRawBlocks = await executeOcrVisionStep({
                    rawBase64,
                    mimeType,
                    ocrModel: ocrModelToUse,
                    keyToUse,
                    isOpenAiFormat,
                    endpoint,
                    requestHeaders,
                    onRetry: handleRetry
                });
            }

            if (!detectedRawBlocks || detectedRawBlocks.length === 0) {
                finalBlocks = [];
            } else {
                const sortedRawBlocks = sortMangaReadingOrder(detectedRawBlocks);
                detectedRawBlocks = sortedRawBlocks.map((b, bIdx) => ({
                    ...b,
                    id: `p${pageIndex + 1}_b${bIdx + 1}`
                }));

                activeStep = "Dịch ngữ cảnh văn học";
                updateProgressMsg(
                    "Bước 2/2: Đang dịch ngữ cảnh văn học...",
                    `Trang ${pageIndex + 1}/${totalPages}: Sử dụng ${transModelToUse} (Text Only)...`,
                    isBackgroundMode ? progressVal : 70
                );

                finalBlocks = await executeTextTranslationStep({
                    blocksToTranslate: detectedRawBlocks,
                    translationModel: transModelToUse,
                    targetLangName,
                    prevPageContext,
                    glossaryNames,
                    keyToUse,
                    isOpenAiFormat,
                    endpoint,
                    requestHeaders,
                    contextOptions: ctx,
                    onRetry: handleRetry
                });
            }

        } else {
            const pronounTerm = targetLang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';

            const systemInstruction = [
                "Detect every manga speech bubble, narration box, thought bubble, and SFX label, classify its block type ('dialogue'|'narration'|'thought'|'sfx'), then return JSON only.",
                "EXHAUSTIVE OCR COMPLETENESS MANDATE (BẢO TOÀN 100% NỘI DUNG CHỮ, TUYỆT ĐỐI KHÔNG BỎ SÓT):",
                "- Detect and transcribe 100% of text on this manga page without skipping.",
                "POSITION FORMULA:",
                "Output exactly two integers [x, y] on a 0–1000 coordinate scale.",
                "[x, y] is the center point of the VISIBLE TEXT GLYPHS, not the center of the speech bubble.",
                "Estimate the center of the actual characters:",
                "- For horizontal text, center the entire text line/block.",
                "- For vertical Japanese/Korean/Chinese text, center the entire vertical text column/block.",
                "- Do not use the bubble center when text is offset inside the bubble.",
                "- Do not use the center of the empty bubble area.",
                "- For SFX outside bubbles, use the center of the visible glyphs.",
                "- TEXT FORMAT: Keep translated text natural. The layout engine automatically wraps lines to fit the speech bubble.",
                `Translate to short, natural ${targetLangName} that matches the scene and speaker relationship.`,
                `Maintain character voice, ${pronounTerm} consistency, and terminology across the page, allowing natural shifts if emotions or interpersonal dynamics change.`,
                ctx.preserveNames ? "Keep proper names unchanged unless the glossary says otherwise." : "",
                glossaryNames ? `Keep these names exactly as written: ${glossaryNames}.` : "",
                getTranslationGuidancePrompt(ctx).trim()
            ].filter(Boolean).join("\n\n");

            const selectedModel = aiConfig.selectedModel;
            let apiUrl = '';
            let requestBody = '';

            if (isOpenAiFormat) {
                apiUrl = `${endpoint.replace(/\/$/, '')}/chat/completions`;
                const openAiUserContent: any[] = [
                    { type: "text", text: `Detect each speech bubble, narration box, thought bubble, and SFX with exact 2-integer center coordinates [x, y] of its VISIBLE TEXT GLYPHS on a 0-1000 scale (x = centerX, y = centerY) and type ('dialogue'|'narration'|'thought'|'sfx'). Translate their contents into ${targetLangName}. Return JSON matching schema: {"blocks": [{"id": "b1", "type": "dialogue", "original": "...", "translated": "...", "box": [x, y], "vertical": true}]}.` },
                    { type: "image_url", image_url: { url: `data:${mimeType};base64,${rawBase64}` } }
                ];
                if (prevPageContext) {
                    openAiUserContent.splice(1, 0, { type: "text", text: prevPageContext });
                }

                requestBody = JSON.stringify({
                    model: selectedModel,
                    messages: [
                        { role: "system", content: systemInstruction },
                        { role: "user", content: openAiUserContent }
                    ],
                    temperature: 0.3,
                    max_tokens: 4096,
                    response_format: { type: "json_object" }
                });
            } else {
                apiUrl = getGeminiGenerateContentUrl(selectedModel, keyToUse);
                const contentsParts: any[] = [
                    { text: `Detect each speech bubble, narration box, thought bubble, and SFX with exact 2-integer center coordinates [x, y] of its VISIBLE TEXT GLYPHS on a 0-1000 scale (x = centerX, y = centerY) and type ('dialogue'|'narration'|'thought'|'sfx'). Translate their contents into ${targetLangName}. Return JSON.` }
                ];
                if (prevPageContext) {
                    contentsParts.push({ text: prevPageContext });
                }
                contentsParts.push({ inlineData: { mimeType: mimeType, data: rawBase64 } });

                requestBody = JSON.stringify({
                    contents: [{ parts: contentsParts }],
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
                                            translated: { type: "STRING" },
                                            box: {
                                                type: "ARRAY",
                                                items: { type: "INTEGER" },
                                                minItems: 2,
                                                maxItems: 2,
                                                description: "Exactly two 0-1000 integers [x, y] representing text glyph center (x = centerX, y = centerY)."
                                            },
                                            vertical: { type: "BOOLEAN" }
                                        },
                                        required: ["id", "type", "original", "translated", "box"]
                                    }
                                }
                            },
                            required: ["blocks"]
                        }
                    },
                    safetySettings: GEMINI_SAFETY_SETTINGS_BLOCK_NONE,
                    systemInstruction: {
                        parts: [{ text: systemInstruction }]
                    }
                });
            }

            activeStep = "Dịch toàn diện trực tiếp";
            const data = await executeAiJsonRequestWithRetry({
                apiUrl,
                headers: requestHeaders,
                body: requestBody,
                isOpenAiFormat,
                errorLabel: "Dịch trang",
                onRetry: handleRetry
            });

            if (!data || !Array.isArray(data.blocks)) {
                throw new Error("Phản hồi từ AI bị lỗi định dạng JSON hoặc bị ngắt câu.");
            }
            finalBlocks = mergeOverlappingAiBlocks(data.blocks);
        }

        activeStep = "Bố cục & Canh chỉnh bong bóng";
        updateProgressMsg(
            "Đang dựng bản dịch...",
            `Trang ${pageIndex + 1}/${totalPages}: Đang tính toán tỷ lệ bong bóng thoại...`,
            isBackgroundMode ? progressVal : 85
        );

        const pageImageData = await ensurePageImageData(page);

        pushStateToHistory();

        const imgEl = elements.mangaBgImage;
        const imgW = (pageImageData && pageImageData.width > 0)
            ? pageImageData.width
            : ((imgEl && imgEl.naturalWidth > 0 && pageIndex === globalState.activePageIndex) ? imgEl.naturalWidth : 800);
        const imgH = (pageImageData && pageImageData.height > 0)
            ? pageImageData.height
            : ((imgEl && imgEl.naturalHeight > 0 && pageIndex === globalState.activePageIndex) ? imgEl.naturalHeight : 1200);

        const isVerticalTarget = ['ja', 'zh', 'ko'].includes(targetLang);
        page.blocks = (finalBlocks || []).map((b, idx) => {
            const blockType = b.type || 'dialogue';
            const textAnchor = b.textAnchor || extractTextAnchor(b.box);

            let normalisedBox = b.box;
            if (!hasExistingBlocks) {
                normalisedBox = b.positionKnown === false
                    ? { ...DEFAULT_AI_BLOCK_BOX }
                    : refineAiBlockBox(b.box, pageImageData, globalState.selectedModel, blockType);
            } else if (!normalisedBox) {
                normalisedBox = { ...DEFAULT_AI_BLOCK_BOX };
            }


            const blockVertical = isVerticalTarget
                ? (typeof b.vertical === 'boolean' ? b.vertical : ((b.style && typeof b.style.vertical === 'boolean') ? b.style.vertical : true))
                : false;

            const isSfx = blockType === 'sfx';
            const chosenFont = b.style?.fontFamily || getDefaultFontForBlockType(blockType);
            const maskShape = isSfx ? (b.style?.maskShape || 'none') : 'bubble-fit';
            const maskSize = isSfx ? (b.style?.maskSize || 'snug') : 'full';
            let italic = typeof b.style?.italic === 'boolean' ? b.style.italic : (blockType === 'thought');
            const bold = typeof b.style?.bold === 'boolean' ? b.style.bold : globalState.globalStyle.bold;

            const blockStyle = {
                fontFamily: chosenFont,
                fontSize: b.style?.fontSize || globalState.defaultFontSize || globalState.globalStyle.fontSize,
                lineHeight: b.style?.lineHeight !== undefined ? b.style.lineHeight : (globalState.defaultLineHeight !== undefined ? globalState.defaultLineHeight : (globalState.globalStyle.lineHeight !== undefined ? globalState.globalStyle.lineHeight : 1.15)),
                letterSpacing: b.style?.letterSpacing !== undefined ? b.style.letterSpacing : (globalState.defaultLetterSpacing !== undefined ? globalState.defaultLetterSpacing : (globalState.globalStyle.letterSpacing !== undefined ? globalState.globalStyle.letterSpacing : 0)),
                textColor: b.style?.textColor || '#000000',
                bgColor: b.style?.bgColor || '#ffffff',
                bgOpacity: b.style?.bgOpacity !== undefined ? b.style.bgOpacity : (isSfx ? 0 : 100),
                padding: b.style?.padding !== undefined ? b.style.padding : globalState.globalStyle.padding,
                rotate: b.style?.rotate || 0,
                vertical: blockVertical,
                bold: bold,
                italic: italic,
                align: b.style?.align || globalState.globalStyle.align,
                maskShape: maskShape,
                maskSize: maskSize,
                strokeColor: b.style?.strokeColor || '#ffffff',
                strokeWidth: b.style?.strokeWidth !== undefined ? b.style.strokeWidth : 0,
                shadowColor: b.style?.shadowColor || '#000000',
                shadowBlur: b.style?.shadowBlur !== undefined ? b.style.shadowBlur : 0
            };

            const rawTrans = (b.translated || '').trim();

            return {
                id: b.id || `block_${Date.now()}_${idx}`,
                type: blockType,
                original: b.original || '',
                translated: rawTrans,
                box: normalisedBox,
                style: blockStyle,
                ...(b.speaker !== undefined ? { speaker: b.speaker } : {}),
                ...(b.target !== undefined ? { target: b.target } : {}),
                ...(b.vertical !== undefined ? { vertical: blockVertical } : (blockVertical ? { vertical: true } : {})),
                ...(b.positionKnown !== undefined ? { positionKnown: b.positionKnown } : {}),
                ...(textAnchor ? { textAnchor } : {})
            };
        });

        if (imgEl && imgEl.naturalWidth) {
            try {
                page.blocks.forEach(b => autoMatchBlockStyle(b, imgEl));
            } catch (e) { }
        }

        const { width: displayW, height: displayH } = getReferenceDisplayDimensions(page, imgEl);
        page.blocks.forEach(b => {
            const rawTrans = (b.translated || '').trim();
            b.translated = rawTrans;

            b.autoFitCache = null;
            if (isBlockAutoFit(b)) {
                autoFitBlock(b, imgEl, 1, page);
            }
        });
        page.status = 'done';
        page.lastError = null;
        page.failedStep = null;
        recordPageToStoryMemory(pageIndex, page.blocks);
        uiUpdatePageListUI();
        savePageToDB(page);

        if (globalState.activePageIndex === pageIndex) {
            if (page.blocks.length > 0 && !globalState.selectedBlockId) {
                globalState.selectedBlockId = page.blocks[0].id;
            }
            requestOverlayRender();
            uiUpdateActiveBlockEditor();
        }

        showToast(`Đã dịch xong trang ${pageIndex + 1}!`, "success");
        return true;

    } catch (error: any) {
        console.error("Lỗi chi tiết khi dịch trang:", error);

        if (cancelTranslationFlag) {
            page.status = 'draft';
            page.lastError = "Tiến trình đã bị dừng bởi người dùng.";
            page.failedStep = activeStep;
            uiUpdatePageListUI();
            savePageToDB(page);
            return false;
        }

        const isTimeout = error.name === 'AbortError' || error.name === 'TimeoutError' || (error.message && (error.message.includes('Timeout') || error.message.includes('aborted') || error.message.includes('AbortError')));
        let errorMessage = "Đã xảy ra lỗi không xác định.";
        if (isTimeout) {
            errorMessage = "Kết nối API quá hạn (Timeout). Vui lòng kiểm tra lại mạng hoặc chuyển đổi Model.";
        } else if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        } else if (error && typeof error === 'object') {
            errorMessage = error.message || error.statusText || JSON.stringify(error);
        }

        page.status = 'error';
        page.lastError = errorMessage;
        page.failedStep = activeStep;
        uiUpdatePageListUI();
        savePageToDB(page);

        showToast(`Lỗi khi dịch trang ${pageIndex + 1} [Bước: ${activeStep}]: ${errorMessage}`, "error");
        return false;
    } finally {
        if (!isBackgroundMode) {
            uiUpdateProcessingOverlay(false);
        } else {
            uiUpdateBackgroundTaskOverlay(false);
        }
        if (isBackgroundMode && pageIndex !== globalState.activePageIndex) {
            deactivatePage(page);
        }
        garbageCollectPageCaches();
    }
}

export async function runBatchTranslation(): Promise<void> {
    if (globalState.pages.length === 0) return;
    const aiConfig = getAiConfig();
    const ctx = getTranslationContext();
    const provider = aiConfig.aiProvider;
    const keyToUse = aiConfig.apiKey || (provider === 'custom' ? 'local' : '');
    if (!keyToUse && provider !== 'custom') {
        showToast("Vui lòng nhập API Key trước khi dịch.", "error");
        if (elements.apiKeyInput) elements.apiKeyInput.focus();
        return;
    }

    if (isBatchTranslating) {
        showToast("Tiến trình dịch thuật đang chạy ngầm!", "warn");
        return;
    }

    setCancelTranslationFlag(false);
    setIsBatchTranslating(true);
    analytics.trackTranslate('all', globalState.pages.length);
    showToast('Đang tiến hành dịch toàn bộ Chapter dưới nền. Bạn có thể tiếp tục xem và chỉnh sửa!', 'success');

    for (let i = 0; i < globalState.pages.length; i++) {
        if (globalState.pages[i].status === 'draft' || globalState.pages[i].status === 'error') {
            globalState.pages[i].status = 'queued';
            savePageToDB(globalState.pages[i]);
        }
    }
    uiUpdatePageListUI();

    const totalPages = globalState.pages.length;
    const pipelineMode = ctx.translationPipelineMode;

    if (pipelineMode === 'two-step') {
        const ocrModelToUse = aiConfig.ocrModel;
        const transModelToUse = aiConfig.translationModel;
        const targetLang = ctx.targetLanguage || 'vi';
        const targetLangName = TARGET_LANG_MAP[targetLang] || 'Vietnamese';
        const glossaryNames = ctx.preserveNames ? (ctx.glossaryNames || '').trim() : "";
        const endpoint = getConfiguredApiEndpoint();
        const isOpenAiFormat = provider === 'openai' || (provider === 'custom' && !endpoint.includes('generateContent'));
        const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (isOpenAiFormat && keyToUse) {
            requestHeaders['Authorization'] = `Bearer ${keyToUse}`;
        }

        try {
            const queuedIndices: number[] = [];
            for (let i = 0; i < totalPages; i++) {
                if (globalState.pages[i].status === 'queued') {
                    queuedIndices.push(i);
                }
            }

            for (let idx = 0; idx < queuedIndices.length; idx++) {
                if (cancelTranslationFlag) {
                    showToast("Đã dừng tiến trình dịch Chapter.", "warn");
                    break;
                }

                const pageIndex = queuedIndices[idx];
                const page = globalState.pages[pageIndex];
                await activatePage(page);

                const hasExistingBlocks = page.blocks && page.blocks.length > 0 && page.blocks.some(b => b.original && b.original.trim());

                if (hasExistingBlocks) {
                    page.blocks.forEach((b, bIdx) => {
                        b.id = `p${pageIndex + 1}_b${bIdx + 1}`;
                    });
                    const progressVal = Math.round(((idx + 1) / queuedIndices.length) * 50);
                    uiUpdateBackgroundTaskOverlay(
                        true,
                        "Giai đoạn 1/2: Đã có sẵn khung thoại",
                        `Trang ${pageIndex + 1}/${totalPages}: Tận dụng khung có sẵn, bỏ qua OCR...`,
                        progressVal
                    );
                } else {
                    const progressVal = Math.round(((idx + 1) / queuedIndices.length) * 50);
                    uiUpdateBackgroundTaskOverlay(
                        true,
                        "Giai đoạn 1/2: Quét OCR Khung thoại...",
                        `Trang ${pageIndex + 1}/${totalPages}: Sử dụng ${ocrModelToUse} (Vision)...`,
                        progressVal
                    );

                    try {
                        const pageFile = (page.file || page.originalFile) as File;
                        const fileForOcr = ctx.ocrEnhanceEnabled ? await enhanceImageForOcr(pageFile) : pageFile;
                        const rawBase64 = await getBase64(fileForOcr);
                        const mimeType = fileForOcr.type || pageFile.type;

                        const detectedRawBlocks = await executeOcrVisionStep({
                            rawBase64,
                            mimeType,
                            ocrModel: ocrModelToUse,
                            keyToUse,
                            isOpenAiFormat,
                            endpoint,
                            requestHeaders,
                            onRetry: (info) => {
                                const delaySec = Math.max(1, Math.round(info.delayMs / 1000));
                                uiUpdateBackgroundTaskOverlay(
                                    true,
                                    `OCR Thử lại (${info.attempt}/${info.maxRetries})...`,
                                    `Trang ${pageIndex + 1}/${totalPages}: Tạm nghỉ ${delaySec}s để kết nối lại...`,
                                    progressVal
                                );
                            }
                        });

                        const pageImageData = await ensurePageImageData(page);

                        const isVerticalTarget = ['ja', 'zh', 'ko'].includes(targetLang);
                        const sortedRawBlocks = sortMangaReadingOrder(detectedRawBlocks || []);
                        page.blocks = sortedRawBlocks.map((b, bIdx) => {
                            const blockType = b.type || 'dialogue';
                            const textAnchor = b.textAnchor || extractTextAnchor(b.box);
                            const normalisedBox = b.positionKnown === false
                                ? { ...DEFAULT_AI_BLOCK_BOX }
                                : refineAiBlockBox(b.box, pageImageData, aiConfig.selectedModel, blockType);

                            const blockVertical = isVerticalTarget
                                ? (typeof b.vertical === 'boolean' ? b.vertical : ((b.style && typeof b.style.vertical === 'boolean') ? b.style.vertical : true))
                                : false;

                            const isSfx = blockType === 'sfx';
                            const chosenFont = b.style?.fontFamily || getDefaultFontForBlockType(blockType);
                            const maskShape = isSfx ? (b.style?.maskShape || 'none') : 'bubble-fit';
                            const maskSize = isSfx ? (b.style?.maskSize || 'snug') : 'full';
                            let italic = typeof b.style?.italic === 'boolean' ? b.style.italic : (blockType === 'thought');
                            const bold = typeof b.style?.bold === 'boolean' ? b.style.bold : globalState.globalStyle.bold;

                            return {
                                id: `p${pageIndex + 1}_b${bIdx + 1}`,
                                type: blockType,
                                original: b.original || '',
                                translated: '',
                                box: normalisedBox,
                                style: {
                                    fontFamily: chosenFont,
                                    fontSize: b.style?.fontSize || globalState.defaultFontSize || globalState.globalStyle.fontSize,
                                    lineHeight: b.style?.lineHeight !== undefined ? b.style.lineHeight : (globalState.defaultLineHeight !== undefined ? globalState.defaultLineHeight : (globalState.globalStyle.lineHeight !== undefined ? globalState.globalStyle.lineHeight : 1.15)),
                                    letterSpacing: b.style?.letterSpacing !== undefined ? b.style.letterSpacing : (globalState.defaultLetterSpacing !== undefined ? globalState.defaultLetterSpacing : (globalState.globalStyle.letterSpacing !== undefined ? globalState.globalStyle.letterSpacing : 0)),
                                    textColor: b.style?.textColor || '#000000',
                                    bgColor: b.style?.bgColor || '#ffffff',
                                    bgOpacity: b.style?.bgOpacity !== undefined ? b.style.bgOpacity : (isSfx ? 0 : 100),
                                    padding: b.style?.padding !== undefined ? b.style.padding : globalState.globalStyle.padding,
                                    rotate: b.style?.rotate || 0,
                                    vertical: blockVertical,
                                    bold: bold,
                                    italic: italic,
                                    align: b.style?.align || globalState.globalStyle.align,
                                    maskShape: maskShape,
                                    maskSize: maskSize,
                                    strokeColor: b.style?.strokeColor || '#ffffff',
                                    strokeWidth: b.style?.strokeWidth !== undefined ? b.style.strokeWidth : 0,
                                    shadowColor: b.style?.shadowColor || '#000000',
                                    shadowBlur: b.style?.shadowBlur !== undefined ? b.style.shadowBlur : 0
                                },
                                ...(textAnchor ? { textAnchor } : {})
                            };
                        });

                        savePageToDB(page);
                    } catch (ocrErr: any) {
                        console.error(`Lỗi OCR ở trang ${pageIndex + 1}:`, ocrErr);
                        page.status = 'error';
                        page.failedStep = "Quét OCR Vision";
                        page.lastError = ocrErr?.message || "Lỗi quét OCR";
                        savePageToDB(page);
                    }
                }

                if (pageIndex !== globalState.activePageIndex) {
                    deactivatePage(page);
                }
                garbageCollectPageCaches();

                if (idx < queuedIndices.length - 1 && !cancelTranslationFlag) {
                    await new Promise(r => setTimeout(r, 1500));
                }
            }

            if (!cancelTranslationFlag) {
                const allChapterBlocks: any[] = [];
                queuedIndices.forEach(i => {
                    const p = globalState.pages[i];
                    if (p.status === 'queued' && p.blocks && p.blocks.length > 0) {
                        p.blocks.forEach(b => {
                            if (b.original && b.original.trim()) {
                                allChapterBlocks.push({
                                    id: b.id,
                                    original: b.original,
                                    pageIndex: i
                                });
                            }
                        });
                    }
                });

                if (allChapterBlocks.length > 0) {
                    uiUpdateBackgroundTaskOverlay(
                        true,
                        "Giai đoạn 2/2: Đang dịch toàn bộ Chapter...",
                        `Đang gửi ${allChapterBlocks.length} câu thoại của toàn bộ Chapter đến ${transModelToUse} (1 Request duy nhất)...`,
                        75
                    );

                    try {
                        const translatedChapterBlocks = await executeChapterTranslationStep({
                            allChapterBlocks,
                            translationModel: transModelToUse,
                            targetLangName,
                            glossaryNames,
                            keyToUse,
                            isOpenAiFormat,
                            endpoint,
                            requestHeaders,
                            contextOptions: ctx,
                            onRetry: (info) => {
                                const delaySec = Math.max(1, Math.round(info.delayMs / 1000));
                                uiUpdateBackgroundTaskOverlay(
                                    true,
                                    `Dịch Chapter - Thử lại (${info.attempt}/${info.maxRetries})...`,
                                    `Tạm nghỉ ${delaySec}s trước khi gửi lại request (${info.errorLabel})...`,
                                    75
                                );
                            }
                        });

                        const lookupMap = new Map<string, string>();
                        translatedChapterBlocks.forEach(b => {
                            if (b && b.id) {
                                lookupMap.set(String(b.id), b.translated || '');
                                lookupMap.set(String(b.id).toLowerCase(), b.translated || '');
                            }
                        });

                        queuedIndices.forEach(i => {
                            const p = globalState.pages[i];
                            if (p.status === 'queued' && p.blocks) {
                                const pageImgData = p.imageDataCache;
                                const imgEl = elements.mangaBgImage;
                                const imgW = (pageImgData && pageImgData.width > 0)
                                    ? pageImgData.width
                                    : ((imgEl && imgEl.naturalWidth > 0 && i === globalState.activePageIndex) ? imgEl.naturalWidth : 800);
                                const imgH = (pageImgData && pageImgData.height > 0)
                                    ? pageImgData.height
                                    : ((imgEl && imgEl.naturalHeight > 0 && i === globalState.activePageIndex) ? imgEl.naturalHeight : 1200);

                                p.blocks.forEach((b, bIdx) => {
                                    const expectedId = `p${i + 1}_b${bIdx + 1}`;
                                    const rawTrans = lookupMap.get(String(b.id)) ||
                                        lookupMap.get(expectedId) ||
                                        lookupMap.get(expectedId.toLowerCase()) ||
                                        b.translated || '';
                                    b.translated = rawTrans;
                                });

                                if (imgEl && imgEl.naturalWidth && i === globalState.activePageIndex) {
                                    try {
                                        p.blocks.forEach(b => autoMatchBlockStyle(b, imgEl));
                                    } catch (e) { }
                                }

                                const { width: pDisplayW, height: pDisplayH } = getReferenceDisplayDimensions(p, imgEl);
                                p.blocks.forEach((b) => {
                                    const rawTrans = (b.translated || '').trim();
                                    b.translated = rawTrans;

                                    b.autoFitCache = null;
                                    if (isBlockAutoFit(b)) {
                                        autoFitBlock(b, imgEl, 1, p);
                                    }
                                });

                                p.status = 'done';
                                p.lastError = null;
                                p.failedStep = null;
                                recordPageToStoryMemory(i, p.blocks);
                                savePageToDB(p);
                            }
                        });

                        showToast(`Đã dịch thành công toàn bộ Chapter (${allChapterBlocks.length} câu thoại) trong 1 lượt gọi duy nhất!`, "success");
                    } catch (transErr: any) {
                        console.error("Lỗi khi dịch gộp Chapter:", transErr);
                        showToast(`Đã hoàn thành OCR (${allChapterBlocks.length} ô thoại), nhưng bước dịch gặp lỗi: ${transErr.message || transErr}. Bạn có thể bấm Thử Dịch Lại mà không cần quét OCR lại.`, "warn");
                        queuedIndices.forEach(i => {
                            const p = globalState.pages[i];
                            if (p.status === 'queued') {
                                p.status = (p.blocks && p.blocks.length > 0) ? 'draft' : 'error';
                                p.failedStep = "Dịch gộp Chapter";
                                p.lastError = transErr?.message || "Lỗi dịch gộp Chapter";
                                savePageToDB(p);
                            }
                        });
                    }
                } else {
                    queuedIndices.forEach(i => {
                        const p = globalState.pages[i];
                        if (p.status === 'queued') {
                            p.status = 'done';
                            p.lastError = null;
                            p.failedStep = null;
                            savePageToDB(p);
                        }
                    });
                }
            }

        } catch (chapterErr) {
            console.error("Lỗi quy trình Chapter Batch:", chapterErr);
        }

    } else {
        for (let i = 0; i < totalPages; i++) {
            if (cancelTranslationFlag) {
                showToast("Đã dừng hàng loạt tiến trình dịch ngầm.", "warn");
                break;
            }

            const page = globalState.pages[i];
            if (page.status !== 'queued') continue;

            try {
                const delaySteps = (aiConfig.apiDelay !== undefined ? aiConfig.apiDelay : 2) * 10;
                if (i > 0 && delaySteps > 0) {
                    let delayProgress = 0;
                    for (let delay = 0; delay < delaySteps; delay++) {
                        if (cancelTranslationFlag) break;
                        delayProgress = Math.round((delay / delaySteps) * 100);
                        uiUpdateBackgroundTaskOverlay(
                            true,
                            "Đang chờ giãn cách API...",
                            `Trang ${i + 1}/${totalPages}: Tạm nghỉ bảo vệ API Key... (Còn ${Math.ceil((delaySteps - delay) / 10)} giây)`,
                            delayProgress
                        );
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }

                if (cancelTranslationFlag) break;

                const progressPercent = Math.round((i / totalPages) * 100);
                uiUpdateBackgroundTaskOverlay(true, "Đang xử lý...", `Đang chuẩn bị gửi trang ${i + 1}/${totalPages}...`, progressPercent);

                const success = await translatePage(i, true);
                if (!success) {
                    let errorDelayProgress = 0;
                    const cooldownSeconds = 15;
                    for (let delay = 0; delay < cooldownSeconds * 10; delay++) {
                        if (cancelTranslationFlag) break;
                        errorDelayProgress = Math.round((delay / (cooldownSeconds * 10)) * 100);
                        uiUpdateBackgroundTaskOverlay(
                            true,
                            "Lỗi kết nối - Đang chờ khôi phục...",
                            `Tạm nghỉ bảo vệ API sau khi lỗi... (Chờ ${Math.ceil((cooldownSeconds * 10 - delay) / 10)} giây)`,
                            errorDelayProgress
                        );
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            } catch (e) {
                console.error("Background batch translation error on page:", i, e);
            } finally {
                garbageCollectPageCaches();
            }
        }
    }


    for (let i = 0; i < globalState.pages.length; i++) {
        if (globalState.pages[i].status === 'queued') {
            globalState.pages[i].status = 'draft';
            savePageToDB(globalState.pages[i]);
        }
    }

    garbageCollectPageCaches();
    setIsBatchTranslating(false);
    uiUpdatePageListUI();
    uiUpdateBackgroundTaskOverlay(false);
    if (globalState.activePageIndex >= 0) {
        requestOverlayRender();
        uiUpdateActiveBlockEditor();
    }
}
