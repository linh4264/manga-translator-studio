import { globalState, pushStateToHistory, savePageToDB } from '../../core/state.js';
import { showToast } from '../../core/utils.js';
import { selectBlock } from './canvas-interactions.js';
import { requestOverlayRender } from './canvas-renderer.js';

export function duplicateActiveBlock() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    const sourceBlock = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!sourceBlock) return;

    pushStateToHistory();

    const newX = Math.min(85, sourceBlock.box.x + 2);
    const newY = Math.min(85, sourceBlock.box.y + 2);
    const prefix = sourceBlock.type === 'image' ? 'image_block' : 'block';
    const newBlockId = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newBlock = {
        id: newBlockId,
        type: sourceBlock.type || 'dialogue',
        imageUrl: sourceBlock.imageUrl || null,
        original: sourceBlock.original || '',
        translated: sourceBlock.translated || '',
        box: {
            x: newX,
            y: newY,
            w: sourceBlock.box.w,
            h: sourceBlock.box.h
        },
        style: JSON.parse(JSON.stringify(sourceBlock.style || {}))
    };

    page.blocks.push(newBlock);
    selectBlock(newBlockId);
    requestOverlayRender();
    savePageToDB(page);
    showToast(sourceBlock.type === 'image' ? "Đã nhân đôi ô ảnh thành công!" : "Đã nhân đôi ô thoại thành công!", "success");
}