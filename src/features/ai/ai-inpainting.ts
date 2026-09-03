// AI Inpainting & Offline Text Cleaning
import {
    globalState,
    pushStateToHistory,
    uiUpdateProcessingOverlay,
    uiUpdateActiveBlockEditor
} from '../../core/state';
import { DEFAULT_MODEL } from '../../config/constants';
import { elements } from '../../core/elements';
import { showToast } from '../../core/utils/dom';
import { requestOverlayRender } from '../canvas/canvas-service';
import { getConfiguredAiProvider, getGeminiGenerateContentUrl, GEMINI_SAFETY_SETTINGS_BLOCK_NONE } from './ai-config';
import { getGeminiApiKey } from './story-memory';
import { MangaBlock, MangaPage } from '../../types/index';

export async function requestAiInpaintPatch(page: MangaPage, block: MangaBlock, cropX: number, cropY: number, cropW: number, cropH: number): Promise<boolean> {
    const keyToUse = getGeminiApiKey();
    if (!keyToUse) {
        showToast("Vui lòng nhập Gemini API Key để dùng AI Cloud Inpainting.", "warn");
        return false;
    }

    const imgElement = elements.mangaBgImage;
    if (!imgElement || !imgElement.naturalWidth) return false;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return false;
    tempCtx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const { cleanMangaBackgroundArtText } = await import('../inpainting');
    await cleanMangaBackgroundArtText(tempCtx, cropW, cropH);

    const canvas = elements.eraserCanvas;
    if (canvas) {
        if (canvas.width !== imgElement.naturalWidth || canvas.height !== imgElement.naturalHeight) {
            canvas.width = imgElement.naturalWidth;
            canvas.height = imgElement.naturalHeight;
        }

        const eraserCtx = canvas.getContext('2d');
        if (eraserCtx) {
            eraserCtx.drawImage(tempCanvas, cropX, cropY);
        }
    }
    return true;
}

export async function runLocalTeleaCleanPage(activePage: MangaPage): Promise<void> {
    uiUpdateProcessingOverlay(true, "AI Đang Xóa Chữ...", "Đang tự động chạy bộ lọc offline làm sạch trang...", 30);

    const imgElement = elements.mangaBgImage;
    if (!imgElement || !imgElement.naturalWidth) {
        throw new Error("Ảnh gốc chưa sẵn sàng để thực hiện inpaint.");
    }

    pushStateToHistory();

    const canvas = elements.eraserCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    const blocks = activePage.blocks || [];
    let dialoguesCount = 0;
    let sfxCount = 0;

    const { autoCleanBubbleBackground, cleanMangaBackgroundArtText, saveEraserDrawingToPage } = await import('../inpainting');

    for (const block of blocks) {
        const isSpeechBubble = (block.type === 'dialogue' || block.type === 'narration');

        if (isSpeechBubble) {
            autoCleanBubbleBackground(activePage, block);
            dialoguesCount++;
        } else {
            const marginX = block.box.w * 0.06;
            const marginY = block.box.h * 0.06;
            const cropX = Math.max(0, Math.round(((block.box.x - marginX) / 100) * W));
            const cropY = Math.max(0, Math.round(((block.box.y - marginY) / 100) * H));
            const cropW = Math.min(W - cropX, Math.round(((block.box.w + marginX * 2) / 100) * W));
            const cropH = Math.min(H - cropY, Math.round(((block.box.h + marginY * 2) / 100) * H));

            if (cropW > 3 && cropH > 3) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = cropW;
                tempCanvas.height = cropH;
                const tempCtx = tempCanvas.getContext('2d');
                if (tempCtx) {
                    tempCtx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
                    await cleanMangaBackgroundArtText(tempCtx, cropW, cropH);
                    ctx.drawImage(tempCanvas, cropX, cropY);
                    sfxCount++;
                }
            }
        }
    }

    await saveEraserDrawingToPage();
    requestOverlayRender();
    uiUpdateActiveBlockEditor();

    showToast(`✨ Đã tự động xóa sạch ${dialoguesCount} ô thoại & ${sfxCount} vùng chữ SFX!`, "success");
}

