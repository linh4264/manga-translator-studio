// Domain State & Operations for Character Dossier, Lorebook & Pronoun Matrix
import { globalState, saveProjectMeta } from '../core/state';
import { safeSetLocalStorage } from '../core/utils/storage';
import { CharacterDossierEntry, LorebookEntry } from '../types/index';

export interface PronounMatrixData {
    characters: string[];
    relationships: Record<string, Record<string, string>>;
}

export function getCharacterDossier(): CharacterDossierEntry[] {
    return Array.isArray(globalState.characterDossier) ? globalState.characterDossier : [];
}

export function setCharacterDossier(entries: CharacterDossierEntry[], persistMeta: boolean = true): void {
    globalState.characterDossier = Array.isArray(entries) ? entries : [];
    if (persistMeta && Array.isArray(globalState.pages)) {
        saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);
    }
}

export function addCharacterDossierItem(entry: Omit<CharacterDossierEntry, 'id'> & { id?: string }): CharacterDossierEntry {
    const item: CharacterDossierEntry = {
        id: entry.id || `char_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        originalName: entry.originalName.trim(),
        translatedName: entry.translatedName.trim(),
        gender: entry.gender || 'male',
        pronounSelf: (entry.pronounSelf || 'tôi').trim(),
        pronounTarget: (entry.pronounTarget || 'cậu').trim(),
        personality: (entry.personality || '').trim(),
        notes: (entry.notes || '').trim()
    };

    const current = getCharacterDossier();
    globalState.characterDossier = [...current, item];
    if (Array.isArray(globalState.pages)) {
        saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);
    }
    return item;
}

export function removeCharacterDossierItem(id: string): void {
    const current = getCharacterDossier();
    globalState.characterDossier = current.filter(c => c.id !== id);
    if (Array.isArray(globalState.pages)) {
        saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);
    }
}

export function getLorebook(): LorebookEntry[] {
    return Array.isArray(globalState.lorebook) ? globalState.lorebook : [];
}

export function setLorebook(entries: LorebookEntry[], persistMeta: boolean = true): void {
    globalState.lorebook = Array.isArray(entries) ? entries : [];
    if (persistMeta && Array.isArray(globalState.pages)) {
        saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);
    }
}

export function addLorebookItem(entry: Omit<LorebookEntry, 'id'> & { id?: string }): LorebookEntry {
    const item: LorebookEntry = {
        id: entry.id || `lore_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        originalTerm: entry.originalTerm.trim(),
        translatedTerm: entry.translatedTerm.trim(),
        category: entry.category || 'Khác',
        note: (entry.note || '').trim()
    };

    const current = getLorebook();
    globalState.lorebook = [...current, item];
    if (Array.isArray(globalState.pages)) {
        saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);
    }
    return item;
}

export function removeLorebookItem(id: string): void {
    const current = getLorebook();
    globalState.lorebook = current.filter(l => l.id !== id);
    if (Array.isArray(globalState.pages)) {
        saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);
    }
}

export function getParsedPronounMatrix(): PronounMatrixData {
    try {
        if (!globalState.pronounMatrix) return { characters: [], relationships: {} };
        const parsed = typeof globalState.pronounMatrix === 'string'
            ? JSON.parse(globalState.pronounMatrix)
            : globalState.pronounMatrix;
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.characters)) {
            return parsed;
        }
    } catch (e) {
        console.warn("Failed to parse pronoun matrix:", e);
    }
    return { characters: [], relationships: {} };
}

export function savePronounMatrixData(matrixData: PronounMatrixData): void {
    const jsonStr = JSON.stringify(matrixData);
    globalState.pronounMatrix = jsonStr;
    safeSetLocalStorage('gemini_manga_pronoun_matrix', jsonStr);
}
