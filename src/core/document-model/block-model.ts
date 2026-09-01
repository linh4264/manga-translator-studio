/**
 * Manga Translator Studio - Document Model: MangaBlock
 * Provides schema validation, factories, normalizers, and cloning helpers for MangaBlock.
 */
import { MangaBlock, BoundingBox } from '../../types/index';
import { createDefaultStyle, normalizeStyle, cloneStyle } from './style-model';

export function createDefaultBoundingBox(partial?: Partial<BoundingBox>): BoundingBox {
    return {
        x: typeof partial?.x === 'number' && !isNaN(partial.x) ? partial.x : 0,
        y: typeof partial?.y === 'number' && !isNaN(partial.y) ? partial.y : 0,
        w: typeof partial?.w === 'number' && !isNaN(partial.w) && partial.w > 0 ? partial.w : 10,
        h: typeof partial?.h === 'number' && !isNaN(partial.h) && partial.h > 0 ? partial.h : 10
    };
}

export function normalizeBoundingBox(raw?: any): BoundingBox {
    if (!raw || typeof raw !== 'object') {
        return createDefaultBoundingBox();
    }
    const x = typeof raw.x === 'number' && !isNaN(raw.x) ? raw.x : (typeof raw.left === 'number' ? raw.left : 0);
    const y = typeof raw.y === 'number' && !isNaN(raw.y) ? raw.y : (typeof raw.top === 'number' ? raw.top : 0);
    const w = typeof raw.w === 'number' && !isNaN(raw.w) && raw.w > 0 ? raw.w : (typeof raw.width === 'number' && raw.width > 0 ? raw.width : 10);
    const h = typeof raw.h === 'number' && !isNaN(raw.h) && raw.h > 0 ? raw.h : (typeof raw.height === 'number' && raw.height > 0 ? raw.height : 10);

    return {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y)),
        w: Math.max(0.1, Math.min(100, w)),
        h: Math.max(0.1, Math.min(100, h))
    };
}

