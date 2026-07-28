import { showToast } from '../core/utils.js';
import { requestOverlayRender } from '../features/canvas/canvas-service.js';

// Danh sách ID chuẩn xác của tất cả 4 menu thả xuống phông chữ trong hệ thống
const FONT_SELECT_IDS = [
    'style-font',            // Cột định dạng biên dịch bên phải
    'default-dialogue-font', // Font Lời thoại mặc định trong Cài đặt AI
    'default-sfx-font',      // Font Hiệu ứng (SFX) mặc định trong Cài đặt AI
    'default-narration-font' // Font Dẫn truyện mặc định trong Cài đặt AI
];

// Helper chèn một phông chữ tùy chỉnh vào thẻ <select> nếu chưa tồn tại
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

// 1. Nạp toàn bộ Font tùy chỉnh từ IndexedDB vào TẤT CẢ các menu dropdown khi tải trang
export async function populateCustomFontsDropdown() {
    try {
        const { getAllFontsFromDB } = await import('../core/state.js');
        const fonts = await getAllFontsFromDB();

        FONT_SELECT_IDS.forEach(id => {
            const fontSelect = document.getElementById(id);
            if (!fontSelect) return;

            // Xóa các option custom cũ để tránh lặp
            const customOptions = fontSelect.querySelectorAll('option[data-custom="true"]');
            customOptions.forEach(opt => opt.remove());

            // Đổ lại danh sách font custom
            fonts.forEach(font => {
                appendCustomFontToSelect(fontSelect, font.family);
            });
        });
    } catch (e) {
        console.error("Lỗi nạp danh sách phông chữ tùy chỉnh từ DB:", e);
    }
}

// 2. Đăng ký Font mới và thêm ngay vào TẤT CẢ các menu dropdown khi người dùng upload
export async function registerCustomFont(family, blob) {
    try {
        const buffer = await blob.arrayBuffer();
        const fontFace = new FontFace(family, buffer);
        const loadedFace = await fontFace.load();
        document.fonts.add(loadedFace);

        // Chèn font mới vào cả 4 dropdown trong ứng dụng
        FONT_SELECT_IDS.forEach(id => {
            const fontSelect = document.getElementById(id);
            appendCustomFontToSelect(fontSelect, family);
        });
    } catch (err) {
        console.error(`Không thể đăng ký phông chữ ${family}:`, err);
    }
}

// 3. Xử lý tải tập tin phông chữ từ máy tính lên
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
        showToast(`Tải thành công ${loadedCount} phông chữ mới!`, "success");
        requestOverlayRender();
    }
}