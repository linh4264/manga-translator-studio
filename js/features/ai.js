// AI Translation & Story Memory Management
import {
    globalState,
    pushStateToHistory,
    VALID_MODEL_IDS,
    DEFAULT_MODEL,
    DEFAULT_AI_BLOCK_BOX,
    DEFAULT_VERTICAL_WRITING_MODE,
    savePageToDB,
    activatePage,
    deactivatePage,
    garbageCollectPageCaches,
    apiKey,
    TRANSLATION_GENRE_PRESETS,
    uiUpdatePageListUI,
    uiUpdateProcessingOverlay,
    uiUpdateBackgroundTaskOverlay,
    uiUpdateActiveBlockEditor,
    isWeakTranslationModel,
    isFlash31LiteModel
} from '../core/state.js';
import { elements } from '../core/elements.js';
import { showToast, parseGeminiJsonText } from '../core/utils.js';
import { refineAiBlockBox } from './ocr.js';
import { requestOverlayRender } from './canvas.js';
import { compilePronounMatrixPrompt } from './pronoun.js';

export const TARGET_LANG_MAP = {
    'vi': 'Vietnamese',
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'pt': 'Portuguese',
    'de': 'German',
    'it': 'Italian',
    'ru': 'Russian',
    'id': 'Indonesian',
    'th': 'Thai',
    'ko': 'Korean',
    'ja': 'Japanese',
    'zh': 'Chinese'
};

export let cancelTranslationFlag = false;
export let isBatchTranslating = false;


export function setCancelTranslationFlag(val) {
    cancelTranslationFlag = val;
}

export function setIsBatchTranslating(val) {
    isBatchTranslating = val;
}

export function getGeminiApiKey() {
    return (globalState.apiKey || apiKey || "").trim();
}

export function normalizeModelId(modelId) {
    if (!modelId) return DEFAULT_MODEL;
    if (modelId.startsWith('gemini-')) return modelId;
    return VALID_MODEL_IDS.includes(modelId) ? modelId : DEFAULT_MODEL;
}

export function getModelTranslationProfile(modelId) {
    const normalized = normalizeModelId(modelId);
    const targetLang = globalState.targetLanguage || 'vi';
    const targetLangName = TARGET_LANG_MAP[targetLang] || 'Vietnamese';
    const pronounTerm = targetLang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';
    const pronounSimple = targetLang === 'vi' ? 'xưng hô (pronouns)' : 'pronouns';

    if (normalized === 'gemini-3.1-flash-lite') {
        return [
            '- MODEL PROFILE: Gemini 3.1 Flash-Lite.',
            `- MODEL RULE: You must check the provided previous page dialogues context and strictly reuse the exact same ${pronounTerm} and tone for the same characters.`,
            `- MODEL RULE: Keep the ${pronounSimple} simple, conversational, and highly consistent across all bubbles on the page.`,
            `- MODEL RULE: Translate to natural, everyday ${targetLangName} manga speech. Avoid overly formal, literal, or robotic wording.`,
            '- MODEL RULE: Keep translations short and compact so they fit inside speech bubbles easily.'
        ];
    }

    if (normalized.includes('flash-lite')) {
        return [
            '- MODEL PROFILE: Flash-Lite.',
            `- MODEL RULE: Prioritize short, natural, high-confidence ${targetLangName}. Prefer simple pronouns and avoid ornate wording.`,
            `- MODEL RULE: If speaker relationship is unclear, use the safest neutral ${targetLangName} pronoun pair that still sounds natural in manga dialogue.`,
            '- MODEL RULE: Preserve consistency across repeated lines, even if a later line is slightly more literal.'
        ];
    }

    if (normalized.includes('flash')) {
        return [
            '- MODEL PROFILE: Flash.',
            `- MODEL RULE: Balance naturalness, brevity, and context. Keep tone faithful and pronouns consistent across nearby bubbles.`,
            `- MODEL RULE: Prefer conversational ${targetLangName} that sounds like real manga dialogue instead of literal sentence-by-sentence translation.`
        ];
    }

    if (normalized.includes('pro')) {
        return [
            '- MODEL PROFILE: Pro.',
            `- MODEL RULE: Use the deepest available context to infer relationships, subtext, emotional tone, and honorific intent.`,
            `- MODEL RULE: Preserve nuanced pronouns, implied sarcasm, formality shifts, and character voice. Choose the most context-appropriate ${targetLangName} phrasing, not the most literal one.`,
            '- MODEL RULE: When dialogue is ambiguous, keep the scene coherent and prioritize consistent character speech patterns over isolated word-level accuracy.'
        ];
    }

    return [
        '- MODEL PROFILE: Balanced.',
        `- MODEL RULE: Keep the translation natural, concise, and faithful to context. Use consistent pronouns and tone across the page.`
    ];
}

