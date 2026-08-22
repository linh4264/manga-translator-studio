import { MangaBlock, BlockStyle } from '../../types/index';
import { parseRichTextLines, segmentString, transformCase, RichTextSegment } from '../../core/utils';

export const BUILTIN_FONT_MAP: Record<string, string> = {
    'font-comic': "'Patrick Hand', 'Pangolin', cursive",
    'font-manga': "'Nunito', sans-serif",
    'font-vietnamese': "'Be Vietnam Pro', 'Inter', sans-serif",
    'font-comicneue': "'Comic Neue', cursive",
    'font-impact': "'Bangers', cursive",
    'font-marker': "'Permanent Marker', cursive",
    'font-bungee': "'Bungee', cursive",
    'font-caveat': "'Caveat', cursive",
    'font-tech': "'Chakra Petch', sans-serif",
    'font-condensed': "'Saira Condensed', sans-serif",
    'font-sans': 'sans-serif',
    'comic': "'Patrick Hand', 'Pangolin', cursive",
    'manga': "'Nunito', sans-serif",
    'vietnamese': "'Be Vietnam Pro', 'Inter', sans-serif",
    'comicneue': "'Comic Neue', cursive",
    'impact': "'Bangers', cursive",
    'marker': "'Permanent Marker', cursive",
    'bungee': "'Bungee', cursive",
    'caveat': "'Caveat', cursive",
    'tech': "'Chakra Petch', sans-serif",
    'condensed': "'Saira Condensed', sans-serif",
    'sans': 'sans-serif',
    'patrick hand': "'Patrick Hand', 'Pangolin', cursive",
    'nunito': "'Nunito', sans-serif",
    'be vietnam pro': "'Be Vietnam Pro', 'Inter', sans-serif",
    'comic neue': "'Comic Neue', cursive",
    'bangers': "'Bangers', cursive",
    'permanent marker': "'Permanent Marker', cursive",
    'chakra petch': "'Chakra Petch', sans-serif",
    'saira condensed': "'Saira Condensed', sans-serif",
    'inter': "'Inter', sans-serif",
    'pangolin': "'Pangolin', cursive"
};

export function getFontFamilyName(fontKey?: string): string {
    if (!fontKey) return "'Nunito', sans-serif";
    const cleanFont = String(fontKey).trim();
    if (!cleanFont) return "'Nunito', sans-serif";
    const lower = cleanFont.toLowerCase();
    if (BUILTIN_FONT_MAP[cleanFont]) return BUILTIN_FONT_MAP[cleanFont];
    if (BUILTIN_FONT_MAP[lower]) return BUILTIN_FONT_MAP[lower];
    const stripped = cleanFont.replace(/^font-/, '');
    const strippedLower = stripped.toLowerCase();
    if (BUILTIN_FONT_MAP[stripped]) return BUILTIN_FONT_MAP[stripped];
    if (BUILTIN_FONT_MAP[strippedLower]) return BUILTIN_FONT_MAP[strippedLower];
    if (cleanFont.includes(',') || cleanFont.startsWith("'") || cleanFont.startsWith('"')) {
        return cleanFont;
    }
    return `'${cleanFont}', '${stripped}', 'Nunito', sans-serif`;
}

let sharedMeasureCanvas: HTMLCanvasElement | null = null;
let sharedMeasureCtx: CanvasRenderingContext2D | null = null;

export function getSharedMeasureContext(): CanvasRenderingContext2D | null {
    if (sharedMeasureCtx) return sharedMeasureCtx;
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        try {
            sharedMeasureCanvas = document.createElement('canvas');
            sharedMeasureCtx = sharedMeasureCanvas.getContext('2d');
            return sharedMeasureCtx;
        } catch {
            return null;
        }
    }
    return null;
}

export function buildFontString(
    style: {
        italic?: boolean;
        bold?: boolean;
        fontSize?: number;
        sizeRatio?: number;
        font?: string | null;
        fontFamily?: string | null;
    } = {},
    baseFontSize: number = 16,
    baseFontFamily: string = 'sans-serif'
): string {
    const fontStyle = style.italic ? 'italic ' : '';
    const fontWeight = style.bold ? 'bold ' : '';
    const sizeRatio = typeof style.sizeRatio === 'number' ? style.sizeRatio : 1.0;
    const fontSize = Math.max(1, Math.round((style.fontSize || baseFontSize) * sizeRatio));
    let fontFam = style.font || style.fontFamily || baseFontFamily || 'sans-serif';
    fontFam = getFontFamilyName(fontFam);
    return `${fontStyle}${fontWeight}${fontSize}px ${fontFam}`.trim();
}

export interface TextLayoutInput {
    text: string;
    boxWidth: number;
    boxHeight: number;
    fontFamily?: string;
    fontSize?: number;
    baseFontSize?: number;
    lineHeight?: number;
    letterSpacing?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    textColor?: string;
    align?: 'left' | 'center' | 'right';
    textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
    vertical?: boolean;
    padding?: number | string;
    strokeWidth?: number;
    strokeWidth2?: number;
    maskShape?: string;
    arcAngle?: number;
    skewX?: number;
    skewY?: number;
    warpWave?: number;
    warpBulge?: number;
}

