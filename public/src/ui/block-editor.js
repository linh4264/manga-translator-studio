import { globalState } from '../core/state.js';
import { elements } from '../core/elements.js';
import { escapeHTML } from '../core/utils.js';
import { showToast } from '../core/utils.js';
import { requestOverlayRender } from '../features/canvas/canvas-service.js';
import { saveEraserDrawingToPage } from '../features/inpainting.js';
import { displayToeicAnalysis, resetToeicAnalysisUI } from '../features/toeic.js';

// 11. Đồng bộ dữ liệu ô thoại lên thanh điều khiển sidebar và công cụ nổi
export function updateActiveBlockEditor() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        elements.noBlockSelectedState.classList.remove('hidden');
        elements.blockEditorContainer.classList.add('hidden');

        if (elements.toeicNoBlockSelectedState) elements.toeicNoBlockSelectedState.classList.remove('hidden');
        if (elements.toeicAnalysisContainer) elements.toeicAnalysisContainer.classList.add('hidden');
        globalState.activeBlockToeicAnalysis = null;
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);

    if (!block) {
        globalState.selectedBlockId = null;
        elements.noBlockSelectedState.classList.remove('hidden');
        elements.blockEditorContainer.classList.add('hidden');

        if (elements.toeicNoBlockSelectedState) elements.toeicNoBlockSelectedState.classList.remove('hidden');
        if (elements.toeicAnalysisContainer) elements.toeicAnalysisContainer.classList.add('hidden');
        globalState.activeBlockToeicAnalysis = null;
        return;
    }

    elements.noBlockSelectedState.classList.add('hidden');
    elements.blockEditorContainer.classList.remove('hidden');

    if (elements.toeicNoBlockSelectedState) elements.toeicNoBlockSelectedState.classList.add('hidden');
    if (elements.toeicAnalysisContainer) {
        elements.toeicAnalysisContainer.classList.remove('hidden');

        if (globalState.activeBlockToeicAnalysis && globalState.activeBlockToeicAnalysis.blockId === block.id) {
            displayToeicAnalysis(globalState.activeBlockToeicAnalysis.analysis);
        } else {
            resetToeicAnalysisUI();
        }
    }

    elements.editOriginalText.value = block.original;
    elements.editTranslatedText.value = block.translated;
    elements.lblBlockId.innerText = block.id;

    const speakerInput = document.getElementById('edit-block-speaker');
    const targetInput = document.getElementById('edit-block-target');
    if (speakerInput) speakerInput.value = block.speaker || '';
    if (targetInput) targetInput.value = block.target || '';

    const btnDialogue = document.getElementById('btn-block-type-dialogue');
    const btnSfx = document.getElementById('btn-block-type-sfx');
    const blockType = block.type || 'dialogue';
    if (btnDialogue && btnSfx) {
        if (blockType === 'sfx') {
            btnSfx.className = 'py-1.5 px-2 text-[11px] font-semibold rounded bg-amber-600 text-white flex items-center justify-center gap-1.5 transition-all';
            btnDialogue.className = 'py-1.5 px-2 text-[11px] font-semibold rounded text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5 transition-all';
        } else {
            btnDialogue.className = 'py-1.5 px-2 text-[11px] font-semibold rounded bg-indigo-600 text-white flex items-center justify-center gap-1.5 transition-all';
            btnSfx.className = 'py-1.5 px-2 text-[11px] font-semibold rounded text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5 transition-all';
        }
    }

    const btnMale = document.getElementById('btn-block-gender-male');
    const btnFemale = document.getElementById('btn-block-gender-female');
    const btnNeutral = document.getElementById('btn-block-gender-neutral');
    const currentGender = block.style?.gender || 'auto';

    if (btnMale && btnFemale && btnNeutral) {
        btnMale.className = currentGender === 'male' ? 'py-1 px-1.5 text-[10px] font-bold rounded bg-sky-600 text-white shadow transition-all' : 'py-1 px-1.5 text-[10px] font-semibold rounded bg-slate-900 text-slate-400 hover:text-white transition-all';
        btnFemale.className = currentGender === 'female' ? 'py-1 px-1.5 text-[10px] font-bold rounded bg-pink-600 text-white shadow transition-all' : 'py-1 px-1.5 text-[10px] font-semibold rounded bg-slate-900 text-slate-400 hover:text-white transition-all';
        btnNeutral.className = (currentGender === 'neutral' || currentGender === 'auto') ? 'py-1 px-1.5 text-[10px] font-bold rounded bg-purple-600 text-white shadow transition-all' : 'py-1 px-1.5 text-[10px] font-semibold rounded bg-slate-900 text-slate-400 hover:text-white transition-all';
    }

    const sfxRotateSlider = document.getElementById('slider-sfx-rotate');
    const sfxRotateLbl = document.getElementById('lbl-sfx-rotate');
    const sfxArcSlider = document.getElementById('slider-sfx-arc');
    const sfxArcLbl = document.getElementById('lbl-sfx-arc');

    const currentRotate = block.style.rotate || 0;
    const currentArc = block.style.arcAngle || 0;

    if (sfxRotateSlider) sfxRotateSlider.value = currentRotate;
    if (sfxRotateLbl) sfxRotateLbl.textContent = `${currentRotate}°`;
    if (sfxArcSlider) sfxArcSlider.value = currentArc;
    if (sfxArcLbl) sfxArcLbl.textContent = `${currentArc}°`;

    const btnSfxRestore = document.getElementById('btn-sfx-restore');
    if (btnSfxRestore) {
        if (block.originalBackgroundBackup) {
            btnSfxRestore.classList.remove('hidden');
        } else {
            btnSfxRestore.classList.add('hidden');
        }
    }

    if (elements.styleAutoFit) elements.styleAutoFit.checked = !!globalState.autoFitEnabled;
    elements.styleFont.value = block.style.fontFamily;
    elements.styleFontSize.value = block.style.fontSize;
    elements.lblFontSize.innerText = `${block.style.fontSize}px`;
    elements.styleAlign.value = block.style.align;

    elements.styleBold.checked = block.style.bold;

    elements.styleTextColor.value = block.style.textColor;
    elements.styleTextColorHex.value = block.style.textColor.toUpperCase();
    elements.styleBgColor.value = block.style.bgColor;
    elements.styleBgColorHex.value = block.style.bgColor.toUpperCase();

    elements.styleBgOpacity.value = block.style.bgOpacity;
    elements.lblBgOpacity.innerText = `${block.style.bgOpacity}%`;

    elements.stylePadding.value = block.style.padding;
    elements.lblPadding.innerText = `${block.style.padding}px`;

    if (elements.styleRotate) {
        elements.styleRotate.value = block.style.rotate || 0;
    }
    if (elements.lblRotate) {
        elements.lblRotate.innerText = `${block.style.rotate || 0}°`;
    }

    if (elements.styleStrokeColor) elements.styleStrokeColor.value = block.style.strokeColor || '#ffffff';
    if (elements.styleStrokeColorHex) elements.styleStrokeColorHex.value = (block.style.strokeColor || '#ffffff').toUpperCase();
    if (elements.styleStrokeWidth) elements.styleStrokeWidth.value = block.style.strokeWidth || 0;
    if (elements.lblStrokeWidth) elements.lblStrokeWidth.innerText = `${block.style.strokeWidth || 0}px`;

    if (elements.styleShadowColor) elements.styleShadowColor.value = block.style.shadowColor || '#000000';
    if (elements.styleShadowColorHex) elements.styleShadowColorHex.value = (block.style.shadowColor || '#000000').toUpperCase();
    if (elements.styleShadowBlur) elements.styleShadowBlur.value = block.style.shadowBlur || 0;
    if (elements.lblShadowBlur) elements.lblShadowBlur.innerText = `${block.style.shadowBlur || 0}px`;

    elements.styleMaskShape.value = block.style.maskShape || 'bubble-fit';
    elements.styleMaskSize.value = block.style.maskSize || 'full';

    if (block.style.vertical) {
        elements.btnStyleVert.className = "py-1 text-xs rounded bg-indigo-600 text-white font-semibold";
        elements.btnStyleHoriz.className = "py-1 text-xs rounded bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800 font-semibold";
    } else {
        elements.btnStyleHoriz.className = "py-1 text-xs rounded bg-indigo-600 text-white font-semibold";
        elements.btnStyleVert.className = "py-1 text-xs rounded bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800 font-semibold";
    }
}

