/**
 * Module 8: Manga Font Matcher & Recommender (AI Vision & Custom Font Repository) (TypeScript)
 */

import { formatFileSize, openPreviewModal } from './common';
import type { FontCategory, FontProfile, CustomFontItem, AnalysisResult } from './types';

export const BUILTIN_MANGA_FONTS: CustomFontItem[] = [];

let fontMatchLoadedImg: HTMLImageElement | null = null;
let fontMatchImgDataUrl = '';
let currentTop3Matches: CustomFontItem[] = [];
let customFontsList: CustomFontItem[] = [];
let liveUpdateDebounceTimer: any = null;

export function getCategoryLabel(cat: string): string {
    switch (cat) {
        case 'dialogue': return 'Hội thoại Manga';
        case 'shout': return 'La hét / Cảm thán';
        case 'narration': return 'Dẫn truyện / Tường thuật';
        case 'whisper': return 'Thì thầm / Nghĩ thầm';
        case 'cute': return 'Dễ thương / Hài hước';
        case 'tech': return 'Công nghệ / Robot';
        case 'sfx': return 'SFX Âm thanh';
        default: return 'Đa dụng';
    }
}

// Sub-tabs switcher
export function switchFontMatchSubTab(subTabId: string): void {
    const tabs = ['analyze', 'custom', 'guide'];
    tabs.forEach(t => {
        const btn = document.getElementById(`btn-subtab-fontmatch-${t}`);
        const panel = document.getElementById(`fontmatch-panel-${t}`);
        if (btn) {
            if (t === subTabId) {
                btn.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white shadow flex items-center gap-1.5";
            } else {
                btn.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-slate-200 flex items-center gap-1.5";
            }
        }
        if (panel) {
            if (t === subTabId) {
                panel.classList.remove('hidden');
            } else {
                panel.classList.add('hidden');
            }
        }
    });
}

// --- MODEL MANAGEMENT ENGINE (SYNCED WITH STUDIO SETTINGS) ---
export let cachedGeminiModels: string[] = (() => {
    try {
        const saved = localStorage.getItem('gemini_cached_models');
        return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
})();

export function getModelScore(id: string): number {
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
}

export function getFriendlyModelName(id: string): string {
    switch (id) {
        case "gemini-2.5-flash":
            return "Gemini 2.5 Flash (Khuyên dùng: Siêu tốc & nhận diện chuẩn)";
        case "gemini-2.5-flash-lite":
            return "Gemini 2.5 Flash-Lite (Siêu rẻ & tiết kiệm quota)";
        case "gemini-3.1-flash-lite":
            return "Gemini 3.1 Flash-Lite (Đời mới, tối ưu tốc độ & rẻ)";
        case "gemini-2.5-pro":
            return "Gemini 2.5 Pro (Độ chính xác cao nhất)";
        case "gemini-3.1-pro-preview":
            return "Gemini 3.1 Pro Preview (Chuyên sâu ngữ cảnh)";
        case "gemini-2.0-flash":
            return "Gemini 2.0 Flash (Ổn định)";
        case "gemini-2.0-flash-lite":
            return "Gemini 2.0 Flash-Lite (Tiết kiệm)";
        case "gemini-1.5-flash":
            return "Gemini 1.5 Flash (Truyền thống)";
        case "gemini-1.5-pro":
            return "Gemini 1.5 Pro (Chất lượng cao)";
        default:
            return id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' (Google API Online)';
    }
}

export function updateFontMatchModelDropdown(fetchedModels: string[] = []): void {
    const select = document.getElementById('fontmatch-model-select') as HTMLSelectElement | null;
    if (!select) return;

    const baseKnownModels = [
        "gemini-2.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-2.5-flash-lite",
        "gemini-2.5-pro",
        "gemini-3.1-pro-preview",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-1.5-flash",
        "gemini-1.5-pro"
    ];

    const allModelsSet = new Set<string>([
        ...baseKnownModels,
        ...(Array.isArray(fetchedModels) ? fetchedModels : cachedGeminiModels)
    ]);

    const savedSelected = localStorage.getItem('gemini_manga_ocr_model') ||
        localStorage.getItem('gemini_manga_model') ||
        select.value || 'gemini-3.1-flash-lite';
    if (savedSelected && savedSelected !== '__custom__' && savedSelected !== 'offline-heuristic') {
        allModelsSet.add(savedSelected);
    }

    const sortedModels = Array.from(allModelsSet).sort((a, b) => {
        const scoreA = getModelScore(a);
        const scoreB = getModelScore(b);
        return scoreA !== scoreB ? scoreB - scoreA : a.localeCompare(b);
    });

    select.innerHTML = '';

    // 1. Recommended group
    const recGroup = document.createElement('optgroup');
    recGroup.label = '⚡ Khuyên Dùng Cho Manga & Vision';
    const recList = ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"];
    recList.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = getFriendlyModelName(m);
        recGroup.appendChild(opt);
    });
    select.appendChild(recGroup);

    // 2. High tier & Pro
    const proGroup = document.createElement('optgroup');
    proGroup.label = '🌟 Mô Hình Cao Cấp (Pro / Preview)';
    const proList = ["gemini-2.5-pro", "gemini-3.1-pro-preview", "gemini-1.5-pro"];
    proList.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = getFriendlyModelName(m);
        proGroup.appendChild(opt);
    });
    select.appendChild(proGroup);

    // 3. Online scanned extra models (if any)
    const otherOnline = sortedModels.filter(m => !recList.includes(m) && !proList.includes(m) && m !== 'gemini-2.0-flash' && m !== 'gemini-2.0-flash-lite' && m !== 'gemini-1.5-flash');
    if (otherOnline.length > 0) {
        const onlineGroup = document.createElement('optgroup');
        onlineGroup.label = '🌐 Mô Hình Quét Trực Tuyến Từ Google API';
        otherOnline.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = getFriendlyModelName(m);
            onlineGroup.appendChild(opt);
        });
        select.appendChild(onlineGroup);
    }

    // 4. Stable other versions
    const stableGroup = document.createElement('optgroup');
    stableGroup.label = '📦 Các Phiên Bản Ổn Định Khác';
    const stableList = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];
    stableList.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = getFriendlyModelName(m);
        stableGroup.appendChild(opt);
    });
    select.appendChild(stableGroup);

    // 5. Offline Heuristic
    const offlineGroup = document.createElement('optgroup');
    offlineGroup.label = '🛡️ Chế Độ Không Cần Mạng (Offline)';
    const offOpt = document.createElement('option');
    offOpt.value = 'offline-heuristic';
    offOpt.textContent = '⚡ Offline 100% Heuristic (Không cần API Key & Mạng)';
    offlineGroup.appendChild(offOpt);
    select.appendChild(offlineGroup);

    // 6. Custom model option
    const customGroup = document.createElement('optgroup');
    customGroup.label = '✍️ Tùy Chỉnh';
    const custOpt = document.createElement('option');
    custOpt.value = '__custom__';
    custOpt.textContent = '✍️ Tự nhập model Vision tùy chỉnh...';
    customGroup.appendChild(custOpt);
    select.appendChild(customGroup);

    // Set current selection
    const customInput = document.getElementById('fontmatch-custom-model-input') as HTMLInputElement | null;
    if (allModelsSet.has(savedSelected) || savedSelected === 'offline-heuristic') {
        select.value = savedSelected;
        if (customInput) customInput.classList.add('hidden');
    } else if (savedSelected) {
        select.value = '__custom__';
        if (customInput) {
            customInput.classList.remove('hidden');
            customInput.value = savedSelected;
        }
    } else {
        select.value = 'gemini-3.1-flash-lite';
    }

    onFontMatchModelChange();
}

