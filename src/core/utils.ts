// General Utilities & JSON Repair for Manga Translator Studio
import { elements } from './elements';

export function escapeHTML(value: any): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
export const escapeHtml = escapeHTML;

export function transformCase(text: string, mode: string = 'none'): string {
    if (!text) return '';
    const str = String(text);
    if (mode === 'uppercase') return str.toUpperCase();
    if (mode === 'lowercase') return str.toLowerCase();
    if (mode === 'capitalize') {
        return str.replace(/(?:^|\s|\p{P})\p{L}/gu, match => match.toUpperCase());
    }
    return str;
}

export function cleanMangaPunctuation(text: string): string {
    if (!text) return '';
    let cleaned = String(text);

    // 1. Chuẩn hóa dấu ba chấm: 2 hoặc 4+ dấu chấm -> 3 dấu chấm hoặc ký tự ellipse
    cleaned = cleaned.replace(/\.{4,}/g, '...').replace(/(?<!\.)\.\.(?!\.)/g, '...');

    // 2. Chuẩn hóa khoảng trắng trước các dấu câu phổ biến
    cleaned = cleaned.replace(/\s+([,.\!?:;~～])/g, '$1');

    // 3. Chuẩn hóa cụm dấu chấm than / hỏi: ??? -> ?, !!! -> !, ??! -> ?!
    cleaned = cleaned.replace(/\?{2,}/g, '?!').replace(/\!{2,}/g, '!!');

    // 4. Chuẩn hóa ngoặc góc tiếng Nhật sang ngoặc kép chuẩn
    cleaned = cleaned.replace(/「\s*/g, '“').replace(/\s*」/g, '”');
    cleaned = cleaned.replace(/『\s*/g, '‘').replace(/\s*』/g, '’');

    // 5. Chuẩn hóa khoảng trắng kép giữa các từ
    cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');

    return cleaned.trim();
}

const cachedSegmenter = (typeof Intl !== 'undefined' && (Intl as any).Segmenter) ? new (Intl as any).Segmenter() : null;

export function segmentString(str: string): string[] {
    if (!str) return [];
    if (cachedSegmenter) {
        return Array.from(cachedSegmenter.segment(str)).map((s: any) => s.segment);
    }
    return Array.from(str);
}

/**
 * Check if text contains Rich Text formatting (Markdown or BBCode)
 */
export function hasRichTextTags(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    return /(\*\*.*?\*\*|\*[^*]+?\*|__.*?__|_.*?_|~~.*?~~|\[\/?(?:b|i|u|s|color|size|font)(?:=[^\]]+)?\])/i.test(text);
}

/**
 * Strip all Rich Text formatting tags, returning plain text
 */
export function stripRichTextTags(text: string): string {
    if (!text || typeof text !== 'string') return '';
    let clean = text;
    // Replace markdown
    clean = clean.replace(/\*\*(.*?)\*\*/g, '$1');
    clean = clean.replace(/__([^_]+?)__/g, '$1');
    clean = clean.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '$1');
    clean = clean.replace(/(?<!_)_([^_]+?)_(?!_)/g, '$1');
    clean = clean.replace(/~~(.*?)~~/g, '$1');
    // Replace BBCode
    clean = clean.replace(/\[\/?(?:b|i|u|s|color|size|font)(?:=[^\]]+)?\]/gi, '');
    return clean;
}

export interface RichTextSegment {
    text: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
    color: string | null;
    sizeRatio: number;
    font: string | null;
}

/**
 * Convert Markdown and BBCode into an array of lines, where each line is an array of styled segments.
 */
