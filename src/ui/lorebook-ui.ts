import { showToast, escapeHTML } from '../core/utils';
import { ensureModalElement } from '../core/component-loader';
import {
    getCharacterDossier,
    addCharacterDossierItem,
    removeCharacterDossierItem,
    setCharacterDossier,
    getLorebook,
    addLorebookItem,
    removeLorebookItem,
    setLorebook
} from '../features/dossier-lorebook';

export async function openLorebookModal(): Promise<void> {
    const modal = await ensureModalElement('lorebook-dossier-modal');
    if (modal) {
        modal.classList.remove('hidden');
        renderCharacterDossierUI();
        renderLorebookUI();
        initLorebookDelegationOnce();
    }
}



export function closeLorebookModal(): void {
    document.getElementById('lorebook-dossier-modal')?.classList.add('hidden');
}

export function switchLorebookTab(tab: string): void {
    const tabDossierBtn = document.getElementById('tab-btn-dossier');
    const tabLorebookBtn = document.getElementById('tab-btn-lorebook');
    const panelDossier = document.getElementById('lorebook-tab-dossier');
    const panelLorebook = document.getElementById('lorebook-tab-lorebook');

    if (tab === 'dossier') {
        if (tabDossierBtn) tabDossierBtn.className = "py-2.5 text-xs font-bold border-b-2 border-indigo-500 text-indigo-400 flex items-center gap-1.5 transition-all";
        if (tabLorebookBtn) tabLorebookBtn.className = "py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-all";
        if (panelDossier) panelDossier.classList.remove('hidden');
        if (panelLorebook) panelLorebook.classList.add('hidden');
    } else {
        if (tabLorebookBtn) tabLorebookBtn.className = "py-2.5 text-xs font-bold border-b-2 border-purple-500 text-purple-400 flex items-center gap-1.5 transition-all";
        if (tabDossierBtn) tabDossierBtn.className = "py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-all";
        if (panelLorebook) panelLorebook.classList.remove('hidden');
        if (panelDossier) panelDossier.classList.add('hidden');
    }
}

let isListenerInitialized = false;
function initLorebookDelegationOnce(): void {
    if (isListenerInitialized) return;

    const dossierContainer = document.getElementById('dossier-items-list');
    if (dossierContainer) {
        dossierContainer.addEventListener('click', (e) => {
            const target = e.target as HTMLElement | null;
            const btn = target?.closest('[data-dossier-id]') as HTMLElement | null;
            if (btn?.dataset.dossierId) {
                removeCharacterDossierEntry(btn.dataset.dossierId);
            }
        });
    }

    const lorebookContainer = document.getElementById('lorebook-items-list');
    if (lorebookContainer) {
        lorebookContainer.addEventListener('click', (e) => {
            const target = e.target as HTMLElement | null;
            const btn = target?.closest('[data-lorebook-id]') as HTMLElement | null;
            if (btn?.dataset.lorebookId) {
                removeLorebookTermEntry(btn.dataset.lorebookId);
            }
        });
    }

    isListenerInitialized = true;
}

export function renderCharacterDossierUI(): void {
    const container = document.getElementById('dossier-items-list');
    const badge = document.getElementById('dossier-count');
    const items = getCharacterDossier();
    if (badge) badge.textContent = String(items.length);

    if (!container) return;
    if (items.length === 0) {
        container.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs italic">Chưa có nhân vật nào trong hồ sơ. Hãy thêm nhân vật đầu tiên bên trên!</div>`;
        return;
    }

    container.innerHTML = items.map((item) => `
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-indigo-500/40 transition-all">
            <div class="space-y-1 min-w-0 flex-1">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-slate-200">${escapeHTML(item.originalName)} → <span class="text-indigo-400">${escapeHTML(item.translatedName)}</span></span>
                    <span class="text-[9px] px-1.5 py-0.5 rounded ${item.gender === 'female' ? 'bg-pink-950/60 text-pink-300 border border-pink-500/30' : item.gender === 'male' ? 'bg-sky-950/60 text-sky-300 border border-sky-500/30' : 'bg-slate-800 text-slate-400'} font-semibold">
                        ${item.gender === 'female' ? 'Nữ' : item.gender === 'male' ? 'Nam' : 'Khác'}
                    </span>
                </div>
                <div class="text-[11px] text-slate-400 flex items-center gap-3">
                    <span>💬 Xưng hô: <b>${escapeHTML(item.pronounSelf || 'tôi')}</b> - <b>${escapeHTML(item.pronounTarget || 'cậu')}</b></span>
                    ${item.personality ? `<span class="truncate">🎭 ${escapeHTML(item.personality)}</span>` : ''}
                </div>
            </div>
            <button data-dossier-id="${item.id}" class="w-7 h-7 hover:bg-red-950 text-red-400 rounded flex items-center justify-center transition-colors" title="Xóa nhân vật">
                <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
        </div>
    `).join('');
}