export async function fetchFontMatchModels(isManual: boolean = false): Promise<void> {
    const apiKeyInput = document.getElementById('fontmatch-api-key') as HTMLInputElement | null;
    let apiKey = (apiKeyInput ? apiKeyInput.value.trim() : '') ||
        localStorage.getItem('gemini_manga_api_key') ||
        localStorage.getItem('gemini_api_key') || '';

    if (!apiKey) {
        updateFontMatchModelDropdown(cachedGeminiModels);
        if (isManual) alert("Vui lòng nhập hoặc kiểm tra Gemini API Key trước khi quét mô hình!");
        return;
    }

    if (!isManual && cachedGeminiModels.length > 0) {
        updateFontMatchModelDropdown(cachedGeminiModels);
        return;
    }

    const btn = document.getElementById('btn-fontmatch-refresh-models');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-[9px]"></i> Đang nạp...';

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
        const resp = await fetch(url);
        if (!resp.ok) {
            updateFontMatchModelDropdown(cachedGeminiModels);
            if (isManual) alert(`Không thể tải Model từ Google API (Mã lỗi ${resp.status}). Vui lòng kiểm tra lại API Key.`);
            return;
        }
        const data = await resp.json();
        if (data && data.models && Array.isArray(data.models)) {
            const geminiModels = data.models
                .filter((m: any) => {
                    const id = m.name ? m.name.replace('models/', '') : '';
                    if (!id) return false;
                    const supportsGen = m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent');
                    if (!supportsGen) return false;
                    if (id.includes('embedding') || id.includes('bison') || id.includes('aqa') || id.includes('imagen') || id.includes('tunedModels/')) return false;
                    return true;
                })
                .map((m: any) => m.name.replace('models/', ''));

            if (geminiModels.length > 0) {
                cachedGeminiModels = geminiModels;
                try {
                    localStorage.setItem('gemini_cached_models', JSON.stringify(geminiModels));
                } catch (e) { }
                updateFontMatchModelDropdown(geminiModels);
                if (isManual) {
                    alert(`Đã nạp và cập nhật thành công ${geminiModels.length} mô hình từ Google Gemini API!`);
                }
            } else {
                updateFontMatchModelDropdown(cachedGeminiModels);
            }
        }
    } catch (err: any) {
        console.warn("Lỗi quét mô hình Gemini:", err);
        updateFontMatchModelDropdown(cachedGeminiModels);
        if (isManual) alert(`Lỗi kết nối mạng khi tải danh sách model: ${err?.message || err}`);
    } finally {
        if (btn) btn.innerHTML = '<i class="fa-solid fa-arrows-rotate text-[9px]"></i> Quét Model';
    }
}

export function getEffectiveFontMatchModel(): string {
    const select = document.getElementById('fontmatch-model-select') as HTMLSelectElement | null;
    if (!select) return 'gemini-3.1-flash-lite';
    if (select.value === '__custom__') {
        const customInput = document.getElementById('fontmatch-custom-model-input') as HTMLInputElement | null;
        const val = customInput ? customInput.value.trim() : '';
        return val || 'gemini-3.1-flash-lite';
    }
    return select.value;
}

export function onFontMatchModelChange(): void {
    const select = document.getElementById('fontmatch-model-select') as HTMLSelectElement | null;
    const model = select ? select.value : '';
    const keyBox = document.getElementById('fontmatch-api-key-container');
    const customInput = document.getElementById('fontmatch-custom-model-input');

    if (customInput) {
        if (model === '__custom__') {
            customInput.classList.remove('hidden');
            customInput.focus();
        } else {
            customInput.classList.add('hidden');
        }
    }

    if (keyBox) {
        if (model === 'offline-heuristic') {
            keyBox.classList.add('opacity-40', 'pointer-events-none');
        } else {
            keyBox.classList.remove('opacity-40', 'pointer-events-none');
        }
    }
}

export function toggleFontMatchApiKeyVisibility(): void {
    const input = document.getElementById('fontmatch-api-key') as HTMLInputElement | null;
    const eye = document.getElementById('fontmatch-key-eye');
    if (!input || !eye) return;
    if (input.type === 'password') {
        input.type = 'text';
        eye.className = 'fa-solid fa-eye-slash';
    } else {
        input.type = 'password';
        eye.className = 'fa-solid fa-eye';
    }
}

export function handleFontMatchImageSelect(file: File): void {
    if (!file || !file.type.startsWith('image/')) {
        alert("Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WEBP).");
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            fontMatchLoadedImg = img;
            fontMatchImgDataUrl = e.target?.result as string;
            const dropzone = document.getElementById('fontmatch-dropzone');
            if (dropzone) dropzone.classList.add('hidden');
            const previewBox = document.getElementById('fontmatch-img-preview-box');
            if (previewBox) previewBox.classList.remove('hidden');
            const thumb = document.getElementById('fontmatch-img-thumb') as HTMLImageElement | null;
            if (thumb) thumb.src = fontMatchImgDataUrl;
            const nameEl = document.getElementById('fontmatch-img-name');
            if (nameEl) nameEl.innerText = file.name || 'image.png';
            const metaEl = document.getElementById('fontmatch-img-meta');
            if (metaEl) metaEl.innerText = `${img.naturalWidth} x ${img.naturalHeight} px • ${formatFileSize(file.size)}`;
        };
        img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
}

export function resetFontMatchImage(): void {
    fontMatchLoadedImg = null;
    fontMatchImgDataUrl = '';
    const previewBox = document.getElementById('fontmatch-img-preview-box');
    if (previewBox) previewBox.classList.add('hidden');
    const dropzone = document.getElementById('fontmatch-dropzone');
    if (dropzone) dropzone.classList.remove('hidden');
    const fileInput = document.getElementById('fontmatch-file-input') as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';
}

export function loadFontMatchSample(type: string): void {
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 360, 360);

    if (type === 'shout') {
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        const cx = 180, cy = 180, numSpikes = 16, outerR = 160, innerR = 120;
        for (let i = 0; i < numSpikes * 2; i++) {
            const r = (i % 2 === 0) ? outerR : innerR;
            const angle = (i * Math.PI) / numSpikes;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 38px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('くらえぇぇっ！', 180, 150);
        ctx.fillText('死ねぇぇ！！！', 180, 210);
    } else if (type === 'narration') {
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(30, 60, 300, 240);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(30, 60, 300, 240);

        ctx.fillStyle = '#0f172a';
        ctx.font = '24px serif';
        ctx.textAlign = 'center';
        ctx.fillText('昔々、ある所に…', 180, 130);
        ctx.fillText('勇敢な戦士がいた。', 180, 180);
        ctx.fillText('運命の歯車が回り出す。', 180, 230);
    } else if (type === 'sfx') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 360, 360);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#94a3b8';
        for (let i = 0; i < 20; i++) {
            ctx.beginPath();
            ctx.moveTo(180, 180);
            const angle = Math.random() * Math.PI * 2;
            ctx.lineTo(180 + Math.cos(angle) * 200, 180 + Math.sin(angle) * 200);
            ctx.stroke();
        }

        ctx.fillStyle = '#000000';
        ctx.font = 'italic 900 64px sans-serif';
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate(180, 180);
        ctx.rotate(-0.15);
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText('ドカーン！', 0, 0);
        ctx.fillText('ドカーン！', 0, 0);
        ctx.restore();
    } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(180, 180, 140, 110, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('何だ…あれは？！', 180, 160);
        ctx.fillText('信じられない…', 180, 205);
    }

    const dataUrl = canvas.toDataURL('image/png');
    const img = new Image();
    img.onload = () => {
        fontMatchLoadedImg = img;
        fontMatchImgDataUrl = dataUrl;
        const dropzone = document.getElementById('fontmatch-dropzone');
        if (dropzone) dropzone.classList.add('hidden');
        const previewBox = document.getElementById('fontmatch-img-preview-box');
        if (previewBox) previewBox.classList.remove('hidden');
        const thumb = document.getElementById('fontmatch-img-thumb') as HTMLImageElement | null;
        if (thumb) thumb.src = dataUrl;
        const nameEl = document.getElementById('fontmatch-img-name');
        if (nameEl) nameEl.innerText = `sample_${type}.png`;
        const metaEl = document.getElementById('fontmatch-img-meta');
        if (metaEl) metaEl.innerText = `360 x 360 px • Mẫu có sẵn`;
    };
    img.src = dataUrl;
}

