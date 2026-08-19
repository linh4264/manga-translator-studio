// TOEIC Study Companion Module
import { globalState, loadToeicWordsFromDB, saveToeicWordsToDB, uiSetRightTab } from '../core/state';
import { DEFAULT_MODEL } from '../config/constants';
import { elements } from '../core/elements';
import { showToast, escapeHTML } from '../core/utils';
import { safeSetLocalStorage } from '../core/utils/storage';
import { parseGeminiJsonText } from '../core/utils/json';
import { getGeminiApiKey } from './ai/ai-service';
import { getGeminiGenerateContentUrl, getConfiguredAiProvider } from './ai/ai-config';
import { ensureModalElement } from '../core/component-loader';
import { ToeicWord } from '../types/index';

let srsReviewQueue: ToeicWord[] = [];
let srsCurrentIndex = 0;
let isSrsCardFlipped = false;

export function quickOpenToeicAnalysis(): void {
    uiSetRightTab('toeic');
}

export function updateToeicTabUI(): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        if (elements.toeicNoBlockSelectedState) elements.toeicNoBlockSelectedState.classList.remove('hidden');
        if (elements.toeicAnalysisContainer) elements.toeicAnalysisContainer.classList.add('hidden');
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    if (elements.toeicNoBlockSelectedState) elements.toeicNoBlockSelectedState.classList.add('hidden');
    if (elements.toeicAnalysisContainer) {
        elements.toeicAnalysisContainer.classList.remove('hidden');

        setToeicMode(globalState.toeicMode || 'learn');

        if (globalState.activeBlockToeicAnalysis && globalState.activeBlockToeicAnalysis.blockId === block.id) {
            displayToeicAnalysis(globalState.activeBlockToeicAnalysis.analysis);
        } else {
            resetToeicAnalysisUI();
        }
    }

    updateToeicNotebookUI();
}

export function resetToeicAnalysisUI(): void {
    if (elements.btnToeicAnalyze) elements.btnToeicAnalyze.classList.remove('hidden');
    if (elements.toeicLoading) elements.toeicLoading.classList.add('hidden');
    if (elements.toeicResults) elements.toeicResults.classList.add('hidden');

    if (elements.toeicOriginalSentence) elements.toeicOriginalSentence.textContent = '';
    if (elements.toeicGrammarContent) elements.toeicGrammarContent.textContent = '';
    if (elements.toeicVocabList) elements.toeicVocabList.innerHTML = '';
    if (elements.toeicQuestionText) elements.toeicQuestionText.textContent = '';
    if (elements.toeicQuestionOptions) elements.toeicQuestionOptions.innerHTML = '';
    if (elements.toeicQuestionFeedback) {
        elements.toeicQuestionFeedback.classList.add('hidden');
        elements.toeicQuestionFeedback.innerHTML = '';
    }
}

