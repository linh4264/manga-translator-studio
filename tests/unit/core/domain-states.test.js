import { describe, it, expect, beforeEach } from 'vitest';
import {
    globalState,
    getDocumentState,
    getEditorState,
    getSettingsState,
    getTypographyState,
    getLearningState,
    documentState,
    editorState,
    settingsState,
    typographyState,
    learningState,
    setSelectedBlockId,
    setSelectedBlockIds,
    getActivePage,
    getActiveBlock,
    getFontMetrics,
    isWeakTranslationModel,
    isFlash31LiteModel
} from '../../../src/core/state';
import { createDefaultPage, createDefaultBlock } from '../../../src/core/document-model';

describe('Domain States Architecture & Proxy Reactivity', () => {
    beforeEach(() => {
        documentState.pages = [];
        documentState.activePageIndex = -1;
        documentState.selectedBlockId = null;
        documentState.selectedBlockIds = [];
        editorState.viewMode = 'overlay';
        editorState.zoom = 100;
        settingsState.selectedModel = 'gemini-2.5-flash';
        typographyState.defaultFontSize = 17;
        typographyState.fontSpecificMetrics = {};
        learningState.toeicSavedWords = [];
    });

    describe('1. Document State & Page/Block Selection', () => {
        it('manages pages, active page and block selection accurately', () => {
            const page1 = createDefaultPage({ id: 'p1', name: 'Trang 1' });
            const block1 = createDefaultBlock({ id: 'b1', original: 'Hello', translated: 'Xin chào' });
            page1.blocks.push(block1);

            documentState.pages.push(page1);
            documentState.activePageIndex = 0;

            expect(getActivePage()?.id).toBe('p1');

            setSelectedBlockId('b1');
            expect(documentState.selectedBlockId).toBe('b1');
            expect(documentState.selectedBlockIds).toEqual(['b1']);
            expect(getActiveBlock()?.id).toBe('b1');
            expect(getActiveBlock()?.translated).toBe('Xin chào');

            setSelectedBlockIds(['b1', 'b2']);
            expect(documentState.selectedBlockIds).toEqual(['b1', 'b2']);
            expect(documentState.selectedBlockId).toBe('b1');
        });
    });

    describe('2. Editor State Management', () => {
        it('updates editor view mode and zoom correctly', () => {
            const state = getEditorState();
            expect(state.viewMode).toBe('overlay');

            state.viewMode = 'split';
            state.zoom = 150;

            expect(editorState.viewMode).toBe('split');
            expect(editorState.zoom).toBe(150);
            expect(globalState.viewMode).toBe('split');
            expect(globalState.zoom).toBe(150);
        });
    });

    describe('3. Settings State & Model Checks', () => {
        it('evaluates weak and flash-lite models correctly', () => {
            expect(isWeakTranslationModel('gemini-2.5-flash-lite')).toBe(true);
            expect(isWeakTranslationModel('gemini-3.1-flash-lite')).toBe(true);
            expect(isWeakTranslationModel('gemini-2.5-pro')).toBe(false);

            expect(isFlash31LiteModel('gemini-3.1-flash-lite')).toBe(true);
            expect(isFlash31LiteModel('gemini-2.5-flash-lite')).toBe(false);
        });

        it('syncs settings modifications through globalState proxy', () => {
            globalState.apiKey = 'test_api_key_123';
            globalState.aiProvider = 'openai';

            expect(settingsState.apiKey).toBe('test_api_key_123');
            expect(settingsState.aiProvider).toBe('openai');
            expect(getSettingsState().apiKey).toBe('test_api_key_123');
        });
    });

    describe('4. Typography State & Font Specific Metrics', () => {
        it('calculates font metrics with specific font overrides', () => {
            typographyState.defaultFontSize = 18;
            typographyState.defaultLineHeight = 1.2;
            typographyState.defaultLetterSpacing = 0.5;

            // Default font metrics
            const defaultMetrics = getFontMetrics('font-manga');
            expect(defaultMetrics.fontSize).toBe(18);
            expect(defaultMetrics.lineHeight).toBe(1.2);
            expect(defaultMetrics.letterSpacing).toBe(0.5);

            // Font-specific overrides
            typographyState.fontSpecificMetrics = {
                'font-impact': {
                    fontSize: 24,
                    lineHeight: 1.05,
                    letterSpacing: 2
                }
            };

            const impactMetrics = getFontMetrics('font-impact');
            expect(impactMetrics.fontSize).toBe(24);
            expect(impactMetrics.lineHeight).toBe(1.05);
            expect(impactMetrics.letterSpacing).toBe(2);
        });
    });

    describe('5. Learning State & TOEIC Word Tracking', () => {
        it('manages TOEIC saved words state', () => {
            const word = {
                word: 'negotiate',
                pos: 'v',
                vietnamese: 'đàm phán',
                toeic_example: 'They negotiated a new contract.'
            };

            learningState.toeicSavedWords.push(word);
            expect(getLearningState().toeicSavedWords).toHaveLength(1);
            expect(globalState.toeicSavedWords[0].word).toBe('negotiate');
        });
    });

    describe('6. 100% Backward Compatible GlobalState Proxy', () => {
        it('allows cross-domain property reading and writing transparently', () => {
            globalState.pages = [createDefaultPage({ id: 'p_test' })];
            globalState.activePageIndex = 0;
            globalState.magicWandActive = true;
            globalState.targetLanguage = 'ja';
            globalState.defaultNarrationFont = 'font-vietnamese';

            expect(documentState.pages[0].id).toBe('p_test');
            expect(documentState.activePageIndex).toBe(0);
            expect(editorState.magicWandActive).toBe(true);
            expect(settingsState.targetLanguage).toBe('ja');
            expect(typographyState.defaultNarrationFont).toBe('font-vietnamese');
        });
    });
});
