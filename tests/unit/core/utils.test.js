import test from 'node:test';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import { escapeHTML, setMultilineText } from '../../../public/src/core/utils.js';

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
    assert.strictEqual(line1.style.flexDirection, 'column');
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
