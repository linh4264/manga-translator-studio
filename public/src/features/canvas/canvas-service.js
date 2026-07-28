// Canvas Editor & Typeset Management
import {
    globalState,
    pushStateToHistory,
    savePageToDB,
    debounceSavePage,
    uiUpdateActiveBlockEditor,
    uiUpdateSplitView,
    uiSetRightTab,
    uiUpdatePageListUI
} from '../../core/state.js';
import {
    DEFAULT_VERTICAL_WRITING_MODE,
    DEFAULT_AI_BLOCK_BOX
} from '../../config/constants.js';
import { elements } from '../../core/elements.js';
import { showToast, setMultilineText, escapeHTML, waitForNextPaint } from '../../core/utils/dom.js';
import { computeBubbleMask } from '../ocr/ocr-service.js';


export let overlayRenderRafId = null;
export let copiedStyle = null; // Lưu trữ định dạng đã sao chép cho Copy/Paste Style

export function setCopiedStyle(val) {
    copiedStyle = val;
}

export function requestOverlayRender() {
    if (overlayRenderRafId) return;
    overlayRenderRafId = requestAnimationFrame(() => {
        overlayRenderRafId = null;
        renderOverlays();
    });
}

// Main function to draw overlay block overlays onto active workspace canvas
export function renderOverlays(targetContainer = null, customPage = null, customImgElement = null, forceExportScale = 1) {
    const isMirror = targetContainer !== null;
    const container = targetContainer || elements.mangaOverlaysContainer;

    container.innerHTML = '';

    const page = customPage || (globalState.activePageIndex !== -1 ? globalState.pages[globalState.activePageIndex] : null);
    if (!page) return;

    if (globalState.viewMode === 'original' && !isMirror) {
        // Clear any layouts on original-only view
        return;
    }

    const fragment = document.createDocumentFragment();

    // Run Auto-fit automatically before drawing if enabled
    if (globalState.autoFitEnabled) {
        autoFitAllBlocksOnPage(page, customImgElement, forceExportScale);
    }

    const imgElement = customImgElement || elements.mangaBgImage;
    if (imgElement && imgElement.clientWidth > 0) {
        page.lastDisplayWidth = imgElement.clientWidth;
    }

    // Chuẩn bị ảnh gốc để chạy thuật toán Flood Fill nếu có block sử dụng maskShape là 'bubble-fit' (Có tích hợp cache cấp trang)
    let activeImageData = page.imageDataCache || null;
    const hasBubbleFit = page.blocks.some(block => (block.style.maskShape || 'bubble-fit') === 'bubble-fit');

    if (hasBubbleFit && !activeImageData && imgElement.naturalWidth > 0 && imgElement.naturalHeight > 0) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = imgElement.naturalWidth;
            canvas.height = imgElement.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgElement, 0, 0);
            activeImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            page.imageDataCache = activeImageData; // Cache lại trên trang để dùng cho các lượt render sau
        } catch (e) {
            console.error("Không thể lấy dữ liệu ảnh để khớp bong bóng (lỗi CORS hoặc vẽ):", e);
        }
    }

    page.blocks.forEach((block) => {
        const bubble = document.createElement('div');
        bubble.id = isMirror ? `mirror-${block.id}` : block.id;

        // Base CSS placements based on absolute coordinates percentage ratios
        bubble.style.top = `${block.box.y}%`;
        bubble.style.left = `${block.box.x}%`;
        bubble.style.width = `${block.box.w}%`;
        bubble.style.height = `${block.box.h}%`;

        // Apply rotation angle if set
        if (block.style.rotate) {
            bubble.style.transform = `rotate(${block.style.rotate}deg)`;
        } else {
            bubble.style.transform = '';
        }

        // Handle text overlay styling based on block options
        bubble.className = `bubble-overlay ${block.id === globalState.selectedBlockId && !isMirror ? 'active' : ''}`;

        // Khung Drag chữ nhật bên ngoài luôn trong suốt để không che mất viền cong của bubble
        bubble.style.backgroundColor = 'transparent';

        // Thiết lập cấu trúc Flex để căn chỉnh hộp che chữ bên trong dựa trên kiểu căn lề
        bubble.style.display = 'flex';
        bubble.style.alignItems = 'center';
        if (block.style.align === 'left') {
            bubble.style.justifyContent = 'flex-start';
        } else if (block.style.align === 'right') {
            bubble.style.justifyContent = 'flex-end';
        } else {
            bubble.style.justifyContent = 'center';
        }

        // Tạo phần tử mặt nạ nội dung che chữ snug-fit bên trong
        const maskContent = document.createElement('div');
        maskContent.style.position = 'relative';
        maskContent.style.overflow = 'hidden';
        maskContent.style.boxSizing = 'border-box';

        // Áp dụng kích cỡ mặt nạ che cũ
        const currentMaskSize = block.style.maskSize || 'full';
        if (currentMaskSize === 'full') {
            // Che phủ 100% khung drag, giúp người dùng bôi trắng đè hoàn toàn chữ Nhật cũ
            maskContent.style.width = '100%';
            maskContent.style.height = '100%';
            maskContent.style.display = 'flex';
            if (block.style.vertical) {
                // In vertical-rl: horizontal is cross-axis (alignItems), vertical is main-axis (justifyContent)
                maskContent.style.justifyContent = 'center'; // Center vertically
                maskContent.style.alignItems = 'center';     // Vertical text is always centered horizontally
            } else {
                // In horizontal LTR: horizontal is main-axis (justifyContent), vertical is cross-axis (alignItems)
                maskContent.style.alignItems = 'center'; // Center vertically
                maskContent.style.justifyContent = block.style.align === 'left' ? 'flex-start' : block.style.align === 'right' ? 'flex-end' : 'center';
            }
            maskContent.className = `${block.style.fontFamily} pointer-events-none`;
        } else {
            // Chỉ che vừa khít bao quanh chữ Việt (Snug)
            maskContent.style.display = 'flex';
            maskContent.style.alignItems = 'center';
            maskContent.style.justifyContent = 'center';
            maskContent.style.width = 'auto';
            maskContent.style.height = 'auto';
            maskContent.style.maxWidth = '100%';
            maskContent.style.maxHeight = '100%';
            maskContent.className = `${block.style.fontFamily} pointer-events-none`;
        }
        maskContent.style.wordBreak = 'keep-all';
        maskContent.style.overflowWrap = 'normal';
        maskContent.style.hyphens = 'none';

        // Áp dụng dáng mặt nạ che cũ và hình nền che khớp bong bóng thoại
        const currentMaskShape = block.style.maskShape || 'bubble-fit';
        let hasBubbleFitMask = false;

        if (currentMaskShape === 'bubble-fit') {
            // 1. Ưu tiên lấy dataUrl từ maskCache đã tính toán trước đó
            let dataUrl = block.maskCache ? block.maskCache.dataUrl : null;

            // 2. Nếu chưa có cache và ảnh gốc đã sẵn sàng, mới tính toán mask mới
            if (!dataUrl && activeImageData) {
                const maskCanvas = computeBubbleMask(page, block, activeImageData);
                if (maskCanvas) {
                    dataUrl = block.maskCache?.dataUrl || (maskCanvas.toDataURL ? maskCanvas.toDataURL() : null);
                }
            }

            // 3. Vẽ mask đè lên nếu đã có dataUrl (kể cả khi activeImageData tạm thời bị null)
            if (dataUrl) {
                maskContent.style.backgroundImage = `url(${dataUrl})`;
                maskContent.style.backgroundSize = '100% 100%';
                maskContent.style.backgroundRepeat = 'no-repeat';
                maskContent.style.backgroundColor = 'transparent';
                maskContent.style.borderRadius = '0px';
                hasBubbleFitMask = true;
            }
        }

        if (!hasBubbleFitMask) {
            maskContent.style.backgroundImage = 'none';
            const hexBgColor = block.style.bgColor || '#ffffff';
            const alpha = (block.style.bgOpacity !== undefined ? block.style.bgOpacity : 100) / 100;
            maskContent.style.backgroundColor = convertHexToRGBA(hexBgColor, alpha);

            if (currentMaskShape === 'ellipse') {
                maskContent.style.borderRadius = '50%'; // Tạo hình bầu dục/hình tròn mềm mại hoàn hảo cho manga bubble
            } else if (currentMaskShape === 'rounded') {
                maskContent.style.borderRadius = '12px'; // Bo tròn bốn góc hiện đại
            } else {
                maskContent.style.borderRadius = '0px'; // Khung chữ nhật sắc cạnh
            }
        }

        maskContent.style.color = block.style.textColor || '#000000';
        const padding = block.style.padding !== undefined ? block.style.padding : 4;
        const displayPadding = forceExportScale !== 1 ? padding * forceExportScale : padding;
        maskContent.style.padding = `${displayPadding}px`;
        maskContent.style.textAlign = block.style.align || 'center';

        let displayFontSize = block.style.fontSize || 16;
        if (forceExportScale !== 1) {
            displayFontSize = displayFontSize * forceExportScale;
        }
        maskContent.style.fontSize = `${displayFontSize}px`;
        maskContent.style.lineHeight = block.style.vertical ? '1.12' : '1.18';
        maskContent.style.letterSpacing = '0';
        maskContent.style.fontKerning = 'normal';

        if (block.style.bold) {
            maskContent.style.fontWeight = 'bold';
        } else {
            maskContent.style.fontWeight = 'normal';
        }

        if (block.style.vertical) {
            maskContent.classList.add('text-vertical');
            maskContent.style.writingMode = 'vertical-rl';
            maskContent.style.textOrientation = 'upright';
            maskContent.style.lineHeight = '1.12';
        }

        // Apply Text Stroke (Viền chữ) & Drop Shadow (Bóng đổ)
        const strokeWidth = block.style.strokeWidth || 0;
        const strokeColor = block.style.strokeColor || '#ffffff';
        if (strokeWidth > 0) {
            const displayStroke = forceExportScale !== 1 ? strokeWidth * forceExportScale : strokeWidth;
            maskContent.style.webkitTextStroke = `${displayStroke}px ${strokeColor}`;
            maskContent.style.paintOrder = 'stroke fill';
        } else {
            maskContent.style.webkitTextStroke = '0px transparent';
        }

        const shadowBlur = block.style.shadowBlur || 0;
        const shadowColor = block.style.shadowColor || '#000000';
        if (shadowBlur > 0) {
            const displayBlur = forceExportScale !== 1 ? shadowBlur * forceExportScale : shadowBlur;
            maskContent.style.textShadow = `0px 0px ${displayBlur}px ${shadowColor}`;
        } else {
            maskContent.style.textShadow = 'none';
        }

        // Khối văn bản dịch bên trong
        const innerTextDiv = document.createElement('div');
        const isCenterAlign = !block.style.align || block.style.align === 'center';
        if (block.style.vertical) {
            innerTextDiv.style.writingMode = 'vertical-rl';
            innerTextDiv.style.textOrientation = 'upright';
            // In vertical-rl: flex-row flows vertically (main axis), stacks columns horizontally (cross axis)
            innerTextDiv.className = `h-full flex flex-row justify-center items-center`;
        } else {
            innerTextDiv.className = `w-full flex flex-col ${isCenterAlign ? 'items-center justify-center' : block.style.align === 'right' ? 'items-end' : 'items-start'}`;
        }
        innerTextDiv.style.margin = '0';
        innerTextDiv.style.padding = '0';
        innerTextDiv.style.lineHeight = block.style.vertical ? '1.12' : '1.18';
        innerTextDiv.style.textAlign = block.style.align || 'center';

        setMultilineText(innerTextDiv, block.translated);

        if ((globalState.bilingualMode === 'sub' || block.style.bilingualSub) && block.original && block.original.trim()) {
            const origSub = document.createElement('div');
            origSub.className = 'text-[0.7em] opacity-75 font-sans tracking-normal mt-0.5 select-none pointer-events-none';
            origSub.style.color = 'inherit';
            origSub.style.lineHeight = '1.1';
            setMultilineText(origSub, block.original);
            innerTextDiv.appendChild(origSub);
        }

        innerTextDiv.style.position = 'relative';
        innerTextDiv.style.zIndex = '1';
        maskContent.appendChild(innerTextDiv);

        bubble.setAttribute('data-original', block.original || '');
        bubble.setAttribute('data-translated', block.translated || '');
        bubble.appendChild(maskContent);

        // Add Drag-and-Resize handles (only for primary non-mirrored interactive canvas)
        if (!isMirror) {
            bubble.addEventListener('mousedown', (e) => startBlockDrag(e, block));
            bubble.addEventListener('touchstart', (e) => startBlockDrag(e, block), { passive: false });
            bubble.addEventListener('dblclick', () => {
                uiSetRightTab('edit');
                elements.editTranslatedText.focus();
            });

            // Resize corner handles
            const handleSW = document.createElement('div');
            handleSW.className = "resize-handle resize-sw";
            handleSW.addEventListener('mousedown', (e) => startBlockResize(e, block, 'sw'));
            handleSW.addEventListener('touchstart', (e) => startBlockResize(e, block, 'sw'), { passive: false });

            const handleSE = document.createElement('div');
            handleSE.className = "resize-handle resize-se";
            handleSE.addEventListener('mousedown', (e) => startBlockResize(e, block, 'se'));
            handleSE.addEventListener('touchstart', (e) => startBlockResize(e, block, 'se'), { passive: false });

            const handleNW = document.createElement('div');
            handleNW.className = "resize-handle resize-nw";
            handleNW.addEventListener('mousedown', (e) => startBlockResize(e, block, 'nw'));
            handleNW.addEventListener('touchstart', (e) => startBlockResize(e, block, 'nw'), { passive: false });

            const handleNE = document.createElement('div');
            handleNE.className = "resize-handle resize-ne";
            handleNE.addEventListener('mousedown', (e) => startBlockResize(e, block, 'ne'));
            handleNE.addEventListener('touchstart', (e) => startBlockResize(e, block, 'ne'), { passive: false });

            bubble.appendChild(handleSW);
            bubble.appendChild(handleSE);
            bubble.appendChild(handleNW);
            bubble.appendChild(handleNE);
        }

        fragment.appendChild(bubble);
    });

    container.appendChild(fragment);
}

