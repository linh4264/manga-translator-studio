/**
 * Manga Translator Studio - 7-Step Pipeline Header Stepper UI Component
 */

import { globalState } from '../core/state';
import { globalBus } from '../core/events';
import { PIPELINE_STAGES, PipelineStageId } from '../types/pipeline-types';
import { getPipelineData, setPipelineStage, autoUpdatePipelineStages } from '../features/pipeline/pipeline-manager';
import { runAutoPilotChapterPipeline, stopAutoPilot, getIsAutoPilotRunning } from '../features/pipeline/pipeline-orchestrator';
import { openScriptReviewModal } from './script-review-ui';
import { openQcModal } from './qc-ui';
import { openExportHubModal } from './export-hub-ui';
import { initUserProfileUI } from './user-profile-ui';
import { isProUser, isExpertMode, requireProFeature } from '../features/auth/auth-manager';
import { showToast } from '../core/utils';

export function initPipelineHeader(): void {
    initUserProfileUI();
    renderPipelineHeaderStepper();
    initToolsMenuDropdown();

    globalBus.subscribe('pipeline:stage-changed', () => renderPipelineHeaderStepper());
    globalBus.subscribe('pipeline:status-changed', () => renderPipelineHeaderStepper());
    globalBus.subscribe('pipeline:metadata-changed', () => renderPipelineHeaderStepper());
    globalBus.subscribe('auth:tier-changed', () => renderPipelineHeaderStepper());
    globalBus.subscribe('auth:state-changed', () => renderPipelineHeaderStepper());
    globalBus.subscribe('pages:updated', () => {
        autoUpdatePipelineStages();
        renderPipelineHeaderStepper();
    });
}

function initToolsMenuDropdown(): void {
    const btn = document.getElementById('btn-header-tools-menu');
    const dropdown = document.getElementById('header-tools-dropdown');
    if (!btn || !dropdown) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.classList.contains('hidden') && !dropdown.contains(e.target as Node) && e.target !== btn) {
            dropdown.classList.add('hidden');
        }
    });
}

export function renderPipelineHeaderStepper(): void {
    const container = document.getElementById('app-stepper');
    if (!container) return;

    const isPro = isProUser();
    const isExpert = isExpertMode();

    // In Basic / Zen mode, hide the 7-step stepper for a distraction-free clean experience
    if (!isPro || !isExpert) {
        container.classList.add('hidden');
        container.classList.remove('md:flex');
        syncHeaderSmartCtaButton();
        return;
    }

    // In Pro Studio mode, show full 7-step interactive stepper
    container.classList.remove('hidden');
    container.classList.add('md:flex');

    const pipeline = getPipelineData();
    const currentStage = pipeline.currentStage;
    const stages: PipelineStageId[] = ['import', 'ocr', 'translate', 'review', 'typeset', 'qc', 'export'];

    let html = '';

    stages.forEach((stageId, index) => {
        const stageInfo = PIPELINE_STAGES[stageId];
        const status = pipeline.stageStatuses[stageId];
        const isActive = currentStage === stageId;

        let statusClass = 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80';
        let statusIcon = stageInfo.icon;

        if (status === 'completed') {
            statusClass = 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold';
            statusIcon = 'fa-check';
        } else if (status === 'running' || (pipeline.autoPilotRunning && isActive)) {
            statusClass = 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/50 animate-pulse font-bold';
            statusIcon = 'fa-spinner fa-spin';
        } else if (status === 'needs_review') {
            statusClass = 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold';
            statusIcon = 'fa-triangle-exclamation';
        } else if (isActive) {
            statusClass = 'bg-indigo-600 text-white font-bold shadow-sm';
        }

        html += `
            <button class="pipeline-step-btn flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] whitespace-nowrap transition-all cursor-pointer ${statusClass}"
                data-stage="${stageId}" title="${stageInfo.description}">
                <i class="fa-solid ${statusIcon} text-[9px]"></i>
                <span>${stageInfo.name}</span>
            </button>
        `;

        if (index < stages.length - 1) {
            html += `<i class="fa-solid fa-chevron-right text-[6.5px] text-slate-700 mx-0.5"></i>`;
        }
    });

    container.innerHTML = html;

    // Bind step navigation
    container.querySelectorAll('.pipeline-step-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget as HTMLElement;
            const stage = target.getAttribute('data-stage') as PipelineStageId;
            handleStepClick(stage);
        });
    });

    // Update Right Smart CTA button dynamically
    syncHeaderSmartCtaButton();
}

