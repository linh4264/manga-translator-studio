/**
 * Manga Translator Studio - Chapter Production Pipeline Manager
 */

import { globalState, stateEvents } from '../../core/state';
import {
    PipelineStageId,
    PipelineStageStatus,
    ChapterPipelineData,
    ChapterProductionStats,
    PIPELINE_STAGES
} from '../../types/pipeline-types';
import { globalBus } from '../../core/events';

export function getDefaultPipelineData(): ChapterPipelineData {
    return {
        currentStage: 'import',
        stageStatuses: {
            import: 'idle',
            ocr: 'idle',
            translate: 'idle',
            review: 'idle',
            typeset: 'idle',
            qc: 'idle',
            export: 'idle'
        },
        readingDirection: 'rtl',
        chapterName: 'Chapter 01',
        seriesName: 'Manga Project',
        chapterNumber: '01',
        autoPilotRunning: false,
        autoPilotProgress: 0,
        autoPilotStageMessage: '',
        lastQcResult: null,
        stats: {
            totalDialogueBlocks: 0,
            totalWordsOriginal: 0,
            totalWordsTranslated: 0,
            ocrCompletedPages: 0,
            translatedPages: 0,
            typesetPages: 0,
            qcApprovedPages: 0,
            estimatedSavedMinutes: 0
        }
    };
}

export function getPipelineData(): ChapterPipelineData {
    if (!globalState.pipeline) {
        globalState.pipeline = getDefaultPipelineData();
    }
    return globalState.pipeline;
}

export function setPipelineStage(stage: PipelineStageId): void {
    const pipeline = getPipelineData();
    if (pipeline.currentStage === stage) return;

    pipeline.currentStage = stage;
    globalBus.publish('pipeline:stage-changed', { stage });
}

export function updateStageStatus(stage: PipelineStageId, status: PipelineStageStatus): void {
    const pipeline = getPipelineData();
    pipeline.stageStatuses[stage] = status;
    globalBus.publish('pipeline:status-changed', { stage, status });
}

export function setChapterMetadata(meta: {
    chapterName?: string;
    seriesName?: string;
    chapterNumber?: string;
    readingDirection?: 'rtl' | 'ltr';
}): void {
    const pipeline = getPipelineData();
    if (meta.chapterName !== undefined) pipeline.chapterName = meta.chapterName;
    if (meta.seriesName !== undefined) pipeline.seriesName = meta.seriesName;
    if (meta.chapterNumber !== undefined) pipeline.chapterNumber = meta.chapterNumber;
    if (meta.readingDirection !== undefined) pipeline.readingDirection = meta.readingDirection;
    globalBus.publish('pipeline:metadata-changed', pipeline);
}

export function recalculateChapterStats(): ChapterProductionStats {
    const pipeline = getPipelineData();
    const pages = globalState.pages || [];

    let totalDialogueBlocks = 0;
    let totalWordsOriginal = 0;
    let totalWordsTranslated = 0;
    let ocrCompletedPages = 0;
    let translatedPages = 0;
    let typesetPages = 0;

    pages.forEach(page => {
        const hasBlocks = page.blocks && page.blocks.length > 0;
        if (hasBlocks) {
            ocrCompletedPages++;
            let pageTranslated = true;
            let pageTypeset = true;

            page.blocks.forEach(b => {
                totalDialogueBlocks++;
                const orig = (b.original || '').trim();
                const trans = (b.translated || '').trim();

                if (orig) {
                    totalWordsOriginal += orig.split(/\s+/).filter(Boolean).length || 1;
                }
                if (trans) {
                    totalWordsTranslated += trans.split(/\s+/).filter(Boolean).length || 1;
                } else {
                    pageTranslated = false;
                }

                if (!b.style || !b.style.fontSize) {
                    pageTypeset = false;
                }
            });

            if (pageTranslated) translatedPages++;
            if (pageTypeset) typesetPages++;
        }
    });

    // Estimate minutes saved (avg human scanlator: ~1 min per dialogue block + typeset)
    const estimatedSavedMinutes = Math.max(
        1,
        Math.round(totalDialogueBlocks * 1.5 + totalWordsTranslated * 0.05)
    );

    const stats: ChapterProductionStats = {
        totalDialogueBlocks,
        totalWordsOriginal,
        totalWordsTranslated,
        ocrCompletedPages,
        translatedPages,
        typesetPages,
        qcApprovedPages: pipeline.lastQcResult?.passed ? pages.length : 0,
        estimatedSavedMinutes
    };

    pipeline.stats = stats;
    return stats;
}

export function autoUpdatePipelineStages(): PipelineStageId {
    const pipeline = getPipelineData();
    const pages = globalState.pages || [];
    recalculateChapterStats();

    if (pages.length === 0) {
        pipeline.stageStatuses.import = 'idle';
        pipeline.stageStatuses.ocr = 'idle';
        pipeline.stageStatuses.translate = 'idle';
        pipeline.stageStatuses.review = 'idle';
        pipeline.stageStatuses.typeset = 'idle';
        pipeline.stageStatuses.qc = 'idle';
        pipeline.stageStatuses.export = 'idle';
        pipeline.currentStage = 'import';
        return 'import';
    }

    pipeline.stageStatuses.import = 'completed';

    const hasAnyBlocks = pages.some(p => p.blocks && p.blocks.length > 0);
    const allHaveBlocks = pages.every(p => p.blocks && p.blocks.length > 0);

    if (!hasAnyBlocks) {
        pipeline.stageStatuses.ocr = 'idle';
        pipeline.stageStatuses.translate = 'idle';
        pipeline.stageStatuses.review = 'idle';
        pipeline.stageStatuses.typeset = 'idle';
        pipeline.stageStatuses.qc = 'idle';
        pipeline.stageStatuses.export = 'idle';
        pipeline.currentStage = 'ocr';
        return 'ocr';
    }

    pipeline.stageStatuses.ocr = allHaveBlocks ? 'completed' : 'running';

    const hasTranslations = pages.some(p => p.blocks?.some(b => b.translated && b.translated.trim()));
    const allTranslated = pages.every(p => p.blocks?.every(b => b.translated && b.translated.trim()));

    if (!hasTranslations) {
        pipeline.stageStatuses.translate = 'idle';
        pipeline.stageStatuses.review = 'idle';
        pipeline.stageStatuses.typeset = 'idle';
        pipeline.stageStatuses.qc = 'idle';
        pipeline.stageStatuses.export = 'idle';
        pipeline.currentStage = 'translate';
        return 'translate';
    }

    pipeline.stageStatuses.translate = allTranslated ? 'completed' : 'running';

    if (pipeline.stageStatuses.review !== 'completed') {
        pipeline.stageStatuses.review = 'needs_review';
        pipeline.currentStage = 'review';
        return 'review';
    }

    if (pipeline.stageStatuses.typeset !== 'completed') {
        pipeline.stageStatuses.typeset = 'idle';
        pipeline.currentStage = 'typeset';
        return 'typeset';
    }

    if (!pipeline.lastQcResult || !pipeline.lastQcResult.passed) {
        pipeline.stageStatuses.qc = 'needs_review';
        pipeline.currentStage = 'qc';
        return 'qc';
    }

    pipeline.stageStatuses.qc = 'completed';
    pipeline.stageStatuses.export = 'idle';
    pipeline.currentStage = 'export';
    return 'export';
}