export function generateBlockId(prefix: string = 'b'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function createDefaultBlock(partial?: Partial<MangaBlock>): MangaBlock {
    const id = partial?.id || generateBlockId();
    const type = partial?.type || 'dialogue';
    const original = partial?.original !== undefined ? String(partial.original) : '';
    const translated = partial?.translated !== undefined ? String(partial.translated) : '';
    const box = normalizeBoundingBox(partial?.box);
    const style = createDefaultStyle(partial?.style);

    const block: MangaBlock = {
        id,
        type,
        original,
        translated,
        box,
        style
    };

    if (partial?.speaker !== undefined) block.speaker = partial.speaker;
    if (partial?.target !== undefined) block.target = partial.target;
    if (partial?.vertical !== undefined) block.vertical = partial.vertical;
    if (partial?.textAnchor) block.textAnchor = { ...partial.textAnchor };
    if (partial?.imageUrl !== undefined) block.imageUrl = partial.imageUrl;
    if (partial?.originalBackgroundBackup !== undefined) block.originalBackgroundBackup = partial.originalBackgroundBackup;
    if (partial?.positionKnown !== undefined) block.positionKnown = partial.positionKnown;
    if (partial?.textWidth !== undefined) block.textWidth = partial.textWidth;
    if (partial?.textHeight !== undefined) block.textHeight = partial.textHeight;

    return block;
}

export function normalizeBlock(raw: any, fallbackId?: string): MangaBlock {
    if (!raw || typeof raw !== 'object') {
        return createDefaultBlock({ id: fallbackId });
    }

    const validTypes = ['dialogue', 'narration', 'thought', 'sfx', 'image', 'other'];
    const type = validTypes.includes(raw.type) ? raw.type : 'dialogue';
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : (fallbackId || generateBlockId());
    const original = typeof raw.original === 'string' ? raw.original : (raw.original ? String(raw.original) : '');
    const translated = typeof raw.translated === 'string' ? raw.translated : (raw.translated ? String(raw.translated) : '');
    const box = normalizeBoundingBox(raw.box);
    const style = normalizeStyle(raw.style);

    const block: MangaBlock = {
        id,
        type: type as any,
        original,
        translated,
        box,
        style
    };

    if (raw.speaker !== undefined) block.speaker = String(raw.speaker);
    if (raw.target !== undefined) block.target = String(raw.target);
    if (raw.vertical !== undefined) block.vertical = Boolean(raw.vertical);
    if (raw.textAnchor && typeof raw.textAnchor === 'object') {
        block.textAnchor = {
            x: typeof raw.textAnchor.x === 'number' && !isNaN(raw.textAnchor.x) ? raw.textAnchor.x : 0,
            y: typeof raw.textAnchor.y === 'number' && !isNaN(raw.textAnchor.y) ? raw.textAnchor.y : 0
        };
    }
    if (raw.positionKnown !== undefined) block.positionKnown = Boolean(raw.positionKnown);
    if (raw.imageUrl !== undefined && raw.imageUrl !== null) block.imageUrl = String(raw.imageUrl);
    if (raw.originalBackgroundBackup !== undefined) block.originalBackgroundBackup = String(raw.originalBackgroundBackup);
    if (typeof raw.textWidth === 'number' && !isNaN(raw.textWidth)) block.textWidth = raw.textWidth;
    if (typeof raw.textHeight === 'number' && !isNaN(raw.textHeight)) block.textHeight = raw.textHeight;

    return block;
}

export function cloneBlock(block: MangaBlock, includeRuntimeCache = false): MangaBlock {
    const cloned: MangaBlock = {
        id: block.id,
        type: block.type || 'dialogue',
        imageUrl: block.imageUrl,
        original: block.original || '',
        translated: block.translated || '',
        box: { ...block.box },
        style: cloneStyle(block.style),
        speaker: block.speaker,
        target: block.target,
        vertical: block.vertical,
        textAnchor: block.textAnchor ? { ...block.textAnchor } : undefined,
        positionKnown: block.positionKnown,
        originalBackgroundBackup: block.originalBackgroundBackup,
        textWidth: block.textWidth,
        textHeight: block.textHeight
    };

    if (includeRuntimeCache) {
        if (block.maskCache) cloned.maskCache = block.maskCache;
        if (block.autoFitCache) cloned.autoFitCache = { ...block.autoFitCache };
        if (block._derivedLines) cloned._derivedLines = block._derivedLines;
        if (block._derivedLinesCache) cloned._derivedLinesCache = block._derivedLinesCache;
    }

    return cloned;
}

export function cleanBlockForPersistence(block: MangaBlock): any {
    const clean: any = {
        id: block.id,
        type: block.type || 'dialogue',
        imageUrl: block.imageUrl || null,
        original: block.original || '',
        translated: block.translated || '',
        box: block.box ? { ...block.box } : { x: 0, y: 0, w: 10, h: 10 },
        style: block.style ? { ...block.style } : {}
    };

    if (block.speaker !== undefined) clean.speaker = block.speaker;
    if (block.target !== undefined) clean.target = block.target;
    if (block.vertical !== undefined) clean.vertical = block.vertical;
    if (block.textAnchor !== undefined) clean.textAnchor = { ...block.textAnchor };
    if (block.positionKnown !== undefined) clean.positionKnown = block.positionKnown;
    if (block.originalBackgroundBackup !== undefined) clean.originalBackgroundBackup = block.originalBackgroundBackup;
    if (block.textWidth !== undefined) clean.textWidth = block.textWidth;
    if (block.textHeight !== undefined) clean.textHeight = block.textHeight;

    return clean;
}

export function validateBlock(block: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!block || typeof block !== 'object') {
        return { valid: false, errors: ['Block must be an object'] };
    }
    if (!block.id || typeof block.id !== 'string') {
        errors.push('Block missing valid string id');
    }
    if (!block.box || typeof block.box !== 'object') {
        errors.push('Block missing bounding box');
    } else {
        if (typeof block.box.x !== 'number' || isNaN(block.box.x)) errors.push('box.x must be a number');
        if (typeof block.box.y !== 'number' || isNaN(block.box.y)) errors.push('box.y must be a number');
        if (typeof block.box.w !== 'number' || isNaN(block.box.w) || block.box.w <= 0) errors.push('box.w must be positive number');
        if (typeof block.box.h !== 'number' || isNaN(block.box.h) || block.box.h <= 0) errors.push('box.h must be positive number');
    }
    return { valid: errors.length === 0, errors };
}
