// UI Controller & Event Handlers
import {
    globalState,
    pushStateToHistory,
    savePageToDB,
    saveProjectMeta,
    deletePageFromDB,
    garbageCollectPageCaches,
    activatePage,
    deactivatePage,
    VALID_MODEL_IDS,
    CUSTOM_MODEL_VALUE,
    DEFAULT_MODEL,
    apiKey,
    TRANSLATION_GENRE_PRESETS
} from '../core/state.js';
import { elements } from '../core/elements.js';
import { showToast, escapeHTML, waitForNextPaint, waitForImageReady } from '../core/utils.js';
import {
    requestOverlayRender,
    renderOverlays,
    selectBlock,
    copiedStyle,
    setCopiedStyle,
    copyBlockStyle,
    pasteBlockStyle,
    navigateBlocks,
    autoFitBlock
} from '../features/canvas.js';
import { restorePageEraserDrawing, saveEraserDrawingToPage } from '../features/inpainting.js';
import { updateToeicTabUI, updateToeicNotebookUI, displayToeicAnalysis, resetToeicAnalysisUI } from '../features/toeic.js';

export let previewCurrentPage = 0;

// 1. Chuyển đổi tab sidebar bên phải (edit, style, toeic)
export function setRightTab(tab) {
    const tabs = ['edit', 'style', 'toeic'];
    tabs.forEach((t) => {
        const btn = document.getElementById(`tab-${t}`);
        const panel = document.getElementById(`panel-tab-${t}`);
        if (t === tab) {
            if (btn) {
                btn.className = "flex-1 py-3 text-xs font-bold text-indigo-400 border-b-2 border-indigo-500 uppercase tracking-wider";
            }
            if (panel) panel.classList.remove('hidden');
        } else {
            if (btn) {
                btn.className = "flex-1 py-3 text-xs font-bold text-slate-400 hover:text-slate-200 uppercase tracking-wider";
            }
            if (panel) panel.classList.add('hidden');
        }
    });

    if (tab === 'toeic') {
        updateToeicTabUI();
    }
}

// 2. Cập nhật thanh tiến trình hiển thị đè (Processing Overlay)
export function updateProcessingOverlay(show, title = "Đang xử lý...", subtitle = "Vui lòng đợi...", progress = 0) {
    const overlay = elements.processingOverlay;
    if (!overlay) return;

    if (show) {
        overlay.classList.remove('hidden');
        const titleEl = document.getElementById('processing-title');
        const subtitleEl = document.getElementById('processing-subtitle');
        const progressEl = document.getElementById('processing-progress-bar');
        const percentageEl = document.getElementById('processing-percentage');

        if (titleEl) titleEl.innerText = title;
        if (subtitleEl) subtitleEl.innerText = subtitle;
        if (progressEl) progressEl.style.width = `${progress}%`;
        if (percentageEl) percentageEl.innerText = `${progress}%`;
    } else {
        overlay.classList.add('hidden');
    }
}

// 3. Cập nhật thanh tiến trình tác vụ chạy ngầm
export function updateBackgroundTaskOverlay(show, title = "", subtitle = "", progress = 0) {
    const bar = elements.backgroundTaskBar;
    if (!bar) return;

    if (show) {
        bar.classList.remove('hidden');
        const titleEl = document.getElementById('bg-task-title');
        const subtitleEl = document.getElementById('bg-task-subtitle');
        const progressEl = document.getElementById('bg-task-progress-bar');
        const percentageEl = document.getElementById('bg-task-percentage');

        if (titleEl) titleEl.innerText = title;
        if (subtitleEl) subtitleEl.innerText = subtitle;
        if (progressEl) progressEl.style.width = `${progress}%`;
        if (percentageEl) percentageEl.innerText = `${progress}%`;
    } else {
        bar.classList.add('hidden');
    }
}

// 4. Chọn trang hoạt động trong Workspace
export function selectPage(index) {
    if (index < 0 || index >= globalState.pages.length) return;

    globalState.activePageIndex = index;
    globalState.selectedBlockId = null;

    saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);

    const page = globalState.pages[index];
    activatePage(page);
    garbageCollectPageCaches();

    updatePageListUI();

    elements.workspaceEmptyState.classList.add('hidden');
    elements.btnActiveTranslate.disabled = false;
    elements.btnExportPage.disabled = false;
    elements.btnEraserMode.disabled = false;

    if (globalState.viewMode === 'split') {
        updateSplitView();
    } else {
        elements.workspaceSplitWrapper.classList.add('hidden');
        elements.mangaCanvasContainer.classList.remove('hidden');

        elements.mangaBgImage.dataset.loadedSrc = "";
        elements.mangaBgImage.src = page.src;

        if (elements.mangaBgImage.complete && elements.mangaBgImage.naturalWidth > 0) {
            elements.mangaBgImage.dataset.loadedSrc = page.src;
            restorePageEraserDrawing(page);
            requestOverlayRender();
        } else {
            elements.mangaBgImage.onload = () => {
                // Đảm bảo trang hiện tại vẫn là trang được chọn khi hình ảnh tải xong
                const currentPage = globalState.pages[globalState.activePageIndex];
                if (!currentPage || currentPage.id !== page.id) return;

                elements.mangaBgImage.dataset.loadedSrc = page.src;
                restorePageEraserDrawing(page);
                requestOverlayRender();
            };
        }
    }

    updateActiveBlockEditor();
}

// 5. Xóa một trang khỏi danh sách và DB
export function removePage(index) {
    pushStateToHistory();
    const removedPage = globalState.pages[index];
    if (removedPage?.apiSrc?.startsWith('blob:')) {
        URL.revokeObjectURL(removedPage.apiSrc);
    }
    if (removedPage?.src?.startsWith('blob:')) {
        URL.revokeObjectURL(removedPage.src);
    }
    if (removedPage?.thumbnailSrc?.startsWith('blob:')) {
        URL.revokeObjectURL(removedPage.thumbnailSrc);
    }

    if (removedPage) {
        deletePageFromDB(removedPage.id);
    }

    globalState.pages.splice(index, 1);
    if (globalState.activePageIndex === index) {
        globalState.activePageIndex = -1;
        globalState.selectedBlockId = null;
        elements.mangaCanvasContainer.classList.add('hidden');
        elements.workspaceSplitWrapper.classList.add('hidden');
        elements.workspaceEmptyState.classList.remove('hidden');
        elements.btnActiveTranslate.disabled = true;
        elements.btnExportPage.disabled = true;
        elements.btnEraserMode.disabled = true;
    } else if (globalState.activePageIndex > index) {
        globalState.activePageIndex--;
    }

    saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);

    if (globalState.activePageIndex !== -1) {
        activatePage(globalState.pages[globalState.activePageIndex]);
    }
    garbageCollectPageCaches();

    updatePageListUI();
    showToast('Đã xóa trang truyện', 'info');
}

// 6. Cập nhật chế độ hiển thị Workspace
export function setViewMode(mode) {
    globalState.viewMode = mode;

    const modes = ['overlay', 'split', 'original'];
    modes.forEach(m => {
        const btn = document.getElementById(`view-mode-${m}`);
        if (btn) {
            if (m === mode) {
                btn.className = "px-3 py-1 text-xs font-semibold rounded bg-indigo-600 text-white transition-all flex items-center gap-1";
            } else {
                btn.className = "px-3 py-1 text-xs font-semibold rounded text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1";
            }
        }
    });

    if (globalState.activePageIndex === -1) return;

    if (mode === 'split') {
        elements.mangaCanvasContainer.classList.add('hidden');
        updateSplitView();
    } else {
        elements.workspaceSplitWrapper.classList.add('hidden');
        elements.mangaCanvasContainer.classList.remove('hidden');
        requestOverlayRender();
    }
}

