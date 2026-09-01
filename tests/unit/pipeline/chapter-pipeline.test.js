import { describe, it, expect, beforeEach } from 'vitest';
import {
    getDefaultPipelineData,
    getPipelineData,
    setPipelineStage,
    updateStageStatus,
    recalculateChapterStats,
    autoUpdatePipelineStages
} from '../../../src/features/pipeline/pipeline-manager';
import {
    checkBlockOverflow,
    checkUntranslated,
    checkFontAnomaly,
    runChapterQcScan,
    autoFixAllQcIssues
} from '../../../src/features/pipeline/qc-linter';
import {
    getIsAutoPilotRunning,
    stopAutoPilot
} from '../../../src/features/pipeline/pipeline-orchestrator';
import { globalState } from '../../../src/core/state';

describe('Chapter Production Pipeline Architecture', () => {
    beforeEach(() => {
        globalState.pages = [];
        globalState.pipeline = getDefaultPipelineData();
    });

    describe('Pipeline Manager & State Machine', () => {
        it('1. Initializes default pipeline data with all 7 stages in idle state', () => {
            const data = getDefaultPipelineData();
            expect(data.currentStage).toBe('import');
            expect(data.stageStatuses.import).toBe('idle');
            expect(data.stageStatuses.ocr).toBe('idle');
            expect(data.stageStatuses.translate).toBe('idle');
            expect(data.stageStatuses.review).toBe('idle');
            expect(data.stageStatuses.typeset).toBe('idle');
            expect(data.stageStatuses.qc).toBe('idle');
            expect(data.stageStatuses.export).toBe('idle');
        });

        it('2. Transitions stages and updates statuses correctly', () => {
            setPipelineStage('translate');
            const data = getPipelineData();
            expect(data.currentStage).toBe('translate');

            updateStageStatus('translate', 'running');
            expect(data.stageStatuses.translate).toBe('running');

            updateStageStatus('translate', 'completed');
            expect(data.stageStatuses.translate).toBe('completed');
        });

        it('3. Computes chapter production stats accurately', () => {
            globalState.pages = [
                {
                    id: 'p1',
                    name: '001.png',
                    width: 800,
                    height: 1200,
                    status: 'done',
                    blocks: [
                        { id: 'b1', original: 'こんにちは', translated: 'Xin chào bạn', box: { x: 10, y: 10, w: 20, h: 10 }, style: { fontSize: 16 } },
                        { id: 'b2', original: 'ありがとう', translated: 'Cảm ơn nhiều nhé', box: { x: 40, y: 40, w: 20, h: 10 }, style: { fontSize: 16 } }
                    ]
                },
                {
                    id: 'p2',
                    name: '002.png',
                    width: 800,
                    height: 1200,
                    status: 'done',
                    blocks: [
                        { id: 'b3', original: 'さようなら', translated: 'Tạm biệt', box: { x: 10, y: 10, w: 20, h: 10 }, style: { fontSize: 16 } }
                    ]
                }
            ];

            const stats = recalculateChapterStats();
            expect(stats.totalDialogueBlocks).toBe(3);
            expect(stats.ocrCompletedPages).toBe(2);
            expect(stats.translatedPages).toBe(2);
            expect(stats.typesetPages).toBe(2);
            expect(stats.totalWordsTranslated).toBeGreaterThan(0);
            expect(stats.estimatedSavedMinutes).toBeGreaterThan(0);
        });

        it('4. Automatically infers current stage based on chapter progress', () => {
            // No pages -> import
            globalState.pages = [];
            expect(autoUpdatePipelineStages()).toBe('import');

            // Pages with no blocks -> ocr
            globalState.pages = [{ id: 'p1', name: '1.png', blocks: [] }];
            expect(autoUpdatePipelineStages()).toBe('ocr');

            // Pages with blocks but no translations -> translate
            globalState.pages = [{
                id: 'p1',
                name: '1.png',
                blocks: [{ id: 'b1', original: 'Test', translated: '', box: { x: 0, y: 0, w: 10, h: 10 }, style: {} }]
            }];
            expect(autoUpdatePipelineStages()).toBe('translate');

            // Pages with translation -> review
            globalState.pages[0].blocks[0].translated = 'Bản dịch';
            expect(autoUpdatePipelineStages()).toBe('review');
        });
    });

    describe('Automated Chapter QC Linter', () => {
        it('5. Detects untranslated or identical CJK text', () => {
            const emptyBlock = { id: 'b1', original: 'Hello', translated: '' };
            expect(checkUntranslated(emptyBlock).isUntranslated).toBe(true);

            const cjkUntranslated = { id: 'b2', original: 'こんにちは', translated: 'こんにちは' };
            expect(checkUntranslated(cjkUntranslated).isUntranslated).toBe(true);

            const translatedBlock = { id: 'b3', original: 'こんにちは', translated: 'Xin chào' };
            expect(checkUntranslated(translatedBlock).isUntranslated).toBe(false);
        });

        it('6. Detects font anomalies for abnormal sizes', () => {
            const tooSmall = { id: 'b1', style: { fontSize: 6 } };
            expect(checkFontAnomaly(tooSmall).hasAnomaly).toBe(true);

            const tooLarge = { id: 'b2', style: { fontSize: 80 } };
            expect(checkFontAnomaly(tooLarge).hasAnomaly).toBe(true);

            const normal = { id: 'b3', style: { fontSize: 18 } };
            expect(checkFontAnomaly(normal).hasAnomaly).toBe(false);
        });

        it('7. Runs full chapter QC scan and returns score and categorized issues', () => {
            globalState.pages = [
                {
                    id: 'p1',
                    name: '001.png',
                    width: 800,
                    height: 1200,
                    status: 'done',
                    blocks: [
                        { id: 'b1', original: 'テスト', translated: '', box: { x: 10, y: 10, w: 20, h: 10 }, style: { fontSize: 16 } },
                        { id: 'b2', original: 'OK', translated: 'Được', box: { x: 40, y: 40, w: 20, h: 10 }, style: { fontSize: 16 } }
                    ]
                }
            ];

            const scanResult = runChapterQcScan();
            expect(scanResult.totalIssues).toBeGreaterThan(0);
            expect(scanResult.criticalCount).toBe(1); // 1 untranslated
            expect(scanResult.score).toBeLessThan(100);
            expect(scanResult.passed).toBe(false);
        });

        it('8. Auto-fixes fixable QC issues', () => {
            globalState.pages = [
                {
                    id: 'p1',
                    name: '001.png',
                    width: 800,
                    height: 1200,
                    status: 'done',
                    blocks: [
                        {
                            id: 'b1',
                            original: 'Long sentence',
                            translated: 'Đây là một câu thoại rất dài vượt quá diện tích bong bóng thoại rất nhiều lần',
                            box: { x: 10, y: 10, w: 5, h: 5 }, // Very small box
                            style: { fontSize: 30 }
                        }
                    ]
                }
            ];

            const initialScan = runChapterQcScan();
            expect(initialScan.warningCount).toBeGreaterThan(0);

            const { fixedCount } = autoFixAllQcIssues(initialScan);
            expect(fixedCount).toBeGreaterThan(0);
            expect(globalState.pages[0].blocks[0].style.fontSize).toBeLessThan(30);
        });
    });

    describe('Auto-Pilot Controller', () => {
        it('9. Reports correct running status and handles stop correctly', () => {
            expect(getIsAutoPilotRunning()).toBe(false);
            stopAutoPilot();
            expect(getIsAutoPilotRunning()).toBe(false);
        });
    });
});
