import { globalState, pushStateToHistory, savePageToDB, debounceSavePage, uiUpdateActiveBlockEditor, markPageAutoFitDirty } from '../../core/state.js';
import { elements } from '../../core/elements.js';
import { showToast, setMultilineText } from '../../core/utils.js';
import { requestOverlayRender } from './canvas-renderer.js';
import { updateFloatingToolbarPosition } from './canvas-interactions.js';

let isCurrentlySliding = false;
export let copiedStyle = null;
export const FONT_SIZE_STEPS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

export function setCopiedStyle(val) {
    copiedStyle = val;
}

export function isBlockAutoFit(block) {
    if (!block) return globalState.autoFitEnabled;
    if (block.style && block.style.autoFit !== undefined) {
        return !!block.style.autoFit;
    }
    return globalState.autoFitEnabled;
}

export function autoFitBlock(block, customImgElement = null, forceExportScale = 1) {
    if (!isBlockAutoFit(block)) return;

    if (!block.translated || block.translated.trim() === '') {
        block.style.fontSize = 12;
        return;
    }

    const imgEl = customImgElement || elements.mangaBgImage;

    const zoomScale = (globalState.zoom || 100) / 100;
    let displayWidth = (imgEl && imgEl.clientWidth > 0) ? imgEl.clientWidth : 0;
    if (!displayWidth && elements.mangaCanvasContainer && elements.mangaCanvasContainer.clientWidth > 0) {
        displayWidth = elements.mangaCanvasContainer.clientWidth;
    }
    if (displayWidth) {
        displayWidth = displayWidth / zoomScale;
    }
    if (!displayWidth && elements.workspaceViewport && elements.workspaceViewport.clientWidth > 0) {
        displayWidth = Math.min((elements.workspaceViewport.clientWidth - 32) / zoomScale, 1000);
    }
    if (!displayWidth) {
        displayWidth = 800;
    }

    const naturalW = (imgEl && imgEl.naturalWidth > 0) ? imgEl.naturalWidth : 800;
    const naturalH = (imgEl && imgEl.naturalHeight > 0) ? imgEl.naturalHeight : 1200;
    const aspect = naturalH / Math.max(1, naturalW);
    const displayHeight = displayWidth * aspect;

    const maskShape = block.style.maskShape || 'bubble-fit';
    const strokeWidth = block.style.strokeWidth || 0;
    const cacheKey = `${block.translated}_${block.box.w}_${block.box.h}_${block.style.fontFamily}_${block.style.padding}_${strokeWidth}_${block.style.vertical}_${block.style.bold}_${block.style.align}_${maskShape}_${Math.round(displayWidth)}_${Math.round(displayHeight)}`;
    if (block.autoFitCache && block.autoFitCache.key === cacheKey) {
        block.style.fontSize = block.autoFitCache.fontSize;
        block.textWidth = block.autoFitCache.textWidth;
        block.textHeight = block.autoFitCache.textHeight;
        return;
    }

    const ruler = elements.autoFitRuler || document.getElementById('auto-fit-ruler');
    if (!ruler) {
        block.style.fontSize = 13;
        return;
    }

    const fontStyle = block.style.fontFamily || globalState.defaultFont || 'font-manga';
    const isBuiltInFont = ['font-sans', 'font-manga', 'font-comic', 'font-comicneue', 'font-impact', 'font-marker', 'font-bungee', 'font-caveat', 'font-tech', 'font-condensed', 'font-vietnamese'].includes(fontStyle);
    if (isBuiltInFont) {
        ruler.className = fontStyle;
        ruler.style.fontFamily = '';
    } else {
        ruler.className = '';
        ruler.style.fontFamily = `'${fontStyle}', sans-serif`;
    }

    const padding = block.style.padding !== undefined ? block.style.padding : 4;
    ruler.style.padding = `${padding}px`;
    ruler.style.textAlign = block.style.align || 'center';
    ruler.style.letterSpacing = '0';
    ruler.style.fontKerning = 'normal';
    ruler.style.whiteSpace = 'pre-wrap';
    ruler.style.wordBreak = 'break-word';
    ruler.style.overflowWrap = 'break-word';

    if (block.style.bold) {
        ruler.style.fontWeight = 'bold';
    } else {
        ruler.style.fontWeight = 'normal';
    }

    if (block.style.vertical) {
        ruler.classList.add('text-vertical');
        ruler.style.writingMode = 'vertical-rl';
        ruler.style.textOrientation = 'upright';
        ruler.style.lineHeight = '1.12';
    } else {
        ruler.classList.remove('text-vertical');
        ruler.style.writingMode = 'horizontal-tb';
        ruler.style.textOrientation = 'mixed';
        ruler.style.lineHeight = '1.18';
    }

    const targetWidth = (block.box.w / 100) * displayWidth;
    const targetHeight = (block.box.h / 100) * displayHeight;

    const isEllipseShape = maskShape === 'ellipse' || maskShape === 'bubble-fit';
    const fitMargin = isEllipseShape ? 0.85 : 0.95;

    if (block.style.vertical) {
        ruler.style.height = `${targetHeight * fitMargin}px`;
        ruler.style.width = 'auto';
    } else {
        ruler.style.width = `${targetWidth * fitMargin}px`;
        ruler.style.height = 'auto';
    }

    const warpOpts = {
        arcAngle: block.style.arcAngle || 0,
        skewX: block.style.skewX || 0,
        skewY: block.style.skewY || 0,
        warpWave: block.style.warpWave || 0,
        warpBulge: block.style.warpBulge || 0
    };
    setMultilineText(ruler, block.translated, warpOpts);

    let minSize = 8;
    let maxSize = Math.min(80, Math.floor(targetHeight * 0.9));
    if (maxSize < minSize) maxSize = minSize;
    let optimalSize = minSize;

    while (minSize <= maxSize) {
        const mid = Math.floor((minSize + maxSize) / 2);
        ruler.style.fontSize = `${mid}px`;

        const contentWidth = ruler.scrollWidth;
        const contentHeight = ruler.scrollHeight;

        const fits = contentWidth <= (targetWidth * fitMargin) + 2 && contentHeight <= (targetHeight * fitMargin) + 2;

        if (fits) {
            optimalSize = mid;
            minSize = mid + 1;
        } else {
            maxSize = mid - 1;
        }
    }

    let probeSize = optimalSize;
    let finalSize = FONT_SIZE_STEPS[0];
    for (const step of FONT_SIZE_STEPS) {
        if (step <= probeSize) {
            finalSize = step;
        } else {
            break;
        }
    }
    block.style.fontSize = finalSize;

    ruler.style.fontSize = `${finalSize}px`;
    ruler.style.padding = '1px';
    setMultilineText(ruler, block.translated, warpOpts);
    block.textWidth = ruler.scrollWidth;
    block.textHeight = ruler.scrollHeight;

    block.autoFitCache = {
        key: cacheKey,
        fontSize: finalSize,
        textWidth: block.textWidth,
        textHeight: block.textHeight
    };
}

