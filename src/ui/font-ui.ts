import { showToast, escapeHTML } from '../core/utils';
import { requestOverlayRender, syncActiveBlockStyle } from '../features/canvas/canvas-service';
import { globalState } from '../core/state';

export const STANDARD_FONTS = [
    { id: 'font-manga', name: 'Chuẩn Manga (Nunito Bold)', family: 'font-manga', desc: 'Manga tiêu chuẩn' },
    { id: 'font-vietnamese', name: 'Việt tối ưu (Be Vietnam Pro)', family: 'font-vietnamese', desc: 'Dễ đọc, tròn trịa' },
    { id: 'font-comic', name: 'Vui nhộn (Patrick Hand)', family: 'font-comic', desc: 'Hài hước, đời thường' },
    { id: 'font-comicneue', name: 'Comic mượt (Comic Neue)', family: 'font-comicneue', desc: 'Nét mảnh, tinh tế' },
    { id: 'font-impact', name: 'Kỳ vĩ / SFX (Bangers)', family: 'font-impact', desc: 'Hét lớn, âm thanh' },
    { id: 'font-marker', name: 'Cọ vẽ / SFX Đậm (Permanent Marker)', family: 'font-marker', desc: 'Nét cọ đậm' },
    { id: 'font-bungee', name: 'SFX Khối vuông (Bungee)', family: 'font-bungee', desc: 'Khối 3D cơ khí' },
    { id: 'font-caveat', name: 'SFX Viết tay (Caveat)', family: 'font-caveat', desc: 'Viết tay mộc mạc' },
    { id: 'font-tech', name: 'Cơ khí / Robot (Chakra Petch)', family: 'font-tech', desc: 'Viễn tưởng, robot' },
    { id: 'font-condensed', name: 'Gào thét / Ghi chú (Saira Condensed)', family: 'font-condensed', desc: 'Hẹp dọc, thoại dài' }
];

const FONT_SELECT_IDS = [
    'style-font',
    'default-font',
    'default-dialogue-font',
    'default-narration-font',
    'default-thought-font',
    'default-sfx-font'
];

let isFontDelegationInit = false;
let currentCustomFamilies: string[] = [];
let customFontsSearchQuery = '';
let customFontsVisibleCount = 40;

let originalBlockFontBeforeHover: string | null = null;
let currentPreviewingBlockId: string | null = null;

function initFontDelegationOnce(container: HTMLElement): void {
    if (isFontDelegationInit) return;
    container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        const delBtn = target?.closest('[data-action="delete-custom-font"]') as HTMLElement | null;
        if (delBtn?.dataset.family) {
            deleteCustomFont(delBtn.dataset.family);
            return;
        }

        const loadMoreBtn = target?.closest('[data-action="load-more-custom-fonts"]') as HTMLElement | null;
        if (loadMoreBtn) {
            loadMoreCustomFonts();
        }
    });
    isFontDelegationInit = true;
}

export function onSearchCustomFonts(query: string): void {
    customFontsSearchQuery = (query || '').trim().toLowerCase();
    customFontsVisibleCount = 40;
    renderCustomFontsListRows();
}

export function loadMoreCustomFonts(): void {
    customFontsVisibleCount += 50;
    renderCustomFontsListRows();
}

