import { showToast } from '../core/utils.js';
import { requestOverlayRender } from '../features/canvas/canvas-service.js';

// Danh sách ID các dropdown phông chữ trong hệ thống
const FONT_SELECT_IDS = [
    'style-font',   // Cột định dạng bên phải
    'default-font'
];

// Helper chèn font tùy chỉnh vào thẻ <select>
function appendCustomFontToSelect(selectEl, family) {
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

// 1. Nạp toàn bộ Font tùy chỉnh vào tất cả dropdowns & danh sách quản lý
export async function populateCustomFontsDropdown() {
    try {
        const { getAllFontsFromDB } = await import('../core/state.js');
        const fonts = await getAllFontsFromDB();

        FONT_SELECT_IDS.forEach(id => {
            const fontSelect = document.getElementById(id);
            if (!fontSelect) return;

            const customOptions = fontSelect.querySelectorAll('option[data-custom="true"]');
            customOptions.forEach(opt => opt.remove());

            fonts.forEach(font => {
                appendCustomFontToSelect(fontSelect, font.family);
            });
        });

        // Render giao diện danh sách quản lý Font trong Modal
        await renderCustomFontsListUI(fonts);
    } catch (e) {
        console.error("Lỗi nạp phông chữ tùy chỉnh từ DB:", e);
    }
}

// 2. Render danh sách quản lý Font trong Modal
export async function renderCustomFontsListUI(fontsParam = null) {
    const listContainer = document.getElementById('custom-fonts-list');
    const countBadge = document.getElementById('custom-fonts-count');
    if (!listContainer) return;

    try {
        let fonts = fontsParam;
        if (!fonts) {
            const { getAllFontsFromDB } = await import('../core/state.js');
            fonts = await getAllFontsFromDB();
        }

        if (countBadge) countBadge.textContent = fonts.length;

        if (fonts.length === 0) {
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

// 3. Xóa phông chữ tùy chỉnh khỏi IndexedDB và UI
export async function deleteCustomFont(family) {
    if (!confirm(`Bạn có chắc chắn muốn xóa phông chữ "${family}"?`)) return;

    try {
        const { deleteFontFromDB } = await import('../core/state.js');
        await deleteFontFromDB(family);

        // Loại bỏ option khỏi tất cả các menu <select>
        FONT_SELECT_IDS.forEach(id => {
            const fontSelect = document.getElementById(id);
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
    } catch (err) {
        console.error(`Lỗi xóa phông chữ ${family}:`, err);
        showToast(`Không thể xóa phông chữ: ${err.message}`, "error");
    }
}

// 4. Đăng ký Font mới vào bộ nhớ trình duyệt
export async function registerCustomFont(family, blob) {
    try {
        const buffer = await blob.arrayBuffer();
        const fontFace = new FontFace(family, buffer);
        const loadedFace = await fontFace.load();
        document.fonts.add(loadedFace);

        FONT_SELECT_IDS.forEach(id => {
            const fontSelect = document.getElementById(id);
            appendCustomFontToSelect(fontSelect, family);
        });
    } catch (err) {
        console.error(`Không thể đăng ký phông chữ ${family}:`, err);
    }
}

// 5. Tải phông chữ từ máy tính lên
export async function uploadCustomFonts(files) {
    if (!files || files.length === 0) return;
    showToast("Đang nạp phông chữ tùy chỉnh...", "info");

    const { saveFontToDB } = await import('../core/state.js');
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

// Binding hàm ra Scope window cho các nút bấm HTML onclick
Object.assign(window, {
    deleteCustomFont,
    uploadCustomFonts,
    renderCustomFontsListUI
});