export function autoFitAllBlocksOnPage(page = null, customImgElement = null, forceExportScale = 1) {
    const targetPage = page || (globalState.activePageIndex !== -1 ? globalState.pages[globalState.activePageIndex] : null);
    if (!targetPage) return;
    targetPage.blocks.forEach(block => autoFitBlock(block, customImgElement, forceExportScale));
}

export function toggleAutoFit(enabled) {
    globalState.autoFitEnabled = !!enabled;
    if (elements.styleAutoFit) {
        elements.styleAutoFit.checked = globalState.autoFitEnabled;
    }
    if (globalState.activePageIndex !== -1) {
        const page = globalState.pages[globalState.activePageIndex];
        if (page) {
            page.blocks.forEach(b => {
                if (b.style) delete b.style.autoFit;
                b.autoFitCache = null;
            });
            markPageAutoFitDirty(page);
        }
    }
    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    showToast(globalState.autoFitEnabled ? "Đã bật Cỡ chữ Tự động (Auto-Fit) toàn trang" : "Đã tắt Auto-Fit toàn trang", "info");
}

export function toggleBlockAutoFit(enabled) {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page ? page.blocks.find(b => b.id === globalState.selectedBlockId) : null;
    if (!block) return;

    pushStateToHistory();
    if (!block.style) block.style = {};
    block.style.autoFit = !!enabled;
    block.autoFitCache = null;

    if (enabled) {
        autoFitBlock(block);
    }

    markPageAutoFitDirty(page);
    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    savePageToDB(page);
    showToast(enabled ? "Đã bật Auto-Fit cho ô dịch này" : "Đã tắt Auto-Fit cho ô dịch này (Chế độ thủ công)", "info");
}

