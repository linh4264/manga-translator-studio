/**
 * Manga Translator Studio - Chapter Export Hub & Production Report UI
 */

import { globalState } from '../core/state';
import { elements } from '../core/elements';
import { showToast, escapeHTML } from '../core/utils';
import { runBatchExport, runPdfExport, exportProjectBackupJSON } from '../features/io';
import { recalculateChapterStats, setPipelineStage, updateStageStatus } from '../features/pipeline/pipeline-manager';

let isExportHubOpen = false;

export function openExportHubModal(): void {
    if (globalState.pages.length === 0) {
        showToast("Chưa có trang truyện nào để xuất bản!", "warn");
        return;
    }

    let modal = document.getElementById('export-hub-modal');
    if (!modal) {
        modal = createExportHubModalDOM();
        document.body.appendChild(modal);
    }

    modal.classList.remove('hidden');
    isExportHubOpen = true;
    document.body.style.overflow = 'hidden';

    setPipelineStage('export');
    updateStageStatus('export', 'running');
    renderExportHubContent();
}

export function closeExportHubModal(): void {
    const modal = document.getElementById('export-hub-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    isExportHubOpen = false;
    document.body.style.overflow = '';
}

function createExportHubModalDOM(): HTMLElement {
    const modal = document.createElement('div');
    modal.id = 'export-hub-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 animate-fade-in select-none';

    modal.innerHTML = `
        <div class="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
            <!-- Header -->
            <div class="px-5 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between shrink-0">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
                        <i class="fa-solid fa-file-export text-base"></i>
                    </div>
                    <div>
                        <h2 class="text-sm font-extrabold text-white tracking-tight">Trung Tâm Xuất Bản Chapter (Export Hub)</h2>
                        <p class="text-[10.5px] text-slate-400">Đóng gói thành phẩm chất lượng cao và xuất bản đa định dạng với 1 click</p>
                    </div>
                </div>

                <button id="btn-close-export-hub" class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 flex items-center justify-center transition-all cursor-pointer">
                    <i class="fa-solid fa-xmark text-xs"></i>
                </button>
            </div>

            <!-- Body -->
            <div id="export-hub-modal-body" class="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
                <!-- Dynamic Content -->
            </div>
        </div>
    `;

    modal.querySelector('#btn-close-export-hub')?.addEventListener('click', closeExportHubModal);
    return modal;
}

export function renderExportHubContent(): void {
    const body = document.getElementById('export-hub-modal-body');
    if (!body) return;

    const stats = recalculateChapterStats();
    const totalPages = globalState.pages.length;
    const hoursSaved = (stats.estimatedSavedMinutes / 60).toFixed(1);

    body.innerHTML = `
        <!-- Chapter Summary Card -->
        <div class="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-900 to-emerald-950/30 border border-indigo-500/30 shadow-lg">
            <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            🎉 Sẵn sàng xuất bản
                        </span>
                        <span class="text-xs text-slate-400 font-mono">${totalPages} Trang hoàn chỉnh</span>
                    </div>
                    <h3 class="text-lg font-black text-white mt-1">Báo Cáo Sản Xuất Chapter</h3>
                </div>

                <!-- Highlight Metric -->
                <div class="px-4 py-2 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
                    <i class="fa-solid fa-hourglass-half text-xl text-amber-400"></i>
                    <div>
                        <div class="text-[10px] text-slate-400 uppercase font-semibold">Thời gian tiết kiệm</div>
                        <div class="text-sm font-black text-emerald-400">~${hoursSaved} Giờ làm việc</div>
                    </div>
                </div>
            </div>

            <!-- Metrics Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800/80">
                <div class="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                    <div class="text-[10px] text-slate-500 font-medium">Tổng số trang</div>
                    <div class="text-sm font-bold text-slate-200 mt-0.5">${totalPages} trang</div>
                </div>
                <div class="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                    <div class="text-[10px] text-slate-500 font-medium">Khung thoại đã dịch</div>
                    <div class="text-sm font-bold text-indigo-300 mt-0.5">${stats.totalDialogueBlocks} câu</div>
                </div>
                <div class="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                    <div class="text-[10px] text-slate-500 font-medium">Tổng từ tiếng Việt</div>
                    <div class="text-sm font-bold text-emerald-300 mt-0.5">${stats.totalWordsTranslated} từ</div>
                </div>
                <div class="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                    <div class="text-[10px] text-slate-500 font-medium">Điểm chất lượng QC</div>
                    <div class="text-sm font-bold text-amber-300 mt-0.5">${globalState.pipeline?.lastQcResult?.score || 100}/100</div>
                </div>
            </div>
        </div>

        <!-- Export Presets Grid -->
        <div>
            <div class="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Chọn Định Dạng Xuất Bản</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <!-- 1. Web-Ready ZIP (WebP / JPG) -->
                <div class="p-4 rounded-xl bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-indigo-500/50 transition-all flex flex-col justify-between group">
                    <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center font-bold text-base shrink-0 group-hover:scale-105 transition-all">
                            <i class="fa-solid fa-file-zipper"></i>
                        </div>
                        <div>
                            <div class="text-xs font-bold text-white flex items-center gap-1.5">
                                <span>Gói ZIP Web-Ready</span>
                                <span class="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-semibold uppercase">Đề xuất cho Web</span>
                            </div>
                            <p class="text-[11px] text-slate-400 mt-1">Định dạng nén WebP/JPG tối ưu dung lượng nhẹ, tải siêu nhanh cho độc giả online.</p>
                        </div>
                    </div>
                    <button id="btn-export-zip-web" class="mt-4 w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-indigo-900/30">
                        <i class="fa-solid fa-download"></i> Tải Gói ZIP Web (WebP)
                    </button>
                </div>

                <!-- 2. Master HD ZIP (PNG) -->
                <div class="p-4 rounded-xl bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-emerald-500/50 transition-all flex flex-col justify-between group">
                    <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold text-base shrink-0 group-hover:scale-105 transition-all">
                            <i class="fa-solid fa-gem"></i>
                        </div>
                        <div>
                            <div class="text-xs font-bold text-white flex items-center gap-1.5">
                                <span>Gói ZIP Master HD (Lossless)</span>
                                <span class="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-semibold uppercase">Lưu trữ</span>
                            </div>
                            <p class="text-[11px] text-slate-400 mt-1">Giữ nguyên định dạng PNG gốc độ nét cực cao, không suy hao chi tiết nét vẽ.</p>
                        </div>
                    </div>
                    <button id="btn-export-zip-png" class="mt-4 w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-900/30">
                        <i class="fa-solid fa-download"></i> Tải Gói ZIP Master (PNG)
                    </button>
                </div>

                <!-- 3. High-Definition PDF -->
                <div class="p-4 rounded-xl bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-rose-500/50 transition-all flex flex-col justify-between group">
                    <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center font-bold text-base shrink-0 group-hover:scale-105 transition-all">
                            <i class="fa-solid fa-file-pdf"></i>
                        </div>
                        <div>
                            <div class="text-xs font-bold text-white flex items-center gap-1.5">
                                <span>Sách Điện Tử PDF (HD)</span>
                                <span class="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-semibold uppercase">E-Book</span>
                            </div>
                            <p class="text-[11px] text-slate-400 mt-1">Xuất thành 1 file PDF nguyên tập chuẩn lật trang, đọc mượt trên iPad/Kindle.</p>
                        </div>
                    </div>
                    <button id="btn-export-pdf" class="mt-4 w-full py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-rose-900/30">
                        <i class="fa-solid fa-download"></i> Tải File PDF Chapter
                    </button>
                </div>

                <!-- 4. Project Archive (.json) & GDrive -->
                <div class="p-4 rounded-xl bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-amber-500/50 transition-all flex flex-col justify-between group">
                    <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold text-base shrink-0 group-hover:scale-105 transition-all">
                            <i class="fa-solid fa-box-archive"></i>
                        </div>
                        <div>
                            <div class="text-xs font-bold text-white flex items-center gap-1.5">
                                <span>Lưu Trữ Dự Án (.JSON)</span>
                                <span class="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold uppercase">Backup</span>
                            </div>
                            <p class="text-[11px] text-slate-400 mt-1">Đóng gói toàn bộ tọa độ, bản dịch và layer để mở lại chỉnh sửa bất kỳ lúc nào.</p>
                        </div>
                    </div>
                    <div class="mt-4 flex items-center gap-2">
                        <button id="btn-export-project-json" class="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer">
                            <i class="fa-solid fa-code"></i> Tải File Backup
                        </button>
                        <button id="btn-export-gdrive" class="px-3.5 py-2 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-300 text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer">
                            <i class="fa-brands fa-google-drive"></i> GDrive
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Bind action buttons
    body.querySelector('#btn-export-zip-web')?.addEventListener('click', async () => {
        showToast("Đang kết xuất gói ZIP Web-Ready...", "info");
        await runBatchExport({ format: 'webp', quality: 0.9 });
        updateStageStatus('export', 'completed');
    });

    body.querySelector('#btn-export-zip-png')?.addEventListener('click', async () => {
        showToast("Đang kết xuất gói ZIP Master HD (PNG)...", "info");
        await runBatchExport({ format: 'png' });
        updateStageStatus('export', 'completed');
    });

    body.querySelector('#btn-export-pdf')?.addEventListener('click', async () => {
        showToast("Đang tạo file PDF Chapter...", "info");
        await runPdfExport({ quality: 'hd' });
        updateStageStatus('export', 'completed');
    });

    body.querySelector('#btn-export-project-json')?.addEventListener('click', () => {
        exportProjectBackupJSON();
    });

    body.querySelector('#btn-export-gdrive')?.addEventListener('click', () => {
        import('../features/gdrive').then(m => m.openGDriveModal());
    });
}
