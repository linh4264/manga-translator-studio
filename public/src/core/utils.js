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

export function setMultilineText(target, value, warpOptions = {}) {
    if (!target) return;
    target.textContent = '';
    const isVertical = target.style.writingMode === 'vertical-rl';
    const lines = String(value ?? '').split('\n');

    const opts = typeof warpOptions === 'object' && warpOptions !== null ? warpOptions : { arcAngle: Number(warpOptions) || 0 };
    const arcAngle = opts.arcAngle || 0;
    const skewX = opts.skewX || 0;
    const skewY = opts.skewY || 0;
    const warpWave = opts.warpWave || 0;
    const warpBulge = opts.warpBulge || 0;

    lines.forEach((line) => {
        const lineDiv = document.createElement('div');
        if (isVertical) {
            lineDiv.style.height = '100%';
            lineDiv.style.width = 'auto';
            lineDiv.style.minWidth = '1.1em';
            lineDiv.style.minHeight = 'auto';
            lineDiv.style.display = 'flex';
            lineDiv.style.flexDirection = 'column';
            lineDiv.style.alignItems = 'center';
            lineDiv.style.justifyContent = 'center';
        } else {
            lineDiv.style.width = '100%';
            lineDiv.style.height = 'auto';
            lineDiv.style.minHeight = '1em';
            lineDiv.style.minWidth = 'auto';
            lineDiv.style.display = 'flex';
            lineDiv.style.flexDirection = 'row';
            lineDiv.style.alignItems = 'center';
            lineDiv.style.justifyContent = 'center';
        }
        lineDiv.style.margin = '0';
        lineDiv.style.padding = '0';
        lineDiv.style.wordBreak = 'keep-all';
        lineDiv.style.overflowWrap = 'normal';
        lineDiv.style.hyphens = 'none';

        if (skewX !== 0 || skewY !== 0) {
            lineDiv.style.transform = `skew(${skewX}deg, ${skewY}deg)`;
        }

        const normLine = String(line || '').normalize('NFC');
        const hasCharWarp = (arcAngle !== 0) || (warpWave !== 0) || (warpBulge !== 0);

        if (hasCharWarp && normLine.length > 1) {
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

                if (isVertical) {
                    span.style.transform = `translateX(${totalOffset}px) rotate(${rot}deg) scale(${scale})`;
                } else {
                    span.style.transform = `translateY(${totalOffset}px) rotate(${rot}deg) scale(${scale})`;
                }
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

