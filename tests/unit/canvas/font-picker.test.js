import { describe, it, expect, beforeEach } from 'vitest';
import '../../setup/browser-env.js';
import { globalState } from '../../../src/core/state';
import {
    STANDARD_FONTS,
    updateFontPickerDisplay,
    renderFontPickerOptions,
    initFontLivePreviewPicker
} from '../../../src/ui/font-ui';

describe('Live Hover-Preview Font Picker Component', () => {
    beforeEach(() => {
        const trigger = document.getElementById('font-picker-trigger') || document.createElement('button');
        trigger.id = 'font-picker-trigger';

        const label = document.getElementById('font-picker-current-name') || document.createElement('span');
        label.id = 'font-picker-current-name';
        trigger.appendChild(label);

        const dropdown = document.getElementById('font-picker-dropdown') || document.createElement('div');
        dropdown.id = 'font-picker-dropdown';
        dropdown.className = 'hidden';

        const search = document.getElementById('font-picker-search') || document.createElement('input');
        search.id = 'font-picker-search';

        const items = document.getElementById('font-picker-items') || document.createElement('div');
        items.id = 'font-picker-items';

        dropdown.appendChild(search);
        dropdown.appendChild(items);

        globalState.pages = [
            {
                id: 'p1',
                blocks: [
                    {
                        id: 'b1',
                        original: 'Hello',
                        translated: 'Xin chào',
                        box: { x: 10, y: 10, w: 30, h: 20 },
                        style: { fontFamily: 'font-manga', fontSize: 18 }
                    }
                ]
            }
        ];
        globalState.activePageIndex = 0;
        globalState.selectedBlockId = 'b1';
    });

    it('1. Renders all standard fonts in picker items container', () => {
        renderFontPickerOptions();
        const items = document.getElementById('font-picker-items');
        expect(items.textContent).toContain('Chuẩn Manga (Nunito Bold)');
        expect(items.textContent).toContain('Cơ khí / Robot (Chakra Petch)');
    });

    it('2. Filters fonts accurately with search query', () => {
        renderFontPickerOptions('bangers');
        const items = document.getElementById('font-picker-items');
        expect(items.textContent).toContain('Kỳ vĩ / SFX (Bangers)');
        expect(items.textContent).not.toContain('Chakra Petch');
    });

    it('3. Updates font picker trigger label when active block changes', () => {
        updateFontPickerDisplay('font-tech');
        const label = document.getElementById('font-picker-current-name');
        expect(label?.textContent).toContain('Cơ khí / Robot');
    });
});
