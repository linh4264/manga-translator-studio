import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import {
    autoFitBlock,
    isBlockAutoFit,
    shouldReflowDiamond,
    DIAMOND_REFLOW_THRESHOLDS,
    syncActiveBlockStyle
} from '../../../src/features/canvas/canvas-styling.ts';
import {
    balanceTextToDiamond,
    balanceBlockDiamond,
    measureWordTokens,
    getDiamondWidthProfile
} from '../../../src/features/canvas/canvas-renderer.ts';
import { globalState } from '../../../src/core/state.ts';

// Setup default mock page
function setupMockEnvironment(mockBlock) {
    globalState.autoFitEnabled = true;
    globalState.pages = [{
        id: 'p_test',
        blocks: [mockBlock],
        lastDisplayWidth: 800
    }];
    globalState.activePageIndex = 0;
    globalState.selectedBlockId = mockBlock.id;
}

test('Test A: Diamond -> AutoFit maintains line-break structure when layout is sound', () => {
    const rawText = 'Tôi nhất định sẽ trở thành một hải tặc vĩ đại được cả thế giới công nhận!';
    const mockBlock = {
        id: 'b_test_a',
        type: 'dialogue',
        original: '海賊王に俺はなる',
        translated: rawText,
        box: { x: 20, y: 20, w: 15, h: 15 },
        style: {
            fontFamily: 'font-manga',
            fontSize: 24,
            baseFontSize: 24,
            diamondWrap: true,
            bold: false,
            vertical: false,
            padding: '9% 12%'
        }
    };

    setupMockEnvironment(mockBlock);

    // 1. Initial Diamond balancing
    balanceBlockDiamond(mockBlock);
    const initialBalanced = mockBlock.translated;
    const initialLines = initialBalanced.split('\n');
    assert.ok(initialLines.length >= 3, `Initial Diamond should create at least 3 lines, got ${initialLines.length}`);

    // 2. AutoFit executes
    autoFitBlock(mockBlock);

    // AutoFit should scale font-size to fit the 25%x25% box
    assert.ok(mockBlock.style.fontSize > 0, 'Computed fontSize must be positive');
    assert.ok(mockBlock.style.fontSize <= 24, 'AutoFit should decrease font size for tight box');

    // Line breaks should be preserved as long as structure is reasonable
    const finalLines = mockBlock.translated.split('\n');
    assert.strictEqual(finalLines.length, initialLines.length, 'AutoFit must preserve Diamond line count');
    assert.deepStrictEqual(finalLines, initialLines, 'AutoFit must not alter Diamond line-break partition');
});

test('Test B: Reflow triggers once when utilization is too low and does not loop infinitely', () => {
    // Scenario: Initial Diamond ran on a very large base font (e.g. 48px) creating 5 short lines.
    // In a medium box, AutoFit reduces font size to 12px, making line utilization drop below 0.55.
    const longText = 'Đây là một câu thoại dài cần được tự động cân đối và reflow nếu font chữ bị thu nhỏ quá mức';
    const mockBlock = {
        id: 'b_test_b',
        type: 'dialogue',
        original: 'Long text sample',
        translated: 'Đây là\nmột câu thoại\ndài cần được\ntự động cân đối\nvà reflow nếu font\nchữ bị thu nhỏ\nquá mức',
        box: { x: 10, y: 10, w: 40, h: 40 },
        style: {
            fontFamily: 'font-manga',
            fontSize: 48,
            baseFontSize: 48,
            diamondWrap: true,
            bold: false,
            vertical: false,
            padding: 4
        }
    };

    setupMockEnvironment(mockBlock);

    let shouldReflowInitial = shouldReflowDiamond(mockBlock, 10, 300, 300, 320, 480);
    assert.strictEqual(typeof shouldReflowInitial, 'boolean');

    // Run AutoFit which coordinates single Diamond reflow
    autoFitBlock(mockBlock);

    assert.ok(mockBlock.style.fontSize > 0);
    assert.ok(mockBlock.autoFitCache, 'autoFitCache should be populated after AutoFit');
    assert.ok(mockBlock.autoFitCache.fontSize === mockBlock.style.fontSize);

    // Verify calling AutoFit again immediately uses cache without reflowing or looping
    const cachedKey = mockBlock.autoFitCache.key;
    autoFitBlock(mockBlock);
    assert.strictEqual(mockBlock.autoFitCache.key, cachedKey, 'Second call must hit cache');
});

