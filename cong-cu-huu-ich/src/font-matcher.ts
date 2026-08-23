/**
 * Module 8: Manga Font Matcher & Recommender (AI Vision & Custom Font Repository) (TypeScript)
 */

import { formatFileSize, openPreviewModal, escapeHTML, escapeCssFontFamily, safeSetLocalStorage } from './common';
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

export const BUILTIN_MANGA_FONTS: CustomFontItem[] = [];

let fontMatchLoadedImg: HTMLImageElement | null = null;
let fontMatchImgDataUrl = '';
let currentTop3Matches: CustomFontItem[] = [];
let customFontsList: CustomFontItem[] = [];
let liveUpdateDebounceTimer: any = null;

export function getEffectiveFontLibrary(): CustomFontItem[] {
    return customFontsList;
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

// Sub-tabs switcher
export function switchFontMatchSubTab(subTabId: string): void {
    const tabs = ['set', 'analyze', 'classify', 'custom', 'guide'];
    tabs.forEach(t => {
        const btn = document.getElementById(`btn-subtab-fontmatch-${t}`);
        const panel = document.getElementById(`fontmatch-panel-${t}`);
        if (btn) {
            if (t === subTabId) {
                btn.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white shadow flex items-center gap-1.5";
            } else {
                btn.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-slate-200 flex items-center gap-1.5";
            }
        }
        if (panel) {
            if (t === subTabId) {
                panel.classList.remove('hidden');
            } else {
                panel.classList.add('hidden');
            }
        }
    });

    if (subTabId === 'set' && !currentGeneratedFontSet) {
        generateAndDisplayFontSet('romance');
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

    const dist = Math.sqrt(
        Math.pow(tw - fw, 2) * 0.30 +
        Math.pow(tr - fr, 2) * 0.25 +
        Math.pow(tf - ff, 2) * 0.20 +
        Math.pow(th - fh, 2) * 0.15 +
        Math.pow(ti - fi, 2) * 0.10
    );

    const morphSim = Math.max(0, 1.0 - dist);

    let catBonus = 0.35;
    if (preferredCategories && preferredCategories.includes(font.category)) {
        const idx = preferredCategories.indexOf(font.category);
        catBonus = idx === 0 ? 1.0 : idx === 1 ? 0.75 : 0.55;
    }

    const finalScore = morphSim * 0.85 + catBonus * 0.15;
    return Math.max(0.1, Math.min(1.0, finalScore));
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

    // 1. Assign primary dialogue font
    const dialogueRanked = rankFontsForRole(fontList, preset.roles.dialogue);
    const dialogueBest = dialogueRanked[0];
    const dialogueFontName = dialogueBest?.font.name || fontList[0].name;

    // 2. Assign remaining roles
    roles.forEach(role => {
        const roleCfg = preset.roles[role];
        const isReadingGroup = ['dialogue', 'innerThought', 'narration', 'smallText'].includes(role);
        const preferredName = isReadingGroup ? dialogueFontName : undefined;
        const ranked = rankFontsForRole(fontList, roleCfg, preferredName);
        const best = ranked[0] || { font: fontList[0], score: 0.5 };

        const matchPercent = Math.min(99, Math.max(10, Math.round(best.score * 100)));
        assignments[role] = {
            role,
            roleLabel: roleCfg.label,
            fontName: best.font.name,
            fontFamily: best.font.family,
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
        const dist = Math.sqrt(
            Math.pow(customProfile.weight - p.weight, 2) +
            Math.pow(customProfile.roundness - p.roundness, 2) +
            Math.pow(customProfile.formality - p.formality, 2) +
            Math.pow(customProfile.handwritten - p.handwritten, 2) +
            Math.pow(customProfile.intensity - p.intensity, 2)
        );
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

        const ranked = rankFontsForRole(fontList, adaptedRoleCfg);
        const best = ranked[0] || { font: fontList[0], score: 0.5 };
        const matchPercent = Math.min(99, Math.max(10, Math.round(best.score * 100)));

        assignments[role] = {
            role,
            roleLabel: roleCfg.label,
            fontName: best.font.name,
            fontFamily: best.font.family,
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

// UI State & Display Handlers for Font Set
export function generateAndDisplayFontSet(presetId?: GenrePresetId): void {
    const activePresetId = presetId || ((document.getElementById('fontset-genre-select') as HTMLSelectElement)?.value as GenrePresetId) || 'romance';
    currentGeneratedFontSet = generateFontSetFromPreset(getEffectiveFontLibrary(), activePresetId);
    renderFontSetUI(currentGeneratedFontSet);
    updateAllFontSetCanvases();
}

export function onFontSetRoleChange(role: FontRole, selectedFontName: string): void {
    if (!currentGeneratedFontSet) return;
    const fontLib = getEffectiveFontLibrary();
    const fontObj = fontLib.find(f => f.name === selectedFontName) || null;
    const assignment = currentGeneratedFontSet.roles[role];
    if (assignment) {
        assignment.fontName = selectedFontName;
        assignment.fontFamily = fontObj ? fontObj.family : `'${selectedFontName}', sans-serif`;
        assignment.fontItem = fontObj;
        if (fontObj) {
            const preset = GENRE_PRESETS[currentGeneratedFontSet.presetId as GenrePresetId] || GENRE_PRESETS.romance;
            const roleCfg = preset.roles[role];
            const sim = calculateRoleSimilarity(fontObj, roleCfg.targetProfile, roleCfg.preferredCategories);
            assignment.score = Math.min(99, Math.max(10, Math.round(sim * 100)));
            assignment.isStrongMatch = assignment.score >= 60;
        }

        // Recalculate unique core fonts count
        const fontNames = new Set(Object.values(currentGeneratedFontSet.roles).map(r => r.fontName).filter(Boolean));
        currentGeneratedFontSet.coreFontCount = fontNames.size;

        renderFontSetUI(currentGeneratedFontSet);
        updateAllFontSetCanvases();
    }
}

export function onFontSetSampleTextChange(role: FontRole, newText: string): void {
    if (!currentGeneratedFontSet) return;
    const assignment = currentGeneratedFontSet.roles[role];
    if (assignment) {
        assignment.sampleText = newText;
        renderRolePreviewCanvas(role, currentGeneratedFontSet);
    }
}

export function renderFontSetUI(fontSet: GeneratedFontSet): void {
    const container = document.getElementById('fontset-roles-grid');
    if (!container) return;

    // Header updates
    const titleEl = document.getElementById('fontset-title');
    const toneEl = document.getElementById('fontset-tone-badge');
    const coreCountEl = document.getElementById('fontset-core-count');
    const visualEl = document.getElementById('fontset-visual-desc');

    if (titleEl) titleEl.innerText = fontSet.presetName;
    if (toneEl) toneEl.innerText = fontSet.tone;
    if (coreCountEl) coreCountEl.innerText = `Sử dụng ${fontSet.coreFontCount} phông chữ chủ đạo`;
    if (visualEl) visualEl.innerText = fontSet.visualStyle;

    const rolesOrder: FontRole[] = ['dialogue', 'innerThought', 'narration', 'shout', 'sfx', 'smallText'];
    const fontLib = getEffectiveFontLibrary();

    container.innerHTML = '';
    rolesOrder.forEach(role => {
        const item = fontSet.roles[role];
        if (!item) return;

        const isStrong = item.isStrongMatch;
        const score = item.score;
        let scoreBadge = isStrong
            ? `<span class="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">${score}% Tương đồng</span>`
            : `<span class="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">⚠️ ${score}% (Chưa khớp tốt)</span>`;

        // Role Icon & Title
        let roleIcon = '💬';
        if (role === 'innerThought') roleIcon = '💭';
        else if (role === 'narration') roleIcon = '📜';
        else if (role === 'shout') roleIcon = '🗯️';
        else if (role === 'sfx') roleIcon = '💥';
        else if (role === 'smallText') roleIcon = '📝';

        // Options for Font Select dropdown
        let fontOptions = '';
        if (fontLib.length === 0) {
            fontOptions = `<option value="">Kho font trống - Vui lòng nạp font</option>`;
        } else {
            fontLib.forEach(f => {
                const selected = f.name === item.fontName ? 'selected' : '';
                const typeTag = f.type === 'custom' ? '✨ ' : '🔤 ';
                fontOptions += `<option value="${f.name}" ${selected}>${typeTag}${f.name} (${getCategoryLabel(f.category)})</option>`;
            });
        }

        const card = document.createElement('div');
        card.className = "bg-slate-950 border border-slate-855 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-md hover:border-slate-700 transition-all";
        card.innerHTML = `
            <div class="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-850">
                <div class="flex items-center gap-2">
                    <span class="text-base">${roleIcon}</span>
                    <div>
                        <h4 class="text-xs font-bold text-slate-100">${item.roleLabel}</h4>
                        <p class="text-[10px] text-slate-400 max-w-xs mt-0.5 truncate" title="${item.desc}">${item.desc}</p>
                    </div>
                </div>
                <div>
                    ${scoreBadge}
                </div>
            </div>

            <!-- Role Live Canvas Render -->
            <div class="relative group flex justify-center p-2 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-inner">
                <canvas id="fontset-canvas-${role}" class="w-full max-w-full h-auto rounded-lg shadow cursor-pointer transition-transform group-hover:scale-[1.01]"></canvas>
                <div class="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" data-action="download-role-sample" class="px-2 py-1 rounded-lg bg-slate-900/90 hover:bg-indigo-600 border border-slate-700 text-white text-[10px] font-bold shadow-lg transition-colors flex items-center gap-1">
                        <i class="fa-solid fa-download"></i> Tải ảnh
                    </button>
                </div>
            </div>

            <!-- Assigned Font Selector & Editable Sample Text -->
            <div class="flex flex-col gap-2 pt-1 text-xs">
                <div class="flex items-center justify-between gap-2">
                    <label class="text-[10px] font-bold text-slate-400 shrink-0">Phông chữ gán:</label>
                    <select data-role="${role}" class="fontset-role-select flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-indigo-300 font-bold focus:outline-none focus:border-indigo-500 truncate">
                        ${fontOptions}
                    </select>
                </div>

                <div class="flex items-center justify-between gap-2">
                    <label class="text-[10px] font-bold text-slate-400 shrink-0">Mẫu câu thử:</label>
                    <input type="text" data-sample-role="${role}" value="${item.sampleText}" class="fontset-sample-input flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium">
                </div>
            </div>
        `;

        const selectEl = card.querySelector('.fontset-role-select') as HTMLSelectElement | null;
        if (selectEl) {
            selectEl.addEventListener('change', (e: Event) => {
                const target = e.target as HTMLSelectElement;
                onFontSetRoleChange(role, target.value);
            });
        }

        const inputEl = card.querySelector('.fontset-sample-input') as HTMLInputElement | null;
        if (inputEl) {
            inputEl.addEventListener('input', (e: Event) => {
                const target = e.target as HTMLInputElement;
                onFontSetSampleTextChange(role, target.value);
            });
        }

        const btnDownload = card.querySelector('[data-action="download-role-sample"]');
        if (btnDownload) {
            btnDownload.addEventListener('click', () => downloadFontSetSampleImage(role));
        }

        const canvasEl = card.querySelector(`#fontset-canvas-${role}`) as HTMLCanvasElement | null;
        if (canvasEl) {
            canvasEl.addEventListener('click', () => openPreviewModal(canvasEl.toDataURL()));
        }

        container.appendChild(card);
    });
}

export async function renderRolePreviewCanvas(role: FontRole, fontSet: GeneratedFontSet): Promise<void> {
    const canvas = document.getElementById(`fontset-canvas-${role}`) as HTMLCanvasElement | null;
    if (!canvas || !fontSet) return;
    const assignment = fontSet.roles[role];
    if (!assignment) return;

    const fontName = assignment.fontName;
    const cleanFontName = fontName.replace(/['"]/g, '');
    const text = assignment.sampleText || 'Manga Translator Studio';

    const dpr = 2;
    const displayW = 460;
    const displayH = 130;

    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    canvas.style.width = displayW + 'px';
    canvas.style.height = displayH + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Font styles based on role
    let isBold = true;
    let isItalic = false;
    let fontSize = 22;
    let strokeWidth = 2.5;
    let textColor = '#ffffff';
    let strokeColor = '#000000';

    if (role === 'innerThought') {
        isItalic = true;
        isBold = false;
        fontSize = 20;
        strokeWidth = 1.5;
        textColor = '#e0e7ff';
    } else if (role === 'narration') {
        isBold = false;
        fontSize = 19;
        strokeWidth = 1.5;
        textColor = '#f8fafc';
    } else if (role === 'shout') {
        isBold = true;
        fontSize = 26;
        strokeWidth = 4.0;
        textColor = '#ffffff';
        strokeColor = '#000000';
    } else if (role === 'sfx') {
        isBold = true;
        isItalic = true;
        fontSize = 30;
        strokeWidth = 4.5;
        textColor = '#fef08a';
        strokeColor = '#000000';
    } else if (role === 'smallText') {
        isBold = false;
        fontSize = 16;
        strokeWidth = 1.0;
        textColor = '#cbd5e1';
    }

    const fallbackFamily = (assignment.fontItem?.family && assignment.fontItem.family.includes('cursive')) ? 'cursive' : 'sans-serif';
    const fontSpec = `${isBold ? 'bold ' : ''}${isItalic ? 'italic ' : ''}${fontSize}px "${cleanFontName}"`;
    const fontStyleStr = `${isBold ? 'bold ' : ''}${isItalic ? 'italic ' : ''}${fontSize}px "${cleanFontName}", ${fallbackFamily}`;

    try {
        await Promise.race([
            (document as any).fonts.load(fontSpec, text),
            new Promise(resolve => setTimeout(resolve, 250))
        ]);
        await Promise.race([
            (document as any).fonts.ready,
            new Promise(resolve => setTimeout(resolve, 250))
        ]);
    } catch (e) { }

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, displayW, displayH);
    bgGrad.addColorStop(0, '#0b0f19');
    bgGrad.addColorStop(1, '#111827');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, displayW, displayH);

    // Inner glow
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(6, 6, displayW - 12, displayH - 12);

    // Header label
    ctx.font = '600 10px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`FONT: ${cleanFontName.toUpperCase()}`, 14, 12);

    // Render Text
    ctx.font = fontStyleStr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxWidth = displayW - 50;
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
        const testLine = currentLine ? (currentLine + ' ' + words[i]) : words[i];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = words[i];
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = fontSize * 1.3;
    const startY = (displayH / 2 + 6) - ((lines.length - 1) * lineHeight / 2);

    lines.forEach((line, lIdx) => {
        const y = startY + lIdx * lineHeight;
        const x = displayW / 2;

        if (strokeWidth > 0) {
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 4;
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = strokeWidth * 2;
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.strokeText(line, x, y);
            ctx.restore();
        }

        ctx.fillStyle = textColor;
        ctx.fillText(line, x, y);
    });
}

export async function updateAllFontSetCanvases(): Promise<void> {
    if (!currentGeneratedFontSet) return;
    const roles: FontRole[] = ['dialogue', 'innerThought', 'narration', 'shout', 'sfx', 'smallText'];
    for (const role of roles) {
        await renderRolePreviewCanvas(role, currentGeneratedFontSet);
    }
}

export function copyFontSetSummary(): void {
    if (!currentGeneratedFontSet) return;
    let summary = `[Manga Font Set: ${currentGeneratedFontSet.presetName}]\n`;
    summary += `Thể loại: ${currentGeneratedFontSet.tone}\n\n`;
    const roles: FontRole[] = ['dialogue', 'innerThought', 'narration', 'shout', 'sfx', 'smallText'];
    roles.forEach(r => {
        const item = currentGeneratedFontSet!.roles[r];
        summary += `• ${item.roleLabel}: ${item.fontName} (${item.score}% match)\n`;
    });
    navigator.clipboard.writeText(summary);
    alert("Đã sao chép cấu hình Font Set vào khay nhớ tạm!");
}

export function copyFontSetJson(): void {
    if (!currentGeneratedFontSet) return;
    const jsonStr = JSON.stringify(currentGeneratedFontSet, null, 2);
    navigator.clipboard.writeText(jsonStr);
    alert("Đã sao chép cấu trúc dữ liệu Font Set JSON!");
}

export function downloadFontSetSampleImage(role: FontRole): void {
    const canvas = document.getElementById(`fontset-canvas-${role}`) as HTMLCanvasElement | null;
    if (!canvas || !currentGeneratedFontSet) return;
    const fontName = currentGeneratedFontSet.roles[role]?.fontName || 'font';
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `FontSet_${currentGeneratedFontSet.presetName}_${role}_${fontName.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

export function handleGenreSampleImageSelect(files: File[]): void {
    if (!files || files.length === 0) return;
    const limitFiles = files.slice(0, 3);
    genreSampleLoadedImgs = [];
    genreSampleDataUrls = [];

    const container = document.getElementById('genre-sample-thumbs-container');
    if (container) container.innerHTML = '';

    let loadedCount = 0;
    limitFiles.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            const img = new Image();
            img.onload = () => {
                genreSampleLoadedImgs.push(img);
                genreSampleDataUrls.push(dataUrl);
                loadedCount++;

                if (container) {
                    const thumb = document.createElement('img');
                    thumb.src = dataUrl;
                    thumb.className = "w-14 h-14 object-cover rounded-lg border border-slate-700 bg-slate-900";
                    container.appendChild(thumb);
                }

                const countEl = document.getElementById('genre-sample-count');
                if (countEl) countEl.innerText = `Đã chọn ${loadedCount} trang mẫu`;
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    });

    const dropzone = document.getElementById('genre-sample-dropzone');
    const previewBox = document.getElementById('genre-sample-preview-box');
    if (dropzone) dropzone.classList.add('hidden');
    if (previewBox) previewBox.classList.remove('hidden');
}

export function resetGenreSampleImages(): void {
    genreSampleLoadedImgs = [];
    genreSampleDataUrls = [];
    const container = document.getElementById('genre-sample-thumbs-container');
    if (container) container.innerHTML = '';
    const dropzone = document.getElementById('genre-sample-dropzone');
    const previewBox = document.getElementById('genre-sample-preview-box');
    if (previewBox) previewBox.classList.add('hidden');
    if (dropzone) dropzone.classList.remove('hidden');
    const fileInput = document.getElementById('genre-sample-files-input') as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';
}

export async function runAiGenreAnalysis(): Promise<void> {
    if (genreSampleDataUrls.length === 0 && genreSampleLoadedImgs.length === 0) {
        alert("Vui lòng tải lên từ 1 đến 3 ảnh trang manga mẫu trước!");
        return;
    }

    const effectiveFonts = getEffectiveFontLibrary();

    const model = getEffectiveFontMatchModel();
    const apiKeyInput = document.getElementById('fontmatch-api-key') as HTMLInputElement | null;
    let apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
    if (!apiKey) {
        apiKey = localStorage.getItem('gemini_manga_api_key') ||
            localStorage.getItem('gemini_api_key') ||
            localStorage.getItem('manga_gemini_key') || '';
    }

    const loadingBtn = document.getElementById('btn-run-genre-ai');
    if (loadingBtn) loadingBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Đang phân tích phong cách...';

    try {
        let result: AiGenreAnalysisResult;
        if (model !== 'offline-heuristic' && apiKey && genreSampleDataUrls.length > 0) {
            result = await callGeminiVisionForGenreStyle(model, apiKey, genreSampleDataUrls);
        } else {
            await new Promise(r => setTimeout(r, 450));
            result = analyzeGenreWithCanvasHeuristics(genreSampleLoadedImgs);
        }

        const customProfile: StyleProfile = {
            weight: result.weight,
            roundness: result.roundness,
            formality: result.formality,
            handwritten: result.handwritten,
            intensity: result.intensity
        };

        currentGeneratedFontSet = generateFontSetFromCustomProfile(
            effectiveFonts,
            customProfile,
            result.genre,
            result.tone,
            result.visualStyle
        );

        renderFontSetUI(currentGeneratedFontSet);
        await updateAllFontSetCanvases();

        // Update active dropdown preset if matched
        const select = document.getElementById('fontset-genre-select') as HTMLSelectElement | null;
        if (select && result.detectedPresetId) {
            select.value = result.detectedPresetId;
        }

        alert(`🎉 AI đã phân tích xong phong cách: "${result.genre}"!\n\nĐã đề xuất bộ Font Set tối ưu cho dự án.`);
    } catch (err: any) {
        console.warn("AI Genre analysis failed, falling back to local heuristic:", err);
        const fallbackResult = analyzeGenreWithCanvasHeuristics(genreSampleLoadedImgs);
        const fallbackProfile: StyleProfile = {
            weight: fallbackResult.weight,
            roundness: fallbackResult.roundness,
            formality: fallbackResult.formality,
            handwritten: fallbackResult.handwritten,
            intensity: fallbackResult.intensity
        };

        currentGeneratedFontSet = generateFontSetFromCustomProfile(
            effectiveFonts,
            fallbackProfile,
            fallbackResult.genre,
            fallbackResult.tone,
            fallbackResult.visualStyle
        );

        renderFontSetUI(currentGeneratedFontSet);
        await updateAllFontSetCanvases();
        alert(`Đã hoàn tất phân tích phong cách (Chế độ Heuristic cục bộ): "${fallbackResult.genre}".`);
    } finally {
        if (loadingBtn) loadingBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-1.5"></i> Phân Tích & Sinh Font Set';
    }
}

// --- MODEL MANAGEMENT ENGINE (SYNCED WITH STUDIO SETTINGS) ---
export let cachedGeminiModels: string[] = (() => {
    try {
        const saved = localStorage.getItem('gemini_cached_models');
        return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
})();

export function getModelScore(id: string): number {
    let score = 0;
    const match = id.match(/gemini-(\d+)(?:\.(\d+))?/);
    if (match) {
        const major = parseInt(match[1]);
        const minor = match[2] ? parseInt(match[2]) : 0;
        score = major * 100 + minor * 10;
    }
    if (id.includes('pro')) score += 5;
    if (id.includes('flash')) score += 3;
    if (id.includes('lite')) score += 1;
    if (id.includes('preview')) score -= 2;
    return score;
}

export function getFriendlyModelName(id: string): string {
    switch (id) {
        case "gemini-2.5-flash":
            return "Gemini 2.5 Flash (Khuyên dùng: Siêu tốc & nhận diện chuẩn)";
        case "gemini-2.5-flash-lite":
            return "Gemini 2.5 Flash-Lite (Siêu rẻ & tiết kiệm quota)";
        case "gemini-3.1-flash-lite":
            return "Gemini 3.1 Flash-Lite (Đời mới, tối ưu tốc độ & rẻ)";
        case "gemini-2.5-pro":
            return "Gemini 2.5 Pro (Độ chính xác cao nhất)";
        case "gemini-3.1-pro-preview":
            return "Gemini 3.1 Pro Preview (Chuyên sâu ngữ cảnh)";
        case "gemini-2.0-flash":
            return "Gemini 2.0 Flash (Ổn định)";
        case "gemini-2.0-flash-lite":
            return "Gemini 2.0 Flash-Lite (Tiết kiệm)";
        case "gemini-1.5-flash":
            return "Gemini 1.5 Flash (Truyền thống)";
        case "gemini-1.5-pro":
            return "Gemini 1.5 Pro (Chất lượng cao)";
        default:
            return id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' (Google API Online)';
    }
}

export function updateFontMatchModelDropdown(fetchedModels: string[] = []): void {
    const select = document.getElementById('fontmatch-model-select') as HTMLSelectElement | null;
    if (!select) return;

    const baseKnownModels = [
        "gemini-2.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-2.5-flash-lite",
        "gemini-2.5-pro",
        "gemini-3.1-pro-preview",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-1.5-flash",
        "gemini-1.5-pro"
    ];

    const allModelsSet = new Set<string>([
        ...baseKnownModels,
        ...(Array.isArray(fetchedModels) ? fetchedModels : cachedGeminiModels)
    ]);

    const savedSelected = localStorage.getItem('gemini_manga_ocr_model') ||
        localStorage.getItem('gemini_manga_model') ||
        select.value || 'gemini-3.1-flash-lite';
    if (savedSelected && savedSelected !== '__custom__' && savedSelected !== 'offline-heuristic') {
        allModelsSet.add(savedSelected);
    }

    const sortedModels = Array.from(allModelsSet).sort((a, b) => {
        const scoreA = getModelScore(a);
        const scoreB = getModelScore(b);
        return scoreA !== scoreB ? scoreB - scoreA : a.localeCompare(b);
    });

    select.innerHTML = '';

    // 1. Recommended group
    const recGroup = document.createElement('optgroup');
    recGroup.label = '⚡ Khuyên Dùng Cho Manga & Vision';
    const recList = ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"];
    recList.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = getFriendlyModelName(m);
        recGroup.appendChild(opt);
    });
    select.appendChild(recGroup);

    // 2. High tier & Pro
    const proGroup = document.createElement('optgroup');
    proGroup.label = '🌟 Mô Hình Cao Cấp (Pro / Preview)';
    const proList = ["gemini-2.5-pro", "gemini-3.1-pro-preview", "gemini-1.5-pro"];
    proList.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = getFriendlyModelName(m);
        proGroup.appendChild(opt);
    });
    select.appendChild(proGroup);

    // 3. Online scanned extra models (if any)
    const otherOnline = sortedModels.filter(m => !recList.includes(m) && !proList.includes(m) && m !== 'gemini-2.0-flash' && m !== 'gemini-2.0-flash-lite' && m !== 'gemini-1.5-flash');
    if (otherOnline.length > 0) {
        const onlineGroup = document.createElement('optgroup');
        onlineGroup.label = '🌐 Mô Hình Quét Trực Tuyến Từ Google API';
        otherOnline.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = getFriendlyModelName(m);
            onlineGroup.appendChild(opt);
        });
        select.appendChild(onlineGroup);
    }

    // 4. Stable other versions
    const stableGroup = document.createElement('optgroup');
    stableGroup.label = '📦 Các Phiên Bản Ổn Định Khác';
    const stableList = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];
    stableList.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = getFriendlyModelName(m);
        stableGroup.appendChild(opt);
    });
    select.appendChild(stableGroup);

    // 5. Offline Heuristic
    const offlineGroup = document.createElement('optgroup');
    offlineGroup.label = '🛡️ Chế Độ Không Cần Mạng (Offline)';
    const offOpt = document.createElement('option');
    offOpt.value = 'offline-heuristic';
    offOpt.textContent = '⚡ Offline 100% Heuristic (Không cần API Key & Mạng)';
    offlineGroup.appendChild(offOpt);
    select.appendChild(offlineGroup);

    // 6. Custom model option
    const customGroup = document.createElement('optgroup');
    customGroup.label = '✍️ Tùy Chỉnh';
    const custOpt = document.createElement('option');
    custOpt.value = '__custom__';
    custOpt.textContent = '✍️ Tự nhập model Vision tùy chỉnh...';
    customGroup.appendChild(custOpt);
    select.appendChild(customGroup);

    // Set current selection
    const customInput = document.getElementById('fontmatch-custom-model-input') as HTMLInputElement | null;
    if (allModelsSet.has(savedSelected) || savedSelected === 'offline-heuristic') {
        select.value = savedSelected;
        if (customInput) customInput.classList.add('hidden');
    } else if (savedSelected) {
        select.value = '__custom__';
        if (customInput) {
            customInput.classList.remove('hidden');
            customInput.value = savedSelected;
        }
    } else {
        select.value = 'gemini-3.1-flash-lite';
    }

    onFontMatchModelChange();
}

export async function fetchFontMatchModels(isManual: boolean = false): Promise<void> {
    const apiKeyInput = document.getElementById('fontmatch-api-key') as HTMLInputElement | null;
    let apiKey = (apiKeyInput ? apiKeyInput.value.trim() : '') ||
        localStorage.getItem('gemini_manga_api_key') ||
        localStorage.getItem('gemini_api_key') || '';

    if (!apiKey) {
        updateFontMatchModelDropdown(cachedGeminiModels);
        if (isManual) alert("Vui lòng nhập hoặc kiểm tra Gemini API Key trước khi quét mô hình!");
        return;
    }

    if (!isManual && cachedGeminiModels.length > 0) {
        updateFontMatchModelDropdown(cachedGeminiModels);
        return;
    }

    const btn = document.getElementById('btn-fontmatch-refresh-models');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-[9px]"></i> Đang nạp...';

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
        const resp = await fetch(url);
        if (!resp.ok) {
            updateFontMatchModelDropdown(cachedGeminiModels);
            if (isManual) alert(`Không thể tải Model từ Google API (Mã lỗi ${resp.status}). Vui lòng kiểm tra lại API Key.`);
            return;
        }
        const data = await resp.json();
        if (data && data.models && Array.isArray(data.models)) {
            const geminiModels = data.models
                .filter((m: any) => {
                    const id = m.name ? m.name.replace('models/', '') : '';
                    if (!id) return false;
                    const supportsGen = m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent');
                    if (!supportsGen) return false;
                    if (id.includes('embedding') || id.includes('bison') || id.includes('aqa') || id.includes('imagen') || id.includes('tunedModels/')) return false;
                    return true;
                })
                .map((m: any) => m.name.replace('models/', ''));

            if (geminiModels.length > 0) {
                cachedGeminiModels = geminiModels;
                safeSetLocalStorage('gemini_cached_models', geminiModels);
                updateFontMatchModelDropdown(geminiModels);
                if (isManual) {
                    alert(`Đã nạp và cập nhật thành công ${geminiModels.length} mô hình từ Google Gemini API!`);
                }
            } else {
                updateFontMatchModelDropdown(cachedGeminiModels);
            }
        }
    } catch (err: any) {
        console.warn("Lỗi quét mô hình Gemini:", err);
        updateFontMatchModelDropdown(cachedGeminiModels);
        if (isManual) alert(`Lỗi kết nối mạng khi tải danh sách model: ${err?.message || err}`);
    } finally {
        if (btn) btn.innerHTML = '<i class="fa-solid fa-arrows-rotate text-[9px]"></i> Quét Model';
    }
}

export function getEffectiveFontMatchModel(): string {
    const select = document.getElementById('fontmatch-model-select') as HTMLSelectElement | null;
    if (!select) return 'gemini-3.1-flash-lite';
    if (select.value === '__custom__') {
        const customInput = document.getElementById('fontmatch-custom-model-input') as HTMLInputElement | null;
        const val = customInput ? customInput.value.trim() : '';
        return val || 'gemini-3.1-flash-lite';
    }
    return select.value;
}

export function onFontMatchModelChange(): void {
    const select = document.getElementById('fontmatch-model-select') as HTMLSelectElement | null;
    const model = select ? select.value : '';
    const keyBox = document.getElementById('fontmatch-api-key-container');
    const customInput = document.getElementById('fontmatch-custom-model-input');

    if (customInput) {
        if (model === '__custom__') {
            customInput.classList.remove('hidden');
            customInput.focus();
        } else {
            customInput.classList.add('hidden');
        }
    }

    if (keyBox) {
        if (model === 'offline-heuristic') {
            keyBox.classList.add('opacity-40', 'pointer-events-none');
        } else {
            keyBox.classList.remove('opacity-40', 'pointer-events-none');
        }
    }
}

export function toggleFontMatchApiKeyVisibility(): void {
    const input = document.getElementById('fontmatch-api-key') as HTMLInputElement | null;
    const eye = document.getElementById('fontmatch-key-eye');
    if (!input || !eye) return;
    if (input.type === 'password') {
        input.type = 'text';
        eye.className = 'fa-solid fa-eye-slash';
    } else {
        input.type = 'password';
        eye.className = 'fa-solid fa-eye';
    }
}

export function handleFontMatchImageSelect(file: File): void {
    if (!file || !file.type.startsWith('image/')) {
        alert("Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WEBP).");
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            fontMatchLoadedImg = img;
            fontMatchImgDataUrl = e.target?.result as string;
            const dropzone = document.getElementById('fontmatch-dropzone');
            if (dropzone) dropzone.classList.add('hidden');
            const previewBox = document.getElementById('fontmatch-img-preview-box');
            if (previewBox) previewBox.classList.remove('hidden');
            const thumb = document.getElementById('fontmatch-img-thumb') as HTMLImageElement | null;
            if (thumb) thumb.src = fontMatchImgDataUrl;
            const nameEl = document.getElementById('fontmatch-img-name');
            if (nameEl) nameEl.innerText = file.name || 'image.png';
            const metaEl = document.getElementById('fontmatch-img-meta');
            if (metaEl) metaEl.innerText = `${img.naturalWidth} x ${img.naturalHeight} px • ${formatFileSize(file.size)}`;
        };
        img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
}

export function resetFontMatchImage(): void {
    fontMatchLoadedImg = null;
    fontMatchImgDataUrl = '';
    const previewBox = document.getElementById('fontmatch-img-preview-box');
    if (previewBox) previewBox.classList.add('hidden');
    const dropzone = document.getElementById('fontmatch-dropzone');
    if (dropzone) dropzone.classList.remove('hidden');
    const fileInput = document.getElementById('fontmatch-file-input') as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';
}

export function loadFontMatchSample(type: string): void {
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 360, 360);

    if (type === 'shout') {
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        const cx = 180, cy = 180, numSpikes = 16, outerR = 160, innerR = 120;
        for (let i = 0; i < numSpikes * 2; i++) {
            const r = (i % 2 === 0) ? outerR : innerR;
            const angle = (i * Math.PI) / numSpikes;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 38px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('くらえぇぇっ！', 180, 150);
        ctx.fillText('死ねぇぇ！！！', 180, 210);
    } else if (type === 'narration') {
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(30, 60, 300, 240);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(30, 60, 300, 240);

        ctx.fillStyle = '#0f172a';
        ctx.font = '24px serif';
        ctx.textAlign = 'center';
        ctx.fillText('昔々、ある所に…', 180, 130);
        ctx.fillText('勇敢な戦士がいた。', 180, 180);
        ctx.fillText('運命の歯車が回り出す。', 180, 230);
    } else if (type === 'sfx') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 360, 360);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#94a3b8';
        for (let i = 0; i < 20; i++) {
            ctx.beginPath();
            ctx.moveTo(180, 180);
            const angle = Math.random() * Math.PI * 2;
            ctx.lineTo(180 + Math.cos(angle) * 200, 180 + Math.sin(angle) * 200);
            ctx.stroke();
        }

        ctx.fillStyle = '#000000';
        ctx.font = 'italic 900 64px sans-serif';
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate(180, 180);
        ctx.rotate(-0.15);
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText('ドカーン！', 0, 0);
        ctx.fillText('ドカーン！', 0, 0);
        ctx.restore();
    } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(180, 180, 140, 110, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('何だ…あれは？！', 180, 160);
        ctx.fillText('信じられない…', 180, 205);
    }

    const dataUrl = canvas.toDataURL('image/png');
    const img = new Image();
    img.onload = () => {
        fontMatchLoadedImg = img;
        fontMatchImgDataUrl = dataUrl;
        const dropzone = document.getElementById('fontmatch-dropzone');
        if (dropzone) dropzone.classList.add('hidden');
        const previewBox = document.getElementById('fontmatch-img-preview-box');
        if (previewBox) previewBox.classList.remove('hidden');
        const thumb = document.getElementById('fontmatch-img-thumb') as HTMLImageElement | null;
        if (thumb) thumb.src = dataUrl;
        const nameEl = document.getElementById('fontmatch-img-name');
        if (nameEl) nameEl.innerText = `sample_${type}.png`;
        const metaEl = document.getElementById('fontmatch-img-meta');
        if (metaEl) metaEl.innerText = `360 x 360 px • Mẫu có sẵn`;
    };
    img.src = dataUrl;
}

// --- CORE MATCHING ENGINE ---
export async function runFontMatchAnalysis(): Promise<void> {
    if (!fontMatchLoadedImg) {
        alert("Vui lòng tải lên ảnh chữ tiếng Nhật hoặc chọn một ảnh mẫu trước!");
        return;
    }

    const effectiveFonts = getEffectiveFontLibrary();

    const model = getEffectiveFontMatchModel();
    const contextTag = (document.getElementById('fontmatch-context-select') as HTMLSelectElement)?.value || 'auto';
    const apiKeyInput = document.getElementById('fontmatch-api-key') as HTMLInputElement | null;
    let apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
    if (!apiKey) {
        apiKey = localStorage.getItem('gemini_manga_api_key') ||
            localStorage.getItem('gemini_api_key') ||
            localStorage.getItem('manga_gemini_key') || '';
    }
    if (apiKeyInput && apiKey && !apiKeyInput.value) {
        apiKeyInput.value = apiKey;
    }

    if (apiKey) {
        safeSetLocalStorage('gemini_manga_api_key', apiKey);
        safeSetLocalStorage('gemini_api_key', apiKey);
        safeSetLocalStorage('manga_gemini_key', apiKey);
    }

    const emptyState = document.getElementById('fontmatch-empty-state');
    if (emptyState) emptyState.classList.add('hidden');
    const resultsContainer = document.getElementById('fontmatch-results-container');
    if (resultsContainer) resultsContainer.classList.add('hidden');
    const loadingBox = document.getElementById('fontmatch-loading-state');
    if (loadingBox) loadingBox.classList.remove('hidden');

    const loadingTitle = document.getElementById('fontmatch-loading-title');
    const loadingDesc = document.getElementById('fontmatch-loading-desc');
    if (loadingTitle) loadingTitle.innerText = "Đang quét đặc trưng hình thái & thần thái chữ...";
    const fontLibLabel = (customFontsList && customFontsList.length > 0) ? `${customFontsList.length} font cá nhân đã tải lên` : `${effectiveFonts.length} font mẫu chuẩn`;
    if (loadingDesc) loadingDesc.innerText = `Đang so khớp với ${fontLibLabel}...`;

    let analysisResult: AnalysisResult;

    if (model !== 'offline-heuristic' && apiKey) {
        try {
            if (loadingTitle) loadingTitle.innerText = `Đang kích hoạt AI Vision (${model})...`;
            analysisResult = await callGeminiVisionForFontMatch(model, apiKey, fontMatchImgDataUrl, contextTag);
        } catch (err) {
            console.warn("AI Vision font match failed, falling back to local heuristic:", err);
            if (loadingDesc) loadingDesc.innerText = "Chuyển sang thuật toán phân tích cục bộ Heuristic...";
            analysisResult = analyzeImageWithCanvasHeuristics(fontMatchLoadedImg, contextTag);
        }
    } else {
        await new Promise(r => setTimeout(r, 450));
        analysisResult = analyzeImageWithCanvasHeuristics(fontMatchLoadedImg, contextTag);
    }

    const rankedFonts = rankFontsAgainstAnalysis(effectiveFonts, analysisResult, contextTag);
    currentTop3Matches = rankedFonts.slice(0, Math.min(3, rankedFonts.length));

    if (loadingBox) loadingBox.classList.add('hidden');
    if (resultsContainer) resultsContainer.classList.remove('hidden');

    const badgeEl = document.getElementById('fontmatch-engine-badge');
    if (badgeEl) badgeEl.innerText = (model !== 'offline-heuristic' && apiKey && analysisResult.isAi) ? `AI Vision (${model})` : 'Heuristic Offline 100%';
    const catEl = document.getElementById('fontmatch-res-category');
    if (catEl) catEl.innerText = getCategoryLabel(analysisResult.category);
    const weightEl = document.getElementById('fontmatch-res-weight');
    if (weightEl) weightEl.innerText = analysisResult.weightDesc || 'Đậm vừa (Medium)';
    const energyEl = document.getElementById('fontmatch-res-energy');
    if (energyEl) energyEl.innerText = analysisResult.styleDesc || analysisResult.energyDesc || 'Thoại Manga Chuẩn Mực';
    const strokeEl = document.getElementById('fontmatch-res-stroke');
    if (strokeEl) strokeEl.innerText = analysisResult.recommendedStroke || '1.5px (Viền tương phản)';
    const reasonEl = document.getElementById('fontmatch-res-reasoning');
    const sourceDesc = (customFontsList && customFontsList.length > 0) ? `kho ${customFontsList.length} font cá nhân` : `kho ${effectiveFonts.length} font mẫu Manga`;
    if (reasonEl) reasonEl.innerText = analysisResult.reasoning || `Đã phân tích và so khớp với ${sourceDesc}.`;

    // Dynamically adjust preview text & styling to fit detected typography mood
    const liveTextInput = document.getElementById('fontmatch-live-text') as HTMLTextAreaElement | null;
    const liveBoldCheck = document.getElementById('live-bold') as HTMLInputElement | null;
    const liveItalicCheck = document.getElementById('live-italic') as HTMLInputElement | null;
    const liveStrokeSlider = document.getElementById('live-stroke-width') as HTMLInputElement | null;
    const liveStrokeLabel = document.getElementById('lbl-live-stroke');

    if (liveTextInput) {
        const currentVal = liveTextInput.value.trim();
        const isGenericDefault = currentVal === 'Ngươi dám cản đường ta sao?!' || currentVal === 'Hôm nay trời đẹp thật đấy, cậu có muốn cùng đi dạo không?';
        if (isGenericDefault) {
            if (analysisResult.category === 'dialogue' || analysisResult.fontStyleType === 'standard_dialogue') {
                liveTextInput.value = 'Hôm nay trời đẹp thật đấy, cậu có muốn cùng đi dạo không?';
                if (liveBoldCheck) liveBoldCheck.checked = false;
                if (liveItalicCheck) liveItalicCheck.checked = false;
                if (liveStrokeSlider) liveStrokeSlider.value = '1.5';
                if (liveStrokeLabel) liveStrokeLabel.innerText = '1.5px';
            } else if (analysisResult.category === 'shout' || analysisResult.fontStyleType === 'shout_impact') {
                liveTextInput.value = 'NGƯƠI DÁM CẢN ĐƯỜNG TA SAO?!';
                if (liveBoldCheck) liveBoldCheck.checked = true;
                if (liveItalicCheck) liveItalicCheck.checked = false;
                if (liveStrokeSlider) liveStrokeSlider.value = '3.5';
                if (liveStrokeLabel) liveStrokeLabel.innerText = '3.5px';
            } else if (analysisResult.category === 'whisper' || analysisResult.fontStyleType === 'whisper_cursive') {
                liveTextInput.value = '(Ước gì thời gian có thể dừng lại ngay lúc này...)';
                if (liveBoldCheck) liveBoldCheck.checked = false;
                if (liveItalicCheck) liveItalicCheck.checked = true;
                if (liveStrokeSlider) liveStrokeSlider.value = '1';
                if (liveStrokeLabel) liveStrokeLabel.innerText = '1px';
            } else if (analysisResult.category === 'sfx' || analysisResult.fontStyleType === 'brush_sfx') {
                liveTextInput.value = 'ẦM ẦM!! RẮC RẮC!!';
                if (liveBoldCheck) liveBoldCheck.checked = true;
                if (liveStrokeSlider) liveStrokeSlider.value = '4';
                if (liveStrokeLabel) liveStrokeLabel.innerText = '4px';
            }
        }
    }

    renderTop3FontCards(currentTop3Matches);
    await updateAllFontCanvases();
}

export async function callGeminiVisionForFontMatch(
    modelId: string,
    apiKey: string,
    dataUrl: string,
    contextTag: string
): Promise<AnalysisResult> {
    const base64Data = dataUrl.split(',')[1];
    const mimeType = dataUrl.split(';')[0].split(':')[1] || 'image/png';

    const prompt = `Bạn là một chuyên gia chỉ đạo nghệ thuật Typography và Typesetting Manga/Comic hàng đầu.
Nhiệm vụ: Phân tích sâu sắc phong cách typography của chữ trong ảnh mẫu (tiếng Nhật/Manga) để so khớp và chọn phông chữ tiếng Việt chuẩn xác nhất từ kho font của người dùng.
Gợi ý ngữ cảnh từ người dùng: "${contextTag}".

HƯỚNG DẪN ĐÁNH GIÁ ĐẶC TRƯNG HÌNH THÁI HỌC & PHONG CÁCH CHỮ:
1. fontStyleType: Chọn đúng 1 trong các kiểu thiết kế sau (RẤT QUAN TRỌNG ĐỂ TRÁNH LỆCH TÔNG):
   - "standard_dialogue": Chữ thoại manga Nhật Bản in ấn tiêu chuẩn (Antique/Gothic, nét đều, thẳng thớm, cân đối, dễ đọc, chỉn chu - như CC Wild Words, SVN-Avo, Anime Ace, Manga Temple).
   - "cartoon_quirky": Chữ hoạt hình biếm họa / nhí nhố / vẽ tay nguệch ngoạc / Simpsons / Chibi.
   - "shout_impact": Chữ hét / chiêu thức / Shounen bùng nổ, nét cực đậm, in hoa.
   - "serif_narration": Chữ có chân (Mincho/Serif) trang trọng, quý tộc, dẫn chuyện.
   - "whisper_cursive": Chữ thì thầm / suy nghĩ / viết tay mềm mại thanh mảnh.
   - "brush_sfx": Hiệu ứng SFX / cọ vẽ nứt xước / tiếng động.
   - "tech_display": Màn hình sci-fi / game / robot.
2. category: Chọn đúng 1 trong: ["dialogue", "shout", "narration", "whisper", "cute", "tech", "sfx"]
3. weightScore: Điểm độ đậm nét CHÍNH của thân chữ từ 0.1 (thanh mảnh) đến 1.0 (chữ khối siêu đậm). Đánh giá thân chữ thật, KHÔNG tính viền stroke.
4. roundnessScore: Điểm bo tròn đầu nét (0.1: sắc nhọn/vuông vức -> 1.0: bo tròn mềm mại).
5. handwrittenScore: Điểm tính chất viết tay (0.1: in ấn quy chuẩn, cơ học -> 1.0: viết tay mộc mạc, thư pháp). Chữ thoại in ấn manga tiêu chuẩn có điểm viết tay RẤT THẤP (~0.1 - 0.25).
6. formalityScore: Điểm độ nghiêm túc/quy chuẩn từ 0.1 (nhí nhố, tự do) đến 1.0 (trang trọng, serif/in hoa chuẩn).
7. roughnessScore: Điểm độ nham nhở/gai góc/nứt vỡ từ 0.1 (mượt mà) đến 1.0 (cọ xước, nứt vỡ).
8. energyScore: Điểm mức độ cảm xúc/năng lượng từ 0.1 (bình tĩnh, thì thầm) đến 1.0 (bùng nổ, la hét).
9. isAllCaps: true nếu là chữ in hoa toàn bộ hoặc chữ khối tiêu đề, false nếu là chữ hoa-thường.
10. isSerif: true nếu kiểu chữ có chân (Mincho/Serif), false nếu không chân (Gothic/Sans).
11. slantAngle: Góc nghiêng ước lượng tính bằng độ (0 nếu thẳng đứng, 8-15 nếu nghiêng/italic).
12. weightDesc: Mô tả ngắn gọn độ đậm (ví dụ: "Nét thanh mảnh", "Nét đều chuẩn (Regular)", "Nét dày đậm (Bold)").
13. energyDesc: Mô tả ngắn gọn cảm xúc & phong thái (ví dụ: "Bình thản / Tự nhiên", "Bùng nổ / La hét", "Dịu dàng").
14. styleDesc: Mô tả phong cách chữ ngắn gọn (ví dụ: "Thoại Manga in ấn chuẩn mực (Antique/Gothic)", "Hoạt hình nhí nhố", "Serif dẫn chuyện").
15. reasoning: 1-2 câu tiếng Việt phân tích đặc trưng hình thái và định hướng font thay thế tối ưu khi typeset tiếng Việt.
16. recommendedStroke: Độ dày viền chữ khuyến nghị (ví dụ: "1.5px", "2px", "3.5px").

QUY TẮC BẮT BUỘC:
- KHÔNG bịa tên phông chữ cụ thể.
- ĐẶC BIỆT CHÚ Ý: Chữ thoại đối thoại manga Nhật Bản in ấn tiêu chuẩn (như trong ảnh mẫu) PHẢI ĐƯỢC XẾP VÀO "standard_dialogue" với handwrittenScore thấp (<= 0.25) để tránh bị gợi ý nhầm font hoạt hình/nhí nhố.

TRẢ VỀ DUY NHẤT ĐỊNH DẠNG JSON TUÂN THỦ SCHEMA SAU:
{
  "fontStyleType": "standard_dialogue",
  "category": "dialogue",
  "weightScore": 0.48,
  "roundnessScore": 0.75,
  "handwrittenScore": 0.18,
  "formalityScore": 0.65,
  "roughnessScore": 0.10,
  "energyScore": 0.45,
  "isAllCaps": false,
  "isSerif": false,
  "slantAngle": 0,
  "weightDesc": "Nét đều chuẩn (Regular)",
  "energyDesc": "Bình thản / Tự nhiên",
  "styleDesc": "Thoại Manga in ấn chuẩn mực (Clean Dialogue)",
  "reasoning": "Chữ hội thoại manga in ấn chuẩn mực, trục chữ thẳng thớm, độ dày nét đều đặn dễ đọc, phù hợp font thoại manga chuẩn (Avo, Wild Words, Anime Ace).",
  "recommendedStroke": "1.5px (Viền thanh)"
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = {
        contents: [{
            parts: [
                { text: prompt },
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                }
            ]
        }],
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

    const validCategories: FontCategory[] = ['dialogue', 'shout', 'narration', 'whisper', 'cute', 'tech', 'sfx'];
    const safeCategory: FontCategory = validCategories.includes(parsed.category) ? parsed.category : 'dialogue';

    const validStyleTypes: FontStyleType[] = ['standard_dialogue', 'cartoon_quirky', 'shout_impact', 'serif_narration', 'whisper_cursive', 'brush_sfx', 'tech_display'];
    const safeStyleType: FontStyleType = validStyleTypes.includes(parsed.fontStyleType)
        ? parsed.fontStyleType
        : (safeCategory === 'shout' ? 'shout_impact' : safeCategory === 'narration' ? 'serif_narration' : safeCategory === 'whisper' ? 'whisper_cursive' : safeCategory === 'sfx' ? 'brush_sfx' : safeCategory === 'cute' ? 'cartoon_quirky' : 'standard_dialogue');

    const clamp = (val: any, def: number): number => {
        const num = typeof val === 'number' ? val : parseFloat(val);
        if (isNaN(num)) return def;
        return Math.max(0.1, Math.min(1.0, num));
    };

    const parsedWeight = Number(clamp(parsed.weightScore, 0.5).toFixed(2));
    const parsedRoundness = Number(clamp(parsed.roundnessScore, 0.6).toFixed(2));
    const parsedHandwritten = Number(clamp(parsed.handwrittenScore, 0.2).toFixed(2));
    const parsedEnergy = Number(clamp(parsed.energyScore, 0.5).toFixed(2));
    const parsedFormality = Number(clamp(parsed.formalityScore, 0.4).toFixed(2));
    const parsedRoughness = Number(clamp(parsed.roughnessScore, 0.2).toFixed(2));
    const parsedSlant = typeof parsed.slantAngle === 'number' ? parsed.slantAngle : 0;
    const parsedAllCaps = !!parsed.isAllCaps;
    const parsedSerif = !!parsed.isSerif;

    const weightGrade = determineWeightGrade(parsedWeight);
    const slantGrade: FontSlantGrade = Math.abs(parsedSlant) > 4 ? 'Italic' : 'Upright';
    const caseGrade: FontCaseGrade = parsedAllCaps ? 'All Caps' : 'Mixed Case';

    return {
        category: safeCategory,
        fontStyleType: safeStyleType,
        weightScore: parsedWeight,
        roundnessScore: parsedRoundness,
        handwrittenScore: parsedHandwritten,
        energyScore: parsedEnergy,
        formalityScore: parsedFormality,
        roughnessScore: parsedRoughness,
        isAllCaps: parsedAllCaps,
        isSerif: parsedSerif,
        slantAngle: parsedSlant,
        weightGrade: weightGrade,
        widthGrade: 'Normal',
        slantGrade: slantGrade,
        caseGrade: caseGrade,
        weightDesc: typeof parsed.weightDesc === 'string' && parsed.weightDesc.trim() ? parsed.weightDesc.trim() : `${weightGrade} (Chuẩn)`,
        energyDesc: typeof parsed.energyDesc === 'string' && parsed.energyDesc.trim() ? parsed.energyDesc.trim() : 'Tự nhiên / Cân bằng',
        styleDesc: typeof parsed.styleDesc === 'string' && parsed.styleDesc.trim() ? parsed.styleDesc.trim() : (safeStyleType === 'standard_dialogue' ? 'Thoại Manga in ấn chuẩn mực' : 'Typography Manga'),
        reasoning: typeof parsed.reasoning === 'string' && parsed.reasoning.trim() ? parsed.reasoning.trim() : 'Phân tích hình thái nét chữ phục vụ Việt hóa manga.',
        recommendedStroke: typeof parsed.recommendedStroke === 'string' && parsed.recommendedStroke.trim() ? parsed.recommendedStroke.trim() : '1.5px (Viền tương phản)',
        isAi: true
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

export function calculateCategoryCompatibility(fontCat: string, targetCat: string): number {
    if (fontCat === targetCat) return 1.0;

    const highPairs = [
        ['shout', 'sfx'], ['sfx', 'shout'],
        ['dialogue', 'narration'], ['narration', 'dialogue'],
        ['dialogue', 'cute'], ['cute', 'dialogue'],
        ['whisper', 'cute'], ['cute', 'whisper']
    ];
    if (highPairs.some(([a, b]) => a === fontCat && b === targetCat)) return 0.70;

    const medPairs = [
        ['tech', 'narration'], ['narration', 'tech'],
        ['tech', 'shout'], ['shout', 'tech'],
        ['dialogue', 'whisper'], ['whisper', 'dialogue']
    ];
    if (medPairs.some(([a, b]) => a === fontCat && b === targetCat)) return 0.45;

    const lowPairs = [
        ['shout', 'whisper'], ['whisper', 'shout'],
        ['sfx', 'whisper'], ['whisper', 'sfx'],
        ['sfx', 'narration'], ['narration', 'sfx']
    ];
    if (lowPairs.some(([a, b]) => a === fontCat && b === targetCat)) return 0.15;

    return 0.35;
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

        // 1. Independent 6-dimensional morphological Euclidean distance
        const morphDist = Math.sqrt(
            Math.pow(tw - fw, 2) * 0.30 +
            Math.pow(trnd - frnd, 2) * 0.20 +
            Math.pow(thw - fhw, 2) * 0.15 +
            Math.pow(tf - ff, 2) * 0.15 +
            Math.pow(tr - fr, 2) * 0.10 +
            Math.pow(tslant - fslant, 2) * 0.10
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

export function renderTop3FontCards(top3: CustomFontItem[]): void {
    const grid = document.getElementById('fontmatch-top3-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!top3 || top3.length === 0) {
        grid.innerHTML = `
            <div class="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center text-slate-400 text-xs">
                Không tìm thấy phông chữ phù hợp trong kho.
            </div>
        `;
        return;
    }

    const top1Score = top3[0]?.matchPercent ?? 0;
    const isLowMatch = top1Score < 65;

    // Insert warning notice banner if closest font has low match score (<65%)
    if (isLowMatch) {
        const notice = document.createElement('div');
        notice.className = "bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 text-xs text-amber-200/90 flex items-start gap-3 shadow-md";
        notice.innerHTML = `
            <div class="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                <i class="fa-solid fa-triangle-exclamation text-xs"></i>
            </div>
            <div class="flex-1">
                <div class="font-bold text-amber-300 flex items-center gap-1.5">
                    <span>Thông Báo: Không Có Font Khớp Hoàn Hảo</span>
                    <span class="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono">Độ khớp cao nhất: ${top1Score}%</span>
                </div>
                <p class="text-[11px] text-amber-200/80 mt-1 leading-relaxed">
                    Kho font hiện tại của bạn chưa có font nào thực sự tương đồng cao với phong cách chữ trong ảnh. Danh sách dưới đây là những lựa chọn có hình thái <strong>gần nhất</strong> để bạn tham khảo.
                </p>
            </div>
        `;
        grid.appendChild(notice);
    }

    top3.forEach((item, index) => {
        const rank = index + 1;
        const isTop1 = rank === 1;
        const score = item.matchPercent ?? 50;

        let scoreTextColor = 'text-slate-400';
        let progressColor = 'bg-slate-600';
        if (score >= 85) {
            scoreTextColor = 'text-emerald-400';
            progressColor = 'bg-gradient-to-r from-emerald-500 to-teal-400';
        } else if (score >= 70) {
            scoreTextColor = 'text-indigo-300';
            progressColor = 'bg-indigo-500';
        } else if (score >= 55) {
            scoreTextColor = 'text-amber-400';
            progressColor = 'bg-amber-500';
        }

        let rankBadge: string;
        if (isTop1) {
            if (isLowMatch) {
                rankBadge = `<span class="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-bold font-mono flex items-center gap-1.5"><i class="fa-solid fa-compass text-amber-400"></i> LỰA CHỌN GẦN NHẤT</span>`;
            } else {
                rankBadge = `<span class="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold font-mono flex items-center gap-1"><i class="fa-solid fa-crown text-amber-400"></i> TOP 1 KHỚP NHẤT</span>`;
            }
        } else if (rank === 2) {
            rankBadge = `<span class="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 text-xs font-bold font-mono">🥈 TOP 2</span>`;
        } else {
            rankBadge = `<span class="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold font-mono">🥉 TOP 3</span>`;
        }

        const typeBadge = item.type === 'custom'
            ? `<span class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">✨ Font Cá Nhân</span>`
            : `<span class="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">🔤 Font Mẫu Chuẩn</span>`;
        const cardBorder = (isTop1 && !isLowMatch)
            ? 'border-amber-500/40 bg-gradient-to-b from-amber-500/5 via-slate-900 to-slate-900 shadow-xl shadow-amber-500/5'
            : isTop1
                ? 'border-amber-500/20 bg-slate-900 shadow-lg'
                : 'border-slate-800 bg-slate-900';

        const card = document.createElement('div');
        card.className = `${cardBorder} border rounded-2xl p-4 flex flex-col gap-3.5 transition-all`;
        card.innerHTML = `
            <div class="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800/80">
                <div class="flex items-center gap-2">
                    ${rankBadge}
                    <div>
                        <h4 class="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                            <span>${escapeHTML(item.name)}</span>
                            ${typeBadge}
                        </h4>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <div class="flex flex-col items-end">
                        <span class="text-xs font-mono font-bold ${scoreTextColor}">${score}% Tương đồng</span>
                        <div class="w-24 bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800 mt-0.5">
                            <div class="${progressColor} h-full transition-all duration-300" style="width: ${score}%"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Visual Typography Canvas Render Card -->
            <div class="relative group flex justify-center p-2 rounded-xl bg-slate-950 border border-slate-855 overflow-hidden shadow-inner">
                <canvas id="font-preview-canvas-${rank}" class="w-full max-w-full h-auto rounded-lg shadow cursor-pointer transition-transform group-hover:scale-[1.01]"></canvas>
                <div class="absolute bottom-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" data-action="download-sample" class="px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-indigo-600 border border-slate-700 text-white text-[11px] font-bold shadow-lg transition-colors flex items-center gap-1">
                        <i class="fa-solid fa-download"></i> Tải ảnh mẫu
                    </button>
                </div>
            </div>

            <!-- Description & Action Bar -->
            <div class="flex items-center justify-between flex-wrap gap-2 pt-1 text-xs">
                <p class="text-slate-400 text-[11px] max-w-md">${item.desc}</p>
                <div class="flex items-center gap-2">
                    <button type="button" data-action="copy-name" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold border border-slate-700 transition-all flex items-center gap-1.5">
                        <i class="fa-solid fa-copy text-indigo-400"></i> Sao chép tên font
                    </button>
                </div>
            </div>
        `;

        const canvasEl = card.querySelector(`#font-preview-canvas-${rank}`) as HTMLCanvasElement | null;
        if (canvasEl) {
            canvasEl.addEventListener('click', () => openPreviewModal(canvasEl.toDataURL()));
        }

        const btnDownload = card.querySelector('[data-action="download-sample"]');
        if (btnDownload) {
            btnDownload.addEventListener('click', () => downloadFontSampleImage(`font-preview-canvas-${rank}`, item.name));
        }

        const btnCopy = card.querySelector('[data-action="copy-name"]');
        if (btnCopy) {
            btnCopy.addEventListener('click', () => copyFontName(item.name));
        }

        grid.appendChild(card);
    });
}

export async function renderFontVisualCanvas(canvasId: string, fontObj: CustomFontItem): Promise<void> {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas || !fontObj) return;

    const textInput = document.getElementById('fontmatch-live-text') as HTMLTextAreaElement | null;
    const text = textInput ? (textInput.value.trim() || 'Ngươi dám cản đường ta sao?!') : 'Ngươi dám cản đường ta sao?!';

    const fontSize = parseInt((document.getElementById('live-font-size') as HTMLInputElement)?.value || '24', 10);
    const strokeWidth = parseFloat((document.getElementById('live-stroke-width') as HTMLInputElement)?.value || '3');
    const textColor = (document.getElementById('live-text-color') as HTMLInputElement)?.value || '#ffffff';
    const strokeColor = (document.getElementById('live-stroke-color') as HTMLInputElement)?.value || '#000000';
    const isBold = (document.getElementById('live-bold') as HTMLInputElement)?.checked ?? true;
    const isItalic = (document.getElementById('live-italic') as HTMLInputElement)?.checked ?? false;

    const dpr = 2;
    const displayW = 600;
    const displayH = 220;

    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    canvas.style.width = displayW + 'px';
    canvas.style.height = displayH + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const cleanFontName = fontObj.name.replace(/['"]/g, '');
    const fallbackFamily = (fontObj.family && fontObj.family.includes('cursive')) ? 'cursive' : 'sans-serif';
    const fontSpec = `${isBold ? 'bold ' : ''}${isItalic ? 'italic ' : ''}${fontSize}px "${cleanFontName}"`;
    const fontStyleStr = `${isBold ? 'bold ' : ''}${isItalic ? 'italic ' : ''}${fontSize}px "${cleanFontName}", ${fallbackFamily}`;

    try {
        await Promise.race([
            (document as any).fonts.load(fontSpec, text),
            new Promise(resolve => setTimeout(resolve, 250))
        ]);
        await Promise.race([
            (document as any).fonts.ready,
            new Promise(resolve => setTimeout(resolve, 250))
        ]);
    } catch (e) { }

    const bgGrad = ctx.createLinearGradient(0, 0, displayW, displayH);
    bgGrad.addColorStop(0, '#090d16');
    bgGrad.addColorStop(0.5, '#0f172a');
    bgGrad.addColorStop(1, '#0b0f19');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, displayW, displayH);

    const radGlow = ctx.createRadialGradient(displayW / 2, displayH / 2, 10, displayW / 2, displayH / 2, 260);
    radGlow.addColorStop(0, 'rgba(99, 102, 241, 0.12)');
    radGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radGlow;
    ctx.fillRect(0, 0, displayW, displayH);

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(10, 10, displayW - 20, displayH - 20);

    ctx.font = '600 11px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`FONT: ${cleanFontName.toUpperCase()}`, 18, 16);

    ctx.font = fontStyleStr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxWidth = displayW - 70;
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
        const testLine = currentLine ? (currentLine + ' ' + words[i]) : words[i];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = words[i];
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = fontSize * 1.35;
    const startY = (displayH / 2) - ((lines.length - 1) * lineHeight / 2);

    lines.forEach((line, lIdx) => {
        const y = startY + lIdx * lineHeight;
        const x = displayW / 2;

        if (strokeWidth > 0) {
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetY = 2;
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = strokeWidth * 2;
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.strokeText(line, x, y);
            ctx.restore();
        }

        ctx.fillStyle = textColor;
        ctx.fillText(line, x, y);
    });
}

export async function updateAllFontCanvases(): Promise<void> {
    if (!currentTop3Matches || currentTop3Matches.length === 0) return;
    for (let idx = 0; idx < currentTop3Matches.length; idx++) {
        const fontObj = currentTop3Matches[idx];
        const rank = idx + 1;
        await renderFontVisualCanvas(`font-preview-canvas-${rank}`, fontObj);
    }
}

export function onLiveTestTextChange(): void {
    clearTimeout(liveUpdateDebounceTimer);
    liveUpdateDebounceTimer = setTimeout(() => {
        updateAllFontCanvases();
    }, 60);
}

export function setLiveTestText(phrase: string): void {
    const input = document.getElementById('fontmatch-live-text') as HTMLTextAreaElement | null;
    if (input) {
        input.value = phrase;
        updateAllFontCanvases();
    }
}

export function copyFontName(name: string): void {
    navigator.clipboard.writeText(name);
    alert(`Đã sao chép tên phông chữ "${name}" vào khay nhớ tạm!`);
}

export function downloadFontSampleImage(canvasId: string, fontName: string): void {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `MangaFont_${fontName.replace(/\s+/g, '_')}_Preview.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// --- CUSTOM FONT MANAGER (INDEXEDDB PERSISTENCE & DYNAMIC @FONT-FACE) ---
const DB_NAME_FONTS = 'MangaTranslatorDB';
const DB_VERSION_FONTS = 2;
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

export function analyzeFontMorphology(family: string): FontMorphologyResult {
    const cleanFamily = (family || 'Sans').replace(/['",]/g, '').trim();
    const lowerName = cleanFamily.toLowerCase();

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

        return {
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
    }

    try {
        const canvas = document.createElement('canvas');
        const size = 120;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
            ctx.font = `72px "${cleanFamily}", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(glyph, size / 2, size / 2);

            const imgData = ctx.getImageData(0, 0, size, size).data;
            let darkCount = 0;
            let minX = size, maxX = 0, minY = size, maxY = 0;

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const idx = (y * size + x) * 4;
                    const lum = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
                    if (lum < 128) {
                        darkCount++;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            if (darkCount > 15 && maxX >= minX && maxY >= minY) {
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
                ctx.font = `72px "${cleanFamily}", sans-serif`;
                const textMetrics = ctx.measureText('Manga Studio');
                if (textMetrics && typeof textMetrics.width === 'number' && textMetrics.width > 0) {
                    advanceRatio = textMetrics.width / (72 * 12);
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
            ctx.font = `72px "${cleanFamily}", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(stem, size / 2, size / 2);

            const imgData = ctx.getImageData(0, 0, size, size).data;
            const points: { x: number; y: number }[] = [];

            for (let y = 15; y < size - 15; y++) {
                let rowSumX = 0;
                let rowCount = 0;
                for (let x = 0; x < size; x++) {
                    const idx = (y * size + x) * 4;
                    const lum = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
                    if (lum < 128) {
                        rowSumX += x;
                        rowCount++;
                    }
                }
                if (rowCount > 2) {
                    points.push({ x: rowSumX / rowCount, y: y });
                }
            }

            if (points.length > 20) {
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

            if (hRatio > 0.90 && Math.abs(darkRatio - 1.0) < 0.18 && upDark > 20) {
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

        return {
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
    } catch (err) {
        console.warn(`Lỗi phân tích morphology font "${family}":`, err);
        return {
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
    }
}

const PROFILING_GLYPHS = ['M', 'A', 'H', 'O', 'a', 'e', 'g', 'q', '0', '8'];

export function profileFontGlyph(family: string): FontProfile {
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

        return {
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
    }

    try {
        const canvas = document.createElement('canvas');
        const size = 120;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
            ctx.font = `72px "${family}", sans-serif`;
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

            if (darkCount > 15 && maxX >= minX && maxY >= minY) {
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

        return {
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
    } catch (err) {
        console.warn(`Lỗi profiling font "${family}":`, err);
        return {
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
    }
}

// --- CUSTOM FONT STATE & PAGINATION ---
const customFontPageSize = 24;
let customFontCurrentPage = 1;

export function updateCustomFontsBadge(): void {
    const badge = document.getElementById('fontmatch-custom-badge');
    if (badge) badge.innerText = String(customFontsList.length);
}

export async function loadAndRegisterCustomFontsFromDB(): Promise<void> {
    try {
        const db = await openFontsDB();
        const tx = db.transaction(STORE_FONTS_NAME, 'readonly');
        const store = tx.objectStore(STORE_FONTS_NAME);
        const req = store.getAll();
        const entries: any[] = await new Promise((res, rej) => {
            req.onsuccess = () => res(req.result || []);
            req.onerror = (e: any) => rej(e.target.error);
        });

        if (!entries || entries.length === 0) {
            customFontsList = [];
            updateCustomFontsBadge();
            renderCustomFontsUI();
            return;
        }

        const newCustomList: CustomFontItem[] = [];
        const itemsToUpdateDB: any[] = [];

        // 1. Synchronously populate fontBlobUrlsMap and initial metadata for instant access
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
                    // Ensure FontFace is loaded and added to document.fonts before profiling
                    try {
                        if (typeof document !== 'undefined' && item.blob) {
                            const buffer = await item.blob.arrayBuffer();
                            const fontFace = new FontFace(item.family, buffer);
                            await fontFace.load();
                            (document as any).fonts.add(fontFace);
                        }
                    } catch (loadErr) {
                        console.warn(`Font loading prior to profiling failed for "${item.family}":`, loadErr);
                    }
                    profile = profileFontGlyph(item.family);
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

        // 2. Register FontFace objects into document.fonts in background chunks
        (async () => {
            for (const item of entries) {
                if (!item || !item.family || !item.blob) continue;
                try {
                    const buffer = await item.blob.arrayBuffer();
                    const fontFace = new FontFace(item.family, buffer);
                    await fontFace.load();
                    (document as any).fonts.add(fontFace);
                } catch (e) { }
            }
            updateAllFontCanvases();
            updateAllFontSetCanvases();
        })();

        // 3. Cache computed profiles back to IndexedDB asynchronously
        if (itemsToUpdateDB.length > 0) {
            try {
                const writeTx = db.transaction(STORE_FONTS_NAME, 'readwrite');
                const writeStore = writeTx.objectStore(STORE_FONTS_NAME);
                itemsToUpdateDB.forEach(item => writeStore.put(item));
            } catch (cacheErr) {
                console.warn("Lỗi lưu cache profile font vào IndexedDB:", cacheErr);
            }
        }

        // 4. Automatically generate initial Font Set if on Set tab
        if (!currentGeneratedFontSet && customFontsList.length > 0) {
            generateAndDisplayFontSet('romance');
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

    const batchSize = 15;
    let processed = 0;

    for (let i = 0; i < total; i += batchSize) {
        const batch = files.slice(i, i + batchSize);

        for (const file of batch) {
            if (!file || !file.name) continue;
            const cleanName = file.name.replace(/\.[^/.]+$/, '').trim();
            const family = cleanName.replace(/[^a-zA-Z0-9\s_-]/g, ' ').replace(/\s+/g, ' ').trim() || 'CustomFont';

            if (progressSubtext) progressSubtext.innerText = `Đang phân tích hình thái học: ${family}...`;

            try {
                fontBlobUrlsMap.set(family, URL.createObjectURL(file));

                const buffer = await file.arrayBuffer();
                const fontFace = new FontFace(family, buffer);
                await fontFace.load();
                (document as any).fonts.add(fontFace);

                const profile = profileFontGlyph(family);

                const tx = db.transaction(STORE_FONTS_NAME, 'readwrite');
                const store = tx.objectStore(STORE_FONTS_NAME);
                await new Promise((res, rej) => {
                    const putReq = store.put({
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
                    putReq.onsuccess = res;
                    putReq.onerror = rej;
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

                const existingIdx = customFontsList.findIndex(f => f.name === family);
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

        await new Promise(r => setTimeout(r, 10));
    }

    if (progressTitle) progressTitle.innerText = `✅ Hoàn thành phân tích hình thái ${total} font!`;
    setTimeout(() => {
        if (progressBox) progressBox.classList.add('hidden');
    }, 1800);

    updateDynamicFontFaceStyles();
    updateCustomFontsBadge();
    updateCustomFontFilterCountsUI();
    renderCustomFontsUI();
    alert(`🎉 Đã nạp & tự động phân loại hình thái (Weight, Width, Slant, Case) xong ${total} font!`);
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

        if (i % 20 === 0) await new Promise(r => setTimeout(r, 5));
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
    try {
        (document as any).fonts.onloadingdone = () => {
            updateAllFontCanvases();
            updateAllFontSetCanvases();
        };
    } catch (e) { }

    loadAndRegisterCustomFontsFromDB().then(() => {
        generateAndDisplayFontSet('romance');
    });

    const savedKey = localStorage.getItem('gemini_manga_api_key') ||
        localStorage.getItem('gemini_api_key') ||
        localStorage.getItem('manga_gemini_key') || '';
    const keyInput = document.getElementById('fontmatch-api-key') as HTMLInputElement | null;
    if (keyInput && savedKey) {
        keyInput.value = savedKey;
    }

    updateFontMatchModelDropdown(cachedGeminiModels);

    if (savedKey) {
        fetchFontMatchModels(false);
    }

    if (keyInput) {
        keyInput.addEventListener('input', (e: Event) => {
            const target = e.target as HTMLInputElement;
            const k = target.value.trim();
            safeSetLocalStorage('gemini_manga_api_key', k);
            safeSetLocalStorage('gemini_api_key', k);
            safeSetLocalStorage('manga_gemini_key', k);
        });
    }

    // Genre Presets Select Listener
    const genreSelect = document.getElementById('fontset-genre-select') as HTMLSelectElement | null;
    if (genreSelect) {
        genreSelect.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLSelectElement;
            generateAndDisplayFontSet(target.value as GenrePresetId);
        });
    }

    // Genre Sample Files Upload
    const genreSampleInput = document.getElementById('genre-sample-files-input') as HTMLInputElement | null;
    if (genreSampleInput) {
        genreSampleInput.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.files && target.files.length > 0) {
                handleGenreSampleImageSelect(Array.from(target.files));
            }
        });
    }

    // Genre Sample Dropzone Drag & Drop
    const genreDropzone = document.getElementById('genre-sample-dropzone');
    if (genreDropzone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            genreDropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                genreDropzone.classList.add('border-indigo-500', 'bg-indigo-500/10');
            }, false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            genreDropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                genreDropzone.classList.remove('border-indigo-500', 'bg-indigo-500/10');
            }, false);
        });
        genreDropzone.addEventListener('drop', (e) => {
            const dt = (e as DragEvent).dataTransfer;
            if (dt && dt.files && dt.files.length > 0) {
                const imgFiles = Array.from(dt.files).filter(f => f.type.startsWith('image/'));
                if (imgFiles.length > 0) {
                    handleGenreSampleImageSelect(imgFiles);
                }
            }
        });
    }

    window.addEventListener('paste', (e: ClipboardEvent) => {
        const secFont = document.getElementById('sec-fontmatch');
        if (!secFont || secFont.classList.contains('hidden')) return;

        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    const activeSubTab = document.querySelector('#fontmatch-panel-set:not(.hidden)');
                    if (activeSubTab) {
                        handleGenreSampleImageSelect([blob]);
                    } else {
                        handleFontMatchImageSelect(blob);
                    }
                    break;
                }
            }
        }
    });

    const fontMatchInput = document.getElementById('fontmatch-file-input');
    if (fontMatchInput) {
        fontMatchInput.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.files && target.files[0]) {
                handleFontMatchImageSelect(target.files[0]);
            }
        });
    }

    const customFontInput = document.getElementById('fontmatch-custom-files');
    if (customFontInput) {
        customFontInput.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.files && target.files.length > 0) {
                handleCustomFontUpload(Array.from(target.files));
            }
        });
    }
}