export function displayToeicAnalysis(analysis: any): void {
    if (!analysis) return;

    if (elements.btnToeicAnalyze) elements.btnToeicAnalyze.classList.add('hidden');
    if (elements.toeicLoading) elements.toeicLoading.classList.add('hidden');
    if (elements.toeicResults) elements.toeicResults.classList.remove('hidden');

    if (elements.toeicOriginalSentence) {
        const page = globalState.pages[globalState.activePageIndex];
        const block = page ? page.blocks.find(b => b.id === globalState.selectedBlockId) : null;
        const originalText = block ? (block.original || '').trim() : '';
        elements.toeicOriginalSentence.textContent = originalText;

        if (elements.btnSpeakOriginal) {
            elements.btnSpeakOriginal.onclick = () => speakText(originalText);
        }
    }

    if (elements.toeicGrammarContent) {
        elements.toeicGrammarContent.textContent = analysis.grammar || 'Không có phân tích ngữ pháp.';
    }

    if (elements.toeicVocabList) {
        elements.toeicVocabList.innerHTML = '';
        const vocabData = analysis.vocabulary || [];
        if (vocabData.length === 0) {
            elements.toeicVocabList.innerHTML = '<div class="text-[11px] text-slate-500 italic">Không phát hiện từ vựng TOEIC 450+ đặc trưng.</div>';
        } else {
            vocabData.forEach((item: any, index: number) => {
                const isSaved = globalState.toeicSavedWords.some(w => w.word.toLowerCase() === item.word.toLowerCase());

                const card = document.createElement('div');
                card.className = 'p-2.5 rounded bg-slate-900 border border-slate-800 space-y-1.5 text-xs';

                card.innerHTML = `
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-1.5 min-w-0 flex-1">
                            <span class="font-bold text-indigo-300 text-sm truncate">${escapeHTML(item.word)}</span>
                            <span class="text-[9px] text-slate-400 italic shrink-0">(${escapeHTML(item.pos)})</span>
                            <span class="text-[10px] text-slate-500 font-mono shrink-0">${escapeHTML(item.phonetic || '')}</span>
                            <button class="btn-speak-vocab text-slate-500 hover:text-indigo-400 shrink-0" title="Nghe từ vựng">
                                <i class="fa-solid fa-volume-high text-[10px]"></i>
                            </button>
                        </div>
                        <button id="btn-save-vocab-${index}" class="btn-save-vocab text-[10px] px-2 py-0.5 rounded border transition-all shrink-0 ${isSaved
                        ? 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-red-950/30 hover:border-red-500/30 hover:text-red-400'
                        : 'bg-indigo-600/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-600 hover:text-white'
                    }">
                            ${isSaved ? '<i class="fa-solid fa-check"></i> Đã lưu' : '<i class="fa-solid fa-plus"></i> Lưu'}
                        </button>
                    </div>
                    <div class="text-[11px] text-slate-300"><span class="font-semibold text-slate-400">Nghĩa:</span> ${escapeHTML(item.vietnamese)}</div>
                    <div class="text-[10px] text-slate-400 italic leading-relaxed flex items-center justify-between gap-1.5">
                        <div class="flex-1 min-w-0"><span class="font-semibold text-slate-500">Ví dụ:</span> "${escapeHTML(item.toeic_example)}"</div>
                        <button class="btn-speak-example text-slate-500 hover:text-indigo-400 shrink-0" title="Nghe câu ví dụ">
                            <i class="fa-solid fa-volume-high text-[9px]"></i>
                        </button>
                    </div>
                `;

                card.querySelector('.btn-speak-vocab')?.addEventListener('click', () => speakText(item.word));
                card.querySelector('.btn-save-vocab')?.addEventListener('click', () => toggleSaveToeicWordByIndex(index));
                card.querySelector('.btn-speak-example')?.addEventListener('click', () => speakText(item.toeic_example));

                elements.toeicVocabList?.appendChild(card);
            });
        }
    }

    const pqs = analysis.practice_questions || (analysis.practice_question ? [analysis.practice_question] : []);
    const tabsContainer = document.getElementById('toeic-question-tabs');

    if (elements.toeicQuestionSection && pqs.length > 0) {
        elements.toeicQuestionSection.classList.remove('hidden');

        if (tabsContainer) {
            if (pqs.length > 1) {
                tabsContainer.classList.remove('hidden');
            } else {
                tabsContainer.classList.add('hidden');
            }
        }

        if (globalState.activeToeicQuestionIndex >= pqs.length) {
            globalState.activeToeicQuestionIndex = 0;
        }

        for (let i = 0; i < 3; i++) {
            const btn = document.getElementById(`btn-question-tab-${i}`);
            if (btn) {
                if (i === globalState.activeToeicQuestionIndex) {
                    btn.className = "flex-1 py-1 text-[9px] font-bold rounded bg-indigo-600 text-white transition-all text-center";
                } else {
                    btn.className = "flex-1 py-1 text-[9px] font-bold rounded text-slate-400 hover:text-slate-200 transition-all text-center bg-slate-950 border border-slate-800";
                }
            }
        }

        renderActiveToeicQuestion(pqs, globalState.activeToeicQuestionIndex);
    } else {
        if (elements.toeicQuestionSection) elements.toeicQuestionSection.classList.add('hidden');
    }
}

export function checkToeicAnswer(selectedLetter: string, correctLetter: string, explanation: string): void {
    if (!elements.toeicQuestionFeedback) return;

    elements.toeicQuestionFeedback.classList.remove('hidden', 'bg-emerald-950/80', 'border-emerald-500/30', 'text-emerald-200', 'bg-red-950/80', 'border-red-500/30', 'text-red-200');

    const isCorrect = selectedLetter.toUpperCase() === correctLetter.toUpperCase();

    if (isCorrect) {
        elements.toeicQuestionFeedback.classList.add('bg-emerald-950/80', 'border', 'border-emerald-500/30', 'text-emerald-200');
        elements.toeicQuestionFeedback.innerHTML = `
            <div class="font-bold flex items-center gap-1.5 mb-1"><i class="fa-solid fa-circle-check text-emerald-400"></i> Chính xác! Đáp án đúng là ${correctLetter}</div>
            <div>${escapeHTML(explanation)}</div>
        `;
        showToast("Bạn đã trả lời chính xác câu hỏi TOEIC!", "success");
    } else {
        elements.toeicQuestionFeedback.classList.add('bg-red-950/80', 'border', 'border-red-500/30', 'text-red-200');
        elements.toeicQuestionFeedback.innerHTML = `
            <div class="font-bold flex items-center gap-1.5 mb-1"><i class="fa-solid fa-circle-xmark text-red-400"></i> Chưa đúng! Đáp án đúng là ${correctLetter}</div>
            <div>${escapeHTML(explanation)}</div>
        `;
        showToast("Đáp án chưa chính xác, hãy xem phần giải thích.", "warn");
    }
}

