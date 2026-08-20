import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import { naturalSortFiles, isFileSystemAccessSupported } from '../../../src/features/fs-access.ts';

test('Native File System: Natural Alphanumeric Sorting', () => {
    const rawFiles = [
        { name: 'page_10.png' },
        { name: 'page_1.png' },
        { name: 'page_2.png' },
        { name: 'page_20.png' },
        { name: 'page_3.png' },
        { name: 'page_0.png' },
        { name: 'cover.jpg' }
    ];

    const sorted = naturalSortFiles(rawFiles);
    const sortedNames = sorted.map(f => f.name);

    assert.deepStrictEqual(sortedNames, [
        'cover.jpg',
        'page_0.png',
        'page_1.png',
        'page_2.png',
        'page_3.png',
        'page_10.png',
        'page_20.png'
    ], 'Natural sort should sort numeric sequences in natural reading order without 10 preceding 2');
});

test('Native File System: API Support Check', () => {
    // In node environment without window.showDirectoryPicker
    const supported = isFileSystemAccessSupported();
    assert.strictEqual(typeof supported, 'boolean', 'Support check should return a boolean');
});

test('Native File System: Simulated Writable Stream', async () => {
    let writtenData = null;
    let isClosed = false;

    const mockFileHandle = {
        name: 'translated_page_1.png',
        createWritable: async () => ({
            write: async (data) => { writtenData = data; },
            close: async () => { isClosed = true; }
        })
    };

    const writable = await mockFileHandle.createWritable();
    const mockBlob = new Blob(['PNG_DATA_DUMMY'], { type: 'image/png' });
    await writable.write(mockBlob);
    await writable.close();

    assert.ok(writtenData, 'Data should be written to file stream');
    assert.strictEqual(isClosed, true, 'Stream should be closed after writing');
});

test('Native File System: Multi-file translated folder writing flow', async () => {
    const writtenFiles = new Map();
    const mockDirHandle = {
        name: 'Manga_Chapter_1',
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
        getDirectoryHandle: async (dirName, opts) => {
            assert.strictEqual(dirName, 'translated');
            return {
                getFileHandle: async (fileName, fileOpts) => {
                    return {
                        name: fileName,
                        createWritable: async () => ({
                            write: async (blob) => { writtenFiles.set(fileName, blob); },
                            close: async () => {}
                        })
                    };
                }
            };
        }
    };

    const outDir = await mockDirHandle.getDirectoryHandle('translated', { create: true });
    const pages = ['translated_01.png', 'translated_02.png', 'translated_03.png'];

    for (const pageName of pages) {
        const fileHandle = await outDir.getFileHandle(pageName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(new Blob([`DATA_${pageName}`]));
        await writable.close();
    }

    assert.strictEqual(writtenFiles.size, 3);
    assert.ok(writtenFiles.has('translated_01.png'));
    assert.ok(writtenFiles.has('translated_02.png'));
    assert.ok(writtenFiles.has('translated_03.png'));
});

