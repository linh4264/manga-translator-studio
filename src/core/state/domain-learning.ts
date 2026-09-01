/**
 * Manga Translator Studio - Domain State: Learning & TOEIC
 * Manages saved vocabulary, active block TOEIC analysis, questions, and SRS review states.
 */
import { ToeicWord } from '../../types/index';

export interface LearningState {
    toeicSavedWords: ToeicWord[];
    activeBlockToeicAnalysis: any | null;
    toeicMode: 'learn' | 'recall';
    activeToeicQuestionIndex: number;
}

export const learningState: LearningState = {
    toeicSavedWords: [],
    activeBlockToeicAnalysis: null,
    toeicMode: 'learn',
    activeToeicQuestionIndex: 0
};
