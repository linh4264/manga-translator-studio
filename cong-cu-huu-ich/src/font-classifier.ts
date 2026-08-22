/**
 * Module 8B: Manga Font & Dialogue Tone Classifier (TypeScript)
 * Dedicated AI & Heuristic Classification Engine for Text Types & 16 Manga Tones
 * Part of Manga Translator Studio
 */

import type {
    MangaTextType,
    MangaTone,
    FontClassificationResult,
    DialogueClassificationResult,
    CustomFontItem
} from './types';
import { getEffectiveFontLibrary, openFontsDB, updateDynamicFontFaceStyles } from './font-matcher';

const STORE_FONTS_NAME = 'fonts';

// ============================================================================
// 1. METADATA DICTIONARIES & CONFIGURATIONS
// ============================================================================

export interface TextTypeMeta {
    id: MangaTextType;
    name: string;
    vnName: string;
    icon: string;
    badgeColor: string;
    desc: string;
    defaultTone: MangaTone;
    allowsTone: boolean;
}

export interface ToneMeta {
    id: MangaTone;
    name: string;
    vnName: string;
    icon: string;
    tagColor: string;
    desc: string;
    sampleText: string;
    visualTrait: string;
}

export const TEXT_TYPE_CONFIGS: Record<MangaTextType, TextTypeMeta> = {
    dialogue: {
        id: 'dialogue',
        name: 'Dialogue',
        vnName: 'Hội thoại chính',
        icon: '💬',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
        desc: 'Lời thoại nhân vật trong bóng thoại chuẩn tròn / oval',
        defaultTone: 'normal',
        allowsTone: true
    },
    thought: {
        id: 'thought',
        name: 'Thought',
        vnName: 'Suy nghĩ / Độc thoại',
        icon: '💭',
        badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
        desc: 'Bóng thoại đám mây, suy nghĩ thầm kín trong tâm trí',
        defaultTone: 'whisper',
        allowsTone: true
    },
    narration: {
        id: 'narration',
        name: 'Narration',
        vnName: 'Dẫn truyện / Tự sự',
        icon: '📜',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        desc: 'Khung vuông / chữ nhật góc trang, lời dẫn chuyện của tác giả',
        defaultTone: 'none',
        allowsTone: false
    },
    aside: {
        id: 'aside',
        name: 'Aside',
        vnName: 'Lời thoại phụ / Chibi',
        icon: '🗨️',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        desc: 'Chữ viết tay nhỏ ngoài viền bóng thoại, lời thì thầm bên lề, bình luận hài hước',
        defaultTone: 'none',
        allowsTone: false
    },
    sfx: {
        id: 'sfx',
        name: 'SFX',
        vnName: 'Hiệu ứng âm thanh (SFX)',
        icon: '💥',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        desc: 'Chữ tượng thanh, tiếng động nổ, va chạm, bước chân, gió rít',
        defaultTone: 'none',
        allowsTone: false
    }
};

export const TONE_CONFIGS: Record<MangaTone, ToneMeta> = {
    none: {
        id: 'none',
        name: 'None',
        vnName: 'Không phân sắc thái (None)',
        icon: '➖',
        tagColor: 'bg-slate-800 text-slate-400 border-slate-700',
        desc: 'Mặc định cho Dẫn truyện, Lời phụ, SFX (không ràng buộc cảm xúc nhân vật)',
        sampleText: 'Tại một vương quốc xa xôi thời cổ đại...',
        visualTrait: 'Nét chữ trang trọng, ổn định hoặc dạng cọ SFX đặc thù'
    },
    normal: {
        id: 'normal',
        name: 'Normal',
        vnName: 'Bình thường',
        icon: '😐',
        tagColor: 'bg-slate-700/50 text-slate-200 border-slate-600',
        desc: 'Điềm tĩnh, tự nhiên, hội thoại thường ngày không biến động cảm xúc',
        sampleText: 'Hôm nay chúng ta sẽ đến thư viện học nhóm nhé.',
        visualTrait: 'Nét chữ đều đặn, độ dày vừa phải, độ tròn cân đối'
    },
    soft: {
        id: 'soft',
        name: 'Soft',
        vnName: 'Dịu dàng',
        icon: '🌸',
        tagColor: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
        desc: 'Nhẹ nhàng, ân cần, tình cảm ấm áp, xoa dịu',
        sampleText: 'Đừng lo lắng, mọi chuyện rồi sẽ ổn thôi mà...',
        visualTrait: 'Nét chữ tròn mềm mại, thanh mảnh, tạo cảm giác thân thiện'
    },
    shy: {
        id: 'shy',
        name: 'Shy',
        vnName: 'Ngại ngùng',
        icon: '😳',
        tagColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        desc: 'E thẹn, bẽn lẽn, đỏ mặt, tỏ tình, lúng túng',
        sampleText: 'C-Cậu... có muốn cùng tớ về chung đường không?',
        visualTrait: 'Nét chữ mảnh, hơi nghiêng, có chút nét viết tay ngập ngừng'
    },
    hesitant: {
        id: 'hesitant',
        name: 'Hesitant',
        vnName: 'Ngập ngừng',
        icon: '🥺',
        tagColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        desc: 'Lưỡng lự, bối rối, ngắt quãng bằng dấu ba chấm',
        sampleText: 'Chuyện đó... tớ thật sự... không biết phải giải thích sao nữa...',
        visualTrait: 'Khoảng cách chữ thưa, nét thanh, gợi sự ngập ngừng'
    },
    whisper: {
        id: 'whisper',
        name: 'Whisper',
        vnName: 'Thì thầm',
        icon: '🤫',
        tagColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
        desc: 'Nói nhỏ, thì thầm bí mật, nói một mình trong miệng',
        sampleText: '(Suỵt... nói nhỏ thôi, kẻo bị phát hiện bây giờ...)',
        visualTrait: 'Nét chữ rất mảnh, kích thước nhỏ gọn, dạng chữ nghiêng'
    },
    shaky: {
        id: 'shaky',
        name: 'Shaky',
        vnName: 'Run rẩy',
        icon: '〰️',
        tagColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
        desc: 'Run rẩy vì lạnh, bất an, giọng nói run run không vững',
        sampleText: 'L-Lạnh quá... tay chân mình không còn cử động được nữa...',
        visualTrait: 'Nét chữ gợn sóng, ziczac, nét run hoặc méo nhẹ'
    },
    sad: {
        id: 'sad',
        name: 'Sad',
        vnName: 'Buồn bã',
        icon: '😢',
        tagColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
        desc: 'U sầu, thất vọng, đau đớn trong lòng, mất mát',
        sampleText: 'Tại sao... tại sao người ra đi lại là cậu chứ?',
        visualTrait: 'Nét chữ trầm, mảnh, đường nét hơi buông lơi'
    },
    crying: {
        id: 'crying',
        name: 'Crying',
        vnName: 'Khóc lóc',
        icon: '😭',
        tagColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
        desc: 'Nghẹn ngào, nức nở, vừa khóc vừa nói, đau đớn tột cùng',
        sampleText: 'Hức... đừng bỏ tớ lại một mình mà... làm ơn đi...!',
        visualTrait: 'Nét chữ đứt quãng, uốn lượn cảm xúc, nét mảnh hòa giọt nước mắt'
    },
    scared: {
        id: 'scared',
        name: 'Scared',
        vnName: 'Sợ hãi',
        icon: '😨',
        tagColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
        desc: 'Hoảng hốt, khiếp đảm, chạm mặt quái vật hoặc hung thủ',
        sampleText: 'C-Cái thứ quái quỷ đó... nó đang tiến lại gần đây kìa!',
        visualTrait: 'Nét chữ nhọn, co cụm hoặc rung lắc, tạo sự bất an'
    },
    angry: {
        id: 'angry',
        name: 'Angry',
        vnName: 'Giận dữ',
        icon: '💢',
        tagColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
        desc: 'Tức giận, cáu gắt, gằn giọng, phẫn nộ',
        sampleText: 'Câm miệng lại! Ngươi không có tư cách nói câu đó ở đây!',
        visualTrait: 'Nét chữ đậm, góc cạnh sắc bén, nét gãy dứt khoát'
    },
    shouting: {
        id: 'shouting',
        name: 'Shouting',
        vnName: 'Hét lớn',
        icon: '📢',
        tagColor: 'bg-red-500/20 text-red-300 border-red-500/30',
        desc: 'Gào thét, hô to, ra lệnh khẩn cấp, tung chiêu thức bùng nổ',
        sampleText: 'TOÀN QUÂN XÔNG LÊN! BẢO VỆ THÀNH TRÌ ĐẾN CÙNG!',
        visualTrait: 'Nét chữ cực đậm (Black/Heavy), In hoa, tương phản cực mạnh'
    },
    excited: {
        id: 'excited',
        name: 'Excited',
        vnName: 'Hào hứng',
        icon: '✨',
        tagColor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
        desc: 'Phấn khích, vui sướng, hò reo, nhiệt huyết tưng bừng',
        sampleText: 'Tuyệt vời quá đi mất! Chúng ta đã giành chiến thắng rồi!',
        visualTrait: 'Nét chữ năng động, tròn nảy, độ nghiêng vui nhộn'
    },
    serious: {
        id: 'serious',
        name: 'Serious',
        vnName: 'Nghiêm túc',
        icon: '🧐',
        tagColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        desc: 'Trang trọng, căng thẳng, nghiêm nghị, đàm phán quân sự/chính trị',
        sampleText: 'Tình hình hiện tại không cho phép chúng ta phạm bất kỳ sai lầm nào.',
        visualTrait: 'Nét chữ thẳng thớm, độ chuẩn mực cao, hơi có chân hoặc nét rõ ràng'
    },
    weak: {
        id: 'weak',
        name: 'Weak',
        vnName: 'Yếu ớt',
        icon: '🥀',
        tagColor: 'bg-zinc-600/30 text-zinc-300 border-zinc-500/30',
        desc: 'Kiệt sức, thều thào, bị thương nặng, hấp hối',
        sampleText: 'Xin lỗi... tôi... không thể đi cùng cậu được nữa rồi...',
        visualTrait: 'Nét chữ siêu mảnh (Thin/Light), mờ nhạt, khoảng cách dãn nhẹ'
    },
    cold: {
        id: 'cold',
        name: 'Cold',
        vnName: 'Lạnh lùng',
        icon: '❄️',
        tagColor: 'bg-indigo-900/40 text-indigo-200 border-indigo-700/40',
        desc: 'Băng giá, vô cảm, sắc bén, đe dọa điềm tĩnh không chút dao động',
        sampleText: 'Ta không quan tâm. Cản đường ta thì chỉ có một kết cục duy nhất.',
        visualTrait: 'Nét chữ sắc nét như dao cạo, góc vuông vức, không cảm xúc'
    },
    special: {
        id: 'special',
        name: 'Special',
        vnName: 'Đặc biệt / Ma mị',
        icon: '🔮',
        tagColor: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
        desc: 'Huyền bí, ma quỷ, giọng quái vật, glitch, tâm thần, ma pháp',
        sampleText: 'Ngươi nghĩ rằng linh hồn ngươi có thể thoát khỏi nơi này sao...?',
        visualTrait: 'Nét chữ biến dị, nứt xước, rùng rợn hoặc cách điệu huyền bí'
    }
};

