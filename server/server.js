// Zero-Dependency Local Static File Web Server for Manga Translator Studio
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    '.otf': 'font/otf'
};

let ts = null;
try {
    const tsPath = path.join(__dirname, '..', 'node_modules', 'typescript', 'lib', 'typescript.js');
    if (fs.existsSync(tsPath)) {
        const tsModule = await import(`file://${tsPath.replace(/\\/g, '/')}`);
        ts = tsModule.default || tsModule;
    }
} catch (e) {
    console.warn('TypeScript module not found:', e.message);
}

function resolveTsImports(code, currentDir) {
    return code
        .replace(/(import|export)\s+([\s\S]*?from\s+['"])([\.\/][^'"]+)(['"])/g, (match, p1, p2, p3, p4) => {
            if (p3.endsWith('.js') || p3.endsWith('.ts') || p3.endsWith('.json')) return match;
            const absTarget = path.resolve(currentDir, p3);
            if (fs.existsSync(absTarget + '.ts')) return `${p1} ${p2}${p3}.ts${p4}`;
            if (fs.existsSync(path.join(absTarget, 'index.ts'))) return `${p1} ${p2}${p3}/index.ts${p4}`;
            if (fs.existsSync(absTarget + '.js')) return `${p1} ${p2}${p3}.js${p4}`;
            return match;
        })
        .replace(/import\s*\(\s*['"]([\.\/][^'"]+)['"]\s*\)/g, (match, p1) => {
            if (p1.endsWith('.js') || p1.endsWith('.ts') || p1.endsWith('.json')) return match;
            const absTarget = path.resolve(currentDir, p1);
            if (fs.existsSync(absTarget + '.ts')) return `import('${p1}.ts')`;
            if (fs.existsSync(path.join(absTarget, 'index.ts'))) return `import('${p1}/index.ts')`;
            return match;
        });
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

    // Decode URI component to support file names with spaces or special characters
    let decodedUrl;
    try {
        decodedUrl = decodeURIComponent(req.url);
    } catch (e) {
        decodedUrl = req.url;
    }

    // Extract path name without query strings
    const urlPath = decodedUrl.split('?')[0].split('#')[0];
    const projectRoot = path.resolve(__dirname, '..');
    const publicPath = path.join(projectRoot, 'public');

    // Clean and normalize requested path
    const cleanUrlPath = urlPath.replace(/\0/g, '');
    const normalizedRelative = path.normalize(cleanUrlPath).replace(/^(\.\.[\/\\])+/, '');
    const segments = normalizedRelative.split(/[/\\]/).filter(Boolean);

    // Block hidden files, git, env, config files, and private server folders
    const isSensitive = segments.some(seg => seg.startsWith('.')) ||
        segments.includes('server') ||
        (segments.includes('node_modules') && !normalizedRelative.includes('typescript')) ||
        ['package.json', 'package-lock.json', 'bun.lock', 'bun.lockb', 'tsconfig.json', 'vite.config.ts'].includes(normalizedRelative.toLowerCase());

    if (isSensitive) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('403 Cấm truy cập: Tệp tin hoặc thư mục được bảo vệ.');
        return;
    }

    let safePath = normalizedRelative;
    if (safePath === '/' || safePath === '.' || safePath === '\\' || safePath === '') {
        safePath = 'index.html';
    }

    let filePath = path.resolve(projectRoot, safePath);
    if (!filePath.startsWith(projectRoot)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('403 Cấm truy cập: Yêu cầu ngoài phạm vi thư mục dự án.');
        return;
    }

    if (!fs.existsSync(filePath)) {
        // Fallback to public/ directory
        const pubCandidate = path.resolve(publicPath, safePath);
        if (pubCandidate.startsWith(publicPath) && fs.existsSync(pubCandidate)) {
            filePath = pubCandidate;
        } else if (fs.existsSync(filePath + '.ts')) {
            filePath = filePath + '.ts';
        } else if (fs.existsSync(filePath + '.js')) {
            filePath = filePath + '.js';
        } else if (fs.existsSync(path.join(filePath, 'index.ts'))) {
            filePath = path.join(filePath, 'index.ts');
        }
    }

    fs.stat(filePath, (err, stats) => {
        if (err || (stats && stats.isDirectory())) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.statusCode = 404;
            res.end(`
                <div style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #f8fafc; height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                    <h1 style="color: #f43f5e; font-size: 48px; margin: 0 0 10px 0;">404 Not Found</h1>
                    <p style="color: #94a3b8; font-size: 16px;">Tệp tin không tồn tại: <code>${escapeHTML(urlPath)}</code></p>
                    <a href="/" style="margin-top: 20px; color: #6366f1; text-decoration: none; font-weight: bold; border: 1px solid #6366f1; padding: 10px 20px; border-radius: 8px; background: rgba(99,102,241,0.1);">Về Trang Chủ</a>
                </div>
            `);
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

                if (!ts) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.end(`
                        <div style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #f8fafc; height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <h1 style="color: #f43f5e; font-size: 32px; margin: 0 0 10px 0;">Thiếu Module TypeScript</h1>
                            <p style="color: #94a3b8; font-size: 16px;">Server cần module <code>typescript</code> để biên dịch trực tiếp các file <code>.ts</code>.</p>
                            <p style="color: #cbd5e1; font-size: 14px;">Vui lòng chạy lệnh <code>npm install</code> hoặc <code>bun install</code> rồi khởi động lại máy chủ.</p>
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