function renderCustomFontsListRows(): void {
    const listContainer = document.getElementById('custom-fonts-list');
    const countBadge = document.getElementById('custom-fonts-count');
    if (!listContainer) return;

    if (countBadge) {
        countBadge.textContent = String(currentCustomFamilies.length);
    }

    if (currentCustomFamilies.length === 0) {
        listContainer.innerHTML = `<div class="text-center py-4 text-slate-500 text-xs italic">Chưa có phông chữ tùy chỉnh nào.</div>`;
        return;
    }

    const filtered = customFontsSearchQuery
        ? currentCustomFamilies.filter(f => f.toLowerCase().includes(customFontsSearchQuery))
        : currentCustomFamilies;

    if (filtered.length === 0) {
        listContainer.innerHTML = `<div class="text-center py-4 text-slate-500 text-xs italic">Không tìm thấy phông chữ phù hợp với "${escapeHTML(customFontsSearchQuery)}".</div>`;
        return;
    }

    const visibleItems = filtered.slice(0, customFontsVisibleCount);
    const hasMore = filtered.length > customFontsVisibleCount;

    const rowsHtml = visibleItems.map(family => {
        const safeFamily = escapeHTML(family);
        return `
            <div class="bg-slate-900 border border-slate-800 rounded-lg p-2 flex items-center justify-between gap-2 hover:border-slate-700 transition-all">
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-bold text-indigo-300 truncate">${safeFamily}</p>
                    <p class="text-[9px] text-slate-500 font-mono">Tùy chỉnh</p>
                </div>
                <button data-family="${safeFamily}" data-action="delete-custom-font"
                    class="px-2 py-1 rounded bg-red-950/40 hover:bg-red-900 border border-red-500/30 text-red-300 text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer"
                    title="Xóa phông chữ này">
                    <i class="fa-solid fa-trash-can text-[9px]"></i> Xóa
                </button>
            </div>
        `;
    }).join('');

    const loadMoreHtml = hasMore ? `
        <div class="pt-1 pb-0.5 text-center">
            <button type="button" data-action="load-more-custom-fonts"
                class="w-full py-1.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 hover:border-indigo-500/40 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-all cursor-pointer">
                Hiển thị thêm (${visibleItems.length}/${filtered.length} phông)...
            </button>
        </div>
    ` : '';

    listContainer.innerHTML = rowsHtml + loadMoreHtml;
}

export async function populateCustomFontsDropdown(): Promise<void> {
    try {
        const { getAllFontFamiliesFromDB } = await import('../core/state');
        const families = await getAllFontFamiliesFromDB();

        FONT_SELECT_IDS.forEach(id => {
            const fontSelect = document.getElementById(id) as HTMLSelectElement | null;
            if (!fontSelect) return;

            const customOptions = fontSelect.querySelectorAll('option[data-custom="true"]');
            customOptions.forEach(opt => opt.remove());

            if (families.length > 0) {
                const frag = document.createDocumentFragment();
                families.forEach(family => {
                    const opt = document.createElement('option');
                    opt.value = family;
                    opt.textContent = `${family} (Tùy chỉnh)`;
                    opt.setAttribute('data-custom', 'true');
                    frag.appendChild(opt);
                });
                fontSelect.appendChild(frag);
            }
        });

        const typoSelect = document.getElementById('typography-target-font') as HTMLSelectElement | null;
        const prevTypoVal = typoSelect?.value;

        const typoOptgroup = document.getElementById('typography-custom-fonts-optgroup');
        if (typoOptgroup) {
            typoOptgroup.replaceChildren();
            if (families.length > 0) {
                const frag = document.createDocumentFragment();
                families.forEach(family => {
                    const opt = document.createElement('option');
                    opt.value = family;
                    opt.textContent = `${family} (Tùy chỉnh)`;
                    opt.setAttribute('data-custom', 'true');
                    frag.appendChild(opt);
                });
                typoOptgroup.appendChild(frag);
            }
        }

        if (typoSelect && prevTypoVal) {
            typoSelect.value = prevTypoVal;
        }

        await renderCustomFontsListUI(families);
        renderFontPickerOptions();
    } catch (e) {
        console.error("Lỗi nạp phông chữ tùy chỉnh từ DB:", e);
    }
}

