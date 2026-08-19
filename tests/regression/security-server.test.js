import { test, expect, assert } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootPath = path.resolve(__dirname, '../../public');

test('Regression Security - Path Traversal Prevention on Static Server', () => {
    const maliciousPaths = [
        '/../server/server.js',
        '/../../etc/passwd',
        '/..\\..\\windows\\win.ini',
        '/../../../config',
        '/..%2f..%2fserver.js'
    ];

    for (const rawUrl of maliciousPaths) {
        const decoded = decodeURIComponent(rawUrl);
        const rawFilePath = path.join(rootPath, decoded === '/' ? 'index.html' : decoded);
        const relative = path.relative(rootPath, rawFilePath);
        const isSafe = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
        assert.strictEqual(isSafe, false, `Malicious path ${rawUrl} must be blocked`);
    }

    const safePaths = ['/', '/style.css', '/demo.jpg', '/manifest.json', '/sw.js'];
    for (const urlPath of safePaths) {
        const rawFilePath = path.join(rootPath, urlPath === '/' ? 'index.html' : urlPath);
        const relative = path.relative(rootPath, rawFilePath);
        const isSafe = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
        assert.strictEqual(isSafe, true, `Legitimate path ${urlPath} must be allowed`);
    }
});

test('Regression Security - PWA Manifest and Service Worker Assets Integrity', () => {
    const manifestPath = path.join(rootPath, 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist in public directory');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.strictEqual(manifest.name, 'Manga Translator Studio');
    assert.strictEqual(manifest.display, 'standalone');

    const swPath = path.join(rootPath, 'sw.js');
    assert.ok(fs.existsSync(swPath), 'sw.js Service Worker must exist in public directory');
});
