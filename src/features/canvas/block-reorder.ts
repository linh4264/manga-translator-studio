/**
 * Manga Translator Studio - Block Re-ordering & Manual Numbering Engine
 * Allows scanlators to easily reorder and number translation boxes manually
 * via interactive click sequencing or 1-click RTL/TTB presets.
 */

import { globalState, savePageToDB, pushStateToHistory } from '../../core/state';
import { showToast, escapeHTML } from '../../core/utils';
import { sortMangaReadingOrder, sortManhwaReadingOrder } from '../ocr/ocr-service';
import { requestOverlayRender } from './canvas-service';

let isNumberingMode = false;
let numberedBlockIds: string[] = [];

export function isNumberingModeActive(): boolean {
    return isNumberingMode;
}

export function getNumberedIndex(blockId: string): number | null {
    if (!isNumberingMode) return null;
    const idx = numberedBlockIds.indexOf(blockId);
    return idx !== -1 ? (idx + 1) : null;
}

export function toggleNumberingMode(): void {
    if (isNumberingMode) {
        finishNumberingMode();
    } else {
        startNumberingMode();
    }
}

export function startNumberingMode(): void {
    if (globalState.activePageIndex < 0 || globalState.activePageIndex >= globalState.pages.length) {
        showToast("Vui lòng mở một trang truyện trước khi đánh số thứ tự.", "warn");
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks || page.blocks.length === 0) {
        showToast("Trang hiện tại chưa có ô dịch nào.", "info");
        return;
    }

    isNumberingMode = true;
    numberedBlockIds = [];

    renderNumberingToolbar();
    requestOverlayRender();
    showToast("🔢 Chế độ Đánh Số Thứ Tự: Nhấp lần lượt từng ô thoại theo thứ tự bạn muốn.", "info");
}

export function handleNumberingClick(blockId: string): boolean {
    if (!isNumberingMode) return false;

    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks) return false;

    const existingIdx = numberedBlockIds.indexOf(blockId);
    if (existingIdx !== -1) {
        // If already selected, remove it from sequence
        numberedBlockIds.splice(existingIdx, 1);
    } else {
        numberedBlockIds.push(blockId);
    }

    updateNumberingToolbar();
    requestOverlayRender();

    // Auto-finish if all blocks are numbered
    if (numberedBlockIds.length === page.blocks.length) {
        showToast(`🎉 Đã đánh số đủ ${page.blocks.length}/${page.blocks.length} ô thoại! Bấm "Hoàn tất" để lưu.`, "success");
    }

    return true;
}

export function finishNumberingMode(): void {
    if (!isNumberingMode) return;

    const page = globalState.pages[globalState.activePageIndex];
    if (page && page.blocks && page.blocks.length > 0) {
        pushStateToHistory();

        // Build new block array: numbered blocks first in chosen sequence, then unclicked ones
        const blockMap = new Map<string, any>();
        page.blocks.forEach(b => blockMap.set(b.id, b));

        const newBlocks: any[] = [];
        const seenIds = new Set<string>();

        numberedBlockIds.forEach(id => {
            if (blockMap.has(id)) {
                newBlocks.push(blockMap.get(id));
                seenIds.add(id);
            }
        });

        // Append remaining unclicked blocks in their original relative order
        page.blocks.forEach(b => {
            if (!seenIds.has(b.id)) {
                newBlocks.push(b);
            }
        });

        // Re-index IDs cleanly: p{page}_b1, p{page}_b2...
        const pageIdx = globalState.activePageIndex;
        page.blocks = newBlocks.map((b, idx) => ({
            ...b,
            id: `p${pageIdx + 1}_b${idx + 1}`
        }));

        savePageToDB(page);
        showToast(`✓ Đã lưu thứ tự ${page.blocks.length} ô thoại thành công!`, "success");
    }

    isNumberingMode = false;
    numberedBlockIds = [];
    removeNumberingToolbar();
    requestOverlayRender();
}

export function cancelNumberingMode(): void {
    isNumberingMode = false;
    numberedBlockIds = [];
    removeNumberingToolbar();
    requestOverlayRender();
    showToast("Đã hủy chế độ đánh số.", "info");
}

export function applyMangaSortToActivePage(): void {
    if (globalState.activePageIndex < 0 || globalState.activePageIndex >= globalState.pages.length) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks || page.blocks.length <= 1) return;

    pushStateToHistory();
    const sorted = sortMangaReadingOrder(page.blocks);
    const pageIdx = globalState.activePageIndex;
    page.blocks = sorted.map((b, idx) => ({
        ...b,
        id: `p${pageIdx + 1}_b${idx + 1}`
    }));

    if (isNumberingMode) {
        numberedBlockIds = page.blocks.map(b => b.id);
        updateNumberingToolbar();
    }

    savePageToDB(page);
    requestOverlayRender();
    showToast(`✓ Đã sắp xếp ${page.blocks.length} ô thoại theo phong cách Manga (Phải qua Trái)!`, "success");
}

export function applyManhwaSortToActivePage(): void {
    if (globalState.activePageIndex < 0 || globalState.activePageIndex >= globalState.pages.length) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks || page.blocks.length <= 1) return;

    pushStateToHistory();
    const sorted = sortManhwaReadingOrder(page.blocks);
    const pageIdx = globalState.activePageIndex;
    page.blocks = sorted.map((b, idx) => ({
        ...b,
        id: `p${pageIdx + 1}_b${idx + 1}`
    }));

    if (isNumberingMode) {
        numberedBlockIds = page.blocks.map(b => b.id);
        updateNumberingToolbar();
    }

    savePageToDB(page);
    requestOverlayRender();
    showToast(`✓ Đã sắp xếp ${page.blocks.length} ô thoại theo phong cách Webtoon (Trên xuống Dưới)!`, "success");
}

