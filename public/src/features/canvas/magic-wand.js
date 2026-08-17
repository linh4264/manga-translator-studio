// Magic Wand Tool: High-Performance Automatic Speech Bubble Detection & Snapping
import { globalState, pushStateToHistory, savePageToDB, uiUpdateActiveBlockEditor } from '../../core/state.js';
import { elements } from '../../core/elements.js';
import { showToast } from '../../core/utils.js';
import { getImageBrightnessMap, detectSpeechBubbleAtPoint } from '../ocr/ocr-service.js';
import { autoFitBlock, isBlockAutoFit } from './canvas-styling.js';
import { requestOverlayRender } from './canvas-renderer.js';
import { selectBlock } from './canvas-interactions.js';

export { detectSpeechBubbleAtPoint };

export let isMagicWandActive = false;

/**
 * Bật / tắt chế độ Gậy Ma Thuật
 */
export function toggleMagicWandMode(forceState) {
    if (forceState !== undefined) {
        isMagicWandActive = !!forceState;
    } else {
        isMagicWandActive = !isMagicWandActive;
    }

    globalState.magicWandActive = isMagicWandActive;

    const btn = elements.btnMagicWand || document.getElementById('btn-magic-wand');
    const container = elements.mangaCanvasContainer || document.getElementById('manga-canvas-container');
    const viewport = document.getElementById('workspace-viewport');

    if (isMagicWandActive) {
        if (btn) {
            btn.classList.add('bg-purple-600', 'text-white', 'border-purple-400', 'shadow-lg', 'shadow-purple-500/40');
            btn.classList.remove('bg-slate-800', 'text-slate-200');
        }
        if (container) {
            container.classList.add('magic-wand-active');
        }
        if (viewport) {
            viewport.classList.add('magic-wand-cursor');
        }
        showToast("✨ Đã bật Gậy Ma Thuật! Nhấp vào bóng thoại để khoanh viền, giữ Ctrl + click vào ô dịch để khớp vào.", "info");
    } else {
        if (btn) {
            btn.classList.remove('bg-purple-600', 'text-white', 'border-purple-400', 'shadow-lg', 'shadow-purple-500/40');
            btn.classList.add('bg-slate-800', 'text-slate-200');
        }
        if (container) {
            container.classList.remove('magic-wand-active');
        }
        if (viewport) {
            viewport.classList.remove('magic-wand-cursor');
        }
        clearMagicWandPreview();
    }
}

/**
 * Hiển thị khung viền nhận diện bóng thoại (Marching Ants / Glowing Box)
 */
export function showMagicWandPreview(box) {
    if (!box) {
        clearMagicWandPreview();
        return;
    }

    let highlightBox = elements.magicWandHighlightBox || document.getElementById('magic-wand-highlight-box');
    const container = elements.mangaCanvasContainer || document.getElementById('manga-canvas-container');

    if (!highlightBox && container) {
        highlightBox = document.createElement('div');
        highlightBox.id = 'magic-wand-highlight-box';
        highlightBox.className = 'magic-wand-contour-box';
        container.appendChild(highlightBox);
    }

    if (highlightBox) {
        highlightBox.style.position = 'absolute';
        highlightBox.style.left = `${box.x}%`;
        highlightBox.style.top = `${box.y}%`;
        highlightBox.style.width = `${box.w}%`;
        highlightBox.style.height = `${box.h}%`;
        highlightBox.style.zIndex = '9999';
        highlightBox.style.pointerEvents = 'none';
        highlightBox.style.display = 'block';
        highlightBox.classList.remove('hidden');
        highlightBox.classList.add('active');
    }
}

/**
 * Xóa khung viền nhận diện bóng thoại
 */
export function clearMagicWandPreview() {
    const highlightBox = elements.magicWandHighlightBox || document.getElementById('magic-wand-highlight-box');
    if (highlightBox) {
        highlightBox.style.display = 'none';
        highlightBox.classList.add('hidden');
        highlightBox.classList.remove('active');
    }
    globalState.magicWandDetectedBox = null;
}

/**
 * Trích xuất dữ liệu ảnh ImageData từ trang hiện tại
 */
export function getActivePageImageData() {
    if (globalState.activePageIndex === -1) return null;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page) return null;

    if (page.imageDataCache) return page.imageDataCache;

    const imgElement = elements.mangaBgImage || document.getElementById('manga-bg-image');
    if (imgElement && imgElement.naturalWidth > 0 && imgElement.naturalHeight > 0) {
        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imgElement.naturalWidth;
            tempCanvas.height = imgElement.naturalHeight;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(imgElement, 0, 0);
            const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            page.imageDataCache = imgData;
            return imgData;
        } catch (e) {
            console.error("Không thể trích xuất ImageData từ manga image:", e);
        }
    }
    return null;
}

