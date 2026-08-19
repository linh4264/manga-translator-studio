// Manga Audio Drama Generator & Advanced Speech Synthesis Engine
import { globalState } from '../core/state';
import { showToast, escapeHTML } from '../core/utils';
import { safeSetLocalStorage } from '../core/utils/storage';
import { ensureModalElement } from '../core/component-loader';
import { MangaBlock, MangaPage, AudioSettings } from '../types/index';
import { getCharacterDossier } from './dossier-lorebook';
import { getTranslationContext } from './ai/ai-state';

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
    maleVoiceURI: '',
    femaleVoiceURI: '',
    narratorVoiceURI: '',
    rate: 1.0,
    malePitch: 0.92,
    femalePitch: 1.08,
    narratorPitch: 1.0
};

export function getAudioSettings(): AudioSettings {
    if (!globalState.audioSettings) {
        globalState.audioSettings = { ...DEFAULT_AUDIO_SETTINGS };
    }
    return globalState.audioSettings;
}

export function setAudioSettings(settings: Partial<AudioSettings>): AudioSettings {
    const current = getAudioSettings();
    globalState.audioSettings = { ...current, ...settings };
    safeSetLocalStorage('gemini_manga_audio_settings', globalState.audioSettings);
    return globalState.audioSettings;
}

interface AudioState {
    isPlaying: boolean;
    isPaused: boolean;
    currentBlockIndex: number;
    blocksQueue: MangaBlock[];
    pageId: string | null;
}

let audioState: AudioState = {
    isPlaying: false,
    isPaused: false,
    currentBlockIndex: 0,
    blocksQueue: [],
    pageId: null
};

let synthesis: SpeechSynthesis | undefined = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let cachedVoices: SpeechSynthesisVoice[] = [];

export function autoAssign3DistinctVoices(): void {
    if (!synthesis) return;
    cachedVoices = synthesis.getVoices() || [];
    if (cachedVoices.length === 0) return;

    const currentLang = getTranslationContext().targetLanguage || 'vi';
    const langPrefix = currentLang === 'vi' ? 'vi' : (currentLang === 'en' ? 'en' : 'ja');

    let matched = cachedVoices.filter(v => v.lang.toLowerCase().startsWith(langPrefix));
    if (matched.length === 0) matched = cachedVoices;

    const settings = getAudioSettings();
    if (matched.length >= 3) {
        if (!settings.maleVoiceURI) settings.maleVoiceURI = matched[0].voiceURI;
        if (!settings.femaleVoiceURI) settings.femaleVoiceURI = matched[1].voiceURI;
        if (!settings.narratorVoiceURI) settings.narratorVoiceURI = matched[2].voiceURI;
    } else if (matched.length === 2) {
        if (!settings.maleVoiceURI) settings.maleVoiceURI = matched[0].voiceURI;
        if (!settings.femaleVoiceURI) settings.femaleVoiceURI = matched[1].voiceURI;
        if (!settings.narratorVoiceURI) settings.narratorVoiceURI = matched[0].voiceURI;
    } else if (matched.length === 1) {
        if (!settings.maleVoiceURI) settings.maleVoiceURI = matched[0].voiceURI;
        if (!settings.femaleVoiceURI) settings.femaleVoiceURI = matched[0].voiceURI;
        if (!settings.narratorVoiceURI) settings.narratorVoiceURI = matched[0].voiceURI;
    }
}

