/**
 * Type declarations and shared interfaces for Cong Cu Huu Ich
 */

// Third-party CDN globals
declare global {
    const pdfjsLib: any;
    const JSZip: any;
    const Tesseract: any;
}

export interface PdfBlobItem {
    blob: Blob | null;
    url: string;
    filename: string;
    width: number;
    height: number;
    sizeStr: string;
}

export interface SliceItem {
    idx: number;
    blob: Blob | null;
    objectUrl: string;
    width: number;
    height: number;
    size: number;
    ext: string;
    filename: string;
}

export interface MergeImageItem {
    name: string;
    img: HTMLImageElement;
}

export interface CompressItem {
    file: File;
    img: HTMLImageElement;
    originalSize: number;
    compressedBlob: Blob | null;
    objectUrl: string | null;
    compressedSize: number;
}

export interface ConvertItem {
    file: File;
    img: HTMLImageElement;
    originalSize: number;
    convertedBlob: Blob | null;
    objectUrl: string | null;
    convertedExt: string;
}

export type FontCategory = 'dialogue' | 'shout' | 'narration' | 'whisper' | 'cute' | 'tech' | 'sfx' | 'all';

export type FontStyleType =
    | 'standard_dialogue'   // Thoại Manga in ấn chuẩn mực (CC Wild Words, SVN-Avo, Anime Ace, Comic Neue, Manga Temple)
    | 'cartoon_quirky'     // Hoạt hình nhí nhố / Viết tay hài hước / Simpsons / Chibi (Akbar, Komika, Badaboom)
    | 'shout_impact'       // Chữ hét / Chiêu thức / Shounen bùng nổ (UTM Impact, SF Fedora)
    | 'serif_narration'    // Dẫn truyện / Trang trọng / Cổ trang (Times, Mincho, Garamond)
    | 'whisper_cursive'    // Thì thầm / Suy nghĩ / Viết tay mềm mại (HL-Handwriting, Patrick Hand)
    | 'brush_sfx'          // Hiệu ứng SFX / Cọ vẽ nứt xước (Manga Brush, Action SFX)
    | 'tech_display';      // Màn hình game / Robot / UI tương lai

export type MangaTextType = 'dialogue' | 'thought' | 'narration' | 'aside' | 'sfx';

export type MangaTone =
    | 'none'       // Mặc định cho Narration, Aside, SFX
    | 'normal'     // Bình thường / Cân bằng
    | 'soft'       // Dịu dàng / Nhẹ nhàng
    | 'shy'        // Ngại ngùng / E thẹn
    | 'hesitant'   // Ngập ngừng / Lưỡng lự
    | 'whisper'    // Thì thầm / Nói nhỏ
    | 'shaky'      // Run rẩy / Rung giật / Bất an
    | 'sad'        // Buồn bã / U sầu
    | 'crying'     // Khóc lóc / Nghẹn ngào / Nức nở
    | 'scared'     // Sợ hãi / Hoảng hốt
    | 'angry'      // Giận dữ / Tức giận / Cáu gắt
    | 'shouting'   // Hét lớn / Gào thét / Kêu gọi
    | 'excited'    // Hào hứng / Phấn khích / Tươi vui
    | 'serious'    // Nghiêm túc / Căng thẳng / Trang trọng
    | 'weak'       // Yếu ớt / Kiệt sức / Thều thào
    | 'cold'       // Lạnh lùng / Vô cảm / Băng giá
    | 'special';   // Đặc biệt / Ma mị / Huyền bí / Dị biệt

export interface FontClassificationResult {
    primaryTextType: MangaTextType;
    compatibleTextTypes: MangaTextType[];
    primaryTone: MangaTone;
    compatibleTones: MangaTone[];
    confidenceScore: number;
    styleTags: string[];
    reasoning: string;
    recommendedStroke?: string;
    recommendedUsage?: string;
}

export interface DialogueClassificationResult {
    detectedTextType: MangaTextType;
    detectedTone: MangaTone;
    confidenceScore: number;
    emotionNuance: string;
    suggestedStyleTags: string[];
    matchedFonts?: CustomFontItem[];
    reasoning: string;
}

export type FontWeightGrade = 'Thin' | 'Light' | 'Regular' | 'Medium' | 'SemiBold' | 'Bold' | 'Black';
export type FontWidthGrade = 'Condensed' | 'Normal' | 'Wide';
export type FontSlantGrade = 'Upright' | 'Italic' | 'Oblique';
export type FontCaseGrade = 'Mixed Case' | 'All Caps' | 'Small Caps';

export interface FontMorphologyResult {
    weight: FontWeightGrade;
    width: FontWidthGrade;
    slant: FontSlantGrade;
    caseType: FontCaseGrade;
    weightScore: number;
    widthScore: number;
    slantAngle: number;
    caseRatio: number;
    inkDensity: number;
    isAllCaps: boolean;
    isSmallCaps: boolean;
    isItalic: boolean;
}

