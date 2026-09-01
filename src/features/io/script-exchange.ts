/**
 * Manga Translator Studio - IO: Script Exporter & Importer (TXT / JSON)
 * Manages exporting chapter translation scripts to TXT / JSON and parsing imported scripts back to blocks.
 */
import { globalState, pushStateToHistory, savePageToDB } from '../../core/state';
import { showToast } from '../../core/utils';
import { renderOverlays } from '../canvas/canvas-service';
import { updateActiveBlockEditor } from '../../ui/index';
import { MangaPage, BoundingBox } from '../../types/index';

export function triggerImportScript(): void {
    let inputEl = document.getElementById('import-script-input') as HTMLInputElement | null;
    if (!inputEl) {
        inputEl = document.createElement('input');
        inputEl.type = 'file';
        inputEl.id = 'import-script-input';
        inputEl.accept = '.json,.txt';
        inputEl.className = 'hidden';
        inputEl.onchange = (e: any) => importTranslationScript(e.target.files);
        document.body.appendChild(inputEl);
    }
    inputEl.click();
}

export function promptExportScript(): void {
    if (globalState.pages.length === 0) {
        showToast("Không có trang truyện nào trong dự án.", "warn");
        return;
    }

    const choice = prompt(
        "QUẢN LÝ KỊCH BẢN DỊCH THUẬT:\n\n" +
        "1 - Xuất kịch bản Văn Bản (.txt)\n" +
        "2 - Xuất kịch bản Cấu Trúc (.json)\n" +
        "3 - Nhập kịch bản từ tệp (.json hoặc .txt)\n\n" +
        "Vui lòng nhập số 1, 2 hoặc 3:",
        "1"
    );

    if (choice === '1') {
        exportTranslationScript('txt');
    } else if (choice === '2') {
        exportTranslationScript('json');
    } else if (choice === '3') {
        triggerImportScript();
    }
}

export function generateTxtScript(pages: MangaPage[]): string {
    let fileContent = "";
    fileContent += `==================================================\n`;
    fileContent += `  KỊCH BẢN DỊCH THUẬT MANGA - TOÀN BỘ CHƯƠNG (${pages.length} TRANG)\n`;
    fileContent += `  Thời gian xuất: ${new Date().toLocaleString()}\n`;
    fileContent += `==================================================\n\n`;

    pages.forEach((page, index) => {
        fileContent += `[TRANG ${index + 1}: ${page.name || `Trang ${index + 1}`}]\n`;
        fileContent += `--------------------------------------------------\n`;

        const blocks = page.blocks || [];
        if (blocks.length === 0) {
            fileContent += `  (Trang này chưa có ô văn bản nào)\n\n`;
        } else {
            blocks.forEach((block, bIdx) => {
                const blockId = block.id ? ` [id: ${block.id}]` : '';
                const typeLabel = block.type === 'narration' ? 'Dẫn truyện' :
                    (block.type === 'thought' ? 'Nghĩ thầm' :
                        (block.type === 'sfx' ? 'SFX' :
                            (block.type === 'image' ? 'Ảnh chèn' : 'Thoại')));
                const speakerInfo = block.speaker ? ` [Nhân vật: ${block.speaker}]` : '';

                fileContent += `#${bIdx + 1}${blockId} [${typeLabel}]${speakerInfo}\n`;
                if (block.type === 'image') {
                    fileContent += `[Ảnh]: ${block.imageUrl ? 'Có dữ liệu ảnh' : 'Chưa chọn ảnh'}\n\n`;
                } else {
                    fileContent += `[Gốc]:\n${block.original || '(Rỗng)'}\n`;
                    fileContent += `[Dịch]:\n${block.translated || ''}\n\n`;
                }
            });
        }
        fileContent += `\n`;
    });
    return fileContent;
}

