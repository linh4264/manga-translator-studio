/**
 * Manga Translator Studio Type Definitions
 */

export interface BoundingBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface BlockStyle {
    fontFamily: string;
    fontSize: number;
    lineHeight?: number;
    letterSpacing?: number;
    textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
    italic?: boolean;
    underline?: boolean;
    textColor: string;
    textColorHex?: string;
    bgColor: string;
    bgColorHex?: string;
    bgOpacity: number;
    padding: number;
    rotate: number;
    vertical: boolean;
    bold: boolean;
    align: 'left' | 'center' | 'right';
    maskShape: 'bubble-fit' | 'ellipse' | 'rounded' | 'rectangle' | 'rect' | 'none';
    maskSize: 'full' | 'snug';
    strokeColor: string;
    strokeColorHex?: string;
    strokeWidth: number;
    strokeColor2?: string;
    strokeColor2Hex?: string;
    strokeWidth2?: number;
    shadowColor: string;
    shadowColorHex?: string;
    shadowBlur: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
    arcAngle?: number;
    skewX?: number;
    skewY?: number;
    warpWave?: number;
    warpBulge?: number;
    gender?: 'male' | 'female' | 'neutral';
    autoFit?: boolean;
    fit?: 'contain' | 'cover' | 'fill';
    opacity?: number;
    borderRadius?: number;
    bilingualSub?: boolean;
}

export interface MangaBlock {
    id: string;
    type: 'dialogue' | 'narration' | 'sfx' | 'other';
    original: string;
    translated: string;
    box: BoundingBox;
    style: BlockStyle;
    speaker?: string;
    target?: string;
    textWidth?: number;
    textHeight?: number;
    positionKnown?: boolean;
    maskCache?: any;
    autoFitCache?: any;
}

export interface MangaPage {
    id: string;
    name: string;
    width: number;
    height: number;
    apiWidth?: number;
    apiHeight?: number;
    status: 'draft' | 'queued' | 'processing' | 'done' | 'error';
    blocks: MangaBlock[];
    file: Blob | null;
    originalFile: Blob | null;
    eraserLayerBlob?: Blob | null;
    thumbnailBlob?: Blob | null;
    thumbnailSrc?: string | null;
    src?: string | null;
    apiSrc?: string | null;
    imageDataCache?: ImageData | null;
    lastDisplayWidth?: number;
}

export interface AudioSettings {
    maleVoiceURI: string;
    femaleVoiceURI: string;
    narratorVoiceURI: string;
    rate: number;
    malePitch: number;
    femalePitch: number;
    narratorPitch: number;
}

export interface CharacterDossierEntry {
    id: string;
    originalName: string;
    translatedName: string;
    gender?: 'male' | 'female' | 'other';
    pronounSelf?: string;
    pronounTarget?: string;
    personality?: string;
    notes?: string;
}

export interface LorebookEntry {
    id: string;
    originalTerm: string;
    translatedTerm: string;
    category?: string;
    note?: string;
}

export interface ToeicWord {
    word: string;
    pos: string;
    vietnamese: string;
    phonetic?: string;
    toeic_example: string;
    level?: string;
    savedAt?: string;
}

export interface GlobalState {
    apiKey: string;
    aiProvider: 'gemini' | 'claude' | 'openai' | 'custom';
    apiEndpoint: string;
    chapterStoryMemory: any[];
    enableStoryMemory: boolean;
    selectedModel: string;
    defaultFont: string;
    pages: MangaPage[];
    activePageIndex: number;
    selectedBlockId: string | null;
    viewMode: 'overlay' | 'split' | 'original';
    zoom: number;
    activeTab: 'edit' | 'style';
    bilingualMode: 'off' | 'sub';
    enableHoverTooltip: boolean;
    characterDossier: CharacterDossierEntry[];
    lorebook: LorebookEntry[];
    toeicSavedWords: ToeicWord[];
    activeBlockToeicAnalysis: any | null;
    toeicMode: 'learn' | 'recall';
    activeToeicQuestionIndex: number;
    toolbarCollapsedMobile: boolean;
    autoFitEnabled: boolean;
    preserveNames: boolean;
    glossaryNames: string;
    sourceLanguage: string;
    targetLanguage: string;
    uiLanguage: 'vi' | 'en';
    pronounMatrix: string;
    ocrEnhanceEnabled: boolean;
    translationGenrePresets: string[];
    translationContextPrompt: string;
    apiDelay: number;
    maxRetries: number;
    globalStyle: BlockStyle;
    audioSettings?: AudioSettings;
}
