// AI Translation & Story Memory Management
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
    uiUpdateActiveBlockEditor,
    isWeakTranslationModel
} from '../../core/state';
import {
    VALID_MODEL_IDS,
    DEFAULT_MODEL,
    DEFAULT_PIPELINE_MODE,
    DEFAULT_OCR_MODEL,
    DEFAULT_TRANSLATION_MODEL,
    DEFAULT_AI_BLOCK_BOX,
    COMIC_UNIVERSE_PRESETS,
    COMIC_GENRE_PRESETS,
    COMIC_TONE_PRESETS,
    TARGET_LANG_MAP
} from '../../config/constants';
import { elements } from '../../core/elements';
import { showToast } from '../../core/utils/dom';
import { parseGeminiJsonText } from '../../core/utils/json';
import { refineAiBlockBox, mergeOverlappingAiBlocks } from '../ocr/ocr-service';
import { requestOverlayRender, autoMatchBlockStyle } from '../canvas/canvas-service';
import { autoFitBlock, isBlockAutoFit } from '../canvas/canvas-styling';
import { compilePronounMatrixPrompt } from '../pronoun';
import { getConfiguredApiKey, getGeminiGenerateContentUrl, getConfiguredAiProvider, getConfiguredApiEndpoint } from './ai-config';
import { MangaBlock, MangaPage } from '../../types/index';

export let cancelTranslationFlag = false;
export let isBatchTranslating = false;

export function setCancelTranslationFlag(val: boolean): void {
    cancelTranslationFlag = val;
}

export function setIsBatchTranslating(val: boolean): void {
    isBatchTranslating = val;
}

export function getGeminiApiKey(): string {
    return getConfiguredApiKey();
}

export function normalizeModelId(modelId?: string): string {
    if (!modelId) return DEFAULT_MODEL;
    if (modelId.startsWith('gemini-')) return modelId;
    return (VALID_MODEL_IDS as readonly string[]).includes(modelId) ? modelId : DEFAULT_MODEL;
}

export function getDefaultFontForBlockType(type?: string): string {
    const cleanType = String(type || '').trim().toLowerCase();
    if (cleanType === 'narration') return globalState.defaultNarrationFont || 'font-vietnamese';
    if (cleanType === 'thought') return globalState.defaultThoughtFont || 'font-comicneue';
    if (cleanType === 'sfx') return globalState.defaultSfxFont || 'font-impact';
    return globalState.defaultDialogueFont || globalState.defaultFont || 'font-manga';
}