// Helper: Convert Hex color scheme to RGBA equivalents
export function convertHexToRGBA(hex, alpha) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Selection highlights
export function selectBlock(blockId) {
    const prevSelectedBlockId = globalState.selectedBlockId;
    globalState.selectedBlockId = blockId;

    if (prevSelectedBlockId && prevSelectedBlockId !== blockId) {
        const prevEl = document.getElementById(prevSelectedBlockId);
        if (prevEl) prevEl.classList.remove('active');
    }
    const nextEl = document.getElementById(blockId);
    if (nextEl) {
        nextEl.classList.add('active');
    } else {
        requestOverlayRender();
    }

    uiUpdateActiveBlockEditor();

    // Cập nhật trạng thái nút Copy/Paste Style
    if (elements.btnCopyStyle) elements.btnCopyStyle.disabled = false;
    if (elements.btnPasteStyle) elements.btnPasteStyle.disabled = !copiedStyle;

    // Adjust sidebar clone to keep overlays clean if on split panel
    if (globalState.viewMode === 'split') {
        uiUpdateSplitView();
    }

    updateFloatingToolbarPosition();
}

// Cập nhật vị trí thanh công cụ nổi (Floating Context Bar) trên Canvas
export function updateFloatingToolbarPosition() {
    if (!elements.canvasFloatingToolbar) return;

    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null || globalState.viewMode === 'original') {
        elements.canvasFloatingToolbar.classList.add('hidden');
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    const block = page ? page.blocks.find(b => b.id === globalState.selectedBlockId) : null;
    if (!block) {
        elements.canvasFloatingToolbar.classList.add('hidden');
        return;
    }

    if (elements.lblFloatingDir) {
        elements.lblFloatingDir.textContent = block.style.vertical ? 'Ngang' : 'Dọc';
    }

    const topPos = block.box.y > 12 ? (block.box.y - 6) : (block.box.y + block.box.h + 2);
    const leftPos = Math.max(12, Math.min(88, block.box.x + (block.box.w / 2)));

    elements.canvasFloatingToolbar.style.top = `${topPos}%`;
    elements.canvasFloatingToolbar.style.left = `${leftPos}%`;
    elements.canvasFloatingToolbar.classList.remove('hidden');
}

