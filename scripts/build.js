// Zero-dependency Production Build Script for Manga Translator Studio
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ts from '../node_modules/typescript/lib/typescript.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');
const distSrcDir = path.join(distDir, 'src');
const publicDir = path.join(rootDir, 'public');

console.log('🚀 Đang đóng gói dự án cho môi trường Deploy/Production...');

// 1. Tạo các thư mục đầu ra trong dist/
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
if (!fs.existsSync(distSrcDir)) fs.mkdirSync(distSrcDir, { recursive: true });

function getAllFiles(dir, ext = '.ts') {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getAllFiles(fullPath, ext));
        } else if (file.endsWith(ext)) {
            results.push(fullPath);
        }
    });
    return results;
}

function resolveJsImports(code, currentDir) {
    return code
        .replace(/(import|export)\s+([\s\S]*?from\s+['"])([\.\/][^'"]+)(['"])/g, (match, p1, p2, p3, p4) => {
            if (p3.endsWith('.js') || p3.endsWith('.json')) return match;
            if (p3.endsWith('.ts')) {
                return `${p1} ${p2}${p3.slice(0, -3)}.js${p4}`;
            }
            const absTarget = path.resolve(currentDir, p3);
            if (fs.existsSync(absTarget + '.ts') || fs.existsSync(absTarget + '.js')) {
                return `${p1} ${p2}${p3}.js${p4}`;
            }
            if (fs.existsSync(path.join(absTarget, 'index.ts')) || fs.existsSync(path.join(absTarget, 'index.js'))) {
                return `${p1} ${p2}${p3}/index.js${p4}`;
            }
            return `${p1} ${p2}${p3}.js${p4}`;
        })
        .replace(/import\s*\(\s*['"]([\.\/][^'"]+)['"]\s*\)/g, (match, p1) => {
            if (p1.endsWith('.js') || p1.endsWith('.json')) return match;
            if (p1.endsWith('.ts')) {
                return `import('${p1.slice(0, -3)}.js')`;
            }
            const absTarget = path.resolve(currentDir, p1);
            if (fs.existsSync(absTarget + '.ts') || fs.existsSync(absTarget + '.js')) {
                return `import('${p1}.js')`;
            }
            if (fs.existsSync(path.join(absTarget, 'index.ts')) || fs.existsSync(path.join(absTarget, 'index.js'))) {
                return `import('${p1}/index.js')`;
            }
            return `import('${p1}.js')`;
        });
}

// 2. Biên dịch toàn bộ các file TypeScript trong src/ sang dist/src/
const tsFiles = getAllFiles(srcDir, '.ts');
console.log(`📦 Tìm thấy ${tsFiles.length} file TypeScript cần biên dịch.`);

tsFiles.forEach(file => {
    const relPath = path.relative(srcDir, file);
    const targetJsPath = path.join(distSrcDir, relPath.replace(/\.ts$/, '.js'));
    const targetDir = path.dirname(targetJsPath);

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const tsContent = fs.readFileSync(file, 'utf-8');
    const withJsImports = resolveJsImports(tsContent, path.dirname(file));

    const result = ts.transpileModule(withJsImports, {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            isolatedModules: true,
            removeComments: false
        }
    });

    fs.writeFileSync(targetJsPath, result.outputText, 'utf-8');
});

// 3. Sao chép và cập nhật index.html vào dist/
const rootIndexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
const distIndexHtml = rootIndexHtml
    .replace('/src/main.ts', './src/main.js')
    .replace('src="/src/main.ts"', 'src="./src/main.js"');

fs.writeFileSync(path.join(distDir, 'index.html'), distIndexHtml, 'utf-8');

// 4. Sao chép toàn bộ tài nguyên tĩnh trong public/ vào dist/
function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(child => {
            copyRecursive(path.join(src, child), path.join(dest, child));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

copyRecursive(publicDir, distDir);

// 5. Cập nhật Service Worker trong dist
if (fs.existsSync(path.join(distDir, 'sw.js'))) {
    const swContent = fs.readFileSync(path.join(distDir, 'sw.js'), 'utf-8');
    fs.writeFileSync(path.join(distDir, 'sw.js'), swContent, 'utf-8');
}

console.log('✅ Đã đóng gói thành công toàn bộ thư mục dist/!');
console.log('📁 Toàn bộ mã nguồn ES2022 JavaScript và giao diện mới nhất đã sẵn sàng để Deploy lên GitHub Pages, Vercel, Netlify hoặc chạy trực tiếp.');
