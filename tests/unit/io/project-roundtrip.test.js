import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';
import '../../setup/indexeddb-mock.js';

import { globalState } from '../../../src/core/state.ts';
import { buildProjectBackupJSON } from '../../../src/features/io.ts';

// Project serialization & deserialization helpers (matching MTS Project Schema)
function serializeMtsProject(state = globalState) {
    return {
        version: '2.5.0',
        createdAt: new Date().toISOString(),
        settings: {
            sourceLanguage: state.sourceLanguage || 'ja',
            targetLanguage: state.targetLanguage || 'vi',
            comicUniverse: state.comicUniverse || 'manga',
            comicGenres: state.comicGenres || ['fantasy'],
            comicTone: state.comicTone || 'classic',
            defaultFont: state.defaultFont || 'font-manga',
            autoFitEnabled: state.autoFitEnabled !== undefined ? state.autoFitEnabled : true,
            preserveNames: !!state.preserveNames,
            glossaryNames: state.glossaryNames || '',
            pronounMatrix: state.pronounMatrix || ''
        },
        lorebook: JSON.parse(JSON.stringify(state.lorebook || [])),
        characterDossier: JSON.parse(JSON.stringify(state.characterDossier || [])),
        pages: (state.pages || []).map(p => ({
            id: p.id,
            name: p.name,
            status: p.status,
            eraserLayerBlob: p.eraserLayerBlob || null,
            blocks: (p.blocks || []).map(b => ({
                id: b.id,
                type: b.type || 'dialogue',
                imageUrl: b.imageUrl || null,
                original: b.original || '',
                translated: b.translated || '',
                box: { ...b.box },
                style: { ...b.style }
            }))
        }))
    };
}

function deserializeMtsProject(projectData, targetState = globalState) {
    if (!projectData || typeof projectData !== 'object') {
        throw new Error('Dữ liệu dự án không hợp lệ');
    }

    // Settings migration
    if (projectData.settings) {
        const s = projectData.settings;
        targetState.sourceLanguage = s.sourceLanguage || 'ja';
        targetState.targetLanguage = s.targetLanguage || 'vi';
        targetState.comicUniverse = s.comicUniverse || 'auto';
        targetState.comicGenres = Array.isArray(s.comicGenres) ? s.comicGenres : ['fantasy'];
        targetState.comicTone = s.comicTone || 'classic';
        targetState.defaultFont = s.defaultFont || 'font-manga';
        targetState.autoFitEnabled = s.autoFitEnabled !== undefined ? s.autoFitEnabled : true;
        targetState.preserveNames = !!s.preserveNames;
        targetState.glossaryNames = s.glossaryNames || '';
        targetState.pronounMatrix = s.pronounMatrix || '';
    }

    targetState.lorebook = Array.isArray(projectData.lorebook) ? projectData.lorebook : [];
    targetState.characterDossier = Array.isArray(projectData.characterDossier) ? projectData.characterDossier : [];

    // Pages & Blocks migration with safe fallbacks for legacy versions
    targetState.pages = (projectData.pages || []).map((p, pIdx) => ({
        id: p.id || `page_${pIdx + 1}`,
        name: p.name || `Trang ${pIdx + 1}`,
        status: p.status || 'draft',
        eraserLayerBlob: p.eraserLayerBlob || null,
        blocks: (p.blocks || []).map((b, bIdx) => ({
            id: b.id || `b_${pIdx + 1}_${bIdx + 1}`,
            type: b.type || 'dialogue',
            imageUrl: b.imageUrl || null,
            original: b.original || '',
            translated: b.translated || '',
            box: {
                x: Number(b.box?.x) || 0,
                y: Number(b.box?.y) || 0,
                w: Number(b.box?.w) || 20,
                h: Number(b.box?.h) || 10
            },
            style: {
                fontFamily: b.style?.fontFamily || targetState.defaultFont || 'font-manga',
                fontSize: Number(b.style?.fontSize) || 14,
                textColor: b.style?.textColor || '#000000',
                bgColor: b.style?.bgColor || '#ffffff',
                bgOpacity: b.style?.bgOpacity !== undefined ? b.style?.bgOpacity : 100,
                bold: !!b.style?.bold,
                align: b.style?.align || 'center',
                maskShape: b.style?.maskShape || 'bubble-fit',
                autoFit: b.style?.autoFit !== undefined ? b.style?.autoFit : targetState.autoFitEnabled,
                arcAngle: Number(b.style?.arcAngle) || 0,
                skewX: Number(b.style?.skewX) || 0,
                skewY: Number(b.style?.skewY) || 0,
                warpWave: Number(b.style?.warpWave) || 0,
                warpBulge: Number(b.style?.warpBulge) || 0
            }
        }))
    }));

    return targetState;
}