export interface LayoutLine {
    tokens: RichTextSegment[];
    text: string;
    width: number;
    height: number;
    top: number;
    centerY: number;
    baselineY: number;
    ascent: number;
    descent: number;
    rawChars?: Array<{ char: string; token: RichTextSegment }>;
}

export interface LayoutLineRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface TextLayoutResult {
    lines: LayoutLine[];
    lineRects: LayoutLineRect[];
    textWidth: number;
    textHeight: number;
    totalWidth: number;
    totalHeight: number;
    overflowing: boolean;
    overflowX: boolean;
    overflowY: boolean;
    fontSize: number;
    fontSizePx: number;
    lineHeightPx: number;
    letterSpacingPx: number;
    padXPx: number;
    padYPx: number;
    availableWidth: number;
    availableHeight: number;
    isVertical: boolean;
    align: 'left' | 'center' | 'right';
    fontName: string;
    getFontFn: (tok: any) => string;
    // Bounding box in reference coordinate space
    bx?: number;
    by?: number;
    bw?: number;
    bh?: number;
    blockCenterX?: number;
    blockCenterY?: number;
    textCenterX?: number;
    textCenterY?: number;
}

export interface MeasuredTokenWord {
    text: string;
    tokens: RichTextSegment[];
    width: number;
    spaceWidth: number;
    hasTrailingPunct: boolean;
    hasLeadingPunct: boolean;
}

/**
 * Merges adjacent tokens with identical styling properties into a single token.
 */
export function mergeAdjacentIdenticalTokens(tokens: RichTextSegment[]): RichTextSegment[] {
    if (!tokens || tokens.length <= 1) return tokens;
    const merged: RichTextSegment[] = [];
    tokens.forEach(tok => {
        if (!tok.text) return;
        if (merged.length > 0) {
            const prev = merged[merged.length - 1];
            if (
                prev.bold === tok.bold &&
                prev.italic === tok.italic &&
                prev.underline === tok.underline &&
                prev.strikethrough === tok.strikethrough &&
                prev.color === tok.color &&
                prev.sizeRatio === tok.sizeRatio &&
                prev.font === tok.font
            ) {
                prev.text += tok.text;
                return;
            }
        }
        merged.push({ ...tok });
    });
    return merged;
}

/**
 * Measures the width of a styled text segment with letter spacing and font metrics.
 */
export function measureStyledSegmentWidth(
    segText: string,
    tok: RichTextSegment,
    fontSizePx: number,
    letterSpacingPx: number,
    baseFontFamily: string,
    ctx: CanvasRenderingContext2D | null
): number {
    if (!segText) return 0;
    const effLetterSpacing = letterSpacingPx * (tok.sizeRatio || 1.0);
    const charCount = Array.from(segText).length;
    const extraSpacing = Math.max(0, charCount - 1) * effLetterSpacing;

    if (ctx) {
        const prevFont = ctx.font;
        const tokFontStr = buildFontString({
            bold: !!tok.bold,
            italic: !!tok.italic,
            sizeRatio: tok.sizeRatio || 1.0,
            font: tok.font,
            fontFamily: tok.font || baseFontFamily,
            fontSize: fontSizePx
        }, fontSizePx, baseFontFamily);
        ctx.font = tokFontStr;
        const w = ctx.measureText(segText).width;
        ctx.font = prevFont;
        if (w > 0) {
            return w + extraSpacing;
        }
    }

    const tokSize = fontSizePx * (tok.sizeRatio || 1.0);
    return charCount * (tokSize * 0.55) + extraSpacing;
}

/**
 * Tokenizes a line of RichTextSegments into cohesive word units,
 * keeping punctuation attached properly.
 */
