/**
 * Manga Translator Studio - Automated Chapter QC Inspector & Dashboard UI
 */

import { globalState, savePageToDB, activatePage } from '../core/state';
import { elements } from '../core/elements';
import { showToast, escapeHTML } from '../core/utils';
import { runChapterQcScan, autoFixAllQcIssues } from '../features/pipeline/qc-linter';
import { QcScanResult, QcIssue } from '../types/pipeline-types';
import { setPipelineStage, updateStageStatus } from '../features/pipeline/pipeline-manager';
import { selectPage } from './pages-ui';
import { requestOverlayRender } from '../features/canvas/canvas-service';
import { openExportHubModal } from './export-hub-ui';

let isQcModalOpen = false;

export function openQcModal(): void {
    if (globalState.pages.length === 0) {
        showToast("Chưa có trang truyện nào để kiểm duyệt QC!", "warn");
        return;
    }

    let modal = document.getElementById('qc-dashboard-modal');
    if (!modal) {
        modal = createQcModalDOM();
        document.body.appendChild(modal);
    }

    modal.classList.remove('hidden');
    isQcModalOpen = true;
    document.body.style.overflow = 'hidden';

    setPipelineStage('qc');
    renderQcContent();
}

export function closeQcModal(): void {
    const modal = document.getElementById('qc-dashboard-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    isQcModalOpen = false;
    document.body.style.overflow = '';
}

function createQcModalDOM(): HTMLElement {
    const modal = document.createElement('div');
    modal.id = 'qc-dashboard-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 animate-fade-in select-none';

    modal.innerHTML = `
        <div class="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
            <!-- Header -->
            <div class="px-5 py-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between shrink-0">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
                        <i class="fa-solid fa-shield-halved text-sm"></i>
                    </div>
                    <div>
                        <h2 class="text-sm font-extrabold text-white tracking-tight">Kiểm Duyệt Chất Lượng Toàn Chapter (QC)</h2>
                        <p class="text-[10.5px] text-slate-400">Tự động phát hiện lỗi tràn chữ, ô sót chưa dịch và lệch cỡ chữ</p>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <button id="btn-qc-rescan" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer">
                        <i class="fa-solid fa-rotate text-indigo-400"></i>
                        <span>Quét lại</span>
                    </button>
                    <button id="btn-close-qc-modal" class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 flex items-center justify-center transition-all cursor-pointer ml-1">
                        <i class="fa-solid fa-xmark text-xs"></i>
                    </button>
                </div>
            </div>

            <!-- Body Content -->
            <div id="qc-modal-body" class="flex-1 overflow-y-auto p-5 space-y-4">
                <!-- Content will be rendered dynamically -->
            </div>

            <!-- Footer Action Bar -->
            <div class="px-5 py-3 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between shrink-0">
                <button id="btn-qc-auto-fix-all" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-900/30 cursor-pointer">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                    <span>Tự động sửa tất cả lỗi tràn chữ (Auto-Fix)</span>
                </button>

                <div class="flex items-center gap-2">
                    <button id="btn-qc-approve-export" class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-2 transition-all shadow-md shadow-emerald-900/40 cursor-pointer">
                        <i class="fa-solid fa-check-double"></i>
                        <span>Phê duyệt & Xuất bản Chapter</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    modal.querySelector('#btn-close-qc-modal')?.addEventListener('click', closeQcModal);
    modal.querySelector('#btn-qc-rescan')?.addEventListener('click', renderQcContent);
    modal.querySelector('#btn-qc-auto-fix-all')?.addEventListener('click', () => {
        const { fixedCount, newResult } = autoFixAllQcIssues();
        if (fixedCount > 0) {
            showToast(`Đã tự động khắc phục ${fixedCount} vấn đề!`, "success");
            renderQcContentWithResult(newResult);
        } else {
            showToast("Không còn vấn đề nào có thể tự động sửa.", "info");
        }
    });

    modal.querySelector('#btn-qc-approve-export')?.addEventListener('click', () => {
        closeQcModal();
        updateStageStatus('qc', 'completed');
        setPipelineStage('export');
        openExportHubModal();
    });

    return modal;
}

export function renderQcContent(): void {
    const scanResult = runChapterQcScan();
    renderQcContentWithResult(scanResult);
}

function renderQcContentWithResult(scanResult: QcScanResult): void {
    const body = document.getElementById('qc-modal-body');
    if (!body) return;

    const scoreColor = scanResult.score >= 90 ? 'text-emerald-400' :
        scanResult.score >= 70 ? 'text-amber-400' : 'text-rose-400';
    const scoreBg = scanResult.score >= 90 ? 'bg-emerald-500/10 border-emerald-500/30' :
        scanResult.score >= 70 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-rose-500/10 border-rose-500/30';
    const statusText = scanResult.score >= 90 ? 'Xuất sắc — Đạt chuẩn xuất bản' :
        scanResult.score >= 70 ? 'Khá — Có một số cảnh báo cần xem' : 'Cần sửa — Nhiều ô thoại bị lỗi';

    let html = `
        <!-- QC Score Card -->
        <div class="p-4 rounded-2xl border ${scoreBg} flex flex-col sm:flex-row items-center justify-between gap-4">
            <div class="flex items-center gap-4">
                <div class="text-3xl font-black ${scoreColor} tracking-tight">
                    ${scanResult.score}<span class="text-sm text-slate-500 font-normal">/100</span>
                </div>
                <div>
                    <div class="text-xs font-bold text-slate-100">${statusText}</div>
                    <div class="text-[11px] text-slate-400 mt-0.5">Tổng số vấn đề phát hiện: <span class="font-bold text-slate-200">${scanResult.totalIssues}</span></div>
                </div>
            </div>

            <!-- Stats breakdown -->
            <div class="flex items-center gap-2">
                <div class="px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5">
                    <i class="fa-solid fa-circle-xmark text-rose-400"></i>
                    <span>${scanResult.criticalCount} Lỗi nghiêm trọng</span>
                </div>
                <div class="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5">
                    <i class="fa-solid fa-triangle-exclamation text-amber-400"></i>
                    <span>${scanResult.warningCount} Cảnh báo</span>
                </div>
                <div class="px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold flex items-center gap-1.5">
                    <i class="fa-solid fa-circle-info text-indigo-400"></i>
                    <span>${scanResult.infoCount} Ghi chú</span>
                </div>
            </div>
        </div>

        <!-- Issue List -->
        <div class="space-y-2 mt-4">
            <div class="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Danh Sách Chi Tiết Các Điểm Cần Lưu Ý</div>
            ${scanResult.issues.length === 0 ? `
                <div class="p-8 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                    <i class="fa-solid fa-circle-check text-3xl text-emerald-400 mb-2"></i>
                    <div class="text-sm font-bold text-emerald-300">Không tìm thấy lỗi nào!</div>
                    <p class="text-xs text-slate-400 mt-1">Toàn bộ câu thoại trong Chapter đều vừa vặn và sẵn sàng để xuất bản.</p>
                </div>
            ` : scanResult.issues.map(issue => {
                const badgeColor = issue.severity === 'critical' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                    issue.severity === 'warning' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                    'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
                const typeName = issue.type === 'overflow' ? 'Tràn chữ' :
                    issue.type === 'untranslated' ? 'Chưa dịch' :
                    issue.type === 'font_anomaly' ? 'Cỡ chữ bất thường' : 'Ghi chú';

                return `
                    <div class="p-3 rounded-xl bg-slate-950/70 border border-slate-800/90 flex items-start justify-between gap-3 hover:border-slate-700 transition-all">
                        <div class="flex items-start gap-3">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor} shrink-0 mt-0.5">
                                ${typeName}
                            </span>
                            <div>
                                <div class="text-xs font-semibold text-slate-200">${escapeHTML(issue.message)}</div>
                                ${issue.suggestion ? `<div class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1"><i class="fa-solid fa-lightbulb text-amber-400 text-[10px]"></i> ${escapeHTML(issue.suggestion)}</div>` : ''}
                            </div>
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                            <button class="btn-jump-to-issue px-2.5 py-1 rounded bg-slate-800 hover:bg-indigo-600/30 hover:text-indigo-300 text-slate-400 text-[11px] font-medium border border-slate-700/50 transition-all cursor-pointer"
                                data-page="${issue.pageIndex}" data-block="${issue.blockId}">
                                <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i> Nhảy tới ô
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    body.innerHTML = html;

    // Bind Jump to Issue buttons
    body.querySelectorAll('.btn-jump-to-issue').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget as HTMLElement;
            const pageIndex = parseInt(target.getAttribute('data-page') || '0', 10);
            const blockId = target.getAttribute('data-block');

            closeQcModal();
            selectPage(pageIndex);

            if (blockId) {
                globalState.selectedBlockId = blockId;
                requestOverlayRender();
            }
        });
    });
}
