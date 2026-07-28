import { selectPage } from './pages-ui.js';
import { globalState } from '../core/state.js';
import { VALID_MODEL_IDS, CUSTOM_MODEL_VALUE, DEFAULT_MODEL } from '../config/constants.js';
import { elements } from '../core/elements.js';
import { showToast } from '../core/utils.js';

function safeSetLocalStorage(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.warn(`Lỗi lưu localStorage cho key [${key}]:`, e);
    }
}

export function toggleApiKeyVisibility() {
    const eyeBtn = document.getElementById('api-key-eye');
    if (elements.apiKeyInput.type === 'password') {
        elements.apiKeyInput.type = 'text';
        if (eyeBtn) eyeBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
    } else {
        elements.apiKeyInput.type = 'password';
        if (eyeBtn) eyeBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
    }
}

export function updateSelectedModel(val) {
    const customModelInput = elements.customModelInput;
    if (val === CUSTOM_MODEL_VALUE) {
        if (customModelInput) {
            customModelInput.classList.remove('hidden');
            customModelInput.disabled = false;
            const customVal = customModelInput.value.trim();
            if (customVal) {
                globalState.selectedModel = customVal;
                safeSetLocalStorage('gemini_manga_model', customVal);
            }
        }
    } else {
        if (customModelInput) {
            customModelInput.classList.add('hidden');
            customModelInput.disabled = true;
        }
        if (val) {
            globalState.selectedModel = val;
            safeSetLocalStorage('gemini_manga_model', val);
        }
    }
    updateModelLockingUI();
    if (globalState.selectedModel) {
        showToast(`Đã chọn mô hình: ${globalState.selectedModel}`, "info");
    }
}

export function updateModelDropdown(fetchedModels) {
    const modelSelect = document.getElementById('model-select');
    if (!modelSelect) return;

    const currentSelection = globalState.selectedModel || DEFAULT_MODEL;
    const allModels = new Set([...VALID_MODEL_IDS, ...fetchedModels]);
    if (currentSelection && currentSelection !== CUSTOM_MODEL_VALUE) {
        allModels.add(currentSelection);
    }

    const getModelVersion = (id) => {
        const match = id.match(/gemini-(\d+)(?:\.(\d+))?-/);
        if (match) {
            const major = parseInt(match[1]);
            const minor = match[2] ? parseInt(match[2]) : 0;
            return major * 10 + minor;
        }
        return 0;
    };

    const sortedModels = Array.from(allModels).sort((a, b) => {
        const verA = getModelVersion(a);
        const verB = getModelVersion(b);
        return verA !== verB ? verB - verA : a.localeCompare(b);
    });

    const getFriendlyName = (id) => {
        switch (id) {
            case "gemini-3.5-flash": return "Gemini 3.5 Flash (Mới nhất)";
            case "gemini-3-flash-preview": return "Gemini 3 Flash Preview (mạnh, preview)";
            case "gemini-3.1-flash-lite": return "Gemini 3.1 Flash-Lite (Khuyến nghị)";
            case "gemini-3.1-pro-preview": return "Gemini 3.1 Pro Preview (chuyên sâu)";
            case "gemini-2.5-flash": return "Gemini 2.5 Flash (ổn định)";
            case "gemini-2.5-flash-lite": return "Gemini 2.5 Flash-Lite (rẻ/nhanh)";
            case "gemini-2.5-pro": return "Gemini 2.5 Pro (chất lượng cao)";
            default:
                return id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') + ' (Online)';
        }
    };

    modelSelect.innerHTML = "";
    sortedModels.forEach(modelId => {
        const opt = document.createElement('option');
        opt.value = modelId;
        opt.textContent = getFriendlyName(modelId);
        modelSelect.appendChild(opt);
    });

    const customOpt = document.createElement('option');
    customOpt.value = CUSTOM_MODEL_VALUE;
    customOpt.textContent = (globalState.uiLanguage === 'en') ? "Enter custom model..." : "Tự nhập model...";
    modelSelect.appendChild(customOpt);

    if (allModels.has(currentSelection)) {
        modelSelect.value = currentSelection;
    } else {
        modelSelect.value = CUSTOM_MODEL_VALUE;
        if (elements.customModelInput) elements.customModelInput.value = currentSelection;
    }
}