export function extractStyledWordsFromTokens(
    lineTokens: RichTextSegment[],
    fontSizePx: number,
    letterSpacingPx: number,
    baseFontFamily: string,
    ctx: CanvasRenderingContext2D | null
): MeasuredTokenWord[] {
    if (!lineTokens || lineTokens.length === 0) return [];

    interface RawChunk {
        text: string;
        isSpace: boolean;
        tok: RichTextSegment;
    }
    const rawChunks: RawChunk[] = [];

    lineTokens.forEach(tok => {
        if (!tok.text) return;
        const chunks = tok.text.split(/(\s+)/);
        chunks.forEach(chunk => {
            if (!chunk) return;
            const isSpace = /^\s+$/.test(chunk);
            rawChunks.push({ text: chunk, isSpace, tok });
        });
    });

    if (rawChunks.length === 0) return [];

    const words: MeasuredTokenWord[] = [];
    let currentWordTokens: RichTextSegment[] = [];
    let currentWordText = '';
    let currentWordWidth = 0;
    let pendingSpaceWidth = 0;

    const finalizeCurrentWord = () => {
        if (currentWordTokens.length > 0) {
            const hasTrailingPunct = /[.,!?:;~～…\-)\]”’]$/.test(currentWordText);
            const hasLeadingPunct = /^[(\[“‘]/.test(currentWordText);
            words.push({
                text: currentWordText,
                tokens: mergeAdjacentIdenticalTokens(currentWordTokens),
                width: Math.max(1, currentWordWidth),
                spaceWidth: Math.max(0, pendingSpaceWidth),
                hasTrailingPunct,
                hasLeadingPunct
            });
            currentWordTokens = [];
            currentWordText = '';
            currentWordWidth = 0;
            pendingSpaceWidth = 0;
        }
    };

    for (let i = 0; i < rawChunks.length; i++) {
        const item = rawChunks[i];
        if (item.isSpace) {
            const sw = measureStyledSegmentWidth(' ', item.tok, fontSizePx, letterSpacingPx, baseFontFamily, ctx);
            finalizeCurrentWord();
            pendingSpaceWidth = sw || (fontSizePx * 0.3);
        } else {
            const segW = measureStyledSegmentWidth(item.text, item.tok, fontSizePx, letterSpacingPx, baseFontFamily, ctx);
            const subTok: RichTextSegment = {
                ...item.tok,
                text: item.text
            };
            currentWordTokens.push(subTok);
            currentWordText += item.text;
            currentWordWidth += segW;
        }
    }
    finalizeCurrentWord();

    const mergedWords: MeasuredTokenWord[] = [];
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const isPureTrailing = /^[.,!?:;~～…\-)\]”’]+$/.test(w.text);
        if (isPureTrailing && mergedWords.length > 0) {
            const prev = mergedWords[mergedWords.length - 1];
            prev.text += w.text;
            prev.width += w.width;
            prev.tokens.push(...w.tokens);
            prev.tokens = mergeAdjacentIdenticalTokens(prev.tokens);
            prev.hasTrailingPunct = true;
            continue;
        }

        const isPureOpening = /^[(\[“‘]+$/.test(w.text);
        if (isPureOpening && i + 1 < words.length) {
            const next = words[i + 1];
            next.text = w.text + next.text;
            next.width += w.width;
            next.tokens.unshift(...w.tokens);
            next.tokens = mergeAdjacentIdenticalTokens(next.tokens);
            next.hasLeadingPunct = true;
            continue;
        }

        mergedWords.push(w);
    }

    return mergedWords;
}

/**
 * Splits an oversized word that exceeds available width into smaller sub-word chunks (character-level break fallback).
 */
export function breakLongWordToFit(
    word: MeasuredTokenWord,
    maxW: number,
    fontSizePx: number,
    letterSpacingPx: number,
    baseFontFamily: string,
    ctx: CanvasRenderingContext2D | null
): MeasuredTokenWord[] {
    if (word.width <= maxW || maxW <= 0) return [word];

    const subWords: MeasuredTokenWord[] = [];
    let currentToks: RichTextSegment[] = [];
    let currentText = '';
    let currentWidth = 0;

    const defaultSpaceWidth = measureStyledSegmentWidth(' ', word.tokens[0] || {} as any, fontSizePx, letterSpacingPx, baseFontFamily, ctx) || (fontSizePx * 0.3);

    word.tokens.forEach(tok => {
        const segs = segmentString(tok.text);
        segs.forEach(char => {
            const charTok: RichTextSegment = { ...tok, text: char };
            const charW = measureStyledSegmentWidth(char, tok, fontSizePx, letterSpacingPx, baseFontFamily, ctx);

            if (currentToks.length > 0 && currentWidth + charW > maxW) {
                subWords.push({
                    text: currentText,
                    tokens: mergeAdjacentIdenticalTokens(currentToks),
                    width: currentWidth,
                    spaceWidth: defaultSpaceWidth,
                    hasTrailingPunct: false,
                    hasLeadingPunct: false
                });
                currentToks = [charTok];
                currentText = char;
                currentWidth = charW;
            } else {
                currentToks.push(charTok);
                currentText += char;
                currentWidth += charW;
            }
        });
    });

    if (currentToks.length > 0) {
        subWords.push({
            text: currentText,
            tokens: mergeAdjacentIdenticalTokens(currentToks),
            width: currentWidth,
            spaceWidth: word.spaceWidth || defaultSpaceWidth,
            hasTrailingPunct: word.hasTrailingPunct,
            hasLeadingPunct: word.hasLeadingPunct
        });
    }

    return subWords.length > 0 ? subWords : [word];
}

/**
 * Greedy wrapping as the foundational baseline.
 */
export function wrapWordsGreedy(
    words: MeasuredTokenWord[],
    maxW: number,
    avgSpaceW: number
): MeasuredTokenWord[][] {
    const lines: MeasuredTokenWord[][] = [];
    let currentLine: MeasuredTokenWord[] = [];
    let currentLineWidth = 0;

    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const spaceW = currentLine.length > 0 ? (w.spaceWidth || avgSpaceW) : 0;
        const testWidth = currentLineWidth + spaceW + w.width;

        if (currentLine.length === 0) {
            currentLine.push(w);
            currentLineWidth = w.width;
        } else if (testWidth <= maxW + 2) {
            currentLine.push(w);
            currentLineWidth += spaceW + w.width;
        } else {
            lines.push(currentLine);
            currentLine = [w];
            currentLineWidth = w.width;
        }
    }

    if (currentLine.length > 0) {
        lines.push(currentLine);
    }

    return lines;
}

/**
 * Canva-style Balanced Line Breaking:
 * Given K target lines, partitions words so that line widths are balanced and within maxW,
 * avoiding single-word orphan lines without forcing artificial shapes.
 */
