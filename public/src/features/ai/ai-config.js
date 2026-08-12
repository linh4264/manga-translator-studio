import { globalState, apiKey } from '../../core/state.js';

export const DEFAULT_GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

export function getConfiguredAiProvider() {
    return (globalState.aiProvider || 'gemini').trim();
}

export function getConfiguredApiEndpoint() {
    if (globalState.aiProvider === 'custom' && globalState.apiEndpoint && globalState.apiEndpoint.trim()) {
        return globalState.apiEndpoint.trim().replace(/\/$/, '');
    }
    return DEFAULT_GEMINI_ENDPOINT;
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
