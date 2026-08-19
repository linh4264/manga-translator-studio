import { showToast } from '../core/utils';
import {
    PronounMatrixData,
    getParsedPronounMatrix,
    savePronounMatrixData
} from './dossier-lorebook';

export type { PronounMatrixData };
export { getParsedPronounMatrix };

export function savePronounMatrix(matrixData: PronounMatrixData): void {
    savePronounMatrixData(matrixData);
}


export function addCharacterToMatrix(): void {
    const charInput = document.getElementById('pronoun-char-name-input') as HTMLInputElement | null;
    if (!charInput) return;
    const name = charInput.value.trim();
    if (!name) {
        showToast('Vui lòng nhập tên nhân vật.', 'warn');
        return;
    }

    const matrix = getParsedPronounMatrix();
    if (matrix.characters.includes(name)) {
        showToast('Nhân vật này đã tồn tại trong danh sách.', 'warn');
        return;
    }

    matrix.characters.push(name);
    matrix.relationships[name] = matrix.relationships[name] || {};

    savePronounMatrix(matrix);
    charInput.value = '';
    renderPronounMatrixTable();
    showToast(`Đã thêm nhân vật ${name} vào ma trận xưng hô`, 'success');
}

export function removeCharacterFromMatrix(name: string): void {
    const matrix = getParsedPronounMatrix();
    matrix.characters = matrix.characters.filter(c => c !== name);
    delete matrix.relationships[name];

    matrix.characters.forEach(c => {
        if (matrix.relationships[c]) {
            delete matrix.relationships[c][name];
        }
    });

    savePronounMatrix(matrix);
    renderPronounMatrixTable();
    showToast(`Đã xoá nhân vật ${name} khỏi ma trận`, 'info');
}

export function updateRelationship(speaker: string, listener: string, value: string): void {
    const matrix = getParsedPronounMatrix();
    matrix.relationships[speaker] = matrix.relationships[speaker] || {};
    matrix.relationships[speaker][listener] = value;
    savePronounMatrix(matrix);
}

export function renderPronounMatrixTable(): void {
    const wrapper = document.getElementById('pronoun-matrix-table-wrapper');
    if (!wrapper) return;

    const matrix = getParsedPronounMatrix();
    const chars = matrix.characters;

    if (chars.length === 0) {
        wrapper.classList.add('hidden');
        wrapper.innerHTML = '';
        return;
    }

    wrapper.classList.remove('hidden');

    let html = `
        <table class="w-full text-[10px] text-slate-300 border-collapse bg-slate-950">
            <thead>
                <tr class="border-b border-slate-800 bg-slate-900">
                    <th class="p-1.5 text-left font-bold text-slate-400 sticky left-0 bg-slate-900 border-r border-slate-800">Gọi \\ Xưng</th>
    `;

    chars.forEach(name => {
        html += `
            <th class="p-1.5 text-center font-bold text-slate-400 border-r border-slate-800 min-w-[100px]">
                <div class="flex items-center justify-between gap-1">
                    <span class="truncate max-w-[70px]">${name}</span>
                    <button onclick="removeCharacterFromMatrix('${name}')" type="button" 
                        class="text-red-400 hover:text-red-300 text-[8px] p-0.5" title="Xoá nhân vật">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </th>
        `;
    });

    html += `
                </tr>
            </thead>
            <tbody>
    `;

    chars.forEach(speaker => {
        html += `
            <tr class="border-b border-slate-900">
                <td class="p-1.5 font-bold text-slate-300 sticky left-0 bg-slate-900 border-r border-slate-800 truncate max-w-[80px]">${speaker}</td>
        `;

        chars.forEach(listener => {
            if (speaker === listener) {
                html += `<td class="p-1 bg-slate-900/50 border-r border-slate-800 text-center text-slate-700 font-mono">-</td>`;
            } else {
                const currentVal = (matrix.relationships[speaker] && matrix.relationships[speaker][listener]) || '';
                html += `
                    <td class="p-1 border-r border-slate-800">
                        <input type="text" 
                            value="${currentVal}"
                            placeholder="vd: cậu - tớ"
                            oninput="updateRelationship('${speaker}', '${listener}', this.value)"
                            class="w-full bg-slate-900 border border-slate-800/80 rounded px-1 py-0.5 text-[10px] text-slate-200 focus:outline-none focus:border-indigo-500">
                    </td>
                `;
            }
        });

        html += `</tr>`;
    });

    html += `
            </tbody>
        </table>
    `;

    wrapper.innerHTML = html;
}

export function compilePronounMatrixPrompt(matrixData?: PronounMatrixData): string {
    const matrix = matrixData || getParsedPronounMatrix();
    const chars = matrix.characters;
    if (chars.length === 0) return '';


    let prompt = '- CHARACTER PRONOUN RULES (MA TRẬN XƯNG HÔ):\n';
    let hasRules = false;

    chars.forEach(speaker => {
        chars.forEach(listener => {
            if (speaker !== listener) {
                const rule = (matrix.relationships[speaker] && matrix.relationships[speaker][listener]) || '';
                if (rule.trim()) {
                    const parts = rule.split('-').map(p => p.trim());
                    const callPronoun = parts[0] || '';
                    const referPronoun = parts[1] || '';

                    let ruleDesc = `- When ${speaker} speaks to ${listener}: `;
                    if (callPronoun && referPronoun) {
                        ruleDesc += `${speaker} calls ${listener} "${callPronoun}" and refers to self as "${referPronoun}".`;
                    } else if (callPronoun) {
                        ruleDesc += `${speaker} calls ${listener} "${callPronoun}".`;
                    } else {
                        ruleDesc += `${speaker} refers to self as "${referPronoun}".`;
                    }
                    prompt += ruleDesc + '\n';
                    hasRules = true;
                }
            }
        });
    });

    return hasRules ? prompt : '';
}

