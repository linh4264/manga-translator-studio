import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import '../../setup/canvas-mock.js';
import '../../setup/indexeddb-mock.js';

import {
    getPageExportMimeType,
    sortPagesByName
} from '../../../src/features/io/file-loader.ts';

import {
    getExportRange,
    toggleExportModalFit,
    closeExportModal,
    exportModalIsFullSize
} from '../../../src/features/io/image-exporter.ts';

import {
    generateTxtScript,
    parseTxtScript,
    parseScriptBox,
    applyScriptPagesToProject
} from '../../../src/features/io/script-exchange.ts';

import {
    buildProjectBackupJSON
} from '../../../src/features/io/project-exchange.ts';

import {
    executeFindReplaceAll
} from '../../../src/features/io/find-replace.ts';

import { globalState } from '../../../src/core/state.ts';

test('IO Modular - File Loader MimeType Detection & Ordering', () => {
    const pngPage = { id: 'p1', name: '01.png' };
    const pngMeta = getPageExportMimeType(pngPage);
    assert.strictEqual(pngMeta.mimeType, 'image/png');
    assert.strictEqual(pngMeta.ext, 'png');

    const jpgPage = { id: 'p2', name: '02.jpg' };
    const jpgMeta = getPageExportMimeType(jpgPage);
    assert.strictEqual(jpgMeta.mimeType, 'image/jpeg');
    assert.strictEqual(jpgMeta.ext, 'jpg');

    const webpPage = { id: 'p3', name: '03.webp' };
    const webpMeta = getPageExportMimeType(webpPage);
    assert.strictEqual(webpMeta.mimeType, 'image/webp');
    assert.strictEqual(webpMeta.ext, 'webp');

    // Natural Sorting
    globalState.pages = [
        { id: 'p10', name: 'page_10.png', blocks: [] },
        { id: 'p2', name: 'page_2.png', blocks: [] },
        { id: 'p1', name: 'page_1.png', blocks: [] }
    ];
    globalState.activePageIndex = 0;
    sortPagesByName();
    assert.strictEqual(globalState.pages[0].name, 'page_1.png');
    assert.strictEqual(globalState.pages[1].name, 'page_2.png');
    assert.strictEqual(globalState.pages[2].name, 'page_10.png');
});

test('IO Modular - Image Exporter Range & Modal Controls', () => {
    document.body.innerHTML = `
        <input id="chk-export-range" type="checkbox" />
        <input id="num-export-start" />
        <input id="num-export-end" />
        <img id="export-preview-img" />
        <div id="export-modal" class="hidden"></div>
    `;

    const chk = document.getElementById('chk-export-range');
    chk.checked = true;
    const numStart = document.getElementById('num-export-start');
    numStart.value = '1';
    const numEnd = document.getElementById('num-export-end');
    numEnd.value = '2';

    globalState.pages = [
        { id: 'p1', name: '1.png', blocks: [] },
        { id: 'p2', name: '2.png', blocks: [] },
        { id: 'p3', name: '3.png', blocks: [] }
    ];

    const range = getExportRange();
    assert.strictEqual(range.startIndex, 0);
    assert.strictEqual(range.endIndex, 1);

    toggleExportModalFit();
    assert.strictEqual(exportModalIsFullSize, true);
    toggleExportModalFit();
    assert.strictEqual(exportModalIsFullSize, false);

    closeExportModal();
});

test('IO Modular - Script Exchange Parsing & Matching', () => {
    const pages = [
        {
            id: 'p1',
            name: '01.png',
            blocks: [
                { id: 'b1', type: 'dialogue', original: 'Hello', translated: 'Xin chào', speaker: 'A' },
                { id: 'b2', type: 'narration', original: 'Once upon a time', translated: 'Ngày xửa ngày xưa' }
            ]
        }
    ];

    const txtScript = generateTxtScript(pages);
    assert.ok(txtScript.includes('[TRANG 1: 01.png]'));
    assert.ok(txtScript.includes('[Gốc]:\nHello'));
    assert.ok(txtScript.includes('[Dịch]:\nXin chào'));

    const parsed = parseTxtScript(txtScript);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].blocks.length, 2);
    assert.strictEqual(parsed[0].blocks[0].original, 'Hello');
    assert.strictEqual(parsed[0].blocks[0].translated, 'Xin chào');

    // Box parsing (0-1000 scale to 0-100%)
    const box = parseScriptBox([100, 200, 300, 400]);
    assert.strictEqual(box.x, 10);
    assert.strictEqual(box.y, 20);
    assert.strictEqual(box.w, 30);
    assert.strictEqual(box.h, 40);
});

test('IO Modular - Project Exchange Serialization', async () => {
    globalState.pages = [
        {
            id: 'p1',
            name: '01.png',
            status: 'draft',
            width: 800,
            height: 1200,
            blocks: [
                { id: 'b1', type: 'dialogue', box: { x: 10, y: 10, w: 20, h: 20 }, original: 'Text', translated: 'Chữ' }
            ]
        }
    ];

    const backup = await buildProjectBackupJSON();
    assert.strictEqual(backup.version, '2.0');
    assert.strictEqual(backup.pages.length, 1);
    assert.strictEqual(backup.pages[0].blocks.length, 1);
});

test('IO Modular - Global Find & Replace in Text Blocks', () => {
    document.body.innerHTML = `
        <input id="find-input" />
        <input id="replace-input" />
        <input id="match-case-chk" type="checkbox" />
        <div id="find-replace-result-badge"></div>
        <div id="find-replace-modal"></div>
    `;

    document.getElementById('find-input').value = 'anh';
    document.getElementById('replace-input').value = 'em';

    globalState.pages = [
        {
            id: 'p1',
            name: '01.png',
            blocks: [
                { id: 'b1', original: 'you', translated: 'Tôi yêu anh rất nhiều' }
            ]
        }
    ];

    executeFindReplaceAll();
    assert.strictEqual(globalState.pages[0].blocks[0].translated, 'Tôi yêu em rất nhiều');
});
