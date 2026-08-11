// Barrel File Re-export toàn bộ module Canvas
export * from './canvas-renderer.js';
export * from './canvas-exporter.js';
export * from './canvas-interactions.js';
export * from './canvas-styling.js';
export * from './canvas-actions.js';

import {
    normalizeAllBlocksToHorizontal,
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
    toggleActiveBlockOrientation
} from './canvas-styling.js';

import {
    duplicateActiveBlock,
    addNewBlock,
    triggerAddImageBlock,
    handleImageBlockSelect,
    triggerReplaceImageBlock,
    handleReplaceImageBlockSelect,
    deleteActiveBlock,
    selectBlock,
    selectAllBlocksOnPage,
    navigateBlocks,
    initBilingualTooltipEvents
} from './canvas-interactions.js';

import { applyDiamondFormat, batchDiamondBalanceAllPages } from './canvas-renderer.js';
import { updateImageBlockOpacity, updateImageBlockFit, updateImageBlockBorderRadius } from '../../ui/block-editor-ui.js';

// Global window bindings cho inline HTML handlers
Object.assign(window, {
    normalizeAllBlocksToHorizontal,
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
    alignActiveBlockPosition
});