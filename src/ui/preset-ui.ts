/**
 * Manga Translator Studio - Custom Style Preset UI
 * Giao diện quản lý, tạo mới, chỉnh sửa và áp dụng mẫu định dạng tùy chỉnh
 */

import { globalState, savePageToDB } from '../core/state';
import { showToast, escapeHtml, escapeHTML } from '../core/utils';
import {
    getCustomPresets,
    getPresetById,
    saveCustomPreset,
    deleteCustomPreset,
    createPresetFromActiveBlock,
    updatePresetFromActiveBlock,
    duplicatePreset,
    exportPresetsJSON,
    importPresetsJSON,
    extractStyleFromBlock,
    generateStyleSummary,
    clearAllCustomPresets
} from '../features/canvas/preset-manager';
import { applyStylePreset } from '../features/canvas/canvas-styling';
import { CustomStylePreset, BlockStyle } from '../types/index';

let activeEditingPresetId: string | null = null;

/**
 * Render toàn bộ giao diện danh sách Preset tùy chỉnh trong Tab Style
 */
export function renderCustomPresetsUI(): void {
    const container = document.getElementById('custom-presets-container');
    const badge = document.getElementById('custom-presets-count-badge');
    const presets = getCustomPresets();

    if (badge) {
        badge.textContent = `(${presets.length})`;
    }

    if (!container) return;

    if (presets.length === 0) {
        // EMPTY STATE: Giao diện trống thân thiện, đẹp mắt và hướng dẫn rõ ràng
        container.innerHTML = `
            <div class="p-3.5 rounded-xl bg-slate-900/40 border border-dashed border-slate-800/80 text-center space-y-2.5">
                <div class="w-9 h-9 mx-auto rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center text-sm shadow-inner shadow-indigo-500/10">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                </div>
                <div class="space-y-0.5">
                    <div class="text-xs font-bold text-slate-200">Chưa có mẫu định dạng</div>
                    <div class="text-[10px] text-slate-400 max-w-[240px] mx-auto leading-relaxed">
                        Tùy chỉnh một ô thoại rồi bấm <span class="text-indigo-300 font-semibold">Lưu mẫu</span> để lưu lại dùng nhiều lần!
                    </div>
                </div>
                <div class="flex items-center justify-center gap-2 pt-0.5">
                    <button onclick="savePresetFromActiveBlockUI()"
                        class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-[10px] font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                        <i class="fa-solid fa-floppy-disk text-[9px]"></i> <span>Lưu từ ô chọn</span>
                    </button>
                    <button onclick="openPresetModal('create')"
                        class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-[10px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                        <i class="fa-solid fa-plus text-[9px]"></i> <span>Tạo mới</span>
                    </button>
                </div>
            </div>
        `;
    } else {
        // DANH SÁCH MẪU ĐỊNH DẠNG TÙY CHỈNH (DANH SÁCH THANH NGANG GỌN GÀNG)
        let html = '<div class="space-y-1.5 max-h-80 overflow-y-auto pr-0.5 custom-scrollbar">';

        presets.forEach(preset => {
            const fontMap: Record<string, string> = {
                'font-comic': 'Patrick Hand, cursive',
                'font-comicneue': 'Comic Neue, sans-serif',
                'font-manga': 'Nunito, sans-serif',
                'font-vietnamese': 'Be Vietnam Pro, sans-serif',
                'font-impact': 'Bangers, cursive',
                'font-marker': 'Permanent Marker, cursive',
                'font-bungee': 'Bungee, cursive',
                'font-caveat': 'Caveat, cursive',
                'font-tech': 'Chakra Petch, sans-serif',
                'font-condensed': 'Saira Condensed, sans-serif'
            };

            const fontFam = fontMap[preset.style?.fontFamily || ''] || 'Nunito, sans-serif';
            const textColor = preset.style?.textColor || '#ffffff';
            const bgColor = preset.style?.bgColor || '#000000';
            const bgOp = preset.style?.bgOpacity !== undefined ? preset.style.bgOpacity / 100 : 1;
            const strokeColor = preset.style?.strokeColor || '#000000';
            const strokeWidth = preset.style?.strokeWidth || 0;
            const isBold = !!preset.style?.bold;
            const isItalic = !!preset.style?.italic;

            // Generate a mini visual preview CSS style
            const previewStyle = `
                font-family: ${fontFam};
                color: ${textColor};
                background: ${bgOp === 0 ? 'transparent' : bgColor};
                opacity: ${bgOp === 0 ? 1 : Math.max(0.7, bgOp)};
                ${strokeWidth > 0 ? `-webkit-text-stroke: ${Math.min(1.2, strokeWidth * 0.35)}px ${strokeColor};` : ''}
                font-weight: ${isBold ? 'bold' : 'normal'};
                font-style: ${isItalic ? 'italic' : 'normal'};
            `;

            html += `
                <div onclick="applyCustomPresetUI('${preset.id}')"
                    class="group relative flex items-center justify-between p-2 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/60 active:scale-[0.99] transition-all gap-2 shadow-sm cursor-pointer select-none"
                    title="Nhấp để áp dụng mẫu: ${escapeHTML(preset.name)}">
                    
                    <!-- Left: Icon + Name + Description -->
                    <div class="flex items-center gap-2 min-w-0 flex-1">
                        <span class="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 flex items-center justify-center text-xs font-bold shrink-0">
                            ${escapeHTML(preset.icon || '💬')}
                        </span>
                        <div class="min-w-0 flex-1">
                            <div class="text-[11px] font-bold text-slate-200 group-hover:text-indigo-300 truncate transition-colors leading-tight">
                                ${escapeHTML(preset.name)}
                            </div>
                            <div class="text-[9px] text-slate-400 truncate leading-tight">
                                ${escapeHTML(preset.desc || generateStyleSummary(preset.style))}
                            </div>
                        </div>
                    </div>

                    <!-- Right: Visual Preview Chip & Hover Actions -->
                    <div class="flex items-center gap-1.5 shrink-0">
                        <!-- Visual Preview Chip -->
                        <div class="px-2.5 py-1 rounded-md bg-slate-950/90 border border-slate-800 text-[10px] font-semibold text-center truncate tracking-wide select-none min-w-[70px]"
                            style="${previewStyle}">
                            Aa Bb 123
                        </div>

                        <!-- Quick Mini Action Icons (Hidden until hover) -->
                        <div class="hidden group-hover:flex items-center gap-0.5 transition-all">
                            <button onclick="event.stopPropagation(); updatePresetFromActiveBlockUI('${preset.id}')"
                                title="Cập nhật kiểu chữ từ ô thoại đang chọn"
                                class="w-6 h-6 rounded bg-slate-800/90 hover:bg-amber-950/80 border border-slate-700 text-slate-300 hover:text-amber-300 flex items-center justify-center text-[10px] transition-colors cursor-pointer">
                                <i class="fa-solid fa-rotate"></i>
                            </button>
                            <button onclick="event.stopPropagation(); openPresetModal('edit', '${preset.id}')"
                                title="Chỉnh sửa thông tin mẫu"
                                class="w-6 h-6 rounded bg-slate-800/90 hover:bg-indigo-950/80 border border-slate-700 text-slate-300 hover:text-indigo-300 flex items-center justify-center text-[10px] transition-colors cursor-pointer">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button onclick="event.stopPropagation(); deletePresetUI('${preset.id}')"
                                title="Xóa mẫu này"
                                class="w-6 h-6 rounded bg-slate-800/90 hover:bg-red-950/80 border border-slate-700 text-slate-300 hover:text-red-400 flex items-center justify-center text-[10px] transition-colors cursor-pointer">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    // Đồng bộ sang thanh Quick Presets trên Block Editor
    renderQuickPresetsBar();
}

/**
 * Render thanh "Định dạng 1-chạm" trong phần chỉnh sửa ô thoại
 */
export function renderQuickPresetsBar(): void {
    const quickContainer = document.getElementById('active-block-quick-presets');
    if (!quickContainer) return;

    const presets = getCustomPresets();
    if (presets.length === 0) {
        quickContainer.innerHTML = `
            <div class="flex items-center justify-between w-full">
                <span class="text-[9px] text-slate-500 italic">Chưa có mẫu tùy chỉnh</span>
                <button onclick="savePresetFromActiveBlockUI()"
                    class="text-[10px] bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 text-indigo-300 hover:text-white px-2 py-0.5 rounded transition-all font-semibold flex items-center gap-1 cursor-pointer">
                    <i class="fa-solid fa-plus text-[8px]"></i> Lưu mẫu hiện tại
                </button>
            </div>
        `;
        return;
    }

    // Hiển thị tối đa 4-6 preset đầu tiên cho thanh nhanh
    const quickList = presets.slice(0, 6);
    let html = '<div class="grid grid-cols-2 gap-1.5 w-full">';

    quickList.forEach(p => {
        html += `
            <button onclick="applyCustomPresetUI('${p.id}')"
                class="p-1.5 rounded-lg bg-slate-900 hover:bg-indigo-950/70 border border-slate-800 hover:border-indigo-500/50 text-left transition-all group flex items-center gap-1.5 cursor-pointer shadow-sm">
                <span class="w-6 h-6 rounded bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs font-bold shrink-0">
                    ${escapeHtml(p.icon || '💬')}
                </span>
                <div class="min-w-0 flex-1">
                    <div class="text-[10px] font-bold text-slate-200 group-hover:text-indigo-300 truncate">
                        ${escapeHtml(p.name)}
                    </div>
                    <div class="text-[8px] text-slate-500 truncate">
                        ${escapeHtml(p.desc || generateStyleSummary(p.style))}
                    </div>
                </div>
            </button>
        `;
    });

    html += '</div>';
    quickContainer.innerHTML = html;
}

/**
 * Áp dụng Preset cho ô thoại đang chọn
 */
export function applyCustomPresetUI(id: string): void {
    applyStylePreset(id);
}

/**
 * Lưu mẫu mới từ ô thoại đang chọn (mở modal hoặc tạo nhanh)
 */
export function savePresetFromActiveBlockUI(): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        showToast("Vui lòng nhấp chọn một ô thoại trên ảnh trước để lưu mẫu.", "warn");
        return;
    }
    openPresetModal('create');
}

/**
 * Cập nhật style từ ô thoại đang chọn vào Preset hiện có
 */
export function updatePresetFromActiveBlockUI(id: string): void {
    const success = updatePresetFromActiveBlock(id);
    if (success) {
        renderCustomPresetsUI();
    }
}

/**
 * Nhân bản Preset
 */
export function duplicatePresetUI(id: string): void {
    const copy = duplicatePreset(id);
    if (copy) {
        renderCustomPresetsUI();
    }
}

/**
 * Xóa Preset
 */
export function deletePresetUI(id: string): void {
    const preset = getPresetById(id);
    if (!preset) return;

    if (confirm(`Bạn có chắc muốn xóa mẫu định dạng "${preset.name}" không?`)) {
        deleteCustomPreset(id);
        renderCustomPresetsUI();
        showToast(`🗑️ Đã xóa mẫu "${preset.name}"`, "info");
    }
}

/**
 * Mở Modal Tạo / Chỉnh sửa Preset
 */
export function openPresetModal(mode: 'create' | 'edit' = 'create', presetId?: string): void {
    const modal = document.getElementById('custom-preset-modal');
    if (!modal) return;

    activeEditingPresetId = mode === 'edit' && presetId ? presetId : null;

    const modalTitle = document.getElementById('preset-modal-title');
    const nameInput = document.getElementById('preset-modal-name') as HTMLInputElement | null;
    const iconInput = document.getElementById('preset-modal-icon') as HTMLInputElement | null;
    const descInput = document.getElementById('preset-modal-desc') as HTMLInputElement | null;
    const sourceNotice = document.getElementById('preset-modal-source-notice');

    let currentStyle: Partial<BlockStyle> = {};

    if (mode === 'edit' && presetId) {
        const existing = getPresetById(presetId);
        if (existing) {
            if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-pen-to-square text-indigo-400"></i> Chỉnh sửa Mẫu: ${escapeHtml(existing.name)}`;
            if (nameInput) nameInput.value = existing.name;
            if (iconInput) iconInput.value = existing.icon || '💬';
            if (descInput) descInput.value = existing.desc || '';
            currentStyle = existing.style || {};
            if (sourceNotice) sourceNotice.classList.add('hidden');
        }
    } else {
        // Create mode
        const defaultIndex = getCustomPresets().length + 1;
        if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles text-indigo-400"></i> Tạo Mẫu Định Dạng Mới`;
        if (nameInput) nameInput.value = `Mẫu Manga #${defaultIndex}`;
        if (iconInput) iconInput.value = '💬';
        if (descInput) descInput.value = '';

        // Trích xuất style từ ô thoại đang chọn nếu có
        if (globalState.activePageIndex >= 0 && globalState.selectedBlockId) {
            const page = globalState.pages[globalState.activePageIndex];
            const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
            if (block && block.type !== 'image') {
                currentStyle = extractStyleFromBlock(block);
                if (descInput && !descInput.value) {
                    descInput.value = generateStyleSummary(currentStyle);
                }
                if (sourceNotice) {
                    sourceNotice.classList.remove('hidden');
                    sourceNotice.textContent = `✨ Đang lấy kiểu dáng hiện tại từ ô thoại [${block.id}]`;
                }
            } else {
                if (sourceNotice) sourceNotice.classList.add('hidden');
            }
        } else {
            if (sourceNotice) sourceNotice.classList.add('hidden');
        }
    }

    updatePresetModalPreview(currentStyle);
    modal.classList.remove('hidden');
    if (nameInput) {
        setTimeout(() => nameInput.focus(), 50);
    }
}

/**
 * Đóng Modal Preset
 */
export function closePresetModal(): void {
    const modal = document.getElementById('custom-preset-modal');
    if (modal) modal.classList.add('hidden');
    activeEditingPresetId = null;
}

/**
 * Cập nhật khung xem trước trong Modal
 */
export function updatePresetModalPreview(style: Partial<BlockStyle>): void {
    const previewBox = document.getElementById('preset-modal-preview-box');
    const previewText = document.getElementById('preset-modal-preview-text');
    if (!previewBox || !previewText) return;

    const fontMap: Record<string, string> = {
        'font-comic': 'Patrick Hand, cursive',
        'font-comicneue': 'Comic Neue, sans-serif',
        'font-manga': 'Nunito, sans-serif',
        'font-vietnamese': 'Be Vietnam Pro, sans-serif',
        'font-impact': 'Bangers, cursive',
        'font-marker': 'Permanent Marker, cursive',
        'font-bungee': 'Bungee, cursive',
        'font-caveat': 'Caveat, cursive',
        'font-tech': 'Chakra Petch, sans-serif',
        'font-condensed': 'Saira Condensed, sans-serif'
    };

    const fontFam = fontMap[style.fontFamily || ''] || 'Nunito, sans-serif';
    const textColor = style.textColor || '#000000';
    const bgColor = style.bgColor || '#ffffff';
    const bgOp = style.bgOpacity !== undefined ? style.bgOpacity / 100 : 1;
    const strokeColor = style.strokeColor || '#000000';
    const strokeWidth = style.strokeWidth || 0;
    const isBold = !!style.bold;
    const isItalic = !!style.italic;

    previewText.style.fontFamily = fontFam;
    previewText.style.color = textColor;
    previewText.style.fontWeight = isBold ? 'bold' : 'normal';
    previewText.style.fontStyle = isItalic ? 'italic' : 'normal';
    previewText.style.webkitTextStroke = strokeWidth > 0 ? `${Math.min(2, strokeWidth * 0.5)}px ${strokeColor}` : '0px';

    previewBox.style.backgroundColor = bgOp === 0 ? 'transparent' : bgColor;
    previewBox.style.opacity = bgOp === 0 ? '1' : String(Math.max(0.7, bgOp));
}

/**
 * Chọn nhanh Icon emoji từ danh sách gợi ý
 */
export function selectPresetIconEmoji(emoji: string): void {
    const iconInput = document.getElementById('preset-modal-icon') as HTMLInputElement | null;
    if (iconInput) {
        iconInput.value = emoji;
    }
}

/**
 * Xử lý Lưu mẫu từ Modal
 */
export function submitPresetModal(): void {
    const nameInput = document.getElementById('preset-modal-name') as HTMLInputElement | null;
    const iconInput = document.getElementById('preset-modal-icon') as HTMLInputElement | null;
    const descInput = document.getElementById('preset-modal-desc') as HTMLInputElement | null;

    const name = nameInput?.value.trim();
    if (!name) {
        showToast("Vui lòng nhập tên cho mẫu định dạng.", "warn");
        nameInput?.focus();
        return;
    }

    const icon = iconInput?.value.trim() || '💬';
    const desc = descInput?.value.trim();

    if (activeEditingPresetId) {
        // Cập nhật preset hiện có
        const preset = getPresetById(activeEditingPresetId);
        if (preset) {
            preset.name = name;
            preset.icon = icon;
            if (desc) preset.desc = desc;
            preset.updatedAt = Date.now();
            saveCustomPreset(preset);
            showToast(`✨ Đã cập nhật mẫu "${preset.name}"!`, "success");
        }
    } else {
        // Tạo preset mới
        let style: Partial<BlockStyle> = {};
        if (globalState.activePageIndex >= 0 && globalState.selectedBlockId) {
            const page = globalState.pages[globalState.activePageIndex];
            const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
            if (block && block.type !== 'image') {
                style = extractStyleFromBlock(block);
            }
        }

        const newPreset: CustomStylePreset = {
            id: 'preset_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            name,
            icon,
            desc: desc || generateStyleSummary(style),
            style,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        saveCustomPreset(newPreset);
        showToast(`✨ Đã tạo mẫu định dạng "${newPreset.name}"!`, "success");
    }

    closePresetModal();
    renderCustomPresetsUI();
}

/**
 * Mở file dialog để nhập file JSON presets
 */
export function triggerImportPresetsFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            if (content) {
                const res = importPresetsJSON(content);
                if (res.success) {
                    renderCustomPresetsUI();
                } else {
                    showToast(`❌ Không thể nhập file: ${res.error || 'Lỗi dữ liệu'}`, "error");
                }
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

/**
 * Xóa sạch toàn bộ preset người dùng sau khi xác nhận
 */
export function clearAllPresetsWithConfirm(): void {
    const list = getCustomPresets();
    if (list.length === 0) {
        showToast("Danh sách mẫu đã trống.", "info");
        return;
    }

    if (confirm(`Bạn có chắc chắn muốn xóa TOÀN BỘ ${list.length} mẫu định dạng đã lưu không? Hành động này không thể hoàn tác.`)) {
        clearAllCustomPresets();
        renderCustomPresetsUI();
        showToast("🧹 Đã xóa toàn bộ mẫu định dạng!", "info");
    }
}

