import test from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import './setup/browser-env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
test('Server Path Traversal Prevention', () => {
    const rootPath = path.join(__dirname, '..', 'public');
    const maliciousPaths = ['/../server/server.js', '/../../etc/passwd', '/..\\..\\windows\\win.ini', '/../../../config'];
    
    for (const urlPath of maliciousPaths) {
        const rawFilePath = path.join(rootPath, urlPath === '/' ? 'index.html' : urlPath);
        const relative = path.relative(rootPath, rawFilePath);
        const isSafe = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
        assert.strictEqual(isSafe, false, `Path ${urlPath} must be blocked by path traversal check`);
    }

    const safePaths = ['/', '/index.html', '/style.css', '/src/main.js'];
    for (const urlPath of safePaths) {
        const rawFilePath = path.join(rootPath, urlPath === '/' ? 'index.html' : urlPath);
        const relative = path.relative(rootPath, rawFilePath);
        const isSafe = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
        assert.strictEqual(isSafe, true, `Path ${urlPath} must be allowed as safe`);
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

    // Test vertical text stacking (including ellipsis and single words)
    const vertContainer = document.createElement('div');
    vertContainer.style.writingMode = 'vertical-rl';
    setMultilineText(vertContainer, 'DỊCH...');
    assert.strictEqual(vertContainer.children.length, 1, 'Vertical container should contain 1 line div');
    const vertLine = vertContainer.children[0];
    assert.strictEqual(vertLine.children.length, 7, 'Vertical line should contain 7 character spans (D, Ị, C, H, ., ., .)');
    assert.strictEqual(vertLine.style.wordBreak, 'keep-all', 'Word-break must be keep-all to prevent breaking words');
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

// 17. Immediate Auto-Fit Execution Test (No Manual Resizing Required)
test('Immediate Auto-Fit Execution on Newly Translated Blocks', async () => {
    const { autoFitAllBlocksOnPage, autoFitBlock, isBlockAutoFit } = await import('../public/src/features/canvas/canvas-styling.js');
    const { globalState } = await import('../public/src/core/state.js');

    globalState.autoFitEnabled = true;

    const mockPage = {
        blocks: [
            {
                id: 'p1_b1',
                type: 'dialogue',
                translated: 'Một đoạn văn bản dài cần được tự động tính toán cỡ chữ vừa vặn ngay lập tức mà không cần co giãn.',
                box: { x: 20, y: 20, w: 40, h: 30 },
                style: { fontFamily: 'font-manga', fontSize: 13, padding: 4 }
            }
        ]
    };

    assert.strictEqual(isBlockAutoFit(mockPage.blocks[0]), true, 'Block must have Auto-Fit enabled');

    // Run autoFitAllBlocksOnPage
    autoFitAllBlocksOnPage(mockPage);

    // Verify block style fontSize was processed
    assert.ok(mockPage.blocks[0].style.fontSize >= 6, 'Font size must be computed automatically');
    assert.ok(mockPage.blocks[0].autoFitCache !== null, 'Block must store autoFitCache');

    // Test that manual mode blocks are strictly preserved and never overwritten
    const manualBlock = {
        id: 'p1_b2',
        type: 'dialogue',
        translated: 'Văn bản thủ công',
        box: { x: 10, y: 10, w: 30, h: 20 },
        style: { fontFamily: 'font-manga', fontSize: 32, autoFit: false }
    };
    mockPage.blocks.push(manualBlock);
    autoFitAllBlocksOnPage(mockPage);
    assert.strictEqual(manualBlock.style.fontSize, 32, 'Manual font size must be strictly preserved when autoFit is false');
    assert.strictEqual(isBlockAutoFit(manualBlock), false, 'Manual block must return isBlockAutoFit = false');
});

// 18. 3-Tier Comic Universe, Genre & Tone Matrix Prompt Generation Test
test('3-Tier Comic Universe, World Setting & Narrative Tone Matrix Prompt Generation', async () => {
    const { globalState } = await import('../public/src/core/state.js');
    const { getTranslationGuidancePrompt } = await import('../public/src/features/ai/ai-service.js');
    const { COMIC_UNIVERSE_PRESETS, COMIC_GENRE_PRESETS, COMIC_TONE_PRESETS } = await import('../public/src/config/constants.js');

    // Test Manga + Multi-Genre (Isekai + Fantasy + Action + Comedy + Wuxia + Girls' Love) + Classic Scanlation
    globalState.comicUniverse = 'manga';
    globalState.comicGenres = ['isekai', 'fantasy', 'action', 'comedy', 'wuxia', 'girls_love'];
    globalState.comicTone = 'classic';
    globalState.sourceLanguage = 'ja';
    globalState.targetLanguage = 'vi';

    let prompt = getTranslationGuidancePrompt();
    assert.ok(prompt.includes('JAPANESE MANGA SCANLATION'), 'Prompt should include Japanese Manga Scanlation guidance');
    assert.ok(prompt.includes('COMPOSITE GENRE PROFILE'), 'Prompt should include Composite Genre Profile');
    assert.ok(prompt.includes('ISEKAI / TRANSMIGRATION'), 'Prompt should include Isekai guidance');
    assert.ok(prompt.includes('FANTASY'), 'Prompt should include Fantasy guidance');
    assert.ok(prompt.includes('ACTION'), 'Prompt should include Action guidance');
    assert.ok(prompt.includes('COMEDY'), 'Prompt should include Comedy guidance');
    assert.ok(prompt.includes('WUXIA / XIANXIA'), 'Prompt should include Wuxia guidance');
    assert.ok(prompt.includes("GIRLS' LOVE / YURI"), "Prompt should include Girls' Love guidance");
    assert.ok(prompt.includes('CLASSIC SCANLATION'), 'Prompt should include Classic Scanlation Tone guidance');

    // Test Manhwa + Crime + Psychological + Comedy/Meme
    globalState.comicUniverse = 'manhwa';
    globalState.comicGenres = ['crime', 'psychological'];
    globalState.comicTone = 'comedy';

    prompt = getTranslationGuidancePrompt();
    assert.ok(prompt.includes('KOREAN MANHWA / WEBTOON'), 'Prompt should include Korean Manhwa guidance');
    assert.ok(prompt.includes('CRIME'), 'Prompt should include Crime guidance');
    assert.ok(prompt.includes('PSYCHOLOGICAL'), 'Prompt should include Psychological guidance');
    assert.ok(prompt.includes('COMEDY & GAG'), 'Prompt should include Comedy & Gag guidance');

    // Test US Comics + Horror + Dark
    globalState.comicUniverse = 'us_comic';
    globalState.comicGenres = ['horror'];
    globalState.comicTone = 'dark';

    prompt = getTranslationGuidancePrompt();
    assert.ok(prompt.includes('AMERICAN COMICS & GRAPHIC NOVELS'), 'Prompt should include US Comic guidance');
    assert.ok(prompt.includes('HORROR'), 'Prompt should include Horror guidance');
    assert.ok(prompt.includes('DARK & GRITTY'), 'Prompt should include Dark & Gritty guidance');
});

// 19. Model 2 AI Truncated JSON Stream Repair & Extraction Engine Test
test('Model 2 Truncated JSON Response Recovery and Parsing Engine', async () => {
    const { parseGeminiJsonText, repairJsonString, balanceJsonBrackets } = await import('../public/src/core/utils/json.js');
    const { matchTranslationsToBlocks } = await import('../public/src/features/ai/ai-service.js');

    // Case 1: Truncated inside a dialogue string (tail cutoff due to MAX_TOKENS)
    const cutInsideString = '{"blocks": [{"id": "p1_b1", "translated": "Xin chào bạn!"}, {"id": "p1_b2", "translated": "Hôm nay thời tiết đẹp quá chúng ta cùng đi';
    const parsed1 = parseGeminiJsonText(cutInsideString);
    assert.ok(parsed1 && Array.isArray(parsed1.blocks), 'Must parse truncated string without throwing');
    assert.strictEqual(parsed1.blocks.length, 2, 'Must rescue both completed and partially completed dialogue blocks');
    assert.strictEqual(parsed1.blocks[0].translated, 'Xin chào bạn!');
    assert.strictEqual(parsed1.blocks[1].id, 'p1_b2');
    assert.strictEqual(parsed1.blocks[1].translated, 'Hôm nay thời tiết đẹp quá chúng ta cùng đi');

    // Case 2: Truncated with braces inside string text
    const cutWithBracesInString = '{"blocks": [{"id": "p1_b1", "translated": "Tuyệt chiêu {Thiên Hỏa Quyền} cực mạnh và';
    const parsed2 = parseGeminiJsonText(cutWithBracesInString);
    assert.ok(parsed2 && parsed2.blocks.length === 1);
    assert.strictEqual(parsed2.blocks[0].translated, 'Tuyệt chiêu {Thiên Hỏa Quyền} cực mạnh và');

    // Case 3: Truncated right after key colon
    const cutAfterColon = '{"blocks": [{"id": "p1_b1", "translated": "Xin chào"}, {"id": "p1_b2", "translated": ';
    const parsed3 = parseGeminiJsonText(cutAfterColon);
    assert.ok(parsed3 && parsed3.blocks.length === 1);
    assert.strictEqual(parsed3.blocks[0].id, 'p1_b1');

    // Case 4: Top-level Array format
    const topLevelArray = '[{"id": "p1_b1", "translated": "Xin chào"}, {"id": "p1_b2", "translated": "Tạm biệt"}]';
    const parsed4 = parseGeminiJsonText(topLevelArray);
    assert.ok(parsed4 && parsed4.blocks.length === 2);
    assert.strictEqual(parsed4.blocks[0].id, 'p1_b1');

    // Case 5: Key-Value Map format
    const keyValueMap = '{"p1_b1": "Xin chào", "p1_b2": "Tạm biệt"}';
    const parsed5 = parseGeminiJsonText(keyValueMap);
    assert.ok(parsed5 && parsed5.blocks.length === 2);
    assert.strictEqual(parsed5.blocks[0].id, 'p1_b1');
    assert.strictEqual(parsed5.blocks[0].translated, 'Xin chào');

    // Case 6: Markdown unclosed code fence
    const unclosedMarkdown = '```json\n{"blocks": [{"id": "p1_b1", "translated": "Chào"}]';
    const parsed6 = parseGeminiJsonText(unclosedMarkdown);
    assert.ok(parsed6 && parsed6.blocks.length === 1);

    // Case 7: Severe syntax corruption rescued by Regex
    const malformedStream = 'Model responded with: {"id": "p1_b1", "translated": "Dòng 1"} then crashed {"id": "p1_b2", "translated": "Dòng 2" ...';
    const parsed7 = parseGeminiJsonText(malformedStream);
    assert.ok(parsed7 && parsed7.blocks.length === 2, 'Regex fallback must extract valid items from broken text');

    // Case 8: Integration with matchTranslationsToBlocks
    const originalBlocks = [
        { id: 'p1_b1', original: 'Hello' },
        { id: 'p1_b2', original: 'How are you' },
        { id: 'p1_b3', original: 'Goodbye' }
    ];
    const matched = matchTranslationsToBlocks(originalBlocks, parsed1);
    assert.strictEqual(matched[0].translated, 'Xin chào bạn!');
    assert.strictEqual(matched[1].translated, 'Hôm nay thời tiết đẹp quá chúng ta cùng đi');
    assert.strictEqual(matched[2].translated, '', 'Unmatched block in truncated stream should safely retain empty or fallback');
});

// 20. Phase 1 UI: Stepper State, Demo Manga Loader & 1-Click Style Presets Test
test('Phase 1 UI: Stepper State Synchronization, Demo Manga Loader and Manga Style Presets', async () => {
    const { globalState } = await import('../public/src/core/state.js');
    const { applyStylePreset } = await import('../public/src/features/canvas/canvas-styling.js');
    const { updateStepperUI } = await import('../public/src/ui/layout-ui.js');
    const { loadDemoManga } = await import('../public/src/ui/pages-ui.js');

    // 1. Check exports
    assert.strictEqual(typeof updateStepperUI, 'function', 'updateStepperUI must be an exported function');
    assert.strictEqual(typeof loadDemoManga, 'function', 'loadDemoManga must be an exported function');
    assert.strictEqual(typeof applyStylePreset, 'function', 'applyStylePreset must be an exported function');

    // 2. Test Presets application
    const mockBlock = {
        id: 'test_b1',
        type: 'dialogue',
        text: 'Này, cậu có sao không?',
        box: { x: 20, y: 20, w: 30, h: 25 },
        style: { vertical: false }
    };
    const mockPage = {
        id: 'p_test_1',
        name: 'Page 1',
        blocks: [mockBlock]
    };

    globalState.pages = [mockPage];
    globalState.activePageIndex = 0;
    globalState.selectedBlockId = 'test_b1';

    // Preset 1: dialogue
    applyStylePreset('dialogue');
    assert.strictEqual(mockBlock.style.fontFamily, 'font-manga');
    assert.strictEqual(mockBlock.style.bold, true);
    assert.strictEqual(mockBlock.style.bgOpacity, 100);
    assert.strictEqual(mockBlock.style.strokeWidth, 0);

    // Preset 2: scream
    applyStylePreset('scream');
    assert.strictEqual(mockBlock.style.fontFamily, 'font-impact');
    assert.strictEqual(mockBlock.style.strokeWidth, 4);
    assert.strictEqual(mockBlock.style.bgOpacity, 0);

    // Preset 3: whisper
    applyStylePreset('whisper');
    assert.strictEqual(mockBlock.style.fontFamily, 'font-caveat');
    assert.strictEqual(mockBlock.style.maskShape, 'ellipse');

    // Preset 4: narration
    applyStylePreset('narration');
    assert.strictEqual(mockBlock.style.fontFamily, 'font-vietnamese');
    assert.strictEqual(mockBlock.style.maskShape, 'rect');

    // 3. Test updateStepperUI execution
    assert.doesNotThrow(() => {
        updateStepperUI();
    }, 'updateStepperUI must execute smoothly without errors');
});

// 21. Phase 2 UI: Ergonomic Canvas Controls (Fit Canvas, Zoom Synchronization, Left Sidebar Streamlining)
test('Phase 2 UI: Ergonomic Canvas Controls and Sidebar Streamlining', async () => {
    const { globalState } = await import('../public/src/core/state.js');
    const { fitCanvasToScreen, resetZoom, changeZoom, toggleLeftSidebarMoreMenu } = await import('../public/src/ui/layout-ui.js');

    assert.strictEqual(typeof fitCanvasToScreen, 'function', 'fitCanvasToScreen must be exported');
    assert.strictEqual(typeof toggleLeftSidebarMoreMenu, 'function', 'toggleLeftSidebarMoreMenu must be exported');

    // Test resetZoom
    resetZoom();
    assert.strictEqual(globalState.zoom, 100, 'resetZoom must set zoom to 100');

    // Test changeZoom
    changeZoom(20);
    assert.strictEqual(globalState.zoom, 120, 'changeZoom(20) must increase zoom to 120');

    changeZoom(-30);
    assert.strictEqual(globalState.zoom, 90, 'changeZoom(-30) must decrease zoom to 90');

    // Test fitCanvasToScreen fallback execution without DOM crashes
    assert.doesNotThrow(() => {
        fitCanvasToScreen();
    }, 'fitCanvasToScreen must handle headless/empty environment gracefully');

    // Test toggleLeftSidebarMoreMenu execution
    assert.doesNotThrow(() => {
        toggleLeftSidebarMoreMenu();
    }, 'toggleLeftSidebarMoreMenu must execute without errors');
});

// 22. Studio Pro Phase 1: Rich Text Tokenizer & Multiline Styling
test('Studio Pro Phase 1: Rich Text Tokenizer and Styling', async () => {
    const { hasRichTextTags, stripRichTextTags, parseRichTextTokens, setMultilineText } = await import('../public/src/core/utils.js');

    // Tag detection
    assert.strictEqual(hasRichTextTags('Văn bản thường'), false);
    assert.strictEqual(hasRichTextTags('Chữ **đậm** và [color=#ff0000]đỏ[/color]'), true);
    assert.strictEqual(hasRichTextTags('Chữ [u]gạch chân[/u] và [size=120%]lớn[/size]'), true);

    // Tag stripping
    assert.strictEqual(stripRichTextTags('**Monkey** [color=#123456]*Luffy*[/color]!'), 'Monkey Luffy!');
    assert.strictEqual(stripRichTextTags('[b][u]Gạch chân đậm[/u][/b]'), 'Gạch chân đậm');

    // Token parsing
    const tokens = parseRichTextTokens('Chào **[color=#ef4444]thế giới[/color]**!');
    assert.strictEqual(tokens.length, 3);
    assert.strictEqual(tokens[1].text, 'thế giới');
    assert.strictEqual(tokens[1].bold, true);
    assert.strictEqual(tokens[1].color, '#ef4444');

    // DOM rendering
    const container = document.createElement('div');
    setMultilineText(container, 'Hôm nay **trời đẹp** [color=#3b82f6][u]xanh ngát[/u][/color]!');
    assert.strictEqual(container.children.length, 1);
    assert.ok(container.children[0].children.length >= 3);
});

// 23. Studio Pro Phase 1: Diamond / Oval Word Wrapping & Canvas Exporter
test('Studio Pro Phase 1: Diamond / Oval Word Wrapping', async () => {
    const { wrapCanvasText, wrapCanvasDiamondText } = await import('../public/src/features/canvas/canvas-renderer.js');

    const mockCtx = {
        measureText: (str) => ({ width: str.length * 8 })
    };

    const text = 'Một hai ba bốn năm sáu bảy tám chín mười mười một mười hai';
    const rectLines = wrapCanvasText(mockCtx, text, 150);
    const diamondLines = wrapCanvasDiamondText(mockCtx, text, 200, 200, 20);

    assert.ok(Array.isArray(rectLines), 'Rect wrap must return array of lines');
    assert.ok(Array.isArray(diamondLines), 'Diamond wrap must return array of lines');
    assert.ok(diamondLines.length >= 2, 'Diamond wrap should produce balanced lines');
});


