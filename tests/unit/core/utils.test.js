import test from 'node:test';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import { escapeHTML, setMultilineText, hasRichTextTags, stripRichTextTags, parseRichTextTokens } from '../../../src/core/utils.ts';

test('Core Utils - HTML Escaping', () => {
    assert.strictEqual(escapeHTML('<div>"Hello" & \'World\'</div>'), '&lt;div&gt;&quot;Hello&quot; &amp; &#039;World&#039;&lt;/div&gt;');
    assert.strictEqual(escapeHTML(''), '');
    assert.strictEqual(escapeHTML(null), '');
    assert.strictEqual(escapeHTML(undefined), '');
    assert.strictEqual(escapeHTML(12345), '12345');
});

test('Core Utils - Horizontal Multiline Text Formatting', () => {
    const container = document.createElement('div');
    container.style.writingMode = 'horizontal-tb';
    container.style.textAlign = 'center';

    const multilineText = 'Dòng 1: Xin chào\nDòng 2: Manga Translator Studio\nDòng 3: Tiếng Việt có dấu';
    setMultilineText(container, multilineText);

    assert.strictEqual(container.children.length, 3, 'Container should contain 3 line divs');
    assert.strictEqual(container.children[0].textContent, 'Dòng 1: Xin chào');
    assert.strictEqual(container.children[1].textContent, 'Dòng 2: Manga Translator Studio');
    assert.strictEqual(container.children[2].textContent, 'Dòng 3: Tiếng Việt có dấu');
    assert.strictEqual(container.children[0].style.textAlign, 'center');
});

test('Core Utils - Vertical Japanese Text Stacking (Intl Segmenter & Word Break)', () => {
    const vertContainer = document.createElement('div');
    vertContainer.style.writingMode = 'vertical-rl';

    const japaneseText = 'こんにちは！\nさようなら…';
    setMultilineText(vertContainer, japaneseText);

    assert.strictEqual(vertContainer.children.length, 2, 'Should create 2 vertical column divs');
    const line1 = vertContainer.children[0];
    const line2 = vertContainer.children[1];

    assert.strictEqual(line1.style.wordBreak, 'keep-all');
    assert.strictEqual(line1.style.writingMode, 'vertical-rl');
    assert.strictEqual(line1.children.length, 6, 'Line 1 has 6 characters: こ, ん, に, ち, は, ！');
    assert.strictEqual(line2.children.length, 6, 'Line 2 has 6 characters: さ, よ, う, な, ら, …');

    // Ellipsis should be rotated 90deg in vertical mode
    const ellipsisSpan = line2.children[5];
    assert.strictEqual(ellipsisSpan.style.transform, 'rotate(90deg)');
});

test('Core Utils - Arc, Warp Wave, Bulge and Skew Transformations', () => {
    const warpContainer = document.createElement('div');
    const text = 'UỐN CONG NGHỆ THUẬT';
    const warpOptions = {
        arcAngle: 40,
        skewX: 10,
        skewY: -5,
        warpWave: 30,
        warpBulge: 20
    };

    setMultilineText(warpContainer, text, warpOptions);

    assert.strictEqual(warpContainer.children.length, 1);
    const line = warpContainer.children[0];
    assert.strictEqual(line.style.transform, 'skew(10deg, -5deg)');
    assert.strictEqual(line.children.length, 19, 'Should split into 19 character spans for per-character transformation');

    // Middle character vs edge character should have computed transform
    const firstChar = line.children[0];
    assert.ok(firstChar.style.transform.includes('translateY') && firstChar.style.transform.includes('rotate'));
});

test('Core Utils - Rich Text Parser & Tokenizer (Markdown & BBCode)', () => {
    // 1. Detection
    assert.strictEqual(hasRichTextTags('Chữ bình thường không có tag'), false);
    assert.strictEqual(hasRichTextTags('Chữ **đậm** và *nghiêng*'), true);
    assert.strictEqual(hasRichTextTags('Chữ [b]đậm[/b] và [color=#ff0000]đỏ[/color]'), true);
    assert.strictEqual(hasRichTextTags('Chữ [size=130%]lớn[/size]'), true);

    // 2. Strip Tags
    assert.strictEqual(stripRichTextTags('**Xin chào** [color=#123456]*thế giới*[/color]!'), 'Xin chào thế giới!');
    assert.strictEqual(stripRichTextTags('[b][u]Gạch chân đậm[/u][/b]'), 'Gạch chân đậm');
    assert.strictEqual(stripRichTextTags('Không có tag'), 'Không có tag');

    // 3. Token Parsing (Markdown & BBCode)
    const tokens = parseRichTextTokens('Tôi là **[color=#ef4444]Luffy[/color]** vua hải tặc');
    assert.strictEqual(tokens.length, 3);
    assert.strictEqual(tokens[0].text, 'Tôi là ');
    assert.strictEqual(tokens[0].bold, false);

    assert.strictEqual(tokens[1].text, 'Luffy');
    assert.strictEqual(tokens[1].bold, true);
    assert.strictEqual(tokens[1].color, '#ef4444');

    assert.strictEqual(tokens[2].text, ' vua hải tặc');
    assert.strictEqual(tokens[2].bold, false);
});

