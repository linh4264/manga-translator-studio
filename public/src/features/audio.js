// Manga Audio Drama Generator & Advanced Speech Synthesis Engine
import { globalState } from '../core/state.js';
import { showToast, escapeHTML } from '../core/utils.js';
import { elements } from '../core/elements.js';

let audioState = {
    isPlaying: false,
    isPaused: false,
    currentBlockIndex: 0,
    blocksQueue: [],
    pageId: null
};

let synthesis = window.speechSynthesis;
let currentUtterance = null;
let cachedVoices = [];

// Initialize default audio settings in globalState if not present
if (!globalState.audioSettings) {
    globalState.audioSettings = {
        maleVoiceURI: '',
        femaleVoiceURI: '',
        narratorVoiceURI: '',
        rate: 1.0,
        malePitch: 0.92,
        femalePitch: 1.08,
        narratorPitch: 1.0
    };
}

// Automatically distribute 3 distinct voice URIs if not explicitly chosen by user
export function autoAssign3DistinctVoices() {
    if (!synthesis) return;
    cachedVoices = synthesis.getVoices() || [];
    if (cachedVoices.length === 0) return;

    const currentLang = globalState.targetLanguage || 'vi';
    const langPrefix = currentLang === 'vi' ? 'vi' : (currentLang === 'en' ? 'en' : 'ja');

    let matched = cachedVoices.filter(v => v.lang.toLowerCase().startsWith(langPrefix));
    if (matched.length === 0) matched = cachedVoices;

    // Pick 3 distinct voices if available
    if (matched.length >= 3) {
        if (!globalState.audioSettings.maleVoiceURI) globalState.audioSettings.maleVoiceURI = matched[0].voiceURI;
        if (!globalState.audioSettings.femaleVoiceURI) globalState.audioSettings.femaleVoiceURI = matched[1].voiceURI;
        if (!globalState.audioSettings.narratorVoiceURI) globalState.audioSettings.narratorVoiceURI = matched[2].voiceURI;
    } else if (matched.length === 2) {
        if (!globalState.audioSettings.maleVoiceURI) globalState.audioSettings.maleVoiceURI = matched[0].voiceURI;
        if (!globalState.audioSettings.femaleVoiceURI) globalState.audioSettings.femaleVoiceURI = matched[1].voiceURI;
        if (!globalState.audioSettings.narratorVoiceURI) globalState.audioSettings.narratorVoiceURI = matched[0].voiceURI;
    } else if (matched.length === 1) {
        if (!globalState.audioSettings.maleVoiceURI) globalState.audioSettings.maleVoiceURI = matched[0].voiceURI;
        if (!globalState.audioSettings.femaleVoiceURI) globalState.audioSettings.femaleVoiceURI = matched[0].voiceURI;
        if (!globalState.audioSettings.narratorVoiceURI) globalState.audioSettings.narratorVoiceURI = matched[0].voiceURI;
    }
}