export function populateVoiceSelectorsUI(): void {
    if (!synthesis) return;
    cachedVoices = synthesis.getVoices() || [];
    autoAssign3DistinctVoices();

    const maleSelect = document.getElementById('voice-select-male') as HTMLSelectElement | null;
    const femaleSelect = document.getElementById('voice-select-female') as HTMLSelectElement | null;
    const narratorSelect = document.getElementById('voice-select-narrator') as HTMLSelectElement | null;
    const malePitchInp = document.getElementById('audio-male-pitch-input') as HTMLInputElement | null;
    const femalePitchInp = document.getElementById('audio-female-pitch-input') as HTMLInputElement | null;
    const rateInp = document.getElementById('audio-rate-input') as HTMLInputElement | null;

    if (!maleSelect && !femaleSelect && !narratorSelect) return;

    const currentLang = getTranslationContext().targetLanguage || 'vi';
    const langPrefix = currentLang === 'vi' ? 'vi' : (currentLang === 'en' ? 'en' : 'ja');
    const settings = getAudioSettings();

    const generateOptionsHTML = (selectedURI?: string) => {
        if (cachedVoices.length === 0) {
            return `<option value="">(Không tìm thấy giọng đọc nào trên máy)</option>`;
        }

        const matchedLangVoices = cachedVoices.filter(v => v.lang.toLowerCase().startsWith(langPrefix));
        const otherVoices = cachedVoices.filter(v => !v.lang.toLowerCase().startsWith(langPrefix));

        let html = '';
        if (matchedLangVoices.length > 0) {
            html += `<optgroup label="Giọng đọc ${currentLang.toUpperCase()}">`;
            html += matchedLangVoices.map(v => `<option value="${escapeHTML(v.voiceURI)}" ${v.voiceURI === selectedURI ? 'selected' : ''}>${escapeHTML(v.name)} (${v.lang})</option>`).join('');
            html += `</optgroup>`;
        }
        if (otherVoices.length > 0) {
            html += `<optgroup label="Tất cả giọng đọc hệ thống khác">`;
            html += otherVoices.map(v => `<option value="${escapeHTML(v.voiceURI)}" ${v.voiceURI === selectedURI ? 'selected' : ''}>${escapeHTML(v.name)} (${v.lang})</option>`).join('');
            html += `</optgroup>`;
        }
        return html;
    };

    if (maleSelect) maleSelect.innerHTML = generateOptionsHTML(settings.maleVoiceURI);
    if (femaleSelect) femaleSelect.innerHTML = generateOptionsHTML(settings.femaleVoiceURI);
    if (narratorSelect) narratorSelect.innerHTML = generateOptionsHTML(settings.narratorVoiceURI);

    if (malePitchInp) malePitchInp.value = String(settings.malePitch || 0.92);
    if (femalePitchInp) femalePitchInp.value = String(settings.femalePitch || 1.08);
    if (rateInp) rateInp.value = String(settings.rate || 1.0);
}

if (synthesis) {
    synthesis.onvoiceschanged = () => {
        populateVoiceSelectorsUI();
    };
}

function getVoiceForGender(gender: string = 'neutral'): SpeechSynthesisVoice | null {
    if (!synthesis) return null;
    const voices = synthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const settings = getAudioSettings();
    let targetURI = '';
    if (gender === 'male') targetURI = settings.maleVoiceURI || '';
    else if (gender === 'female') targetURI = settings.femaleVoiceURI || '';
    else targetURI = settings.narratorVoiceURI || '';

    if (targetURI) {
        const found = voices.find(v => v.voiceURI === targetURI);
        if (found) return found;
    }

    const currentLang = getTranslationContext().targetLanguage || 'vi';
    const langPrefix = currentLang === 'vi' ? 'vi' : (currentLang === 'en' ? 'en' : 'ja');
    const matched = voices.filter(v => v.lang.toLowerCase().startsWith(langPrefix));
    
    if (matched.length > 0) {
        if (gender === 'female' && matched.length >= 2) return matched[1];
        if (gender === 'neutral' && matched.length >= 3) return matched[2];
        return matched[0];
    }
    return voices[0];
}

function getCharacterGenderForBlock(block?: MangaBlock, indexInPage: number = 0): string {
    if (!block) return 'neutral';

    if (block.style && block.style.gender) {
        return block.style.gender;
    }

    const dossier = getCharacterDossier();
    if (dossier.length > 0) {
        const origText = (block.original || '').toLowerCase();
        const transText = (block.translated || '').toLowerCase();
        const speakerName = (block.speaker || '').toLowerCase();

        for (const char of dossier) {
            const origName = (char.originalName || '').toLowerCase();
            const transName = (char.translatedName || '').toLowerCase();
            if ((origName && (origText.includes(origName) || speakerName.includes(origName))) ||
                (transName && (transText.includes(transName) || speakerName.includes(transName)))) {
                return char.gender || 'neutral';
            }
        }
    }

    if (!block.type || block.type === 'dialogue') {
        return indexInPage % 2 === 0 ? 'male' : 'female';
    }

    return 'neutral';
}


function setSpeakingHighlight(blockId: string): void {
    const overlays = document.querySelectorAll('.bubble-overlay');
    overlays.forEach((el: any) => {
        if (el.id === blockId) {
            el.classList.add('speaking-highlight');
            el.style.boxShadow = '0 0 18px 5px rgba(99, 102, 241, 0.95)';
            el.style.borderColor = '#6366f1';
        } else {
            el.classList.remove('speaking-highlight');
            if (el.id !== globalState.selectedBlockId) {
                el.style.boxShadow = '';
                el.style.borderColor = '';
            }
        }
    });
}

function clearSpeakingHighlights(): void {
    const overlays = document.querySelectorAll('.bubble-overlay');
    overlays.forEach((el: any) => {
        el.classList.remove('speaking-highlight');
        if (el.id !== globalState.selectedBlockId) {
            el.style.boxShadow = '';
            el.style.borderColor = '';
        }
    });
}

