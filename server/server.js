// Zero-Dependency Local Static File Web Server for Manga Translator Studio
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicPath = path.join(projectRoot, 'public');

const PORT = 3000;

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.manga': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.ts': 'text/javascript; charset=utf-8'
};

let bunTranspiler = null;
if (typeof Bun !== 'undefined' && Bun.Transpiler) {
    try {
        bunTranspiler = new Bun.Transpiler({ loader: 'ts', target: 'browser' });
    } catch (e) {
        console.warn('Bun Transpiler init failed:', e.message);
    }
}

let ts = null;
try {
    const tsPath = path.join(__dirname, '..', 'node_modules', 'typescript', 'lib', 'typescript.js');
    if (fs.existsSync(tsPath)) {
        const tsModule = await import(`file://${tsPath.replace(/\\/g, '/')}`);
        ts = tsModule.default || tsModule;
    }
} catch (e) {
    if (!bunTranspiler) {
        console.warn('TypeScript module not found:', e.message);
    }
}

function resolveTsImports(code, currentDir) {
    return code
        .replace(/(import|export)\s+([\s\S]*?from\s+['"])([\.\/][^'"]+)(['"])/g, (match, p1, p2, p3, p4) => {
            if (p3.endsWith('.js') || p3.endsWith('.ts') || p3.endsWith('.json') || p3.endsWith('.css')) return match;
            const absTarget = path.resolve(currentDir, p3);
            const rel = path.relative(projectRoot, absTarget);
            if (rel.startsWith('..') || path.isAbsolute(rel)) return match;
            if (fs.existsSync(absTarget + '.ts')) return `${p1} ${p2}${p3}.ts${p4}`;
            if (fs.existsSync(path.join(absTarget, 'index.ts'))) return `${p1} ${p2}${p3}/index.ts${p4}`;
            if (fs.existsSync(absTarget + '.js')) return `${p1} ${p2}${p3}.js${p4}`;
            return match;
        })
        .replace(/import\s+['"]([\.\/][^'"]+)['"]/g, (match, p1) => {
            if (p1.endsWith('.js') || p1.endsWith('.ts') || p1.endsWith('.json') || p1.endsWith('.css')) return match;
            const absTarget = path.resolve(currentDir, p1);
            const rel = path.relative(projectRoot, absTarget);
            if (rel.startsWith('..') || path.isAbsolute(rel)) return match;
            if (fs.existsSync(absTarget + '.ts')) return `import '${p1}.ts'`;
            if (fs.existsSync(path.join(absTarget, 'index.ts'))) return `import '${p1}/index.ts'`;
            if (fs.existsSync(absTarget + '.js')) return `import '${p1}.js'`;
            return match;
        })
        .replace(/import\s*\(\s*['"]([\.\/][^'"]+)['"]\s*\)/g, (match, p1) => {
            if (p1.endsWith('.js') || p1.endsWith('.ts') || p1.endsWith('.json') || p1.endsWith('.css')) return match;
            const absTarget = path.resolve(currentDir, p1);
            const rel = path.relative(projectRoot, absTarget);
            if (rel.startsWith('..') || path.isAbsolute(rel)) return match;
            if (fs.existsSync(absTarget + '.ts')) return `import('${p1}.ts')`;
            if (fs.existsSync(path.join(absTarget, 'index.ts'))) return `import('${p1}/index.ts')`;
            return match;
        });
}

function getSafeRedirectUrl(targetRelativePath, query) {
    const cleanRel = String(targetRelativePath || '')
        .replace(/^[\\\/]+/, '')
        .replace(/\\/g, '/')
        .replace(/[^a-zA-Z0-9_\-\/]/g, '');
    const cleanQuery = query ? String(query).replace(/[^a-zA-Z0-9_\-=&]/g, '') : '';
    const cleanPath = '/' + cleanRel + '/';
    return cleanQuery ? `${cleanPath}?${cleanQuery}` : cleanPath;
}