export async function analyzeBlockForToeic(): Promise<void> {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    const originalText = (block.original || "").trim();
    if (!originalText) {
        showToast("Khung thoại này chưa có chữ gốc (Original Text) để phân tích ngữ pháp.", "warn");
        return;
    }

    const keyToUse = getGeminiApiKey();
    if (!keyToUse) {
        showToast("Vui lòng nhập Gemini API Key trong phần Cài đặt trước khi phân tích.", "error");
        import('../ui/index').then(ui => ui.openSettingsModal());
        return;
    }

    if (elements.btnToeicAnalyze) elements.btnToeicAnalyze.classList.add('hidden');
    if (elements.toeicLoading) elements.toeicLoading.classList.remove('hidden');
    if (elements.toeicResults) elements.toeicResults.classList.add('hidden');

    try {
        const modelToUse = globalState.selectedModel || DEFAULT_MODEL;
        if (getConfiguredAiProvider() !== 'gemini') {
            throw new Error('Provider hiện tại chưa có adapter thực thi cho luồng TOEIC này.');
        }

        const apiUrl = getGeminiGenerateContentUrl(modelToUse, keyToUse);

        const promptText = `You are a TOEIC 450 preparation tutor. Analyze the following English sentence from a comic dialogue.
Sentence: "${originalText}"

Provide a JSON response with the following keys:
1. "grammar": Explain the grammar structure of the sentence in Vietnamese, highlighting key grammatical points (tenses, word forms, passive voice, conjunctions, relative clauses, prepositions, etc.) relevant to TOEIC Part 5 & 6. Keep it concise.
2. "vocabulary": An array of TOEIC-relevant words (from the sentence) that are useful for TOEIC 450. For each word, include:
   - "word": The word itself (base form).
   - "pos": Part of speech (e.g. noun, verb, adjective, adverb).
   - "phonetic": IPA pronunciation.
   - "vietnamese": Vietnamese translation.
   - "toeic_example": A clear example sentence in business/office context using this word.
3. "practice_questions": An array of exactly 3 multiple-choice questions (one for each type: "Part 5 - Ngữ pháp", "Part 5 - Từ vựng", and "Part 7 - Đọc hiểu").
   Each question object in the array must contain these keys:
   - "type": The type name (exactly "Part 5 - Ngữ pháp", "Part 5 - Từ vựng", or "Part 7 - Đọc hiểu").
   - "question": The question text.
     * For "Part 5 - Ngữ pháp": create a fill-in-the-blank question from the sentence or a closely related sentence testing grammar/word form, with a blank space "______".
     * For "Part 5 - Từ vựng": create a fill-in-the-blank question testing vocabulary in a business/office context, with a blank space "______".
     * For "Part 7 - Đọc hiểu": ask a direct reading comprehension question about the meaning, speaker's intent, or implication of the sentence.
   - "options": An array of 4 options (e.g. ["(A) ...", "(B) ...", "(C) ...", "(D) ..."]).
   - "correct_answer": The letter of the correct answer (e.g., "A", "B", "C", "D").
   - "explanation": Brief explanation in Vietnamese explaining why this option is correct.
   
Return ONLY the JSON. Do not wrap it in markdown code fences or anything else. Just return raw JSON.`;

        const payload = {
            contents: [{
                parts: [{ text: promptText }]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                maxOutputTokens: 2048
            }
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const result = await response.json();
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) throw new Error("Không nhận được phản hồi từ AI.");

        const parsedData = parseGeminiJsonText(jsonText);

        globalState.activeBlockToeicAnalysis = {
            blockId: block.id,
            analysis: parsedData
        };

        displayToeicAnalysis(parsedData);
        showToast("Đã phân tích cấu trúc TOEIC thành công!", "success");

    } catch (error: any) {
        console.error("Lỗi phân tích TOEIC:", error);
        showToast("Không thể phân tích bằng AI: " + (error.message || "Lỗi mạng"), "error");
        resetToeicAnalysisUI();
    }
}

export function persistToeicWordsToStorage(words: ToeicWord[]): void {
    safeSetLocalStorage('manga_permanent_toeic_words', words);
}

export async function toggleSaveToeicWordByIndex(index: number): Promise<void> {
    if (!globalState.activeBlockToeicAnalysis || !globalState.activeBlockToeicAnalysis.analysis) return;
    const item = globalState.activeBlockToeicAnalysis.analysis.vocabulary[index];
    if (!item) return;

    try {
        const wordIndex = globalState.toeicSavedWords.findIndex(w => w.word.toLowerCase() === item.word.toLowerCase());
        if (wordIndex !== -1) {
            globalState.toeicSavedWords.splice(wordIndex, 1);
            showToast(`Đã xóa "${item.word}" khỏi sổ tay.`, "info");
        } else {
            globalState.toeicSavedWords.unshift({
                word: item.word,
                pos: item.pos,
                phonetic: item.phonetic || '',
                vietnamese: item.vietnamese,
                toeic_example: item.toeic_example || '',
                savedAt: Date.now()
            });
            showToast(`Đã lưu "${item.word}" vào sổ tay!`, "success");
        }

        await saveToeicWordsToDB(globalState.toeicSavedWords);
        persistToeicWordsToStorage(globalState.toeicSavedWords);

        updateToeicNotebookUI();
        if (globalState.activeBlockToeicAnalysis) {
            displayToeicAnalysis(globalState.activeBlockToeicAnalysis.analysis);
        }
    } catch (e) {
        console.error("Lỗi khi lưu từ vựng:", e);
    }
}

export function updateToeicNotebookUI(): void {
    const listContainer = elements.toeicNotebookList;
    const emptyState = elements.toeicNotebookEmpty;
    const countBadge = elements.toeicSavedCount;
    const exportBtn = elements.btnToeicExportAnki;
    const srsBtn = document.getElementById('btn-open-srs-review') as HTMLButtonElement | null;
    const srsDueBadge = document.getElementById('srs-due-badge');

    if (!listContainer) return;

    const savedWords = globalState.toeicSavedWords || [];
    const dueWords = getDueSrsWords();

    if (countBadge) countBadge.textContent = String(savedWords.length);
    if (exportBtn) exportBtn.disabled = savedWords.length === 0;

    if (srsBtn) {
        srsBtn.disabled = savedWords.length === 0;
    }
    if (srsDueBadge) {
        if (dueWords.length > 0) {
            srsDueBadge.textContent = `${dueWords.length} cần ôn`;
            srsDueBadge.className = 'px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold animate-pulse';
        } else {
            srsDueBadge.textContent = 'Đã thuộc hết';
            srsDueBadge.className = 'px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold border border-emerald-500/30';
        }
    }

    if (savedWords.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        listContainer.innerHTML = '';
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    listContainer.innerHTML = '';

    savedWords.forEach((item, idx) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'p-2.5 rounded bg-slate-950 border border-slate-800 flex items-center justify-between text-xs group';

        const srsLevel = item.srsLevel || 0;
        let srsTag = '<span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">🌱 Mới lưu</span>';
        if (srsLevel >= 5) {
            srsTag = '<span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">🌳 Thuộc lòng</span>';
        } else if (srsLevel >= 2) {
            srsTag = '<span class="text-[9px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/30">🌿 Đang nhớ</span>';
        }

        itemEl.innerHTML = `
            <div class="min-w-0 flex-1 pr-2">
                <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-bold text-slate-200">${escapeHTML(item.word)}</span>
                    <span class="text-[9px] text-slate-500 italic">(${escapeHTML(item.pos)})</span>
                    ${srsTag}
                </div>
                <div class="text-[11px] text-indigo-300 truncate">${escapeHTML(item.vietnamese)}</div>
            </div>
            <button title="Xóa"
                class="btn-delete-saved-word w-6 h-6 rounded bg-slate-900 border border-slate-800 text-slate-500 hover:bg-red-950/40 hover:border-red-500/30 hover:text-red-400 flex items-center justify-center transition-all opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                <i class="fa-solid fa-trash-can text-[10px]"></i>
            </button>
        `;
        itemEl.querySelector('.btn-delete-saved-word')?.addEventListener('click', () => deleteSavedToeicWord(idx));
        listContainer.appendChild(itemEl);
    });
}

export async function openSrsReviewModal(): Promise<void> {
    const dueWords = getDueSrsWords();
    const allWords = globalState.toeicSavedWords || [];

    if (allWords.length === 0) {
        showToast("Bạn chưa lưu từ vựng nào để ôn tập.", "warn");
        return;
    }

    srsReviewQueue = dueWords.length > 0 ? dueWords : [...allWords].sort(() => Math.random() - 0.5);
    srsCurrentIndex = 0;
    isSrsCardFlipped = false;

    const modal = await ensureModalElement('srs-review-modal');
    if (modal) {
        modal.classList.remove('hidden');
        renderSrsCurrentCard();
    }
}

export function closeSrsReviewModal(): void {
    const modal = document.getElementById('srs-review-modal');
    if (modal) modal.classList.add('hidden');
    updateToeicNotebookUI();
}

export function renderSrsCurrentCard(): void {
    if (srsCurrentIndex >= srsReviewQueue.length) {
        showToast("Chúc mừng! Bạn đã hoàn thành tất cả từ vựng cần ôn hôm nay 🎉", "success");
        closeSrsReviewModal();
        return;
    }

    const item = srsReviewQueue[srsCurrentIndex];
    const total = srsReviewQueue.length;

    const counterEl = document.getElementById('srs-progress-counter');
    const posEl = document.getElementById('srs-card-pos');
    const wordEl = document.getElementById('srs-card-word');
    const phoneticEl = document.getElementById('srs-card-phonetic');
    const meaningEl = document.getElementById('srs-card-meaning');
    const exampleEl = document.getElementById('srs-card-example');

    if (counterEl) counterEl.textContent = `${srsCurrentIndex + 1} / ${total}`;
    if (posEl) posEl.textContent = item.pos || 'word';
    if (wordEl) wordEl.textContent = item.word || '';
    if (phoneticEl) phoneticEl.textContent = item.phonetic || '';
    if (meaningEl) meaningEl.textContent = item.vietnamese || '';
    if (exampleEl) exampleEl.textContent = item.toeic_example ? `"${item.toeic_example}"` : 'Không có ví dụ.';

    isSrsCardFlipped = false;
    const cardInner = document.getElementById('srs-card-inner');
    const cardFront = document.getElementById('srs-card-front');
    const cardBack = document.getElementById('srs-card-back');
    const ratingActions = document.getElementById('srs-rating-actions');
    const flipPrompt = document.getElementById('srs-flip-prompt');

    if (cardInner) cardInner.classList.remove('srs-card-flipped');
    if (cardFront) cardFront.classList.remove('hidden');
    if (cardBack) cardBack.classList.add('hidden');
    if (ratingActions) ratingActions.classList.add('hidden');
    if (flipPrompt) flipPrompt.classList.remove('hidden');

    const currentInterval = item.intervalDays || 1;
    const ease = item.easeFactor || 2.5;
    const nextGood = Math.round(currentInterval * ease);
    const nextEasy = Math.round(currentInterval * ease * 1.5);

    const lblGood = document.getElementById('srs-lbl-good-interval');
    const lblEasy = document.getElementById('srs-lbl-easy-interval');
    if (lblGood) lblGood.textContent = `Ôn lại ${nextGood} ngày`;
    if (lblEasy) lblEasy.textContent = `Ôn lại ${nextEasy} ngày`;
}

export function flipSrsCard(): void {
    isSrsCardFlipped = !isSrsCardFlipped;
    const cardFront = document.getElementById('srs-card-front');
    const cardBack = document.getElementById('srs-card-back');
    const ratingActions = document.getElementById('srs-rating-actions');
    const flipPrompt = document.getElementById('srs-flip-prompt');

    if (isSrsCardFlipped) {
        if (cardFront) cardFront.classList.add('hidden');
        if (cardBack) cardBack.classList.remove('hidden');
        if (ratingActions) ratingActions.classList.remove('hidden');
        if (flipPrompt) flipPrompt.classList.add('hidden');
    } else {
        if (cardFront) cardFront.classList.remove('hidden');
        if (cardBack) cardBack.classList.add('hidden');
        if (ratingActions) ratingActions.classList.add('hidden');
        if (flipPrompt) flipPrompt.classList.remove('hidden');
    }
}

export function speakSrsCurrentWord(): void {
    if (srsCurrentIndex < srsReviewQueue.length) {
        const item = srsReviewQueue[srsCurrentIndex];
        if (item && item.word) {
            speakText(item.word);
        }
    }
}

export async function submitSrsReview(quality: number): Promise<void> {
    if (srsCurrentIndex >= srsReviewQueue.length) return;

    const item = srsReviewQueue[srsCurrentIndex];
    let ease = item.easeFactor || 2.5;
    let interval = item.intervalDays || 1;
    let level = item.srsLevel || 0;
    let reviewCount = (item.reviewCount || 0) + 1;

    if (quality < 3) {
        level = 1;
        interval = 1;
    } else {
        level += (quality === 5 ? 2 : 1);
        if (interval === 1) {
            interval = 3;
        } else if (interval === 3) {
            interval = 6;
        } else {
            interval = Math.round(interval * ease * (quality === 5 ? 1.4 : 1.0));
        }

        ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
        if (ease < 1.3) ease = 1.3;
    }

    item.srsLevel = level;
    item.easeFactor = ease;
    item.intervalDays = interval;
    item.nextReviewDate = Date.now() + (interval * 24 * 60 * 60 * 1000);
    item.reviewCount = reviewCount;

    const targetIdx = globalState.toeicSavedWords.findIndex(w => w.word.toLowerCase() === item.word.toLowerCase());
    if (targetIdx !== -1) {
        globalState.toeicSavedWords[targetIdx] = item;
    }

    await saveToeicWordsToDB(globalState.toeicSavedWords);
    srsCurrentIndex++;
    renderSrsCurrentCard();

    persistToeicWordsToStorage(globalState.toeicSavedWords);
}

export async function deleteSavedToeicWord(index: number): Promise<void> {
    if (index < 0 || index >= globalState.toeicSavedWords.length) return;
    const word = globalState.toeicSavedWords[index].word;
    globalState.toeicSavedWords.splice(index, 1);

    await saveToeicWordsToDB(globalState.toeicSavedWords);
    updateToeicNotebookUI();

    if (globalState.activeBlockToeicAnalysis) {
        displayToeicAnalysis(globalState.activeBlockToeicAnalysis.analysis);
    }

    showToast(`Đã xóa từ "${word}" khỏi sổ tay.`, "info");

    persistToeicWordsToStorage(globalState.toeicSavedWords);
}

export function exportToeicWordsToAnki(): void {
    const savedWords = globalState.toeicSavedWords || [];
    if (savedWords.length === 0) {
        showToast("Không có từ vựng nào trong sổ tay để xuất.", "warn");
        return;
    }

    let csvContent = "Front\tBack\n";

    savedWords.forEach(item => {
        const front = `${item.word} (${item.pos}) ${item.phonetic ? `[${item.phonetic}]` : ''}`;
        const back = `<b>Nghĩa:</b> ${item.vietnamese}<br><br><i>Ví dụ:</i> ${item.toeic_example || 'N/A'}`;
        const cleanFront = front.replace(/"/g, '""');
        const cleanBack = back.replace(/"/g, '""');
        csvContent += `"${cleanFront}"\t"${cleanBack}"\n`;
    });

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `anki_toeic_words_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Đã tải xuống tệp Anki CSV thành công!", "success");
}

export function speakText(text: string, lang: string = 'en-US'): void {
    if (!window.speechSynthesis) {
        showToast("Trình duyệt không hỗ trợ phát âm (Text-to-Speech).", "error");
        return;
    }
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.85;

    utterance.onerror = (e) => {
        console.error("Lỗi phát âm:", e);
    };

    window.speechSynthesis.speak(utterance);
}

export function setToeicMode(mode: 'learn' | 'recall'): void {
    globalState.toeicMode = mode;

    if (mode === 'learn') {
        if (elements.btnToeicModeLearn) elements.btnToeicModeLearn.className = "flex-1 py-1.5 text-[11px] font-bold rounded bg-indigo-600 text-white transition-all";
        if (elements.btnToeicModeRecall) elements.btnToeicModeRecall.className = "flex-1 py-1.5 text-[11px] font-bold rounded text-slate-400 hover:text-slate-200 transition-all";

        if (elements.toeicLearnModeContent) elements.toeicLearnModeContent.classList.remove('hidden');
        if (elements.toeicRecallContainer) elements.toeicRecallContainer.classList.add('hidden');
    } else if (mode === 'recall') {
        if (elements.btnToeicModeLearn) elements.btnToeicModeLearn.className = "flex-1 py-1.5 text-[11px] font-bold rounded text-slate-400 hover:text-slate-200 transition-all";
        if (elements.btnToeicModeRecall) elements.btnToeicModeRecall.className = "flex-1 py-1.5 text-[11px] font-bold rounded bg-indigo-600 text-white transition-all";

        if (elements.toeicLearnModeContent) elements.toeicLearnModeContent.classList.add('hidden');
        if (elements.toeicRecallContainer) elements.toeicRecallContainer.classList.remove('hidden');

        if (globalState.activePageIndex !== -1 && globalState.selectedBlockId !== null) {
            const page = globalState.pages[globalState.activePageIndex];
            const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
            if (block && elements.toeicRecallVietnamese) {
                elements.toeicRecallVietnamese.textContent = (block.translated || "").trim() || "(Khung thoại chưa được dịch sang tiếng Việt)";
            }
        }

        if (elements.toeicRecallInput) elements.toeicRecallInput.value = '';
        if (elements.toeicRecallResult) elements.toeicRecallResult.classList.add('hidden');
    }
}

export function showToeicRecallHint(): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block || !block.original) {
        showToast("Không tìm thấy câu tiếng Anh gốc để gợi ý.", "warn");
        return;
    }

    const words = block.original.trim().split(/\s+/);
    if (words.length === 0) return;

    const hintWords = words.map((word, idx) => {
        if (idx === 0) return word;

        const cleanWord = word.replace(/^[.,\/#!$%\^&\*;:{}=\-_`~()?"]+|[.,\/#!$%\^&\*;:{}=\-_`~()?"]+$/g, "");
        if (cleanWord.length <= 1) return word;

        const charStart = word.indexOf(cleanWord[0]);
        const prefix = word.substring(0, charStart);
        const suffix = word.substring(charStart + cleanWord.length);
        const underscored = cleanWord[0] + '_'.repeat(cleanWord.length - 1);

        return prefix + underscored + suffix;
    });

    showToast(`Gợi ý: "${hintWords.join(' ')}" (${words.length} từ)`, "info", 6000);
}

