import { test, expect, describe, beforeEach, afterEach } from 'vitest';
import '../../setup/browser-env.js';
import '../../setup/indexeddb-mock.js';

import { globalState } from '../../../src/core/state.ts';
import { getPageExportMimeType, runBatchExport, runPdfExport } from '../../../src/features/io.ts';
import {
    previewCurrentPage,
    previewViewMode,
    previewZoom,
    selectedExportPages,
    activeExportTab,
    openPreviewMode,
    openExportZipPreview,
    openExportPdfPreview,
    closePreviewMode,
    previewNextPage,
    previewPrevPage,
    previewJumpToPage,
    setPreviewViewMode,
    setPreviewZoom,
    changePreviewZoom,
    resetPreviewZoom,
    togglePageExportSelection,
    selectAllExportPages,
    deselectAllExportPages,
    switchPreviewExportTab
} from '../../../src/ui/preview-ui.ts';

describe('Export Preview & Targeted Export Engine', () => {
    beforeEach(() => {
        globalState.pages = [
            {
                id: 'page_1',
                name: '001.jpg',
                src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                file: new Blob(['fake-1'], { type: 'image/jpeg' }),
                originalFile: new Blob(['fake-1'], { type: 'image/jpeg' }),
                status: 'translated',
                blocks: [
                    {
                        id: 'b1',
                        type: 'dialogue',
                        original: 'こんにちは',
                        translated: 'Xin chào bạn',
                        box: { x: 10, y: 10, width: 80, height: 40 },
                        style: { fontSize: 16 }
                    }
                ]
            },
            {
                id: 'page_2',
                name: '002.png',
                src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                file: new Blob(['fake-2'], { type: 'image/png' }),
                originalFile: new Blob(['fake-2'], { type: 'image/png' }),
                status: 'translated',
                blocks: [
                    {
                        id: 'b2',
                        type: 'dialogue',
                        original: 'ありがとう',
                        translated: 'Cảm ơn nhiều nhé',
                        box: { x: 20, y: 20, width: 70, height: 30 },
                        style: { fontSize: 14 }
                    }
                ]
            },
            {
                id: 'page_3',
                name: '003.webp',
                src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                file: new Blob(['fake-3'], { type: 'image/webp' }),
                originalFile: new Blob(['fake-3'], { type: 'image/webp' }),
                status: 'translated',
                blocks: []
            }
        ];
        globalState.activePageIndex = 0;
        globalState.exportFormat = 'auto';
        globalState.pdfQuality = 'hd';
    });

    afterEach(() => {
        closePreviewMode();
    });

    test('1. getPageExportMimeType handles format overrides and custom quality', () => {
        const page = globalState.pages[0]; // 001.jpg

        // Default auto format
        const resAuto = getPageExportMimeType(page);
        expect(resAuto.mimeType).toBe('image/jpeg');
        expect(resAuto.ext).toBe('jpg');

        // PNG override
        const resPng = getPageExportMimeType(page, 'png');
        expect(resPng.mimeType).toBe('image/png');
        expect(resPng.ext).toBe('png');

        // WEBP override with custom quality
        const resWebp = getPageExportMimeType(page, 'webp', 0.85);
        expect(resWebp.mimeType).toBe('image/webp');
        expect(resWebp.quality).toBe(0.85);
        expect(resWebp.ext).toBe('webp');

        // JPEG override with 100% quality
        const resJpeg = getPageExportMimeType(page, 'jpeg', 1.0);
        expect(resJpeg.mimeType).toBe('image/jpeg');
        expect(resJpeg.quality).toBe(1.0);
        expect(resJpeg.ext).toBe('jpg');
    });

    test('2. Preview Mode lifecycle and Tab Initialization', () => {
        // Open ZIP export preview
        openExportZipPreview();
        expect(activeExportTab).toBe('zip');
        expect(selectedExportPages.size).toBe(3);
        expect(selectedExportPages.has(0)).toBe(true);
        expect(selectedExportPages.has(1)).toBe(true);
        expect(selectedExportPages.has(2)).toBe(true);

        // Open PDF export preview
        openExportPdfPreview();
        expect(activeExportTab).toBe('pdf');

        // Switch tab
        switchPreviewExportTab('zip');
        expect(activeExportTab).toBe('zip');

        // Close preview mode
        closePreviewMode();
    });

    test('3. Preview Page Navigation & Pagination Bounds', () => {
        openPreviewMode('view', 0);
        expect(previewCurrentPage).toBe(0);

        // Navigate forward
        previewNextPage();
        expect(previewCurrentPage).toBe(1);

        previewNextPage();
        expect(previewCurrentPage).toBe(2);

        // Cannot go past last page
        previewNextPage();
        expect(previewCurrentPage).toBe(2);

        // Navigate backward
        previewPrevPage();
        expect(previewCurrentPage).toBe(1);

        // Direct jump
        previewJumpToPage(0);
        expect(previewCurrentPage).toBe(0);

        closePreviewMode();
    });

    test('4. Selective Page Export Filtering (Select, Deselect, Toggle)', () => {
        openPreviewMode();
        expect(selectedExportPages.size).toBe(3);

        // Toggle out page 1 (index 1)
        togglePageExportSelection(1);
        expect(selectedExportPages.has(1)).toBe(false);
        expect(selectedExportPages.has(0)).toBe(true);
        expect(selectedExportPages.has(2)).toBe(true);
        expect(selectedExportPages.size).toBe(2);

        // Deselect all
        deselectAllExportPages();
        expect(selectedExportPages.size).toBe(0);

        // Select all
        selectAllExportPages();
        expect(selectedExportPages.size).toBe(3);
        expect(selectedExportPages.has(0)).toBe(true);
        expect(selectedExportPages.has(1)).toBe(true);
        expect(selectedExportPages.has(2)).toBe(true);

        closePreviewMode();
    });

    test('5. View Modes (Single, Continuous, Grid) and Zoom Controls', () => {
        openPreviewMode();

        // Switch View Modes
        setPreviewViewMode('grid');
        expect(previewViewMode).toBe('grid');

        setPreviewViewMode('continuous');
        expect(previewViewMode).toBe('continuous');

        setPreviewViewMode('single');
        expect(previewViewMode).toBe('single');

        // Zoom Controls
        setPreviewZoom(1.5);
        expect(previewZoom).toBe(1.5);

        changePreviewZoom(0.3);
        expect(previewZoom).toBeCloseTo(1.8, 2);

        resetPreviewZoom();
        expect(previewZoom).toBe(1.0);

        // Clamp Zoom bounds (0.25 to 3.0)
        setPreviewZoom(5.0);
        expect(previewZoom).toBe(3.0);

        setPreviewZoom(0.05);
        expect(previewZoom).toBe(0.25);

        closePreviewMode();
    });

    test('6. runBatchExport with custom options (targeted pages, format, filename)', async () => {
        // Mock window.JSZip
        let createdFiles = [];
        const mockJSZip = class {
            file(name, blob) {
                createdFiles.push({ name, blob });
            }
            generateAsync() {
                return Promise.resolve(new Blob(['mock-zip-content'], { type: 'application/zip' }));
            }
        };
        globalThis.window.JSZip = mockJSZip;

        // Export only page 0 and page 2
        await runBatchExport({
            pageIndices: [0, 2],
            format: 'png',
            filename: 'custom_manga_pack.zip'
        });

        expect(createdFiles.length).toBe(2);
        expect(createdFiles[0].name).toContain('001.png');
        expect(createdFiles[1].name).toContain('003.png');
    });

    test('7. runPdfExport with custom options (targeted pages, quality, filename)', async () => {
        let addedPages = 0;
        let savedPdfName = '';
        const mockJsPDF = class {
            constructor(options) {
                addedPages = 1;
            }
            addImage(data, format, x, y, w, h) {}
            addPage(format, orientation) {
                addedPages++;
            }
            save(name) {
                savedPdfName = name;
            }
        };
        globalThis.window.jspdf = { jsPDF: mockJsPDF };

        // Export only page 1 (second page) to PDF
        await runPdfExport({
            pageIndices: [1],
            quality: 'max',
            filename: 'Chapter_01_HighRes.pdf'
        });

        expect(addedPages).toBe(1);
        expect(savedPdfName).toBe('Chapter_01_HighRes.pdf');
    });
});
