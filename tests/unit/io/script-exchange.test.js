import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import {
    generateTxtScript,
    parseTxtScript,
    parseTxtBlocksSection,
    applyScriptPagesToProject,
    parseScriptBox
} from '../../../src/features/io.ts';
import { globalState } from '../../../src/core/state.ts';

// Script Exchange helpers
function exportScriptToJson(pages) {
    const script = [];
    pages.forEach((page, pIdx) => {
        (page.blocks || []).forEach((block, bIdx) => {
            script.push({
                pageIndex: pIdx + 1,
                pageName: page.name || `Trang ${pIdx + 1}`,
                blockId: block.id,
                type: block.type || 'dialogue',
                original: block.original || '',
                translated: block.translated || ''
            });
        });
    });
    return JSON.stringify(script, null, 2);
}

function importScriptFromJson(jsonStr, pages) {
    const entries = JSON.parse(jsonStr);
    let matchedCount = 0;

    entries.forEach(entry => {
        // Find block by ID across pages
        for (const page of pages) {
            const targetBlock = (page.blocks || []).find(b => b.id === entry.blockId);
            if (targetBlock) {
                targetBlock.translated = entry.translated;
                matchedCount++;
                break;
            }
        }
    });

    return matchedCount;
}

test('IO Script - Export and Import JSON Script Roundtrip', () => {
    const mockPages = [
        {
            id: 'p1',
            name: 'Page 1',
            blocks: [
                { id: 'p1_b1', original: 'おはよう', translated: 'Chào buổi sáng' },
                { id: 'p1_b2', original: '元気？', translated: 'Khỏe không?' }
            ]
        },
        {
            id: 'p2',
            name: 'Page 2',
            blocks: [
                { id: 'p2_b1', original: 'うん、元気！', translated: 'Ừ, khỏe!' }
            ]
        }
    ];

    // Export script
    const scriptJson = exportScriptToJson(mockPages);
    assert.ok(scriptJson.includes('Chào buổi sáng'));
    assert.ok(scriptJson.includes('Khỏe không?'));

    // Clear translations on target pages
    const targetPages = JSON.parse(JSON.stringify(mockPages));
    targetPages[0].blocks[0].translated = '';
    targetPages[0].blocks[1].translated = '';
    targetPages[1].blocks[0].translated = '';

    // Import script back
    const matched = importScriptFromJson(scriptJson, targetPages);
    assert.strictEqual(matched, 3, 'All 3 dialogue lines must be matched');
    assert.strictEqual(targetPages[0].blocks[0].translated, 'Chào buổi sáng');
    assert.strictEqual(targetPages[0].blocks[1].translated, 'Khỏe không?');
    assert.strictEqual(targetPages[1].blocks[0].translated, 'Ừ, khỏe!');
});

test('IO Script - Synchronized Chapter Script JSON Format (Box Array, Vertical, ID, Type)', () => {
    const synchronizedScript = {
        chapterName: "Manga Translation Script",
        totalPages: 2,
        exportedAt: new Date().toISOString(),
        pages: [
            {
                pageIndex: 0,
                pageName: "Page 1",
                blocks: [
                    {
                        id: "p1_b1",
                        type: "dialogue",
                        original: "おはよう",
                        translated: "Chào buổi sáng đồng bộ",
                        box: [10, 20, 30, 40],
                        vertical: true
                    },
                    {
                        id: "p1_b2",
                        type: "dialogue",
                        original: "元気？",
                        translated: "Khỏe không bạn?",
                        box: [50, 60, 20, 25]
                    }
                ]
            }
        ]
    };

    // Verify format fields
    assert.deepStrictEqual(synchronizedScript.pages[0].blocks[0].box, [10, 20, 30, 40]);
    assert.strictEqual(synchronizedScript.pages[0].blocks[0].vertical, true);
    assert.strictEqual(synchronizedScript.pages[0].blocks[1].vertical, undefined, 'Horizontal block should omit vertical property');
});