window.toggleBlockAutoFit = toggleBlockAutoFit;
window.toggleAutoFit = toggleAutoFit;

export function autoMatchBlockStyle(block, imgElement) {
    if (!block || !imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) return;

    if (!block.style) block.style = {};

    const W = imgElement.naturalWidth;
    const H = imgElement.naturalHeight;

    const cropX = Math.max(0, Math.round((block.box.x / 100) * W));
    const cropY = Math.max(0, Math.round((block.box.y / 100) * H));
    const cropW = Math.min(W - cropX, Math.round((block.box.w / 100) * W));
    const cropH = Math.min(H - cropY, Math.round((block.box.h / 100) * H));

    if (cropW <= 0 || cropH <= 0) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const imgData = tempCtx.getImageData(0, 0, cropW, cropH);
    tempCanvas.width = 0;
    tempCanvas.height = 0;
    const data = imgData.data;

    let rimLumSum = 0, rimCount = 0;
    let centerLumSum = 0, centerCount = 0;

    const borderMarginX = Math.max(1, Math.floor(cropW * 0.15));
    const borderMarginY = Math.max(1, Math.floor(cropH * 0.15));

    for (let y = 0; y < cropH; y++) {
        for (let x = 0; x < cropW; x++) {
            const idx = (y * cropW + x) * 4;
            const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            const isRim = (x < borderMarginX || x >= cropW - borderMarginX || y < borderMarginY || y >= cropH - borderMarginY);
            if (isRim) {
                rimLumSum += lum;
                rimCount++;
            } else {
                centerLumSum += lum;
                centerCount++;
            }
        }
    }

    const avgRimLum = rimCount > 0 ? (rimLumSum / rimCount) : 255;
    const avgCenterLum = centerCount > 0 ? (centerLumSum / centerCount) : 128;

    block.style.fontFamily = globalState.defaultFont || 'font-manga';
    block.style.align = 'center';

    if (avgRimLum < 140) {
        if (avgCenterLum > avgRimLum + 30) {
            block.style.textColor = '#ffffff';
            block.style.strokeColor = '#000000';
            block.style.strokeWidth = 2;
            block.style.shadowColor = '#000000';
            block.style.shadowBlur = 4;
            block.style.bgColor = '#ffffff';
            block.style.bgOpacity = 0;
        } else {
            block.style.textColor = '#000000';
            block.style.bgColor = '#ffffff';
            block.style.bgOpacity = 100;
            block.style.maskShape = 'bubble-fit';
        }
    } else {
        block.style.textColor = '#000000';
        block.style.bgColor = '#ffffff';
        block.style.bgOpacity = 100;
        block.style.maskShape = 'bubble-fit';
        block.style.strokeWidth = 0;
    }

    block.style.align = 'center';
    block.maskCache = null;
    block.autoFitCache = null;
}

