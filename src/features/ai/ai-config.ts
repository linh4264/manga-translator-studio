import { globalState, apiKey } from '../../core/state';

export const DEFAULT_GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

export function getConfiguredAiProvider(): string {
    return (globalState.aiProvider || 'gemini').trim();
}

export function getConfiguredApiEndpoint(): string {
    if (globalState.aiProvider === 'custom' && globalState.apiEndpoint && globalState.apiEndpoint.trim()) {
        return globalState.apiEndpoint.trim().replace(/\/$/, '');
    }
    return DEFAULT_GEMINI_ENDPOINT;
}

export function getConfiguredApiKey(): string {
    return (globalState.apiKey || apiKey || '').trim();
}

export function getGeminiGenerateContentUrl(modelId?: string, key: string = getConfiguredApiKey()): string {
    const model = (modelId || '').trim();
    const endpoint = getConfiguredApiEndpoint();
    return `${endpoint}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
}

export function getGeminiModelsUrl(key: string = getConfiguredApiKey()): string {
    const endpoint = getConfiguredApiEndpoint();
    return `${endpoint}/models?key=${encodeURIComponent(key)}`;
}
