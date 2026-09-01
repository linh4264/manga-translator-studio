import { test, expect } from 'vitest';
import assert from 'node:assert';
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

test('Regression Routing - Cong Cu Huu Ich Tool Suite files and routing integrity', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const toolsDir = path.join(projectRoot, 'cong-cu-huu-ich');
    const toolsHtml = path.join(toolsDir, 'index.html');
    const toolsMainTs = path.join(toolsDir, 'src', 'main.ts');
    const toolsCommonTs = path.join(toolsDir, 'src', 'common.ts');
    const pubRedirectHtml = path.join(rootPath, 'cong-cu-huu-ich.html');

    assert.ok(fs.existsSync(toolsDir), 'cong-cu-huu-ich directory must exist');
    assert.ok(fs.existsSync(toolsHtml), 'cong-cu-huu-ich/index.html must exist');
    assert.ok(fs.existsSync(toolsMainTs), 'cong-cu-huu-ich/src/main.ts must exist');
    assert.ok(fs.existsSync(toolsCommonTs), 'cong-cu-huu-ich/src/common.ts must exist');
    assert.ok(fs.existsSync(pubRedirectHtml), 'public/cong-cu-huu-ich.html redirect page must exist');

    // Simulate directory resolution logic for server
    const simulateServerRoute = (requestPath) => {
        const cleanUrlPath = requestPath.split('?')[0].replace(/\0/g, '');
        const normalizedRelative = path.normalize(cleanUrlPath).replace(/^[\/\\]+/, '').replace(/^(\.\.[\/\\])+/, '');
        let safePath = normalizedRelative;
        if (safePath === '/' || safePath === '.' || safePath === '\\' || safePath === '') {
            safePath = 'index.html';
        }
        let filePath = path.resolve(projectRoot, safePath);

        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
            if (!requestPath.endsWith('/')) {
                return { status: 301, redirect: `${requestPath}/` };
            }
            if (fs.existsSync(path.join(filePath, 'index.html'))) {
                return { status: 200, filePath: path.join(filePath, 'index.html') };
            }
        }

        if (!fs.existsSync(filePath)) {
            const pubCandidate = path.resolve(rootPath, safePath);
            if (fs.existsSync(pubCandidate)) {
                return { status: 200, filePath: pubCandidate };
            }
            if (fs.existsSync(filePath + '.html')) {
                return { status: 200, filePath: filePath + '.html' };
            }
            if (fs.existsSync(path.join(rootPath, safePath + '.html'))) {
                return { status: 200, filePath: path.join(rootPath, safePath + '.html') };
            }
        }

        if (fs.existsSync(filePath)) {
            return { status: 200, filePath };
        }
        return { status: 404 };
    };

    // 1. /cong-cu-huu-ich without slash must redirect to /cong-cu-huu-ich/
    const redirectRes = simulateServerRoute('/cong-cu-huu-ich');
    assert.strictEqual(redirectRes.status, 301);
    assert.strictEqual(redirectRes.redirect, '/cong-cu-huu-ich/');

    // 2. /cong-cu-huu-ich/ with slash must resolve to cong-cu-huu-ich/index.html
    const directRes = simulateServerRoute('/cong-cu-huu-ich/');
    assert.strictEqual(directRes.status, 200);
    assert.strictEqual(directRes.filePath, toolsHtml);

    // 3. /cong-cu-huu-ich.html must resolve to public/cong-cu-huu-ich.html
    const pubRes = simulateServerRoute('/cong-cu-huu-ich.html');
    assert.strictEqual(pubRes.status, 200);
    assert.strictEqual(pubRes.filePath, pubRedirectHtml);
});