test('IO Project - Full Project Export and Import Roundtrip (100% Data Fidelity)', () => {
    // Setup state
    globalState.sourceLanguage = 'ja';
    globalState.targetLanguage = 'vi';
    globalState.comicUniverse = 'manga';
    globalState.comicGenres = ['action', 'isekai'];
    globalState.comicTone = 'classic';
    globalState.defaultFont = 'font-manga';
    globalState.lorebook = [{ id: 'l1', originalTerm: 'Hokage', translatedTerm: 'Hokage' }];
    globalState.characterDossier = [{ id: 'c1', originalName: 'Luffy', translatedName: 'Luffy' }];

    const samplePage = {
        id: 'p_roundtrip_1',
        name: 'Page 01',
        status: 'completed',
        eraserLayerBlob: 'data:image/png;base64,eraserSample',
        blocks: [
            {
                id: 'b1',
                type: 'dialogue',
                original: 'おい、待てよ！',
                translated: 'Này, đứng lại đó!',
                box: { x: 15, y: 25, w: 30, h: 20 },
                style: {
                    fontFamily: 'font-manga',
                    fontSize: 16,
                    textColor: '#000000',
                    bgColor: '#ffffff',
                    bgOpacity: 100,
                    bold: true,
                    align: 'center',
                    maskShape: 'bubble-fit',
                    autoFit: false
                }
            },
            {
                id: 'b2_sfx',
                type: 'sfx',
                original: 'ドドド',
                translated: 'RẦM RẦM',
                box: { x: 50, y: 40, w: 40, h: 25 },
                style: {
                    fontFamily: 'font-impact',
                    fontSize: 32,
                    arcAngle: 30,
                    skewX: 10,
                    skewY: -5,
                    warpWave: 20,
                    warpBulge: 15
                }
            }
        ]
    };

    globalState.pages = [samplePage];

    // Export to JSON string
    const projectJson = JSON.stringify(serializeMtsProject());

    // Clear state
    globalState.pages = [];
    globalState.lorebook = [];

    // Import from JSON string
    const parsedData = JSON.parse(projectJson);
    deserializeMtsProject(parsedData);

    // Assertions
    assert.strictEqual(globalState.comicUniverse, 'manga');
    assert.deepStrictEqual(globalState.comicGenres, ['action', 'isekai']);
    assert.strictEqual(globalState.lorebook.length, 1);
    assert.strictEqual(globalState.characterDossier.length, 1);
    assert.strictEqual(globalState.pages.length, 1);

    const restoredPage = globalState.pages[0];
    assert.strictEqual(restoredPage.id, 'p_roundtrip_1');
    assert.strictEqual(restoredPage.status, 'completed');
    assert.strictEqual(restoredPage.blocks.length, 2);

    const rb1 = restoredPage.blocks[0];
    assert.strictEqual(rb1.translated, 'Này, đứng lại đó!');
    assert.strictEqual(rb1.style.autoFit, false);
    assert.strictEqual(rb1.style.maskShape, 'bubble-fit');

    const rb2 = restoredPage.blocks[1];
    assert.strictEqual(rb2.translated, 'RẦM RẦM');
    assert.strictEqual(rb2.style.arcAngle, 30);
    assert.strictEqual(rb2.style.warpBulge, 15);
});

test('IO Project - Backward Compatibility (Legacy v1.0 Project File Migration)', () => {
    // Legacy v1.0 format missing new properties (lorebook, characterDossier, maskShape, warp controls)
    const legacyProjectV1 = {
        version: '1.0.0',
        pages: [
            {
                id: 'legacy_p1',
                blocks: [
                    {
                        id: 'legacy_b1',
                        original: 'Hello',
                        translated: 'Xin chào',
                        box: { x: 20, y: 20, w: 20, h: 20 },
                        style: { fontSize: 14 }
                    }
                ]
            }
        ]
    };

    const target = {};
    assert.doesNotThrow(() => {
        deserializeMtsProject(legacyProjectV1, target);
    }, 'Must parse and migrate legacy project without throwing');

    assert.strictEqual(target.pages.length, 1);
    assert.strictEqual(target.pages[0].blocks[0].style.maskShape, 'bubble-fit', 'Must fallback safely to default maskShape');
    assert.strictEqual(target.pages[0].blocks[0].style.arcAngle, 0, 'Must fallback safely to default arcAngle');
    assert.strictEqual(Array.isArray(target.lorebook), true);
    assert.strictEqual(Array.isArray(target.characterDossier), true);
});

test('IO Project - buildProjectBackupJSON Serializes Inpainting Layer, Speakers, Dimensions & Anchors', async () => {
    const mockBlob = new Blob(['mock-png-data'], { type: 'image/png' });
    globalState.pages = [
        {
            id: 'p_full_1',
            name: 'Page 1',
            status: 'completed',
            width: 800,
            height: 1200,
            apiWidth: 800,
            apiHeight: 1200,
            src: 'blob:http://localhost/page1',
            originalFile: mockBlob,
            eraserLayerBlob: mockBlob,
            blocks: [
                {
                    id: 'b1',
                    type: 'dialogue',
                    original: 'Orig text',
                    translated: 'Trans text',
                    speaker: 'Naruto',
                    target: 'Sasuke',
                    vertical: true,
                    textAnchor: { x: 25, y: 35 },
                    positionKnown: true,
                    box: { x: 20, y: 30, w: 15, h: 25 },
                    style: { fontSize: 16, vertical: true }
                }
            ]
        }
    ];

    const backup = await buildProjectBackupJSON();
    assert.strictEqual(backup.pages.length, 1);

    const bp = backup.pages[0];
    assert.strictEqual(bp.width, 800);
    assert.strictEqual(bp.height, 1200);
    assert.strictEqual(bp.apiWidth, 800);
    assert.strictEqual(bp.apiHeight, 1200);
    assert.ok(typeof bp.eraserLayerSrc === 'string' && bp.eraserLayerSrc.startsWith('data:'), 'eraserLayerSrc must be serialized as data URL');

    const bb = bp.blocks[0];
    assert.strictEqual(bb.speaker, 'Naruto');
    assert.strictEqual(bb.target, 'Sasuke');
    assert.strictEqual(bb.vertical, true);
    assert.deepStrictEqual(bb.textAnchor, { x: 25, y: 35 });
    assert.strictEqual(bb.positionKnown, true);
});