// ============================================================================
// 2. OFFLINE MORPHOLOGY HEURISTIC CLASSIFIER
// ============================================================================

// ============================================================================
// 2. OFFLINE MORPHOLOGY HEURISTIC CLASSIFIER
// ============================================================================

/**
 * Helper to identify well-known standard manga & comic dialogue fonts
 */
function isStandardMangaDialogueFamily(name: string): boolean {
    const clean = name.toLowerCase();
    const standardKeywords = [
        'wild words', 'wildwords', 'anime ace', 'animeace', 'manga temple', 'mangatemple',
        'avo', 'chitchat', 'chit chat', 'comic neue', 'comic book', 'digital strip',
        'digitalstrip', 'hanzel', 'hl-comic', 'tcvn3 comic', 'vni-manga', 'vni-cooper',
        'cooper', 'augie', 'blambot', 'komika', 'dialogue', 'shoujo', 'shounen',
        'comic', 'manga', 'acme', 'cc ', 'tb', 'manga_', 'vni-', 'utm ', 'svn-'
    ];
    return standardKeywords.some(kw => clean.includes(kw));
}

/**
 * Classifies any font into primary Text Type and Tone based purely on local typography morphology
 * Zero network dependencies.
 */
export function classifyFontOfflineHeuristics(font: Partial<CustomFontItem>): FontClassificationResult {
    const rawName = font.name || font.family || '';
    const name = rawName.toLowerCase();
    const cat = font.category || 'dialogue';
    const weight = font.weightScore ?? 0.50;
    const round = font.roundnessScore ?? 0.55;
    const hand = font.handwrittenScore ?? 0.18;
    const rough = font.roughnessScore ?? 0.10;
    const formality = font.formalityScore ?? 0.50;
    const energy = font.energyScore ?? 0.45;
    const styleType = font.fontStyleType;
    const isStandardDialogue = isStandardMangaDialogueFamily(name);

    let primaryType: MangaTextType = 'dialogue';
    let compatibleTypes: MangaTextType[] = ['dialogue'];
    let primaryTone: MangaTone = 'normal';
    let compatibleTones: MangaTone[] = ['normal'];
    const tags: string[] = [];
    let reasoning = '';

    // =========================================================================
    // STEP 1: TEXT TYPE CLASSIFICATION (5 Categories)
    // =========================================================================

    // 1. Explicit SFX / Brush / Grunge Display Fonts
    const isSfxName = name.includes('sfx') || name.includes('brush') || name.includes('splatter') ||
        name.includes('scratch') || name.includes('explode') || name.includes('distress') ||
        name.includes('graffiti') || name.includes('horror') || name.includes('blood') ||
        name.includes('creepy') || name.includes('zombie') || name.includes('boom') ||
        name.includes('slash') || name.includes('bang') || name.includes('crash');

    if (isSfxName || (cat === 'sfx' && rough >= 0.60) || styleType === 'brush_sfx' || rough >= 0.75) {
        primaryType = 'sfx';
        compatibleTypes = ['sfx', 'dialogue'];
        primaryTone = 'none'; // Narration, Aside, SFX have tone = none
        compatibleTones = ['none'];
        tags.push('SFX Display', 'Nét cọ mạnh mẽ', 'Tương phản cao');
        reasoning = `Phông chữ mang phong cách Brush/SFX (${Math.round(rough * 100)}% độ gai ráp), năng lượng bùng nổ, tối ưu tuyệt đối cho tiếng động âm thanh manga.`;
        return {
            primaryTextType: primaryType,
            compatibleTextTypes: compatibleTypes,
            primaryTone: primaryTone,
            compatibleTones: compatibleTones,
            confidenceScore: 0.94,
            styleTags: tags,
            reasoning,
            recommendedStroke: '3px - 5px (Viền đậm nổi bật)',
            recommendedUsage: 'SFX hành động, tiếng va chạm, nổ, chiêu thức'
        };
    }

    // 2. Explicit Serif / Editorial Narration Fonts
    const isSerifName = name.includes('serif') || name.includes('times') || name.includes('mincho') ||
        name.includes('garamond') || name.includes('georgia') || name.includes('cambria') ||
        name.includes('baskerville') || name.includes('bodoni') || name.includes('didot') ||
        name.includes('playfair') || name.includes('merriweather') || name.includes('lora') ||
        name.includes('cormorant');

    if (isSerifName || styleType === 'serif_narration' || (cat === 'narration' && formality >= 0.70) || formality >= 0.85) {
        primaryType = 'narration';
        compatibleTypes = ['narration', 'thought'];
        primaryTone = 'none'; // Narration has tone = none
        compatibleTones = ['none'];
        tags.push('Chữ có chân (Serif)', 'Trang trọng', 'Dẫn chuyện');
        reasoning = `Phông chữ có tính trang trọng cao (${Math.round(formality * 100)}%), đường nét thanh lịch mực thước, tối ưu cho khung dẫn truyện và văn bản tự sự.`;
        return {
            primaryTextType: primaryType,
            compatibleTextTypes: compatibleTypes,
            primaryTone: primaryTone,
            compatibleTones: compatibleTones,
            confidenceScore: 0.95,
            styleTags: tags,
            reasoning,
            recommendedStroke: '0px - 1px (Nét trong khung chữ nhật)',
            recommendedUsage: 'Khung dẫn truyện mở đầu, bối cảnh, thư từ cổ phong'
        };
    }

    // 3. Explicit Cute / Chibi / Casual Aside Fonts
    const isAsideName = name.includes('chibi') || name.includes('akbar') || name.includes('teddy') ||
        name.includes('cartoon') || name.includes('cute') || name.includes('kawaii') ||
        name.includes('doodle') || name.includes('wobbly') || name.includes('quirky') ||
        name.includes('funny') || name.includes('playful') || name.includes('caveat') ||
        name.includes('kalam') || name.includes('pangolin') || name.includes('gloria') ||
        name.includes('amatic');

    if (isAsideName || styleType === 'cartoon_quirky' || (cat === 'cute' && hand >= 0.60) || hand >= 0.75) {
        primaryType = 'aside';
        compatibleTypes = ['aside', 'dialogue'];
        primaryTone = 'none'; // Aside has tone = none
        compatibleTones = ['none'];
        tags.push('Viết tay vui nhộn', 'Lời bình ngoài lề', 'Chibi nhí nhố');
        reasoning = `Nét chữ mang phong cách viết tay ngộ nghĩnh (${Math.round(hand * 100)}%), thích hợp cho lời thoại phụ ngoài bóng thoại và tranh chibi.`;
        return {
            primaryTextType: primaryType,
            compatibleTextTypes: compatibleTypes,
            primaryTone: primaryTone,
            compatibleTones: compatibleTones,
            confidenceScore: 0.91,
            styleTags: tags,
            reasoning,
            recommendedStroke: '1px - 2px',
            recommendedUsage: 'Lời thì thầm ngoài bóng thoại, ghi chú tác giả, tranh chibi'
        };
    }

    // 4. Explicit Whisper / Thin / Italic Monologue Fonts
    const isWhisperName = name.includes('whisper') || name.includes('italic') || name.includes('cursive') ||
        name.includes('script') || name.includes('cloud') || name.includes('thought') ||
        name.includes('monologue') || name.includes('hairline') || name.includes('patrick');

    if (isWhisperName || cat === 'whisper' || styleType === 'whisper_cursive' || (weight <= 0.35 && round >= 0.50)) {
        primaryType = 'thought';
        compatibleTypes = ['thought', 'dialogue'];
        primaryTone = 'whisper';
        compatibleTones = ['whisper', 'soft', 'sad', 'hesitant', 'weak'];
        tags.push('Độc thoại nội tâm', 'Mềm mại thanh thoát', 'Dịu dàng');
        reasoning = `Nét chữ mảnh nhẹ (${Math.round(weight * 100)}% độ đậm), thanh thoát, thích hợp cho dòng suy nghĩ nội tâm trong bóng thoại đám mây.`;
        return {
            primaryTextType: primaryType,
            compatibleTextTypes: compatibleTypes,
            primaryTone: primaryTone,
            compatibleTones: compatibleTones,
            confidenceScore: 0.89,
            styleTags: tags,
            reasoning,
            recommendedStroke: '1px (Viền mỏng nhẹ)',
            recommendedUsage: 'Bóng thoại đám mây, suy ngẫm nội tâm, lời thì thầm bí mật'
        };
    }

    // 5. Default Backbone: Standard Manga Dialogue
    primaryType = 'dialogue';
    compatibleTypes = ['dialogue', 'thought'];

    // =========================================================================
    // STEP 2: NUANCED TONE CLASSIFICATION FOR DIALOGUE (16 Tones)
    // =========================================================================

    const isShoutName = name.includes('shout') || name.includes('bangers') || name.includes('badaboom') ||
        name.includes('screamer') || (name.includes('impact') && (name.includes('bold') || name.includes('heavy')));

    if (isShoutName || (cat === 'shout' && weight >= 0.78 && rough >= 0.30) || (weight >= 0.85 && energy >= 0.85)) {
        // True Extreme Heavy Shout / Action
        primaryTone = 'shouting';
        compatibleTones = ['shouting', 'angry', 'excited', 'scared'];
        tags.push('Hét lớn', 'Nét cực đậm', 'Shounen Action');
        reasoning = `Nét chữ cực đậm và nặng (${Math.round(weight * 100)}%), thể hiện sự bùng nổ, gào thét hoặc ra lệnh quyết liệt.`;
    } else if (round >= 0.66 && weight <= 0.58) {
        // Soft / Gentle / Romance Dialogue
        primaryTone = 'soft';
        compatibleTones = ['soft', 'shy', 'normal', 'excited'];
        tags.push('Thoại dịu dàng', 'Tròn mềm', 'Shoujo / Romance');
        reasoning = `Nét chữ tròn mềm mại (${Math.round(round * 100)}%), tạo cảm giác ấm áp, ân cần, rất thích hợp cho lời thoại lãng mạn và học đường.`;
    } else if (hand >= 0.40 && weight <= 0.50) {
        // Shy / Hesitant Dialogue
        primaryTone = 'shy';
        compatibleTones = ['shy', 'soft', 'hesitant', 'normal'];
        tags.push('Thoại ngại ngùng', 'Nét e thẹn', 'Tình cảm');
        reasoning = `Nét chữ mang nét viết tay thanh mảnh e ấp, phù hợp cho phân đoạn ngượng ngùng đỏ mặt hoặc ấp úng.`;
    } else if (rough >= 0.35 && round <= 0.35 && weight >= 0.65) {
        // Angry / Sharp Dialogue
        primaryTone = 'angry';
        compatibleTones = ['angry', 'shouting', 'cold', 'serious'];
        tags.push('Thoại giận dữ', 'Góc cạnh sắc bén', 'Cáu gắt');
        reasoning = `Nét chữ đậm, góc cạnh sắc bén và độ nhám cao, biểu thị sự phẫn nộ và gắt gỏng.`;
    } else if (rough >= 0.45 && weight <= 0.65) {
        // Shaky / Distressed Dialogue
        primaryTone = 'shaky';
        compatibleTones = ['shaky', 'scared', 'sad', 'hesitant'];
        tags.push('Thoại run rẩy', 'Gợn sóng', 'Bất an');
        reasoning = `Đường nét có độ rung và biến thiên nhẹ, thích hợp thể hiện trạng thái run rẩy, sợ hãi hoặc lạnh cóng.`;
    } else if (formality >= 0.70 && round <= 0.48) {
        // Serious / Formal Dialogue
        primaryTone = 'serious';
        compatibleTones = ['serious', 'cold', 'normal'];
        tags.push('Thoại nghiêm túc', 'Chuẩn mực', 'Trưởng thành');
        reasoning = `Nét chữ vuông vức, thẳng thớm và có tính trang trọng cao, tối ưu cho hội thoại đàm phán, chính trị.`;
    } else if (round <= 0.28 && formality >= 0.55) {
        // Cold / Distant Dialogue
        primaryTone = 'cold';
        compatibleTones = ['cold', 'serious', 'normal'];
        tags.push('Thoại lạnh lùng', 'Sắc nét', 'Vô cảm');
        reasoning = `Nét chữ hình khối sắc bén, góc cạnh dứt khoát không chút mềm mại, gợi sự lạnh lùng và xa cách.`;
    } else if (energy >= 0.65 && round >= 0.52 && weight >= 0.52 && weight < 0.75) {
        // Excited / Upbeat Dialogue
        primaryTone = 'excited';
        compatibleTones = ['excited', 'normal', 'soft', 'shouting'];
        tags.push('Thoại hào hứng', 'Tròn nảy', 'Năng động');
        reasoning = `Nét chữ năng động, tròn đều với năng lượng tươi vui, phù hợp cho lời reo hò và phấn khích.`;
    } else {
        // Normal Standard Manga Dialogue (The Golden Default)
        primaryTone = 'normal';
        compatibleTones = ['normal', 'soft', 'serious', 'excited'];
        tags.push('Thoại Manga chuẩn', 'Dễ đọc 100%', 'Typeset tiêu chuẩn');
        reasoning = `Phông chữ hội thoại tiêu chuẩn của manga, độ cân đối hoàn hảo, dễ đọc mượt mà trong hầu hết mọi bóng thoại đời thường.`;
    }

    return {
        primaryTextType: primaryType,
        compatibleTextTypes: compatibleTypes,
        primaryTone: primaryTone,
        compatibleTones: compatibleTones,
        confidenceScore: 0.93,
        styleTags: tags,
        reasoning,
        recommendedStroke: '1.5px (Chuẩn Typeset)',
        recommendedUsage: 'Bóng thoại hội thoại tiêu chuẩn hàng ngày'
    };
}

