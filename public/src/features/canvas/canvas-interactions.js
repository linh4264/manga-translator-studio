import { globalState, pushStateToHistory, savePageToDB, uiUpdateActiveBlockEditor, uiUpdateSplitView } from '../../core/state.js';
import { elements } from '../../core/elements.js';
import { showToast } from '../../core/utils.js';
import { DEFAULT_VERTICAL_WRITING_MODE } from '../../config/constants.js';
import { requestOverlayRender } from './canvas-renderer.js';
import { autoFitBlock, isBlockAutoFit, copiedStyle } from './canvas-styling.js';
import { duplicateActiveBlock as duplicateActiveBlockLogic } from './canvas-actions.js';

export function startBlockDrag(e, block) {
    if (window.__isSpacePanPressed || e.button === 1) return;
    if (e.target.classList.contains('resize-handle')) return;
    if (e.target.isContentEditable || block._isEditingInline) return;

    e.preventDefault();
    pushStateToHistory();

    const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
    selectBlock(block.id, isMulti);

    const activePage = globalState.pages[globalState.activePageIndex];
    const isGroupDrag = activePage && globalState.selectedBlockIds && globalState.selectedBlockIds.length > 1 && globalState.selectedBlockIds.includes(block.id);

    const groupStartCoords = isGroupDrag
        ? globalState.selectedBlockIds.map(id => {
            const b = activePage.blocks.find(bk => bk.id === id);
            return { id, x: b?.box?.x || 0, y: b?.box?.y || 0, w: b?.box?.w || 0, h: b?.box?.h || 0 };
        })
        : [];

    const isTouch = e.type.startsWith('touch');
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;

    const startX = clientX;
    const startY = clientY;

    const startPercentX = block.box.x;
    const startPercentY = block.box.y;

    const containerWidth = elements.mangaCanvasContainer?.clientWidth || 1;
    const containerHeight = elements.mangaCanvasContainer?.clientHeight || 1;

    let hasMoved = false;

    function onDragging(moveEvent) {
        hasMoved = true;
        const curTouch = moveEvent.type.startsWith('touch');
        const curX = curTouch ? moveEvent.touches[0].clientX : moveEvent.clientX;
        const curY = curTouch ? moveEvent.touches[0].clientY : moveEvent.clientY;

        const deltaX = curX - startX;
        const deltaY = curY - startY;

        const deltaPercentX = (deltaX / containerWidth) * 100;
        const deltaPercentY = (deltaY / containerHeight) * 100;

        if (isGroupDrag && activePage) {
            groupStartCoords.forEach(item => {
                const b = activePage.blocks.find(bk => bk.id === item.id);
                if (b && b.box) {
                    b.box.x = Math.max(0, Math.min(100 - item.w, item.x + deltaPercentX));
                    b.box.y = Math.max(0, Math.min(100 - item.h, item.y + deltaPercentY));
                    const elem = document.getElementById(item.id);
                    if (elem) {
                        elem.style.left = `${b.box.x}%`;
                        elem.style.top = `${b.box.y}%`;
                    }
                    const coverEl = document.getElementById(`cover-${item.id}`);
                    if (coverEl) {
                        coverEl.style.left = `${b.box.x}%`;
                        coverEl.style.top = `${b.box.y}%`;
                    }
                    const mirrorCoverEl = document.getElementById(`mirror-cover-${item.id}`);
                    if (mirrorCoverEl) {
                        mirrorCoverEl.style.left = `${b.box.x}%`;
                        mirrorCoverEl.style.top = `${b.box.y}%`;
                    }
                }
            });
        } else {
            block.box.x = Math.max(0, Math.min(100 - block.box.w, startPercentX + deltaPercentX));
            block.box.y = Math.max(0, Math.min(100 - block.box.h, startPercentY + deltaPercentY));

            const blockElem = document.getElementById(block.id);
            if (blockElem) {
                blockElem.style.left = `${block.box.x}%`;
                blockElem.style.top = `${block.box.y}%`;
            }
            const coverEl = document.getElementById(`cover-${block.id}`);
            if (coverEl) {
                coverEl.style.left = `${block.box.x}%`;
                coverEl.style.top = `${block.box.y}%`;
            }
            const mirrorCoverEl = document.getElementById(`mirror-cover-${block.id}`);
            if (mirrorCoverEl) {
                mirrorCoverEl.style.left = `${block.box.x}%`;
                mirrorCoverEl.style.top = `${block.box.y}%`;
            }
        }

        updateFloatingToolbarPosition();
    }

    function onDragEnd() {
        document.removeEventListener('mousemove', onDragging);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchmove', onDragging);
        document.removeEventListener('touchend', onDragEnd);

        if (hasMoved) {
            block.maskCache = null;
            requestOverlayRender();

            const activePage = globalState.pages[globalState.activePageIndex];
            if (activePage) savePageToDB(activePage);
        }
    }

    document.addEventListener('mousemove', onDragging);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchmove', onDragging, { passive: false });
    document.addEventListener('touchend', onDragEnd);
}

