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

export function setMultilineText(target, value) {
    if (!target) return;
    target.textContent = '';
    String(value ?? '').split('\n').forEach((line) => {
        const lineDiv = document.createElement('div');
        lineDiv.style.width = '100%';
        lineDiv.style.margin = '0';
        lineDiv.style.padding = '0';
        lineDiv.style.minHeight = '1em'; // Giữ chiều cao nếu dòng trống
        lineDiv.style.wordBreak = 'keep-all';
        lineDiv.style.overflowWrap = 'normal';
        lineDiv.style.hyphens = 'none';
        lineDiv.appendChild(document.createTextNode(line || ' '));
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
    let icon = '<i class="fa-solid fa-circle-info text-blue-400"></i>';

    if (type === 'success') {
        colorClasses = 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200';
        icon = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
    } else if (type === 'error') {
        colorClasses = 'bg-red-950/90 border-red-500/30 text-red-200';
        icon = '<i class="fa-solid fa-circle-exclamation text-red-400"></i>';
    } else if (type === 'warn') {
        colorClasses = 'bg-amber-950/90 border-amber-500/30 text-amber-200';
        icon = '<i class="fa-solid fa-triangle-exclamation text-amber-400"></i>';
    }

    toast.className = `flex items-center space-x-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md pointer-events-auto transition-all duration-300 translate-y-2 opacity-0 ${colorClasses}`;
    const iconWrapper = document.createElement('span');
    iconWrapper.innerHTML = icon;
    const messageText = document.createElement('span');
    messageText.className = "text-xs font-semibold leading-normal";
    messageText.textContent = message;

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
export function sanitizeUnescapedNewlinesInJson(jsonStr) {
    let result = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        if (char === '"' && !escaped) {
            inString = !inString;
            result += char;
        } else if (inString && (char === '\n' || char === '\r')) {
            result += char === '\n' ? '\\n' : '\\r';
        } else if (inString && char === '\t') {
            result += '\\t';
        } else {
            result += char;
        }
        if (char === '\\' && !escaped) {
            escaped = true;
        } else {
            escaped = false;
        }
    }
    return result;
}

export function balanceJsonBrackets(jsonStr) {
    let s = jsonStr.trim();
    let inString = false;
    let escaped = false;
    const stack = [];

    for (let i = 0; i < s.length; i++) {
        const char = s[i];
        if (char === '"' && !escaped) {
            inString = !inString;
        } else if (!inString) {
            if (char === '{' || char === '[') {
                stack.push(char === '{' ? '}' : ']');
            } else if (char === '}' || char === ']') {
                if (stack.length > 0 && stack[stack.length - 1] === char) {
                    stack.pop();
                }
            }
        }
        escaped = (char === '\\' && !escaped);
    }

    if (inString) {
        s += '"';
    }
    s = s.replace(/,\s*$/, '');
    while (stack.length > 0) {
        s += stack.pop();
    }
    return s;
}

export function parseGeminiJsonText(rawText) {
    const text = String(rawText || '').trim();
    if (!text) {
        throw new Error('AI không trả về dữ liệu JSON.');
    }

    // 1. Loại bỏ Markdown code block (```json ... ```)
    let candidate = text;
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch) {
        candidate = fenceMatch[1].trim();
    } else {
        const unclosedFenceMatch = text.match(/```(?:json)?\s*([\s\S]*)/i);
        if (unclosedFenceMatch) {
            candidate = unclosedFenceMatch[1].trim();
        }
    }

    // 2. Tìm vị trí mở/đóng cấu trúc JSON đầu và cuối ('{' hoặc '[')
    const firstBrace = candidate.indexOf('{');
    const firstBracket = candidate.indexOf('[');
    let startIdx = -1;
    if (firstBrace !== -1 && firstBracket !== -1) {
        startIdx = Math.min(firstBrace, firstBracket);
    } else if (firstBrace !== -1) {
        startIdx = firstBrace;
    } else if (firstBracket !== -1) {
        startIdx = firstBracket;
    }

    const lastBrace = candidate.lastIndexOf('}');
    const lastBracket = candidate.lastIndexOf(']');
    const endIdx = Math.max(lastBrace, lastBracket);

    let jsonText = candidate;
    if (startIdx !== -1 && endIdx > startIdx) {
        jsonText = candidate.slice(startIdx, endIdx + 1);
    }

    // Thử parse trực tiếp
    try {
        return JSON.parse(jsonText);
    } catch (e) { }

    try {
        return JSON.parse(candidate);
    } catch (e) { }

    // 3. Quy trình tự động sửa lỗi cấu trúc JSON (Sửa lỗi thiếu dấu phẩy, trailing comma, unescaped character, v.v.)
    let repaired = jsonText;

    // Thay thế kiểu boolean/null từ Python nếu có
    repaired = repaired.replace(/\bTrue\b/g, 'true')
                       .replace(/\bFalse\b/g, 'false')
                       .replace(/\bNone\b/g, 'null');

    // Sửa lỗi thiếu dấu phẩy giữa các object/array liền kề
    repaired = repaired.replace(/\}\s*\{/g, '},{')
                       .replace(/\]\s*\[/g, '],[')
                       .replace(/\}\s*\"/g, '},"')
                       .replace(/\"\s*\{/g, '",{');

    // Sửa lỗi thiếu dấu phẩy giữa các phần tử hoặc thuộc tính trên nhiều dòng
    repaired = repaired.replace(/(["\d]|true|false|null)\s*\n\s*(["{])/g, '$1,$2');

    // Xóa dấu phẩy thừa trước ngoặc đóng (Trailing commas)
    repaired = repaired.replace(/,\s*([\}\]])/g, '$1');

    try {
        return JSON.parse(repaired);
    } catch (e) { }

    // Khử các ký tự xuống dòng chưa escape trong chuỗi
    repaired = sanitizeUnescapedNewlinesInJson(repaired);
    try {
        return JSON.parse(repaired);
    } catch (e) { }

    // Cân bằng ngoặc khi JSON bị cắt ngang do chạm giới hạn token
    const balanced = balanceJsonBrackets(repaired);
    try {
        return JSON.parse(balanced);
    } catch (e) { }

    // Fallback khẩn cấp: Trích xuất các block bằng Regex nếu AI trả về array blocks
    try {
        const blockMatches = [...rawText.matchAll(/\{[^{}]*"id"\s*:\s*(?:(?:"[^"]*")|\d+)[^{}]*\}/gi)];
        if (blockMatches.length > 0) {
            const extractedBlocks = [];
            for (const match of blockMatches) {
                try {
                    const blockObj = JSON.parse(match[0]);
                    extractedBlocks.push(blockObj);
                } catch (err) { }
            }
            if (extractedBlocks.length > 0) {
                console.warn("Đã cứu hộ thành công JSON lỗi bằng Regex Extraction:", extractedBlocks);
                return { blocks: extractedBlocks };
            }
        }
    } catch (fallbackErr) { }

    // Nếu vẫn thất bại hoàn toàn, bắn lỗi rõ ràng
    try {
        return JSON.parse(jsonText);
    } catch (error) {
        throw new Error(`Không thể đọc JSON từ AI: ${error.message}`);
    }
}

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

