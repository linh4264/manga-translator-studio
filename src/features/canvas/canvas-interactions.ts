import { globalState, pushStateToHistory, savePageToDB, uiUpdateActiveBlockEditor, uiUpdateSplitView } from '../../core/state';
import { elements } from '../../core/elements';
import { DEFAULT_VERTICAL_WRITING_MODE, DEFAULT_BLOCK_SIZE_PX } from '../../config/constants';
import { requestOverlayRender, balanceTextToDiamond, balanceSingleParagraphToBox, balanceTextToBox } from './canvas-renderer';
import { autoFitBlock, isBlockAutoFit, copiedStyle } from './canvas-styling';
import { showToast, setMultilineText } from '../../core/utils';
import { MangaBlock, BlockStyle } from '../../types/index';

let spacePanActive = false;
export function isSpacePanPressed(): boolean {
    return spacePanActive;
}
export function setSpacePanPressed(pressed: boolean): void {
    spacePanActive = pressed;
}

export function startBlockDrag(e: any, block: MangaBlock): void {
    if (isSpacePanPressed() || e.button === 1) return;
    if (e.target.classList.contains('resize-handle')) return;
    if (e.target.isContentEditable || (block as any)._isEditingInline) return;

    if ((e.ctrlKey || e.metaKey) && (globalState as any).magicWandDetectedBox) {
        e.preventDefault();
        e.stopPropagation();
        import('./magic-wand').then(m => {
            m.snapBlockToMagicWandBubble(block.id, (globalState as any).magicWandDetectedBox);
        });
        return;
    }

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

    function onDragging(moveEvent: any) {
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
            const targetX = Math.max(0, Math.min(100 - block.box.w, startPercentX + deltaPercentX));
            const targetY = Math.max(0, Math.min(100 - block.box.h, startPercentY + deltaPercentY));

            block.box.x = targetX;
            block.box.y = targetY;

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
        document.removeEventListener('touchcancel', onDragEnd);

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
    document.addEventListener('touchcancel', onDragEnd);
}

export function startBlockResize(e: any, block: MangaBlock, handleDir: string): void {
    if (isSpacePanPressed() || e.button === 1) return;
    e.stopPropagation();
    e.preventDefault();
    pushStateToHistory();

    const isTouch = e.type.startsWith('touch');
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;

    const startX = clientX;
    const startY = clientY;

    const startBox = { ...block.box };

    const containerWidth = elements.mangaCanvasContainer?.clientWidth || 1;
    const containerHeight = elements.mangaCanvasContainer?.clientHeight || 1;

    let resizeRafId: number | null = null;

    function onResizing(moveEvent: any) {
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

        if (!resizeRafId) {
            resizeRafId = requestAnimationFrame(() => {
                resizeRafId = null;
                block.autoFitCache = null;
                const activePage = globalState.pages[globalState.activePageIndex];
                const imgEl = elements.mangaBgImage;
                const W = (activePage?.imageDataCache?.width) || (imgEl && imgEl.naturalWidth > 0 ? imgEl.naturalWidth : (elements.mangaCanvas?.width || 800));
                const H = (activePage?.imageDataCache?.height) || (imgEl && imgEl.naturalHeight > 0 ? imgEl.naturalHeight : (elements.mangaCanvas?.height || 1200));
                const pixelW = (block.box.w / 100) * W;
                const pixelH = (block.box.h / 100) * H;

                if (block.translated && !block.style?.vertical && block.type !== 'sfx') {
                    if (block.style?.diamondWrap) {
                        const cleanText = block.translated.replace(/\r\n/g, ' ').replace(/\n+/g, ' ').trim();
                        block.translated = balanceTextToDiamond(cleanText, pixelW, pixelH, block.style);
                    } else {
                        block.translated = balanceTextToBox(block.translated, pixelW, pixelH, block.style);
                    }
                }
                if (isBlockAutoFit(block)) {
                    autoFitBlock(block, null, 1, null, false);
                    const zoomScale = (globalState.zoom || 100) / 100;
                    const maskElem = blockElem?.firstElementChild as HTMLElement | null;
                    if (maskElem) {
                        maskElem.style.fontSize = `${(block.style.fontSize || 17) * zoomScale}px`;
                    }
                    if (elements.lblFontSize) elements.lblFontSize.innerText = `${block.style.fontSize}px (Auto)`;
                    if (elements.styleFontSize) elements.styleFontSize.value = String(block.style.fontSize || 17);
                }
                const maskElem = blockElem?.firstElementChild as HTMLElement | null;
                const textContainer = maskElem?.firstElementChild as HTMLElement | null;
                if (textContainer) {
                    const zoomScale = (globalState.zoom || 100) / 100;
                    const warpOpts = {
                        arcAngle: block.style?.arcAngle || 0,
                        skewX: block.style?.skewX || 0,
                        skewY: block.style?.skewY || 0,
                        warpWave: block.style?.warpWave || 0,
                        warpBulge: block.style?.warpBulge || 0,
                        textTransform: block.style?.textTransform || 'none',
                        letterSpacing: (block.style?.letterSpacing || 0) * zoomScale,
                        underline: !!block.style?.underline
                    };
                    setMultilineText(textContainer, block.translated, warpOpts);
                }
            });
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
        document.removeEventListener('touchcancel', onResizeEnd);

        block.maskCache = null;
        block.autoFitCache = null;
        if (block.translated && !block.style?.vertical && block.type !== 'sfx') {
            const activePage = globalState.pages[globalState.activePageIndex];
            const imgEl = elements.mangaBgImage;
            const W = (activePage?.imageDataCache?.width) || (imgEl && imgEl.naturalWidth > 0 ? imgEl.naturalWidth : (elements.mangaCanvas?.width || 800));
            const H = (activePage?.imageDataCache?.height) || (imgEl && imgEl.naturalHeight > 0 ? imgEl.naturalHeight : (elements.mangaCanvas?.height || 1200));
            const pixelW = (block.box.w / 100) * W;
            const pixelH = (block.box.h / 100) * H;
            if (block.style?.diamondWrap) {
                const cleanText = block.translated.replace(/\r\n/g, ' ').replace(/\n+/g, ' ').trim();
                block.translated = balanceTextToDiamond(cleanText, pixelW, pixelH, block.style);
            } else {
                block.translated = balanceTextToBox(block.translated, pixelW, pixelH, block.style);
            }
            if (elements.editTranslatedText && block.id === globalState.selectedBlockId) {
                elements.editTranslatedText.value = block.translated;
            }
        }
        if (isBlockAutoFit(block)) {
            autoFitBlock(block);
        }
        requestOverlayRender();
        uiUpdateActiveBlockEditor();

        const activePage = globalState.pages[globalState.activePageIndex];
        if (activePage) savePageToDB(activePage);
    }

    document.addEventListener('mousemove', onResizing);
    document.addEventListener('mouseup', onResizeEnd);
    document.addEventListener('touchmove', onResizing, { passive: false });
    document.addEventListener('touchend', onResizeEnd);
    document.addEventListener('touchcancel', onResizeEnd);
}

export function updateBlockSelectionDOM(): void {
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

export function selectBlock(blockId: string | null, isMultiSelect: boolean = false): void {
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

export function selectAllBlocksOnPage(): void {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks || page.blocks.length === 0) return;

    globalState.selectedBlockIds = page.blocks.map(b => b.id);
    globalState.selectedBlockId = page.blocks[page.blocks.length - 1].id;

    updateBlockSelectionDOM();
    uiUpdateActiveBlockEditor();
    updateFloatingToolbarPosition();
}

export function navigateBlocks(direction: number): void {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || page.blocks.length === 0) return;

    const currentIndex = page.blocks.findIndex(b => b.id === globalState.selectedBlockId);

    let nextIndex: number;
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

export function updateFloatingToolbarPosition(): void {
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

    const topPos = block.box.y > 12 ? (block.box.y - 6) : (block.box.y + (block.box.h || 0) + 2);
    const leftPos = Math.max(12, Math.min(88, block.box.x + ((block.box.w || 0) / 2)));

    elements.canvasFloatingToolbar.style.top = `${topPos}%`;
    elements.canvasFloatingToolbar.style.left = `${leftPos}%`;
    elements.canvasFloatingToolbar.classList.remove('hidden');

    const multiBadge = document.getElementById('floating-toolbar-multi-badge');
    if (multiBadge) {
        if (globalState.selectedBlockIds && globalState.selectedBlockIds.length > 1) {
            multiBadge.textContent = `${globalState.selectedBlockIds.length} ô`;
            multiBadge.classList.remove('hidden');
        } else {
            multiBadge.classList.add('hidden');
        }
    }
}

export async function deleteActiveBlock(): Promise<void> {
    if (globalState.activePageIndex === -1) return;

    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !page.blocks || page.blocks.length === 0) return;

    const targetIds = (globalState.selectedBlockIds && globalState.selectedBlockIds.length > 0)
        ? [...globalState.selectedBlockIds]
        : (globalState.selectedBlockId ? [globalState.selectedBlockId] : []);

    if (targetIds.length === 0) return;

    pushStateToHistory();

    const ui = await import('../../ui/block-editor-ui');
    for (const id of targetIds) {
        const idx = page.blocks.findIndex(b => b.id === id);
        if (idx !== -1) {
            const block = page.blocks[idx];
            if (block.originalBackgroundBackup) {
                await ui.restoreBackgroundForBlock(block.id);
            }
            page.blocks.splice(idx, 1);
        }
    }

    globalState.selectedBlockId = null;
    globalState.selectedBlockIds = [];
    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    savePageToDB(page);
    if (targetIds.length > 1) {
        showToast(`Đã xóa ${targetIds.length} ô thoại.`, "info");
    }
}

export function addNewBlock(): void {
    if (globalState.activePageIndex === -1) {
        showToast("Vui lòng tải hoặc mở một trang trước khi tạo ô thoại!", "error");
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    if (!page) return;
    const newId = `manual_block_${Date.now()}`;

    const imgElement = elements.mangaBgImage;
    const imgW = (imgElement && imgElement.naturalWidth > 0) ? imgElement.naturalWidth : 1000;
    const imgH = (imgElement && imgElement.naturalHeight > 0) ? imgElement.naturalHeight : 1000;
    const wPct = Math.round(((DEFAULT_BLOCK_SIZE_PX / imgW) * 100) * 100) / 100;
    const hPct = Math.round(((DEFAULT_BLOCK_SIZE_PX / imgH) * 100) * 100) / 100;
    const xPct = Math.max(0, Math.min(100 - wPct, Math.round((50 - wPct / 2) * 100) / 100));
    const yPct = Math.max(0, Math.min(100 - hPct, Math.round((50 - hPct / 2) * 100) / 100));

    const newBlock: MangaBlock = {
        id: newId,
        type: 'dialogue',
        original: '',
        translated: 'Nhập nội dung dịch...',
        box: { x: xPct, y: yPct, w: wPct, h: hPct },
        style: {
            ...(globalState.globalStyle || {}),
            fontFamily: globalState.defaultFont || globalState.globalStyle?.fontFamily || 'font-manga',
            vertical: DEFAULT_VERTICAL_WRITING_MODE
        } as BlockStyle
    };

    pushStateToHistory();
    page.blocks.push(newBlock);

    if (globalState.viewMode === 'original') {
        globalState.viewMode = 'overlay';
    }

    import('./canvas-renderer').then(r => {
        r.renderOverlays();
        selectBlock(newId);
        savePageToDB(page);
    });
}

export function triggerAddImageBlock(): void {
    if (globalState.activePageIndex === -1) {
        showToast("Vui lòng tải hoặc mở một trang trước khi chèn ảnh!", "error");
        return;
    }
    const input = document.getElementById('input-add-image-block') as HTMLInputElement | null;
    if (input) {
        input.value = '';
        input.click();
    }
}

export function handleImageBlockSelect(event: any): void {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast("Tệp đã chọn không phải định dạng hình ảnh hợp lệ!", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e: any) => {
        const imageUrl = e.target.result;
        const img = new Image();
        img.onload = () => {
            if (globalState.activePageIndex === -1) return;
            const page = globalState.pages[globalState.activePageIndex];
            if (!page) return;

            const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
            let w = 25;
            let h = 25 / aspect;
            if (h > 40) {
                h = 40;
                w = 40 * aspect;
            }

            const newId = `image_block_${Date.now()}`;
            const newBlock: MangaBlock = {
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
                } as any as BlockStyle
            };

            pushStateToHistory();
            page.blocks.push(newBlock);
            selectBlock(newId);
            savePageToDB(page);
            import('./canvas-renderer').then(r => r.requestOverlayRender());
            showToast("Đã chèn ảnh lên trang thành công!", "success");
        };
        img.src = imageUrl;
    };
    reader.readAsDataURL(file);
}

export function triggerReplaceImageBlock(): void {
    const input = document.getElementById('input-replace-image-block') as HTMLInputElement | null;
    if (input) {
        input.value = '';
        input.click();
    }
}

export function handleReplaceImageBlockSelect(event: any): void {
    const file = event.target.files?.[0];
    if (!file) return;

    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page) return;
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block || block.type !== 'image') return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
        pushStateToHistory();
        block.imageUrl = e.target.result;
        savePageToDB(page);
        import('./canvas-renderer').then(r => r.requestOverlayRender());
        const imgPreview = document.getElementById('img-block-preview') as HTMLImageElement | null;
        if (imgPreview) imgPreview.src = block.imageUrl || '';
        showToast("Đã thay đổi tệp ảnh chèn!", "success");
    };
    reader.readAsDataURL(file);
}

