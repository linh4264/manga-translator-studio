/**
 * Manga Translator Studio - Rapid Chapter Script Reviewer UI
 */

import { globalState, savePageToDB, activatePage, debounceSavePage } from '../core/state';
import { elements } from '../core/elements';
import { showToast, escapeHTML } from '../core/utils';
import { getAiConfig, getTranslationContext } from '../features/ai/ai-state';
import { getConfiguredApiEndpoint, getGeminiGenerateContentUrl } from '../features/ai/ai-config';
import { executeAiJsonRequestWithRetry } from '../features/ai/ai-client';
import { parseGeminiJsonText } from '../core/utils/json';
import { requestOverlayRender } from '../features/canvas/canvas-service';
import { setPipelineStage, updateStageStatus } from '../features/pipeline/pipeline-manager';
import { runChapterQcScan } from '../features/pipeline/qc-linter';
import { openQcModal } from './qc-ui';

let isScriptReviewOpen = false;
let activeFilterPage = -1; // -1 means all pages
let searchTerm = '';

export function openScriptReviewModal(): void {
    if (globalState.pages.length === 0) {
        showToast("Chưa có trang truyện nào để biên tập!", "warn");
        return;
    }

    let modal = document.getElementById('script-review-modal');
    if (!modal) {
        modal = createScriptReviewModalDOM();
        document.body.appendChild(modal);
    }

    modal.classList.remove('hidden');
    isScriptReviewOpen = true;
    document.body.style.overflow = 'hidden';

    setPipelineStage('review');
    renderScriptReviewContent();
}



export function closeScriptReviewModal(): void {
    const modal = document.getElementById('script-review-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    isScriptReviewOpen = false;
    document.body.style.overflow = '';
    requestOverlayRender();
}

function createScriptReviewModalDOM(): HTMLElement {
    const modal = document.createElement('div');
    modal.id = 'script-review-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 animate-fade-in select-none';

    modal.innerHTML = `
        <div class="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-6xl h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
            <!-- Header -->
            <div class="px-5 py-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between shrink-0">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
                        <i class="fa-solid fa-pen-to-square text-sm"></i>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h2 class="text-sm font-extrabold text-white tracking-tight">Biên Tập Kịch Bản Toàn Chapter</h2>
                            <span id="script-review-count-badge" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                0 câu thoại
                            </span>
                        </div>
                        <p class="text-[10.5px] text-slate-400">Xem và sửa nhanh tất cả lời thoại của cả tập truyện trên một giao diện thống nhất</p>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <button id="btn-script-find-replace" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer">
                        <i class="fa-solid fa-arrow-right-arrow-left text-indigo-400"></i>
                        <span>Tìm & Thay thế</span>
                    </button>
                    <button id="btn-script-review-apply-qc" class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-900/30 cursor-pointer">
                        <i class="fa-solid fa-check"></i>
                        <span>Hoàn tất & Sang QC</span>
                    </button>
                    <button id="btn-close-script-review" class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 flex items-center justify-center transition-all cursor-pointer ml-1">
                        <i class="fa-solid fa-xmark text-xs"></i>
                    </button>
                </div>
            </div>

            <!-- Toolbar & Filter -->
            <div class="px-5 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div class="flex items-center gap-2 flex-1 min-w-[240px]">
                    <div class="relative flex-1 max-w-sm">
                        <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                        <input id="script-search-input" type="text" placeholder="Tìm kiếm câu thoại trong Chapter..." 
                            class="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none transition-all">
                    </div>

                    <select id="script-page-filter" class="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:border-indigo-500 focus:outline-none transition-all cursor-pointer">
                        <option value="-1">Tất cả các trang</option>
                    </select>
                </div>

                <!-- Find Replace Quick Bar (Toggleable) -->
                <div id="script-find-replace-bar" class="hidden w-full flex items-center gap-2 pt-2 border-t border-slate-800">
                    <input id="script-find-input" type="text" placeholder="Tìm từ..." class="flex-1 px-2.5 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none">
                    <i class="fa-solid fa-arrow-right text-[10px] text-slate-500"></i>
                    <input id="script-replace-input" type="text" placeholder="Thay bằng..." class="flex-1 px-2.5 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none">
                    <button id="btn-exec-replace-all" class="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold transition-all cursor-pointer">
                        Thay thế tất cả
                    </button>
                </div>
            </div>

            <!-- Content Area: Script Rows -->
            <div id="script-review-scroll-container" class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 select-text">
                <!-- Grouped pages will be rendered here -->
            </div>
        </div>
    `;

    // Bind event handlers
    modal.querySelector('#btn-close-script-review')?.addEventListener('click', closeScriptReviewModal);
    modal.querySelector('#btn-script-review-apply-qc')?.addEventListener('click', () => {
        closeScriptReviewModal();
        updateStageStatus('review', 'completed');
        setPipelineStage('qc');
        openQcModal();
    });

    const searchInput = modal.querySelector('#script-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
        searchTerm = (e.target as HTMLInputElement).value.trim().toLowerCase();
        renderScriptReviewContent();
    });

    const pageFilter = modal.querySelector('#script-page-filter') as HTMLSelectElement;
    pageFilter?.addEventListener('change', (e) => {
        activeFilterPage = parseInt((e.target as HTMLSelectElement).value, 10);
        renderScriptReviewContent();
    });

    const findReplaceBtn = modal.querySelector('#btn-script-find-replace');
    const findReplaceBar = modal.querySelector('#script-find-replace-bar');
    findReplaceBtn?.addEventListener('click', () => {
        findReplaceBar?.classList.toggle('hidden');
    });

    const execReplaceBtn = modal.querySelector('#btn-exec-replace-all');
    execReplaceBtn?.addEventListener('click', () => {
        const findVal = (modal.querySelector('#script-find-input') as HTMLInputElement)?.value;
        const replaceVal = (modal.querySelector('#script-replace-input') as HTMLInputElement)?.value;
        if (!findVal) {
            showToast("Vui lòng nhập từ cần tìm.", "warn");
            return;
        }
        executeFindAndReplace(findVal, replaceVal);
    });

    return modal;
}

