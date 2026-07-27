// features/ui/tabs-and-overlays.js
import { elements } from '../core/elements.js';
import { updateToeicTabUI } from '../features/toeic.js';

// 1. Chuyển đổi tab sidebar bên phải (edit, style, toeic)
export function setRightTab(tab) {
    const tabs = ['edit', 'style', 'toeic'];
    tabs.forEach((t) => {
        const btn = document.getElementById(`tab-${t}`);
        const panel = document.getElementById(`panel-tab-${t}`);
        if (t === tab) {
            if (btn) {
                btn.className = "flex-1 py-3 text-xs font-bold text-indigo-400 border-b-2 border-indigo-500 uppercase tracking-wider";
            }
            if (panel) panel.classList.remove('hidden');
        } else {
            if (btn) {
                btn.className = "flex-1 py-3 text-xs font-bold text-slate-400 hover:text-slate-200 uppercase tracking-wider";
            }
            if (panel) panel.classList.add('hidden');
        }
    });

    if (tab === 'toeic') {
        updateToeicTabUI();
    }
}

// 2. Cập nhật thanh tiến trình hiển thị đè (Processing Overlay)
export function updateProcessingOverlay(show, title = "Đang xử lý...", subtitle = "Vui lòng đợi...", progress = 0) {
    const overlay = elements.processingOverlay;
    if (!overlay) return;

    if (show) {
        overlay.classList.remove('hidden');
        const titleEl = document.getElementById('processing-title');
        const subtitleEl = document.getElementById('processing-subtitle');
        const progressEl = document.getElementById('processing-progress-bar');
        const percentageEl = document.getElementById('processing-percentage');

        if (titleEl) titleEl.innerText = title;
        if (subtitleEl) subtitleEl.innerText = subtitle;
        if (progressEl) progressEl.style.width = `${progress}%`;
        if (percentageEl) percentageEl.innerText = `${progress}%`;
    } else {
        overlay.classList.add('hidden');
    }
}

// 3. Cập nhật thanh tiến trình tác vụ chạy ngầm
export function updateBackgroundTaskOverlay(show, title = "", subtitle = "", progress = 0) {
    const bar = elements.backgroundTaskBar;
    if (!bar) return;

    if (show) {
        bar.classList.remove('hidden');
        const titleEl = document.getElementById('bg-task-title');
        const subtitleEl = document.getElementById('bg-task-subtitle');
        const progressEl = document.getElementById('bg-task-progress-bar');
        const percentageEl = document.getElementById('bg-task-percentage');

        if (titleEl) titleEl.innerText = title;
        if (subtitleEl) subtitleEl.innerText = subtitle;
        if (progressEl) progressEl.style.width = `${progress}%`;
        if (percentageEl) percentageEl.innerText = `${progress}%`;
    } else {
        bar.classList.add('hidden');
    }
}

window.setRightTab = setRightTab;