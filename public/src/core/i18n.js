// Simple UI Internationalization (i18n) for Manga Translator Studio
import { globalState } from './state.js';

export const i18nDict = {
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
        "clear-ram-btn": "Dọn RAM"
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
        "clear-ram-btn": "Free RAM"
    }
};

export function applyTranslations() {
    const lang = globalState.uiLanguage || 'vi';
    const dict = i18nDict[lang] || i18nDict.vi;

    // Translate elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) {
            // Keep child elements (like icons) if they exist
            const icon = el.querySelector('i');
            if (icon) {
                // Keep the icon HTML, replace the text node
                el.innerHTML = '';
                el.appendChild(icon);
                el.appendChild(document.createTextNode(' ' + dict[key]));
            } else {
                el.textContent = dict[key];
            }
        }
    });

    // Translate placeholders with data-i18n-placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (dict[key]) {
            el.setAttribute('placeholder', dict[key]);
        }
    });

    // Update document title and lang
    document.documentElement.lang = lang;
}

export function changeUILanguage(lang) {
    if (!i18nDict[lang]) return;
    globalState.uiLanguage = lang;
    localStorage.setItem('gemini_manga_ui_lang', lang);
    applyTranslations();

    // Redraw canvas overlay if needed
    import('../features/canvas/canvas-service.js').then(canvas => {
        if (typeof canvas.requestOverlayRender === 'function') {
            canvas.requestOverlayRender();
        }
    }).catch(err => console.log('Canvas module not loaded yet or has no overlay render: ', err));
}

export function initI18n() {
    const savedLang = localStorage.getItem('gemini_manga_ui_lang') || 'vi';
    globalState.uiLanguage = savedLang;
    applyTranslations();
}
