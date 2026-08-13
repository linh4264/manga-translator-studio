// AI Translation & Story Memory Management
import {
    globalState,
    pushStateToHistory,
    savePageToDB,
    activatePage,
    deactivatePage,
    garbageCollectPageCaches,
    apiKey,
    uiUpdatePageListUI,
    uiUpdateProcessingOverlay,
    uiUpdateBackgroundTaskOverlay,
    uiUpdateActiveBlockEditor,
    isWeakTranslationModel,
    isFlash31LiteModel
} from '../../core/state.js';
import {
    VALID_MODEL_IDS,
    DEFAULT_MODEL,
    DEFAULT_PIPELINE_MODE,
    DEFAULT_OCR_MODEL,
    DEFAULT_TRANSLATION_MODEL,
    DEFAULT_AI_BLOCK_BOX,
    DEFAULT_VERTICAL_WRITING_MODE,
    TRANSLATION_GENRE_PRESETS,
    TARGET_LANG_MAP
} from '../../config/constants.js';
import { elements } from '../../core/elements.js';
import { showToast } from '../../core/utils/dom.js';
import { parseGeminiJsonText } from '../../core/utils/json.js';
import { refineAiBlockBox } from '../ocr/ocr-service.js';
import { requestOverlayRender } from '../canvas/canvas-service.js';
import { compilePronounMatrixPrompt } from '../pronoun.js';
import { getConfiguredApiKey, getGeminiGenerateContentUrl, getConfiguredAiProvider, getConfiguredApiEndpoint } from './ai-config.js';

export let cancelTranslationFlag = false;
export let isBatchTranslating = false;


export function setCancelTranslationFlag(val) {
    cancelTranslationFlag = val;
}

export function setIsBatchTranslating(val) {
    isBatchTranslating = val;
}