// 7. Cập nhật chế độ xem chia đôi
export function updateSplitView() {
    if (globalState.activePageIndex === -1) return;
    const page = globalState.pages[globalState.activePageIndex];

    elements.workspaceSplitWrapper.classList.remove('hidden');
    elements.splitOriginalImg.src = page.src;

    let mirrorImg = document.getElementById('split-editor-img-clone');
    let overlaysDiv = document.getElementById('split-overlays-clone');
    let mirrorContainer = document.getElementById('split-editor-container-clone');

    if (!mirrorContainer || !mirrorImg || !overlaysDiv) {
        elements.splitEditorAnchor.innerHTML = '';

        mirrorContainer = document.createElement('div');
        mirrorContainer.className = "manga-container";
        mirrorContainer.id = "split-editor-container-clone";
        mirrorContainer.style.position = 'relative';
        mirrorContainer.style.display = 'inline-block';
        mirrorContainer.style.height = '100%';

        mirrorImg = document.createElement('img');
        mirrorImg.id = "split-editor-img-clone";
        mirrorImg.src = page.src;
        mirrorImg.className = "block h-full w-auto max-w-none border border-slate-800 rounded shadow-2xl select-none";
        mirrorImg.style.pointerEvents = 'none';

        overlaysDiv = document.createElement('div');
        overlaysDiv.id = "split-overlays-clone";
        overlaysDiv.className = "absolute inset-0 select-none overflow-hidden rounded z-20";

        mirrorContainer.appendChild(mirrorImg);
        mirrorContainer.appendChild(overlaysDiv);
        elements.splitEditorAnchor.appendChild(mirrorContainer);
    } else {
        if (mirrorImg.src !== page.src) {
            mirrorImg.src = page.src;
        }
    }

    renderOverlays(overlaysDiv);
}

// 8. Tăng/Giảm thu phóng Workspace
export function changeZoom(amount) {
    globalState.zoom = Math.max(25, Math.min(250, globalState.zoom + amount));
    elements.zoomIndicator.innerText = `${globalState.zoom}%`;
    elements.mangaCanvasContainer.style.height = `${globalState.zoom}%`;
    elements.mangaCanvasContainer.style.width = 'auto';
    elements.workspaceSplitWrapper.style.transform = `scale(${globalState.zoom / 100})`;
}

export function resetZoom() {
    globalState.zoom = 100;
    elements.zoomIndicator.innerText = '100%';
    elements.mangaCanvasContainer.style.height = '100%';
    elements.mangaCanvasContainer.style.width = 'auto';
    elements.workspaceSplitWrapper.style.transform = 'scale(1)';
}

// 9. Đồng bộ cài đặt & model
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
            globalState.selectedModel = customVal || DEFAULT_MODEL;
            localStorage.setItem('gemini_manga_model', customVal || DEFAULT_MODEL);
        }
    } else {
        if (customModelInput) {
            customModelInput.classList.add('hidden');
            customModelInput.disabled = true;
        }
        if (val && val !== CUSTOM_MODEL_VALUE) {
            globalState.selectedModel = val;
            localStorage.setItem('gemini_manga_model', val);
        }
    }
    updateModelLockingUI();
}

export function updateModelDropdown(fetchedModels) {
    const modelSelect = document.getElementById('model-select');
    if (!modelSelect) return;

    const currentSelection = globalState.selectedModel || DEFAULT_MODEL;

    // Create a Set of all valid model IDs (hardcoded + fetched)
    const allModels = new Set([...VALID_MODEL_IDS, ...fetchedModels]);

    // Helper to extract version score (e.g. gemini-3.5-flash -> 35, gemini-3-flash -> 30)
    const getModelVersion = (id) => {
        const match = id.match(/gemini-(\d+)(?:\.(\d+))?-/);
        if (match) {
            const major = parseInt(match[1]);
            const minor = match[2] ? parseInt(match[2]) : 0;
            return major * 10 + minor;
        }
        return 0;
    };

    // Sort models by version descending, then alphabetically ascending
    const sortedModels = Array.from(allModels).sort((a, b) => {
        const verA = getModelVersion(a);
        const verB = getModelVersion(b);
        if (verA !== verB) {
            return verB - verA;
        }
        return a.localeCompare(b);
    });

    // Predefined friendly display names
    const getFriendlyName = (id) => {
        switch (id) {
            case "gemini-3.5-flash": return "Gemini 3.5 Flash (Mới nhất)";
            case "gemini-3-flash-preview": return "Gemini 3 Flash Preview (mạnh, preview)";
            case "gemini-3.1-flash-lite": return "Gemini 3.1 Flash-Lite (Khuyến nghị)";
            case "gemini-3.1-pro-preview": return "Gemini 3.1 Pro Preview (chuyên sâu)";
            case "gemini-2.5-flash": return "Gemini 2.5 Flash (ổn định)";
            case "gemini-2.5-flash-lite": return "Gemini 2.5 Flash-Lite (rẻ/nhanh)";
            case "gemini-2.5-pro": return "Gemini 2.5 Pro (chất lượng cao)";
            default: {
                // Format name nicely, e.g. gemini-2.0-flash-exp -> Gemini 2.0 Flash Exp (Online)
                return id.split('-')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ') + ' (Online)';
            }
        }
    };

    // Save current selection or build
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

    // Restore selected value
    if (allModels.has(currentSelection)) {
        modelSelect.value = currentSelection;
    } else {
        modelSelect.value = CUSTOM_MODEL_VALUE;
        if (elements.customModelInput) {
            elements.customModelInput.value = currentSelection;
        }
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
            // Filter models that support generateContent and are Gemini models
            const geminiModels = data.models
                .filter(m => {
                    const id = m.name ? m.name.replace('models/', '') : '';
                    if (!id) return false;
                    
                    const supportsGen = m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent');
                    if (!supportsGen) return false;
                    
                    // Ignore legacy 1.0 models (lacking vision/JSON support)
                    if (id.includes('gemini-1.0')) return false;
                    
                    // Ignore thinking models (does not support structured outputs yet)
                    if (id.includes('-thinking')) return false;
                    
                    // Ignore embedding/tuning/moderation/sentiment models
                    if (id.includes('embedding') || id.includes('bison') || id.includes('tunedModels/')) return false;
                    
                    // Ignore pinned checkpoint snapshots (e.g. -001, -002) to avoid duplicates
                    if (/-\d{3}$/.test(id)) return false;
                    
                    // Allow Gemini 1.5, 2.0, 2.5, 3.x, etc. (with vision/JSON support)
                    const isGeminiV15OrNewer = /gemini-(1\.5|2\.\d+|3\.\d+|4\.\d+|[5-9]\.\d+|[2-9]|\d{2,})-/.test(id);
                    return isGeminiV15OrNewer;
                })
                .map(m => m.name.replace('models/', ''));

            if (geminiModels.length > 0) {
                updateModelDropdown(geminiModels);
            }
        }
    } catch (e) {
        console.warn("Could not auto-fetch Gemini models list:", e);
    }
}