export function checkToeicRecall(): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;

    const page = globalState.pages[globalState.activePageIndex];
    const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block) return;

    const correctText = (block.original || "").trim();
    if (!correctText) {
        showToast("Không tìm thấy câu gốc tiếng Anh để đối chiếu.", "warn");
        return;
    }

    const userInput = (elements.toeicRecallInput?.value || "").trim();
    if (!userInput) {
        showToast("Vui lòng nhập câu dịch tiếng Anh của bạn trước khi kiểm tra.", "warn");
        return;
    }

    const resultContainer = elements.toeicRecallResult;
    const statusAlert = document.getElementById('toeic-recall-status-alert');
    const userPhrase = document.getElementById('toeic-recall-user-phrase');
    const correctPhrase = document.getElementById('toeic-recall-correct-phrase');
    const comparisonDiff = document.getElementById('toeic-recall-comparison-diff');

    if (!resultContainer) return;

    resultContainer.classList.remove('hidden');
    if (userPhrase) userPhrase.textContent = userInput;
    if (correctPhrase) correctPhrase.textContent = correctText;

    const diffResult = getSimpleWordDiff(userInput, correctText);
    if (comparisonDiff) comparisonDiff.innerHTML = diffResult.html;

    if (statusAlert) {
        statusAlert.className = 'text-xs font-bold flex items-center gap-1.5';

        if (diffResult.accuracy === 100) {
            statusAlert.classList.add('text-emerald-400');
            statusAlert.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400 animate-bounce"></i> Hoàn hảo! Bạn đã gõ chính xác 100% câu thoại gốc.';
            showToast("Chính xác 100%! Bạn làm rất tốt.", "success");
        } else if (diffResult.accuracy >= 75) {
            statusAlert.classList.add('text-indigo-400');
            statusAlert.innerHTML = `<i class="fa-solid fa-circle-info text-indigo-400"></i> Gần chính xác! Độ khớp đạt ${diffResult.accuracy}%.`;
            showToast(`Khớp ${diffResult.accuracy}%. Hãy xem lại các từ gạch đỏ.`, "info");
        } else {
            statusAlert.classList.add('text-red-400');
            statusAlert.innerHTML = `<i class="fa-solid fa-circle-xmark text-red-400"></i> Chưa chính xác. Độ khớp đạt ${diffResult.accuracy}%.`;
            showToast("Độ khớp thấp, hãy xem đáp án đúng bên dưới.", "warn");
        }
    }
}

