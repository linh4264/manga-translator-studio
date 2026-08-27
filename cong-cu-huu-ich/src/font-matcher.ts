/**
 * Module 8: Manga Font Matcher & Recommender (AI Vision & Custom Font Repository) (TypeScript)
 */

import { formatFileSize, openPreviewModal, escapeHTML, escapeCssFontFamily, safeSetLocalStorage, saveSecureToken, getSecureToken } from './common';
import type {
    FontCategory,
    FontStyleType,
    FontWeightGrade,
    FontWidthGrade,
    FontSlantGrade,
    FontCaseGrade,
    FontMorphologyResult,
    FontProfile,
    CustomFontItem,
    AnalysisResult,
    FontRole,
    GenrePresetId,
    StyleProfile,
    RoleConfig,
    GenrePreset,
    FontRoleAssignment,
    GeneratedFontSet,
    AiGenreAnalysisResult
} from './types';

export const BUILTIN_MANGA_FONTS: CustomFontItem[] = [
    {
        id: 'builtin_nunito',
        name: 'Nunito',
        family: "'Nunito', sans-serif",
        fontClass: 'font-manga',
        category: 'dialogue',
        fontStyleType: 'standard_dialogue',
        type: 'builtin',
        weightScore: 0.50,
        energyScore: 0.50,
        formalityScore: 0.40,
        roughnessScore: 0.10,
        roundnessScore: 0.85,
        handwrittenScore: 0.20,
        isAllCaps: false,
        weightGrade: 'Regular',
        widthGrade: 'Normal',
        slantGrade: 'Upright',
        caseGrade: 'Mixed Case',
        slantAngle: 0,
        widthRatio: 0.82,
        caseRatio: 0.70,
        size: 150000,
        dateAdded: 0,
        desc: 'Font thoại tiêu chuẩn (Shoujo / Romance / Dialogue Manga). Nét tròn mềm mại, dễ đọc.',
        recommendedStroke: '1.5px'
    },
    {
        id: 'builtin_be_vietnam_pro',
        name: 'Be Vietnam Pro',
        family: "'Be Vietnam Pro', sans-serif",
        fontClass: 'font-vietnamese',
        category: 'narration',
        fontStyleType: 'serif_narration',
        type: 'builtin',
        weightScore: 0.45,
        energyScore: 0.40,
        formalityScore: 0.80,
        roughnessScore: 0.05,
        roundnessScore: 0.50,
        handwrittenScore: 0.10,
        isAllCaps: false,
        weightGrade: 'Regular',
        widthGrade: 'Normal',
        slantGrade: 'Upright',
        caseGrade: 'Mixed Case',
        slantAngle: 0,
        widthRatio: 0.84,
        caseRatio: 0.72,
        size: 180000,
        dateAdded: 0,
        desc: 'Font dẫn truyện / tự sự / bối cảnh. Trang nhã, chỉn chu, hiển thị tiếng Việt hoàn hảo.',
        recommendedStroke: '1.5px'
    },
    {
        id: 'builtin_bangers',
        name: 'Bangers',
        family: "'Bangers', cursive",
        fontClass: 'font-bangers',
        category: 'shout',
        fontStyleType: 'shout_impact',
        type: 'builtin',
        weightScore: 0.85,
        energyScore: 0.90,
        formalityScore: 0.25,
        roughnessScore: 0.30,
        roundnessScore: 0.40,
        handwrittenScore: 0.20,
        isAllCaps: true,
        weightGrade: 'Bold',
        widthGrade: 'Normal',
        slantGrade: 'Upright',
        caseGrade: 'All Caps',
        slantAngle: 0,
        widthRatio: 0.80,
        caseRatio: 1.0,
        size: 120000,
        dateAdded: 0,
        desc: 'Font la hét / cảm xúc mạnh / Shounen / Comic Action. Nét khối bùng nổ, nổi bật.',
        recommendedStroke: '3.5px'
    },
    {
        id: 'builtin_comic_neue',
        name: 'Comic Neue',
        family: "'Comic Neue', cursive",
        fontClass: 'font-comic-neue',
        category: 'cute',
        fontStyleType: 'cartoon_quirky',
        type: 'builtin',
        weightScore: 0.45,
        energyScore: 0.55,
        formalityScore: 0.20,
        roughnessScore: 0.10,
        roundnessScore: 0.88,
        handwrittenScore: 0.40,
        isAllCaps: false,
        weightGrade: 'Regular',
        widthGrade: 'Normal',
        slantGrade: 'Upright',
        caseGrade: 'Mixed Case',
        slantAngle: 0,
        widthRatio: 0.82,
        caseRatio: 0.68,
        size: 140000,
        dateAdded: 0,
        desc: 'Font hài hước / đời thường / tấu hài / Slice of Life. Nét vẽ thân thiện, vui tươi.',
        recommendedStroke: '2.0px'
    },
    {
        id: 'builtin_caveat',
        name: 'Caveat',
        family: "'Caveat', cursive",
        fontClass: 'font-caveat',
        category: 'whisper',
        fontStyleType: 'whisper_cursive',
        type: 'builtin',
        weightScore: 0.35,
        energyScore: 0.30,
        formalityScore: 0.15,
        roughnessScore: 0.20,
        roundnessScore: 0.70,
        handwrittenScore: 0.85,
        isAllCaps: false,
        weightGrade: 'Light',
        widthGrade: 'Normal',
        slantGrade: 'Italic',
        caseGrade: 'Mixed Case',
        slantAngle: 12,
        widthRatio: 0.75,
        caseRatio: 0.65,
        size: 110000,
        dateAdded: 0,
        desc: 'Font suy nghĩ nội tâm / lời thì thầm / nhật ký. Viết tay mềm mại, giàu cảm xúc.',
        recommendedStroke: '1.0px'
    },
    {
        id: 'builtin_patrick_hand',
        name: 'Patrick Hand',
        family: "'Patrick Hand', cursive",
        fontClass: 'font-comic',
        category: 'cute',
        fontStyleType: 'cartoon_quirky',
        type: 'builtin',
        weightScore: 0.40,
        energyScore: 0.45,
        formalityScore: 0.20,
        roughnessScore: 0.15,
        roundnessScore: 0.75,
        handwrittenScore: 0.80,
        isAllCaps: false,
        weightGrade: 'Regular',
        widthGrade: 'Normal',
        slantGrade: 'Upright',
        caseGrade: 'Mixed Case',
        slantAngle: 0,
        widthRatio: 0.78,
        caseRatio: 0.68,
        size: 105000,
        dateAdded: 0,
        desc: 'Font độc thoại / ghi chú viết tay / nhân vật phụ. Tự nhiên mộc mạc.',
        recommendedStroke: '1.5px'
    },
    {
        id: 'builtin_pangolin',
        name: 'Pangolin',
        family: "'Pangolin', cursive",
        fontClass: 'font-pangolin',
        category: 'cute',
        fontStyleType: 'cartoon_quirky',
        type: 'builtin',
        weightScore: 0.48,
        energyScore: 0.50,
        formalityScore: 0.20,
        roughnessScore: 0.10,
        roundnessScore: 0.85,
        handwrittenScore: 0.60,
        isAllCaps: false,
        weightGrade: 'Regular',
        widthGrade: 'Normal',
        slantGrade: 'Upright',
        caseGrade: 'Mixed Case',
        slantAngle: 0,
        widthRatio: 0.80,
        caseRatio: 0.70,
        size: 115000,
        dateAdded: 0,
        desc: 'Font dễ thương / trẻ thơ / nhí nhảnh. Bo tròn đáng yêu.',
        recommendedStroke: '2.0px'
    },
    {
        id: 'builtin_chakra_petch',
        name: 'Chakra Petch',
        family: "'Chakra Petch', sans-serif",
        fontClass: 'font-chakra',
        category: 'tech',
        fontStyleType: 'tech_display',
        type: 'builtin',
        weightScore: 0.60,
        energyScore: 0.70,
        formalityScore: 0.75,
        roughnessScore: 0.10,
        roundnessScore: 0.20,
        handwrittenScore: 0.05,
        isAllCaps: false,
        weightGrade: 'Medium',
        widthGrade: 'Normal',
        slantGrade: 'Upright',
        caseGrade: 'Mixed Case',
        slantAngle: 0,
        widthRatio: 0.85,
        caseRatio: 0.72,
        size: 160000,
        dateAdded: 0,
        desc: 'Font công nghệ / Sci-Fi / Robot / Hệ thống Game / Cyberpunk.',
        recommendedStroke: '2.0px'
    },
    {
        id: 'builtin_permanent_marker',
        name: 'Permanent Marker',
        family: "'Permanent Marker', cursive",
        fontClass: 'font-marker',
        category: 'sfx',
        fontStyleType: 'brush_sfx',
        type: 'builtin',
        weightScore: 0.90,
        energyScore: 0.95,
        formalityScore: 0.10,
        roughnessScore: 0.85,
        roundnessScore: 0.30,
        handwrittenScore: 0.75,
        isAllCaps: false,
        weightGrade: 'Black',
        widthGrade: 'Normal',
        slantGrade: 'Oblique',
        caseGrade: 'Mixed Case',
        slantAngle: 8,
        widthRatio: 0.85,
        caseRatio: 0.78,
        size: 130000,
        dateAdded: 0,
        desc: 'Font hiệu ứng âm thanh SFX / Cọ vẽ đậm / Va chạm / Kinh dị.',
        recommendedStroke: '3.5px'
    },
    {
        id: 'builtin_bungee',
        name: 'Bungee',
        family: "'Bungee', cursive",
        fontClass: 'font-bungee',
        category: 'sfx',
        fontStyleType: 'shout_impact',
        type: 'builtin',
        weightScore: 0.95,
        energyScore: 0.90,
        formalityScore: 0.30,
        roughnessScore: 0.15,
        roundnessScore: 0.30,
        handwrittenScore: 0.10,
        isAllCaps: true,
        weightGrade: 'Black',
        widthGrade: 'Normal',
        slantGrade: 'Upright',
        caseGrade: 'All Caps',
        slantAngle: 0,
        widthRatio: 0.88,
        caseRatio: 1.0,
        size: 140000,
        dateAdded: 0,
        desc: 'Font khối dày SFX / Tiêu đề chương / Đòn tấn công uy lực.',
        recommendedStroke: '4.0px'
    },
    {
        id: 'builtin_saira_condensed',
        name: 'Saira Condensed',
        family: "'Saira Condensed', sans-serif",
        fontClass: 'font-saira',
        category: 'dialogue',
        fontStyleType: 'standard_dialogue',
        type: 'builtin',
        weightScore: 0.50,
        energyScore: 0.50,
        formalityScore: 0.50,
        roughnessScore: 0.10,
        roundnessScore: 0.40,
        handwrittenScore: 0.10,
        isAllCaps: false,
        weightGrade: 'Regular',
        widthGrade: 'Condensed',
        slantGrade: 'Upright',
        caseGrade: 'Mixed Case',
        slantAngle: 0,
        widthRatio: 0.55,
        caseRatio: 0.70,
        size: 135000,
        dateAdded: 0,
        desc: 'Font hẹp (Condensed) tối ưu cho các khung thoại manga dọc hẹp.',
        recommendedStroke: '1.5px'
    },
    {
        id: 'builtin_inter',
        name: 'Inter',
        family: "'Inter', sans-serif",
        fontClass: 'font-inter',
        category: 'narration',
        fontStyleType: 'standard_dialogue',
        type: 'builtin',
        weightScore: 0.42,
        energyScore: 0.35,
        formalityScore: 0.75,
        roughnessScore: 0.05,
        roundnessScore: 0.50,
        handwrittenScore: 0.05,
        isAllCaps: false,
        weightGrade: 'Regular',
        widthGrade: 'Normal',
        slantGrade: 'Upright',
        caseGrade: 'Mixed Case',
        slantAngle: 0,
        widthRatio: 0.82,
        caseRatio: 0.72,
        size: 170000,
        dateAdded: 0,
        desc: 'Font phụ chú (Small text) / Chú thích hệ thống / Cực kỳ rõ nét.',
        recommendedStroke: '1.0px'
    }
];

let fontMatchLoadedImg: HTMLImageElement | null = null;
let fontMatchImgDataUrl = '';
let currentTop3Matches: CustomFontItem[] = [];
let customFontsList: CustomFontItem[] = [];
let liveUpdateDebounceTimer: any = null;

export function getEffectiveFontLibrary(): CustomFontItem[] {
    if (customFontsList && customFontsList.length > 0) {
        const customNames = new Set(customFontsList.map(f => f.name.toLowerCase()));
        const remainingBuiltins = BUILTIN_MANGA_FONTS.filter(b => !customNames.has(b.name.toLowerCase()));
        return [...customFontsList, ...remainingBuiltins];
    }
    return BUILTIN_MANGA_FONTS;
}

// Font Set Recommender State
export let currentGeneratedFontSet: GeneratedFontSet | null = null;
let genreSampleLoadedImgs: HTMLImageElement[] = [];
let genreSampleDataUrls: string[] = [];