function getSortedBlocksForPage(page: MangaPage): MangaBlock[] {
    if (!page || !page.blocks || page.blocks.length === 0) return [];
    
    return [...page.blocks].sort((a, b) => {
        const yDiff = a.box.y - b.box.y;
        if (Math.abs(yDiff) > 8) {
            return yDiff;
        }
        return b.box.x - a.box.x;
    });
}

export function playNextBlockInQueue(): void {
    if (!audioState.isPlaying || audioState.isPaused) return;

    if (audioState.currentBlockIndex >= audioState.blocksQueue.length) {
        stopAudioDrama();
        showToast("🎉 Đã hoàn thành phát Audio Drama cho toàn bộ trang truyện!", "success");
        return;
    }

    const block = audioState.blocksQueue[audioState.currentBlockIndex];
    if (!block || !block.translated || !block.translated.trim()) {
        audioState.currentBlockIndex++;
        playNextBlockInQueue();
        return;
    }

    setSpeakingHighlight(block.id);

    const gender = getCharacterGenderForBlock(block, audioState.currentBlockIndex);
    const textToSpeak = block.translated.trim();

    const targetLang = getTranslationContext().targetLanguage || 'vi';
    currentUtterance = new SpeechSynthesisUtterance(textToSpeak);
    currentUtterance.lang = targetLang === 'vi' ? 'vi-VN' : 'en-US';
    
    const settings = getAudioSettings();
    const baseRate = settings.rate || 1.0;
    if (gender === 'female') {
        currentUtterance.pitch = settings.femalePitch || 1.08;
        currentUtterance.rate = baseRate * 1.02;
    } else if (gender === 'male') {
        currentUtterance.pitch = settings.malePitch || 0.92;
        currentUtterance.rate = baseRate * 0.98;
    } else {
        currentUtterance.pitch = settings.narratorPitch || 1.0;
        currentUtterance.rate = baseRate;
    }

    const voice = getVoiceForGender(gender);
    if (voice) {
        currentUtterance.voice = voice;
    }

    currentUtterance.onend = () => {
        audioState.currentBlockIndex++;
        setTimeout(() => playNextBlockInQueue(), 400);
    };

    currentUtterance.onerror = (e) => {
        console.error("Speech Synthesis error:", e);
        audioState.currentBlockIndex++;
        playNextBlockInQueue();
    };

    if (synthesis) {
        synthesis.speak(currentUtterance);
    }
}

export function playPageAudioDrama(): void {
    if (!synthesis) {
        showToast("Trình duyệt của bạn không hỗ trợ tính năng tổng hợp giọng nói Web Speech API.", "warn");
        return;
    }

    if (globalState.activePageIndex === -1 || globalState.pages.length === 0) {
        showToast("Vui lòng chọn hoặc tải trang truyện trước khi phát Audio.", "info");
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    if (!page.blocks || page.blocks.length === 0) {
        showToast("Trang hiện tại chưa có câu thoại nào để phát Audio.", "info");
        return;
    }

    if (audioState.isPaused) {
        audioState.isPaused = false;
        audioState.isPlaying = true;
        updateAudioControlsUI();
        if (synthesis) synthesis.resume();
        return;
    }

    stopAudioDrama();

    audioState.isPlaying = true;
    audioState.isPaused = false;
    audioState.pageId = page.id;
    audioState.blocksQueue = getSortedBlocksForPage(page);
    audioState.currentBlockIndex = 0;

    updateAudioControlsUI();
    showToast(`▶️ Đang phát Audio Drama (${audioState.blocksQueue.length} câu thoại)...`, "info");
    playNextBlockInQueue();
}

export function pauseAudioDrama(): void {
    if (audioState.isPlaying && !audioState.isPaused) {
        audioState.isPaused = true;
        if (synthesis) synthesis.pause();
        updateAudioControlsUI();
        showToast("⏸️ Đã tạm dừng phát Audio Drama.", "info");
    }
}

export function stopAudioDrama(): void {
    audioState.isPlaying = false;
    audioState.isPaused = false;
    audioState.currentBlockIndex = 0;
    audioState.blocksQueue = [];

    if (synthesis) {
        synthesis.cancel();
    }
    clearSpeakingHighlights();
    updateAudioControlsUI();
}

export function speakActiveBlock(): void {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];
    if (!page || !globalState.selectedBlockId) return;

    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (!block || !block.translated || !block.translated.trim()) {
        showToast("Vui lòng nhập bản dịch cho ô thoại trước khi nghe.", "info");
        return;
    }

    if (synthesis) synthesis.cancel();

    setSpeakingHighlight(block.id);
    const gender = getCharacterGenderForBlock(block);
    const utterance = new SpeechSynthesisUtterance(block.translated.trim());
    const targetLang = getTranslationContext().targetLanguage || 'vi';
    utterance.lang = targetLang === 'vi' ? 'vi-VN' : 'en-US';

    const settings = getAudioSettings();
    const baseRate = settings.rate || 1.0;
    if (gender === 'female') {
        utterance.pitch = settings.femalePitch || 1.08;
        utterance.rate = baseRate * 1.02;
    } else if (gender === 'male') {
        utterance.pitch = settings.malePitch || 0.92;
        utterance.rate = baseRate * 0.98;
    } else {
        utterance.pitch = settings.narratorPitch || 1.0;
        utterance.rate = baseRate;
    }

    const voice = getVoiceForGender(gender);
    if (voice) utterance.voice = voice;

    utterance.onend = () => clearSpeakingHighlights();
    utterance.onerror = () => clearSpeakingHighlights();

    synthesis.speak(utterance);
    showToast(`🔊 Đang đọc ô thoại: "${block.translated.slice(0, 25)}..."`, "info");
}

