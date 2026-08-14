import { parseGeminiJsonText } from './test_repair_robust.js';

const ocrJson = `{"blocks": [
    {"id": "b1", "original": "こんにちは", "box": {"x": 100, "y": 100, "w": 200, "h": 200}},
    {"id": "b2", "original": "さようなら", "box": {"x": 300, "y": 300, "w": 100, "h": 100}}
]}`;

const parsedOcr = parseGeminiJsonText(ocrJson);
console.log("Parsed OCR:", parsedOcr);
if (parsedOcr && parsedOcr.blocks && parsedOcr.blocks.length === 2 && parsedOcr.blocks[0].box) {
    console.log("✅ OCR blocks preserved perfectly!");
} else {
    console.error("❌ OCR blocks failed!");
    process.exit(1);
}

// Truncated OCR block
const truncatedOcr = `{"blocks": [
    {"id": "b1", "original": "こんにちは", "box": {"x": 100, "y": 100, "w": 200, "h": 200}},
    {"id": "b2", "original": "さようなら", "box": {"x": 300, "y": 300, "w": 100
`;
const parsedTruncatedOcr = parseGeminiJsonText(truncatedOcr);
console.log("Parsed Truncated OCR:", parsedTruncatedOcr);
if (parsedTruncatedOcr && parsedTruncatedOcr.blocks && parsedTruncatedOcr.blocks.length >= 1) {
    console.log("✅ Truncated OCR recovered block 1 successfully!");
} else {
    console.error("❌ Truncated OCR failed!");
    process.exit(1);
}
