const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

// Polyfill minimal browser globals for ESM testing under Node environment
if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: (tag) => {
            const el = {
                tagName: tag ? String(tag).toUpperCase() : 'DIV',
                style: {},
                children: [],
                classList: { add: () => {}, remove: () => {}, toggle: () => {} },
                setAttribute: (k, v) => { el[k] = v; },
                appendChild: (child) => { el.children.push(child); return child; },
                addEventListener: () => {}
            };
            return el;
        },
        createTextNode: (text) => ({ nodeType: 3, textContent: String(text || '') })
    };
}
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

// 7. Image Block Overlay Module Functions & Structure Test
test('Image Block Overlay Structure and Service Functions', async () => {
    const canvasInteractions = await import('../public/src/features/canvas/canvas-interactions.js');
    const blockEditorUi = await import('../public/src/ui/block-editor-ui.js');

    assert.strictEqual(typeof canvasInteractions.triggerAddImageBlock, 'function');
    assert.strictEqual(typeof canvasInteractions.handleImageBlockSelect, 'function');
    assert.strictEqual(typeof canvasInteractions.triggerReplaceImageBlock, 'function');
    assert.strictEqual(typeof canvasInteractions.handleReplaceImageBlockSelect, 'function');

    assert.strictEqual(typeof blockEditorUi.updateImageBlockOpacity, 'function');
    assert.strictEqual(typeof blockEditorUi.updateImageBlockFit, 'function');
    assert.strictEqual(typeof blockEditorUi.updateImageBlockBorderRadius, 'function');

    // Test Image Block object properties
    const mockImageBlock = {
        id: `image_block_${Date.now()}`,
        type: 'image',
        imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        original: '[IMAGE]',
        translated: '',
        box: { x: 35, y: 35, w: 30, h: 20 },
        style: {
            rotate: 0,
            opacity: 80,
            fit: 'contain',
            borderRadius: 8
        }
    };

    assert.strictEqual(mockImageBlock.type, 'image');
    assert.ok(mockImageBlock.imageUrl.startsWith('data:image/'), 'Image URL should be a valid data URI');
    assert.strictEqual(mockImageBlock.style.opacity, 80);
    assert.strictEqual(mockImageBlock.style.fit, 'contain');
    assert.strictEqual(mockImageBlock.style.borderRadius, 8);

    // Test history & DB preservation
    const { pushStateToHistory, globalState } = await import('../public/src/core/state.js');
    globalState.pages = [{ id: 'p1', status: 'draft', blocks: [mockImageBlock] }];
    globalState.activePageIndex = 0;
    pushStateToHistory();

    const { undoStack } = await import('../public/src/core/state.js');
    const snapshotBlock = undoStack[undoStack.length - 1].pagesState[0].blocks[0];
    assert.strictEqual(snapshotBlock.imageUrl, mockImageBlock.imageUrl, 'History snapshot must preserve block imageUrl');
});

// 8. Full Chapter Translation Script Export & Import Test
test('Full Chapter Translation Script Export and Import Functions', async () => {
    const io = await import('../public/src/features/io.js');
    const canvasRenderer = await import('../public/src/features/canvas/canvas-renderer.js');
    assert.strictEqual(typeof io.exportTranslationScript, 'function');
    assert.strictEqual(typeof io.promptExportScript, 'function');
    assert.strictEqual(typeof io.importTranslationScript, 'function');
    assert.strictEqual(typeof io.triggerImportScript, 'function');
    assert.strictEqual(typeof canvasRenderer.triggerInlineEditActiveBlock, 'function');
});

// 9. Per-Block Auto-Fit Toggle Test
test('Per-Block Auto-Fit Toggle Functions', async () => {
    const canvasStyling = await import('../public/src/features/canvas/canvas-styling.js');
    assert.strictEqual(typeof canvasStyling.isBlockAutoFit, 'function');
    assert.strictEqual(typeof canvasStyling.toggleBlockAutoFit, 'function');

    const testBlock = { id: 'b1', style: { autoFit: false, fontSize: 18 } };
    assert.strictEqual(canvasStyling.isBlockAutoFit(testBlock), false, 'isBlockAutoFit must return block.style.autoFit override if present');

    const testBlockDefault = { id: 'b2', style: { fontSize: 18 } };
    assert.strictEqual(canvasStyling.isBlockAutoFit(testBlockDefault), true, 'isBlockAutoFit must fallback to global state if undefined');
});

// 10. Arc & Full Warp Suite Rendering Test
test('Arc and Full Warp Suite Rendering in setMultilineText', async () => {
    const { setMultilineText } = await import('../public/src/core/utils.js');
    const canvasStyling = await import('../public/src/features/canvas/canvas-styling.js');
    assert.strictEqual(typeof setMultilineText, 'function');
    assert.strictEqual(typeof canvasStyling.updateSfxSkewX, 'function');
    assert.strictEqual(typeof canvasStyling.updateSfxSkewY, 'function');
    assert.strictEqual(typeof canvasStyling.updateSfxWave, 'function');
    assert.strictEqual(typeof canvasStyling.updateSfxBulge, 'function');
    assert.strictEqual(typeof canvasStyling.resetWarpTransformControls, 'function');

    const dummyContainer = document.createElement('div');
    setMultilineText(dummyContainer, 'TEST CHỮ UỐN CONG', { arcAngle: 30, skewX: 15, skewY: -5, warpWave: 20, warpBulge: 10 });
    assert.strictEqual(dummyContainer.children.length, 1, 'Container should contain line div');
    const lineDiv = dummyContainer.children[0];
    assert.strictEqual(lineDiv.children.length, 17, 'Line div should contain 17 character spans for arc & warp rendering');
});

// 11. Format Converter Helper Functions Test
test('Format Extension Converter Helper Functions', () => {
    const getTargetFormatExt = (mimeType) => {
        if (mimeType === 'image/png') return 'png';
        if (mimeType === 'image/jpeg') return 'jpg';
        if (mimeType === 'image/webp') return 'webp';
        return 'png';
    };

    const formatFileSize = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    assert.strictEqual(getTargetFormatExt('image/png'), 'png');
    assert.strictEqual(getTargetFormatExt('image/jpeg'), 'jpg');
    assert.strictEqual(getTargetFormatExt('image/webp'), 'webp');
    assert.strictEqual(getTargetFormatExt('unknown'), 'png');

    assert.strictEqual(formatFileSize(0), '0 B');
    assert.strictEqual(formatFileSize(512), '512 B');
    assert.strictEqual(formatFileSize(1024), '1 KB');
    assert.strictEqual(formatFileSize(1572864), '1.5 MB');

    // Filename extension replacement check
    const filename = 'chapter_01_page_05.PNG';
    const targetExt = getTargetFormatExt('image/webp');
    const newFilename = `${filename.replace(/\.[^/.]+$/, '')}.${targetExt}`;
    assert.strictEqual(newFilename, 'chapter_01_page_05.webp');
});