export function updateModelLockingUI() {
    const hasCustomKey = elements.apiKeyInput ? (elements.apiKeyInput.value || "").trim() !== "" : false;
    const hasSystemKey = apiKey ? apiKey.trim() !== "" : false;
    const modelSelect = document.getElementById('model-select');
    const lockBadge = document.getElementById('model-lock-badge');
    const selectNote = document.getElementById('model-select-note');
    const customModelInput = elements.customModelInput;
    const syncCustomModelVisibility = () => {
        if (!customModelInput) return;
        const isCustomSelected = modelSelect && modelSelect.value === CUSTOM_MODEL_VALUE;
        customModelInput.classList.toggle('hidden', !isCustomSelected || modelSelect.disabled);
        customModelInput.disabled = modelSelect.disabled || !isCustomSelected;
    };

    if (!modelSelect || !lockBadge || !selectNote) return;

    if (!hasCustomKey && hasSystemKey) {
        modelSelect.value = DEFAULT_MODEL;
        globalState.selectedModel = DEFAULT_MODEL;
        modelSelect.disabled = true;
        modelSelect.className = 'w-full text-xs font-semibold rounded-lg bg-slate-950/80 border border-slate-800 text-slate-400 p-2.5 outline-none opacity-60 cursor-not-allowed';
        if (customModelInput) {
            customModelInput.classList.add('hidden');
            customModelInput.disabled = true;
        }

        lockBadge.innerHTML = '<i class="fa-solid fa-lock"></i> Đã Khóa';
        lockBadge.className = "text-[9px] text-indigo-400 font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded flex items-center gap-1";
        selectNote.innerText = "* Mô hình được khóa cố định để đảm bảo chạy mượt mà bằng phím tự động của Sandbox Canvas.";
    } else if (!hasCustomKey) {
        modelSelect.value = DEFAULT_MODEL;
        globalState.selectedModel = DEFAULT_MODEL;
        modelSelect.disabled = true;
        modelSelect.className = 'w-full text-xs font-semibold rounded-lg bg-slate-950/80 border border-slate-800 text-slate-400 p-2.5 outline-none opacity-60 cursor-not-allowed';
        if (customModelInput) {
            customModelInput.classList.add('hidden');
            customModelInput.disabled = true;
        }

        lockBadge.innerHTML = '<i class="fa-solid fa-key text-amber-400"></i> Cần Key';
        lockBadge.className = "text-[9px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded flex items-center gap-1";
        selectNote.innerText = "* Vui lòng nhập Gemini API Key cá nhân trước khi dịch.";
    } else {
        modelSelect.disabled = false;
        modelSelect.className = 'w-full text-xs font-semibold rounded-lg bg-slate-950 border border-slate-800 text-slate-200 p-2.5 outline-none cursor-pointer';

        lockBadge.innerHTML = '<i class="fa-solid fa-lock-open text-emerald-400"></i> Tự chọn';
        lockBadge.className = "text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-1";
        selectNote.innerText = "* Bạn có thể chọn model có sẵn hoặc tự nhập model khác nếu tài khoản Google của bạn hỗ trợ.";

        if (modelSelect.value === CUSTOM_MODEL_VALUE) {
            const customModel = customModelInput?.value.trim() || DEFAULT_MODEL;
            globalState.selectedModel = customModel;
        } else {
            globalState.selectedModel = modelSelect.value;
        }
    }

    syncCustomModelVisibility();
}

export function mountSettingsModal() {
    // Settings sections are statically mounted inside #settings-modal-body in index.html
}