export interface FontProfile {
    weightScore: number;
    energyScore: number;
    formalityScore: number;
    roughnessScore: number;
    roundnessScore?: number;
    handwrittenScore?: number;
    fontStyleType?: FontStyleType;
    category: FontCategory;
    isAllCaps: boolean;
    weightGrade?: FontWeightGrade;
    widthGrade?: FontWidthGrade;
    slantGrade?: FontSlantGrade;
    caseGrade?: FontCaseGrade;
    slantAngle?: number;
    widthRatio?: number;
    caseRatio?: number;
    morphology?: FontMorphologyResult;
}

export interface CustomFontItem {
    id: string;
    name: string;
    family: string;
    fontClass: string;
    category: FontCategory;
    fontStyleType?: FontStyleType;
    primaryTextType?: MangaTextType;
    compatibleTextTypes?: MangaTextType[];
    primaryTone?: MangaTone;
    compatibleTones?: MangaTone[];
    classification?: FontClassificationResult;
    type: string;
    weightScore: number;
    energyScore: number;
    formalityScore: number;
    roughnessScore: number;
    roundnessScore?: number;
    handwrittenScore?: number;
    isAllCaps: boolean;
    weightGrade?: FontWeightGrade;
    widthGrade?: FontWidthGrade;
    slantGrade?: FontSlantGrade;
    caseGrade?: FontCaseGrade;
    slantAngle?: number;
    widthRatio?: number;
    caseRatio?: number;
    morphology?: FontMorphologyResult;
    blob?: Blob;
    size?: number;
    dateAdded: number;
    desc: string;
    recommendedStroke: string;
    matchPercent?: number;
    rank?: number;
}

export interface AnalysisResult {
    category: FontCategory;
    fontStyleType?: FontStyleType;
    weightScore: number;
    energyScore: number;
    formalityScore: number;
    roughnessScore: number;
    roundnessScore?: number;
    handwrittenScore?: number;
    isSerif?: boolean;
    isAllCaps?: boolean;
    slantAngle?: number;
    weightGrade?: FontWeightGrade;
    widthGrade?: FontWidthGrade;
    slantGrade?: FontSlantGrade;
    caseGrade?: FontCaseGrade;
    weightDesc?: string;
    energyDesc?: string;
    styleDesc?: string;
    reasoning?: string;
    recommendedStroke?: string;
    isAi?: boolean;
}

// --- GENRE -> STYLE PROFILE -> FONT SET ARCHITECTURE ---

export type FontRole = 'dialogue' | 'innerThought' | 'narration' | 'shout' | 'sfx' | 'smallText';

export type GenrePresetId = 'romance' | 'comedy' | 'modern' | 'action' | 'dark' | 'fantasy';

export interface StyleProfile {
    roundness: number;    // 0.0 (sharp/angular) -> 1.0 (smooth/rounded/curved)
    weight: number;       // 0.0 (light/thin) -> 1.0 (heavy/bold)
    formality: number;    // 0.0 (casual/handwritten) -> 1.0 (formal/serif/rigid)
    handwritten: number;  // 0.0 (geometric/printed) -> 1.0 (organic/brush/script)
    intensity: number;    // 0.0 (calm/subtle) -> 1.0 (explosive/dramatic)
}

export interface RoleConfig {
    role: FontRole;
    label: string;
    description: string;
    sampleText: string;
    targetProfile: StyleProfile;
    preferredCategories: FontCategory[];
}

export interface GenrePreset {
    id: GenrePresetId;
    name: string;
    description: string;
    icon: string;
    tone: string;
    visualStyle: string;
    baseProfile: StyleProfile;
    roles: Record<FontRole, RoleConfig>;
}

export interface FontRoleAssignment {
    role: FontRole;
    roleLabel: string;
    fontName: string;
    fontFamily: string;
    fontItem: CustomFontItem | null;
    score: number;
    isStrongMatch: boolean;
    sampleText: string;
    desc: string;
}

export interface GeneratedFontSet {
    presetId: GenrePresetId | 'custom' | 'ai_detected';
    presetName: string;
    tone: string;
    visualStyle: string;
    roles: Record<FontRole, FontRoleAssignment>;
    coreFontCount: number;
    isAiAnalyzed?: boolean;
    rawAiProfile?: StyleProfile;
}

export interface AiGenreAnalysisResult {
    genre: string;
    tone: string;
    visualStyle: string;
    typographyStyle: string;
    intensity: number;
    roundness: number;
    weight: number;
    formality: number;
    handwritten: number;
    detectedPresetId?: GenrePresetId;
    reasoning?: string;
}