export function parseTxtBlocksSection(sectionText: string): any[] {
    const blocks: any[] = [];
    if (!sectionText) return blocks;

    const lines = sectionText.split('\n');
    let currentBlock: any = null;
    let currentField: 'original' | 'translated' | null = null;
    let originalLines: string[] = [];
    let translatedLines: string[] = [];

    function commitCurrentBlock() {
        if (!currentBlock && originalLines.length === 0 && translatedLines.length === 0) return;

        let origText = originalLines.join('\n').trim();
        let transText = translatedLines.join('\n').trim();

        if (origText.startsWith('"') && origText.endsWith('"') && origText.length >= 2) {
            origText = origText.substring(1, origText.length - 1);
        }
        if (transText.startsWith('"') && transText.endsWith('"') && transText.length >= 2) {
            transText = transText.substring(1, transText.length - 1);
        }

        if (origText === '(Rỗng)') origText = '';

        const blockObj = {
            id: currentBlock?.id || null,
            blockIndex: currentBlock?.blockIndex !== undefined ? currentBlock.blockIndex : null,
            type: currentBlock?.type || 'dialogue',
            speaker: currentBlock?.speaker || null,
            original: origText,
            translated: transText
        };

        blocks.push(blockObj);

        currentBlock = null;
        currentField = null;
        originalLines = [];
        translatedLines = [];
    }

    for (const line of lines) {
        const trimmed = line.trim();

        if (/^[-=]{3,}$/.test(trimmed)) {
            continue;
        }

        if (/^\*\s+[A-ZÀ-Ỹ\s,()&]+:?$/i.test(trimmed)) {
            continue;
        }

        if (/^\(.*\)$/.test(trimmed) && trimmed.toLowerCase().includes('không có')) {
            continue;
        }

        const blockHeaderMatch = trimmed.match(/^#(\d+)(?:\s+\[id:\s*([^\]]+)\])?(?:\s+\[([^\]]+)\])?(?:\s+\[(?:Nhân vật|Speaker):\s*([^\]]+)\])?/i);
        const legacyLineMatch = trimmed.match(/^(\d+)\.(?:\s+\[([^\]]+)\])?(?:\s+\[(?:Gốc|Original)\]\s*:\s*(.*))?$/i);

        if (blockHeaderMatch) {
            commitCurrentBlock();
            const bIdx = parseInt(blockHeaderMatch[1], 10) - 1;
            const bId = blockHeaderMatch[2]?.trim() || null;
            const rawType = (blockHeaderMatch[3] || '').trim().toLowerCase();
            const speaker = blockHeaderMatch[4]?.trim() || null;

            let type = 'dialogue';
            if (rawType.includes('dẫn') || rawType.includes('narration')) type = 'narration';
            else if (rawType.includes('nghĩ') || rawType.includes('thought')) type = 'thought';
            else if (rawType.includes('sfx')) type = 'sfx';
            else if (rawType.includes('ảnh') || rawType.includes('image')) type = 'image';

            currentBlock = {
                blockIndex: bIdx,
                id: bId,
                type: type,
                speaker: speaker
            };
            currentField = null;
            continue;
        }

        const origTagMatch = trimmed.match(/^\[(?:Gốc|Original)\]\s*:\s*(.*)$/i);
        if (origTagMatch) {
            if (currentField === 'translated' || (currentField === 'original' && originalLines.length > 0)) {
                commitCurrentBlock();
            }
            currentField = 'original';
            const inlineContent = origTagMatch[1].trim();
            if (inlineContent) {
                originalLines.push(inlineContent);
            }
            continue;
        }

        const transTagMatch = trimmed.match(/^\[(?:Dịch|Translated|Translation)\]\s*:\s*(.*)$/i);
        if (transTagMatch) {
            currentField = 'translated';
            const inlineContent = transTagMatch[1].trim();
            if (inlineContent) {
                translatedLines.push(inlineContent);
            }
            continue;
        }

        if (legacyLineMatch && !blockHeaderMatch) {
            commitCurrentBlock();
            const bIdx = parseInt(legacyLineMatch[1], 10) - 1;
            const tag = legacyLineMatch[2] || '';
            let speaker: string | null = null;
            let type = 'dialogue';
            if (tag.toLowerCase().startsWith('nhân vật:') || tag.toLowerCase().startsWith('speaker:')) {
                speaker = tag.replace(/^(?:nhân vật|speaker):\s*/i, '').trim();
            } else if (tag.toLowerCase().includes('dẫn') || tag.toLowerCase().includes('narration')) {
                type = 'narration';
            } else if (tag.toLowerCase().includes('nghĩ') || tag.toLowerCase().includes('thought')) {
                type = 'thought';
            } else if (tag.toLowerCase().includes('sfx')) {
                type = 'sfx';
            }

            currentBlock = {
                blockIndex: bIdx,
                id: null,
                type: type,
                speaker: speaker
            };

            if (legacyLineMatch[3] !== undefined) {
                currentField = 'original';
                originalLines.push(legacyLineMatch[3].trim());
            } else {
                currentField = null;
            }
            continue;
        }

        if (currentField === 'original') {
            originalLines.push(line);
        } else if (currentField === 'translated') {
            translatedLines.push(line);
        }
    }

    commitCurrentBlock();
    return blocks;
}

