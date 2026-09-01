/**
 * Manga Translator Studio - Auto-Pilot Chapter Pipeline Orchestrator
 */

import { globalState, savePageToDB, activatePage, deactivatePage, garbageCollectPageCaches, uiUpdatePageListUI, uiUpdateBackgroundTaskOverlay } from '../../core/state';
import { elements } from '../../core/elements';
import { showToast } from '../../core/utils';
import { getPipelineData, updateStageStatus, setPipelineStage, recalculateChapterStats } from './pipeline-manager';
import { runChapterQcScan, autoFixAllQcIssues } from './qc-linter';
import { getAiConfig, getTranslationContext } from '../ai/ai-state';
import { getConfiguredApiEndpoint } from '../ai/ai-config';
import { getBase64, enhanceImageForOcr, ensurePageImageData, executeOcrVisionStep, executeAiJsonRequestWithRetry } from '../ai/ai-client';
import { refineAiBlockBox, extractTextAnchor } from '../ocr/ocr-service';
import { getDefaultFontForBlockType, cancelTranslationFlag, setCancelTranslationFlag, setIsBatchTranslating } from '../ai/story-memory';
import { executeChapterTranslationStep } from '../ai/translation-pipeline';
import { autoMatchBlockStyle, autoFitBlock, isBlockAutoFit, getReferenceDisplayDimensions, requestOverlayRender } from '../canvas/canvas-service';
import { DEFAULT_AI_BLOCK_BOX, TARGET_LANG_MAP } from '../../config/constants';

let isAutoPilotRunning = false;

export function getIsAutoPilotRunning(): boolean {
    return isAutoPilotRunning;
}

export function stopAutoPilot(): void {
    if (!isAutoPilotRunning) return;
    setCancelTranslationFlag(true);
    isAutoPilotRunning = false;
    const pipeline = getPipelineData();
    pipeline.autoPilotRunning = false;
    updateStageStatus(pipeline.currentStage, 'idle');
    uiUpdateBackgroundTaskOverlay(false);
    showToast("Đã tạm dừng Auto-Pilot Pipeline.", "warn");
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

                    page.blocks = (detectedRawBlocks || []).map((b, bIdx) => {
                        const blockType = b.type || 'dialogue';
                        const textAnchor = b.textAnchor || extractTextAnchor(b.box);
                        const normalisedBox = b.positionKnown === false
                            ? { ...DEFAULT_AI_BLOCK_BOX }
                            : refineAiBlockBox(b.box, pageImageData, aiConfig.selectedModel, blockType);

                        const blockVertical = isVerticalTarget
                            ? (typeof b.vertical === 'boolean' ? b.vertical : true)
                            : false;

                        const chosenFont = b.style?.fontFamily || getDefaultFontForBlockType(blockType);
                        let maskShape = b.style?.maskShape || globalState.globalStyle.maskShape;
                        let italic = typeof b.style?.italic === 'boolean' ? b.style.italic : false;
                        const bold = typeof b.style?.bold === 'boolean' ? b.style.bold : globalState.globalStyle.bold;

                        if (blockType === 'narration') {
                            maskShape = 'rect';
                        } else if (blockType === 'thought') {
                            maskShape = 'bubble-fit';
                            italic = true;
                        }

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
                                bgOpacity: 100,
                                padding: 8,
                                rotate: 0,
                                vertical: blockVertical,
                                bold,
                                italic,
                                align: 'center',
                                maskShape,
                                maskSize: 'snug',
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
        // STAGE 3: TRANSLATE CHAPTER
        // ==========================================
        setPipelineStage('translate');
        updateStageStatus('translate', 'running');
        pipeline.autoPilotProgress = 45;
        pipeline.autoPilotStageMessage = "Dịch mạch truyện toàn bộ Chapter...";

        const allChapterBlocks: any[] = [];
        pages.forEach((p, pIdx) => {
            if (p.blocks) {
                p.blocks.forEach(b => {
                    if (b.original && b.original.trim()) {
                        allChapterBlocks.push({
                            id: b.id,
                            original: b.original,
                            pageIndex: pIdx,
                            speaker: b.speaker,
                            target: b.target
                        });
                    }
                });
            }
        });

        if (allChapterBlocks.length > 0) {
            const transModelToUse = aiConfig.translationModel || 'gemini-2.5-flash';
            const targetLang = ctx.targetLanguage || 'vi';
            const targetLangName = TARGET_LANG_MAP[targetLang] || 'Vietnamese';
            const glossaryNames = ctx.preserveNames ? (ctx.glossaryNames || '').trim() : "";
            const endpoint = getConfiguredApiEndpoint();
            const isOpenAiFormat = provider === 'openai' || (provider === 'custom' && !endpoint.includes('generateContent'));
            const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
            if (isOpenAiFormat && keyToUse) {
                requestHeaders['Authorization'] = `Bearer ${keyToUse}`;
            }

            uiUpdateBackgroundTaskOverlay(
                true,
                `Auto-Pilot [Bước 2/4: Dịch Chapter]`,
                `Đang gửi ${allChapterBlocks.length} câu thoại theo mạch cốt truyện...`,
                55
            );

            const translatedChapterBlocks = await executeChapterTranslationStep({
                allChapterBlocks,
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
                if (p.blocks) {
                    p.blocks.forEach((b, bIdx) => {
                        const expectedId = `p${i + 1}_b${bIdx + 1}`;
                        const rawTrans = lookupMap.get(String(b.id)) ||
                            lookupMap.get(expectedId) ||
                            lookupMap.get(expectedId.toLowerCase()) ||
                            b.translated || '';
                        b.translated = rawTrans;
                    });
                    savePageToDB(p);
                }
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
    }
}