// --- CORE MATCHING ENGINE ---
export async function runFontMatchAnalysis(): Promise<void> {
    if (!fontMatchLoadedImg) {
        alert("Vui lòng tải lên ảnh chữ tiếng Nhật hoặc chọn một ảnh mẫu trước!");
        return;
    }

    if (!customFontsList || customFontsList.length === 0) {
        alert("Kho font cá nhân của bạn hiện đang trống (0 font)!\n\nHệ thống chỉ phân tích và so khớp trên bộ font bạn tải lên. Vui lòng chuyển sang Tab 'Kho Font Của Bạn' để tải lên các tệp font (.ttf, .otf, .woff, .woff2) trước khi phân tích.");
        switchFontMatchSubTab('custom');
        return;
    }

    const model = getEffectiveFontMatchModel();
    const contextTag = (document.getElementById('fontmatch-context-select') as HTMLSelectElement)?.value || 'auto';
    const apiKeyInput = document.getElementById('fontmatch-api-key') as HTMLInputElement | null;
    let apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
    if (!apiKey) {
        apiKey = localStorage.getItem('gemini_manga_api_key') ||
            localStorage.getItem('gemini_api_key') ||
            localStorage.getItem('manga_gemini_key') || '';
    }
    if (apiKeyInput && apiKey && !apiKeyInput.value) {
        apiKeyInput.value = apiKey;
    }

    if (apiKey) {
        try {
            localStorage.setItem('gemini_manga_api_key', apiKey);
            localStorage.setItem('gemini_api_key', apiKey);
            localStorage.setItem('manga_gemini_key', apiKey);
        } catch (e) { }
    }

    const emptyState = document.getElementById('fontmatch-empty-state');
    if (emptyState) emptyState.classList.add('hidden');
    const resultsContainer = document.getElementById('fontmatch-results-container');
    if (resultsContainer) resultsContainer.classList.add('hidden');
    const loadingBox = document.getElementById('fontmatch-loading-state');
    if (loadingBox) loadingBox.classList.remove('hidden');

    const loadingTitle = document.getElementById('fontmatch-loading-title');
    const loadingDesc = document.getElementById('fontmatch-loading-desc');
    if (loadingTitle) loadingTitle.innerText = "Đang quét đặc trưng hình thái & thần thái chữ...";
    if (loadingDesc) loadingDesc.innerText = `Đang so khớp với ${customFontsList.length} font cá nhân đã tải lên...`;

    let analysisResult: AnalysisResult;

    if (model !== 'offline-heuristic' && apiKey) {
        try {
            if (loadingTitle) loadingTitle.innerText = `Đang kích hoạt AI Vision (${model})...`;
            analysisResult = await callGeminiVisionForFontMatch(model, apiKey, fontMatchImgDataUrl, contextTag);
        } catch (err) {
            console.warn("AI Vision font match failed, falling back to local heuristic:", err);
            if (loadingDesc) loadingDesc.innerText = "Chuyển sang thuật toán phân tích cục bộ Heuristic...";
            analysisResult = analyzeImageWithCanvasHeuristics(fontMatchLoadedImg, contextTag);
        }
    } else {
        await new Promise(r => setTimeout(r, 450));
        analysisResult = analyzeImageWithCanvasHeuristics(fontMatchLoadedImg, contextTag);
    }

    const rankedFonts = rankFontsAgainstAnalysis(customFontsList, analysisResult, contextTag);
    currentTop3Matches = rankedFonts.slice(0, Math.min(3, rankedFonts.length));

    if (loadingBox) loadingBox.classList.add('hidden');
    if (resultsContainer) resultsContainer.classList.remove('hidden');

    const badgeEl = document.getElementById('fontmatch-engine-badge');
    if (badgeEl) badgeEl.innerText = (model !== 'offline-heuristic' && apiKey && analysisResult.isAi) ? 'AI Vision Flash-Lite' : 'Heuristic Offline 100%';
    const catEl = document.getElementById('fontmatch-res-category');
    if (catEl) catEl.innerText = getCategoryLabel(analysisResult.category);
    const weightEl = document.getElementById('fontmatch-res-weight');
    if (weightEl) weightEl.innerText = analysisResult.weightDesc || 'Đậm vừa (Medium)';
    const energyEl = document.getElementById('fontmatch-res-energy');
    if (energyEl) energyEl.innerText = analysisResult.energyDesc || 'Trung bình (Medium)';
    const strokeEl = document.getElementById('fontmatch-res-stroke');
    if (strokeEl) strokeEl.innerText = analysisResult.recommendedStroke || '3px (Viền tương phản)';
    const reasonEl = document.getElementById('fontmatch-res-reasoning');
    if (reasonEl) reasonEl.innerText = analysisResult.reasoning || `Đã phân tích và so khớp với kho ${customFontsList.length} font cá nhân của bạn.`;

    renderTop3FontCards(currentTop3Matches);
    await updateAllFontCanvases();
}