let bilingualTooltipInitialized = false;

export function initBilingualTooltipEvents(): void {
    if (bilingualTooltipInitialized) return;
    const tooltip = document.getElementById('bilingual-hover-tooltip');
    const container = elements.mangaOverlaysContainer;
    if (!tooltip || !container) return;
    bilingualTooltipInitialized = true;

    container.addEventListener('mousemove', (e: MouseEvent) => {
        if (!globalState.enableHoverTooltip) {
            tooltip.classList.add('hidden');
            return;
        }

        const overlay = (e.target as HTMLElement).closest('.bubble-overlay');
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

let marqueeSelectionInitialized = false;

export function initMarqueeSelection(): void {
    if (marqueeSelectionInitialized) return;
    const container = elements.mangaCanvasContainer || document.getElementById('manga-canvas-container');
    const viewport = document.getElementById('workspace-viewport');
    if (!container || !viewport) return;
    marqueeSelectionInitialized = true;

    let isMarquee = false;
    let startClientX = 0;
    let startClientY = 0;
    let marqueeBox = document.getElementById('canvas-marquee-box');

    if (!marqueeBox) {
        marqueeBox = document.createElement('div');
        marqueeBox.id = 'canvas-marquee-box';
        marqueeBox.className = 'canvas-marquee-box hidden';
        container.appendChild(marqueeBox);
    }

    viewport.addEventListener('mousedown', (e: MouseEvent) => {
        if (isSpacePanPressed() || e.button !== 0) return;
        if ((globalState as any).magicWandActive) return;

        const target = e.target as HTMLElement;
        if (target.closest('.bubble-overlay') || target.closest('#canvas-floating-toolbar') || target.closest('button') || target.classList.contains('resize-handle')) {
            return;
        }

        const imgElement = elements.mangaBgImage || (document.getElementById('manga-bg-image') as HTMLImageElement | null);
        if (!imgElement) return;

        const imgRect = imgElement.getBoundingClientRect();
        if (e.clientX < imgRect.left || e.clientX > imgRect.right || e.clientY < imgRect.top || e.clientY > imgRect.bottom) {
            return;
        }

        isMarquee = true;
        startClientX = e.clientX;
        startClientY = e.clientY;

        const relStartX = ((startClientX - imgRect.left) / imgRect.width) * 100;
        const relStartY = ((startClientY - imgRect.top) / imgRect.height) * 100;

        if (marqueeBox) {
            marqueeBox.style.left = `${relStartX}%`;
            marqueeBox.style.top = `${relStartY}%`;
            marqueeBox.style.width = '0%';
            marqueeBox.style.height = '0%';
            marqueeBox.classList.remove('hidden');
        }

        function onMarqueeMove(moveEvent: MouseEvent) {
            if (!isMarquee || !marqueeBox) return;
            const curClientX = moveEvent.clientX;
            const curClientY = moveEvent.clientY;

            const minClientX = Math.min(startClientX, curClientX);
            const maxClientX = Math.max(startClientX, curClientX);
            const minClientY = Math.min(startClientY, curClientY);
            const maxClientY = Math.max(startClientY, curClientY);

            const mPctX = ((minClientX - imgRect.left) / imgRect.width) * 100;
            const mPctY = ((minClientY - imgRect.top) / imgRect.height) * 100;
            const mPctW = ((maxClientX - minClientX) / imgRect.width) * 100;
            const mPctH = ((maxClientY - minClientY) / imgRect.height) * 100;

            marqueeBox.style.left = `${Math.max(0, mPctX)}%`;
            marqueeBox.style.top = `${Math.max(0, mPctY)}%`;
            marqueeBox.style.width = `${Math.min(100 - mPctX, mPctW)}%`;
            marqueeBox.style.height = `${Math.min(100 - mPctY, mPctH)}%`;
        }

        function onMarqueeEnd(endEvent: MouseEvent) {
            if (!isMarquee) return;
            isMarquee = false;
            if (marqueeBox) marqueeBox.classList.add('hidden');

            window.removeEventListener('mousemove', onMarqueeMove);
            window.removeEventListener('mouseup', onMarqueeEnd);

            const curClientX = endEvent.clientX;
            const curClientY = endEvent.clientY;

            const minClientX = Math.min(startClientX, curClientX);
            const maxClientX = Math.max(startClientX, curClientX);
            const minClientY = Math.min(startClientY, curClientY);
            const maxClientY = Math.max(startClientY, curClientY);

            if (maxClientX - minClientX < 8 && maxClientY - minClientY < 8) {
                if (!endEvent.shiftKey && !endEvent.ctrlKey) {
                    selectBlock(null);
                }
                return;
            }

            const selMinX = ((minClientX - imgRect.left) / imgRect.width) * 100;
            const selMaxX = ((maxClientX - imgRect.left) / imgRect.width) * 100;
            const selMinY = ((minClientY - imgRect.top) / imgRect.height) * 100;
            const selMaxY = ((maxClientY - imgRect.top) / imgRect.height) * 100;

            const page = globalState.pages[globalState.activePageIndex];
            if (!page || !page.blocks) return;

            const matchedIds: string[] = [];
            page.blocks.forEach(b => {
                if (!b.box) return;
                const bMinX = b.box.x;
                const bMaxX = b.box.x + b.box.w;
                const bMinY = b.box.y;
                const bMaxY = b.box.y + b.box.h;

                const isOverlap = !(bMaxX < selMinX || bMinX > selMaxX || bMaxY < selMinY || bMinY > selMaxY);
                if (isOverlap) {
                    matchedIds.push(b.id);
                }
            });

            if (matchedIds.length > 0) {
                globalState.selectedBlockIds = matchedIds;
                globalState.selectedBlockId = matchedIds[matchedIds.length - 1];
                updateBlockSelectionDOM();
                uiUpdateActiveBlockEditor();
                updateFloatingToolbarPosition();
            } else if (endEvent.altKey && (selMaxX - selMinX > 2) && (selMaxY - selMinY > 2)) {
                const newId = `manual_block_${Date.now()}`;
                const imgElement = elements.mangaBgImage;
                const imgW = (imgElement && imgElement.naturalWidth > 0) ? imgElement.naturalWidth : 1000;
                const imgH = (imgElement && imgElement.naturalHeight > 0) ? imgElement.naturalHeight : 1000;
                const wPct = Math.round(((DEFAULT_BLOCK_SIZE_PX / imgW) * 100) * 100) / 100;
                const hPct = Math.round(((DEFAULT_BLOCK_SIZE_PX / imgH) * 100) * 100) / 100;
                const newBlock: MangaBlock = {
                    id: newId,
                    type: 'dialogue',
                    original: '',
                    translated: 'Nhập nội dung dịch...',
                    box: {
                        x: Math.max(0, Math.min(100 - wPct, Math.round(selMinX * 100) / 100)),
                        y: Math.max(0, Math.min(100 - hPct, Math.round(selMinY * 100) / 100)),
                        w: wPct,
                        h: hPct
                    },
                    style: {
                        fontFamily: globalState.defaultFont || 'font-manga',
                        fontSize: 17,
                        lineHeight: 1.15,
                        letterSpacing: 0,
                        textTransform: 'none',
                        bold: false,
                        italic: false,
                        underline: false,
                        textColor: '#000000',
                        bgColor: '#ffffff',
                        bgOpacity: 100,
                        padding: 4,
                        rotate: 0,
                        vertical: false,
                        align: 'center',
                        maskShape: 'bubble-fit',
                        maskSize: 'full',
                        strokeColor: '#000000',
                        strokeWidth: 0,
                        shadowColor: '#000000',
                        shadowBlur: 0
                    }
                };
                pushStateToHistory();
                page.blocks.push(newBlock);
                import('./canvas-renderer').then(r => {
                    r.renderOverlays();
                    selectBlock(newId);
                    savePageToDB(page);
                });
            } else if (!endEvent.shiftKey && !endEvent.ctrlKey) {
                selectBlock(null);
            }
        }

        window.addEventListener('mousemove', onMarqueeMove);
        window.addEventListener('mouseup', onMarqueeEnd);
    });
}