export function getSimpleWordDiff(userText: string, correctText: string): { html: string; accuracy: number } {
    const clean = (str: string) => str.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"]/g, "").split(/\s+/).filter(Boolean);
    const userWords = clean(userText);
    const correctWords = clean(correctText);

    let html = '<span class="text-slate-400 block text-[9px] uppercase font-bold tracking-wider mb-1.5">So sánh chi tiết các từ:</span>';
    const rawCorrectWords = correctText.split(/\s+/);
    let matchedCount = 0;

    const comparisonHTML = rawCorrectWords.map(rawWord => {
        const cleanWord = rawWord.toLowerCase().replace(/^[.,\/#!$%\^&\*;:{}=\-_`~()?"]+|[.,\/#!$%\^&\*;:{}=\-_`~()?"]+$/g, "");
        if (!cleanWord) return rawWord;

        const index = userWords.indexOf(cleanWord);
        if (index !== -1) {
            userWords.splice(index, 1);
            matchedCount++;
            return `<span class="text-emerald-400">${escapeHTML(rawWord)}</span>`;
        } else {
            return `<span class="text-red-400 line-through decoration-red-500/50">${escapeHTML(rawWord)}</span>`;
        }
    }).join(' ');

    const accuracy = correctWords.length > 0 ? Math.round((matchedCount / correctWords.length) * 100) : 0;
    return {
        html: html + `<div class="p-2.5 rounded bg-slate-900 leading-relaxed font-semibold font-mono">${comparisonHTML}</div>`,
        accuracy
    };
}

export function speakCorrectRecallSentence(): void {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page?.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block && block.original) {
        speakText(block.original);
    }
}

export function selectToeicQuestion(index: number): void {
    globalState.activeToeicQuestionIndex = index;

    for (let i = 0; i < 3; i++) {
        const btn = document.getElementById(`btn-question-tab-${i}`);
        if (btn) {
            if (i === index) {
                btn.className = "flex-1 py-1 text-[9px] font-bold rounded bg-indigo-600 text-white transition-all text-center";
            } else {
                btn.className = "flex-1 py-1 text-[9px] font-bold rounded text-slate-400 hover:text-slate-200 transition-all text-center bg-slate-950 border border-slate-800";
            }
        }
    }

    if (globalState.activeBlockToeicAnalysis && globalState.activeBlockToeicAnalysis.analysis) {
        const pqs = globalState.activeBlockToeicAnalysis.analysis.practice_questions ||
            (globalState.activeBlockToeicAnalysis.analysis.practice_question ? [globalState.activeBlockToeicAnalysis.analysis.practice_question] : []);
        renderActiveToeicQuestion(pqs, index);
    }
}

export function renderActiveToeicQuestion(pqs: any[], index: number): void {
    const pq = pqs[index];
    if (!pq) return;

    if (elements.toeicQuestionText) elements.toeicQuestionText.textContent = pq.question || '';
    if (elements.toeicQuestionOptions) elements.toeicQuestionOptions.innerHTML = '';

    if (elements.toeicQuestionFeedback) {
        elements.toeicQuestionFeedback.classList.add('hidden');
        elements.toeicQuestionFeedback.innerHTML = '';
    }

    if (elements.toeicQuestionType) {
        elements.toeicQuestionType.textContent = pq.type || 'Part 5';
        if (pq.type && pq.type.includes('Part 7')) {
            elements.toeicQuestionType.className = "px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[9px] font-bold uppercase tracking-wider";
        } else if (pq.type && pq.type.includes('Từ vựng')) {
            elements.toeicQuestionType.className = "px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase tracking-wider";
        } else {
            elements.toeicQuestionType.className = "px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-bold uppercase tracking-wider";
        }
    }

    if (elements.btnSpeakQuestion) {
        elements.btnSpeakQuestion.onclick = () => speakText(pq.question);
    }

    const options = pq.options || [];
    options.forEach((opt: string) => {
        const match = opt.match(/^\(?([A-D])\)?/);
        const letter = match ? match[1] : '';

        const btn = document.createElement('button');
        btn.className = 'w-full text-left p-2 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 transition-all block';
        btn.textContent = opt;

        btn.addEventListener('click', () => {
            checkToeicAnswer(letter, pq.correct_answer || '', pq.explanation || '');
        });
        elements.toeicQuestionOptions?.appendChild(btn);
    });
}

function getDueSrsWords(): ToeicWord[] {
    const now = Date.now();
    return (globalState.toeicSavedWords || []).filter(item => {
        if (!item.nextReviewDate) return true;
        return item.nextReviewDate <= now;
    });
}

if (typeof window !== 'undefined') {
    (window as any).quickOpenToeicAnalysis = quickOpenToeicAnalysis;
    (window as any).updateToeicTabUI = updateToeicTabUI;
    (window as any).resetToeicAnalysisUI = resetToeicAnalysisUI;
    (window as any).displayToeicAnalysis = displayToeicAnalysis;
    (window as any).checkToeicAnswer = checkToeicAnswer;
    (window as any).analyzeBlockForToeic = analyzeBlockForToeic;
    (window as any).toggleSaveToeicWordByIndex = toggleSaveToeicWordByIndex;
    (window as any).updateToeicNotebookUI = updateToeicNotebookUI;
    (window as any).openSrsReviewModal = openSrsReviewModal;
    (window as any).closeSrsReviewModal = closeSrsReviewModal;
    (window as any).flipSrsCard = flipSrsCard;
    (window as any).speakSrsCurrentWord = speakSrsCurrentWord;
    (window as any).submitSrsReview = submitSrsReview;
    (window as any).deleteSavedToeicWord = deleteSavedToeicWord;
    (window as any).exportToeicWordsToAnki = exportToeicWordsToAnki;
    (window as any).speakText = speakText;
    (window as any).setToeicMode = setToeicMode;
    (window as any).showToeicRecallHint = showToeicRecallHint;
    (window as any).checkToeicRecall = checkToeicRecall;
    (window as any).speakCorrectRecallSentence = speakCorrectRecallSentence;
    (window as any).selectToeicQuestion = selectToeicQuestion;
    (window as any).renderActiveToeicQuestion = renderActiveToeicQuestion;
}
