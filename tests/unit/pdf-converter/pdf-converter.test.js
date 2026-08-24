/**
 * Unit Tests for Module 1: PDF to PNG / Image Converter
 * Tests page range parsing, format resolution, dynamic script loaders, and ZIP archive packaging.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { parsePageRange } from '../../../cong-cu-huu-ich/src/pdf-converter';
import { getTargetFormatExt, formatFileSize, ensurePdfJsLoaded, ensureJSZipLoaded } from '../../../cong-cu-huu-ich/src/common';

describe('PDF to Image Converter (Module 1)', () => {

    // =========================================================================
    // 1. Page Range Parsing Logic
    // =========================================================================
    describe('1. parsePageRange', () => {
        test('Empty or whitespace-only string returns all pages (1..totalPages)', () => {
            expect(parsePageRange('', 5)).toEqual([1, 2, 3, 4, 5]);
            expect(parsePageRange('   ', 3)).toEqual([1, 2, 3]);
        });

        test('Single page numbers are parsed correctly', () => {
            expect(parsePageRange('3', 10)).toEqual([3]);
            expect(parsePageRange('1, 4, 7', 10)).toEqual([1, 4, 7]);
        });

        test('Hyphenated ranges are parsed correctly into continuous arrays', () => {
            expect(parsePageRange('2-5', 10)).toEqual([2, 3, 4, 5]);
            expect(parsePageRange('1-3, 6-8', 10)).toEqual([1, 2, 3, 6, 7, 8]);
        });

        test('Reverse ranges (e.g. 5-2) are normalized into ascending order', () => {
            expect(parsePageRange('5-2', 10)).toEqual([2, 3, 4, 5]);
        });

        test('Duplicate pages are deduplicated and sorted in ascending order', () => {
            expect(parsePageRange('5, 2, 2, 4, 2-4', 10)).toEqual([2, 3, 4, 5]);
        });

        test('Out of bounds pages (<=0 or > totalPages) are clamped or ignored', () => {
            expect(parsePageRange('0, 1, 15', 10)).toEqual([1]);
            expect(parsePageRange('8-15', 10)).toEqual([8, 9, 10]);
            expect(parsePageRange('-3', 10)).toEqual([1, 2, 3]);
            expect(parsePageRange('8-', 10)).toEqual([8, 9, 10]);
        });

        test('Completely invalid input falls back to all pages', () => {
            expect(parsePageRange('abc, xyz', 4)).toEqual([1, 2, 3, 4]);
        });
    });

    // =========================================================================
    // 2. Format Extension and File Size Helpers
    // =========================================================================
    describe('2. Format Resolution & File Sizing', () => {
        test('getTargetFormatExt resolves proper extensions for image MIME types', () => {
            expect(getTargetFormatExt('image/png')).toBe('png');
            expect(getTargetFormatExt('image/jpeg')).toBe('jpg');
            expect(getTargetFormatExt('image/webp')).toBe('webp');
            expect(getTargetFormatExt('unknown')).toBe('png');
        });

        test('formatFileSize formats byte quantities into human-readable strings', () => {
            expect(formatFileSize(0)).toBe('0 B');
            expect(formatFileSize(512)).toBe('512 B');
            expect(formatFileSize(1024)).toBe('1 KB');
            expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
        });
    });

    // =========================================================================
    // 3. Dynamic Script & Library Loader Robustness
    // =========================================================================
    describe('3. Dynamic Script Loader Resilience', () => {
        beforeEach(() => {
            delete globalThis.pdfjsLib;
            delete globalThis.JSZip;
            if (typeof window !== 'undefined') {
                delete window.pdfjsLib;
                delete window.JSZip;
            }
        });

        test('ensurePdfJsLoaded returns existing global pdfjsLib and configures worker', async () => {
            const mockLib = {
                GlobalWorkerOptions: {
                    workerSrc: ''
                },
                getDocument: vi.fn()
            };
            globalThis.pdfjsLib = mockLib;
            if (typeof window !== 'undefined') window.pdfjsLib = mockLib;

            const lib = await ensurePdfJsLoaded();
            expect(lib).toBe(mockLib);
            expect(lib.GlobalWorkerOptions.workerSrc).toContain('pdf.worker.min.js');
        });

        test('ensureJSZipLoaded returns existing global JSZip', async () => {
            class MockJSZip {
                file() {}
                generateAsync() { return Promise.resolve(new Blob()); }
            }
            globalThis.JSZip = MockJSZip;
            if (typeof window !== 'undefined') window.JSZip = MockJSZip;

            const zipClass = await ensureJSZipLoaded();
            expect(zipClass).toBe(MockJSZip);
        });
    });
});
