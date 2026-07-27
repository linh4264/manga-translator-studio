import { globalState, activatePage, garbageCollectPageCaches } from '../core/state.js';
import { elements } from '../core/elements.js';
import { showToast, waitForNextPaint } from '../core/utils.js';
import { renderOverlays } from '../features/canvas/canvas-service.js';

export let previewCurrentPage = 0;

export function openPreviewMode() {
    if (globalState.pages.length === 0) {
        showToast("Chưa có trang truyện nào để xem trước!", "warn");
        return;
    }

    previewCurrentPage = globalState.activePageIndex >= 0 ? globalState.activePageIndex : 0;
    elements.previewModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    renderPreviewPage();
    document.addEventListener('keydown', previewKeyHandler);
}

export function closePreviewMode() {
    elements.previewModal.classList.add('hidden');
    document.body.style.overflow = '';
    elements.previewBody.innerHTML = '';
    document.removeEventListener('keydown', previewKeyHandler);
    garbageCollectPageCaches();
}

export function previewKeyHandler(e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        closePreviewMode();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        previewPrevPage();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        previewNextPage();
    }
}

export function previewPrevPage() {
    if (previewCurrentPage > 0) {
        previewCurrentPage--;
        renderPreviewPage();
    }
}

export function previewNextPage() {
    if (previewCurrentPage < globalState.pages.length - 1) {
        previewCurrentPage++;
        renderPreviewPage();
    }
}

export async function renderPreviewPage() {
    if (previewCurrentPage < 0 || previewCurrentPage >= globalState.pages.length) return;

    const page = globalState.pages[previewCurrentPage];
    if (!page) return;

    if (!page.src && (page.originalFile || page.file)) {
        const fileObj = page.originalFile || page.file;
        if (fileObj instanceof Blob) {
            page.src = URL.createObjectURL(fileObj);
        }
    }

    await activatePage(page);
    garbageCollectPageCaches(previewCurrentPage);

    elements.previewPageIndicator.textContent = `Trang ${previewCurrentPage + 1}/${globalState.pages.length}`;
    elements.previewBody.innerHTML = '';

    const pageContainer = document.createElement('div');
    pageContainer.style.position = 'relative';
    pageContainer.style.display = 'inline-block';
    pageContainer.style.maxWidth = '100%';
    pageContainer.style.maxHeight = 'calc(100vh - 80px)';

    const bgImg = document.createElement('img');
    bgImg.style.maxWidth = '100%';
    bgImg.style.maxHeight = 'calc(100vh - 80px)';
    bgImg.style.display = 'block';
    bgImg.draggable = false;
    bgImg.style.userSelect = 'none';
    pageContainer.appendChild(bgImg);

    const overlaysContainer = document.createElement('div');
    overlaysContainer.className = "absolute inset-0 select-none overflow-hidden rounded z-20";
    pageContainer.appendChild(overlaysContainer);

    elements.previewBody.appendChild(pageContainer);

    const onImageLoaded = async () => {
        await waitForNextPaint();

        let displayW = bgImg.clientWidth;
        let displayH = bgImg.clientHeight;

        if (displayW === 0 || displayH === 0) {
            await new Promise(r => setTimeout(r, 50));
            displayW = bgImg.clientWidth;
            displayH = bgImg.clientHeight;
        }

        const finalW = displayW || 800;
        const finalH = displayH || 600;

        pageContainer.style.width = `${finalW}px`;
        pageContainer.style.height = `${finalH}px`;

        if (page.eraserLayerBlob) {
            const eraserImg = document.createElement('img');
            const eraserUrl = URL.createObjectURL(page.eraserLayerBlob);

            const cleanupBlob = () => URL.revokeObjectURL(eraserUrl);
            eraserImg.onload = cleanupBlob;
            eraserImg.onerror = cleanupBlob;

            eraserImg.src = eraserUrl;
            eraserImg.style.position = 'absolute';
            eraserImg.style.top = '0';
            eraserImg.style.left = '0';
            eraserImg.style.width = '100%';
            eraserImg.style.height = '100%';
            eraserImg.style.pointerEvents = 'none';
            eraserImg.style.zIndex = '10';

            pageContainer.appendChild(eraserImg);
        }

        renderOverlays(overlaysContainer, page, bgImg);
    };

    if (bgImg.complete && bgImg.naturalWidth > 0) {
        onImageLoaded();
    } else {
        bgImg.onload = onImageLoaded;
    }

    bgImg.src = page.src;
    elements.previewBody.scrollTop = 0;
}