export const GENRE_PRESETS: Record<GenrePresetId, GenrePreset> = {
    romance: {
        id: 'romance',
        name: 'Soft Romance',
        description: 'Phù hợp cho Shoujo, Ngôn Tình, Tình Cảm Học Đường, Lãng Mạn Dịu Dàng.',
        icon: '🌸',
        tone: 'Dịu dàng, cảm xúc, mềm mại, sâu lắng',
        visualStyle: 'Nét chữ tròn mềm, thanh thoát, xen lẫn chữ viết tay nhẹ nhàng',
        baseProfile: {
            roundness: 0.85,
            weight: 0.40,
            formality: 0.35,
            handwritten: 0.30,
            intensity: 0.25
        },
        roles: {
            dialogue: {
                role: 'dialogue',
                label: 'Hội thoại chính (Dialogue)',
                description: 'Nét tròn, mềm mại, dễ đọc, truyền tải sự dịu dàng.',
                sampleText: 'Em không muốn anh đi...',
                targetProfile: { roundness: 0.85, weight: 0.40, formality: 0.35, handwritten: 0.25, intensity: 0.25 },
                preferredCategories: ['dialogue', 'cute', 'whisper']
            },
            innerThought: {
                role: 'innerThought',
                label: 'Suy nghĩ nội tâm (Inner Thought)',
                description: 'Chữ viết tay nét mảnh hoặc nghiêng nhẹ, tạo cảm giác tâm tư sâu kín.',
                sampleText: 'Ước gì thời gian có thể dừng lại...',
                targetProfile: { roundness: 0.75, weight: 0.30, formality: 0.20, handwritten: 0.80, intensity: 0.20 },
                preferredCategories: ['whisper', 'cute', 'dialogue']
            },
            narration: {
                role: 'narration',
                label: 'Dẫn chuyện / Bối cảnh (Narration)',
                description: 'Nét chữ chỉn chu, thanh lịch, trang nhã.',
                sampleText: 'Ngày hôm đó, mọi thứ đã thay đổi.',
                targetProfile: { roundness: 0.50, weight: 0.40, formality: 0.80, handwritten: 0.10, intensity: 0.20 },
                preferredCategories: ['narration', 'dialogue']
            },
            shout: {
                role: 'shout',
                label: 'Cảm xúc mạnh / Thổ lộ (Emotional Shout)',
                description: 'Nét đậm tròn nổi bật, thể hiện cảm xúc cao trào nhưng không thô bạo.',
                sampleText: 'ĐỪNG ĐI MÀ!',
                targetProfile: { roundness: 0.70, weight: 0.75, formality: 0.30, handwritten: 0.20, intensity: 0.75 },
                preferredCategories: ['shout', 'cute', 'dialogue']
            },
            sfx: {
                role: 'sfx',
                label: 'Hiệu ứng âm thanh (Soft SFX)',
                description: 'Nét vẽ tay mềm mại, biểu thị nhịp tim hoặc tiếng động nhẹ nhàng.',
                sampleText: 'Thình thịch...',
                targetProfile: { roundness: 0.80, weight: 0.60, formality: 0.15, handwritten: 0.70, intensity: 0.50 },
                preferredCategories: ['sfx', 'cute', 'whisper']
            },
            smallText: {
                role: 'smallText',
                label: 'Chú thích / Lời thì thầm (Small Text)',
                description: 'Nét thanh gọn gàng, đọc rõ ở kích thước nhỏ.',
                sampleText: '(ngượng ngùng quay mặt đi)',
                targetProfile: { roundness: 0.60, weight: 0.35, formality: 0.50, handwritten: 0.20, intensity: 0.15 },
                preferredCategories: ['whisper', 'dialogue', 'cute']
            }
        }
    },
    comedy: {
        id: 'comedy',
        name: 'Cute / Comedy',
        description: 'Phù hợp cho Hài Hước, Đời Thường (Slice of Life), Trẻ Con, Tấu Hài Siêu Nhí Nhố.',
        icon: '🤣',
        tone: 'Vui tươi, tinh nghịch, lầy lội, tràn ngập năng lượng tích cực',
        visualStyle: 'Nét chữ bong bóng tròn trĩnh, ngộ nghĩnh, viết tay hoạt hình',
        baseProfile: {
            roundness: 0.90,
            weight: 0.50,
            formality: 0.15,
            handwritten: 0.45,
            intensity: 0.50
        },
        roles: {
            dialogue: {
                role: 'dialogue',
                label: 'Hội thoại tấu hài (Comedy Dialogue)',
                description: 'Nét chữ tròn xoe, vui nhộn, thoải mái như truyện tranh hoạt hình.',
                sampleText: 'Ủa alo, ai cho phép làm vậy hả?!',
                targetProfile: { roundness: 0.90, weight: 0.48, formality: 0.20, handwritten: 0.40, intensity: 0.40 },
                preferredCategories: ['cute', 'dialogue', 'shout']
            },
            innerThought: {
                role: 'innerThought',
                label: 'Độc thoại lầy lội (Inner Monologue)',
                description: 'Chữ viết tay ngộ nghĩnh, biểu cảm hoảng loạn hoặc toan tính hài.',
                sampleText: 'Chuyến này tiêu đời mình thật rồi...',
                targetProfile: { roundness: 0.80, weight: 0.35, formality: 0.15, handwritten: 0.85, intensity: 0.30 },
                preferredCategories: ['cute', 'whisper', 'dialogue']
            },
            narration: {
                role: 'narration',
                label: 'Dẫn chuyện dí dỏm (Funny Narration)',
                description: 'Chỉn chu vừa phải, giữ nét tròn thân thiện.',
                sampleText: 'Và thế là kế hoạch đổ bể trong một nốt nhạc.',
                targetProfile: { roundness: 0.70, weight: 0.45, formality: 0.60, handwritten: 0.20, intensity: 0.30 },
                preferredCategories: ['dialogue', 'narration', 'cute']
            },
            shout: {
                role: 'shout',
                label: 'La hét ngã ngửa (Crazy Shout)',
                description: 'Chữ khối to phồng, nhí nhảnh, năng lượng bùng phát.',
                sampleText: 'TRỜI ƠI LÀ TRỜI!!!',
                targetProfile: { roundness: 0.75, weight: 0.85, formality: 0.15, handwritten: 0.35, intensity: 0.85 },
                preferredCategories: ['shout', 'cute', 'sfx']
            },
            sfx: {
                role: 'sfx',
                label: 'Hiệu ứng hoạt hình (Cartoon SFX)',
                description: 'Nét vẽ vui nhộn, mô phỏng cú đánh bẹp dí hay tiếng cười té ghế.',
                sampleText: 'BỐP! CHÍU CHÍU!',
                targetProfile: { roundness: 0.85, weight: 0.75, formality: 0.10, handwritten: 0.65, intensity: 0.75 },
                preferredCategories: ['sfx', 'cute', 'shout']
            },
            smallText: {
                role: 'smallText',
                label: 'Lảm nhảm bên lề (Quirky Side-text)',
                description: 'Chữ viết tay nhỏ nhắn nguệch ngoạc hài hước.',
                sampleText: '(tiếng cười khúc khích bên cạnh)',
                targetProfile: { roundness: 0.70, weight: 0.35, formality: 0.30, handwritten: 0.50, intensity: 0.20 },
                preferredCategories: ['cute', 'whisper', 'dialogue']
            }
        }
    },
    modern: {
        id: 'modern',
        name: 'Clean Modern',
        description: 'Phù hợp cho Webtoon Hiện Đại, Học Đường, Công Sở, Trinh Thám Đô Thị.',
        icon: '🏙️',
        tone: 'Hiện đại, tối giản, rõ ràng, dễ theo dõi mạch truyện',
        visualStyle: 'Chữ Sans-Serif cân đối, hình học hiện đại, nét sắc sảo, tính quy chuẩn cao',
        baseProfile: {
            roundness: 0.45,
            weight: 0.45,
            formality: 0.70,
            handwritten: 0.10,
            intensity: 0.35
        },
        roles: {
            dialogue: {
                role: 'dialogue',
                label: 'Hội thoại chuẩn mực (Modern Dialogue)',
                description: 'Không chân (Sans-Serif) trung tính, rõ nét trên mọi kích thước màn hình.',
                sampleText: 'Hôm nay chúng ta sẽ bắt đầu dự án mới.',
                targetProfile: { roundness: 0.50, weight: 0.45, formality: 0.60, handwritten: 0.10, intensity: 0.30 },
                preferredCategories: ['dialogue', 'narration', 'tech']
            },
            innerThought: {
                role: 'innerThought',
                label: 'Nghĩ thầm sắc nét (Logical Thought)',
                description: 'Nét mảnh, tinh gọn, mang tính tư duy phân tích.',
                sampleText: 'Có điều gì đó không bình thường ở đây.',
                targetProfile: { roundness: 0.45, weight: 0.35, formality: 0.50, handwritten: 0.30, intensity: 0.25 },
                preferredCategories: ['whisper', 'dialogue', 'tech']
            },
            narration: {
                role: 'narration',
                label: 'Tường thuật thời gian / địa điểm (Clean Caption)',
                description: 'Khung chữ nhật hiện đại, phông chữ trang trọng, kỷ luật.',
                sampleText: 'Chương 12: Bước ngoặt định mệnh.',
                targetProfile: { roundness: 0.40, weight: 0.45, formality: 0.85, handwritten: 0.05, intensity: 0.30 },
                preferredCategories: ['narration', 'tech', 'dialogue']
            },
            shout: {
                role: 'shout',
                label: 'Quát mắng / Cảnh báo (Urban Shout)',
                description: 'In hoa nét dày dặn, góc cạnh dứt khoát.',
                sampleText: 'TẤT CẢ TRẬT TỰ!',
                targetProfile: { roundness: 0.35, weight: 0.85, formality: 0.50, handwritten: 0.05, intensity: 0.80 },
                preferredCategories: ['shout', 'tech', 'dialogue']
            },
            sfx: {
                role: 'sfx',
                label: 'Tiếng động đô thị (Urban SFX)',
                description: 'Hiệu ứng cơ khí, tiếng bước chân, chuông điện thoại, máy móc.',
                sampleText: 'TÁCH! TÍT TÍT!',
                targetProfile: { roundness: 0.40, weight: 0.80, formality: 0.30, handwritten: 0.20, intensity: 0.70 },
                preferredCategories: ['sfx', 'tech', 'shout']
            },
            smallText: {
                role: 'smallText',
                label: 'Chú thích giao diện / Chữ nhỏ (UI & Notes)',
                description: 'Gọn gàng, mô phỏng tin nhắn hoặc thông báo hệ thống.',
                sampleText: '(thông báo từ hệ thống di động)',
                targetProfile: { roundness: 0.45, weight: 0.35, formality: 0.65, handwritten: 0.10, intensity: 0.15 },
                preferredCategories: ['tech', 'dialogue', 'whisper']
            }
        }
    },
    action: {
        id: 'action',
        name: 'Action / Impact',
        description: 'Phù hợp cho Shounen, Võ Thuật, Siêu Nhiên, Chiến Đấu Bùng Nổ, Kịch Tính Cao.',
        icon: '💥',
        tone: 'Kịch tính, uy lực, sắc bén, tốc độ và tương phản cực mạnh',
        visualStyle: 'Chữ in hoa góc cạnh, nét cọ giật mạnh, độ dày nét vượt trội',
        baseProfile: {
            roundness: 0.25,
            weight: 0.80,
            formality: 0.30,
            handwritten: 0.20,
            intensity: 0.90
        },
        roles: {
            dialogue: {
                role: 'dialogue',
                label: 'Thoại chiến binh (Action Dialogue)',
                description: 'Nét dày dặn, in hoa hoặc bán in hoa, đanh thép và quyết đoán.',
                sampleText: 'Ngươi nghĩ mình có thể đánh bại ta sao?!',
                targetProfile: { roundness: 0.30, weight: 0.65, formality: 0.35, handwritten: 0.15, intensity: 0.70 },
                preferredCategories: ['dialogue', 'shout', 'tech']
            },
            innerThought: {
                role: 'innerThought',
                label: 'Suy tính trong trận đấu (Tactical Mind)',
                description: 'Nét chữ cô đọng, sắc bén, nhịp điệu nhanh.',
                sampleText: 'Đòn vừa rồi... lực đánh quá kinh khủng.',
                targetProfile: { roundness: 0.30, weight: 0.45, formality: 0.45, handwritten: 0.25, intensity: 0.50 },
                preferredCategories: ['whisper', 'dialogue', 'tech']
            },
            narration: {
                role: 'narration',
                label: 'Dẫn giải chiêu thức (Battle Narration)',
                description: 'Đậm đặc, đầm chắc, tạo sức nặng của lời dẫn.',
                sampleText: 'Trận quyết chiến đỉnh cao chính thức bắt đầu.',
                targetProfile: { roundness: 0.25, weight: 0.55, formality: 0.75, handwritten: 0.05, intensity: 0.60 },
                preferredCategories: ['narration', 'shout', 'dialogue']
            },
            shout: {
                role: 'shout',
                label: 'Hét tuyệt chiêu (Ultimate Shout)',
                description: 'Chữ khối cực đại, nét gãy rực lửa, thể hiện năng lượng tối thượng.',
                sampleText: 'ĐỠ LẤY ĐÒN NÀY ĐI!!!',
                targetProfile: { roundness: 0.20, weight: 0.95, formality: 0.25, handwritten: 0.10, intensity: 0.98 },
                preferredCategories: ['shout', 'sfx', 'tech']
            },
            sfx: {
                role: 'sfx',
                label: 'Va chạm & Nổ (Heavy Impact SFX)',
                description: 'Nét cọ xước rách vỡ, uy lực chấn động đất trời.',
                sampleText: 'ẦM ẦM ẦM!!! RẮC!',
                targetProfile: { roundness: 0.15, weight: 0.95, formality: 0.05, handwritten: 0.75, intensity: 0.98 },
                preferredCategories: ['sfx', 'shout']
            },
            smallText: {
                role: 'smallText',
                label: 'Thì thào / Tiếng thở (Tense Murmur)',
                description: 'Chữ nhỏ đanh gọn, biểu đạt sự căng thẳng nghẹt thở.',
                sampleText: '(tiếng nắm đấm siết chặt)',
                targetProfile: { roundness: 0.30, weight: 0.45, formality: 0.55, handwritten: 0.15, intensity: 0.35 },
                preferredCategories: ['dialogue', 'whisper', 'tech']
            }
        }
    },
    dark: {
        id: 'dark',
        name: 'Dark / Gothic',
        description: 'Phù hợp cho Kinh Dị, Huyền Bí, Trinh Thám Tâm Lý, Seinen U Tối, Huyết Ma.',
        icon: '🦇',
        tone: 'U ám, rùng rợn, bất an, gai góc và ma mị',
        visualStyle: 'Nét chữ nham nhở, rách xước, font cổ điển Gothic hoặc nét cào cấu méo mó',
        baseProfile: {
            roundness: 0.15,
            weight: 0.60,
            formality: 0.35,
            handwritten: 0.60,
            intensity: 0.75
        },
        roles: {
            dialogue: {
                role: 'dialogue',
                label: 'Thoại ma quái (Eerie Dialogue)',
                description: 'Nét chữ hơi gãy hoặc mang vẻ bất an, cổ quái.',
                sampleText: 'Ngươi... đã nhìn thấy nó rồi phải không?',
                targetProfile: { roundness: 0.20, weight: 0.55, formality: 0.40, handwritten: 0.30, intensity: 0.60 },
                preferredCategories: ['dialogue', 'whisper', 'sfx']
            },
            innerThought: {
                role: 'innerThought',
                label: 'Nỗi sợ trong tâm trí (Psychological Dread)',
                description: 'Chữ viết tay run rẩy, bất định, hoảng loạn.',
                sampleText: 'Có ai đó đang đứng ngay sau lưng mình...',
                targetProfile: { roundness: 0.25, weight: 0.35, formality: 0.15, handwritten: 0.85, intensity: 0.55 },
                preferredCategories: ['whisper', 'sfx', 'cute']
            },
            narration: {
                role: 'narration',
                label: 'Bản thảo u tối (Dark Chronicle)',
                description: 'Serif cổ điển hoặc Gothic trang trọng rùng mình.',
                sampleText: 'Kể từ đêm định mệnh đó, không ai còn thấy bóng người.',
                targetProfile: { roundness: 0.30, weight: 0.50, formality: 0.90, handwritten: 0.10, intensity: 0.45 },
                preferredCategories: ['narration', 'dialogue']
            },
            shout: {
                role: 'shout',
                label: 'Gào thét hoảng loạn (Horror Scream)',
                description: 'Nét rách xước gai góc, tiếng thét kinh hoàng tột độ.',
                sampleText: 'CỨU TA VỚI!!!',
                targetProfile: { roundness: 0.10, weight: 0.90, formality: 0.15, handwritten: 0.50, intensity: 0.95 },
                preferredCategories: ['shout', 'sfx']
            },
            sfx: {
                role: 'sfx',
                label: 'Tiếng cào cấu ghê rợn (Creepy SFX)',
                description: 'Nét cọ sần sùi bẩn bựa, mô phỏng tiếng cào móng, tiếng xương vỡ.',
                sampleText: 'RỘT RẠC... CÀO CẤU...',
                targetProfile: { roundness: 0.10, weight: 0.85, formality: 0.05, handwritten: 0.90, intensity: 0.95 },
                preferredCategories: ['sfx', 'shout']
            },
            smallText: {
                role: 'smallText',
                label: 'Tiếng thở gấp (Spooky Whisper)',
                description: 'Mảnh khảnh ma quái, như tiếng thì thầm bên tai.',
                sampleText: '(tiếng thở gấp gáp trong bóng tối)',
                targetProfile: { roundness: 0.25, weight: 0.30, formality: 0.30, handwritten: 0.60, intensity: 0.30 },
                preferredCategories: ['whisper', 'sfx']
            }
        }
    },
    fantasy: {
        id: 'fantasy',
        name: 'Fantasy / Elegant',
        description: 'Phù hợp cho Kỳ Ảo, Hoàng Cung, Cổ Trang, Manhwa Tái Sinh, Quý Tộc.',
        icon: '👑',
        tone: 'Trang trọng, quý phái, thanh lịch, mang màu sắc sử thi và phép thuật',
        visualStyle: 'Chữ Serif có chân tinh tế, đường nét uốn lượn thư pháp quý tộc',
        baseProfile: {
            roundness: 0.55,
            weight: 0.45,
            formality: 0.80,
            handwritten: 0.25,
            intensity: 0.40
        },
        roles: {
            dialogue: {
                role: 'dialogue',
                label: 'Đối thoại quý tộc (Royal Dialogue)',
                description: 'Nét chữ thanh nhã, quý phái, câu chữ mang tính cung đình.',
                sampleText: 'Xin thứ lỗi vì sự đường đột của thần, thưa bệ hạ.',
                targetProfile: { roundness: 0.60, weight: 0.45, formality: 0.75, handwritten: 0.20, intensity: 0.35 },
                preferredCategories: ['dialogue', 'narration', 'cute']
            },
            innerThought: {
                role: 'innerThought',
                label: 'Tâm tư cổ kính (Poetic Reflection)',
                description: 'Thư pháp nhẹ nhàng hoặc nét nghiêng mềm mại.',
                sampleText: 'Ánh mắt ấy... mang theo bí mật từ ngàn năm trước.',
                targetProfile: { roundness: 0.65, weight: 0.35, formality: 0.60, handwritten: 0.65, intensity: 0.30 },
                preferredCategories: ['whisper', 'dialogue', 'narration']
            },
            narration: {
                role: 'narration',
                label: 'Sử thi / Huyền sử (Epic Narration)',
                description: 'Serif cổ điển sang trọng, tạo cảm giác đọc sách cổ ma thuật.',
                sampleText: 'Vào kỷ nguyên của rồng thiêng và ma thuật cổ đại.',
                targetProfile: { roundness: 0.40, weight: 0.50, formality: 0.95, handwritten: 0.05, intensity: 0.35 },
                preferredCategories: ['narration', 'dialogue']
            },
            shout: {
                role: 'shout',
                label: 'Hiệu lệnh vương giả (Majestic Shout)',
                description: 'Đậm nét uy nghiêm, hùng tráng như tiếng hô của bậc đế vương.',
                sampleText: 'HỠI SỨC MẠNH CỦA ÁNH SÁNG!',
                targetProfile: { roundness: 0.40, weight: 0.85, formality: 0.65, handwritten: 0.15, intensity: 0.85 },
                preferredCategories: ['shout', 'narration', 'sfx']
            },
            sfx: {
                role: 'sfx',
                label: 'Phép thuật lấp lánh (Magic SFX)',
                description: 'Nét uốn lượn bay bổng, mô phỏng luồng sáng, đòn niệm chú ma thuật.',
                sampleText: 'VÚT! LẤP LÁNH!',
                targetProfile: { roundness: 0.70, weight: 0.65, formality: 0.30, handwritten: 0.55, intensity: 0.70 },
                preferredCategories: ['sfx', 'cute', 'shout']
            },
            smallText: {
                role: 'smallText',
                label: 'Ghi chú cung đình (Court Notes)',
                description: 'Nét chữ nhỏ quý phái, chỉn chu.',
                sampleText: '(tiếng váy dạ hội sột soạt)',
                targetProfile: { roundness: 0.50, weight: 0.35, formality: 0.80, handwritten: 0.15, intensity: 0.20 },
                preferredCategories: ['narration', 'dialogue', 'whisper']
            }
        }
    }
};

export function getCategoryLabel(cat: string): string {
    switch (cat) {
        case 'dialogue': return 'Hội thoại Manga';
        case 'shout': return 'La hét / Cảm thán';
        case 'narration': return 'Dẫn truyện / Tường thuật';
        case 'whisper': return 'Thì thầm / Nghĩ thầm';
        case 'cute': return 'Dễ thương / Hài hước';
        case 'tech': return 'Công nghệ / Robot';
        case 'sfx': return 'SFX Âm thanh';
        default: return 'Đa dụng';
    }
}

// =========================================================================
// --- GENRE -> STYLE PROFILE -> FONT SET RECOMMENDER ENGINE ---
// =========================================================================

export function calculateRoleSimilarity(
    font: CustomFontItem,
    targetProfile: StyleProfile,
    preferredCategories: FontCategory[]
): number {
    const fw = font.weightScore ?? 0.5;
    const fr = font.roundnessScore ?? (1.0 - (font.roughnessScore ?? 0.2) * 0.5);
    const ff = font.formalityScore ?? 0.4;
    const fh = font.handwrittenScore ?? ((font.roughnessScore ?? 0.2) * 0.65 + (1.0 - (font.formalityScore ?? 0.4)) * 0.35);
    const fi = font.energyScore ?? 0.5;

    const tw = targetProfile.weight;
    const tr = targetProfile.roundness;
    const tf = targetProfile.formality;
    const th = targetProfile.handwritten;
    const ti = targetProfile.intensity;

    const dw = tw - fw;
    const dr = tr - fr;
    const df = tf - ff;
    const dh = th - fh;
    const di = ti - fi;

    const dist = Math.sqrt(
        dw * dw * 0.30 +
        dr * dr * 0.25 +
        df * df * 0.20 +
        dh * dh * 0.15 +
        di * di * 0.10
    );

    const morphSim = Math.max(0, 1.0 - dist);

    let catBonus = 0.35;
    if (preferredCategories) {
        const idx = preferredCategories.indexOf(font.category);
        if (idx !== -1) {
            catBonus = idx === 0 ? 1.0 : idx === 1 ? 0.75 : 0.55;
        }
    }

    const finalScore = morphSim * 0.85 + catBonus * 0.15;
    return Math.max(0.1, Math.min(1.0, finalScore));
}

export function findBestFontForRole(
    fontList: CustomFontItem[],
    roleConfig: RoleConfig,
    preferredFontName?: string
): { font: CustomFontItem; score: number } {
    if (!fontList || fontList.length === 0) {
        return { font: null as any, score: 0 };
    }

    let bestFont = fontList[0];
    let bestScore = -Infinity;

    for (let i = 0; i < fontList.length; i++) {
        const font = fontList[i];
        let score = calculateRoleSimilarity(font, roleConfig.targetProfile, roleConfig.preferredCategories);
        if (preferredFontName && font.name === preferredFontName) {
            score = Math.min(0.99, score + 0.04);
        }
        if (score > bestScore) {
            bestScore = score;
            bestFont = font;
        }
    }

    return { font: bestFont, score: Math.max(0, bestScore) };
}

