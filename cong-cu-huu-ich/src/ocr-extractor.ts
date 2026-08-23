/**
 * Module 7: OCR Text Extractor (Tesseract.js) (TypeScript)
 */

let ocrFileBlob: File | null = null;

export async function runOcrExtraction(): Promise<void> {
    if (!ocrFileBlob) return;
    const lang = (document.getElementById('ocr-lang') as HTMLSelectElement)?.value || 'eng';
    const statusBar = document.getElementById('ocr-status-bar');
    const resultText = document.getElementById('ocr-result-text') as HTMLTextAreaElement | null;

    if (statusBar) {
        statusBar.classList.remove('hidden');
        statusBar.textContent = `Đang khởi tạo trí tuệ nhân tạo OCR (${lang})...`;
    }

    try {
        const worker = await Tesseract.createWorker(lang);
        if (statusBar) statusBar.textContent = 'Đang quét và bóc tách chữ từ ảnh...';
        const ret = await worker.recognize(ocrFileBlob);
        if (resultText) resultText.value = ret.data.text;
        if (statusBar) statusBar.textContent = `Đã trích xuất thành công ${ret.data.words.length} từ!`;
        await worker.terminate();
    } catch (err: any) {
        console.error("OCR Error:", err);
        if (statusBar) statusBar.textContent = 'Lỗi nhận diện OCR. Vui lòng thử lại với ảnh khác.';
    }
}

export function copyOcrText(): void {
    const text = (document.getElementById('ocr-result-text') as HTMLTextAreaElement)?.value;
    if (!text) return;
    navigator.clipboard.writeText(text);
    alert("Đã sao chép toàn bộ văn bản bóc tách vào khay nhớ tạm!");
}

export function handleOcrFile(file: File): void {
    if (!file) return;
    ocrFileBlob = file;
    const uploadEl = document.getElementById('ocr-upload');
    if (uploadEl) uploadEl.classList.add('hidden');
    const panelEl = document.getElementById('ocr-panel');
    if (panelEl) panelEl.classList.remove('hidden');
    runOcrExtraction();
}

export function initOcrExtractor(): void {
    const input = document.getElementById('ocr-file');
    if (input) {
        input.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (!target.files || !target.files[0]) return;
            handleOcrFile(target.files[0]);
        });
    }
}
