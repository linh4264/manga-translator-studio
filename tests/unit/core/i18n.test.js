import { test, expect, assert } from 'vitest';
import '../../setup/browser-env.js';

import { i18nDict, t, changeUILanguage } from '../../../src/core/i18n.ts';
import { globalState } from '../../../src/core/state.ts';

test('Core i18n - Dictionary Completeness and Symmetry (vi <-> en)', () => {
    assert.ok(i18nDict.vi, 'Vietnamese dictionary must exist');
    assert.ok(i18nDict.en, 'English dictionary must exist');

    const viKeys = Object.keys(i18nDict.vi);
    const enKeys = Object.keys(i18nDict.en);

    assert.ok(viKeys.length > 50, 'Vietnamese dictionary should have substantial entries');
    assert.ok(enKeys.length > 50, 'English dictionary should have substantial entries');

    // Check for missing keys in either direction
    const missingInEn = viKeys.filter(k => !(k in i18nDict.en));
    const missingInVi = enKeys.filter(k => !(k in i18nDict.vi));

    assert.deepStrictEqual(missingInEn, [], 'All Vietnamese keys must have English counterparts');
    assert.deepStrictEqual(missingInVi, [], 'All English keys must have Vietnamese counterparts');
});

test('Core i18n - Translation Function t() with Dynamic Language Switching', () => {
    changeUILanguage('vi');
    assert.strictEqual(globalState.uiLanguage, 'vi');
    assert.strictEqual(t('settings-btn'), 'Cài đặt');

    changeUILanguage('en');
    assert.strictEqual(globalState.uiLanguage, 'en');
    assert.strictEqual(t('settings-btn'), 'Settings');

    // Test fallback for non-existent key
    assert.strictEqual(t('non-existent-key-12345'), 'non-existent-key-12345');

    // Reset back to Vietnamese
    changeUILanguage('vi');
});
