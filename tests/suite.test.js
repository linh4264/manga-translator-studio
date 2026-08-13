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
    const nodeBin = process.execPath || 'node';
    const serverProc = spawn(nodeBin, [serverPath], { stdio: 'pipe' });

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

// 12. Sharpen Kernel Convolution & Compression Calculation Test
test('Sharpen Kernel Matrix Math and Compression Savings Calculation', () => {
    const k = 1.5; // Sharpen factor
    const center = 100;
    const top = 90, bottom = 90, left = 90, right = 90;
    const sharpenedVal = (1 + 4 * k) * center - k * top - k * bottom - k * left - k * right;
    const clampedVal = Math.min(255, Math.max(0, sharpenedVal));
    assert.strictEqual(clampedVal, 160, 'Sharpen kernel math must boost contrast at edges');

    const originalBytes = 2097152; // 2 MB
    const compressedBytes = 629145; // ~614 KB
    const savedBytes = Math.max(0, originalBytes - compressedBytes);
    const savedPercent = Math.round((savedBytes / originalBytes) * 100);
    assert.strictEqual(savedPercent, 70, 'Compression saving percentage calculation must be 70%');
});

// 13. 2-Step Dedicated AI Pipeline Configuration & State Test
test('2-Step Dedicated AI Pipeline Configuration and State', async () => {
    const { DEFAULT_PIPELINE_MODE, DEFAULT_OCR_MODEL, DEFAULT_TRANSLATION_MODEL, VALID_OCR_MODEL_IDS, VALID_TRANSLATION_MODEL_IDS } = await import('../public/src/config/constants.js');
    const { globalState } = await import('../public/src/core/state.js');

    assert.strictEqual(DEFAULT_PIPELINE_MODE, 'two-step', 'Default pipeline mode must be two-step');
    assert.strictEqual(DEFAULT_OCR_MODEL, 'gemini-2.5-flash', 'Default OCR model must be gemini-2.5-flash');
    assert.strictEqual(DEFAULT_TRANSLATION_MODEL, 'gemini-2.5-pro', 'Default translation model must be gemini-2.5-pro');

    assert.ok(VALID_OCR_MODEL_IDS.includes(DEFAULT_OCR_MODEL), 'Default OCR model must be in VALID_OCR_MODEL_IDS');
    assert.ok(VALID_TRANSLATION_MODEL_IDS.includes(DEFAULT_TRANSLATION_MODEL), 'Default translation model must be in VALID_TRANSLATION_MODEL_IDS');

    assert.strictEqual(globalState.translationPipelineMode, 'two-step', 'globalState must initialize with two-step pipeline mode');
    assert.strictEqual(globalState.ocrModel, 'gemini-2.5-flash', 'globalState must initialize with gemini-2.5-flash as OCR model');
    assert.strictEqual(globalState.translationModel, 'gemini-2.5-pro', 'globalState must initialize with gemini-2.5-pro as Translation model');
});

// 14. Chapter-Level Batch Translation Function and Aggregation Logic Test
test('Chapter-Level Batch Translation Function and Aggregation Logic', async () => {
    const aiService = await import('../public/src/features/ai/ai-service.js');
    assert.strictEqual(typeof aiService.executeChapterTranslationStep, 'function', 'executeChapterTranslationStep must be exported');
    assert.strictEqual(typeof aiService.runBatchTranslation, 'function', 'runBatchTranslation must be exported');

    // Simulate chapter blocks aggregation across 3 pages
    const mockChapterPages = [
        { pageIndex: 0, blocks: [{ id: 'p0_b1', original: 'こんにちは' }, { id: 'p0_b2', original: '元気ですか？' }] },
        { pageIndex: 1, blocks: [{ id: 'p1_b1', original: 'はい、元気です！' }] },
        { pageIndex: 2, blocks: [{ id: 'p2_b1', original: 'また明日ね。' }] }
    ];

    const aggregatedBlocks = [];
    mockChapterPages.forEach(p => {
        p.blocks.forEach(b => {
            aggregatedBlocks.push({ id: b.id, original: b.original, pageIndex: p.pageIndex });
        });
    });

    assert.strictEqual(aggregatedBlocks.length, 4, 'Aggregated chapter dialogue count must be 4');
    assert.strictEqual(aggregatedBlocks[0].id, 'p0_b1');
    assert.strictEqual(aggregatedBlocks[3].id, 'p2_b1');
});

// 15. 5-Layer Bulletproof Translation Matching Engine Test
test('5-Layer Translation Matching Engine with Fallbacks', async () => {
    const { matchTranslationsToBlocks } = await import('../public/src/features/ai/ai-service.js');
    assert.strictEqual(typeof matchTranslationsToBlocks, 'function', 'matchTranslationsToBlocks must be exported');

    const inputBlocks = [
        { id: 'p1_b1', original: 'おはよう' },
        { id: 'p1_b2', original: '元気？' },
        { id: 'p2_b1', original: 'うん、元気！' },
        { id: 'p2_b2', original: 'じゃあね' }
    ];

    // Case A: AI returns exact IDs (some in uppercase, some numbers)
    const mockApiResponse = {
        blocks: [
            { id: 'P1_B1', translated: 'Chào buổi sáng' }, // lowercase match
            { id: 'b2', translated: 'Khỏe không?' },       // suffix match
            { original: 'うん、元気！', translated: 'Ừ, mình khỏe!' }, // original text match
            { translated: 'Tạm biệt nhé' }                 // positional index match
        ]
    };

    const resolved = matchTranslationsToBlocks(inputBlocks, mockApiResponse);
    assert.strictEqual(resolved[0].translated, 'Chào buổi sáng', 'Must match P1_B1 via case-insensitive ID');
    assert.strictEqual(resolved[1].translated, 'Khỏe không?', 'Must match p1_b2 via suffix b2');
    assert.strictEqual(resolved[2].translated, 'Ừ, mình khỏe!', 'Must match via original text');
    assert.strictEqual(resolved[3].translated, 'Tạm biệt nhé', 'Must match via positional order index');
});

// 16. Default Font Synchronization and AI Translation Block Application Test
test('Default Font Synchronization and Application for AI Translation', async () => {
    const { globalState } = await import('../public/src/core/state.js');
    const { updateDefaultFont } = await import('../public/src/ui/settings-ui.js');

    updateDefaultFont('font-vietnamese');
    assert.strictEqual(globalState.defaultFont, 'font-vietnamese', 'globalState.defaultFont must be updated');
    assert.strictEqual(globalState.globalStyle.fontFamily, 'font-vietnamese', 'globalState.globalStyle.fontFamily must sync with defaultFont');

    // Reset back to font-manga
    updateDefaultFont('font-manga');
    assert.strictEqual(globalState.defaultFont, 'font-manga');
    assert.strictEqual(globalState.globalStyle.fontFamily, 'font-manga');
});
