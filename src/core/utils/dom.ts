// DOM Manipulation Utilities

export function escapeHTML(value: any): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
export const escapeHtml = escapeHTML;

export function setMultilineText(target: HTMLElement | null, value: string): void {
    if (!target) return;
    target.textContent = '';
    const isVertical = target.style.writingMode === 'vertical-rl';
    String(value ?? '').split('\n').forEach((line) => {
        const lineDiv = document.createElement('div');
        if (isVertical) {
            lineDiv.style.height = '100%';
            lineDiv.style.width = 'auto';
            lineDiv.style.minWidth = '1.1em';
            lineDiv.style.whiteSpace = 'pre';
        } else {
            lineDiv.style.width = '100%';
            lineDiv.style.height = 'auto';
            lineDiv.style.minHeight = '1em';
            lineDiv.style.whiteSpace = 'pre';
        }
        lineDiv.style.margin = '0';
        lineDiv.style.padding = '0';
        lineDiv.style.wordBreak = 'keep-all';
        lineDiv.style.overflowWrap = 'normal';
        lineDiv.appendChild(document.createTextNode(line || ' '));
        target.appendChild(lineDiv);
    });
}

export function waitForNextPaint(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export function showToast(message: string, type: 'info' | 'success' | 'error' | 'warn' | 'warning' = 'info', duration: number = 4000): void {
    const container = document.getElementById('toast-container');
    if (!container) return;

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

    toast.className = `flex items-center space-x-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 translate-y-2 opacity-0 ${colorClasses}`;
    const iconWrapper = document.createElement('span');
    const icon = document.createElement('i');
    icon.className = iconClass;
    iconWrapper.appendChild(icon);

    const messageText = document.createElement('span');
    messageText.className = 'text-xs font-semibold';
    messageText.textContent = String(message ?? '');

    toast.appendChild(iconWrapper);
    toast.appendChild(messageText);

    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 10);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