export function toggleStoryMemory(enabled) {
    globalState.enableStoryMemory = Boolean(enabled);
    localStorage.setItem('manga_enable_story_memory', JSON.stringify(globalState.enableStoryMemory));
    showToast(enabled ? 'Đã bật Bộ nhớ ngữ cảnh chương' : 'Đã tắt Bộ nhớ ngữ cảnh chương', 'info');
}

export function updateStoryMemoryBadge() {
    const badge = document.getElementById('story-memory-badge');
    if (badge) {
        const count = (globalState.chapterStoryMemory || []).length;
        badge.textContent = `${count} trang`;
    }
}

export function clearStoryMemory() {
    globalState.chapterStoryMemory = [];
    localStorage.removeItem('manga_chapter_story_memory');
    updateStoryMemoryBadge();
    showToast('Đã xóa bộ nhớ ngữ cảnh chương.', 'success');
}

export function recordPageToStoryMemory(pageIndex, blocks) {
    if (!blocks || !blocks.length || !globalState.enableStoryMemory) return;
    const translatedLines = blocks.map(b => `${b.original} -> ${b.translated}`).filter(Boolean);
    if (!translatedLines.length) return;

    const summary = {
        pageIndex: pageIndex + 1,
        dialogueCount: blocks.length,
        excerpt: translatedLines.slice(0, 4).join('; ')
    };

    if (!globalState.chapterStoryMemory) globalState.chapterStoryMemory = [];
    globalState.chapterStoryMemory = globalState.chapterStoryMemory.filter(m => m.pageIndex !== summary.pageIndex);
    globalState.chapterStoryMemory.push(summary);
    if (globalState.chapterStoryMemory.length > 10) {
        globalState.chapterStoryMemory.shift();
    }
    updateStoryMemoryBadge();
}

export function viewStoryMemoryModal() {
    const memories = globalState.chapterStoryMemory || [];
    if (!memories.length) {
        showToast('Bộ nhớ ngữ cảnh hiện đang trống. Hãy dịch vài trang để tích lũy ngữ cảnh!', 'info');
        return;
    }
    const lines = memories.map(m => `Trang ${m.pageIndex}: ${m.excerpt}`);
    alert(`📖 BỘ NHỚ NGỮ CẢNH CHƯƠNG TRUYỆN (${memories.length} trang đã lưu):\n\n` + lines.join('\n\n'));
}

export function cancelBatchTranslation() {
    cancelTranslationFlag = true;
    showToast("Đang dừng tiến trình dịch thuật ngầm theo yêu cầu...", "warn");
}

export function buildLorebookPromptContext() {
    const parts = [];

    // Character Dossier
    if (globalState.characterDossier && globalState.characterDossier.length > 0) {
        const charLines = globalState.characterDossier.map(c => {
            let info = `${c.originalName || ''} -> ${c.translatedName || ''}`;
            if (c.gender) info += ` (${c.gender === 'male' ? 'Nam' : c.gender === 'female' ? 'Nữ' : 'Khác'})`;
            if (c.pronounSelf || c.pronounTarget) info += ` [Xưng hô: ${c.pronounSelf || 'tôi'} - ${c.pronounTarget || 'cậu'}]`;
            if (c.personality) info += ` - Tính cách: ${c.personality}`;
            if (c.notes) info += ` (${c.notes})`;
            return info;
        }).join('; ');
        parts.push(`- CHARACTER DOSSIER (STRICT NAMES & PRONOUNS): Enforce the following character names, gender, pronouns, and speech tone strictly across all pages: ${charLines}`);
    }

    // Lorebook Terms
    if (globalState.lorebook && globalState.lorebook.length > 0) {
        const loreLines = globalState.lorebook.map(l => {
            let info = `${l.originalTerm || ''} -> ${l.translatedTerm || ''}`;
            if (l.category) info += ` [Thể loại: ${l.category}]`;
            if (l.note) info += ` (Ghi chú: ${l.note})`;
            return info;
        }).join('; ');
        parts.push(`- LOREBOOK & WORLD TERMINOLOGY: Strictly use these exact translations for world-building terms, skills, locations, and items: ${loreLines}`);
    }

    return parts.join('\n');
}

