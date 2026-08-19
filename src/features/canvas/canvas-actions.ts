import { globalState, pushStateToHistory, savePageToDB } from '../../core/state';
import { showToast } from '../../core/utils';
import { selectBlock } from './canvas-interactions';
import { requestOverlayRender } from './canvas-renderer';
import { MangaBlock } from '../../types/index';

export function duplicateActiveBlock(): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    if (!page) return;
    const sourceBlock = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!sourceBlock) return;

    pushStateToHistory();

    const newX = Math.min(85, sourceBlock.box.x + 2);
    const newY = Math.min(85, sourceBlock.box.y + 2);
    const prefix = sourceBlock.type === 'image' ? 'image_block' : 'block';
    const newBlockId = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newBlock: MangaBlock = {
        id: newBlockId,
        type: sourceBlock.type || 'dialogue',
        imageUrl: sourceBlock.imageUrl,
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
}
