import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import {
    DEFAULT_GEMINI_ENDPOINT,
    getConfiguredAiProvider,
    getConfiguredApiEndpoint,
    getConfiguredApiKey,
    getGeminiGenerateContentUrl,
    getGeminiModelsUrl
} from '../../../src/features/ai/ai-config.ts';
import { globalState } from '../../../src/core/state.ts';

test('AI Providers - Gemini URL and Endpoint Configuration', () => {
    globalState.aiProvider = 'gemini';
    globalState.apiKey = 'AIzaSy_TEST_KEY_123';

    assert.strictEqual(getConfiguredAiProvider(), 'gemini');
    assert.strictEqual(getConfiguredApiEndpoint(), DEFAULT_GEMINI_ENDPOINT);
    assert.strictEqual(getConfiguredApiKey(), 'AIzaSy_TEST_KEY_123');

    const generateUrl = getGeminiGenerateContentUrl('gemini-2.5-flash');
    assert.ok(generateUrl.includes('gemini-2.5-flash:generateContent'));
    assert.ok(generateUrl.includes('key=AIzaSy_TEST_KEY_123'));

    const modelsUrl = getGeminiModelsUrl();
    assert.ok(modelsUrl.includes('/models?key=AIzaSy_TEST_KEY_123'));
});

test('AI Providers - Custom / Local LLM Endpoint Configuration', () => {
    globalState.aiProvider = 'custom';
    globalState.apiEndpoint = 'http://localhost:11434/v1/';
    globalState.apiKey = 'local-dummy-key';

    assert.strictEqual(getConfiguredAiProvider(), 'custom');
    assert.strictEqual(getConfiguredApiEndpoint(), 'http://localhost:11434/v1', 'Trailing slash must be stripped');

    const customGenerateUrl = getGeminiGenerateContentUrl('llama3-manga');
    assert.ok(customGenerateUrl.startsWith('http://localhost:11434/v1/models/llama3-manga:generateContent'));

    // Reset back
    globalState.aiProvider = 'gemini';
    globalState.apiEndpoint = DEFAULT_GEMINI_ENDPOINT;
});
