import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import '../../setup/canvas-mock.js';
import '../../setup/indexeddb-mock.js';

import {
    setGDriveAccessToken,
    getGDriveAccessToken,
    getGDriveClientId,
    logoutGDrive,
    syncGDriveAuthStatusUI
} from '../../../src/features/gdrive/gdrive-auth.ts';

import {
    parseGDriveFileId,
    parseGDriveFolderId,
    getSelectedFolderId
} from '../../../src/features/gdrive/gdrive-folder.ts';

import {
    getProjectBackupJSON
} from '../../../src/features/gdrive/gdrive-project-sync.ts';

import {
    closeGDriveModal
} from '../../../src/features/gdrive/gdrive-modal.ts';

import { globalState } from '../../../src/core/state.ts';

test('GDrive Modular - Auth Token & Client ID Management', () => {
    document.body.innerHTML = `
        <input id="gdrive-token-input" />
        <input id="gdrive-client-id-input" />
        <div id="gdrive-auth-status-badge"></div>
        <button id="btn-gdrive-logout" class="hidden"></button>
    `;

    setGDriveAccessToken('test_token_123');
    assert.strictEqual(getGDriveAccessToken(), 'test_token_123');
    assert.strictEqual(localStorage.getItem('gdrive_access_token'), 'test_token_123');

    syncGDriveAuthStatusUI();
    const badge = document.getElementById('gdrive-auth-status-badge');
    assert.ok(badge.className.includes('emerald'));
    const btnLogout = document.getElementById('btn-gdrive-logout');
    assert.strictEqual(btnLogout.classList.contains('hidden'), false);

    logoutGDrive();
    assert.strictEqual(getGDriveAccessToken(), '');
    assert.strictEqual(localStorage.getItem('gdrive_access_token'), null);
});

test('GDrive Modular - File & Folder ID URL Parsing', () => {
    // Standard folder link
    const url1 = 'https://drive.google.com/drive/folders/1ABCxyz_123-456?usp=sharing';
    assert.strictEqual(parseGDriveFolderId(url1), '1ABCxyz_123-456');

    // ID parameter folder link
    const url2 = 'https://drive.google.com/open?id=FOLDER_ID_999';
    assert.strictEqual(parseGDriveFolderId(url2), 'FOLDER_ID_999');

    // Raw Folder ID
    assert.strictEqual(parseGDriveFolderId('FOLDER_RAW_123'), 'FOLDER_RAW_123');

    // Standard file link (/file/d/...)
    const fileUrl1 = 'https://drive.google.com/file/d/1234567890123456789012345/view?usp=sharing';
    assert.strictEqual(parseGDriveFileId(fileUrl1), '1234567890123456789012345');

    // Raw file ID
    assert.strictEqual(parseGDriveFileId('1234567890123456789012345'), '1234567890123456789012345');
});

test('GDrive Modular - Project Backup JSON Serialization', async () => {
    globalState.pages = [
        {
            id: 'page_gdrive_1',
            name: 'chap1_01.png',
            status: 'completed',
            width: 1000,
            height: 1500,
            blocks: [
                {
                    id: 'b1',
                    type: 'dialogue',
                    original: 'Konichiwa',
                    translated: 'Xin chào',
                    box: { x: 10, y: 10, w: 20, h: 20 }
                }
            ]
        }
    ];

    const backup = await getProjectBackupJSON();
    assert.ok(backup !== null);
    assert.strictEqual(backup.version, '2.0');
    assert.strictEqual(backup.pages.length, 1);
    assert.strictEqual(backup.pages[0].name, 'chap1_01.png');
    assert.strictEqual(backup.pages[0].blocks[0].translated, 'Xin chào');
});

test('GDrive Modular - Modal Dialog Lifecycle', () => {
    document.body.innerHTML = `
        <div id="gdrive-modal"></div>
    `;

    closeGDriveModal();
    const modal = document.getElementById('gdrive-modal');
    assert.ok(modal.classList.contains('hidden'));
});