// ============================================================================
// 3. AI CLASSIFIER CALLS (GEMINI VISION & STRUCTURED PROMPT)
// ============================================================================

/**
 * Uses Gemini AI Vision / Text API to classify font glyphs
 */
export async function classifyFontWithAI(
    font: CustomFontItem,
    apiKey: string,
    modelId: string = 'gemini-3.1-flash-lite'
): Promise<FontClassificationResult> {
    if (!apiKey || modelId === 'offline-heuristic') {
        return classifyFontOfflineHeuristics(font);
    }

    const systemPrompt = `Bạn là Chuyên Gia Typography Manga & Comic Quốc Tế kiêm Giám Đốc Typeset Scanlation.
Nhiệm vụ của bạn là phân loại phông chữ được cung cấp vào hệ thống taxonomy chuẩn sau:

1. Text Type (chọn 1 loại chính 'primaryTextType' và các loại phụ tương thích 'compatibleTextTypes'):
- 'dialogue': Hội thoại chính
- 'thought': Suy nghĩ / Độc thoại
- 'narration': Dẫn truyện / Tự sự
- 'aside': Lời thoại phụ / Chibi
- 'sfx': Hiệu ứng âm thanh (SFX)

2. Tone (chọn 1 sắc thái chính 'primaryTone' và các sắc thái phụ 'compatibleTones'):
LƯU Ý QUAN TRỌNG:
- Nếu primaryTextType là 'narration', 'aside' hoặc 'sfx' -> bắt buộc đặt 'primaryTone': 'none' và 'compatibleTones': ['none'].
- Nếu primaryTextType là 'dialogue' hoặc 'thought', hãy chọn từ các sắc thái sau:
  'normal' (Bình thường), 'soft' (Dịu dàng), 'shy' (Ngại ngùng), 'hesitant' (Ngập ngừng), 'whisper' (Thì thầm),
  'shaky' (Run rẩy), 'sad' (Buồn bã), 'crying' (Khóc lóc), 'scared' (Sợ hãi), 'angry' (Giận dữ),
  'shouting' (Hét lớn), 'excited' (Hào hứng), 'serious' (Nghiêm túc), 'weak' (Yếu ớt), 'cold' (Lạnh lùng), 'special' (Đặc biệt/Ma mị).

Hãy phản hồi DUY NHẤT một chuỗi JSON hợp lệ theo schema sau:
{
  "primaryTextType": "dialogue",
  "compatibleTextTypes": ["dialogue", "thought"],
  "primaryTone": "normal",
  "compatibleTones": ["normal", "soft", "serious"],
  "confidenceScore": 0.95,
  "styleTags": ["Dễ đọc", "Nét tròn đều", "Thoại tiêu chuẩn"],
  "reasoning": "Mô tả chi tiết bằng tiếng Việt lý do phân loại font này vào Type và Tone trên.",
  "recommendedStroke": "1.5px viền trắng",
  "recommendedUsage": "Bóng thoại hội thoại hàng ngày"
}`;

    const promptText = `Hãy phân tích phông chữ sau:
Tên Font: "${font.name}" (Family: "${font.family}")
Category hiện tại: ${font.category}
Chỉ số: Weight=${font.weightScore}, Roundness=${font.roundnessScore || 0.5}, Handwritten=${font.handwrittenScore || 0.2}, Roughness=${font.roughnessScore || 0.1}, Formality=${font.formalityScore || 0.5}`;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const payload = {
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${promptText}` }] }],
            generationConfig: {
                temperature: 0.2,
                responseMimeType: "application/json"
            }
        };

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) {
            console.warn("AI API Error, falling back to heuristics:", resp.status);
            return classifyFontOfflineHeuristics(font);
        }

        const data = await resp.json();
        const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textContent) return classifyFontOfflineHeuristics(font);

        const cleanJson = textContent.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        const validTypes: MangaTextType[] = ['dialogue', 'thought', 'narration', 'aside', 'sfx'];
        const validTones: MangaTone[] = ['none', 'normal', 'soft', 'shy', 'hesitant', 'whisper', 'shaky', 'sad', 'crying', 'scared', 'angry', 'shouting', 'excited', 'serious', 'weak', 'cold', 'special'];

        const primaryType: MangaTextType = validTypes.includes(parsed.primaryTextType) ? parsed.primaryTextType : 'dialogue';
        
        let primaryTone: MangaTone = validTones.includes(parsed.primaryTone) ? parsed.primaryTone : 'normal';
        if (primaryType === 'narration' || primaryType === 'aside' || primaryType === 'sfx') {
            primaryTone = 'none';
        }

        return {
            primaryTextType: primaryType,
            compatibleTextTypes: Array.isArray(parsed.compatibleTextTypes) ? parsed.compatibleTextTypes.filter((t: any) => validTypes.includes(t)) : [primaryType],
            primaryTone: primaryTone,
            compatibleTones: primaryTone === 'none' ? ['none'] : (Array.isArray(parsed.compatibleTones) ? parsed.compatibleTones.filter((t: any) => validTones.includes(t)) : [primaryTone]),
            confidenceScore: typeof parsed.confidenceScore === 'number' ? Math.max(0, Math.min(1, parsed.confidenceScore)) : 0.90,
            styleTags: Array.isArray(parsed.styleTags) ? parsed.styleTags : ['Manga Font'],
            reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'Phân loại hoàn tất.',
            recommendedStroke: parsed.recommendedStroke || '1.5px',
            recommendedUsage: parsed.recommendedUsage || 'Manga typeset'
        };
    } catch (err) {
        console.warn("Exception in classifyFontWithAI, using heuristics:", err);
        return classifyFontOfflineHeuristics(font);
    }
}

/**
 * Uses Gemini AI to classify an input manga dialogue text or cropped image into Text Type & Tone,
 * and recommends the top matching fonts from the user's library.
 */
export async function classifyDialogueWithAI(
    text: string,
    imageDataBase64: string = '',
    apiKey: string = '',
    modelId: string = 'gemini-3.1-flash-lite'
): Promise<DialogueClassificationResult> {
    const trimmedText = text.trim();
    
    // Quick offline fallback classifier for dialogue text if no API key
    if (!apiKey || modelId === 'offline-heuristic') {
        return classifyDialogueOfflineHeuristics(trimmedText);
    }

    const systemPrompt = `Bạn là Chuyên Gia Phân Tích Ngữ Cảnh & Cảm Xúc Manga Scanlation (Manga Dialogue & Tone Expert).
Nhiệm vụ: Phân tích đoạn thoại tiếng Việt / tiếng Nhật hoặc ảnh bóng thoại để xác định chính xác:

1. 'detectedTextType':
- 'dialogue': Hội thoại bình thường giữa các nhân vật
- 'thought': Suy nghĩ thầm kín trong tâm trí, độc thoại nội tâm (thường trong ngoặc đơn hoặc bóng thoại mây)
- 'narration': Dẫn truyện, lời tự sự, mô tả thời gian/địa điểm
- 'aside': Lời thoại phụ, lời nói thì thầm ngoài viền bóng thoại, câu nói đùa chibi
- 'sfx': Tiếng động, âm thanh va chạm, tiếng nổ, tiếng bước chân

2. 'detectedTone':
QUY TẮC BẮT BUỘC:
- Nếu detectedTextType là 'narration', 'aside' hoặc 'sfx', ĐẶT detectedTone = 'none'.
- Nếu detectedTextType là 'dialogue' hoặc 'thought', chọn 1 trong 16 sắc thái cảm xúc:
  'normal' | 'soft' | 'shy' | 'hesitant' | 'whisper' | 'shaky' | 'sad' | 'crying' | 'scared' | 'angry' | 'shouting' | 'excited' | 'serious' | 'weak' | 'cold' | 'special'

3. 'emotionNuance': Tóm tắt ngắn gọn sắc thái giọng nói (ví dụ: "Giọng nghẹn ngào chứa chan nước mắt").
4. 'suggestedStyleTags': Danh sách 3-4 từ khóa typography phù hợp (ví dụ: ["Nét tròn mềm", "Thanh mảnh", "Dịu dàng"]).
5. 'reasoning': Giải thích chi tiết ngữ cảnh tâm lý nhân vật.

Trả về DUY NHẤT một chuỗi JSON hợp lệ:
{
  "detectedTextType": "dialogue",
  "detectedTone": "soft",
  "confidenceScore": 0.95,
  "emotionNuance": "Giọng nói ân cần, an ủi",
  "suggestedStyleTags": ["Nét mềm mại", "Dễ đọc", "Thanh thoát"],
  "reasoning": "Câu thoại mang tính chất an ủi người khác với từ ngữ nhẹ nhàng..."
}`;

    try {
        const parts: any[] = [];
        if (imageDataBase64) {
            const cleanBase64 = imageDataBase64.includes(',') ? imageDataBase64.split(',')[1] : imageDataBase64;
            parts.push({
                inlineData: {
                    mimeType: "image/png",
                    data: cleanBase64
                }
            });
        }
        parts.push({ text: `${systemPrompt}\n\nNội dung câu thoại cần phân tích:\n"${trimmedText || '(Phân tích theo hình ảnh bóng thoại)'}"` });

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const payload = {
            contents: [{ parts }],
            generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json"
            }
        };

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) {
            return classifyDialogueOfflineHeuristics(trimmedText);
        }

        const data = await resp.json();
        const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textContent) return classifyDialogueOfflineHeuristics(trimmedText);

        const cleanJson = textContent.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        const validTypes: MangaTextType[] = ['dialogue', 'thought', 'narration', 'aside', 'sfx'];
        const validTones: MangaTone[] = ['none', 'normal', 'soft', 'shy', 'hesitant', 'whisper', 'shaky', 'sad', 'crying', 'scared', 'angry', 'shouting', 'excited', 'serious', 'weak', 'cold', 'special'];

        const detectedType: MangaTextType = validTypes.includes(parsed.detectedTextType) ? parsed.detectedTextType : 'dialogue';
        let detectedTone: MangaTone = validTones.includes(parsed.detectedTone) ? parsed.detectedTone : 'normal';

        // Enforce user rule: Narration, Aside, SFX have tone = 'none'
        if (detectedType === 'narration' || detectedType === 'aside' || detectedType === 'sfx') {
            detectedTone = 'none';
        }

        const result: DialogueClassificationResult = {
            detectedTextType: detectedType,
            detectedTone: detectedTone,
            confidenceScore: typeof parsed.confidenceScore === 'number' ? Math.max(0, Math.min(1, parsed.confidenceScore)) : 0.92,
            emotionNuance: typeof parsed.emotionNuance === 'string' ? parsed.emotionNuance : TONE_CONFIGS[detectedTone].desc,
            suggestedStyleTags: Array.isArray(parsed.suggestedStyleTags) ? parsed.suggestedStyleTags : ['Manga Dialogue'],
            reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'Phân tích cảm xúc hoàn tất.'
        };

        // Match with user font library
        result.matchedFonts = matchFontsForTypeAndTone(getEffectiveFontLibrary(), detectedType, detectedTone);
        return result;
    } catch (err) {
        console.warn("Exception in classifyDialogueWithAI:", err);
        return classifyDialogueOfflineHeuristics(trimmedText);
    }
}

/**
 * Offline heuristics for dialogue text when offline or without API key
 */
export function classifyDialogueOfflineHeuristics(text: string): DialogueClassificationResult {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();
    const upper = trimmed.toUpperCase();
    let type: MangaTextType = 'dialogue';
    let tone: MangaTone = 'normal';
    let nuance = 'Giọng nói bình thường';
    let tags = ['Thoại tiêu chuẩn', 'Dễ đọc'];
    let reasoning = 'Câu thoại thông thường không chứa từ khóa cảm xúc đặc biệt.';

    // Check SFX with robust uppercase onomatopoeia detection
    const sfxKeywords = ['ẦM', 'BÙM', 'CHOẢNG', 'VÚT', 'RẦM', 'XOẢNG', 'KENG', 'BOOM', 'BANG', 'CRASH', 'SLASH', 'SWOOSH', 'CLANG'];
    const hasSfxWord = sfxKeywords.some(w => upper.includes(w));
    const isUpperPhrase = (trimmed === upper && trimmed.length >= 3);

    if ((hasSfxWord && isUpperPhrase) || (hasSfxWord && trimmed.length <= 25) || (isUpperPhrase && trimmed.length <= 10 && trimmed.endsWith('!'))) {
        type = 'sfx';
        tone = 'none';
        nuance = 'Hiệu ứng âm thanh hành động mạnh mẽ';
        tags = ['SFX Action', 'Nét cọ đậm', 'Tương phản mạnh'];
        reasoning = 'Văn bản ngắn, in hoa và chứa từ tượng thanh đặc trưng của hiệu ứng SFX manga.';
    }
    // Check Narration
    else if (lower.startsWith('tại ') || lower.startsWith('vào một ') || lower.startsWith('ngày xửa ') || lower.startsWith('năm ') || lower.startsWith('tháng ') || lower.includes('ở ngôi làng') || lower.includes('trong khi đó')) {
        type = 'narration';
        tone = 'none';
        nuance = 'Lời dẫn truyện tự sự, trang trọng';
        tags = ['Chữ có chân', 'Trang trọng', 'Dẫn truyện'];
        reasoning = 'Câu mang cấu trúc dẫn dắt bối cảnh mở đầu hoặc mô tả thời gian/không gian của người kể chuyện.';
    }
    // Check Aside / Chibi
    else if (lower.startsWith('*') && lower.endsWith('*') || lower.includes('chibi') || lower.includes('hehe') || lower.includes('nói nhỏ:') || lower.length < 15 && (lower.includes('hả?') || lower.includes('thật á?'))) {
        type = 'aside';
        tone = 'none';
        nuance = 'Lời bình ngoài lề ngộ nghĩnh';
        tags = ['Viết tay', 'Chibi', 'Vui vẻ'];
        reasoning = 'Câu thoại ngắn, mang tính bình luận phụ bên lề trang truyện.';
    }
    // Check Thought / Monologue
    else if ((text.startsWith('(') && text.endsWith(')')) || (text.startsWith('“') && text.endsWith('”')) || lower.includes('mình nghĩ') || lower.includes('tâm trí') || lower.includes('tự hỏi')) {
        type = 'thought';
        tone = 'whisper';
        nuance = 'Suy nghĩ thầm kín trong tâm trí';
        tags = ['Độc thoại', 'Thanh mảnh', 'Nội tâm'];
        reasoning = 'Đoạn văn được đặt trong ngoặc hoặc thể hiện dòng suy nghĩ nội tâm của nhân vật.';
    }
    // Check Emotional Tones in Dialogue
    else {
        type = 'dialogue';
        if (text.includes('!!!') || lower.includes('xông lên') || lower.includes('chết đi') || lower.includes('cút ngay') || (text === text.toUpperCase() && text.length > 8)) {
            tone = 'shouting';
            nuance = 'Gào thét, ra lệnh uy lực';
            tags = ['Hét lớn', 'Nét cực đậm', 'Bùng nổ'];
            reasoning = 'Chứa nhiều dấu chấm than và từ ngữ bộc lộ sự giận dữ hoặc hô hoán xung phong.';
        } else if (lower.includes('hức') || lower.includes('oa oa') || lower.includes('nức nở') || lower.includes('đừng bỏ rơi') || lower.includes('làm ơn...')) {
            tone = 'crying';
            nuance = 'Nghẹn ngào trong nước mắt';
            tags = ['Khóc lóc', 'Nét uốn lượn', 'Cảm xúc'];
            reasoning = 'Chứa từ tượng thanh tiếng khóc và tâm trạng đau thương tột độ.';
        } else if (lower.includes('c-cậu') || lower.includes('t-tớ') || lower.includes('đỏ mặt') || lower.includes('thích...')) {
            tone = 'shy';
            nuance = 'E thẹn, ngượng ngùng đỏ mặt';
            tags = ['Ngại ngùng', 'Tròn mềm', 'Shoujo'];
            reasoning = 'Chứa các từ ngữ ấp úng, lặp âm đầu biểu hiện sự ngượng ngùng khi tỏ tình.';
        } else if (lower.includes('...') || lower.includes('ờ thì') || lower.includes('chuyện là...')) {
            tone = 'hesitant';
            nuance = 'Ngập ngừng, lưỡng lự';
            tags = ['Ngập ngừng', 'Thanh thoát', 'Nhẹ nhàng'];
            reasoning = 'Nhiều dấu chấm lửng ngắt quãng thể hiện sự bối rối không dám nói thẳng.';
        } else if (lower.includes('câm miệng') || lower.includes('ngươi dám') || lower.includes('tức chết')) {
            tone = 'angry';
            nuance = 'Gắt gỏng, phẫn nộ';
            tags = ['Giận dữ', 'Góc cạnh', 'Nét dứt khoát'];
            reasoning = 'Từ ngữ gay gắt mang sắc thái trách móc, tức giận.';
        } else if (lower.includes('cứu với') || lower.includes('sợ quá') || lower.includes('con quái vật')) {
            tone = 'scared';
            nuance = 'Hoảng loạn, khiếp sợ';
            tags = ['Sợ hãi', 'Nét nhọn', 'Bất an'];
            reasoning = 'Thể hiện tâm trạng kinh hãi khi đối mặt hiểm nguy.';
        } else if (lower.includes('tuyệt quá') || lower.includes('thắng rồi') || lower.includes('hoan hô') || lower.includes('haha')) {
            tone = 'excited';
            nuance = 'Phấn khích, vui tươi rạng rỡ';
            tags = ['Hào hứng', 'Tròn nảy', 'Tươi sáng'];
            reasoning = 'Không khí hân hoan, vui mừng.';
        } else if (lower.includes('thưa ngài') || lower.includes('chiến lược') || lower.includes('báo cáo')) {
            tone = 'serious';
            nuance = 'Nghiêm túc, trang trọng';
            tags = ['Nghiêm nghị', 'Chuẩn mực', 'Chững chạc'];
            reasoning = 'Văn phong trang trọng, chuẩn mực công vụ / quân sự.';
        } else if (lower.includes('yếu') || lower.includes('thở không nổi') || lower.includes('mệt quá')) {
            tone = 'weak';
            nuance = 'Yếu ớt, kiệt sức';
            tags = ['Yếu ớt', 'Siêu mảnh', 'Mờ nhạt'];
            reasoning = 'Nhân vật đang trong tình trạng mất sức hoặc bị thương.';
        } else if (lower.includes('không quan tâm') || lower.includes('vô nghĩa') || lower.includes('biến đi')) {
            tone = 'cold';
            nuance = 'Lạnh lùng, xa cách';
            tags = ['Lạnh lùng', 'Sắc bén', 'Hình khối'];
            reasoning = 'Lời nói dứt khoát, điềm tĩnh không chút cảm xúc.';
        } else {
            tone = 'normal';
            nuance = 'Hội thoại tự nhiên';
            tags = ['Thoại chuẩn', 'Dễ đọc'];
            reasoning = 'Hội thoại đời thường trong sáng, cân bằng.';
        }
    }

    const result: DialogueClassificationResult = {
        detectedTextType: type,
        detectedTone: tone,
        confidenceScore: 0.88,
        emotionNuance: nuance,
        suggestedStyleTags: tags,
        reasoning
    };

    result.matchedFonts = matchFontsForTypeAndTone(getEffectiveFontLibrary(), type, tone);
    return result;
}

// ============================================================================
// 4. FONT-TO-TONE MATCHING & SCORING ENGINE
// ============================================================================

/**
 * Calculates a compatibility score (0 - 100) between a Font and a (TextType, Tone) pair.
 */
export function scoreFontForTypeAndTone(
    font: CustomFontItem,
    targetType: MangaTextType,
    targetTone: MangaTone
): number {
    let score = 30;

    // 1. Text Type Alignment (0 - 35 pts)
    const fontType = font.primaryTextType || (
        font.category === 'sfx' ? 'sfx' :
        font.category === 'narration' ? 'narration' :
        font.category === 'cute' ? 'aside' :
        font.category === 'whisper' ? 'thought' : 'dialogue'
    );

    if (fontType === targetType) {
        score += 35;
    } else if (font.compatibleTextTypes && font.compatibleTextTypes.includes(targetType)) {
        score += 20;
    } else {
        // Penalty for conflicting text types
        if ((targetType === 'sfx' && fontType !== 'sfx') || (targetType !== 'sfx' && fontType === 'sfx')) {
            score -= 30;
        }
        if ((targetType === 'narration' && fontType === 'aside') || (targetType === 'aside' && fontType === 'narration')) {
            score -= 20;
        }
    }

    // 2. Tone Alignment (0 - 35 pts)
    if (targetTone === 'none') {
        // If tone is none (Narration, Aside, SFX), tone match is naturally full for non-dialogue
        score += (targetType === fontType) ? 30 : 15;
    } else {
        const fontTone = font.primaryTone || (
            font.category === 'shout' ? 'shouting' :
            font.category === 'whisper' ? 'whisper' :
            font.category === 'cute' ? 'soft' : 'normal'
        );

        if (fontTone === targetTone) {
            score += 30;
        } else if (font.compatibleTones && font.compatibleTones.includes(targetTone)) {
            score += 18;
        } else {
            // Check morphological compatibility with the target tone
            const weight = font.weightScore ?? 0.5;
            const round = font.roundnessScore ?? 0.5;
            const rough = font.roughnessScore ?? 0.1;
            const hand = font.handwrittenScore ?? 0.2;

            if (targetTone === 'shouting' || targetTone === 'angry') {
                if (weight >= 0.65) score += 12;
                else score -= 15; // penalty for soft/thin fonts on shout
            } else if (targetTone === 'soft' || targetTone === 'shy') {
                if (round >= 0.65 && weight <= 0.55) score += 12;
                else if (weight >= 0.70) score -= 15;
            } else if (targetTone === 'whisper' || targetTone === 'weak') {
                if (weight <= 0.38) score += 12;
                else score -= 15;
            } else if (targetTone === 'normal') {
                if (weight >= 0.4 && weight <= 0.58 && round >= 0.45) score += 10;
            }
        }
    }

    // 3. Quality & Readability Baseline (0 - 5 pts)
    if (font.family) score += 5;

    return Math.max(10, Math.min(99, Math.round(score)));
}

/**
 * Searches the user's custom font library and ranks the best fonts for a specific TextType & Tone
 */
export function matchFontsForTypeAndTone(
    fontLibrary: CustomFontItem[],
    targetType: MangaTextType,
    targetTone: MangaTone,
    limit: number = 3
): CustomFontItem[] {
    if (!fontLibrary || fontLibrary.length === 0) return [];

    const scored = fontLibrary.map(font => {
        const matchPercent = scoreFontForTypeAndTone(font, targetType, targetTone);
        return {
            ...font,
            matchPercent
        };
    });

    // Sort descending by match percent
    scored.sort((a, b) => (b.matchPercent || 0) - (a.matchPercent || 0));

    return scored.slice(0, limit).map((f, idx) => ({
        ...f,
        rank: idx + 1
    }));
}

/**
 * Batch classifies all fonts in the library and updates their classification properties
 */
export function batchClassifyFontLibrary(fontLibrary: CustomFontItem[]): CustomFontItem[] {
    return fontLibrary.map(font => {
        const classification = classifyFontOfflineHeuristics(font);
        return {
            ...font,
            primaryTextType: classification.primaryTextType,
            compatibleTextTypes: classification.compatibleTextTypes,
            primaryTone: classification.primaryTone,
            compatibleTones: classification.compatibleTones,
            classification: classification
        };
    });
}

// ============================================================================
// 5. HIGH-FIDELITY CANVAS FONT RENDERING ENGINE
// ============================================================================

/**
 * High-fidelity Canvas renderer that guarantees the custom font glyphs are loaded and rendered
 */
export async function renderClassifiedFontCanvas(
    canvasId: string,
    font: CustomFontItem,
    sampleText?: string
): Promise<void> {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas || !font) return;

    try {
        updateDynamicFontFaceStyles();
    } catch (e) {}

    const text = sampleText || (font.primaryTone && TONE_CONFIGS[font.primaryTone]?.sampleText) || 'Hôm nay chúng ta sẽ đến thư viện học nhóm nhé.';
    const cleanFontName = (font.name || font.family || '').replace(/['"]/g, '');
    const cleanFamilyName = (font.family || font.name || '').replace(/['"]/g, '');

    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 2) : 2;
    const displayW = 560;
    const displayH = 130;

    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    canvas.style.width = '100%';
    canvas.style.maxHeight = '130px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Try loading font face into document.fonts
    try {
        if (typeof document !== 'undefined' && (document as any).fonts) {
            if (font.blob && !(document as any).fonts.check(`22px "${cleanFamilyName}"`)) {
                const buf = await font.blob.arrayBuffer();
                const ff = new FontFace(cleanFamilyName, buf);
                await ff.load();
                (document as any).fonts.add(ff);
            }
            await Promise.race([
                (document as any).fonts.load(`22px "${cleanFamilyName}"`, text),
                new Promise(r => setTimeout(r, 200))
            ]);
        }
    } catch (e) {}

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, displayW, displayH);
    bgGrad.addColorStop(0, '#060a12');
    bgGrad.addColorStop(0.5, '#0d1527');
    bgGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, displayW, displayH);

    // Ambient radial glow
    const glow = ctx.createRadialGradient(displayW / 2, displayH / 2, 10, displayW / 2, displayH / 2, displayW / 2);
    glow.addColorStop(0, 'rgba(99, 102, 241, 0.18)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, displayW, displayH);

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(6, 6, displayW - 12, displayH - 12);

    // Typography specs
    const isBold = (font.weightScore ?? 0.5) >= 0.65;
    const fontSize = text.length > 50 ? 17 : 22;
    ctx.font = `${isBold ? 'bold ' : ''}${fontSize}px "${cleanFamilyName}", "${cleanFontName}", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Stroke Outline
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, displayW / 2, displayH / 2);

    // Text Fill
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, displayW / 2, displayH / 2);
}