export async function runAIEraseTextPage(): Promise<void> {
    const activePage = globalState.pages[globalState.activePageIndex];
    if (!activePage) {
        showToast("Vui lòng tải hoặc chọn trang truyện để tẩy chữ.", "warn");
        return;
    }

    const provider = getConfiguredAiProvider();
    const keyToUse = getGeminiApiKey() || (provider === 'custom' ? 'local' : '');
    if (!keyToUse && provider !== 'custom') {
        showToast("Vui lòng cấu hình API Key trước khi sử dụng AI.", "warn");
        return;
    }

    const pageFile = (activePage.originalFile || activePage.file) as File;
    if (!pageFile) {
        showToast("Không tìm thấy tệp ảnh của trang.", "error");
        return;
    }

    uiUpdateProcessingOverlay(true, "AI Đang Xóa Chữ...", "Gemini AI đang tải ảnh và xóa toàn bộ chữ trên trang...", 20);

    try {
        pushStateToHistory();

        const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const resultStr = String(reader.result || '');
                const base64 = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(pageFile);
        });

        uiUpdateProcessingOverlay(true, "AI Đang Xóa Chữ...", "Gemini AI đang xử lý vẽ bù nền & xóa chữ...", 50);

        const eraseModel = globalState.selectedModel || DEFAULT_MODEL;
        const apiUrl = getGeminiGenerateContentUrl(eraseModel, keyToUse);
        const payload = {
            contents: [{
                role: "user",
                parts: [
                    {
                        text: "You are an expert manga cleaner and editor. Clean this manga page image by completely removing all Japanese/English text, speech bubble content, hiragana, katakana, kanji, and sound effects (SFX). Keep all speech bubbles crisp and solid white inside, and seamlessly reconstruct any background artwork, screentones, and line drawings behind removed text. Return ONLY the edited cleaned manga page image."
                    },
                    {
                        inlineData: {
                            mimeType: pageFile.type || "image/png",
                            data: base64Data
                        }
                    }
                ]
            }],
            generationConfig: {
                responseModalities: ['IMAGE', 'TEXT']
            },
            safetySettings: GEMINI_SAFETY_SETTINGS_BLOCK_NONE
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            try { controller.abort(); } catch (e) { }
        }, 90000);

        let response: Response;
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API Error: ${errText}`);
        }

        uiUpdateProcessingOverlay(true, "AI Đang Xóa Chữ...", "Nhận kết quả và vẽ lại trang truyện...", 85);
        const result = await response.json();
        const part = result?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);

        if (part && part.inlineData) {
            const img = new Image();
            const blobUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;

            await new Promise<void>((resolve, reject) => {
                img.onload = () => {
                    const canvas = elements.eraserCanvas;
                    if (canvas) {
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        }
                    }
                    resolve();
                };
                img.onerror = () => reject(new Error("Không thể tải ảnh kết quả từ AI."));
                img.src = blobUrl;
            });

            const { saveEraserDrawingToPage } = await import('../inpainting');
            await saveEraserDrawingToPage();

            showToast("✨ AI đã tự động xóa sạch chữ & SFX trên trang Manga!", "success");
        } else {
            throw new Error("Không tìm thấy dữ liệu ảnh trả về từ Gemini AI.");
        }
    } catch (err: any) {
        if (err.message && (err.message.includes("429") || err.message.includes("quota") || err.message.includes("Quota exceeded") || err.message.includes("limit: 0") || err.message.includes("billing"))) {
            showToast("Gemini Free Tier giới hạn xuất ảnh. Tự động chạy bộ lọc offline làm sạch trang...", "info");
            try {
                await runLocalTeleaCleanPage(activePage);
            } catch (localErr: any) {
                console.error("Lỗi xóa chữ offline:", localErr);
                showToast(`Lỗi xóa chữ: ${localErr.message}`, "error");
            }
        } else {
            console.error("Lỗi AI Xóa Chữ:", err);
            showToast(`Lỗi AI Xóa Chữ: ${err.message}`, "error");
        }
    } finally {
        uiUpdateProcessingOverlay(false);
    }
}
