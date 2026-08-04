// Zero-Dependency Local Static File Web Server for Manga Translator Studio
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

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
    const urlPath = decodedUrl.split('?')[0];
    const rootPath = path.join(__dirname, '..', 'public');
    let filePath = path.join(rootPath, urlPath === '/' ? 'index.html' : urlPath);

    // Security check to prevent directory traversal
    const relative = path.relative(rootPath, filePath);
    const isSafe = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
    if (!isSafe && filePath !== rootPath) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('403 Cấm truy cập: Yêu cầu ngoài phạm vi thư mục dự án.');
        return;
    }

    // If target is directory, append index.html
    fs.stat(filePath, (err, stats) => {
        if (!err && stats.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (readErr, content) => {
            if (readErr) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                if (readErr.code === 'ENOENT') {
                    res.statusCode = 404;
                    res.end(`
                        <div style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #f8fafc; height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <h1 style="color: #f43f5e; font-size: 48px; margin: 0 0 10px 0;">404 Not Found</h1>
                            <p style="color: #94a3b8; font-size: 16px;">Tệp tin bạn yêu cầu không tồn tại: <code>${escapeHTML(urlPath)}</code></p>
                            <a href="/" style="margin-top: 20px; color: #6366f1; text-decoration: none; font-weight: bold; border: 1px solid #6366f1; padding: 10px 20px; border-radius: 8px; background: rgba(99,102,241,0.1);">Về Trang Chủ</a>
                        </div>
                    `);
                } else {
                    res.statusCode = 500;
                    res.end(`<h1>Lỗi Máy Chủ: ${escapeHTML(readErr.code)}</h1>`);
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
    });
});

server.listen(PORT, () => {
    const localUrl = `http://localhost:${PORT}`;
    console.log('\x1b[32m%s\x1b[0m', '==================================================');
    console.log('\x1b[36m%s\x1b[0m', '  🚀 Manga Translator Studio local server started!');
    console.log('\x1b[32m%s\x1b[0m', '==================================================');
    console.log(`  🔗 Local URL:  \x1b[35m%s\x1b[0m`, localUrl);
    console.log(`  📁 Directory:  %s`, __dirname);
    console.log('\x1b[33m%s\x1b[0m', '  💡 Bấm Ctrl + C để dừng máy chủ.');
    console.log('\x1b[32m%s\x1b[0m', '==================================================');

    // Automatically open the default browser based on platform
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
});