export function parseTxtScript(text: string): any[] {
    if (!text || typeof text !== 'string') return [];

    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const pageHeaderRegex = /\[(?:TRANG|PAGE)\s+(\d+)(?:\s*:\s*([^\]]+))?\]/gi;
    let match: RegExpExecArray | null;
    const pageMatches: any[] = [];

    while ((match = pageHeaderRegex.exec(normalizedText)) !== null) {
        pageMatches.push({
            index: match.index,
            pageIndex: parseInt(match[1], 10) - 1,
            pageName: (match[2] || '').trim(),
            headerLength: match[0].length
        });
    }

    if (pageMatches.length === 0) {
        const blocks = parseTxtBlocksSection(normalizedText);
        if (blocks.length > 0) {
            return [{ pageIndex: 0, pageName: '', blocks }];
        }
        return [];
    }

    const pages: any[] = [];
    for (let i = 0; i < pageMatches.length; i++) {
        const cur = pageMatches[i];
        const startPos = cur.index + cur.headerLength;
        const endPos = (i < pageMatches.length - 1) ? pageMatches[i + 1].index : normalizedText.length;
        const sectionText = normalizedText.substring(startPos, endPos);

        const blocks = parseTxtBlocksSection(sectionText);
        pages.push({
            pageIndex: cur.pageIndex,
            pageName: cur.pageName,
            blocks: blocks
        });
    }

    return pages;
}

export function parseScriptBox(rawBox: any): BoundingBox | null {
    if (!rawBox) return null;
    let x = 0, y = 0, w = 10, h = 10;
    if (Array.isArray(rawBox)) {
        if (rawBox.length >= 4) {
            x = Number(rawBox[0]);
            y = Number(rawBox[1]);
            w = Number(rawBox[2]);
            h = Number(rawBox[3]);
        } else if (rawBox.length === 2) {
            x = Number(rawBox[0]);
            y = Number(rawBox[1]);
            w = 20;
            h = 10;
        } else {
            return null;
        }
    } else if (typeof rawBox === 'object') {
        x = Number(rawBox.x !== undefined ? rawBox.x : rawBox.left || 0);
        y = Number(rawBox.y !== undefined ? rawBox.y : rawBox.top || 0);
        w = Number(rawBox.w !== undefined ? rawBox.w : rawBox.width || 10);
        h = Number(rawBox.h !== undefined ? rawBox.h : rawBox.height || 10);
    } else {
        return null;
    }
    if (isNaN(x)) x = 0;
    if (isNaN(y)) y = 0;
    if (isNaN(w) || w <= 0) w = 10;
    if (isNaN(h) || h <= 0) h = 10;

    // If coordinates are in 0-1000 scale (values exceed 100), convert to 0-100%
    if (x > 100 || y > 100 || w > 100 || h > 100) {
        x = x / 10;
        y = y / 10;
        w = w / 10;
        h = h / 10;
    }

    return {
        x: Math.max(0, Math.min(100, Math.round(x * 100) / 100)),
        y: Math.max(0, Math.min(100, Math.round(y * 100) / 100)),
        w: Math.max(0.5, Math.min(100 - x, Math.round(w * 100) / 100)),
        h: Math.max(0.5, Math.min(100 - y, Math.round(h * 100) / 100))
    };
}