/**
 * Xử lý sự kiện click khi công cụ Gậy Ma Thuật đang hoạt động
 */
export function handleMagicWandCanvasClick(e) {
    if (globalState.activePageIndex === -1) {
        showToast("Vui lòng tải hoặc mở một trang truyện trước!", "warn");
        return false;
    }

    const imgElement = elements.mangaBgImage || document.getElementById('manga-bg-image');
    if (!imgElement) return false;

    const imgRect = imgElement.getBoundingClientRect();
    const clickClientX = e.clientX;
    const clickClientY = e.clientY;

    if (clickClientX < imgRect.left || clickClientX > imgRect.right || clickClientY < imgRect.top || clickClientY > imgRect.bottom) {
        return false;
    }

    const relativeX = (clickClientX - imgRect.left) / imgRect.width;
    const relativeY = (clickClientY - imgRect.top) / imgRect.height;

    const naturalWidth = imgElement.naturalWidth || imgRect.width;
    const naturalHeight = imgElement.naturalHeight || imgRect.height;

    const pixelX = relativeX * naturalWidth;
    const pixelY = relativeY * naturalHeight;

    const imageData = getActivePageImageData();
    if (!imageData) {
        showToast("Đang xử lý ảnh, vui lòng thử lại...", "warn");
        return false;
    }

    // Nhận diện bóng thoại tại điểm click
    const result = detectSpeechBubbleAtPoint(imageData, pixelX, pixelY);
    if (!result || !result.box) {
        showToast("Không tìm thấy bóng thoại rõ ràng tại vị trí này. Hãy nhấp vào vùng ruột sáng bên trong bóng thoại.", "warn");
        return false;
    }

    const detectedBox = result.box;
    globalState.magicWandDetectedBox = detectedBox;
    showMagicWandPreview(detectedBox);

    const activePage = globalState.pages[globalState.activePageIndex];
    if (activePage && globalState.selectedBlockId) {
        // Tự động snap ô dịch đang chọn vào bóng thoại vừa nhấp
        snapBlockToMagicWandBubble(globalState.selectedBlockId, detectedBox);
        return true;
    }

    return true;
}

/**
 * Khớp ô dịch (Block) vào vị trí và kích thước của bóng thoại được nhận diện
 */
export function snapBlockToMagicWandBubble(blockId, targetBox, autoAdvance = true) {
    if (globalState.activePageIndex === -1 || !blockId || !targetBox) return false;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks) return false;

    const block = page.blocks.find(b => b.id === blockId);
    if (!block) return false;

    pushStateToHistory();

    // Cập nhật vị trí & kích thước khớp khít theo bóng thoại từ Gậy Ma Thuật
    block.box = {
        x: Math.round(targetBox.x * 100) / 100,
        y: Math.round(targetBox.y * 100) / 100,
        w: Math.round(targetBox.w * 100) / 100,
        h: Math.round(targetBox.h * 100) / 100
    };

    block.autoFitCache = null;
    block.maskCache = null;

    // Tự động điều chỉnh cỡ chữ (Auto-Fit)
    if (isBlockAutoFit(block)) {
        autoFitBlock(block);
    }

    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    savePageToDB(page);

    // Hiệu ứng nhấp nháy phát sáng (Pulse Snap Feedback) trên ô dịch vừa khớp
    const blockEl = document.getElementById(block.id);
    if (blockEl) {
        blockEl.classList.remove('snap-pulse-active');
        void blockEl.offsetWidth; // Trigger reflow
        blockEl.classList.add('snap-pulse-active');
        setTimeout(() => {
            blockEl?.classList?.remove('snap-pulse-active');
        }, 800);
    }

    // Tự động chuyển tiêu điểm sang ô thoại tiếp theo trên trang (Sequential Snapping Workflow)
    const curIdx = page.blocks.findIndex(b => b.id === block.id);
    if (autoAdvance && isMagicWandActive && curIdx !== -1 && curIdx < page.blocks.length - 1) {
        const nextBlock = page.blocks[curIdx + 1];
        selectBlock(nextBlock.id);
    } else {
        selectBlock(block.id);
    }

    return true;
}

/**
 * Tự động khớp ô dịch đang chọn vào bóng thoại gốc ngay bên dưới nó (1-chạm)
 */