export function getModelTranslationProfile(modelId?: string): string[] {
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

export function toggleStoryMemory(enabled: boolean): void {
    globalState.enableStoryMemory = Boolean(enabled);
    localStorage.setItem('manga_enable_story_memory', JSON.stringify(globalState.enableStoryMemory));
    showToast(enabled ? 'Đã bật Bộ nhớ ngữ cảnh chương' : 'Đã tắt Bộ nhớ ngữ cảnh chương', 'info');
}

export function updateStoryMemoryBadge(): void {
    const badge = document.getElementById('story-memory-badge');
    if (badge) {
        const count = (globalState.chapterStoryMemory || []).length;
        badge.textContent = `${count} trang`;
    }
}

export function clearStoryMemory(): void {
    globalState.chapterStoryMemory = [];
    localStorage.removeItem('manga_chapter_story_memory');
    updateStoryMemoryBadge();
    showToast('Đã xóa bộ nhớ ngữ cảnh chương.', 'success');
}

export function recordPageToStoryMemory(pageIndex: number, blocks: MangaBlock[]): void {
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

export function viewStoryMemoryModal(): void {
    const memories = globalState.chapterStoryMemory || [];
    if (!memories.length) {
        showToast('Bộ nhớ ngữ cảnh hiện đang trống. Hãy dịch vài trang để tích lũy ngữ cảnh!', 'info');
        return;
    }
    const lines = memories.map(m => `Trang ${m.pageIndex}: ${m.excerpt}`);
    alert(`📖 BỘ NHỚ NGỮ CẢNH CHƯƠNG TRUYỆN (${memories.length} trang đã lưu):\n\n` + lines.join('\n\n'));
}

export function cancelBatchTranslation(): void {
    cancelTranslationFlag = true;
    showToast("Đang dừng tiến trình dịch thuật ngầm theo yêu cầu...", "warn");
}

export function buildLorebookPromptContext(): string {
    const parts: string[] = [];

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

export function getTranslationGuidancePrompt(): string {
    const guidanceParts: string[] = [];
    const customContextPrompt = (globalState.translationContextPrompt || '').trim();
    const currentModelId = globalState.selectedModel || DEFAULT_MODEL;
    const targetLang = globalState.targetLanguage || 'vi';
    const targetLangName = TARGET_LANG_MAP[targetLang] || 'Vietnamese';
    const pronounTerm = targetLang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';

    guidanceParts.push(
        `- ROLE: You are a professional Scanlation Localizer and Manga Editor. Translate meaning, tone, and emotion—NEVER translate word-for-word.`
    );

    if (targetLang === 'vi') {
        guidanceParts.push(
            `- MANGA LOCALIZATION RULES (BẮT BUỘC BẢN DỊCH TIẾNG VIỆT):`,
            `  1. VĂN NÓI / KHẨU NGỮ: Dùng văn nói giao tiếp tự nhiên của giới trẻ/truyện tranh. Tận dụng tối đa từ đệm ngữ điệu phù hợp ngữ cảnh: "hả, đấy, chứ, nha, nhé, cơ, sao, đâu, thiệt luôn, chứ lị, mất thôi...".`,
            `  2. TRIỆT TIÊU VĂN MÁY MÓC & DỊCH THÔ:`,
            `     - TRÁNH lạm dụng đại từ "tôi/bạn" sượng sùng. Bỏ bớt đại từ nhân xưng khi ngữ cảnh đã rõ ai đang nói.`,
            `     - TRÁNH câu dịch xuôi cấu trúc Anh/Nhật (VD: KHÔNG dịch "Bạn đang làm gì vậy?", HÃY dịch "Làm gì đấy?" / "Tính làm gì hả?").`,
            `     - TRÁNH từ nối khô cứng ("Bởi vì...", "Mặc dù...", "Bị/Được...").`,
            `  3. XƯNG HÔ NĂNG ĐỘNG (DỌN ĐƯỜNG CHO I/YOU): Tiếng Anh chỉ có "I/You". Cần tự động suy đoán vị thế, tuổi tác và thái độ nhân vật để chọn cặp xưng hô tự nhiên (mày-tao, cậu-tớ, anh-em, sếp-em...), tuyệt đối không giữ tôi-bạn trung tính.`,
            `  4. CHUYỂN ĐỔI TỪ CẢM THÁN & TỪ LÓNG (SLANG/IDIOMS): Dịch linh hoạt từ lóng, cụm từ cố định và từ cảm thán sang khẩu ngữ tiếng Việt tương đương (VD: "Guh/Ugh" -> "Hừ/Haiz", "Holy crap" -> "Vãi thật/Trời ơi", "No way" -> "Làm gì có/Không đời nào", "I'm on it" -> "Để đó cho tôi/Có ngay").`,
            `  5. NGẮN GỌN & ĐẤM THÉP: Ô thoại truyện tranh rất nhỏ. Ưu tiên câu ngắn, súc tích, giật gân, nói đổng hoặc lược bỏ chủ ngữ nếu cần thiết.`,
            `  6. VÍ DỤ CHUẨN MẪU (FEW-SHOT EXAMPLES):`,
            `     - "What are you doing?" -> Dịch dở: "Bạn đang làm gì?" | Dịch chuẩn Manga: "Làm gì đấy?" / "Tính làm trò gì hả?"`,
            `     - "I see..." -> Dịch dở: "Tôi hiểu rồi." | Dịch chuẩn Manga: "Ra thế..." / "Thế à..."`,
            `     - "It can't be helped." -> Dịch dở: "Nó không thể giúp được." | Dịch chuẩn Manga: "Đành chịu thôi." / "Biết sao giờ."`,
            `     - "Really?" -> Dịch dở: "Thật sao?" | Dịch chuẩn Manga: "Thật luôn?" / "Thiệt hả?"`,
            `     - "Unbelievable!" -> Dịch dở: "Không thể tin được!" | Dịch chuẩn Manga: "Ảo thật đấy!" / "Vô lý!"`,
            `     - "Holy crap!" -> Dịch dở: "Thánh phân!" | Dịch chuẩn Manga: "Vãi thật!" / "Trời đất ơi!"`,
            `     - "No way!" -> Dịch dở: "Không có đường!" | Dịch chuẩn Manga: "Làm gì có!" / "Không đời nào!"`
        );
    }

    const srcLang = globalState.sourceLanguage || 'ja';
    if (srcLang === 'ja') {
        if (targetLang === 'vi') {
            guidanceParts.push(
                `- JAPANESE TO VIETNAMESE MANGA TRANSLATION MASTER SPECIFICATION:`,
                `  1. XƯNG HÔ ĐA DẠNG & SẮC THÁI NHÂN VẬT (PRONOUNS & PERSONA):`,
                `     - 私 (Watashi) -> Trọng thị/Lịch sự: "Tôi/Em/Cháu"; Nữ thân mật: "Tớ/Em"; Bình thản: "Tôi".`,
                `     - 僕 (Boku) -> Nam dịu dàng, khiêm tốn, con trai trẻ: "Tớ - Cậu", "Anh - Em", "Em - Anh/Chị".`,
                `     - 俺 (Ore) -> Nam tính, mạnh mẽ, năng động, bốc đồng: "Tao - Mày", "Anh - Em", "Tôi".`,
                `     - あたし (Atashi) -> Nữ tính, điệu đà, nhí nhảnh: "Tớ", "Em", "Con".`,
                `     - 俺様 (Oresama) -> Kiêu ngạo, hợm hĩnh: "Bổn thiếu gia", "Ta", "Đại gia đây".`,
                `     - あなた (Anata) -> Vợ gọi chồng: "Anh"; Thân mật: "Cậu/Anh"; Lịch sự: "Anh/Chị/Ông".`,
                `     - お前 (Omae) -> Thân thiết/Ngang hàng: "Mày - Tao", "Cậu - Tớ"; Bề trên: "Chú em", "Thằng này".`,
                `     - 貴様 (Kisama) / 手前 (Teme) -> Tức giận, thù địch: "Thằng ranh", "Mày", "Tên kia", "Thằng nhãi".`,
                `     - 君 (Kimi) -> Người trên/bằng vai gọi nhẹ nhàng: "Cậu", "Em".`,
                `  2. TỪ ĐỆM & NGỮ ĐIỆU CUỐI CÂU (終助詞 - SENTENCE-ENDING PARTICLES):`,
                `     - ね (ne) -> "nhé", "nha", "đúng không", "nhỉ".`,
                `     - よ (yo) -> "đấy", "đó nha", "này".`,
                `     - な (na) / ぞ (zo) -> "đấy", "chưa", "đó".`,
                `     - わ (wa) -> "nha", "đấy", "mà".`,
                `     - かしら (kashira) -> "không biết nữa", "nhỉ", "sao ta".`,
                `     - じゃん (jan) -> "còn gì", "mà", "đấy thôi".`,
                `     - っけ (kke) -> "hả", "nhỉ", "quên mất".`,
                `  3. TỪ ĐỆM GIAO TIẾP & KHẨU NGỮ (AIZUCHI & CONVERSATIONAL IDIOMS):`,
                `     - なるほど (Naruhodo) -> "Ra là thế...", "Thì ra là vậy".`,
                `     - まさか (Masaka) -> "Chẳng lẽ...", "Không thể nào!", "Làm gì có!".`,
                `     - やっぱり (Yappari) -> "Quả nhiên...", "Y như rằng...", "Đúng là...".`,
                `     - やれやれ (Yare yare) -> "Haiz...", "Thiệt tình...", "Mệt mỏi thật đấy...".`,
                `     - マジで (Maji de) -> "Thật luôn?", "Thiệt hả?", "Nói nghiêm túc đấy!".`,
                `     - ヤバい (Yabai) -> "Tệ rồi!", "Đỉnh vãi!", "Chết dở!", "Vãi thật!".`,
                `     - べつに (Betsuni) -> "Đâu có gì...", "Chả có gì hết."`,
                `     - うざい (Uzai) -> "Phiền phức!", "Chướng mắt!".`,
                `  4. HẬU TỐ XƯNG HÔ (HONORIFICS): GIỮ NGUYÊN các hậu tố danh xưng Nhật Bản quen thuộc ghép phía sau tên riêng:`,
                `     - ～さん (-san), ～ちゃん (-chan), ～くん (-kun), ～様 (-sama), ～先輩 (-senpai), ～先生 (-sensei), ～殿 (-dono).`,
                `  5. TỪ TƯỢNG THANH / TỪ TƯỢNG HÌNH (SFX): Dịch sang từ cảm thán hoặc từ mô tả âm thanh/hành động tự nhiên trong tiếng Việt.`
            );
        } else {
            guidanceParts.push('- SOURCE LANGUAGE: Japanese Manga. Pay special attention to vertical writing, reading order (right-to-left), Japanese honorifics (-san, -kun, -chan, -sama), and SFX sound effects.');
        }
    } else if (srcLang === 'zh') {
        if (targetLang === 'vi') {
            guidanceParts.push(
                `- CHINESE TO VIETNAMESE MANHWA TRANSLATION MASTER SPECIFICATION:`,
                `  1. QUY TẮC XƯNG HÔ & VĂN PHONG THEO BỐI CẢNH (PRONOUNS & PERSONA):`,
                `     - HIỆN ĐẠI / ĐÔ THỊ / HỌC ĐƯỜNG: Bắt buộc chọn cặp xưng hô tiếng Việt tự nhiên phù hợp ngữ cảnh (cậu-tớ, mày-tao, anh-em, tôi-cậu, chú-cháu, sếp-em...). TUYỆT ĐỐI KHÔNG dùng đại từ "tôi - bạn" sượng sùng. Bỏ 我/你 khi ngữ cảnh đã rõ.`,
                `     - TIÊN HIỆP / KIẾM HIỆP / HUYỀN HUYỄN / CỔ ĐẠI:`,
                `       * Tự xưng tôn xưng / Bề trên: 本座 (Bổn tọa), 本王 (Bổn vương), 本帝 (Bổn đế), 本少 (Bổn thiếu gia), 老夫 (Lão phu), 朕 (Trẫm), 妾身 (Thiếp thân) -> Dịch giữ khí phách Hán Việt ("Bổn tọa", "Bổn vương", "Bổn thiếu gia", "Lão phu", "Ta").`,
                `       * Khiêm xưng / Hậu bối: 在下 (Tại hạ), 鄙人 (Bỉ nhân), 小弟 (Tiểu đệ), 晚辈 (Vãn bối) -> Dịch "Tại hạ", "Vãn bối", "Tiểu đệ", "Cháu/Em".`,
                `       * Sư môn & Tôn xưng: 师兄 (Sư huynh), 师姐 (Sư tỷ), 师弟 (Sư đệ), 师妹 (Sư muội), 师父/师傅 (Sư phụ), 尊上 (Tôn thượng), 前辈 (Tiền bối), 道友 (Đạo hữu), 阁下 (Các hạ).`,
                `       * Thù địch / Hạ thấp / Miệt thị: 小儿/小辈 (Tiểu nhi/Tiểu bối) -> "Thằng ranh", "Nhãi ranh", "Tên tiểu tử"; 狗贼/老狗 -> "Tên cẩu tặc", "Lão chó chết"; 废柴/废物 -> "Kẻ phế vật", "Đồ bỏ đi".`,
                `  2. XỬ LÝ TỪ NGHĨA HÁN VIỆT & THÀNH NGỮ (SINO-VIETNAMESE & CHENGYU 成语):`,
                `     - Thành ngữ 4 chữ Hán Việt: Nếu là cụm từ quen thuộc trong cổ phong/tiên hiệp/ngôn tình (VD: "Kinh thiên động địa", "Song hỷ lâm môn", "Khai sơn phá thạch", "Kinh hãi", "Khai thiên lập địa") -> GIỮ ÂM HÁN VIỆT mượt mà, thoát ý tự nhiên.`,
                `     - Thành ngữ / Cụm từ khẩu ngữ Hán tối nghĩa: DỊCH THOÁT Ý sang thành ngữ/tục ngữ/khẩu ngữ tiếng Việt tương đương (VD: "Giang sơn dễ đổi, bản tính khó dời", "Không đánh mà khai"), TRÁNH dịch từng từ cứng nhắc.`,
                `  3. TRỢ TỪ NGỮ KHÍ & KHẨU NGỮ TIẾNG TRUNG (MODAL PARTICLES & SPOKEN SLANG):`,
                `     - Trợ từ cuối câu (语气词): 啊 (a), 吧 (ba), 呀 (ya), 嘛 (ma), 呗 (bei), 啦 (la) -> Chuyển thành từ đệm tiếng Việt tương ứng: "nhé", "nha", "đấy", "mà", "chứ", "sao", "thôi", "hả", "cơ".`,
                `     - Từ cảm thán & Khẩu ngữ: 卧槽/靠 (Wòcáo/Kào) -> "Vãi!", "Má nó!", "Độc thật!"; 没门儿 (Méiménr) -> "Mơ đi!", "Không đời nào!"; 鬼知道 (Guǐ zhīdào) -> "Quỷ mới biết!"; 算了 (Suànle) -> "Bỏ đi", "Thôi dẹp đi"; 没事 (Méishì) -> "Chẳng sao đâu", "Không có gì".`,
                `  4. THUẬT NGỮ CẢNH GIỚI, TU VI & HỆ THỐNG (CULTIVATION & SYSTEM TERMS):`,
                `     - Thống nhất thuật ngữ chuẩn Hán Việt cho cảnh giới (Luyện Khí, Trúc Cơ, Kim Đan, Nguyên Anh, Hóa Thần, Động Hư, Đại Thừa, Độ Kiếp...) và game/hệ thống (Ký chủ, Bảng thuộc tính, Rút thưởng, Điểm kinh nghiệm).`,
                `  5. TỪ TƯỢNG THANH / TỪ TƯỢNG HÌNH MANHUA (SFX - 象声词/拟声词):`,
                `     - Dịch linh hoạt sang từ cảm thán hoặc âm thanh tiếng Việt: 轰 (Hōng) -> "Đùng! / Oành!", 咔嚓 (Kāchā) -> "Rắc! / Cạch!", 嗖 (Sōu) -> "Xoẹt! / Vút!", 扑通 (Pūtōng) -> "Thịch! / Tõm!", 哈哈 (Hāhā) -> "Ha ha!", 哼 (Hēng) -> "Hừm! / Hừ!".`
            );
        } else {
            guidanceParts.push(`- SOURCE LANGUAGE: Chinese Manhua. Translate idiom phrases naturally into ${targetLangName}, keep cultivation/wuxia/fantasy terms consistent.`);
        }
    } else if (srcLang === 'ko') {
        if (targetLang === 'vi') {
            guidanceParts.push(
                `- KOREAN TO VIETNAMESE MANHWA TRANSLATION MASTER SPECIFICATION:`,
                `  1. HỆ THỐNG KÍNH NGỮ & THÂN MẬT (존댓말 vs 반말):`,
                `     - Kính ngữ (존댓말 - Jondaetmal): Bắt buộc dịch sang khẩu ngữ tôn kính trong tiếng Việt. Thêm từ đệm "dạ, vâng, ạ", đại từ xưng hô lịch thiệp ("Thưa sếp/ngài", "Tôi hiểu rồi ạ", "Xin chào tiền bối").`,
                `     - Nói trống / Suồng sã / Bằng vai (반말 - Banmal): Dùng các cặp xưng hô tự nhiên ("mày-tao", "cậu-tớ", "anh-em"), TRIỆT TIÊU hoàn toàn từ dạ/vâng/ạ.`,
                `  2. DANH XƯNG & HẬU TỐ MANHWA (HONORIFICS & TITLES):`,
                `     - 선배 (Sunbae) -> "Tiền bối", "Anh/Chị khóa trên", hoặc xưng "anh/chị".`,
                `     - 후배 (Hubae) -> "Hậu bối", "Đàn em", "Em".`,
                `     - 오빠 (Oppa) / 형 (Hyung) -> "Anh" (linh hoạt theo ngữ cảnh tình cảm, anh em ruột hoặc anh kết nghĩa).`,
                `     - 언니 (Unnie) / 누나 (Noona) -> "Chị".`,
                `     - 아저씨 (Ahjussi) / 아줌마 (Ahjumma) -> "Chú / Bác / Cô".`,
                `     - 님 (-nim) -> "Ngài / Sếp / Trưởng phòng / Anh / Chị".`,
                `  3. TỪ CẢM THÁN & KHẨU NGỮ WEBTOON (EXCLAMATIONS & SPOKEN SLANG):`,
                `     - 헐 (Heol) -> "Sốc thật!", "Vãi!", "Trời đất!".`,
                `     - 대박 (Daebak) -> "Đỉnh thật!", "Bá cháy!", "Quá dữ!".`,
                `     - 아이구 (Aigoo) -> "Ôi trời ơi!", "Trời ạ!", "Haiz...".`
            );
        } else {
            guidanceParts.push(`- SOURCE LANGUAGE: Korean Manhwa / Webtoon. Localize speech levels, titles, and slang naturally into ${targetLangName}.`);
        }
    } else if (srcLang === 'en') {
        if (targetLang === 'vi') {
            guidanceParts.push(
                `- ENGLISH TO VIETNAMESE COMIC TRANSLATION MASTER SPECIFICATION:`,
                `  1. PHÁ BỎ ĐẠI TỪ I/YOU TRUNG TÍNH: Tự động suy luận đại từ tiếng Việt sống động.`,
                `  2. THÀNH NGỮ, TỪ LÓNG & CẢM THÁN COMIC: Dịch thoát ý khẩu ngữ tự nhiên.`
            );
        } else {
            guidanceParts.push(`- SOURCE LANGUAGE: English Comic/Scanlation. Infer dynamic pronouns for "I/You" based on character hierarchy.`);
        }
    }

    if (['ja', 'zh', 'ko'].includes(targetLang)) {
        guidanceParts.push(`- WRITING DIRECTION RULE: Set "vertical": true for vertical text blocks.`);
    } else {
        guidanceParts.push(`- WRITING DIRECTION RULE: The target language (${targetLangName}) is written HORIZONTALLY (left-to-right).`);
    }

    const currentUniverseKey = (globalState.comicUniverse as keyof typeof COMIC_UNIVERSE_PRESETS) || 'auto';
    const selectedGenres = Array.isArray(globalState.comicGenres) && globalState.comicGenres.length > 0
        ? globalState.comicGenres
        : [globalState.comicGenre || 'fantasy'];
    const currentToneKey = (globalState.comicTone as keyof typeof COMIC_TONE_PRESETS) || 'classic';

    const universeSpec = COMIC_UNIVERSE_PRESETS[currentUniverseKey]?.prompt || COMIC_UNIVERSE_PRESETS.auto.prompt;
    guidanceParts.push(universeSpec);

    const genreLabels: string[] = [];
    const genrePrompts: string[] = [];
    selectedGenres.forEach((gKey) => {
        const preset = (COMIC_GENRE_PRESETS as any)[gKey];
        if (preset) {
            genreLabels.push(preset.label.replace(/^[\p{Emoji}\s]+/u, '').trim());
            genrePrompts.push(preset.prompt);
        }
    });

    if (genrePrompts.length > 0) {
        if (genrePrompts.length > 1) {
            guidanceParts.push(`- COMPOSITE GENRE PROFILE: ${genreLabels.join(' + ')}. Blend these storytelling themes harmoniously.`);
        }
        genrePrompts.forEach(p => guidanceParts.push(p));
    } else {
        guidanceParts.push(COMIC_GENRE_PRESETS.fantasy.prompt);
    }

    const toneSpec = COMIC_TONE_PRESETS[currentToneKey]?.prompt || COMIC_TONE_PRESETS.classic.prompt;
    guidanceParts.push(toneSpec);

    if (customContextPrompt) {
        guidanceParts.push(`- USER CONTEXT / TRANSLATION GUIDANCE: ${customContextPrompt}`);
    }

    const lorebookPrompt = buildLorebookPromptContext();
    if (lorebookPrompt) {
        guidanceParts.push(lorebookPrompt);
    }

    if (globalState.enableStoryMemory && (globalState.chapterStoryMemory || []).length > 0) {
        const memoryText = globalState.chapterStoryMemory.map(m => `Trang ${m.pageIndex}: ${m.excerpt}`).join('; ');
        guidanceParts.push(`- CHAPTER STORY MEMORY (PREVIOUS PAGES CONTEXT): Here is the recent dialogue history from earlier pages in this chapter: ${memoryText}. Reuse the exact same character ${pronounTerm}, names, and overall tone.`);
    }

    const pronounPrompt = compilePronounMatrixPrompt();
    if (pronounPrompt) {
        guidanceParts.push(pronounPrompt);
    }

    const dialogueRule = targetLang === 'vi'
        ? '- DIALOGUE RULE: Choose Vietnamese xưng hô from the relationship and scene, not from the surface grammar. Keep xưng hô consistent across the page unless the relationship or mood changes.'
        : `- DIALOGUE RULE: Choose ${targetLangName} pronouns and forms of address from the relationship and scene, not from the surface grammar.`;

    guidanceParts.push(
        `- TRANSLATION RULES: Keep ${targetLangName} natural and idiomatic. Prefer meaning over literal wording. Preserve character voice, emotions, jokes, pacing, and subtext.`,
        dialogueRule,
        '- CONTEXT RULE: Use neighboring bubbles to infer who is speaking and emotional tone.',
        '- BUBBLE RULE: Keep manga-friendly phrasing short and punchy. Do not overexplain.'
    );

    getModelTranslationProfile(currentModelId).forEach((rule) => guidanceParts.push(rule));

    return guidanceParts.length > 0 ? `\n${guidanceParts.join('\n')}` : '';
}

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

async function executeOcrVisionStep({
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

    const maxRetries = 2;
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (cancelTranslationFlag) break;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            try {
                controller.abort();
            } catch (e) { }
        }, 120000);

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: requestHeaders,
                body: requestBody,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorDetail = "";
                try {
                    const errorJson = await response.json();
                    errorDetail = errorJson.error?.message || errorJson.message || "";
                } catch (e) { }
                throw new Error(errorDetail ? `Lỗi OCR (${response.status}): ${errorDetail}` : `Lỗi OCR API: ${response.status}`);
            }

            const result = await response.json();
            const jsonText = isOpenAiFormat
                ? (result.choices?.[0]?.message?.content || result.choices?.[0]?.text)
                : result.candidates?.[0]?.content?.parts?.[0]?.text;

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

    throw lastError || new Error("Không thể hoàn tất OCR.");
}

export function matchTranslationsToBlocks(blocks: any[], rawResponseData: any): any[] {
    if (!Array.isArray(blocks) || blocks.length === 0) return blocks || [];

    const rawList = Array.isArray(rawResponseData?.blocks)
        ? rawResponseData.blocks
        : (Array.isArray(rawResponseData?.translations)
            ? rawResponseData.translations
            : (Array.isArray(rawResponseData) ? rawResponseData : []));

    const mapById = new Map<string, string>();
    const mapByOriginal = new Map<string, string>();
    const listByOrder: string[] = [];

    rawList.forEach((item: any) => {
        if (!item) return;
        const transText = (item.translated || item.translation || item.text || (typeof item === 'string' ? item : '') || '').trim();
        const origText = (item.original || item.source || '').trim();

        if (transText && item.id !== undefined && item.id !== null) {
            const rawIdStr = String(item.id).trim();
            mapById.set(rawIdStr, transText);
            mapById.set(rawIdStr.toLowerCase(), transText);
        }

        if (transText && origText) {
            mapByOriginal.set(origText, transText);
            mapByOriginal.set(origText.replace(/\s+/g, ''), transText);
        }

        if (transText) {
            listByOrder.push(transText);
        }
    });

    const usedSuffixIds = new Set<string>();

    return blocks.map((b, idx) => {
        const idStr = String(b.id || '').trim();
        const idLower = idStr.toLowerCase();
        const origTrim = (b.original || '').trim();
        const origNoSpace = origTrim.replace(/\s+/g, '');

        let translated = '';

        if (mapById.has(idStr)) {
            translated = mapById.get(idStr)!;
        } else if (mapById.has(idLower)) {
            translated = mapById.get(idLower)!;
        } else {
            const bNum = idStr.match(/b(\d+)$/i) || idStr.match(/(\d+)$/);
            if (bNum) {
                const sKey1 = `b${bNum[1]}`;
                const sKey2 = bNum[1];
                if (mapById.has(sKey1) && !usedSuffixIds.has(sKey1)) {
                    translated = mapById.get(sKey1)!;
                    usedSuffixIds.add(sKey1);
                } else if (mapById.has(sKey2) && !usedSuffixIds.has(sKey2)) {
                    translated = mapById.get(sKey2)!;
                    usedSuffixIds.add(sKey2);
                }
            }
        }

        if (!translated && origTrim && mapByOriginal.has(origTrim)) {
            translated = mapByOriginal.get(origTrim)!;
        } else if (!translated && origNoSpace && mapByOriginal.has(origNoSpace)) {
            translated = mapByOriginal.get(origNoSpace)!;
        }

        if (!translated && idx < listByOrder.length && listByOrder[idx]) {
            translated = listByOrder[idx];
        }

        return {
            ...b,
            translated: translated || b.translated || ''
        };
    });
}

async function executeTextTranslationStep({
    blocksToTranslate,
    translationModel,
    targetLangName,
    prevPageContext,
    glossaryNames,
    keyToUse,
    isOpenAiFormat,
    endpoint,
    requestHeaders
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
}): Promise<any[]> {
    const targetLang = globalState.targetLanguage || 'vi';
    const pronounTerm = targetLang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';

    const transSystemInstruction = [
        `You are a master manga translator and publication editor specializing in translating Japanese/Korean/Chinese comic dialogues into natural, expressive, and fluent ${targetLangName}.`,
        `SEQUENTIAL DIALOGUE CONTEXT: The input dialogue blocks are arranged in sequential manga reading order (Top-Right to Bottom-Left). Treat them as continuous, interactive conversational turns between characters.`,
        `COMPACT MANGA DIALOGUE: Speech bubble space is limited. Keep ${targetLangName} translations natural, crisp, punchy, and concise.`,
        `Ensure ${pronounTerm} are consistent across the dialogue blocks and faithfully reflect character dynamics.`,
        globalState.preserveNames ? "Keep proper names unchanged unless the glossary says otherwise." : "",
        glossaryNames ? `Keep these names exactly as written: ${glossaryNames}.` : "",
        getTranslationGuidancePrompt().trim(),
        "Strict Rule: Maintain the exact same block IDs. Return valid JSON only with schema: {\"blocks\": [{\"id\": \"...\", \"translated\": \"...\"}]}"
    ].filter(Boolean).join(" ");

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
            temperature: 0.3,
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

    const maxRetries = 2;
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (cancelTranslationFlag) break;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            try {
                controller.abort();
            } catch (e) { }
        }, 120000);

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: requestHeaders,
                body: requestBody,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorDetail = "";
                try {
                    const errorJson = await response.json();
                    errorDetail = errorJson.error?.message || errorJson.message || "";
                } catch (e) { }
                throw new Error(errorDetail ? `Lỗi Dịch thuật (${response.status}): ${errorDetail}` : `Lỗi Dịch thuật API: ${response.status}`);
            }

            const result = await response.json();
            const choice = result.choices?.[0];
            const candidate = result.candidates?.[0];

            const jsonText = isOpenAiFormat
                ? (choice?.message?.content || choice?.text)
                : candidate?.content?.parts?.[0]?.text;

            const data = parseGeminiJsonText(jsonText);
            return matchTranslationsToBlocks(blocksToTranslate, data);
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

    throw lastError || new Error("Không thể hoàn tất dịch thuật.");
}