export function autoMatchActiveBlockStyle() {
    if (globalState.activePageIndex === -1 || !globalState.selectedBlockId) {
        showToast("Vui lòng chọn một ô thoại để tự động khớp phong cách chữ.", "warn");
        return;
    }
    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    const imgElement = elements.mangaBgImage;
    if (block && imgElement) {
        pushStateToHistory();
        autoMatchBlockStyle(block, imgElement);
        markPageAutoFitDirty(page);
        requestOverlayRender();
        uiUpdateActiveBlockEditor();
        savePageToDB(page);
        showToast("✨ Đã tự động khớp phông chữ và màu sắc cho ô thoại!", "success");
    }
}

export function applyStylePreset(presetKey) {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        showToast("Vui lòng nhấp chọn một ô thoại trước khi áp dụng preset mẫu.", "warn");
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    pushStateToHistory();

    const presets = {
        dialogue: {
            fontFamily: 'font-manga',
            bold: true,
            textColor: '#000000',
            bgColor: '#ffffff',
            bgOpacity: 100,
            strokeWidth: 0,
            shadowBlur: 0,
            maskShape: 'bubble-fit',
            align: 'center'
        },
        scream: {
            fontFamily: 'font-impact',
            bold: true,
            textColor: '#ffffff',
            bgColor: '#ffffff',
            bgOpacity: 0,
            strokeColor: '#000000',
            strokeWidth: 4,
            shadowColor: '#000000',
            shadowBlur: 2,
            maskShape: 'none',
            align: 'center'
        },
        whisper: {
            fontFamily: 'font-caveat',
            bold: false,
            textColor: '#555555',
            bgColor: '#ffffff',
            bgOpacity: 60,
            strokeWidth: 0,
            shadowBlur: 0,
            maskShape: 'ellipse',
            align: 'center'
        },
        narration: {
            fontFamily: 'font-vietnamese',
            bold: true,
            textColor: '#000000',
            bgColor: '#ffffff',
            bgOpacity: 95,
            strokeWidth: 0,
            shadowBlur: 0,
            maskShape: 'rect',
            align: 'left'
        }
    };

    presets['manga-std'] = presets.dialogue;
    presets['shout-sfx'] = presets.scream;
    presets['whisper-old'] = presets.whisper;
    presets['transparent-stroke4'] = {
        bgOpacity: 0,
        strokeWidth: 4,
        strokeColor: block.style?.textColor?.toLowerCase() === '#000000' ? '#ffffff' : (block.style?.strokeColor || '#000000')
    };
    presets['no-bg-stroke4'] = presets['transparent-stroke4'];
    presets['outline-4px'] = presets['transparent-stroke4'];
    presets['horror'] = {
        fontFamily: 'font-marker',
        bold: true,
        textColor: '#ffffff',
        bgColor: '#000000',
        bgOpacity: 0,
        strokeColor: '#ff0000',
        strokeWidth: 2,
        shadowColor: '#000000',
        shadowBlur: 3,
        maskShape: 'none',
        align: 'center'
    };

    const targetPreset = presets[presetKey];
    if (!targetPreset) return;

    Object.assign(block.style, targetPreset);
    block.maskCache = null;
    block.autoFitCache = null;
    markPageAutoFitDirty(page);
    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    updateFloatingToolbarPosition();
    savePageToDB(page);

    const label = presetKey === 'dialogue' || presetKey === 'manga-std' ? 'Thoại thường' :
        presetKey === 'scream' || presetKey === 'shout-sfx' ? 'Hét lớn / SFX' :
            presetKey === 'whisper' ? 'Thầm thì' :
                presetKey === 'narration' ? 'Dẫn truyện' :
                    presetKey === 'transparent-stroke4' || presetKey === 'no-bg-stroke4' ? 'Nền 0% & Viền 4px' : 'Preset';
    showToast(`💥 Đã áp dụng mẫu chữ "${label}"`, "success");
}

export function copyBlockStyle() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        showToast("Vui lòng chọn một ô thoại để sao chép định dạng.", "warn");
        return;
    }
    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block) {
        copiedStyle = JSON.parse(JSON.stringify(block.style));
        if (elements.btnPasteStyle) elements.btnPasteStyle.disabled = false;
        showToast("Đã sao chép định dạng ô thoại!", "success");
    }
}