export async function callGeminiVisionForFontMatch(
    modelId: string,
    apiKey: string,
    dataUrl: string,
    contextTag: string
): Promise<AnalysisResult> {
    const base64Data = dataUrl.split(',')[1];
    const mimeType = dataUrl.split(';')[0].split(':')[1] || 'image/png';

    const prompt = `You are an expert Manga & Comic Lettering Director and Typesetter.
Analyze the Japanese/Asian lettering style inside the provided image patch.
Context Hint from user: "${contextTag}".

Evaluate:
1. Category: One of ["dialogue", "shout", "narration", "whisper", "cute", "tech", "sfx"]
2. Weight: score from 0.1 (very thin) to 1.0 (ultra heavy bold)
3. Energy/Emotion: score from 0.1 (calm/peaceful) to 1.0 (explosive/screaming/action)
4. Formality: score from 0.1 (handwritten/organic) to 1.0 (formal/serif/rigid)
5. Roughness: score from 0.1 (clean geometric) to 1.0 (brush/distressed/sfx)
6. Weight description in Vietnamese (e.g. "Nét thanh", "Nét đều chuẩn", "Nét dày đậm", "Chữ khối")
7. Energy description in Vietnamese (e.g. "Bình tĩnh", "Kịch tính", "Hét lớn / Bùng nổ", "Thì thầm")
8. Reasoning: 1-2 Vietnamese sentences explaining why this typography style was detected.
9. Recommended stroke width: e.g. "2px" or "3.5px"

Respond STRICTLY in JSON format:
{
  "category": "shout",
  "weightScore": 0.85,
  "energyScore": 0.9,
  "formalityScore": 0.2,
  "roughnessScore": 0.7,
  "weightDesc": "Nét dày đậm (Bold / Heavy)",
  "energyDesc": "Cảm xúc bùng nổ / La hét (High Energy)",
  "reasoning": "Chữ có nét đậm dày, nét cọ giật mạnh thể hiện cảm xúc giận dữ, thích hợp dùng font in hoa có độ tương phản cao.",
  "recommendedStroke": "3.5px (Viền đen nổi khối)"
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = {
        contents: [{
            parts: [
                { text: prompt },
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                }
            ]
        }],
        generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
        }
    };

    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Gemini API Error ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) throw new Error("Không nhận được dữ liệu phản hồi từ AI");

    const cleanJson = textContent.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    parsed.isAi = true;
    return parsed;
}

export function analyzeImageWithCanvasHeuristics(img: HTMLImageElement, contextTag: string): AnalysisResult {
    const canvas = document.createElement('canvas');
    const w = Math.min(img.naturalWidth || 200, 200);
    const h = Math.min(img.naturalHeight || 200, 200);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return {
            category: 'dialogue',
            weightScore: 0.5,
            energyScore: 0.5,
            formalityScore: 0.4,
            roughnessScore: 0.2,
            isAi: false
        };
    }
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let darkPixels = 0;
    const totalPixels = w * h;
    let edgeTransitions = 0;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 110) {
            darkPixels++;
        }
        if (i > 4 && Math.abs(lum - (0.299 * data[i - 4] + 0.587 * data[i - 3] + 0.114 * data[i - 2])) > 80) {
            edgeTransitions++;
        }
    }

    const darkRatio = darkPixels / totalPixels;
    const edgeDensity = edgeTransitions / totalPixels;
    const aspectRatio = w / Math.max(h, 1);

    let detectedCategory: FontCategory = 'dialogue';
    let weightScore = 0.5;
    let energyScore = 0.5;
    let formalityScore = 0.4;
    let roughnessScore = 0.2;

    if (contextTag && contextTag !== 'auto') {
        detectedCategory = contextTag as FontCategory;
    } else {
        if (darkRatio > 0.35 || edgeDensity > 0.18) {
            detectedCategory = 'shout';
        } else if (aspectRatio > 1.4 && darkRatio < 0.2) {
            detectedCategory = 'narration';
        } else if (darkRatio < 0.12) {
            detectedCategory = 'whisper';
        } else {
            detectedCategory = 'dialogue';
        }
    }

    if (detectedCategory === 'shout') {
        weightScore = 0.85;
        energyScore = 0.9;
        roughnessScore = 0.7;
    } else if (detectedCategory === 'sfx') {
        weightScore = 0.9;
        energyScore = 0.95;
        roughnessScore = 0.85;
    } else if (detectedCategory === 'narration') {
        weightScore = 0.5;
        energyScore = 0.3;
        formalityScore = 0.9;
    } else if (detectedCategory === 'whisper') {
        weightScore = 0.35;
        energyScore = 0.35;
        formalityScore = 0.2;
    } else if (detectedCategory === 'tech') {
        weightScore = 0.65;
        energyScore = 0.6;
        formalityScore = 0.8;
    }

    return {
        category: detectedCategory,
        weightScore,
        energyScore,
        formalityScore,
        roughnessScore,
        weightDesc: weightScore > 0.7 ? 'Nét dày đậm (Bold / Heavy)' : weightScore < 0.4 ? 'Nét mảnh (Light)' : 'Nét đều (Medium)',
        energyDesc: energyScore > 0.7 ? 'Bùng nổ / La hét (High)' : energyScore < 0.4 ? 'Trầm lặng / Thì thầm (Low)' : 'Tự nhiên (Medium)',
        reasoning: `Phân tích mật độ điểm ảnh tối (${(darkRatio * 100).toFixed(0)}%) và độ sắc cạnh viền (${(edgeDensity * 100).toFixed(0)}%) khớp với phong cách ${getCategoryLabel(detectedCategory)}.`,
        recommendedStroke: weightScore > 0.7 ? '3.5px (Viền đậm)' : '2px (Viền chuẩn)',
        isAi: false
    };
}

export function rankFontsAgainstAnalysis(
    fontList: CustomFontItem[],
    analysis: AnalysisResult,
    userContext: string
): CustomFontItem[] {
    const targetCat = (userContext && userContext !== 'auto') ? userContext : analysis.category;
    const tw = analysis.weightScore ?? 0.5;
    const te = analysis.energyScore ?? 0.5;
    const tf = analysis.formalityScore ?? 0.4;
    const tr = analysis.roughnessScore ?? 0.2;

    const scored = fontList.map(font => {
        const fw = font.weightScore ?? 0.5;
        const fe = font.energyScore ?? 0.5;
        const ff = font.formalityScore ?? 0.4;
        const fr = font.roughnessScore ?? 0.2;

        let catBonus = 0;
        if (font.category === targetCat) {
            catBonus = 0.45;
        } else if ((font.category === 'dialogue' && targetCat === 'narration') || (font.category === 'shout' && targetCat === 'sfx')) {
            catBonus = 0.25;
        }

        const dist = Math.sqrt(
            Math.pow(tw - fw, 2) * 0.35 +
            Math.pow(te - fe, 2) * 0.35 +
            Math.pow(tf - ff, 2) * 0.15 +
            Math.pow(tr - fr, 2) * 0.15
        );

        const similarity = Math.max(0.1, 1 - dist) * 0.55 + catBonus;
        return {
            font: font,
            rawScore: similarity
        };
    });

    scored.sort((a, b) => b.rawScore - a.rawScore);

    return scored.map((item, idx) => {
        let matchPercent = 95;
        if (idx === 0) {
            matchPercent = Math.min(98, Math.max(92, Math.round(item.rawScore * 95 + 5)));
        } else if (idx === 1) {
            matchPercent = Math.min(89, Math.max(83, Math.round(item.rawScore * 85 + 4)));
        } else if (idx === 2) {
            matchPercent = Math.min(81, Math.max(74, Math.round(item.rawScore * 75 + 3)));
        } else {
            matchPercent = Math.max(50, Math.round(item.rawScore * 70));
        }

        return {
            ...item.font,
            matchPercent: matchPercent,
            rank: idx + 1
        };
    });
}

export function renderTop3FontCards(top3: CustomFontItem[]): void {
    const grid = document.getElementById('fontmatch-top3-grid');
    if (!grid) return;
    grid.innerHTML = '';

    top3.forEach((item, index) => {
        const rank = index + 1;
        const isTop1 = rank === 1;
        const rankBadge = isTop1
            ? `<span class="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold font-mono flex items-center gap-1"><i class="fa-solid fa-crown text-amber-400"></i> TOP 1 KHỚP NHẤT</span>`
            : rank === 2
                ? `<span class="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 text-xs font-bold font-mono">🥈 TOP 2</span>`
                : `<span class="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold font-mono">🥉 TOP 3</span>`;

        const typeBadge = `<span class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">✨ Font Cá Nhân</span>`;
        const progressColor = isTop1 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : rank === 2 ? 'bg-indigo-500' : 'bg-purple-500';
        const cardBorder = isTop1
            ? 'border-amber-500/40 bg-gradient-to-b from-amber-500/5 via-slate-900 to-slate-900 shadow-xl shadow-amber-500/5'
            : 'border-slate-800 bg-slate-900';

        const card = document.createElement('div');
        card.className = `${cardBorder} border rounded-2xl p-4 flex flex-col gap-3.5 transition-all`;
        card.innerHTML = `
            <div class="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800/80">
                <div class="flex items-center gap-2">
                    ${rankBadge}
                    <div>
                        <h4 class="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                            <span>${item.name}</span>
                            ${typeBadge}
                        </h4>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <div class="flex flex-col items-end">
                        <span class="text-xs font-mono font-bold ${isTop1 ? 'text-emerald-400' : 'text-indigo-300'}">${item.matchPercent}% Tương đồng</span>
                        <div class="w-24 bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800 mt-0.5">
                            <div class="${progressColor} h-full" style="width: ${item.matchPercent}%"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Visual Typography Canvas Render Card -->
            <div class="relative group flex justify-center p-2 rounded-xl bg-slate-950 border border-slate-855 overflow-hidden shadow-inner">
                <canvas id="font-preview-canvas-${rank}" class="w-full max-w-full h-auto rounded-lg shadow cursor-pointer transition-transform group-hover:scale-[1.01]"></canvas>
                <div class="absolute bottom-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" data-action="download-sample" class="px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-indigo-600 border border-slate-700 text-white text-[11px] font-bold shadow-lg transition-colors flex items-center gap-1">
                        <i class="fa-solid fa-download"></i> Tải ảnh mẫu
                    </button>
                </div>
            </div>

            <!-- Description & Action Bar -->
            <div class="flex items-center justify-between flex-wrap gap-2 pt-1 text-xs">
                <p class="text-slate-400 text-[11px] max-w-md">${item.desc}</p>
                <div class="flex items-center gap-2">
                    <button type="button" data-action="copy-name" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-bold border border-slate-700 transition-all flex items-center gap-1.5">
                        <i class="fa-solid fa-copy text-indigo-400"></i> Sao chép tên font
                    </button>
                </div>
            </div>
        `;

        const canvasEl = card.querySelector(`#font-preview-canvas-${rank}`) as HTMLCanvasElement | null;
        if (canvasEl) {
            canvasEl.addEventListener('click', () => openPreviewModal(canvasEl.toDataURL()));
        }

        const btnDownload = card.querySelector('[data-action="download-sample"]');
        if (btnDownload) {
            btnDownload.addEventListener('click', () => downloadFontSampleImage(`font-preview-canvas-${rank}`, item.name));
        }

        const btnCopy = card.querySelector('[data-action="copy-name"]');
        if (btnCopy) {
            btnCopy.addEventListener('click', () => copyFontName(item.name));
        }

        grid.appendChild(card);
    });
}

