// Simple UI Internationalization (i18n) for Manga Translator Studio
import { globalState } from './state';
import { safeSetLocalStorage } from './utils/storage';

export const i18nDict: Record<string, Record<string, string>> = {
    vi: {
        // Left Panel - Image Source
        "image-source": "Nguồn ảnh",
        "image-source-sub": "Tải truyện và quản lý trang bên dưới",
        "settings-btn": "Cài đặt",
        "find-replace-btn": "Tìm & Thay thế",
        "diamond-balance-btn": "Cân đối Diamond",
        "upload-title": "Tải ảnh Manga lên",
        "upload-sub": "Hỗ trợ chọn hoặc thả nhiều ảnh cùng lúc",
        "page-list-label": "Danh sách trang",
        "sort-pages-btn": "Sắp xếp tên",
        "clear-project-btn": "Xóa dự án",
        
        // Right Panel - Tabs & Editor
        "tab-edit": "Nội dung",
        "tab-style": "Định dạng",
        "no-block-selected": "Nhập chọn một ô thoại trên ảnh để chỉnh sửa",
        "original-text-label": "Chữ gốc (OCR/Gốc):",
        "original-text-placeholder": "Chữ gốc tự động nhận diện từ ảnh...",
        "translated-text-label": "Bản dịch (Dịch thuật):",
        "translated-text-placeholder": "Nhập bản dịch hoặc bấm Dịch tự động...",
        "translate-block-btn": "Dịch ô này",
        "font-family-label": "Phông chữ (Font)",
        "font-size-label": "Cỡ chữ (Font Size)",
        "align-label": "Căn lề (Align)",
        "writing-direction-label": "Hướng viết",
        "horizontal-btn": "Ngang",
        "vertical-btn": "Dọc",
        "bold-label": "Chữ In đậm (Bold)",
        "text-color-label": "Màu chữ",
        "bg-color-label": "Màu nền che",
        "bg-opacity-label": "Độ mờ của nền che (Opacity)",
        "stroke-label": "Viền chữ (Stroke)",
        "shadow-label": "Bóng đổ (Drop Shadow)",
        "masking-label": "Mặt nạ xóa chữ cũ (Masking)",
        "mask-shape-label": "Dáng mặt nạ",
        "mask-size-label": "Kích cỡ che",
        "padding-label": "Khoảng đệm chữ (Padding)",
        "rotation-label": "Xoay ô dịch (Rotation)",
        
        // Settings Modal
        "settings-modal-title": "Cài đặt dịch thuật",
        "settings-modal-sub": "API key, mô hình và các thông số dịch thuật",
        "ui-lang-label": "Ngôn ngữ giao diện (UI Language)",
        "ai-provider-label": "Nhà cung cấp AI (Provider)",
        "api-key-label": "Gemini API Key",
        "api-key-placeholder": "Tự động sử dụng key của hệ thống...",
        "ai-model-label": "Mô hình AI (Model)",
        "trans-config-title": "Cấu hình dịch thuật",
        "source-lang-label": "Ngôn ngữ nguồn (Source Lang)",
        "target-lang-label": "Ngôn ngữ đích (Target Lang)",
        "preserve-names-label": "Không dịch tên nhân vật",
        "preserve-names-sub": "Giữ nguyên Romaji/English (vd: Luffy, Naruto, Sakura).",
        "glossary-label": "Tên cần giữ nguyên (cách nhau bằng dấu phẩy):",
        "glossary-placeholder": "Ví dụ: Luffy, Zoro, Nami, Sakura",
        "pronoun-matrix-title": "Ma trận xưng hô nhân vật",
        "pronoun-matrix-sub": "Khai báo các nhân vật chính và cách họ xưng hô chéo với nhau để bản dịch tiếng Việt luôn tự nhiên, nhất quán.",
        "pronoun-char-placeholder": "Tên nhân vật (vd: Luffy)",
        "add-char-btn": "+ Thêm",
        "ocr-enhance-label": "Tăng cường tương phản OCR",
        "ocr-enhance-sub": "Tiền xử lý tăng độ nét & tương phản giúp AI nhận diện chuẩn chữ mờ, chữ SFX nhạt.",
        "genre-matrix-label": "Định vị Thể loại & Vũ trụ Truyện tranh",
        "comic-universe-label": "1. Trường phái truyện & Văn hóa (Comic Universe):",
        "comic-genre-label": "2. Bối cảnh & Thể loại Cốt lõi (World Setting & Genre):",
        "comic-tone-label": "3. Sắc thái & Gia vị Văn phong (Narrative Tone):",
        "genre-preset-label": "Mẫu prompt theo thể loại:",
        "context-prompt-label": "Prompt ngữ cảnh dịch:",
        "context-prompt-placeholder": "Ví dụ: Truyện có giọng điệu hài hước, nhân vật nói chuyện thân mật kiểu học sinh cấp 3, ưu tiên dịch tự nhiên...",
        "context-prompt-sub": "Nội dung này sẽ được thêm vào prompt hệ thống để AI hiểu bối cảnh, văn phong và quy ước dịch của bạn.",
        "story-memory-title": "Bộ nhớ ngữ cảnh chương",
        "story-memory-label": "Tự động nối ngữ cảnh các trang trước",
        "story-memory-desc": "Tích lũy tóm tắt xưng hô & cốt truyện từ trang 1 đến trang cuối để dịch nhất quán.",
        "view-memory-btn": "Xem bộ nhớ...",
        "clear-memory-btn": "Xóa bộ nhớ",
        "api-limit-title": "Giới hạn tần suất API (Tránh lỗi 429/503)",
        "api-delay-label": "Giãn cách gửi (giây):",
        "max-retries-label": "Số lần thử lại:",
        "api-limit-sub": "* Khuyến nghị: Giãn cách 8-12 giây và thử lại 5 lần khi dùng API miễn phí (Free Key) để hạn chế tối đa lỗi ngắt quãng.",
        "consistency-title": "Kiểm tra nhất quán",
        "consistency-sub": "Quét các cụm lặp lại và danh sách tên cần giữ nguyên để tìm chỗ dịch lệch.",
        "consistency-btn": "Kiểm tra",
        "done-btn": "Xong",

        // Toolbar Center
        "zoom-fit": "Vừa màn hình",
        "prev-page": "Trang trước",
        "next-page": "Trang sau",
        "export-btn": "Xuất ảnh (Export)",

        // Top Actions
        "undo-btn": "Hoàn tác",
        "redo-btn": "Làm lại",
        "import-manga-btn": "Khôi phục",
        "export-manga-btn": "Sao lưu",
        "export-pdf-btn": "Xuất PDF",
        "reader-preview-btn": "Xem trước",
        "translate-all-btn": "Dịch tất cả",
        "export-zip-btn": "Xuất ZIP",
        "clear-ram-btn": "Dọn RAM",
        "export-range-checkbox": "Xuất theo đoạn trang",
        "export-range-from": "Từ:",
        "export-range-to": "Đến:",

        // New Layout Features
        "preset-dialogue": "💬 Thoại",
        "preset-scream": "💥 Hét / SFX",
        "preset-whisper": "💭 Thầm thì",
        "preset-narration": "📜 Dẫn chuyện",
        "block-type-label": "Phân loại khung thoại",
        "block-type-dialogue": "💬 Lời thoại",
        "block-type-narration": "📜 Dẫn chuyện",
        "block-type-thought": "💭 Nghĩ thầm",
        "block-type-sfx": "💥 Hiệu ứng (SFX)",
        "voice-gender-label": "Giọng đọc Audio Drama",
        "voice-gender-male": "👨 Nam",
        "voice-gender-female": "👩 Nữ",
        "voice-gender-neutral": "🎙️ Dẫn chuyện",
        "sfx-controls-title": "Góc xoay & Uốn cong (SFX)",
        "sfx-rotation-label": "Góc nghiêng (Rotation):",
        "sfx-arc-label": "Độ uốn cong (Arc Text):",
        "reset-btn": "Đặt lại",
        "delete-block-btn": "Xóa ô dịch này",

        // Tooltip Titles
        "title-find-replace": "Tìm & Thay thế từ ngữ",
        "title-diamond-balance": "Cân đối Diamond tất cả các trang",
        "title-bilingual-toggle": "Bật/Tắt hiển thị Song ngữ",
        "title-audio-toggle": "Phát/Dừng Audio Drama (Kịch truyền thanh)",
        "title-lorebook": "Lorebook từ vựng & Nhân vật",
        "title-gdrive": "Đồng bộ Google Drive",
        "title-settings": "Cài đặt dịch thuật",
        "title-sort-pages": "Sắp xếp danh sách theo tên file (1, 2, 3...)",
        "title-clear-project": "Xóa toàn bộ dự án hiện tại để bắt đầu mới",
        "title-export-zip": "Xuất ZIP chương truyện",
        "title-export-pdf": "Xuất PDF đọc trên máy tính bảng/Kindle",
        "title-preview-mode": "Xem trước toàn bộ chương truyện đã dịch",
        "title-export-project": "Sao lưu toàn bộ dự án thành file .manga",
        "title-import-project": "Khôi phục dự án từ file .manga / .json",
        "title-clear-memory": "Giải phóng bộ nhớ RAM đệm Canvas",
        "title-pin-start": "Ghim trang hiện tại làm điểm bắt đầu",
        "title-pin-end": "Ghim trang hiện tại làm điểm kết thúc",
        "title-undo": "Hoàn tác (Ctrl+Z)",
        "title-redo": "Làm lại (Ctrl+Y)",
        "title-copy-style": "Sao chép định dạng ô (Ctrl+Shift+C)",
        "title-paste-style": "Dán định dạng đã sao chép (Ctrl+Shift+V)",
        "title-add-block": "Thêm ô thoại mới",
        "title-translate-page": "Dịch trang hiện tại",
        "title-ai-erase": "Xóa chữ toàn trang bằng AI",
        "title-export-page": "Xuất ảnh trang hiện tại",
        "title-eraser-mode": "Bật/Tắt chế độ cọ vẽ để tẩy chữ thủ công",
        "lasso-expand-label": "Mở rộng",
        "lasso-fuzziness-label": "Độ nhạy (Fuzziness)",
        "lasso-method-label": "Thuật toán",
        "lasso-fill-btn": "Lấp đầy AI (AI Fill)",
        "lasso-clear-btn": "Hủy chọn",
        "lasso-tab-ai": "Bù nền AI",
        "lasso-tab-pattern": "Tô họa tiết",
        "lasso-pattern-type-label": "Kiểu họa tiết",
        "lasso-pattern-size-label": "Kích thước chu kỳ",
        "lasso-pattern-density-label": "Độ đậm / Nét",
        "lasso-pattern-feather-label": "Mịn viền",
        "lasso-pattern-opacity-label": "Độ mờ đục",
        "lasso-pattern-fg-color": "Màu nét",
        "lasso-pattern-bg-color": "Màu nền",
        "lasso-pattern-transparent": "Trong suốt",
        "lasso-pattern-fill-btn": "Tô họa tiết (Pattern Fill)",
        "lasso-pick-sample-btn": "Lấy mẫu vân",
        "lasso-pattern-halftone": "Trame hạt",
        "lasso-pattern-horizontal": "Sọc ngang",
        "lasso-pattern-vertical": "Sọc dọc",
        "lasso-pattern-diagonal": "Sọc chéo",
        "lasso-pattern-crosshatch": "Caro",
        "lasso-pattern-noise": "Hạt cát",
        "lasso-sample-btn": "Quét mẫu vân",
        "lasso-auto-sample-btn": "Tự lấy lân cận",
        "lasso-tech-patch": "Trượt vân 1:1 (Patch)",
        "lasso-tech-tile": "Ghép ô",
        "lasso-tech-preset": "Trame tạo sẵn",
        "lasso-phase-x-label": "Dịch pha X",
        "lasso-phase-y-label": "Dịch pha Y",
        "lasso-nudge-reset": "Đặt lại"
    },
    en: {
        // Left Panel - Image Source
        "image-source": "Image Source",
        "image-source-sub": "Load manga and manage pages below",
        "settings-btn": "Settings",
        "find-replace-btn": "Find & Replace",
        "diamond-balance-btn": "Diamond Balance",
        "upload-title": "Upload Manga Images",
        "upload-sub": "Select or drag multiple images at once",
        "page-list-label": "Page List",
        "sort-pages-btn": "Sort by Name",
        "clear-project-btn": "Clear Project",
        
        // Right Panel - Tabs & Editor
        "tab-edit": "Content",
        "tab-style": "Format",
        "no-block-selected": "Click a text bubble on the image to edit",
        "original-text-label": "Original Text (OCR):",
        "original-text-placeholder": "Original text automatically detected from image...",
        "translated-text-label": "Translation:",
        "translated-text-placeholder": "Type translation or click Auto Translate...",
        "translate-block-btn": "Translate Bubble",
        "font-family-label": "Font Family",
        "font-size-label": "Font Size",
        "align-label": "Align",
        "writing-direction-label": "Writing Direction",
        "horizontal-btn": "Horizontal",
        "vertical-btn": "Vertical",
        "bold-label": "Bold Text",
        "text-color-label": "Text Color",
        "bg-color-label": "Bubble Mask Color",
        "bg-opacity-label": "Background Opacity",
        "stroke-label": "Text Stroke",
        "shadow-label": "Drop Shadow",
        "masking-label": "Masking (Erase Original)",
        "mask-shape-label": "Mask Shape",
        "mask-size-label": "Mask Size",
        "padding-label": "Text Padding",
        "rotation-label": "Rotation Angle",
        
        // Settings Modal
        "settings-modal-title": "Translation Settings",
        "settings-modal-sub": "API key, models and translation rules",
        "ui-lang-label": "UI Language",
        "ai-provider-label": "AI Provider",
        "api-key-label": "API Key",
        "api-key-placeholder": "Automatically use system key...",
        "ai-model-label": "AI Model",
        "trans-config-title": "Translation Config",
        "source-lang-label": "Source Language",
        "target-lang-label": "Target Language",
        "preserve-names-label": "Do not translate names",
        "preserve-names-sub": "Keep Romaji/English names (e.g. Luffy, Naruto).",
        "glossary-label": "Names to keep (comma-separated):",
        "glossary-placeholder": "e.g. Luffy, Zoro, Nami, Sakura",
        "pronoun-matrix-title": "Character Pronouns",
        "pronoun-matrix-sub": "Define how characters address each other to ensure natural and consistent dialogues.",
        "pronoun-char-placeholder": "Character name (e.g. Luffy)",
        "add-char-btn": "+ Add",
        "ocr-enhance-label": "OCR Contrast Enhancement",
        "ocr-enhance-sub": "Pre-processes image to improve AI detection of blurry or light SFX text.",
        "genre-matrix-label": "Comic Universe & Genre Matrix",
        "comic-universe-label": "1. Comic Universe & Cultural Tradition:",
        "comic-genre-label": "2. World Setting & Core Genre:",
        "comic-tone-label": "3. Narrative Tone & Slang Flavor:",
        "genre-preset-label": "Genre Prompts:",
        "context-prompt-label": "Context Prompt:",
        "context-prompt-placeholder": "e.g. High school setting, friendly/informal tone, keep skill names untranslated...",
        "context-prompt-sub": "This text will be appended to system prompt to help AI adapt to your style and story context.",
        "story-memory-title": "Chapter Story Memory",
        "story-memory-label": "Auto-accumulate previous context",
        "story-memory-desc": "Accumulates plot summary and character details from page 1 to the end for consistency.",
        "view-memory-btn": "View Memory...",
        "clear-memory-btn": "Clear Memory",
        "api-limit-title": "API Rate Limits (Avoid 429/503 errors)",
        "api-delay-label": "Delay between calls (s):",
        "max-retries-label": "Max retries:",
        "api-limit-sub": "* Recommended: 8-12 seconds delay and 5 retries for Free API keys to minimize rate limit issues.",
        "consistency-title": "Consistency Check",
        "consistency-sub": "Scans repetitive phrases and glossary names to find translation mismatches.",
        "consistency-btn": "Run Check",
        "done-btn": "Done",

        // Toolbar Center
        "zoom-fit": "Zoom to Fit",
        "prev-page": "Prev Page",
        "next-page": "Next Page",
        "export-btn": "Export Image",

        // Top Actions
        "undo-btn": "Undo",
        "redo-btn": "Redo",
        "import-manga-btn": "Restore",
        "export-manga-btn": "Backup",
        "export-pdf-btn": "Export PDF",
        "reader-preview-btn": "Preview",
        "translate-all-btn": "Translate All",
        "export-zip-btn": "Export ZIP",
        "clear-ram-btn": "Free RAM",
        "export-range-checkbox": "Export page range",
        "export-range-from": "From:",
        "export-range-to": "To:",

        // New Layout Features
        "preset-dialogue": "💬 Dialogue",
        "preset-scream": "💥 Scream / SFX",
        "preset-whisper": "💭 Whisper",
        "preset-narration": "📜 Narration",
        "block-type-label": "Block Type",
        "block-type-dialogue": "💬 Dialogue",
        "block-type-narration": "📜 Narration",
        "block-type-thought": "💭 Thought",
        "block-type-sfx": "💥 Sound Effects (SFX)",
        "voice-gender-label": "Audio Drama Voice",
        "voice-gender-male": "👨 Male",
        "voice-gender-female": "👩 Female",
        "voice-gender-neutral": "🎙️ Narrator",
        "sfx-controls-title": "Rotation & Curve (SFX)",
        "sfx-rotation-label": "Rotation:",
        "sfx-arc-label": "Text Curve (Arc):",
        "reset-btn": "Reset",
        "delete-block-btn": "Delete This Bubble",

        // Tooltip Titles
        "title-find-replace": "Find & Replace text",
        "title-diamond-balance": "Diamond balance all pages",
        "title-bilingual-toggle": "Toggle Bilingual display mode",
        "title-audio-toggle": "Play/Stop Audio Drama",
        "title-lorebook": "Lorebook and Characters",
        "title-gdrive": "Sync to Google Drive",
        "title-settings": "Translation Settings",
        "title-sort-pages": "Sort page list by file name",
        "title-clear-project": "Clear current project to start fresh",
        "title-export-zip": "Export chapter as ZIP",
        "title-export-pdf": "Export chapter as PDF",
        "title-preview-mode": "Preview translation pages",
        "title-export-project": "Backup project (.manga)",
        "title-import-project": "Restore project from file (.manga / .json)",
        "title-clear-memory": "Free Canvas RAM cache",
        "title-pin-start": "Pin current page as start page",
        "title-pin-end": "Pin current page as end page",
        "title-undo": "Undo (Ctrl+Z)",
        "title-redo": "Redo (Ctrl+Y)",
        "title-copy-style": "Copy block style (Ctrl+Shift+C)",
        "title-paste-style": "Paste block style (Ctrl+Shift+V)",
        "title-add-block": "Add new dialogue block",
        "title-translate-page": "Translate active page",
        "title-ai-erase": "AI erase text on active page",
        "title-export-page": "Export active page image",
        "title-eraser-mode": "Toggle brush tool for manual text erasing",
        "lasso-expand-label": "Expand Selection",
        "lasso-fuzziness-label": "Fuzziness sensitivity",
        "lasso-method-label": "Algorithm",
        "lasso-fill-btn": "AI Fill",
        "lasso-clear-btn": "Deselect",
        "lasso-tab-ai": "AI Inpaint",
        "lasso-tab-pattern": "Pattern Fill",
        "lasso-pattern-type-label": "Pattern Type",
        "lasso-pattern-size-label": "Pattern Pitch / Size",
        "lasso-pattern-density-label": "Density / Weight",
        "lasso-pattern-feather-label": "Edge Feather",
        "lasso-pattern-opacity-label": "Fill Opacity",
        "lasso-pattern-fg-color": "Pattern Color",
        "lasso-pattern-bg-color": "Background",
        "lasso-pattern-transparent": "Transparent",
        "lasso-pattern-fill-btn": "Apply Pattern Fill",
        "lasso-pick-sample-btn": "Sample Texture",
        "lasso-pattern-halftone": "Halftone Dots",
        "lasso-pattern-horizontal": "Horizontal Lines",
        "lasso-pattern-vertical": "Vertical Lines",
        "lasso-pattern-diagonal": "Diagonal 45°",
        "lasso-pattern-crosshatch": "Crosshatch Grid",
        "lasso-pattern-noise": "Manga Grain",
        "lasso-sample-btn": "Sample Texture",
        "lasso-auto-sample-btn": "Auto Sample",
        "lasso-tech-patch": "1:1 Patch (PTS)",
        "lasso-tech-tile": "Grid Tiling",
        "lasso-tech-preset": "Preset Tone",
        "lasso-phase-x-label": "Phase Shift X",
        "lasso-phase-y-label": "Phase Shift Y",
        "lasso-nudge-reset": "Reset"
    }
};

