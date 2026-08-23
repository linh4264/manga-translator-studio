import { globalState } from '../../core/state';
import { elements } from '../../core/elements';
import { changeZoom, resetZoom } from '../../ui/layout-ui';
import { requestOverlayRender } from './canvas-renderer';

interface TouchPoint {
    x: number;
    y: number;
}

let isPinching = false;
let isSingleFingerPanning = false;
let startDistance = 0;
let startZoom = 100;
let startMidpoint: TouchPoint = { x: 0, y: 0 };
let startScrollLeft = 0;
let startScrollTop = 0;
let panStartX = 0;
let panStartY = 0;

function getDistance(t1: Touch, t2: Touch): number {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}

function getMidpoint(t1: Touch, t2: Touch): TouchPoint {
    return {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
    };
}

export function isMobileHandModeActive(): boolean {
    return !!globalState.isMobileHandMode;
}

export function toggleMobileHandMode(forceState?: boolean): boolean {
    globalState.isMobileHandMode = typeof forceState === 'boolean' ? forceState : !globalState.isMobileHandMode;
    
    const viewport = elements.workspaceViewport || document.getElementById('workspace-viewport');
    const handBtn = document.getElementById('btn-mobile-hand-mode');
    
    if (viewport) {
        if (globalState.isMobileHandMode) {
            viewport.classList.add('touch-hand-mode');
        } else {
            viewport.classList.remove('touch-hand-mode');
        }
    }
    
    if (handBtn) {
        if (globalState.isMobileHandMode) {
            handBtn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-400');
            handBtn.classList.remove('bg-slate-900', 'text-slate-300', 'border-slate-800');
        } else {
            handBtn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-400');
            handBtn.classList.add('bg-slate-900', 'text-slate-300', 'border-slate-800');
        }
    }
    
    return globalState.isMobileHandMode;
}

export function initTouchGestures(): void {
    const viewport = elements.workspaceViewport || document.getElementById('workspace-viewport');
    if (!viewport) return;

    viewport.addEventListener('touchstart', (e: TouchEvent) => {
        const target = e.target as HTMLElement | null;
        const isInteractiveElement = target?.closest('.bubble-overlay') ||
            target?.closest('#canvas-floating-toolbar') ||
            target?.closest('.resize-handle') ||
            target?.closest('button') ||
            target?.closest('input') ||
            target?.closest('textarea');

        if (e.touches.length === 2) {
            // Pinch-to-zoom & two-finger pan initiated
            e.preventDefault();
            isPinching = true;
            isSingleFingerPanning = false;
            startDistance = getDistance(e.touches[0], e.touches[1]);
            startZoom = globalState.zoom || 100;
            startMidpoint = getMidpoint(e.touches[0], e.touches[1]);
            startScrollLeft = viewport.scrollLeft;
            startScrollTop = viewport.scrollTop;
        } else if (e.touches.length === 1) {
            if (globalState.isMobileHandMode || !isInteractiveElement) {
                // Background touch or Hand mode panning
                isSingleFingerPanning = true;
                panStartX = e.touches[0].clientX;
                panStartY = e.touches[0].clientY;
                startScrollLeft = viewport.scrollLeft;
                startScrollTop = viewport.scrollTop;
            }
        }
    }, { passive: false });

    viewport.addEventListener('touchmove', (e: TouchEvent) => {
        if (isPinching && e.touches.length === 2) {
            e.preventDefault();
            const currentDist = getDistance(e.touches[0], e.touches[1]);
            if (startDistance > 0) {
                const ratio = currentDist / startDistance;
                const newZoom = Math.max(25, Math.min(500, Math.round(startZoom * ratio)));

                if (newZoom !== globalState.zoom) {
                    globalState.zoom = newZoom;
                    if (elements.zoomIndicator) elements.zoomIndicator.innerText = `${globalState.zoom}%`;
                    const dockZoomIndicator = document.getElementById('dock-zoom-indicator');
                    if (dockZoomIndicator) dockZoomIndicator.innerText = `${globalState.zoom}%`;
                    const mobileDockZoom = document.getElementById('mobile-dock-zoom-indicator');
                    if (mobileDockZoom) mobileDockZoom.innerText = `${globalState.zoom}%`;

                    if (elements.mangaCanvasContainer) {
                        elements.mangaCanvasContainer.style.height = `${globalState.zoom}%`;
                        elements.mangaCanvasContainer.style.maxHeight = 'none';
                        elements.mangaCanvasContainer.style.width = 'max-content';

                        if (newZoom > 100) {
                            elements.mangaCanvasContainer.classList.remove('m-auto');
                            elements.mangaCanvasContainer.classList.add('my-auto', 'mx-0');
                        } else {
                            elements.mangaCanvasContainer.classList.remove('my-auto', 'mx-0');
                            elements.mangaCanvasContainer.classList.add('m-auto');
                        }
                    }

                    if (elements.workspaceSplitWrapper) {
                        elements.workspaceSplitWrapper.style.height = `${globalState.zoom}%`;
                        elements.workspaceSplitWrapper.style.maxHeight = 'none';
                        elements.workspaceSplitWrapper.style.transform = 'none';
                    }

                    requestOverlayRender();
                }

                // Two-finger pan alongside pinch
                const currentMidpoint = getMidpoint(e.touches[0], e.touches[1]);
                const deltaX = currentMidpoint.x - startMidpoint.x;
                const deltaY = currentMidpoint.y - startMidpoint.y;
                viewport.scrollLeft = Math.max(0, startScrollLeft - deltaX);
                viewport.scrollTop = Math.max(0, startScrollTop - deltaY);
            }
        } else if (isSingleFingerPanning && e.touches.length === 1) {
            const curX = e.touches[0].clientX;
            const curY = e.touches[0].clientY;
            const deltaX = curX - panStartX;
            const deltaY = curY - panStartY;

            if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
                if (globalState.isMobileHandMode) {
                    e.preventDefault();
                }
                viewport.scrollLeft = Math.max(0, startScrollLeft - deltaX);
                viewport.scrollTop = Math.max(0, startScrollTop - deltaY);
            }
        }
    }, { passive: false });

    const endPinchOrPan = (e: TouchEvent) => {
        if (e.touches.length < 2) {
            isPinching = false;
        }
        if (e.touches.length === 0) {
            isSingleFingerPanning = false;
        }
    };

    viewport.addEventListener('touchend', endPinchOrPan);
    viewport.addEventListener('touchcancel', endPinchOrPan);
}

