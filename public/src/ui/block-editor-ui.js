import { globalState, savePageToDB } from '../core/state.js';
import { elements } from '../core/elements.js';
import { showToast } from '../core/utils.js';
import { requestOverlayRender, syncActiveBlockStyle, isBlockAutoFit } from '../features/canvas/canvas-service.js';
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

    const imageControls = document.getElementById('image-controls-container');
    const sfxControls = document.getElementById('sfx-controls-container');
    const textOriginalContainer = elements.editOriginalText?.parentElement;
    const textTranslatedContainer = elements.editTranslatedText?.parentElement;

    if (elements.lblBlockId) elements.lblBlockId.innerText = activeBlock.id;

    if (activeBlock.type === 'image') {
        if (imageControls) imageControls.classList.remove('hidden');
        if (sfxControls) sfxControls.classList.add('hidden');
        if (textOriginalContainer) textOriginalContainer.classList.add('hidden');
        if (textTranslatedContainer) textTranslatedContainer.classList.add('hidden');

        const imgPreview = document.getElementById('img-block-preview');
        const opacitySlider = document.getElementById('slider-image-opacity');
        const opacityLbl = document.getElementById('lbl-image-opacity');
        const fitSelect = document.getElementById('select-image-fit');
        const radiusSlider = document.getElementById('slider-image-border-radius');
        const radiusLbl = document.getElementById('lbl-image-border-radius');

        if (imgPreview) imgPreview.src = activeBlock.imageUrl || '';
        const opVal = activeBlock.style?.opacity !== undefined ? activeBlock.style.opacity : 100;
        if (opacitySlider) opacitySlider.value = opVal;
        if (opacityLbl) opacityLbl.textContent = `${opVal}%`;
        if (fitSelect) fitSelect.value = activeBlock.style?.fit || 'contain';
        const radVal = activeBlock.style?.borderRadius || 0;
        if (radiusSlider) radiusSlider.value = radVal;
        if (radiusLbl) radiusLbl.textContent = `${radVal}px`;
    } else {
        if (imageControls) imageControls.classList.add('hidden');
        if (sfxControls) sfxControls.classList.remove('hidden');
        if (textOriginalContainer) textOriginalContainer.classList.remove('hidden');
        if (textTranslatedContainer) textTranslatedContainer.classList.remove('hidden');

        syncBlockTextInputs(activeBlock);
        syncBlockTypeUI(activeBlock);
        syncBlockGenderUI(activeBlock);
        syncBlockStyleInputs(activeBlock);
    }
}

export function updateImageBlockOpacity(val) {
    const activeBlock = getActiveBlock();
    if (!activeBlock || activeBlock.type !== 'image') return;
    const num = parseInt(val, 10);
    if (!activeBlock.style) activeBlock.style = {};
    activeBlock.style.opacity = num;
    const opacityLbl = document.getElementById('lbl-image-opacity');
    if (opacityLbl) opacityLbl.textContent = `${num}%`;
    requestOverlayRender();
    const page = globalState.pages[globalState.activePageIndex];
    if (page) savePageToDB(page);
}

export function updateImageBlockFit(val) {
    const activeBlock = getActiveBlock();
    if (!activeBlock || activeBlock.type !== 'image') return;
    if (!activeBlock.style) activeBlock.style = {};
    activeBlock.style.fit = val;
    requestOverlayRender();
    const page = globalState.pages[globalState.activePageIndex];
    if (page) savePageToDB(page);
}

