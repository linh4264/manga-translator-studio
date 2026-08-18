/**
 * Manga Translator Studio - Custom Style Preset Manager
 * Quản lý các mẫu định dạng chữ, bong bóng thoại và SFX do người dùng tự thiết lập
 */

import { globalState, saveCustomPresetsToStorage } from '../../core/state';
import { showToast } from '../../core/utils';
import { BlockStyle, CustomStylePreset, MangaBlock } from '../../types/index';

/**
 * Trích xuất toàn bộ thuộc tính style độc lập từ một block
 */
export function extractStyleFromBlock(block: MangaBlock): Partial<BlockStyle> {
    if (!block || !block.style) return {};
    const s = block.style;
    return {
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        lineHeight: s.lineHeight !== undefined ? s.lineHeight : 1.15,
        letterSpacing: s.letterSpacing !== undefined ? s.letterSpacing : 0,
        textTransform: s.textTransform || 'none',
        bold: !!s.bold,
        italic: !!s.italic,
        underline: !!s.underline,
        textColor: s.textColor || '#000000',
        textColorHex: s.textColorHex || s.textColor || '#000000',
        bgColor: s.bgColor || '#ffffff',
        bgColorHex: s.bgColorHex || s.bgColor || '#ffffff',
        bgOpacity: s.bgOpacity !== undefined ? s.bgOpacity : 100,
        padding: s.padding !== undefined ? s.padding : 4,
        align: s.align || 'center',
        vertical: !!s.vertical,
        maskShape: s.maskShape || 'bubble-fit',
        maskSize: s.maskSize || 'full',
        strokeColor: s.strokeColor || '#ffffff',
        strokeColorHex: s.strokeColorHex || s.strokeColor || '#ffffff',
        strokeWidth: s.strokeWidth || 0,
        strokeColor2: s.strokeColor2 || '#000000',
        strokeColor2Hex: s.strokeColor2Hex || s.strokeColor2 || '#000000',
        strokeWidth2: s.strokeWidth2 || 0,
        shadowColor: s.shadowColor || '#000000',
        shadowColorHex: s.shadowColorHex || s.shadowColor || '#000000',
        shadowBlur: s.shadowBlur || 0,
        shadowOffsetX: s.shadowOffsetX || 0,
        shadowOffsetY: s.shadowOffsetY || 0,
        rotate: s.rotate || 0,
        arcAngle: s.arcAngle || 0,
        skewX: s.skewX || 0,
        skewY: s.skewY || 0,
        warpWave: s.warpWave || 0,
        warpBulge: s.warpBulge || 0,
        gradientEnabled: !!s.gradientEnabled,
        gradientType: s.gradientType || 'linear',
        gradientColorStart: s.gradientColorStart || '#ff7e5f',
        gradientColorEnd: s.gradientColorEnd || '#feb47b',
        gradientAngle: s.gradientAngle !== undefined ? s.gradientAngle : 90,
        blendMode: s.blendMode || 'normal'
    };
}

/**
 * Tự động tạo chuỗi mô tả tóm tắt cho Style
 */
export function generateStyleSummary(style: Partial<BlockStyle>): string {
    if (!style) return 'Định dạng mặc định';
    const parts: string[] = [];

    // Font name mapping
    const fontNames: Record<string, string> = {
        'font-comic': 'Patrick Hand',
        'font-comicneue': 'Comic Neue',
        'font-manga': 'Nunito Bold',
        'font-vietnamese': 'Be Vietnam Pro',
        'font-impact': 'Bangers',
        'font-marker': 'Marker',
        'font-bungee': 'Bungee',
        'font-caveat': 'Caveat',
        'font-tech': 'Chakra Petch',
        'font-condensed': 'Saira'
    };

    const fontLabel = fontNames[style.fontFamily || ''] || style.fontFamily || 'Font';
    parts.push(fontLabel);

    if (style.bold) parts.push('Bold');
    if (style.italic) parts.push('Nghiêng');
    if (style.vertical) parts.push('Dọc');

    if (style.bgOpacity === 0) {
        parts.push('Nền 0%');
    } else if (style.bgOpacity !== undefined && style.bgOpacity < 100) {
        parts.push(`Nền ${style.bgOpacity}%`);
    }

    if (style.strokeWidth && style.strokeWidth > 0) {
        parts.push(`Viền ${style.strokeWidth}px`);
    }
    if (style.strokeWidth2 && style.strokeWidth2 > 0) {
        parts.push(`Viền 2`);
    }
    if (style.shadowBlur && style.shadowBlur > 0) {
        parts.push(`Bóng ${style.shadowBlur}px`);
    }
    if (style.gradientEnabled) {
        parts.push('Gradient');
    }
    if (style.arcAngle) {
        parts.push(`Uốn ${style.arcAngle}°`);
    }

    return parts.slice(0, 3).join(' • ') || 'Tùy chỉnh';
}

/**
 * Lấy danh sách toàn bộ Preset tùy chỉnh của người dùng
 */
export function getCustomPresets(): CustomStylePreset[] {
    if (!globalState.customStylePresets || !Array.isArray(globalState.customStylePresets)) {
        globalState.customStylePresets = [];
    }
    return globalState.customStylePresets;
}

/**
 * Lấy preset theo ID
 */
export function getPresetById(id: string): CustomStylePreset | null {
    const list = getCustomPresets();
    return list.find(p => p.id === id) || null;
}

/**
 * Lưu hoặc cập nhật một Preset
 */