async function executeChapterChunkTranslationStep({
    chunkBlocks,
    translationModel,
    targetLangName,
    prevChunkContext = "",
    glossaryNames,
    keyToUse,
    isOpenAiFormat,
    endpoint,
    requestHeaders
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
}): Promise<any[]> {
    const targetLang = globalState.targetLanguage || 'vi';
    const pronounTerm = targetLang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';

    const transSystemInstruction = [
        `You are a master manga translator and senior editor specializing in translating entire manga chapters with coherent storytelling, seamless conversational flow, and natural, expressive, publication-grade ${targetLangName} dialogue.`,
        `CHAPTER NARRATIVE CONTEXT: The input dialogues are grouped by page in chronological reading sequence. Maintain consistent character voices across the entire chapter.`,
        `COMPACT MANGA DIALOGUE: Speech bubble space is limited. Keep ${targetLangName} translations natural, punchy, concise, and rhythmically flowing.`,
        `Ensure ${pronounTerm} are 100% consistent across all pages.`,
        globalState.preserveNames ? "Keep proper names unchanged unless the glossary says otherwise." : "",
        glossaryNames ? `Keep these names exactly as written: ${glossaryNames}.` : "",
        getTranslationGuidancePrompt().trim(),
        "Strict Rule: Maintain the exact same block IDs. Return valid JSON only containing all block translations with schema: {\"blocks\": [{\"id\": \"...\", \"translated\": \"...\"}]}"
    ].filter(Boolean).join(" ");

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
            temperature: 0.3,
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

    const maxRetries = 2;
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (cancelTranslationFlag) break;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            try {
                controller.abort();
            } catch (e) { }
        }, 180000);

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: requestHeaders,
                body: requestBody,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorDetail = "";
                try {
                    const errorJson = await response.json();
                    errorDetail = errorJson.error?.message || errorJson.message || "";
                } catch (e) { }
                throw new Error(errorDetail ? `Lỗi Dịch thuật (${response.status}): ${errorDetail}` : `Lỗi Dịch thuật API: ${response.status}`);
            }

            const result = await response.json();
            const choice = result.choices?.[0];
            const candidate = result.candidates?.[0];

            const jsonText = isOpenAiFormat
                ? (choice?.message?.content || choice?.text)
                : candidate?.content?.parts?.[0]?.text;

            const data = parseGeminiJsonText(jsonText);
            return matchTranslationsToBlocks(chunkBlocks, data);
        } catch (fetchErr: any) {
            clearTimeout(timeoutId);
            lastError = fetchErr;

            const isRetryable = fetchErr.name === 'AbortError' || fetchErr.name === 'TimeoutError' ||
                (fetchErr.message && (fetchErr.message.includes('429') || fetchErr.message.includes('503') || fetchErr.message.includes('500') || fetchErr.message.includes('Timeout') || fetchErr.message.includes('aborted') || fetchErr.message.includes('Failed to fetch')));

            if (isRetryable && attempt < maxRetries) {
                const waitSec = (attempt + 1) * 3;
                await new Promise(r => setTimeout(r, waitSec * 1000));
                continue;
            }
            throw fetchErr;
        }
    }

    throw lastError || new Error("Không thể hoàn tất dịch thuật Chapter.");
}