export function applyScriptPagesToProject(pagesArray: any[]): { matchedPages: number; matchedBlocks: number } {
    let matchedPages = 0;
    let matchedBlocks = 0;

    if (!Array.isArray(pagesArray)) return { matchedPages, matchedBlocks };

    pagesArray.forEach((scriptPage, pIdx) => {
        if (!scriptPage.blocks || !Array.isArray(scriptPage.blocks)) return;

        let targetPage: MangaPage | undefined = undefined;

        if (scriptPage.pageName) {
            targetPage = globalState.pages.find(p => p.name === scriptPage.pageName);
        }
        if (!targetPage && scriptPage.page) {
            targetPage = globalState.pages.find(p => p.name === scriptPage.page);
        }
        if (!targetPage && scriptPage.pageIndex !== undefined && scriptPage.pageIndex !== null) {
            const idx = typeof scriptPage.pageIndex === 'number' ? scriptPage.pageIndex : parseInt(scriptPage.pageIndex, 10);
            if (!isNaN(idx) && idx >= 0 && idx < globalState.pages.length) {
                targetPage = globalState.pages[idx];
            }
        }
        if (!targetPage && pIdx < globalState.pages.length) {
            targetPage = globalState.pages[pIdx];
        }

        if (!targetPage) return;
        matchedPages++;

        const matchedInTarget = new Set();

        scriptPage.blocks.forEach((scriptBlock: any, blockIdx: number) => {
            let targetBlock: any = null;
            const blockId = scriptBlock.id || scriptBlock.blockId;

            if (blockId && targetPage) {
                targetBlock = targetPage.blocks.find(b => b.id === blockId && !matchedInTarget.has(b));
            }
            if (!targetBlock && scriptBlock.original && targetPage) {
                const origClean = String(scriptBlock.original).trim();
                if (origClean) {
                    targetBlock = targetPage.blocks.find(b => b.original && b.original.trim() === origClean && !matchedInTarget.has(b));
                }
            }
            if (!targetBlock && scriptBlock.blockIndex !== null && scriptBlock.blockIndex !== undefined && targetPage) {
                const idx = typeof scriptBlock.blockIndex === 'number' ? scriptBlock.blockIndex : parseInt(scriptBlock.blockIndex, 10);
                if (!isNaN(idx) && idx >= 0 && idx < targetPage.blocks.length && !matchedInTarget.has(targetPage.blocks[idx])) {
                    targetBlock = targetPage.blocks[idx];
                }
            }
            if (!targetBlock && targetPage && blockIdx < targetPage.blocks.length && !matchedInTarget.has(targetPage.blocks[blockIdx])) {
                targetBlock = targetPage.blocks[blockIdx];
            }

            if (!targetBlock) return;
            matchedInTarget.add(targetBlock);

            if (scriptBlock.translated !== undefined && scriptBlock.translated !== null) {
                targetBlock.translated = scriptBlock.translated;
                matchedBlocks++;
            }
            if (scriptBlock.box || scriptBlock.positionPercent) {
                const parsedBox = parseScriptBox(scriptBlock.box || scriptBlock.positionPercent);
                if (parsedBox) targetBlock.box = parsedBox;
            }
            if (scriptBlock.speaker) {
                targetBlock.speaker = scriptBlock.speaker;
            }
            if (scriptBlock.vertical !== undefined) {
                targetBlock.vertical = scriptBlock.vertical;
                if (targetBlock.style) targetBlock.style.vertical = scriptBlock.vertical;
            }
        });

        savePageToDB(targetPage);
    });

    return { matchedPages, matchedBlocks };
}

export function applyFlatScriptBlocksToProject(flatBlocksArray: any[]): { matchedPages: number; matchedBlocks: number } {
    let matchedBlocks = 0;
    const touchedPages = new Set<MangaPage>();
    const matchedInTarget = new Set();

    if (!Array.isArray(flatBlocksArray)) return { matchedPages: 0, matchedBlocks: 0 };

    flatBlocksArray.forEach((scriptBlock) => {
        const blockId = scriptBlock.id || scriptBlock.blockId;
        let targetBlock: any = null;
        let targetPage: MangaPage | null = null;

        for (const p of globalState.pages) {
            if (blockId) {
                const found = (p.blocks || []).find(b => b.id === blockId && !matchedInTarget.has(b));
                if (found) {
                    targetBlock = found;
                    targetPage = p;
                    break;
                }
            }
        }

        if (!targetBlock && scriptBlock.original) {
            const origClean = String(scriptBlock.original).trim();
            if (origClean) {
                for (const p of globalState.pages) {
                    const found = (p.blocks || []).find(b => b.original && b.original.trim() === origClean && !matchedInTarget.has(b));
                    if (found) {
                        targetBlock = found;
                        targetPage = p;
                        break;
                    }
                }
            }
        }

        if (targetBlock && targetPage) {
            matchedInTarget.add(targetBlock);
            if (scriptBlock.translated !== undefined && scriptBlock.translated !== null) {
                targetBlock.translated = scriptBlock.translated;
                matchedBlocks++;
            }
            if (scriptBlock.box || scriptBlock.positionPercent) {
                const parsedBox = parseScriptBox(scriptBlock.box || scriptBlock.positionPercent);
                if (parsedBox) targetBlock.box = parsedBox;
            }
            if (scriptBlock.speaker) {
                targetBlock.speaker = scriptBlock.speaker;
            }
            if (scriptBlock.vertical !== undefined) {
                targetBlock.vertical = scriptBlock.vertical;
                if (targetBlock.style) targetBlock.style.vertical = scriptBlock.vertical;
            }
            touchedPages.add(targetPage);
        }
    });

    touchedPages.forEach(p => savePageToDB(p));
    return { matchedPages: touchedPages.size, matchedBlocks };
}