// Load and populate system TTS voices
export function populateVoiceSelectorsUI() {
    if (!synthesis) return;
    cachedVoices = synthesis.getVoices() || [];
    autoAssign3DistinctVoices();

    const maleSelect = document.getElementById('voice-select-male');
    const femaleSelect = document.getElementById('voice-select-female');
    const narratorSelect = document.getElementById('voice-select-narrator');
    const malePitchInp = document.getElementById('audio-male-pitch-input');
    const femalePitchInp = document.getElementById('audio-female-pitch-input');
    const rateInp = document.getElementById('audio-rate-input');

    if (!maleSelect && !femaleSelect && !narratorSelect) return;

    const currentLang = globalState.targetLanguage || 'vi';
    const langPrefix = currentLang === 'vi' ? 'vi' : (currentLang === 'en' ? 'en' : 'ja');

    const generateOptionsHTML = (selectedURI) => {
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

    if (maleSelect) maleSelect.innerHTML = generateOptionsHTML(globalState.audioSettings.maleVoiceURI);
    if (femaleSelect) femaleSelect.innerHTML = generateOptionsHTML(globalState.audioSettings.femaleVoiceURI);
    if (narratorSelect) narratorSelect.innerHTML = generateOptionsHTML(globalState.audioSettings.narratorVoiceURI);

    if (malePitchInp) malePitchInp.value = globalState.audioSettings.malePitch || 0.92;
    if (femalePitchInp) femalePitchInp.value = globalState.audioSettings.femalePitch || 1.08;
    if (rateInp) rateInp.value = globalState.audioSettings.rate || 1.0;
}

if (synthesis) {
    synthesis.onvoiceschanged = () => {
        populateVoiceSelectorsUI();
    };
}

// Get preferred voice object for a given gender
function getVoiceForGender(gender = 'neutral') {
    if (!synthesis) return null;
    const voices = synthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    let targetURI = '';
    if (gender === 'male') targetURI = globalState.audioSettings.maleVoiceURI;
    else if (gender === 'female') targetURI = globalState.audioSettings.femaleVoiceURI;
    else targetURI = globalState.audioSettings.narratorVoiceURI;

    if (targetURI) {
        const found = voices.find(v => v.voiceURI === targetURI);
        if (found) return found;
    }

    const currentLang = globalState.targetLanguage || 'vi';
    const langPrefix = currentLang === 'vi' ? 'vi' : (currentLang === 'en' ? 'en' : 'ja');
    const matched = voices.filter(v => v.lang.toLowerCase().startsWith(langPrefix));
    
    if (matched.length > 0) {
        if (gender === 'female' && matched.length >= 2) return matched[1];
        if (gender === 'neutral' && matched.length >= 3) return matched[2];
        return matched[0];
    }
    return voices[0];
}

// Determine character gender for a block from block style, Character Dossier, or auto-alternating dialogue index
function getCharacterGenderForBlock(block, indexInPage = 0) {
    if (!block) return 'neutral';

    // 1. Explicit block gender override set by user
    if (block.style && block.style.gender) {
        return block.style.gender;
    }

    // 2. Match with Character Dossier
    if (globalState.characterDossier && globalState.characterDossier.length > 0) {
        const origText = (block.original || '').toLowerCase();
        const transText = (block.translated || '').toLowerCase();
        const speakerName = (block.speaker || '').toLowerCase();

        for (const char of globalState.characterDossier) {
            const origName = (char.originalName || '').toLowerCase();
            const transName = (char.translatedName || '').toLowerCase();
            if ((origName && (origText.includes(origName) || speakerName.includes(origName))) ||
                (transName && (transText.includes(transName) || speakerName.includes(transName)))) {
                return char.gender || 'neutral';
            }
        }
    }

    // 3. Dialogue fallback: Auto-alternate between Male and Female voices for speech bubbles
    if (!block.type || block.type === 'dialogue') {
        return indexInPage % 2 === 0 ? 'male' : 'female';
    }

    return 'neutral';
}

// Highlight the block currently being spoken on canvas
function setSpeakingHighlight(blockId) {
    const overlays = document.querySelectorAll('.bubble-overlay');
    overlays.forEach(el => {
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

function clearSpeakingHighlights() {
    const overlays = document.querySelectorAll('.bubble-overlay');
    overlays.forEach(el => {
        el.classList.remove('speaking-highlight');
        if (el.id !== globalState.selectedBlockId) {
            el.style.boxShadow = '';
            el.style.borderColor = '';
        }
    });
}

// Sort blocks in manga reading order (Top-Right to Bottom-Left for vertical/JP, or Top to Bottom)
function getSortedBlocksForPage(page) {
    if (!page || !page.blocks || page.blocks.length === 0) return [];
    
    return [...page.blocks].sort((a, b) => {
        const yDiff = a.box.y - b.box.y;
        if (Math.abs(yDiff) > 8) {
            return yDiff;
        }
        return b.box.x - a.box.x;
    });
}

export function playNextBlockInQueue() {
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

    currentUtterance = new SpeechSynthesisUtterance(textToSpeak);
    currentUtterance.lang = globalState.targetLanguage === 'vi' ? 'vi-VN' : 'en-US';
    
    // Pitch & Speed modulation for natural voice simulation
    const baseRate = globalState.audioSettings.rate || 1.0;
    if (gender === 'female') {
        currentUtterance.pitch = globalState.audioSettings.femalePitch || 1.08;
        currentUtterance.rate = baseRate * 1.02;
    } else if (gender === 'male') {
        currentUtterance.pitch = globalState.audioSettings.malePitch || 0.92;
        currentUtterance.rate = baseRate * 0.98;
    } else {
        currentUtterance.pitch = globalState.audioSettings.narratorPitch || 1.0;
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

export function playPageAudioDrama() {
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

export function pauseAudioDrama() {
    if (audioState.isPlaying && !audioState.isPaused) {
        audioState.isPaused = true;
        if (synthesis) synthesis.pause();
        updateAudioControlsUI();
        showToast("⏸️ Đã tạm dừng phát Audio Drama.", "info");
    }
}

export function stopAudioDrama() {
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

export function speakActiveBlock() {
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
    utterance.lang = globalState.targetLanguage === 'vi' ? 'vi-VN' : 'en-US';

    const baseRate = globalState.audioSettings.rate || 1.0;
    if (gender === 'female') {
        utterance.pitch = globalState.audioSettings.femalePitch || 1.08;
        utterance.rate = baseRate * 1.02;
    } else if (gender === 'male') {
        utterance.pitch = globalState.audioSettings.malePitch || 0.92;
        utterance.rate = baseRate * 0.98;
    } else {
        utterance.pitch = globalState.audioSettings.narratorPitch || 1.0;
        utterance.rate = baseRate;
    }

    const voice = getVoiceForGender(gender);
    if (voice) utterance.voice = voice;

    utterance.onend = () => clearSpeakingHighlights();
    utterance.onerror = () => clearSpeakingHighlights();

    synthesis.speak(utterance);
    showToast(`🔊 Đang đọc ô thoại: "${block.translated.slice(0, 25)}..."`, "info");
}

export function testVoice(gender = 'neutral') {
    if (!synthesis) return;
    synthesis.cancel();

    const sampleText = gender === 'female' 
        ? "Xin chào, đây là giọng đọc Nữ cho kịch truyền thanh manga!" 
        : (gender === 'male' ? "Xin chào, đây là giọng đọc Nam cho kịch truyền thanh manga!" : "Xin chào, đây là giọng đọc Người dẫn chuyện.");

    const utterance = new SpeechSynthesisUtterance(sampleText);
    utterance.lang = globalState.targetLanguage === 'vi' ? 'vi-VN' : 'en-US';

    const baseRate = globalState.audioSettings.rate || 1.0;
    if (gender === 'female') {
        utterance.pitch = globalState.audioSettings.femalePitch || 1.08;
        utterance.rate = baseRate * 1.02;
    } else if (gender === 'male') {
        utterance.pitch = globalState.audioSettings.malePitch || 0.92;
        utterance.rate = baseRate * 0.98;
    }

    const voice = getVoiceForGender(gender);
    if (voice) utterance.voice = voice;

    synthesis.speak(utterance);
}

export function saveAudioSettings() {
    localStorage.setItem('gemini_manga_audio_settings', JSON.stringify(globalState.audioSettings));
}

export function updateAudioSettingsFromUI() {
    const maleSelect = document.getElementById('voice-select-male');
    const femaleSelect = document.getElementById('voice-select-female');
    const narratorSelect = document.getElementById('voice-select-narrator');
    const rateInput = document.getElementById('audio-rate-input');
    const malePitchInput = document.getElementById('audio-male-pitch-input');
    const femalePitchInput = document.getElementById('audio-female-pitch-input');

    if (maleSelect) globalState.audioSettings.maleVoiceURI = maleSelect.value;
    if (femaleSelect) globalState.audioSettings.femaleVoiceURI = femaleSelect.value;
    if (narratorSelect) globalState.audioSettings.narratorVoiceURI = narratorSelect.value;
    if (rateInput) globalState.audioSettings.rate = parseFloat(rateInput.value) || 1.0;
    if (malePitchInput) globalState.audioSettings.malePitch = parseFloat(malePitchInput.value) || 0.92;
    if (femalePitchInput) globalState.audioSettings.femalePitch = parseFloat(femalePitchInput.value) || 1.08;
    
    saveAudioSettings();
}

import { ensureModalElement } from '../core/component-loader.js';

export async function openAudioSettingsModal() {
    const modal = await ensureModalElement('audio-settings-modal');
    if (modal) {
        populateVoiceSelectorsUI();
        modal.classList.remove('hidden');
    }
}

export function closeAudioSettingsModal() {
    const modal = document.getElementById('audio-settings-modal');
    if (modal) modal.classList.add('hidden');
}

function updateAudioControlsUI() {
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

// Window bindings
window.playPageAudioDrama = playPageAudioDrama;
window.pauseAudioDrama = pauseAudioDrama;
window.stopAudioDrama = stopAudioDrama;
window.speakActiveBlock = speakActiveBlock;
window.testVoice = testVoice;
window.openAudioSettingsModal = openAudioSettingsModal;
window.closeAudioSettingsModal = closeAudioSettingsModal;
window.updateAudioSettingsFromUI = updateAudioSettingsFromUI;