export async function executeChapterTranslationStep({
    allChapterBlocks,
    translationModel,
    targetLangName,
    glossaryNames,
    keyToUse,
    isOpenAiFormat,
    endpoint,
    requestHeaders
}: {
    allChapterBlocks: any[];
    translationModel: string;
    targetLangName: string;
    glossaryNames: string;
    keyToUse: string;
    isOpenAiFormat: boolean;
    endpoint: string;
    requestHeaders: Record<string, string>;
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
            requestHeaders
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
            requestHeaders
        });

        allTranslatedBlocks.push(...translatedChunk);

        if (cIdx < chunks.length - 1 && !cancelTranslationFlag) {
            await new Promise(r => setTimeout(r, 1500));
        }
    }

    return allTranslatedBlocks;
}

export async function translateActivePage(): Promise<void> {
    if (globalState.activePageIndex === -1) {
        showToast("Vui lòng chọn một trang trước khi dịch.", "warn");
        return;
    }

    await translatePage(globalState.activePageIndex, true);
}

export async function translateSinglePageInBatch(index: number): Promise<void> {
    if (isBatchTranslating) {
        showToast("Tiến trình dịch hàng loạt đang chạy. Vui lòng dừng hoặc chờ hoàn tất trước.", "warn");
        return;
    }

    await translatePage(index, true);
}

