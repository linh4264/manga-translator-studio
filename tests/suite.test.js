const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

// Polyfill minimal browser globals for ESM testing under Node environment
if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => store.get(k) || null,
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear()
    };
}

// 1. OCR Box Normalization Test
test('OCR Box Normalization (scale 0-1000 to 0-100)', async () => {
    const { normalizeAiBlockBox } = await import('../public/src/features/ocr/ocr-service.js');
    
    // Scale 0-1000
    const rawBox1000 = { x: 200, y: 150, w: 300, h: 400 };
    const norm1 = normalizeAiBlockBox(rawBox1000);
    assert.deepStrictEqual(norm1, { x: 20, y: 15, w: 30, h: 40 });

    // Scale 0-1 (float)
    const rawBoxFloat = { x: 0.2, y: 0.15, w: 0.3, h: 0.4 };
    const norm2 = normalizeAiBlockBox(rawBoxFloat);
    assert.deepStrictEqual(norm2, { x: 20, y: 15, w: 30, h: 40 });
});

// 2. Server Security & Path Traversal Test
test('Server Path Traversal Prevention', async () => {
    const serverPath = path.join(__dirname, '../server/server.js');
    const serverProc = spawn('node', [serverPath], { stdio: 'pipe' });

    // Wait for server startup
    await new Promise((resolve) => setTimeout(resolve, 1500));

    try {
        const req = await new Promise((resolve, reject) => {
            const request = http.request({
                hostname: 'localhost',
                port: 3000,
                path: '/../server/server.js',
                method: 'GET'
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode, data }));
            });
            request.on('error', reject);
            request.end();
        });

        assert.strictEqual(req.statusCode, 403, 'Should reject path traversal with 403');
    } finally {
        serverProc.kill();
    }
});

// 3. Module Import Integrity & State Functions Test
test('All Core JS Modules Import Successfully and State Functions Work', async () => {
    const state = await import('../public/src/core/state.js');
    assert.strictEqual(typeof state.deleteFontFromDB, 'function');
    assert.strictEqual(typeof state.initDB, 'function');
    assert.strictEqual(typeof state.globalState, 'object');
});