export async function renderFontVisualCanvas(canvasId: string, fontObj: CustomFontItem): Promise<void> {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas || !fontObj) return;

    const textInput = document.getElementById('fontmatch-live-text') as HTMLTextAreaElement | null;
    const text = textInput ? (textInput.value.trim() || 'Ngươi dám cản đường ta sao?!') : 'Ngươi dám cản đường ta sao?!';

    const fontSize = parseInt((document.getElementById('live-font-size') as HTMLInputElement)?.value || '24', 10);
    const strokeWidth = parseFloat((document.getElementById('live-stroke-width') as HTMLInputElement)?.value || '3');
    const textColor = (document.getElementById('live-text-color') as HTMLInputElement)?.value || '#ffffff';
    const strokeColor = (document.getElementById('live-stroke-color') as HTMLInputElement)?.value || '#000000';
    const isBold = (document.getElementById('live-bold') as HTMLInputElement)?.checked ?? true;
    const isItalic = (document.getElementById('live-italic') as HTMLInputElement)?.checked ?? false;

    const dpr = 2;
    const displayW = 600;
    const displayH = 220;

    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    canvas.style.width = displayW + 'px';
    canvas.style.height = displayH + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const cleanFontName = fontObj.name.replace(/['"]/g, '');
    const fallbackFamily = (fontObj.family && fontObj.family.includes('cursive')) ? 'cursive' : 'sans-serif';
    const fontSpec = `${isBold ? 'bold ' : ''}${isItalic ? 'italic ' : ''}${fontSize}px "${cleanFontName}"`;
    const fontStyleStr = `${isBold ? 'bold ' : ''}${isItalic ? 'italic ' : ''}${fontSize}px "${cleanFontName}", ${fallbackFamily}`;

    try {
        await (document as any).fonts.load(fontSpec, text);
        await (document as any).fonts.ready;
    } catch (e) { }

    const bgGrad = ctx.createLinearGradient(0, 0, displayW, displayH);
    bgGrad.addColorStop(0, '#090d16');
    bgGrad.addColorStop(0.5, '#0f172a');
    bgGrad.addColorStop(1, '#0b0f19');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, displayW, displayH);

    const radGlow = ctx.createRadialGradient(displayW / 2, displayH / 2, 10, displayW / 2, displayH / 2, 260);
    radGlow.addColorStop(0, 'rgba(99, 102, 241, 0.12)');
    radGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radGlow;
    ctx.fillRect(0, 0, displayW, displayH);

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(10, 10, displayW - 20, displayH - 20);

    ctx.font = '600 11px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`FONT: ${cleanFontName.toUpperCase()}`, 18, 16);

    ctx.font = fontStyleStr;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxWidth = displayW - 70;
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
        const testLine = currentLine ? (currentLine + ' ' + words[i]) : words[i];
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = words[i];
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = fontSize * 1.35;
    const startY = (displayH / 2) - ((lines.length - 1) * lineHeight / 2);

    lines.forEach((line, lIdx) => {
        const y = startY + lIdx * lineHeight;
        const x = displayW / 2;

        if (strokeWidth > 0) {
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetY = 2;
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = strokeWidth * 2;
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.strokeText(line, x, y);
            ctx.restore();
        }

        ctx.fillStyle = textColor;
        ctx.fillText(line, x, y);
    });
}

export async function updateAllFontCanvases(): Promise<void> {
    if (!currentTop3Matches || currentTop3Matches.length === 0) return;
    for (let idx = 0; idx < currentTop3Matches.length; idx++) {
        const fontObj = currentTop3Matches[idx];
        const rank = idx + 1;
        await renderFontVisualCanvas(`font-preview-canvas-${rank}`, fontObj);
    }
}

export function onLiveTestTextChange(): void {
    clearTimeout(liveUpdateDebounceTimer);
    liveUpdateDebounceTimer = setTimeout(() => {
        updateAllFontCanvases();
    }, 60);
}

export function setLiveTestText(phrase: string): void {
    const input = document.getElementById('fontmatch-live-text') as HTMLTextAreaElement | null;
    if (input) {
        input.value = phrase;
        updateAllFontCanvases();
    }
}

export function copyFontName(name: string): void {
    navigator.clipboard.writeText(name);
    alert(`Đã sao chép tên phông chữ "${name}" vào khay nhớ tạm!`);
}

