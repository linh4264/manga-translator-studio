import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../../setup/browser-env.js';

import {
    executeAiJsonRequestWithRetry,
    isRetryableAiError
} from '../../../src/features/ai/ai-client.ts';
import {
    setCancelTranslationFlag
} from '../../../src/features/ai/story-memory.ts';
import { globalState } from '../../../src/core/state.ts';

describe('AI Retry Architecture', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        setCancelTranslationFlag(false);
        globalState.maxRetries = 3;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        setCancelTranslationFlag(false);
    });

    it('isRetryableAiError correctly classifies errors', () => {
        // HTTP Status classification
        expect(isRetryableAiError(new Error('Rate limit'), 429)).toBe(true);
        expect(isRetryableAiError(new Error('Server error'), 500)).toBe(true);
        expect(isRetryableAiError(new Error('Bad gateway'), 502)).toBe(true);
        expect(isRetryableAiError(new Error('Service unavailable'), 503)).toBe(true);
        expect(isRetryableAiError(new Error('Gateway timeout'), 504)).toBe(true);

        // Non-retryable status
        expect(isRetryableAiError(new Error('Bad request'), 400)).toBe(false);
        expect(isRetryableAiError(new Error('Unauthorized'), 401)).toBe(false);
        expect(isRetryableAiError(new Error('Forbidden'), 403)).toBe(false);
        expect(isRetryableAiError(new Error('Not found'), 404)).toBe(false);

        // Error message fallback classification
        expect(isRetryableAiError(new Error('RESOURCE_EXHAUSTED: Quota exceeded'))).toBe(true);
        expect(isRetryableAiError(new Error('TypeError: Failed to fetch'))).toBe(true);
        expect(isRetryableAiError(new Error('Fetch timed out'))).toBe(true);
        expect(isRetryableAiError(new Error('Invalid API Key provided'))).toBe(false);
    });

    it('maxRetries = 0 never retries and fails on first attempt', async () => {
        let callCount = 0;
        globalThis.fetch = vi.fn().mockImplementation(async () => {
            callCount++;
            return {
                ok: false,
                status: 503,
                json: async () => ({ error: { message: 'Service Unavailable' } })
            };
        });

        let retryCallbackCalls = 0;
        await expect(executeAiJsonRequestWithRetry({
            apiUrl: 'https://fake-api.local/test',
            headers: {},
            body: '{}',
            isOpenAiFormat: false,
            maxRetries: 0,
            onRetry: () => { retryCallbackCalls++; }
        })).rejects.toThrow();

        expect(callCount).toBe(1);
        expect(retryCallbackCalls).toBe(0);
    });

    it('non-retryable 401 error fails immediately with 0 retries even if maxRetries = 3', async () => {
        let callCount = 0;
        globalThis.fetch = vi.fn().mockImplementation(async () => {
            callCount++;
            return {
                ok: false,
                status: 401,
                json: async () => ({ error: { message: 'API_KEY_INVALID' } })
            };
        });

        let retryCount = 0;
        await expect(executeAiJsonRequestWithRetry({
            apiUrl: 'https://fake-api.local/test',
            headers: {},
            body: '{}',
            isOpenAiFormat: false,
            maxRetries: 3,
            onRetry: () => { retryCount++; }
        })).rejects.toThrow('401');

        expect(callCount).toBe(1);
        expect(retryCount).toBe(0);
    });

    it('retry succeeds on subsequent attempt and invokes onRetry', async () => {
        let callCount = 0;
        const retryHistory = [];

        globalThis.fetch = vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                // First call fails with 429
                return {
                    ok: false,
                    status: 429,
                    json: async () => ({ error: { message: 'Rate limit exceeded' } })
                };
            }
            // Second call succeeds
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    candidates: [{
                        content: {
                            parts: [{
                                text: JSON.stringify({ blocks: [{ id: 'b1', original: 'Hello', translated: 'Xin chào' }] })
                            }]
                        }
                    }]
                })
            };
        });

        const result = await executeAiJsonRequestWithRetry({
            apiUrl: 'https://fake-api.local/test',
            headers: {},
            body: '{}',
            isOpenAiFormat: false,
            maxRetries: 2,
            onRetry: (info) => {
                retryHistory.push(info);
            }
        });

        expect(callCount).toBe(2);
        expect(retryHistory.length).toBe(1);
        expect(retryHistory[0].attempt).toBe(1);
        expect(retryHistory[0].maxRetries).toBe(2);
        expect(retryHistory[0].isRateLimit).toBe(true);
        expect(result && Array.isArray(result.blocks)).toBe(true);
        expect(result.blocks[0].translated).toBe('Xin chào');
    }, 15000);

    it('exhausts maxRetries and throws last error after 1 + maxRetries attempts', async () => {
        let callCount = 0;
        const retryAttempts = [];

        globalThis.fetch = vi.fn().mockImplementation(async () => {
            callCount++;
            return {
                ok: false,
                status: 500,
                json: async () => ({ error: { message: 'Internal Server Error' } })
            };
        });

        const maxRetries = 2;
        await expect(executeAiJsonRequestWithRetry({
            apiUrl: 'https://fake-api.local/test',
            headers: {},
            body: '{}',
            isOpenAiFormat: false,
            maxRetries: maxRetries,
            onRetry: (info) => {
                retryAttempts.push(info.attempt);
            }
        })).rejects.toThrow('500');

        expect(callCount).toBe(3);
        expect(retryAttempts).toEqual([1, 2]);
    }, 15000);

    it('instant cancellation when cancelTranslationFlag is set', async () => {
        setCancelTranslationFlag(true);

        let called = false;
        globalThis.fetch = vi.fn().mockImplementation(async () => {
            called = true;
            return { ok: true, json: async () => ({}) };
        });

        await expect(executeAiJsonRequestWithRetry({
            apiUrl: 'https://fake-api.local/test',
            headers: {},
            body: '{}',
            isOpenAiFormat: false,
            maxRetries: 2
        })).rejects.toThrow('Tiến trình đã bị dừng');

        expect(called).toBe(false);
    });
});
