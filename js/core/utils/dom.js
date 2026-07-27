// DOM Manipulation Utilities
import { elements } from '../elements.js';

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
    const isVertical = target.style.writingMode === 'vertical-rl';
    String(value ?? '').split('\n').forEach((line) => {
        const lineDiv = document.createElement('div');
        if (isVertical) {
            lineDiv.style.height = '100%';
            lineDiv.style.width = 'auto';
            lineDiv.style.minWidth = '1.1em';
        } else {
            lineDiv.style.width = '100%';
            lineDiv.style.height = 'auto';
            lineDiv.style.minHeight = '1em';
        }
        lineDiv.style.margin = '0';
        lineDiv.style.padding = '0';
        lineDiv.style.wordBreak = 'keep-all';
        lineDiv.appendChild(document.createTextNode(line || ' '));
        target.appendChild(lineDiv);
    });
}

export function waitForNextPaint() {
    return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export function showToast(message, type = 'info') {
    const container = elements.toastContainer || document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    let colorClasses = 'bg-slate-900 border-slate-800 text-slate-300';
    let icon = '<i class="fa-solid fa-circle-info text-blue-400"></i>';

    if (type === 'success') {
        colorClasses = 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200';
        icon = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
    } else if (type === 'error') {
        colorClasses = 'bg-red-950/90 border-red-500/30 text-red-200';
        icon = '<i class="fa-solid fa-circle-exclamation text-red-400"></i>';
    }

    toast.className = `flex items-center space-x-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 translate-y-2 opacity-0 ${colorClasses}`;
    toast.innerHTML = `<span>${icon}</span><span class="text-xs font-semibold">${message}</span>`;

    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 10);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