export function downloadFontSampleImage(canvasId: string, fontName: string): void {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `MangaFont_${fontName.replace(/\s+/g, '_')}_Preview.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// --- CUSTOM FONT MANAGER (INDEXEDDB PERSISTENCE & DYNAMIC @FONT-FACE) ---
const DB_NAME_FONTS = 'MangaTranslatorDB';
const DB_VERSION_FONTS = 2;
const STORE_FONTS_NAME = 'fonts';
const fontBlobUrlsMap = new Map<string, string>();

export function updateDynamicFontFaceStyles(): void {
    let styleEl = document.getElementById('custom-fonts-dynamic-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'custom-fonts-dynamic-style';
        document.head.appendChild(styleEl);
    }
    let css = '';
    customFontsList.forEach(f => {
        if (f.blob) {
            if (!fontBlobUrlsMap.has(f.name)) {
                fontBlobUrlsMap.set(f.name, URL.createObjectURL(f.blob));
            }
            const url = fontBlobUrlsMap.get(f.name);
            const safeName = f.name.replace(/'/g, "\\'");
            css += `
@font-face {
    font-family: '${safeName}';
    src: url('${url}');
    font-display: swap;
}
`;
        }
    });
    styleEl.textContent = css;
}

export function openFontsDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME_FONTS, DB_VERSION_FONTS);
        req.onupgradeneeded = (e: any) => {
            const db = e.target.result as IDBDatabase;
            if (!db.objectStoreNames.contains(STORE_FONTS_NAME)) {
                db.createObjectStore(STORE_FONTS_NAME, { keyPath: 'family' });
            }
            if (!db.objectStoreNames.contains('pages')) {
                db.createObjectStore('pages', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('meta')) {
                db.createObjectStore('meta');
            }
        };
        req.onsuccess = (e: any) => resolve(e.target.result);
        req.onerror = (e: any) => reject(e.target.error);
    });
}

export function profileFontGlyph(family: string): FontProfile {
    try {
        const canvas = document.createElement('canvas');
        const size = 120;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas 2D context unavailable");

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#000000';
        ctx.font = `80px "${family}", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('M', size / 2, size / 2);

        const imgData = ctx.getImageData(0, 0, size, size);
        const data = imgData.data;

        let darkCount = 0;
        let minX = size, maxX = 0, minY = size, maxY = 0;
        let horizontalTransitions = 0;

        for (let y = 0; y < size; y++) {
            let prevDark = false;
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;
                const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                const isDark = lum < 128;
                if (isDark) {
                    darkCount++;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
                if (isDark !== prevDark) {
                    horizontalTransitions++;
                    prevDark = isDark;
                }
            }
        }

        const bboxW = Math.max(1, maxX - minX);
        const bboxH = Math.max(1, maxY - minY);
        const bboxArea = bboxW * bboxH;
        const inkDensity = bboxArea > 0 ? (darkCount / bboxArea) : 0.35;
        const transitionDensity = bboxArea > 0 ? (horizontalTransitions / bboxArea) : 0.05;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#000000';
        ctx.fillText('a', size / 2, size / 2);
        const lowData = ctx.getImageData(0, 0, size, size).data;
        let lowDark = 0;
        for (let i = 0; i < lowData.length; i += 4) {
            if (lowData[i] < 128) lowDark++;
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#000000';
        ctx.fillText('A', size / 2, size / 2);
        const upData = ctx.getImageData(0, 0, size, size).data;
        let upDark = 0;
        for (let i = 0; i < upData.length; i += 4) {
            if (upData[i] < 128) upDark++;
        }

        const isAllCaps = Math.abs(lowDark - upDark) < (Math.max(1, upDark) * 0.08) && upDark > 40;

        const weightScore = Math.max(0.1, Math.min(1.0, (inkDensity - 0.18) / 0.52));
        const roughnessScore = Math.max(0.05, Math.min(1.0, transitionDensity * 11));
        const energyScore = Math.max(0.1, Math.min(1.0, weightScore * 0.5 + roughnessScore * 0.3 + (isAllCaps ? 0.2 : 0.0)));
        const formalityScore = Math.max(0.1, Math.min(1.0, 1.0 - roughnessScore * 0.6 - (isAllCaps ? 0.2 : 0.0)));

        let category: FontCategory = 'dialogue';
        if (roughnessScore > 0.62 || (weightScore > 0.85 && roughnessScore > 0.35)) {
            category = 'sfx';
        } else if (isAllCaps || weightScore > 0.72 || energyScore > 0.78) {
            category = 'shout';
        } else if (weightScore < 0.34 || (roughnessScore > 0.45 && weightScore < 0.42)) {
            category = 'whisper';
        } else if (formalityScore > 0.75 && Math.abs((bboxW / bboxH) - 0.7) < 0.25) {
            category = 'narration';
        } else {
            category = 'dialogue';
        }

        return {
            weightScore: Number(weightScore.toFixed(2)),
            energyScore: Number(energyScore.toFixed(2)),
            formalityScore: Number(formalityScore.toFixed(2)),
            roughnessScore: Number(roughnessScore.toFixed(2)),
            category: category,
            isAllCaps: isAllCaps
        };
    } catch (err) {
        console.warn(`Lỗi profiling font "${family}":`, err);
        return {
            weightScore: 0.55,
            energyScore: 0.55,
            formalityScore: 0.45,
            roughnessScore: 0.2,
            category: 'dialogue',
            isAllCaps: false
        };
    }
}

// --- CUSTOM FONT STATE & PAGINATION ---
let customFontCurrentFilter = 'all';
let customFontSearchQuery = '';
let customFontSortOrder = 'date-desc';
const customFontPageSize = 24;
let customFontCurrentPage = 1;

export function updateCustomFontsBadge(): void {
    const badge = document.getElementById('fontmatch-custom-badge');
    if (badge) badge.innerText = String(customFontsList.length);
}

export async function loadAndRegisterCustomFontsFromDB(): Promise<void> {
    try {
        const db = await openFontsDB();
        const tx = db.transaction(STORE_FONTS_NAME, 'readonly');
        const store = tx.objectStore(STORE_FONTS_NAME);
        const req = store.getAll();
        const entries: any[] = await new Promise((res, rej) => {
            req.onsuccess = () => res(req.result || []);
            req.onerror = (e: any) => rej(e.target.error);
        });

        customFontsList = [];
        for (const item of entries) {
            if (!item || !item.family || !item.blob) continue;
            try {
                if (!fontBlobUrlsMap.has(item.family)) {
                    fontBlobUrlsMap.set(item.family, URL.createObjectURL(item.blob));
                }

                const buffer = await item.blob.arrayBuffer();
                const fontFace = new FontFace(item.family, buffer);
                await fontFace.load();
                (document as any).fonts.add(fontFace);

                let profile: FontProfile = {
                    weightScore: item.weightScore,
                    energyScore: item.energyScore,
                    formalityScore: item.formalityScore,
                    roughnessScore: item.roughnessScore,
                    category: item.category,
                    isAllCaps: item.isAllCaps
                };
                if (!profile.weightScore || profile.weightScore === 0.6) {
                    profile = profileFontGlyph(item.family);
                }

                customFontsList.push({
                    id: 'custom_' + item.family.toLowerCase().replace(/\s+/g, '_'),
                    name: item.family,
                    family: `'${item.family}', sans-serif`,
                    fontClass: 'font-custom',
                    category: profile.category || 'dialogue',
                    type: 'custom',
                    weightScore: profile.weightScore || 0.55,
                    energyScore: profile.energyScore || 0.55,
                    formalityScore: profile.formalityScore || 0.45,
                    roughnessScore: profile.roughnessScore || 0.2,
                    isAllCaps: !!profile.isAllCaps,
                    blob: item.blob,
                    size: item.blob.size,
                    dateAdded: item.dateAdded || Date.now(),
                    desc: `Font cá nhân (Độ đậm: ${((profile.weightScore || 0.55) * 100).toFixed(0)}% • Năng lượng: ${((profile.energyScore || 0.55) * 100).toFixed(0)}%).`,
                    recommendedStroke: (profile.weightScore || 0.55) > 0.7 ? '3.5px' : '2.5px'
                });
            } catch (fontErr) {
                console.warn(`Lỗi nạp font Face "${item.family}":`, fontErr);
            }
        }
        updateDynamicFontFaceStyles();
        updateCustomFontsBadge();
        renderCustomFontsUI();
    } catch (err) {
        console.warn("Lỗi đọc IndexedDB custom fonts:", err);
    }
}