export function updateImageBlockBorderRadius(val) {
    const activeBlock = getActiveBlock();
    if (!activeBlock || activeBlock.type !== 'image') return;
    const num = parseInt(val, 10);
    if (!activeBlock.style) activeBlock.style = {};
    activeBlock.style.borderRadius = num;
    const radiusLbl = document.getElementById('lbl-image-border-radius');
    if (radiusLbl) radiusLbl.textContent = `${num}px`;
    requestOverlayRender();
    const page = globalState.pages[globalState.activePageIndex];
    if (page) savePageToDB(page);
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
    const currentRotate = block.style.rotate || 0;
    const currentTextRotate = block.style.textRotate || 0;
    const currentArc = block.style.arcAngle || 0;
    const currentSkewX = block.style.skewX || 0;
    const currentSkewY = block.style.skewY || 0;
    const currentWave = block.style.warpWave || 0;
    const currentBulge = block.style.warpBulge || 0;

    const textRotateSlider = document.getElementById('slider-text-rotate');
    const textRotateLbl = document.getElementById('lbl-text-rotate');
    const sfxRotateSlider = document.getElementById('slider-sfx-rotate') || elements.styleRotate;
    const sfxRotateLbl = document.getElementById('lbl-sfx-rotate') || elements.lblRotate;
    const sfxArcSlider = document.getElementById('slider-sfx-arc');
    const sfxArcLbl = document.getElementById('lbl-sfx-arc');
    const sfxSkewXSlider = document.getElementById('slider-sfx-skew-x');
    const sfxSkewXLbl = document.getElementById('lbl-sfx-skew-x');
    const sfxSkewYSlider = document.getElementById('slider-sfx-skew-y');
    const sfxSkewYLbl = document.getElementById('lbl-sfx-skew-y');
    const sfxWaveSlider = document.getElementById('slider-sfx-wave');
    const sfxWaveLbl = document.getElementById('lbl-sfx-wave');
    const sfxBulgeSlider = document.getElementById('slider-sfx-bulge');
    const sfxBulgeLbl = document.getElementById('lbl-sfx-bulge');

    if (sfxRotateSlider) sfxRotateSlider.value = currentRotate;
    if (sfxRotateLbl) sfxRotateLbl.textContent = `${currentRotate}°`;
    if (sfxArcSlider) sfxArcSlider.value = currentArc;
    if (sfxArcLbl) sfxArcLbl.textContent = `${currentArc}°`;
    if (sfxSkewXSlider) sfxSkewXSlider.value = currentSkewX;
    if (sfxSkewXLbl) sfxSkewXLbl.textContent = `${currentSkewX}°`;
    if (sfxSkewYSlider) sfxSkewYSlider.value = currentSkewY;
    if (sfxSkewYLbl) sfxSkewYLbl.textContent = `${currentSkewY}°`;
    if (sfxWaveSlider) sfxWaveSlider.value = currentWave;
    if (sfxWaveLbl) sfxWaveLbl.textContent = `${currentWave}`;
    if (sfxBulgeSlider) sfxBulgeSlider.value = currentBulge;
    if (sfxBulgeLbl) sfxBulgeLbl.textContent = `${currentBulge}`;

    const btnSfxRestore = document.getElementById('btn-sfx-restore');
    if (btnSfxRestore) btnSfxRestore.classList.toggle('hidden', !block.originalBackgroundBackup);

    // General Style
    const isAutoFit = isBlockAutoFit(block);
    if (elements.styleAutoFit) elements.styleAutoFit.checked = isAutoFit;
    elements.styleFont.value = block.style.fontFamily || globalState.defaultFont || 'font-manga';
    elements.styleFontSize.value = block.style.fontSize || 13;
    const fontSizeLbl = document.getElementById('lbl-font-size') || elements.lblFontSize;
    if (fontSizeLbl) fontSizeLbl.innerText = `${block.style.fontSize || 13}px${isAutoFit ? ' (Auto)' : ''}`;
    elements.styleAlign.value = block.style.align || 'center';
    if (elements.styleBold) elements.styleBold.checked = !!block.style.bold;

    // Sync Align Icon Buttons
    const alignVal = block.style.align || 'center';
    ['left', 'center', 'right'].forEach(a => {
        const btn = document.getElementById(`btn-align-${a}`);
        if (btn) {
            btn.className = (a === alignVal)
                ? 'flex-1 py-1 text-[10px] rounded bg-indigo-600 text-white font-bold transition-all flex items-center justify-center'
                : 'flex-1 py-1 text-[10px] rounded text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center';
        }
    });

    // Sync Direction Buttons
    const isVert = !!block.style.vertical;
    const btnHoriz = document.getElementById('btn-style-horiz');
    const btnVert = document.getElementById('btn-style-vert');
    if (btnHoriz) btnHoriz.className = isVert ? 'flex-1 py-1 text-[10px] rounded text-slate-400 hover:text-slate-200 font-bold transition-all flex items-center justify-center gap-1' : 'flex-1 py-1 text-[10px] rounded bg-indigo-600 text-white font-bold transition-all flex items-center justify-center gap-1';
    if (btnVert) btnVert.className = isVert ? 'flex-1 py-1 text-[10px] rounded bg-indigo-600 text-white font-bold transition-all flex items-center justify-center gap-1' : 'flex-1 py-1 text-[10px] rounded text-slate-400 hover:text-slate-200 font-bold transition-all flex items-center justify-center gap-1';

    // Sync Text Style Toggles (Bold, Italic, Underline)
    const btnBold = document.getElementById('btn-toggle-bold');
    if (btnBold) {
        btnBold.className = block.style.bold
            ? 'flex-1 py-1 px-1.5 rounded-lg bg-indigo-600 border border-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1 transition-all shadow'
            : 'flex-1 py-1 px-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center gap-1 transition-all hover:border-indigo-500/50';
    }

    const btnItalic = document.getElementById('btn-toggle-italic');
    if (btnItalic) {
        btnItalic.className = block.style.italic
            ? 'flex-1 py-1 px-1.5 rounded-lg bg-indigo-600 border border-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1 transition-all shadow'
            : 'flex-1 py-1 px-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center gap-1 transition-all hover:border-indigo-500/50';
    }

    const btnUnderline = document.getElementById('btn-toggle-underline');
    if (btnUnderline) {
        btnUnderline.className = block.style.underline
            ? 'flex-1 py-1 px-1.5 rounded-lg bg-indigo-600 border border-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1 transition-all shadow'
            : 'flex-1 py-1 px-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center gap-1 transition-all hover:border-indigo-500/50';
    }

    // Sync Text Transform Buttons (none, uppercase, lowercase, capitalize)
    const currentTransform = block.style.textTransform || 'none';
    ['none', 'uppercase', 'lowercase', 'capitalize'].forEach(mode => {
        const btn = document.getElementById(`btn-transform-${mode}`);
        if (btn) {
            btn.className = (mode === currentTransform)
                ? 'flex-1 py-1 text-[10px] rounded bg-indigo-600 text-white font-bold transition-all flex items-center justify-center'
                : 'flex-1 py-1 text-[10px] rounded text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center';
        }
    });

    // Sync Line Height & Letter Spacing
    const currentLineHeight = block.style.lineHeight !== undefined ? block.style.lineHeight : 1.15;
    const sliderLineHeight = document.getElementById('slider-line-height');
    const lblLineHeight = document.getElementById('lbl-line-height');
    if (sliderLineHeight) sliderLineHeight.value = currentLineHeight;
    if (lblLineHeight) lblLineHeight.innerText = `${currentLineHeight}`;

    const currentLetterSpacing = block.style.letterSpacing !== undefined ? block.style.letterSpacing : 0;
    const sliderLetterSpacing = document.getElementById('slider-letter-spacing');
    const lblLetterSpacing = document.getElementById('lbl-letter-spacing');
    if (sliderLetterSpacing) sliderLetterSpacing.value = currentLetterSpacing;
    if (lblLetterSpacing) lblLetterSpacing.innerText = `${currentLetterSpacing}px`;

    syncColorAndOpacityInputs(block);
}