export function moveBlockOrder(pageIndex: number, blockId: string, direction: 'up' | 'down'): void {
    if (pageIndex < 0 || pageIndex >= globalState.pages.length) return;
    const page = globalState.pages[pageIndex];
    if (!page || !page.blocks || page.blocks.length <= 1) return;

    const idx = page.blocks.findIndex(b => b.id === blockId);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= page.blocks.length) return;

    pushStateToHistory();

    // Swap blocks
    const temp = page.blocks[idx];
    page.blocks[idx] = page.blocks[targetIdx];
    page.blocks[targetIdx] = temp;

    // Re-index IDs
    page.blocks = page.blocks.map((b, i) => ({
        ...b,
        id: `p${pageIndex + 1}_b${i + 1}`
    }));

    savePageToDB(page);
    requestOverlayRender();
}

export function setBlockOrderIndex(pageIndex: number, blockId: string, new1BasedIndex: number): void {
    if (pageIndex < 0 || pageIndex >= globalState.pages.length) return;
    const page = globalState.pages[pageIndex];
    if (!page || !page.blocks || page.blocks.length <= 1) return;

    const currentIdx = page.blocks.findIndex(b => b.id === blockId);
    if (currentIdx === -1) return;

    const target0Idx = Math.max(0, Math.min(page.blocks.length - 1, new1BasedIndex - 1));
    if (target0Idx === currentIdx) return;

    pushStateToHistory();

    const [movedBlock] = page.blocks.splice(currentIdx, 1);
    page.blocks.splice(target0Idx, 0, movedBlock);

    // Re-index IDs
    page.blocks = page.blocks.map((b, i) => ({
        ...b,
        id: `p${pageIndex + 1}_b${i + 1}`
    }));

    savePageToDB(page);
    requestOverlayRender();
}

function renderNumberingToolbar(): void {
    removeNumberingToolbar();

    const page = globalState.pages[globalState.activePageIndex];
    const totalBlocks = page ? page.blocks.length : 0;

    const bar = document.createElement('div');
    bar.id = 'canvas-numbering-bar';
    bar.className = 'fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-indigo-500/80 shadow-2xl rounded-2xl px-3.5 py-2 flex items-center gap-2.5 text-xs text-white backdrop-blur-md transition-all select-none';
    bar.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-[11px] text-white">#</span>
            <span class="font-bold text-slate-100 hidden sm:inline">Đánh số thứ tự:</span>
            <span class="text-slate-300 text-[11px]">Nhấp ô để chọn thứ tự (<span id="numbering-count" class="text-emerald-400 font-bold">0</span>/${totalBlocks})</span>
        </div>
        <div class="h-4 w-px bg-slate-700"></div>
        <button id="btn-numbering-sort-manga" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10.5px] font-medium flex items-center gap-1 border border-slate-700 cursor-pointer transition-all" title="Tự động xếp Phải qua Trái (Manga)">
            <i class="fa-solid fa-arrow-left text-[9px] text-pink-400"></i> <span class="hidden md:inline">Phải ➔ Trái</span>
        </button>
        <button id="btn-numbering-sort-manhwa" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10.5px] font-medium flex items-center gap-1 border border-slate-700 cursor-pointer transition-all" title="Tự động xếp Trên xuống Dưới (Webtoon)">
            <i class="fa-solid fa-arrow-down text-[9px] text-indigo-400"></i> <span class="hidden md:inline">Trên ➔ Dưới</span>
        </button>
        <button id="btn-numbering-reset" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10.5px] flex items-center gap-1 border border-slate-700 cursor-pointer transition-all" title="Bắt đầu lại">
            <i class="fa-solid fa-rotate-left text-[9px]"></i> <span class="hidden sm:inline">Đặt lại</span>
        </button>
        <button id="btn-numbering-done" class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-md shadow-emerald-900/40 cursor-pointer transition-all">
            <i class="fa-solid fa-check text-[9.5px]"></i> Hoàn tất
        </button>
        <button id="btn-numbering-cancel" class="px-1.5 py-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white text-xs cursor-pointer transition-all" title="Hủy bỏ">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    document.body.appendChild(bar);

    // Event listeners
    bar.querySelector('#btn-numbering-sort-manga')?.addEventListener('click', () => applyMangaSortToActivePage());
    bar.querySelector('#btn-numbering-sort-manhwa')?.addEventListener('click', () => applyManhwaSortToActivePage());
    bar.querySelector('#btn-numbering-reset')?.addEventListener('click', () => {
        numberedBlockIds = [];
        updateNumberingToolbar();
        requestOverlayRender();
        showToast("Đã đặt lại thứ tự.", "info");
    });
    bar.querySelector('#btn-numbering-done')?.addEventListener('click', () => finishNumberingMode());
    bar.querySelector('#btn-numbering-cancel')?.addEventListener('click', () => cancelNumberingMode());
}

function updateNumberingToolbar(): void {
    const countEl = document.getElementById('numbering-count');
    if (countEl) {
        countEl.textContent = String(numberedBlockIds.length);
    }
}

function removeNumberingToolbar(): void {
    const bar = document.getElementById('canvas-numbering-bar');
    if (bar && bar.parentNode) {
        bar.parentNode.removeChild(bar);
    }
}