// ============================================================================
// 6. UI CONTROLLER & BATCH CLASSIFICATION HANDLERS
// ============================================================================

let currentClassifierMode: 'dialogue' | 'font' = 'dialogue';
let currentDialogueImageBase64: string = '';
let currentSelectedClassifyFont: CustomFontItem | null = null;
let currentGalleryFilterType: MangaTextType | 'all' = 'all';
let currentGalleryFilterTone: MangaTone | 'all' = 'all';
let currentGallerySearchKeyword: string = '';

export function getClassifierMode(): 'dialogue' | 'font' {
    return currentClassifierMode;
}

export function setClassifierMode(mode: 'dialogue' | 'font'): void {
    currentClassifierMode = mode;
    const btnDiag = document.getElementById('btn-classify-mode-dialogue');
    const btnFont = document.getElementById('btn-classify-mode-font');
    const secDiag = document.getElementById('classify-section-dialogue');
    const secFont = document.getElementById('classify-section-font');

    if (btnDiag && btnFont) {
        if (mode === 'dialogue') {
            btnDiag.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all bg-indigo-600 text-white shadow-md flex items-center gap-2 cursor-pointer';
            btnFont.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-slate-200 flex items-center gap-2 cursor-pointer';
            secDiag?.classList.remove('hidden');
            secFont?.classList.add('hidden');
        } else {
            btnFont.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all bg-indigo-600 text-white shadow-md flex items-center gap-2 cursor-pointer';
            btnDiag.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-slate-200 flex items-center gap-2 cursor-pointer';
            secFont?.classList.remove('hidden');
            secDiag?.classList.add('hidden');
            
            populateFontSelectDropdown();
            // Automatically ensure all fonts are classified and render the gallery
            autoClassifyAndRenderGallery();
        }
    }
}