export function getTranslationGuidancePrompt() {
    const guidanceParts = [];
    const customContextPrompt = globalState.translationContextPrompt.trim();
    const currentModelId = globalState.selectedModel || DEFAULT_MODEL;
    const targetLang = globalState.targetLanguage || 'vi';
    const targetLangName = TARGET_LANG_MAP[targetLang] || 'Vietnamese';
    const pronounTerm = targetLang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';

    // 1. Source Language Rule
    const srcLang = globalState.sourceLanguage || 'ja';
    if (srcLang === 'ja') {
        guidanceParts.push('- SOURCE LANGUAGE: Japanese Manga. Pay special attention to vertical writing, reading order (right-to-left), Japanese honorifics (-san, -kun, -chan, -sama), and SFX sound effects.');
    } else if (srcLang === 'zh') {
        guidanceParts.push(`- SOURCE LANGUAGE: Chinese Manhua. Translate idiom phrases naturally into ${targetLangName}, keep cultivation/wuxia/fantasy terms consistent.`);
    } else if (srcLang === 'ko') {
        guidanceParts.push(`- SOURCE LANGUAGE: Korean Manhwa. Handle Korean webtoon speech levels (jondaetmal/banmal) and sound effects smoothly in natural ${targetLangName}.`);
    } else if (srcLang === 'en') {
        guidanceParts.push(`- SOURCE LANGUAGE: English Comic/Scanlation. Translate natural conversational English into idiomatic ${targetLangName}, preserve comic jokes and slang.`);
    } else if (srcLang === 'auto') {
        guidanceParts.push('- SOURCE LANGUAGE: Auto-detect source language from image text.');
    }

    // 2. Writing Direction Rule
    if (['ja', 'zh', 'ko'].includes(targetLang)) {
        guidanceParts.push(`- WRITING DIRECTION RULE: The target language (${targetLangName}) is traditionally written vertically in manga/comics. Ensure that you set style.vertical = true in the JSON properties for each translated text block.`);
    }

    const genrePresets = globalState.translationGenrePresets.length ? globalState.translationGenrePresets : ['quality'];
    genrePresets.forEach((presetKey) => {
        let presetPrompt = TRANSLATION_GENRE_PRESETS[presetKey] || '';
        if (presetPrompt) {
            if (targetLang !== 'vi') {
                presetPrompt = presetPrompt
                    .replace(/Vietnamese/g, targetLangName)
                    .replace(/xưng hô/g, 'pronouns')
                    .replace(/Sino-Vietnamese \(Hán-Việt\)/g, 'appropriate historical/cultural');
            }
            guidanceParts.push(presetPrompt);
        }
    });

    if (genrePresets.length > 1) {
        guidanceParts.push(`- GENRE COMBINATION RULE: When multiple genre presets are selected, merge them naturally. Keep the strongest shared tone and do not make the translation overly long or conflicted.`);
    }
    if (customContextPrompt) {
        guidanceParts.push(`- USER CONTEXT / TRANSLATION GUIDANCE: ${customContextPrompt}`);
    }

    const lorebookPrompt = buildLorebookPromptContext();
    if (lorebookPrompt) {
        guidanceParts.push(lorebookPrompt);
    }

    if (globalState.enableStoryMemory && (globalState.chapterStoryMemory || []).length > 0) {
        const memoryText = globalState.chapterStoryMemory.map(m => `Trang ${m.pageIndex}: ${m.excerpt}`).join('; ');
        guidanceParts.push(`- CHAPTER STORY MEMORY (PREVIOUS PAGES CONTEXT): Here is the recent dialogue history from earlier pages in this chapter: ${memoryText}. Reuse the exact same character ${pronounTerm}, names, and overall tone to ensure continuity.`);
    }

    const pronounPrompt = compilePronounMatrixPrompt();
    if (pronounPrompt) {
        guidanceParts.push(pronounPrompt);
    }

    const dialogueRule = targetLang === 'vi' 
        ? '- DIALOGUE RULE: Choose Vietnamese xưng hô from the relationship and scene, not from the surface grammar. Keep xưng hô consistent across the page unless the relationship or mood changes.'
        : `- DIALOGUE RULE: Choose ${targetLangName} pronouns and forms of address from the relationship and scene, not from the surface grammar. Keep pronouns, address forms, and honorifics consistent across the page unless the relationship or mood changes.`;

    guidanceParts.push(
        `- TRANSLATION RULES: Keep ${targetLangName} natural and idiomatic. Prefer meaning over literal wording. Preserve character voice, emotions, jokes, pacing, and subtext.`,
        dialogueRule,
        '- CONTEXT RULE: Use neighboring bubbles to infer who is speaking, who is being addressed, and whether the line is polite, teasing, angry, shy, or formal.',
        '- BUBBLE RULE: If a box is uncertain, prefer the full bubble region over the exact glyph bounds so the text can be placed cleanly later.',
        `- CONSISTENCY RULE: Reuse the same ${targetLangName} translation for repeated names, terms, attacks, titles, and catchphrases within the same page or scene.`,
        '- STYLE RULE: Keep manga-friendly phrasing short and punchy. Do not overexplain. Preserve punctuation-driven emotion and broken-line rhythm.',
        `- SAFETY RULE: If a pronoun is ambiguous, choose the most neutral natural ${targetLangName} option that preserves the scene and stays consistent.`
    );

    if (currentModelId === 'gemini-3.1-flash-lite') {
        guidanceParts.push(
            `- 3.1 FLASH-LITE ADDITION: You must read the dialogues of the previous page if provided. Use the exact same ${pronounTerm} and tone for the characters to keep the story consistent.`,
            `- 3.1 FLASH-LITE ADDITION: Keep translations compact, natural, and character-faithful. Do not force overly literary ${targetLangName}.`,
            '- 3.1 FLASH-LITE ADDITION: Treat bubble fit as a placement helper, not a proof of exact glyph boundaries.'
        );
    }

    if (currentModelId.includes('pro')) {
        guidanceParts.push(
            `- PRO ADDITION: Preserve subtle honorific intent, indirect speech, implied hierarchy, and sarcasm. Use richer context when selecting ${pronounTerm}.`,
            '- PRO ADDITION: Narration should be polished and readable; dialogue should sound like a native comic translation, not like literary prose.'
        );
    } else if (currentModelId.includes('flash-lite')) {
        guidanceParts.push(
            `- FLASH-LITE ADDITION: Be concise but do not flatten personality. Keep the shortest natural ${targetLangName} that still preserves tone and character relationships.`,
            `- FLASH-LITE ADDITION: Prefer stable, low-risk pronouns when the relationship is not explicit.`
        );
    } else if (currentModelId.includes('flash')) {
        guidanceParts.push(
            `- FLASH ADDITION: Keep translations compact and natural. Maintain a good balance between speed, context, and nuance.`
        );
    }

    getModelTranslationProfile(currentModelId).forEach((rule) => guidanceParts.push(rule));

    return guidanceParts.length > 0 ? `\n${guidanceParts.join('\n')}` : '';
}

