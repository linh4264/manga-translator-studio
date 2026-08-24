import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import '../../setup/indexeddb-mock.js';

import {
    globalState,
    ensureCustomFontLoaded,
    failedCustomFontFamilies,
    loadedCustomFontFamilies
} from '../../../src/core/state.ts';

import {
    executeAiJsonRequestWithRetry
} from '../../../src/features/ai/ai-client.ts';

import {
    translatePage
} from '../../../src/features/ai/page-translator.ts';

test('Error Handling - Custom font missing from DB tracks in failedCustomFontFamilies', async () => {
    failedCustomFontFamilies.clear();
    loadedCustomFontFamilies.clear();

    const result = await ensureCustomFontLoaded('NonExistentCustomFont123', true);
    assert.strictEqual(result, false, 'Should return false when font is not in DB');
    assert.strictEqual(failedCustomFontFamilies.has('NonExistentCustomFont123'), true, 'Should add missing font to failedCustomFontFamilies');

    // Second call should return immediately without redundant DB calls
    const cachedResult = await ensureCustomFontLoaded('NonExistentCustomFont123', false);
    assert.strictEqual(cachedResult, false);
});

test('Error Handling - AI Client contextual status error messages', async () => {
    // Mock 401 Unauthorized
    global.fetch = async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'API key not valid' } })
    });

    try {
        await executeAiJsonRequestWithRetry({
            apiUrl: 'https://mock.api/v1/chat',
            headers: {},
            body: '{}',
            isOpenAiFormat: true,
            errorLabel: 'OCR Vision',
            maxRetries: 0
        });
        assert.fail('Should throw on 401');
    } catch (err) {
        assert.strictEqual(err.status, 401);
        assert.ok(err.message.includes('HTTP 401'), 'Error message should include HTTP 401');
        assert.ok(err.message.includes('API Key không hợp lệ'), 'Error message should include Vietnamese hint');
    }

    // Mock 429 Rate Limit
    global.fetch = async () => ({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Quota exceeded' } })
    });

    try {
        await executeAiJsonRequestWithRetry({
            apiUrl: 'https://mock.api/v1/chat',
            headers: {},
            body: '{}',
            isOpenAiFormat: true,
            errorLabel: 'Translation',
            maxRetries: 0
        });
        assert.fail('Should throw on 429');
    } catch (err) {
        assert.strictEqual(err.status, 429);
        assert.ok(err.message.includes('Quota / Rate Limit'), 'Error message should include Quota hint');
    }
});

test('Error Handling - Page Translation failure records lastError and failedStep on page', async () => {
    globalState.pages = [
        {
            id: 'page_test_err_1',
            name: 'Test Page Error',
            width: 800,
            height: 1200,
            status: 'draft',
            blocks: [],
            file: new Blob(['fake-img'], { type: 'image/jpeg' }),
            originalFile: new Blob(['fake-img'], { type: 'image/jpeg' })
        }
    ];
    globalState.activePageIndex = 0;
    globalState.apiKey = 'test-invalid-key';

    // Mock 401 Unauthorized fetch failure (non-retryable, fails immediately)
    global.fetch = async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'API key not valid' } })
    });

    const success = await translatePage(0);
    assert.strictEqual(success, false, 'Translation should return false on failure');

    const page = globalState.pages[0];
    assert.strictEqual(page.status, 'error', 'Page status must be error');
    assert.ok(page.lastError && page.lastError.length > 0, 'Page lastError must be recorded');
    assert.ok(page.failedStep && page.failedStep.length > 0, 'Page failedStep must be identified');
});