export function partitionWordsBalanced(
    words: MeasuredTokenWord[],
    k: number,
    maxW: number,
    avgSpaceW: number
): MeasuredTokenWord[][] {
    const n = words.length;
    if (k <= 1 || n <= 1) return [words];
    if (k >= n) return words.map(w => [w]);

    const prefixW = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
        prefixW[i + 1] = prefixW[i] + words[i].width;
    }

    const totalTextWidth = prefixW[n] + (n - 1) * avgSpaceW;
    const targetW = Math.min(maxW, totalTextWidth / k);

    const getLineWidth = (start: number, end: number): number => {
        if (start >= end) return 0;
        const wordsW = prefixW[end] - prefixW[start];
        const spacesW = (end - start - 1) * avgSpaceW;
        return wordsW + spacesW;
    };

    const dp: number[][] = Array.from({ length: k + 1 }, () => Array(n + 1).fill(Infinity));
    const parent: number[][] = Array.from({ length: k + 1 }, () => Array(n + 1).fill(-1));

    dp[0][0] = 0;

    for (let line = 1; line <= k; line++) {
        const isLastLine = (line === k);
        const isFirstLine = (line === 1);

        for (let i = line; i <= n - (k - line); i++) {
            for (let p = line - 1; p < i; p++) {
                if (dp[line - 1][p] === Infinity) continue;

                const actualW = getLineWidth(p, i);
                const wordCountInLine = i - p;
                if (wordCountInLine <= 0) continue;

                let cost = 0;

                // Priority 2: Balanced line widths (variance penalty relative to target width)
                const diff = (actualW - targetW) / Math.max(1, targetW);
                cost += diff * diff * 1000;

                // Hard limit penalty for overflowing max available width
                if (actualW > maxW + 2) {
                    const overflow = actualW - maxW;
                    cost += 50000 + overflow * 500;
                }

                // Anti-orphan penalty: avoid 1-word lines if there are enough words (n >= 4)
                if (wordCountInLine === 1 && n >= 4) {
                    if (isLastLine) {
                        cost += 3000;
                    } else if (isFirstLine) {
                        cost += 2000;
                    } else {
                        cost += 1500;
                    }
                }

                const totalCost = dp[line - 1][p] + cost;
                if (totalCost < dp[line][i]) {
                    dp[line][i] = totalCost;
                    parent[line][i] = p;
                }
            }
        }
    }

    if (dp[k][n] === Infinity) {
        return wrapWordsGreedy(words, maxW, avgSpaceW);
    }

    const resultLines: MeasuredTokenWord[][] = [];
    let curr = n;
    for (let line = k; line >= 1; line--) {
        const p = parent[line][curr];
        if (p === -1) break;
        resultLines.unshift(words.slice(p, curr));
        curr = p;
    }

    if (resultLines.length === 0 || curr > 0) {
        return wrapWordsGreedy(words, maxW, avgSpaceW);
    }

    const anyOverflow = resultLines.some(l => {
        const lineW = l.reduce((s, w) => s + w.width, 0) + (l.length - 1) * avgSpaceW;
        return lineW > maxW + 3;
    });

    if (anyOverflow) {
        return wrapWordsGreedy(words, maxW, avgSpaceW);
    }

    return resultLines;
}

/**
 * Combines Priority 1 (Word Wrapping), Priority 2 (Balanced Line Breaks), and Priority 3 (Long Word Fallback).
 */
export function wrapParagraphCanva(
    paragraphTokens: RichTextSegment[],
    maxW: number,
    fontSizePx: number,
    letterSpacingPx: number,
    baseFontFamily: string,
    ctx: CanvasRenderingContext2D | null
): RichTextSegment[][] {
    if (!paragraphTokens || paragraphTokens.length === 0) return [[]];

    let words = extractStyledWordsFromTokens(paragraphTokens, fontSizePx, letterSpacingPx, baseFontFamily, ctx);
    if (words.length === 0) return [[]];

    const avgSpaceW = words.reduce((acc, w) => acc + (w.spaceWidth || 0), 0) / words.length || (fontSizePx * 0.3);

    const normalizedWords: MeasuredTokenWord[] = [];
    words.forEach(w => {
        if (w.width > maxW && maxW > 0) {
            const broken = breakLongWordToFit(w, maxW, fontSizePx, letterSpacingPx, baseFontFamily, ctx);
            normalizedWords.push(...broken);
        } else {
            normalizedWords.push(w);
        }
    });
    words = normalizedWords;

    if (words.length === 1) {
        return [mergeAdjacentIdenticalTokens(words[0].tokens)];
    }

    const totalW = words.reduce((sum, w) => sum + w.width, 0) + (words.length - 1) * avgSpaceW;
    if (totalW <= maxW + 2) {
        const flatToks: RichTextSegment[] = [];
        words.forEach((w, idx) => {
            if (idx > 0) {
                flatToks.push({
                    text: ' ',
                    bold: w.tokens[0]?.bold || false,
                    italic: w.tokens[0]?.italic || false,
                    underline: w.tokens[0]?.underline || false,
                    strikethrough: w.tokens[0]?.strikethrough || false,
                    color: w.tokens[0]?.color || null,
                    sizeRatio: w.tokens[0]?.sizeRatio || 1.0,
                    font: w.tokens[0]?.font || null
                });
            }
            flatToks.push(...w.tokens);
        });
        return [mergeAdjacentIdenticalTokens(flatToks)];
    }

    const greedyLines = wrapWordsGreedy(words, maxW, avgSpaceW);
    const k = greedyLines.length;

    let chosenWordLines: MeasuredTokenWord[][] = greedyLines;

    if (k >= 2 && words.length >= 3) {
        const balancedK = partitionWordsBalanced(words, k, maxW, avgSpaceW);
        chosenWordLines = balancedK;
    }

    const resultTokenLines: RichTextSegment[][] = [];

    chosenWordLines.forEach(lineWords => {
        const lineToks: RichTextSegment[] = [];
        lineWords.forEach((w, idx) => {
            if (idx > 0) {
                lineToks.push({
                    text: ' ',
                    bold: w.tokens[0]?.bold || false,
                    italic: w.tokens[0]?.italic || false,
                    underline: w.tokens[0]?.underline || false,
                    strikethrough: w.tokens[0]?.strikethrough || false,
                    color: w.tokens[0]?.color || null,
                    sizeRatio: w.tokens[0]?.sizeRatio || 1.0,
                    font: w.tokens[0]?.font || null
                });
            }
            lineToks.push(...w.tokens);
        });
        resultTokenLines.push(mergeAdjacentIdenticalTokens(lineToks));
    });

    return resultTokenLines.length > 0 ? resultTokenLines : [paragraphTokens];
}