export function getGeminiApiKey() {
    return getConfiguredApiKey();
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

    // 1. Định hướng Vai trò (Persona)
    guidanceParts.push(
        `- ROLE: You are a professional Scanlation Localizer and Manga Editor. Translate meaning, tone, and emotion—NEVER translate word-for-word.`
    );

    // 2. Quy tắc Khẩu ngữ & Văn phong Tiếng Việt Truyện Tranh (LOCALIZATION RULES)
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

    // 3. Source Language Rule (Đặc biệt tối ưu hóa cho Tiếng Nhật -> Tiếng Việt)
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
                `  4. HẬU TỐ XƯNG HÔ (HONORIFICS): GIỮ NGUYÊN các hậu tố danh xưng Nhật Bản quen thuộc ghép phía sau tên riêng (gắn dấu gạch nối hoặc viết liền tự nhiên theo đúng phong cách Manga Scanlation Việt Nam):`,
                `     - ～さん (-san) -> GIỮ NGUYÊN (VD: "Tanaka-san").`,
                `     - ～ちゃん (-chan) -> GIỮ NGUYÊN (VD: "Sakura-chan").`,
                `     - ～くん (-kun) -> GIỮ NGUYÊN (VD: "Taro-kun").`,
                `     - ～様 (-sama) -> GIỮ NGUYÊN (VD: "Kaguya-sama" / "Cậu chủ Sama").`,
                `     - ～先輩 (-senpai) -> GIỮ NGUYÊN (VD: "Senpai" / "Kuroko-senpai").`,
                `     - ～先生 (-sensei) -> GIỮ NGUYÊN (VD: "Gojo-sensei" / "Thầy Sensei").`,
                `     - ～殿 (-dono), ～たん (-tan) -> GIỮ NGUYÊN hậu tố Nhật Bản gốc.`,
                `  5. TỪ TƯỢNG THANH / TỪ TƯỢNG HÌNH (SFX - 擬音語・擬態語): Dịch sang từ cảm thán hoặc từ mô tả âm thanh/hành động tự nhiên trong tiếng Việt:`,
                `     - ドキドキ (Doki Doki) -> "Thình thịch", ギラギラ (Gira Gira) -> "Lấp lánh / Sắc bén", ニコニコ (Niko Niko) -> "Cười khì", バッサリ (Bassari) -> "Xoẹt", シーン (Shiin) -> "Yên ắng...", ハッ (Ha) -> "Hả?! / Ực!".`
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
        guidanceParts.push(
            `- SOURCE LANGUAGE: Korean Manhwa / Webtoon:`,
            `  1. SPEECH LEVELS (존댓말 vs 반말):`,
            `     - Jondaetmal (Kính ngữ 존댓말): Mandatory respectful speech in ${targetLangName}. Include polite particles ("dạ", "vâng", "ạ") and respectful forms of address.`,
            `     - Banmal (Nói trống 반말): Casual, informal, or hostile speech (${targetLangName} "mày-tao", "cậu-tớ", "bạn-tôi"). Strictly remove polite markers ("dạ", "ạ").`,
            `  2. KOREAN HONORIFICS & TITLES (XƯNG HÔ MANHWA): Localize Korean titles naturally into ${targetLangName}: Sunbae (선배) -> "Tiền bối / Anh / Chị", Oppa/Hyung/Unnie/Noona -> "Anh / Chị", Ahjussi (아저씨) -> "Chú / Bác", Nim (님) -> "Sếp / Ngài / Anh / Chị". Do not leave awkward raw transliterations unless requested.`,
            `  3. MANHWA INTERJECTIONS & SLANG: Translate Korean webtoon exclamations naturally: "헐 (Heol)" -> "Sốc thật! / Vãi!", "대박 (Daebak)" -> "Đỉnh thật! / Bá cháy!", "아이구 (Aigoo)" -> "Ôi chao! / Trời ạ!", initial "아니 (Ani...)" -> "Ủa... / Mà... / Này...".`,
            `  4. SENTENCE ENDINGS: Convert sentence endings (~잖아, ~거든, ~지, ~냐) into matching ${targetLangName} tone particles ("đấy thôi", "mà", "chứ", "sao/hả").`
        );
    } else if (srcLang === 'en') {
        guidanceParts.push(`- SOURCE LANGUAGE: English Comic/Scanlation. English relies heavily on neutral "I/You" and conversational idioms. Actively infer character hierarchy, age, and emotional state to pick proper ${targetLangName} pronouns (xưng hô). Translate idioms, slang, and comic interjections (e.g., "Holy crap", "Sheesh", "No way", "Guh") into natural, vivid ${targetLangName} expressions.`);
    } else if (srcLang === 'auto') {
        guidanceParts.push('- SOURCE LANGUAGE: Auto-detect source language from image text.');
    }

    // 4. Writing Direction Rule
    if (['ja', 'zh', 'ko'].includes(targetLang)) {
        guidanceParts.push(`- WRITING DIRECTION RULE: The target language (${targetLangName}) is traditionally written vertically in manga/comics. Ensure that you set style.vertical = true in the JSON properties for each translated text block.`);
    } else {
        guidanceParts.push(`- WRITING DIRECTION RULE: The target language (${targetLangName}) is written HORIZONTALLY (left-to-right). You MUST set style.vertical = false for ALL translated text blocks without exception.`);
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

/**
 * ⚡ BƯỚC 1: QUÉT ẢNH VÀ NHẬN DIỆN TỌA ĐỘ KHUNG THOẠI (VISION OCR STEP)
 */
async function executeOcrVisionStep({
    rawBase64,
    mimeType,
    ocrModel,
    keyToUse,
    isOpenAiFormat,
    endpoint,
    requestHeaders
}) {
    const ocrSystemInstruction = [
        "You are an expert manga speech bubble detector and OCR system.",
        "Detect ALL speech bubbles, narration boxes, SFX sound effects, and sign labels in this manga page.",
        "Read and transcribe the exact raw original text (Japanese, Korean, Chinese, or English) inside each region.",
        "COORDINATE FORMULA: All box coordinates (x, y, w, h) MUST use integer scale 0 to 1000 (where top-left corner is x=0, y=0 and bottom-right corner is x=1000, y=1000). Set x = xmin (left edge), y = ymin (top edge), w = (xmax - xmin) (box width), h = (ymax - ymin) (box height). DO NOT return xmax as w or ymax as h. Example: A bubble spanning from xmin=200 to xmax=500 and ymin=100 to ymax=300 MUST return x=200, y=100, w=300, h=200.",
        "For speech bubbles and narration boxes, use a box covering the entire inner blank space of the bubble so translated text fits easily. For SFX and signs, use the tightest box covering the characters.",
        "IMPORTANT RULE FOR CONNECTED BUBBLES: When multiple speech bubbles are attached/connected together (such as double-bubbles, stacked connected lobes, or chained bubbles), treat EACH individual bubble lobe/section as a SEPARATE block with its own bounding box.",
        "Set positionKnown=true whenever text is visible and can be localized.",
        "Detect text orientation in style.vertical (true for vertical text, false for horizontal text).",
        "Return valid JSON only matching the schema."
    ].join(" ");

    let requestBody;
    let apiUrl;

    if (isOpenAiFormat) {
        apiUrl = `${endpoint.replace(/\/$/, '')}/chat/completions`;
        requestBody = JSON.stringify({
            model: ocrModel,
            messages: [
                { role: "system", content: ocrSystemInstruction },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Detect all text bubbles, narration boxes, and SFX with their 0-1000 box coordinates and raw original text. Return JSON matching schema {\"blocks\": [{\"id\": \"b1\", \"original\": \"...\", \"box\": {\"x\":0,\"y\":0,\"w\":100,\"h\":100}, \"positionKnown\": true, \"style\": {\"vertical\": true}}]}" },
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
                    { text: "Detect all speech bubbles, narration boxes, SFX labels with their 0-1000 integer coordinates and raw original text. Return JSON." },
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
                                    original: { type: "STRING" },
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
                                    positionKnown: { type: "BOOLEAN" },
                                    style: {
                                        type: "OBJECT",
                                        properties: {
                                            vertical: { type: "BOOLEAN" }
                                        }
                                    }
                                },
                                required: ["id", "original", "box", "positionKnown"]
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        try {
            controller.abort(new Error("Yêu cầu OCR AI quá hạn (Timeout 120s). Vui lòng thử lại."));
        } catch (e) {
            controller.abort();
        }
    }, 120000);

    let response;
    try {
        response = await fetch(apiUrl, {
            method: 'POST',
            headers: requestHeaders,
            body: requestBody,
            signal: controller.signal
        });
    } catch (fetchErr) {
        if (fetchErr.name === 'AbortError' || fetchErr.name === 'TimeoutError' || (fetchErr.message && fetchErr.message.includes('aborted'))) {
            throw new Error("Kết nối OCR AI quá hạn (Timeout 120s). Đang tự động thử lại...");
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
        throw new Error(errorDetail ? `Lỗi OCR (${response.status}): ${errorDetail}` : `Lỗi OCR API: ${response.status}`);
    }

    const result = await response.json();
    const jsonText = isOpenAiFormat
        ? (result.choices?.[0]?.message?.content || result.choices?.[0]?.text)
        : result.candidates?.[0]?.content?.parts?.[0]?.text;

    const data = parseGeminiJsonText(jsonText);
    if (!data || !Array.isArray(data.blocks)) {
        throw new Error("Phản hồi OCR từ AI không đúng định dạng JSON.");
    }
    return data.blocks;
}

/**
 * ⚡ BƯỚC 2: DỊCH THUẬT NGỮ CẢNH VĂN HỌC (TEXT-ONLY TRANSLATION STEP)
 */
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
}) {
    const targetLang = globalState.targetLanguage || 'vi';
    const pronounTerm = targetLang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';

    const transSystemInstruction = [
        `You are a master manga translator specializing in Japanese/Korean/Chinese to natural, expressive, and fluent ${targetLangName} dialogue.`,
        `Translate each given comic dialogue block accurately into natural ${targetLangName}, matching character tone, emotion, and scene pacing.`,
        "Do not over-literalize Japanese/Chinese sentence order. Adapt slang, punchlines, and nuances seamlessly.",
        `Ensure ${pronounTerm} are consistent across the dialogue blocks and match the previous story context.`,
        globalState.preserveNames ? "Keep proper names unchanged unless the glossary says otherwise." : "",
        glossaryNames ? `Keep these names exactly as written: ${glossaryNames}.` : "",
        getTranslationGuidancePrompt().trim(),
        "Strict Rule: Maintain the exact same block IDs. Return valid JSON only."
    ].filter(Boolean).join(" ");

    const textPayloadList = blocksToTranslate.map(b => ({
        id: b.id,
        original: b.original || ''
    }));

    let requestBody;
    let apiUrl;

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
            max_tokens: 4096,
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        try {
            controller.abort(new Error("Yêu cầu Dịch thuật AI quá hạn (Timeout 120s). Vui lòng thử lại."));
        } catch (e) {
            controller.abort();
        }
    }, 120000);

    let response;
    try {
        response = await fetch(apiUrl, {
            method: 'POST',
            headers: requestHeaders,
            body: requestBody,
            signal: controller.signal
        });
    } catch (fetchErr) {
        if (fetchErr.name === 'AbortError' || fetchErr.name === 'TimeoutError' || (fetchErr.message && fetchErr.message.includes('aborted'))) {
            throw new Error("Kết nối Dịch thuật AI quá hạn (Timeout 120s). Đang tự động thử lại...");
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
        throw new Error(errorDetail ? `Lỗi Dịch thuật (${response.status}): ${errorDetail}` : `Lỗi Dịch thuật API: ${response.status}`);
    }

    const result = await response.json();
    const jsonText = isOpenAiFormat
        ? (result.choices?.[0]?.message?.content || result.choices?.[0]?.text)
        : result.candidates?.[0]?.content?.parts?.[0]?.text;

    const data = parseGeminiJsonText(jsonText);
    const transMap = new Map();
    if (data && Array.isArray(data.blocks)) {
        data.blocks.forEach(item => {
            if (item && item.id) {
                transMap.set(item.id, item.translated || '');
            }
        });
    } else if (data && Array.isArray(data.translations)) {
        data.translations.forEach(item => {
            if (item && item.id) {
                transMap.set(item.id, item.translated || '');
            }
        });
    }

    return transMap;
}