/**
 * Automatically ensures all fonts in library have classification tags and renders the gallery
 */
export function autoClassifyAndRenderGallery(): void {
    const fonts = getEffectiveFontLibrary();
    if (fonts.length === 0) {
        renderAllClassifiedFontsGallery();
        return;
    }

    let needsUpdate = false;
    fonts.forEach(f => {
        if (!f.primaryTextType || !f.primaryTone || !f.classification) {
            const cl = classifyFontOfflineHeuristics(f);
            f.primaryTextType = cl.primaryTextType;
            f.compatibleTextTypes = cl.compatibleTextTypes;
            f.primaryTone = cl.primaryTone;
            f.compatibleTones = cl.compatibleTones;
            f.classification = cl;
            needsUpdate = true;
        }
    });

    if (needsUpdate) {
        saveClassifiedFontsToDB(fonts);
    }

    renderAllClassifiedFontsGallery();
}

/**
 * Saves classified fonts back to IndexedDB asynchronously
 */
export async function saveClassifiedFontsToDB(fonts: CustomFontItem[]): Promise<void> {
    try {
        const db = await openFontsDB();
        const tx = db.transaction(STORE_FONTS_NAME, 'readwrite');
        const store = tx.objectStore(STORE_FONTS_NAME);
        fonts.forEach(f => store.put(f));
    } catch (e) {
        console.warn("Lỗi lưu font classification vào DB:", e);
    }
}

