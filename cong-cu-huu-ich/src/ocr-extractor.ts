/**
 * Module 7: OCR Text Extractor (Tesseract.js) (TypeScript)
 */

import { escapeHTML, ensureTesseractLoaded } from './common';

let ocrFileBlob: File | null = null;
let currentOcrWorker: any = null;
let currentOcrLang: string = '';

export async function getOcrWorker(tesseractLib: any, lang: string): Promise<any> {
    if (currentOcrWorker && currentOcrLang === lang) {
        return currentOcrWorker;
    }
    if (currentOcrWorker) {
        try {
            await currentOcrWorker.terminate();
        } catch { }
        currentOcrWorker = null;
    }
    currentOcrWorker = await tesseractLib.createWorker(lang);
    currentOcrLang = lang;
    return currentOcrWorker;
}

export async function runOcrExtraction(): Promise<void> {
    if (!ocrFileBlob) return;
    const lang = (document.getElementById('ocr-lang') as HTMLSelectElement)?.value || 'eng';
    const statusBar = document.getElementById('ocr-status-bar');
    const resultText = document.getElementById('ocr-result-text') as HTMLTextAreaElement | null;

    if (statusBar) {
        statusBar.classList.remove('hidden');
        statusBar.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang khởi tạo trí tuệ nhân tạo OCR (${escapeHTML(lang)})...`;
    }

    try {
        const tesseractLib = await ensureTesseractLoaded();
        const worker = await getOcrWorker(tesseractLib, lang);
        if (statusBar) statusBar.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang quét và bóc tách chữ từ ảnh...`;
        const ret = await worker.recognize(ocrFileBlob);
        if (resultText) resultText.value = ret.data.text;
        if (statusBar) statusBar.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400"></i> Đã trích xuất thành công ${ret.data.words.length} từ!`;
    } catch (err: any) {
        console.error("OCR Error:", err);
        if (statusBar) {
            statusBar.innerHTML = '<i class="fa-solid fa-circle-exclamation text-red-400"></i> ';
            const msgSpan = document.createElement('span');
            msgSpan.textContent = `Lỗi nhận diện OCR: ${err?.message || String(err)}`;
            statusBar.appendChild(msgSpan);
        }
    }
}

export async function copyOcrText(): Promise<void> {
    const textarea = document.getElementById('ocr-result-text') as HTMLTextAreaElement | null;
    const text = textarea?.value;
    if (!text) return;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
        } else if (textarea) {
            textarea.select();
            document.execCommand('copy');
        }
        alert("Đã sao chép toàn bộ văn bản bóc tách vào khay nhớ tạm!");
    } catch (err) {
        if (textarea) {
            try {
                textarea.select();
                document.execCommand('copy');
                alert("Đã sao chép toàn bộ văn bản bóc tách vào khay nhớ tạm!");
                return;
            } catch {}
        }
        console.warn("Clipboard write error:", err);
        alert("Không thể tự động sao chép. Vui lòng bôi đen và nhấn Ctrl+C.");
    }
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