export async function translateActivePage() {
    if (globalState.activePageIndex === -1) {
        showToast("Vui lòng chọn một trang trước khi dịch.", "warn");
        return;
    }

    await translatePage(globalState.activePageIndex, true);
}

export async function translateSinglePageInBatch(index) {
    if (isBatchTranslating) {
        showToast("Tiến trình dịch hàng loạt đang chạy. Vui lòng dừng hoặc chờ hoàn tất trước.", "warn");
        return;
    }

    await translatePage(index, true);
}

export async function translatePage(pageIndex, isBackgroundMode = false) {
    if (pageIndex < 0 || pageIndex >= globalState.pages.length) return false;
    const page = globalState.pages[pageIndex];

    // Đảm bảo trang được dịch có đầy đủ tài nguyên ảnh gốc hoạt động
    await activatePage(page);

    // Check for API key (use global or custom)
    const provider = getConfiguredAiProvider();
    const keyToUse = getGeminiApiKey() || (provider === 'custom' ? 'local' : '');
    if (!keyToUse && provider !== 'custom') {
        showToast("Vui lòng nhập Gemini API Key trước khi dịch.", "error");
        if (elements.apiKeyInput) elements.apiKeyInput.focus();
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
            const fileForOcr = globalState.ocrEnhanceEnabled ? await enhanceImageForOcr(page.file) : page.file;
            const rawBase64 = await getBase64(fileForOcr);
            const mimeType = fileForOcr.type || page.file.type;
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
            const requestHeaders = { 'Content-Type': 'application/json' };
            if (isOpenAiFormat && keyToUse) {
                requestHeaders['Authorization'] = `Bearer ${keyToUse}`;
            }

            const hasExistingBlocks = page.blocks && page.blocks.length > 0 && page.blocks.some(b => b.original && b.original.trim());
            let finalBlocks = [];

            if (pipelineMode === 'two-step') {
                // --- 2-STEP PIPELINE: STEP 1 (OCR) + STEP 2 (TRANSLATION) ---
                let detectedRawBlocks = [];

                if (hasExistingBlocks) {
                    // Nếu trang đã có sẵn khung thoại, bỏ qua bước 1 để tiết kiệm 100% token ảnh!
                    detectedRawBlocks = page.blocks;
                } else {
                    // Bước 1: Quét ảnh & nhận diện tọa độ box bằng OCR Vision Model
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
                    // Bước 2: Dịch văn phong chuyên sâu bằng Translation Model (Text Only)
                    updateProgressMsg(
                        "Bước 2/2: Đang dịch ngữ cảnh văn học...",
                        `Trang ${pageIndex + 1}/${totalPages}: Sử dụng ${transModelToUse} (Text Only)...`,
                        isBackgroundMode ? progressVal : 70
                    );

                    const translationsMap = await executeTextTranslationStep({
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

                    finalBlocks = detectedRawBlocks.map((b, idx) => ({
                        ...b,
                        translated: translationsMap.get(b.id) || b.translated || ''
                    }));
                }

            } else {
                // --- LEGACY 1-PASS ALL-IN-ONE PIPELINE ---
                const weakModel = isWeakTranslationModel(globalState.selectedModel);
                const pronounTerm = targetLang === 'vi' ? 'pronouns (xưng hô)' : 'pronouns';

                const systemInstruction = [
                    "Detect every manga text bubble, narration box, SFX label, and sign/label area, then return JSON only. Use a single dialogue-only block format for all outputs.",
                    "COORDINATE CALCULATION FORMULA: All box coordinates (x, y, w, h) MUST use integer scale 0 to 1000 (where top-left corner is x=0, y=0 and bottom-right corner is x=1000, y=1000). Set x = xmin (left edge), y = ymin (top edge), w = (xmax - xmin) (box width), h = (ymax - ymin) (box height). DO NOT return xmax as w or ymax as h. Example: A bubble spanning from xmin=200 to xmax=500 and ymin=100 to ymax=300 MUST return x=200, y=100, w=300, h=200.",
                    "For speech bubbles and narration boxes, use a box that covers the entire inner blank space of the bubble or box. For SFX and signs, use the tightest box covering the characters.",
                    "IMPORTANT RULE FOR CONNECTED BUBBLES: When multiple speech bubbles are attached or connected together in double-bubbles or stacked lobes, treat EACH individual bubble lobe/section as a SEPARATE block with its own box coordinates.",
                    "Set positionKnown=true whenever the text region is visible enough to place a box.",
                    `Translate to short, natural ${targetLangName} that matches the scene and speaker relationship.`,
                    "Do not infer or output multiple block types; every block must be dialogue.",
                    `Preserve the same ${targetLangName} ${pronounTerm} and terminology within the page whenever the relationship stays the same.`,
                    "Keep line breaks and pacing natural for manga dialogue.",
                    globalState.preserveNames ? "Keep proper names unchanged unless the glossary says otherwise." : "",
                    glossaryNames ? `Keep these names exactly as written: ${glossaryNames}.` : "",
                    getTranslationGuidancePrompt().trim()
                ].filter(Boolean).join(" ");

                const selectedModel = globalState.selectedModel || DEFAULT_MODEL;
                let apiUrl = '';
                let requestBody = null;

                if (isOpenAiFormat) {
                    apiUrl = `${endpoint.replace(/\/$/, '')}/chat/completions`;
                    let openAiUserContent = [
                        { type: "text", text: `Detect all speech bubbles, narration boxes, SFX sound effects, and signs/labels. Translate their contents into ${targetLangName} using the strict schema. Return only valid JSON that matches the schema.` },
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
                    const contentsParts = [
                        { text: `Detect all speech bubbles, narration boxes, SFX sound effects, and signs/labels. Translate their contents into ${targetLangName} using the strict schema. Return only valid JSON that matches the schema.` }
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
                                                positionKnown: { type: "BOOLEAN" },
                                                style: {
                                                    type: "OBJECT",
                                                    properties: {
                                                        vertical: { type: "BOOLEAN" }
                                                    }
                                                }
                                            },
                                            required: ["id", "original", "translated", "box", "positionKnown"]
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
                        controller.abort(new Error("Yêu cầu AI quá hạn (Timeout 120s). Vui lòng thử lại."));
                    } catch (e) {
                        controller.abort();
                    }
                }, 120000);

                let response;
                try {
                    response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: requestHeaders,
                        body: requestBody,
                        signal: controller.signal
                    });
                } catch (fetchErr) {
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
                finalBlocks = data.blocks;
            }

            updateProgressMsg(
                "Đang dựng bản dịch...",
                `Trang ${pageIndex + 1}/${totalPages}: Đang tính toán tỷ lệ bong bóng thoại...`,
                isBackgroundMode ? progressVal : 85
            );

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

            page.blocks = (finalBlocks || []).map((b, idx) => {
                const normalisedBox = b.positionKnown === false
                    ? { ...DEFAULT_AI_BLOCK_BOX }
                    : refineAiBlockBox(b.box, pageImageData, globalState.selectedModel);

                const isVerticalTarget = ['ja', 'zh', 'ko'].includes(targetLang);
                const blockVertical = isVerticalTarget
                    ? ((b.style && typeof b.style.vertical === 'boolean') ? b.style.vertical : true)
                    : false;

                return {
                    id: b.id || `block_${Date.now()}_${idx}`,
                    type: 'dialogue',
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
                    const { autoMatchBlockStyle } = await import('../canvas/canvas-service.js');
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

export async function runBatchTranslation() {
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
    const { cleanMangaBackgroundArtText } = await import('../inpainting.js');
    cleanMangaBackgroundArtText(tempCtx, cropW, cropH);

    const canvas = elements.eraserCanvas;
    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;

    const eraserCtx = canvas.getContext('2d');
    eraserCtx.drawImage(tempCanvas, cropX, cropY);
    return true;
}

export async function runLocalTeleaCleanPage(activePage) {
    uiUpdateProcessingOverlay(true, "AI Đang Xóa Chữ...", "Đang tự động chạy bộ lọc offline làm sạch trang...", 30);

    const imgElement = elements.mangaBgImage;
    if (!imgElement || !imgElement.naturalWidth) {
        throw new Error("Ảnh gốc chưa sẵn sàng để thực hiện inpaint.");
    }

    pushStateToHistory();

    const canvas = elements.eraserCanvas;
    const ctx = canvas.getContext('2d');

    const W = canvas.width;
    const H = canvas.height;

    const blocks = activePage.blocks || [];
    let dialoguesCount = 0;
    let sfxCount = 0;

    const { autoCleanBubbleBackground, cleanMangaBackgroundArtText, saveEraserDrawingToPage } = await import('../inpainting.js');

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
                tempCtx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

                cleanMangaBackgroundArtText(tempCtx, cropW, cropH);

                ctx.drawImage(tempCanvas, cropX, cropY);
                sfxCount++;
            }
        }
    }

    await saveEraserDrawingToPage();
    requestOverlayRender();
    uiUpdateActiveBlockEditor();

    showToast(`✨ Đã tự động xóa sạch ${dialoguesCount} ô thoại & ${sfxCount} vùng chữ SFX!`, "success");
}

export async function runAIEraseTextPage() {
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

    const pageFile = activePage.originalFile || activePage.file;
    if (!pageFile) {
        showToast("Không tìm thấy tệp ảnh của trang.", "error");
        return;
    }

    uiUpdateProcessingOverlay(true, "AI Đang Xóa Chữ...", "Gemini AI đang tải ảnh và xóa toàn bộ chữ trên trang...", 20);

    try {
        pushStateToHistory();

        const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
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
        const part = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

        if (part && part.inlineData) {
            const img = new Image();
            const blobUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            
            await new Promise((resolve, reject) => {
                img.onload = () => {
                    const canvas = elements.eraserCanvas;
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve();
                };
                img.onerror = () => reject(new Error("Không thể tải ảnh kết quả từ AI."));
                img.src = blobUrl;
            });

            const { saveEraserDrawingToPage } = await import('../inpainting.js');
            await saveEraserDrawingToPage();

            showToast("✨ AI đã tự động xóa sạch chữ & SFX trên trang Manga!", "success");
        } else {
            throw new Error("Không tìm thấy dữ liệu ảnh trả về từ Gemini AI.");
        }
    } catch (err) {
        if (err.message.includes("429") || err.message.includes("quota") || err.message.includes("Quota exceeded") || err.message.includes("limit: 0") || err.message.includes("billing")) {
            showToast("Gemini Free Tier giới hạn xuất ảnh. Tự động chạy bộ lọc offline làm sạch trang...", "info");
            try {
                await runLocalTeleaCleanPage(activePage);
            } catch (localErr) {
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

// Bind to window for inline HTML onclick handlers
window.toggleStoryMemory = toggleStoryMemory;
window.clearStoryMemory = clearStoryMemory;
window.viewStoryMemoryModal = viewStoryMemoryModal;
window.cancelBatchTranslation = cancelBatchTranslation;
window.translateActivePage = translateActivePage;
window.runBatchTranslation = runBatchTranslation;
window.requestAiInpaintPatch = requestAiInpaintPatch;
window.runAIEraseTextPage = runAIEraseTextPage;
