import { selectPage } from './pages-ui.js';
import { globalState, markPageAutoFitDirty } from '../core/state.js';
import { VALID_MODEL_IDS, CUSTOM_MODEL_VALUE, DEFAULT_MODEL } from '../config/constants.js';
import { elements } from '../core/elements.js';
import { showToast } from '../core/utils.js';
import { safeSetLocalStorage } from '../core/utils/storage.js';
import { getGeminiModelsUrl } from '../features/ai/ai-config.js';
import { ensureModalElement } from '../core/component-loader.js';
import { requestOverlayRender } from '../features/canvas/canvas-service.js';

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

export function updatePipelineMode(mode) {
    globalState.translationPipelineMode = 'two-step';
    safeSetLocalStorage('gemini_manga_pipeline_mode', 'two-step');
    syncPipelineModeUI('two-step');
}

export function syncPipelineModeUI(mode) {
    const twoStepContainer = document.getElementById('two-step-models-container');
    if (twoStepContainer) twoStepContainer.classList.remove('hidden');
}

export function updateOcrModel(val) {
    const customInput = document.getElementById('custom-ocr-model-input');
    if (val === CUSTOM_MODEL_VALUE) {
        if (customInput) {
            customInput.classList.remove('hidden');
            const customVal = customInput.value.trim();
            if (customVal) {
                globalState.ocrModel = customVal;
                safeSetLocalStorage('gemini_manga_ocr_model', customVal);
            }
        }
    } else {
        if (customInput) customInput.classList.add('hidden');
        if (val) {
            globalState.ocrModel = val;
            safeSetLocalStorage('gemini_manga_ocr_model', val);
        }
    }
    showToast(`Model OCR & Khung thoại: ${globalState.ocrModel}`, "info");
}

export function updateTranslationModel(val) {
    const customInput = document.getElementById('custom-trans-model-input');
    if (val === CUSTOM_MODEL_VALUE) {
        if (customInput) {
            customInput.classList.remove('hidden');
            const customVal = customInput.value.trim();
            if (customVal) {
                globalState.translationModel = customVal;
                safeSetLocalStorage('gemini_manga_translation_model', customVal);
            }
        }
    } else {
        if (customInput) customInput.classList.add('hidden');
        if (val) {
            globalState.translationModel = val;
            safeSetLocalStorage('gemini_manga_translation_model', val);
        }
    }
    showToast(`Model Dịch thuật: ${globalState.translationModel}`, "info");
}