export async function renderCustomFontsListUI(familiesParam: string[] | null = null): Promise<void> {
    const listContainer = document.getElementById('custom-fonts-list');
    if (!listContainer) return;

    initFontDelegationOnce(listContainer);

    try {
        if (familiesParam) {
            currentCustomFamilies = Array.isArray(familiesParam) ? familiesParam : [];
        } else {
            const { getAllFontFamiliesFromDB } = await import('../core/state');
            currentCustomFamilies = await getAllFontFamiliesFromDB();
        }

        renderCustomFontsListRows();
    } catch (err) {
        console.error("Lỗi render danh sách Font:", err);
    }
}

export async function deleteCustomFont(family: string): Promise<void> {
    if (!confirm(`Bạn có chắc chắn muốn xóa phông chữ "${family}"?`)) return;

    try {
        const { deleteFontFromDB } = await import('../core/state');
        await deleteFontFromDB(family);

        FONT_SELECT_IDS.forEach(id => {
            const fontSelect = document.getElementById(id) as HTMLSelectElement | null;
            if (fontSelect) {
                const opt = Array.from(fontSelect.options).find(o => o.value === family);
                if (opt) {
                    if (fontSelect.value === family) {
                        fontSelect.value = fontSelect.options[0].value;
                    }
                    opt.remove();
                }
            }
        });

        const typoOpt = document.querySelector(`#typography-custom-fonts-optgroup option[value="${family}"]`);
        if (typoOpt) typoOpt.remove();

        currentCustomFamilies = currentCustomFamilies.filter(f => f !== family);
        renderCustomFontsListRows();
        renderFontPickerOptions();

        requestOverlayRender();
        showToast(`Đã xóa phông chữ "${family}" thành công!`, "info");
    } catch (err: any) {
        console.error(`Lỗi xóa phông chữ ${family}:`, err);
        showToast(`Không thể xóa phông chữ: ${err.message}`, "error");
    }
}

export async function deleteAllCustomFonts(): Promise<void> {
    const { getAllFontFamiliesFromDB, clearAllFontsFromDB } = await import('../core/state');
    const families = await getAllFontFamiliesFromDB();
    if (!families || families.length === 0) {
        showToast("Không có phông chữ tùy chỉnh nào để xóa.", "info");
        return;
    }

    if (!confirm(`Bạn có chắc chắn muốn xóa TOÀN BỘ ${families.length} phông chữ tùy chỉnh khỏi ứng dụng?\nThao tác này không thể hoàn tác.`)) {
        return;
    }

    try {
        await clearAllFontsFromDB();

        FONT_SELECT_IDS.forEach(id => {
            const fontSelect = document.getElementById(id) as HTMLSelectElement | null;
            if (fontSelect) {
                const customOptions = fontSelect.querySelectorAll('option[data-custom="true"]');
                customOptions.forEach(opt => opt.remove());
                fontSelect.value = fontSelect.options[0].value;
            }
        });

        const typoOptgroup = document.getElementById('typography-custom-fonts-optgroup');
        if (typoOptgroup) typoOptgroup.replaceChildren();

        currentCustomFamilies = [];
        renderCustomFontsListRows();
        renderFontPickerOptions();

        requestOverlayRender();
        showToast("Đã xóa toàn bộ phông chữ tùy chỉnh.", "info");
    } catch (err: any) {
        console.error("Lỗi xóa toàn bộ phông chữ:", err);
        showToast(`Không thể xóa danh sách phông chữ: ${err.message}`, "error");
    }
}

export async function uploadCustomFonts(files: FileList | File[] | null): Promise<void> {
    if (!files || files.length === 0) return;

    const { saveFontToDB } = await import('../core/state');
    let loadedCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext || '')) {
            continue;
        }

        const familyName = file.name.replace(/\.[^/.]+$/, "").trim();

        try {
            if (typeof FontFace !== 'undefined' && typeof document !== 'undefined' && document.fonts) {
                try {
                    const buffer = await file.arrayBuffer();
                    const fontFace = new FontFace(familyName, buffer);
                    await fontFace.load();
                    document.fonts.add(fontFace);
                } catch (fontErr) {
                    // Ignore font registration error in headless/mock env
                }
            }

            await saveFontToDB(familyName, file);
            loadedCount++;
        } catch (e: any) {
            console.error(`Lỗi tải phông chữ ${file.name}:`, e);
        }
    }

    if (loadedCount > 0) {
        await populateCustomFontsDropdown();
        showToast(`Đã thêm ${loadedCount} phông chữ mới thành công!`, "success");
    } else {
        showToast("Không tìm thấy file phông chữ hợp lệ (.ttf, .otf, .woff, .woff2).", "warn");
    }
}

