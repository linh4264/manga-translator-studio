// Global constants and configuration for Manga Translator Studio

export const DEFAULT_PIPELINE_MODE = "two-step"; // 'two-step' | 'single-step'
export const DEFAULT_MODEL = "gemini-2.5-flash";
export const DEFAULT_OCR_MODEL = "gemini-2.5-flash";
export const DEFAULT_TRANSLATION_MODEL = "gemini-2.5-pro";
export const CUSTOM_MODEL_VALUE = "__custom__";
export const VALID_MODEL_IDS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
    "gemini-3.1-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-1.5-flash",
    "gemini-1.5-pro"
];

export const VALID_OCR_MODEL_IDS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-1.5-flash"
];

export const VALID_TRANSLATION_MODEL_IDS = [
    "gemini-2.5-pro",
    "gemini-1.5-pro",
    "gemini-2.5-flash",
    "gemini-3.1-pro-preview"
];

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

// =========================================================================
// 🏛️ 3-TIER COMIC UNIVERSE, GENRE & TONE MATRIX
// =========================================================================

// TIER 1: COMIC UNIVERSE & PUBLICATION TRADITION
export const COMIC_UNIVERSE_PRESETS = {
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
export const COMIC_GENRE_PRESETS = {
    isekai: {
        id: 'isekai',
        label: '🌀 Isekai / Chuyển sinh / Trọng sinh',
        prompt: '- GENRE (ISEKAI / REINCARNATION / TRANSMIGRATION): Handle past-life vs new-world identity dynamics naturally. Adapt system prompts, status windows, cheat skills, and reincarnator inner knowledge seamlessly.'
    },
    fantasy: {
        id: 'fantasy',
        label: '🏰 Fantasy / Ma thuật / Thần thoại',
        prompt: '- GENRE (FANTASY & MAGIC): Maintain consistent, authoritative fantasy worldbuilding terms, spell names, artifact ranks, and magical creature lore. Translate incantations and battle cries with majestic flair.'
    },
    action: {
        id: 'action',
        label: '⚔️ Action / Shounen / Võ thuật',
        prompt: '- GENRE (ACTION & MARTIAL ARTS): Deliver fast-paced, high-octane dialogue. Keep battle commands and combat banter ferocious, sharp, and impactful.'
    },
    comedy: {
        id: 'comedy',
        label: '🤣 Comedy / Hài hước / Parody',
        prompt: '- GENRE (COMEDY & GAG): Sharp comedic timing, witty punchlines, tsukkomi/boke dynamic, and clever situational banter.'
    },
    romance: {
        id: 'romance',
        label: '🌸 Romance / Tình cảm / Harem',
        prompt: '- GENRE (ROMANCE & HAREM): Delicate, heartfelt, and emotionally expressive phrasing (cậu-tớ, anh-em). Capture subtle romantic tension, bashfulness, and romantic chemistry.'
    },
    school: {
        id: 'school',
        label: '🏫 Học đường / Đời thường (Slice of Life)',
        prompt: '- GENRE (SCHOOL & SLICE OF LIFE): Youthful, authentic student conversations, club activities, and friendly casual teasing.'
    },
    monsters: {
        id: 'monsters',
        label: '🐉 Quái vật / Hầm ngục / Thợ săn',
        prompt: '- GENRE (MONSTERS / DUNGEON / HUNTER): Standardize dungeon ranks (Rank S, A, B...), boss monster species, loot drops, and hunter guild terminology.'
    },
    system: {
        id: 'system',
        label: '📈 Hệ thống / Level-Up / Game thủ',
        prompt: '- GENRE (SYSTEM & LEVEL-UP): Clean, clear system notifications, stat screens, quest rewards, and leveling terminology.'
    },
    revenge: {
        id: 'revenge',
        label: '👑 Báo thù / Zamaa / Trục xuất / Ác nữ',
        prompt: '- GENRE (REVENGE / ZAMAA / VILLAINESS / EXPULSION): Sharp cathartic satisfaction (Zamaa), scheming arrogance of villains, and ruthless vindication of the protagonist.'
    },
    horror: {
        id: 'horror',
        label: '🩸 Kinh dị / Sinh tồn / U tối',
        prompt: '- GENRE (HORROR & SURVIVAL): Tense, chilling, and desperate dialogue. Heighten panic, dread, and grim survival stakes.'
    },
    scifi: {
        id: 'scifi',
        label: '🚀 Sci-Fi / Cyberpunk / Mecha',
        prompt: '- GENRE (SCI-FI & CYBERPUNK): Futuristic jargon, cybernetic terminology, AI voices, and sleek tech lingo.'
    },
    cultivation: {
        id: 'cultivation',
        label: '🏛️ Tiên hiệp / Tu chân / Cổ trang',
        prompt: '- GENRE (CULTIVATION & WUXIA): Proper Sino-Vietnamese (Hán-Việt) terms, martial sect titles (Bổn tọa, Huynh đệ, Tiền bối, Đạo hữu), and cultivation realm ranks.'
    },
    urban: {
        id: 'urban',
        label: '💼 Đô thị / Công sở / Tài phiệt',
        prompt: '- GENRE (URBAN & CORPORATE DRAMA): Realistic social hierarchy, business diplomacy, and sharp workplace dialogue.'
    },
    adventure: {
        id: 'adventure',
        label: '🧭 Phiêu lưu / Khám phá',
        prompt: '- GENRE (ADVENTURE & EXPLORATION): High spirits of discovery, travel banter, uncharted territory excitement, and guild quests.'
    },
    mystery: {
        id: 'mystery',
        label: '🔍 Trinh thám / Tâm lý / Noir',
        prompt: '- GENRE (MYSTERY & DETECTIVE NOIR): Sharp deductive reasoning, suspenseful interrogations, and keen psychological analysis.'
    },
    iyashikei: {
        id: 'iyashikei',
        label: '🍃 Chữa lành / Ẩm thực / Thư giãn',
        prompt: '- GENRE (IYASHIKEI & CULINARY): Gentle, mouth-watering food descriptions, soothing atmosphere, and warm daily interactions.'
    }
};

// TIER 3: NARRATIVE TONE & SLANG FLAVOR
export const COMIC_TONE_PRESETS = {
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
export const TRANSLATION_GENRE_PRESETS = {
    quality: COMIC_TONE_PRESETS.classic.prompt,
    comedy: COMIC_TONE_PRESETS.comedy.prompt,
    school: COMIC_GENRE_PRESETS.school.prompt,
    shounen: COMIC_GENRE_PRESETS.action.prompt,
    fantasy: COMIC_GENRE_PRESETS.fantasy.prompt,
    drama: COMIC_GENRE_PRESETS.urban.prompt,
    horror: COMIC_GENRE_PRESETS.horror.prompt,
    polite: COMIC_GENRE_PRESETS.cultivation.prompt,
    dark: COMIC_TONE_PRESETS.dark.prompt,
    romance: COMIC_GENRE_PRESETS.romance.prompt,
    slice: COMIC_GENRE_PRESETS.school.prompt,
    martial: COMIC_GENRE_PRESETS.cultivation.prompt,
    scifi: COMIC_GENRE_PRESETS.scifi.prompt,
    gag: COMIC_TONE_PRESETS.comedy.prompt,
    historical: COMIC_GENRE_PRESETS.cultivation.prompt
};

export const DEFAULT_VERTICAL_WRITING_MODE = false;
export const DEFAULT_AI_BLOCK_BOX = { x: 37.5, y: 37.5, w: 25, h: 25 };
export const MAX_HISTORY_LIMIT = 30;
