import { test, expect } from 'vitest';
import '../../setup/browser-env.js';
import { parseRichTextLines } from '../../../src/core/utils';
import { renderBlockTextToDOM } from '../../../src/features/canvas/text-layout-engine';
import { autoFitBlock } from '../../../src/features/canvas/canvas-styling';
import { mergeOverlappingAiBlocks, detectSpeechBubbleAtPoint } from '../../../src/features/ocr/ocr-service';
import { MangaBlock, MangaPage } from '../../../src/types/index';
import { globalState } from '../../../src/core/state';

const SAMPLE_TEXTS = [
    "Xin chào, tôi là nhân vật chính của bộ truyện này!",
    "Đừng hòng trốn thoát khỏi đây... Đồ ngốc!",
    "Hả?! Chuyện gì đang xảy ra thế này?!",
    "Nếu chúng ta không nhanh lên, cổng không gian sẽ đóng lại mất.",
    "Cậu có chắc là kế hoạch này sẽ thành công không?",
    "**Cẩn thận!** Đằng sau cậu có **quái vật** đấy!",
    "Không thể tin được... Sức mạnh này là gì?!",
    "Haha, cuối cùng ngươi cũng đến rồi, kẻ được chọn.",
    "Một ngày nọ, tại vương quốc xa xôi...",
    "Đi thôi nào! Cuộc phiêu lưu chỉ mới bắt đầu!"
];

test('BENCHMARK 1: parseRichTextLines on realistic manga text', () => {
    const iterations = 5000;
    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) {
        for (const txt of SAMPLE_TEXTS) {
            parseRichTextLines(txt);
        }
    }
    const duration = performance.now() - t0;
    console.log(`\n[BENCHMARK 1 - parseRichTextLines]: ${iterations * SAMPLE_TEXTS.length} calls: ${duration.toFixed(2)}ms (${(duration / (iterations * SAMPLE_TEXTS.length) * 1000).toFixed(2)} µs/op)`);
    expect(duration).toBeGreaterThan(0);
});

test('BENCHMARK 2: renderBlockTextToDOM on 20 blocks across 100 renders', () => {
    const blocks: MangaBlock[] = SAMPLE_TEXTS.concat(SAMPLE_TEXTS).map((txt, idx) => ({
        id: `block_${idx}`,
        type: 'dialogue',
        original: 'こんにちは',
        translated: txt,
        box: { x: 10 + (idx % 3) * 25, y: 10 + Math.floor(idx / 3) * 12, w: 22, h: 10 },
        style: {
            fontFamily: 'font-manga',
            fontSize: 16,
            lineHeight: 1.15,
            letterSpacing: 0,
            textColor: '#000000',
            bgColor: '#ffffff',
            bgOpacity: 100,
            padding: '9% 12%',
            rotate: 0,
            vertical: false,
            bold: false,
            italic: false,
            align: 'center',
            maskShape: 'bubble-fit',
            maskSize: 'full',
            strokeWidth: 0,
            strokeColor: '#ffffff',
            shadowColor: '#000000',
            shadowBlur: 0
        } as any
    }));

    const container = document.createElement('div');
    const iterations = 100;
    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) {
        for (const block of blocks) {
            const inner = document.createElement('div');
            container.appendChild(inner);
            renderBlockTextToDOM(inner, block, 800, 1200, 1.0);
            container.removeChild(inner);
        }
    }
    const duration = performance.now() - t0;
    console.log(`\n[BENCHMARK 2 - renderBlockTextToDOM]: ${iterations * blocks.length} block renders: ${duration.toFixed(2)}ms (${(duration / (iterations * blocks.length)).toFixed(3)} ms/block)`);
    expect(duration).toBeGreaterThan(0);
});

test('BENCHMARK 3: mergeOverlappingAiBlocks on AI OCR detection payload', () => {
    const rawAiBlocks = [];
    for (let i = 0; i < 40; i++) {
        rawAiBlocks.push({
            id: `b_${i}`,
            type: i % 5 === 0 ? 'narration' : 'dialogue',
            original: `テストテキスト ${i}`,
            translated: `Văn bản kiểm tra ${i}`,
            box: [100 + (i % 5) * 150, 100 + Math.floor(i / 5) * 100, 120, 80]
        });
    }
    // Add 10 duplicate/overlapping blocks
    for (let i = 0; i < 10; i++) {
        rawAiBlocks.push({
            id: `dup_${i}`,
            type: 'dialogue',
            original: `テストテキスト ${i * 2}`,
            translated: `Văn bản kiểm tra ${i * 2}`,
            box: [105 + ((i * 2) % 5) * 150, 102 + Math.floor((i * 2) / 5) * 100, 118, 78]
        });
    }

    const iterations = 1000;
    const t0 = performance.now();
    let resultCount = 0;
    for (let i = 0; i < iterations; i++) {
        const res = mergeOverlappingAiBlocks(rawAiBlocks);
        resultCount = res.length;
    }
    const duration = performance.now() - t0;
    console.log(`\n[BENCHMARK 3 - mergeOverlappingAiBlocks]: ${iterations} runs on 50 blocks: ${duration.toFixed(2)}ms (${(duration / iterations).toFixed(3)} ms/run), merged to ${resultCount} blocks`);
    expect(duration).toBeGreaterThan(0);
});

