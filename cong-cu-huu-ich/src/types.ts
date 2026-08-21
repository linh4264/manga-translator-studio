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

export interface FontProfile {
    weightScore: number;
    energyScore: number;
    formalityScore: number;
    roughnessScore: number;
    category: FontCategory;
    isAllCaps: boolean;
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
    isAllCaps: boolean;
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
    weightDesc?: string;
    energyDesc?: string;
    reasoning?: string;
    recommendedStroke?: string;
    isAi?: boolean;
}