export async function translatePage(pageIndex: number, isBackgroundMode: boolean = false): Promise<boolean> {
    if (pageIndex < 0 || pageIndex >= globalState.pages.length) return false;
    const page = globalState.pages[pageIndex];

    await activatePage(page);

    const provider = getConfiguredAiProvider();
    const keyToUse = getGeminiApiKey() || (provider === 'custom' ? 'local' : '');
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

    updateProgressMsg(
        "Đang nhận diện & dịch...",
        `Trang ${pageIndex + 1}/${totalPages}: Đang đọc ảnh thô...`,
        isBackgroundMode ? progressVal : 20
    );

    const maxRetriesConfig = globalState.maxRetries !== undefined && globalState.maxRetries !== null ? Number(globalState.maxRetries) : 3;
    let attempts = Math.max(1, maxRetriesConfig);
    let retryDelay = 10000;

    while (attempts > 0) {
        if (cancelTranslationFlag) {
            page.status = 'draft';
            uiUpdatePageListUI();
            savePageToDB(page);
            return false;
        }

        try {
            const pageFile = (page.file || page.originalFile) as File;
            const fileForOcr = globalState.ocrEnhanceEnabled ? await enhanceImageForOcr(pageFile) : pageFile;
            const rawBase64 = await getBase64(fileForOcr);
            const mimeType = fileForOcr.type || pageFile.type;
            const targetLang = globalState.targetLanguage || 'vi';
            const targetLangName = TARGET_LANG_MAP[targetLang] || 'Vietnamese';
            const glossaryNames = globalState.preserveNames ? (globalState.glossaryNames || '').trim() : "";

            let prevPageContext = "";
            if (pageIndex > 0) {
                const prevPage = globalState.pages[pageIndex - 1];
                if (prevPage && prevPage.blocks && prevPage.blocks.length > 0) {
                    const prevDialogues = prevPage.blocks
                        .filter(b => b.translated && b.translated.trim())
                        .map((b, idx) => `Bubble #${idx + 1}: "${b.translated}"`)
                        .join("\n");
                    if (prevDialogues) prevPageContext = `[PREVIOUS PAGE DIALOGUE HISTORY FOR CONSISTENCY]\n${prevDialogues}`;
                }
            }

            const pipelineMode = globalState.translationPipelineMode || DEFAULT_PIPELINE_MODE;
            const ocrModelToUse = globalState.ocrModel || DEFAULT_OCR_MODEL;
            const transModelToUse = globalState.translationModel || DEFAULT_TRANSLATION_MODEL;
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
                    updateProgressMsg(
                        "Bước 1/2: Đang quét khung thoại & chữ gốc...",
                        `Trang ${pageIndex + 1}/${totalPages}: Sử dụng ${ocrModelToUse} (Vision)...`,
                        isBackgroundMode ? progressVal : 35
                    );

                    detectedRawBlocks = await executeOcrVisionStep({
                        rawBase64,
                        mimeType,
                        ocrModel: ocrModelToUse,
                        keyToUse,
                        isOpenAiFormat,
                        endpoint,
                        requestHeaders
                    });
                }

                if (!detectedRawBlocks || detectedRawBlocks.length === 0) {
                    finalBlocks = [];
                } else {
                    detectedRawBlocks = detectedRawBlocks.map((b, bIdx) => ({
                        ...b,
                        id: `p${pageIndex + 1}_b${bIdx + 1}`
                    }));

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
                        requestHeaders
                    });
                }

            } else {
                const pronounTerm = targetLang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';

                const systemInstruction = [
                    "Detect every manga speech bubble, narration box, thought bubble, and SFX label, classify its block type ('dialogue'|'narration'|'thought'|'sfx'), then return JSON only.",
                    "EXHAUSTIVE OCR COMPLETENESS MANDATE (BẢO TOÀN 100% NỘI DUNG CHỮ, TUYỆT ĐỐI KHÔNG BỎ SÓT):",
                    "- Detect and transcribe 100% of text on this manga page without skipping.",
                    "POSITION CALCULATION FORMULA: Output 2 integers [x, y] on scale 0 to 1000. Set x = centerX, y = centerY.",
                    `Translate to short, natural ${targetLangName} that matches the scene and speaker relationship.`,
                    `Preserve the same ${targetLangName} ${pronounTerm} and terminology within the page.`,
                    globalState.preserveNames ? "Keep proper names unchanged unless the glossary says otherwise." : "",
                    glossaryNames ? `Keep these names exactly as written: ${glossaryNames}.` : "",
                    getTranslationGuidancePrompt().trim()
                ].filter(Boolean).join(" ");

                const selectedModel = globalState.selectedModel || DEFAULT_MODEL;
                let apiUrl = '';
                let requestBody = null;

                if (isOpenAiFormat) {
                    apiUrl = `${endpoint.replace(/\/$/, '')}/chat/completions`;
                    const openAiUserContent: any[] = [
                        { type: "text", text: `Detect each speech bubble, narration box, thought bubble, and SFX with [x, y] center anchor coordinates (x = centerX, y = centerY) and type ('dialogue'|'narration'|'thought'|'sfx'). Translate their contents into ${targetLangName}. Return valid JSON.` },
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
                        { text: `Detect each speech bubble, narration box, thought bubble, and SFX with [x, y] center anchor coordinates (x = centerX, y = centerY) and type ('dialogue'|'narration'|'thought'|'sfx'). Translate their contents into ${targetLangName}. Return valid JSON.` }
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
                                                    items: { type: "NUMBER" }
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
                        systemInstruction: {
                            parts: [{ text: systemInstruction }]
                        }
                    });
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    try {
                        controller.abort();
                    } catch (e) { }
                }, 120000);

                let response: Response;
                try {
                    response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: requestHeaders,
                        body: requestBody,
                        signal: controller.signal
                    });
                } catch (fetchErr: any) {
                    if (fetchErr.name === 'AbortError' || fetchErr.name === 'TimeoutError' || (fetchErr.message && fetchErr.message.includes('aborted'))) {
                        throw new Error("Kết nối AI quá hạn (Timeout 120s). Đang tự động thử lại...");
                    }
                    throw fetchErr;
                } finally {
                    clearTimeout(timeoutId);
                }

                if (!response.ok) {
                    let errorDetail = "";
                    try {
                        const errorJson = await response.json();
                        errorDetail = errorJson.error?.message || errorJson.message || "";
                    } catch (e) { }
                    throw new Error(errorDetail ? `Lỗi API (${response.status}): ${errorDetail}` : `API Error: ${response.status}`);
                }

                const result = await response.json();
                const jsonText = isOpenAiFormat
                    ? (result.choices?.[0]?.message?.content || result.choices?.[0]?.text)
                    : result.candidates?.[0]?.content?.parts?.[0]?.text;

                const data = parseGeminiJsonText(jsonText);
                if (!data || !Array.isArray(data.blocks)) {
                    throw new Error("Phản hồi từ AI bị lỗi định dạng JSON hoặc bị ngắt câu.");
                }
                finalBlocks = mergeOverlappingAiBlocks(data.blocks);
            }

            updateProgressMsg(
                "Đang dựng bản dịch...",
                `Trang ${pageIndex + 1}/${totalPages}: Đang tính toán tỷ lệ bong bóng thoại...`,
                isBackgroundMode ? progressVal : 85
            );

            const pageImageData = await ensurePageImageData(page);

            pushStateToHistory();

            page.blocks = (finalBlocks || []).map((b, idx) => {
                const normalisedBox = b.positionKnown === false
                    ? { ...DEFAULT_AI_BLOCK_BOX }
                    : refineAiBlockBox(b.box, pageImageData, globalState.selectedModel);

                const isVerticalTarget = ['ja', 'zh', 'ko'].includes(targetLang);
                const blockVertical = isVerticalTarget
                    ? (typeof b.vertical === 'boolean' ? b.vertical : ((b.style && typeof b.style.vertical === 'boolean') ? b.style.vertical : true))
                    : false;

                const blockType = b.type || 'dialogue';
                const chosenFont = getDefaultFontForBlockType(blockType);
                let maskShape = globalState.globalStyle.maskShape;
                let italic = false;
                const bold = globalState.globalStyle.bold;

                if (blockType === 'narration') {
                    maskShape = 'rect';
                } else if (blockType === 'thought') {
                    maskShape = 'ellipse';
                    italic = true;
                }

                return {
                    id: b.id || `block_${Date.now()}_${idx}`,
                    type: blockType,
                    original: b.original || '',
                    translated: b.translated || '',
                    box: normalisedBox,
                    style: {
                        fontFamily: chosenFont,
                        fontSize: globalState.globalStyle.fontSize,
                        textColor: '#000000',
                        bgColor: '#ffffff',
                        bgOpacity: 100,
                        padding: globalState.globalStyle.padding,
                        rotate: 0,
                        vertical: blockVertical,
                        bold: bold,
                        italic: italic,
                        align: globalState.globalStyle.align,
                        maskShape: maskShape,
                        maskSize: globalState.globalStyle.maskSize,
                        strokeColor: '#ffffff',
                        strokeWidth: 0,
                        shadowColor: '#000000',
                        shadowBlur: 0
                    }
                };
            });

            const imgEl = elements.mangaBgImage;
            if (imgEl && imgEl.naturalWidth) {
                try {
                    page.blocks.forEach(b => autoMatchBlockStyle(b, imgEl));
                } catch (e) { }
            }

            page.blocks.forEach(b => {
                b.autoFitCache = null;
                if (isBlockAutoFit(b)) {
                    autoFitBlock(b);
                }
            });
            page.status = 'done';
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

            const isTimeout = error.name === 'AbortError' || error.name === 'TimeoutError' || (error.message && (error.message.includes('Timeout') || error.message.includes('aborted') || error.message.includes('AbortError')));
            const isNetworkError = error.message && (error.message.includes('Failed to fetch') || error.message.includes('network') || error.message.includes('NetworkError'));

            if (isTimeout || isNetworkError) {
                attempts--;
                if (attempts > 0) {
                    const errorLabel = isTimeout ? "Thời gian yêu cầu quá hạn (Timeout 120s)" : "Mất kết nối mạng";
                    showToast(`API bận ở trang ${pageIndex + 1}: ${errorLabel}. Tự động chờ ${retryDelay / 1000}s rồi thử lại...`, "warn");

                    for (let delay = 0; delay < (retryDelay / 100); delay++) {
                        if (cancelTranslationFlag) break;
                        const delayPercent = Math.round((delay / (retryDelay / 100)) * 100);
                        updateProgressMsg(
                            "Đang tự động kết nối lại...",
                            `${isTimeout ? "Quá hạn (Timeout)" : "Lỗi mạng"}. Đang dừng nghỉ ${retryDelay / 1000}s để gửi lại...`,
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
                errorMessage = "Kết nối API quá hạn (Timeout 120s). Vui lòng kiểm tra lại mạng hoặc chuyển đổi Model.";
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
            } else {
                uiUpdateBackgroundTaskOverlay(false);
            }
            if (isBackgroundMode && pageIndex !== globalState.activePageIndex) {
                deactivatePage(page);
            }
            garbageCollectPageCaches();
        }
    }
    return false;
}

