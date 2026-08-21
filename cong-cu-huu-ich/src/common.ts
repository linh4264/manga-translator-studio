/**
 * Common utilities and helpers for Cong Cu Huu Ich (TypeScript)
 */

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
