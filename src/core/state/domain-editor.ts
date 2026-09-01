/**
 * Manga Translator Studio - Domain State: Editor UI
 * Manages view mode, zoom, active tabs, tool selections, and mobile interaction states.
 */
import { BoundingBox } from '../../types/index';

export interface EditorState {
    viewMode: 'overlay' | 'split' | 'original';
    zoom: number;
    activeTab: 'edit' | 'style';
    bilingualMode: 'off' | 'sub' | 'raw';
    enableHoverTooltip: boolean;
    toolbarCollapsedMobile: boolean;
    magicWandActive: boolean;
    magicWandTolerance: number;
    magicWandDetectedBox: BoundingBox | null;
    dossierLorebookTab: string;
    toeicTab: string;
    isMobileHandMode: boolean;
}

export const editorState: EditorState = {
    viewMode: 'overlay',
    zoom: 100,
    activeTab: 'edit',
    bilingualMode: 'off',
    enableHoverTooltip: true,
    toolbarCollapsedMobile: false,
    magicWandActive: false,
    magicWandTolerance: 32,
    magicWandDetectedBox: null,
    dossierLorebookTab: 'dossier',
    toeicTab: 'analysis',
    isMobileHandMode: false
};