export function exportTranslationScript(format: 'txt' | 'json'): void {
    if (globalState.pages.length === 0) {
        showToast("Không có trang truyện nào để xuất kịch bản.", "error");
        return;
    }

    let fileContent = "";
    let mimeType = "text/plain";
    let fileName = `chapter_script_${Date.now()}`;

    if (format === 'txt') {
        fileName += ".txt";
        fileContent = generateTxtScript(globalState.pages);
    } else if (format === 'json') {
        fileName += ".json";
        mimeType = "application/json";

        const scriptData = {
            chapterName: "Manga Translation Script",
            totalPages: globalState.pages.length,
            exportedAt: new Date().toISOString(),
            pages: globalState.pages.map((page, index) => ({
                pageIndex: index,
                pageName: page.name || `Trang ${index + 1}`,
                blocks: (page.blocks || []).map(b => {
                    const isVertical = (b.vertical !== undefined) ? !!b.vertical : !!(b.style?.vertical);
                    const boxArray = b.box ? [
                        Math.round((b.box.x || 0) * 100) / 100,
                        Math.round((b.box.y || 0) * 100) / 100,
                        Math.round((b.box.w || 0) * 100) / 100,
                        Math.round((b.box.h || 0) * 100) / 100
                    ] : [0, 0, 0, 0];
                    const blockData: any = {
                        id: b.id,
                        type: b.type || 'dialogue',
                        original: b.original || '',
                        translated: b.translated || '',
                        box: boxArray
                    };
                    if (isVertical) {
                        blockData.vertical = true;
                    }
                    if (b.speaker) blockData.speaker = b.speaker;
                    if ((b as any).target) blockData.target = (b as any).target;
                    if (b.type === 'image' && b.imageUrl) {
                        blockData.imageUrl = b.imageUrl;
                    }
                    return blockData;
                })
            }))
        };
        fileContent = JSON.stringify(scriptData, null, 2);
    }

    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Đã xuất kịch bản thành công dưới định dạng ${format.toUpperCase()}!`, "success");
}

export async function importTranslationScript(fileList: FileList | File[]): Promise<void> {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    const fileName = file.name.toLowerCase();

    if (!fileName.endsWith('.json') && !fileName.endsWith('.txt')) {
        showToast("Chỉ hỗ trợ nhập kịch bản định dạng .JSON hoặc .TXT!", "error");
        return;
    }

    try {
        const text = await file.text();
        pushStateToHistory(true);

        let matchedPages = 0;
        let matchedBlocks = 0;

        if (fileName.endsWith('.json')) {
            const scriptData = JSON.parse(text);

            let pagesArray: any = null;
            let flatBlocksArray: any = null;

            if (scriptData && Array.isArray(scriptData.pages)) {
                pagesArray = scriptData.pages;
            } else if (Array.isArray(scriptData)) {
                if (scriptData.length > 0 && Array.isArray(scriptData[0].blocks)) {
                    pagesArray = scriptData;
                } else {
                    flatBlocksArray = scriptData;
                }
            } else if (scriptData && Array.isArray(scriptData.blocks)) {
                flatBlocksArray = scriptData.blocks;
            }

            if (pagesArray) {
                const res = applyScriptPagesToProject(pagesArray);
                matchedPages = res.matchedPages;
                matchedBlocks = res.matchedBlocks;
            } else if (flatBlocksArray) {
                const res = applyFlatScriptBlocksToProject(flatBlocksArray);
                matchedPages = res.matchedPages;
                matchedBlocks = res.matchedBlocks;
            } else {
                showToast("Dữ liệu kịch bản JSON không hợp lệ!", "error");
                return;
            }
        } else if (fileName.endsWith('.txt')) {
            const parsedPages = parseTxtScript(text);
            if (parsedPages.length === 0) {
                showToast("Không tìm thấy cấu trúc [TRANG ...] trong file kịch bản TXT!", "error");
                return;
            }

            const res = applyScriptPagesToProject(parsedPages);
            matchedPages = res.matchedPages;
            matchedBlocks = res.matchedBlocks;
        }

        renderOverlays();
        updateActiveBlockEditor();

        showToast(`Đã nhập kịch bản thành công! Khớp ${matchedPages} trang, cập nhật ${matchedBlocks} ô dịch.`, "success");

    } catch (err: any) {
        console.error("Lỗi nhập kịch bản:", err);
        showToast(`Lỗi khi đọc/phân tích tệp kịch bản: ${err.message}`, "error");
    }

    const importScriptInput = document.getElementById('import-script-input') as HTMLInputElement | null;
    if (importScriptInput) importScriptInput.value = '';
}
