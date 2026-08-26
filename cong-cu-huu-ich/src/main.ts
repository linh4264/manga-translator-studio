/**
 * Main Application Bootstrap for Bộ Công Cụ Hữu Ích (TypeScript + Vite)
 * Manga Translator Studio
 */

import {
    formatFileSize,
    getTargetFormatExt,
    openPreviewModal,
    closePreviewModal,
    switchTab,
    setupDragAndDrop
} from './common';

import {
    initPdfWorker,
    clearPdfBlobs,
    resetPdfConverter,
    parsePageRange,
    handlePdfFileSelect,
    onPdfFormatChange,
    renderPdfPagesDebounced,
    renderPdfPages,
    downloadPdfZip,
    initPdfConverter
} from './pdf-converter';

import {
    clearSliceList,
    resetSlice,
    setSliceMode,
    setSliceCountPreset,
    setSliceHeightPreset,
    onSliceFormatChange,
    processSlicingDebounced,
    handleSliceFileSelect,
    findOptimalCutLine,
    processSlicing,
    downloadSlicedZip,
    initImageSlicer
} from './image-slicer';

import {
    toggleMergeDirectionUI,
    swapMergeImages,
    moveMergeImage,
    removeMergeImage,
    renderMergeList,
    executeMergeImages,
    handleMergeFiles,
    initImageMerger
} from './image-merger';

import {
    applySharpenFilterToCtx,
    handleCompressFilesSelect,
    addMoreCompressFiles,
    resetCompressBatch,
    processCompressBatch,
    downloadCompressedZip,
    initImageCompressor
} from './image-compressor';

import {
    handleConvertFilesSelect,
    addMoreConvertFiles,
    resetConvertBatch,
    processConvertBatch,
    downloadConvertedZip,
    initFormatConverter
} from './format-converter';

import {
    resetEnhance,
    processEnhance,
    downloadEnhancedImage,
    handleEnhanceFile,
    initImageEnhancer
} from './image-enhancer';

import {
    runOcrExtraction,
    copyOcrText,
    handleOcrFile,
    initOcrExtractor
} from './ocr-extractor';

import {
    determineWeightGrade,
    determineWidthGrade,
    determineSlantGrade,
    determineCaseGrade,
    analyzeFontMorphology,
    profileFontGlyph,
    loadAndRegisterCustomFontsFromDB,
    handleCustomFontUpload,
    deduplicateCustomFonts,
    reprofileAllCustomFonts,
    clearAllCustomFonts,
    deleteCustomFont,
    setCustomFontCategoryFilter,
    setCustomFontWeightFilter,
    setCustomFontWidthFilter,
    setCustomFontSlantFilter,
    setCustomFontCaseFilter,
    resetCustomFontFilters,
    openFontMorphologyModal,
    closeFontMorphologyModal,
    onCustomFontFilterChange,
    loadMoreCustomFonts,
    renderCustomFontsUI,
    refreshCustomFontsUI,
    initFontMatcherModule
} from './font-matcher';

// Bind all necessary public functions to global window for inline HTML onclick/onchange/oninput bindings
const globalScope: any = typeof window !== 'undefined' ? window : globalThis;

Object.assign(globalScope, {
    // Common
    formatFileSize,
    getTargetFormatExt,
    openPreviewModal,
    closePreviewModal,
    switchTab,

    // PDF Converter
    resetPdfConverter,
    handlePdfFileSelect,
    onPdfFormatChange,
    renderPdfPagesDebounced,
    downloadPdfZip,

    // Slicer
    resetSlice,
    setSliceMode,
    setSliceCountPreset,
    setSliceHeightPreset,
    onSliceFormatChange,
    processSlicingDebounced,
    handleSliceFileSelect,
    downloadSlicedZip,

    // Merger
    toggleMergeDirectionUI,
    swapMergeImages,
    moveMergeImage,
    removeMergeImage,
    renderMergeList,
    executeMergeImages,

    // Compressor
    handleCompressFilesSelect,
    addMoreCompressFiles,
    resetCompressBatch,
    processCompressBatch,
    downloadCompressedZip,

    // Converter
    handleConvertFilesSelect,
    addMoreConvertFiles,
    resetConvertBatch,
    processConvertBatch,
    downloadConvertedZip,

    // Enhancer
    resetEnhance,
    processEnhance,
    downloadEnhancedImage,
    handleEnhanceFile,

    // OCR
    runOcrExtraction,
    copyOcrText,
    handleOcrFile,

    // Custom Font Library & Morphology Manager
    determineWeightGrade,
    determineWidthGrade,
    determineSlantGrade,
    determineCaseGrade,
    analyzeFontMorphology,
    deduplicateCustomFonts,
    reprofileAllCustomFonts,
    clearAllCustomFonts,
    deleteCustomFont,
    setCustomFontCategoryFilter,
    setCustomFontWeightFilter,
    setCustomFontWidthFilter,
    setCustomFontSlantFilter,
    setCustomFontCaseFilter,
    resetCustomFontFilters,
    openFontMorphologyModal,
    closeFontMorphologyModal,
    onCustomFontFilterChange,
    loadMoreCustomFonts,
    refreshCustomFontsUI
});

if (typeof document !== 'undefined') {
    // Escape key to close modal
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') closePreviewModal();
    });

    // Initialize on DOMContentLoaded or immediately if DOM is already ready
    const initApp = () => {
        // Setup Drag & Drop for all dropzones
        setupDragAndDrop('convert-upload', 'convert-files', handleConvertFilesSelect);
        setupDragAndDrop('pdf-upload', 'pdf-file', (files) => {
            if (files && files[0]) {
                handlePdfFileSelect(files[0]);
            }
        });
        setupDragAndDrop('slice-upload', 'slice-file', (files) => {
            if (files && files[0]) {
                handleSliceFileSelect(files[0]);
            }
        });
        setupDragAndDrop('merge-upload', 'merge-files', (files) => {
            if (files && files.length > 0) {
                handleMergeFiles(files);
            }
        });
        setupDragAndDrop('compress-upload', 'compress-files', (files) => {
            if (files && files.length > 0) {
                handleCompressFilesSelect(files);
            }
        });
        setupDragAndDrop('enhance-upload', 'enhance-file', (files) => {
            if (files && files[0]) {
                handleEnhanceFile(files[0]);
            }
        });
        setupDragAndDrop('ocr-upload', 'ocr-file', (files) => {
            if (files && files[0]) {
                handleOcrFile(files[0]);
            }
        });
        setupDragAndDrop('fontmatch-custom-dropzone', 'fontmatch-custom-files', (files) => {
            if (files && files.length > 0) {
                handleCustomFontUpload(files);
            }
        });

        // Initialize all tool event handlers & modules
        initPdfConverter();
        initImageSlicer();
        initImageMerger();
        initImageCompressor();
        initFormatConverter();
        initImageEnhancer();
        initOcrExtractor();
        initFontMatcherModule();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
}
