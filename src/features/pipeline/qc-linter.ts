/**
 * Manga Translator Studio - Automated Chapter QC Linter Engine
 */

import { MangaBlock, MangaPage } from '../../types';
import { QcIssue, QcScanResult, QcIssueSeverity, QcIssueType } from '../../types/pipeline-types';
import { globalState, savePageToDB, pushStateToHistory } from '../../core/state';
import { autoFitBlock, isBlockAutoFit } from '../canvas/canvas-service';
import { elements } from '../../core/elements';

/**
 * Checks if a block's translated text likely overflows its bounding box
 */
export function checkBlockOverflow(block: MangaBlock, page: MangaPage): boolean {
    const text = (block.translated || '').trim();
    if (!text) return false;

    const box = block.box;
    if (!box || box.w <= 0 || box.h <= 0) return true;

    const pageW = page.width || 800;
    const pageH = page.height || 1200;

    const pixelW = (box.w / 100) * pageW;
    const pixelH = (box.h / 100) * pageH;
    const boxArea = pixelW * pixelH;

    const fontSize = block.style?.fontSize || 16;
    const charCount = text.length;

    // Approximate text area required: (chars * fontSize^2 * factor)
    const isVertical = Boolean(block.style?.vertical || block.vertical);
    const charAreaFactor = isVertical ? 1.35 : 0.65;
    const estimatedRequiredArea = charCount * (fontSize * fontSize) * charAreaFactor;

    // Margin allowance for padding & line height
    const availableArea = boxArea * 0.85;

    return estimatedRequiredArea > availableArea;
}

/**
 * Checks if a block is untranslated or empty
 */
export function checkUntranslated(block: MangaBlock): { isUntranslated: boolean; reason: string } {
    const orig = (block.original || '').trim();
    const trans = (block.translated || '').trim();

    if (!trans) {
        return { isUntranslated: true, reason: 'Ô thoại chưa có nội dung dịch' };
    }

    if (orig && orig.length >= 2 && orig === trans) {
        // Check if original contains CJK / Kana characters
        const hasCjk = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af]/.test(orig);
        if (hasCjk) {
            return { isUntranslated: true, reason: 'Nội dung dịch trùng khớp 100% với chữ gốc (chưa dịch)' };
        }
    }

    return { isUntranslated: false, reason: '' };
}

/**
 * Checks for abnormal font sizing
 */
export function checkFontAnomaly(block: MangaBlock): { hasAnomaly: boolean; reason: string; severity: QcIssueSeverity } {
    const fontSize = block.style?.fontSize;
    if (fontSize === undefined || fontSize === null || isNaN(fontSize)) {
        return { hasAnomaly: true, reason: 'Chưa cấu hình cỡ chữ (fontSize)', severity: 'warning' };
    }

    if (fontSize < 10) {
        return { hasAnomaly: true, reason: `Cỡ chữ quá nhỏ (${fontSize}px), khó đọc khi xuất bản`, severity: 'warning' };
    }

    if (fontSize > 65) {
        return { hasAnomaly: true, reason: `Cỡ chữ quá lớn (${fontSize}px), có thể che mất khung tranh`, severity: 'warning' };
    }

    return { hasAnomaly: false, reason: '', severity: 'info' };
}

/**
 * Runs a complete QC Scan across all pages in the Chapter
 */