import { duplicateActiveBlock as duplicateActiveBlockLogic } from './canvas-actions.js';

export function duplicateActiveBlock() {
    return duplicateActiveBlockLogic();
}

// Chuyển hướng Ngang / Dọc của ô thoại đang chọn
export function toggleActiveBlockOrientation() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    const nextVertical = !block.style.vertical;
    syncActiveBlockStyle('vertical', nextVertical);
    showToast(nextVertical ? "Đã chuyển sang viết chữ Dọc" : "Đã chuyển sang viết chữ Ngang", "info");
}

// Chuyển toàn bộ ô thoại trên trang hiện tại thành chữ viết Ngang
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
        pushStateToHistory();
        if (typeof window.selectPage === 'function') {
            window.selectPage(globalState.activePageIndex);
        }
        showToast(`✅ Đã chuyển ${count} ô thoại thành chữ viết Ngang!`, "success");
    } else {
        showToast("Tất cả ô thoại đã là chữ viết Ngang.", "info");
    }
}

window.normalizeAllBlocksToHorizontal = normalizeAllBlocksToHorizontal;

// Áp dụng Preset mẫu định dạng nhanh cho ô thoại
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

    // Map old keys for backwards compatibility
    presets['manga-std'] = presets.dialogue;
    presets['shout-sfx'] = presets.scream;
    presets['whisper-old'] = presets.whisper;
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
    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    updateFloatingToolbarPosition();
    savePageToDB(page);

    const label = presetKey === 'dialogue' || presetKey === 'manga-std' ? 'Thoại thường' :
        presetKey === 'scream' || presetKey === 'shout-sfx' ? 'Hét lớn / SFX' :
            presetKey === 'whisper' ? 'Thầm thì' :
                presetKey === 'narration' ? 'Dẫn truyện' : 'Preset';
    showToast(`💥 Đã áp dụng mẫu chữ "${label}"`, "success");
}

// Add a completely new custom manual block overlay
export function addNewBlock() {
    if (globalState.activePageIndex === -1) {
        showToast("Vui lòng tải hoặc mở một trang trước khi tạo ô thoại!", "error");
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    const newId = `manual_block_${Date.now()}`;

    const newBlock = {
        id: newId,
        type: 'dialogue',
        original: '',
        translated: 'Nhập nội dung dịch...',
        box: {
            x: 35,
            y: 40,
            w: 30,
            h: 20
        },
        style: {
            fontFamily: globalState.globalStyle.fontFamily,
            fontSize: globalState.globalStyle.fontSize,
            textColor: globalState.globalStyle.textColor,
            bgColor: globalState.globalStyle.bgColor,
            bgOpacity: globalState.globalStyle.bgOpacity,
            padding: globalState.globalStyle.padding,
            rotate: globalState.globalStyle.rotate || 0,
            vertical: DEFAULT_VERTICAL_WRITING_MODE,
            bold: globalState.globalStyle.bold,
            align: globalState.globalStyle.align,
            maskShape: globalState.globalStyle.maskShape,
            maskSize: globalState.globalStyle.maskSize
        }
    };

    pushStateToHistory();
    page.blocks.push(newBlock);
    selectBlock(newId);
    savePageToDB(page);
    showToast("Đã thêm một ô dịch mới!", "success");
}

// Delete currently selected active block overlay
export async function deleteActiveBlock() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    const targetIdx = page.blocks.findIndex(b => b.id === globalState.selectedBlockId);

    if (targetIdx !== -1) {
        const block = page.blocks[targetIdx];
        if (block.originalBackgroundBackup) {
            await restoreBackgroundForBlock(block.id);
        }

        pushStateToHistory();
        page.blocks.splice(targetIdx, 1);
        globalState.selectedBlockId = null;
        requestOverlayRender();
        uiUpdateActiveBlockEditor();
        savePageToDB(page);
        showToast("Đã xóa ô dịch thành công.", "info");
    }
}