export async function handleCustomFontUpload(files: File[]): Promise<void> {
    if (!files || files.length === 0) return;

    const db = await openFontsDB();
    const total = files.length;
    const progressBox = document.getElementById('fontmatch-profiling-progress-box');
    const progressBar = document.getElementById('fontmatch-profiling-progress-bar');
    const progressPercent = document.getElementById('fontmatch-profiling-percent');
    const progressSubtext = document.getElementById('fontmatch-profiling-subtext');
    const progressTitle = document.getElementById('fontmatch-profiling-status-title');

    if (progressBox) progressBox.classList.remove('hidden');

    const batchSize = 15;
    let processed = 0;

    for (let i = 0; i < total; i += batchSize) {
        const batch = files.slice(i, i + batchSize);

        for (const file of batch) {
            if (!file || !file.name) continue;
            const cleanName = file.name.replace(/\.[^/.]+$/, '').trim();
            const family = cleanName.replace(/[^a-zA-Z0-9\s_-]/g, ' ').replace(/\s+/g, ' ').trim() || 'CustomFont';

            if (progressSubtext) progressSubtext.innerText = `Đang phân tích hình thái glyph: ${family}...`;

            try {
                fontBlobUrlsMap.set(family, URL.createObjectURL(file));

                const buffer = await file.arrayBuffer();
                const fontFace = new FontFace(family, buffer);
                await fontFace.load();
                (document as any).fonts.add(fontFace);

                const profile = profileFontGlyph(family);

                const tx = db.transaction(STORE_FONTS_NAME, 'readwrite');
                const store = tx.objectStore(STORE_FONTS_NAME);
                await new Promise((res, rej) => {
                    const putReq = store.put({
                        family: family,
                        blob: file,
                        category: profile.category,
                        weightScore: profile.weightScore,
                        energyScore: profile.energyScore,
                        formalityScore: profile.formalityScore,
                        roughnessScore: profile.roughnessScore,
                        isAllCaps: profile.isAllCaps,
                        dateAdded: Date.now()
                    });
                    putReq.onsuccess = res;
                    putReq.onerror = rej;
                });

                const newFontObj: CustomFontItem = {
                    id: 'custom_' + family.toLowerCase().replace(/\s+/g, '_'),
                    name: family,
                    family: `'${family}', sans-serif`,
                    fontClass: 'font-custom',
                    category: profile.category,
                    type: 'custom',
                    weightScore: profile.weightScore,
                    energyScore: profile.energyScore,
                    formalityScore: profile.formalityScore,
                    roughnessScore: profile.roughnessScore,
                    isAllCaps: profile.isAllCaps,
                    blob: file,
                    size: file.size,
                    dateAdded: Date.now(),
                    desc: `Font cá nhân (Độ đậm: ${(profile.weightScore * 100).toFixed(0)}% • Năng lượng: ${(profile.energyScore * 100).toFixed(0)}%).`,
                    recommendedStroke: profile.weightScore > 0.7 ? '3.5px' : '2.5px'
                };

                const existingIdx = customFontsList.findIndex(f => f.name === family);
                if (existingIdx >= 0) {
                    customFontsList[existingIdx] = newFontObj;
                } else {
                    customFontsList.push(newFontObj);
                }
            } catch (err) {
                console.warn(`Lỗi nạp font "${file.name}":`, err);
            }
            processed++;
        }

        const pct = Math.min(100, Math.round((processed / total) * 100));
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressPercent) progressPercent.innerText = `${pct}% (${processed}/${total})`;

        await new Promise(r => setTimeout(r, 10));
    }

    if (progressTitle) progressTitle.innerText = `✅ Hoàn thành phân tích hình thái ${total} font!`;
    setTimeout(() => {
        if (progressBox) progressBox.classList.add('hidden');
    }, 1800);

    updateDynamicFontFaceStyles();
    updateCustomFontsBadge();
    renderCustomFontsUI();
    alert(`🎉 Đã nạp & tự động phân tích hình thái học xong ${total} font! Bạn có thể bắt đầu so khớp ảnh.`);
}

export async function reprofileAllCustomFonts(): Promise<void> {
    if (customFontsList.length === 0) {
        alert("Chưa có font cá nhân nào trong kho để phân tích!");
        return;
    }
    if (!confirm(`Chạy lại thuật toán Auto-Profiling cho toàn bộ ${customFontsList.length} font?`)) return;

    const db = await openFontsDB();
    const total = customFontsList.length;
    const progressBox = document.getElementById('fontmatch-profiling-progress-box');
    const progressBar = document.getElementById('fontmatch-profiling-progress-bar');
    const progressPercent = document.getElementById('fontmatch-profiling-percent');
    const progressSubtext = document.getElementById('fontmatch-profiling-subtext');
    if (progressBox) progressBox.classList.remove('hidden');

    for (let i = 0; i < total; i++) {
        const item = customFontsList[i];
        if (progressSubtext) progressSubtext.innerText = `Phân tích lại: ${item.name}...`;

        const profile = profileFontGlyph(item.name);
        item.category = profile.category;
        item.weightScore = profile.weightScore;
        item.energyScore = profile.energyScore;
        item.formalityScore = profile.formalityScore;
        item.roughnessScore = profile.roughnessScore;
        item.isAllCaps = profile.isAllCaps;
        item.desc = `Font cá nhân (Độ đậm: ${(profile.weightScore * 100).toFixed(0)}% • Năng lượng: ${(profile.energyScore * 100).toFixed(0)}%).`;

        const tx = db.transaction(STORE_FONTS_NAME, 'readwrite');
        const store = tx.objectStore(STORE_FONTS_NAME);
        store.put({
            family: item.name,
            blob: item.blob,
            category: profile.category,
            weightScore: profile.weightScore,
            energyScore: profile.energyScore,
            formalityScore: profile.formalityScore,
            roughnessScore: profile.roughnessScore,
            isAllCaps: profile.isAllCaps,
            dateAdded: item.dateAdded || Date.now()
        });

        const pct = Math.min(100, Math.round(((i + 1) / total) * 100));
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressPercent) progressPercent.innerText = `${pct}% (${i + 1}/${total})`;

        if (i % 20 === 0) await new Promise(r => setTimeout(r, 5));
    }

    setTimeout(() => {
        if (progressBox) progressBox.classList.add('hidden');
    }, 1200);

    renderCustomFontsUI();
    alert(`Đã hoàn tất phân tích lại hình thái ${total} font!`);
}

export async function clearAllCustomFonts(): Promise<void> {
    if (customFontsList.length === 0) return;
    if (!confirm(`CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ ${customFontsList.length} font cá nhân khỏi thư viện?`)) return;
    if (!confirm(`Xác nhận lần 2: Hành động này không thể hoàn tác!`)) return;

    try {
        const db = await openFontsDB();
        const tx = db.transaction(STORE_FONTS_NAME, 'readwrite');
        const store = tx.objectStore(STORE_FONTS_NAME);
        await new Promise((res, rej) => {
            const req = store.clear();
            req.onsuccess = res;
            req.onerror = rej;
        });

        fontBlobUrlsMap.forEach(url => URL.revokeObjectURL(url));
        fontBlobUrlsMap.clear();
        customFontsList = [];

        updateDynamicFontFaceStyles();
        updateCustomFontsBadge();
        renderCustomFontsUI();
        alert("Đã xóa sạch toàn bộ kho font tùy chỉnh!");
    } catch (err) {
        console.error("Lỗi xóa toàn bộ font:", err);
    }
}

export async function deleteCustomFont(family: string): Promise<void> {
    if (!confirm(`Xóa font "${family}" khỏi kho font cá nhân?`)) return;
    try {
        const db = await openFontsDB();
        const tx = db.transaction(STORE_FONTS_NAME, 'readwrite');
        const store = tx.objectStore(STORE_FONTS_NAME);
        await new Promise((res, rej) => {
            const req = store.delete(family);
            req.onsuccess = res;
            req.onerror = rej;
        });

        if (fontBlobUrlsMap.has(family)) {
            const url = fontBlobUrlsMap.get(family);
            if (url) URL.revokeObjectURL(url);
            fontBlobUrlsMap.delete(family);
        }
        customFontsList = customFontsList.filter(f => f.name !== family);
        updateDynamicFontFaceStyles();
        updateCustomFontsBadge();
        renderCustomFontsUI();
    } catch (err) {
        console.error("Lỗi xóa font:", err);
    }
}

export function setCustomFontCategoryFilter(cat: string): void {
    customFontCurrentFilter = cat;
    customFontCurrentPage = 1;
    document.querySelectorAll('.custom-cat-filter').forEach(btn => {
        btn.className = "custom-cat-filter px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 hover:text-slate-200 transition-all whitespace-nowrap";
    });
    const activeBtn = document.getElementById(`btn-custom-filter-${cat}`);
    if (activeBtn) {
        activeBtn.className = "custom-cat-filter px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white transition-all whitespace-nowrap";
    }
    renderCustomFontsUI();
}

export function onCustomFontFilterChange(): void {
    const searchInput = document.getElementById('fontmatch-custom-search') as HTMLInputElement | null;
    customFontSearchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const sortSelect = document.getElementById('fontmatch-custom-sort') as HTMLSelectElement | null;
    customFontSortOrder = sortSelect ? sortSelect.value : 'date-desc';
    customFontCurrentPage = 1;
    renderCustomFontsUI();
}

export function loadMoreCustomFonts(): void {
    customFontCurrentPage++;
    renderCustomFontsUI();
}