export function t(key: string, lang?: string): string {
    const targetLang = lang || globalState.uiLanguage || 'vi';
    const dict = i18nDict[targetLang] || i18nDict.vi || {};
    return dict[key] !== undefined ? dict[key] : key;
}

export function applyTranslations(): void {
    const lang = globalState.uiLanguage || 'vi';
    const dict = i18nDict[lang] || i18nDict.vi;

    // Translate elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (key && dict[key]) {
            const icon = el.querySelector('i');
            if (icon) {
                el.innerHTML = '';
                el.appendChild(icon);
                el.appendChild(document.createTextNode(' ' + dict[key]));
            } else {
                el.textContent = dict[key];
            }
        }
    });

    // Translate placeholders with data-i18n-placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key && dict[key]) {
            el.setAttribute('placeholder', dict[key]);
        }
    });

    // Translate tooltips with data-i18n-title attribute
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
        const key = el.getAttribute('data-i18n-title');
        if (key && dict[key]) {
            el.setAttribute('title', dict[key]);
        }
    });

    // Update document title and lang
    document.documentElement.lang = lang;
}

export function changeUILanguage(lang: string): void {
    if (!i18nDict[lang]) return;
    globalState.uiLanguage = lang as any;
    safeSetLocalStorage('gemini_manga_ui_lang', lang);
    applyTranslations();

    // Redraw canvas overlay if needed
    import('../features/canvas/canvas-service').then(canvas => {
        if (typeof (canvas as any).requestOverlayRender === 'function') {
            (canvas as any).requestOverlayRender();
        }
    }).catch(err => console.log('Canvas module not loaded yet or has no overlay render: ', err));
}

export function initI18n(): void {
    const savedLang = localStorage.getItem('gemini_manga_ui_lang') || 'vi';
    globalState.uiLanguage = savedLang as any;
    applyTranslations();
}