export function rankFontsForRole(
    fontList: CustomFontItem[],
    roleConfig: RoleConfig,
    preferredFontName?: string
): { font: CustomFontItem, score: number }[] {
    if (!fontList || fontList.length === 0) return [];

    const scored = fontList.map(font => {
        let score = calculateRoleSimilarity(font, roleConfig.targetProfile, roleConfig.preferredCategories);
        if (preferredFontName && font.name === preferredFontName) {
            score = Math.min(0.99, score + 0.04);
        }
        return {
            font,
            score
        };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored;
}

export function generateFontSetFromPreset(fontList: CustomFontItem[], presetId: GenrePresetId): GeneratedFontSet {
    const preset = GENRE_PRESETS[presetId] || GENRE_PRESETS.romance;
    const roles: FontRole[] = ['dialogue', 'innerThought', 'narration', 'shout', 'sfx', 'smallText'];
    const assignments: Partial<Record<FontRole, FontRoleAssignment>> = {};
    const usedFonts = new Set<string>();

    if (!fontList || fontList.length === 0) {
        roles.forEach(role => {
            const roleCfg = preset.roles[role];
            assignments[role] = {
                role,
                roleLabel: roleCfg.label,
                fontName: 'Chưa có font (Tải lên font .ttf/.otf)',
                fontFamily: 'sans-serif',
                fontItem: null,
                score: 0,
                isStrongMatch: false,
                sampleText: roleCfg.sampleText,
                desc: roleCfg.description
            };
        });

        return {
            presetId,
            presetName: preset.name,
            tone: preset.tone,
            visualStyle: preset.visualStyle,
            roles: assignments as Record<FontRole, FontRoleAssignment>,
            coreFontCount: 0
        };
    }

    // 1. Assign primary dialogue font in single pass
    const dialogueBest = findBestFontForRole(fontList, preset.roles.dialogue);
    const dialogueFontName = dialogueBest?.font?.name || fontList[0].name;

    // 2. Assign remaining roles in single pass
    roles.forEach(role => {
        const roleCfg = preset.roles[role];
        const isReadingGroup = ['dialogue', 'innerThought', 'narration', 'smallText'].includes(role);
        const preferredName = isReadingGroup ? dialogueFontName : undefined;
        const best = findBestFontForRole(fontList, roleCfg, preferredName);

        const matchPercent = Math.min(99, Math.max(10, Math.round(best.score * 100)));
        assignments[role] = {
            role,
            roleLabel: roleCfg.label,
            fontName: best.font ? best.font.name : fontList[0].name,
            fontFamily: best.font ? best.font.family : fontList[0].family,
            fontItem: best.font,
            score: matchPercent,
            isStrongMatch: matchPercent >= 60,
            sampleText: roleCfg.sampleText,
            desc: roleCfg.description
        };

        if (best.font) {
            usedFonts.add(best.font.name);
        }
    });

    return {
        presetId,
        presetName: preset.name,
        tone: preset.tone,
        visualStyle: preset.visualStyle,
        roles: assignments as Record<FontRole, FontRoleAssignment>,
        coreFontCount: usedFonts.size
    };
}

export function generateFontSetFromCustomProfile(
    fontList: CustomFontItem[],
    customProfile: StyleProfile,
    name: string = 'Tùy Chỉnh Theo AI',
    tone: string = 'Phân tích tự động từ ảnh mẫu',
    visualStyle: string = 'Đặc trưng thị giác trích xuất từ trang manga'
): GeneratedFontSet {
    let closestPresetId: GenrePresetId = 'romance';
    let minPresetDist = Infinity;
    (Object.keys(GENRE_PRESETS) as GenrePresetId[]).forEach(id => {
        const p = GENRE_PRESETS[id].baseProfile;
        const dw = customProfile.weight - p.weight;
        const dr = customProfile.roundness - p.roundness;
        const df = customProfile.formality - p.formality;
        const dh = customProfile.handwritten - p.handwritten;
        const di = customProfile.intensity - p.intensity;
        const dist = Math.sqrt(dw * dw + dr * dr + df * df + dh * dh + di * di);
        if (dist < minPresetDist) {
            minPresetDist = dist;
            closestPresetId = id;
        }
    });

    const basePreset = GENRE_PRESETS[closestPresetId];
    const roles: FontRole[] = ['dialogue', 'innerThought', 'narration', 'shout', 'sfx', 'smallText'];
    const assignments: Partial<Record<FontRole, FontRoleAssignment>> = {};
    const usedFonts = new Set<string>();

    if (!fontList || fontList.length === 0) {
        roles.forEach(role => {
            const roleCfg = basePreset.roles[role];
            assignments[role] = {
                role,
                roleLabel: roleCfg.label,
                fontName: 'Chưa có font (Tải lên font .ttf/.otf)',
                fontFamily: 'sans-serif',
                fontItem: null,
                score: 0,
                isStrongMatch: false,
                sampleText: roleCfg.sampleText,
                desc: roleCfg.description
            };
        });

        return {
            presetId: 'ai_detected',
            presetName: name,
            tone,
            visualStyle,
            roles: assignments as Record<FontRole, FontRoleAssignment>,
            coreFontCount: 0,
            isAiAnalyzed: true,
            rawAiProfile: customProfile
        };
    }

    roles.forEach(role => {
        const roleCfg = basePreset.roles[role];
        const adaptedProfile: StyleProfile = {
            weight: Math.max(0.1, Math.min(1.0, roleCfg.targetProfile.weight * 0.6 + customProfile.weight * 0.4)),
            roundness: Math.max(0.1, Math.min(1.0, roleCfg.targetProfile.roundness * 0.6 + customProfile.roundness * 0.4)),
            formality: Math.max(0.1, Math.min(1.0, roleCfg.targetProfile.formality * 0.6 + customProfile.formality * 0.4)),
            handwritten: Math.max(0.1, Math.min(1.0, roleCfg.targetProfile.handwritten * 0.6 + customProfile.handwritten * 0.4)),
            intensity: Math.max(0.1, Math.min(1.0, roleCfg.targetProfile.intensity * 0.6 + customProfile.intensity * 0.4))
        };

        const adaptedRoleCfg: RoleConfig = {
            ...roleCfg,
            targetProfile: adaptedProfile
        };

        const best = findBestFontForRole(fontList, adaptedRoleCfg);
        const matchPercent = Math.min(99, Math.max(10, Math.round(best.score * 100)));

        assignments[role] = {
            role,
            roleLabel: roleCfg.label,
            fontName: best.font ? best.font.name : fontList[0].name,
            fontFamily: best.font ? best.font.family : fontList[0].family,
            fontItem: best.font,
            score: matchPercent,
            isStrongMatch: matchPercent >= 60,
            sampleText: roleCfg.sampleText,
            desc: roleCfg.description
        };

        if (best.font) {
            usedFonts.add(best.font.name);
        }
    });

    return {
        presetId: 'ai_detected',
        presetName: name,
        tone,
        visualStyle,
        roles: assignments as Record<FontRole, FontRoleAssignment>,
        coreFontCount: usedFonts.size,
        isAiAnalyzed: true,
        rawAiProfile: customProfile
    };
}

export async function callGeminiVisionForGenreStyle(
    modelId: string,
    apiKey: string,
    dataUrls: string[]
): Promise<AiGenreAnalysisResult> {
    if (!dataUrls || dataUrls.length === 0) {
        throw new Error("Vui lòng tải lên ít nhất 1 ảnh trang manga mẫu để AI phân tích phong cách!");
    }

    const parts: any[] = [];
    const prompt = `Bạn là một Giám đốc Nghệ thuật Typography và Trưởng ban Typesetting Manga/Comic chuyên nghiệp.
Nhiệm vụ của bạn: Phân tích 1 đến 3 trang manga mẫu để xác định THỂ LOẠI (GENRE), TONE CẢM XÚC, và BỘ CHỈ SỐ HÌNH THÁI HỌC TYPOGRAPHY (Style Profile) phù hợp nhất cho việc Việt hóa toàn bộ bộ truyện.

YÊU CẦU ĐÁNH GIÁ:
1. genre: Tên thể loại chính của truyện (ví dụ: "Soft Romance", "Cute / Comedy", "Clean Modern", "Action / Impact", "Dark / Gothic", "Fantasy / Elegant").
2. tone: Tóm tắt 1 câu về không khí và cảm xúc chủ đạo của tác phẩm (ví dụ: "Hành động kịch tính, nghẹt thở", "Lãng mạn nhẹ nhàng, sâu lắng").
3. visualStyle: Mô tả phong cách vẽ và bố cục thị giác của tác phẩm.
4. typographyStyle: Mô tả phong cách nét chữ phù hợp để Việt hóa.
5. intensity: Chỉ số năng lượng/kịch tính từ 0.0 (rất êm dịu, trầm lắng) đến 1.0 (bùng nổ, khốc liệt, dồn dập).
6. roundness: Chỉ số độ tròn mềm nét chữ từ 0.0 (sắc nhọn, góc cạnh, gãy khúc) đến 1.0 (tròn trịa, uốn lượn, mềm mại).
7. weight: Chỉ số độ đậm nét chữ chủ đạo từ 0.0 (thanh mảnh, tinh tế) đến 1.0 (cực đậm, chữ khối, tương phản cao).
8. formality: Chỉ số tính quy chuẩn/trang trọng từ 0.0 (viết tay tự do, nhí nhố) đến 1.0 (chuẩn mực, serif, nghiêm túc).
9. handwritten: Chỉ số phong cách viết tay/cọ vẽ từ 0.0 (hình học, font máy tính) đến 1.0 (bút lông, chữ viết tay nghệ thuật).
10. detectedPresetId: Chọn đúng 1 trong 6 mã preset chuẩn: ["romance", "comedy", "modern", "action", "dark", "fantasy"].
11. reasoning: 1-2 câu tiếng Việt giải thích lý do chọn phong cách typography này.

QUY TẮC BẮT BUỘC:
- KHÔNG đoán hoặc bịa tên phông chữ cụ thể (hệ thống sẽ tự động xếp hạng trên kho font sẵn có của người dùng).
- CHỈ phân tích hình thái học, cảm xúc và thể loại theo cấu trúc JSON.

Trả về DUY NHẤT định dạng JSON tuân thủ cấu trúc sau:
{
  "genre": "Action / Impact",
  "tone": "Kịch tính, tốc độ cao, chiến đấu nghẹt thở",
  "visualStyle": "Nét vẽ sắc nhọn, tương phản đen trắng mạnh, khung thoại biến dạng",
  "typographyStyle": "Nét dày đậm, in hoa góc cạnh, viền dày nổi khối",
  "intensity": 0.90,
  "roundness": 0.25,
  "weight": 0.85,
  "formality": 0.30,
  "handwritten": 0.20,
  "detectedPresetId": "action",
  "reasoning": "Truyện có nhịp độ chiến đấu nhanh và nhiều khung thoại la hét, phù hợp với bộ font Action / Impact."
}`;

    parts.push({ text: prompt });

    const sampleLimit = Math.min(3, dataUrls.length);
    for (let i = 0; i < sampleLimit; i++) {
        const dataUrl = dataUrls[i];
        const base64Data = dataUrl.split(',')[1];
        const mimeType = dataUrl.split(';')[0].split(':')[1] || 'image/png';
        parts.push({
            inlineData: {
                mimeType,
                data: base64Data
            }
        });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const payload = {
        contents: [{ parts }],
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
        const errText = await resp.text();
        throw new Error(`Gemini API Error ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) throw new Error("Không nhận được dữ liệu phản hồi từ AI");

    const cleanJson = textContent.replace(/```json/g, '').replace(/```/g, '').trim();
    let parsed: any;
    try {
        parsed = JSON.parse(cleanJson);
    } catch (parseErr) {
        throw new Error(`Phản hồi AI không đúng định dạng JSON: ${cleanJson}`);
    }

    const clamp = (val: any, def: number): number => {
        const num = typeof val === 'number' ? val : parseFloat(val);
        if (isNaN(num)) return def;
        return Math.max(0.0, Math.min(1.0, num));
    };

    const validPresets: GenrePresetId[] = ['romance', 'comedy', 'modern', 'action', 'dark', 'fantasy'];
    const detectedPresetId: GenrePresetId = validPresets.includes(parsed.detectedPresetId)
        ? parsed.detectedPresetId
        : 'romance';

    return {
        genre: typeof parsed.genre === 'string' && parsed.genre.trim() ? parsed.genre.trim() : 'Manga Style',
        tone: typeof parsed.tone === 'string' && parsed.tone.trim() ? parsed.tone.trim() : 'Tự nhiên, cân bằng',
        visualStyle: typeof parsed.visualStyle === 'string' && parsed.visualStyle.trim() ? parsed.visualStyle.trim() : 'Phong cách manga chuẩn',
        typographyStyle: typeof parsed.typographyStyle === 'string' && parsed.typographyStyle.trim() ? parsed.typographyStyle.trim() : 'Typography cân đối',
        intensity: Number(clamp(parsed.intensity, 0.5).toFixed(2)),
        roundness: Number(clamp(parsed.roundness, 0.5).toFixed(2)),
        weight: Number(clamp(parsed.weight, 0.5).toFixed(2)),
        formality: Number(clamp(parsed.formality, 0.5).toFixed(2)),
        handwritten: Number(clamp(parsed.handwritten, 0.2).toFixed(2)),
        detectedPresetId,
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning.trim() : ''
    };
}

export function analyzeGenreWithCanvasHeuristics(imgs: HTMLImageElement[]): AiGenreAnalysisResult {
    if (typeof document === 'undefined' || !imgs || imgs.length === 0) {
        return {
            genre: 'Soft Romance',
            tone: 'Dịu dàng, cảm xúc, mềm mại',
            visualStyle: 'Nét chữ tròn mềm mại',
            typographyStyle: 'Chữ thanh thoát, uyển chuyển',
            intensity: 0.35,
            roundness: 0.80,
            weight: 0.40,
            formality: 0.40,
            handwritten: 0.30,
            detectedPresetId: 'romance',
            reasoning: 'Phân tích heuristic ngoại tuyến mặc định cho thể loại phổ biến.'
        };
    }

    let totalDarkRatio = 0;
    let totalTransitionDensity = 0;
    let validImgCount = 0;

    imgs.forEach(img => {
        const naturalW = img.naturalWidth || img.width || 200;
        const naturalH = img.naturalHeight || img.height || 200;
        const w = Math.max(20, Math.min(naturalW, 200));
        const h = Math.max(20, Math.min(naturalH, 200));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;

        let dark = 0;
        let trans = 0;
        for (let y = 0; y < h; y++) {
            let prevDark = false;
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                const isDark = lum < 115;
                if (isDark) dark++;
                if (isDark !== prevDark) {
                    trans++;
                    prevDark = isDark;
                }
            }
        }

        totalDarkRatio += (dark / Math.max(1, w * h));
        totalTransitionDensity += (trans / Math.max(1, w * h));
        validImgCount++;
    });

    const avgDark = validImgCount > 0 ? (totalDarkRatio / validImgCount) : 0.20;
    const avgTrans = validImgCount > 0 ? (totalTransitionDensity / validImgCount) : 0.08;

    let detectedPreset: GenrePresetId = 'romance';
    let intensity = 0.35;
    let roundness = 0.75;
    let weight = 0.40;
    let formality = 0.40;
    let handwritten = 0.25;

    if (avgDark > 0.35 && avgTrans > 0.15) {
        detectedPreset = 'action';
        intensity = 0.90;
        roundness = 0.25;
        weight = 0.85;
        formality = 0.30;
        handwritten = 0.15;
    } else if (avgDark > 0.30 && avgTrans < 0.10) {
        detectedPreset = 'dark';
        intensity = 0.75;
        roundness = 0.20;
        weight = 0.65;
        formality = 0.35;
        handwritten = 0.60;
    } else if (avgTrans > 0.12 && avgDark < 0.25) {
        detectedPreset = 'comedy';
        intensity = 0.55;
        roundness = 0.90;
        weight = 0.50;
        formality = 0.15;
        handwritten = 0.50;
    } else if (avgDark < 0.18 && avgTrans < 0.08) {
        detectedPreset = 'romance';
        intensity = 0.25;
        roundness = 0.85;
        weight = 0.40;
        formality = 0.35;
        handwritten = 0.30;
    } else {
        detectedPreset = 'modern';
        intensity = 0.40;
        roundness = 0.50;
        weight = 0.45;
        formality = 0.70;
        handwritten = 0.10;
    }

    const presetInfo = GENRE_PRESETS[detectedPreset];
    return {
        genre: presetInfo.name,
        tone: presetInfo.tone,
        visualStyle: presetInfo.visualStyle,
        typographyStyle: 'Phân tích heuristic cục bộ từ mật độ điểm ảnh và nét vẽ trang truyện',
        intensity,
        roundness,
        weight,
        formality,
        handwritten,
        detectedPresetId: detectedPreset,
        reasoning: `Phân tích mật độ mực (${(avgDark * 100).toFixed(0)}%) và biến thiên nét (${(avgTrans * 100).toFixed(0)}%) khớp với phong cách ${presetInfo.name}.`
    };
}

export function analyzeImageWithCanvasHeuristics(img?: HTMLImageElement | null, contextTag?: string): AnalysisResult {
    if (typeof document === 'undefined' || !img) {
        const fallbackCat: FontCategory = (contextTag && contextTag !== 'auto') ? (contextTag as FontCategory) : 'dialogue';
        const fallbackWeightScore = fallbackCat === 'shout' || fallbackCat === 'sfx' ? 0.85 : fallbackCat === 'whisper' ? 0.28 : 0.48;
        const fallbackRoundness = fallbackCat === 'cute' ? 0.90 : fallbackCat === 'dialogue' ? 0.75 : fallbackCat === 'shout' ? 0.35 : 0.50;
        const fallbackHandwritten = fallbackCat === 'whisper' ? 0.75 : fallbackCat === 'sfx' ? 0.80 : 0.18;
        const fallbackStyleType: FontStyleType = fallbackCat === 'shout' ? 'shout_impact' : fallbackCat === 'narration' ? 'serif_narration' : fallbackCat === 'whisper' ? 'whisper_cursive' : fallbackCat === 'sfx' ? 'brush_sfx' : fallbackCat === 'cute' ? 'cartoon_quirky' : 'standard_dialogue';
        const isAllCaps = fallbackCat === 'shout' || fallbackCat === 'sfx';
        return {
            category: fallbackCat,
            fontStyleType: fallbackStyleType,
            weightScore: fallbackWeightScore,
            roundnessScore: fallbackRoundness,
            handwrittenScore: fallbackHandwritten,
            energyScore: fallbackCat === 'shout' || fallbackCat === 'sfx' ? 0.90 : fallbackCat === 'whisper' ? 0.25 : 0.45,
            formalityScore: fallbackCat === 'narration' || fallbackCat === 'tech' ? 0.85 : 0.65,
            roughnessScore: fallbackCat === 'sfx' ? 0.80 : 0.10,
            isAllCaps: isAllCaps,
            isSerif: fallbackCat === 'narration',
            slantAngle: fallbackCat === 'shout' ? 8.0 : 0.0,
            weightGrade: determineWeightGrade(fallbackWeightScore),
            widthGrade: 'Normal',
            slantGrade: fallbackCat === 'shout' ? 'Oblique' : 'Upright',
            caseGrade: isAllCaps ? 'All Caps' : 'Mixed Case',
            weightDesc: fallbackWeightScore > 0.7 ? 'Bold (Đậm dày)' : fallbackWeightScore < 0.35 ? 'Light (Thanh mảnh)' : 'Regular (Chuẩn đều)',
            energyDesc: fallbackCat === 'shout' ? 'Bùng nổ / La hét' : fallbackCat === 'whisper' ? 'Trầm lặng / Thì thầm' : 'Tự nhiên / Cân bằng',
            styleDesc: fallbackStyleType === 'standard_dialogue' ? 'Thoại Manga in ấn chuẩn mực' : fallbackStyleType === 'shout_impact' ? 'Nét khối cảm xúc mạnh' : 'Chuẩn mực manga',
            reasoning: `Phân tích heuristic cục bộ cho phong cách ${getCategoryLabel(fallbackCat)}.`,
            recommendedStroke: fallbackWeightScore > 0.7 ? '3.5px (Viền đậm)' : '1.5px (Viền chuẩn)',
            isAi: false
        };
    }

    const canvas = document.createElement('canvas');
    const naturalW = img.naturalWidth || img.width || 200;
    const naturalH = img.naturalHeight || img.height || 200;
    const w = Math.max(20, Math.min(naturalW, 240));
    const h = Math.max(20, Math.min(naturalH, 240));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
        return {
            category: 'dialogue',
            fontStyleType: 'standard_dialogue',
            weightScore: 0.48,
            roundnessScore: 0.75,
            handwrittenScore: 0.18,
            energyScore: 0.45,
            formalityScore: 0.65,
            roughnessScore: 0.10,
            weightGrade: 'Regular',
            widthGrade: 'Normal',
            slantGrade: 'Upright',
            caseGrade: 'Mixed Case',
            isAi: false
        };
    }
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // 1. Determine background brightness by sampling outer perimeter (checks dark bubbles / inverted text)
    let borderLumSum = 0;
    let borderCount = 0;
    for (let x = 0; x < w; x++) {
        const idxTop = x * 4;
        const idxBot = ((h - 1) * w + x) * 4;
        borderLumSum += (0.299 * data[idxTop] + 0.587 * data[idxTop + 1] + 0.114 * data[idxTop + 2]);
        borderLumSum += (0.299 * data[idxBot] + 0.587 * data[idxBot + 1] + 0.114 * data[idxBot + 2]);
        borderCount += 2;
    }
    for (let y = 1; y < h - 1; y++) {
        const idxLeft = (y * w) * 4;
        const idxRight = (y * w + (w - 1)) * 4;
        borderLumSum += (0.299 * data[idxLeft] + 0.587 * data[idxLeft + 1] + 0.114 * data[idxLeft + 2]);
        borderLumSum += (0.299 * data[idxRight] + 0.587 * data[idxRight + 1] + 0.114 * data[idxRight + 2]);
        borderCount += 2;
    }
    const bgAvgLum = borderCount > 0 ? (borderLumSum / borderCount) : 255;
    const isInverted = bgAvgLum < 125; // White/Light text on dark background

    // 2. Scan text pixels and locate ink Bounding Box (eliminates margin crop errors)
    let minX = w, maxX = 0, minY = h, maxY = 0;
    let textPixelCount = 0;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            const isText = isInverted ? (lum > 140) : (lum < 115);
            if (isText) {
                textPixelCount++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    const hasValidBox = textPixelCount > 15 && maxX >= minX && maxY >= minY;
    const bboxW = hasValidBox ? Math.max(1, maxX - minX + 1) : w;
    const bboxH = hasValidBox ? Math.max(1, maxY - minY + 1) : h;
    const bboxArea = bboxW * bboxH;

    // Measure ink density inside the isolated bounding box
    const rawBboxDensity = hasValidBox ? (textPixelCount / bboxArea) : (textPixelCount / (w * h));
    // Normalize Japanese/Kanji dense strokes to Latin typography scale
    const normalizedDensity = Math.max(0.05, Math.min(0.95, rawBboxDensity * 0.80));

    // 3. Scan horizontal and vertical transitions inside bounding box
    let horizontalTransitions = 0;
    let verticalTransitions = 0;
    const startX = hasValidBox ? minX : 0;
    const endX = hasValidBox ? maxX : w - 1;
    const startY = hasValidBox ? minY : 0;
    const endY = hasValidBox ? maxY : h - 1;

    for (let y = startY; y <= endY; y++) {
        let prevText = false;
        for (let x = startX; x <= endX; x++) {
            const idx = (y * w + x) * 4;
            const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            const isText = isInverted ? (lum > 140) : (lum < 115);
            if (isText !== prevText) {
                horizontalTransitions++;
                prevText = isText;
            }
        }
    }

    for (let x = startX; x <= endX; x++) {
        let prevText = false;
        for (let y = startY; y <= endY; y++) {
            const idx = (y * w + x) * 4;
            const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            const isText = isInverted ? (lum > 140) : (lum < 115);
            if (isText !== prevText) {
                verticalTransitions++;
                prevText = isText;
            }
        }
    }

    const transitionDensity = (horizontalTransitions + verticalTransitions) / Math.max(1, 2 * bboxArea);
    const aspectGlyphRatio = bboxW / Math.max(bboxH, 1);

    // Calculate normalized morphological scores
    let weightScore = Math.max(0.12, Math.min(0.98, (normalizedDensity - 0.08) / 0.36));
    let roughnessScore = Math.max(0.06, Math.min(0.95, (transitionDensity - 0.035) * 8.0));
    let energyScore = Math.max(0.12, Math.min(0.98, weightScore * 0.45 + roughnessScore * 0.35));
    let formalityScore = Math.max(0.20, Math.min(0.92, 1.0 - roughnessScore * 0.50));
    let roundnessScore = Math.max(0.10, Math.min(0.95, 0.78 - roughnessScore * 0.40 - (weightScore > 0.75 ? 0.15 : 0)));
    // Clean manga typeset has low handwritten score
    let handwrittenScore = Math.max(0.05, Math.min(0.85, roughnessScore * 0.45 + (1.0 - formalityScore) * 0.25));

    let detectedCategory: FontCategory = 'dialogue';
    let detectedStyleType: FontStyleType = 'standard_dialogue';

    if (contextTag && contextTag !== 'auto') {
        detectedCategory = contextTag as FontCategory;
        detectedStyleType = detectedCategory === 'shout' ? 'shout_impact' : detectedCategory === 'narration' ? 'serif_narration' : detectedCategory === 'whisper' ? 'whisper_cursive' : detectedCategory === 'sfx' ? 'brush_sfx' : detectedCategory === 'cute' ? 'cartoon_quirky' : 'standard_dialogue';
    } else {
        if (roughnessScore > 0.65 || (normalizedDensity > 0.45 && transitionDensity > 0.14)) {
            detectedCategory = 'sfx';
            detectedStyleType = 'brush_sfx';
        } else if (weightScore > 0.75 || (roughnessScore > 0.48 && energyScore > 0.72)) {
            detectedCategory = 'shout';
            detectedStyleType = 'shout_impact';
        } else if (normalizedDensity < 0.14 && transitionDensity < 0.07) {
            detectedCategory = 'whisper';
            detectedStyleType = 'whisper_cursive';
        } else if (formalityScore > 0.75 && weightScore < 0.60) {
            detectedCategory = 'narration';
            detectedStyleType = 'serif_narration';
        } else {
            detectedCategory = 'dialogue';
            detectedStyleType = 'standard_dialogue';
            handwrittenScore = Math.min(0.22, handwrittenScore);
            formalityScore = Math.max(0.60, formalityScore);
        }
    }

    if (detectedCategory === 'shout') {
        weightScore = Math.max(0.72, weightScore);
        energyScore = Math.max(0.78, energyScore);
        roundnessScore = Math.min(0.55, roundnessScore);
    } else if (detectedCategory === 'sfx') {
        weightScore = Math.max(0.80, weightScore);
        roughnessScore = Math.max(0.70, roughnessScore);
        energyScore = Math.max(0.85, energyScore);
        handwrittenScore = Math.max(0.65, handwrittenScore);
    } else if (detectedCategory === 'narration') {
        formalityScore = Math.max(0.70, formalityScore);
        energyScore = Math.min(0.50, energyScore);
    } else if (detectedCategory === 'whisper') {
        weightScore = Math.min(0.35, weightScore);
        energyScore = Math.min(0.38, energyScore);
        handwrittenScore = Math.max(0.50, handwrittenScore);
    } else if (detectedCategory === 'dialogue') {
        handwrittenScore = Math.min(0.20, handwrittenScore);
    }

    const isAllCaps = detectedCategory === 'shout' || detectedCategory === 'sfx';
    const isSerif = detectedCategory === 'narration';
    const weightGrade = determineWeightGrade(weightScore);
    const widthGrade: FontWidthGrade = aspectGlyphRatio < 0.60 ? 'Condensed' : aspectGlyphRatio > 1.50 ? 'Wide' : 'Normal';
    const slantGrade: FontSlantGrade = roughnessScore > 0.60 ? 'Oblique' : 'Upright';
    const caseGrade: FontCaseGrade = isAllCaps ? 'All Caps' : 'Mixed Case';

    return {
        category: detectedCategory,
        fontStyleType: detectedStyleType,
        weightScore: Number(weightScore.toFixed(2)),
        roundnessScore: Number(roundnessScore.toFixed(2)),
        handwrittenScore: Number(handwrittenScore.toFixed(2)),
        energyScore: Number(energyScore.toFixed(2)),
        formalityScore: Number(formalityScore.toFixed(2)),
        roughnessScore: Number(roughnessScore.toFixed(2)),
        isAllCaps: isAllCaps,
        isSerif: isSerif,
        slantAngle: slantGrade === 'Oblique' ? 10.0 : 0.0,
        weightGrade: weightGrade,
        widthGrade: widthGrade,
        slantGrade: slantGrade,
        caseGrade: caseGrade,
        weightDesc: `${weightGrade} (${weightScore > 0.7 ? 'Nét đậm' : weightScore < 0.35 ? 'Nét thanh' : 'Nét vừa'})`,
        energyDesc: energyScore > 0.7 ? 'Bùng nổ / La hét' : energyScore < 0.4 ? 'Trầm lắng / Thì thầm' : 'Tự nhiên / Cân bằng',
        styleDesc: detectedStyleType === 'standard_dialogue' ? 'Thoại Manga in ấn chuẩn mực' : detectedStyleType === 'shout_impact' ? 'Nét khối cảm xúc mạnh' : 'Chuẩn mực manga',
        reasoning: `Phân tích heuristic cục bộ: ${weightGrade} • ${detectedStyleType === 'standard_dialogue' ? 'Thoại Manga in ấn chuẩn' : 'Thần thái manga'} • ${caseGrade} phù hợp phong cách ${getCategoryLabel(detectedCategory)}.`,
        recommendedStroke: weightScore > 0.7 ? '3.5px (Viền đậm nổi khối)' : '1.5px (Viền thanh chuẩn)',
        isAi: false
    };
}

const CATEGORY_COMPATIBILITY_MAP: Record<string, number> = {
    'shout:sfx': 0.70, 'sfx:shout': 0.70,
    'dialogue:narration': 0.70, 'narration:dialogue': 0.70,
    'dialogue:cute': 0.70, 'cute:dialogue': 0.70,
    'whisper:cute': 0.70, 'cute:whisper': 0.70,
    'tech:narration': 0.45, 'narration:tech': 0.45,
    'tech:shout': 0.45, 'shout:tech': 0.45,
    'dialogue:whisper': 0.45, 'whisper:dialogue': 0.45,
    'shout:whisper': 0.15, 'whisper:shout': 0.15,
    'sfx:whisper': 0.15, 'whisper:sfx': 0.15,
    'sfx:narration': 0.15, 'narration:sfx': 0.15
};

export function calculateCategoryCompatibility(fontCat: string, targetCat: string): number {
    if (fontCat === targetCat) return 1.0;
    const score = CATEGORY_COMPATIBILITY_MAP[`${fontCat}:${targetCat}`];
    return score !== undefined ? score : 0.35;
}

export function rankFontsAgainstAnalysis(
    fontList: CustomFontItem[],
    analysis: AnalysisResult,
    userContext: string
): CustomFontItem[] {
    if (!fontList || fontList.length === 0) return [];

    const targetCat = (userContext && userContext !== 'auto') ? userContext : analysis.category;
    const targetStyleType: FontStyleType = analysis.fontStyleType || (targetCat === 'shout' ? 'shout_impact' : targetCat === 'narration' ? 'serif_narration' : targetCat === 'whisper' ? 'whisper_cursive' : targetCat === 'sfx' ? 'brush_sfx' : targetCat === 'cute' ? 'cartoon_quirky' : 'standard_dialogue');

    const tw = Math.min(1.0, Math.max(0.1, analysis.weightScore ?? 0.5));
    const trnd = Math.min(1.0, Math.max(0.1, analysis.roundnessScore ?? 0.55));
    const thw = Math.min(1.0, Math.max(0.1, analysis.handwrittenScore ?? (analysis.roughnessScore && analysis.roughnessScore > 0.5 ? 0.6 : 0.20)));
    const tf = Math.min(1.0, Math.max(0.1, analysis.formalityScore ?? 0.4));
    const tr = Math.min(1.0, Math.max(0.1, analysis.roughnessScore ?? 0.2));
    const tslant = Math.min(1.0, Math.abs(analysis.slantAngle ?? (analysis.slantGrade === 'Italic' ? 12 : analysis.slantGrade === 'Oblique' ? 10 : 0)) / 15);

    const scored = fontList.map(font => {
        const fw = Math.min(1.0, Math.max(0.1, font.weightScore ?? 0.5));
        const frnd = Math.min(1.0, Math.max(0.1, font.roundnessScore ?? 0.50));
        const fhw = Math.min(1.0, Math.max(0.1, font.handwrittenScore ?? 0.20));
        const ff = Math.min(1.0, Math.max(0.1, font.formalityScore ?? 0.4));
        const fr = Math.min(1.0, Math.max(0.1, font.roughnessScore ?? 0.2));
        const fslant = Math.min(1.0, Math.abs(font.slantAngle ?? (font.slantGrade === 'Italic' ? 12 : font.slantGrade === 'Oblique' ? 10 : 0)) / 15);

        const fontStyleType: FontStyleType = font.fontStyleType || (font.category === 'cute' ? 'cartoon_quirky' : font.category === 'shout' ? 'shout_impact' : font.category === 'narration' ? 'serif_narration' : font.category === 'whisper' ? 'whisper_cursive' : font.category === 'sfx' ? 'brush_sfx' : 'standard_dialogue');

        const dw = tw - fw;
        const drnd = trnd - frnd;
        const dhw = thw - fhw;
        const df = tf - ff;
        const dr = tr - fr;
        const dslant = tslant - fslant;

        // 1. Independent 6-dimensional morphological Euclidean distance
        const morphDist = Math.sqrt(
            dw * dw * 0.30 +
            drnd * drnd * 0.20 +
            dhw * dhw * 0.15 +
            df * df * 0.15 +
            dr * dr * 0.10 +
            dslant * dslant * 0.10
        );

        // Morphological similarity in [0, 1]
        const morphSim = Math.max(0, 1.0 - morphDist);

        // 2. Soft Category compatibility in [0.15, 1.0]
        const catSim = calculateCategoryCompatibility(font.category, targetCat);

        // 3. Style Type Alignment & Strict Quarantine
        let styleBonus = 0;
        if (targetStyleType === 'standard_dialogue') {
            if (fontStyleType === 'standard_dialogue') {
                styleBonus += 0.08;
            } else if (fontStyleType === 'cartoon_quirky') {
                // Strict penalty against cartoon/wobbly fonts for standard manga dialogue
                styleBonus -= 0.30;
            }
            if (fhw > 0.40) {
                styleBonus -= (fhw - 0.40) * 0.30;
            }
        } else if (targetStyleType === 'cartoon_quirky') {
            if (fontStyleType === 'cartoon_quirky') {
                styleBonus += 0.12;
            } else if (fontStyleType === 'standard_dialogue') {
                styleBonus -= 0.15;
            }
        } else if (targetStyleType === 'shout_impact') {
            if (fontStyleType === 'shout_impact') {
                styleBonus += 0.12;
            }
        } else if (targetStyleType === 'serif_narration') {
            if (fontStyleType === 'serif_narration' || font.category === 'narration') {
                styleBonus += 0.12;
            } else if (fontStyleType === 'cartoon_quirky') {
                styleBonus -= 0.25;
            }
        }

        // 4. Case match bonus/penalty
        let caseBonus = 0;
        if (analysis.isAllCaps !== undefined && font.isAllCaps !== undefined) {
            caseBonus = (analysis.isAllCaps === font.isAllCaps) ? 0.04 : -0.04;
        }

        // 5. Composite score: morphology (70%) + category (15%) + style alignment + case bonus
        const compositeScore = Math.max(0.05, Math.min(1.0, morphSim * 0.70 + catSim * 0.15 + styleBonus + caseBonus + 0.05));

        return {
            font: {
                ...font,
                fontStyleType: fontStyleType
            },
            rawScore: compositeScore
        };
    });

    // Deterministic descending sort by composite score
    scored.sort((a, b) => b.rawScore - a.rawScore);

    // Realistic match percentage (no rank inflation!)
    return scored.map((item, idx) => {
        const matchPercent = Math.min(99, Math.max(10, Math.round(item.rawScore * 100)));
        return {
            ...item.font,
            matchPercent: matchPercent,
            rank: idx + 1
        };
    });
}

export function copyFontName(name: string): void {
    if (!name) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(name);
    }
}


// --- CUSTOM FONT MANAGER (INDEXEDDB PERSISTENCE & DYNAMIC @FONT-FACE) ---
const DB_NAME_FONTS = 'MangaTranslatorDB';
const DB_VERSION_FONTS = 3;
const STORE_FONTS_NAME = 'fonts';
const fontBlobUrlsMap = new Map<string, string>();

export function updateDynamicFontFaceStyles(): void {
    let styleEl = document.getElementById('custom-fonts-dynamic-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'custom-fonts-dynamic-style';
        document.head.appendChild(styleEl);
    }
    let css = '';
    customFontsList.forEach(f => {
        if (f.blob) {
            if (!fontBlobUrlsMap.has(f.name)) {
                fontBlobUrlsMap.set(f.name, URL.createObjectURL(f.blob));
            }
            const url = fontBlobUrlsMap.get(f.name);
            const safeName = escapeCssFontFamily(f.name);
            css += `
@font-face {
    font-family: '${safeName}';
    src: url('${url}');
    font-display: swap;
}
`;
        }
    });
    styleEl.textContent = css;
}

export function openFontsDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME_FONTS, DB_VERSION_FONTS);
        req.onupgradeneeded = (e: any) => {
            const db = e.target.result as IDBDatabase;
            if (!db.objectStoreNames.contains(STORE_FONTS_NAME)) {
                db.createObjectStore(STORE_FONTS_NAME, { keyPath: 'family' });
            }
            if (!db.objectStoreNames.contains('pages')) {
                db.createObjectStore('pages', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('meta')) {
                db.createObjectStore('meta');
            }
            if (!db.objectStoreNames.contains('translation_cache')) {
                db.createObjectStore('translation_cache', { keyPath: 'hash' });
            }
        };
        req.onsuccess = (e: any) => resolve(e.target.result);
        req.onerror = (e: any) => reject(e.target.error);
    });
}

export function determineWeightGrade(weightScore: number): FontWeightGrade {
    if (weightScore < 0.20) return 'Thin';
    if (weightScore < 0.35) return 'Light';
    if (weightScore < 0.50) return 'Regular';
    if (weightScore < 0.65) return 'Medium';
    if (weightScore < 0.78) return 'SemiBold';
    if (weightScore < 0.89) return 'Bold';
    return 'Black';
}

export function determineWidthGrade(aspectRatio: number, widthAdvanceRatio?: number): FontWidthGrade {
    if (aspectRatio < 0.65 || (widthAdvanceRatio !== undefined && widthAdvanceRatio < 0.40)) return 'Condensed';
    if (aspectRatio > 1.08 || (widthAdvanceRatio !== undefined && widthAdvanceRatio > 0.72)) return 'Wide';
    return 'Normal';
}

export function determineSlantGrade(slantAngle: number, isItalicCursive = false): FontSlantGrade {
    const absAngle = Math.abs(slantAngle);
    if (absAngle < 3.5) return 'Upright';
    if (isItalicCursive) return 'Italic';
    return 'Oblique';
}

export function determineCaseGrade(isAllCaps: boolean, isSmallCaps: boolean): FontCaseGrade {
    if (isAllCaps) return 'All Caps';
    if (isSmallCaps) return 'Small Caps';
    return 'Mixed Case';
}

let sharedMorphologyCanvas: HTMLCanvasElement | null = null;
let sharedMorphologyCtx: CanvasRenderingContext2D | null = null;

function getSharedMorphologyContext(size: number = 80): CanvasRenderingContext2D | null {
    if (typeof document === 'undefined') return null;
    try {
        if (!sharedMorphologyCanvas) {
            sharedMorphologyCanvas = document.createElement('canvas');
            sharedMorphologyCanvas.width = size;
            sharedMorphologyCanvas.height = size;
            sharedMorphologyCtx = sharedMorphologyCanvas.getContext('2d', { willReadFrequently: true });
        } else if (sharedMorphologyCanvas.width !== size || sharedMorphologyCanvas.height !== size) {
            sharedMorphologyCanvas.width = size;
            sharedMorphologyCanvas.height = size;
            sharedMorphologyCtx = sharedMorphologyCanvas.getContext('2d', { willReadFrequently: true });
        }
        return sharedMorphologyCtx;
    } catch {
        return null;
    }
}

export const fontMorphologyCache = new Map<string, FontMorphologyResult>();
export const fontProfileCache = new Map<string, FontProfile>();

export function clearFontMorphologyCaches(): void {
    fontMorphologyCache.clear();
    fontProfileCache.clear();
}

export function analyzeFontMorphology(family: string): FontMorphologyResult {
    const cleanFamily = (family || 'Sans').replace(/['",]/g, '').trim();
    const lowerName = cleanFamily.toLowerCase();

    if (fontMorphologyCache.has(cleanFamily)) {
        return fontMorphologyCache.get(cleanFamily)!;
    }

    // Fallback if headless / no DOM canvas
    if (typeof document === 'undefined') {
        let weight: FontWeightGrade = 'Regular';
        let weightScore = 0.45;
        if (lowerName.includes('thin') || lowerName.includes('hairline')) { weight = 'Thin'; weightScore = 0.15; }
        else if (lowerName.includes('light')) { weight = 'Light'; weightScore = 0.28; }
        else if (lowerName.includes('semibold') || lowerName.includes('demibold')) { weight = 'SemiBold'; weightScore = 0.72; }
        else if (lowerName.includes('medium')) { weight = 'Medium'; weightScore = 0.58; }
        else if (lowerName.includes('black') || lowerName.includes('heavy') || lowerName.includes('ultrabold') || lowerName.includes('extrabold')) { weight = 'Black'; weightScore = 0.92; }
        else if (lowerName.includes('bold')) { weight = 'Bold'; weightScore = 0.82; }

        let width: FontWidthGrade = 'Normal';
        let widthScore = 0.82;
        if (lowerName.includes('condensed') || lowerName.includes('narrow') || lowerName.includes('compress')) { width = 'Condensed'; widthScore = 0.62; }
        else if (lowerName.includes('wide') || lowerName.includes('expanded') || lowerName.includes('extended')) { width = 'Wide'; widthScore = 1.08; }

        let slant: FontSlantGrade = 'Upright';
        let slantAngle = 0;
        let isItalic = false;
        if (lowerName.includes('italic') || lowerName.includes('script') || lowerName.includes('cursive') || lowerName.includes('handwriting')) {
            slant = 'Italic'; slantAngle = 12.5; isItalic = true;
        } else if (lowerName.includes('oblique') || lowerName.includes('slanted') || lowerName.includes('incline')) {
            slant = 'Oblique'; slantAngle = 11.0;
        }

        let caseType: FontCaseGrade = 'Mixed Case';
        let isAllCaps = false;
        let isSmallCaps = false;
        if (lowerName.includes('allcaps') || lowerName.includes('all-caps') || lowerName.includes('caps') || lowerName.includes('headline')) {
            caseType = 'All Caps'; isAllCaps = true;
        } else if (lowerName.includes('smallcaps') || lowerName.includes('small-caps')) {
            caseType = 'Small Caps'; isSmallCaps = true;
        }

        const fallbackResult: FontMorphologyResult = {
            weight,
            width,
            slant,
            caseType,
            weightScore,
            widthScore,
            slantAngle,
            caseRatio: isAllCaps ? 1.0 : isSmallCaps ? 0.75 : 0.68,
            inkDensity: 0.32,
            isAllCaps,
            isSmallCaps,
            isItalic
        };
        fontMorphologyCache.set(cleanFamily, fallbackResult);
        return fallbackResult;
    }

    try {
        const size = 80;
        const ctx = getSharedMorphologyContext(size);
        if (!ctx) throw new Error("Canvas context 2D not available");

        // 1. Measure Weight & Width over multi-glyph set
        const weightGlyphs = ['M', 'H', 'A', 'O', 'E', 'x', 'o', 'n', 'a'];
        let totalInkDensity = 0;
        let validGlyphs = 0;
        const aspectRatios: number[] = [];

        for (const glyph of weightGlyphs) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            ctx.fillStyle = '#000000';
            ctx.font = `48px "${cleanFamily}", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(glyph, size / 2, size / 2);

            const imgData = ctx.getImageData(0, 0, size, size).data;
            let darkCount = 0;
            let minX = size, maxX = 0, minY = size, maxY = 0;

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const idx = (y * size + x) * 4;
                    const lum = (imgData[idx] * 77 + imgData[idx + 1] * 150 + imgData[idx + 2] * 29) >> 8;
                    if (lum < 128) {
                        darkCount++;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            if (darkCount > 8 && maxX >= minX && maxY >= minY) {
                const bw = Math.max(1, maxX - minX + 1);
                const bh = Math.max(1, maxY - minY + 1);
                const density = darkCount / (bw * bh);
                totalInkDensity += density;
                aspectRatios.push(bw / bh);
                validGlyphs++;
            }
        }

        const avgInkDensity = validGlyphs > 0 ? (totalInkDensity / validGlyphs) : 0.32;
        const avgAspectRatio = aspectRatios.length > 0 ? (aspectRatios.reduce((a, b) => a + b, 0) / aspectRatios.length) : 0.82;

        let advanceRatio: number | undefined = undefined;
        if (validGlyphs > 0) {
            try {
                ctx.font = `48px "${cleanFamily}", sans-serif`;
                const textMetrics = ctx.measureText('Manga Studio');
                if (textMetrics && typeof textMetrics.width === 'number' && textMetrics.width > 0) {
                    advanceRatio = textMetrics.width / (48 * 12);
                }
            } catch (e) { }
        }

        let calculatedWeightScore = validGlyphs > 0 ? Math.max(0.05, Math.min(1.00, (avgInkDensity - 0.14) / 0.44)) : 0.48;
        if (lowerName.includes('thin') || lowerName.includes('hairline')) calculatedWeightScore = Math.min(calculatedWeightScore, 0.18);
        else if (lowerName.includes('light') && !lowerName.includes('semibold')) calculatedWeightScore = Math.min(Math.max(0.20, calculatedWeightScore), 0.34);
        else if (lowerName.includes('medium')) calculatedWeightScore = 0.58;
        else if (lowerName.includes('semibold') || lowerName.includes('demibold')) calculatedWeightScore = Math.max(0.65, Math.min(0.77, calculatedWeightScore));
        else if (lowerName.includes('black') || lowerName.includes('heavy') || lowerName.includes('ultrabold') || lowerName.includes('extrabold')) calculatedWeightScore = Math.max(0.89, calculatedWeightScore);
        else if (lowerName.includes('bold') && !lowerName.includes('semibold')) calculatedWeightScore = Math.max(0.78, Math.min(0.88, calculatedWeightScore));

        const weightGrade = determineWeightGrade(calculatedWeightScore);
        let widthGrade = determineWidthGrade(avgAspectRatio, advanceRatio);
        if (lowerName.includes('condensed') || lowerName.includes('narrow') || lowerName.includes('compress')) widthGrade = 'Condensed';
        else if (lowerName.includes('wide') || lowerName.includes('expanded') || lowerName.includes('extended')) widthGrade = 'Wide';
        else if (validGlyphs === 0) widthGrade = 'Normal';

        // 2. Measure Slant Angle by scanning vertical stem center-of-mass
        const stemGlyphs = ['I', 'l', '|', 'H', 'T'];
        const slantAngles: number[] = [];

        for (const stem of stemGlyphs) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            ctx.fillStyle = '#000000';
            ctx.font = `48px "${cleanFamily}", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(stem, size / 2, size / 2);

            const imgData = ctx.getImageData(0, 0, size, size).data;
            const points: { x: number; y: number }[] = [];

            for (let y = 10; y < size - 10; y++) {
                let rowSumX = 0;
                let rowCount = 0;
                for (let x = 0; x < size; x++) {
                    const idx = (y * size + x) * 4;
                    const lum = (imgData[idx] * 77 + imgData[idx + 1] * 150 + imgData[idx + 2] * 29) >> 8;
                    if (lum < 128) {
                        rowSumX += x;
                        rowCount++;
                    }
                }
                if (rowCount > 2) {
                    points.push({ x: rowSumX / rowCount, y: y });
                }
            }

            if (points.length > 15) {
                const n = points.length;
                let sumY = 0, sumX = 0, sumY2 = 0, sumXY = 0;
                for (const p of points) {
                    sumY += p.y;
                    sumX += p.x;
                    sumY2 += p.y * p.y;
                    sumXY += p.x * p.y;
                }
                const denom = (n * sumY2 - sumY * sumY);
                if (Math.abs(denom) > 1e-4) {
                    const slope = (n * sumXY - sumY * sumX) / denom;
                    const angleDeg = Math.atan(slope) * (180 / Math.PI);
                    if (Math.abs(angleDeg) < 45) {
                        slantAngles.push(angleDeg);
                    }
                }
            }
        }

        let avgSlantAngle = slantAngles.length > 0
            ? Number((slantAngles.reduce((a, b) => a + b, 0) / slantAngles.length).toFixed(1))
            : 0;

        const isNameItalic = lowerName.includes('italic') || lowerName.includes('script') || lowerName.includes('cursive') || lowerName.includes('handwriting');
        if (isNameItalic && Math.abs(avgSlantAngle) < 3.5) avgSlantAngle = 12.0;
        if ((lowerName.includes('oblique') || lowerName.includes('slanted')) && Math.abs(avgSlantAngle) < 3.5) avgSlantAngle = 11.0;

        const slantGrade = determineSlantGrade(avgSlantAngle, isNameItalic);

        // 3. Measure Case (Mixed Case vs All Caps vs Small Caps)
        const casePairs = [['a', 'A'], ['e', 'E'], ['g', 'G'], ['r', 'R'], ['h', 'H'], ['m', 'M']];
        let fullCapMatches = 0;
        let smallCapMatches = 0;
        let totalHeightRatio = 0;
        let distinctGlyphCount = 0;

        for (const [lowChar, upChar] of casePairs) {
            // Lowercase glyph
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            ctx.fillStyle = '#000000';
            ctx.fillText(lowChar, size / 2, size / 2);
            const lowData = ctx.getImageData(0, 0, size, size).data;
            let lowDark = 0, lowMinY = size, lowMaxY = 0;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const idx = (y * size + x) * 4;
                    if (lowData[idx] < 128) {
                        lowDark++;
                        if (y < lowMinY) lowMinY = y;
                        if (y > lowMaxY) lowMaxY = y;
                    }
                }
            }

            // Uppercase glyph
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            ctx.fillStyle = '#000000';
            ctx.fillText(upChar, size / 2, size / 2);
            const upData = ctx.getImageData(0, 0, size, size).data;
            let upDark = 0, upMinY = size, upMaxY = 0;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const idx = (y * size + x) * 4;
                    if (upData[idx] < 128) {
                        upDark++;
                        if (y < upMinY) upMinY = y;
                        if (y > upMaxY) upMaxY = y;
                    }
                }
            }

            const lowH = Math.max(1, lowMaxY - lowMinY + 1);
            const upH = Math.max(1, upMaxY - upMinY + 1);
            const hRatio = lowH / upH;
            const darkRatio = lowDark / Math.max(1, upDark);
            totalHeightRatio += hRatio;

            // In real rendering, lowercase glyph has different dark count and height compared to uppercase
            if (lowDark !== upDark || lowH !== upH) {
                distinctGlyphCount++;
            }

            if (hRatio > 0.90 && Math.abs(darkRatio - 1.0) < 0.18 && upDark > 10) {
                fullCapMatches++;
            } else if (hRatio >= 0.60 && hRatio <= 0.85 && darkRatio >= 0.50 && darkRatio <= 0.85) {
                if (['e', 'r', 'a'].includes(lowChar) && darkRatio > 0.55) {
                    smallCapMatches++;
                }
            }
        }

        const avgCaseRatio = Number((totalHeightRatio / casePairs.length).toFixed(2));
        const isRealGlyphCanvas = distinctGlyphCount > 0;
        const isAllCaps = (isRealGlyphCanvas && fullCapMatches >= 4) || lowerName.includes('allcaps') || lowerName.includes('all-caps') || lowerName.includes('all caps');
        const isSmallCaps = !isAllCaps && ((isRealGlyphCanvas && smallCapMatches >= 2) || lowerName.includes('smallcaps') || lowerName.includes('small-caps') || lowerName.includes('small caps'));
        const caseGrade = determineCaseGrade(isAllCaps, isSmallCaps);

        const morphologyResult: FontMorphologyResult = {
            weight: weightGrade,
            width: widthGrade,
            slant: slantGrade,
            caseType: caseGrade,
            weightScore: Number(calculatedWeightScore.toFixed(2)),
            widthScore: Number(avgAspectRatio.toFixed(2)),
            slantAngle: avgSlantAngle,
            caseRatio: avgCaseRatio,
            inkDensity: Number(avgInkDensity.toFixed(2)),
            isAllCaps,
            isSmallCaps,
            isItalic: slantGrade === 'Italic'
        };

        fontMorphologyCache.set(cleanFamily, morphologyResult);
        return morphologyResult;
    } catch (err) {
        console.warn(`Lỗi phân tích morphology font "${family}":`, err);
        const fallbackErr: FontMorphologyResult = {
            weight: 'Regular',
            width: 'Normal',
            slant: 'Upright',
            caseType: 'Mixed Case',
            weightScore: 0.45,
            widthScore: 0.82,
            slantAngle: 0,
            caseRatio: 0.70,
            inkDensity: 0.32,
            isAllCaps: false,
            isSmallCaps: false,
            isItalic: false
        };
        fontMorphologyCache.set(cleanFamily, fallbackErr);
        return fallbackErr;
    }
}

const PROFILING_GLYPHS = ['M', 'A', 'H', 'O', 'a', 'e', 'g', 'q', '0', '8'];

export function profileFontGlyph(family: string): FontProfile {
    if (fontProfileCache.has(family)) {
        return fontProfileCache.get(family)!;
    }

    const morphology = analyzeFontMorphology(family);
    const cleanName = (family || '').toLowerCase();

    // Check explicit font family names for Manga vs Cartoon vs SFX categorization
    const isCartoonName = cleanName.includes('akbar') ||
        cleanName.includes('teddybear') ||
        cleanName.includes('cartoon') ||
        cleanName.includes('komika') ||
        cleanName.includes('chibi') ||
        cleanName.includes('bada') ||
        cleanName.includes('simpson') ||
        cleanName.includes('wobbly') ||
        cleanName.includes('funny') ||
        cleanName.includes('quirky') ||
        cleanName.includes('comic strip') ||
        cleanName.includes('playful');

    const isStandardMangaName = cleanName.includes('wild words') ||
        cleanName.includes('anime ace') ||
        cleanName.includes('avo') ||
        cleanName.includes('manga temple') ||
        cleanName.includes('comic neue') ||
        cleanName.includes('hanzel') ||
        cleanName.includes('hl-comic') ||
        cleanName.includes('tcvn3 comic') ||
        cleanName.includes('manga') ||
        cleanName.includes('vni-manga') ||
        cleanName.includes('dialogue');

    const isSerifName = cleanName.includes('times') ||
        cleanName.includes('mincho') ||
        cleanName.includes('serif') ||
        cleanName.includes('garamond') ||
        cleanName.includes('georgia') ||
        cleanName.includes('cambria');

    const isBrushSfxName = cleanName.includes('brush') ||
        cleanName.includes('sfx') ||
        cleanName.includes('splatter') ||
        cleanName.includes('scratch') ||
        cleanName.includes('explode');

    const isShoutName = cleanName.includes('impact') ||
        cleanName.includes('shout') ||
        cleanName.includes('heavy') ||
        cleanName.includes('fedora') ||
        cleanName.includes('action');

    if (typeof document === 'undefined') {
        let fallbackStyleType: FontStyleType = 'standard_dialogue';
        let fallbackCat: FontCategory = 'dialogue';
        let fallbackHandwritten = morphology.slant === 'Italic' ? 0.75 : 0.18;

        if (isBrushSfxName) {
            fallbackStyleType = 'brush_sfx';
            fallbackCat = 'sfx';
            fallbackHandwritten = 0.85;
        } else if (isCartoonName) {
            fallbackStyleType = 'cartoon_quirky';
            fallbackCat = 'cute';
            fallbackHandwritten = 0.75;
        } else if (isStandardMangaName) {
            fallbackStyleType = 'standard_dialogue';
            fallbackCat = 'dialogue';
        } else if (isShoutName || morphology.weight === 'Black' || morphology.weight === 'Bold') {
            fallbackStyleType = 'shout_impact';
            fallbackCat = 'shout';
        } else if (isSerifName) {
            fallbackStyleType = 'serif_narration';
            fallbackCat = 'narration';
        } else if (morphology.slant === 'Italic') {
            fallbackStyleType = 'whisper_cursive';
            fallbackCat = 'whisper';
        }

        const profile: FontProfile = {
            weightScore: morphology.weightScore,
            energyScore: morphology.weightScore > 0.75 ? 0.85 : 0.45,
            formalityScore: morphology.caseType === 'All Caps' ? 0.65 : 0.55,
            roughnessScore: 0.15,
            roundnessScore: 0.60,
            handwrittenScore: fallbackHandwritten,
            fontStyleType: fallbackStyleType,
            category: fallbackCat,
            isAllCaps: morphology.isAllCaps,
            weightGrade: morphology.weight,
            widthGrade: morphology.width,
            slantGrade: morphology.slant,
            caseGrade: morphology.caseType,
            slantAngle: morphology.slantAngle,
            widthRatio: morphology.widthScore,
            caseRatio: morphology.caseRatio,
            morphology: morphology
        };
        fontProfileCache.set(family, profile);
        return profile;
    }

    try {
        const size = 80;
        const ctx = getSharedMorphologyContext(size);
        if (!ctx) throw new Error("Canvas 2D context unavailable");

        let totalInkDensity = 0;
        let totalTransitionDensity = 0;
        let validGlyphCount = 0;
        const aspectRatios: number[] = [];
        let roundedGlyphDensities: number[] = [];
        let angularGlyphDensities: number[] = [];

        // 1. Multi-glyph analysis across representative character set
        for (const glyph of PROFILING_GLYPHS) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            ctx.fillStyle = '#000000';
            ctx.font = `48px "${family}", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(glyph, size / 2, size / 2);

            const imgData = ctx.getImageData(0, 0, size, size);
            const data = imgData.data;

            let darkCount = 0;
            let minX = size, maxX = 0, minY = size, maxY = 0;
            let horizontalTransitions = 0;
            let verticalTransitions = 0;

            // Scan horizontal lines and find bounding box
            for (let y = 0; y < size; y++) {
                let prevDark = false;
                for (let x = 0; x < size; x++) {
                    const idx = (y * size + x) * 4;
                    const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                    const isDark = lum < 128;
                    if (isDark) {
                        darkCount++;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                    if (isDark !== prevDark) {
                        horizontalTransitions++;
                        prevDark = isDark;
                    }
                }
            }

            // Scan vertical lines for vertical transitions
            for (let x = 0; x < size; x++) {
                let prevDark = false;
                for (let y = 0; y < size; y++) {
                    const idx = (y * size + x) * 4;
                    const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                    const isDark = lum < 128;
                    if (isDark !== prevDark) {
                        verticalTransitions++;
                        prevDark = isDark;
                    }
                }
            }

            if (darkCount > 8 && maxX >= minX && maxY >= minY) {
                const bboxW = Math.max(1, maxX - minX + 1);
                const bboxH = Math.max(1, maxY - minY + 1);
                const bboxArea = bboxW * bboxH;
                const inkDensity = darkCount / bboxArea;
                const transitionDensity = (horizontalTransitions + verticalTransitions) / (2 * bboxArea);

                totalInkDensity += inkDensity;
                totalTransitionDensity += transitionDensity;
                aspectRatios.push(bboxW / bboxH);
                validGlyphCount++;

                if (['O', '0', '8', 'e', 'o'].includes(glyph)) {
                    roundedGlyphDensities.push(inkDensity);
                } else if (['A', 'M', 'H', 'N', 'Z'].includes(glyph)) {
                    angularGlyphDensities.push(inkDensity);
                }
            }
        }

        const avgTransitionDensity = validGlyphCount > 0 ? (totalTransitionDensity / validGlyphCount) : 0.05;
        const isAllCaps = morphology.isAllCaps;
        const weightScore = morphology.weightScore;

        // Dimension 2: Roughness score
        const roughnessScore = Math.max(0.05, Math.min(1.00, (avgTransitionDensity - 0.035) * 11));

        // Dimension 3: Formality score
        let ratioVariance = 0;
        if (aspectRatios.length > 1) {
            const meanRatio = aspectRatios.reduce((s, r) => s + r, 0) / aspectRatios.length;
            ratioVariance = aspectRatios.reduce((s, r) => s + Math.pow(r - meanRatio, 2), 0) / aspectRatios.length;
        }
        const formalityScore = Math.max(0.10, Math.min(1.00, 1.0 - roughnessScore * 0.45 - Math.min(0.35, ratioVariance * 2.0) - (isAllCaps ? 0.1 : 0.0)));

        // Dimension 4: Roundness score
        let roundnessScore = 0.50;
        if (roundedGlyphDensities.length > 0 && angularGlyphDensities.length > 0) {
            const avgRoundDensity = roundedGlyphDensities.reduce((s, v) => s + v, 0) / roundedGlyphDensities.length;
            const avgAngularDensity = angularGlyphDensities.reduce((s, v) => s + v, 0) / angularGlyphDensities.length;
            roundnessScore = Math.max(0.10, Math.min(1.00, 0.50 + (avgRoundDensity - avgAngularDensity) * 1.5 - roughnessScore * 0.2));
        } else {
            roundnessScore = Math.max(0.10, Math.min(1.00, 0.70 - roughnessScore * 0.5));
        }

        // Dimension 5: Handwritten / Organic score
        let handwrittenScore = Math.max(0.05, Math.min(1.00, roughnessScore * 0.65 + (1.0 - formalityScore) * 0.35 + (morphology.slant === 'Italic' ? 0.25 : 0.0)));

        // Style classification
        let fontStyleType: FontStyleType = 'standard_dialogue';
        let category: FontCategory = 'dialogue';

        if (isBrushSfxName || roughnessScore > 0.65) {
            fontStyleType = 'brush_sfx';
            category = 'sfx';
            handwrittenScore = Math.max(0.75, handwrittenScore);
        } else if (isCartoonName || (ratioVariance > 0.07 && handwrittenScore > 0.40 && !isStandardMangaName)) {
            fontStyleType = 'cartoon_quirky';
            category = 'cute';
            handwrittenScore = Math.max(0.75, handwrittenScore);
        } else if (isStandardMangaName) {
            fontStyleType = 'standard_dialogue';
            category = 'dialogue';
            handwrittenScore = Math.min(0.20, handwrittenScore);
        } else if (isShoutName || (isAllCaps && weightScore > 0.72)) {
            fontStyleType = 'shout_impact';
            category = 'shout';
        } else if (isSerifName || (formalityScore > 0.75 && weightScore < 0.65)) {
            fontStyleType = 'serif_narration';
            category = 'narration';
        } else if (morphology.slant === 'Italic' && handwrittenScore > 0.45) {
            fontStyleType = 'whisper_cursive';
            category = 'whisper';
        } else {
            fontStyleType = 'standard_dialogue';
            category = 'dialogue';
        }

        // Energy / Intensity score
        const energyScore = Math.max(0.10, Math.min(1.00, weightScore * 0.45 + roughnessScore * 0.35 + (isAllCaps ? 0.20 : 0.05)));

        const profileResult: FontProfile = {
            weightScore: Number(weightScore.toFixed(2)),
            energyScore: Number(energyScore.toFixed(2)),
            formalityScore: Number(formalityScore.toFixed(2)),
            roughnessScore: Number(roughnessScore.toFixed(2)),
            roundnessScore: Number(roundnessScore.toFixed(2)),
            handwrittenScore: Number(handwrittenScore.toFixed(2)),
            fontStyleType: fontStyleType,
            category: category,
            isAllCaps: isAllCaps,
            weightGrade: morphology.weight,
            widthGrade: morphology.width,
            slantGrade: morphology.slant,
            caseGrade: morphology.caseType,
            slantAngle: morphology.slantAngle,
            widthRatio: morphology.widthScore,
            caseRatio: morphology.caseRatio,
            morphology: morphology
        };

        fontProfileCache.set(family, profileResult);
        return profileResult;
    } catch (err) {
        console.warn(`Lỗi profiling font "${family}":`, err);
        const fallbackProfileErr: FontProfile = {
            weightScore: morphology.weightScore,
            energyScore: 0.45,
            formalityScore: 0.55,
            roughnessScore: 0.15,
            roundnessScore: 0.55,
            handwrittenScore: isCartoonName ? 0.75 : 0.18,
            fontStyleType: isCartoonName ? 'cartoon_quirky' : 'standard_dialogue',
            category: isCartoonName ? 'cute' : 'dialogue',
            isAllCaps: morphology.isAllCaps,
            weightGrade: morphology.weight,
            widthGrade: morphology.width,
            slantGrade: morphology.slant,
            caseGrade: morphology.caseType,
            slantAngle: morphology.slantAngle,
            widthRatio: morphology.widthScore,
            caseRatio: morphology.caseRatio,
            morphology: morphology
        };
        fontProfileCache.set(family, fallbackProfileErr);
        return fallbackProfileErr;
    }
}

// --- FAST PROFILE HEURISTICS FROM FONT FAMILY NAME (O(1) Ultra Fast) ---
export function fastProfileFontFromName(family: string): FontProfile {
    const lower = (family || '').toLowerCase();

    // 1. Weight Grade & Score
    let weightScore = 0.50;
    let weightGrade: FontWeightGrade = 'Regular';
    if (lower.includes('thin') || lower.includes('hairline')) {
        weightScore = 0.15; weightGrade = 'Thin';
    } else if (lower.includes('light') && !lower.includes('semibold')) {
        weightScore = 0.28; weightGrade = 'Light';
    } else if (lower.includes('medium')) {
        weightScore = 0.58; weightGrade = 'Medium';
    } else if (lower.includes('semibold') || lower.includes('demibold')) {
        weightScore = 0.72; weightGrade = 'SemiBold';
    } else if (lower.includes('black') || lower.includes('heavy') || lower.includes('extrabold') || lower.includes('ultrabold')) {
        weightScore = 0.92; weightGrade = 'Black';
    } else if (lower.includes('bold')) {
        weightScore = 0.84; weightGrade = 'Bold';
    }

    // 2. Width Grade & Score
    let widthGrade: FontWidthGrade = 'Normal';
    let widthRatio = 0.82;
    if (lower.includes('condensed') || lower.includes('narrow') || lower.includes('compress')) {
        widthGrade = 'Condensed'; widthRatio = 0.58;
    } else if (lower.includes('wide') || lower.includes('expanded') || lower.includes('extended')) {
        widthGrade = 'Wide'; widthRatio = 1.15;
    }

    // 3. Slant Grade & Angle
    let slantGrade: FontSlantGrade = 'Upright';
    let slantAngle = 0;
    if (lower.includes('italic') || lower.includes('cursive') || lower.includes('script') || lower.includes('handwriting')) {
        slantGrade = 'Italic'; slantAngle = 12;
    } else if (lower.includes('oblique') || lower.includes('slanted') || lower.includes('incline')) {
        slantGrade = 'Oblique'; slantAngle = 10;
    }

    // 4. Case Grade & Flags
    let caseGrade: FontCaseGrade = 'Mixed Case';
    let isAllCaps = false;
    if (lower.includes('allcaps') || lower.includes('all-caps') || lower.includes('caps') || lower.includes('headline')) {
        caseGrade = 'All Caps'; isAllCaps = true;
    }

    // 5. Category, Style & Emotional Scores
    let category: FontCategory = 'dialogue';
    let fontStyleType: FontStyleType = 'standard_dialogue';
    let energyScore = 0.50;
    let handwrittenScore = 0.20;
    let formalityScore = 0.50;
    let roughnessScore = 0.15;
    let roundnessScore = 0.60;

    if (lower.includes('sfx') || lower.includes('brush') || lower.includes('marker') || lower.includes('grunge') || lower.includes('splatter') || lower.includes('thu-phap') || lower.includes('thu phap')) {
        category = 'sfx';
        fontStyleType = 'brush_sfx';
        energyScore = 0.92;
        roughnessScore = 0.75;
        handwrittenScore = 0.70;
        weightScore = Math.max(0.80, weightScore);
    } else if (lower.includes('shout') || lower.includes('banger') || lower.includes('impact') || lower.includes('action') || lower.includes('boom') || lower.includes('bungee') || lower.includes('battle')) {
        category = 'shout';
        fontStyleType = 'shout_impact';
        energyScore = 0.88;
        weightScore = Math.max(0.78, weightScore);
    } else if (lower.includes('whisper') || lower.includes('caveat') || lower.includes('diary') || lower.includes('thought') || lower.includes('monologue')) {
        category = 'whisper';
        fontStyleType = 'whisper_cursive';
        energyScore = 0.30;
        handwrittenScore = 0.80;
        weightScore = Math.min(0.38, weightScore);
    } else if (lower.includes('serif') || lower.includes('mincho') || lower.includes('times') || lower.includes('pro') || lower.includes('narration') || lower.includes('story')) {
        category = 'narration';
        fontStyleType = 'serif_narration';
        formalityScore = 0.80;
    } else if (lower.includes('comic') || lower.includes('cute') || lower.includes('pangolin') || lower.includes('hand') || lower.includes('cartoon') || lower.includes('fun') || lower.includes('baby') || lower.includes('kid')) {
        category = 'cute';
        fontStyleType = 'cartoon_quirky';
        roundnessScore = 0.85;
        handwrittenScore = 0.50;
    } else if (lower.includes('tech') || lower.includes('cyber') || lower.includes('robot') || lower.includes('pixel') || lower.includes('chakra') || lower.includes('digital') || lower.includes('scifi')) {
        category = 'tech';
        fontStyleType = 'tech_display';
        formalityScore = 0.70;
        roundnessScore = 0.20;
    }

    const morphology: FontMorphologyResult = {
        weight: weightGrade,
        width: widthGrade,
        slant: slantGrade,
        caseType: caseGrade,
        weightScore: Number(weightScore.toFixed(2)),
        widthScore: Number(widthRatio.toFixed(2)),
        slantAngle,
        caseRatio: isAllCaps ? 1.0 : 0.70,
        inkDensity: weightScore * 0.45,
        isAllCaps,
        isSmallCaps: false,
        isItalic: slantGrade === 'Italic'
    };

    return {
        weightScore: Number(weightScore.toFixed(2)),
        energyScore: Number(energyScore.toFixed(2)),
        formalityScore: Number(formalityScore.toFixed(2)),
        roughnessScore: Number(roughnessScore.toFixed(2)),
        roundnessScore: Number(roundnessScore.toFixed(2)),
        handwrittenScore: Number(handwrittenScore.toFixed(2)),
        fontStyleType,
        category,
        isAllCaps,
        weightGrade,
        widthGrade,
        slantGrade,
        caseGrade,
        slantAngle,
        widthRatio,
        caseRatio: isAllCaps ? 1.0 : 0.70,
        morphology
    };
}

// --- CUSTOM FONT STATE & PAGINATION ---
const customFontPageSize = 24;
let customFontCurrentPage = 1;

export const VIETNAMESE_DIACRITICS_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

export function normalizeFontKey(name: string): string {
    if (!name) return '';
    return name
        .replace(/\.[^/.]+$/, '') // strip extension (.ttf, .otf, .woff, etc.)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // strip diacritics/accents
        .toLowerCase()
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]/g, '') // strip non-alphanumerics
        .trim();
}

export function isFuzzyDuplicate(keyA: string, keyB: string): boolean {
    if (!keyA || !keyB) return false;
    if (keyA === keyB) return true;
    const short = keyA.length < keyB.length ? keyA : keyB;
    const long = keyA.length < keyB.length ? keyB : keyA;
    if (long.length > 0 && short.length >= 5) {
        const shortConsonants = short.replace(/[aeiouy]/g, '');
        const longConsonants = long.replace(/[aeiouy]/g, '');
        if (shortConsonants.length >= 4 && shortConsonants === longConsonants && (long.includes(short) || Math.abs(long.length - short.length) <= 2)) {
            return true;
        }
    }
    return false;
}

export function updateCustomFontsBadge(): void {
    const badge = document.getElementById('fontmatch-custom-badge');
    if (badge) badge.innerText = String(customFontsList.length);
    const listCount = document.getElementById('fontmatch-custom-list-count');
    if (listCount) listCount.innerText = `${customFontsList.length} Font`;
}

export async function loadAndRegisterCustomFontsFromDB(): Promise<void> {
    try {
        const db = await openFontsDB();
        const tx = db.transaction(STORE_FONTS_NAME, 'readonly');
        const store = tx.objectStore(STORE_FONTS_NAME);
        const req = store.getAll();
        const rawEntries: any[] = await new Promise((res, rej) => {
            req.onsuccess = () => res(req.result || []);
            req.onerror = (e: any) => rej(e.target.error);
        });

        if (!rawEntries || rawEntries.length === 0) {
            customFontsList = [];
            updateCustomFontsBadge();
            renderCustomFontsUI();
            
            return;
        }

        // Auto-deduplicate font records across diacritics, underscores, and legacy stripped ASCII / CSS-wrapped names
        const seenNormalizedMap = new Map<string, any>();
        const consonantSkeletonMap = new Map<string, string>();
        const duplicatesToDelete: string[] = [];

        for (const item of rawEntries) {
            if (!item || !item.family) continue;
            
            // Delete ghost built-in font entries or entries without actual font blob
            if (!item.blob) {
                duplicatesToDelete.push(item.family);
                continue;
            }

            const rawOriginalKey = item.family;
            const cleanFamily = String(item.family)
                .replace(/^['"]|['"]$/g, '')
                .replace(/,\s*(sans-serif|serif|cursive|monospace).*$/i, '')
                .replace(/\.[^/.]+$/, '')
                .trim();

            if (!cleanFamily) {
                duplicatesToDelete.push(rawOriginalKey);
                continue;
            }

            // If the key in DB had CSS wrappers or quotes, schedule old key for deletion
            if (rawOriginalKey !== cleanFamily) {
                duplicatesToDelete.push(rawOriginalKey);
                item.family = cleanFamily;
            }

            const normKey = normalizeFontKey(cleanFamily);
            if (!normKey) continue;

            const skeleton = normKey.length >= 4 ? normKey.replace(/[aeiouy]/g, '') : '';

            // Check exact normKey or fuzzy skeleton match in O(1)
            let matchedKey = '';
            if (seenNormalizedMap.has(normKey)) {
                matchedKey = normKey;
            } else if (skeleton.length >= 3 && consonantSkeletonMap.has(skeleton)) {
                matchedKey = consonantSkeletonMap.get(skeleton)!;
            }

            if (matchedKey) {
                const existing = seenNormalizedMap.get(matchedKey);
                // Prefer font record with proper Vietnamese accents / valid weightGrade / newer timestamp
                const existingHasAccents = VIETNAMESE_DIACRITICS_REGEX.test(existing.family);
                const itemHasAccents = VIETNAMESE_DIACRITICS_REGEX.test(item.family);
                const existingScore = (existingHasAccents ? 20 : 0) + (existing.weightGrade ? 5 : 0) + (existing.dateAdded || 0) / 1e13;
                const itemScore = (itemHasAccents ? 20 : 0) + (item.weightGrade ? 5 : 0) + (item.dateAdded || 0) / 1e13;

                if (itemScore > existingScore) {
                    duplicatesToDelete.push(existing.family);
                    seenNormalizedMap.delete(matchedKey);
                    seenNormalizedMap.set(normKey, item);
                    if (skeleton.length >= 3) {
                        consonantSkeletonMap.set(skeleton, normKey);
                    }
                } else {
                    duplicatesToDelete.push(item.family);
                }
            } else {
                seenNormalizedMap.set(normKey, item);
                if (skeleton.length >= 3 && !consonantSkeletonMap.has(skeleton)) {
                    consonantSkeletonMap.set(skeleton, normKey);
                }
            }
        }

        if (duplicatesToDelete.length > 0) {
            try {
                const delTx = db.transaction(STORE_FONTS_NAME, 'readwrite');
                const delStore = delTx.objectStore(STORE_FONTS_NAME);
                duplicatesToDelete.forEach(fam => {
                    if (fam) {
                        try { delStore.delete(fam); } catch (e) {}
                    }
                });
            } catch (e) {
                console.warn("Lỗi dọn dẹp font trùng lặp trong IndexedDB:", e);
            }
        }

        const entries = Array.from(seenNormalizedMap.values());
        const newCustomList: CustomFontItem[] = [];
        const itemsToUpdateDB: any[] = [];

        // 1. Instantly parse & profile all fonts (O(1) in milliseconds)
        for (const item of entries) {
            if (!item || !item.family || !item.blob) continue;
            try {
                if (!fontBlobUrlsMap.has(item.family)) {
                    fontBlobUrlsMap.set(item.family, URL.createObjectURL(item.blob));
                }

                let profile: FontProfile;
                if (item.weightGrade && item.widthGrade && item.slantGrade && item.caseGrade && item.fontStyleType) {
                    profile = {
                        weightScore: item.weightScore || 0.55,
                        energyScore: item.energyScore || 0.55,
                        formalityScore: item.formalityScore || 0.45,
                        roughnessScore: item.roughnessScore || 0.20,
                        roundnessScore: item.roundnessScore || 0.50,
                        handwrittenScore: item.handwrittenScore || 0.20,
                        fontStyleType: item.fontStyleType || 'standard_dialogue',
                        category: item.category || 'dialogue',
                        isAllCaps: !!item.isAllCaps,
                        weightGrade: item.weightGrade,
                        widthGrade: item.widthGrade,
                        slantGrade: item.slantGrade,
                        caseGrade: item.caseGrade,
                        slantAngle: item.slantAngle || 0,
                        widthRatio: item.widthRatio || 0.82,
                        caseRatio: item.caseRatio || 0.70,
                        morphology: item.morphology
                    };
                } else {
                    // Fast instant profile from name
                    profile = fastProfileFontFromName(item.family);
                    itemsToUpdateDB.push({
                        ...item,
                        weightScore: profile.weightScore,
                        energyScore: profile.energyScore,
                        formalityScore: profile.formalityScore,
                        roughnessScore: profile.roughnessScore,
                        roundnessScore: profile.roundnessScore,
                        handwrittenScore: profile.handwrittenScore,
                        fontStyleType: profile.fontStyleType,
                        category: profile.category,
                        isAllCaps: profile.isAllCaps,
                        weightGrade: profile.weightGrade,
                        widthGrade: profile.widthGrade,
                        slantGrade: profile.slantGrade,
                        caseGrade: profile.caseGrade,
                        slantAngle: profile.slantAngle,
                        widthRatio: profile.widthRatio,
                        caseRatio: profile.caseRatio,
                        morphology: profile.morphology
                    });
                }

                newCustomList.push({
                    id: 'custom_' + item.family.toLowerCase().replace(/\s+/g, '_'),
                    name: item.family,
                    family: `'${item.family}', sans-serif`,
                    fontClass: 'font-custom',
                    category: profile.category || 'dialogue',
                    fontStyleType: profile.fontStyleType || 'standard_dialogue',
                    type: 'custom',
                    weightScore: profile.weightScore || 0.55,
                    energyScore: profile.energyScore || 0.55,
                    formalityScore: profile.formalityScore || 0.45,
                    roughnessScore: profile.roughnessScore || 0.2,
                    roundnessScore: profile.roundnessScore || 0.5,
                    handwrittenScore: profile.handwrittenScore || 0.2,
                    isAllCaps: !!profile.isAllCaps,
                    weightGrade: profile.weightGrade || determineWeightGrade(profile.weightScore || 0.55),
                    widthGrade: profile.widthGrade || 'Normal',
                    slantGrade: profile.slantGrade || 'Upright',
                    caseGrade: profile.caseGrade || (profile.isAllCaps ? 'All Caps' : 'Mixed Case'),
                    slantAngle: profile.slantAngle || 0,
                    widthRatio: profile.widthRatio || 0.82,
                    caseRatio: profile.caseRatio || 0.70,
                    morphology: profile.morphology,
                    blob: item.blob,
                    size: item.blob.size,
                    dateAdded: item.dateAdded || Date.now(),
                    desc: `Font cá nhân (${profile.weightGrade || 'Regular'} • ${profile.widthGrade || 'Normal'} • ${profile.slantGrade || 'Upright'} • ${profile.caseGrade || 'Mixed Case'}).`,
                    recommendedStroke: (profile.weightScore || 0.55) > 0.7 ? '3.5px' : '1.5px'
                });
            } catch (fontErr) {
                console.warn(`Lỗi xử lý font item "${item.family}":`, fontErr);
            }
        }

        customFontsList = newCustomList;
        updateDynamicFontFaceStyles();
        updateCustomFontsBadge();
        updateCustomFontFilterCountsUI();
        renderCustomFontsUI();
        

        

        // 2. Register FontFace objects into document.fonts in smooth background chunks
        (async () => {
            const chunkSize = 20;
            for (let i = 0; i < entries.length; i += chunkSize) {
                const chunk = entries.slice(i, i + chunkSize);
                await Promise.all(chunk.map(async item => {
                    if (!item || !item.family || !item.blob) return;
                    try {
                        const buffer = await item.blob.arrayBuffer();
                        const fontFace = new FontFace(item.family, buffer);
                        await fontFace.load();
                        (document as any).fonts.add(fontFace);
                    } catch (e) { }
                }));
                await new Promise(r => setTimeout(r, 10));
            }
            
            
        })();

        // 3. Cache computed profiles back to IndexedDB asynchronously
        if (itemsToUpdateDB.length > 0) {
            try {
                const writeTx = db.transaction(STORE_FONTS_NAME, 'readwrite');
                const writeStore = writeTx.objectStore(STORE_FONTS_NAME);
                itemsToUpdateDB.forEach(item => {
                    if (!item || !item.family || !item.blob) return;
                    const rawFamily = String(item.family)
                        .replace(/^['"]|['"]$/g, '')
                        .replace(/,\s*(sans-serif|serif|cursive|monospace).*$/i, '')
                        .trim();
                    writeStore.put({
                        ...item,
                        family: rawFamily
                    });
                });
            } catch (cacheErr) {
                console.warn("Lỗi lưu cache profile font vào IndexedDB:", cacheErr);
            }
        }
    } catch (err) {
        console.warn("Lỗi đọc IndexedDB custom fonts:", err);
    }
}

export async function handleCustomFontUpload(files: File[]): Promise<void> {
    if (!files || files.length === 0) return;

    const db = await openFontsDB();
    const total = files.length;
    const progressBox = document.getElementById('fontmatch-profiling-progress-box');
    const progressBar = document.getElementById('fontmatch-profiling-progress-bar');
    const progressPercent = document.getElementById('fontmatch-profiling-percent');
    const progressSubtext = document.getElementById('fontmatch-profiling-subtext');
    const progressTitle = document.getElementById('fontmatch-profiling-status-title');

    if (progressBox) progressBox.classList.remove('hidden');

    const batchSize = 25;
    let processed = 0;

    for (let i = 0; i < total; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const tx = db.transaction(STORE_FONTS_NAME, 'readwrite');
        const store = tx.objectStore(STORE_FONTS_NAME);

        for (const file of batch) {
            if (!file || !file.name) continue;
            const cleanName = file.name.replace(/\.[^/.]+$/, '').trim();
            // Preserve full Unicode & Vietnamese accents while stripping syntax chars
            const family = cleanName.replace(/['"\\;{}]/g, '').replace(/\s+/g, ' ').trim() || `CustomFont_${processed + 1}`;

            if (progressSubtext) progressSubtext.innerText = `Đang phân loại: ${family}...`;

            try {
                fontBlobUrlsMap.set(family, URL.createObjectURL(file));

                const profile = fastProfileFontFromName(family);

                store.put({
                    family: family,
                    blob: file,
                    category: profile.category,
                    fontStyleType: profile.fontStyleType,
                    weightScore: profile.weightScore,
                    energyScore: profile.energyScore,
                    formalityScore: profile.formalityScore,
                    roughnessScore: profile.roughnessScore,
                    roundnessScore: profile.roundnessScore,
                    handwrittenScore: profile.handwrittenScore,
                    isAllCaps: profile.isAllCaps,
                    weightGrade: profile.weightGrade,
                    widthGrade: profile.widthGrade,
                    slantGrade: profile.slantGrade,
                    caseGrade: profile.caseGrade,
                    slantAngle: profile.slantAngle,
                    widthRatio: profile.widthRatio,
                    caseRatio: profile.caseRatio,
                    morphology: profile.morphology,
                    dateAdded: Date.now()
                });

                const newFontObj: CustomFontItem = {
                    id: 'custom_' + family.toLowerCase().replace(/\s+/g, '_'),
                    name: family,
                    family: `'${family}', sans-serif`,
                    fontClass: 'font-custom',
                    category: profile.category,
                    fontStyleType: profile.fontStyleType,
                    type: 'custom',
                    weightScore: profile.weightScore,
                    energyScore: profile.energyScore,
                    formalityScore: profile.formalityScore,
                    roughnessScore: profile.roughnessScore,
                    roundnessScore: profile.roundnessScore,
                    handwrittenScore: profile.handwrittenScore,
                    isAllCaps: profile.isAllCaps,
                    weightGrade: profile.weightGrade,
                    widthGrade: profile.widthGrade,
                    slantGrade: profile.slantGrade,
                    caseGrade: profile.caseGrade,
                    slantAngle: profile.slantAngle,
                    widthRatio: profile.widthRatio,
                    caseRatio: profile.caseRatio,
                    morphology: profile.morphology,
                    blob: file,
                    size: file.size,
                    dateAdded: Date.now(),
                    desc: `Font cá nhân (${profile.weightGrade || 'Regular'} • ${profile.widthGrade || 'Normal'} • ${profile.slantGrade || 'Upright'} • ${profile.caseGrade || 'Mixed Case'}).`,
                    recommendedStroke: profile.weightScore > 0.7 ? '3.5px' : '1.5px'
                };

                const normFamily = normalizeFontKey(family);
                const existingIdx = customFontsList.findIndex(f => {
                    const normExisting = normalizeFontKey(f.name);
                    return normExisting === normFamily || isFuzzyDuplicate(normExisting, normFamily);
                });
                if (existingIdx >= 0) {
                    customFontsList[existingIdx] = newFontObj;
                } else {
                    customFontsList.push(newFontObj);
                }
            } catch (err) {
                console.warn(`Lỗi nạp font "${file.name}":`, err);
            }
            processed++;
        }

        const pct = Math.min(100, Math.round((processed / total) * 100));
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressPercent) progressPercent.innerText = `${pct}% (${processed}/${total})`;

        await new Promise(r => setTimeout(r, 5));
    }

    if (progressTitle) progressTitle.innerText = `✅ Hoàn thành phân loại ${total} font!`;
    setTimeout(() => {
        if (progressBox) progressBox.classList.add('hidden');
    }, 1200);

    updateDynamicFontFaceStyles();
    updateCustomFontsBadge();
    updateCustomFontFilterCountsUI();
    renderCustomFontsUI();
    

    

    // Register FontFace in background
    (async () => {
        for (const f of files) {
            try {
                const cleanName = f.name.replace(/\.[^/.]+$/, '').trim();
                const family = cleanName.replace(/['"\\;{}]/g, '').replace(/\s+/g, ' ').trim() || 'CustomFont';
                const buffer = await f.arrayBuffer();
                const fontFace = new FontFace(family, buffer);
                await fontFace.load();
                (document as any).fonts.add(fontFace);
            } catch (e) {}
        }
        
        
    })();
}

export async function deduplicateCustomFonts(showPrompt: boolean = false): Promise<number> {
    try {
        const db = await openFontsDB();
        const tx = db.transaction(STORE_FONTS_NAME, 'readonly');
        const store = tx.objectStore(STORE_FONTS_NAME);
        const req = store.getAll();
        const rawEntries: any[] = await new Promise((res, rej) => {
            req.onsuccess = () => res(req.result || []);
            req.onerror = (e: any) => rej(e.target.error);
        });

        if (!rawEntries || rawEntries.length === 0) {
            if (showPrompt) alert("Kho font hiện đang trống!");
            return 0;
        }

        const seenNormalizedMap = new Map<string, any>();
        const consonantSkeletonMap = new Map<string, string>();
        const duplicatesToDelete: string[] = [];

        for (const item of rawEntries) {
            if (!item || !item.family) continue;
            if (!item.blob) {
                duplicatesToDelete.push(item.family);
                continue;
            }

            const rawOriginalKey = item.family;
            const cleanFamily = String(item.family)
                .replace(/^['"]|['"]$/g, '')
                .replace(/,\s*(sans-serif|serif|cursive|monospace).*$/i, '')
                .replace(/\.[^/.]+$/, '')
                .trim();

            if (!cleanFamily) {
                duplicatesToDelete.push(rawOriginalKey);
                continue;
            }

            if (rawOriginalKey !== cleanFamily) {
                duplicatesToDelete.push(rawOriginalKey);
                item.family = cleanFamily;
            }

            const normKey = normalizeFontKey(cleanFamily);
            if (!normKey) continue;

            const skeleton = normKey.length >= 4 ? normKey.replace(/[aeiouy]/g, '') : '';

            // Check exact normKey or fuzzy skeleton match in O(1)
            let matchedKey = '';
            if (seenNormalizedMap.has(normKey)) {
                matchedKey = normKey;
            } else if (skeleton.length >= 3 && consonantSkeletonMap.has(skeleton)) {
                matchedKey = consonantSkeletonMap.get(skeleton)!;
            }

            if (matchedKey) {
                const existing = seenNormalizedMap.get(matchedKey);
                const existingHasAccents = VIETNAMESE_DIACRITICS_REGEX.test(existing.family);
                const itemHasAccents = VIETNAMESE_DIACRITICS_REGEX.test(item.family);
                const existingScore = (existingHasAccents ? 20 : 0) + (existing.weightGrade ? 5 : 0) + (existing.dateAdded || 0) / 1e13;
                const itemScore = (itemHasAccents ? 20 : 0) + (item.weightGrade ? 5 : 0) + (item.dateAdded || 0) / 1e13;

                if (itemScore > existingScore) {
                    duplicatesToDelete.push(existing.family);
                    seenNormalizedMap.delete(matchedKey);
                    seenNormalizedMap.set(normKey, item);
                    if (skeleton.length >= 3) {
                        consonantSkeletonMap.set(skeleton, normKey);
                    }
                } else {
                    duplicatesToDelete.push(item.family);
                }
            } else {
                seenNormalizedMap.set(normKey, item);
                if (skeleton.length >= 3 && !consonantSkeletonMap.has(skeleton)) {
                    consonantSkeletonMap.set(skeleton, normKey);
                }
            }
        }

        if (duplicatesToDelete.length > 0) {
            const delTx = db.transaction(STORE_FONTS_NAME, 'readwrite');
            const delStore = delTx.objectStore(STORE_FONTS_NAME);
            duplicatesToDelete.forEach(fam => {
                if (fam) {
                    try { delStore.delete(fam); } catch (e) {}
                }
            });
        }

        await loadAndRegisterCustomFontsFromDB();

        if (showPrompt) {
            if (duplicatesToDelete.length > 0) {
                alert(`🎉 Đã loại bỏ thành công ${duplicatesToDelete.length} bản sao font trùng lặp! Thư viện hiện còn ${customFontsList.length} font duy nhất.`);
            } else {
                alert(`✅ Thư viện hoàn toàn sạch sẽ! Toàn bộ ${customFontsList.length} font đều là font duy nhất.`);
            }
        }

        return duplicatesToDelete.length;
    } catch (e) {
        console.error("Lỗi lọc trùng font:", e);
        if (showPrompt) alert("Đã xảy ra lỗi khi kiểm tra font trùng lặp.");
        return 0;
    }
}

export async function reprofileAllCustomFonts(): Promise<void> {
    if (customFontsList.length === 0) {
        alert("Chưa có font cá nhân nào trong kho để phân tích!");
        return;
    }
    if (!confirm(`Chạy lại thuật toán Auto-Profiling cho toàn bộ ${customFontsList.length} font?`)) return;

    const db = await openFontsDB();
    const total = customFontsList.length;
    const progressBox = document.getElementById('fontmatch-profiling-progress-box');
    const progressBar = document.getElementById('fontmatch-profiling-progress-bar');
    const progressPercent = document.getElementById('fontmatch-profiling-percent');
    const progressSubtext = document.getElementById('fontmatch-profiling-subtext');
    if (progressBox) progressBox.classList.remove('hidden');

    for (let i = 0; i < total; i++) {
        const item = customFontsList[i];
        if (progressSubtext) progressSubtext.innerText = `Phân tích lại: ${item.name}...`;

        const profile = profileFontGlyph(item.name);
        item.category = profile.category;
        item.fontStyleType = profile.fontStyleType;
        item.weightScore = profile.weightScore;
        item.energyScore = profile.energyScore;
        item.formalityScore = profile.formalityScore;
        item.roughnessScore = profile.roughnessScore;
        item.roundnessScore = profile.roundnessScore;
        item.handwrittenScore = profile.handwrittenScore;
        item.isAllCaps = profile.isAllCaps;
        item.weightGrade = profile.weightGrade;
        item.widthGrade = profile.widthGrade;
        item.slantGrade = profile.slantGrade;
        item.caseGrade = profile.caseGrade;
        item.slantAngle = profile.slantAngle;
        item.widthRatio = profile.widthRatio;
        item.caseRatio = profile.caseRatio;
        item.morphology = profile.morphology;
        item.desc = `Font cá nhân (${profile.weightGrade || 'Regular'} • ${profile.widthGrade || 'Normal'} • ${profile.slantGrade || 'Upright'} • ${profile.caseGrade || 'Mixed Case'}).`;

        const tx = db.transaction(STORE_FONTS_NAME, 'readwrite');
        const store = tx.objectStore(STORE_FONTS_NAME);
        store.put({
            family: item.name,
            blob: item.blob,
            category: profile.category,
            fontStyleType: profile.fontStyleType,
            weightScore: profile.weightScore,
            energyScore: profile.energyScore,
            formalityScore: profile.formalityScore,
            roughnessScore: profile.roughnessScore,
            roundnessScore: profile.roundnessScore,
            handwrittenScore: profile.handwrittenScore,
            isAllCaps: profile.isAllCaps,
            weightGrade: profile.weightGrade,
            widthGrade: profile.widthGrade,
            slantGrade: profile.slantGrade,
            caseGrade: profile.caseGrade,
            slantAngle: profile.slantAngle,
            widthRatio: profile.widthRatio,
            caseRatio: profile.caseRatio,
            morphology: profile.morphology,
            dateAdded: item.dateAdded || Date.now()
        });

        const pct = Math.min(100, Math.round(((i + 1) / total) * 100));
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressPercent) progressPercent.innerText = `${pct}% (${i + 1}/${total})`;

        // Yield to event loop on each font to prevent UI freezing
        await new Promise(r => setTimeout(r, 0));
    }

    setTimeout(() => {
        if (progressBox) progressBox.classList.add('hidden');
    }, 1200);

    updateCustomFontFilterCountsUI();
    renderCustomFontsUI();
    alert(`Đã hoàn tất phân loại hình thái toàn diện ${total} font!`);
}

export async function clearAllCustomFonts(): Promise<void> {
    if (customFontsList.length === 0) return;
    if (!confirm(`CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ ${customFontsList.length} font cá nhân khỏi thư viện?`)) return;
    if (!confirm(`Xác nhận lần 2: Hành động này không thể hoàn tác!`)) return;

    try {
        const db = await openFontsDB();
        const tx = db.transaction(STORE_FONTS_NAME, 'readwrite');
        const store = tx.objectStore(STORE_FONTS_NAME);
        await new Promise((res, rej) => {
            const req = store.clear();
            req.onsuccess = res;
            req.onerror = rej;
        });

        fontBlobUrlsMap.forEach(url => URL.revokeObjectURL(url));
        fontBlobUrlsMap.clear();
        customFontsList = [];

        updateDynamicFontFaceStyles();
        updateCustomFontsBadge();
        updateCustomFontFilterCountsUI();
        renderCustomFontsUI();
        alert("Đã xóa sạch toàn bộ kho font tùy chỉnh!");
    } catch (err) {
        console.error("Lỗi xóa toàn bộ font:", err);
    }
}

export async function deleteCustomFont(family: string): Promise<void> {
    if (!confirm(`Xóa font "${family}" khỏi kho font cá nhân?`)) return;
    try {
        const db = await openFontsDB();
        const tx = db.transaction(STORE_FONTS_NAME, 'readwrite');
        const store = tx.objectStore(STORE_FONTS_NAME);
        await new Promise((res, rej) => {
            const req = store.delete(family);
            req.onsuccess = res;
            req.onerror = rej;
        });

        if (fontBlobUrlsMap.has(family)) {
            const url = fontBlobUrlsMap.get(family);
            if (url) URL.revokeObjectURL(url);
            fontBlobUrlsMap.delete(family);
        }
        customFontsList = customFontsList.filter(f => f.name !== family);
        updateDynamicFontFaceStyles();
        updateCustomFontsBadge();
        updateCustomFontFilterCountsUI();
        renderCustomFontsUI();
    } catch (err) {
        console.error("Lỗi xóa font:", err);
    }
}

// --- CUSTOM FONT FILTER STATE ---
let customFontCategoryFilter = 'all';
let customFontWeightFilter = 'all';
let customFontWidthFilter = 'all';
let customFontSlantFilter = 'all';
let customFontCaseFilter = 'all';
let customFontSearchQuery = '';
let customFontSortOrder = 'date-desc';

export function setCustomFontCategoryFilter(cat: string): void {
    customFontCategoryFilter = cat;
    customFontCurrentPage = 1;
    document.querySelectorAll('.custom-cat-filter').forEach(btn => {
        btn.className = "custom-cat-filter px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 hover:text-slate-200 transition-all whitespace-nowrap";
    });
    const activeBtn = document.getElementById(`btn-custom-filter-${cat}`);
    if (activeBtn) {
        activeBtn.className = "custom-cat-filter px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white transition-all whitespace-nowrap";
    }
    updateActiveFilterTagsUI();
    renderCustomFontsUI();
}

export function setCustomFontWeightFilter(weight: string): void {
    customFontWeightFilter = weight;
    const select = document.getElementById('fontmatch-filter-weight') as HTMLSelectElement | null;
    if (select) select.value = weight;
    customFontCurrentPage = 1;
    updateActiveFilterTagsUI();
    renderCustomFontsUI();
}

export function setCustomFontWidthFilter(width: string): void {
    customFontWidthFilter = width;
    const select = document.getElementById('fontmatch-filter-width') as HTMLSelectElement | null;
    if (select) select.value = width;
    customFontCurrentPage = 1;
    updateActiveFilterTagsUI();
    renderCustomFontsUI();
}

export function setCustomFontSlantFilter(slant: string): void {
    customFontSlantFilter = slant;
    const select = document.getElementById('fontmatch-filter-slant') as HTMLSelectElement | null;
    if (select) select.value = slant;
    customFontCurrentPage = 1;
    updateActiveFilterTagsUI();
    renderCustomFontsUI();
}

export function setCustomFontCaseFilter(caseType: string): void {
    customFontCaseFilter = caseType;
    const select = document.getElementById('fontmatch-filter-case') as HTMLSelectElement | null;
    if (select) select.value = caseType;
    customFontCurrentPage = 1;
    updateActiveFilterTagsUI();
    renderCustomFontsUI();
}

export function resetCustomFontFilters(): void {
    customFontCategoryFilter = 'all';
    customFontWeightFilter = 'all';
    customFontWidthFilter = 'all';
    customFontSlantFilter = 'all';
    customFontCaseFilter = 'all';
    customFontSearchQuery = '';

    const searchInput = document.getElementById('fontmatch-custom-search') as HTMLInputElement | null;
    if (searchInput) searchInput.value = '';

    const weightSelect = document.getElementById('fontmatch-filter-weight') as HTMLSelectElement | null;
    if (weightSelect) weightSelect.value = 'all';

    const widthSelect = document.getElementById('fontmatch-filter-width') as HTMLSelectElement | null;
    if (widthSelect) widthSelect.value = 'all';

    const slantSelect = document.getElementById('fontmatch-filter-slant') as HTMLSelectElement | null;
    if (slantSelect) slantSelect.value = 'all';

    const caseSelect = document.getElementById('fontmatch-filter-case') as HTMLSelectElement | null;
    if (caseSelect) caseSelect.value = 'all';

    document.querySelectorAll('.custom-cat-filter').forEach(btn => {
        btn.className = "custom-cat-filter px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 hover:text-slate-200 transition-all whitespace-nowrap";
    });
    const allBtn = document.getElementById('btn-custom-filter-all');
    if (allBtn) {
        allBtn.className = "custom-cat-filter px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white transition-all whitespace-nowrap";
    }

    customFontCurrentPage = 1;
    updateActiveFilterTagsUI();
    renderCustomFontsUI();
}

export function updateActiveFilterTagsUI(): void {
    const container = document.getElementById('fontmatch-active-filters-box');
    if (!container) return;

    const activeChips: { label: string; action: () => void }[] = [];
    if (customFontCategoryFilter !== 'all') {
        activeChips.push({ label: `Thể loại: ${getCategoryLabel(customFontCategoryFilter)}`, action: () => setCustomFontCategoryFilter('all') });
    }
    if (customFontWeightFilter !== 'all') {
        activeChips.push({ label: `Weight: ${customFontWeightFilter}`, action: () => setCustomFontWeightFilter('all') });
    }
    if (customFontWidthFilter !== 'all') {
        activeChips.push({ label: `Width: ${customFontWidthFilter}`, action: () => setCustomFontWidthFilter('all') });
    }
    if (customFontSlantFilter !== 'all') {
        activeChips.push({ label: `Slant: ${customFontSlantFilter}`, action: () => setCustomFontSlantFilter('all') });
    }
    if (customFontCaseFilter !== 'all') {
        activeChips.push({ label: `Case: ${customFontCaseFilter}`, action: () => setCustomFontCaseFilter('all') });
    }

    if (activeChips.length === 0) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = "flex items-center gap-1.5 flex-wrap";

    const labelSpan = document.createElement('span');
    labelSpan.className = "text-[11px] text-slate-400 font-bold flex items-center gap-1";
    labelSpan.innerHTML = `<i class="fa-solid fa-filter text-indigo-400 text-[10px]"></i> Đang lọc (${activeChips.length}):`;
    wrap.appendChild(labelSpan);

    activeChips.forEach(c => {
        const chip = document.createElement('span');
        chip.className = "inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold";
        
        const txt = document.createTextNode(c.label + ' ');
        chip.appendChild(txt);

        const btn = document.createElement('button');
        btn.type = "button";
        btn.className = "hover:text-white ml-0.5 cursor-pointer";
        btn.innerHTML = '<i class="fa-solid fa-xmark text-[9px]"></i>';
        btn.addEventListener('click', c.action);
        chip.appendChild(btn);

        wrap.appendChild(chip);
    });

    const resetBtn = document.createElement('button');
    resetBtn.type = "button";
    resetBtn.className = "text-[10px] text-red-400 hover:text-red-300 font-bold ml-1 underline cursor-pointer";
    resetBtn.textContent = "Xóa tất cả lọc";
    resetBtn.addEventListener('click', resetCustomFontFilters);
    wrap.appendChild(resetBtn);

    container.appendChild(wrap);
}

export function updateCustomFontFilterCountsUI(): void {
    const weights: Record<string, number> = {};
    const widths: Record<string, number> = {};
    const slants: Record<string, number> = {};
    const cases: Record<string, number> = {};

    customFontsList.forEach(f => {
        const w = f.weightGrade || 'Regular';
        const wd = f.widthGrade || 'Normal';
        const s = f.slantGrade || 'Upright';
        const c = f.caseGrade || 'Mixed Case';

        weights[w] = (weights[w] || 0) + 1;
        widths[wd] = (widths[wd] || 0) + 1;
        slants[s] = (slants[s] || 0) + 1;
        cases[c] = (cases[c] || 0) + 1;
    });

    const updateSelectOptionCount = (selectId: string, countsMap: Record<string, number>) => {
        const select = document.getElementById(selectId) as HTMLSelectElement | null;
        if (!select) return;
        Array.from(select.options).forEach(opt => {
            const val = opt.value;
            const originalText = opt.getAttribute('data-title') || opt.innerText.split(' (')[0];
            opt.setAttribute('data-title', originalText);
            if (val === 'all') {
                opt.innerText = `${originalText} (${customFontsList.length})`;
            } else {
                const count = countsMap[val] || 0;
                opt.innerText = `${originalText} (${count})`;
            }
        });
    };

    updateSelectOptionCount('fontmatch-filter-weight', weights);
    updateSelectOptionCount('fontmatch-filter-width', widths);
    updateSelectOptionCount('fontmatch-filter-slant', slants);
    updateSelectOptionCount('fontmatch-filter-case', cases);
}

export function onCustomFontFilterChange(): void {
    const searchInput = document.getElementById('fontmatch-custom-search') as HTMLInputElement | null;
    customFontSearchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';

    const sortSelect = document.getElementById('fontmatch-custom-sort') as HTMLSelectElement | null;
    customFontSortOrder = sortSelect ? sortSelect.value : 'date-desc';

    const weightSelect = document.getElementById('fontmatch-filter-weight') as HTMLSelectElement | null;
    if (weightSelect) customFontWeightFilter = weightSelect.value;

    const widthSelect = document.getElementById('fontmatch-filter-width') as HTMLSelectElement | null;
    if (widthSelect) customFontWidthFilter = widthSelect.value;

    const slantSelect = document.getElementById('fontmatch-filter-slant') as HTMLSelectElement | null;
    if (slantSelect) customFontSlantFilter = slantSelect.value;

    const caseSelect = document.getElementById('fontmatch-filter-case') as HTMLSelectElement | null;
    if (caseSelect) customFontCaseFilter = caseSelect.value;

    customFontCurrentPage = 1;
    updateActiveFilterTagsUI();
    renderCustomFontsUI();
}

export function loadMoreCustomFonts(): void {
    customFontCurrentPage++;
    renderCustomFontsUI();
}

export function getWeightBadgeColor(grade?: string): string {
    switch (grade) {
        case 'Thin': return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
        case 'Light': return 'bg-teal-500/10 text-teal-300 border-teal-500/30';
        case 'Regular': return 'bg-slate-800 text-slate-300 border-slate-700';
        case 'Medium': return 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30';
        case 'SemiBold': return 'bg-violet-500/15 text-violet-300 border-violet-500/40';
        case 'Bold': return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
        case 'Black': return 'bg-rose-500/20 text-rose-300 border-rose-500/50';
        default: return 'bg-slate-800 text-slate-300 border-slate-700';
    }
}

export function getWidthBadgeColor(grade?: string): string {
    switch (grade) {
        case 'Condensed': return 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30';
        case 'Wide': return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30';
        default: return 'bg-slate-800/80 text-slate-400 border-slate-700/60';
    }
}

export function getSlantBadgeColor(grade?: string): string {
    switch (grade) {
        case 'Italic': return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
        case 'Oblique': return 'bg-blue-500/10 text-blue-300 border-blue-500/30';
        default: return 'bg-slate-800/80 text-slate-400 border-slate-700/60';
    }
}

export function getCaseBadgeColor(grade?: string): string {
    switch (grade) {
        case 'All Caps': return 'bg-orange-500/15 text-orange-300 border-orange-500/40 font-black';
        case 'Small Caps': return 'bg-purple-500/15 text-purple-300 border-purple-500/40';
        default: return 'bg-slate-800/80 text-slate-400 border-slate-700/60';
    }
}

export function renderCustomFontsUI(): void {
    const container = document.getElementById('fontmatch-custom-fonts-container');
    if (!container) return;

    if (customFontsList.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-12 text-center flex flex-col items-center justify-center gap-3 text-slate-500">
                <div class="w-16 h-16 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600">
                    <i class="fa-solid fa-font text-3xl"></i>
                </div>
                <h4 class="text-sm font-bold text-slate-400">Chưa có font tùy chỉnh nào trong kho</h4>
                <p class="text-xs text-slate-600 max-w-sm">Kéo thả toàn bộ thư mục hoặc nhiều file font (.ttf/.otf) vào khung tải lên bên trên để hệ thống tự động phân loại Weight, Width, Slant, Case!</p>
            </div>
        `;
        const loadMoreBox = document.getElementById('fontmatch-custom-load-more-box');
        if (loadMoreBox) loadMoreBox.classList.add('hidden');
        return;
    }

    const filtered = customFontsList.filter(f => {
        const matchesCat = (customFontCategoryFilter === 'all') || (f.category === customFontCategoryFilter);
        const matchesWeight = (customFontWeightFilter === 'all') || (f.weightGrade === customFontWeightFilter);
        const matchesWidth = (customFontWidthFilter === 'all') || (f.widthGrade === customFontWidthFilter);
        const matchesSlant = (customFontSlantFilter === 'all') || (f.slantGrade === customFontSlantFilter);
        const matchesCase = (customFontCaseFilter === 'all') || (f.caseGrade === customFontCaseFilter);
        const matchesSearch = !customFontSearchQuery || f.name.toLowerCase().includes(customFontSearchQuery);
        return matchesCat && matchesWeight && matchesWidth && matchesSlant && matchesCase && matchesSearch;
    });

    filtered.sort((a, b) => {
        if (customFontSortOrder === 'name-asc') return a.name.localeCompare(b.name);
        if (customFontSortOrder === 'weight-desc') return (b.weightScore || 0) - (a.weightScore || 0);
        if (customFontSortOrder === 'weight-asc') return (a.weightScore || 0) - (b.weightScore || 0);
        if (customFontSortOrder === 'energy-desc') return (b.energyScore || 0) - (a.energyScore || 0);
        return (b.dateAdded || 0) - (a.dateAdded || 0);
    });

    const listCount = document.getElementById('fontmatch-custom-list-count');
    if (listCount) {
        if (filtered.length === customFontsList.length) {
            listCount.innerText = `${customFontsList.length} Font`;
        } else {
            listCount.innerText = `${filtered.length} / ${customFontsList.length} Font`;
        }
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-8 text-center flex flex-col items-center justify-center gap-3 text-slate-500">
                <i class="fa-solid fa-filter-circle-xmark text-3xl text-slate-600"></i>
                <p class="text-xs text-slate-400">Không tìm thấy font nào phù hợp với các tiêu chí lọc hiện tại.</p>
                <button type="button" onclick="resetCustomFontFilters()" class="px-3.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-bold border border-indigo-500/30">
                    <i class="fa-solid fa-arrows-rotate mr-1"></i> Xóa tất cả bộ lọc
                </button>
            </div>
        `;
        const loadMoreBox = document.getElementById('fontmatch-custom-load-more-box');
        if (loadMoreBox) loadMoreBox.classList.add('hidden');
        return;
    }

    const visibleLimit = customFontCurrentPage * customFontPageSize;
    const visibleItems = filtered.slice(0, visibleLimit);

    container.innerHTML = '';
    visibleItems.forEach(font => {
        const card = document.createElement('div');
        card.className = "bg-slate-950 border border-slate-855 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-md hover:border-slate-700 transition-all";

        const safeName = escapeCssFontFamily(font.name);
        const weightGrade = font.weightGrade || determineWeightGrade(font.weightScore || 0.5);
        const widthGrade = font.widthGrade || 'Normal';
        const slantGrade = font.slantGrade || 'Upright';
        const caseGrade = font.caseGrade || (font.isAllCaps ? 'All Caps' : 'Mixed Case');

        card.innerHTML = `
            <div class="flex items-center justify-between pb-2 border-b border-slate-850">
                <div class="overflow-hidden pr-2">
                    <h4 class="text-xs font-bold text-slate-200 truncate" title="${escapeHTML(font.name)}">${escapeHTML(font.name)}</h4>
                    <div class="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span class="text-[10px] text-indigo-300 font-semibold">${escapeHTML(getCategoryLabel(font.category))}</span>
                        <span class="text-[9px] text-slate-500 font-mono">• ${formatFileSize(font.size)}</span>
                    </div>
                </div>
                <div class="flex items-center gap-1">
                    <button type="button" data-action="inspect-font" class="w-7 h-7 shrink-0 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 transition-colors flex items-center justify-center text-xs" title="Xem chi tiết phân tích hình thái 4 chiều">
                        <i class="fa-solid fa-tree"></i>
                    </button>
                    <button type="button" data-action="delete-font" class="w-7 h-7 shrink-0 rounded-lg bg-slate-900 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-800 transition-colors flex items-center justify-center text-xs" title="Xóa font">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>

            <!-- Typography 4-Dimensional Badges -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-center">
                <span class="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold border ${getWeightBadgeColor(weightGrade)}" title="Độ đậm: ${escapeHTML(weightGrade)}">
                    ${escapeHTML(weightGrade)}
                </span>
                <span class="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold border ${getWidthBadgeColor(widthGrade)}" title="Chiều ngang: ${escapeHTML(widthGrade)}">
                    ${escapeHTML(widthGrade)}
                </span>
                <span class="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold border ${getSlantBadgeColor(slantGrade)}" title="Dáng nghiêng: ${escapeHTML(slantGrade)}">
                    ${escapeHTML(slantGrade)}
                </span>
                <span class="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold border ${getCaseBadgeColor(caseGrade)}" title="Kiểu chữ: ${escapeHTML(caseGrade)}">
                    ${escapeHTML(caseGrade)}
                </span>
            </div>

            <div class="p-3.5 bg-slate-900 rounded-xl border border-slate-800/80 overflow-hidden">
                <p class="text-base text-slate-100 font-medium leading-relaxed font-sample-text" style="font-family: '${safeName}', sans-serif !important;">
                    Học, học nữa, học mãi. 1234567890
                </p>
                <p class="text-sm text-indigo-300 font-bold mt-1.5 font-sample-text" style="font-family: '${safeName}', sans-serif !important;">
                    Manga Translator Studio Việt Hóa!
                </p>
            </div>

            <div class="flex items-center justify-between pt-1 text-[10.5px]">
                <div class="flex items-center gap-2 text-slate-400 text-[10px] font-mono">
                    <span title="Độ dày nét font (Weight Score)"><i class="fa-solid fa-bold text-slate-500"></i> ${Math.round((font.weightScore || 0.5) * 100)}%</span>
                    <span title="Góc nghiêng (Slant Angle)"><i class="fa-solid fa-italic text-slate-500"></i> ${font.slantAngle ? font.slantAngle + '°' : '0°'}</span>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" data-action="inspect-font" class="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 text-[11px]">
                        <i class="fa-solid fa-magnifying-glass-chart text-[10px]"></i> Phân tích
                    </button>
                    <button type="button" data-action="copy-name" class="text-slate-400 hover:text-slate-200 font-bold flex items-center gap-1 text-[11px]">
                        <i class="fa-solid fa-copy text-[10px]"></i> Sao chép
                    </button>
                </div>
            </div>
        `;

        const btnInspects = card.querySelectorAll('[data-action="inspect-font"]');
        btnInspects.forEach(btn => {
            btn.addEventListener('click', () => openFontMorphologyModal(font.name));
        });

        const btnDel = card.querySelector('[data-action="delete-font"]');
        if (btnDel) {
            btnDel.addEventListener('click', () => deleteCustomFont(font.name));
        }

        const btnCopy = card.querySelector('[data-action="copy-name"]');
        if (btnCopy) {
            btnCopy.addEventListener('click', () => copyFontName(font.name));
        }

        container.appendChild(card);
    });

    const loadMoreBox = document.getElementById('fontmatch-custom-load-more-box');
    const remaining = filtered.length - visibleLimit;
    if (loadMoreBox) {
        if (remaining > 0) {
            loadMoreBox.classList.remove('hidden');
            const remEl = document.getElementById('fontmatch-load-more-remaining');
            if (remEl) remEl.innerText = `(Còn ${remaining} font)`;
        } else {
            loadMoreBox.classList.add('hidden');
        }
    }
}

export function openFontMorphologyModal(fontName: string): void {
    const modal = document.getElementById('font-morphology-modal');
    if (!modal) return;

    let fontItem = customFontsList.find(f => f.name === fontName);
    const morphology = (fontItem && fontItem.morphology) ? fontItem.morphology : analyzeFontMorphology(fontName);

    const safeName = escapeCssFontFamily(fontName);
    const weightList: FontWeightGrade[] = ['Thin', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'Black'];
    const widthList: FontWidthGrade[] = ['Condensed', 'Normal', 'Wide'];
    const slantList: FontSlantGrade[] = ['Upright', 'Italic', 'Oblique'];
    const caseList: FontCaseGrade[] = ['Mixed Case', 'All Caps', 'Small Caps'];

    const titleEl = document.getElementById('morphology-modal-font-name');
    if (titleEl) titleEl.innerText = fontName;

    const formatEl = document.getElementById('morphology-modal-meta');
    if (formatEl && fontItem) {
        formatEl.innerText = `${getCategoryLabel(fontItem.category)} • ${formatFileSize(fontItem.size)}`;
    }

    const treeContainer = document.getElementById('morphology-modal-tree-container');
    if (treeContainer) {
        treeContainer.innerHTML = `
            <!-- 1. Weight Tree -->
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-2.5">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <i class="fa-solid fa-bold text-indigo-400"></i> Weight (Độ Đậm)
                    </span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${getWeightBadgeColor(morphology.weight)}">
                        ${morphology.weight} (${Math.round((morphology.weightScore || 0.5) * 100)}%)
                    </span>
                </div>
                <div class="font-mono text-xs text-slate-400 pl-1 leading-relaxed border-l-2 border-slate-800 ml-1 flex flex-col gap-1 mt-1">
                    ${weightList.map((w, idx) => {
                        const isLast = idx === weightList.length - 1;
                        const isMatched = w === morphology.weight;
                        const prefix = isLast ? '└──' : '├──';
                        return `
                            <div class="flex items-center justify-between ${isMatched ? 'text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/30' : 'hover:text-slate-200'}">
                                <span>${prefix} ${w}</span>
                                ${isMatched ? '<i class="fa-solid fa-check text-[10px]"></i>' : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- 2. Width Tree -->
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-2.5">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <i class="fa-solid fa-arrows-left-right text-fuchsia-400"></i> Width (Chiều Ngang)
                    </span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${getWidthBadgeColor(morphology.width)}">
                        ${morphology.width} (Tỷ lệ: ${morphology.widthScore || 0.82})
                    </span>
                </div>
                <div class="font-mono text-xs text-slate-400 pl-1 leading-relaxed border-l-2 border-slate-800 ml-1 flex flex-col gap-1 mt-1">
                    ${widthList.map((wd, idx) => {
                        const isLast = idx === widthList.length - 1;
                        const isMatched = wd === morphology.width;
                        const prefix = isLast ? '└──' : '├──';
                        return `
                            <div class="flex items-center justify-between ${isMatched ? 'text-fuchsia-400 font-bold bg-fuchsia-500/10 px-2 py-0.5 rounded-md border border-fuchsia-500/30' : 'hover:text-slate-200'}">
                                <span>${prefix} ${wd}</span>
                                ${isMatched ? '<i class="fa-solid fa-check text-[10px]"></i>' : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- 3. Slant Tree -->
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-2.5">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <i class="fa-solid fa-italic text-emerald-400"></i> Slant (Dáng Nghiêng)
                    </span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${getSlantBadgeColor(morphology.slant)}">
                        ${morphology.slant} (${morphology.slantAngle || 0}°)
                    </span>
                </div>
                <div class="font-mono text-xs text-slate-400 pl-1 leading-relaxed border-l-2 border-slate-800 ml-1 flex flex-col gap-1 mt-1">
                    ${slantList.map((s, idx) => {
                        const isLast = idx === slantList.length - 1;
                        const isMatched = s === morphology.slant;
                        const prefix = isLast ? '└──' : '├──';
                        return `
                            <div class="flex items-center justify-between ${isMatched ? 'text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/30' : 'hover:text-slate-200'}">
                                <span>${prefix} ${s}</span>
                                ${isMatched ? '<i class="fa-solid fa-check text-[10px]"></i>' : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- 4. Case Tree -->
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-2.5">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <i class="fa-solid fa-font text-orange-400"></i> Case (Kiểu Chữ)
                    </span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${getCaseBadgeColor(morphology.caseType)}">
                        ${morphology.caseType}
                    </span>
                </div>
                <div class="font-mono text-xs text-slate-400 pl-1 leading-relaxed border-l-2 border-slate-800 ml-1 flex flex-col gap-1 mt-1">
                    ${caseList.map((c, idx) => {
                        const isLast = idx === caseList.length - 1;
                        const isMatched = c === morphology.caseType;
                        const prefix = isLast ? '└──' : '├──';
                        return `
                            <div class="flex items-center justify-between ${isMatched ? 'text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded-md border border-orange-500/30' : 'hover:text-slate-200'}">
                                <span>${prefix} ${c}</span>
                                ${isMatched ? '<i class="fa-solid fa-check text-[10px]"></i>' : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    const previewBox = document.getElementById('morphology-modal-preview-text');
    if (previewBox) {
        previewBox.style.fontFamily = `'${safeName}', sans-serif`;
    }

    const filterBtn = document.getElementById('btn-morphology-modal-filter-similar');
    if (filterBtn) {
        filterBtn.onclick = () => {
            setCustomFontWeightFilter(morphology.weight);
            setCustomFontWidthFilter(morphology.width);
            setCustomFontSlantFilter(morphology.slant);
            setCustomFontCaseFilter(morphology.caseType);
            closeFontMorphologyModal();
        };
    }

    modal.classList.remove('hidden');
}

export function closeFontMorphologyModal(): void {
    const modal = document.getElementById('font-morphology-modal');
    if (modal) modal.classList.add('hidden');
}

export function refreshCustomFontsUI(): void {
    loadAndRegisterCustomFontsFromDB();
}

export function initFontMatcherModule(): void {
    loadAndRegisterCustomFontsFromDB().then(() => {
        renderCustomFontsUI();
    });

    const customFontInput = document.getElementById('fontmatch-custom-files') as HTMLInputElement | null;
    if (customFontInput) {
        customFontInput.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.files && target.files.length > 0) {
                handleCustomFontUpload(Array.from(target.files));
            }
        });
    }
}