export function renderCustomFontsUI(): void {
    const container = document.getElementById('fontmatch-custom-fonts-container');
    if (!container) return;

    if (customFontsList.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-12 text-center flex flex-col items-center justify-center gap-3 text-slate-500">
                <div class="w-16 h-16 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600">
                    <i class="fa-solid fa-font text-3xl"></i>
                </div>
                <h4 class="text-sm font-bold text-slate-400">Chưa có font tùy chỉnh nào trong kho</h4>
                <p class="text-xs text-slate-600 max-w-sm">Kéo thả toàn bộ thư mục hoặc nhiều file font (.ttf/.otf) vào khung tải lên bên trên để hệ thống tự động phân tích hình thái hàng loạt!</p>
            </div>
        `;
        const loadMoreBox = document.getElementById('fontmatch-custom-load-more-box');
        if (loadMoreBox) loadMoreBox.classList.add('hidden');
        return;
    }

    const filtered = customFontsList.filter(f => {
        const matchesCat = (customFontCurrentFilter === 'all') || (f.category === customFontCurrentFilter);
        const matchesSearch = !customFontSearchQuery || f.name.toLowerCase().includes(customFontSearchQuery);
        return matchesCat && matchesSearch;
    });

    filtered.sort((a, b) => {
        if (customFontSortOrder === 'name-asc') return a.name.localeCompare(b.name);
        if (customFontSortOrder === 'weight-desc') return (b.weightScore || 0) - (a.weightScore || 0);
        if (customFontSortOrder === 'weight-asc') return (a.weightScore || 0) - (b.weightScore || 0);
        if (customFontSortOrder === 'energy-desc') return (b.energyScore || 0) - (a.energyScore || 0);
        return (b.dateAdded || 0) - (a.dateAdded || 0);
    });

    const listCount = document.getElementById('fontmatch-custom-list-count');
    if (listCount) {
        if (filtered.length === customFontsList.length) {
            listCount.innerText = `${customFontsList.length} Font`;
        } else {
            listCount.innerText = `${filtered.length} / ${customFontsList.length} Font`;
        }
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-8 text-center flex flex-col items-center justify-center gap-2 text-slate-500">
                <i class="fa-solid fa-filter-circle-xmark text-2xl text-slate-600"></i>
                <p class="text-xs">Không tìm thấy font nào phù hợp với bộ lọc "${customFontSearchQuery || customFontCurrentFilter}".</p>
            </div>
        `;
        const loadMoreBox = document.getElementById('fontmatch-custom-load-more-box');
        if (loadMoreBox) loadMoreBox.classList.add('hidden');
        return;
    }

    const visibleLimit = customFontCurrentPage * customFontPageSize;
    const visibleItems = filtered.slice(0, visibleLimit);

    container.innerHTML = '';
    visibleItems.forEach(font => {
        const card = document.createElement('div');
        card.className = "bg-slate-950 border border-slate-855 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-md hover:border-slate-700 transition-all";

        const safeName = font.name.replace(/'/g, "\\'");
        const wPct = Math.round((font.weightScore || 0.5) * 100);
        const ePct = Math.round((font.energyScore || 0.5) * 100);
        const isAllCapsBadge = font.isAllCaps ? `<span class="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 text-[9px] font-bold border border-amber-500/30">IN HOA</span>` : '';

        card.innerHTML = `
            <div class="flex items-center justify-between pb-2 border-b border-slate-850">
                <div class="overflow-hidden pr-2">
                    <h4 class="text-xs font-bold text-slate-200 truncate" title="${font.name}">${font.name}</h4>
                    <div class="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span class="text-[10px] text-indigo-300 font-semibold">${getCategoryLabel(font.category)}</span>
                        <span class="text-[9px] text-slate-500 font-mono">• ${formatFileSize(font.size)}</span>
                        ${isAllCapsBadge}
                    </div>
                </div>
                <button type="button" data-action="delete-font" class="w-7 h-7 shrink-0 rounded-lg bg-slate-900 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-800 transition-colors flex items-center justify-center text-xs" title="Xóa font">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>

            <div class="p-3.5 bg-slate-900 rounded-xl border border-slate-800/80 overflow-hidden">
                <p class="text-base text-slate-100 font-medium leading-relaxed font-sample-text" style="font-family: '${safeName}', sans-serif !important;">
                    Học, học nữa, học mãi. 1234567890
                </p>
                <p class="text-sm text-indigo-300 font-bold mt-1.5 font-sample-text" style="font-family: '${safeName}', sans-serif !important;">
                    Manga Translator Studio Việt Hóa!
                </p>
            </div>

            <div class="flex items-center justify-between pt-1 text-[10.5px]">
                <div class="flex items-center gap-2 text-slate-400 text-[10px] font-mono">
                    <span title="Độ dày nét font (Weight)"><i class="fa-solid fa-bold text-slate-500"></i> ${wPct}%</span>
                    <span title="Độ bùng nổ năng lượng (Energy)"><i class="fa-solid fa-bolt text-amber-500/80"></i> ${ePct}%</span>
                </div>
                <button type="button" data-action="copy-name" class="text-indigo-400 hover:underline font-bold flex items-center gap-1">
                    <i class="fa-solid fa-copy text-[9px]"></i> Sao chép
                </button>
            </div>
        `;

        const btnDel = card.querySelector('[data-action="delete-font"]');
        if (btnDel) {
            btnDel.addEventListener('click', () => deleteCustomFont(font.name));
        }

        const btnCopy = card.querySelector('[data-action="copy-name"]');
        if (btnCopy) {
            btnCopy.addEventListener('click', () => copyFontName(font.name));
        }

        container.appendChild(card);
    });

    const loadMoreBox = document.getElementById('fontmatch-custom-load-more-box');
    const remaining = filtered.length - visibleLimit;
    if (loadMoreBox) {
        if (remaining > 0) {
            loadMoreBox.classList.remove('hidden');
            const remEl = document.getElementById('fontmatch-load-more-remaining');
            if (remEl) remEl.innerText = `(Còn ${remaining} font)`;
        } else {
            loadMoreBox.classList.add('hidden');
        }
    }
}

export function refreshCustomFontsUI(): void {
    loadAndRegisterCustomFontsFromDB();
}

export function initFontMatcherModule(): void {
    try {
        (document as any).fonts.onloadingdone = () => {
            updateAllFontCanvases();
        };
    } catch (e) { }

    loadAndRegisterCustomFontsFromDB();

    const savedKey = localStorage.getItem('gemini_manga_api_key') ||
        localStorage.getItem('gemini_api_key') ||
        localStorage.getItem('manga_gemini_key') || '';
    const keyInput = document.getElementById('fontmatch-api-key') as HTMLInputElement | null;
    if (keyInput && savedKey) {
        keyInput.value = savedKey;
    }

    updateFontMatchModelDropdown(cachedGeminiModels);

    if (savedKey) {
        fetchFontMatchModels(false);
    }

    if (keyInput) {
        keyInput.addEventListener('input', (e: Event) => {
            const target = e.target as HTMLInputElement;
            const k = target.value.trim();
            try {
                localStorage.setItem('gemini_manga_api_key', k);
                localStorage.setItem('gemini_api_key', k);
                localStorage.setItem('manga_gemini_key', k);
            } catch (err) { }
        });
    }

    window.addEventListener('paste', (e: ClipboardEvent) => {
        const secFont = document.getElementById('sec-fontmatch');
        if (!secFont || secFont.classList.contains('hidden')) return;

        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    handleFontMatchImageSelect(blob);
                    break;
                }
            }
        }
    });

    const fontMatchInput = document.getElementById('fontmatch-file-input');
    if (fontMatchInput) {
        fontMatchInput.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.files && target.files[0]) {
                handleFontMatchImageSelect(target.files[0]);
            }
        });
    }

    const customFontInput = document.getElementById('fontmatch-custom-files');
    if (customFontInput) {
        customFontInput.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.files && target.files.length > 0) {
                handleCustomFontUpload(Array.from(target.files));
            }
        });
    }
}