function syncColorAndOpacityInputs(block) {
    if (!block.style) block.style = {};

    const textColor = block.style.textColor || '#ffffff';
    const bgColor = block.style.bgColor || '#000000';
    const strokeColor = block.style.strokeColor || '#ffffff';
    const strokeColor2 = block.style.strokeColor2 || '#000000';
    const shadowColor = block.style.shadowColor || '#000000';

    const textColorHex = block.style.textColorHex || textColor.toUpperCase();
    const bgColorHex = block.style.bgColorHex || bgColor.toUpperCase();
    const strokeColorHex = block.style.strokeColorHex || strokeColor.toUpperCase();
    const strokeColor2Hex = block.style.strokeColor2Hex || strokeColor2.toUpperCase();
    const shadowColorHex = block.style.shadowColorHex || shadowColor.toUpperCase();

    const bgOpacity = block.style.bgOpacity !== undefined ? block.style.bgOpacity : 100;
    const padding = block.style.padding !== undefined ? block.style.padding : 4;
    const strokeWidth = block.style.strokeWidth || 0;
    const strokeWidth2 = block.style.strokeWidth2 || 0;
    const shadowBlur = block.style.shadowBlur || 0;
    const shadowOffsetX = block.style.shadowOffsetX || 0;
    const shadowOffsetY = block.style.shadowOffsetY || 0;

    if (elements.styleTextColor) elements.styleTextColor.value = textColor;
    if (elements.styleTextColorHex) elements.styleTextColorHex.value = textColorHex;

    if (elements.styleBgColor) elements.styleBgColor.value = bgColor;
    if (elements.styleBgColorHex) elements.styleBgColorHex.value = bgColorHex;

    if (elements.styleStrokeColor) elements.styleStrokeColor.value = strokeColor;
    if (elements.styleStrokeColorHex) elements.styleStrokeColorHex.value = strokeColorHex;

    const pickerStroke2 = document.getElementById('style-stroke-color2');
    const inputStroke2Hex = document.getElementById('style-stroke-color2-hex');
    if (pickerStroke2) pickerStroke2.value = strokeColor2;
    if (inputStroke2Hex) inputStroke2Hex.value = strokeColor2Hex;

    const sliderStrokeWidth2 = document.getElementById('slider-stroke-width2');
    const lblStrokeWidth2 = document.getElementById('lbl-stroke-width2');
    if (sliderStrokeWidth2) sliderStrokeWidth2.value = strokeWidth2;
    if (lblStrokeWidth2) lblStrokeWidth2.innerText = `${strokeWidth2}px`;

    if (elements.styleStrokeWidth) elements.styleStrokeWidth.value = strokeWidth;
    if (elements.lblStrokeWidth) elements.lblStrokeWidth.innerText = `${strokeWidth}px`;

    if (elements.styleShadowColor) elements.styleShadowColor.value = shadowColor;
    if (elements.styleShadowColorHex) elements.styleShadowColorHex.value = shadowColorHex;
    if (elements.styleShadowBlur) elements.styleShadowBlur.value = shadowBlur;
    if (elements.lblShadowBlur) elements.lblShadowBlur.innerText = `${shadowBlur}px`;

    const sliderShadowOffX = document.getElementById('slider-shadow-offset-x');
    const lblShadowOffX = document.getElementById('lbl-shadow-offset-x');
    if (sliderShadowOffX) sliderShadowOffX.value = shadowOffsetX;
    if (lblShadowOffX) lblShadowOffX.innerText = `${shadowOffsetX}px`;

    const sliderShadowOffY = document.getElementById('slider-shadow-offset-y');
    const lblShadowOffY = document.getElementById('lbl-shadow-offset-y');
    if (sliderShadowOffY) sliderShadowOffY.value = shadowOffsetY;
    if (lblShadowOffY) lblShadowOffY.innerText = `${shadowOffsetY}px`;

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