export function autoSnapActiveBlockToUnderlyingBubble() {
    if (globalState.activePageIndex === -1 || !globalState.selectedBlockId) {
        showToast("Vui lòng chọn một ô dịch trước khi dùng tính năng khớp bóng thoại!", "warn");
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    if (!page) return;

    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block || !block.box) return;

    const imageData = getActivePageImageData();
    if (!imageData) {
        showToast("Đang chuẩn bị dữ liệu ảnh...", "warn");
        return;
    }

    const imgW = imageData.width;
    const imgH = imageData.height;

    const centerX = (block.box.x + block.box.w / 2) * (imgW / 100);
    const centerY = (block.box.y + block.box.h / 2) * (imgH / 100);

    const result = detectSpeechBubbleAtPoint(imageData, centerX, centerY);
    if (result && result.box) {
        snapBlockToMagicWandBubble(block.id, result.box, false);
    } else {
        showToast("Không tìm thấy bóng thoại rõ ràng bên dưới ô dịch này.", "warn");
    }
}

/**
 * Tự động khớp toàn bộ các ô đang được chọn vào bóng thoại gốc tương ứng
 */
export function autoSnapSelectedBlocksToBubbles() {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks) return;

    const targetIds = (globalState.selectedBlockIds && globalState.selectedBlockIds.length > 0)
        ? globalState.selectedBlockIds
        : (globalState.selectedBlockId ? [globalState.selectedBlockId] : []);

    if (targetIds.length === 0) {
        showToast("Vui lòng chọn các ô thoại muốn khớp!", "warn");
        return;
    }

    const imageData = getActivePageImageData();
    if (!imageData) {
        showToast("Đang chuẩn bị dữ liệu ảnh...", "warn");
        return;
    }

    pushStateToHistory();

    const imgW = imageData.width;
    const imgH = imageData.height;
    let snappedCount = 0;

    targetIds.forEach(id => {
        const block = page.blocks.find(b => b.id === id);
        if (!block || !block.box) return;

        const centerX = (block.box.x + block.box.w / 2) * (imgW / 100);
        const centerY = (block.box.y + block.box.h / 2) * (imgH / 100);

        const result = detectSpeechBubbleAtPoint(imageData, centerX, centerY);
        if (result && result.box) {
            block.box = {
                x: Math.round(result.box.x * 100) / 100,
                y: Math.round(result.box.y * 100) / 100,
                w: Math.round(result.box.w * 100) / 100,
                h: Math.round(result.box.h * 100) / 100
            };
            block.autoFitCache = null;
            block.maskCache = null;
            if (isBlockAutoFit(block)) {
                autoFitBlock(block);
            }
            snappedCount++;
        }
    });

    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    savePageToDB(page);

    showToast(`🎯 Đã khớp ${snappedCount}/${targetIds.length} ô thoại được chọn vào bóng thoại gốc!`, 'success');
}

/**
 * Khởi tạo lắng nghe sự kiện click trên Canvas cho Gậy Ma Thuật với cơ chế bắt sự kiện Capture
 */
export function initMagicWandEvents() {
    const viewport = document.getElementById('workspace-viewport');
    if (!viewport) return;

    viewport.addEventListener('mousedown', (e) => {
        if (window.__isSpacePanPressed || e.button !== 0) return;

        // Tránh trigger khi click vào floating toolbar, modals hoặc resize handles
        if (e.target.closest('#canvas-floating-toolbar') || e.target.closest('button') || e.target.classList.contains('resize-handle')) {
            return;
        }

        const imgElement = elements.mangaBgImage || document.getElementById('manga-bg-image');
        if (!imgElement) return;

        const rect = imgElement.getBoundingClientRect();
        const isInImage = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
        if (!isInImage) return;

        const overlayEl = e.target.closest('.bubble-overlay');

        // TRƯỜNG HỢP 1: Giữ phím Ctrl + Click vào ô dịch (khi đã có bóng thoại được khoanh)
        if (overlayEl && (e.ctrlKey || e.metaKey) && globalState.magicWandDetectedBox) {
            e.preventDefault();
            e.stopPropagation();
            snapBlockToMagicWandBubble(overlayEl.id, globalState.magicWandDetectedBox);
            return;
        }

        // TRƯỜNG HỢP 2: Chế độ Gậy Ma Thuật đang BẬT
        if (isMagicWandActive) {
            // Nếu đã khoanh sẵn bóng thoại và click vào 1 ô dịch khác -> snap vào bóng thoại đó!
            if (overlayEl && globalState.magicWandDetectedBox && overlayEl.id !== globalState.selectedBlockId) {
                e.preventDefault();
                e.stopPropagation();
                snapBlockToMagicWandBubble(overlayEl.id, globalState.magicWandDetectedBox);
                return;
            }

            e.preventDefault();
            e.stopPropagation();
            handleMagicWandCanvasClick(e);
        }
    }, true); // Capture phase để luôn bắt được sự kiện trước các layer con
}
