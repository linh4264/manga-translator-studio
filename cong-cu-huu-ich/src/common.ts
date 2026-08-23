/**
 * Common utilities and helpers for Cong Cu Huu Ich (TypeScript)
 */

export function escapeHTML(value: any): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function escapeCssFontFamily(name: string): string {
    return String(name ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"');
}

const SEC_PREFIX = 'mts_sec_v1:';

export function saveSecureToken(key: string, value: string): void {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return;
        if (!value) {
            window.localStorage.removeItem(key);
            return;
        }
        const str = String(value);
        let encoded = '';
        for (let i = 0; i < str.length; i++) {
            encoded += String.fromCharCode(str.charCodeAt(i) ^ 0x5a);
        }
        window.localStorage.setItem(key, SEC_PREFIX + btoa(encoded));
    } catch { }
}

export function getSecureToken(key: string): string {
    try {
        if (typeof window === 'undefined' || !window.localStorage) return '';
        const stored = window.localStorage.getItem(key);
        if (!stored) return '';
        if (stored.startsWith(SEC_PREFIX)) {
            const raw = atob(stored.slice(SEC_PREFIX.length));
            let decoded = '';
            for (let i = 0; i < raw.length; i++) {
                decoded += String.fromCharCode(raw.charCodeAt(i) ^ 0x5a);
            }
            return decoded;
        }
        return stored;
    } catch {
        return '';
    }
}

export function safeSetLocalStorage(key: string, value: any): void {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
    } catch { }
}

export function formatFileSize(bytes?: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getTargetFormatExt(format: string): string {
    if (format === 'image/webp') return 'webp';
    if (format === 'image/jpeg') return 'jpg';
    return 'png';
}

// Lightbox Modal
export function openPreviewModal(imgUrl: string): void {
    const modalImg = document.getElementById('modal-img') as HTMLImageElement | null;
    const modal = document.getElementById('preview-modal');
    if (modalImg) modalImg.src = imgUrl;
    if (modal) modal.classList.remove('hidden');
}

export function closePreviewModal(): void {
    const modal = document.getElementById('preview-modal');
    if (modal) modal.classList.add('hidden');
}

// Tab Switcher Logic
export function switchTab(tabId: string): void {
    document.querySelectorAll<HTMLElement>('.tab-btn').forEach(btn => {
        btn.className = "tab-btn px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 text-slate-400 hover:text-slate-200";
    });
    const activeBtn = document.getElementById(`btn-tab-${tabId}`);
    if (activeBtn) activeBtn.className = "tab-btn active px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 bg-indigo-600 text-white shadow-sm";

    document.querySelectorAll<HTMLElement>('.tool-sec').forEach(sec => sec.classList.add('hidden'));
    const activeSec = document.getElementById(`sec-${tabId}`);
    if (activeSec) activeSec.classList.remove('hidden');
}

// Drag & Drop Helper for All Tool Dropzones
export function setupDragAndDrop(dropzoneId: string, inputId: string, onFilesDropped: (files: File[]) => void): void {
    const zone = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        zone.addEventListener(eventName, (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.add('border-indigo-500', 'bg-indigo-500/10');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('border-indigo-500', 'bg-indigo-500/10');
        }, false);
    });

    zone.addEventListener('drop', (e: Event) => {
        const dragEvent = e as DragEvent;
        const dt = dragEvent.dataTransfer;
        const files = dt ? dt.files : null;
        if (files && files.length > 0) {
            onFilesDropped(Array.from(files));
        }
    }, false);
}
