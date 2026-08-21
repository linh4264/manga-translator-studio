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
    weightScore: number;
    energyScore: number;
    formalityScore: number;
    roughnessScore: number;
    weightGrade?: FontWeightGrade;
    widthGrade?: FontWidthGrade;
    slantGrade?: FontSlantGrade;
    caseGrade?: FontCaseGrade;
    weightDesc?: string;
    energyDesc?: string;
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