export function openSettingsModal() {
    mountSettingsModal();
    const modal = elements.settingsModal || document.getElementById('settings-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
    if (elements.uiLangSelect) {
        elements.uiLangSelect.value = globalState.uiLanguage || 'vi';
    }
    // Fetch online models from Gemini API dynamically
    fetchGeminiModels();
    if (elements.apiKeyInput) {
        setTimeout(() => elements.apiKeyInput.focus(), 50);
    }
}

export function closeSettingsModal() {
    const modal = elements.settingsModal || document.getElementById('settings-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}


export function updateSourceLanguage(value) {
    globalState.sourceLanguage = value;
    if (elements.sourceLangSelect) elements.sourceLangSelect.value = value;
    localStorage.setItem('gemini_manga_source_lang', value);
}

export function updateTargetLanguage(value) {
    globalState.targetLanguage = value;
    if (elements.targetLangSelect) elements.targetLangSelect.value = value;
    localStorage.setItem('gemini_manga_target_lang', value);

    // Dynamic vertical writing mode default for target language
    const isVerticalTarget = ['ja', 'zh', 'ko'].includes(value);
    if (globalState.globalStyle) {
        globalState.globalStyle.vertical = isVerticalTarget;
    }
}

export function updatePronounMatrix(value) {
    globalState.pronounMatrix = value;
    if (elements.pronounMatrixInput) elements.pronounMatrixInput.value = value;
    localStorage.setItem('gemini_manga_pronoun_matrix', value);
}

export function updateGlossary(value) {
    globalState.glossaryNames = value;
    const glossaryInp = document.getElementById('glossary-input');
    if (glossaryInp) glossaryInp.value = value;
    localStorage.setItem('gemini_manga_glossary', value);
}

export function toggleStoryMemory(enabled) {
    globalState.storyMemoryEnabled = !!enabled;
    const chk = document.getElementById('story-memory-chk');
    if (chk) chk.checked = globalState.storyMemoryEnabled;
    localStorage.setItem('gemini_manga_story_memory_enabled', globalState.storyMemoryEnabled);
    updateStoryMemoryBadge();
    showToast(globalState.storyMemoryEnabled ? "🧠 Đã kích hoạt Trí nhớ cốt truyện dài hạn." : "🧠 Đã tắt Trí nhớ cốt truyện.", "info");
}

export function updateStoryMemoryBadge() {
    const badge = document.getElementById('story-memory-badge');
    if (!badge) return;
    if (globalState.storyMemoryEnabled) {
        const count = Object.keys(globalState.storyMemoryContext || {}).length;
        badge.textContent = `${count} dữ kiện`;
        badge.className = 'px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold';
    } else {
        badge.textContent = 'Đã tắt';
        badge.className = 'px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-500 text-[9px] font-bold';
    }
}

export function togglePreserveNames(enabled) {
    globalState.preserveNames = !!enabled;
    const preserveChk = document.getElementById('preserve-names-chk');
    if (preserveChk) preserveChk.checked = globalState.preserveNames;
    localStorage.setItem('gemini_manga_preserve_names', globalState.preserveNames);

    const glossarySection = document.getElementById('glossary-section-wrapper');
    if (glossarySection) {
        glossarySection.classList.toggle('hidden', !globalState.preserveNames);
    }
}

export function syncGenrePresetCheckboxes() {
    document.querySelectorAll('.genre-preset-option').forEach((checkbox) => {
        const val = checkbox.value;
        checkbox.checked = globalState.translationGenrePresets.includes(val);
    });
}

export function saveTranslationGenrePresets() {
    localStorage.setItem('gemini_manga_translation_genre_preset', JSON.stringify(globalState.translationGenrePresets));
}

export function updateTranslationGenrePreset() {
    const checked = [];
    document.querySelectorAll('.genre-preset-option:checked').forEach((cb) => {
        checked.push(cb.value);
    });
    globalState.translationGenrePresets = checked;
    saveTranslationGenrePresets();
}

export function updateTranslationContextPrompt(value) {
    globalState.translationContextPrompt = value;
    localStorage.setItem('gemini_manga_translation_context_prompt', value);
}

export function updateApiDelay(value) {
    globalState.apiDelay = parseInt(value, 10) || 8;
    localStorage.setItem('gemini_manga_api_delay', globalState.apiDelay);
}

export function updateMaxRetries(value) {
    globalState.maxRetries = parseInt(value, 10) || 5;
    localStorage.setItem('gemini_manga_max_retries', globalState.maxRetries);
}

export function updateAiProvider(provider) {
    globalState.aiProvider = provider;
    localStorage.setItem('gemini_manga_ai_provider', provider);
    showToast(`Đã chuyển AI Provider sang: ${provider.toUpperCase()}`, "info");
}

export function updateApiEndpoint(val) {
    globalState.customApiEndpoint = val;
    localStorage.setItem('gemini_manga_api_endpoint', val);
}

export function toggleSidebarToolsMenu() {
    const menu = document.getElementById('sidebar-tools-menu');
    if (menu) {
        menu.classList.toggle('hidden');
    }
}

export function toggleMobileSidebar() {
    if (elements.sidebarPanel) {
        elements.sidebarPanel.classList.toggle('mobile-open');
    }
}

export function syncMobileMenuState() {
    if (window.innerWidth >= 1024) {
        if (elements.sidebarPanel) elements.sidebarPanel.classList.remove('mobile-open');
    }
}

export function syncMobileToolbarState() {
    const toolbar = document.getElementById('mobile-bottom-toolbar');
    if (toolbar) {
        toolbar.classList.toggle('hidden', window.innerWidth >= 1024);
    }
}

// 10. Chế độ xem trước đọc giả (Reader / Preview Mode)
export function openPreviewMode() {
    if (globalState.pages.length === 0) {
        showToast("Chưa có trang truyện nào để xem trước!", "warn");
        return;
    }

    previewCurrentPage = Math.max(0, globalState.activePageIndex);
    elements.previewModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    renderPreviewPage();
    document.addEventListener('keydown', previewKeyHandler);
}

export function closePreviewMode() {
    elements.previewModal.classList.add('hidden');
    document.body.style.overflow = '';
    elements.previewBody.innerHTML = '';
    document.removeEventListener('keydown', previewKeyHandler);
    garbageCollectPageCaches();
}

export function previewKeyHandler(e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        closePreviewMode();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        previewPrevPage();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        previewNextPage();
    }
}

export function previewPrevPage() {
    if (previewCurrentPage > 0) {
        previewCurrentPage--;
        renderPreviewPage();
    }
}

export function previewNextPage() {
    if (previewCurrentPage < globalState.pages.length - 1) {
        previewCurrentPage++;
        renderPreviewPage();
    }
}

export function renderPreviewPage() {
    const page = globalState.pages[previewCurrentPage];
    if (!page) return;

    activatePage(page);
    garbageCollectPageCaches();

    elements.previewPageIndicator.textContent = `Trang ${previewCurrentPage + 1}/${globalState.pages.length}`;
    elements.previewBody.innerHTML = '';

    const pageContainer = document.createElement('div');
    pageContainer.style.position = 'relative';
    pageContainer.style.display = 'inline-block';
    pageContainer.style.maxWidth = '100%';
    pageContainer.style.maxHeight = 'calc(100vh - 80px)';

    const bgImg = document.createElement('img');
    bgImg.style.maxWidth = '100%';
    bgImg.style.maxHeight = 'calc(100vh - 80px)';
    bgImg.style.display = 'block';
    bgImg.draggable = false;
    bgImg.style.userSelect = 'none';
    pageContainer.appendChild(bgImg);

    const overlaysContainer = document.createElement('div');
    overlaysContainer.className = "absolute inset-0 select-none overflow-hidden rounded z-20";
    pageContainer.appendChild(overlaysContainer);

    elements.previewBody.appendChild(pageContainer);

    bgImg.onload = async () => {
        await waitForNextPaint();

        let displayW = bgImg.clientWidth;
        let displayH = bgImg.clientHeight;

        if (displayW === 0 || displayH === 0) {
            await new Promise(r => setTimeout(r, 50));
            displayW = bgImg.clientWidth;
            displayH = bgImg.clientHeight;
        }

        const finalW = displayW || 800;
        const finalH = displayH || 600;

        pageContainer.style.width = `${finalW}px`;
        pageContainer.style.height = `${finalH}px`;

        if (page.eraserLayerBlob) {
            const eraserImg = document.createElement('img');
            const eraserUrl = URL.createObjectURL(page.eraserLayerBlob);
            eraserImg.src = eraserUrl;
            eraserImg.style.position = 'absolute';
            eraserImg.style.top = '0';
            eraserImg.style.left = '0';
            eraserImg.style.width = '100%';
            eraserImg.style.height = '100%';
            eraserImg.style.pointerEvents = 'none';
            eraserImg.style.zIndex = '10';
            eraserImg.onload = () => URL.revokeObjectURL(eraserUrl);
            pageContainer.appendChild(eraserImg);
        }

        renderOverlays(overlaysContainer, page, bgImg);
    };

    bgImg.src = page.src;
    elements.previewBody.scrollTop = 0;
}

// 11. Đồng bộ dữ liệu ô thoại lên thanh điều khiển sidebar và công cụ nổi
export function updateActiveBlockEditor() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) {
        elements.noBlockSelectedState.classList.remove('hidden');
        elements.blockEditorContainer.classList.add('hidden');

        if (elements.toeicNoBlockSelectedState) elements.toeicNoBlockSelectedState.classList.remove('hidden');
        if (elements.toeicAnalysisContainer) elements.toeicAnalysisContainer.classList.add('hidden');
        globalState.activeBlockToeicAnalysis = null;
        return;
    }

    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);

    if (!block) {
        globalState.selectedBlockId = null;
        elements.noBlockSelectedState.classList.remove('hidden');
        elements.blockEditorContainer.classList.add('hidden');

        if (elements.toeicNoBlockSelectedState) elements.toeicNoBlockSelectedState.classList.remove('hidden');
        if (elements.toeicAnalysisContainer) elements.toeicAnalysisContainer.classList.add('hidden');
        globalState.activeBlockToeicAnalysis = null;
        return;
    }

    elements.noBlockSelectedState.classList.add('hidden');
    elements.blockEditorContainer.classList.remove('hidden');

    if (elements.toeicNoBlockSelectedState) elements.toeicNoBlockSelectedState.classList.add('hidden');
    if (elements.toeicAnalysisContainer) {
        elements.toeicAnalysisContainer.classList.remove('hidden');

        if (globalState.activeBlockToeicAnalysis && globalState.activeBlockToeicAnalysis.blockId === block.id) {
            displayToeicAnalysis(globalState.activeBlockToeicAnalysis.analysis);
        } else {
            resetToeicAnalysisUI();
        }
    }

    elements.editOriginalText.value = block.original;
    elements.editTranslatedText.value = block.translated;
    elements.lblBlockId.innerText = block.id;

    const speakerInput = document.getElementById('edit-block-speaker');
    const targetInput = document.getElementById('edit-block-target');
    if (speakerInput) speakerInput.value = block.speaker || '';
    if (targetInput) targetInput.value = block.target || '';

    const btnDialogue = document.getElementById('btn-block-type-dialogue');
    const btnSfx = document.getElementById('btn-block-type-sfx');
    const blockType = block.type || 'dialogue';
    if (btnDialogue && btnSfx) {
        if (blockType === 'sfx') {
            btnSfx.className = 'py-1.5 px-2 text-[11px] font-semibold rounded bg-amber-600 text-white flex items-center justify-center gap-1.5 transition-all';
            btnDialogue.className = 'py-1.5 px-2 text-[11px] font-semibold rounded text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5 transition-all';
        } else {
            btnDialogue.className = 'py-1.5 px-2 text-[11px] font-semibold rounded bg-indigo-600 text-white flex items-center justify-center gap-1.5 transition-all';
            btnSfx.className = 'py-1.5 px-2 text-[11px] font-semibold rounded text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5 transition-all';
        }
    }

    const sfxRotateSlider = document.getElementById('slider-sfx-rotate');
    const sfxRotateLbl = document.getElementById('lbl-sfx-rotate');
    const sfxArcSlider = document.getElementById('slider-sfx-arc');
    const sfxArcLbl = document.getElementById('lbl-sfx-arc');

    const currentRotate = block.style.rotate || 0;
    const currentArc = block.style.arcAngle || 0;

    if (sfxRotateSlider) sfxRotateSlider.value = currentRotate;
    if (sfxRotateLbl) sfxRotateLbl.textContent = `${currentRotate}°`;
    if (sfxArcSlider) sfxArcSlider.value = currentArc;
    if (sfxArcLbl) sfxArcLbl.textContent = `${currentArc}°`;

    const btnSfxRestore = document.getElementById('btn-sfx-restore');
    if (btnSfxRestore) {
        if (block.originalBackgroundBackup) {
            btnSfxRestore.classList.remove('hidden');
        } else {
            btnSfxRestore.classList.add('hidden');
        }
    }

    if (elements.styleAutoFit) elements.styleAutoFit.checked = !!globalState.autoFitEnabled;
    elements.styleFont.value = block.style.fontFamily;
    elements.styleFontSize.value = block.style.fontSize;
    elements.lblFontSize.innerText = `${block.style.fontSize}px`;
    elements.styleAlign.value = block.style.align;

    elements.styleBold.checked = block.style.bold;

    elements.styleTextColor.value = block.style.textColor;
    elements.styleTextColorHex.value = block.style.textColor.toUpperCase();
    elements.styleBgColor.value = block.style.bgColor;
    elements.styleBgColorHex.value = block.style.bgColor.toUpperCase();

    elements.styleBgOpacity.value = block.style.bgOpacity;
    elements.lblBgOpacity.innerText = `${block.style.bgOpacity}%`;

    elements.stylePadding.value = block.style.padding;
    elements.lblPadding.innerText = `${block.style.padding}px`;

    if (elements.styleRotate) {
        elements.styleRotate.value = block.style.rotate || 0;
    }
    if (elements.lblRotate) {
        elements.lblRotate.innerText = `${block.style.rotate || 0}°`;
    }

    if (elements.styleStrokeColor) elements.styleStrokeColor.value = block.style.strokeColor || '#ffffff';
    if (elements.styleStrokeColorHex) elements.styleStrokeColorHex.value = (block.style.strokeColor || '#ffffff').toUpperCase();
    if (elements.styleStrokeWidth) elements.styleStrokeWidth.value = block.style.strokeWidth || 0;
    if (elements.lblStrokeWidth) elements.lblStrokeWidth.innerText = `${block.style.strokeWidth || 0}px`;

    if (elements.styleShadowColor) elements.styleShadowColor.value = block.style.shadowColor || '#000000';
    if (elements.styleShadowColorHex) elements.styleShadowColorHex.value = (block.style.shadowColor || '#000000').toUpperCase();
    if (elements.styleShadowBlur) elements.styleShadowBlur.value = block.style.shadowBlur || 0;
    if (elements.lblShadowBlur) elements.lblShadowBlur.innerText = `${block.style.shadowBlur || 0}px`;

    elements.styleMaskShape.value = block.style.maskShape || 'bubble-fit';
    elements.styleMaskSize.value = block.style.maskSize || 'full';

    if (block.style.vertical) {
        elements.btnStyleVert.className = "py-1 text-xs rounded bg-indigo-600 text-white font-semibold";
        elements.btnStyleHoriz.className = "py-1 text-xs rounded bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800 font-semibold";
    } else {
        elements.btnStyleHoriz.className = "py-1 text-xs rounded bg-indigo-600 text-white font-semibold";
        elements.btnStyleVert.className = "py-1 text-xs rounded bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800 font-semibold";
    }
}