test('Core Utils - Rich Text DOM Elements Creation', () => {
    const richContainer = document.createElement('div');
    const richText = 'Hôm nay **trời rất đẹp** [color=#3b82f6][u]và trong xanh[/u][/color]!';
    setMultilineText(richContainer, richText);

    assert.strictEqual(richContainer.children.length, 1);
    const lineDiv = richContainer.children[0];
    assert.ok(lineDiv.children.length >= 3, 'Should contain styled span elements');

    const boldSpan = lineDiv.children[1];
    assert.strictEqual(boldSpan.textContent, 'trời rất đẹp');
    assert.strictEqual(boldSpan.style.fontWeight, 'bold');

    const colorSpan = lineDiv.children[3];
    assert.strictEqual(colorSpan.textContent, 'và trong xanh');
    assert.strictEqual(colorSpan.style.color, '#3b82f6');
    assert.strictEqual(colorSpan.style.textDecoration, 'underline');
});

test('Core Utils - parseGeminiJsonText Supports TOEIC and Truncated JSON', async () => {
    const { parseGeminiJsonText } = await import('../../../src/core/utils/json.ts');

    // 1. Full TOEIC response
    const fullToeic = `{
        "grammar": "Câu sử dụng cấu trúc bị động.",
        "vocabulary": [
            { "word": "frequency", "pos": "noun", "vietnamese": "tần suất", "toeic_example": "The frequency increased." }
        ],
        "practice_questions": [
            { "type": "Part 5", "question": "The ______ of attacks increased.", "correct_answer": "A" }
        ]
    }`;
    const parsedToeic = parseGeminiJsonText(fullToeic);
    assert.ok(parsedToeic, 'Should parse full TOEIC JSON successfully');
    assert.strictEqual(parsedToeic.grammar, 'Câu sử dụng cấu trúc bị động.');
    assert.strictEqual(parsedToeic.vocabulary.length, 1);
    assert.strictEqual(parsedToeic.vocabulary[0].word, 'frequency');

    // 2. Truncated TOEIC response (cut off in grammar string)
    const truncatedToeic = `{
  "grammar": "Câu sử dụng thì Hiện tại tiếp diễn (Present Continuous) với cấu trúc 'seem to be + V-ing' để diễn tả một xu hướng đang xảy ra. 'The frequency of attacks' đóng vai trò là chủ ngữ số ít,`;

    const parsedTruncated = parseGeminiJsonText(truncatedToeic);
    assert.ok(parsedTruncated, 'Should repair and parse truncated TOEIC JSON');
    assert.ok(parsedTruncated.grammar.includes('Hiện tại tiếp diễn'));

    // 3. Markdown fenced JSON
    const fenced = "```json\n" + fullToeic + "\n```";
    const parsedFenced = parseGeminiJsonText(fenced);
    assert.ok(parsedFenced, 'Should parse markdown fenced JSON');
    assert.strictEqual(parsedFenced.grammar, 'Câu sử dụng cấu trúc bị động.');
});

test('Core Utils - showToast Anti-Spam Deduplication and Max 3 Limit', async () => {
    const { showToast } = await import('../../../src/core/utils.ts');

    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    toastContainer.innerHTML = '';

    // 1. Spawning identical toast repeatedly in rapid succession should only create 1 element
    showToast("Đã đóng dấu dán đè họa tiết thành công!", "success");
    showToast("Đã đóng dấu dán đè họa tiết thành công!", "success");
    showToast("Đã đóng dấu dán đè họa tiết thành công!", "success");

    assert.strictEqual(toastContainer.children.length, 1, 'Duplicate spam within 1.2s should be deduplicated to 1 toast');

    // 2. Different messages should be allowed up to max 3
    showToast("Thông báo số 1", "info");
    showToast("Thông báo số 2", "warn");
    showToast("Thông báo số 3", "error");
    showToast("Thông báo số 4", "info");

    assert.ok(toastContainer.children.length <= 3, 'Container should hold at most 3 simultaneous toasts');
});