export function updateSelectedModel(val) {
    const customModelInput = elements.customModelInput || document.getElementById('custom-model-input');
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

export function updateAllModelDropdowns(fetchedModels = []) {
    const ocrSelect = document.getElementById('ocr-model-select');
    const transSelect = document.getElementById('trans-model-select');
    const modelSelect = document.getElementById('model-select');

    // Base fallback set if offline or before API key
    const baseKnownModels = [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.5-pro",
        "gemini-3.1-flash-lite",
        "gemini-3.1-pro-preview",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-1.5-flash",
        "gemini-1.5-pro"
    ];

    const allModelsSet = new Set([
        ...baseKnownModels,
        ...(Array.isArray(fetchedModels) ? fetchedModels : [])
    ]);

    if (globalState.ocrModel && globalState.ocrModel !== CUSTOM_MODEL_VALUE) allModelsSet.add(globalState.ocrModel);
    if (globalState.translationModel && globalState.translationModel !== CUSTOM_MODEL_VALUE) allModelsSet.add(globalState.translationModel);
    if (globalState.selectedModel && globalState.selectedModel !== CUSTOM_MODEL_VALUE) allModelsSet.add(globalState.selectedModel);

    const getModelScore = (id) => {
        let score = 0;
        const match = id.match(/gemini-(\d+)(?:\.(\d+))?/);
        if (match) {
            const major = parseInt(match[1]);
            const minor = match[2] ? parseInt(match[2]) : 0;
            score = major * 100 + minor * 10;
        }
        if (id.includes('pro')) score += 5;
        if (id.includes('flash')) score += 3;
        if (id.includes('lite')) score += 1;
        if (id.includes('preview')) score -= 2;
        return score;
    };

    const sortedModels = Array.from(allModelsSet).sort((a, b) => {
        const scoreA = getModelScore(a);
        const scoreB = getModelScore(b);
        return scoreA !== scoreB ? scoreB - scoreA : a.localeCompare(b);
    });

    const getFriendlyName = (id, role = 'general') => {
        switch (id) {
            case "gemini-2.5-flash":
                return role === 'ocr' ? "Gemini 2.5 Flash (Khuyên dùng: Siêu tốc & nhận diện chuẩn)" : "Gemini 2.5 Flash (Cực nhanh & ổn định)";
            case "gemini-2.5-flash-lite":
                return role === 'ocr' ? "Gemini 2.5 Flash-Lite (Siêu rẻ & tiết kiệm quota)" : "Gemini 2.5 Flash-Lite (Siêu rẻ & nhanh)";
            case "gemini-2.5-pro":
                return role === 'trans' ? "Gemini 2.5 Pro (Khuyên dùng: Văn phong dịch xuất sắc)" : "Gemini 2.5 Pro (Chất lượng cao nhất)";
            case "gemini-3.1-flash-lite":
                return "Gemini 3.1 Flash-Lite (Đời mới, tối ưu tốc độ)";
            case "gemini-3.1-pro-preview":
                return "Gemini 3.1 Pro Preview (Chuyên sâu ngữ cảnh)";
            case "gemini-2.0-flash":
                return "Gemini 2.0 Flash (Ổn định)";
            case "gemini-2.0-flash-lite":
                return "Gemini 2.0 Flash-Lite (Tiết kiệm)";
            case "gemini-1.5-flash":
                return "Gemini 1.5 Flash (Truyền thống)";
            case "gemini-1.5-pro":
                return role === 'trans' ? "Gemini 1.5 Pro (Chất lượng dịch cao cấp)" : "Gemini 1.5 Pro (Chất lượng cao)";
            default:
                return id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') + ' (Online)';
        }
    };

    // 1. Populate OCR Model Select
    if (ocrSelect) {
        const currentOcr = globalState.ocrModel || DEFAULT_OCR_MODEL;
        ocrSelect.innerHTML = "";

        sortedModels.forEach(modelId => {
            const opt = document.createElement('option');
            opt.value = modelId;
            opt.textContent = getFriendlyName(modelId, 'ocr');
            ocrSelect.appendChild(opt);
        });

        const customOpt = document.createElement('option');
        customOpt.value = CUSTOM_MODEL_VALUE;
        customOpt.textContent = "✍️ Tự nhập model OCR tùy chỉnh...";
        ocrSelect.appendChild(customOpt);

        if (allModelsSet.has(currentOcr)) {
            ocrSelect.value = currentOcr;
            const customInput = document.getElementById('custom-ocr-model-input');
            if (customInput) customInput.classList.add('hidden');
        } else {
            ocrSelect.value = CUSTOM_MODEL_VALUE;
            const customInput = document.getElementById('custom-ocr-model-input');
            if (customInput) {
                customInput.classList.remove('hidden');
                customInput.value = currentOcr;
            }
        }
    }

    // 2. Populate Translation Model Select
    if (transSelect) {
        const currentTrans = globalState.translationModel || DEFAULT_TRANSLATION_MODEL;
        transSelect.innerHTML = "";

        sortedModels.forEach(modelId => {
            const opt = document.createElement('option');
            opt.value = modelId;
            opt.textContent = getFriendlyName(modelId, 'trans');
            transSelect.appendChild(opt);
        });

        const customOpt = document.createElement('option');
        customOpt.value = CUSTOM_MODEL_VALUE;
        customOpt.textContent = "✍️ Tự nhập model Dịch tùy chỉnh (DeepSeek, GPT-4o...)...";
        transSelect.appendChild(customOpt);

        if (allModelsSet.has(currentTrans)) {
            transSelect.value = currentTrans;
            const customInput = document.getElementById('custom-trans-model-input');
            if (customInput) customInput.classList.add('hidden');
        } else {
            transSelect.value = CUSTOM_MODEL_VALUE;
            const customInput = document.getElementById('custom-trans-model-input');
            if (customInput) {
                customInput.classList.remove('hidden');
                customInput.value = currentTrans;
            }
        }
    }

    // 3. Populate 1-Step Model Select
    if (modelSelect) {
        const currentModel = globalState.selectedModel || DEFAULT_MODEL;
        modelSelect.innerHTML = "";

        sortedModels.forEach(modelId => {
            const opt = document.createElement('option');
            opt.value = modelId;
            opt.textContent = getFriendlyName(modelId, 'general');
            modelSelect.appendChild(opt);
        });

        const customOpt = document.createElement('option');
        customOpt.value = CUSTOM_MODEL_VALUE;
        customOpt.textContent = (globalState.uiLanguage === 'en') ? "✍️ Enter custom model..." : "✍️ Tự nhập model (Custom Model)...";
        modelSelect.appendChild(customOpt);

        if (allModelsSet.has(currentModel)) {
            modelSelect.value = currentModel;
            const customModelInput = elements.customModelInput || document.getElementById('custom-model-input');
            if (customModelInput) customModelInput.classList.add('hidden');
        } else {
            modelSelect.value = CUSTOM_MODEL_VALUE;
            const customModelInput = elements.customModelInput || document.getElementById('custom-model-input');
            if (customModelInput) {
                customModelInput.classList.remove('hidden');
                customModelInput.value = currentModel;
            }
        }
    }
}

export async function fetchGeminiModels(isManual = false) {
    const keyToUse = ((elements.apiKeyInput ? elements.apiKeyInput.value : "") || globalState.apiKey || "").trim();
    if (!keyToUse) {
        updateAllModelDropdowns([]);
        if (isManual) {
            showToast("Vui lòng nhập API Key trước khi tải danh sách Model.", "warn");
        }
        return;
    }

    const refreshBtn = document.getElementById('btn-refresh-models');
    if (refreshBtn) {
        refreshBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-[9px]"></i> Đang nạp...';
    }

    try {
        const response = await fetch(getGeminiModelsUrl(keyToUse));
        if (!response.ok) {
            updateAllModelDropdowns([]);
            if (isManual) {
                showToast(`Không thể tải Model từ API (Mã lỗi ${response.status}). Vui lòng kiểm tra lại API Key.`, "error");
            }
            return;
        }
        const data = await response.json();

        if (data.models && Array.isArray(data.models)) {
            // Lọc toàn bộ các model có hỗ trợ generateContent, loại trừ embedding và audio/vision synth
            const geminiModels = data.models
                .filter(m => {
                    const id = m.name ? m.name.replace('models/', '') : '';
                    if (!id) return false;

                    const supportsGen = m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent');
                    if (!supportsGen) return false;

                    if (id.includes('embedding') || id.includes('bison') || id.includes('aqa') || id.includes('imagen') || id.includes('tunedModels/')) return false;

                    return true;
                })
                .map(m => m.name.replace('models/', ''));

            if (geminiModels.length > 0) {
                updateAllModelDropdowns(geminiModels);
                if (isManual) {
                    showToast(`Đã nạp và cập nhật thành công ${geminiModels.length} mô hình từ Google Gemini!`, "success");
                }
            } else {
                updateAllModelDropdowns([]);
            }
        }
    } catch (e) {
        console.warn("Không thể tự động tải danh sách Gemini models:", e);
        updateAllModelDropdowns([]);
        if (isManual) {
            showToast("Lỗi kết nối mạng khi tải danh sách model.", "error");
        }
    } finally {
        if (refreshBtn) {
            refreshBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate text-[9px]"></i> Cập nhật Model';
        }
    }
}

export function updateModelDropdown(fetchedModels) {
    updateAllModelDropdowns(fetchedModels);
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

export async function openSettingsModal() {
    mountSettingsModal();
    const modal = await ensureModalElement('settings-modal');
    if (modal) modal.classList.remove('hidden');

    if (elements.uiLangSelect) elements.uiLangSelect.value = globalState.uiLanguage || 'vi';
    if (elements.apiKeyInput) elements.apiKeyInput.value = globalState.apiKey || '';

    const providerSelect = document.getElementById('ai-provider-select');
    if (providerSelect) providerSelect.value = globalState.aiProvider || 'gemini';

    const endpointInput = document.getElementById('api-endpoint-input');
    if (endpointInput) endpointInput.value = globalState.apiEndpoint || '';

    syncAiProviderUI(globalState.aiProvider || 'gemini');
    syncPipelineModeUI(globalState.translationPipelineMode || 'two-step');

    const ocrSelect = document.getElementById('ocr-model-select');
    const customOcrInput = document.getElementById('custom-ocr-model-input');
    if (ocrSelect && globalState.ocrModel) {
        if (Array.from(ocrSelect.options).some(opt => opt.value === globalState.ocrModel)) {
            ocrSelect.value = globalState.ocrModel;
            if (customOcrInput) customOcrInput.classList.add('hidden');
        } else {
            ocrSelect.value = CUSTOM_MODEL_VALUE;
            if (customOcrInput) {
                customOcrInput.classList.remove('hidden');
                customOcrInput.value = globalState.ocrModel;
            }
        }
    }

    const transSelect = document.getElementById('trans-model-select');
    const customTransInput = document.getElementById('custom-trans-model-input');
    if (transSelect && globalState.translationModel) {
        if (Array.from(transSelect.options).some(opt => opt.value === globalState.translationModel)) {
            transSelect.value = globalState.translationModel;
            if (customTransInput) customTransInput.classList.add('hidden');
        } else {
            transSelect.value = CUSTOM_MODEL_VALUE;
            if (customTransInput) {
                customTransInput.classList.remove('hidden');
                customTransInput.value = globalState.translationModel;
            }
        }
    }

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

    const exportFormatSelect = document.getElementById('export-format-select');
    const storedFormat = localStorage.getItem('manga_export_format') || globalState.exportFormat || 'auto';
    globalState.exportFormat = storedFormat;
    if (exportFormatSelect) exportFormatSelect.value = storedFormat;

    const exportPdfQualitySelect = document.getElementById('export-pdf-quality-select');
    const storedPdfQuality = localStorage.getItem('manga_pdf_quality') || globalState.pdfQuality || 'hd';
    globalState.pdfQuality = storedPdfQuality;
    if (exportPdfQualitySelect) exportPdfQualitySelect.value = storedPdfQuality;

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

    // Invalidate autoFitCache for all blocks across all pages and request re-render
    if (globalState.pages && Array.isArray(globalState.pages)) {
        globalState.pages.forEach(p => {
            if (p && p.blocks) {
                p.blocks.forEach(b => {
                    b.autoFitCache = null;
                    b.maskCache = null;
                });
                markPageAutoFitDirty(p);
            }
        });
    }
    requestOverlayRender();
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

export function updateComicUniverse(value) {
    globalState.comicUniverse = value;
    safeSetLocalStorage('manga_comic_universe', value);
    syncGenrePresetCheckboxes();
}

export function toggleComicGenre(genreKey) {
    if (!Array.isArray(globalState.comicGenres)) {
        globalState.comicGenres = [];
    }
    const idx = globalState.comicGenres.indexOf(genreKey);
    if (idx > -1) {
        if (globalState.comicGenres.length > 1) {
            globalState.comicGenres.splice(idx, 1);
        } else {
            import('../core/utils/dom.js').then(m => m.showToast("Cần chọn ít nhất 1 thể loại.", "info"));
            return;
        }
    } else {
        globalState.comicGenres.push(genreKey);
    }
    safeSetLocalStorage('manga_comic_genres', JSON.stringify(globalState.comicGenres));
    syncGenrePresetCheckboxes();
}

export function updateComicGenre(value) {
    toggleComicGenre(value);
}

export function updateComicTone(value) {
    globalState.comicTone = value;
    safeSetLocalStorage('manga_comic_tone', value);
    syncGenrePresetCheckboxes();
}

export function syncGenrePresetCheckboxes() {
    const universeSelect = document.getElementById('comic-universe-select');
    if (universeSelect) universeSelect.value = globalState.comicUniverse || 'auto';

    const selectedGenres = Array.isArray(globalState.comicGenres) ? globalState.comicGenres : ['fantasy', 'isekai'];

    document.querySelectorAll('.comic-genre-tag').forEach(btn => {
        const gVal = btn.getAttribute('data-genre');
        const isActive = selectedGenres.includes(gVal);
        btn.classList.toggle('bg-indigo-600', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('border-indigo-400', isActive);
        btn.classList.toggle('shadow-sm', isActive);
        btn.classList.toggle('bg-slate-900', !isActive);
        btn.classList.toggle('text-slate-400', !isActive);
        btn.classList.toggle('border-slate-800', !isActive);
        
        const checkIcon = btn.querySelector('.tag-check');
        if (checkIcon) checkIcon.classList.toggle('hidden', !isActive);
    });

    document.querySelectorAll('.comic-tone-option').forEach(btn => {
        const toneVal = btn.getAttribute('data-tone');
        const isActive = (globalState.comicTone || 'classic') === toneVal;
        btn.classList.toggle('bg-indigo-600', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('border-indigo-500', isActive);
        btn.classList.toggle('bg-slate-900', !isActive);
        btn.classList.toggle('text-slate-400', !isActive);
        btn.classList.toggle('border-slate-800', !isActive);
    });

    document.querySelectorAll('.genre-preset-option').forEach((checkbox) => {
        checkbox.checked = (globalState.translationGenrePresets || []).includes(checkbox.value);
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
    const val = parseInt(value, 10);
    globalState.maxRetries = !isNaN(val) && val >= 0 ? val : 3;
    safeSetLocalStorage('gemini_manga_max_retries', globalState.maxRetries);
}

export function syncAiProviderUI(provider = globalState.aiProvider || 'gemini') {
    const endpointContainer = document.getElementById('api-endpoint-container');
    if (endpointContainer) {
        endpointContainer.classList.toggle('hidden', provider !== 'custom');
    }

    const apiKeyContainer = document.getElementById('api-key-container');
    const apiKeyLabel = document.getElementById('api-key-label');

    if (apiKeyContainer) {
        if (provider === 'custom') {
            apiKeyContainer.classList.add('hidden');
        } else {
            apiKeyContainer.classList.remove('hidden');
            if (apiKeyLabel) {
                if (provider === 'openai') apiKeyLabel.innerText = "OpenAI API Key";
                else if (provider === 'claude') apiKeyLabel.innerText = "Claude API Key";
                else apiKeyLabel.innerText = "Gemini API Key";
            }
        }
    }
}

export function updateAiProvider(provider) {
    globalState.aiProvider = provider;
    safeSetLocalStorage('gemini_manga_ai_provider', provider);

    syncAiProviderUI(provider);

    if (provider === 'gemini') {
        if (!VALID_MODEL_IDS.includes(globalState.selectedModel)) {
            globalState.selectedModel = DEFAULT_MODEL;
            safeSetLocalStorage('gemini_manga_model', DEFAULT_MODEL);
            const modelSelect = document.getElementById('model-select');
            if (modelSelect) modelSelect.value = DEFAULT_MODEL;
        }
    }

    showToast(`Đã chuyển AI Provider sang: ${provider.toUpperCase()}`, "info");
}

export function updateApiEndpoint(val) {
    globalState.apiEndpoint = val;
    safeSetLocalStorage('gemini_manga_api_endpoint', val);
}

export function updateExportFormat(value) {
    globalState.exportFormat = value || 'auto';
    safeSetLocalStorage('manga_export_format', globalState.exportFormat);
    showToast(`Đã đổi định dạng xuất ZIP sang: ${value.toUpperCase()}`, 'info');
}

export function updateExportPdfQuality(value) {
    globalState.pdfQuality = value || 'hd';
    safeSetLocalStorage('manga_pdf_quality', globalState.pdfQuality);
    showToast(`Đã đổi chất lượng PDF sang: ${value.toUpperCase()}`, 'info');
}

window.updatePipelineMode = updatePipelineMode;
window.updateOcrModel = updateOcrModel;
window.updateTranslationModel = updateTranslationModel;
window.fetchGeminiModels = fetchGeminiModels;
window.updateAllModelDropdowns = updateAllModelDropdowns;