// 12. Cập nhật sidebar danh sách trang
export function updatePageListUI() {
    const searchContainer = document.getElementById('pages-search-container');
    const searchInput = document.getElementById('pages-search-input');
    const filterQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';

    if (globalState.pages.length === 0) {
        elements.pagesEmptyState.classList.remove('hidden');
        elements.pagesList.classList.add('hidden');
        if (searchContainer) searchContainer.classList.add('hidden');
        if (searchInput) searchInput.value = '';
        elements.pageCountBadge.innerText = '0';
        elements.btnBatchTranslate.disabled = true;
        elements.btnBatchExport.disabled = true;
        if (elements.btnExportPdf) elements.btnExportPdf.disabled = true;
        if (elements.btnExportProject) elements.btnExportProject.disabled = true;
        if (elements.btnExportScript) elements.btnExportScript.disabled = true;
        if (elements.btnImportScript) elements.btnImportScript.disabled = true;
        if (elements.btnPreviewMode) elements.btnPreviewMode.disabled = true;
        return;
    }

    elements.pagesEmptyState.classList.add('hidden');
    elements.pagesList.classList.remove('hidden');
    if (searchContainer) searchContainer.classList.remove('hidden');
    elements.pageCountBadge.innerText = globalState.pages.length;
    elements.btnBatchTranslate.disabled = false;
    elements.btnBatchExport.disabled = false;
    if (elements.btnExportPdf) elements.btnExportPdf.disabled = false;
    if (elements.btnExportProject) elements.btnExportProject.disabled = false;
    if (elements.btnExportScript) elements.btnExportScript.disabled = false;
    if (elements.btnImportScript) elements.btnImportScript.disabled = false;
    if (elements.btnPreviewMode) elements.btnPreviewMode.disabled = false;

    elements.pagesList.innerHTML = '';
    globalState.pages.forEach((page, index) => {
        // Áp dụng bộ lọc tìm kiếm nhanh theo tên tệp
        if (filterQuery && !page.name.toLowerCase().includes(filterQuery)) {
            return;
        }

        const isActive = index === globalState.activePageIndex;
        const safePageName = escapeHTML(page.name);

        let statusBadge = '';
        if (page.status === 'draft') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-800 text-slate-400">Bản nháp</span>`;
        } else if (page.status === 'queued') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-950 text-indigo-300 animate-pulse">Chờ dịch...</span>`;
        } else if (page.status === 'processing') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-950 text-amber-300 flex items-center gap-1"><i class="fa-solid fa-circle-notch animate-spin text-[8px]"></i> Đang dịch</span>`;
        } else if (page.status === 'done') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-950 text-emerald-300 flex items-center gap-0.5"><i class="fa-solid fa-check text-[8px]"></i> Hoàn thành</span>`;
        } else if (page.status === 'error') {
            statusBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-950 text-red-300">Lỗi</span>`;
        }

        const pageItem = document.createElement('div');
        pageItem.className = `group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${isActive ? 'bg-indigo-600/20 border border-indigo-500/50' : 'bg-slate-950 hover:bg-slate-900 border border-transparent'
            }`;
        pageItem.dataset.pageIndex = String(index);

        pageItem.innerHTML = `
            <div class="flex items-center space-x-2.5 min-w-0 flex-1">
                <div class="relative w-10 h-12 bg-slate-900 rounded overflow-hidden shrink-0 border border-slate-800">
                    <img id="thumb-${page.id}" src="${page.thumbnailSrc || ''}" class="w-full h-full object-cover select-none">
                    <div class="absolute bottom-0 inset-x-0 bg-slate-950/80 text-[8px] text-center text-slate-400 font-mono py-0.5">${index + 1}</div>
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-semibold text-slate-200 truncate pr-2" title="${safePageName}">${safePageName}</p>
                    <div class="flex items-center space-x-1.5 mt-1.5">${statusBadge}</div>
                </div>
            </div>
            <div class="flex items-center space-x-1 shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <button data-action="translate-page" data-index="${index}" title="Dịch trang này" class="w-6 h-6 rounded bg-slate-900 hover:bg-indigo-600 border border-slate-800 hover:border-indigo-500 text-slate-400 hover:text-white flex items-center justify-center transition-all">
                    <i class="fa-solid fa-wand-magic-sparkles text-[10px]"></i>
                </button>
                <button data-action="remove-page" data-index="${index}" title="Xóa" class="w-6 h-6 rounded bg-slate-900 hover:bg-red-600 border border-slate-800 hover:border-red-500 text-slate-400 hover:text-white flex items-center justify-center transition-all">
                    <i class="fa-solid fa-trash-can text-[10px]"></i>
                </button>
            </div>
        `;
        elements.pagesList.appendChild(pageItem);
    });
}