export function parseRichTextLines(text: string, baseStyle: any = {}): RichTextSegment[][] {
    if (!text || typeof text !== 'string') return [[]];

    let normalized = text;
    // Normalize markdown into BBCode
    normalized = normalized.replace(/\*\*(.*?)\*\*/gs, '[b]$1[/b]');
    normalized = normalized.replace(/__([^_]+?)__/gs, '[b]$1[/b]');
    normalized = normalized.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/gs, '[i]$1[/i]');
    normalized = normalized.replace(/(?<!_)_([^_]+?)_(?!_)/gs, '[i]$1[/i]');
    normalized = normalized.replace(/~~(.*?)~~/gs, '[s]$1[/s]');

    const tagRegex = /(\[\/?(?:b|i|u|s|color|size|font)(?:=[^\]]+)?\])/gi;
    const parts = normalized.split(tagRegex);

    let boldCount = baseStyle.bold ? 1 : 0;
    let italicCount = baseStyle.italic ? 1 : 0;
    let underlineCount = baseStyle.underline ? 1 : 0;
    let strikethroughCount = baseStyle.strikethrough ? 1 : 0;
    const colorStack: string[] = baseStyle.color ? [baseStyle.color] : [];
    const sizeStack: number[] = baseStyle.sizeRatio ? [baseStyle.sizeRatio] : [];
    const fontStack: string[] = baseStyle.font ? [baseStyle.font] : [];

    const lines: RichTextSegment[][] = [[]];

    for (const part of parts) {
        if (!part) continue;

        const lower = part.toLowerCase();
        if (lower.startsWith('[') && lower.endsWith(']')) {
            if (lower === '[b]') {
                boldCount++;
            } else if (lower === '[/b]') {
                boldCount = Math.max(0, boldCount - 1);
            } else if (lower === '[i]') {
                italicCount++;
            } else if (lower === '[/i]') {
                italicCount = Math.max(0, italicCount - 1);
            } else if (lower === '[u]') {
                underlineCount++;
            } else if (lower === '[/u]') {
                underlineCount = Math.max(0, underlineCount - 1);
            } else if (lower === '[s]') {
                strikethroughCount++;
            } else if (lower === '[/s]') {
                strikethroughCount = Math.max(0, strikethroughCount - 1);
            } else if (lower.startsWith('[color=')) {
                const colorVal = part.slice(7, -1).trim();
                colorStack.push(colorVal);
            } else if (lower === '[/color]') {
                colorStack.pop();
            } else if (lower.startsWith('[size=')) {
                const sizeVal = part.slice(6, -1).trim();
                let ratio = 1.0;
                if (sizeVal.endsWith('%')) {
                    ratio = (parseFloat(sizeVal) || 100) / 100;
                } else if (parseFloat(sizeVal) > 0) {
                    const num = parseFloat(sizeVal);
                    ratio = num > 5 ? (num / 16) : num;
                }
                sizeStack.push(ratio);
            } else if (lower === '[/size]') {
                sizeStack.pop();
            } else if (lower.startsWith('[font=')) {
                const fontVal = part.slice(6, -1).trim();
                fontStack.push(fontVal);
            } else if (lower === '[/font]') {
                fontStack.pop();
            }
        } else {
            const subLines = part.split('\n');
            for (let s = 0; s < subLines.length; s++) {
                if (s > 0) {
                    lines.push([]);
                }
                const subText = subLines[s];
                if (subText) {
                    lines[lines.length - 1].push({
                        text: subText,
                        bold: boldCount > 0,
                        italic: italicCount > 0,
                        underline: underlineCount > 0,
                        strikethrough: strikethroughCount > 0,
                        color: colorStack.length > 0 ? colorStack[colorStack.length - 1] : null,
                        sizeRatio: sizeStack.length > 0 ? sizeStack[sizeStack.length - 1] : 1.0,
                        font: fontStack.length > 0 ? fontStack[fontStack.length - 1] : null
                    });
                }
            }
        }
    }

    return lines;
}

/**
 * Convert Markdown and BBCode into a flat list of styled segments
 */
export function parseRichTextTokens(text: string, baseStyle: any = {}): RichTextSegment[] {
    if (!text || typeof text !== 'string') return [];
    const lines = parseRichTextLines(text, baseStyle);
    return lines.flat();
}