export function registerCustomFont(family: string, fontFace: FontFace): void {
    try {
        document.fonts.add(fontFace);
    } catch (err) {
        console.error(`Lỗi đăng ký phông chữ ${family}:`, err);
    }
}

// =========================================================================
// 🌟 INTERACTIVE LIVE HOVER-PREVIEW FONT PICKER
// =========================================================================

export function initFontLivePreviewPicker(): void {
    const trigger = document.getElementById('font-picker-trigger');
    const dropdown = document.getElementById('font-picker-dropdown');
    const searchInput = document.getElementById('font-picker-search') as HTMLInputElement | null;

    if (!trigger || !dropdown) return;

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = dropdown.classList.contains('hidden');
        if (isHidden) {
            dropdown.classList.remove('hidden');
            renderFontPickerOptions();
            if (searchInput) {
                searchInput.value = '';
                setTimeout(() => searchInput.focus(), 50);
            }
        } else {
            closeFontPickerDropdown();
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = (e.target as HTMLInputElement).value.trim().toLowerCase();
            renderFontPickerOptions(query);
        });
        searchInput.addEventListener('click', (e) => e.stopPropagation());
    }

    dropdown.addEventListener('mouseleave', () => {
        revertHoverFontPreview();
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.classList.contains('hidden') && !dropdown.contains(e.target as Node) && e.target !== trigger) {
            closeFontPickerDropdown();
        }
    });
}

export function closeFontPickerDropdown(): void {
    const dropdown = document.getElementById('font-picker-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    revertHoverFontPreview();
}

function previewHoverFont(fontFamily: string): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page) return;
    const block = page.blocks?.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    if (originalBlockFontBeforeHover === null || currentPreviewingBlockId !== block.id) {
        originalBlockFontBeforeHover = block.style?.fontFamily || globalState.defaultFont || 'font-manga';
        currentPreviewingBlockId = block.id;
    }

    if (!block.style) block.style = { ...globalState.globalStyle };
    block.style.fontFamily = fontFamily;
    block.style.font = fontFamily;
    block.autoFitCache = null;

    requestOverlayRender();
}

function revertHoverFontPreview(): void {
    if (originalBlockFontBeforeHover !== null && globalState.activePageIndex !== -1 && globalState.selectedBlockId !== null) {
        const page = globalState.pages[globalState.activePageIndex];
        const block = page?.blocks?.find(b => b.id === globalState.selectedBlockId);
        if (block && block.style && block.style.fontFamily !== originalBlockFontBeforeHover) {
            block.style.fontFamily = originalBlockFontBeforeHover;
            block.style.font = originalBlockFontBeforeHover;
            block.autoFitCache = null;
            requestOverlayRender();
        }
    }
}

function commitFontSelection(fontFamily: string, fontName: string): void {
    originalBlockFontBeforeHover = fontFamily;
    syncActiveBlockStyle('fontFamily', fontFamily);
    updateFontPickerDisplay(fontFamily);
    closeFontPickerDropdown();
    showToast(`⚡ Đã đổi sang phông: ${fontName}`, "info");
}