export function saveCustomPreset(preset: CustomStylePreset): void {
    if (!preset.id) {
        preset.id = 'preset_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    }
    if (!preset.createdAt) {
        preset.createdAt = Date.now();
    }
    preset.updatedAt = Date.now();
    if (!preset.desc && preset.style) {
        preset.desc = generateStyleSummary(preset.style);
    }

    const list = getCustomPresets();
    const existingIndex = list.findIndex(p => p.id === preset.id);
    if (existingIndex >= 0) {
        list[existingIndex] = { ...list[existingIndex], ...preset };
    } else {
        list.push(preset);
    }
    globalState.customStylePresets = list;
    saveCustomPresetsToStorage();
}

/**
 * Xóa một Preset
 */
export function deleteCustomPreset(id: string): boolean {
    const list = getCustomPresets();
    const nextList = list.filter(p => p.id !== id);
    if (nextList.length !== list.length) {
        globalState.customStylePresets = nextList;
        saveCustomPresetsToStorage();
        return true;
    }
    return false;
}

/**
 * Tạo mới một Preset từ ô thoại đang được chọn trên Canvas
 */
export function createPresetFromActiveBlock(name?: string, icon?: string): CustomStylePreset | null {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        showToast("Vui lòng nhấp chọn một ô thoại để lưu mẫu định dạng.", "warn");
        return null;
    }

    const page = globalState.pages[globalState.activePageIndex];
    const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block || block.type === 'image') {
        showToast("Không thể tạo mẫu định dạng từ ô ảnh hoặc không tìm thấy ô thoại.", "warn");
        return null;
    }

    const style = extractStyleFromBlock(block);
    const presetName = name?.trim() || `Mẫu định dạng #${getCustomPresets().length + 1}`;
    const presetIcon = icon?.trim() || (style.bgOpacity === 0 ? '🏷️' : (style.fontFamily === 'font-impact' ? '💥' : '💬'));

    const newPreset: CustomStylePreset = {
        id: 'preset_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: presetName,
        icon: presetIcon,
        desc: generateStyleSummary(style),
        style,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    saveCustomPreset(newPreset);
    showToast(`✨ Đã lưu mẫu định dạng "${newPreset.name}"!`, "success");
    return newPreset;
}

/**
 * Cập nhật lại style của một Preset hiện có bằng style của ô thoại đang chọn
 */
export function updatePresetFromActiveBlock(id: string): boolean {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        showToast("Vui lòng nhấp chọn một ô thoại trước khi cập nhật mẫu.", "warn");
        return false;
    }

    const preset = getPresetById(id);
    if (!preset) {
        showToast("Không tìm thấy mẫu định dạng cần cập nhật.", "warn");
        return false;
    }

    const page = globalState.pages[globalState.activePageIndex];
    const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block || block.type === 'image') {
        showToast("Không thể cập nhật từ ô ảnh.", "warn");
        return false;
    }

    preset.style = extractStyleFromBlock(block);
    preset.desc = generateStyleSummary(preset.style);
    preset.updatedAt = Date.now();
    saveCustomPreset(preset);

    showToast(`🔄 Đã cập nhật lại kiểu dáng cho mẫu "${preset.name}"!`, "success");
    return true;
}

/**
 * Nhân bản một Preset
 */
export function duplicatePreset(id: string): CustomStylePreset | null {
    const preset = getPresetById(id);
    if (!preset) return null;

    const copy: CustomStylePreset = {
        id: 'preset_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: `${preset.name} (Bản sao)`,
        icon: preset.icon || '💬',
        desc: preset.desc,
        style: JSON.parse(JSON.stringify(preset.style)),
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    saveCustomPreset(copy);
    showToast(`📋 Đã nhân bản mẫu "${preset.name}"!`, "success");
    return copy;
}

/**
 * Xóa toàn bộ preset của người dùng
 */
export function clearAllCustomPresets(): void {
    globalState.customStylePresets = [];
    saveCustomPresetsToStorage();
}

/**
 * Xuất danh sách mẫu định dạng ra file JSON
 */
export function exportPresetsJSON(): void {
    const list = getCustomPresets();
    if (list.length === 0) {
        showToast("Bạn chưa có mẫu định dạng nào để xuất file.", "warn");
        return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(list, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `manga_custom_presets_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showToast(`💾 Đã xuất ${list.length} mẫu định dạng ra file JSON!`, "success");
}

/**
 * Nhập danh sách mẫu định dạng từ chuỗi JSON
 */
export function importPresetsJSON(jsonStr: string): { success: boolean; count: number; error?: string } {
    try {
        const parsed = JSON.parse(jsonStr);
        if (!Array.isArray(parsed)) {
            return { success: false, count: 0, error: 'Dữ liệu file JSON không đúng định dạng danh sách (Array).' };
        }

        let importedCount = 0;
        const currentList = getCustomPresets();

        parsed.forEach(item => {
            if (item && item.name && item.style) {
                const newId = 'preset_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
                const preset: CustomStylePreset = {
                    id: item.id || newId,
                    name: String(item.name).trim(),
                    icon: item.icon || '💬',
                    desc: item.desc || generateStyleSummary(item.style),
                    style: item.style,
                    createdAt: item.createdAt || Date.now(),
                    updatedAt: Date.now()
                };

                // Tránh trùng ID
                const existingIdx = currentList.findIndex(p => p.id === preset.id);
                if (existingIdx >= 0) {
                    currentList[existingIdx] = preset;
                } else {
                    currentList.push(preset);
                }
                importedCount++;
            }
        });

        globalState.customStylePresets = currentList;
        saveCustomPresetsToStorage();

        showToast(`🎉 Đã nhập thành công ${importedCount} mẫu định dạng!`, "success");
        return { success: true, count: importedCount };
    } catch (e: any) {
        console.error("Lỗi khi nhập presets JSON:", e);
        return { success: false, count: 0, error: e.message || 'Lỗi đọc file JSON' };
    }
}