export async function runBatchTranslation(): Promise<void> {
    if (globalState.pages.length === 0) return;
    const provider = getConfiguredAiProvider();
    const keyToUse = getGeminiApiKey() || (provider === 'custom' ? 'local' : '');
    if (!keyToUse && provider !== 'custom') {
        showToast("Vui lòng nhập API Key trước khi dịch.", "error");
        if (elements.apiKeyInput) elements.apiKeyInput.focus();
        return;
    }

    if (isBatchTranslating) {
        showToast("Tiến trình dịch thuật đang chạy ngầm!", "warn");
        return;
    }

    cancelTranslationFlag = false;
    isBatchTranslating = true;
    showToast('Đang tiến hành dịch toàn bộ Chapter dưới nền. Bạn có thể tiếp tục xem và chỉnh sửa!', 'success');

    for (let i = 0; i < globalState.pages.length; i++) {
        if (globalState.pages[i].status === 'draft' || globalState.pages[i].status === 'error') {
            globalState.pages[i].status = 'queued';
            savePageToDB(globalState.pages[i]);
        }
    }
    uiUpdatePageListUI();

    const totalPages = globalState.pages.length;
    const pipelineMode = globalState.translationPipelineMode || DEFAULT_PIPELINE_MODE;

    if (pipelineMode === 'two-step') {
        const ocrModelToUse = globalState.ocrModel || DEFAULT_OCR_MODEL;
        const transModelToUse = globalState.translationModel || DEFAULT_TRANSLATION_MODEL;
        const targetLang = globalState.targetLanguage || 'vi';
        const targetLangName = TARGET_LANG_MAP[targetLang] || 'Vietnamese';
        const glossaryNames = globalState.preserveNames ? (globalState.glossaryNames || '').trim() : "";
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
                        const fileForOcr = globalState.ocrEnhanceEnabled ? await enhanceImageForOcr(pageFile) : pageFile;
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

                        const isVerticalTarget = ['ja', 'zh', 'ko'].includes(targetLang);
                        page.blocks = (detectedRawBlocks || []).map((b, bIdx) => {
                            const normalisedBox = b.positionKnown === false
                                ? { ...DEFAULT_AI_BLOCK_BOX }
                                : refineAiBlockBox(b.box, pageImageData, globalState.selectedModel);

                            const blockVertical = isVerticalTarget
                                ? (typeof b.vertical === 'boolean' ? b.vertical : ((b.style && typeof b.style.vertical === 'boolean') ? b.style.vertical : true))
                                : false;

                            const blockType = b.type || 'dialogue';
                            const chosenFont = getDefaultFontForBlockType(blockType);
                            let maskShape = globalState.globalStyle.maskShape;
                            let italic = false;
                            const bold = globalState.globalStyle.bold;

                            if (blockType === 'narration') {
                                maskShape = 'rect';
                            } else if (blockType === 'thought') {
                                maskShape = 'ellipse';
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
                                    fontSize: globalState.globalStyle.fontSize,
                                    textColor: '#000000',
                                    bgColor: '#ffffff',
                                    bgOpacity: 100,
                                    padding: globalState.globalStyle.padding,
                                    rotate: 0,
                                    vertical: blockVertical,
                                    bold: bold,
                                    italic: italic,
                                    align: globalState.globalStyle.align,
                                    maskShape: maskShape,
                                    maskSize: globalState.globalStyle.maskSize,
                                    strokeColor: '#ffffff',
                                    strokeWidth: 0,
                                    shadowColor: '#000000',
                                    shadowBlur: 0
                                }
                            };
                        });

                        savePageToDB(page);
                    } catch (ocrErr) {
                        console.error(`Lỗi OCR ở trang ${pageIndex + 1}:`, ocrErr);
                        page.status = 'error';
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
                            requestHeaders
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
                                p.blocks.forEach((b, bIdx) => {
                                    const expectedId = `p${i + 1}_b${bIdx + 1}`;
                                    b.translated = lookupMap.get(String(b.id)) ||
                                        lookupMap.get(expectedId) ||
                                        lookupMap.get(expectedId.toLowerCase()) ||
                                        b.translated || '';
                                    b.autoFitCache = null;
                                });

                                const imgEl = elements.mangaBgImage;
                                if (imgEl && imgEl.naturalWidth && i === globalState.activePageIndex) {
                                    try {
                                        p.blocks.forEach(b => autoMatchBlockStyle(b, imgEl));
                                    } catch (e) { }
                                }

                                p.status = 'done';
                                recordPageToStoryMemory(i, p.blocks);
                                savePageToDB(p);
                            }
                        });

                        showToast(`Đã dịch thành công toàn bộ Chapter (${allChapterBlocks.length} câu thoại) trong 1 lượt gọi duy nhất!`, "success");
                    } catch (transErr: any) {
                        console.error("Lỗi khi dịch gộp Chapter:", transErr);
                        showToast(`Lỗi khi dịch Chapter: ${transErr.message || transErr}`, "error");
                        queuedIndices.forEach(i => {
                            const p = globalState.pages[i];
                            if (p.status === 'queued') {
                                p.status = 'error';
                                savePageToDB(p);
                            }
                        });
                    }
                } else {
                    queuedIndices.forEach(i => {
                        const p = globalState.pages[i];
                        if (p.status === 'queued') {
                            p.status = 'done';
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
                const delaySteps = (globalState.apiDelay !== undefined ? globalState.apiDelay : 8) * 10;
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
            }
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
    if (globalState.activePageIndex >= 0) {
        requestOverlayRender();
        uiUpdateActiveBlockEditor();
    }
}

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
    cleanMangaBackgroundArtText(tempCtx, cropW, cropH);

    const canvas = elements.eraserCanvas;
    if (canvas) {
        canvas.width = imgElement.naturalWidth;
        canvas.height = imgElement.naturalHeight;

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
                    cleanMangaBackgroundArtText(tempCtx, cropW, cropH);
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
                const base64 = (reader.result as string).replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(pageFile);
        });

        uiUpdateProcessingOverlay(true, "AI Đang Xóa Chữ...", "Gemini AI đang xử lý vẽ bù nền & xóa chữ...", 50);

        const apiUrl = getGeminiGenerateContentUrl('gemini-3.1-flash-image-preview', keyToUse);
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
            }
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

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

if (typeof window !== 'undefined') {
    Object.assign(window, {
        toggleStoryMemory,
        clearStoryMemory,
        viewStoryMemoryModal,
        cancelBatchTranslation,
        translateActivePage,
        runBatchTranslation,
        requestAiInpaintPatch,
        runAIEraseTextPage
    });
}
