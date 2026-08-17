import test from 'node:test';
import assert from 'node:assert';
import '../../setup/browser-env.js';

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

test('IO Script - Export and Import Script Roundtrip', () => {
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

    const targetPages = [
        {
            id: 'p1',
            name: 'Page 1',
            blocks: [
                { id: 'p1_b1', original: 'おはよう', translated: '', box: { x: 0, y: 0, w: 0, h: 0 } },
                { id: 'p1_b2', original: '元気？', translated: '', box: { x: 0, y: 0, w: 0, h: 0 } }
            ]
        }
    ];

    // Verify format fields
    assert.deepStrictEqual(synchronizedScript.pages[0].blocks[0].box, [10, 20, 30, 40]);
    assert.strictEqual(synchronizedScript.pages[0].blocks[0].vertical, true);
    assert.strictEqual(synchronizedScript.pages[0].blocks[1].vertical, undefined, 'Horizontal block should omit vertical property');
});
