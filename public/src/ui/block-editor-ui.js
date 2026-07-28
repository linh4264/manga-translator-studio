import { globalState, savePageToDB } from '../core/state.js';
import { elements } from '../core/elements.js';
import { showToast } from '../core/utils.js';
import { requestOverlayRender, syncActiveBlockStyle } from '../features/canvas/canvas-service.js';
import { saveEraserDrawingToPage } from '../features/inpainting.js';
import { displayToeicAnalysis, resetToeicAnalysisUI } from '../features/toeic.js';

export function updateActiveBlockEditor() {
    const activeBlock = getActiveBlock();
    if (!activeBlock) {
        resetBlockEditorUI();
        return;
    }

    elements.noBlockSelectedState.classList.add('hidden');
    elements.blockEditorContainer.classList.remove('hidden');

    syncBlockTextInputs(activeBlock);
    syncBlockTypeUI(activeBlock);
    syncBlockGenderUI(activeBlock);
    syncBlockStyleInputs(activeBlock);
}

function resetBlockEditorUI() {
    globalState.selectedBlockId = null;
    if (elements.noBlockSelectedState) elements.noBlockSelectedState.classList.remove('hidden');
    if (elements.blockEditorContainer) elements.blockEditorContainer.classList.add('hidden');

    if (elements.toeicNoBlockSelectedState) elements.toeicNoBlockSelectedState.classList.remove('hidden');
    if (elements.toeicAnalysisContainer) elements.toeicAnalysisContainer.classList.add('hidden');
    globalState.activeBlockToeicAnalysis = null;
}

function getActiveBlock() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return null;
    const page = globalState.pages[globalState.activePageIndex];
    return page?.blocks?.find(b => b.id === globalState.selectedBlockId) || null;
}

function syncBlockTextInputs(block) {
    elements.editOriginalText.value = block.original;
    elements.editTranslatedText.value = block.translated;
    elements.lblBlockId.innerText = block.id;
    const speakerInput = document.getElementById('edit-block-speaker');
    const targetInput = document.getElementById('edit-block-target');
    if (speakerInput) speakerInput.value = block.speaker || '';
    if (targetInput) targetInput.value = block.target || '';
}

function syncBlockTypeUI(block) {
    const blockType = block.type || 'dialogue';
    const btnDialogue = document.getElementById('btn-block-type-dialogue');
    const btnSfx = document.getElementById('btn-block-type-sfx');
    if (btnDialogue && btnSfx) {
        if (blockType === 'sfx') {
            btnSfx.className = 'py-1.5 px-2 text-[11px] font-semibold rounded bg-amber-600 text-white flex items-center justify-center gap-1.5 transition-all';
            btnDialogue.className = 'py-1.5 px-2 text-[11px] font-semibold rounded text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5 transition-all';
        } else {
            btnDialogue.className = 'py-1.5 px-2 text-[11px] font-semibold rounded bg-indigo-600 text-white flex items-center justify-center gap-1.5 transition-all';
            btnSfx.className = 'py-1.5 px-2 text-[11px] font-semibold rounded text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5 transition-all';
        }
    }
}

function syncBlockGenderUI(block) {
    const currentGender = block.style?.gender || 'auto';
    const btnMale = document.getElementById('btn-block-gender-male');
    const btnFemale = document.getElementById('btn-block-gender-female');
    const btnNeutral = document.getElementById('btn-block-gender-neutral');
    if (btnMale && btnFemale && btnNeutral) {
        btnMale.className = currentGender === 'male' ? 'py-1 px-1.5 text-[10px] font-bold rounded bg-sky-600 text-white shadow transition-all' : 'py-1 px-1.5 text-[10px] font-semibold rounded bg-slate-900 text-slate-400 hover:text-white transition-all';
        btnFemale.className = currentGender === 'female' ? 'py-1 px-1.5 text-[10px] font-bold rounded bg-pink-600 text-white shadow transition-all' : 'py-1 px-1.5 text-[10px] font-semibold rounded bg-slate-900 text-slate-400 hover:text-white transition-all';
        btnNeutral.className = (currentGender === 'neutral' || currentGender === 'auto') ? 'py-1 px-1.5 text-[10px] font-bold rounded bg-purple-600 text-white shadow transition-all' : 'py-1 px-1.5 text-[10px] font-semibold rounded bg-slate-900 text-slate-400 hover:text-white transition-all';
    }
}

function syncBlockStyleInputs(block) {
    // SFX Specific Sliders (if needed, otherwise this can be moved to syncSFXStyle)
    const currentRotate = block.style.rotate || 0;
    const currentArc = block.style.arcAngle || 0;
    const sfxRotateSlider = document.getElementById('slider-sfx-rotate');
    const sfxRotateLbl = document.getElementById('lbl-sfx-rotate');
    const sfxArcSlider = document.getElementById('slider-sfx-arc');
    const sfxArcLbl = document.getElementById('lbl-sfx-arc');
    if (sfxRotateSlider) sfxRotateSlider.value = currentRotate;
    if (sfxRotateLbl) sfxRotateLbl.textContent = `${currentRotate}°`;
    if (sfxArcSlider) sfxArcSlider.value = currentArc;
    if (sfxArcLbl) sfxArcLbl.textContent = `${currentArc}°`;
    const btnSfxRestore = document.getElementById('btn-sfx-restore');
    if (btnSfxRestore) btnSfxRestore.classList.toggle('hidden', !block.originalBackgroundBackup);

    // General Style
    if (elements.styleAutoFit) elements.styleAutoFit.checked = !!globalState.autoFitEnabled;
    elements.styleFont.value = block.style.fontFamily;
    elements.styleFontSize.value = block.style.fontSize;
    const fontSizeLbl = document.getElementById('lbl-font-size') || elements.lblFontSize;
    if (fontSizeLbl) fontSizeLbl.innerText = `${block.style.fontSize}px`;
    elements.styleAlign.value = block.style.align;
    if (elements.styleBold) elements.styleBold.checked = block.style.bold;
    syncColorAndOpacityInputs(block);
}