test('BENCHMARK 4: detectSpeechBubbleAtPoint on 1000x1200 image canvas', () => {
    const imgW = 1000;
    const imgH = 1200;
    const buffer = new Uint8ClampedArray(imgW * imgH * 4);
    // Fill background with grey/texture
    for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] = 120;
        buffer[i + 1] = 120;
        buffer[i + 2] = 120;
        buffer[i + 3] = 255;
    }
    // Create 4 speech bubbles (white ellipses)
    const bubbles = [
        { cx: 300, cy: 300, rx: 120, ry: 90 },
        { cx: 700, cy: 300, rx: 100, ry: 130 },
        { cx: 300, cy: 800, rx: 140, ry: 100 },
        { cx: 700, cy: 800, rx: 110, ry: 110 }
    ];
    for (const b of bubbles) {
        for (let y = b.cy - b.ry; y <= b.cy + b.ry; y++) {
            for (let x = b.cx - b.rx; x <= b.cx + b.rx; x++) {
                const dx = (x - b.cx) / b.rx;
                const dy = (y - b.cy) / b.ry;
                if (dx * dx + dy * dy <= 1.0) {
                    const idx = (y * imgW + x) * 4;
                    buffer[idx] = 255;
                    buffer[idx + 1] = 255;
                    buffer[idx + 2] = 255;
                    buffer[idx + 3] = 255;
                }
            }
        }
    }
    const mockImageData = {
        width: imgW,
        height: imgH,
        data: buffer
    } as any;

    const iterations = 20;
    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) {
        for (const b of bubbles) {
            detectSpeechBubbleAtPoint(mockImageData, b.cx, b.cy);
        }
    }
    const duration = performance.now() - t0;
    console.log(`\n[BENCHMARK 4 - detectSpeechBubbleAtPoint]: ${iterations * bubbles.length} detections: ${duration.toFixed(2)}ms (${(duration / (iterations * bubbles.length)).toFixed(2)} ms/bubble)`);
    expect(duration).toBeGreaterThan(0);
});

test('BENCHMARK 5: autoFitBlock on 20 blocks (50 iterations)', () => {
    const mockPage: MangaPage = {
        id: 'p_bench',
        name: 'Benchmark Page',
        width: 800,
        height: 1200,
        blocks: [],
        status: 'draft',
        file: null,
        originalFile: null
    };
    globalState.pages = [mockPage];
    globalState.activePageIndex = 0;

    const blocks: MangaBlock[] = SAMPLE_TEXTS.concat(SAMPLE_TEXTS).map((txt, idx) => ({
        id: `block_${idx}`,
        type: 'dialogue',
        original: 'こんにちは',
        translated: txt,
        box: { x: 10 + (idx % 3) * 25, y: 10 + Math.floor(idx / 3) * 12, w: 15, h: 8 },
        style: {
            fontFamily: 'font-manga',
            fontSize: 24,
            baseFontSize: 24,
            lineHeight: 1.15,
            letterSpacing: 0,
            padding: '9% 12%',
            vertical: false,
            autoFit: true,
            textColor: '#000000',
            bgColor: '#ffffff',
            bgOpacity: 100,
            rotate: 0,
            bold: false,
            italic: false,
            align: 'center',
            maskShape: 'bubble-fit',
            maskSize: 'full',
            strokeWidth: 0,
            strokeColor: '#ffffff',
            shadowColor: '#000000',
            shadowBlur: 0
        } as any
    }));
    mockPage.blocks = blocks;

    const iterations = 50;
    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) {
        for (const block of blocks) {
            block.autoFitCache = null;
            autoFitBlock(block);
        }
    }
    const duration = performance.now() - t0;
    console.log(`\n[BENCHMARK 5 - autoFitBlock uncached]: ${iterations * blocks.length} auto-fit calculations: ${duration.toFixed(2)}ms (${(duration / (iterations * blocks.length)).toFixed(3)} ms/block)`);
    expect(duration).toBeGreaterThan(0);
});