// 13. Khôi phục ảnh nền cũ của ô thoại SFX đã vẽ đè
export async function restoreBackgroundForBlock(blockId) {
    const page = globalState.pages[globalState.activePageIndex];
    if (!page) return;
    const block = page.blocks.find(b => b.id === blockId);
    if (!block || !block.originalBackgroundBackup) return;

    const canvas = elements.eraserCanvas;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const img = new Image();

    await new Promise((resolve) => {
        img.onload = () => {
            const bx = Math.round((block.box.x / 100) * canvas.width);
            const by = Math.round((block.box.y / 100) * canvas.height);
            const bw = Math.round((block.box.w / 100) * canvas.width);
            const bh = Math.round((block.box.h / 100) * canvas.height);

            ctx.save();
            ctx.beginPath();
            ctx.rect(bx, by, bw, bh);
            ctx.clip();
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            ctx.restore();
            resolve();
        };
        img.onerror = resolve;
        img.src = block.originalBackgroundBackup;
    });

    block.originalBackgroundBackup = null;
    await saveEraserDrawingToPage();
    requestOverlayRender();
    updateActiveBlockEditor();
    showToast("Đã khôi phục nền gốc của chữ SFX thành công!", "success");
}

export function restoreOriginalBackground() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    restoreBackgroundForBlock(globalState.selectedBlockId);
}

export function syncTextColorHex(val) {
    let color = val;
    if (color && !color.startsWith('#') && color.length <= 6) {
        color = '#' + color;
    }
    if (elements.styleTextColor) elements.styleTextColor.value = color;
    if (elements.styleTextColorHex) elements.styleTextColorHex.value = color.toUpperCase();
    import('../features/canvas.js').then(canvas => canvas.syncActiveBlockStyle('textColor', color));
}

export function syncBgColorHex(val) {
    let color = val;
    if (color && !color.startsWith('#') && color.length <= 6) {
        color = '#' + color;
    }
    if (elements.styleBgColor) elements.styleBgColor.value = color;
    if (elements.styleBgColorHex) elements.styleBgColorHex.value = color.toUpperCase();
    import('../features/canvas.js').then(canvas => canvas.syncActiveBlockStyle('bgColor', color));
}

export function syncStrokeColorHex(val) {
    let color = val;
    if (color && !color.startsWith('#') && color.length <= 6) {
        color = '#' + color;
    }
    if (elements.styleStrokeColor) elements.styleStrokeColor.value = color;
    if (elements.styleStrokeColorHex) elements.styleStrokeColorHex.value = color.toUpperCase();
    import('../features/canvas.js').then(canvas => canvas.syncActiveBlockStyle('strokeColor', color));
}

export function syncShadowColorHex(val) {
    let color = val;
    if (color && !color.startsWith('#') && color.length <= 6) {
        color = '#' + color;
    }
    if (elements.styleShadowColor) elements.styleShadowColor.value = color;
    if (elements.styleShadowColorHex) elements.styleShadowColorHex.value = color.toUpperCase();
    import('../features/canvas.js').then(canvas => canvas.syncActiveBlockStyle('shadowColor', color));
}

// 14. Thiết lập sự kiện lắng nghe sự kiện DOM toàn cục
export function initEventListeners() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');

    if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('border-indigo-500', 'bg-indigo-600/5');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('border-indigo-500', 'bg-indigo-600/5');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('border-indigo-500', 'bg-indigo-600/5');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                import('../features/io.js').then(io => io.handleUploadedFiles(e.dataTransfer.files));
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                import('../features/io.js').then(io => io.handleUploadedFiles(e.target.files));
            }
        });
    }

    if (elements.pagesList) {
        elements.pagesList.addEventListener('click', (e) => {
            const translateBtn = e.target.closest('[data-action="translate-page"]');
            if (translateBtn) {
                e.stopPropagation();
                const index = Number(translateBtn.dataset.index);
                if (Number.isInteger(index)) {
                        import('../features/ai.js').then(ai => ai.translateSinglePageInBatch(index));
                    }
                return;
            }

            const removeBtn = e.target.closest('[data-action="remove-page"]');
            if (removeBtn) {
                e.stopPropagation();
                const index = Number(removeBtn.dataset.index);
                if (Number.isInteger(index)) {
                    removePage(index);
                }
                return;
            }

            const pageItem = e.target.closest('[data-page-index]');
            if (pageItem) {
                const index = Number(pageItem.dataset.pageIndex);
                if (Number.isInteger(index)) {
                    selectPage(index);
                }
            }
        });
    }

    if (elements.apiKeyInput) {
        elements.apiKeyInput.addEventListener('input', (e) => {
            const key = e.target.value.trim();
            globalState.apiKey = key;
            localStorage.setItem('gemini_manga_api_key', key);
            updateModelLockingUI();
            if (key.startsWith('AIzaSy') && key.length >= 35) {
                fetchGeminiModels();
            }
        });
    }

    if (elements.editOriginalText) {
        elements.editOriginalText.addEventListener('input', (e) => {
            if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
            const page = globalState.pages[globalState.activePageIndex];
            const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
            if (block) {
                block.original = e.target.value;
                globalState.activeBlockToeicAnalysis = null;
                debounceSavePage(page);
            }
        });
    }

    if (elements.customModelInput) {
        elements.customModelInput.addEventListener('input', () => {
            if (document.getElementById('model-select')?.value === CUSTOM_MODEL_VALUE && !document.getElementById('model-select')?.disabled) {
                updateSelectedModel(CUSTOM_MODEL_VALUE);
            }
        });
    }

    document.querySelectorAll('.genre-preset-option').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
            updateTranslationGenrePreset();
        });
    });

    document.addEventListener('keydown', (e) => {
        // Ignored keys in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (globalState.selectedBlockId !== null) {
            const activePage = globalState.pages[globalState.activePageIndex];
            if (!activePage) return;
            const block = activePage.blocks.find(b => b.id === globalState.selectedBlockId);
            if (!block) return;

            if (e.key === '[') {
                e.preventDefault();
                const newSize = Math.max(8, block.style.fontSize - 1);
                import('../features/canvas.js').then(canvas => canvas.syncActiveBlockStyle('fontSize', newSize));
            } else if (e.key === ']') {
                e.preventDefault();
                const newSize = Math.min(100, block.style.fontSize + 1);
                import('../features/canvas.js').then(canvas => canvas.syncActiveBlockStyle('fontSize', newSize));
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                import('../features/canvas.js').then(canvas => canvas.deleteActiveBlock());
            }
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            navigateBlocks(e.shiftKey ? -1 : 1);
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            if (globalState.selectedBlockId) {
                const prevEl = document.getElementById(globalState.selectedBlockId);
                if (prevEl) prevEl.classList.remove('active');
                globalState.selectedBlockId = null;
                if (elements.btnCopyStyle) elements.btnCopyStyle.disabled = true;
                if (elements.btnPasteStyle) elements.btnPasteStyle.disabled = true;
                updateActiveBlockEditor();
            }
            return;
        }

        if (e.key === 'PageUp') {
            e.preventDefault();
            if (globalState.activePageIndex > 0) selectPage(globalState.activePageIndex - 1);
            return;
        }
        if (e.key === 'PageDown') {
            e.preventDefault();
            if (globalState.activePageIndex < globalState.pages.length - 1) selectPage(globalState.activePageIndex + 1);
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            copyBlockStyle();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
            e.preventDefault();
            pasteBlockStyle();
            return;
        }
    });
}

function debounceSavePage(page) {
    import('../core/state.js').then(state => state.debounceSavePage(page));
}

export function closeMobileMenus() {
    if (elements.sidebarPanel) {
        elements.sidebarPanel.classList.remove('mobile-open');
    }
    const rightPanel = document.getElementById('right-panel');
    if (rightPanel) {
        rightPanel.classList.remove('mobile-open');
    }
}

export function toggleLeftSidebar() {
    const leftPanel = document.getElementById('left-panel');
    const toggleBtn = document.getElementById('left-sidebar-toggle-handle');
    if (leftPanel) {
        leftPanel.classList.toggle('hidden');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            if (leftPanel.classList.contains('hidden')) {
                if (icon) icon.className = 'fa-solid fa-chevron-right text-[10px] group-hover:scale-110 transition-transform';
            } else {
                if (icon) icon.className = 'fa-solid fa-chevron-left text-[10px] group-hover:scale-110 transition-transform';
            }
        }
    }
}