export function renderScriptReviewContent(): void {
    const container = document.getElementById('script-review-scroll-container');
    const countBadge = document.getElementById('script-review-count-badge');
    const pageFilter = document.getElementById('script-page-filter') as HTMLSelectElement;
    if (!container) return;

    const pages = globalState.pages || [];
    let totalBlocks = 0;

    // Populate page dropdown if needed
    if (pageFilter && pageFilter.options.length <= 1) {
        pageFilter.innerHTML = '<option value="-1">Tất cả các trang</option>' +
            pages.map((p, i) => `<option value="${i}">Trang ${i + 1} (${p.name || ''})</option>`).join('');
    }

    let html = '';

    pages.forEach((page, pageIndex) => {
        if (activeFilterPage !== -1 && activeFilterPage !== pageIndex) return;

        const blocks = page.blocks || [];
        const matchingBlocks = blocks.filter(b => {
            if (!searchTerm) return true;
            const orig = (b.original || '').toLowerCase();
            const trans = (b.translated || '').toLowerCase();
            return orig.includes(searchTerm) || trans.includes(searchTerm);
        });

        if (matchingBlocks.length === 0 && searchTerm) return;

        totalBlocks += blocks.length;

        html += `
            <div class="bg-slate-950/60 border border-slate-800/80 rounded-xl overflow-hidden shadow-sm mb-4">
                <div class="px-4 py-2 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-indigo-400"></span>
                        <span class="text-xs font-bold text-slate-200">Trang ${pageIndex + 1}</span>
                        <span class="text-[11px] text-slate-500 font-mono">(${page.name || `Trang_${pageIndex + 1}`})</span>
                    </div>
                    <span class="text-[10.5px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-medium">
                        ${blocks.length} ô thoại
                    </span>
                </div>

                <div class="divide-y divide-slate-800/50 p-2 sm:p-3 space-y-2">
                    ${matchingBlocks.length === 0 ? `
                        <div class="py-4 text-center text-xs text-slate-500">Trang này chưa có ô thoại nào.</div>
                    ` : matchingBlocks.map((block, blockIndex) => {
                        const blockId = block.id || `p${pageIndex + 1}_b${blockIndex + 1}`;
                        const typeLabel = block.type === 'narration' ? 'Dẫn truyện' :
                            block.type === 'thought' ? 'Suy nghĩ' :
                            block.type === 'sfx' ? 'Âm thanh' : 'Thoại';

                        return `
                            <div class="p-2.5 rounded-lg bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/50 transition-all flex flex-col md:flex-row items-start gap-3" data-page="${pageIndex}" data-block="${block.id}">
                                <!-- Left: Meta & Type -->
                                <div class="w-full md:w-32 shrink-0 flex md:flex-col items-center md:items-start justify-between gap-1">
                                    <span class="text-[10px] font-mono text-indigo-400 font-bold">[${blockId}]</span>
                                    <span class="text-[9.5px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/50 font-medium">${typeLabel}</span>
                                </div>

                                <!-- Middle: Original Text -->
                                <div class="w-full md:w-5/12 p-2 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-300 select-text leading-relaxed font-sans min-h-[44px]">
                                    <div class="text-[9.5px] text-slate-500 font-semibold mb-0.5 uppercase tracking-wider">Tiếng gốc:</div>
                                    <div>${escapeHTML(block.original || '(Chưa có text gốc)')}</div>
                                </div>

                                <!-- Right: Translated Text (Editable) & AI Tools -->
                                <div class="w-full md:w-7/12 flex flex-col gap-1.5">
                                    <div class="relative">
                                        <textarea class="script-trans-input w-full p-2 bg-slate-950 border border-slate-700/80 focus:border-indigo-500 rounded-lg text-xs text-emerald-300 font-medium leading-relaxed focus:outline-none transition-all resize-y min-h-[52px]"
                                            data-page="${pageIndex}" data-block="${block.id}" placeholder="Nhập bản dịch tiếng Việt...">${escapeHTML(block.translated || '')}</textarea>
                                    </div>

                                    <!-- Quick AI Action Toolbar -->
                                    <div class="flex items-center gap-1.5 flex-wrap">
                                        <button class="btn-ai-polish text-[10px] px-2 py-0.5 rounded bg-slate-800/80 hover:bg-indigo-600/30 hover:text-indigo-300 text-slate-400 border border-slate-700/40 transition-all flex items-center gap-1 cursor-pointer"
                                            data-action="natural" data-page="${pageIndex}" data-block="${block.id}" title="Làm câu văn mượt mà, tự nhiên hơn">
                                            <i class="fa-solid fa-wand-magic-sparkles text-[9px] text-indigo-400"></i>
                                            <span>Mượt mà</span>
                                        </button>
                                        <button class="btn-ai-polish text-[10px] px-2 py-0.5 rounded bg-slate-800/80 hover:bg-amber-600/30 hover:text-amber-300 text-slate-400 border border-slate-700/40 transition-all flex items-center gap-1 cursor-pointer"
                                            data-action="shorten" data-page="${pageIndex}" data-block="${block.id}" title="Rút ngắn câu để vừa bubble hẹp">
                                            <i class="fa-solid fa-compress text-[9px] text-amber-400"></i>
                                            <span>Rút gọn</span>
                                        </button>
                                        <button class="btn-ai-polish text-[10px] px-2 py-0.5 rounded bg-slate-800/80 hover:bg-purple-600/30 hover:text-purple-300 text-slate-400 border border-slate-700/40 transition-all flex items-center gap-1 cursor-pointer"
                                            data-action="funny" data-page="${pageIndex}" data-block="${block.id}" title="Chuyển giọng điệu hài hước, dí dỏm">
                                            <i class="fa-solid fa-face-laugh-beam text-[9px] text-purple-400"></i>
                                            <span>Hài hước</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    });

    container.innerHTML = html || '<div class="py-12 text-center text-sm text-slate-500">Không tìm thấy câu thoại nào.</div>';

    if (countBadge) {
        countBadge.textContent = `${totalBlocks} câu thoại`;
    }

    // Bind real-time input change handlers
    container.querySelectorAll('.script-trans-input').forEach(el => {
        el.addEventListener('input', (e) => {
            const target = e.target as HTMLTextAreaElement;
            const pageIndex = parseInt(target.getAttribute('data-page') || '0', 10);
            const blockId = target.getAttribute('data-block');
            const newText = target.value;

            const page = globalState.pages[pageIndex];
            if (page && page.blocks) {
                const block = page.blocks.find(b => b.id === blockId);
                if (block) {
                    block.translated = newText;
                    block.autoFitCache = null;
                    debounceSavePage(page);
                }
            }
        });
    });

    // Bind AI Polish buttons
    container.querySelectorAll('.btn-ai-polish').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const target = (e.currentTarget as HTMLElement);
            const action = target.getAttribute('data-action') as 'natural' | 'shorten' | 'funny';
            const pageIndex = parseInt(target.getAttribute('data-page') || '0', 10);
            const blockId = target.getAttribute('data-block');

            await polishSingleBlockWithAi(pageIndex, blockId || '', action, target);
        });
    });
}

