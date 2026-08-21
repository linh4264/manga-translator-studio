// Global constants and configuration for Manga Translator Studio
import { BlockStyle } from '../types/index';

export const DEFAULT_PIPELINE_MODE = "two-step"; // 'two-step' | 'single-step'
export const DEFAULT_MODEL = "gemini-2.5-flash";
export const DEFAULT_OCR_MODEL = "gemini-2.5-flash";
export const DEFAULT_TRANSLATION_MODEL = "gemini-2.5-pro";
export const DEFAULT_INPAINT_METHOD = "patchmatch";
export const CUSTOM_MODEL_VALUE = "__custom__";
export const VALID_MODEL_IDS: string[] = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
    "gemini-3.1-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-1.5-flash",
    "gemini-1.5-pro"
];

export const VALID_OCR_MODEL_IDS: string[] = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-1.5-flash"
];

export const VALID_TRANSLATION_MODEL_IDS: string[] = [
    "gemini-2.5-pro",
    "gemini-1.5-pro",
    "gemini-2.5-flash",
    "gemini-3.1-pro-preview"
];

export const TARGET_LANG_MAP: Record<string, string> = {
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

// =========================================================================
// 🏛️ 3-TIER COMIC UNIVERSE, GENRE & TONE MATRIX
// =========================================================================

// TIER 1: COMIC UNIVERSE & PUBLICATION TRADITION
export const COMIC_UNIVERSE_PRESETS: Record<string, { id: string; label: string; prompt: string }> = {
    auto: {
        id: 'auto',
        label: '🌐 Tự động theo nguồn',
        prompt: '- COMIC UNIVERSE: Auto-detect and align with the cultural storytelling rhythm and dialogue conventions of the source comic origin.'
    },
    manga: {
        id: 'manga',
        label: '🇯🇵 Japanese Manga',
        prompt: '- COMIC UNIVERSE (JAPANESE MANGA SCANLATION): Follow authentic Japanese manga scanlation standards. Honorifics (-san, -kun, -chan, -sama, -senpai) and emotional particles (ne, yo, wa, zo) should be adapted with rich cultural fidelity. Balance inner monologue depth with punchy bubble dialogue.'
    },
    manhwa: {
        id: 'manhwa',
        label: '🇰🇷 Korean Manhwa / Webtoon',
        prompt: '- COMIC UNIVERSE (KOREAN MANHWA / WEBTOON): Embrace vertical webtoon pacing and sharp dramatic beats. Strictly distinguish between Formal/Honorific speech (존댓말 - dạ, vâng, ạ) and Casual/Informal speech (반말 - mày-tao, cậu-tớ, anh-em). Incorporate natural modern webtoon expressions (Sunbae, Hubae, Oppa, Hyung, Unnie, Noona, Daebak, Heol).'
    },
    manhua: {
        id: 'manhua',
        label: '🇨🇳 Chinese Manhua',
        prompt: '- COMIC UNIVERSE (CHINESE MANHUA): Use rich, elegant Sino-Vietnamese (Hán-Việt) phrasing where appropriate. Maintain proper martial/sect hierarchy (Bổn tọa, Lão phu, Tại hạ, Sư huynh, Sư muội, Tiền bối, Đạo hữu) and preserve 4-character idiom cadence smoothly.'
    },
    us_comic: {
        id: 'us_comic',
        label: '🇺🇸 US Comics & Graphic Novels',
        prompt: '- COMIC UNIVERSE (AMERICAN COMICS & GRAPHIC NOVELS): Fast-paced, punchy, gritty dialogue. Eliminate rigid, textbook "I/You" translations—infer dynamic, context-driven relationships (partner, nemesis, buddy, boss). Capture classic comic banter, snappy quips, and visceral action beats.'
    },
    franco_belgian: {
        id: 'franco_belgian',
        label: '🇫🇷🇧🇪 Franco-Belgian Bandes Dessinées (BD)',
        prompt: '- COMIC UNIVERSE (FRANCO-BELGIAN BD / LIGNE CLAIRE): Literary, refined, and articulate dialogue. Preserve philosophical undertones, witty wordplay, and classical European adventurous charm without sounding stilted.'
    }
};

// TIER 2: WORLD SETTING & CORE GENRE (MULTI-SELECTABLE TAGS)
export const COMIC_GENRE_PRESETS: Record<string, { id: string; label: string; prompt: string }> = {
    action: {
        id: 'action',
        label: 'Action',
        prompt: '- GENRE (ACTION): Deliver high-octane, intense, and dynamic combat dialogue. Keep battle commands, martial art techniques, tactical shouts, and combat banter ferocious, sharp, and punchy. Avoid sluggish or overly verbose phrasing in fast-paced action sequences; match the urgency and adrenaline of the battlefield.'
    },
    adventure: {
        id: 'adventure',
        label: 'Adventure',
        prompt: '- GENRE (ADVENTURE): Capture the spirit of discovery, exploration, and camaraderie. Accurately translate expedition terminology, guild quests, geographical lore, survival challenges, and travel banter. Maintain vivid atmosphere when encountering ancient ruins, treacherous wilderness, and unknown civilizations.'
    },
    comedy: {
        id: 'comedy',
        label: 'Comedy',
        prompt: '- GENRE (COMEDY): Sharp comedic timing, witty punchlines, situational banter, tsukkomi/boke (straight-man / funny-man) dynamics, and clever culturally localized humor. Keep puns, exaggerated reactions, and funny internal monologues lively and punchy without distorting the underlying context.'
    },
    crime: {
        id: 'crime',
        label: 'Crime',
        prompt: '- GENRE (CRIME): Authentic criminal underworld jargon, syndicate hierarchies, law enforcement protocols, and intense interrogation dialogues. Strictly distinguish between professional investigative terminology and street-level criminal slang with gritty realism and suspense.'
    },
    drama: {
        id: 'drama',
        label: 'Drama',
        prompt: '- GENRE (DRAMA): Deeply emotional, nuanced, and mature character interactions. Preserve psychological subtext, dramatic tension, moral dilemmas, and interpersonal vulnerability. Ensure dialogue feels weighty, poignant, and grounded in authentic human emotions.'
    },
    fantasy: {
        id: 'fantasy',
        label: 'Fantasy',
        prompt: '- GENRE (FANTASY): Authoritative high-fantasy worldbuilding, magic circles, spell chants, ancient lore, racial/class hierarchies, and mythical beast terminology. Translate incantations, artifacts, and noble titles with grand, majestic flair.'
    },
    girls_love: {
        id: 'girls_love',
        label: "Girls' Love",
        prompt: "- GENRE (GIRLS' LOVE / YURI): Tender, delicate, and deeply expressive emotional chemistry between female leads. Capture subtle romantic tension, heartfelt confessions, bashful intimacy, and gentle conversational cadence (cậu-tớ, em-chị, mình-bạn) with emotional warmth."
    },
    historical: {
        id: 'historical',
        label: 'Historical',
        prompt: '- GENRE (HISTORICAL): Period-accurate decorum, aristocratic court etiquette, archaic honorifics, and traditional cultural idioms. Employ dignified, classical phrasing and accurate historical hierarchy appropriate for the era and royal court.'
    },
    horror: {
        id: 'horror',
        label: 'Horror',
        prompt: '- GENRE (HORROR): Chilling, eerie, and visceral dialogue evoking dread, visceral fear, and sheer desperation. Heighten claustrophobic panic, distorted mutterings, survival urgency, and grim occult atmosphere.'
    },
    isekai: {
        id: 'isekai',
        label: 'Isekai',
        prompt: '- GENRE (ISEKAI / TRANSMIGRATION): Seamless balance between modern reincarnator inner monologues and native otherworld conventions. Accurately translate status screens, skill appraisals, level notifications, and cheat abilities.'
    },
    magical_girls: {
        id: 'magical_girls',
        label: 'Magical Girls',
        prompt: '- GENRE (MAGICAL GIRLS / MAHOU SHOUJO): Radiant transformation slogans, energetic incantations, mascot companion banter, and heartfelt themes of hope, friendship, and justice. Balance bright sparkle with emotional combat stakes.'
    },
    mecha: {
        id: 'mecha',
        label: 'Mecha',
        prompt: '- GENRE (MECHA): Precise military engineering jargon, cockpit telemetry, weapon firing sequences, synchronized pilot commands, and heavy tactical warfare dialogue. Keep combat alerts crisp and mechanical.'
    },
    medical: {
        id: 'medical',
        label: 'Medical',
        prompt: '- GENRE (MEDICAL): Accurate clinical terms, surgical procedures, pharmacological data, diagnosis debates, and hospital hierarchy. Ensure medical terminology is authentic while remaining natural and urgent during emergency scenes.'
    },
    mystery: {
        id: 'mystery',
        label: 'Mystery',
        prompt: '- GENRE (MYSTERY & DETECTIVE): Sharp deductive reasoning, analytical case breakdowns, forensic clues, alibi interrogations, and suspenseful plot reveals. Preserve logical clarity and thrilling intellectual tension.'
    },
    philosophical: {
        id: 'philosophical',
        label: 'Philosophical',
        prompt: '- GENRE (PHILOSOPHICAL): Deep existential reflections, ethical inquiries, profound metaphors, and contemplative worldview dialogues. Ensure nuanced philosophical treatises and abstract concepts read fluently, poetically, and thought-provokingly.'
    },
    psychological: {
        id: 'psychological',
        label: 'Psychological',
        prompt: '- GENRE (PSYCHOLOGICAL): High-stakes mind games, gaslighting, subconscious unraveling, paranoid inner monologues, and intense mental manipulation. Capture sharp psychological tension and fragile mental states.'
    },
    romance: {
        id: 'romance',
        label: 'Romance',
        prompt: '- GENRE (ROMANCE): Heartfelt, tender, and deeply emotional romantic dialogue. Naturally adapt romantic pronouns (anh-em, cậu-tớ) based on relationship progression, subtle blushing subtext, and romantic chemistry.'
    },
    scifi: {
        id: 'scifi',
        label: 'Sci-Fi',
        prompt: '- GENRE (SCI-FI & CYBERPUNK): Futuristic technology jargon, artificial intelligence synthesis, space travel physics, cybernetics, and dystopian socio-tech vocabulary. Keep futuristic terminology sharp and cohesive.'
    },
    slice_of_life: {
        id: 'slice_of_life',
        label: 'Slice of Life',
        prompt: '- GENRE (SLICE OF LIFE): Warm, natural, and everyday conversational flow. Reflect relaxed daily routines, heartwarming interpersonal moments, cozy humor, and gentle slice-of-life charm.'
    },
    sports: {
        id: 'sports',
        label: 'Sports',
        prompt: '- GENRE (SPORTS): Passionate, fiery athletic commentary, tactical playbook calls, coach strategies, competitive rivalries, and adrenaline-fueled team spirit. Keep match momentum electric and authentic.'
    },
    superhero: {
        id: 'superhero',
        label: 'Superhero',
        prompt: '- GENRE (SUPERHERO): Iconic hero vs villain confrontations, secret identity banter, signature power names, public distress calls, and moral duty speeches. Balance dramatic heroism with snappy, comic-book quips.'
    },
    thriller: {
        id: 'thriller',
        label: 'Thriller',
        prompt: '- GENRE (THRILLER): Relentless suspense, ticking-clock urgency, high-stakes conspiracies, pulse-pounding chase sequences, and nail-biting confrontations. Keep sentence pacing rapid and suspenseful.'
    },
    tragedy: {
        id: 'tragedy',
        label: 'Tragedy',
        prompt: '- GENRE (TRAGEDY): Deeply sorrowful, heartbreaking, and poignant emotional weight. Capture agonizing loss, bitter regret, hopeless sacrifices, and melancholic reflections with raw, moving literary power.'
    },
    wuxia: {
        id: 'wuxia',
        label: 'Wuxia',
        prompt: '- GENRE (WUXIA / XIANXIA): Rich Sino-Vietnamese (Hán-Việt) terminology, martial sect etiquette, internal cultivation stages, Daoist philosophy, martial art moves, and chivalric Jianghu honor codes (Tại hạ, Bổn tọa, Các hạ, Tiền bối, Đạo hữu).'
    }
};

// TIER 3: NARRATIVE TONE & SLANG FLAVOR
export const COMIC_TONE_PRESETS: Record<string, { id: string; label: string; prompt: string }> = {
    classic: {
        id: 'classic',
        label: '✨ Chuẩn mực Scanlation',
        prompt: '- NARRATIVE TONE (CLASSIC SCANLATION): Elegant, faithful, and beautifully localized dialogue. Balance fidelity with natural Vietnamese flow.'
    },
    comedy: {
        id: 'comedy',
        label: '🤣 Hài hước / Meme / Cà khịa',
        prompt: '- NARRATIVE TONE (COMEDY & GAG): Sharp comedic timing, witty punchlines, and clever localized internet slang/memes. Make it hilarious without losing context.'
    },
    dark: {
        id: 'dark',
        label: '🖤 U tối / Khắc nghiệt',
        prompt: '- NARRATIVE TONE (DARK & GRITTY): Raw, heavy, and cynical tone. Heighten despair, ruthless sarcasm, and uncompromising realism.'
    },
    poetic: {
        id: 'poetic',
        label: '🍃 Chữa lành / Thơ mộng',
        prompt: '- NARRATIVE TONE (IYASHIKEI / POETIC): Gentle, soothing, contemplative, and warm. Soft cadence that evokes comfort and emotional peace.'
    }
};

// Backward-compatibility alias map
export const TRANSLATION_GENRE_PRESETS: Record<string, string> = {
    quality: COMIC_TONE_PRESETS.classic.prompt,
    comedy: COMIC_TONE_PRESETS.comedy.prompt,
    action: COMIC_GENRE_PRESETS.action.prompt,
    adventure: COMIC_GENRE_PRESETS.adventure.prompt,
    crime: COMIC_GENRE_PRESETS.crime.prompt,
    drama: COMIC_GENRE_PRESETS.drama.prompt,
    fantasy: COMIC_GENRE_PRESETS.fantasy.prompt,
    girls_love: COMIC_GENRE_PRESETS.girls_love.prompt,
    historical: COMIC_GENRE_PRESETS.historical.prompt,
    horror: COMIC_GENRE_PRESETS.horror.prompt,
    isekai: COMIC_GENRE_PRESETS.isekai.prompt,
    magical_girls: COMIC_GENRE_PRESETS.magical_girls.prompt,
    mecha: COMIC_GENRE_PRESETS.mecha.prompt,
    medical: COMIC_GENRE_PRESETS.medical.prompt,
    mystery: COMIC_GENRE_PRESETS.mystery.prompt,
    philosophical: COMIC_GENRE_PRESETS.philosophical.prompt,
    psychological: COMIC_GENRE_PRESETS.psychological.prompt,
    romance: COMIC_GENRE_PRESETS.romance.prompt,
    scifi: COMIC_GENRE_PRESETS.scifi.prompt,
    slice_of_life: COMIC_GENRE_PRESETS.slice_of_life.prompt,
    sports: COMIC_GENRE_PRESETS.sports.prompt,
    superhero: COMIC_GENRE_PRESETS.superhero.prompt,
    thriller: COMIC_GENRE_PRESETS.thriller.prompt,
    tragedy: COMIC_GENRE_PRESETS.tragedy.prompt,
    wuxia: COMIC_GENRE_PRESETS.wuxia.prompt
};

export const DEFAULT_VERTICAL_WRITING_MODE = false;
export const DEFAULT_BLOCK_SIZE_PX = 400;
export const DEFAULT_SFX_BLOCK_SIZE_PX = 200;
export const DEFAULT_AI_BLOCK_BOX = { x: 30, y: 30, w: 40, h: 40 };
export const MAX_HISTORY_LIMIT = 30;

export const DEFAULT_TYPE_FONTS: Record<string, string> = {
    dialogue: 'font-manga',
    narration: 'font-vietnamese',
    thought: 'font-comicneue',
    sfx: 'font-impact'
};

export const DEFAULT_BLOCK_STYLE: BlockStyle = {
    fontFamily: 'font-manga',
    fontSize: 13,
    lineHeight: 1.15,
    letterSpacing: 0,
    textTransform: 'none',
    bold: false,
    italic: false,
    underline: false,
    textColor: '#000000',
    textColorHex: '#000000',
    bgColor: '#ffffff',
    bgColorHex: '#FFFFFF',
    bgOpacity: 100,
    padding: 4,
    rotate: 0,
    vertical: false,
    align: 'center',
    maskShape: 'bubble-fit',
    maskSize: 'full',
    strokeColor: '#ffffff',
    strokeColorHex: '#FFFFFF',
    strokeWidth: 0,
    strokeColor2: '#000000',
    strokeColor2Hex: '#000000',
    strokeWidth2: 0,
    shadowColor: '#000000',
    shadowColorHex: '#000000',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    arcAngle: 0,
    skewX: 0,
    skewY: 0,
    warpWave: 0,
    warpBulge: 0,
    diamondWrap: false
};

export const PRO_STYLE_PRESETS: Record<string, any> = {
    dialogue: {
        id: 'dialogue',
        name: 'Hội thoại chuẩn',
        desc: 'Nunito Bold • Nền trắng',
        icon: '💬',
        style: {
            fontFamily: 'font-manga',
            bold: true,
            italic: false,
            underline: false,
            textTransform: 'none',
            lineHeight: 1.15,
            letterSpacing: 0,
            textColor: '#000000',
            bgColor: '#ffffff',
            bgOpacity: 100,
            strokeWidth: 0,
            strokeWidth2: 0,
            shadowBlur: 0,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            maskShape: 'bubble-fit',
            align: 'center'
        }
    },
    monologue: {
        id: 'monologue',
        name: 'Nội tâm / Suy nghĩ',
        desc: 'Nghiêng • Line 1.2 • Khung mờ',
        icon: '💭',
        style: {
            fontFamily: 'font-vietnamese',
            bold: false,
            italic: true,
            underline: false,
            textTransform: 'none',
            lineHeight: 1.22,
            letterSpacing: 0.2,
            textColor: '#1e293b',
            bgColor: '#f8fafc',
            bgOpacity: 90,
            strokeWidth: 0,
            strokeWidth2: 0,
            shadowBlur: 0,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            maskShape: 'bubble-fit',
            align: 'center'
        }
    },
    narration: {
        id: 'narration',
        name: 'Dẫn chuyện / Khung',
        desc: 'Be Vietnam • Căn trái',
        icon: '📜',
        style: {
            fontFamily: 'font-vietnamese',
            bold: false,
            italic: false,
            underline: false,
            textTransform: 'none',
            lineHeight: 1.28,
            letterSpacing: 0,
            textColor: '#0f172a',
            bgColor: '#ffffff',
            bgOpacity: 98,
            padding: 6,
            strokeWidth: 0,
            strokeWidth2: 0,
            shadowBlur: 0,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            maskShape: 'rect',
            align: 'left'
        }
    },
    scream: {
        id: 'scream',
        name: 'Hét lớn / Tác động',
        desc: 'Bangers • Viền 4px • Đổ bóng',
        icon: '💥',
        style: {
            fontFamily: 'font-impact',
            bold: true,
            italic: false,
            underline: false,
            textTransform: 'uppercase',
            lineHeight: 1.08,
            letterSpacing: 1,
            textColor: '#ffffff',
            bgColor: '#000000',
            bgOpacity: 0,
            strokeColor: '#000000',
            strokeWidth: 4,
            strokeColor2: '#ff0000',
            strokeWidth2: 1.5,
            shadowColor: '#000000',
            shadowBlur: 3,
            shadowOffsetX: 2,
            shadowOffsetY: 2,
            maskShape: 'none',
            align: 'center'
        }
    },
    magic: {
        id: 'magic',
        name: 'Tuyệt chiêu / Neon',
        desc: 'Chakra • Cyan Neon Glow',
        icon: '⚡',
        style: {
            fontFamily: 'font-tech',
            bold: true,
            italic: false,
            underline: false,
            textTransform: 'uppercase',
            lineHeight: 1.1,
            letterSpacing: 1.5,
            textColor: '#38bdf8',
            bgColor: '#000000',
            bgOpacity: 0,
            strokeColor: '#ffffff',
            strokeWidth: 2,
            strokeColor2: '#0284c7',
            strokeWidth2: 4,
            shadowColor: '#0284c7',
            shadowBlur: 8,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            maskShape: 'none',
            align: 'center'
        }
    },
    horror: {
        id: 'horror',
        name: 'Kinh dị / U ám',
        desc: 'Marker • Đỏ sẫm • Viền đen',
        icon: '👻',
        style: {
            fontFamily: 'font-marker',
            bold: true,
            italic: true,
            underline: false,
            textTransform: 'none',
            lineHeight: 1.12,
            letterSpacing: 0.5,
            textColor: '#ef4444',
            bgColor: '#000000',
            bgOpacity: 0,
            strokeColor: '#000000',
            strokeWidth: 3,
            strokeColor2: '#450a0a',
            strokeWidth2: 2,
            shadowColor: '#000000',
            shadowBlur: 5,
            shadowOffsetX: 1,
            shadowOffsetY: 2,
            maskShape: 'none',
            align: 'center'
        }
    },
    whisper: {
        id: 'whisper',
        name: 'Thầm thì / Lẩm bẩm',
        desc: 'Caveat • Mờ 65% • Chữ xám',
        icon: '🤫',
        style: {
            fontFamily: 'font-caveat',
            bold: false,
            italic: false,
            underline: false,
            textTransform: 'none',
            lineHeight: 1.15,
            letterSpacing: -0.5,
            textColor: '#475569',
            bgColor: '#ffffff',
            bgOpacity: 65,
            strokeWidth: 0,
            strokeWidth2: 0,
            shadowBlur: 0,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            maskShape: 'ellipse',
            align: 'center'
        }
    },
    system: {
        id: 'system',
        name: 'Hệ thống / RPG',
        desc: 'Tech • Xanh Neon • Nền tối',
        icon: '📱',
        style: {
            fontFamily: 'font-tech',
            bold: true,
            italic: false,
            underline: false,
            textTransform: 'none',
            lineHeight: 1.25,
            letterSpacing: 0.5,
            textColor: '#4ade80',
            bgColor: '#020617',
            bgOpacity: 92,
            padding: 8,
            strokeWidth: 0,
            strokeWidth2: 0,
            shadowColor: '#22c55e',
            shadowBlur: 4,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            maskShape: 'rounded',
            align: 'left'
        }
    },
    shojo: {
        id: 'shojo',
        name: 'Lãng mạn / Shojo',
        desc: 'Comic Neue • Tím phấn dịu',
        icon: '🌸',
        style: {
            fontFamily: 'font-comicneue',
            bold: true,
            italic: false,
            underline: false,
            textTransform: 'none',
            lineHeight: 1.18,
            letterSpacing: 0.5,
            textColor: '#d946ef',
            bgColor: '#ffffff',
            bgOpacity: 95,
            strokeColor: '#ffffff',
            strokeWidth: 1.5,
            strokeWidth2: 0,
            shadowColor: '#f472b6',
            shadowBlur: 4,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            maskShape: 'bubble-fit',
            align: 'center'
        }
    },
    transparent_sfx: {
        id: 'transparent_sfx',
        name: 'SFX Trong suốt',
        desc: 'Nền 0% • Viền sắc nét 3.5px',
        icon: '🎨',
        style: {
            fontFamily: 'font-impact',
            bold: true,
            italic: false,
            underline: false,
            textTransform: 'uppercase',
            lineHeight: 1.1,
            letterSpacing: 0.5,
            textColor: '#ffffff',
            bgColor: '#ffffff',
            bgOpacity: 0,
            strokeColor: '#000000',
            strokeWidth: 3.5,
            strokeWidth2: 0,
            shadowBlur: 0,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            maskShape: 'none',
            align: 'center'
        }
    },
    sfx_boom: {
        id: 'sfx_boom',
        name: '💥 BÙM! (Nổ / Tác động mạnh)',
        desc: 'Gradient Lửa • Viền đen 4px • Phồng 25%',
        icon: '💥',
        sfxText: 'BÙM!!',
        style: {
            fontFamily: 'font-impact',
            bold: true,
            italic: false,
            underline: false,
            textTransform: 'uppercase',
            lineHeight: 1.05,
            letterSpacing: 1,
            textColor: '#ffffff',
            bgColor: '#000000',
            bgOpacity: 0,
            strokeColor: '#000000',
            strokeWidth: 4,
            strokeColor2: '#f59e0b',
            strokeWidth2: 2,
            gradientEnabled: true,
            gradientAngle: 90,
            gradientColorStart: '#ff416c',
            gradientColorEnd: '#ff4b2b',
            warpBulge: 25,
            maskShape: 'none',
            align: 'center'
        }
    },
    sfx_slash: {
        id: 'sfx_slash',
        name: '⚡ XOẸT! (Nhát chém / Kiếm khí)',
        desc: 'Gradient Cyan • Nghiêng Skew • Viền xanh',
        icon: '⚡',
        sfxText: 'XOẸT!!',
        style: {
            fontFamily: 'font-tech',
            bold: true,
            italic: false,
            underline: false,
            textTransform: 'uppercase',
            lineHeight: 1.05,
            letterSpacing: 2,
            textColor: '#38bdf8',
            bgColor: '#000000',
            bgOpacity: 0,
            strokeColor: '#ffffff',
            strokeWidth: 3,
            strokeColor2: '#0284c7',
            strokeWidth2: 2,
            gradientEnabled: true,
            gradientAngle: 45,
            gradientColorStart: '#00c6ff',
            gradientColorEnd: '#0072ff',
            skewX: 15,
            skewY: -5,
            maskShape: 'none',
            align: 'center'
        }
    },
    sfx_clash: {
        id: 'sfx_clash',
        name: '🔔 KENG! (Va chạm kim loại)',
        desc: 'Gradient Vàng • Uốn vòng cung Arc 15°',
        icon: '🔔',
        sfxText: 'KENG!!',
        style: {
            fontFamily: 'font-marker',
            bold: true,
            italic: false,
            underline: false,
            textTransform: 'uppercase',
            lineHeight: 1.08,
            letterSpacing: 1,
            textColor: '#fef08a',
            bgColor: '#000000',
            bgOpacity: 0,
            strokeColor: '#000000',
            strokeWidth: 4,
            strokeColor2: '#d97706',
            strokeWidth2: 1.5,
            gradientEnabled: true,
            gradientAngle: 90,
            gradientColorStart: '#f5af19',
            gradientColorEnd: '#f12711',
            arcAngle: 15,
            maskShape: 'none',
            align: 'center'
        }
    },
    sfx_whoosh: {
        id: 'sfx_whoosh',
        name: '💨 VÚT! (Tốc độ / Lướt gió)',
        desc: 'Lượn sóng Wave • Xanh Neon • Caveat',
        icon: '💨',
        sfxText: 'VÚT...',
        style: {
            fontFamily: 'font-caveat',
            bold: true,
            italic: true,
            underline: false,
            textTransform: 'none',
            lineHeight: 1.1,
            letterSpacing: 0,
            textColor: '#6ee7b7',
            bgColor: '#000000',
            bgOpacity: 0,
            strokeColor: '#ffffff',
            strokeWidth: 2.5,
            gradientEnabled: true,
            gradientAngle: 90,
            gradientColorStart: '#a8ff78',
            gradientColorEnd: '#78ffd6',
            warpWave: 22,
            maskShape: 'none',
            align: 'center'
        }
    },
    sfx_crack: {
        id: 'sfx_crack',
        name: '🩸 RẮC! (Gãy vỡ / Đau đớn)',
        desc: 'Đỏ máu • Bungee font • Viền đỏ sẫm',
        icon: '🩸',
        sfxText: 'RẮC!!',
        style: {
            fontFamily: 'font-bungee',
            bold: true,
            italic: false,
            underline: false,
            textTransform: 'uppercase',
            lineHeight: 1.1,
            letterSpacing: 1,
            textColor: '#b91c1c',
            bgColor: '#000000',
            bgOpacity: 0,
            strokeColor: '#ffffff',
            strokeWidth: 3.5,
            strokeColor2: '#450a0a',
            strokeWidth2: 2,
            maskShape: 'none',
            align: 'center'
        }
    },
    sfx_heartbeat: {
        id: 'sfx_heartbeat',
        name: '💓 THÌNH THỊCH (Hồi hộp / Trái tim)',
        desc: 'Hồng đậm • Viền trắng • Lượn sóng nhẹ',
        icon: '💓',
        sfxText: 'Thình thịch...',
        style: {
            fontFamily: 'font-condensed',
            bold: true,
            italic: true,
            underline: false,
            textTransform: 'none',
            lineHeight: 1.15,
            letterSpacing: 0.5,
            textColor: '#e11d48',
            bgColor: '#ffffff',
            bgOpacity: 0,
            strokeColor: '#ffffff',
            strokeWidth: 2,
            warpWave: 12,
            maskShape: 'none',
            align: 'center'
        }
    }
};
