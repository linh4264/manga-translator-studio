// Mock Fetch API for AI Services, OCR, and Network Simulation

export function setupFetchMock() {
    let mockHandlers = [];

    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url, options = {}) => {
        const urlStr = String(url);

        for (const handler of mockHandlers) {
            const match = typeof handler.matcher === 'function'
                ? handler.matcher(urlStr, options)
                : typeof handler.matcher === 'string'
                    ? urlStr.includes(handler.matcher)
                    : handler.matcher instanceof RegExp
                        ? handler.matcher.test(urlStr)
                        : false;

            if (match) {
                if (typeof handler.response === 'function') {
                    return handler.response(urlStr, options);
                }
                const status = handler.status || 200;
                const statusText = status === 200 ? 'OK' : 'Error';
                const body = handler.response;

                return {
                    ok: status >= 200 && status < 300,
                    status,
                    statusText,
                    headers: new Map(Object.entries(handler.headers || { 'content-type': 'application/json' })),
                    json: async () => typeof body === 'object' ? body : JSON.parse(body),
                    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
                    blob: async () => ({ size: 1024, type: 'application/octet-stream' })
                };
            }
        }

        // Fallback default mock for blob/data URLs
        if (urlStr.startsWith('data:')) {
            return {
                ok: true,
                status: 200,
                blob: async () => ({ size: 1024, type: 'image/png' }),
                text: async () => urlStr
            };
        }

        // Return empty 200 response by default in mock mode
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({}),
            text: async () => '{}',
            blob: async () => ({ size: 0, type: 'application/octet-stream' })
        };
    };

    return {
        addHandler(matcher, response, status = 200, headers = {}) {
            mockHandlers.unshift({ matcher, response, status, headers });
        },
        clearHandlers() {
            mockHandlers = [];
        },
        restore() {
            mockHandlers = [];
            if (originalFetch) globalThis.fetch = originalFetch;
        }
    };
}