export function pasteBlockStyle() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        showToast("Vui lòng chọn một ô thoại để dán định dạng.", "warn");
        return;
    }
    if (!copiedStyle) {
        showToast("Chưa có định dạng nào được sao chép.", "warn");
        return;
    }
    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block) {
        pushStateToHistory();
        block.style = JSON.parse(JSON.stringify(copiedStyle));
        block.maskCache = null;
        block.autoFitCache = null;
        markPageAutoFitDirty(page);
        requestOverlayRender();
        uiUpdateActiveBlockEditor();
        savePageToDB(page);
        showToast("Đã áp dụng định dạng ô thoại!", "success");
    }
}

export function syncActiveBlockStyle(property, value) {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);

    if (block) {
        if (property === 'fontSize') {
            block.style.autoFit = false;
            if (elements.styleAutoFit) elements.styleAutoFit.checked = false;
        }

        const rangeProperties = [
            'fontSize', 'bgOpacity', 'padding', 'rotate',
            'strokeWidth', 'shadowBlur', 'arcAngle', 'skewX', 'skewY', 'warpWave', 'warpBulge'
        ];
        if (rangeProperties.includes(property)) {
            if (!isCurrentlySliding) {
                isCurrentlySliding = true;
                pushStateToHistory();
                const stopSlide = () => {
                    isCurrentlySliding = false;
                    uiUpdateActiveBlockEditor();
                    updateFloatingToolbarPosition();
                    window.removeEventListener('mouseup', stopSlide);
                    window.removeEventListener('touchend', stopSlide);
                };
                window.addEventListener('mouseup', stopSlide);
                window.addEventListener('touchend', stopSlide);
            }
        } else {
            pushStateToHistory();
        }

        block.style[property] = value;

        if (property === 'fontSize') {
            if (elements.lblFontSize) elements.lblFontSize.innerText = `${value}px`;
            if (elements.styleFontSize) elements.styleFontSize.value = value;
        } else if (property === 'bgOpacity') {
            if (elements.lblBgOpacity) elements.lblBgOpacity.innerText = `${value}%`;
        } else if (property === 'padding') {
            if (elements.lblPadding) elements.lblPadding.innerText = `${value}px`;
        } else if (property === 'rotate') {
            if (elements.lblRotate) elements.lblRotate.innerText = `${value}°`;
            if (elements.styleRotate) elements.styleRotate.value = value;
        } else if (property === 'strokeWidth') {
            if (elements.lblStrokeWidth) elements.lblStrokeWidth.innerText = `${value}px`;
            if (elements.styleStrokeWidth) elements.styleStrokeWidth.value = value;
        } else if (property === 'shadowBlur') {
            if (elements.lblShadowBlur) elements.lblShadowBlur.innerText = `${value}px`;
            if (elements.styleShadowBlur) elements.styleShadowBlur.value = value;
        }

        block.maskCache = null;
        block.autoFitCache = null;
        markPageAutoFitDirty(page);
        requestOverlayRender();
        if (!isCurrentlySliding) {
            uiUpdateActiveBlockEditor();
            updateFloatingToolbarPosition();
        }
        debounceSavePage(page);
    }
}

export function syncActiveBlockTranslation(val) {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block) {
        block.translated = val;
        markPageAutoFitDirty(page);

        const autoFitActive = isBlockAutoFit(block);
        if (autoFitActive) {
            autoFitBlock(block);
        }

        const overlayElem = document.getElementById(block.id);
        if (overlayElem) {
            const textContainer = overlayElem.querySelector('div > div');
            if (textContainer) {
                setMultilineText(textContainer, val);
            }
            if (autoFitActive) {
                const maskElem = overlayElem.firstElementChild;
                if (maskElem) {
                    maskElem.style.fontSize = `${block.style.fontSize}px`;
                }
                if (elements.lblFontSize) elements.lblFontSize.innerText = `${block.style.fontSize}px`;
                if (elements.styleFontSize) elements.styleFontSize.value = block.style.fontSize;
            }
        }

        if (globalState.viewMode === 'split') {
            const cloneOverlay = document.getElementById(`mirror-${block.id}`);
            if (cloneOverlay) {
                const cloneTextContainer = cloneOverlay.querySelector('div > div');
                if (cloneTextContainer) setMultilineText(cloneTextContainer, val);
                if (autoFitActive) {
                    const cloneMask = cloneOverlay.firstElementChild;
                    if (cloneMask) {
                        cloneMask.style.fontSize = `${block.style.fontSize}px`;
                    }
                }
            }
        }
        debounceSavePage(page);
    }
}