function syncHeaderSmartCtaButton(): void {
    const ctaBtn = document.getElementById('header-btn-batch-translate');
    if (!ctaBtn) return;

    const pipeline = getPipelineData();
    const isAutoRunning = getIsAutoPilotRunning();
    const isPro = isProUser();

    if (isAutoRunning) {
        ctaBtn.className = "h-7 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-extrabold flex items-center gap-1.5 shadow-md shadow-rose-900/40 animate-pulse transition-all cursor-pointer";
        ctaBtn.innerHTML = `<i class="fa-solid fa-stop text-[9.5px]"></i> <span>Dừng (${pipeline.autoPilotProgress}%)</span>`;
        ctaBtn.setAttribute('title', 'Tạm dừng tiến trình Auto-Pilot');
    } else if (globalState.pages.length === 0) {
        ctaBtn.className = "h-7 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md shadow-indigo-900/30 transition-all cursor-pointer";
        ctaBtn.innerHTML = `<i class="fa-solid fa-plus text-[9.5px]"></i> <span>Nhập Truyện</span>`;
        ctaBtn.setAttribute('title', 'Tải ảnh truyện lên để bắt đầu');
    } else if (!isPro) {
        // Basic user Smart CTA: Clean 1-Click Translate (Batch or Single with Flash-Lite)
        const pageCount = globalState.pages.length;
        const btnText = pageCount > 1 ? `Dịch Toàn Bộ (${pageCount})` : `Dịch Trang Này`;
        ctaBtn.className = "h-7 px-3.5 rounded-lg bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md hover:shadow-indigo-500/25 transition-all cursor-pointer";
        ctaBtn.innerHTML = `<i class="fa-solid fa-bolt text-yellow-300 text-[10px]"></i> <span>${btnText}</span>`;
        ctaBtn.setAttribute('title', `Tự động dịch ${pageCount} trang bằng Gemini 3.1 Flash-Lite siêu tốc`);
    } else if (pipeline.stageStatuses.translate !== 'completed') {

        ctaBtn.className = "h-7 px-3 rounded-lg bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md hover:shadow-indigo-500/25 transition-all cursor-pointer";
        ctaBtn.innerHTML = `<i class="fa-solid fa-bolt text-yellow-300 text-[10px]"></i> <span>Auto-Pilot</span>`;
        ctaBtn.setAttribute('title', 'Chạy Auto-Pilot tự động toàn bộ Chapter');
    } else if (pipeline.stageStatuses.review !== 'completed') {
        ctaBtn.className = "h-7 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md shadow-amber-900/30 transition-all cursor-pointer";
        ctaBtn.innerHTML = `<i class="fa-solid fa-pen-to-square text-[9.5px]"></i> <span>Kịch Bản</span>`;
        ctaBtn.setAttribute('title', 'Mở bảng biên tập kịch bản toàn Chapter');
    } else if (!pipeline.lastQcResult || !pipeline.lastQcResult.passed) {
        ctaBtn.className = "h-7 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md shadow-indigo-900/30 transition-all cursor-pointer";
        ctaBtn.innerHTML = `<i class="fa-solid fa-shield-halved text-[9.5px]"></i> <span>Kiểm Tra QC</span>`;
        ctaBtn.setAttribute('title', 'Kiểm duyệt chất lượng toàn Chapter');
    } else {
        ctaBtn.className = "h-7 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold flex items-center gap-1.5 shadow-md shadow-emerald-900/40 transition-all cursor-pointer";
        ctaBtn.innerHTML = `<i class="fa-solid fa-file-export text-[9.5px]"></i> <span>Xuất Bản</span>`;
        ctaBtn.setAttribute('title', 'Mở trung tâm xuất bản Chapter');
    }
}

function handleStepClick(stage: PipelineStageId): void {
    setPipelineStage(stage);

    if (stage === 'import') {
        const uploadBtn = document.getElementById('btn-upload-files') || document.getElementById('file-input');
        uploadBtn?.click();
    } else if (stage === 'ocr' || stage === 'translate') {
        if (!getIsAutoPilotRunning()) {
            runAutoPilotChapterPipeline();
        }
    } else if (stage === 'review') {
        openScriptReviewModal();
    } else if (stage === 'typeset') {
        showToast("Đang ở chế độ Typeset trên Canvas.", "info");
    } else if (stage === 'qc') {
        openQcModal();
    } else if (stage === 'export') {
        openExportHubModal();
    }

}