export function runChapterQcScan(pages: MangaPage[] = globalState.pages): QcScanResult {
    const issues: QcIssue[] = [];

    if (!pages || pages.length === 0) {
        return {
            totalIssues: 0,
            criticalCount: 0,
            warningCount: 0,
            infoCount: 0,
            score: 100,
            issues: [],
            scannedAt: Date.now(),
            passed: true
        };
    }

    pages.forEach((page, pageIndex) => {
        const blocks = page.blocks || [];

        // Check for empty pages
        if (blocks.length === 0 && page.status !== 'draft') {
            issues.push({
                id: `qc_p${pageIndex}_noblocks`,
                pageIndex,
                blockId: '',
                type: 'empty',
                severity: 'info',
                message: `Trang ${pageIndex + 1}: Không phát hiện thấy ô thoại nào`,
                suggestion: 'Kiểm tra nếu trang này chỉ có tranh vẽ hoặc cần quét lại OCR',
                autoFixable: false
            });
        }

        blocks.forEach((block, blockIndex) => {
            const blockId = block.id || `p${pageIndex + 1}_b${blockIndex + 1}`;

            // 1. Untranslated / Empty check
            const { isUntranslated, reason: untransReason } = checkUntranslated(block);
            if (isUntranslated) {
                issues.push({
                    id: `qc_${blockId}_untrans`,
                    pageIndex,
                    blockId,
                    type: 'untranslated',
                    severity: 'critical',
                    message: `Trang ${pageIndex + 1} - [${blockId}]: ${untransReason}`,
                    suggestion: 'Nhập nội dung dịch hoặc dùng tính năng dịch AI cho câu này',
                    autoFixable: false,
                    data: { block }
                });
            }

            // 2. Text Overflow check
            if (block.translated && block.translated.trim()) {
                const isOverflow = checkBlockOverflow(block, page);
                if (isOverflow) {
                    issues.push({
                        id: `qc_${blockId}_overflow`,
                        pageIndex,
                        blockId,
                        type: 'overflow',
                        severity: 'warning',
                        message: `Trang ${pageIndex + 1} - [${blockId}]: Chữ bị tràn hoặc quá sát mép khung`,
                        suggestion: 'Thu nhỏ cỡ chữ khoảng 10-15% hoặc bật tính năng Auto-Fit',
                        autoFixable: true,
                        data: { block }
                    });
                }
            }

            // 3. Font Anomaly check
            const { hasAnomaly, reason: fontReason, severity: fontSev } = checkFontAnomaly(block);
            if (hasAnomaly) {
                issues.push({
                    id: `qc_${blockId}_font`,
                    pageIndex,
                    blockId,
                    type: 'font_anomaly',
                    severity: fontSev,
                    message: `Trang ${pageIndex + 1} - [${blockId}]: ${fontReason}`,
                    suggestion: 'Điều chỉnh cỡ chữ về khoảng tiêu chuẩn (14px - 32px)',
                    autoFixable: true,
                    data: { block }
                });
            }
        });
    });

    let criticalCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    issues.forEach(issue => {
        if (issue.severity === 'critical') criticalCount++;
        else if (issue.severity === 'warning') warningCount++;
        else infoCount++;
    });

    // Score deduction algorithm: 100 - (critical * 15) - (warning * 3) - (info * 0.5)
    let score = Math.max(0, Math.round(100 - (criticalCount * 15) - (warningCount * 3) - (infoCount * 0.5)));
    if (issues.length === 0) score = 100;

    const result: QcScanResult = {
        totalIssues: issues.length,
        criticalCount,
        warningCount,
        infoCount,
        score,
        issues,
        scannedAt: Date.now(),
        passed: criticalCount === 0 && warningCount <= 2
    };

    if (globalState.pipeline) {
        globalState.pipeline.lastQcResult = result;
    }

    return result;
}

/**
 * Automatically resolves all auto-fixable issues in one shot
 */
export function autoFixAllQcIssues(scanResult?: QcScanResult): { fixedCount: number; newResult: QcScanResult } {
    const result = scanResult || runChapterQcScan();
    const fixableIssues = result.issues.filter(i => i.autoFixable);

    if (fixableIssues.length === 0) {
        return { fixedCount: 0, newResult: result };
    }

    pushStateToHistory(true);

    let fixedCount = 0;
    const modifiedPages = new Set<number>();

    fixableIssues.forEach(issue => {
        const page = globalState.pages[issue.pageIndex];
        if (!page || !page.blocks) return;

        const block = page.blocks.find(b => b.id === issue.blockId);
        if (!block) return;

        if (issue.type === 'overflow') {
            // Apply Auto-fit or scale down by 15%
            const currentSize = block.style?.fontSize || 16;
            const newSize = Math.max(10, Math.round(currentSize * 0.85));
            if (!block.style) {
                block.style = { ...globalState.globalStyle };
            }
            block.style.fontSize = newSize;
            block.autoFitCache = null;

            const imgEl = elements.mangaBgImage;
            if (imgEl && isBlockAutoFit(block)) {
                try {
                    autoFitBlock(block, imgEl, 1, page);
                } catch (e) { }
            }

            modifiedPages.add(issue.pageIndex);
            fixedCount++;
        } else if (issue.type === 'font_anomaly') {
            if (!block.style) {
                block.style = { ...globalState.globalStyle };
            }
            const currentSize = block.style.fontSize || 16;
            if (currentSize < 10) block.style.fontSize = 13;
            else if (currentSize > 65) block.style.fontSize = 32;
            block.autoFitCache = null;

            modifiedPages.add(issue.pageIndex);
            fixedCount++;
        }
    });

    modifiedPages.forEach(pIdx => {
        savePageToDB(globalState.pages[pIdx]);
    });

    const newResult = runChapterQcScan();
    return { fixedCount, newResult };
}
