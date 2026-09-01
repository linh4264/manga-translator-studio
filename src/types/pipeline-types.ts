/**
 * Manga Translator Studio - Chapter Production Pipeline Types
 */

export type PipelineStageId =
    | 'import'
    | 'ocr'
    | 'translate'
    | 'review'
    | 'typeset'
    | 'qc'
    | 'export';

export type PipelineStageStatus =
    | 'idle'
    | 'running'
    | 'needs_review'
    | 'completed'
    | 'error';

export interface PipelineStageInfo {
    id: PipelineStageId;
    name: string;
    description: string;
    icon: string;
    order: number;
}

export const PIPELINE_STAGES: Record<PipelineStageId, PipelineStageInfo> = {
    import: {
        id: 'import',
        name: '1. Import',
        description: 'Nhập ảnh, sắp xếp thứ tự và kiểm tra file',
        icon: 'fa-file-import',
        order: 0
    },
    ocr: {
        id: 'ocr',
        name: '2. OCR',
        description: 'Nhận diện bong bóng & văn bản tiếng gốc',
        icon: 'fa-wand-magic-sparkles',
        order: 1
    },
    translate: {
        id: 'translate',
        name: '3. Dịch',
        description: 'Dịch theo mạch truyện & đồng bộ xưng hô',
        icon: 'fa-language',
        order: 2
    },
    review: {
        id: 'review',
        name: '4. Review',
        description: 'Kiểm tra kịch bản & trau chuốt câu từ',
        icon: 'fa-pen-to-square',
        order: 3
    },
    typeset: {
        id: 'typeset',
        name: '5. Typeset',
        description: 'Canh chỉnh font, auto-fit & làm sạch khung',
        icon: 'fa-font',
        order: 4
    },
    qc: {
        id: 'qc',
        name: '6. QC',
        description: 'Kiểm duyệt chất lượng & quét lỗi tràn chữ',
        icon: 'fa-shield-halved',
        order: 5
    },
    export: {
        id: 'export',
        name: '7. Xuất',
        description: 'Đóng gói ZIP, PDF, PSD & tải lên Drive',
        icon: 'fa-file-export',
        order: 6
    }
};

export type QcIssueSeverity = 'critical' | 'warning' | 'info';

export type QcIssueType =
    | 'overflow'
    | 'untranslated'
    | 'empty'
    | 'font_anomaly'
    | 'dirty_mask'
    | 'duplicate';

export interface QcIssue {
    id: string;
    pageIndex: number;
    blockId: string;
    type: QcIssueType;
    severity: QcIssueSeverity;
    message: string;
    suggestion?: string;
    autoFixable: boolean;
    data?: any;
}

export interface QcScanResult {
    totalIssues: number;
    criticalCount: number;
    warningCount: number;
    infoCount: number;
    score: number; // 0 - 100
    issues: QcIssue[];
    scannedAt: number;
    passed: boolean;
}

export interface ChapterProductionStats {
    totalDialogueBlocks: number;
    totalWordsOriginal: number;
    totalWordsTranslated: number;
    ocrCompletedPages: number;
    translatedPages: number;
    typesetPages: number;
    qcApprovedPages: number;
    estimatedSavedMinutes: number;
}

export interface ChapterPipelineData {
    currentStage: PipelineStageId;
    stageStatuses: Record<PipelineStageId, PipelineStageStatus>;
    readingDirection: 'rtl' | 'ltr';
    chapterName: string;
    seriesName: string;
    chapterNumber: string;
    autoPilotRunning: boolean;
    autoPilotProgress: number;
    autoPilotStageMessage: string;
    lastQcResult: QcScanResult | null;
    stats: ChapterProductionStats;
}