export function toggleRightSidebar() {
    const rightPanel = document.getElementById('right-panel');
    const toggleBtn = document.getElementById('right-sidebar-toggle-handle');
    if (rightPanel) {
        rightPanel.classList.toggle('hidden');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            if (rightPanel.classList.contains('hidden')) {
                if (icon) icon.className = 'fa-solid fa-chevron-left text-[10px] group-hover:scale-110 transition-transform';
            } else {
                if (icon) icon.className = 'fa-solid fa-chevron-right text-[10px] group-hover:scale-110 transition-transform';
            }
        }
    }
}

export async function populateCustomFontsDropdown() {
    const fontSelect = document.getElementById('style-font');
    if (!fontSelect) return;

    try {
        const { getAllFontsFromDB } = await import('../core/state.js');
        const fonts = await getAllFontsFromDB();
        
        const customOptions = fontSelect.querySelectorAll('option[data-custom="true"]');
        customOptions.forEach(opt => opt.remove());

        fonts.forEach(font => {
            const opt = document.createElement('option');
            opt.value = font.family;
            opt.textContent = `${font.family} (Custom)`;
            opt.setAttribute('data-custom', 'true');
            fontSelect.appendChild(opt);
        });
    } catch (e) {
        console.error("Error populating custom fonts:", e);
    }
}

export async function registerCustomFont(family, blob) {
    let fontUrl = null;
    try {
        fontUrl = URL.createObjectURL(blob);
        const fontFace = new FontFace(family, `url(${fontUrl})`);
        const loadedFace = await fontFace.load();
        document.fonts.add(loadedFace);

        const fontSelect = document.getElementById('style-font');
        if (fontSelect) {
            let exists = false;
            for (let i = 0; i < fontSelect.options.length; i++) {
                if (fontSelect.options[i].value === family) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                const opt = document.createElement('option');
                opt.value = family;
                opt.textContent = `${family} (Custom)`;
                opt.setAttribute('data-custom', 'true');
                fontSelect.appendChild(opt);
            }
        }
    } catch (err) {
        console.error(`Không thể tải và đăng ký phông chữ ${family}:`, err);
    } finally {
        if (fontUrl) {
            URL.revokeObjectURL(fontUrl);
        }
    }
}

export async function uploadCustomFonts(files) {
    if (!files || files.length === 0) return;
    showToast("Đang nạp phông chữ tùy chỉnh...", "info");

    const { saveFontToDB } = await import('../core/state.js');
    const { requestOverlayRender } = await import('../features/canvas.js');

    let loadedCount = 0;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const family = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').trim();
        if (!family) continue;

        try {
            await saveFontToDB(family, file);
            await registerCustomFont(family, file);
            loadedCount++;
        } catch (err) {
            console.error(`Lỗi lưu font ${file.name}:`, err);
        }
    }

    if (loadedCount > 0) {
        showToast(`Đã nạp thành công ${loadedCount} phông chữ mới!`, "success");
        requestOverlayRender();
    }
}

export async function updateUndoRedoUI() {
    const { undoStack, redoStack } = await import('../core/state.js');
    if (elements.btnUndo) {
        elements.btnUndo.disabled = undoStack.length === 0;
    }
    if (elements.btnRedo) {
        elements.btnRedo.disabled = redoStack.length === 0;
    }
}

window.uploadCustomFonts = uploadCustomFonts;
window.updateUndoRedoUI = updateUndoRedoUI;

// Window bindings for inline HTML onClick handlers
window.setRightTab = setRightTab;
window.setViewMode = setViewMode;
window.changeZoom = changeZoom;
window.resetZoom = resetZoom;
window.toggleApiKeyVisibility = toggleApiKeyVisibility;
window.updateSelectedModel = updateSelectedModel;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.updateSourceLanguage = updateSourceLanguage;
window.updateTargetLanguage = updateTargetLanguage;
window.updatePronounMatrix = updatePronounMatrix;
window.updateGlossary = updateGlossary;
window.toggleStoryMemory = toggleStoryMemory;
window.togglePreserveNames = togglePreserveNames;
window.updateTranslationGenrePreset = updateTranslationGenrePreset;
window.updateTranslationContextPrompt = updateTranslationContextPrompt;
window.updateApiDelay = updateApiDelay;
window.updateMaxRetries = updateMaxRetries;
window.updateAiProvider = updateAiProvider;
window.updateApiEndpoint = updateApiEndpoint;
window.toggleSidebarToolsMenu = toggleSidebarToolsMenu;
window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileMenus = closeMobileMenus;
window.toggleLeftSidebar = toggleLeftSidebar;
window.toggleRightSidebar = toggleRightSidebar;
window.openPreviewMode = openPreviewMode;
window.closePreviewMode = closePreviewMode;
window.previewPrevPage = previewPrevPage;
window.previewNextPage = previewNextPage;
window.restoreOriginalBackground = restoreOriginalBackground;
window.copyBlockStyle = copyBlockStyle;
window.pasteBlockStyle = pasteBlockStyle;
window.selectPage = selectPage;
window.removePage = removePage;
window.syncTextColorHex = syncTextColorHex;
window.syncBgColorHex = syncBgColorHex;
window.syncStrokeColorHex = syncStrokeColorHex;
window.syncShadowColorHex = syncShadowColorHex;

// --- LOREBOOK & CHARACTER DOSSIER UI CONTROLLERS ---
export function openLorebookModal() {
    const modal = document.getElementById('lorebook-dossier-modal');
    if (modal) {
        modal.classList.remove('hidden');
        renderCharacterDossierUI();
        renderLorebookUI();
    }
}