/**
 * Main Layout Engine: Takes input block geometry & typography and computes derived visual lines.
 * Does NOT mutate the input text.
 */
export function computeTextLayout(
    input: TextLayoutInput,
    customCtx?: CanvasRenderingContext2D | null
): TextLayoutResult {
    const ctx = customCtx || getSharedMeasureContext();
    const rawText = input.text || '';
    const fontName = getFontFamilyName(input.fontFamily);
    const fontSize = Math.max(1, input.fontSize || 17);
    const lineHeight = input.lineHeight !== undefined ? input.lineHeight : 1.15;
    const lineHeightPx = fontSize * lineHeight;
    const letterSpacingPx = input.letterSpacing || 0;
    const isVertical = !!input.vertical;
    const align = input.align || 'center';

    const boxW = Math.max(1, input.boxWidth);
    const boxH = Math.max(1, input.boxHeight);

    let padXPx = 4;
    let padYPx = 4;
    if (typeof input.padding === 'string' && input.padding.includes('%')) {
        const parts = input.padding.trim().split(/\s+/);
        const pctY = parseFloat(parts[0]) || 9;
        const pctX = parseFloat(parts[1] || parts[0]) || 12;
        padYPx = boxH * (pctY / 100);
        padXPx = boxW * (pctX / 100);
    } else if (typeof input.padding === 'number') {
        padXPx = input.padding;
        padYPx = input.padding;
    }

    const strokeW = (input.strokeWidth || 0) + (input.strokeWidth2 || 0);
    const totalExtraBorder = strokeW * 2;
    const isEllipse = input.maskShape === 'ellipse' || input.maskShape === 'bubble-fit';
    const fitMargin = isEllipse ? 0.88 : 0.94;

    const availableWidth = Math.max(10, (boxW * fitMargin) - (padXPx * 2) - totalExtraBorder);
    const availableHeight = Math.max(10, (boxH * fitMargin) - (padYPx * 2) - totalExtraBorder);

    const getFontFn = (tok: any) => {
        const tokItalic = (tok.italic || (tok.italic === undefined && input.italic)) ? 'italic ' : '';
        const tokWeight = (tok.bold || (tok.bold === undefined && input.bold)) ? 'bold ' : '';
        const tokSize = fontSize * (tok.sizeRatio || 1.0);
        const tokFont = tok.font ? getFontFamilyName(tok.font) : fontName;
        return `${tokItalic}${tokWeight}${tokSize}px ${tokFont}`.trim();
    };

    const transformedText = transformCase(rawText, input.textTransform || 'none');

    const tokenParagraphs = parseRichTextLines(transformedText, {
        bold: !!input.bold,
        italic: !!input.italic,
        underline: !!input.underline,
        strikethrough: !!input.strikethrough
    });

    const lines: LayoutLine[] = [];
    const lineRects: LayoutLineRect[] = [];

    if (isVertical) {
        let maxColChars = 0;
        const columnData: Array<{ lineToks: RichTextSegment[]; rawChars: Array<{ char: string; token: RichTextSegment }> }> = [];

        tokenParagraphs.forEach(paraToks => {
            const rawChars: Array<{ char: string; token: RichTextSegment }> = [];
            paraToks.forEach(tok => {
                const segs = segmentString(tok.text);
                segs.forEach(s => rawChars.push({ char: s, token: tok }));
            });
            if (rawChars.length > maxColChars) maxColChars = rawChars.length;
            columnData.push({ lineToks: paraToks, rawChars });
        });

        const totalWidth = columnData.length * lineHeightPx;
        const totalHeight = maxColChars * lineHeightPx;
        const colStep = lineHeightPx;
        const charStep = lineHeightPx;

        columnData.forEach(({ lineToks, rawChars }, colIdx) => {
            const colHeight = rawChars.length * charStep;
            let colStartY = (boxH / 2) - (colHeight / 2);
            if (colStartY < padYPx) colStartY = padYPx;
            const colTop = colStartY;
            const colCenterY = (boxH / 2); // Exact vertical center of the box
            const colLeft = (boxW / 2) + (totalWidth / 2) - ((colIdx + 1) * colStep);

            const layoutLine: LayoutLine = {
                tokens: lineToks,
                text: lineToks.map(t => t.text).join(''),
                width: lineHeightPx,
                height: colHeight,
                top: colTop,
                centerY: colCenterY,
                baselineY: colCenterY,
                ascent: fontSize * 0.8,
                descent: fontSize * 0.2,
                rawChars
            };
            lines.push(layoutLine);
            lineRects.push({
                x: colLeft,
                y: colTop,
                width: lineHeightPx,
                height: colHeight
            });
        });

        const overflowX = totalWidth > availableWidth + 2;
        const overflowY = totalHeight > availableHeight + 2;

        return {
            lines,
            lineRects,
            textWidth: totalWidth,
            textHeight: totalHeight,
            totalWidth,
            totalHeight,
            overflowing: overflowX || overflowY,
            overflowX,
            overflowY,
            fontSize,
            fontSizePx: fontSize,
            lineHeightPx,
            letterSpacingPx,
            padXPx,
            padYPx,
            availableWidth,
            availableHeight,
            isVertical: true,
            align,
            fontName,
            getFontFn
        };
    }

    const allDerivedTokenLines: RichTextSegment[][] = [];

    tokenParagraphs.forEach((paraTokens) => {
        if (!paraTokens || paraTokens.length === 0 || (paraTokens.length === 1 && !paraTokens[0].text)) {
            allDerivedTokenLines.push([]);
            return;
        }

        const wrappedParaLines = wrapParagraphCanva(
            paraTokens,
            availableWidth,
            fontSize,
            letterSpacingPx,
            fontName,
            ctx
        );
        allDerivedTokenLines.push(...wrappedParaLines);
    });

    const hasCharWarp = (input.arcAngle || 0) !== 0 || (input.warpWave || 0) !== 0 || (input.warpBulge || 0) !== 0;
    let maxLineWidth = 0;
    const lineMeasurements: Array<{ lineToks: RichTextSegment[]; lineWidth: number; rawChars?: Array<{ char: string; token: RichTextSegment }> }> = [];

    allDerivedTokenLines.forEach(lineToks => {
        let lineWidth = 0;
        const rawChars: Array<{ char: string; token: RichTextSegment }> = [];

        lineToks.forEach(tok => {
            const segW = measureStyledSegmentWidth(tok.text, tok, fontSize, letterSpacingPx, fontName, ctx);
            lineWidth += segW;

            if (hasCharWarp) {
                const segs = segmentString(tok.text);
                segs.forEach(s => rawChars.push({ char: s, token: tok }));
            }
        });

        if (lineWidth > maxLineWidth) maxLineWidth = lineWidth;
        lineMeasurements.push({
            lineToks,
            lineWidth,
            rawChars: hasCharWarp ? rawChars : undefined
        });
    });

    const totalWidth = maxLineWidth;
    const totalHeight = lineMeasurements.length * lineHeightPx;

    let startY = (boxH / 2) - (totalHeight / 2);
    if (startY < padYPx) startY = padYPx;

    lineMeasurements.forEach(({ lineToks, lineWidth, rawChars }, i) => {
        const lineTop = startY + (i * lineHeightPx);
        const lineCenterY = lineTop + (lineHeightPx / 2);

        let lineLeft = padXPx;
        if (align === 'center') {
            lineLeft = (boxW / 2) - (lineWidth / 2);
        } else if (align === 'right') {
            lineLeft = boxW - padXPx - lineWidth;
        }

        lines.push({
            tokens: lineToks,
            text: lineToks.map(t => t.text).join(''),
            width: lineWidth,
            height: lineHeightPx,
            top: lineTop,
            centerY: lineCenterY,
            baselineY: lineCenterY,
            ascent: fontSize * 0.8,
            descent: fontSize * 0.2,
            rawChars
        });

        lineRects.push({
            x: lineLeft,
            y: lineTop,
            width: lineWidth,
            height: lineHeightPx
        });
    });

    const overflowX = totalWidth > availableWidth + 2;
    const overflowY = totalHeight > availableHeight + 2;

    return {
        lines,
        lineRects,
        textWidth: totalWidth,
        textHeight: totalHeight,
        totalWidth,
        totalHeight,
        overflowing: overflowX || overflowY,
        overflowX,
        overflowY,
        fontSize,
        fontSizePx: fontSize,
        lineHeightPx,
        letterSpacingPx,
        padXPx,
        padYPx,
        availableWidth,
        availableHeight,
        isVertical: false,
        align,
        fontName,
        getFontFn
    };
}

