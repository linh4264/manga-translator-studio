import { showToast } from '../core/utils.js';
import { requestOverlayRender } from '../features/canvas/canvas-service.js';

export async function populateCustomFontsDropdown() {
    const fontSelect = document.getElementById('style-font');
    if (!fontSelect) return;

    try {
        const { getAllFontsFromDB } = await import('../core/state.js');
        const fonts = await getAllFontsFromDB();

        const customOptions = fontSelect.querySelectorAll('option[data-custom="true"]');
        customOptions.forEach(opt => opt.remove());

        fonts.forEach(font => {
            const opt = document.createElement('option');
            opt.value = font.family;
            opt.textContent = `${font.family} (Custom)`;
            opt.setAttribute('data-custom', 'true');
            fontSelect.appendChild(opt);
        });
    } catch (e) {
        console.error("Lỗi nạp phông chữ tùy chỉnh từ DB:", e);
    }
}

export async function registerCustomFont(family, blob) {
    try {
        // Đọc dữ liệu Blob thành ArrayBuffer trực tiếp
        const buffer = await blob.arrayBuffer();
        const fontFace = new FontFace(family, buffer);
        const loadedFace = await fontFace.load();
        document.fonts.add(loadedFace);

        const fontSelect = document.getElementById('style-font');
        if (fontSelect) {
            let exists = Array.from(fontSelect.options).some(opt => opt.value === family);
            if (!exists) {
                const opt = document.createElement('option');
                opt.value = family;
                opt.textContent = `${family} (Custom)`;
                opt.setAttribute('data-custom', 'true');
                fontSelect.appendChild(opt);
            }
        }
    } catch (err) {
        console.error(`Không thể đăng ký phông chữ ${family}:`, err);
    }
}

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
        showToast(`Đã nạp thành công ${loadedCount} phông chữ mới!`, "success");
        requestOverlayRender();
    }
}