/**
 * Module 6: Image Sharpen & Enhance (TypeScript)
 */

import { applySharpenFilterToCtx } from './image-compressor';

let enhanceImg: HTMLImageElement | null = null;
let enhanceFileName = 'Enhanced_Image.png';

export function resetEnhance(): void {
    enhanceImg = null;
    const canvas = document.getElementById('enhance-canvas') as HTMLCanvasElement | null;
    if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
    }
    const panel = document.getElementById('enhance-panel');
    if (panel) panel.classList.add('hidden');
    const upload = document.getElementById('enhance-upload');
    if (upload) upload.classList.remove('hidden');
    const input = document.getElementById('enhance-file') as HTMLInputElement | null;
    if (input) input.value = '';
}

export function processEnhance(): void {
    if (!enhanceImg) return;
    const canvas = document.getElementById('enhance-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    canvas.width = enhanceImg.naturalWidth;
    canvas.height = enhanceImg.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const contrast = parseFloat((document.getElementById('enhance-contrast') as HTMLInputElement)?.value || '120') / 100;
    const brightness = parseFloat((document.getElementById('enhance-brightness') as HTMLInputElement)?.value || '100') / 100;
    ctx.filter = `contrast(${contrast}) brightness(${brightness})`;
    ctx.drawImage(enhanceImg, 0, 0);

    // Sharpen Filter convolution matrix
    const sharpAmount = parseFloat((document.getElementById('enhance-sharp') as HTMLInputElement)?.value || '1.5');
    if (sharpAmount > 0) {
        applySharpenFilterToCtx(ctx, canvas.width, canvas.height, sharpAmount);
    }
}

export function downloadEnhancedImage(): void {
    const canvas = document.getElementById('enhance-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const baseName = enhanceFileName.replace(/\.[^/.]+$/, '');
        a.href = url;
        a.download = `${baseName}_enhanced.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, 'image/png', 0.95);
}

export function handleEnhanceFile(file: File): void {
    if (!file) return;
    enhanceFileName = file.name;
    const tempUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        URL.revokeObjectURL(tempUrl);
        enhanceImg = img;
        const uploadEl = document.getElementById('enhance-upload');
        if (uploadEl) uploadEl.classList.add('hidden');
        const panelEl = document.getElementById('enhance-panel');
        if (panelEl) panelEl.classList.remove('hidden');
        processEnhance();
    };
    img.onerror = () => {
        URL.revokeObjectURL(tempUrl);
    };
    img.src = tempUrl;
}

export function initImageEnhancer(): void {
    const input = document.getElementById('enhance-file');
    if (input) {
        input.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (!target.files || !target.files[0]) return;
            handleEnhanceFile(target.files[0]);
        });
    }
}
