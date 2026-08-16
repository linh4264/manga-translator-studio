// General Utilities & JSON Repair for Manga Translator Studio
import { elements } from './elements.js';

export function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function transformCase(text, mode = 'none') {
    if (!text) return '';
    const str = String(text);
    if (mode === 'uppercase') return str.toUpperCase();
    if (mode === 'lowercase') return str.toLowerCase();
    if (mode === 'capitalize') {
        return str.replace(/(?:^|\s|\p{P})\p{L}/gu, match => match.toUpperCase());
    }
    return str;
}

export function cleanMangaPunctuation(text) {
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

export function setMultilineText(target, value, warpOptions = {}) {
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
    const lines = String(transformedText ?? '').split('\n');

    lines.forEach((line) => {
        const lineDiv = document.createElement('div');
        if (isVertical) {
            lineDiv.style.display = 'inline-block';
            lineDiv.style.writingMode = 'vertical-rl';
            lineDiv.style.textOrientation = 'upright';
            lineDiv.style.textAlign = target.style.textAlign || 'center';
            lineDiv.style.verticalAlign = 'top';
            lineDiv.style.whiteSpace = 'pre-wrap';
            lineDiv.style.wordBreak = 'break-word';
            lineDiv.style.overflowWrap = 'break-word';
            lineDiv.style.height = 'auto';
            lineDiv.style.width = 'auto';
            lineDiv.style.minWidth = 'auto';
            lineDiv.style.minHeight = 'auto';
        } else {
            lineDiv.style.width = '100%';
            lineDiv.style.height = 'auto';
            lineDiv.style.minHeight = '1em';
            lineDiv.style.minWidth = 'auto';
            lineDiv.style.display = 'block';
            lineDiv.style.textAlign = target.style.textAlign || 'center';
            lineDiv.style.whiteSpace = 'pre-wrap';
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

        const normLine = String(line || '').normalize('NFC');
        const hasCharWarp = (arcAngle !== 0) || (warpWave !== 0) || (warpBulge !== 0);

        if (isVertical) {
            const chars = (typeof Intl !== 'undefined' && Intl.Segmenter)
                ? Array.from(new Intl.Segmenter().segment(normLine)).map(s => s.segment)
                : Array.from(normLine);
            const count = chars.length;
            const arcDepth = (arcAngle / 45) * 8;
            const waveAmp = (warpWave / 50) * 10;
            const bulgeFactor = (warpBulge / 50) * 0.4;

            if (count === 0) {
                lineDiv.appendChild(document.createTextNode('\u00A0'));
            } else {
                chars.forEach((ch, idx) => {
                    const span = document.createElement('span');
                    span.style.display = 'inline-block';
                    span.style.lineHeight = 'inherit';
                    span.style.whiteSpace = 'pre';
                    span.textContent = ch;

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
            const chars = (typeof Intl !== 'undefined' && Intl.Segmenter)
                ? Array.from(new Intl.Segmenter().segment(normLine)).map(s => s.segment)
                : Array.from(normLine);
            const count = chars.length;
            const arcDepth = (arcAngle / 45) * 8;
            const waveAmp = (warpWave / 50) * 10;
            const bulgeFactor = (warpBulge / 50) * 0.4;

            chars.forEach((ch, idx) => {
                const span = document.createElement('span');
                span.style.display = 'inline-block';
                span.style.whiteSpace = 'pre';
                span.textContent = ch;

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
            lineDiv.appendChild(document.createTextNode(line || ' '));
        }

        target.appendChild(lineDiv);
    });
}

export function waitForNextPaint() {
    return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export function getCleanFileBaseName(fileName, fallback = 'page') {
    if (!fileName) return fallback;
    return fileName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_\-\u00C0-\u1EF9]/g, "_").trim() || fallback;
}

export function showToast(message, type = 'info') {
    const toast = document.createElement('div');

    let colorClasses = 'bg-slate-900 border-slate-800 text-slate-300';
    let iconClass = 'fa-solid fa-circle-info text-blue-400';

    if (type === 'success') {
        colorClasses = 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200';
        iconClass = 'fa-solid fa-circle-check text-emerald-400';
    } else if (type === 'error') {
        colorClasses = 'bg-red-950/90 border-red-500/30 text-red-200';
        iconClass = 'fa-solid fa-circle-exclamation text-red-400';
    } else if (type === 'warn') {
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
    messageText.textContent = String(message ?? '');

    toast.appendChild(iconWrapper);
    toast.appendChild(messageText);

    if (elements.toastContainer) {
        elements.toastContainer.appendChild(toast);
    } else {
        const container = document.getElementById('toast-container');
        if (container) container.appendChild(toast);
    }

    // Trigger transition layout frame
    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    // Automatically clean toast
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 4000);
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
} from './utils/json.js';

export async function waitForImageReady(imgElement, targetSrc) {
    if (!imgElement) return;
    if (imgElement.dataset.loadedSrc === targetSrc && imgElement.complete && imgElement.naturalWidth > 0) {
        try {
            if (typeof imgElement.decode === 'function') {
                await imgElement.decode();
            }
        } catch (error) {
            // decode can fail for already painted images in some browsers, safe to continue
        }
        return;
    }

    await new Promise((resolve) => {
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
    });
}