/**
 * Batch classifies ALL fonts currently loaded in user library (User's main request)
 */
export async function classifyAllLoadedFonts(useAi: boolean = false): Promise<void> {
    const fonts = getEffectiveFontLibrary();
    if (!fonts || fonts.length === 0) {
        alert("Chưa có font cá nhân nào trong kho. Hãy tải font (.ttf/.otf) lên tại tab 'Kho Font Của Bạn' trước!");
        return;
    }

    const progressBox = document.getElementById('classify-batch-progress-box');
    const progressBar = document.getElementById('classify-batch-progress-bar');
    const progressPercent = document.getElementById('classify-batch-percent');
    const progressText = document.getElementById('classify-batch-status-text');

    progressBox?.classList.remove('hidden');

    const apiKeyInput = document.getElementById('fontmatch-api-key') as HTMLInputElement | null;
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
    const modelSelect = document.getElementById('fontmatch-model-select') as HTMLSelectElement | null;
    const modelId = modelSelect ? modelSelect.value : 'gemini-3.1-flash-lite';

    const total = fonts.length;

    for (let i = 0; i < total; i++) {
        const font = fonts[i];
        const percent = Math.round(((i + 1) / total) * 100);

        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressPercent) progressPercent.innerText = `${percent}%`;
        if (progressText) progressText.innerText = `Đang phân loại [${i + 1}/${total}]: ${font.name}...`;

        let classification: FontClassificationResult;
        if (useAi && apiKey && modelId !== 'offline-heuristic') {
            classification = await classifyFontWithAI(font, apiKey, modelId);
        } else {
            classification = classifyFontOfflineHeuristics(font);
        }

        font.primaryTextType = classification.primaryTextType;
        font.compatibleTextTypes = classification.compatibleTextTypes;
        font.primaryTone = classification.primaryTone;
        font.compatibleTones = classification.compatibleTones;
        font.classification = classification;

        // Yield to browser UI
        if (i % 5 === 0) {
            await new Promise(r => setTimeout(r, 10));
        }
    }

    await saveClassifiedFontsToDB(fonts);

    if (progressText) progressText.innerText = `✅ Đã hoàn tất phân loại toàn bộ ${total} phông chữ!`;
    setTimeout(() => {
        progressBox?.classList.add('hidden');
    }, 1500);

    renderAllClassifiedFontsGallery();
}

/**
 * Fills the select dropdown with user's available custom fonts
 */
export function populateFontSelectDropdown(): void {
    const select = document.getElementById('classify-font-select') as HTMLSelectElement | null;
    if (!select) return;

    const fonts = getEffectiveFontLibrary();
    select.innerHTML = '';

    if (fonts.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.innerText = 'Chưa có font cá nhân nào (Hãy tải lên tại tab Kho Font)';
        select.appendChild(opt);
        return;
    }

    fonts.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        const typeLabel = f.primaryTextType ? `[${f.primaryTextType.toUpperCase()}]` : '';
        opt.innerText = `${typeLabel} ${f.name}`;
        select.appendChild(opt);
    });

    if (fonts.length > 0) {
        onClassifierFontSelected(fonts[0].id);
    }
}

export function onClassifierFontSelected(fontId: string): void {
    const fonts = getEffectiveFontLibrary();
    currentSelectedClassifyFont = fonts.find(f => f.id === fontId) || fonts[0] || null;
    if (currentSelectedClassifyFont) {
        renderFontPreviewCard(currentSelectedClassifyFont);
    }
}

export function setClassifierSampleText(toneId: MangaTone, typeId: MangaTextType = 'dialogue'): void {
    const input = document.getElementById('classify-dialogue-input') as HTMLTextAreaElement | null;
    if (!input) return;

    const toneConfig = TONE_CONFIGS[toneId];
    if (toneConfig && toneConfig.sampleText) {
        input.value = toneConfig.sampleText;
    }
    
    // Switch to dialogue mode if not already
    setClassifierMode('dialogue');
}

export function handleDialogueImageUpload(file: File): void {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        currentDialogueImageBase64 = e.target?.result as string;
        const previewBox = document.getElementById('classify-img-preview-box');
        const previewImg = document.getElementById('classify-img-thumb') as HTMLImageElement | null;
        const previewName = document.getElementById('classify-img-name');

        if (previewBox && previewImg && previewName) {
            previewImg.src = currentDialogueImageBase64;
            previewName.innerText = file.name;
            previewBox.classList.remove('hidden');
        }
    };
    reader.readAsDataURL(file);
}

export function resetDialogueImage(): void {
    currentDialogueImageBase64 = '';
    const previewBox = document.getElementById('classify-img-preview-box');
    const fileInput = document.getElementById('classify-image-input') as HTMLInputElement | null;
    if (previewBox) previewBox.classList.add('hidden');
    if (fileInput) fileInput.value = '';
}

/**
 * Filter handlers for the classified gallery
 */
export function setGalleryTypeFilter(type: MangaTextType | 'all'): void {
    currentGalleryFilterType = type;
    renderAllClassifiedFontsGallery();
}

export function setGalleryToneFilter(tone: MangaTone | 'all'): void {
    currentGalleryFilterTone = tone;
    renderAllClassifiedFontsGallery();
}

export function onGallerySearchInput(keyword: string): void {
    currentGallerySearchKeyword = keyword.trim().toLowerCase();
    renderAllClassifiedFontsGallery();
}

/**
 * Runs classification on input dialogue text and/or uploaded image
 */