/**
 * High-level layout calculator for a MangaBlock within a given display or natural canvas dimension.
 */
export function computeBlockTextLayout(
    block: MangaBlock,
    displayW: number,
    displayH: number,
    scaleFactor: number = 1,
    ctx?: CanvasRenderingContext2D | null
): TextLayoutResult {
    const bw = (block.box.w / 100) * displayW;
    const bh = (block.box.h / 100) * displayH;
    const bx = (block.box.x / 100) * displayW;
    const by = (block.box.y / 100) * displayH;

    const currentFontSize = (block.style?.fontSize || 17) * scaleFactor;
    const currentLetterSpacing = (block.style?.letterSpacing || 0) * scaleFactor;
    const currentStrokeWidth = (block.style?.strokeWidth || 0) * scaleFactor;
    const currentStrokeWidth2 = (block.style?.strokeWidth2 || 0) * scaleFactor;

    let scaledPadding = block.style?.padding;
    if (typeof scaledPadding === 'number') {
        scaledPadding = scaledPadding * scaleFactor;
    }

    const layout = computeTextLayout({
        text: block.translated || '',
        boxWidth: bw,
        boxHeight: bh,
        fontFamily: block.style?.fontFamily,
        fontSize: currentFontSize,
        baseFontSize: (block.style?.baseFontSize || 17) * scaleFactor,
        lineHeight: block.style?.lineHeight,
        letterSpacing: currentLetterSpacing,
        bold: block.style?.bold,
        italic: block.style?.italic,
        underline: block.style?.underline,
        strikethrough: (block.style as any)?.strikethrough,
        textColor: block.style?.textColor,
        align: block.style?.align || 'center',
        textTransform: block.style?.textTransform || 'none',
        vertical: block.style?.vertical,
        padding: scaledPadding,
        strokeWidth: currentStrokeWidth,
        strokeWidth2: currentStrokeWidth2,
        maskShape: block.style?.maskShape || 'bubble-fit',
        arcAngle: block.style?.arcAngle || 0,
        skewX: block.style?.skewX || 0,
        skewY: block.style?.skewY || 0,
        warpWave: block.style?.warpWave || 0,
        warpBulge: block.style?.warpBulge || 0
    }, ctx);

    layout.bx = bx;
    layout.by = by;
    layout.bw = bw;
    layout.bh = bh;
    layout.blockCenterX = bx + (bw / 2);
    layout.blockCenterY = by + (bh / 2);
    layout.textCenterX = bx + (bw / 2);
    layout.textCenterY = by + (bh / 2); // Logical block center matches editor

    layout.lines.forEach((line, idx) => {
        line.top = by + line.top;
        line.centerY = by + line.centerY;
        line.baselineY = by + line.baselineY;
        if (layout.lineRects[idx]) {
            layout.lineRects[idx].x = bx + layout.lineRects[idx].x;
            layout.lineRects[idx].y = by + layout.lineRects[idx].y;
        }
    });

    return layout;
}

