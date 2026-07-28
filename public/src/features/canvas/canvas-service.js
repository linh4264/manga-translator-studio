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
    deleteActiveBlock,
    selectBlock,
    navigateBlocks,
    initBilingualTooltipEvents
} from './canvas-interactions.js';

import { applyDiamondFormat, batchDiamondBalanceAllPages } from './canvas-renderer.js';

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
    deleteActiveBlock,
    toggleAutoFit,
    applyDiamondFormat,
    batchDiamondBalanceAllPages,
    selectBlock,
    syncActiveBlockStyle,
    syncActiveBlockTranslation,
    copyBlockStyle,
    pasteBlockStyle,
    navigateBlocks,
    autoMatchActiveBlockStyle,
    autoMatchBlockStyle,
    initBilingualTooltipEvents
});