export function addCharacterDossierEntry(): void {
    const origInput = document.getElementById('dossier-input-orig') as HTMLInputElement | null;
    const transInput = document.getElementById('dossier-input-trans') as HTMLInputElement | null;
    const genderInput = document.getElementById('dossier-input-gender') as HTMLSelectElement | null;
    const selfInput = document.getElementById('dossier-input-self') as HTMLInputElement | null;
    const targetInput = document.getElementById('dossier-input-target') as HTMLInputElement | null;
    const personalityInput = document.getElementById('dossier-input-personality') as HTMLInputElement | null;

    const originalName = origInput?.value.trim() || '';
    const translatedName = transInput?.value.trim() || '';

    if (!originalName || !translatedName) {
        showToast('Vui lòng nhập đầy đủ tên gốc và tên dịch của nhân vật.', 'warn');
        return;
    }

    addCharacterDossierItem({
        originalName,
        translatedName,
        gender: (genderInput?.value as 'male' | 'female' | 'other') || 'male',
        pronounSelf: selfInput?.value.trim() || 'tôi',
        pronounTarget: targetInput?.value.trim() || 'cậu',
        personality: personalityInput?.value.trim() || ''
    });

    renderCharacterDossierUI();

    if (origInput) origInput.value = '';
    if (transInput) transInput.value = '';
    if (selfInput) selfInput.value = '';
    if (targetInput) targetInput.value = '';
    if (personalityInput) personalityInput.value = '';

    showToast(`Đã thêm nhân vật ${translatedName} vào Hồ sơ!`, 'success');
}

export function removeCharacterDossierEntry(id: string): void {
    removeCharacterDossierItem(id);
    renderCharacterDossierUI();
    showToast('Đã xóa nhân vật khỏi Hồ sơ.', 'info');
}

export function renderLorebookUI(): void {
    const container = document.getElementById('lorebook-items-list');
    const badge = document.getElementById('lorebook-count');
    const items = getLorebook();
    if (badge) badge.textContent = String(items.length);

    if (!container) return;
    if (items.length === 0) {
        container.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs italic">Chưa có thuật ngữ Lorebook nào. Hãy thêm thuật ngữ đầu tiên bên trên!</div>`;
        return;
    }

    container.innerHTML = items.map((item) => `
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-purple-500/40 transition-all">
            <div class="space-y-1 min-w-0 flex-1">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-slate-200">${escapeHTML(item.originalTerm)} → <span class="text-purple-400">${escapeHTML(item.translatedTerm)}</span></span>
                    <span class="text-[9px] px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-500/30 font-semibold">
                        ${escapeHTML(item.category || 'Khác')}
                    </span>
                </div>
                ${item.note ? `<div class="text-[11px] text-slate-400 truncate">💡 Ghi chú AI: ${escapeHTML(item.note)}</div>` : ''}
            </div>
            <button data-lorebook-id="${item.id}" class="w-7 h-7 hover:bg-red-950 text-red-400 rounded flex items-center justify-center transition-colors" title="Xóa thuật ngữ">
                <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
        </div>
    `).join('');
}

export function addLorebookTermEntry(): void {
    const origInput = document.getElementById('lore-input-orig') as HTMLInputElement | null;
    const transInput = document.getElementById('lore-input-trans') as HTMLInputElement | null;
    const catInput = document.getElementById('lore-input-category') as HTMLSelectElement | null;
    const noteInput = document.getElementById('lore-input-note') as HTMLInputElement | null;

    const originalTerm = origInput?.value.trim() || '';
    const translatedTerm = transInput?.value.trim() || '';

    if (!originalTerm || !translatedTerm) {
        showToast('Vui lòng nhập đầy đủ từ gốc và bản dịch chuẩn.', 'warn');
        return;
    }

    addLorebookItem({
        originalTerm,
        translatedTerm,
        category: catInput?.value || 'Khác',
        note: noteInput?.value.trim() || ''
    });

    renderLorebookUI();

    if (origInput) origInput.value = '';
    if (transInput) transInput.value = '';
    if (noteInput) noteInput.value = '';

    showToast(`Đã thêm thuật ngữ ${translatedTerm} vào Lorebook!`, 'success');
}

export function removeLorebookTermEntry(id: string): void {
    removeLorebookItem(id);
    renderLorebookUI();
    showToast('Đã xóa thuật ngữ khỏi Lorebook.', 'info');
}

export function exportLorebookJSON(): void {
    const data = {
        characterDossier: getCharacterDossier(),
        lorebook: getLorebook()
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lorebook_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã xuất file Lorebook Backup JSON thành công!', 'success');
}

export function importLorebookJSON(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target?.result as string);
            if (data.characterDossier) setCharacterDossier(data.characterDossier);
            if (data.lorebook) setLorebook(data.lorebook);

            renderCharacterDossierUI();
            renderLorebookUI();
            showToast('Đã nhập dữ liệu Lorebook & Nhân vật thành công!', 'success');
        } catch (err) {
            showToast('File JSON không hợp lệ hoặc bị hỏng.', 'error');
        }
    };
    reader.readAsText(file);
}

