/**
 * Manga Translator Studio - Auto-Pilot Chapter Pipeline Orchestrator
 */

import { globalState, savePageToDB, activatePage, deactivatePage, garbageCollectPageCaches, uiUpdatePageListUI, uiUpdateBackgroundTaskOverlay } from '../../core/state';
import { elements } from '../../core/elements';
import { showToast } from '../../core/utils';
import { globalBus } from '../../core/events';
import { getPipelineData, updateStageStatus, setPipelineStage, recalculateChapterStats } from './pipeline-manager';
import { runChapterQcScan, autoFixAllQcIssues } from './qc-linter';
import { getAiConfig, getTranslationContext } from '../ai/ai-state';
import { getConfiguredApiEndpoint } from '../ai/ai-config';
import { getBase64, enhanceImageForOcr, ensurePageImageData, executeOcrVisionStep, executeAiJsonRequestWithRetry } from '../ai/ai-client';
import { refineAiBlockBox, extractTextAnchor, sortMangaReadingOrder } from '../ocr/ocr-service';
import { getDefaultFontForBlockType, cancelTranslationFlag, setCancelTranslationFlag, setIsBatchTranslating } from '../ai/story-memory';
import { executeChapterTranslationStep } from '../ai/translation-pipeline';
import { getCachedTranslation, setCachedTranslation } from '../ai/translation-cache';
import { autoMatchBlockStyle, autoFitBlock, isBlockAutoFit, getReferenceDisplayDimensions, requestOverlayRender } from '../canvas/canvas-service';
import { DEFAULT_AI_BLOCK_BOX, TARGET_LANG_MAP } from '../../config/constants';

let isAutoPilotRunning = false;

export function getIsAutoPilotRunning(): boolean {
    return isAutoPilotRunning;
}

export function stopAutoPilot(): void {
    setCancelTranslationFlag(true);
    isAutoPilotRunning = false;
    const pipeline = getPipelineData();
    pipeline.autoPilotRunning = false;
    updateStageStatus(pipeline.currentStage, 'idle');
    setIsBatchTranslating(false);
    uiUpdateBackgroundTaskOverlay(false);
    globalBus.publish('pipeline:status-changed', pipeline);
    globalBus.publish('pipeline:metadata-changed', pipeline);
    showToast("Đã dừng Auto-Pilot Pipeline.", "warn");
}

