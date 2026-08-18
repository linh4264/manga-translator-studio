// Barrel File Re-export toàn bộ module Canvas
export * from './canvas-renderer';
export * from './canvas-exporter';
export * from './canvas-interactions';
export * from './canvas-styling';
export * from './canvas-actions';
export * from './magic-wand';

import {
    normalizeAllBlocksToHorizontal,
    updateTextRotate,
    updateSfxRotate,
    updateSfxArc,
    resetSfxAngleControls,
    applyStylePreset,
    toggleAutoFit,
    syncActiveBlockStyle,
    syncActiveBlockTranslation,
    copyBlockStyle,
    pasteBlockStyle,
    autoMatchActiveBlockStyle,
    autoMatchBlockStyle,
    toggleActiveBlockOrientation,
    alignActiveBlockPosition,
    toggleSelectedBlocksOrientation,
    batchDiamondBalanceSelectedBlocks
} from './canvas-styling';

import { duplicateActiveBlock } from './canvas-actions';
import {
    addNewBlock,
    triggerAddImageBlock,
    handleImageBlockSelect,
    triggerReplaceImageBlock,
    handleReplaceImageBlockSelect,
    deleteActiveBlock,
    selectBlock,
    selectAllBlocksOnPage,
    navigateBlocks,
    initBilingualTooltipEvents,
    initMarqueeSelection
} from './canvas-interactions';

import {
    toggleMagicWandMode,
    autoSnapActiveBlockToUnderlyingBubble,
    autoSnapSelectedBlocksToBubbles,
    initMagicWandEvents,
    clearMagicWandPreview
} from './magic-wand';

import { applyDiamondFormat, batchDiamondBalanceAllPages } from './canvas-renderer';
import { updateImageBlockOpacity, updateImageBlockFit, updateImageBlockBorderRadius } from '../../ui/block-editor-ui';

if (typeof window !== 'undefined') {
    Object.assign(window, {
        normalizeAllBlocksToHorizontal,
        updateTextRotate,
        updateSfxRotate,
        updateSfxArc,
        resetSfxAngleControls,
        duplicateActiveBlock,
        toggleActiveBlockOrientation,
        applyStylePreset,
        addNewBlock,
        triggerAddImageBlock,
        handleImageBlockSelect,
        triggerReplaceImageBlock,
        handleReplaceImageBlockSelect,
        updateImageBlockOpacity,
        updateImageBlockFit,
        updateImageBlockBorderRadius,
        deleteActiveBlock,
        toggleAutoFit,
        applyDiamondFormat,
        batchDiamondBalanceAllPages,
        selectBlock,
        selectAllBlocksOnPage,
        syncActiveBlockStyle,
        syncActiveBlockTranslation,
        copyBlockStyle,
        pasteBlockStyle,
        navigateBlocks,
        autoMatchActiveBlockStyle,
        autoMatchBlockStyle,
        initBilingualTooltipEvents,
        initMarqueeSelection,
        alignActiveBlockPosition,
        toggleMagicWandMode,
        autoSnapActiveBlockToUnderlyingBubble,
        autoSnapSelectedBlocksToBubbles,
        toggleSelectedBlocksOrientation,
        batchDiamondBalanceSelectedBlocks,
        initMagicWandEvents,
        clearMagicWandPreview
    });
}
