// Global constants and configuration for Manga Translator Studio

export const DEFAULT_MODEL = "gemini-1.5-flash-lite"; // Updated to a stable version
export const CUSTOM_MODEL_VALUE = "__custom__";
export const VALID_MODEL_IDS = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-flash-lite",
    "gemini-1.5-pro",
    "gemini-2.0-flash-exp"
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

export const TRANSLATION_GENRE_PRESETS = {
    custom: '',
    quality: '- GENRE PRESET: Master-level Japanese Scanlation. Prioritize natural, fluent, and expressive Vietnamese dialogue. Eliminate robotic, literal, or machine-translated structures. Adapt Japanese nuances, honorifics, and character speech styles seamlessly.',
    comedy: '- GENRE PRESET: Comedy manga. Keep timing sharp, wording natural, and punchlines intact.',
    school: '- GENRE PRESET: School-life manga. Use casual, youthful Vietnamese.',
    shounen: '- GENRE PRESET: Shounen/action manga. Use short, punchy, energetic Vietnamese.',
    fantasy: '- GENRE PRESET: Fantasy/isekai manga. Keep terms consistent, worldbuilding clear.',
    drama: '- GENRE PRESET: Drama manga. Keep emotions subtle, restrained, and natural.',
    horror: '- GENRE PRESET: Horror/thriller manga. Keep the wording tense, cold, and unsettling.',
    polite: '- GENRE PRESET: Polite/formal dialogue. Use respectful Vietnamese.',
    dark: '- GENRE PRESET: Dark/psychological manga. Keep the tone heavy and serious.',
    romance: '- GENRE PRESET: Romance manga. Use warm, delicate Vietnamese.',
    slice: '- GENRE PRESET: Slice-of-life manga. Use everyday Vietnamese.',
    martial: '- GENRE PRESET: Martial arts/Wuxia. Use Sino-Vietnamese (Hán-Việt) terms.',
    scifi: '- GENRE PRESET: Sci-fi/Mecha. Keep futuristic concepts consistent.',
    gag: '- GENRE PRESET: Gag comedy manga. Use localized internet slang and memes.',
    historical: '- GENRE PRESET: Historical/Period manga. Use formal, archaic Sino-Vietnamese.'
};

export const DEFAULT_VERTICAL_WRITING_MODE = false;
export const DEFAULT_AI_BLOCK_BOX = { x: 37.5, y: 37.5, w: 25, h: 25 };
export const MAX_HISTORY_LIMIT = 30;