export function toggleActiveBlockOrientation() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    const nextVertical = !block.style.vertical;
    syncActiveBlockStyle('vertical', nextVertical);
    showToast(nextVertical ? "Đã chuyển sang viết chữ Dọc" : "Đã chuyển sang viết chữ Ngang", "info");
}

export function normalizeAllBlocksToHorizontal() {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks || page.blocks.length === 0) return;

    let count = 0;
    page.blocks.forEach(b => {
        if (b.style && b.style.vertical) {
            b.style.vertical = false;
            count++;
        }
    });

    if (count > 0) {
        markPageAutoFitDirty(page);
        pushStateToHistory();
        if (typeof window.selectPage === 'function') {
            window.selectPage(globalState.activePageIndex);
        }
        showToast(`✅ Đã chuyển ${count} ô thoại thành chữ viết Ngang!`, "success");
    } else {
        showToast("Tất cả ô thoại đã là chữ viết Ngang.", "info");
    }
}

export function updateSfxRotate(val) {
    const angle = parseInt(val, 10) || 0;
    const lbl = document.getElementById('lbl-sfx-rotate');
    if (lbl) lbl.textContent = `${angle}°`;
    syncActiveBlockStyle('rotate', angle);
}

export function updateSfxArc(val) {
    const arc = parseInt(val, 10) || 0;
    const lbl = document.getElementById('lbl-sfx-arc');
    if (lbl) lbl.textContent = `${arc}°`;
    syncActiveBlockStyle('arcAngle', arc);
}

export function updateSfxSkewX(val) {
    const skew = parseInt(val, 10) || 0;
    const lbl = document.getElementById('lbl-sfx-skew-x');
    if (lbl) lbl.textContent = `${skew}°`;
    syncActiveBlockStyle('skewX', skew);
}

export function updateSfxSkewY(val) {
    const skew = parseInt(val, 10) || 0;
    const lbl = document.getElementById('lbl-sfx-skew-y');
    if (lbl) lbl.textContent = `${skew}°`;
    syncActiveBlockStyle('skewY', skew);
}

export function updateSfxWave(val) {
    const wave = parseInt(val, 10) || 0;
    const lbl = document.getElementById('lbl-sfx-wave');
    if (lbl) lbl.textContent = `${wave}`;
    syncActiveBlockStyle('warpWave', wave);
}

export function updateSfxBulge(val) {
    const bulge = parseInt(val, 10) || 0;
    const lbl = document.getElementById('lbl-sfx-bulge');
    if (lbl) lbl.textContent = `${bulge}`;
    syncActiveBlockStyle('warpBulge', bulge);
}

export function resetWarpTransformControls() {
    updateSfxRotate(0);
    updateSfxArc(0);
    updateSfxSkewX(0);
    updateSfxSkewY(0);
    updateSfxWave(0);
    updateSfxBulge(0);

    const rSlider = document.getElementById('slider-sfx-rotate') || document.getElementById('style-rotate');
    const aSlider = document.getElementById('slider-sfx-arc');
    const sxSlider = document.getElementById('slider-sfx-skew-x');
    const sySlider = document.getElementById('slider-sfx-skew-y');
    const wSlider = document.getElementById('slider-sfx-wave');
    const bSlider = document.getElementById('slider-sfx-bulge');

    if (rSlider) rSlider.value = 0;
    if (aSlider) aSlider.value = 0;
    if (sxSlider) sxSlider.value = 0;
    if (sySlider) sySlider.value = 0;
    if (wSlider) wSlider.value = 0;
    if (bSlider) bSlider.value = 0;
}