export function testVoice(gender: string = 'neutral'): void {
    if (!synthesis) return;
    synthesis.cancel();

    const sampleText = gender === 'female' 
        ? "Xin chào, đây là giọng đọc Nữ cho kịch truyền thanh manga!" 
        : (gender === 'male' ? "Xin chào, đây là giọng đọc Nam cho kịch truyền thanh manga!" : "Xin chào, đây là giọng đọc Người dẫn chuyện.");

    const utterance = new SpeechSynthesisUtterance(sampleText);
    const targetLang = getTranslationContext().targetLanguage || 'vi';
    utterance.lang = targetLang === 'vi' ? 'vi-VN' : 'en-US';

    const settings = getAudioSettings();
    const baseRate = settings.rate || 1.0;
    if (gender === 'female') {
        utterance.pitch = settings.femalePitch || 1.08;
        utterance.rate = baseRate * 1.02;
    } else if (gender === 'male') {
        utterance.pitch = settings.malePitch || 0.92;
        utterance.rate = baseRate * 0.98;
    }

    const voice = getVoiceForGender(gender);
    if (voice) utterance.voice = voice;

    synthesis.speak(utterance);
}

export function saveAudioSettings(): void {
    safeSetLocalStorage('gemini_manga_audio_settings', getAudioSettings());
}

export function updateAudioSettingsFromUI(): void {
    const maleSelect = document.getElementById('voice-select-male') as HTMLSelectElement | null;
    const femaleSelect = document.getElementById('voice-select-female') as HTMLSelectElement | null;
    const narratorSelect = document.getElementById('voice-select-narrator') as HTMLSelectElement | null;
    const rateInput = document.getElementById('audio-rate-input') as HTMLInputElement | null;
    const malePitchInput = document.getElementById('audio-male-pitch-input') as HTMLInputElement | null;
    const femalePitchInput = document.getElementById('audio-female-pitch-input') as HTMLInputElement | null;

    setAudioSettings({
        maleVoiceURI: maleSelect?.value || '',
        femaleVoiceURI: femaleSelect?.value || '',
        narratorVoiceURI: narratorSelect?.value || '',
        rate: rateInput ? (parseFloat(rateInput.value) || 1.0) : 1.0,
        malePitch: malePitchInput ? (parseFloat(malePitchInput.value) || 0.92) : 0.92,
        femalePitch: femalePitchInput ? (parseFloat(femalePitchInput.value) || 1.08) : 1.08
    });
}


export async function openAudioSettingsModal(): Promise<void> {
    const modal = await ensureModalElement('audio-settings-modal');
    if (modal) {
        populateVoiceSelectorsUI();
        modal.classList.remove('hidden');
    }
}

export function closeAudioSettingsModal(): void {
    const modal = document.getElementById('audio-settings-modal');
    if (modal) modal.classList.add('hidden');
}

function updateAudioControlsUI(): void {
    const btnPlay = document.getElementById('btn-audio-play');
    const btnPause = document.getElementById('btn-audio-pause');
    const btnStop = document.getElementById('btn-audio-stop');

    if (audioState.isPlaying && !audioState.isPaused) {
        if (btnPlay) btnPlay.classList.add('hidden');
        if (btnPause) btnPause.classList.remove('hidden');
        if (btnStop) btnStop.classList.remove('hidden');
    } else if (audioState.isPaused) {
        if (btnPlay) btnPlay.classList.remove('hidden');
        if (btnPause) btnPause.classList.add('hidden');
        if (btnStop) btnStop.classList.remove('hidden');
    } else {
        if (btnPlay) btnPlay.classList.remove('hidden');
        if (btnPause) btnPause.classList.add('hidden');
        if (btnStop) btnStop.classList.add('hidden');
    }
}