export async function runAutoPilotChapterPipeline(): Promise<boolean> {
    if (isAutoPilotRunning) {
        showToast("Auto-Pilot đang chạy ngầm!", "warn");
        return false;
    }


    const pages = globalState.pages || [];
    if (pages.length === 0) {
        showToast("Vui lòng tải ảnh truyện lên trước khi chạy Auto-Pilot!", "warn");
        return false;
    }

    const aiConfig = getAiConfig();
    const ctx = getTranslationContext();

    const provider = aiConfig.aiProvider;
    const keyToUse = aiConfig.apiKey || (provider === 'custom' ? 'local' : '');
    if (!keyToUse && provider !== 'custom') {
        showToast("Vui lòng nhập API Key trong phần Cài đặt trước khi chạy Auto-Pilot.", "error");
        if (elements.apiKeyInput) elements.apiKeyInput.focus();
        return false;
    }

    isAutoPilotRunning = true;
    setCancelTranslationFlag(false);

    setIsBatchTranslating(true);

    const pipeline = getPipelineData();
    pipeline.autoPilotRunning = true;
    pipeline.autoPilotProgress = 5;
    pipeline.autoPilotStageMessage = "Khởi động Pipeline...";
    globalBus.publish('pipeline:status-changed', pipeline);
    globalBus.publish('pipeline:metadata-changed', pipeline);

    const totalPages = pages.length;
    showToast(`🚀 Bắt đầu Auto-Pilot cho Chapter (${totalPages} trang)...`, "success");

    try {
        // ==========================================
        // STAGE 2: OCR BATCH
        // ==========================================
        setPipelineStage('ocr');
        updateStageStatus('ocr', 'running');

        const pagesNeedingOcr: number[] = [];
        for (let i = 0; i < totalPages; i++) {
            const p = pages[i];
            // If page is already completed or has valid translated blocks, skip OCR to avoid shifting boxes
            if (p.status === 'done' && p.blocks && p.blocks.length > 0 && p.blocks.some(b => b.translated && b.translated.trim())) {
                continue;
            }
            if (!p.blocks || p.blocks.length === 0 || !p.blocks.some(b => b.original && b.original.trim())) {
                pagesNeedingOcr.push(i);
            }
        }


        if (pagesNeedingOcr.length > 0) {
            const ocrModelToUse = aiConfig.ocrModel || 'gemini-2.5-flash';
            const endpoint = getConfiguredApiEndpoint();
            const isOpenAiFormat = provider === 'openai' || (provider === 'custom' && !endpoint.includes('generateContent'));
            const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
            if (isOpenAiFormat && keyToUse) {
                requestHeaders['Authorization'] = `Bearer ${keyToUse}`;
            }

            for (let idx = 0; idx < pagesNeedingOcr.length; idx++) {
                if (cancelTranslationFlag) break;

                const pageIndex = pagesNeedingOcr[idx];
                const page = pages[pageIndex];
                const pageProgress = Math.round(5 + ((idx + 1) / pagesNeedingOcr.length) * 35);
                pipeline.autoPilotProgress = pageProgress;
                pipeline.autoPilotStageMessage = `Quét OCR Trang ${pageIndex + 1}/${totalPages}...`;
                globalBus.publish('pipeline:metadata-changed', pipeline);

                uiUpdateBackgroundTaskOverlay(
                    true,
                    `Auto-Pilot [Bước 1/4: Quét OCR]`,
                    `Trang ${pageIndex + 1}/${totalPages}: Nhận diện văn bản...`,
                    pageProgress
                );


                try {
                    await activatePage(page);
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
                        requestHeaders
                    });

                    const pageImageData = await ensurePageImageData(page);
                    const isVerticalTarget = ['ja', 'zh', 'ko'].includes(ctx.targetLanguage || 'vi');
                    const sortedRawBlocks = sortMangaReadingOrder(detectedRawBlocks || []);
                    page.blocks = sortedRawBlocks.map((b, bIdx) => {
                        const blockType = b.type || 'dialogue';
                        const textAnchor = b.textAnchor || extractTextAnchor(b.box);
                        const normalisedBox = b.positionKnown === false
                            ? { ...DEFAULT_AI_BLOCK_BOX }
                            : refineAiBlockBox(b.box, pageImageData, aiConfig.selectedModel, blockType);

                        const blockVertical = isVerticalTarget
                            ? (typeof b.vertical === 'boolean' ? b.vertical : true)
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
                                fontSize: b.style?.fontSize || globalState.defaultFontSize || 16,
                                lineHeight: 1.15,
                                letterSpacing: 0,
                                textColor: '#000000',
                                bgColor: '#ffffff',
                                bgOpacity: isSfx ? 0 : 100,
                                padding: 8,
                                rotate: 0,
                                vertical: blockVertical,
                                bold,
                                italic,
                                align: 'center',
                                maskShape,
                                maskSize,
                                strokeColor: '#ffffff',
                                strokeWidth: 0,
                                shadowColor: '#000000',
                                shadowBlur: 0
                            },
                            ...(textAnchor ? { textAnchor } : {})
                        };
                    });

                    savePageToDB(page);
                } catch (ocrErr) {
                    console.warn(`Lỗi OCR trang ${pageIndex + 1} trong Auto-Pilot:`, ocrErr);
                }

                if (pageIndex !== globalState.activePageIndex) {
                    deactivatePage(page);
                }
                garbageCollectPageCaches();

                if (idx < pagesNeedingOcr.length - 1 && !cancelTranslationFlag) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }

        updateStageStatus('ocr', 'completed');

        if (cancelTranslationFlag) {
            stopAutoPilot();
            return false;
        }

        // ==========================================
        // STAGE 3: TRANSLATE CHAPTER (WITH CACHE & RESUME)
        // ==========================================
        setPipelineStage('translate');
        updateStageStatus('translate', 'running');
        pipeline.autoPilotProgress = 45;
        pipeline.autoPilotStageMessage = "Dịch mạch truyện toàn bộ Chapter...";
        globalBus.publish('pipeline:status-changed', pipeline);
        globalBus.publish('pipeline:metadata-changed', pipeline);

        const targetLang = ctx.targetLanguage || 'vi';
        const targetLangName = TARGET_LANG_MAP[targetLang] || 'Vietnamese';

        // Step 3.1: Check existing translations and Two-Tier Cache first (0ms, 0 tokens)
        const blocksToTranslate: any[] = [];
        let cacheHitCount = 0;

        for (let pIdx = 0; pIdx < pages.length; pIdx++) {
            const p = pages[pIdx];
            if (p.blocks) {
                for (const b of p.blocks) {
                    if (!b.original || !b.original.trim()) continue;

                    // If already translated (Resume mode), preserve existing translation
                    if (b.translated && b.translated.trim()) continue;

                    // Try Two-Tier Hash Cache
                    const cached = await getCachedTranslation(b.original, targetLang, {
                        speaker: b.speaker,
                        target: b.target
                    });

                    if (cached && cached.translated) {
                        b.translated = cached.translated;
                        cacheHitCount++;
                    } else {
                        blocksToTranslate.push({
                            id: b.id,
                            original: b.original,
                            pageIndex: pIdx,
                            speaker: b.speaker,
                            target: b.target
                        });
                    }
                }
            }
        }

        if (cacheHitCount > 0) {
            showToast(`⚡ Đã tái sử dụng ${cacheHitCount} câu từ bộ nhớ đệm (Cache Hit)!`, "info");
        }

        // Step 3.2: Translate uncached / pending blocks in story context
        if (blocksToTranslate.length > 0) {
            const transModelToUse = aiConfig.translationModel || 'gemini-2.5-flash';
            const glossaryNames = ctx.preserveNames ? (ctx.glossaryNames || '').trim() : "";
            const endpoint = getConfiguredApiEndpoint();
            const isOpenAiFormat = provider === 'openai' || (provider === 'custom' && !endpoint.includes('generateContent'));
            const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
            if (isOpenAiFormat && keyToUse) {
                requestHeaders['Authorization'] = `Bearer ${keyToUse}`;
            }

            uiUpdateBackgroundTaskOverlay(
                true,
                `Auto-Pilot [Bước 2/2: Dịch Chapter]`,
                `Đang dịch ${blocksToTranslate.length} câu thoại mới theo mạch ngữ cảnh...`,
                55
            );
            pipeline.autoPilotProgress = 55;
            globalBus.publish('pipeline:metadata-changed', pipeline);

            const translatedChapterBlocks = await executeChapterTranslationStep({
                allChapterBlocks: blocksToTranslate,
                translationModel: transModelToUse,
                targetLangName,
                glossaryNames,
                keyToUse,
                isOpenAiFormat,
                endpoint,
                requestHeaders,
                contextOptions: ctx
            });

            const lookupMap = new Map<string, string>();
            translatedChapterBlocks.forEach(b => {
                if (b && b.id) {
                    lookupMap.set(String(b.id), b.translated || '');
                    lookupMap.set(String(b.id).toLowerCase(), b.translated || '');
                }
            });

            pages.forEach((p, i) => {
                if (p.blocks && p.blocks.length > 0) {
                    const imgEl = elements.mangaBgImage;
                    p.blocks.forEach((b, bIdx) => {
                        const expectedId = `p${i + 1}_b${bIdx + 1}`;
                        const rawTrans = lookupMap.get(String(b.id)) ||
                            lookupMap.get(expectedId) ||
                            lookupMap.get(expectedId.toLowerCase());

                        if (rawTrans) {
                            b.translated = rawTrans;
                            // Cache newly translated dialogue
                            setCachedTranslation(b.original, rawTrans, targetLang, {
                                speaker: b.speaker,
                                target: b.target
                            });
                        }

                        b.autoFitCache = null;
                        if (isBlockAutoFit(b)) {
                            autoFitBlock(b, imgEl, 1, p);
                        }
                    });

                    p.status = 'done';
                    p.lastError = null;
                    p.failedStep = null;
                    savePageToDB(p);
                } else {
                    p.status = 'done';
                    p.lastError = null;
                    p.failedStep = null;
                    savePageToDB(p);
                }
            });
        } else {
            // All blocks were either already translated or retrieved from cache
            pages.forEach(p => {
                p.status = 'done';
                p.lastError = null;
                p.failedStep = null;
                savePageToDB(p);
            });
        }


        updateStageStatus('translate', 'completed');
        setPipelineStage('review');
        pipeline.autoPilotProgress = 100;
        pipeline.autoPilotStageMessage = "Hoàn tất OCR & Dịch thuật!";

        recalculateChapterStats();
        showToast("🎉 Hoàn tất OCR & Dịch toàn bộ Chapter! Sẵn sàng để Biên tập & Typeset.", "success");

        uiUpdatePageListUI();
        requestOverlayRender();
        return true;

    } catch (err: any) {
        console.error("Lỗi thực thi Auto-Pilot:", err);
        showToast(`Auto-Pilot gặp sự cố: ${err.message || err}`, "error");
        return false;
    } finally {
        isAutoPilotRunning = false;
        pipeline.autoPilotRunning = false;
        setIsBatchTranslating(false);
        uiUpdateBackgroundTaskOverlay(false);
        garbageCollectPageCaches();
        globalBus.publish('pipeline:status-changed', pipeline);
        globalBus.publish('pipeline:metadata-changed', pipeline);
    }
}