export function syncActiveBlockTranslation(val) {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block) {
        block.translated = val;

        // Realtime re-fit check
        if (globalState.autoFitEnabled) {
            autoFitBlock(block);
        }

        // Optimized partial redraw
        const overlayElem = document.getElementById(block.id);
        if (overlayElem) {
            const textContainer = overlayElem.querySelector('div > div');
            if (textContainer) {
                setMultilineText(textContainer, val);
            }
            if (globalState.autoFitEnabled) {
                const maskElem = overlayElem.firstElementChild;
                if (maskElem) {
                    maskElem.style.fontSize = `${block.style.fontSize}px`;
                }
                elements.lblFontSize.innerText = `${block.style.fontSize}px`;
                elements.styleFontSize.value = block.style.fontSize;
            }
        }

        if (globalState.viewMode === 'split') {
            const cloneOverlay = document.getElementById(`mirror-${block.id}`);
            if (cloneOverlay) {
                const cloneTextContainer = cloneOverlay.querySelector('div > div');
                if (cloneTextContainer) setMultilineText(cloneTextContainer, val);
                if (globalState.autoFitEnabled) {
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

let isCurrentlySliding = false;

// Bật/tắt chế độ cỡ chữ tự động Auto-Fit
export function toggleAutoFit(enabled) {
    globalState.autoFitEnabled = !!enabled;
    if (elements.styleAutoFit) {
        elements.styleAutoFit.checked = globalState.autoFitEnabled;
    }
    if (globalState.activePageIndex !== -1) {
        const page = globalState.pages[globalState.activePageIndex];
        if (page) {
            page.blocks.forEach(b => b.autoFitCache = null);
        }
    }
    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    showToast(globalState.autoFitEnabled ? "Đã bật Cỡ chữ Tự động (Auto-Fit)" : "Đã tắt Auto-Fit (Chuyển sang chỉnh cỡ chữ thủ công)", "info");
}

// Sync styling parameters
export function syncActiveBlockStyle(property, value) {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);

    if (block) {
        if (property === 'fontSize' && globalState.autoFitEnabled) {
            globalState.autoFitEnabled = false;
            if (elements.styleAutoFit) elements.styleAutoFit.checked = false;
        }

        const rangeProperties = ['fontSize', 'bgOpacity', 'padding', 'rotate'];
        if (rangeProperties.includes(property)) {
            if (!isCurrentlySliding) {
                isCurrentlySliding = true;
                pushStateToHistory();
                const stopSlide = () => {
                    isCurrentlySliding = false;
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
            elements.lblFontSize.innerText = `${value}px`;
            elements.styleFontSize.value = value;
        } else if (property === 'bgOpacity') {
            elements.lblBgOpacity.innerText = `${value}%`;
        } else if (property === 'padding') {
            elements.lblPadding.innerText = `${value}px`;
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
        requestOverlayRender();
        uiUpdateActiveBlockEditor();
        updateFloatingToolbarPosition();
        debounceSavePage(page);
    }
}

// Auto-Fit font calculator with Binary Search algorithm
export function autoFitBlock(block, customImgElement = null, forceExportScale = 1) {
    if (!block.translated || block.translated.trim() === '') {
        block.style.fontSize = 12;
        return;
    }

    const imgEl = customImgElement || elements.mangaBgImage;

    let displayWidth = (imgEl && imgEl.clientWidth > 0) ? imgEl.clientWidth : 0;
    if (!displayWidth && elements.mangaCanvasContainer && elements.mangaCanvasContainer.clientWidth > 0) {
        displayWidth = elements.mangaCanvasContainer.clientWidth;
    }
    if (!displayWidth && elements.workspaceViewport && elements.workspaceViewport.clientWidth > 0) {
        displayWidth = Math.min(elements.workspaceViewport.clientWidth - 32, 1000);
    }
    if (!displayWidth) {
        displayWidth = 800;
    }

    const naturalW = (imgEl && imgEl.naturalWidth > 0) ? imgEl.naturalWidth : 800;
    const naturalH = (imgEl && imgEl.naturalHeight > 0) ? imgEl.naturalHeight : 1200;
    const aspect = naturalH / Math.max(1, naturalW);
    const displayHeight = displayWidth * aspect;

    const maskShape = block.style.maskShape || 'bubble-fit';
    const cacheKey = `${block.translated}_${block.box.w}_${block.box.h}_${block.style.fontFamily}_${block.style.padding}_${block.style.vertical}_${block.style.bold}_${block.style.align}_${maskShape}_${Math.round(displayWidth)}_${Math.round(displayHeight)}`;
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

    ruler.className = `${block.style.fontFamily}`;
    const padding = block.style.padding !== undefined ? block.style.padding : 4;
    ruler.style.padding = `${padding}px`;
    ruler.style.textAlign = block.style.align || 'center';
    ruler.style.letterSpacing = '0';
    ruler.style.fontKerning = 'normal';
    ruler.style.wordBreak = 'keep-all';
    ruler.style.overflowWrap = 'normal';

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
    const fitMargin = isEllipseShape ? 0.82 : 0.95;

    if (block.style.vertical) {
        ruler.style.height = `${targetHeight * fitMargin}px`;
        ruler.style.width = 'auto';
    } else {
        ruler.style.width = `${targetWidth * fitMargin}px`;
        ruler.style.height = 'auto';
    }

    // Set the multiline text ONCE before the binary search loop to avoid repeated DOM mutations
    setMultilineText(ruler, block.translated);

    let minSize = 8;
    let maxSize = Math.min(72, Math.floor(targetHeight * 0.85));
    if (maxSize < minSize) maxSize = minSize;
    let optimalSize = minSize;

    while (minSize <= maxSize) {
        const mid = Math.floor((minSize + maxSize) / 2);
        ruler.style.fontSize = `${mid}px`;

        const contentWidth = ruler.scrollWidth;
        const contentHeight = ruler.scrollHeight;

        const fits = contentWidth <= (targetWidth * fitMargin) + 1 && contentHeight <= (targetHeight * fitMargin) + 1;

        if (fits) {
            optimalSize = mid;
            minSize = mid + 1;
        } else {
            maxSize = mid - 1;
        }
    }

    let probeSize = optimalSize;
    for (let i = 0; i < 2; i++) {
        ruler.style.fontSize = `${probeSize}px`;
        if (ruler.scrollWidth <= (targetWidth * fitMargin) + 1 && ruler.scrollHeight <= (targetHeight * fitMargin) + 1) break;
        probeSize = Math.max(8, probeSize - 1);
    }

    const finalSize = probeSize;
    block.style.fontSize = finalSize;

    ruler.style.fontSize = `${finalSize}px`;
    ruler.style.padding = '1px';
    setMultilineText(ruler, block.translated);
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

export function startBlockDrag(e, block) {
    if (e.target.classList.contains('resize-handle')) return;

    e.preventDefault();
    pushStateToHistory();
    selectBlock(block.id);

    const isTouch = e.type.startsWith('touch');
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;

    const startX = clientX;
    const startY = clientY;

    const startPercentX = block.box.x;
    const startPercentY = block.box.y;

    const containerWidth = elements.mangaCanvasContainer.clientWidth;
    const containerHeight = elements.mangaCanvasContainer.clientHeight;

    function onDragging(moveEvent) {
        const curTouch = moveEvent.type.startsWith('touch');
        const curX = curTouch ? moveEvent.touches[0].clientX : moveEvent.clientX;
        const curY = curTouch ? moveEvent.touches[0].clientY : moveEvent.clientY;

        const deltaX = curX - startX;
        const deltaY = curY - startY;

        const deltaPercentX = (deltaX / containerWidth) * 100;
        const deltaPercentY = (deltaY / containerHeight) * 100;

        block.box.x = Math.max(0, Math.min(100 - block.box.w, startPercentX + deltaPercentX));
        block.box.y = Math.max(0, Math.min(100 - block.box.h, startPercentY + deltaPercentY));

        const blockElem = document.getElementById(block.id);
        if (blockElem) {
            blockElem.style.left = `${block.box.x}%`;
            blockElem.style.top = `${block.box.y}%`;
        }

        updateFloatingToolbarPosition();
    }

    function onDragEnd() {
        document.removeEventListener('mousemove', onDragging);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchmove', onDragging);
        document.removeEventListener('touchend', onDragEnd);

        block.maskCache = null;
        requestOverlayRender();

        const activePage = globalState.pages[globalState.activePageIndex];
        if (activePage) savePageToDB(activePage);
    }

    document.addEventListener('mousemove', onDragging);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchmove', onDragging, { passive: false });
    document.addEventListener('touchend', onDragEnd);
}

export function startBlockResize(e, block, handleDir) {
    e.stopPropagation();
    e.preventDefault();
    pushStateToHistory();

    const isTouch = e.type.startsWith('touch');
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;

    const startX = clientX;
    const startY = clientY;

    const startBox = { ...block.box };

    const containerWidth = elements.mangaCanvasContainer.clientWidth;
    const containerHeight = elements.mangaCanvasContainer.clientHeight;

    let resizeRafId = null;

    function onResizing(moveEvent) {
        const curTouch = moveEvent.type.startsWith('touch');
        const curX = curTouch ? moveEvent.touches[0].clientX : moveEvent.clientX;
        const curY = curTouch ? moveEvent.touches[0].clientY : moveEvent.clientY;

        const deltaX = curX - startX;
        const deltaY = curY - startY;

        const deltaPercentX = (deltaX / containerWidth) * 100;
        const deltaPercentY = (deltaY / containerHeight) * 100;

        let nextX = startBox.x;
        let nextY = startBox.y;
        let nextW = startBox.w;
        let nextH = startBox.h;

        if (handleDir.includes('e')) {
            nextW = Math.max(2, Math.min(100 - startBox.x, startBox.w + deltaPercentX));
        }
        if (handleDir.includes('w')) {
            const computedX = startBox.x + deltaPercentX;
            if (computedX >= 0 && (startBox.w - deltaPercentX) >= 2) {
                nextX = computedX;
                nextW = startBox.w - deltaPercentX;
            }
        }
        if (handleDir.includes('s')) {
            nextH = Math.max(2, Math.min(100 - startBox.y, startBox.h + deltaPercentY));
        }
        if (handleDir.includes('n')) {
            const computedY = startBox.y + deltaPercentY;
            if (computedY >= 0 && (startBox.h - deltaPercentY) >= 2) {
                nextY = computedY;
                nextH = startBox.h - deltaPercentY;
            }
        }

        block.box = { x: nextX, y: nextY, w: nextW, h: nextH };

        const blockElem = document.getElementById(block.id);
        if (blockElem) {
            blockElem.style.left = `${block.box.x}%`;
            blockElem.style.top = `${block.box.y}%`;
            blockElem.style.width = `${block.box.w}%`;
            blockElem.style.height = `${block.box.h}%`;

            updateFloatingToolbarPosition();

            if (globalState.autoFitEnabled) {
                if (!resizeRafId) {
                    resizeRafId = requestAnimationFrame(() => {
                        resizeRafId = null;
                        block.autoFitCache = null;
                        autoFitBlock(block);
                        const maskElem = blockElem.firstElementChild;
                        if (maskElem) {
                            maskElem.style.fontSize = `${block.style.fontSize}px`;
                        }
                        if (elements.lblFontSize) elements.lblFontSize.innerText = `${block.style.fontSize}px`;
                        if (elements.styleFontSize) elements.styleFontSize.value = block.style.fontSize;
                    });
                }
            }
        }
    }

    function onResizeEnd() {
        if (resizeRafId) {
            cancelAnimationFrame(resizeRafId);
            resizeRafId = null;
        }
        document.removeEventListener('mousemove', onResizing);
        document.removeEventListener('mouseup', onResizeEnd);
        document.removeEventListener('touchmove', onResizing);
        document.removeEventListener('touchend', onResizeEnd);

        block.maskCache = null;
        requestOverlayRender();
        uiUpdateActiveBlockEditor();

        const activePage = globalState.pages[globalState.activePageIndex];
        if (activePage) savePageToDB(activePage);
    }

    document.addEventListener('mousemove', onResizing);
    document.addEventListener('mouseup', onResizeEnd);
    document.addEventListener('touchmove', onResizing, { passive: false });
    document.addEventListener('touchend', onResizeEnd);
}

export function wrapCanvasText(ctx, text, maxWidth) {
    if (!text) return [];
    const rawLines = text.split('\n');
    const resultLines = [];

    for (const line of rawLines) {
        const trimmed = line.trim();
        if (!trimmed) {
            resultLines.push('');
            continue;
        }

        const spaceTokens = trimmed.split(/\s+/);
        const words = [];

        for (const token of spaceTokens) {
            if (!token) continue;
            const parts = token.split(/([-–—])/);
            let subWord = '';
            for (let p = 0; p < parts.length; p++) {
                const part = parts[p];
                if (!part) continue;
                subWord += part;
                if (part === '-' || part === '–' || part === '—' || p === parts.length - 1) {
                    words.push(subWord);
                    subWord = '';
                }
            }
        }

        if (words.length === 0) continue;

        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const needsSpace = !currentLine.endsWith('-') && !currentLine.endsWith('–') && !currentLine.endsWith('—');
            const testLine = needsSpace ? currentLine + ' ' + word : currentLine + word;

            if (ctx.measureText(testLine).width <= maxWidth) {
                currentLine = testLine;
            } else {
                resultLines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) {
            resultLines.push(currentLine);
        }
    }
    return resultLines;
}

export function wrapCanvasVerticalText(text, maxHeight, fontSizePx) {
    if (!text) return [];
    const charStep = fontSizePx * 1.12;
    const maxCharsPerCol = Math.max(1, Math.floor(maxHeight / charStep));
    const paragraphs = text.split('\n');
    const columns = [];

    for (const para of paragraphs) {
        if (!para.trim()) {
            columns.push([]);
            continue;
        }

        const chars = Array.from(para.trim());
        let currentCol = [];

        for (const char of chars) {
            if (currentCol.length >= maxCharsPerCol) {
                columns.push(currentCol);
                currentCol = [];
            }
            currentCol.push(char);
        }
        if (currentCol.length > 0) {
            columns.push(currentCol);
        }
    }

    return columns;
}

export async function renderPageToCanvas2D(page) {
    const imgElement = elements.mangaBgImage;
    if (!imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) {
        throw new Error("Dữ liệu ảnh gốc chưa sẵn sàng.");
    }

    const W = imgElement.naturalWidth;
    const H = imgElement.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(imgElement, 0, 0, W, H);

    if (page.eraserLayerBlob) {
        await new Promise((resolve) => {
            const eraserImg = new Image();
            const url = URL.createObjectURL(page.eraserLayerBlob);
            eraserImg.onload = () => {
                ctx.drawImage(eraserImg, 0, 0, W, H);
                URL.revokeObjectURL(url);
                resolve();
            };
            eraserImg.onerror = () => {
                URL.revokeObjectURL(url);
                resolve();
            };
            eraserImg.src = url;
        });
    } else if (page === globalState.pages[globalState.activePageIndex] && elements.eraserCanvas && elements.eraserCanvas.width > 0) {
        ctx.drawImage(elements.eraserCanvas, 0, 0, W, H);
    }

    await document.fonts.ready;

    let activeImageData = page.imageDataCache || null;
    const hasBubbleFit = page.blocks && page.blocks.some(block => (block.style.maskShape || 'bubble-fit') === 'bubble-fit');
    if (hasBubbleFit && !activeImageData) {
        try {
            const bgCanvas = document.createElement('canvas');
            bgCanvas.width = W;
            bgCanvas.height = H;
            const bgCtx = bgCanvas.getContext('2d');
            bgCtx.drawImage(imgElement, 0, 0);
            activeImageData = bgCtx.getImageData(0, 0, W, H);
            page.imageDataCache = activeImageData;
        } catch (e) {
            console.error("Lỗi tạo imageDataCache khi xuất canvas:", e);
        }
    }

    if (page.blocks && page.blocks.length > 0) {
        for (const block of page.blocks) {
            if (!block.translated || !block.translated.trim()) continue;

            const bx = (block.box.x / 100) * W;
            const by = (block.box.y / 100) * H;
            const bw = (block.box.w / 100) * W;
            const bh = (block.box.h / 100) * H;

            ctx.save();

            if (block.style.rotate) {
                const cx = bx + bw / 2;
                const cy = by + bh / 2;
                ctx.translate(cx, cy);
                ctx.rotate((block.style.rotate * Math.PI) / 180);
                ctx.translate(-cx, -cy);
            }

            ctx.beginPath();
            ctx.rect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
            ctx.clip();

            const fontClass = block.style.fontFamily || 'font-comic';
            let fontName = "'Patrick Hand', cursive";
            if (fontClass === 'font-manga') fontName = "'Nunito', sans-serif";
            else if (fontClass === 'font-vietnamese') fontName = "'Be Vietnam Pro', 'Inter', sans-serif";
            else if (fontClass === 'font-comicneue') fontName = "'Comic Neue', cursive";
            else if (fontClass === 'font-impact') fontName = "'Bangers', cursive";
            else if (fontClass === 'font-marker') fontName = "'Permanent Marker', cursive";
            else if (fontClass === 'font-bungee') fontName = "'Bungee', cursive";
            else if (fontClass === 'font-caveat') fontName = "'Caveat', cursive";
            else if (fontClass === 'font-tech') fontName = "'Chakra Petch', sans-serif";
            else if (fontClass === 'font-condensed') fontName = "'Saira Condensed', sans-serif";
            else if (fontClass && !fontClass.startsWith('font-')) fontName = `'${fontClass}', sans-serif`;

            const displayWidth = page.lastDisplayWidth || imgElement.clientWidth || 800;
            const scaleFactor = W / Math.max(1, displayWidth);
            const fontSizePx = (block.style.fontSize || 16) * scaleFactor;
            const fontWeight = block.style.bold ? 'bold' : 'normal';

            ctx.font = `${fontWeight} ${fontSizePx}px ${fontName}`;
            ctx.fillStyle = block.style.textColor || '#000000';

            const paddingPx = (block.style.padding !== undefined ? block.style.padding : 4) * scaleFactor;
            const strokeWidth = parseFloat(block.style.strokeWidth) || 0;
            const strokeColor = block.style.strokeColor || '#ffffff';
            const strokeWidthPx = strokeWidth * scaleFactor;

            const shadowBlur = parseFloat(block.style.shadowBlur) || 0;
            const shadowColor = block.style.shadowColor || '#000000';
            const shadowBlurPx = shadowBlur * scaleFactor;

            const maskShape = block.style.maskShape || 'bubble-fit';
            const maskSize = block.style.maskSize || 'full';

            let textLines = [];
            let columns = [];
            let totalTextWidth = 0;
            let totalTextHeight = 0;

            const insetPad = Math.max(1, Math.round(scaleFactor * 0.8));
            let fillBx = bx + insetPad;
            let fillBy = by + insetPad;
            let fillBw = Math.max(1, bw - (insetPad * 2));
            let fillBh = Math.max(1, bh - (insetPad * 2));

            const strokeExtra = strokeWidthPx > 0 ? (strokeWidthPx * 1.2) : 0;
            const safetyMargin = Math.max(2, Math.round(scaleFactor * 2));

            if (block.style.vertical) {
                const maxColHeight = Math.max(10, bh - (paddingPx * 2) - strokeExtra - safetyMargin);
                columns = wrapCanvasVerticalText(block.translated, maxColHeight, fontSizePx);
                const colStep = fontSizePx * 1.12;
                const charStep = fontSizePx * 1.12;
                totalTextWidth = columns.length * colStep;
                let maxColLength = 0;
                columns.forEach(c => { if (c.length > maxColLength) maxColLength = c.length; });
                totalTextHeight = maxColLength * charStep;

                if (maskSize === 'snug') {
                    const snugW = Math.min(fillBw, totalTextWidth + (paddingPx * 2));
                    const snugH = Math.min(fillBh, totalTextHeight + (paddingPx * 2));
                    fillBx = bx + (bw - snugW) / 2;
                    fillBy = by + (bh - snugH) / 2;
                    fillBw = snugW;
                    fillBh = snugH;
                }
            } else {
                const maxTextWidth = Math.max(10, bw - (paddingPx * 2) - strokeExtra - safetyMargin);
                textLines = wrapCanvasText(ctx, block.translated, maxTextWidth);
                const lineHeight = fontSizePx * 1.18;
                totalTextHeight = textLines.length * lineHeight;
                let maxLineWidth = 0;
                textLines.forEach(line => {
                    const w = ctx.measureText(line).width;
                    if (w > maxLineWidth) maxLineWidth = w;
                });
                totalTextWidth = maxLineWidth;

                if (maskSize === 'snug') {
                    const snugW = Math.min(fillBw, totalTextWidth + (paddingPx * 2));
                    const snugH = Math.min(fillBh, totalTextHeight + (paddingPx * 2));
                    fillBx = bx + (bw - snugW) / 2;
                    if (block.style.align === 'left') fillBx = bx + insetPad;
                    else if (block.style.align === 'right') fillBx = bx + bw - snugW - insetPad;
                    fillBy = by + (bh - snugH) / 2;
                    fillBw = snugW;
                    fillBh = snugH;
                }
            }

            const hexBgColor = block.style.bgColor || '#ffffff';
            const alpha = (block.style.bgOpacity !== undefined ? block.style.bgOpacity : 100) / 100;

            let maskDrawn = false;
            if (maskShape === 'bubble-fit') {
                if (!block.maskCache && activeImageData) {
                    computeBubbleMask(page, block, activeImageData);
                }
                const maskCanvasObj = block.maskCache ? (block.maskCache.canvas || block.maskCache) : null;
                const maskDataUrl = block.maskCache ? block.maskCache.dataUrl : (maskCanvasObj && maskCanvasObj.toDataURL ? maskCanvasObj.toDataURL() : null);

                if (maskDataUrl) {
                    await new Promise((resolve) => {
                        const maskImg = new Image();
                        maskImg.onload = () => {
                            ctx.drawImage(maskImg, bx, by, bw, bh);
                            maskDrawn = true;
                            resolve();
                        };
                        maskImg.onerror = resolve;
                        maskImg.src = maskDataUrl;
                    });
                }
            }

            if (!maskDrawn && alpha > 0) {
                ctx.fillStyle = convertHexToRGBA(hexBgColor, alpha);
                if (maskShape === 'ellipse') {
                    ctx.beginPath();
                    ctx.ellipse(fillBx + fillBw / 2, fillBy + fillBh / 2, fillBw / 2, fillBh / 2, 0, 0, 2 * Math.PI);
                    ctx.fill();
                } else if (maskShape === 'rounded') {
                    const r = Math.min(16, fillBw / 4, fillBh / 4);
                    ctx.beginPath();
                    if (ctx.roundRect) {
                        ctx.roundRect(fillBx, fillBy, fillBw, fillBh, r);
                    } else {
                        ctx.rect(fillBx, fillBy, fillBw, fillBh);
                    }
                    ctx.fill();
                } else {
                    ctx.fillRect(fillBx, fillBy, fillBw, fillBh);
                }
            }

            ctx.font = `${fontWeight} ${fontSizePx}px ${fontName}`;
            ctx.fillStyle = block.style.textColor || '#000000';

            if (block.style.vertical) {
                const colStep = fontSizePx * 1.12;
                const charStep = fontSizePx * 1.12;

                // Vertical text is always centered horizontally to match the editor and standard manga typesetting rules
                let rightX = bx + bw / 2 + totalTextWidth / 2 - colStep / 2;

                for (let j = 0; j < columns.length; j++) {
                    const colChars = columns[j];
                    const colX = rightX - (j * colStep);
                    const colHeight = colChars.length * charStep;
                    let startY = by + (bh / 2) - (colHeight / 2) + (charStep / 2);
                    const minStartY = by + paddingPx + (charStep / 2);
                    if (startY < minStartY) startY = minStartY;

                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    for (let k = 0; k < colChars.length; k++) {
                        const char = colChars[k];
                        const charY = startY + (k * charStep);

                        if (strokeWidth > 0) {
                            ctx.save();
                            if (shadowBlur > 0) {
                                ctx.shadowColor = shadowColor;
                                ctx.shadowBlur = shadowBlurPx;
                                ctx.shadowOffsetX = 0;
                                ctx.shadowOffsetY = 0;
                            }
                            ctx.lineWidth = strokeWidthPx;
                            ctx.strokeStyle = strokeColor;
                            ctx.lineJoin = 'round';
                            ctx.miterLimit = 2;
                            ctx.strokeText(char, colX, charY);
                            ctx.restore();
                        }

                        ctx.save();
                        if (strokeWidth === 0 && shadowBlur > 0) {
                            ctx.shadowColor = shadowColor;
                            ctx.shadowBlur = shadowBlurPx;
                            ctx.shadowOffsetX = 0;
                            ctx.shadowOffsetY = 0;
                        }
                        ctx.fillStyle = block.style.textColor || '#000000';
                        ctx.fillText(char, colX, charY);
                        ctx.restore();
                    }
                }
            } else {
                const lineHeight = fontSizePx * 1.18;

                let startY = by + (bh / 2) - (totalTextHeight / 2) + (lineHeight / 2);
                const minStartY = by + paddingPx + (lineHeight / 2);
                if (startY < minStartY) startY = minStartY;

                let startX = bx + bw / 2;
                if (block.style.align === 'left') startX = bx + paddingPx;
                else if (block.style.align === 'right') startX = bx + bw - paddingPx;

                ctx.textAlign = block.style.align || 'center';
                ctx.textBaseline = 'middle';

                for (let i = 0; i < textLines.length; i++) {
                    const lineText = textLines[i];
                    const lineY = startY + (i * lineHeight);

                    if (strokeWidth > 0) {
                        ctx.save();
                        if (shadowBlur > 0) {
                            ctx.shadowColor = shadowColor;
                            ctx.shadowBlur = shadowBlurPx;
                            ctx.shadowOffsetX = 0;
                            ctx.shadowOffsetY = 0;
                        }
                        ctx.lineWidth = strokeWidthPx;
                        ctx.strokeStyle = strokeColor;
                        ctx.lineJoin = 'round';
                        ctx.miterLimit = 2;
                        ctx.strokeText(lineText, startX, lineY);
                        ctx.restore();
                    }

                    ctx.save();
                    if (strokeWidth === 0 && shadowBlur > 0) {
                        ctx.shadowColor = shadowColor;
                        ctx.shadowBlur = shadowBlurPx;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                    }
                    ctx.fillStyle = block.style.textColor || '#000000';
                    ctx.fillText(lineText, startX, lineY);
                    ctx.restore();
                }
            }

            ctx.restore();
        }
    }

    return canvas;
}

export async function renderPageToCanvasSVG(page) {
    const imgElement = elements.mangaBgImage;
    if (!imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) {
        throw new Error("Dữ liệu ảnh gốc chưa sẵn sàng.");
    }

    const W = imgElement.naturalWidth;
    const H = imgElement.naturalHeight;

    const displayWidth = page.lastDisplayWidth || imgElement.clientWidth || 800;
    const forceExportScale = W / Math.max(1, displayWidth);

    const mirrorContainer = document.createElement('div');
    mirrorContainer.style.position = 'absolute';
    mirrorContainer.style.left = '-99999px';
    mirrorContainer.style.top = '0';
    mirrorContainer.style.width = `${W}px`;
    mirrorContainer.style.height = `${H}px`;
    mirrorContainer.style.overflow = 'hidden';
    mirrorContainer.style.boxSizing = 'border-box';
    document.body.appendChild(mirrorContainer);

    try {
        await document.fonts.ready;
        renderOverlays(mirrorContainer, page, imgElement, forceExportScale);
        await waitForNextPaint();

        const cssStyles = `
            @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,700;1,400&family=Comic+Neue:wght@400;700&family=Nunito:wght@400;700&family=Patrick+Hand&family=Bangers&family=Permanent+Marker&family=Bungee&family=Caveat:wght@400;700&family=Chakra+Petch:wght@400;700&family=Saira+Condensed:wght@400;700&display=swap');
            * { box-sizing: border-box; }
            .bubble-overlay { position: absolute; box-sizing: border-box; }
            .text-vertical { writing-mode: vertical-rl; text-orientation: upright; }
            .font-comic { font-family: 'Patrick Hand', cursive; }
            .font-manga { font-family: 'Nunito', sans-serif; }
            .font-vietnamese { font-family: 'Be Vietnam Pro', 'Inter', sans-serif; }
            .font-comicneue { font-family: 'Comic Neue', cursive; }
            .font-impact { font-family: 'Bangers', cursive; }
            .font-marker { font-family: 'Permanent Marker', cursive; }
            .font-bungee { font-family: 'Bungee', cursive; }
            .font-caveat { font-family: 'Caveat', cursive; }
            .font-tech { font-family: 'Chakra Petch', sans-serif; }
            .font-condensed { font-family: 'Saira Condensed', sans-serif; }
            .resize-handle { display: none !important; }
        `;

        const svgString = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
                <style>${cssStyles}</style>
                <foreignObject width="100%" height="100%">
                    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px; height:${H}px; position:relative; background:transparent;">
                        ${mirrorContainer.innerHTML}
                    </div>
                </foreignObject>
            </svg>
        `;

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(imgElement, 0, 0, W, H);

        if (page.eraserCanvasDataUrl) {
            await new Promise((resolve) => {
                const eraserImg = new Image();
                eraserImg.onload = () => {
                    ctx.drawImage(eraserImg, 0, 0, W, H);
                    resolve();
                };
                eraserImg.onerror = resolve;
                eraserImg.src = page.eraserCanvasDataUrl;
            });
        } else if (elements.eraserCanvas && elements.eraserCanvas.width > 0) {
            ctx.drawImage(elements.eraserCanvas, 0, 0, W, H);
        }

        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        await new Promise((resolve, reject) => {
            const svgImg = new Image();
            svgImg.onload = () => {
                ctx.drawImage(svgImg, 0, 0, W, H);
                URL.revokeObjectURL(svgUrl);
                resolve();
            };
            svgImg.onerror = (err) => {
                URL.revokeObjectURL(svgUrl);
                reject(err);
            };
            svgImg.src = svgUrl;
        });

        return canvas;
    } finally {
        if (mirrorContainer.parentNode) {
            mirrorContainer.parentNode.removeChild(mirrorContainer);
        }
    }
}

export function balanceTextToDiamond(text, boxW, boxH) {
    const words = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
    if (words.length <= 3) return words.join(' ');

    const wordCount = words.length;
    let numLines = 3;

    if (boxW && boxH && boxH > 0) {
        const aspect = boxW / boxH;
        if (aspect < 0.7) {
            numLines = Math.min(wordCount, Math.max(3, Math.ceil(wordCount / 2.5)));
        } else if (aspect > 1.4) {
            numLines = Math.max(2, Math.min(4, Math.floor(wordCount / 4)));
        } else {
            numLines = wordCount <= 5 ? 3 : wordCount <= 10 ? 3 : 4;
        }
    } else {
        if (wordCount <= 5) numLines = 3;
        else if (wordCount <= 10) numLines = 3;
        else if (wordCount <= 16) numLines = 4;
        else numLines = 5;
    }
    numLines = Math.max(2, Math.min(wordCount, numLines));

    let weights = [];
    for (let i = 0; i < numLines; i++) {
        const y = -0.5 + (i + 0.5) / numLines;
        const widthFactor = Math.sqrt(Math.max(0.08, 1 - 4 * y * y));
        weights.push(widthFactor);
    }
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let lineCounts = weights.map(w => Math.max(1, Math.round((w / totalWeight) * wordCount)));
    let sum = lineCounts.reduce((a, b) => a + b, 0);

    while (sum < wordCount) {
        const mid = Math.floor(numLines / 2);
        lineCounts[mid]++;
        sum++;
    }
    while (sum > wordCount) {
        const maxIdx = lineCounts.indexOf(Math.max(...lineCounts));
        if (lineCounts[maxIdx] > 1) {
            lineCounts[maxIdx]--;
            sum--;
        } else {
            break;
        }
    }

    let resultLines = [];
    let wordIdx = 0;
    lineCounts.forEach(count => {
        const lineWords = words.slice(wordIdx, wordIdx + count);
        if (lineWords.length > 0) {
            resultLines.push(lineWords.join(' '));
        }
        wordIdx += count;
    });
    return resultLines.join('\n');
}

export function applyDiamondFormat() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block) {
        const formatted = balanceTextToDiamond(block.translated, block.box ? block.box.w : null, block.box ? block.box.h : null);
        block.translated = formatted;
        elements.editTranslatedText.value = formatted;
        syncActiveBlockTranslation(formatted);
        requestOverlayRender();
        showToast("Đã định dạng dòng cân đối hình kim cương bầu dục thành công!", "success");
    }
}

export function batchDiamondBalanceAllPages() {
    if (!globalState.pages.length) {
        showToast("Chưa có trang truyện nào để cân đối layout.", "warn");
        return;
    }

    pushStateToHistory();
    let totalBalanced = 0;

    globalState.pages.forEach(page => {
        (page.blocks || []).forEach(block => {
            if (block.translated && block.type !== 'sfx') {
                const balanced = balanceTextToDiamond(block.translated, block.box.w, block.box.h);
                if (balanced && balanced !== block.translated) {
                    block.translated = balanced;
                    block.autoFitCache = null;
                    if (globalState.autoFitEnabled) {
                        autoFitBlock(block);
                    }
                    totalBalanced++;
                }
            }
        });
        savePageToDB(page);
    });

    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    showToast(`⚡ Đã tự động cân đối layout Diamond cho ${totalBalanced} ô thoại trên toàn chương!`, "success");
}

// Sao chép thuộc tính phong cách (style) của block đang được chọn
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

// Dán định dạng đã sao chép vào block đang chọn
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
        requestOverlayRender();
        uiUpdateActiveBlockEditor();
        savePageToDB(page);
        showToast("Đã áp dụng định dạng ô thoại!", "success");
    }
}

// Điều hướng giữa các block (Keyboard shortcuts)
export function navigateBlocks(direction) {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || page.blocks.length === 0) return;

    const currentIndex = page.blocks.findIndex(b => b.id === globalState.selectedBlockId);

    let nextIndex;
    if (currentIndex === -1) {
        nextIndex = direction > 0 ? 0 : page.blocks.length - 1;
    } else {
        nextIndex = currentIndex + direction;
        if (nextIndex < 0) nextIndex = page.blocks.length - 1;
        if (nextIndex >= page.blocks.length) nextIndex = 0;
    }

    selectBlock(page.blocks[nextIndex].id);

    const selectedEl = document.getElementById(page.blocks[nextIndex].id);
    if (selectedEl) {
        selectedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

async function restoreBackgroundForBlock(blockId) {
    const ui = await import('../../ui/block-editor-ui.js');
    return ui.restoreBackgroundForBlock(blockId);
}

export function updateSfxRotate(val) {
    const angle = parseInt(val, 10) || 0;
    const activePage = globalState.pages[globalState.activePageIndex];
    if (!activePage || !globalState.selectedBlockId) return;
    const block = activePage.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    block.style.rotate = angle;
    const lbl = document.getElementById('lbl-sfx-rotate');
    if (lbl) lbl.textContent = `${angle}°`;
    requestOverlayRender();
}

export function updateSfxArc(val) {
    const arc = parseInt(val, 10) || 0;
    const activePage = globalState.pages[globalState.activePageIndex];
    if (!activePage || !globalState.selectedBlockId) return;
    const block = activePage.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    block.style.arcAngle = arc;
    const lbl = document.getElementById('lbl-sfx-arc');
    if (lbl) lbl.textContent = `${arc}°`;
    requestOverlayRender();
}

export function resetSfxAngleControls() {
    updateSfxRotate(0);
    updateSfxArc(0);
    const rSlider = document.getElementById('slider-sfx-rotate');
    const aSlider = document.getElementById('slider-sfx-arc');
    if (rSlider) rSlider.value = 0;
    if (aSlider) aSlider.value = 0;
}

// Tự động phân tích ảnh gốc và khớp Font & Màu sắc cho ô thoại
export function autoMatchBlockStyle(block, imgElement) {
    if (!block || !imgElement || !imgElement.naturalWidth || !imgElement.naturalHeight) return;

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

    // Use user-configured default fonts from globalState instead of hardcoded values
    if (block.type === 'sfx') {
        block.style.fontFamily = globalState.defaultSfxFont || 'font-impact';
        block.style.bold = true;
        block.style.align = 'center';
        block.style.strokeColor = '#000000';
        block.style.strokeWidth = 2;
        block.style.shadowColor = '#000000';
        block.style.shadowBlur = 3;
    } else if (block.type === 'narration') {
        block.style.fontFamily = globalState.defaultNarrationFont || 'font-vietnamese';
        block.style.bold = false;
        block.style.align = 'left';
        block.style.maskShape = 'rect';
        block.style.maskSize = 'full';
        block.style.bgColor = '#ffffff';
        block.style.bgOpacity = 95;
    } else {
        block.style.fontFamily = globalState.defaultDialogueFont || 'font-comic';
        block.style.align = 'center';
    }

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
        requestOverlayRender();
        uiUpdateActiveBlockEditor();
        savePageToDB(page);
        showToast("✨ Đã tự động khớp phông chữ và màu sắc cho ô thoại!", "success");
    }
}

export function initBilingualTooltipEvents() {
    const tooltip = document.getElementById('bilingual-hover-tooltip');
    const container = elements.mangaOverlaysContainer;
    if (!tooltip || !container) return;

    container.addEventListener('mousemove', (e) => {
        if (!globalState.enableHoverTooltip) {
            tooltip.classList.add('hidden');
            return;
        }

        const overlay = e.target.closest('.bubble-overlay');
        if (overlay) {
            const orig = overlay.getAttribute('data-original');
            const trans = overlay.getAttribute('data-translated');
            if (orig && orig.trim()) {
                const origEl = document.getElementById('bilingual-tooltip-orig');
                const transEl = document.getElementById('bilingual-tooltip-trans');
                if (origEl) origEl.textContent = orig;
                if (transEl) transEl.textContent = trans || '';

                tooltip.classList.remove('hidden');

                const mouseX = e.clientX;
                const mouseY = e.clientY;
                tooltip.style.left = `${mouseX + 15}px`;
                tooltip.style.top = `${mouseY + 15}px`;
                return;
            }
        }
        tooltip.classList.add('hidden');
    });

    container.addEventListener('mouseleave', () => {
        if (tooltip) tooltip.classList.add('hidden');
    });
}

window.updateSfxRotate = updateSfxRotate;
window.updateSfxArc = updateSfxArc;
window.resetSfxAngleControls = resetSfxAngleControls;

// Window bindings for inline HTML onClick handlers
window.duplicateActiveBlock = duplicateActiveBlock;
window.toggleActiveBlockOrientation = toggleActiveBlockOrientation;
window.applyStylePreset = applyStylePreset;
window.addNewBlock = addNewBlock;
window.deleteActiveBlock = deleteActiveBlock;
window.toggleAutoFit = toggleAutoFit;
window.applyDiamondFormat = applyDiamondFormat;
window.batchDiamondBalanceAllPages = batchDiamondBalanceAllPages;
window.selectBlock = selectBlock;
window.syncActiveBlockStyle = syncActiveBlockStyle;

window.syncActiveBlockTranslation = syncActiveBlockTranslation;
window.copyBlockStyle = copyBlockStyle;
window.pasteBlockStyle = pasteBlockStyle;
window.navigateBlocks = navigateBlocks;
window.autoMatchActiveBlockStyle = autoMatchActiveBlockStyle;
window.autoMatchBlockStyle = autoMatchBlockStyle;
window.initBilingualTooltipEvents = initBilingualTooltipEvents;

