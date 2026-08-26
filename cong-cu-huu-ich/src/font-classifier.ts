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
import { getEffectiveFontLibrary } from './font-matcher';

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

const fontClassificationCache = new Map<string, FontClassificationResult>();

export function clearFontClassificationCache(): void {
    fontClassificationCache.clear();
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

    const cacheKey = `${name}_${cat}_${weight}_${round}_${hand}_${rough}_${formality}_${energy}_${styleType}`;
    if (fontClassificationCache.has(cacheKey)) {
        return fontClassificationCache.get(cacheKey)!;
    }

    const cacheAndReturn = (res: FontClassificationResult): FontClassificationResult => {
        fontClassificationCache.set(cacheKey, res);
        return res;
    };

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
        return cacheAndReturn({
            primaryTextType: primaryType,
            compatibleTextTypes: compatibleTypes,
            primaryTone: primaryTone,
            compatibleTones: compatibleTones,
            confidenceScore: 0.94,
            styleTags: tags,
            reasoning,
            recommendedStroke: '3px - 5px (Viền đậm nổi bật)',
            recommendedUsage: 'SFX hành động, tiếng va chạm, nổ, chiêu thức'
        });
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
        return cacheAndReturn({
            primaryTextType: primaryType,
            compatibleTextTypes: compatibleTypes,
            primaryTone: primaryTone,
            compatibleTones: compatibleTones,
            confidenceScore: 0.95,
            styleTags: tags,
            reasoning,
            recommendedStroke: '0px - 1px (Nét trong khung chữ nhật)',
            recommendedUsage: 'Khung dẫn truyện mở đầu, bối cảnh, thư từ cổ phong'
        });
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
        return cacheAndReturn({
            primaryTextType: primaryType,
            compatibleTextTypes: compatibleTypes,
            primaryTone: primaryTone,
            compatibleTones: compatibleTones,
            confidenceScore: 0.91,
            styleTags: tags,
            reasoning,
            recommendedStroke: '1px - 2px',
            recommendedUsage: 'Lời thì thầm ngoài bóng thoại, ghi chú tác giả, tranh chibi'
        });
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
        return cacheAndReturn({
            primaryTextType: primaryType,
            compatibleTextTypes: compatibleTypes,
            primaryTone: primaryTone,
            compatibleTones: compatibleTones,
            confidenceScore: 0.89,
            styleTags: tags,
            reasoning,
            recommendedStroke: '1px (Viền mỏng nhẹ)',
            recommendedUsage: 'Bóng thoại đám mây, suy ngẫm nội tâm, lời thì thầm bí mật'
        });
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

    return cacheAndReturn({
        primaryTextType: primaryType,
        compatibleTextTypes: compatibleTypes,
        primaryTone: primaryTone,
        compatibleTones: compatibleTones,
        confidenceScore: 0.93,
        styleTags: tags,
        reasoning,
        recommendedStroke: '1.5px (Chuẩn Typeset)',
        recommendedUsage: 'Bóng thoại hội thoại tiêu chuẩn hàng ngày'
    });
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