export async function fetchGeminiModels() {
    const keyToUse = (elements.apiKeyInput?.value || globalState.apiKey || "").trim();
    if (!keyToUse) return;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${keyToUse}`);
        if (!response.ok) return;
        const data = await response.json();

        if (data.models && Array.isArray(data.models)) {
            const geminiModels = data.models
                .filter(m => {
                    const id = m.name ? m.name.replace('models/', '') : '';
                    if (!id) return false;

                    const supportsGen = m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent');
                    if (!supportsGen) return false;

                    if (id.includes('gemini-1.0') || id.includes('-thinking') || id.includes('embedding') || id.includes('bison') || id.includes('tunedModels/')) return false;
                    if (/-\d{3}$/.test(id)) return false;

                    return /gemini-(1\.5|2\.\d+|3\.\d+|4\.\d+|[5-9]\.\d+|[2-9]|\d{2,})-/.test(id);
                })
                .map(m => m.name.replace('models/', ''));

            if (geminiModels.length > 0) {
                updateModelDropdown(geminiModels);
            }
        }
    } catch (e) {
        console.warn("Không thể tự động tải danh sách Gemini models:", e);
    }
}

export function updateModelLockingUI() {
    const keyToUse = ((elements.apiKeyInput ? elements.apiKeyInput.value : "") || globalState.apiKey || "").trim();
    const hasKey = keyToUse.length > 0;
    const modelSelect = document.getElementById('model-select');
    const lockBadge = document.getElementById('model-lock-badge');
    const selectNote = document.getElementById('model-select-note');
    const customModelInput = elements.customModelInput;

    if (!modelSelect) return;

    modelSelect.disabled = false;
    modelSelect.className = 'w-full text-xs font-semibold rounded-lg bg-slate-950 border border-slate-800 text-slate-200 p-2.5 outline-none cursor-pointer';

    if (lockBadge && selectNote) {
        if (hasKey) {
            lockBadge.innerHTML = '<i class="fa-solid fa-lock-open text-emerald-400"></i> Tự chọn';
            lockBadge.className = "text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-1";
            selectNote.innerText = "* Bạn có thể chọn model có sẵn hoặc tự nhập model khác.";
        } else {
            lockBadge.innerHTML = '<i class="fa-solid fa-key text-amber-400"></i> Cần Key';
            lockBadge.className = "text-[9px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded flex items-center gap-1";
            selectNote.innerText = "* Vui lòng nhập Gemini API Key cá nhân để mở đầy đủ tính năng.";
        }
    }

    const currentModel = globalState.selectedModel || DEFAULT_MODEL;
    if (modelSelect.value === CUSTOM_MODEL_VALUE) {
        if (customModelInput) {
            const customVal = customModelInput.value.trim();
            if (customVal) {
                globalState.selectedModel = customVal;
                safeSetLocalStorage('gemini_manga_model', customVal);
            }
        }
    } else if (modelSelect.value && modelSelect.value !== CUSTOM_MODEL_VALUE) {
        globalState.selectedModel = modelSelect.value;
        safeSetLocalStorage('gemini_manga_model', modelSelect.value);
    } else {
        modelSelect.value = currentModel;
    }

    if (customModelInput) {
        const isCustomSelected = modelSelect.value === CUSTOM_MODEL_VALUE;
        customModelInput.classList.toggle('hidden', !isCustomSelected);
        customModelInput.disabled = !isCustomSelected;
    }
}

export function mountSettingsModal() { }

export function openSettingsModal() {
    mountSettingsModal();
    const modal = elements.settingsModal || document.getElementById('settings-modal');
    if (modal) modal.classList.remove('hidden');

    if (elements.uiLangSelect) elements.uiLangSelect.value = globalState.uiLanguage || 'vi';
    if (elements.apiKeyInput) elements.apiKeyInput.value = globalState.apiKey || '';

    const modelSelect = document.getElementById('model-select');
    if (modelSelect && globalState.selectedModel) {
        if (Array.from(modelSelect.options).some(opt => opt.value === globalState.selectedModel)) {
            modelSelect.value = globalState.selectedModel;
        } else {
            modelSelect.value = CUSTOM_MODEL_VALUE;
            if (elements.customModelInput) elements.customModelInput.value = globalState.selectedModel;
        }
    }

    const defaultFontSelect = document.getElementById('default-font');
    if (defaultFontSelect) defaultFontSelect.value = globalState.defaultFont || 'font-manga';

    const apiDelay = document.getElementById('api-delay-input');
    if (apiDelay) apiDelay.value = globalState.apiDelay || 2;

    const maxRetries = document.getElementById('max-retries-input');
    if (maxRetries) maxRetries.value = globalState.maxRetries || 3;

    fetchGeminiModels();
    updateModelLockingUI();

    if (elements.apiKeyInput) setTimeout(() => elements.apiKeyInput.focus(), 50);
}

export function closeSettingsModal() {
    const modal = elements.settingsModal || document.getElementById('settings-modal');
    if (modal) modal.classList.add('hidden');
}

export function updateDefaultFont(value) {
    globalState.defaultFont = value;
    globalState.globalStyle.fontFamily = value;
    const el = document.getElementById('default-font');
    if (el) el.value = value;
    localStorage.setItem('manga_default_font', value);
    showToast('Đã cập nhật phông chữ mặc định!', 'info');
}

window.updateDefaultFont = updateDefaultFont;

export function updateSourceLanguage(value) {
    globalState.sourceLanguage = value;
    if (elements.sourceLangSelect) elements.sourceLangSelect.value = value;
    safeSetLocalStorage('gemini_manga_source_lang', value);
}

export function updateTargetLanguage(value) {
    globalState.targetLanguage = value;
    if (elements.targetLangSelect) elements.targetLangSelect.value = value;
    safeSetLocalStorage('gemini_manga_target_lang', value);

    const isVerticalTarget = ['ja', 'zh', 'ko'].includes(value);
    if (globalState.globalStyle) {
        globalState.globalStyle.vertical = isVerticalTarget;
    }

    if (!isVerticalTarget && globalState.pages && globalState.activePageIndex >= 0) {
        const page = globalState.pages[globalState.activePageIndex];
        if (page?.blocks) {
            let modified = false;
            page.blocks.forEach(b => {
                if (b.style?.vertical) {
                    b.style.vertical = false;
                    modified = true;
                }
            });
            if (modified) selectPage(globalState.activePageIndex);
        }
    }
}

export function updatePronounMatrix(value) {
    globalState.pronounMatrix = value;
    if (elements.pronounMatrixInput) elements.pronounMatrixInput.value = value;
    safeSetLocalStorage('gemini_manga_pronoun_matrix', value);
}

export function updateGlossary(value) {
    globalState.glossaryNames = value;
    const glossaryInp = document.getElementById('glossary-input');
    if (glossaryInp) glossaryInp.value = value;
    safeSetLocalStorage('gemini_manga_glossary', value);
}

export async function toggleStoryMemory(enabled) {
    const ai = await import('../features/ai/ai-service.js');
    ai.toggleStoryMemory(enabled);
}

export async function updateStoryMemoryBadge() {
    const ai = await import('../features/ai/ai-service.js');
    ai.updateStoryMemoryBadge();
}

export function togglePreserveNames(enabled) {
    globalState.preserveNames = !!enabled;
    const preserveChk = document.getElementById('preserve-names-chk');
    if (preserveChk) preserveChk.checked = globalState.preserveNames;
    safeSetLocalStorage('gemini_manga_preserve_names', globalState.preserveNames);

    const glossarySection = document.getElementById('glossary-section-wrapper');
    if (glossarySection) glossarySection.classList.toggle('hidden', !globalState.preserveNames);
}

export function syncGenrePresetCheckboxes() {
    document.querySelectorAll('.genre-preset-option').forEach((checkbox) => {
        checkbox.checked = globalState.translationGenrePresets.includes(checkbox.value);
    });
}

export function saveTranslationGenrePresets() {
    safeSetLocalStorage('gemini_manga_translation_genre_preset', JSON.stringify(globalState.translationGenrePresets));
}

export function updateTranslationGenrePreset() {
    const checked = [];
    document.querySelectorAll('.genre-preset-option:checked').forEach((cb) => checked.push(cb.value));
    globalState.translationGenrePresets = checked;
    saveTranslationGenrePresets();
}

export function updateTranslationContextPrompt(value) {
    globalState.translationContextPrompt = value;
    safeSetLocalStorage('gemini_manga_translation_context_prompt', value);
}

export function updateApiDelay(value) {
    globalState.apiDelay = parseInt(value, 10) || 8;
    safeSetLocalStorage('gemini_manga_api_delay', globalState.apiDelay);
}

export function updateMaxRetries(value) {
    globalState.maxRetries = parseInt(value, 10) || 5;
    safeSetLocalStorage('gemini_manga_max_retries', globalState.maxRetries);
}

export function updateAiProvider(provider) {
    globalState.aiProvider = provider;
    safeSetLocalStorage('gemini_manga_ai_provider', provider);
    showToast(`Đã chuyển AI Provider sang: ${provider.toUpperCase()}`, "info");
}

export function updateApiEndpoint(val) {
    globalState.customApiEndpoint = val;
    safeSetLocalStorage('gemini_manga_api_endpoint', val);
}