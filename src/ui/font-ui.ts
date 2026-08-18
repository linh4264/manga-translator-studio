import { showToast } from '../core/utils';
import { requestOverlayRender } from '../features/canvas/canvas-service';

const FONT_SELECT_IDS = [
    'style-font',
    'default-font',
    'default-dialogue-font',
    'default-narration-font',
    'default-thought-font',
    'default-sfx-font'
];

function appendCustomFontToSelect(selectEl: HTMLSelectElement | null, family: string): void {
    if (!selectEl) return;
    const exists = Array.from(selectEl.options).some(opt => opt.value === family);
    if (!exists) {
        const opt = document.createElement('option');
        opt.value = family;
        opt.textContent = `${family} (Tùy chỉnh)`;
        opt.setAttribute('data-custom', 'true');
        selectEl.appendChild(opt);
    }
}

export async function populateCustomFontsDropdown(): Promise<void> {
    try {
        const { getAllFontsFromDB } = await import('../core/state');
        const fonts = await getAllFontsFromDB();

        FONT_SELECT_IDS.forEach(id => {
            const fontSelect = document.getElementById(id) as HTMLSelectElement | null;
            if (!fontSelect) return;

            const customOptions = fontSelect.querySelectorAll('option[data-custom="true"]');
            customOptions.forEach(opt => opt.remove());

            fonts.forEach((font: any) => {
                appendCustomFontToSelect(fontSelect, font.family);
            });
        });

        await renderCustomFontsListUI(fonts);
    } catch (e) {
        console.error("Lỗi nạp phông chữ tùy chỉnh từ DB:", e);
    }
}

export async function renderCustomFontsListUI(fontsParam: any[] | null = null): Promise<void> {
    const listContainer = document.getElementById('custom-fonts-list');
    const countBadge = document.getElementById('custom-fonts-count');
    if (!listContainer) return;

    try {
        let fonts = fontsParam;
        if (!fonts) {
            const { getAllFontsFromDB } = await import('../core/state');
            fonts = await getAllFontsFromDB();
        }

        if (countBadge) countBadge.textContent = String(fonts?.length || 0);

        if (!fonts || fonts.length === 0) {
            listContainer.innerHTML = `<div class="text-center py-4 text-slate-500 text-xs italic">Chưa có phông chữ tùy chỉnh nào.</div>`;
            return;
        }

        listContainer.innerHTML = fonts.map(font => `
            <div class="bg-slate-900 border border-slate-800 rounded-lg p-2 flex items-center justify-between gap-2 hover:border-slate-700 transition-all">
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-bold text-indigo-300 truncate" style="font-family: '${font.family}', sans-serif;">${font.family}</p>
                    <p class="text-[9px] text-slate-500 font-mono">Tùy chỉnh</p>
                </div>
                <button onclick="deleteCustomFont('${font.family}')"
                    class="px-2 py-1 rounded bg-red-950/40 hover:bg-red-900 border border-red-500/30 text-red-300 text-[10px] font-semibold flex items-center gap-1 transition-all"
                    title="Xóa phông chữ này">
                    <i class="fa-solid fa-trash-can text-[9px]"></i> Xóa
                </button>
            </div>
        `).join('');
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

        await renderCustomFontsListUI();
        requestOverlayRender();
        showToast(`Đã xóa phông chữ "${family}" thành công!`, "info");
    } catch (err: any) {
        console.error(`Lỗi xóa phông chữ ${family}:`, err);
        showToast(`Không thể xóa phông chữ: ${err.message}`, "error");
    }
}

export async function registerCustomFont(family: string, blob: Blob): Promise<void> {
    try {
        const buffer = await blob.arrayBuffer();
        const fontFace = new FontFace(family, buffer);
        const loadedFace = await fontFace.load();
        document.fonts.add(loadedFace);

        FONT_SELECT_IDS.forEach(id => {
            const fontSelect = document.getElementById(id) as HTMLSelectElement | null;
            appendCustomFontToSelect(fontSelect, family);
        });
    } catch (err) {
        console.error(`Không thể đăng ký phông chữ ${family}:`, err);
    }
}

export async function uploadCustomFonts(files: FileList | File[]): Promise<void> {
    if (!files || files.length === 0) return;
    showToast("Đang nạp phông chữ tùy chỉnh...", "info");

    const { saveFontToDB } = await import('../core/state');
    let loadedCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const family = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').trim();
        if (!family) continue;

        try {
            await saveFontToDB(family, file);
            await registerCustomFont(family, file);
            loadedCount++;
        } catch (err) {
            console.error(`Lỗi lưu font ${file.name}:`, err);
        }
    }

    if (loadedCount > 0) {
        await renderCustomFontsListUI();
        showToast(`Tải thành công ${loadedCount} phông chữ mới!`, "success");
        requestOverlayRender();
    }
}

if (typeof window !== 'undefined') {
    Object.assign(window, {
        deleteCustomFont,
        uploadCustomFonts,
        renderCustomFontsListUI
    });
}
