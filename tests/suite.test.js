const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
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

// 2. Local Text Contour Detection Engine Test
test('Offline Local Text Detection Engine', async () => {
    const { detectLocalTextRegions } = await import('../public/src/features/ocr/local-ocr.js');

    // Create 100x100 synthetic image data with a dark rectangle block
    const W = 100, H = 100;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255; // White background
    }

    // Draw a dark 30x30 text block at (20, 20)
    for (let y = 20; y < 50; y++) {
        for (let x = 20; x < 50; x++) {
            const idx = (y * W + x) * 4;
            data[idx] = 10; data[idx + 1] = 10; data[idx + 2] = 10; // Dark ink
        }
    }

    const mockImageData = { width: W, height: H, data: data };
    const regions = detectLocalTextRegions(mockImageData);
    assert.ok(Array.isArray(regions), 'Regions should be an array');
    assert.ok(regions.length >= 1, 'Should detect synthetic dark region');
    assert.ok(regions[0].x >= 15 && regions[0].x <= 25, 'Detected X should match synthetic box bounds');
});

// 3. Server Security & Path Traversal Test
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

// 4. PWA Web App Manifest & Service Worker Validation
test('PWA Web App Manifest and Service Worker Assets', async () => {
    const manifestPath = path.join(__dirname, '../public/manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');
    const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.strictEqual(manifestContent.display, 'standalone');
    assert.strictEqual(manifestContent.name, 'Manga Translator Studio');

    const swPath = path.join(__dirname, '../public/sw.js');
    assert.ok(fs.existsSync(swPath), 'sw.js Service Worker file must exist');
});

// 5. Module Import Integrity & State Functions Test
test('All Core JS Modules Import Successfully and State Functions Work', async () => {
    const state = await import('../public/src/core/state.js');
    assert.strictEqual(typeof state.deleteFontFromDB, 'function');
    assert.strictEqual(typeof state.initDB, 'function');
    assert.strictEqual(typeof state.globalState, 'object');
});

// 6. Chinese to Vietnamese Translation Prompt Guidance Test
test('Chinese to Vietnamese Translation Prompt Master Specification', async () => {
    const { globalState } = await import('../public/src/core/state.js');
    const { getTranslationGuidancePrompt } = await import('../public/src/features/ai/ai-service.js');
    
    globalState.sourceLanguage = 'zh';
    globalState.targetLanguage = 'vi';

    const promptText = getTranslationGuidancePrompt();
    assert.ok(promptText.includes('CHINESE TO VIETNAMESE MANHWA TRANSLATION MASTER SPECIFICATION'), 'Should contain Chinese to Vietnamese Master Spec header');
    assert.ok(promptText.includes('QUY TẮC XƯNG HÔ & VĂN PHONG THEO BỐI CẢNH'), 'Should contain Pronoun and Persona rules');
    assert.ok(promptText.includes('XỬ LÝ TỪ NGHĨA HÁN VIỆT & THÀNH NGỮ'), 'Should contain Chengyu & Sino-Vietnamese rules');
    assert.ok(promptText.includes('TRỢ TỪ NGỮ KHÍ & KHẨU NGỮ TIẾNG TRUNG'), 'Should contain Modal particles and slang rules');
    assert.ok(promptText.includes('THUẬT NGỮ CẢNH GIỚI, TU VI & HỆ THỐNG'), 'Should contain Cultivation and system terms rules');
    assert.ok(promptText.includes('TỪ TƯỢNG THANH / TỪ TƯỢNG HÌNH MANHUA'), 'Should contain SFX rules');
});