export function toggleActiveBlockBold() {
    const activePage = globalState.pages[globalState.activePageIndex];
    if (!activePage || !globalState.selectedBlockId) return;
    const block = activePage.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;
    const newBold = !block.style.bold;
    syncActiveBlockStyle('bold', newBold);
}

export function alignActiveBlockPosition(mode) {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks || page.blocks.length === 0) return;

    let targetBlocks = [];
    const selectedIds = globalState.selectedBlockIds && globalState.selectedBlockIds.length > 0
        ? globalState.selectedBlockIds
        : (globalState.selectedBlockId ? [globalState.selectedBlockId] : []);

    targetBlocks = page.blocks.filter(b => selectedIds.includes(b.id));
    if (targetBlocks.length === 0) return;

    pushStateToHistory();

    const round1 = (val) => Math.round(val * 10) / 10;

    if (targetBlocks.length === 1) {
        // Single block alignment relative to Canvas (0%, 50%, 100%)
        const block = targetBlocks[0];
        if (mode === 'left') {
            block.box.x = 0;
        } else if (mode === 'center-h') {
            block.box.x = Math.max(0, round1((100 - block.box.w) / 2));
        } else if (mode === 'right') {
            block.box.x = Math.max(0, round1(100 - block.box.w));
        } else if (mode === 'top') {
            block.box.y = 0;
        } else if (mode === 'center-v') {
            block.box.y = Math.max(0, round1((100 - block.box.h) / 2));
        } else if (mode === 'bottom') {
            block.box.y = Math.max(0, round1(100 - block.box.h));
        }
        block.maskCache = null;
        block.autoFitCache = null;
    } else {
        // Multi-block alignment relative to Group Bounding Box
        const minX = Math.min(...targetBlocks.map(b => b.box.x));
        const maxX = Math.max(...targetBlocks.map(b => b.box.x + b.box.w));
        const minY = Math.min(...targetBlocks.map(b => b.box.y));
        const maxY = Math.max(...targetBlocks.map(b => b.box.y + b.box.h));
        const groupCenterX = minX + (maxX - minX) / 2;
        const groupCenterY = minY + (maxY - minY) / 2;

        targetBlocks.forEach(block => {
            if (mode === 'left') {
                block.box.x = minX;
            } else if (mode === 'center-h') {
                block.box.x = Math.max(0, round1(groupCenterX - block.box.w / 2));
            } else if (mode === 'right') {
                block.box.x = Math.max(0, round1(maxX - block.box.w));
            } else if (mode === 'top') {
                block.box.y = minY;
            } else if (mode === 'center-v') {
                block.box.y = Math.max(0, round1(groupCenterY - block.box.h / 2));
            } else if (mode === 'bottom') {
                block.box.y = Math.max(0, round1(maxY - block.box.h));
            }
            block.maskCache = null;
            block.autoFitCache = null;
        });
    }

    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    updateFloatingToolbarPosition();
    savePageToDB(page);
}

export function resetSfxAngleControls() {
    resetWarpTransformControls();
}

window.applyStylePreset = applyStylePreset;
window.updateSfxSkewX = updateSfxSkewX;
window.updateSfxSkewY = updateSfxSkewY;
window.updateSfxWave = updateSfxWave;
window.updateSfxBulge = updateSfxBulge;
window.updateSfxArc = updateSfxArc;
window.updateSfxRotate = updateSfxRotate;
window.resetWarpTransformControls = resetWarpTransformControls;
window.resetSfxAngleControls = resetSfxAngleControls;
window.toggleActiveBlockBold = toggleActiveBlockBold;
window.alignActiveBlockPosition = alignActiveBlockPosition;