async function polishSingleBlockWithAi(pageIndex: number, blockId: string, action: 'natural' | 'shorten' | 'funny', btnEl: HTMLElement): Promise<void> {
    const page = globalState.pages[pageIndex];
    if (!page || !page.blocks) return;
    const block = page.blocks.find(b => b.id === blockId);
    if (!block || !block.translated) {
        showToast("Chưa có bản dịch để trau chuốt.", "warn");
        return;
    }

    const aiConfig = getAiConfig();
    const keyToUse = aiConfig.apiKey;
    if (!keyToUse && aiConfig.aiProvider !== 'custom') {
        showToast("Cần có Gemini API Key để dùng tính năng Polish.", "warn");
        return;
    }

    const originalBtnText = btnEl.innerHTML;
    btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-[9px]"></i> Đang sửa...';
    btnEl.classList.add('pointer-events-none', 'opacity-60');

    let instruction = "Làm câu thoại tự nhiên, mượt mà, thuần Việt hơn cho manga.";
    if (action === 'shorten') instruction = "Rút ngắn câu văn tối đa mà vẫn giữ nguyên ý nghĩa cốt lõi để vừa khung thoại hẹp.";
    if (action === 'funny') instruction = "Viết lại câu thoại theo phong cách hài hước, hóm hỉnh, bắt trend tự nhiên.";

    const promptText = `Hãy trau chuốt lại câu dịch sau theo yêu cầu: "${instruction}"\n\nCâu gốc: "${block.original}"\nBản dịch hiện tại: "${block.translated}"\n\nChỉ trả về duy nhất 1 câu dịch hoàn chỉnh, không thêm giải thích hay dấu ngoặc kép thừa.`;

    try {
        const apiUrl = getGeminiGenerateContentUrl(aiConfig.translationModel || 'gemini-2.5-flash', keyToUse);
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: { temperature: 0.5, maxOutputTokens: 256 }
            })
        });

        const data = await res.json();
        const polishedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

        if (polishedText) {
            block.translated = polishedText;
            block.autoFitCache = null;
            savePageToDB(page);

            // Update textarea in DOM
            const textarea = document.querySelector(`.script-trans-input[data-block="${blockId}"]`) as HTMLTextAreaElement;
            if (textarea) textarea.value = polishedText;

            showToast("Đã trau chuốt câu thành công!", "success");
        }
    } catch (e: any) {
        console.error("Lỗi AI Polish:", e);
        showToast(`Không thể trau chuốt: ${e.message || e}`, "error");
    } finally {
        btnEl.innerHTML = originalBtnText;
        btnEl.classList.remove('pointer-events-none', 'opacity-60');
    }
}

function executeFindAndReplace(findText: string, replaceText: string): void {
    let replacedCount = 0;
    const pages = globalState.pages || [];

    pages.forEach(page => {
        let pageModified = false;
        (page.blocks || []).forEach(block => {
            if (block.translated && block.translated.includes(findText)) {
                block.translated = block.translated.replaceAll(findText, replaceText);
                block.autoFitCache = null;
                pageModified = true;
                replacedCount++;
            }
        });
        if (pageModified) {
            savePageToDB(page);
        }
    });

    if (replacedCount > 0) {
        showToast(`Đã thay thế thành công ${replacedCount} vị trí trong Chapter!`, "success");
        renderScriptReviewContent();
    } else {
        showToast(`Không tìm thấy từ "${findText}" trong bản dịch.`, "info");
    }
}
