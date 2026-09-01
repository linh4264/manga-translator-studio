/**
 * Manga Translator Studio - Document Model: BlockStyle
 * Provides schema validation, factories, normalizers, and cloning helpers for BlockStyle.
 */
import { BlockStyle } from '../../types/index';
import { DEFAULT_BLOCK_STYLE } from '../../config/constants';

export function createDefaultStyle(partial?: Partial<BlockStyle>): BlockStyle {
    return {
        ...DEFAULT_BLOCK_STYLE,
        ...(partial || {})
    };
}

export function normalizeStyle(raw?: any): BlockStyle {
    if (!raw || typeof raw !== 'object') {
        return createDefaultStyle();
    }

    const fontFamily = raw.fontFamily || raw.font || DEFAULT_BLOCK_STYLE.fontFamily;
    const fontSize = (typeof raw.fontSize === 'number' && !isNaN(raw.fontSize) && raw.fontSize > 0)
        ? raw.fontSize
        : DEFAULT_BLOCK_STYLE.fontSize;
    const lineHeight = (typeof raw.lineHeight === 'number' && !isNaN(raw.lineHeight) && raw.lineHeight > 0)
        ? raw.lineHeight
        : DEFAULT_BLOCK_STYLE.lineHeight;
    const letterSpacing = (typeof raw.letterSpacing === 'number' && !isNaN(raw.letterSpacing))
        ? raw.letterSpacing
        : (DEFAULT_BLOCK_STYLE.letterSpacing || 0);

    const textColor = raw.textColor || raw.textColorHex || DEFAULT_BLOCK_STYLE.textColor;
    const bgColor = raw.bgColor || raw.bgColorHex || DEFAULT_BLOCK_STYLE.bgColor;
    const strokeColor = raw.strokeColor || raw.strokeColorHex || DEFAULT_BLOCK_STYLE.strokeColor;
    const strokeColor2 = raw.strokeColor2 || raw.strokeColor2Hex || DEFAULT_BLOCK_STYLE.strokeColor2;
    const shadowColor = raw.shadowColor || raw.shadowColorHex || DEFAULT_BLOCK_STYLE.shadowColor;

    return {
        ...DEFAULT_BLOCK_STYLE,
        ...raw,
        fontFamily,
        font: fontFamily,
        fontSize,
        lineHeight,
        letterSpacing,
        textColor,
        textColorHex: textColor,
        bgColor,
        bgColorHex: bgColor,
        bgOpacity: typeof raw.bgOpacity === 'number' ? Math.max(0, Math.min(100, raw.bgOpacity)) : DEFAULT_BLOCK_STYLE.bgOpacity,
        padding: raw.padding !== undefined ? raw.padding : DEFAULT_BLOCK_STYLE.padding,
        rotate: typeof raw.rotate === 'number' && !isNaN(raw.rotate) ? raw.rotate : 0,
        textRotate: typeof raw.textRotate === 'number' && !isNaN(raw.textRotate) ? raw.textRotate : 0,
        textOffsetX: typeof raw.textOffsetX === 'number' && !isNaN(raw.textOffsetX) ? raw.textOffsetX : 0,
        textOffsetY: typeof raw.textOffsetY === 'number' && !isNaN(raw.textOffsetY) ? raw.textOffsetY : 0,
        vertical: Boolean(raw.vertical),
        bold: Boolean(raw.bold),
        italic: Boolean(raw.italic),
        underline: Boolean(raw.underline),
        align: ['left', 'center', 'right'].includes(raw.align) ? raw.align : 'center',
        maskShape: ['bubble-fit', 'ellipse', 'rounded', 'rectangle', 'rect', 'none'].includes(raw.maskShape) ? raw.maskShape : 'bubble-fit',
        maskSize: raw.maskSize === 'snug' ? 'snug' : 'full',
        strokeColor,
        strokeColorHex: strokeColor,
        strokeWidth: typeof raw.strokeWidth === 'number' && !isNaN(raw.strokeWidth) ? Math.max(0, raw.strokeWidth) : 0,
        strokeColor2,
        strokeColor2Hex: strokeColor2,
        strokeWidth2: typeof raw.strokeWidth2 === 'number' && !isNaN(raw.strokeWidth2) ? Math.max(0, raw.strokeWidth2) : 0,
        shadowColor,
        shadowColorHex: shadowColor,
        shadowBlur: typeof raw.shadowBlur === 'number' && !isNaN(raw.shadowBlur) ? Math.max(0, raw.shadowBlur) : 0,
        shadowOffsetX: typeof raw.shadowOffsetX === 'number' && !isNaN(raw.shadowOffsetX) ? raw.shadowOffsetX : 0,
        shadowOffsetY: typeof raw.shadowOffsetY === 'number' && !isNaN(raw.shadowOffsetY) ? raw.shadowOffsetY : 0,
        arcAngle: typeof raw.arcAngle === 'number' && !isNaN(raw.arcAngle) ? raw.arcAngle : 0,
        skewX: typeof raw.skewX === 'number' && !isNaN(raw.skewX) ? raw.skewX : 0,
        skewY: typeof raw.skewY === 'number' && !isNaN(raw.skewY) ? raw.skewY : 0,
        warpWave: typeof raw.warpWave === 'number' && !isNaN(raw.warpWave) ? raw.warpWave : 0,
        warpBulge: typeof raw.warpBulge === 'number' && !isNaN(raw.warpBulge) ? raw.warpBulge : 0
    };
}

export function cloneStyle(style: BlockStyle): BlockStyle {
    return { ...style };
}

export function mergeStyles(base: BlockStyle, override?: Partial<BlockStyle>): BlockStyle {
    if (!override) return cloneStyle(base);
    return normalizeStyle({ ...base, ...override });
}
