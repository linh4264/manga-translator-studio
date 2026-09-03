import { getAiConfig } from './ai-state';

export const DEFAULT_GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

export const GEMINI_SAFETY_SETTINGS_BLOCK_NONE = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
];

export function getConfiguredAiProvider(): string {
    return getAiConfig().aiProvider;
}

export function getConfiguredApiEndpoint(): string {
    const config = getAiConfig();
    if (config.aiProvider === 'custom' && config.apiEndpoint && config.apiEndpoint.trim()) {
        return config.apiEndpoint.trim().replace(/\/$/, '');
    }
    return DEFAULT_GEMINI_ENDPOINT;
}

export function getConfiguredApiKey(): string {
    return getAiConfig().apiKey;
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

