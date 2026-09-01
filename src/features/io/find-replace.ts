/**
 * Manga Translator Studio - IO: Global Find & Replace in Manga Text Blocks
 * Manages search & replace across all pages in the current project with regex escaping and autofit cache invalidation.
 */
import { globalState, pushStateToHistory, savePageToDB } from '../../core/state';
import { showToast } from '../../core/utils';
import { ensureModalElement } from '../../core/component-loader';
import { renderOverlays } from '../canvas/canvas-service';
import { updateActiveBlockEditor } from '../../ui/index';

export async function openFindReplaceModal(): Promise<void> {
    const modal = await ensureModalElement('find-replace-modal');
    if (modal) {
        modal.classList.remove('hidden');
        const findInput = document.getElementById('find-input');
        if (findInput) setTimeout(() => findInput.focus(), 50);
    }
}

export function closeFindReplaceModal(): void {
    const modal = document.getElementById('find-replace-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

export function executeFindReplaceAll(): void {
    const findText = (document.getElementById('find-input') as HTMLInputElement)?.value || '';
    const replaceText = (document.getElementById('replace-input') as HTMLInputElement)?.value || '';
    const matchCase = (document.getElementById('match-case-chk') as HTMLInputElement)?.checked || false;
    const badge = document.getElementById('find-replace-result-badge');

    if (!findText) {
        showToast("Vui lòng nhập từ hoặc cụm từ cần tìm kiếm.", "warn");
        return;
    }

    pushStateToHistory(true);

    let count = 0;
    const flags = matchCase ? 'g' : 'gi';
    const escapedFindText = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedFindText, flags);

    globalState.pages.forEach(page => {
        let pageChanged = false;
        if (page.blocks) {
            page.blocks.forEach(block => {
                if (block.translated) {
                    const newText = block.translated.replace(regex, replaceText);
                    if (newText !== block.translated) {
                        block.translated = newText;
                        block.autoFitCache = null;
                        count++;
                        pageChanged = true;
                    }
                }
            });
        }
        if (pageChanged) {
            savePageToDB(page);
        }
    });

    if (badge) {
        badge.innerText = `Đã sửa ${count} từ`;
        badge.classList.remove('hidden');
    }

    renderOverlays();
    updateActiveBlockEditor();
    showToast(`⚡ Đã tìm và thay thế thành công ${count} vị trí trên tất cả các trang!`, "success");
    closeFindReplaceModal();
}