export async function runDialogueClassification(): Promise<void> {
    const input = document.getElementById('classify-dialogue-input') as HTMLTextAreaElement | null;
    const text = input ? input.value : '';
    const apiKeyInput = document.getElementById('fontmatch-api-key') as HTMLInputElement | null;
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
    const modelSelect = document.getElementById('fontmatch-model-select') as HTMLSelectElement | null;
    const modelId = modelSelect ? modelSelect.value : 'gemini-3.1-flash-lite';

    const loadingState = document.getElementById('classify-loading-state');
    const resultsContainer = document.getElementById('classify-results-container');
    const emptyState = document.getElementById('classify-empty-state');

    emptyState?.classList.add('hidden');
    resultsContainer?.classList.add('hidden');
    loadingState?.classList.remove('hidden');

    try {
        const result = await classifyDialogueWithAI(text, currentDialogueImageBase64, apiKey, modelId);
        renderDialogueClassificationResults(result);
    } catch (err: any) {
        console.error("Error in runDialogueClassification:", err);
        const fallback = classifyDialogueOfflineHeuristics(text);
        renderDialogueClassificationResults(fallback);
    } finally {
        loadingState?.classList.add('hidden');
        resultsContainer?.classList.remove('hidden');
    }
}

/**
 * Runs classification on a single custom font
 */
export async function runFontClassification(): Promise<void> {
    if (!currentSelectedClassifyFont) {
        const fonts = getEffectiveFontLibrary();
        if (fonts.length > 0) currentSelectedClassifyFont = fonts[0];
        else return;
    }

    const apiKeyInput = document.getElementById('fontmatch-api-key') as HTMLInputElement | null;
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
    const modelSelect = document.getElementById('fontmatch-model-select') as HTMLSelectElement | null;
    const modelId = modelSelect ? modelSelect.value : 'gemini-3.1-flash-lite';

    const loadingState = document.getElementById('classify-loading-state');
    const resultsContainer = document.getElementById('classify-results-container');
    const emptyState = document.getElementById('classify-empty-state');

    emptyState?.classList.add('hidden');
    resultsContainer?.classList.add('hidden');
    loadingState?.classList.remove('hidden');

    try {
        const result = await classifyFontWithAI(currentSelectedClassifyFont, apiKey, modelId);
        currentSelectedClassifyFont.classification = result;
        currentSelectedClassifyFont.primaryTextType = result.primaryTextType;
        currentSelectedClassifyFont.compatibleTextTypes = result.compatibleTextTypes;
        currentSelectedClassifyFont.primaryTone = result.primaryTone;
        currentSelectedClassifyFont.compatibleTones = result.compatibleTones;

        await saveClassifiedFontsToDB([currentSelectedClassifyFont]);
        renderFontClassificationResultCard(currentSelectedClassifyFont, result);
        renderAllClassifiedFontsGallery();
    } catch (err: any) {
        console.error("Error in runFontClassification:", err);
        const fallback = classifyFontOfflineHeuristics(currentSelectedClassifyFont);
        renderFontClassificationResultCard(currentSelectedClassifyFont, fallback);
    } finally {
        loadingState?.classList.add('hidden');
        resultsContainer?.classList.remove('hidden');
    }
}

/**
 * Renders the results of dialogue classification into the UI
 */
export function renderDialogueClassificationResults(result: DialogueClassificationResult): void {
    const container = document.getElementById('classify-results-container');
    if (!container) return;

    const typeMeta = TEXT_TYPE_CONFIGS[result.detectedTextType];
    const toneMeta = TONE_CONFIGS[result.detectedTone];

    const typeBadge = `<span class="px-3 py-1 rounded-xl text-xs font-bold border ${typeMeta.badgeColor} flex items-center gap-1.5 shadow-sm">
        <span>${typeMeta.icon}</span> <span>${typeMeta.name} (${typeMeta.vnName})</span>
    </span>`;

    const toneBadge = `<span class="px-3 py-1 rounded-xl text-xs font-bold border ${toneMeta.tagColor} flex items-center gap-1.5 shadow-sm">
        <span>${toneMeta.icon}</span> <span>Tone: ${toneMeta.name} (${toneMeta.vnName})</span>
    </span>`;

    let matchedFontsHtml = '';
    const fonts = result.matchedFonts || [];

    if (fonts.length > 0) {
        matchedFontsHtml = fonts.map((font, idx) => {
            const rankBadge = idx === 0 
                ? `<span class="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 text-[11px]">🏆 Top 1 Match (${font.matchPercent}%)</span>`
                : `<span class="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold border border-slate-700 text-[11px]">Top ${idx + 1} (${font.matchPercent}%)</span>`;

            const canvasId = `classify-diag-font-cv-${font.id}-${idx}`;

            return `
            <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 shadow-lg hover:border-indigo-500/40 transition-all">
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <div class="flex items-center gap-2">
                        <span class="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs">#${idx + 1}</span>
                        <div>
                            <h4 class="text-sm font-bold text-slate-100">${font.name}</h4>
                            <p class="text-[10px] text-slate-400 font-mono">Family: ${font.family} • Category: ${font.category}</p>
                        </div>
                    </div>
                    ${rankBadge}
                </div>

                <div class="rounded-xl overflow-hidden border border-slate-855 bg-slate-900 flex items-center justify-center min-h-[100px]">
                    <canvas id="${canvasId}" class="w-full"></canvas>
                </div>

                <div class="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-900">
                    <span class="text-[11px]">Khuyến nghị viền: <strong class="text-slate-200">${font.recommendedStroke || '1.5px'}</strong></span>
                    <button type="button" onclick="navigator.clipboard.writeText('${font.family}');" class="text-indigo-400 hover:underline text-[11px] font-semibold">
                        <i class="fa-solid fa-copy mr-1"></i> Sao chép tên font
                    </button>
                </div>
            </div>`;
        }).join('');
    } else {
        matchedFontsHtml = `
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
            <p>Chưa nạp font nào vào kho cá nhân. Hãy tải các font tiếng Việt yêu thích tại tab <strong>Kho Font Của Bạn</strong> để hệ thống tự động so khớp!</p>
        </div>`;
    }

    container.innerHTML = `
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
        <div class="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800">
            <div class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
                <h3 class="text-xs font-bold text-slate-100 uppercase tracking-wider">Kết Quả Phân Tích Cảm Xúc & Phân Loại AI</h3>
            </div>
            <span class="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-bold">
                Độ tự tin: ${Math.round(result.confidenceScore * 100)}%
            </span>
        </div>

        <div class="flex items-center gap-3 flex-wrap">
            ${typeBadge}
            ${toneBadge}
        </div>

        <div class="bg-slate-950 p-3.5 rounded-xl border border-slate-855 flex flex-col gap-1.5">
            <p class="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Sắc thái cảm xúc nhận diện:</p>
            <p class="text-xs text-indigo-300 font-medium">${result.emotionNuance}</p>
            <p class="text-xs text-slate-300 italic mt-1">${result.reasoning}</p>
        </div>

        <div class="flex flex-col gap-2.5">
            <h4 class="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <i class="fa-solid fa-wand-magic-sparkles text-amber-400"></i> Phông Chữ Khuyến Nghị Tương Thích Nhất (Top Matches)
            </h4>
            <div class="flex flex-col gap-3">
                ${matchedFontsHtml}
            </div>
        </div>
    </div>`;

    // Render Canvas for all matched fonts
    setTimeout(() => {
        const textInput = document.getElementById('classify-dialogue-input') as HTMLTextAreaElement | null;
        const textToRender = textInput ? textInput.value.slice(0, 45) : toneMeta.sampleText;
        fonts.forEach((font, idx) => {
            const canvasId = `classify-diag-font-cv-${font.id}-${idx}`;
            renderClassifiedFontCanvas(canvasId, font, textToRender);
        });
    }, 50);
}

/**
 * Renders the result of classifying a single font into the UI
 */