export function setMultilineText(target: HTMLElement | null, value: string, warpOptions: any = {}): void {
    if (!target) return;
    target.textContent = '';
    const isVertical = target.style.writingMode === 'vertical-rl' ||
        (typeof target.classList?.contains === 'function' && target.classList.contains('text-vertical')) ||
        (typeof target.className === 'string' && target.className.includes('text-vertical'));

    const opts = typeof warpOptions === 'object' && warpOptions !== null ? warpOptions : { arcAngle: Number(warpOptions) || 0 };
    const arcAngle = opts.arcAngle || 0;
    const skewX = opts.skewX || 0;
    const skewY = opts.skewY || 0;
    const warpWave = opts.warpWave || 0;
    const warpBulge = opts.warpBulge || 0;
    const textCase = opts.textTransform || 'none';
    const letterSpacing = opts.letterSpacing !== undefined ? opts.letterSpacing : 0;
    const isUnderline = !!opts.underline;

    const transformedText = transformCase(value, textCase);
    const tokenLines = parseRichTextLines(transformedText, { underline: isUnderline });

    tokenLines.forEach((tokens) => {
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
            lineDiv.style.minWidth = 'auto';
            lineDiv.style.minHeight = 'auto';
        } else {
            lineDiv.style.width = '100%';
            lineDiv.style.maxWidth = '100%';
            lineDiv.style.boxSizing = 'border-box';
            lineDiv.style.height = 'auto';
            lineDiv.style.minHeight = '1em';
            lineDiv.style.minWidth = 'auto';
            lineDiv.style.display = 'block';
            lineDiv.style.textAlign = target.style.textAlign || 'center';
            lineDiv.style.whiteSpace = 'pre-wrap';
            lineDiv.style.wordBreak = 'keep-all';
            lineDiv.style.overflowWrap = 'break-word';
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

        const normLine = tokens.map(t => t.text).join('').normalize('NFC');
        const hasCharWarp = (arcAngle !== 0) || (warpWave !== 0) || (warpBulge !== 0);

        if (isVertical) {
            const rawChars: Array<{ char: string; token: RichTextSegment }> = [];
            tokens.forEach(tok => {
                const segs = segmentString(tok.text);
                segs.forEach(s => rawChars.push({ char: s, token: tok }));
            });
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
        } else if (hasCharWarp && normLine.length > 1) {
            const rawChars: Array<{ char: string; token: RichTextSegment }> = [];
            tokens.forEach(tok => {
                const segs = segmentString(tok.text);
                segs.forEach(s => rawChars.push({ char: s, token: tok }));
            });
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

export function waitForNextPaint(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export function getCleanFileBaseName(fileName: string, fallback: string = 'page'): string {
    if (!fileName) return fallback;
    return fileName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_\-\u00C0-\u1EF9]/g, "_").trim() || fallback;
}

let lastToastMsg = '';
let lastToastTime = 0;

export function showToast(message: string, type: 'info' | 'success' | 'error' | 'warn' | 'warning' = 'info', duration: number = 4000): void {
    const msgStr = String(message ?? '').trim();
    if (!msgStr) return;

    const now = Date.now();
    if (msgStr === lastToastMsg && (now - lastToastTime) < 1200) {
        return;
    }
    lastToastMsg = msgStr;
    lastToastTime = now;

    const toast = document.createElement('div');

    let colorClasses = 'bg-slate-900 border-slate-800 text-slate-300';
    let iconClass = 'fa-solid fa-circle-info text-blue-400';

    const normalizedType = type === 'warning' ? 'warn' : type;

    if (normalizedType === 'success') {
        colorClasses = 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200';
        iconClass = 'fa-solid fa-circle-check text-emerald-400';
    } else if (normalizedType === 'error') {
        colorClasses = 'bg-red-950/90 border-red-500/30 text-red-200';
        iconClass = 'fa-solid fa-circle-exclamation text-red-400';
    } else if (normalizedType === 'warn') {
        colorClasses = 'bg-amber-950/90 border-amber-500/30 text-amber-200';
        iconClass = 'fa-solid fa-triangle-exclamation text-amber-400';
    }

    toast.className = `flex items-center space-x-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md pointer-events-auto transition-all duration-300 translate-y-2 opacity-0 ${colorClasses}`;
    const iconWrapper = document.createElement('span');
    const icon = document.createElement('i');
    icon.className = iconClass;
    iconWrapper.appendChild(icon);
    const messageText = document.createElement('span');
    messageText.className = "text-xs font-semibold leading-normal";
    messageText.textContent = msgStr;

    toast.appendChild(iconWrapper);
    toast.appendChild(messageText);

    const container = elements.toastContainer || document.getElementById('toast-container');
    if (container) {
        while (container.children && container.children.length >= 3) {
            const first = container.firstChild || container.children[0];
            if (first && typeof container.removeChild === 'function') {
                container.removeChild(first);
            } else {
                break;
            }
        }
        container.appendChild(toast);
    }

    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, duration);
}

// --- JSON CLEANUP AND REPAIR UTILITIES ---
export {
    sanitizeUnescapedNewlinesInJson,
    balanceJsonBrackets,
    extractJsonFromText,
    repairJsonString,
    extractBlocksWithRegex,
    normalizeParsedAiData,
    parseGeminiJsonText
} from './utils/json';

export async function waitForImageReady(imgElement: HTMLImageElement | null, targetSrc?: string): Promise<void> {
    if (!imgElement) return;
    if (imgElement.complete && imgElement.naturalWidth > 0 && (!targetSrc || imgElement.dataset.loadedSrc === targetSrc || imgElement.src.includes(targetSrc))) {
        try {
            if (typeof imgElement.decode === 'function') {
                await imgElement.decode();
            }
        } catch (error) {
            // decode can fail for already painted images in some browsers, safe to continue
        }
        return;
    }

    await Promise.race([
        new Promise<void>((resolve) => {
            const onLoad = () => {
                imgElement.removeEventListener('load', onLoad);
                imgElement.removeEventListener('error', onError);
                resolve();
            };
            const onError = () => {
                imgElement.removeEventListener('load', onLoad);
                imgElement.removeEventListener('error', onError);
                resolve();
            };
            imgElement.addEventListener('load', onLoad);
            imgElement.addEventListener('error', onError);
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 8000))
    ]);
}

