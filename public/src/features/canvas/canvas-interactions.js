import { globalState, pushStateToHistory, savePageToDB, uiUpdateActiveBlockEditor, uiUpdateSplitView } from '../../core/state.js';
import { elements } from '../../core/elements.js';
import { showToast } from '../../core/utils.js';
import { DEFAULT_VERTICAL_WRITING_MODE } from '../../config/constants.js';
import { requestOverlayRender } from './canvas-renderer.js';
import { autoFitBlock, copiedStyle } from './canvas-styling.js';
import { duplicateActiveBlock as duplicateActiveBlockLogic } from './canvas-actions.js';

export function startBlockDrag(e, block) {
    if (e.target.classList.contains('resize-handle')) return;
    if (e.target.isContentEditable || block._isEditingInline) return;

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

    if (elements.btnCopyStyle) elements.btnCopyStyle.disabled = false;
    if (elements.btnPasteStyle) elements.btnPasteStyle.disabled = !copiedStyle;

    if (globalState.viewMode === 'split') {
        uiUpdateSplitView();
    }

    updateFloatingToolbarPosition();
}

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

export function duplicateActiveBlock() {
    return duplicateActiveBlockLogic();
}

export async function deleteActiveBlock() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    const targetIdx = page.blocks.findIndex(b => b.id === globalState.selectedBlockId);

    if (targetIdx !== -1) {
        const block = page.blocks[targetIdx];
        if (block.originalBackgroundBackup) {
            const ui = await import('../../ui/block-editor-ui.js');
            await ui.restoreBackgroundForBlock(block.id);
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
        box: { x: 35, y: 40, w: 30, h: 20 },
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

export function triggerAddImageBlock() {
    if (globalState.activePageIndex === -1) {
        showToast("Vui lòng tải hoặc mở một trang trước khi chèn ảnh!", "error");
        return;
    }
    const input = document.getElementById('input-add-image-block');
    if (input) {
        input.value = '';
        input.click();
    }
}

export function handleImageBlockSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast("Tệp đã chọn không phải định dạng hình ảnh hợp lệ!", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const imageUrl = e.target.result;
        const img = new Image();
        img.onload = () => {
            if (globalState.activePageIndex === -1) return;
            const page = globalState.pages[globalState.activePageIndex];

            const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
            let w = 25;
            let h = 25 / aspect;
            if (h > 40) {
                h = 40;
                w = 40 * aspect;
            }

            const newId = `image_block_${Date.now()}`;
            const newBlock = {
                id: newId,
                type: 'image',
                imageUrl: imageUrl,
                original: '[IMAGE]',
                translated: '',
                box: {
                    x: Math.max(5, Math.min(70, Math.round((50 - w / 2) * 10) / 10)),
                    y: Math.max(5, Math.min(70, Math.round((50 - h / 2) * 10) / 10)),
                    w: Math.round(w * 10) / 10,
                    h: Math.round(h * 10) / 10
                },
                style: {
                    rotate: 0,
                    opacity: 100,
                    fit: 'contain',
                    borderRadius: 0
                }
            };

            pushStateToHistory();
            page.blocks.push(newBlock);
            selectBlock(newId);
            savePageToDB(page);
            import('./canvas-renderer.js').then(r => r.requestOverlayRender());
            showToast("Đã chèn ảnh lên trang thành công!", "success");
        };
        img.src = imageUrl;
    };
    reader.readAsDataURL(file);
}

export function triggerReplaceImageBlock() {
    const input = document.getElementById('input-replace-image-block');
    if (input) {
        input.value = '';
        input.click();
    }
}

export function handleReplaceImageBlockSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block || block.type !== 'image') return;

    const reader = new FileReader();
    reader.onload = (e) => {
        pushStateToHistory();
        block.imageUrl = e.target.result;
        savePageToDB(page);
        import('./canvas-renderer.js').then(r => r.requestOverlayRender());
        const imgPreview = document.getElementById('img-block-preview');
        if (imgPreview) imgPreview.src = block.imageUrl;
        showToast("Đã thay đổi tệp ảnh chèn!", "success");
    };
    reader.readAsDataURL(file);
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