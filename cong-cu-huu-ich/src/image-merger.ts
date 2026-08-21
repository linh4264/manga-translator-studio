/**
 * Module 3: Webtoon / Long Strip Merger (TypeScript)
 */

import type { MergeImageItem } from './types';

let mergeImgs: MergeImageItem[] = [];

export function toggleMergeDirectionUI(): void {
    const dir = (document.getElementById('merge-direction') as HTMLSelectElement)?.value;
    const boxOrder = document.getElementById('box-merge-order');
    if (boxOrder) {
        if (dir === 'horizontal') {
            boxOrder.classList.remove('hidden');
            boxOrder.classList.add('flex');
        } else {
            boxOrder.classList.add('hidden');
            boxOrder.classList.remove('flex');
        }
    }
}

export function swapMergeImages(): void {
    if (mergeImgs.length >= 2) {
        const temp = mergeImgs[0];
        mergeImgs[0] = mergeImgs[1];
        mergeImgs[1] = temp;
        renderMergeList();
    }
}

export function moveMergeImage(fromIdx: number, toIdx: number): void {
    if (toIdx < 0 || toIdx >= mergeImgs.length) return;
    const item = mergeImgs.splice(fromIdx, 1)[0];
    mergeImgs.splice(toIdx, 0, item);
    renderMergeList();
}

export function removeMergeImage(index: number): void {
    if (index >= 0 && index < mergeImgs.length) {
        mergeImgs.splice(index, 1);
        renderMergeList();
    }
}

export function renderMergeList(): void {
    const list = document.getElementById('merge-list');
    const countEl = document.getElementById('merge-count');
    if (countEl) countEl.innerText = `Đã chọn ${mergeImgs.length} ảnh`;
    if (!list) return;
    list.innerHTML = '';

    const dir = (document.getElementById('merge-direction') as HTMLSelectElement)?.value || 'vertical';
    const order = (document.getElementById('merge-order') as HTMLSelectElement)?.value || 'ltr';

    let itemsToRender = [...mergeImgs];
    if (dir === 'horizontal' && order === 'rtl' && itemsToRender.length === 2) {
        itemsToRender = [mergeImgs[1], mergeImgs[0]];
    }

    itemsToRender.forEach((item, idx) => {
        const origIndex = mergeImgs.indexOf(item);
        const row = document.createElement('div');
        row.className = "flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs font-mono";
        row.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-indigo-400 font-bold">#${idx+1}</span>
                <img src="${item.img.src}" class="w-10 h-10 object-contain rounded bg-slate-900 border border-slate-800">
                <span class="text-slate-200 font-bold truncate max-w-xs">${item.name}</span>
                <span class="text-slate-400">(${item.img.naturalWidth}x${item.img.naturalHeight}px)</span>
            </div>
            <div class="flex items-center gap-1.5">
                <button data-action="move-up" ${origIndex === 0 ? 'disabled class="opacity-30"' : ''} class="px-2 py-1 rounded bg-slate-850 hover:bg-slate-800 text-slate-300" title="Di chuyển lên"><i class="fa-solid fa-arrow-up"></i></button>
                <button data-action="move-down" ${origIndex === mergeImgs.length - 1 ? 'disabled class="opacity-30"' : ''} class="px-2 py-1 rounded bg-slate-850 hover:bg-slate-800 text-slate-300" title="Di chuyển xuống"><i class="fa-solid fa-arrow-down"></i></button>
                <button data-action="delete" class="px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20" title="Xóa"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;

        const btnUp = row.querySelector('[data-action="move-up"]');
        if (btnUp && origIndex > 0) {
            btnUp.addEventListener('click', () => moveMergeImage(origIndex, origIndex - 1));
        }

        const btnDown = row.querySelector('[data-action="move-down"]');
        if (btnDown && origIndex < mergeImgs.length - 1) {
            btnDown.addEventListener('click', () => moveMergeImage(origIndex, origIndex + 1));
        }

        const btnDel = row.querySelector('[data-action="delete"]');
        if (btnDel) {
            btnDel.addEventListener('click', () => removeMergeImage(origIndex));
        }

        list.appendChild(row);
    });
}

export async function executeMergeImages(): Promise<void> {
    if (mergeImgs.length === 0) return;

    const dir = (document.getElementById('merge-direction') as HTMLSelectElement)?.value || 'vertical';
    const order = (document.getElementById('merge-order') as HTMLSelectElement)?.value || 'ltr';

    let itemsToMerge = [...mergeImgs];
    if (dir === 'horizontal' && order === 'rtl' && itemsToMerge.length === 2) {
        itemsToMerge = [mergeImgs[1], mergeImgs[0]];
    }

    if (dir === 'vertical') {
        const maxW = Math.max(...itemsToMerge.map(i => i.img.naturalWidth));
        let totalH = 0;
        itemsToMerge.forEach(i => {
            const scaledH = Math.round(i.img.naturalHeight * (maxW / i.img.naturalWidth));
            totalH += scaledH;
        });

        const canvas = document.createElement('canvas');
        canvas.width = maxW; canvas.height = totalH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let currentY = 0;
        itemsToMerge.forEach(i => {
            const scaledH = Math.round(i.img.naturalHeight * (maxW / i.img.naturalWidth));
            ctx.drawImage(i.img, 0, currentY, maxW, scaledH);
            currentY += scaledH;
        });

        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `Merged_Vertical_Webtoon.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } else {
        // Horizontal Side-by-Side Merge (Spread Page)
        const maxH = Math.max(...itemsToMerge.map(i => i.img.naturalHeight));
        let totalW = 0;
        itemsToMerge.forEach(i => {
            const scaledW = Math.round(i.img.naturalWidth * (maxH / i.img.naturalHeight));
            totalW += scaledW;
        });

        const canvas = document.createElement('canvas');
        canvas.width = totalW; canvas.height = maxH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let currentX = 0;
        itemsToMerge.forEach(i => {
            const scaledW = Math.round(i.img.naturalWidth * (maxH / i.img.naturalHeight));
            ctx.drawImage(i.img, 0, 0, i.img.naturalWidth, i.img.naturalHeight, currentX, 0, scaledW, maxH);
            currentX += scaledW;
        });

        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `Merged_Horizontal_Spread.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

export function handleMergeFiles(files: File[]): void {
    if (!files || files.length === 0) return;
    const uploadEl = document.getElementById('merge-upload');
    if (uploadEl) uploadEl.classList.add('hidden');
    const panelEl = document.getElementById('merge-panel');
    if (panelEl) panelEl.classList.remove('hidden');

    files.forEach(f => {
        const reader = new FileReader();
        reader.onload = (evt) => {
            const img = new Image();
            img.onload = () => {
                mergeImgs.push({ name: f.name, img });
                renderMergeList();
            };
            img.src = evt.target?.result as string;
        };
        reader.readAsDataURL(f);
    });
}

export function initImageMerger(): void {
    const input = document.getElementById('merge-files');
    if (input) {
        input.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            const files = target.files ? Array.from(target.files) : [];
            handleMergeFiles(files);
        });
    }
}
