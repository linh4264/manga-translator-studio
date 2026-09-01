import { describe, it, expect } from 'vitest';
import {
    createDefaultStyle,
    normalizeStyle,
    cloneStyle,
    mergeStyles,
    createDefaultBlock,
    normalizeBlock,
    cloneBlock,
    cleanBlockForPersistence,
    validateBlock,
    createDefaultPage,
    normalizePage,
    clonePage,
    cleanPageForPersistence,
    validatePage,
    markPageAutoFitDirty
} from '../../../src/core/document-model';

describe('Document Model Schema, Factories, Normalizers & Validators', () => {
    describe('1. Style Model', () => {
        it('creates default style with standard fallback properties', () => {
            const style = createDefaultStyle();
            expect(style.fontFamily).toBe('font-manga');
            expect(style.fontSize).toBe(17);
            expect(style.textColor).toBe('#000000');
            expect(style.align).toBe('center');
            expect(style.maskShape).toBe('bubble-fit');
        });

        it('normalizes style and synchronizes color hex aliases', () => {
            const raw = {
                font: 'CustomFont',
                textColorHex: '#ff0000',
                fontSize: 'invalid', // should fallback
                bgOpacity: 150 // should clamp to 100
            };
            const normalized = normalizeStyle(raw);
            expect(normalized.fontFamily).toBe('CustomFont');
            expect(normalized.textColor).toBe('#ff0000');
            expect(normalized.textColorHex).toBe('#ff0000');
            expect(normalized.fontSize).toBe(17);
            expect(normalized.bgOpacity).toBe(100);
        });

        it('merges styles safely without mutating original base style', () => {
            const base = createDefaultStyle({ fontSize: 16 });
            const merged = mergeStyles(base, { fontSize: 22, italic: true });

            expect(base.fontSize).toBe(16);
            expect(base.italic).toBe(false);
            expect(merged.fontSize).toBe(22);
            expect(merged.italic).toBe(true);
        });
    });

    describe('2. Block Model', () => {
        it('creates default block with normalized bounding box', () => {
            const block = createDefaultBlock({
                original: 'Raw text',
                translated: 'Đoạn dịch',
                box: { x: 10, y: 20, w: 30, h: 40 }
            });

            expect(block.id).toBeDefined();
            expect(block.type).toBe('dialogue');
            expect(block.box.x).toBe(10);
            expect(block.box.w).toBe(30);
            expect(block.style).toBeDefined();
        });

        it('normalizes raw block data and handles NaN / invalid values', () => {
            const raw = {
                id: '',
                type: 'unknown_type',
                original: 12345,
                box: { x: NaN, y: -10, w: 0, h: 200 }, // out of bounds / NaN
                speaker: 'Main Character'
            };

            const normalized = normalizeBlock(raw, 'fallback_id');
            expect(normalized.id).toBe('fallback_id');
            expect(normalized.type).toBe('dialogue');
            expect(normalized.original).toBe('12345');
            expect(normalized.box.x).toBe(0);
            expect(normalized.box.y).toBe(0);
            expect(normalized.box.w).toBe(10); // clamped fallback
            expect(normalized.box.h).toBe(100); // clamped max
            expect(normalized.speaker).toBe('Main Character');
        });

        it('clones block and strips transient runtime cache by default', () => {
            const block = createDefaultBlock({ id: 'b1' });
            block.autoFitCache = { key: 'cache1', fontSize: 14 };
            block.maskCache = { test: true };

            const clonedWithoutCache = cloneBlock(block, false);
            expect(clonedWithoutCache.autoFitCache).toBeUndefined();
            expect(clonedWithoutCache.maskCache).toBeUndefined();

            const clonedWithCache = cloneBlock(block, true);
            expect(clonedWithCache.autoFitCache?.fontSize).toBe(14);
        });

        it('cleans block for persistence', () => {
            const block = createDefaultBlock({ id: 'b1', original: 'Hello' });
            block.autoFitCache = { key: 'cache1', fontSize: 14 };
            const clean = cleanBlockForPersistence(block);

            expect(clean.id).toBe('b1');
            expect(clean.autoFitCache).toBeUndefined();
            expect(clean.maskCache).toBeUndefined();
        });

        it('validates block structure', () => {
            expect(validateBlock(null).valid).toBe(false);
            expect(validateBlock({}).valid).toBe(false);
            expect(validateBlock({ id: 'b1', box: { x: 0, y: 0, w: 10, h: 10 } }).valid).toBe(true);
        });
    });

    describe('3. Page Model', () => {
        it('creates default page and normalizes dimensions and blocks', () => {
            const page = createDefaultPage({
                name: 'Page 01',
                width: 1200,
                height: 1800,
                blocks: [
                    { original: 'Block 1', box: { x: 5, y: 5, w: 20, h: 10 } }
                ]
            });

            expect(page.id).toBeDefined();
            expect(page.name).toBe('Page 01');
            expect(page.width).toBe(1200);
            expect(page.height).toBe(1800);
            expect(page.blocks).toHaveLength(1);
            expect(page.blocks[0].id).toBeDefined();
        });

        it('clones page with deep block cloning and marks dirty correctly', () => {
            const page = createDefaultPage({
                id: 'p1',
                blocks: [createDefaultBlock({ id: 'b1', original: 'Text' })]
            });

            const cloned = clonePage(page, true, false);
            expect(cloned.id).toBe('p1');
            expect(cloned.blocks[0]).not.toBe(page.blocks[0]); // deep copy
            expect(cloned.blocks[0].original).toBe('Text');

            page.blocks[0].autoFitCache = { key: 'k', fontSize: 12 };
            markPageAutoFitDirty(page);

            expect(page.autoFitRevision).toBe(1);
            expect(page.blocks[0].autoFitCache).toBeNull();
        });

        it('validates page structure and persistence cleaning', () => {
            expect(validatePage(null).valid).toBe(false);
            expect(validatePage({ id: 'p1', blocks: [] }).valid).toBe(true);

            const page = createDefaultPage({ id: 'p_persist', name: 'Persist Test' });
            const clean = cleanPageForPersistence(page);
            expect(clean.id).toBe('p_persist');
            expect(clean.blocks).toEqual([]);
        });
    });
});
