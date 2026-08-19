// AI Service Facade & Public Module Exports

export * from './ai-config';
export * from './story-memory';
export * from './prompt-builder';
export * from './matching-engine';
export * from './ai-client';
export * from './translation-pipeline';
export * from './page-translator';
export * from './ai-inpainting';

import {
    toggleStoryMemory,
    clearStoryMemory,
    viewStoryMemoryModal,
    cancelBatchTranslation
} from './story-memory';
import {
    translateActivePage,
    runBatchTranslation
} from './page-translator';
import {
    requestAiInpaintPatch,
    runAIEraseTextPage
} from './ai-inpainting';

if (typeof window !== 'undefined') {
    Object.assign(window, {
        toggleStoryMemory,
        clearStoryMemory,
        viewStoryMemoryModal,
        cancelBatchTranslation,
        translateActivePage,
        runBatchTranslation,
        requestAiInpaintPatch,
        runAIEraseTextPage
    });
}
