import { globalState, apiKey } from '../../core/state.js';

export const DEFAULT_GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

export function getConfiguredAiProvider() {
    return (globalState.aiProvider || 'gemini').trim();
}

export function getConfiguredApiEndpoint() {
    return (globalState.apiEndpoint || DEFAULT_GEMINI_ENDPOINT).trim().replace(/\/$/, '');
}

export function getConfiguredApiKey() {
    return (globalState.apiKey || apiKey || '').trim();
}

export function getGeminiGenerateContentUrl(modelId, key = getConfiguredApiKey()) {
    const model = (modelId || '').trim();
    const endpoint = getConfiguredApiEndpoint();
    return `${endpoint}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
}

export function getGeminiModelsUrl(key = getConfiguredApiKey()) {
    const endpoint = getConfiguredApiEndpoint();
    return `${endpoint}/models?key=${encodeURIComponent(key)}`;
}
