
import { globalState, pushStateToHistory, savePageToDB } from '../../core/state.js';
import { showToast } from '../../core/utils.js';
import { selectBlock, requestOverlayRender } from '../canvas.js';

export function duplicateActiveBlock() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    const sourceBlock = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!sourceBlock) return;

    pushStateToHistory();

    const newX = Math.min(85, sourceBlock.box.x + 2);
    const newY = Math.min(85, sourceBlock.box.y + 2);
    const newBlockId = `block-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newBlock = {
        id: newBlockId,
        original: sourceBlock.original || '',
        translated: sourceBlock.translated || '',
        box: {
            x: newX,
            y: newY,
            w: sourceBlock.box.w,
            h: sourceBlock.box.h
        },
        style: JSON.parse(JSON.stringify(sourceBlock.style))
    };

    page.blocks.push(newBlock);
    selectBlock(newBlockId);
    requestOverlayRender();
    savePageToDB(page);
    showToast("Đã nhân đôi ô thoại thành công!", "success");
}