export function updateFontPickerDisplay(fontFamily: string): void {
    const nameEl = document.getElementById('font-picker-current-name');
    if (!nameEl) return;

    const std = STANDARD_FONTS.find(f => f.family === fontFamily || f.id === fontFamily);
    if (std) {
        nameEl.textContent = std.name;
        nameEl.style.fontFamily = std.family;
        return;
    }

    if (fontFamily) {
        nameEl.textContent = `${fontFamily} (Tùy chỉnh)`;
        nameEl.style.fontFamily = fontFamily;
    } else {
        nameEl.textContent = "Chuẩn Manga (Nunito Bold)";
        nameEl.style.fontFamily = 'font-manga';
    }
}

export function renderFontPickerOptions(filterQuery: string = ''): void {
    const container = document.getElementById('font-picker-items');
    if (!container) return;

    const query = filterQuery.toLowerCase();

    // Standard fonts
    const filteredStandard = query
        ? STANDARD_FONTS.filter(f => f.name.toLowerCase().includes(query) || f.desc.toLowerCase().includes(query))
        : STANDARD_FONTS;

    // Custom fonts
    const filteredCustom = query
        ? currentCustomFamilies.filter(f => f.toLowerCase().includes(query))
        : currentCustomFamilies;

    let html = '';

    if (filteredStandard.length > 0) {
        html += `<div class="px-2 py-1 text-[9.5px] font-bold text-slate-500 uppercase tracking-wider">Phông chữ tiêu chuẩn</div>`;
        filteredStandard.forEach(font => {
            html += `
                <div class="font-picker-option px-2.5 py-1.5 rounded-lg hover:bg-indigo-600/20 hover:border-indigo-500/40 border border-transparent flex items-center justify-between cursor-pointer transition-colors group"
                    data-family="${font.family}" data-name="${escapeHTML(font.name)}">
                    <div class="min-w-0 flex-1">
                        <p class="text-xs font-semibold text-slate-200 group-hover:text-white truncate" style="font-family: ${font.family};">${font.name}</p>
                        <p class="text-[9.5px] text-slate-500 group-hover:text-indigo-300 truncate">${font.desc}</p>
                    </div>
                    <span class="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white font-mono shrink-0 ml-2">Aa</span>
                </div>
            `;
        });
    }

    if (filteredCustom.length > 0) {
        html += `<div class="px-2 py-1.5 text-[9.5px] font-bold text-indigo-400 uppercase tracking-wider mt-1 border-t border-slate-850">Phông chữ tùy chỉnh (${filteredCustom.length})</div>`;
        filteredCustom.forEach(family => {
            const safeFamily = escapeHTML(family);
            html += `
                <div class="font-picker-option px-2.5 py-1.5 rounded-lg hover:bg-indigo-600/20 hover:border-indigo-500/40 border border-transparent flex items-center justify-between cursor-pointer transition-colors group"
                    data-family="${safeFamily}" data-name="${safeFamily}">
                    <div class="min-w-0 flex-1">
                        <p class="text-xs font-bold text-indigo-200 group-hover:text-white truncate" style="font-family: '${safeFamily}';">${safeFamily}</p>
                        <p class="text-[9px] text-slate-500 font-mono">Custom Font</p>
                    </div>
                    <span class="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 group-hover:bg-indigo-600 group-hover:text-white font-mono shrink-0 ml-2">Tùy chỉnh</span>
                </div>
            `;
        });
    }

    if (filteredStandard.length === 0 && filteredCustom.length === 0) {
        html = `<div class="text-center py-4 text-slate-500 text-xs italic">Không tìm thấy phông chữ phù hợp.</div>`;
    }

    container.innerHTML = html;

    // Bind Hover and Click events for instant live-preview
    container.querySelectorAll('.font-picker-option').forEach(el => {
        const item = el as HTMLElement;
        const family = item.dataset.family || '';
        const name = item.dataset.name || family;

        // Hover -> Instant Live Preview on Canvas
        item.addEventListener('mouseenter', () => {
            previewHoverFont(family);
        });

        // Click -> Permanent Confirmation
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            commitFontSelection(family, name);
        });
    });
}
