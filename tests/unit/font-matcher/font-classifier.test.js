/**
 * Unit Tests for Module 8B: Manga Font & Dialogue Tone Classifier
 * Tests Text Type (5 categories) and Tone (16 emotions + none) Taxonomy,
 * AI & Heuristic Classification, and Multi-Dimensional Font Matching.
 */

import { describe, test, expect } from 'vitest';
import {
    TEXT_TYPE_CONFIGS,
    TONE_CONFIGS,
    classifyFontOfflineHeuristics,
    classifyDialogueOfflineHeuristics,
    scoreFontForTypeAndTone,
    matchFontsForTypeAndTone,
    batchClassifyFontLibrary
} from '../../../cong-cu-huu-ich/src/font-classifier';

describe('Manga Font & Dialogue Tone Classifier (Module 8B)', () => {

    // =========================================================================
    // 1. Taxonomy & Configuration Integrity
    // =========================================================================
    describe('1. Taxonomy & Configuration Integrity', () => {
        test('Text Type Taxonomy contains exactly 5 categories', () => {
            const expectedTypes = ['dialogue', 'thought', 'narration', 'aside', 'sfx'];
            const actualTypes = Object.keys(TEXT_TYPE_CONFIGS);
            expect(actualTypes.sort()).toEqual(expectedTypes.sort());
        });

        test('Tone Taxonomy contains exactly 17 entries (none + 16 emotions)', () => {
            const expectedTones = [
                'none',
                'normal', 'soft', 'shy', 'hesitant', 'whisper', 'shaky',
                'sad', 'crying', 'scared', 'angry', 'shouting', 'excited',
                'serious', 'weak', 'cold', 'special'
            ];
            const actualTones = Object.keys(TONE_CONFIGS);
            expect(actualTones.sort()).toEqual(expectedTones.sort());
        });

        test('Narration, Aside, and SFX are marked as allowsTone = false with defaultTone = none', () => {
            expect(TEXT_TYPE_CONFIGS.narration.allowsTone).toBe(false);
            expect(TEXT_TYPE_CONFIGS.narration.defaultTone).toBe('none');

            expect(TEXT_TYPE_CONFIGS.aside.allowsTone).toBe(false);
            expect(TEXT_TYPE_CONFIGS.aside.defaultTone).toBe('none');

            expect(TEXT_TYPE_CONFIGS.sfx.allowsTone).toBe(false);
            expect(TEXT_TYPE_CONFIGS.sfx.defaultTone).toBe('none');

            expect(TEXT_TYPE_CONFIGS.dialogue.allowsTone).toBe(true);
            expect(TEXT_TYPE_CONFIGS.thought.allowsTone).toBe(true);
        });

        test('Every Tone has non-empty description, icon, and sampleText', () => {
            Object.values(TONE_CONFIGS).forEach(meta => {
                expect(meta.name).toBeTruthy();
                expect(meta.vnName).toBeTruthy();
                expect(meta.icon).toBeTruthy();
                expect(meta.desc).toBeTruthy();
                expect(meta.sampleText).toBeTruthy();
            });
        });
    });

    // =========================================================================
    // 2. Offline Font Morphology Heuristic Classification
    // =========================================================================
    describe('2. Offline Font Morphology Heuristic Classification', () => {
        test('Classifies SFX / Brush font as TextType sfx and Tone none', () => {
            const sfxFont = {
                id: 'font_brush_sfx',
                name: 'Action Manga SFX Brush',
                family: 'Action Manga SFX Brush',
                category: 'sfx',
                weightScore: 0.85,
                roughnessScore: 0.70,
                energyScore: 0.90,
                roundnessScore: 0.20
            };

            const result = classifyFontOfflineHeuristics(sfxFont);
            expect(result.primaryTextType).toBe('sfx');
            expect(result.primaryTone).toBe('none');
            expect(result.confidenceScore).toBeGreaterThanOrEqual(0.85);
            expect(result.styleTags).toContain('SFX Display');
        });

        test('Classifies Serif / Formal font as TextType narration and Tone none', () => {
            const serifFont = {
                id: 'font_times_serif',
                name: 'Times New Roman Elegant Serif',
                family: 'Times New Roman Elegant Serif',
                category: 'narration',
                formalityScore: 0.85,
                weightScore: 0.50,
                roughnessScore: 0.05
            };

            const result = classifyFontOfflineHeuristics(serifFont);
            expect(result.primaryTextType).toBe('narration');
            expect(result.primaryTone).toBe('none');
            expect(result.confidenceScore).toBeGreaterThanOrEqual(0.85);
            expect(result.styleTags).toContain('Chữ có chân (Serif)');
        });

        test('Classifies Cartoon / Chibi font as TextType aside and Tone none', () => {
            const cartoonFont = {
                id: 'font_akbar_chibi',
                name: '000 Akbar [TeddyBear]',
                family: '000 Akbar [TeddyBear]',
                category: 'cute',
                handwrittenScore: 0.80,
                roundnessScore: 0.75,
                weightScore: 0.52
            };

            const result = classifyFontOfflineHeuristics(cartoonFont);
            expect(result.primaryTextType).toBe('aside');
            expect(result.primaryTone).toBe('none');
            expect(result.confidenceScore).toBeGreaterThanOrEqual(0.85);
            expect(result.styleTags).toContain('Viết tay vui nhộn');
        });

        test('Classifies Thin Whisper / Cursive font as TextType thought and Tone whisper', () => {
            const whisperFont = {
                id: 'font_patrick_whisper',
                name: 'Patrick Hand Soft Cursive',
                family: 'Patrick Hand Soft Cursive',
                category: 'whisper',
                weightScore: 0.30,
                roundnessScore: 0.70,
                handwrittenScore: 0.60
            };

            const result = classifyFontOfflineHeuristics(whisperFont);
            expect(result.primaryTextType).toBe('thought');
            expect(result.primaryTone).toBe('whisper');
            expect(result.compatibleTones).toContain('soft');
        });

        test('Classifies Heavy All-Caps font as TextType dialogue and Tone shouting', () => {
            const shoutFont = {
                id: 'font_utm_impact',
                name: 'UTM Impact Bold Shounen',
                family: 'UTM Impact Bold Shounen',
                category: 'shout',
                weightScore: 0.80,
                isAllCaps: true,
                energyScore: 0.90
            };

            const result = classifyFontOfflineHeuristics(shoutFont);
            expect(result.primaryTextType).toBe('dialogue');
            expect(result.primaryTone).toBe('shouting');
            expect(result.compatibleTones).toContain('angry');
        });

        test('Classifies Clean Rounded Dialogue font (SVN-Avo) as TextType dialogue and Tone soft/normal', () => {
            const avoFont = {
                id: 'font_svn_avo',
                name: 'SVN-Avo Soft',
                family: 'SVN-Avo Soft',
                category: 'dialogue',
                weightScore: 0.45,
                roundnessScore: 0.80,
                formalityScore: 0.50
            };

            const result = classifyFontOfflineHeuristics(avoFont);
            expect(result.primaryTextType).toBe('dialogue');
            expect(result.primaryTone).toBe('soft');
            expect(result.compatibleTones).toContain('normal');
        });
    });

    // =========================================================================
    // 3. Dialogue Text Offline Heuristic Classifier
    // =========================================================================
    describe('3. Dialogue Text Offline Heuristic Classifier', () => {
        test('Detects SFX from all-caps onomatopoeia', () => {
            const result = classifyDialogueOfflineHeuristics('ẦM ẦM ẦM BÙM CHOẢNG!!!');
            expect(result.detectedTextType).toBe('sfx');
            expect(result.detectedTone).toBe('none');
        });

        test('Detects Narration from opening story phrasing', () => {
            const result = classifyDialogueOfflineHeuristics('Vào một ngày nọ ở ngôi làng phía bắc vương quốc...');
            expect(result.detectedTextType).toBe('narration');
            expect(result.detectedTone).toBe('none');
        });

        test('Detects Aside from chibi remark phrasing', () => {
            const result = classifyDialogueOfflineHeuristics('*chibi chạy trốn hehe*');
            expect(result.detectedTextType).toBe('aside');
            expect(result.detectedTone).toBe('none');
        });

        test('Detects Thought from bracketed inner monologue', () => {
            const result = classifyDialogueOfflineHeuristics('(Không biết liệu cậu ấy có nhận ra tình cảm của mình không...)');
            expect(result.detectedTextType).toBe('thought');
            expect(result.detectedTone).toBe('whisper');
        });

        test('Detects Shy emotion from stuttering dialogue', () => {
            const result = classifyDialogueOfflineHeuristics('C-Cậu... có muốn cùng tớ về chung đường không?');
            expect(result.detectedTextType).toBe('dialogue');
            expect(result.detectedTone).toBe('shy');
        });

        test('Detects Shouting emotion from battle cry', () => {
            const result = classifyDialogueOfflineHeuristics('TOÀN QUÂN XÔNG LÊN TIÊU DIỆT KẺ ĐỊCH NGAY LẬP TỨC!!!');
            expect(result.detectedTextType).toBe('dialogue');
            expect(result.detectedTone).toBe('shouting');
        });

        test('Detects Crying emotion from sobbing text', () => {
            const result = classifyDialogueOfflineHeuristics('Hức... làm ơn đừng bỏ rơi tớ lại một mình mà...!');
            expect(result.detectedTextType).toBe('dialogue');
            expect(result.detectedTone).toBe('crying');
        });

        test('Detects Hesitant emotion from ellipsis text', () => {
            const result = classifyDialogueOfflineHeuristics('Chuyện là... ờ thì... tớ cũng không rõ nữa...');
            expect(result.detectedTextType).toBe('dialogue');
            expect(result.detectedTone).toBe('hesitant');
        });
    });

    // =========================================================================
    // 4. Multi-Dimensional Font Scoring for Type & Tone
    // =========================================================================
    describe('4. Multi-Dimensional Font Scoring for Type & Tone', () => {
        const mockLibrary = [
            {
                id: 'f_avo',
                name: 'SVN-Avo Soft',
                family: 'SVN-Avo Soft',
                category: 'dialogue',
                primaryTextType: 'dialogue',
                primaryTone: 'soft',
                weightScore: 0.45,
                roundnessScore: 0.80
            },
            {
                id: 'f_impact',
                name: 'UTM Impact Bold',
                family: 'UTM Impact Bold',
                category: 'shout',
                primaryTextType: 'dialogue',
                primaryTone: 'shouting',
                weightScore: 0.85,
                roundnessScore: 0.20
            },
            {
                id: 'f_times',
                name: 'Times New Roman',
                family: 'Times New Roman',
                category: 'narration',
                primaryTextType: 'narration',
                primaryTone: 'none',
                formalityScore: 0.90,
                weightScore: 0.50
            },
            {
                id: 'f_sfx',
                name: 'Action SFX Brush',
                family: 'Action SFX Brush',
                category: 'sfx',
                primaryTextType: 'sfx',
                primaryTone: 'none',
                roughnessScore: 0.80,
                weightScore: 0.90
            }
        ];

        test('Soft Romance dialogue ranks SVN-Avo as Top 1', () => {
            const matches = matchFontsForTypeAndTone(mockLibrary, 'dialogue', 'soft');
            expect(matches[0].id).toBe('f_avo');
            expect(matches[0].rank).toBe(1);
            expect(matches[0].matchPercent).toBeGreaterThan(80);
        });

        test('Shouting battle cry dialogue ranks UTM Impact as Top 1', () => {
            const matches = matchFontsForTypeAndTone(mockLibrary, 'dialogue', 'shouting');
            expect(matches[0].id).toBe('f_impact');
            expect(matches[0].rank).toBe(1);
            expect(matches[0].matchPercent).toBeGreaterThan(80);
        });

        test('Narration text ranks Times New Roman as Top 1', () => {
            const matches = matchFontsForTypeAndTone(mockLibrary, 'narration', 'none');
            expect(matches[0].id).toBe('f_times');
            expect(matches[0].rank).toBe(1);
        });

        test('SFX sound effect ranks Action SFX Brush as Top 1', () => {
            const matches = matchFontsForTypeAndTone(mockLibrary, 'sfx', 'none');
            expect(matches[0].id).toBe('f_sfx');
            expect(matches[0].rank).toBe(1);
        });
    });

    // =========================================================================
    // 5. Batch Classification Engine
    // =========================================================================
    describe('5. Batch Classification Engine', () => {
        test('batchClassifyFontLibrary handles large font collection (50 fonts) and categorizes into all 5 types', () => {
            const largeCollection = [];
            for (let i = 0; i < 50; i++) {
                if (i % 5 === 0) {
                    largeCollection.push({ id: `f_${i}`, name: `SFX Brush Font ${i}`, family: `SFX ${i}`, category: 'sfx', roughnessScore: 0.7, weightScore: 0.8 });
                } else if (i % 5 === 1) {
                    largeCollection.push({ id: `f_${i}`, name: `Times Roman Serif ${i}`, family: `Serif ${i}`, category: 'narration', formalityScore: 0.9, weightScore: 0.5 });
                } else if (i % 5 === 2) {
                    largeCollection.push({ id: `f_${i}`, name: `Chibi Hand Font ${i}`, family: `Cute ${i}`, category: 'cute', handwrittenScore: 0.8, weightScore: 0.45 });
                } else if (i % 5 === 3) {
                    largeCollection.push({ id: `f_${i}`, name: `Whisper Soft ${i}`, family: `Whisper ${i}`, category: 'whisper', weightScore: 0.3, roundnessScore: 0.7 });
                } else {
                    largeCollection.push({ id: `f_${i}`, name: `SVN Avo Dialogue ${i}`, family: `Avo ${i}`, category: 'dialogue', weightScore: 0.5, roundnessScore: 0.6 });
                }
            }

            const results = batchClassifyFontLibrary(largeCollection);
            expect(results.length).toBe(50);

            const sfxFonts = results.filter(f => f.primaryTextType === 'sfx');
            const narrationFonts = results.filter(f => f.primaryTextType === 'narration');
            const asideFonts = results.filter(f => f.primaryTextType === 'aside');
            const thoughtFonts = results.filter(f => f.primaryTextType === 'thought');
            const dialogueFonts = results.filter(f => f.primaryTextType === 'dialogue');

            expect(sfxFonts.length).toBe(10);
            expect(narrationFonts.length).toBe(10);
            expect(asideFonts.length).toBe(10);
            expect(thoughtFonts.length).toBe(10);
            expect(dialogueFonts.length).toBe(10);

            // Verify Tone = none rule
            sfxFonts.forEach(f => expect(f.primaryTone).toBe('none'));
            narrationFonts.forEach(f => expect(f.primaryTone).toBe('none'));
            asideFonts.forEach(f => expect(f.primaryTone).toBe('none'));
        });
    });
});