export function closeLorebookModal() {
    const modal = document.getElementById('lorebook-dossier-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

export function switchLorebookTab(tab) {
    const tabDossierBtn = document.getElementById('tab-btn-dossier');
    const tabLorebookBtn = document.getElementById('tab-btn-lorebook');
    const panelDossier = document.getElementById('lorebook-tab-dossier');
    const panelLorebook = document.getElementById('lorebook-tab-lorebook');

    if (tab === 'dossier') {
        if (tabDossierBtn) tabDossierBtn.className = "py-2.5 text-xs font-bold border-b-2 border-indigo-500 text-indigo-400 flex items-center gap-1.5 transition-all";
        if (tabLorebookBtn) tabLorebookBtn.className = "py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-all";
        if (panelDossier) panelDossier.classList.remove('hidden');
        if (panelLorebook) panelLorebook.classList.add('hidden');
    } else {
        if (tabLorebookBtn) tabLorebookBtn.className = "py-2.5 text-xs font-bold border-b-2 border-purple-500 text-purple-400 flex items-center gap-1.5 transition-all";
        if (tabDossierBtn) tabDossierBtn.className = "py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-all";
        if (panelLorebook) panelLorebook.classList.remove('hidden');
        if (panelDossier) panelDossier.classList.add('hidden');
    }
}

export function renderCharacterDossierUI() {
    const container = document.getElementById('dossier-items-list');
    const badge = document.getElementById('dossier-count');
    const items = globalState.characterDossier || [];
    if (badge) badge.textContent = items.length;

    if (!container) return;
    if (items.length === 0) {
        container.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs italic">Chưa có nhân vật nào trong hồ sơ. Hãy thêm nhân vật đầu tiên bên trên!</div>`;
        return;
    }

    container.innerHTML = items.map((item) => `
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-indigo-500/40 transition-all">
            <div class="space-y-1 min-w-0 flex-1">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-slate-200">${escapeHTML(item.originalName)} → <span class="text-indigo-400">${escapeHTML(item.translatedName)}</span></span>
                    <span class="text-[9px] px-1.5 py-0.5 rounded ${item.gender === 'female' ? 'bg-pink-950/60 text-pink-300 border border-pink-500/30' : item.gender === 'male' ? 'bg-sky-950/60 text-sky-300 border border-sky-500/30' : 'bg-slate-800 text-slate-400'} font-semibold">
                        ${item.gender === 'female' ? 'Nữ' : item.gender === 'male' ? 'Nam' : 'Khác'}
                    </span>
                </div>
                <div class="text-[11px] text-slate-400 flex items-center gap-3">
                    <span>💬 Xưng hô: <b>${escapeHTML(item.pronounSelf || 'tôi')}</b> - <b>${escapeHTML(item.pronounTarget || 'cậu')}</b></span>
                    ${item.personality ? `<span class="truncate">🎭 ${escapeHTML(item.personality)}</span>` : ''}
                </div>
            </div>
            <button onclick="removeCharacterDossierEntry('${item.id}')" class="w-7 h-7 hover:bg-red-950 text-red-400 rounded flex items-center justify-center transition-colors" title="Xóa nhân vật">
                <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
        </div>
    `).join('');
}

export function addCharacterDossierEntry() {
    const origInput = document.getElementById('dossier-input-orig');
    const transInput = document.getElementById('dossier-input-trans');
    const genderInput = document.getElementById('dossier-input-gender');
    const selfInput = document.getElementById('dossier-input-self');
    const targetInput = document.getElementById('dossier-input-target');
    const personalityInput = document.getElementById('dossier-input-personality');

    const originalName = origInput?.value.trim() || '';
    const translatedName = transInput?.value.trim() || '';

    if (!originalName || !translatedName) {
        showToast('Vui lòng nhập đầy đủ tên gốc và tên dịch của nhân vật.', 'warn');
        return;
    }

    const newItem = {
        id: 'char_' + Date.now(),
        originalName,
        translatedName,
        gender: genderInput?.value || 'male',
        pronounSelf: selfInput?.value.trim() || 'tôi',
        pronounTarget: targetInput?.value.trim() || 'cậu',
        personality: personalityInput?.value.trim() || ''
    };

    if (!globalState.characterDossier) globalState.characterDossier = [];
    globalState.characterDossier.push(newItem);

    saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);
    renderCharacterDossierUI();

    if (origInput) origInput.value = '';
    if (transInput) transInput.value = '';
    if (selfInput) selfInput.value = '';
    if (targetInput) targetInput.value = '';
    if (personalityInput) personalityInput.value = '';

    showToast(`Đã thêm nhân vật ${translatedName} vào Hồ sơ!`, 'success');
}

export function removeCharacterDossierEntry(id) {
    if (!globalState.characterDossier) return;
    globalState.characterDossier = globalState.characterDossier.filter(c => c.id !== id);
    saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);
    renderCharacterDossierUI();
    showToast('Đã xóa nhân vật khỏi Hồ sơ.', 'info');
}

export function renderLorebookUI() {
    const container = document.getElementById('lorebook-items-list');
    const badge = document.getElementById('lorebook-count');
    const items = globalState.lorebook || [];
    if (badge) badge.textContent = items.length;

    if (!container) return;
    if (items.length === 0) {
        container.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs italic">Chưa có thuật ngữ Lorebook nào. Hãy thêm thuật ngữ đầu tiên bên trên!</div>`;
        return;
    }

    container.innerHTML = items.map((item) => `
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-purple-500/40 transition-all">
            <div class="space-y-1 min-w-0 flex-1">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-slate-200">${escapeHTML(item.originalTerm)} → <span class="text-purple-400">${escapeHTML(item.translatedTerm)}</span></span>
                    <span class="text-[9px] px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-500/30 font-semibold">
                        ${escapeHTML(item.category || 'Khác')}
                    </span>
                </div>
                ${item.note ? `<div class="text-[11px] text-slate-400 truncate">💡 Ghi chú AI: ${escapeHTML(item.note)}</div>` : ''}
            </div>
            <button onclick="removeLorebookTermEntry('${item.id}')" class="w-7 h-7 hover:bg-red-950 text-red-400 rounded flex items-center justify-center transition-colors" title="Xóa thuật ngữ">
                <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
        </div>
    `).join('');
}

export function addLorebookTermEntry() {
    const origInput = document.getElementById('lore-input-orig');
    const transInput = document.getElementById('lore-input-trans');
    const catInput = document.getElementById('lore-input-category');
    const noteInput = document.getElementById('lore-input-note');

    const originalTerm = origInput?.value.trim() || '';
    const translatedTerm = transInput?.value.trim() || '';

    if (!originalTerm || !translatedTerm) {
        showToast('Vui lòng nhập đầy đủ từ gốc và bản dịch chuẩn.', 'warn');
        return;
    }

    const newItem = {
        id: 'lore_' + Date.now(),
        originalTerm,
        translatedTerm,
        category: catInput?.value || 'Khác',
        note: noteInput?.value.trim() || ''
    };

    if (!globalState.lorebook) globalState.lorebook = [];
    globalState.lorebook.push(newItem);

    saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);
    renderLorebookUI();

    if (origInput) origInput.value = '';
    if (transInput) transInput.value = '';
    if (noteInput) noteInput.value = '';

    showToast(`Đã thêm thuật ngữ ${translatedTerm} vào Lorebook!`, 'success');
}

export function removeLorebookTermEntry(id) {
    if (!globalState.lorebook) return;
    globalState.lorebook = globalState.lorebook.filter(l => l.id !== id);
    saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);
    renderLorebookUI();
    showToast('Đã xóa thuật ngữ khỏi Lorebook.', 'info');
}

export function exportLorebookJSON() {
    const data = {
        characterDossier: globalState.characterDossier || [],
        lorebook: globalState.lorebook || []
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lorebook_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã xuất file Lorebook Backup JSON thành công!', 'success');
}

export function importLorebookJSON(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.characterDossier) globalState.characterDossier = data.characterDossier;
            if (data.lorebook) globalState.lorebook = data.lorebook;

            saveProjectMeta(globalState.pages.map(p => p.id), globalState.activePageIndex);
            renderCharacterDossierUI();
            renderLorebookUI();
            showToast('Đã nhập dữ liệu Lorebook & Nhân vật từ file thành công!', 'success');
        } catch (err) {
            showToast('File JSON không hợp lệ hoặc bị hỏng.', 'error');
        }
    };
    reader.readAsText(file);
}

export function filterPagesList() {
    updatePageListUI();
}
window.filterPagesList = filterPagesList;

window.openLorebookModal = openLorebookModal;
window.closeLorebookModal = closeLorebookModal;
window.switchLorebookTab = switchLorebookTab;
window.addCharacterDossierEntry = addCharacterDossierEntry;
window.removeCharacterDossierEntry = removeCharacterDossierEntry;
window.addLorebookTermEntry = addLorebookTermEntry;
export function setBilingualMode(mode) {
    globalState.bilingualMode = mode;
    const btnSub = document.getElementById('btn-bilingual-sub');
    const btnOff = document.getElementById('btn-bilingual-off');

    if (mode === 'sub') {
        if (btnSub) btnSub.className = "px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold transition-all shadow";
        if (btnOff) btnOff.className = "px-2 py-0.5 rounded bg-transparent text-slate-400 text-[10px] font-semibold hover:text-white transition-all";
        showToast("Đã bật Chế độ Song Ngữ (Hiển thị Tiếng Việt + Tiếng Nhật/Anh)", "success");
    } else {
        if (btnOff) btnOff.className = "px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold transition-all shadow";
        if (btnSub) btnSub.className = "px-2 py-0.5 rounded bg-transparent text-slate-400 text-[10px] font-semibold hover:text-white transition-all";
        showToast("Đã chuyển về Chế độ Đơn ngữ chuẩn", "info");
    }
    requestOverlayRender();
}

window.setBilingualMode = setBilingualMode;

