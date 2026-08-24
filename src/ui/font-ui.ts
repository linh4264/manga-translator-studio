import { showToast, escapeHTML } from '../core/utils';
import { requestOverlayRender } from '../features/canvas/canvas-service';

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
            }
        });

        const typoOptgroup = document.getElementById('typography-custom-fonts-optgroup');
        if (typoOptgroup) typoOptgroup.replaceChildren();

        const typoSelect = document.getElementById('typography-target-font') as HTMLSelectElement | null;
        if (typoSelect && typoSelect.value !== '__global__') {
            typoSelect.value = '__global__';
            const { onTypographyTargetFontChange } = await import('./settings-ui');
            onTypographyTargetFontChange('__global__');
        }

        currentCustomFamilies = [];
        renderCustomFontsListRows();

        requestOverlayRender();
        showToast(`Đã xóa sạch toàn bộ ${families.length} phông chữ tùy chỉnh thành công!`, "success");
    } catch (err: any) {
        console.error("Lỗi xóa toàn bộ phông chữ:", err);
        showToast(`Không thể xóa phông chữ: ${err.message}`, "error");
    }
}

export async function registerCustomFont(family: string, blob: Blob): Promise<void> {
    try {
        const { ensureCustomFontLoaded } = await import('../core/state');
        await ensureCustomFontLoaded(family);

        FONT_SELECT_IDS.forEach(id => {
            const fontSelect = document.getElementById(id) as HTMLSelectElement | null;
            if (fontSelect) {
                const exists = Array.from(fontSelect.options).some(opt => opt.value === family);
                if (!exists) {
                    const opt = document.createElement('option');
                    opt.value = family;
                    opt.textContent = `${family} (Tùy chỉnh)`;
                    opt.setAttribute('data-custom', 'true');
                    fontSelect.appendChild(opt);
                }
            }
        });
    } catch (err) {
        console.error(`Không thể đăng ký phông chữ ${family}:`, err);
    }
}

export async function uploadCustomFonts(files: FileList | File[]): Promise<void> {
    if (!files || files.length === 0) return;
    showToast(`Đang xử lý ${files.length} phông chữ tùy chỉnh...`, "info");

    const { saveFontsBatchToDB, ensureCustomFontLoaded } = await import('../core/state');
    const fontBatch: Array<{ family: string; blob: Blob }> = [];
    const skippedFiles: string[] = [];
    const validExtensions = ['.ttf', '.otf', '.woff', '.woff2', '.ttc'];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = file.name || '';
        const lastDotIdx = fileName.lastIndexOf('.');
        const ext = lastDotIdx !== -1 ? fileName.substring(lastDotIdx).toLowerCase() : '';
        if (!validExtensions.includes(ext)) {
            skippedFiles.push(fileName);
            console.warn(`Bỏ qua file không phải định dạng font hợp lệ: ${fileName}`);
            continue;
        }

        const cleanName = fileName.replace(/\.[^/.]+$/, '').trim();
        const family = cleanName.replace(/['"\\;{}]/g, '').replace(/\s+/g, ' ').trim() || `CustomFont_${i + 1}`;
        if (!family) {
            skippedFiles.push(fileName);
            continue;
        }
        fontBatch.push({ family, blob: file });
    }

    if (fontBatch.length === 0) {
        showToast("Không tìm thấy file phông chữ hợp lệ (.ttf, .otf, .woff, .woff2, .ttc).", "warn");
        return;
    }

    try {
        await saveFontsBatchToDB(fontBatch);
        await populateCustomFontsDropdown();
        // Eagerly register first batch into memory
        const topFonts = fontBatch.slice(0, 20);
        await Promise.all(topFonts.map(f => ensureCustomFontLoaded(f.family, true)));
        
        let successMsg = `Đã cài đặt thành công ${fontBatch.length} phông chữ mới!`;
        if (skippedFiles.length > 0) {
            successMsg += ` (Bỏ qua ${skippedFiles.length} file không đúng định dạng font)`;
        }
        showToast(successMsg, "success");
        requestOverlayRender();
    } catch (err: any) {
        console.error("Lỗi tải lên danh sách phông chữ:", err);
        showToast(`Lỗi khi lưu phông chữ vào hệ thống: ${err?.message || 'Không xác định'}`, "error");
    }
}



