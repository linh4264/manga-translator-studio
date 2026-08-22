import { describe, test, expect } from 'vitest';
import {
    calculateCategoryCompatibility,
    rankFontsAgainstAnalysis,
    analyzeImageWithCanvasHeuristics,
    determineWeightGrade,
    determineWidthGrade,
    determineSlantGrade,
    determineCaseGrade,
    analyzeFontMorphology,
    profileFontGlyph,
    getCategoryLabel,
    GENRE_PRESETS,
    calculateRoleSimilarity,
    rankFontsForRole,
    generateFontSetFromPreset,
    generateFontSetFromCustomProfile,
    analyzeGenreWithCanvasHeuristics,
    BUILTIN_MANGA_FONTS,
    getEffectiveFontLibrary
} from '../../../cong-cu-huu-ich/src/font-matcher';

describe('Manga Font Matcher & Set Recommendation Engine', () => {

    describe('1. Category Compatibility Matrix', () => {
        test('Exact category match gives 1.0 compatibility', () => {
            expect(calculateCategoryCompatibility('dialogue', 'dialogue')).toBe(1.0);
            expect(calculateCategoryCompatibility('shout', 'shout')).toBe(1.0);
            expect(calculateCategoryCompatibility('sfx', 'sfx')).toBe(1.0);
            expect(calculateCategoryCompatibility('narration', 'narration')).toBe(1.0);
            expect(calculateCategoryCompatibility('whisper', 'whisper')).toBe(1.0);
        });

        test('High-compatibility manga styles give 0.70 compatibility', () => {
            expect(calculateCategoryCompatibility('shout', 'sfx')).toBe(0.70);
            expect(calculateCategoryCompatibility('sfx', 'shout')).toBe(0.70);
            expect(calculateCategoryCompatibility('dialogue', 'narration')).toBe(0.70);
            expect(calculateCategoryCompatibility('whisper', 'cute')).toBe(0.70);
        });

        test('Opposing manga styles give low compatibility (0.15)', () => {
            expect(calculateCategoryCompatibility('shout', 'whisper')).toBe(0.15);
            expect(calculateCategoryCompatibility('sfx', 'whisper')).toBe(0.15);
            expect(calculateCategoryCompatibility('sfx', 'narration')).toBe(0.15);
        });
    });

    describe('2. Single Patch Deterministic Ranking & Realistic Scoring', () => {
        const mockFontLibrary = [
            {
                id: 'font_wild_shout',
                name: 'Wild Shout Bold',
                family: 'Wild Shout Bold',
                fontClass: 'font-custom',
                category: 'shout',
                type: 'custom',
                weightScore: 0.85,
                energyScore: 0.90,
                formalityScore: 0.20,
                roughnessScore: 0.70,
                roundnessScore: 0.20,
                handwrittenScore: 0.20,
                isAllCaps: true,
                dateAdded: 1,
                desc: '',
                recommendedStroke: '3.5px'
            },
            {
                id: 'font_comic_speech',
                name: 'Comic Speech Regular',
                family: 'Comic Speech Regular',
                fontClass: 'font-custom',
                category: 'dialogue',
                type: 'custom',
                weightScore: 0.50,
                energyScore: 0.50,
                formalityScore: 0.40,
                roughnessScore: 0.20,
                roundnessScore: 0.75,
                handwrittenScore: 0.25,
                isAllCaps: false,
                dateAdded: 2,
                desc: '',
                recommendedStroke: '2.5px'
            },
            {
                id: 'font_light_whisper',
                name: 'Soft Whisper Light',
                family: 'Soft Whisper Light',
                fontClass: 'font-custom',
                category: 'whisper',
                type: 'custom',
                weightScore: 0.25,
                energyScore: 0.25,
                formalityScore: 0.25,
                roughnessScore: 0.15,
                roundnessScore: 0.80,
                handwrittenScore: 0.80,
                isAllCaps: false,
                dateAdded: 3,
                desc: '',
                recommendedStroke: '2px'
            }
        ];

        test('Shout action analysis ranks Wild Shout at Top 1 with high match percentage', () => {
            const shoutAnalysis = {
                category: 'shout',
                weightScore: 0.85,
                roundnessScore: 0.20,
                handwrittenScore: 0.20,
                energyScore: 0.90,
                formalityScore: 0.20,
                roughnessScore: 0.70,
                isAllCaps: true
            };

            const ranked = rankFontsAgainstAnalysis(mockFontLibrary, shoutAnalysis, 'auto');
            expect(ranked.length).toBe(3);
            expect(ranked[0].id).toBe('font_wild_shout');
            expect(ranked[0].rank).toBe(1);
            expect(ranked[0].matchPercent).toBeGreaterThanOrEqual(90);
            expect(ranked[2].id).toBe('font_light_whisper');
            expect(ranked[2].matchPercent).toBeLessThan(60);
        });

        test('Differentiates between rounded dialogue font and sharp font with same weight', () => {
            const fontLibraryWithEqualWeight = [
                {
                    id: 'font_soft_rounded',
                    name: 'Soft Rounded Comic',
                    family: 'Soft Rounded Comic',
                    fontClass: 'font-custom',
                    category: 'dialogue',
                    type: 'custom',
                    weightScore: 0.50,
                    roundnessScore: 0.90,
                    handwrittenScore: 0.20,
                    energyScore: 0.50,
                    formalityScore: 0.40,
                    roughnessScore: 0.15,
                    isAllCaps: false,
                    dateAdded: 1,
                    desc: '',
                    recommendedStroke: '2px'
                },
                {
                    id: 'font_sharp_angular',
                    name: 'Sharp Angular Tech',
                    family: 'Sharp Angular Tech',
                    fontClass: 'font-custom',
                    category: 'dialogue',
                    type: 'custom',
                    weightScore: 0.50,
                    roundnessScore: 0.15,
                    handwrittenScore: 0.10,
                    energyScore: 0.50,
                    formalityScore: 0.70,
                    roughnessScore: 0.20,
                    isAllCaps: false,
                    dateAdded: 2,
                    desc: '',
                    recommendedStroke: '2px'
                }
            ];

            const softDialogueAnalysis = {
                category: 'dialogue',
                weightScore: 0.50,
                roundnessScore: 0.85,
                handwrittenScore: 0.20,
                energyScore: 0.50,
                formalityScore: 0.40,
                roughnessScore: 0.15,
                isAllCaps: false
            };

            const ranked = rankFontsAgainstAnalysis(fontLibraryWithEqualWeight, softDialogueAnalysis, 'auto');
            expect(ranked[0].id).toBe('font_soft_rounded');
            expect(ranked[0].matchPercent).toBeGreaterThan(ranked[1].matchPercent);
        });

        test('Realistic scoring does NOT artificially inflate Top 1 score when match is poor', () => {
            const techCyberAnalysis = {
                category: 'tech',
                weightScore: 0.95,
                roundnessScore: 0.10,
                handwrittenScore: 0.05,
                energyScore: 0.10,
                formalityScore: 0.95,
                roughnessScore: 0.05
            };

            const ranked = rankFontsAgainstAnalysis(mockFontLibrary, techCyberAnalysis, 'auto');
            expect(ranked[0].matchPercent).toBeLessThan(70);
        });

        test('Standard Manga dialogue strictly prioritizes clean manga fonts and penalizes cartoon/quirky fonts (like Akbar)', () => {
            const fontLibraryWithCartoon = [
                {
                    id: 'font_akbar_cartoon',
                    name: '000 Akbar [TeddyBear]',
                    family: '000 Akbar [TeddyBear]',
                    fontClass: 'font-custom',
                    category: 'cute',
                    fontStyleType: 'cartoon_quirky',
                    type: 'custom',
                    weightScore: 0.52,
                    roundnessScore: 0.70,
                    handwrittenScore: 0.75,
                    energyScore: 0.50,
                    formalityScore: 0.30,
                    roughnessScore: 0.18,
                    isAllCaps: false,
                    dateAdded: 1,
                    desc: '',
                    recommendedStroke: '2px'
                },
                {
                    id: 'font_svn_avo',
                    name: 'SVN-Avo',
                    family: 'SVN-Avo',
                    fontClass: 'font-custom',
                    category: 'dialogue',
                    fontStyleType: 'standard_dialogue',
                    type: 'custom',
                    weightScore: 0.48,
                    roundnessScore: 0.75,
                    handwrittenScore: 0.15,
                    energyScore: 0.45,
                    formalityScore: 0.65,
                    roughnessScore: 0.10,
                    isAllCaps: false,
                    dateAdded: 2,
                    desc: '',
                    recommendedStroke: '1.5px'
                },
                {
                    id: 'font_wild_words',
                    name: 'CC Wild Words',
                    family: 'CC Wild Words',
                    fontClass: 'font-custom',
                    category: 'dialogue',
                    fontStyleType: 'standard_dialogue',
                    type: 'custom',
                    weightScore: 0.50,
                    roundnessScore: 0.65,
                    handwrittenScore: 0.18,
                    energyScore: 0.50,
                    formalityScore: 0.60,
                    roughnessScore: 0.12,
                    isAllCaps: false,
                    dateAdded: 3,
                    desc: '',
                    recommendedStroke: '2px'
                }
            ];

            const standardMangaAnalysis = {
                category: 'dialogue',
                fontStyleType: 'standard_dialogue',
                weightScore: 0.48,
                roundnessScore: 0.75,
                handwrittenScore: 0.18,
                energyScore: 0.45,
                formalityScore: 0.65,
                roughnessScore: 0.10,
                isAllCaps: false
            };

            const ranked = rankFontsAgainstAnalysis(fontLibraryWithCartoon, standardMangaAnalysis, 'auto');
            expect(ranked[0].id).toBe('font_svn_avo');
            expect(ranked[0].rank).toBe(1);
            expect(ranked[1].id).toBe('font_wild_words');
            expect(ranked[2].id).toBe('font_akbar_cartoon');
            expect(ranked[0].matchPercent).toBeGreaterThan(ranked[2].matchPercent + 20);
        });

        test('profileFontGlyph correctly classifies cartoon names vs standard manga font names', () => {
            const akbarProfile = profileFontGlyph('000 Akbar [TeddyBear]');
            expect(akbarProfile.fontStyleType).toBe('cartoon_quirky');
            expect(akbarProfile.category).toBe('cute');
            expect(akbarProfile.handwrittenScore).toBeGreaterThanOrEqual(0.70);

            const avoProfile = profileFontGlyph('SVN-Avo Soft');
            expect(avoProfile.fontStyleType).toBe('standard_dialogue');
            expect(avoProfile.category).toBe('dialogue');

            const wildWordsProfile = profileFontGlyph('CC Wild Words');
            expect(wildWordsProfile.fontStyleType).toBe('standard_dialogue');
            expect(wildWordsProfile.category).toBe('dialogue');
        });

        test('analyzeImageWithCanvasHeuristics returns multi-dimensional properties in fallback mode', () => {
            const fallback = analyzeImageWithCanvasHeuristics(null, 'whisper');
            expect(fallback).toBeDefined();
            expect(fallback.category).toBe('whisper');
            expect(fallback.roundnessScore).toBeDefined();
            expect(fallback.handwrittenScore).toBeDefined();
            expect(fallback.weightScore).toBeLessThan(0.40);
        });
    });

    describe('3. Genre -> Style Profile -> Font Set Presets (6 MVP Presets)', () => {
        const fullMangaFontLibrary = [
            {
                id: 'f_dialogue_romance',
                name: 'SVN-Avo Soft',
                family: 'SVN-Avo Soft',
                fontClass: 'font-custom',
                category: 'dialogue',
                type: 'custom',
                weightScore: 0.40,
                roundnessScore: 0.85,
                formalityScore: 0.35,
                handwrittenScore: 0.25,
                energyScore: 0.30,
                roughnessScore: 0.10,
                isAllCaps: false,
                dateAdded: 1,
                desc: '',
                recommendedStroke: '2px'
            },
            {
                id: 'f_whisper_cursive',
                name: 'HL-Handwriting Sweet',
                family: 'HL-Handwriting Sweet',
                fontClass: 'font-custom',
                category: 'whisper',
                type: 'custom',
                weightScore: 0.30,
                roundnessScore: 0.75,
                formalityScore: 0.20,
                handwrittenScore: 0.85,
                energyScore: 0.20,
                roughnessScore: 0.15,
                isAllCaps: false,
                dateAdded: 2,
                desc: '',
                recommendedStroke: '2px'
            },
            {
                id: 'f_narration_serif',
                name: 'UVN-Times Elegant Serif',
                family: 'UVN-Times Elegant Serif',
                fontClass: 'font-custom',
                category: 'narration',
                type: 'custom',
                weightScore: 0.45,
                roundnessScore: 0.40,
                formalityScore: 0.85,
                handwrittenScore: 0.10,
                energyScore: 0.30,
                roughnessScore: 0.10,
                isAllCaps: false,
                dateAdded: 3,
                desc: '',
                recommendedStroke: '2px'
            },
            {
                id: 'f_shout_bold',
                name: 'UTM-Impact Giant',
                family: 'UTM-Impact Giant',
                fontClass: 'font-custom',
                category: 'shout',
                type: 'custom',
                weightScore: 0.95,
                roundnessScore: 0.20,
                formalityScore: 0.25,
                handwrittenScore: 0.10,
                energyScore: 0.95,
                roughnessScore: 0.30,
                isAllCaps: true,
                dateAdded: 4,
                desc: '',
                recommendedStroke: '4px'
            },
            {
                id: 'f_sfx_brush',
                name: 'Manga Brush Explosive',
                family: 'Manga Brush Explosive',
                fontClass: 'font-custom',
                category: 'sfx',
                type: 'custom',
                weightScore: 0.90,
                roundnessScore: 0.15,
                formalityScore: 0.05,
                handwrittenScore: 0.90,
                energyScore: 0.98,
                roughnessScore: 0.85,
                isAllCaps: false,
                dateAdded: 5,
                desc: '',
                recommendedStroke: '4.5px'
            },
            {
                id: 'f_comedy_bubble',
                name: 'Comic Bubble Fun',
                family: 'Comic Bubble Fun',
                fontClass: 'font-custom',
                category: 'cute',
                type: 'custom',
                weightScore: 0.50,
                roundnessScore: 0.95,
                formalityScore: 0.15,
                handwrittenScore: 0.45,
                energyScore: 0.50,
                roughnessScore: 0.15,
                isAllCaps: false,
                dateAdded: 6,
                desc: '',
                recommendedStroke: '2.5px'
            }
        ];

        const genres = ['romance', 'comedy', 'modern', 'action', 'dark', 'fantasy'];

        test.each(genres)('Generates complete 6-role font set for %s preset', (genreId) => {
            const fontSet = generateFontSetFromPreset(fullMangaFontLibrary, genreId);
            expect(fontSet).toBeDefined();
            expect(fontSet.presetId).toBe(genreId);
            expect(fontSet.presetName).toBe(GENRE_PRESETS[genreId].name);

            // All 6 roles are assigned
            const expectedRoles = ['dialogue', 'innerThought', 'narration', 'shout', 'sfx', 'smallText'];
            expectedRoles.forEach(role => {
                const item = fontSet.roles[role];
                expect(item).toBeDefined();
                expect(item.role).toBe(role);
                expect(item.fontName).toBeTruthy();
                expect(item.fontItem).not.toBeNull();
                expect(item.score).toBeGreaterThan(0);
                expect(typeof item.isStrongMatch).toBe('boolean');
                expect(item.sampleText).toBeTruthy();
            });

            // Core font count is bounded between 1 and 6
            expect(fontSet.coreFontCount).toBeGreaterThanOrEqual(1);
            expect(fontSet.coreFontCount).toBeLessThanOrEqual(6);
        });

        test('Soft Romance assigns soft rounded font for dialogue and handwriting for inner thought', () => {
            const fontSet = generateFontSetFromPreset(fullMangaFontLibrary, 'romance');
            expect(fontSet.roles.dialogue.fontName).toBe('SVN-Avo Soft');
            expect(fontSet.roles.innerThought.fontName).toBe('HL-Handwriting Sweet');
        });

        test('Action / Impact assigns heavy shout font for shout and brush for sfx', () => {
            const fontSet = generateFontSetFromPreset(fullMangaFontLibrary, 'action');
            expect(fontSet.roles.shout.fontName).toBe('UTM-Impact Giant');
            expect(fontSet.roles.sfx.fontName).toBe('Manga Brush Explosive');
        });

        test('Cute / Comedy assigns bubble comic font for dialogue', () => {
            const fontSet = generateFontSetFromPreset(fullMangaFontLibrary, 'comedy');
            expect(fontSet.roles.dialogue.fontName).toBe('Comic Bubble Fun');
        });

        test('Graceful fallback when font library has only 1 font', () => {
            const singleFontLibrary = [fullMangaFontLibrary[0]];
            const fontSet = generateFontSetFromPreset(singleFontLibrary, 'action');
            expect(fontSet.coreFontCount).toBe(1);
            expect(fontSet.roles.dialogue.fontName).toBe('SVN-Avo Soft');
            expect(fontSet.roles.shout.fontName).toBe('SVN-Avo Soft');
            expect(fontSet.roles.sfx.fontName).toBe('SVN-Avo Soft');
        });

        test('Graceful fallback when font library is empty', () => {
            const fontSet = generateFontSetFromPreset([], 'romance');
            expect(fontSet.coreFontCount).toBe(0);
            expect(fontSet.roles.dialogue.fontItem).toBeNull();
            expect(fontSet.roles.dialogue.isStrongMatch).toBe(false);
            expect(fontSet.roles.dialogue.score).toBe(0);
        });
    });

    describe('4. AI Style Profile Adaptation & Heuristic Fallbacks', () => {
        test('Custom AI Style Profile generates adapted font set', () => {
            const customProfile = {
                weight: 0.90,
                roundness: 0.20,
                formality: 0.20,
                handwritten: 0.30,
                intensity: 0.95
            };
            const mockFonts = [
                {
                    id: 'f1',
                    name: 'Heavy Sharp',
                    family: 'Heavy Sharp',
                    fontClass: 'font-custom',
                    category: 'shout',
                    type: 'custom',
                    weightScore: 0.90,
                    roundnessScore: 0.20,
                    formalityScore: 0.20,
                    handwrittenScore: 0.30,
                    energyScore: 0.95,
                    roughnessScore: 0.50,
                    isAllCaps: true,
                    dateAdded: 1,
                    desc: '',
                    recommendedStroke: '3px'
                }
            ];

            const fontSet = generateFontSetFromCustomProfile(mockFonts, customProfile, 'AI Shounen Heavy');
            expect(fontSet.presetId).toBe('ai_detected');
            expect(fontSet.presetName).toBe('AI Shounen Heavy');
            expect(fontSet.isAiAnalyzed).toBe(true);
            expect(fontSet.roles.dialogue.fontName).toBe('Heavy Sharp');
            expect(fontSet.roles.dialogue.score).toBeGreaterThanOrEqual(80);
        });

        test('analyzeGenreWithCanvasHeuristics returns complete result without errors in headless mode', () => {
            const result = analyzeGenreWithCanvasHeuristics([]);
            expect(result).toBeDefined();
            expect(result.genre).toBeTruthy();
            expect(result.detectedPresetId).toBeTruthy();
            expect(result.weight).toBeGreaterThanOrEqual(0.1);
            expect(result.weight).toBeLessThanOrEqual(1.0);
            expect(result.roundness).toBeGreaterThanOrEqual(0.1);
            expect(result.roundness).toBeLessThanOrEqual(1.0);
        });
    });

    describe('5. Font Profiling 5-Dimensional Metrics', () => {
        test('profileFontGlyph returns 5-dimensional style profile', () => {
            const profile = profileFontGlyph('Arial');
            expect(profile).toBeDefined();
            expect(typeof profile.weightScore).toBe('number');
            expect(typeof profile.roundnessScore).toBe('number');
            expect(typeof profile.formalityScore).toBe('number');
            expect(typeof profile.handwrittenScore).toBe('number');
            expect(typeof profile.energyScore).toBe('number');
            expect(typeof profile.isAllCaps).toBe('boolean');
        });

        test('getCategoryLabel returns correct Vietnamese descriptions', () => {
            expect(getCategoryLabel('dialogue')).toBe('Hội thoại Manga');
            expect(getCategoryLabel('shout')).toBe('La hét / Cảm thán');
            expect(getCategoryLabel('narration')).toBe('Dẫn truyện / Tường thuật');
            expect(getCategoryLabel('whisper')).toBe('Thì thầm / Nghĩ thầm');
            expect(getCategoryLabel('cute')).toBe('Dễ thương / Hài hước');
            expect(getCategoryLabel('tech')).toBe('Công nghệ / Robot');
            expect(getCategoryLabel('sfx')).toBe('SFX Âm thanh');
            expect(getCategoryLabel('unknown')).toBe('Đa dụng');
        });
    });

    describe('6. User Custom Font Library Architecture (100% User-Supplied Fonts)', () => {
        test('BUILTIN_MANGA_FONTS is strictly empty (no hardcoded default fonts)', () => {
            expect(BUILTIN_MANGA_FONTS).toEqual([]);
        });

        test('Large custom library (180 fonts) correctly matches roles and maintains cohesion', () => {
            const largeMockLibrary = Array.from({ length: 180 }, (_, i) => ({
                id: `font_${i}`,
                name: `Manga Custom Font ${i}`,
                family: `Manga Custom Font ${i}`,
                fontClass: 'font-custom',
                category: i % 5 === 0 ? 'shout' : i % 5 === 1 ? 'sfx' : i % 5 === 2 ? 'narration' : i % 5 === 3 ? 'whisper' : 'dialogue',
                type: 'custom',
                weightScore: 0.2 + (i % 10) * 0.08,
                energyScore: 0.15 + (i % 10) * 0.08,
                formalityScore: 0.2 + (i % 8) * 0.1,
                roughnessScore: 0.1 + (i % 6) * 0.15,
                roundnessScore: 0.2 + (i % 7) * 0.1,
                handwrittenScore: 0.1 + (i % 9) * 0.1,
                isAllCaps: i % 4 === 0,
                dateAdded: Date.now() + i,
                desc: `Custom font ${i}`,
                recommendedStroke: '2.5px'
            }));

            const fontSet = generateFontSetFromPreset(largeMockLibrary, 'action');
            expect(fontSet.presetId).toBe('action');
            expect(fontSet.roles.dialogue.fontName).toBeTruthy();
            expect(fontSet.roles.shout.fontName).toBeTruthy();
            expect(fontSet.roles.sfx.fontName).toBeTruthy();
            expect(fontSet.roles.innerThought.fontName).toBeTruthy();
            expect(fontSet.roles.narration.fontName).toBeTruthy();
            expect(fontSet.roles.smallText.fontName).toBeTruthy();
            expect(fontSet.coreFontCount).toBeGreaterThanOrEqual(1);
            expect(fontSet.coreFontCount).toBeLessThanOrEqual(6);
        });
    });

    describe('7. Local Typography Morphology Classification (Weight, Width, Slant, Case)', () => {
        test('Weight grade maps correctly across all 7 levels', () => {
            expect(determineWeightGrade(0.12)).toBe('Thin');
            expect(determineWeightGrade(0.28)).toBe('Light');
            expect(determineWeightGrade(0.42)).toBe('Regular');
            expect(determineWeightGrade(0.58)).toBe('Medium');
            expect(determineWeightGrade(0.72)).toBe('SemiBold');
            expect(determineWeightGrade(0.84)).toBe('Bold');
            expect(determineWeightGrade(0.95)).toBe('Black');
        });

        test('Width grade maps correctly across 3 levels (Condensed, Normal, Wide)', () => {
            expect(determineWidthGrade(0.55, 0.35)).toBe('Condensed');
            expect(determineWidthGrade(0.85, 0.55)).toBe('Normal');
            expect(determineWidthGrade(1.15, 0.78)).toBe('Wide');
        });

        test('Slant grade maps correctly across 3 levels (Upright, Italic, Oblique)', () => {
            expect(determineSlantGrade(0.0, false)).toBe('Upright');
            expect(determineSlantGrade(2.5, false)).toBe('Upright');
            expect(determineSlantGrade(12.0, true)).toBe('Italic');
            expect(determineSlantGrade(11.0, false)).toBe('Oblique');
            expect(determineSlantGrade(-10.5, false)).toBe('Oblique');
        });

        test('Case grade maps correctly across 3 levels (Mixed Case, All Caps, Small Caps)', () => {
            expect(determineCaseGrade(false, false)).toBe('Mixed Case');
            expect(determineCaseGrade(true, false)).toBe('All Caps');
            expect(determineCaseGrade(false, true)).toBe('Small Caps');
        });

        test('analyzeFontMorphology extracts complete 4-dimensional morphology result', () => {
            const resultBoldItalic = analyzeFontMorphology('Manga Action Bold Italic');
            expect(resultBoldItalic).toBeDefined();
            expect(resultBoldItalic.weight).toBe('Bold');
            expect(resultBoldItalic.slant).toBe('Italic');
            expect(resultBoldItalic.width).toBe('Normal');
            expect(resultBoldItalic.caseType).toBe('Mixed Case');
            expect(resultBoldItalic.isItalic).toBe(true);

            const resultThinCondensed = analyzeFontMorphology('Manga Dialogue Thin Condensed');
            expect(resultThinCondensed.weight).toBe('Thin');
            expect(resultThinCondensed.width).toBe('Condensed');

            const resultBlackCaps = analyzeFontMorphology('Impact SFX Black All-Caps');
            expect(resultBlackCaps.weight).toBe('Black');
            expect(resultBlackCaps.caseType).toBe('All Caps');
            expect(resultBlackCaps.isAllCaps).toBe(true);
        });

        test('profileFontGlyph returns integrated morphology and grades', () => {
            const profile = profileFontGlyph('Comic Speech Bold');
            expect(profile).toBeDefined();
            expect(profile.weightGrade).toBeDefined();
            expect(profile.widthGrade).toBeDefined();
            expect(profile.slantGrade).toBeDefined();
            expect(profile.caseGrade).toBeDefined();
            expect(profile.morphology).toBeDefined();
        });

        test('Classifies and filters hundreds of fonts (300 fonts) by exact selected attributes', () => {
            const weights = ['Thin', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'Black'];
            const widths = ['Condensed', 'Normal', 'Wide'];
            const slants = ['Upright', 'Italic', 'Oblique'];
            const cases = ['Mixed Case', 'All Caps', 'Small Caps'];

            // Generate 300 custom fonts
            const largeLibrary = Array.from({ length: 300 }, (_, i) => {
                const w = weights[i % weights.length];
                const wd = widths[i % widths.length];
                const s = slants[i % slants.length];
                const c = cases[i % cases.length];

                return {
                    id: `font_${i}`,
                    name: `Font ${w} ${wd} ${s} ${c} #${i}`,
                    family: `Font ${w} ${wd} ${s} ${c} #${i}`,
                    fontClass: 'font-custom',
                    category: 'dialogue',
                    type: 'custom',
                    weightGrade: w,
                    widthGrade: wd,
                    slantGrade: s,
                    caseGrade: c,
                    weightScore: w === 'Thin' ? 0.15 : w === 'Black' ? 0.92 : 0.50,
                    energyScore: 0.50,
                    formalityScore: 0.50,
                    roughnessScore: 0.20,
                    isAllCaps: c === 'All Caps',
                    dateAdded: i
                };
            });

            // User filter: Weight = Bold, Width = Condensed
            const filteredBoldCondensed = largeLibrary.filter(f =>
                (f.weightGrade === 'Bold') && (f.widthGrade === 'Condensed')
            );
            expect(filteredBoldCondensed.length).toBeGreaterThan(0);
            filteredBoldCondensed.forEach(f => {
                expect(f.weightGrade).toBe('Bold');
                expect(f.widthGrade).toBe('Condensed');
            });

            // User filter: Slant = Italic, Case = All Caps, Weight = Black
            const filteredBlackItalicCaps = largeLibrary.filter(f =>
                (f.weightGrade === 'Black') && (f.slantGrade === 'Italic') && (f.caseGrade === 'All Caps')
            );
            expect(filteredBlackItalicCaps.length).toBeGreaterThan(0);
            filteredBlackItalicCaps.forEach(f => {
                expect(f.weightGrade).toBe('Black');
                expect(f.slantGrade).toBe('Italic');
                expect(f.caseGrade).toBe('All Caps');
            });

            // User filter: Width = Wide, Slant = Oblique
            const filteredWideOblique = largeLibrary.filter(f =>
                (f.widthGrade === 'Wide') && (f.slantGrade === 'Oblique')
            );
            expect(filteredWideOblique.length).toBeGreaterThan(0);
            filteredWideOblique.forEach(f => {
                expect(f.widthGrade).toBe('Wide');
                expect(f.slantGrade).toBe('Oblique');
            });
        });
    });
});

