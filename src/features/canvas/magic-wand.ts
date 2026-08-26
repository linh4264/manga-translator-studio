// Magic Wand Tool: High-Performance Automatic Speech Bubble Detection & Snapping
import type { BoundingBox } from '../../types';
import { globalState, pushStateToHistory, savePageToDB, uiUpdateActiveBlockEditor } from '../../core/state';
import { elements } from '../../core/elements';
import { showToast } from '../../core/utils';
import { detectSpeechBubbleAtPoint, detectSpeechBubbleAtPointAsync } from '../ocr/ocr-service';
import { autoFitBlock, isBlockAutoFit } from './canvas-styling';
import { selectBlock, isSpacePanPressed } from './canvas-interactions';
import { requestOverlayRender } from './canvas-renderer';

export { detectSpeechBubbleAtPoint, detectSpeechBubbleAtPointAsync };

export let isMagicWandActive = false;

export function toggleMagicWandMode(forceState?: boolean): void {
    if (forceState !== undefined) {
        isMagicWandActive = !!forceState;
    } else {
        isMagicWandActive = !isMagicWandActive;
    }

    (globalState as any).magicWandActive = isMagicWandActive;

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

export function showMagicWandPreview(box: BoundingBox | null): void {
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

export function clearMagicWandPreview(): void {
    const highlightBox = elements.magicWandHighlightBox || document.getElementById('magic-wand-highlight-box');
    if (highlightBox) {
        highlightBox.style.display = 'none';
        highlightBox.classList.add('hidden');
        highlightBox.classList.remove('active');
    }
    (globalState as any).magicWandDetectedBox = null;
}

export function getActivePageImageData(): ImageData | null {
    if (globalState.activePageIndex === -1) return null;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page) return null;

    if (page.imageDataCache) return page.imageDataCache;

    const imgElement = elements.mangaBgImage || (document.getElementById('manga-bg-image') as HTMLImageElement | null);
    if (imgElement && imgElement.naturalWidth > 0 && imgElement.naturalHeight > 0) {
        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imgElement.naturalWidth;
            tempCanvas.height = imgElement.naturalHeight;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                tempCtx.drawImage(imgElement, 0, 0);
                const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                page.imageDataCache = imgData;
                tempCanvas.width = 0;
                tempCanvas.height = 0;
                return imgData;
            }
            tempCanvas.width = 0;
            tempCanvas.height = 0;
        } catch (e) {
            console.error("Không thể trích xuất ImageData từ manga image:", e);
        }
    }
    return null;
}

export async function handleMagicWandCanvasClick(e: MouseEvent): Promise<boolean> {
    if (globalState.activePageIndex === -1) {
        showToast("Vui lòng tải hoặc mở một trang truyện trước!", "warn");
        return false;
    }

    const imgElement = elements.mangaBgImage || (document.getElementById('manga-bg-image') as HTMLImageElement | null);
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

    const result = await detectSpeechBubbleAtPointAsync(imageData, pixelX, pixelY);
    if (!result || !result.box) {
        showToast("Không tìm thấy bóng thoại rõ ràng tại vị trí này. Hãy nhấp vào vùng ruột sáng bên trong bóng thoại.", "warn");
        return false;
    }

    const detectedBox = result.box;
    (globalState as any).magicWandDetectedBox = detectedBox;
    showMagicWandPreview(detectedBox);

    const activePage = globalState.pages[globalState.activePageIndex];
    if (activePage && globalState.selectedBlockId) {
        snapBlockToMagicWandBubble(globalState.selectedBlockId, detectedBox);
        return true;
    }

    return true;
}

export function snapBlockToMagicWandBubble(blockId: string, targetBox: BoundingBox, autoAdvance: boolean = true): boolean {
    if (globalState.activePageIndex === -1 || !blockId || !targetBox) return false;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks) return false;

    const block = page.blocks.find(b => b.id === blockId);
    if (!block) return false;

    pushStateToHistory();

    block.box = {
        x: Math.round(targetBox.x * 100) / 100,
        y: Math.round(targetBox.y * 100) / 100,
        w: Math.round(targetBox.w * 100) / 100,
        h: Math.round(targetBox.h * 100) / 100
    };

    block.autoFitCache = null;
    block.maskCache = null;

    if (isBlockAutoFit(block)) {
        autoFitBlock(block);
    }

    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    savePageToDB(page);

    const blockEl = document.getElementById(block.id);
    if (blockEl) {
        blockEl.classList.remove('snap-pulse-active');
        void blockEl.offsetWidth;
        blockEl.classList.add('snap-pulse-active');
        setTimeout(() => {
            blockEl?.classList?.remove('snap-pulse-active');
        }, 800);
    }

    const curIdx = page.blocks.findIndex(b => b.id === block.id);
    if (autoAdvance && isMagicWandActive && curIdx !== -1 && curIdx < page.blocks.length - 1) {
        const nextBlock = page.blocks[curIdx + 1];
        selectBlock(nextBlock.id);
    } else {
        selectBlock(block.id);
    }

    return true;
}

export function autoSnapActiveBlockToUnderlyingBubble(): void {
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

export function autoSnapSelectedBlocksToBubbles(): void {
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

let magicWandEventsInitialized = false;

export function initMagicWandEvents(): void {
    if (magicWandEventsInitialized) return;
    const viewport = document.getElementById('workspace-viewport');
    if (!viewport) return;
    magicWandEventsInitialized = true;

    viewport.addEventListener('mousedown', (e: MouseEvent) => {
        if (isSpacePanPressed() || e.button !== 0) return;

        const target = e.target as HTMLElement;
        if (target.closest('#canvas-floating-toolbar') || target.closest('button') || target.classList.contains('resize-handle')) {
            return;
        }

        const imgElement = elements.mangaBgImage || (document.getElementById('manga-bg-image') as HTMLImageElement | null);
        if (!imgElement) return;

        const rect = imgElement.getBoundingClientRect();
        const isInImage = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
        if (!isInImage) return;

        const overlayEl = target.closest('.bubble-overlay') as HTMLElement | null;

        if (overlayEl && (e.ctrlKey || e.metaKey) && (globalState as any).magicWandDetectedBox) {
            e.preventDefault();
            e.stopPropagation();
            snapBlockToMagicWandBubble(overlayEl.id, (globalState as any).magicWandDetectedBox);
            return;
        }

        if (isMagicWandActive) {
            if (overlayEl && (globalState as any).magicWandDetectedBox && overlayEl.id !== globalState.selectedBlockId) {
                e.preventDefault();
                e.stopPropagation();
                snapBlockToMagicWandBubble(overlayEl.id, (globalState as any).magicWandDetectedBox);
                return;
            }

            e.preventDefault();
            e.stopPropagation();
            handleMagicWandCanvasClick(e);
        }
    }, true);
}