function resolveTargetFile(rawUrl) {
    let decoded;
    try {
        decoded = decodeURIComponent(rawUrl);
    } catch {
        decoded = rawUrl;
    }

    const urlParts = decoded.split('?');
    const urlPathOnly = urlParts[0].split('#')[0];
    const cleanPath = urlPathOnly.replace(/\0/g, '');
    const normalized = path.normalize(cleanPath).replace(/^[\\\/]+/, '').replace(/^(\.\.[\\\/])+/, '');
    const queryString = urlParts.length > 1 ? urlParts[1].split('#')[0] : '';

    const segments = normalized.split(/[/\\]/).filter(Boolean);
    if (
        segments.some(s => s.startsWith('.')) ||
        segments.includes('server') ||
        (segments.includes('node_modules') && !normalized.includes('typescript')) ||
        ['package.json', 'package-lock.json', 'bun.lock', 'bun.lockb', 'tsconfig.json', 'vite.config.ts'].includes(normalized.toLowerCase())
    ) {
        return { status: 403, error: '403 Cấm truy cập: Tệp tin hoặc thư mục được bảo vệ.' };
    }

    const relPath = normalized === '' || normalized === '.' ? 'index.html' : normalized;
    const targetFile = path.resolve(projectRoot, relPath);

    const relFromRoot = path.relative(projectRoot, targetFile);
    if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
        return { status: 403, error: '403 Cấm truy cập: Yêu cầu ngoài phạm vi thư mục dự án.' };
    }

    if (fs.existsSync(targetFile)) {
        const stats = fs.statSync(targetFile);
        if (stats.isDirectory()) {
            if (!urlPathOnly.endsWith('/')) {
                return { status: 301, redirect: getSafeRedirectUrl(relPath, queryString) };
            }
            const indexHtml = path.join(targetFile, 'index.html');
            const idxRel1 = path.relative(projectRoot, indexHtml);
            if (!idxRel1.startsWith('..') && !path.isAbsolute(idxRel1) && fs.existsSync(indexHtml)) {
                return { status: 200, filePath: indexHtml };
            }

            const indexTs = path.join(targetFile, 'index.ts');
            const idxRel2 = path.relative(projectRoot, indexTs);
            if (!idxRel2.startsWith('..') && !path.isAbsolute(idxRel2) && fs.existsSync(indexTs)) {
                return { status: 200, filePath: indexTs };
            }

            const indexJs = path.join(targetFile, 'index.js');
            const idxRel3 = path.relative(projectRoot, indexJs);
            if (!idxRel3.startsWith('..') && !path.isAbsolute(idxRel3) && fs.existsSync(indexJs)) {
                return { status: 200, filePath: indexJs };
            }

            return { status: 404, error: 'Thư mục không có tệp tin khởi đầu.' };
        }
        return { status: 200, filePath: targetFile };
    }

    const candidates = [
        path.resolve(publicPath, relPath),
        targetFile + '.html',
        path.join(publicPath, relPath + '.html'),
        targetFile + '.ts',
        targetFile + '.js',
        path.join(targetFile, 'index.html'),
        path.join(targetFile, 'index.ts')
    ];

    for (const cand of candidates) {
        const candRel = path.relative(projectRoot, cand);
        if (!candRel.startsWith('..') && !path.isAbsolute(candRel)) {
            if (fs.existsSync(cand)) {
                const candStat = fs.statSync(cand);
                if (candStat.isDirectory()) {
                    if (!urlPathOnly.endsWith('/')) {
                        return { status: 301, redirect: getSafeRedirectUrl(relPath, queryString) };
                    }
                    const subIndex = path.join(cand, 'index.html');
                    const subRel = path.relative(projectRoot, subIndex);
                    if (!subRel.startsWith('..') && !path.isAbsolute(subRel) && fs.existsSync(subIndex)) {
                        return { status: 200, filePath: subIndex };
                    }
                } else {
                    return { status: 200, filePath: cand };
                }
            }
        }
    }

    return { status: 404, error: `Tệp tin không tồn tại: ${escapeHTML(cleanPath)}` };
}