export function renderFontClassificationResultCard(font: CustomFontItem, result: FontClassificationResult): void {
    const container = document.getElementById('classify-results-container');
    if (!container) return;

    const typeMeta = TEXT_TYPE_CONFIGS[result.primaryTextType];
    const toneMeta = TONE_CONFIGS[result.primaryTone];
    const canvasId = `classify-single-result-cv-${font.id}`;

    container.innerHTML = `
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
        <div class="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800">
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-font text-indigo-400"></i>
                <h3 class="text-sm font-bold text-slate-100">${font.name}</h3>
            </div>
            <span class="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                Tự tin: ${Math.round(result.confidenceScore * 100)}%
            </span>
        </div>

        <!-- Badges -->
        <div class="flex items-center gap-2.5 flex-wrap">
            <span class="px-3 py-1 rounded-xl text-xs font-bold border ${typeMeta.badgeColor} flex items-center gap-1.5">
                <span>${typeMeta.icon}</span> <span>Phân loại chính: ${typeMeta.name}</span>
            </span>
            <span class="px-3 py-1 rounded-xl text-xs font-bold border ${toneMeta.tagColor} flex items-center gap-1.5">
                <span>${toneMeta.icon}</span> <span>Tone: ${toneMeta.name}</span>
            </span>
        </div>

        <!-- Render Sample Canvas -->
        <div class="p-2 rounded-xl bg-slate-950 border border-slate-855 flex flex-col items-center justify-center gap-1">
            <canvas id="${canvasId}" class="w-full"></canvas>
            <span class="text-[10px] font-mono text-slate-500 pb-1">Mẫu chữ thực tế render với font "${font.family}"</span>
        </div>

        <!-- Explanation & Tags -->
        <div class="bg-slate-950 p-3.5 rounded-xl border border-slate-855 flex flex-col gap-2">
            <p class="text-xs text-slate-300">${result.reasoning}</p>
            <div class="flex items-center gap-1.5 flex-wrap pt-1">
                ${result.styleTags.map(t => `<span class="text-[10px] px-2 py-0.5 rounded-lg bg-slate-800 text-indigo-300 border border-slate-700 font-medium">#${t}</span>`).join('')}
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div class="bg-slate-950 p-3 rounded-xl border border-slate-855">
                <span class="text-[10px] text-slate-400 uppercase font-semibold">Khuyến nghị Stroke:</span>
                <p class="font-bold text-emerald-300 mt-0.5">${result.recommendedStroke || '1.5px'}</p>
            </div>
            <div class="bg-slate-950 p-3 rounded-xl border border-slate-855">
                <span class="text-[10px] text-slate-400 uppercase font-semibold">Mục đích tối ưu:</span>
                <p class="font-bold text-indigo-300 mt-0.5">${result.recommendedUsage || 'Manga Typesetting'}</p>
            </div>
        </div>
    </div>`;

    setTimeout(() => {
        renderClassifiedFontCanvas(canvasId, font, toneMeta.sampleText);
    }, 50);
}

function renderFontPreviewCard(font: CustomFontItem): void {
    const previewContainer = document.getElementById('classify-font-preview-box');
    if (!previewContainer) return;

    const canvasId = `classify-preview-card-cv-${font.id}`;
    previewContainer.innerHTML = `
    <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-2">
        <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-200">${font.name}</span>
            <span class="text-[10px] text-slate-400 font-mono">Weight: ${font.weightScore} • Round: ${font.roundnessScore || 0.5}</span>
        </div>
        <div class="rounded-lg overflow-hidden border border-slate-900">
            <canvas id="${canvasId}" class="w-full"></canvas>
        </div>
    </div>`;

    setTimeout(() => {
        renderClassifiedFontCanvas(canvasId, font, 'Manga Translator Studio: Tiếng Việt 123!');
    }, 50);
}

/**
 * Renders the full classified font library gallery with statistics and filter pills
 */
export function renderAllClassifiedFontsGallery(): void {
    const galleryContainer = document.getElementById('classify-gallery-container');
    if (!galleryContainer) return;

    const allFonts = getEffectiveFontLibrary();
    if (allFonts.length === 0) {
        galleryContainer.innerHTML = `
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-2 text-slate-400">
            <i class="fa-solid fa-folder-open text-2xl text-slate-600"></i>
            <p class="text-sm font-bold text-slate-300">Kho font cá nhân hiện đang trống</p>
            <p class="text-xs">Hãy chuyển sang tab <strong>Kho Font Của Bạn</strong> để tải lên các tệp .ttf / .otf.</p>
        </div>`;
        return;
    }

    // Calculate counts
    const typeCounts: Record<string, number> = { dialogue: 0, thought: 0, narration: 0, aside: 0, sfx: 0 };
    const toneCounts: Record<string, number> = {};

    allFonts.forEach(f => {
        const type = f.primaryTextType || 'dialogue';
        typeCounts[type] = (typeCounts[type] || 0) + 1;

        const tone = f.primaryTone || 'normal';
        toneCounts[tone] = (toneCounts[tone] || 0) + 1;
    });

    // Filter fonts
    let filtered = allFonts.filter(f => {
        if (currentGalleryFilterType !== 'all' && f.primaryTextType !== currentGalleryFilterType) {
            return false;
        }
        if (currentGalleryFilterTone !== 'all' && f.primaryTone !== currentGalleryFilterTone) {
            return false;
        }
        if (currentGallerySearchKeyword) {
            const matchName = (f.name || '').toLowerCase().includes(currentGallerySearchKeyword);
            const matchFam = (f.family || '').toLowerCase().includes(currentGallerySearchKeyword);
            if (!matchName && !matchFam) return false;
        }
        return true;
    });

    // Header Stats
    const statsHtml = `
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <button type="button" onclick="setGalleryTypeFilter('all')" class="p-3 rounded-xl border text-left transition-all ${currentGalleryFilterType === 'all' ? 'bg-indigo-600/30 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'}">
            <span class="text-[10px] font-bold uppercase tracking-wider block">Tất Cả Font</span>
            <span class="text-base font-bold text-slate-100">${allFonts.length}</span>
        </button>
        <button type="button" onclick="setGalleryTypeFilter('dialogue')" class="p-3 rounded-xl border text-left transition-all ${currentGalleryFilterType === 'dialogue' ? 'bg-indigo-600/30 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'}">
            <span class="text-[10px] font-bold uppercase tracking-wider block">💬 Dialogue</span>
            <span class="text-base font-bold text-indigo-300">${typeCounts.dialogue || 0}</span>
        </button>
        <button type="button" onclick="setGalleryTypeFilter('thought')" class="p-3 rounded-xl border text-left transition-all ${currentGalleryFilterType === 'thought' ? 'bg-cyan-600/30 border-cyan-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'}">
            <span class="text-[10px] font-bold uppercase tracking-wider block">💭 Thought</span>
            <span class="text-base font-bold text-cyan-300">${typeCounts.thought || 0}</span>
        </button>
        <button type="button" onclick="setGalleryTypeFilter('narration')" class="p-3 rounded-xl border text-left transition-all ${currentGalleryFilterType === 'narration' ? 'bg-amber-600/30 border-amber-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'}">
            <span class="text-[10px] font-bold uppercase tracking-wider block">📜 Narration</span>
            <span class="text-base font-bold text-amber-300">${typeCounts.narration || 0}</span>
        </button>
        <button type="button" onclick="setGalleryTypeFilter('aside')" class="p-3 rounded-xl border text-left transition-all ${currentGalleryFilterType === 'aside' ? 'bg-emerald-600/30 border-emerald-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'}">
            <span class="text-[10px] font-bold uppercase tracking-wider block">🗨️ Aside</span>
            <span class="text-base font-bold text-emerald-300">${typeCounts.aside || 0}</span>
        </button>
        <button type="button" onclick="setGalleryTypeFilter('sfx')" class="p-3 rounded-xl border text-left transition-all ${currentGalleryFilterType === 'sfx' ? 'bg-rose-600/30 border-rose-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'}">
            <span class="text-[10px] font-bold uppercase tracking-wider block">💥 SFX</span>
            <span class="text-base font-bold text-rose-300">${typeCounts.sfx || 0}</span>
        </button>
    </div>`;

    // Cards Grid
    let cardsHtml = '';
    if (filtered.length === 0) {
        cardsHtml = `
        <div class="col-span-full bg-slate-950 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-400">
            Không tìm thấy phông chữ nào phù hợp với bộ lọc hiện tại.
        </div>`;
    } else {
        cardsHtml = filtered.map((font, idx) => {
            const typeMeta = TEXT_TYPE_CONFIGS[font.primaryTextType || 'dialogue'];
            const toneMeta = TONE_CONFIGS[font.primaryTone || 'normal'];
            const canvasId = `gallery-card-cv-${font.id}-${idx}`;

            return `
            <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 shadow-lg hover:border-indigo-500/40 transition-all">
                <div class="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-900">
                    <div class="flex items-center gap-2">
                        <span class="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-xs font-bold font-mono">#${idx + 1}</span>
                        <div>
                            <h4 class="text-xs font-bold text-slate-100 truncate max-w-[180px]">${font.name}</h4>
                            <p class="text-[10px] text-slate-500 font-mono truncate">${font.family}</p>
                        </div>
                    </div>
                    <button type="button" onclick="navigator.clipboard.writeText('${font.family}');" class="text-slate-400 hover:text-indigo-300 text-xs p-1" title="Sao chép tên font">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                </div>

                <!-- Badges -->
                <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold border ${typeMeta.badgeColor}">
                        ${typeMeta.icon} ${typeMeta.name}
                    </span>
                    <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold border ${toneMeta.tagColor}">
                        ${toneMeta.icon} ${toneMeta.name}
                    </span>
                </div>

                <!-- Canvas Visual Render -->
                <div class="rounded-xl overflow-hidden border border-slate-855 bg-slate-900 flex items-center justify-center">
                    <canvas id="${canvasId}" class="w-full"></canvas>
                </div>

                <!-- Reasoning & Stroke -->
                <div class="flex items-center justify-between text-[10.5px] text-slate-400 pt-1">
                    <span>Viền gợi ý: <strong class="text-slate-200">${font.recommendedStroke || '1.5px'}</strong></span>
                    <span class="text-indigo-400 font-mono font-bold">${Math.round((font.classification?.confidenceScore ?? 0.92) * 100)}% Match</span>
                </div>
            </div>`;
        }).join('');
    }

    galleryContainer.innerHTML = `
    <div class="flex flex-col gap-4">
        <!-- Top Stats -->
        ${statsHtml}

        <!-- Filter & Search Toolbar -->
        <div class="flex items-center justify-between flex-wrap gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <div class="relative flex-1 min-w-[200px]">
                <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500"></i>
                <input type="text" value="${currentGallerySearchKeyword}" oninput="onGallerySearchInput(this.value)" placeholder="Tìm kiếm tên font trong kho..." class="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono">
            </div>

            <div class="flex items-center gap-2">
                <span class="text-xs text-slate-400 font-mono">Hiển thị <strong class="text-emerald-400">${filtered.length}</strong> / ${allFonts.length} font</span>
                <button type="button" onclick="classifyAllLoadedFonts(false)" class="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer">
                    <i class="fa-solid fa-wand-magic-sparkles text-[10px]"></i> Phân Loại Lại Toàn Bộ
                </button>
            </div>
        </div>

        <!-- Cards Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${cardsHtml}
        </div>
    </div>`;

    // Render Canvas for all displayed cards
    setTimeout(() => {
        filtered.forEach((font, idx) => {
            const canvasId = `gallery-card-cv-${font.id}-${idx}`;
            renderClassifiedFontCanvas(canvasId, font);
        });
    }, 50);
}

export function initFontClassifierModule(): void {
    // Initial binding
    const btnDiag = document.getElementById('btn-classify-mode-dialogue');
    const btnFont = document.getElementById('btn-classify-mode-font');
    if (btnDiag && btnFont) {
        btnDiag.addEventListener('click', () => setClassifierMode('dialogue'));
        btnFont.addEventListener('click', () => setClassifierMode('font'));
    }
}