// Helper: convert File -> raw Base64, tránh tạo DataURL trung gian để giảm peak memory
export async function getBase64(file) {
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
    } catch (error) {
        throw new Error(`Không thể đọc tệp hình ảnh. Chi tiết: ${error.message}`);
    }
}

// OCR Image Pre-processing (High Contrast & Sharpness Boost for better OCR accuracy)
export async function enhanceImageForOcr(file) {
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

            ctx.drawImage(img, 0, 0);

            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;

            const contrast = 1.20; // 20% contrast boost
            const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));

            for (let i = 0; i < data.length; i += 4) {
                const gray = (0.299 * data[i]) + (0.587 * data[i + 1]) + (0.114 * data[i + 2]);
                const enhanced = factor * (gray - 128) + 128;
                const clamped = Math.max(0, Math.min(255, enhanced));

                data[i] = clamped;
                data[i + 1] = clamped;
                data[i + 2] = clamped;
            }

            ctx.putImageData(imgData, 0, 0);

            canvas.toBlob((blob) => {
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

export async function translateActivePage() {
    if (globalState.activePageIndex === -1) {
        showToast("Vui lòng chọn một trang trước khi dịch.", "warn");
        return;
    }

    await translatePage(globalState.activePageIndex, false);
}

export async function translateSinglePageInBatch(index) {
    if (isBatchTranslating) {
        showToast("Tiến trình dịch hàng loạt đang chạy. Vui lòng dừng hoặc chờ hoàn tất trước.", "warn");
        return;
    }

    await translatePage(index, false);
}

export async function translatePage(pageIndex, isBackgroundMode = false) {
    if (pageIndex < 0 || pageIndex >= globalState.pages.length) return false;
    const page = globalState.pages[pageIndex];

    // Đảm bảo trang được dịch có đầy đủ tài nguyên ảnh gốc hoạt động
    activatePage(page);

    // Check for API key (use global or custom)
    const keyToUse = getGeminiApiKey();
    if (!keyToUse) {
        showToast("Vui lòng nhập Gemini API Key trước khi dịch.", "error");
        elements.apiKeyInput.focus();
        return false;
    }

    const totalPages = globalState.pages.length;
    const progressVal = Math.round((pageIndex / totalPages) * 100);

    // Thiết lập trạng thái trang đang dịch
    page.status = 'processing';
    uiUpdatePageListUI();
    savePageToDB(page);

    const updateProgressMsg = (title, subtitle, percent) => {
        if (isBackgroundMode) {
            uiUpdateBackgroundTaskOverlay(true, title, subtitle, percent);
        } else {
            uiUpdateProcessingOverlay(true, title, subtitle, percent);
        }
    };

    updateProgressMsg(
        "Đang nhận diện & dịch...",
        `Trang ${pageIndex + 1}/${totalPages}: Đang đọc ảnh thô...`,
        isBackgroundMode ? progressVal : 20
    );

    let attempts = globalState.maxRetries !== undefined ? globalState.maxRetries : 5; // Thử lại tối đa maxRetries lần nếu gặp lỗi 429 hoặc 503
    let retryDelay = 10000; // Khởi đầu chờ 10 giây, tăng dần theo luỳ thừa

    while (attempts > 0) {
        if (cancelTranslationFlag) {
            page.status = 'draft';
            uiUpdatePageListUI();
            savePageToDB(page);
            return false;
        }

        let timeoutId;

        try {
            // Read file as base64 (with optional high-contrast OCR enhancement)
            const fileForOcr = globalState.ocrEnhanceEnabled ? await enhanceImageForOcr(page.file) : page.file;
            const rawBase64 = await getBase64(fileForOcr);
            const mimeType = fileForOcr.type || page.file.type;

            const glossaryNames = globalState.preserveNames ? globalState.glossaryNames.trim() : "";
            const weakModel = isWeakTranslationModel(globalState.selectedModel);
            const targetLang = globalState.targetLanguage || 'vi';
            const targetLangName = TARGET_LANG_MAP[targetLang] || 'Vietnamese';
            const pronounTerm = targetLang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';

            // Xây dựng ngữ cảnh dịch thuật dựa trên trang dịch liền kề trước đó
            let prevPageContext = "";
            if (pageIndex > 0) {
                const prevPage = globalState.pages[pageIndex - 1];
                if (prevPage && prevPage.blocks && prevPage.blocks.length > 0) {
                    const prevDialogues = prevPage.blocks
                        .filter(b => b.translated && b.translated.trim())
                        .map((b, idx) => `Bubble #${idx + 1} (${b.type || 'dialogue'}): "${b.original || ''}" -> "${b.translated}"`)
                        .join("\n");
                    if (prevDialogues) {
                        prevPageContext = `[PREVIOUS PAGE DIALOGUE HISTORY FOR CONSISTENCY]\n${prevDialogues}\n\nStrict Rule: Use the same character ${pronounTerm} and names as shown in the translation list above if the speakers are the same characters.`;
                    }
                }
            }

            let systemInstruction;
            if (weakModel) {
                systemInstruction = [
                    "You are a professional manga translator and OCR/text detector.",
                    "Detect ALL text regions on the manga page: speech bubbles (dialogue), narration boxes (narration), sound effect labels (sfx), and signboards/labels (other). Return valid JSON only.",
                    "For each block, estimate bounding box coordinates (x, y, w, h) using Google Gemini's native integer scale of 0 to 1000 (where x=0, y=0 is top-left and x=1000, y=1000 is bottom-right). Example: x=200, y=150, w=300, h=250.",
                    "For speech bubbles (dialogue) and narration boxes, use a box covering the entire inner blank space of the bubble so translated text fits easily. For SFX sound effects and signs, use the tightest box covering the characters.",
                    "IMPORTANT RULE FOR CONNECTED BUBBLES: When multiple speech bubbles are attached/connected together (such as double-bubbles, stacked connected lobes, or chained bubbles), treat EACH lobe/section as a SEPARATE block with its own bounding box. Do NOT merge connected or stacked bubble sections into a single large block.",
                    "Do not split lines of text inside the SAME single bubble lobe into separate blocks. Only split when bubbles are connected/chained across separate lobes or tails.",
                    "Set positionKnown=true whenever text is visible and can be localized.",
                    "Set positionKnown=false only when text location cannot be localized.",
                    `Translate text to short, conversational, and natural ${targetLangName} manga dialogue. Keep narrations smooth.`,
                    "Classify block.type accurately: 'dialogue' for speech bubbles, 'narration' for caption boxes, 'sfx' for sound effects, 'other' for signs/labels.",
                    `Ensure ${pronounTerm} are highly consistent across nearby bubbles and match the previous page history.`,
                    globalState.preserveNames ? "Keep proper names unchanged unless the glossary says otherwise." : "",
                    glossaryNames ? `Keep these names exactly as written: ${glossaryNames}.` : "",
                    getTranslationGuidancePrompt().trim()
                ].filter(Boolean).join(" ");
            } else {
                systemInstruction = [
                    "Detect every manga text bubble, narration box, SFX label, and sign/label area, then return JSON only.",
                    "For each block, estimate box coordinates (x, y, w, h) on an integer scale of 0 to 1000 (where x=0, y=0 is top-left, and x=1000, y=1000 is bottom-right).",
                    "For speech bubbles (dialogue) and narration boxes, use a box that covers the entire inner blank space of the bubble or box (leaving a small 2% padding near the black outlines) rather than just the tight bounds of the original characters. This ensures there is sufficient room for the translated text. For SFX and signs, use the tightest box covering the characters.",
                    "IMPORTANT RULE FOR CONNECTED BUBBLES: When multiple speech bubbles are attached or connected together in double-bubbles or stacked lobes, treat EACH individual bubble lobe/section as a SEPARATE block with its own box coordinates. Do NOT group text from connected/chained bubble lobes into a single bounding box.",
                    "Do not split text inside the SAME bubble lobe into separate blocks, but ALWAYS separate connected/stacked bubble lobes.",
                    "Do not center by default.",
                    "Set positionKnown=true whenever the text region is visible enough to place a box.",
                    "Set positionKnown=false only when the text location is truly unreadable or cannot be localized.",
                    `Translate to short, natural ${targetLangName} that matches the scene, speaker relationship, and block type.`,
                    "Use block.type to guide style: dialogue should sound conversational, narration should be neutral and smooth, SFX should be short and expressive, labels/signs should be clear and concise.",
                    `Preserve the same ${targetLangName} ${targetLang === 'vi' ? 'xưng hô' : 'pronouns'} and terminology within the page whenever the relationship stays the same.`,
                    "Keep line breaks and pacing natural for manga dialogue. Do not over-literalize Japanese sentence order.",
                    globalState.preserveNames ? "Keep proper names unchanged unless the glossary says otherwise." : "",
                    glossaryNames ? `Keep these names exactly as written: ${glossaryNames}.` : "",
                    getTranslationGuidancePrompt().trim()
                ].filter(Boolean).join(" ");
            }

            const contentsParts = [
                { text: `Detect all speech bubbles, narration boxes, SFX sound effects, and signs/labels. Translate their contents into ${targetLangName} using the strict schema. Return only valid JSON that matches the schema.` }
            ];
            if (prevPageContext) {
                contentsParts.push({ text: prevPageContext });
            }
            contentsParts.push({ inlineData: { mimeType: mimeType, data: rawBase64 } });

            const payload = {
                contents: [{
                    parts: contentsParts
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
                                        type: { type: "STRING" },
                                        original: { type: "STRING" },
                                        translated: { type: "STRING" },
                                        box: {
                                            type: "OBJECT",
                                            properties: {
                                                x: { type: "NUMBER" },
                                                y: { type: "NUMBER" },
                                                w: { type: "NUMBER" },
                                                h: { type: "NUMBER" }
                                             },
                                            required: ["x", "y", "w", "h"]
                                        },
                                        positionKnown: {
                                            type: "BOOLEAN"
                                        },
                                        style: {
                                            type: "OBJECT",
                                            properties: {
                                                vertical: { type: "BOOLEAN" }
                                            }
                                        }
                                    },
                                    required: ["id", "type", "original", "translated", "box", "positionKnown"]
                                }
                             }
                        },
                        required: ["blocks"]
                    }
                },
                systemInstruction: {
                    parts: [{ text: systemInstruction }]
                }
            };

            updateProgressMsg(
                "Đang kết nối Gemini AI...",
                `Trang ${pageIndex + 1}/${totalPages}: Đang phân tích thoại bằng AI...`,
                isBackgroundMode ? progressVal : 50
            );

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${globalState.selectedModel}:generateContent?key=${keyToUse}`;

            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 45000); // 45 giây timeout

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.status === 429 || response.status === 503 || response.status === 500 || response.status === 504) {
                attempts--;
                if (attempts > 0) {
                    const errorTypeLabel = response.status === 429 ? "Quá tải giới hạn lượt gọi (429)" :
                        response.status === 503 ? "Server Google đang bận/quá tải (503)" :
                            `Lỗi hệ thống tạm thời (${response.status})`;

                    showToast(`API bận ở trang ${pageIndex + 1}: ${errorTypeLabel}. Tự động chờ ${retryDelay / 1000}s rồi thử lại...`, "warn");

                    for (let delay = 0; delay < (retryDelay / 100); delay++) {
                        if (cancelTranslationFlag) break;
                        const delayPercent = Math.round((delay / (retryDelay / 100)) * 100);
                        updateProgressMsg(
                            "Đang tự động kết nối lại...",
                            `Bị nghẽn (${response.status}). Đang dừng nghỉ ${retryDelay / 1000}s để gửi lại...`,
                            delayPercent
                        );
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    retryDelay *= 2;
                    continue;
                } else {
                    throw new Error(response.status === 503 ? "Máy chủ Google hiện đang quá tải cực nặng (Lỗi 503). Vui lòng thử lại sau vài phút." : `API tạm thời ngắt kết nối (Lỗi ${response.status}).`);
                }
            }

            if (!response.ok) {
                let errorDetail = "";
                try {
                    const errorJson = await response.json();
                    errorDetail = errorJson.error?.message || "";
                } catch (e) { }
                throw new Error(errorDetail ? `Lỗi API (${response.status}): ${errorDetail}` : `API Error: ${response.status} ${response.statusText || "Yêu cầu không hợp lệ"}`);
            }

            const result = await response.json();
            updateProgressMsg(
                "Đang dựng bản dịch...",
                `Trang ${pageIndex + 1}/${totalPages}: Đang tính toán tỷ lệ bong bóng thoại...`,
                isBackgroundMode ? progressVal : 85
            );

            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!jsonText) throw new Error("Không nhận được dữ liệu phản hữu dụng từ AI.");

            const data = parseGeminiJsonText(jsonText);

            let pageImageData = page.imageDataCache || null;
            if (!pageImageData) {
                try {
                    const img = new Image();
                    img.src = page.src;
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                    });
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    pageImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    page.imageDataCache = pageImageData;
                } catch (e) {
                    console.error("Không thể lấy imageData của trang để chạy snapBoxToContours:", e);
                }
            }

            // Lưu trạng thái trước khi thay đổi ô thoại
            pushStateToHistory();

            page.blocks = (data.blocks || []).map((b, idx) => {
                const normalisedBox = b.positionKnown === false
                    ? { ...DEFAULT_AI_BLOCK_BOX }
                    : refineAiBlockBox(b.box, pageImageData, globalState.selectedModel);

                // Default to vertical layout if target language is ja, zh, or ko and not overridden by AI
                const isVerticalTarget = ['ja', 'zh', 'ko'].includes(targetLang);
                const blockVertical = (b.style && typeof b.style.vertical === 'boolean')
                    ? b.style.vertical
                    : isVerticalTarget;

                return {
                    id: b.id || `block_${Date.now()}_${idx}`,
                    type: b.type || 'dialogue',
                    original: b.original || '',
                    translated: b.translated || '',
                    box: normalisedBox,
                    style: {
                        fontFamily: globalState.globalStyle.fontFamily,
                        fontSize: globalState.globalStyle.fontSize,
                        textColor: '#000000',
                        bgColor: '#ffffff',
                        bgOpacity: 100,
                        padding: globalState.globalStyle.padding,
                        rotate: 0,
                        vertical: blockVertical,
                        bold: globalState.globalStyle.bold,
                        align: globalState.globalStyle.align,
                        maskShape: globalState.globalStyle.maskShape,
                        maskSize: globalState.globalStyle.maskSize,
                        strokeColor: '#ffffff',
                        strokeWidth: 0,
                        shadowColor: '#000000',
                        shadowBlur: 0
                    }
                };
            });

            // Tự động phân tích ảnh gốc và khớp Font & Màu sắc cho từng ô thoại
            const imgEl = elements.mangaBgImage;
            if (imgEl && imgEl.naturalWidth) {
                try {
                    const { autoMatchBlockStyle } = await import('./canvas.js');
                    page.blocks.forEach(b => autoMatchBlockStyle(b, imgEl));
                } catch (e) { }
            }

            page.status = 'done';
            recordPageToStoryMemory(pageIndex, page.blocks);
            uiUpdatePageListUI();
            savePageToDB(page);

            if (globalState.activePageIndex === pageIndex) {
                globalState.selectedBlockId = null;
                requestOverlayRender();
                uiUpdateActiveBlockEditor();
            }

            showToast(`Đã dịch xong trang ${pageIndex + 1}!`, "success");
            return true;

        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);
            console.error("Lỗi chi tiết khi dịch trang:", error);

            const isTimeout = error.name === 'AbortError';
            const isNetworkError = error.message && (error.message.includes('Failed to fetch') || error.message.includes('network') || error.message.includes('NetworkError'));

            if (isTimeout || isNetworkError) {
                attempts--;
                if (attempts > 0) {
                    const errorLabel = isTimeout ? "Thời gian yêu cầu quá hạn (Timeout 45s)" : "Mất kết nối mạng";
                    showToast(`API bận ở trang ${pageIndex + 1}: ${errorLabel}. Tự động chờ ${retryDelay / 1000}s rồi thử lại...`, "warn");

                    for (let delay = 0; delay < (retryDelay / 100); delay++) {
                        if (cancelTranslationFlag) break;
                        const delayPercent = Math.round((delay / (retryDelay / 100)) * 100);
                        updateProgressMsg(
                            "Đang tự động kết nối lại...",
                            `${isTimeout ? "Quá hạn" : "Lỗi mạng"}. Đang dừng nghỉ ${retryDelay / 1000}s để gửi lại...`,
                            delayPercent
                        );
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    retryDelay *= 2;
                    continue;
                }
            }

            page.status = 'error';
            uiUpdatePageListUI();
            savePageToDB(page);

            let errorMessage = "Đã xảy ra lỗi không xác định.";
            if (isTimeout) {
                errorMessage = "Kết nối API quá hạn (Timeout 45s). Vui lòng kiểm tra lại mạng hoặc chuyển đổi Model.";
            } else if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === 'string') {
                errorMessage = error;
            } else if (error && typeof error === 'object') {
                errorMessage = error.message || error.statusText || JSON.stringify(error);
            }

            showToast(`Lỗi khi dịch trang ${pageIndex + 1}: ${errorMessage}`, "error");
            return false;
        } finally {
            if (!isBackgroundMode) {
                uiUpdateProcessingOverlay(false);
            }
            if (isBackgroundMode && pageIndex !== globalState.activePageIndex) {
                deactivatePage(page);
            }
            garbageCollectPageCaches();
        }
    }
    return false;
}

export async function runBatchTranslation() {
    if (globalState.pages.length === 0) return;
    if (!getGeminiApiKey()) {
        showToast("Vui lòng nhập Gemini API Key trước khi dịch.", "error");
        elements.apiKeyInput.focus();
        return;
    }

    if (isBatchTranslating) {
        showToast("Tiến trình dịch thuật đang chạy ngầm!", "warn");
        return;
    }

    cancelTranslationFlag = false;
    isBatchTranslating = true;
    showToast('Đang tiến hành dịch hàng loạt dưới nền. Bạn có thể tiếp tục chỉnh sửa các trang khác!', 'success');

    for (let i = 0; i < globalState.pages.length; i++) {
        if (globalState.pages[i].status === 'draft' || globalState.pages[i].status === 'error') {
            globalState.pages[i].status = 'queued';
            savePageToDB(globalState.pages[i]);
        }
    }
    uiUpdatePageListUI();

    const totalPages = globalState.pages.length;

    for (let i = 0; i < totalPages; i++) {
        if (cancelTranslationFlag) {
            showToast("Đã dừng hàng loạt tiến trình dịch ngầm.", "warn");
            break;
        }

        const page = globalState.pages[i];
        if (page.status !== 'queued') continue;

        try {
            const delaySteps = (globalState.apiDelay !== undefined ? globalState.apiDelay : 8) * 10;
            if (i > 0 && delaySteps > 0) {
                let delayProgress = 0;
                for (let delay = 0; delay < delaySteps; delay++) {
                    if (cancelTranslationFlag) break;
                    delayProgress = Math.round((delay / delaySteps) * 100);
                    uiUpdateBackgroundTaskOverlay(
                        true,
                        "Đang chờ giãn cách API...",
                        `Trang ${i + 1}/${totalPages}: Tạm nghỉ bảo vệ API Key tránh quá tải... (Còn ${Math.ceil((delaySteps - delay) / 10)} giây)`,
                        delayProgress
                    );
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            if (cancelTranslationFlag) {
                showToast("Đã dừng hàng loạt tiến trình dịch ngầm.", "warn");
                break;
            }

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
        }
    }

    for (let i = 0; i < globalState.pages.length; i++) {
        if (globalState.pages[i].status === 'queued') {
            globalState.pages[i].status = 'draft';
            savePageToDB(globalState.pages[i]);
        }
    }

    isBatchTranslating = false;
    uiUpdatePageListUI();
    uiUpdateBackgroundTaskOverlay(false);
}

export async function requestAiInpaintPatch(page, block, cropX, cropY, cropW, cropH) {
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
    tempCtx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // Perform text cleaning & background reconstruction
    const { cleanMangaTextRegion } = await import('./inpainting.js');
    cleanMangaTextRegion(tempCtx, cropW, cropH, true);

    const canvas = elements.eraserCanvas;
    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;

    const eraserCtx = canvas.getContext('2d');
    eraserCtx.drawImage(tempCanvas, cropX, cropY);
    return true;
}

// Bind to window for inline HTML onclick handlers
window.toggleStoryMemory = toggleStoryMemory;
window.clearStoryMemory = clearStoryMemory;
window.viewStoryMemoryModal = viewStoryMemoryModal;
window.cancelBatchTranslation = cancelBatchTranslation;
window.translateActivePage = translateActivePage;
window.runBatchTranslation = runBatchTranslation;
window.requestAiInpaintPatch = requestAiInpaintPatch;