export function startBlockResize(e, block, handleDir) {
    if (window.__isSpacePanPressed || e.button === 1) return;
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
        }
        const coverEl = document.getElementById(`cover-${block.id}`);
        if (coverEl) {
            coverEl.style.left = `${block.box.x}%`;
            coverEl.style.top = `${block.box.y}%`;
            coverEl.style.width = `${block.box.w}%`;
            coverEl.style.height = `${block.box.h}%`;
        }
        const mirrorCoverEl = document.getElementById(`mirror-cover-${block.id}`);
        if (mirrorCoverEl) {
            mirrorCoverEl.style.left = `${block.box.x}%`;
            mirrorCoverEl.style.top = `${block.box.y}%`;
            mirrorCoverEl.style.width = `${block.box.w}%`;
            mirrorCoverEl.style.height = `${block.box.h}%`;
        }

        updateFloatingToolbarPosition();

        if (isBlockAutoFit(block)) {
            if (!resizeRafId) {
                resizeRafId = requestAnimationFrame(() => {
                    resizeRafId = null;
                    block.autoFitCache = null;
                    autoFitBlock(block);
                    const zoomScale = (globalState.zoom || 100) / 100;
                    const maskElem = blockElem?.firstElementChild;
                    if (maskElem) {
                        maskElem.style.fontSize = `${(block.style.fontSize || 16) * zoomScale}px`;
                    }
                    if (elements.lblFontSize) elements.lblFontSize.innerText = `${block.style.fontSize}px (Auto)`;
                    if (elements.styleFontSize) elements.styleFontSize.value = block.style.fontSize;
                });
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

export function updateBlockSelectionDOM() {
    if (!globalState.selectedBlockIds) globalState.selectedBlockIds = [];
    const overlays = document.querySelectorAll('.bubble-overlay');
    overlays.forEach(el => {
        if (globalState.selectedBlockIds.includes(el.id)) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
}

export function selectBlock(blockId, isMultiSelect = false) {
    if (!globalState.selectedBlockIds) globalState.selectedBlockIds = [];

    if (!blockId) {
        globalState.selectedBlockIds = [];
        globalState.selectedBlockId = null;
    } else if (isMultiSelect) {
        const idx = globalState.selectedBlockIds.indexOf(blockId);
        if (idx !== -1 && globalState.selectedBlockIds.length > 1) {
            globalState.selectedBlockIds.splice(idx, 1);
        } else if (idx === -1) {
            globalState.selectedBlockIds.push(blockId);
        }
        globalState.selectedBlockId = globalState.selectedBlockIds.length > 0
            ? globalState.selectedBlockIds[globalState.selectedBlockIds.length - 1]
            : null;
    } else {
        globalState.selectedBlockIds = [blockId];
        globalState.selectedBlockId = blockId;
    }

    updateBlockSelectionDOM();
    uiUpdateActiveBlockEditor();

    if (elements.btnCopyStyle) elements.btnCopyStyle.disabled = !globalState.selectedBlockId;
    if (elements.btnPasteStyle) elements.btnPasteStyle.disabled = !copiedStyle || !globalState.selectedBlockId;

    if (globalState.viewMode === 'split') {
        uiUpdateSplitView();
    }

    updateFloatingToolbarPosition();
}

export function selectAllBlocksOnPage() {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks || page.blocks.length === 0) return;

    globalState.selectedBlockIds = page.blocks.map(b => b.id);
    globalState.selectedBlockId = page.blocks[page.blocks.length - 1].id;

    updateBlockSelectionDOM();
    uiUpdateActiveBlockEditor();
    updateFloatingToolbarPosition();
    showToast(`Đã chọn tất cả ${page.blocks.length} ô thoại trên trang.`, 'info');
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
    if (!block || !block.box) {
        if (elements.canvasFloatingToolbar) elements.canvasFloatingToolbar.classList.add('hidden');
        return;
    }

    if (elements.lblFloatingDir) {
        elements.lblFloatingDir.textContent = block.style?.vertical ? 'Ngang' : 'Dọc';
    }

    const topPos = block.box.y > 12 ? (block.box.y - 6) : (block.box.y + (block.box.h || 0) + 2);
    const leftPos = Math.max(12, Math.min(88, block.box.x + ((block.box.w || 0) / 2)));

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
            fontFamily: globalState.defaultFont || globalState.globalStyle?.fontFamily || 'font-manga',
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

    if (globalState.viewMode === 'original') {
        globalState.viewMode = 'overlay';
    }

    import('./canvas-renderer.js').then(r => {
        r.renderOverlays();
        selectBlock(newId);
        savePageToDB(page);
    });

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