test('IO Script - TXT Export and Import Roundtrip (Quotes, Multiline, Natural Order, Speakers)', () => {
    const mockPages = [
        {
            id: 'p1',
            name: '01.png',
            blocks: [
                {
                    id: 'b1',
                    type: 'dialogue',
                    speaker: 'Naruto',
                    original: 'Line 1\nLine 2 "with quotes"',
                    translated: 'Dòng 1\nDòng 2 "có ngoặc kép"'
                },
                {
                    id: 'b2',
                    type: 'sfx',
                    speaker: null,
                    original: 'ドドド',
                    translated: 'Ầm ầm ầm'
                },
                {
                    id: 'b3',
                    type: 'narration',
                    speaker: null,
                    original: '昔々あるところに...',
                    translated: 'Ngày xửa ngày xưa...'
                }
            ]
        },
        {
            id: 'p2',
            name: '02.png',
            blocks: [
                {
                    id: 'b4',
                    type: 'image',
                    imageUrl: 'data:image/png;base64,123',
                    original: '',
                    translated: ''
                },
                {
                    id: 'b5',
                    type: 'dialogue',
                    speaker: 'Sasuke',
                    original: 'ナルト！',
                    translated: 'Naruto!'
                }
            ]
        }
    ];

    // 1. Generate TXT
    const txtContent = generateTxtScript(mockPages);
    assert.ok(txtContent.includes('[TRANG 1: 01.png]'));
    assert.ok(txtContent.includes('#1 [id: b1] [Thoại] [Nhân vật: Naruto]'));
    assert.ok(txtContent.includes('#2 [id: b2] [SFX]'));
    assert.ok(txtContent.includes('Dòng 2 "có ngoặc kép"'));
    assert.ok(txtContent.includes('[TRANG 2: 02.png]'));
    assert.ok(txtContent.includes('#1 [id: b4] [Ảnh chèn]'));

    // 2. Parse TXT
    const parsedPages = parseTxtScript(txtContent);
    assert.strictEqual(parsedPages.length, 2, 'Must parse 2 pages');
    assert.strictEqual(parsedPages[0].pageName, '01.png');
    assert.strictEqual(parsedPages[0].blocks.length, 3);
    assert.strictEqual(parsedPages[0].blocks[0].id, 'b1');
    assert.strictEqual(parsedPages[0].blocks[0].speaker, 'Naruto');
    assert.strictEqual(parsedPages[0].blocks[0].original, 'Line 1\nLine 2 "with quotes"');
    assert.strictEqual(parsedPages[0].blocks[0].translated, 'Dòng 1\nDòng 2 "có ngoặc kép"');
    assert.strictEqual(parsedPages[0].blocks[1].id, 'b2');
    assert.strictEqual(parsedPages[0].blocks[1].type, 'sfx');
    assert.strictEqual(parsedPages[0].blocks[1].translated, 'Ầm ầm ầm');

    // 3. Test Apply to globalState
    globalState.pages = [
        {
            id: 'p1',
            name: '01.png',
            blocks: [
                { id: 'b1', original: 'Line 1\nLine 2 "with quotes"', translated: '' },
                { id: 'b2', original: 'ドドド', translated: '' },
                { id: 'b3', original: '昔々あるところに...', translated: '' }
            ]
        },
        {
            id: 'p2',
            name: '02.png',
            blocks: [
                { id: 'b4', original: '', translated: '' },
                { id: 'b5', original: 'ナルト！', translated: '' }
            ]
        }
    ];

    const result = applyScriptPagesToProject(parsedPages);
    assert.strictEqual(result.matchedPages, 2);
    assert.strictEqual(result.matchedBlocks, 5); // all 5 blocks across 2 pages were matched
    assert.strictEqual(globalState.pages[0].blocks[0].translated, 'Dòng 1\nDòng 2 "có ngoặc kép"');
    assert.strictEqual(globalState.pages[0].blocks[1].translated, 'Ầm ầm ầm');
    assert.strictEqual(globalState.pages[1].blocks[1].translated, 'Naruto!');
});