// 13. Khôi phục ảnh nền cũ của ô thoại SFX đã vẽ đè
export async function restoreBackgroundForBlock(blockId) {
    const page = globalState.pages[globalState.activePageIndex];
    if (!page) return;
    const block = page.blocks.find(b => b.id === blockId);
    if (!block || !block.originalBackgroundBackup) return;

    const canvas = elements.eraserCanvas;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const img = new Image();

    await new Promise((resolve) => {
        img.onload = () => {
            const bx = Math.round((block.box.x / 100) * canvas.width);
            const by = Math.round((block.box.y / 100) * canvas.height);
            const bw = Math.round((block.box.w / 100) * canvas.width);
            const bh = Math.round((block.box.h / 100) * canvas.height);

            ctx.save();
            ctx.beginPath();
            ctx.rect(bx, by, bw, bh);
            ctx.clip();
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            ctx.restore();
            resolve();
        };
        img.onerror = resolve;
        img.src = block.originalBackgroundBackup;
    });

    block.originalBackgroundBackup = null;
    await saveEraserDrawingToPage();
    requestOverlayRender();
    updateActiveBlockEditor();
    showToast("Đã khôi phục nền gốc của chữ SFX thành công!", "success");
}

export function syncTextColorHex(val) {
    let color = val;
    if (color && !color.startsWith('#') && color.length <= 6) {
        color = '#' + color;
    }
    if (elements.styleTextColor) elements.styleTextColor.value = color;
    if (elements.styleTextColorHex) elements.styleTextColorHex.value = color.toUpperCase();
    import('../features/canvas/canvas-service.js').then(canvas => canvas.syncActiveBlockStyle('textColor', color));
}

window.syncTextColorHex = syncTextColorHex;