function syncColorAndOpacityInputs(block) {
    if (!block.style) block.style = {};

    const textColor = block.style.textColor || '#ffffff';
    const bgColor = block.style.bgColor || '#000000';
    const strokeColor = block.style.strokeColor || '#ffffff';
    const shadowColor = block.style.shadowColor || '#000000';

    const textColorHex = block.style.textColorHex || textColor.toUpperCase();
    const bgColorHex = block.style.bgColorHex || bgColor.toUpperCase();
    const strokeColorHex = block.style.strokeColorHex || strokeColor.toUpperCase();
    const shadowColorHex = block.style.shadowColorHex || shadowColor.toUpperCase();

    const bgOpacity = block.style.bgOpacity || 0;
    const padding = block.style.padding || 0;

    if (elements.styleTextColor) elements.styleTextColor.value = textColor;
    if (elements.styleTextColorHex) elements.styleTextColorHex.value = textColorHex;

    if (elements.styleBgColor) elements.styleBgColor.value = bgColor;
    if (elements.styleBgColorHex) elements.styleBgColorHex.value = bgColorHex;

    if (elements.styleStrokeColor) elements.styleStrokeColor.value = strokeColor;
    if (elements.styleStrokeColorHex) elements.styleStrokeColorHex.value = strokeColorHex;

    if (elements.styleShadowColor) elements.styleShadowColor.value = shadowColor;
    if (elements.styleShadowColorHex) elements.styleShadowColorHex.value = shadowColorHex;

    if (elements.styleBgOpacity) {
        elements.styleBgOpacity.value = bgOpacity;
        const lblBgOpacity = document.getElementById('lbl-bg-opacity') || elements.lblBgOpacity;
        if (lblBgOpacity) lblBgOpacity.innerText = `${bgOpacity}%`;
    }

    if (elements.stylePadding) {
        elements.stylePadding.value = padding;
        const lblPadding = document.getElementById('lbl-padding') || elements.lblPadding;
        if (lblPadding) lblPadding.innerText = `${padding}px`;
    }
}

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

export function restoreOriginalBackground() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    restoreBackgroundForBlock(globalState.selectedBlockId);
}

function applyColorSync(val, styleProperty, inputEl, hexInputEl) {
    let color = val;
    if (color && !color.startsWith('#') && color.length <= 6) {
        color = '#' + color;
    }
    if (inputEl) inputEl.value = color;
    if (hexInputEl) hexInputEl.value = color.toUpperCase();
    syncActiveBlockStyle(styleProperty, color);
}

export function syncTextColorHex(val) {
    applyColorSync(val, 'textColor', elements.styleTextColor, elements.styleTextColorHex);
}

export function syncBgColorHex(val) {
    applyColorSync(val, 'bgColor', elements.styleBgColor, elements.styleBgColorHex);
}

export function syncStrokeColorHex(val) {
    applyColorSync(val, 'strokeColor', elements.styleStrokeColor, elements.styleStrokeColorHex);
}

export function syncShadowColorHex(val) {
    applyColorSync(val, 'shadowColor', elements.styleShadowColor, elements.styleShadowColorHex);
}

export function setBilingualMode(mode) {
    globalState.bilingualMode = mode;
    const btnSub = document.getElementById('btn-bilingual-sub');
    const btnOff = document.getElementById('btn-bilingual-off');

    if (mode === 'sub') {
        if (btnSub) btnSub.className = "px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold transition-all shadow";
        if (btnOff) btnOff.className = "px-2 py-0.5 rounded bg-transparent text-slate-400 text-[10px] font-semibold hover:text-white transition-all";
        showToast("Đã bật Chế độ Song Ngữ (Hiển thị Tiếng Việt + Tiếng Nhật/Anh)", "success");
    } else {
        if (btnOff) btnOff.className = "px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold transition-all shadow";
        if (btnSub) btnSub.className = "px-2 py-0.5 rounded bg-transparent text-slate-400 text-[10px] font-semibold hover:text-white transition-all";
        showToast("Đã chuyển về Chế độ Đơn ngữ chuẩn", "info");
    }
    requestOverlayRender();
}

export function setActiveBlockGender(gender) {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !globalState.selectedBlockId) return;

    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block) {
        if (!block.style) block.style = {};
        block.style.gender = gender;
        savePageToDB(page);
        updateActiveBlockEditor();
        showToast(`Đã gán giọng đọc ${gender === 'female' ? 'Nữ 👩' : (gender === 'male' ? 'Nam 👨' : 'Dẫn chuyện 🎙️')} cho ô thoại này!`, 'info');
    }
}