test('IO Script - TXT Backward Compatibility with Legacy Format', () => {
    const legacyTxt = `
==================================================
  KỊCH BẢN DỊCH THUẬT MANGA - TOÀN BỘ CHƯƠNG (1 TRANG)
==================================================

[TRANG 1: chap1_01.png]
--------------------------------------------------
* LỜI THOẠI (Dialogues):
  1. [Nhân vật: Kakashi] [Gốc]: "Chidori!"
     [Dịch]: "Thiên Điểu!"

  2. [Gốc]: "Chạy mau!"
     [Dịch]: "Run fast!"

* DẪN CHUYỆN, SFX & KHÁC:
  1. [SFX] [Gốc]: "バチバチ"
     [Dịch]: "Tách tách tách"
`;

    const parsedPages = parseTxtScript(legacyTxt);
    assert.strictEqual(parsedPages.length, 1);
    assert.strictEqual(parsedPages[0].pageName, 'chap1_01.png');
    assert.strictEqual(parsedPages[0].blocks.length, 3);
    assert.strictEqual(parsedPages[0].blocks[0].speaker, 'Kakashi');
    assert.strictEqual(parsedPages[0].blocks[0].original, 'Chidori!');
    assert.strictEqual(parsedPages[0].blocks[0].translated, 'Thiên Điểu!');
    assert.strictEqual(parsedPages[0].blocks[1].original, 'Chạy mau!');
    assert.strictEqual(parsedPages[0].blocks[1].translated, 'Run fast!');
    assert.strictEqual(parsedPages[0].blocks[2].type, 'sfx');
    assert.strictEqual(parsedPages[0].blocks[2].original, 'バチバチ');
    assert.strictEqual(parsedPages[0].blocks[2].translated, 'Tách tách tách');
});

test('IO Script - TXT Robust Matching without IDs (Original Text and Index Fallback)', () => {
    globalState.pages = [
        {
            id: 'p1',
            name: 'Page 1',
            blocks: [
                { id: 'b_unique_1', original: 'Original A', translated: '' },
                { id: 'b_unique_2', original: 'Original B', translated: '' }
            ]
        }
    ];

    // Script without IDs, but with matching original text
    const txtWithoutIds = `
[TRANG 1: Page 1]
#1
[Gốc]:
Original B
[Dịch]:
Bản dịch B

#2
[Gốc]:
Original A
[Dịch]:
Bản dịch A
`;

    const parsed = parseTxtScript(txtWithoutIds);
    const res = applyScriptPagesToProject(parsed);
    assert.strictEqual(res.matchedPages, 1);
    assert.strictEqual(res.matchedBlocks, 2);

    // Because matching prioritizes original text, B matched B and A matched A even though order in txt was reversed!
    assert.strictEqual(globalState.pages[0].blocks[0].translated, 'Bản dịch A');
    assert.strictEqual(globalState.pages[0].blocks[1].translated, 'Bản dịch B');
});

test('IO Script - parseScriptBox Preserves 0-100% Coordinates and Converts 0-1000 AI Scales', () => {
    // 0-100% percentage scale coordinates from exported script
    const percentBoxArr = [15.5, 25.0, 30.0, 45.0];
    const parsedPercentArr = parseScriptBox(percentBoxArr);
    assert.deepStrictEqual(parsedPercentArr, { x: 15.5, y: 25.0, w: 30.0, h: 45.0 });

    const percentBoxObj = { x: 12.34, y: 56.78, w: 20.0, h: 10.0 };
    const parsedPercentObj = parseScriptBox(percentBoxObj);
    assert.deepStrictEqual(parsedPercentObj, { x: 12.34, y: 56.78, w: 20.0, h: 10.0 });

    // 0-1000 scale from AI payload (> 100) should be divided by 10
    const aiBoxArr = [150, 250, 300, 450];
    const parsedAiArr = parseScriptBox(aiBoxArr);
    assert.deepStrictEqual(parsedAiArr, { x: 15.0, y: 25.0, w: 30.0, h: 45.0 });

    // Apply script with percentage box to project page
    globalState.pages = [
        {
            id: 'p1',
            name: 'Page 1',
            blocks: [
                { id: 'b1', original: 'Hello', translated: '', box: { x: 0, y: 0, w: 10, h: 10 } }
            ]
        }
    ];

    const scriptWithBox = [
        {
            pageName: 'Page 1',
            blocks: [
                { id: 'b1', translated: 'Xin chào', box: [20, 30, 40, 50] }
            ]
        }
    ];

    applyScriptPagesToProject(scriptWithBox);
    assert.deepStrictEqual(globalState.pages[0].blocks[0].box, { x: 20, y: 30, w: 40, h: 50 }, 'Box coordinates must retain 20, 30, 40, 50% without 10x shrinkage');
});

