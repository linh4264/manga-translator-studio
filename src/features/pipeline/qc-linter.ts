/**
 * Manga Translator Studio - Automated Chapter QC Linter Engine
 */

import { MangaBlock, MangaPage } from '../../types';
import { QcIssue, QcScanResult, QcIssueSeverity } from '../../types/pipeline-types';
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

    if (fontSize < 11) {
        return { hasAnomaly: true, reason: `Cỡ chữ quá nhỏ (${fontSize}px), khó đọc trên thiết bị di động`, severity: 'warning' };
    }

    if (fontSize > 65) {
        return { hasAnomaly: true, reason: `Cỡ chữ quá lớn (${fontSize}px), có thể che mất khung tranh`, severity: 'warning' };
    }

    return { hasAnomaly: false, reason: '', severity: 'info' };
}

/**
 * Checks for invalid or distorted bounding box geometry
 */
export function checkGeometryAnomaly(block: MangaBlock): { hasAnomaly: boolean; reason: string; fixable: boolean } {
    const box = block.box;
    if (!box) {
        return { hasAnomaly: true, reason: 'Thiếu thông tin bounding box', fixable: true };
    }

    if (box.w <= 0 || box.h <= 0) {
        return { hasAnomaly: true, reason: `Kích thước khung không hợp lệ (w: ${box.w}%, h: ${box.h}%)`, fixable: true };
    }

    if (box.x < 0 || box.y < 0 || box.x + box.w > 105 || box.y + box.h > 105) {
        return { hasAnomaly: true, reason: `Tọa độ khung vượt ra ngoài mép trang truyện (x:${box.x.toFixed(1)}%, y:${box.y.toFixed(1)}%)`, fixable: true };
    }

    return { hasAnomaly: false, reason: '', fixable: false };
}

/**
 * Checks for terminology and character naming consistency against Glossary / Dossier
 */
export function checkTerminologyInconsistency(block: MangaBlock): { hasInconsistency: boolean; reason: string; expectedTerm?: string } {
    const orig = (block.original || '').trim();
    const trans = (block.translated || '').trim();
    if (!orig || !trans) return { hasInconsistency: false, reason: '' };

    const glossaryRaw = globalState.glossaryNames || '';
    if (!glossaryRaw.trim()) return { hasInconsistency: false, reason: '' };

    // Format of glossary entries: "Original = Translated" or "Original: Translated"
    const lines = glossaryRaw.split(/[\n,;]+/);
    for (const line of lines) {
        const parts = line.split(/[=:]+/);
        if (parts.length >= 2) {
            const rawOrig = parts[0].trim();
            const expectedTrans = parts[1].trim();
            if (rawOrig && expectedTrans && orig.toLowerCase().includes(rawOrig.toLowerCase())) {
                if (!trans.toLowerCase().includes(expectedTrans.toLowerCase())) {
                    return {
                        hasInconsistency: true,
                        reason: `Câu gốc chứa thuật ngữ "${rawOrig}" nhưng bản dịch chưa dùng từ chuẩn "${expectedTrans}"`,
                        expectedTerm: expectedTrans
                    };
                }
            }
        }
    }

    return { hasInconsistency: false, reason: '' };
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

            // 1. Geometry anomaly check
            const { hasAnomaly: hasGeoAnomaly, reason: geoReason, fixable: geoFixable } = checkGeometryAnomaly(block);
            if (hasGeoAnomaly) {
                issues.push({
                    id: `qc_${blockId}_geo`,
                    pageIndex,
                    blockId,
                    type: 'geometry_anomaly',
                    severity: 'critical',
                    message: `Trang ${pageIndex + 1} - [${blockId}]: ${geoReason}`,
                    suggestion: 'Chuẩn hóa lại tọa độ bounding box về kích thước hợp lệ',
                    autoFixable: geoFixable,
                    data: { block }
                });
            }

            // 2. Untranslated / Empty check
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

            // 3. Text Overflow check
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

            // 4. Font Anomaly check
            const { hasAnomaly, reason: fontReason, severity: fontSev } = checkFontAnomaly(block);
            if (hasAnomaly) {
                issues.push({
                    id: `qc_${blockId}_font`,
                    pageIndex,
                    blockId,
                    type: 'font_anomaly',
                    severity: fontSev,
                    message: `Trang ${pageIndex + 1} - [${blockId}]: ${fontReason}`,
                    suggestion: 'Điều chỉnh cỡ chữ về khoảng tiêu chuẩn (12px - 45px)',
                    autoFixable: true,
                    data: { block }
                });
            }

            // 5. Inconsistency check
            const { hasInconsistency, reason: inconsReason } = checkTerminologyInconsistency(block);
            if (hasInconsistency) {
                issues.push({
                    id: `qc_${blockId}_inconsistency`,
                    pageIndex,
                    blockId,
                    type: 'inconsistency',
                    severity: 'warning',
                    message: `Trang ${pageIndex + 1} - [${blockId}]: ${inconsReason}`,
                    suggestion: 'Kiểm tra và chuẩn hóa tên nhân vật/thuật ngữ theo bảng Glossary',
                    autoFixable: false,
                    data: { block }
                });
            }
        });
    });

    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info').length;

    // Quality Score Calculation (100 base, -15 per critical, -5 per warning, -1 per info)
    const deduction = (criticalCount * 15) + (warningCount * 5) + (infoCount * 1);
    const score = Math.max(0, Math.min(100, 100 - deduction));
    const passed = criticalCount === 0 && warningCount <= 3;

    const result: QcScanResult = {
        totalIssues: issues.length,
        criticalCount,
        warningCount,
        infoCount,
        score,
        issues,
        scannedAt: Date.now(),
        passed
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

        if (issue.type === 'geometry_anomaly') {
            if (!block.box) {
                block.box = { x: 10, y: 10, w: 25, h: 15 };
            } else {
                block.box.x = Math.max(0, Math.min(90, block.box.x || 0));
                block.box.y = Math.max(0, Math.min(90, block.box.y || 0));
                block.box.w = Math.max(5, Math.min(100 - block.box.x, block.box.w || 20));
                block.box.h = Math.max(5, Math.min(100 - block.box.y, block.box.h || 15));
            }
            modifiedPages.add(issue.pageIndex);
            fixedCount++;
        } else if (issue.type === 'overflow') {
            // Apply Auto-fit or scale down by 15%
            const currentSize = block.style?.fontSize || 16;
            const newSize = Math.max(11, Math.round(currentSize * 0.85));
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
            if (currentSize < 11) block.style.fontSize = 14;
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