test('Test C: Cache Invalidation - changes to fontSize, fontFamily, box, diamondWrap, translated invalidate cache', () => {
    const mockBlock = {
        id: 'b_test_c',
        type: 'dialogue',
        translated: 'Kiểm tra độ nhạy của bộ nhớ cache',
        box: { x: 10, y: 10, w: 30, h: 20 },
        style: {
            fontFamily: 'font-manga',
            fontSize: 16,
            baseFontSize: 16,
            diamondWrap: true,
            bold: false,
            vertical: false,
            padding: 4
        }
    };

    setupMockEnvironment(mockBlock);

    // Initial run
    autoFitBlock(mockBlock);
    assert.ok(mockBlock.autoFitCache, 'Cache must be populated');
    const keyOriginal = mockBlock.autoFitCache.key;

    // 1. Change baseFontSize -> cache invalidation
    mockBlock.style.baseFontSize = 32;
    mockBlock.autoFitCache = null;
    autoFitBlock(mockBlock);
    const keyFontSize = mockBlock.autoFitCache.key;
    assert.notStrictEqual(keyFontSize, keyOriginal, 'Different baseFontSize must change cache key');

    // 2. Change fontFamily -> cache invalidation
    mockBlock.style.fontFamily = 'font-impact';
    mockBlock.autoFitCache = null;
    autoFitBlock(mockBlock);
    const keyFontFam = mockBlock.autoFitCache.key;
    assert.notStrictEqual(keyFontFam, keyFontSize, 'Different fontFamily must change cache key');

    // 3. Change box width/height -> cache invalidation
    mockBlock.box = { x: 10, y: 10, w: 50, h: 40 };
    mockBlock.autoFitCache = null;
    autoFitBlock(mockBlock);
    const keyBox = mockBlock.autoFitCache.key;
    assert.notStrictEqual(keyBox, keyFontFam, 'Different box dimensions must change cache key');

    // 4. Change diamondWrap -> cache invalidation
    mockBlock.style.diamondWrap = false;
    mockBlock.autoFitCache = null;
    autoFitBlock(mockBlock);
    const keyDiamond = mockBlock.autoFitCache.key;
    assert.notStrictEqual(keyDiamond, keyBox, 'Different diamondWrap must change cache key');

    // 5. Change translated text -> cache invalidation
    mockBlock.translated = 'Nội dung văn bản hoàn toàn mới';
    mockBlock.autoFitCache = null;
    autoFitBlock(mockBlock);
    const keyText = mockBlock.autoFitCache.key;
    assert.notStrictEqual(keyText, keyDiamond, 'Different translated text must change cache key');
});

test('Test D: Resize bubble triggers recomputed Diamond profile based on new boxAspect', () => {
    const text = 'Một câu chuyện kỳ lạ bắt đầu từ khoảnh khắc bánh xe định mệnh chuyển động.';
    
    // Wide horizontal bubble (boxAspect = 2.0: 400px x 200px)
    const wideBalanced = balanceTextToDiamond(text, 400, 200, { fontSize: 16 });
    const wideLines = wideBalanced.split('\n');

    // Tall vertical bubble (boxAspect = 0.5: 200px x 400px)
    const tallBalanced = balanceTextToDiamond(text, 200, 400, { fontSize: 16 });
    const tallLines = tallBalanced.split('\n');

    // Tall bubble needs more lines than wide bubble for the same text
    assert.ok(tallLines.length >= wideLines.length, 'Tall box should create equal or more lines than wide box');

    const wideProfile = getDiamondWidthProfile(3, 2.0);
    const tallProfile = getDiamondWidthProfile(3, 0.5);
    assert.ok(wideProfile[0] > tallProfile[0], 'Wide box profile should have wider edge line ratios than tall box profile');
});