/**
 * Renders derived layout lines into a DOM element (editor overlays).
 */
export function renderDerivedLinesToDOM(
    target: HTMLElement | null,
    layout: TextLayoutResult,
    warpOpts: any = {}
): void {
    if (!target) return;
    target.textContent = '';
    const isVertical = layout.isVertical;

    const opts = typeof warpOpts === 'object' && warpOpts !== null ? warpOpts : {};
    const arcAngle = opts.arcAngle || 0;
    const skewX = opts.skewX || 0;
    const skewY = opts.skewY || 0;
    const warpWave = opts.warpWave || 0;
    const warpBulge = opts.warpBulge || 0;
    const letterSpacing = opts.letterSpacing !== undefined ? opts.letterSpacing : layout.letterSpacingPx;
    const isUnderline = !!opts.underline;

    layout.lines.forEach((line) => {
        const lineDiv = document.createElement('div');
        if (isVertical) {
            lineDiv.style.display = 'inline-block';
            lineDiv.style.writingMode = 'vertical-rl';
            lineDiv.style.textOrientation = 'upright';
            lineDiv.style.textAlign = target.style.textAlign || 'center';
            lineDiv.style.verticalAlign = 'top';
            lineDiv.style.whiteSpace = 'pre';
            lineDiv.style.wordBreak = 'keep-all';
            lineDiv.style.overflowWrap = 'normal';
            lineDiv.style.height = 'auto';
            lineDiv.style.width = 'auto';
        } else {
            lineDiv.style.width = '100%';
            lineDiv.style.maxWidth = '100%';
            lineDiv.style.boxSizing = 'border-box';
            lineDiv.style.height = 'auto';
            lineDiv.style.minHeight = '1em';
            lineDiv.style.display = 'block';
            lineDiv.style.textAlign = target.style.textAlign || 'center';
            lineDiv.style.whiteSpace = 'pre';
            lineDiv.style.wordBreak = 'keep-all';
            lineDiv.style.overflowWrap = 'normal';
        }
        lineDiv.style.margin = '0';
        lineDiv.style.padding = '0';
        lineDiv.style.hyphens = 'none';

        if (letterSpacing !== 0) {
            lineDiv.style.letterSpacing = `${letterSpacing}px`;
        }
        if (isUnderline) {
            lineDiv.style.textDecoration = 'underline';
            lineDiv.style.textUnderlineOffset = '3px';
        }
        if (skewX !== 0 || skewY !== 0) {
            lineDiv.style.transform = `skew(${skewX}deg, ${skewY}deg)`;
        }

        const hasCharWarp = (arcAngle !== 0) || (warpWave !== 0) || (warpBulge !== 0);

        if (isVertical) {
            const rawChars = line.rawChars || [];
            const count = rawChars.length;
            const arcDepth = (arcAngle / 45) * 8;
            const waveAmp = (warpWave / 50) * 10;
            const bulgeFactor = (warpBulge / 50) * 0.4;

            if (count === 0) {
                lineDiv.appendChild(document.createTextNode('\u00A0'));
            } else {
                rawChars.forEach(({ char: ch, token: tok }, idx) => {
                    const span = document.createElement('span');
                    span.style.display = 'inline-block';
                    span.style.lineHeight = 'inherit';
                    span.style.whiteSpace = 'pre';
                    span.textContent = ch;

                    if (tok.bold) span.style.fontWeight = 'bold';
                    if (tok.italic) span.style.fontStyle = 'italic';
                    if (tok.underline) span.style.textDecoration = 'underline';
                    if (tok.strikethrough) span.style.textDecoration = 'line-through';
                    if (tok.color) span.style.color = tok.color;
                    if (tok.sizeRatio && tok.sizeRatio !== 1) span.style.fontSize = `${tok.sizeRatio * 100}%`;
                    if (tok.font) span.style.fontFamily = `'${tok.font}', sans-serif`;

                    if (hasCharWarp && count > 1) {
                        const t = (idx - (count - 1) / 2) / ((count - 1) / 2);
                        const arcOffset = (1 - t * t) * -arcDepth;
                        const waveOffset = Math.sin(t * Math.PI) * waveAmp;
                        const totalOffset = arcOffset + waveOffset;
                        const rot = t * (arcAngle * 0.35);
                        const scale = 1 + (1 - t * t) * bulgeFactor;
                        span.style.transform = `translateX(${totalOffset}px) rotate(${rot}deg) scale(${scale})`;
                    } else if (ch === '…' || ch === '―' || ch === '—' || ch === '~' || ch === '～' || ch === '-') {
                        span.style.transform = 'rotate(90deg)';
                    }
                    lineDiv.appendChild(span);
                });
            }
        } else if (hasCharWarp && line.rawChars && line.rawChars.length > 1) {
            const rawChars = line.rawChars;
            const count = rawChars.length;
            const arcDepth = (arcAngle / 45) * 8;
            const waveAmp = (warpWave / 50) * 10;
            const bulgeFactor = (warpBulge / 50) * 0.4;

            rawChars.forEach(({ char: ch, token: tok }, idx) => {
                const span = document.createElement('span');
                span.style.display = 'inline-block';
                span.style.whiteSpace = 'pre';
                span.textContent = ch;

                if (tok.bold) span.style.fontWeight = 'bold';
                if (tok.italic) span.style.fontStyle = 'italic';
                if (tok.underline) span.style.textDecoration = 'underline';
                if (tok.strikethrough) span.style.textDecoration = 'line-through';
                if (tok.color) span.style.color = tok.color;
                if (tok.sizeRatio && tok.sizeRatio !== 1) span.style.fontSize = `${tok.sizeRatio * 100}%`;
                if (tok.font) span.style.fontFamily = `'${tok.font}', sans-serif`;

                const t = count > 1 ? (idx - (count - 1) / 2) / ((count - 1) / 2) : 0;
                const arcOffset = (1 - t * t) * -arcDepth;
                const waveOffset = Math.sin(t * Math.PI) * waveAmp;
                const totalOffset = arcOffset + waveOffset;
                const rot = t * (arcAngle * 0.35);
                const scale = 1 + (1 - t * t) * bulgeFactor;

                span.style.transform = `translateY(${totalOffset}px) rotate(${rot}deg) scale(${scale})`;
                lineDiv.appendChild(span);
            });
        } else {
            const tokens = line.tokens;
            if (tokens.length === 0 || (tokens.length === 1 && !tokens[0].text)) {
                lineDiv.textContent = '\u00A0';
            } else if (tokens.length === 1 && !tokens[0].bold && !tokens[0].italic && !tokens[0].underline && !tokens[0].strikethrough && !tokens[0].color && (!tokens[0].sizeRatio || tokens[0].sizeRatio === 1) && !tokens[0].font) {
                lineDiv.textContent = tokens[0].text;
            } else {
                tokens.forEach(tok => {
                    const span = document.createElement('span');
                    span.textContent = tok.text;
                    if (tok.bold) span.style.fontWeight = 'bold';
                    if (tok.italic) span.style.fontStyle = 'italic';
                    if (tok.underline) span.style.textDecoration = 'underline';
                    if (tok.strikethrough) span.style.textDecoration = 'line-through';
                    if (tok.color) span.style.color = tok.color;
                    if (tok.sizeRatio && tok.sizeRatio !== 1) span.style.fontSize = `${tok.sizeRatio * 100}%`;
                    if (tok.font) span.style.fontFamily = `'${tok.font}', sans-serif`;
                    lineDiv.appendChild(span);
                });
            }
        }

        target.appendChild(lineDiv);
    });
}

/**
 * Convenience function to compute and render a block's derived lines directly to a DOM element.
 */
export function renderBlockTextToDOM(
    target: HTMLElement | null,
    block: MangaBlock,
    displayW: number,
    displayH: number,
    zoomScale: number = 1,
    warpOpts: any = {}
): void {
    if (!target) return;
    const layout = computeBlockTextLayout(block, displayW, displayH, zoomScale);
    renderDerivedLinesToDOM(target, layout, warpOpts);
}