const server = http.createServer((req, res) => {
    // Enable CORS for ease of development and API testing
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const resolved = resolveTargetFile(req.url || '/');

    if (resolved.status === 301 && resolved.redirect) {
        const target = String(resolved.redirect || '/');
        // Validate against strict relative URL pattern to prevent open redirection (CWE-601)
        if (/^\/[a-zA-Z0-9_\-\/]+(\?[a-zA-Z0-9_\-=&]*)?$/.test(target) && !target.startsWith('//')) {
            res.writeHead(301, {
                'Location': target,
                'Content-Type': 'text/plain; charset=utf-8'
            });
            res.end(`Redirecting to ${escapeHTML(target)}`);
        } else {
            res.writeHead(301, {
                'Location': '/',
                'Content-Type': 'text/plain; charset=utf-8'
            });
            res.end('Redirecting to /');
        }
        return;
    }

    if (resolved.status === 403) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(resolved.error || '403 Cấm truy cập.');
        return;
    }

    if (resolved.status === 404 || !resolved.filePath) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.statusCode = 404;
        res.end(`
            <div style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #f8fafc; height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <h1 style="color: #f43f5e; font-size: 48px; margin: 0 0 10px 0;">404 Not Found</h1>
                <p style="color: #94a3b8; font-size: 16px;">${resolved.error || 'Tệp tin không tồn tại'}</p>
                <a href="/" style="margin-top: 20px; color: #6366f1; text-decoration: none; font-weight: bold; border: 1px solid #6366f1; padding: 10px 20px; border-radius: 8px; background: rgba(99,102,241,0.1);">Về Trang Chủ</a>
            </div>
        `);
        return;
    }

    const filePath = resolved.filePath;
    const fileRel = path.relative(projectRoot, filePath);
    if (fileRel.startsWith('..') || path.isAbsolute(fileRel)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('403 Cấm truy cập: Yêu cầu ngoài phạm vi thư mục dự án.');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.ts') {
        fs.readFile(filePath, 'utf-8', (readErr, tsContent) => {
            if (readErr) {
                res.statusCode = 500;
                res.end(`<h1>Lỗi Đọc File TypeScript: ${escapeHTML(readErr.code)}</h1>`);
                return;
            }

            if (bunTranspiler) {
                try {
                    const resolvedTs = resolveTsImports(tsContent, path.dirname(filePath));
                    const jsCode = bunTranspiler.transformSync(resolvedTs);
                    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
                    res.end(jsCode, 'utf-8');
                    return;
                } catch (bErr) {
                    console.error('Lỗi Bun Transpiler:', bErr);
                }
            }

            if (!ts) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.end(`
                    <div style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #f8fafc; height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <h1 style="color: #f43f5e; font-size: 32px; margin: 0 0 10px 0;">Thiếu Module TypeScript</h1>
                        <p style="color: #94a3b8; font-size: 16px;">Server cần runtime Bun hoặc module <code>typescript</code> để biên dịch trực tiếp các file <code>.ts</code>.</p>
                        <p style="color: #cbd5e1; font-size: 14px;">Vui lòng chạy lệnh <code>bun server/server.js</code> hoặc <code>npm run dev</code>.</p>
                    </div>
                `);
                return;
            }

            try {
                const resolvedTs = resolveTsImports(tsContent, path.dirname(filePath));
                const resObj = ts.transpileModule(resolvedTs, {
                    compilerOptions: {
                        module: ts.ModuleKind.ESNext,
                        target: ts.ScriptTarget.ES2022,
                        isolatedModules: true
                    }
                });
                const jsCode = resObj.outputText;
                res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
                res.end(jsCode, 'utf-8');
            } catch (compileErr) {
                console.error('Lỗi biên dịch TypeScript:', compileErr);
                res.statusCode = 500;
                res.end(`console.error("TypeScript Error: ${escapeHTML(compileErr.message)}");`);
            }
        });
        return;
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
        if (!res.headersSent) {
            res.statusCode = 500;
            res.end(`<h1>Lỗi Máy Chủ: ${escapeHTML(streamErr.code)}</h1>`);
        }
    });
    stream.pipe(res);
});

let currentPort = PORT;

function startServer(port) {
    currentPort = port;
    server.listen(port, '0.0.0.0', () => {
        const localUrl = `http://localhost:${port}`;
        const interfaces = os.networkInterfaces();
        const networkIps = [];

        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    networkIps.push(iface.address);
                }
            }
        }

        console.log('\x1b[32m%s\x1b[0m', '==================================================');
        console.log('\x1b[36m%s\x1b[0m', '  🚀 Manga Translator Studio local server started!');
        console.log('\x1b[32m%s\x1b[0m', '==================================================');
        console.log(`  💻 Trên máy tính (Local):    \x1b[35m%s\x1b[0m`, localUrl);
        networkIps.forEach(ip => {
            console.log(`  📱 Trên điện thoại (Mobile): \x1b[32mhttp://%s:%s\x1b[0m`, ip, port);
        });
        console.log('\x1b[32m%s\x1b[0m', '==================================================');
        console.log(`  📁 Directory:  %s`, __dirname);
        console.log('\x1b[33m%s\x1b[0m', '  💡 Bấm Ctrl + C để dừng máy chủ.');
        console.log('\x1b[32m%s\x1b[0m', '==================================================');

        // Automatically open the default browser based on platform (only in normal run)
        if (process.env.NODE_ENV !== 'test' && !process.env.CI) {
            try {
                const cmd = process.platform === 'win32'
                    ? `start ${localUrl}`
                    : process.platform === 'darwin'
                        ? `open ${localUrl}`
                        : `xdg-open ${localUrl}`;
                exec(cmd);
            } catch (e) {
                console.warn('⚠️ Không thể tự động mở trình duyệt. Bạn hãy click trực tiếp vào link trên nhé.');
            }
        }
    });
}

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        const nextPort = currentPort + 1;
        console.warn(`\x1b[33m⚠️ Cổng ${currentPort} đang được tiến trình khác sử dụng, tự động chuyển sang cổng ${nextPort}...\x1b[0m`);
        startServer(nextPort);
    } else {
        console.error('Lỗi máy chủ:', err);
    }
});

startServer(PORT);