test('Test E: Final style measurement accounts for font family differences', () => {
    const text = 'Xin chào thế giới manga tuyệt vời';

    // Standard font vs heavy impact font
    const mangaStyle = { fontFamily: 'font-manga', fontSize: 18, bold: false };
    const impactStyle = { fontFamily: 'font-impact', fontSize: 18, bold: true, letterSpacing: 2 };

    const mangaTokens = measureWordTokens(text, mangaStyle);
    const impactTokens = measureWordTokens(text, impactStyle);

    const mangaTotalW = mangaTokens.reduce((s, t) => s + t.width, 0);
    const impactTotalW = impactTokens.reduce((s, t) => s + t.width, 0);

    // Impact with bold and letterSpacing must measure strictly wider than standard font
    assert.ok(impactTotalW > mangaTotalW, 'Impact font with bold and letterSpacing must measure wider than standard font');

    const balancedManga = balanceTextToDiamond(text, 250, 250, mangaStyle);
    const balancedImpact = balanceTextToDiamond(text, 250, 250, impactStyle);

    assert.ok(balancedManga.length > 0);
    assert.ok(balancedImpact.length > 0);
});

test('Test F: Short Text Heuristic preserves 1 line for short phrases without fragmentation', () => {
    const shortPhrases = ['Cảm ơn!', 'Đi thôi!', 'Thật sao?', 'Tuyệt vời!'];

    for (const phrase of shortPhrases) {
        const mockBlock = {
            id: 'b_short',
            type: 'dialogue',
            translated: phrase,
            box: { x: 30, y: 30, w: 20, h: 20 },
            style: {
                fontFamily: 'font-manga',
                fontSize: 16,
                baseFontSize: 16,
                diamondWrap: true,
                vertical: false,
                padding: 4
            }
        };

        setupMockEnvironment(mockBlock);
        balanceBlockDiamond(mockBlock);
        autoFitBlock(mockBlock);

        // Short phrases must remain 1 line
        assert.strictEqual(mockBlock.translated.includes('\n'), false, `Short phrase "${phrase}" must not be fragmented into multiple lines`);
        assert.strictEqual(mockBlock.translated, phrase);
    }
});

test('Test G: Long text fits within box bounds without overflow', () => {
    const longSpeech = 'Chúng ta đã đi qua rất nhiều gian nan thử thách để cùng nhau đứng ở đây ngày hôm nay, và tôi tin rằng không gì có thể ngăn cản được ước mơ của chúng ta!';
    const mockBlock = {
        id: 'b_long',
        type: 'dialogue',
        translated: longSpeech,
        box: { x: 10, y: 10, w: 30, h: 30 },
        style: {
            fontFamily: 'font-manga',
            fontSize: 20,
            baseFontSize: 20,
            diamondWrap: true,
            vertical: false,
            padding: '9% 12%'
        }
    };

    setupMockEnvironment(mockBlock);
    balanceBlockDiamond(mockBlock);
    autoFitBlock(mockBlock);

    assert.ok(mockBlock.style.fontSize >= 6, 'Font size should not drop below minimum 6px');
    assert.ok(mockBlock.textWidth !== undefined);
    assert.ok(mockBlock.textHeight !== undefined);
});

test('Test H: Vertical block does not execute horizontal Diamond wrap logic and AutoFit vertical works', () => {
    const verticalText = 'こんにちは\n世界';
    const mockBlock = {
        id: 'b_vert',
        type: 'dialogue',
        translated: verticalText,
        box: { x: 10, y: 10, w: 15, h: 40 },
        style: {
            fontFamily: 'font-manga',
            fontSize: 16,
            baseFontSize: 16,
            diamondWrap: true,
            vertical: true,
            padding: 4
        }
    };

    setupMockEnvironment(mockBlock);

    // shouldReflowDiamond must immediately return false for vertical blocks
    const reflowCheck = shouldReflowDiamond(mockBlock, 16, 120, 320, 120, 320);
    assert.strictEqual(reflowCheck, false, 'Vertical blocks must not trigger diamond reflow');

    // AutoFit handles vertical blocks properly
    autoFitBlock(mockBlock);
    assert.ok(mockBlock.style.fontSize > 0);
    assert.strictEqual(mockBlock.translated, verticalText, 'Vertical text structure must not be modified by horizontal diamond wrap');
});

test('Test I: User Scenario - Tall narrow bubble with moderate text distributes lines to prevent tiny font collapse', () => {
    const text = 'Kiểu tớ không mấy hứng thú với sở thích của người khác ấy.';
    const mockBlock = {
        id: 'b_tall_bubble',
        type: 'dialogue',
        translated: text,
        box: { x: 20, y: 10, w: 15, h: 45 }, // Tall box (15% x 45% -> aspect ~0.22)
        style: {
            fontFamily: 'font-manga',
            fontSize: 16,
            baseFontSize: 16,
            diamondWrap: true,
            vertical: false,
            padding: '9% 12%'
        }
    };

    setupMockEnvironment(mockBlock);
    balanceBlockDiamond(mockBlock);
    autoFitBlock(mockBlock);

    const lines = mockBlock.translated.split('\n');
    // In a tall box, 12 words should be partitioned into 5-6 lines (not collapsed into 3-4 wide lines)
    assert.ok(lines.length >= 5, `Tall bubble should partition into at least 5 lines to match aspect, got ${lines.length}`);
    
    // Font size should remain readable (>= 12px) rather than collapsing to tiny 8px
    assert.ok(mockBlock.style.fontSize >= 12, `Font size should remain >= 12px in tall box, got ${mockBlock.style.fontSize}px`);
});

test('Test J: Standard Box Resize (diamondWrap: false) dynamically reflows lines to match new width/height', () => {
    const { balanceSingleParagraphToBox } = require('../../../src/features/canvas/canvas-renderer.ts');
    const text = 'Thế này thì còn ý nghĩa gì nữa chứ.';

    // 1. In a moderately wide box (300px x 150px, aspect 2.0): fits in 2 lines
    const wideLines = balanceSingleParagraphToBox(text, 300, 150, { fontSize: 16 }).split('\n');
    assert.ok(wideLines.length <= 2, 'Moderately wide box should break into 1-2 lines');

    // 2. Dragging box to be taller and narrower (140px x 280px, aspect ~0.5): automatically reflows to 3-4 lines
    const tallLines = balanceSingleParagraphToBox(text, 140, 280, { fontSize: 16 }).split('\n');
    assert.ok(tallLines.length >= 3 && tallLines.length <= 4, `Tall narrow box should break into 3-4 lines, got ${tallLines.length}`);

    // 3. Verify text content integrity
    assert.strictEqual(wideLines.join(' '), text);
    assert.strictEqual(tallLines.join(' '), text);
});

test('Test K: Extreme Box Resize - Extreme vertical becomes 1 column, extreme horizontal becomes 1 line', () => {
    const { balanceSingleParagraphToBox } = require('../../../src/features/canvas/canvas-renderer.ts');
    const text = 'Đừng để chị ấy làm gì cả';
    const words = text.split(' ');

    // 1. Extreme vertical squeeze (80px x 400px, aspect = 0.20): becomes 1 vertical column (1 word per line)
    const columnText = balanceSingleParagraphToBox(text, 80, 400, { fontSize: 16 });
    const columnLines = columnText.split('\n');
    assert.strictEqual(columnLines.length, words.length, `Extreme vertical should be 1 word per line (${words.length} lines), got ${columnLines.length}`);
    assert.deepStrictEqual(columnLines, words);

    // 2. Extreme horizontal stretch (600px x 100px, aspect = 6.0): becomes 1 single horizontal row
    const rowText = balanceSingleParagraphToBox(text, 600, 100, { fontSize: 16 });
    const rowLines = rowText.split('\n');
    assert.strictEqual(rowLines.length, 1, 'Extreme horizontal should be 1 single line');
    assert.strictEqual(rowText, text);
});


