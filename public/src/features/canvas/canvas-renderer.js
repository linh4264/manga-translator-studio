import { globalState, pushStateToHistory, savePageToDB, uiUpdateActiveBlockEditor, uiSetRightTab } from '../../core/state.js';
import { elements } from '../../core/elements.js';
import { showToast, setMultilineText } from '../../core/utils.js';
import { computeBubbleMask } from '../ocr/ocr-service.js';
import { autoFitAllBlocksOnPage, autoFitBlock } from './canvas-styling.js';
import { startBlockDrag, startBlockResize } from './canvas-interactions.js';

export let overlayRenderRafId = null;

export function requestOverlayRender() {
    if (overlayRenderRafId) return;
    overlayRenderRafId = requestAnimationFrame(() => {
        overlayRenderRafId = null;
        renderOverlays();
    });
}

export function renderOverlays(targetContainer = null, customPage = null, customImgElement = null, forceExportScale = 1) {
    const isMirror = targetContainer !== null;
    const container = targetContainer || elements.mangaOverlaysContainer;

    container.innerHTML = '';

    const page = customPage || (globalState.activePageIndex !== -1 ? globalState.pages[globalState.activePageIndex] : null);
    if (!page) return;

    if (globalState.viewMode === 'original' && !isMirror) return;

    const imgElement = customImgElement || elements.mangaBgImage;
    if (imgElement && imgElement.clientWidth > 0) {
        const zoomScale = (globalState.zoom || 100) / 100;
        page.lastDisplayWidth = imgElement.clientWidth / zoomScale;
    }

    if (globalState.autoFitEnabled) {
        const zoomScale = isMirror ? 1 : ((globalState.zoom || 100) / 100);
        const currentDisplayWidth = (imgElement?.clientWidth
            || elements.mangaCanvasContainer?.clientWidth
            || elements.workspaceViewport?.clientWidth
            || 800) / zoomScale;
        const currentDisplayHeight = (imgElement?.clientHeight
            || elements.mangaCanvasContainer?.clientHeight
            || elements.workspaceViewport?.clientHeight
            || Math.round((currentDisplayWidth * zoomScale) * ((imgElement?.naturalHeight || 1200) / Math.max(1, imgElement?.naturalWidth || 800)))) / zoomScale;
        const currentRevision = page.autoFitRevision || 0;

        if (page._lastAutoFitRevision !== currentRevision ||
            Math.abs(page._lastAutoFitDisplayWidth - currentDisplayWidth) > 2 ||
            Math.abs(page._lastAutoFitDisplayHeight - currentDisplayHeight) > 2) {
            autoFitAllBlocksOnPage(page, customImgElement, forceExportScale);
            page._lastAutoFitRevision = currentRevision;
            page._lastAutoFitDisplayWidth = currentDisplayWidth;
            page._lastAutoFitDisplayHeight = currentDisplayHeight;
        }
    }

    let activeImageData = page.imageDataCache || null;
    const hasBubbleFit = page.blocks.some(block => (block.style.maskShape || 'bubble-fit') === 'bubble-fit');

    if (hasBubbleFit && !activeImageData && imgElement.naturalWidth > 0 && imgElement.naturalHeight > 0) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = imgElement.naturalWidth;
            canvas.height = imgElement.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgElement, 0, 0);
            activeImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            page.imageDataCache = activeImageData;
        } catch (e) {
            console.error("Không thể lấy dữ liệu ảnh để khớp bong bóng:", e);
        }
    }

    // 🌟 KHỞI TẠO 2 LAYER ĐỘC LẬP: LỚP NỀN CHE (COVERS) Ở DƯỚI, LỚP VĂN BẢN (TEXTS) Ở TRÊN
    const coversLayer = document.createElement('div');
    coversLayer.className = 'manga-covers-layer absolute inset-0 pointer-events-none z-10';
    coversLayer.setAttribute('data-darkreader-ignore', 'true');
    coversLayer.style.position = 'absolute';
    coversLayer.style.top = '0';
    coversLayer.style.left = '0';
    coversLayer.style.width = '100%';
    coversLayer.style.height = '100%';
    coversLayer.style.zIndex = '1';
    coversLayer.style.pointerEvents = 'none';

    const textsLayer = document.createElement('div');
    textsLayer.className = 'manga-texts-layer absolute inset-0 z-20';
    textsLayer.setAttribute('data-darkreader-ignore', 'true');
    textsLayer.style.position = 'absolute';
    textsLayer.style.top = '0';
    textsLayer.style.left = '0';
    textsLayer.style.width = '100%';
    textsLayer.style.height = '100%';
    textsLayer.style.zIndex = '2';

    page.blocks.forEach((block) => {
        // --- 1. TẠO PHẦN NỀN CHE (BACKGROUND COVER) TRÊN COVERS LAYER ---
        const coverEl = document.createElement('div');
        coverEl.id = isMirror ? `mirror-cover-${block.id}` : `cover-${block.id}`;
        coverEl.setAttribute('data-darkreader-ignore', 'true');
        coverEl.style.position = 'absolute';
        coverEl.style.top = `${block.box.y}%`;
        coverEl.style.left = `${block.box.x}%`;
        coverEl.style.width = `${block.box.w}%`;
        coverEl.style.height = `${block.box.h}%`;
        coverEl.style.pointerEvents = 'none';

        if (block.style.rotate) {
            coverEl.style.transform = `rotate(${block.style.rotate}deg)`;
        }

        coverEl.style.display = 'flex';
        coverEl.style.alignItems = 'center';
        if (block.style.align === 'left') {
            coverEl.style.justifyContent = 'flex-start';
        } else if (block.style.align === 'right') {
            coverEl.style.justifyContent = 'flex-end';
        } else {
            coverEl.style.justifyContent = 'center';
        }

        const coverMaskContent = document.createElement('div');
        coverMaskContent.setAttribute('data-darkreader-ignore', 'true');
        coverMaskContent.style.position = 'relative';
        coverMaskContent.style.overflow = 'hidden';
        coverMaskContent.style.boxSizing = 'border-box';

        if (block.type === 'image') {
            coverMaskContent.style.width = '100%';
            coverMaskContent.style.height = '100%';
            coverMaskContent.style.display = 'flex';
            coverMaskContent.style.alignItems = 'center';
            coverMaskContent.style.justifyContent = 'center';

            const imgEl = document.createElement('img');
            imgEl.src = block.imageUrl || '';
            imgEl.className = 'w-full h-full pointer-events-none select-none';
            imgEl.style.objectFit = block.style.fit || 'contain';
            const rad = block.style.borderRadius || 0;
            imgEl.style.borderRadius = `${rad}px`;
            const opacity = (block.style.opacity !== undefined ? block.style.opacity : 100) / 100;
            imgEl.style.opacity = `${opacity}`;

            coverMaskContent.appendChild(imgEl);
            coverEl.appendChild(coverMaskContent);
        } else {
            const fontStyle = block.style.fontFamily || 'font-comic';
            const isBuiltInFont = fontStyle.startsWith('font-');

            const currentMaskSize = block.style.maskSize || 'full';
            if (currentMaskSize === 'full') {
                coverMaskContent.style.width = '100%';
                coverMaskContent.style.height = '100%';
                coverMaskContent.style.display = 'flex';
                if (block.style.vertical) {
                    coverMaskContent.style.justifyContent = 'center';
                    coverMaskContent.style.alignItems = 'center';
                } else {
                    coverMaskContent.style.alignItems = 'center';
                    coverMaskContent.style.justifyContent = block.style.align === 'left' ? 'flex-start' : block.style.align === 'right' ? 'flex-end' : 'center';
                }
                coverMaskContent.className = `${isBuiltInFont ? fontStyle : ''} pointer-events-none`;
            } else {
                coverMaskContent.style.display = 'flex';
                coverMaskContent.style.alignItems = 'center';
                coverMaskContent.style.justifyContent = 'center';
                coverMaskContent.style.width = 'auto';
                coverMaskContent.style.height = 'auto';
                coverMaskContent.style.maxWidth = '100%';
                coverMaskContent.style.maxHeight = '100%';
                coverMaskContent.className = `${isBuiltInFont ? fontStyle : ''} pointer-events-none`;
            }

            const currentMaskShape = block.style.maskShape || 'bubble-fit';
            let hasBubbleFitMask = false;

            if (currentMaskShape === 'bubble-fit') {
                let dataUrl = block.maskCache ? block.maskCache.dataUrl : null;
                if (!dataUrl && activeImageData) {
                    const maskCanvas = computeBubbleMask(page, block, activeImageData);
                    if (maskCanvas) {
                        dataUrl = block.maskCache?.dataUrl || (maskCanvas.toDataURL ? maskCanvas.toDataURL() : null);
                    }
                }
                if (dataUrl) {
                    coverMaskContent.style.backgroundImage = `url(${dataUrl})`;
                    coverMaskContent.style.backgroundSize = '100% 100%';
                    coverMaskContent.style.backgroundRepeat = 'no-repeat';
                    coverMaskContent.style.backgroundColor = 'transparent';
                    coverMaskContent.style.borderRadius = '0px';
                    hasBubbleFitMask = true;
                }
            }

            if (!hasBubbleFitMask) {
                coverMaskContent.style.backgroundImage = 'none';
                const hexBgColor = block.style.bgColor || '#ffffff';
                const alpha = (block.style.bgOpacity !== undefined ? block.style.bgOpacity : 100) / 100;
                coverMaskContent.style.backgroundColor = convertHexToRGBA(hexBgColor, alpha);

                if (currentMaskShape === 'ellipse') {
                    coverMaskContent.style.borderRadius = '50%';
                } else if (currentMaskShape === 'rounded') {
                    coverMaskContent.style.borderRadius = '12px';
                } else {
                    coverMaskContent.style.borderRadius = '0px';
                }
            }
            coverEl.appendChild(coverMaskContent);
        }
        coversLayer.appendChild(coverEl);

        // --- 2. TẠO PHẦN CHỮ VÀ TƯƠNG TÁC (TEXT & OVERLAY) TRÊN TEXTS LAYER ---
        const bubble = document.createElement('div');
        bubble.id = isMirror ? `mirror-${block.id}` : block.id;

        bubble.style.top = `${block.box.y}%`;
        bubble.style.left = `${block.box.x}%`;
        bubble.style.width = `${block.box.w}%`;
        bubble.style.height = `${block.box.h}%`;

        if (block.style.rotate) {
            bubble.style.transform = `rotate(${block.style.rotate}deg)`;
        } else {
            bubble.style.transform = '';
        }

        bubble.className = `bubble-overlay ${block.id === globalState.selectedBlockId && !isMirror ? 'active' : ''}`;
        bubble.style.backgroundColor = 'transparent';
        bubble.style.display = 'flex';
        bubble.style.alignItems = 'center';
        if (block.style.align === 'left') {
            bubble.style.justifyContent = 'flex-start';
        } else if (block.style.align === 'right') {
            bubble.style.justifyContent = 'flex-end';
        } else {
            bubble.style.justifyContent = 'center';
        }

        const maskContent = document.createElement('div');
        maskContent.style.position = 'relative';
        maskContent.style.overflow = 'hidden';
        maskContent.style.boxSizing = 'border-box';
        maskContent.style.backgroundColor = 'transparent';
        maskContent.style.backgroundImage = 'none';

        if (block.type !== 'image') {
            const fontStyle = block.style.fontFamily || 'font-comic';
            const isBuiltInFont = fontStyle.startsWith('font-');

            const currentMaskSize = block.style.maskSize || 'full';
            if (currentMaskSize === 'full') {
                maskContent.style.width = '100%';
                maskContent.style.height = '100%';
                maskContent.style.display = 'flex';
                if (block.style.vertical) {
                    maskContent.style.justifyContent = 'center';
                    maskContent.style.alignItems = 'center';
                } else {
                    maskContent.style.alignItems = 'center';
                    maskContent.style.justifyContent = block.style.align === 'left' ? 'flex-start' : block.style.align === 'right' ? 'flex-end' : 'center';
                }
                maskContent.className = `${isBuiltInFont ? fontStyle : ''} pointer-events-none`;
            } else {
                maskContent.style.display = 'flex';
                maskContent.style.alignItems = 'center';
                maskContent.style.justifyContent = 'center';
                maskContent.style.width = 'auto';
                maskContent.style.height = 'auto';
                maskContent.style.maxWidth = '100%';
                maskContent.style.maxHeight = '100%';
                maskContent.className = `${isBuiltInFont ? fontStyle : ''} pointer-events-none`;
            }

            if (!isBuiltInFont) {
                maskContent.style.fontFamily = `'${fontStyle}', sans-serif`;
            } else {
                maskContent.style.fontFamily = '';
            }

            maskContent.style.wordBreak = 'keep-all';
            maskContent.style.overflowWrap = 'normal';
            maskContent.style.hyphens = 'none';

            maskContent.style.color = block.style.textColor || '#000000';
            const zoomScale = isMirror ? 1 : ((globalState.zoom || 100) / 100);
            const padding = block.style.padding !== undefined ? block.style.padding : 4;
            const displayPadding = forceExportScale !== 1 ? (padding * forceExportScale) : (padding * zoomScale);
            maskContent.style.padding = `${displayPadding}px`;
            maskContent.style.textAlign = block.style.align || 'center';

            let displayFontSize = block.style.fontSize || 16;
            if (forceExportScale !== 1) {
                displayFontSize = displayFontSize * forceExportScale;
            } else {
                displayFontSize = displayFontSize * zoomScale;
            }
            maskContent.style.fontSize = `${displayFontSize}px`;
            maskContent.style.lineHeight = block.style.vertical ? '1.12' : '1.18';
            maskContent.style.letterSpacing = '0';
            maskContent.style.fontKerning = 'normal';
            maskContent.style.fontWeight = block.style.bold ? 'bold' : 'normal';

            if (block.style.vertical) {
                maskContent.classList.add('text-vertical');
                maskContent.style.writingMode = 'vertical-rl';
                maskContent.style.textOrientation = 'upright';
                maskContent.style.lineHeight = '1.12';
            }

            const strokeWidth = block.style.strokeWidth || 0;
            const strokeColor = block.style.strokeColor || '#ffffff';
            if (strokeWidth > 0) {
                const displayStroke = forceExportScale !== 1 ? strokeWidth * forceExportScale : strokeWidth;
                maskContent.style.webkitTextStroke = `${displayStroke}px ${strokeColor}`;
                maskContent.style.paintOrder = 'stroke fill';
            } else {
                maskContent.style.webkitTextStroke = '0px transparent';
            }

            const shadowBlur = block.style.shadowBlur || 0;
            const shadowColor = block.style.shadowColor || '#000000';
            if (shadowBlur > 0) {
                const displayBlur = forceExportScale !== 1 ? shadowBlur * forceExportScale : shadowBlur;
                maskContent.style.textShadow = `0px 0px ${displayBlur}px ${shadowColor}`;
            } else {
                maskContent.style.textShadow = 'none';
            }

            const innerTextDiv = document.createElement('div');
            const isCenterAlign = !block.style.align || block.style.align === 'center';
            if (block.style.vertical) {
                innerTextDiv.style.writingMode = 'vertical-rl';
                innerTextDiv.style.textOrientation = 'upright';
                innerTextDiv.className = `h-full flex flex-row justify-center items-center`;
            } else {
                innerTextDiv.className = `w-full flex flex-col ${isCenterAlign ? 'items-center justify-center' : block.style.align === 'right' ? 'items-end' : 'items-start'}`;
            }
            innerTextDiv.style.margin = '0';
            innerTextDiv.style.padding = '0';
            innerTextDiv.style.lineHeight = block.style.vertical ? '1.12' : '1.18';
            innerTextDiv.style.textAlign = block.style.align || 'center';

            const warpOpts = {
                arcAngle: block.style.arcAngle || 0,
                skewX: block.style.skewX || 0,
                skewY: block.style.skewY || 0,
                warpWave: block.style.warpWave || 0,
                warpBulge: block.style.warpBulge || 0
            };
            setMultilineText(innerTextDiv, block.translated, warpOpts);

            if ((globalState.bilingualMode === 'sub' || block.style.bilingualSub) && block.original && block.original.trim()) {
                const origSub = document.createElement('div');
                origSub.className = 'text-[0.7em] opacity-75 font-sans tracking-normal mt-0.5 select-none pointer-events-none';
                origSub.style.color = 'inherit';
                origSub.style.lineHeight = '1.1';
                setMultilineText(origSub, block.original, warpOpts);
                innerTextDiv.appendChild(origSub);
            }

            innerTextDiv.style.position = 'relative';
            innerTextDiv.style.zIndex = '1';
            maskContent.appendChild(innerTextDiv);

            bubble.setAttribute('data-original', block.original || '');
            bubble.setAttribute('data-translated', block.translated || '');
            bubble.appendChild(maskContent);
        }

        if (!isMirror) {
            let lastMousedownTime = 0;
            bubble.addEventListener('mousedown', (e) => {
                const now = Date.now();
                if (now - lastMousedownTime < 350) {
                    lastMousedownTime = 0;
                    e.preventDefault();
                    e.stopPropagation();
                    if (block.type !== 'image') {
                        startInlineEditing(block, bubble, maskContent, innerTextDiv);
                    } else {
                        uiSetRightTab('edit');
                        elements.editTranslatedText.focus();
                    }
                    return;
                }
                lastMousedownTime = now;
                startBlockDrag(e, block);
            });

            let lastTouchTime = 0;
            bubble.addEventListener('touchstart', (e) => {
                const now = Date.now();
                if (now - lastTouchTime < 350) {
                    lastTouchTime = 0;
                    e.preventDefault();
                    e.stopPropagation();
                    if (block.type !== 'image') {
                        startInlineEditing(block, bubble, maskContent, innerTextDiv);
                    } else {
                        uiSetRightTab('edit');
                        elements.editTranslatedText.focus();
                    }
                    return;
                }
                lastTouchTime = now;
                startBlockDrag(e, block);
            }, { passive: false });

            const handleSW = document.createElement('div');
            handleSW.className = "resize-handle resize-sw";
            handleSW.addEventListener('mousedown', (e) => startBlockResize(e, block, 'sw'));
            handleSW.addEventListener('touchstart', (e) => startBlockResize(e, block, 'sw'), { passive: false });

            const handleSE = document.createElement('div');
            handleSE.className = "resize-handle resize-se";
            handleSE.addEventListener('mousedown', (e) => startBlockResize(e, block, 'se'));
            handleSE.addEventListener('touchstart', (e) => startBlockResize(e, block, 'se'), { passive: false });

            const handleNW = document.createElement('div');
            handleNW.className = "resize-handle resize-nw";
            handleNW.addEventListener('mousedown', (e) => startBlockResize(e, block, 'nw'));
            handleNW.addEventListener('touchstart', (e) => startBlockResize(e, block, 'nw'), { passive: false });

            const handleNE = document.createElement('div');
            handleNE.className = "resize-handle resize-ne";
            handleNE.addEventListener('mousedown', (e) => startBlockResize(e, block, 'ne'));
            handleNE.addEventListener('touchstart', (e) => startBlockResize(e, block, 'ne'), { passive: false });

            bubble.appendChild(handleSW);
            bubble.appendChild(handleSE);
            bubble.appendChild(handleNW);
            bubble.appendChild(handleNE);
        }

        textsLayer.appendChild(bubble);
    });

    container.appendChild(coversLayer);
    container.appendChild(textsLayer);
}

export function convertHexToRGBA(hex, alpha) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function wrapCanvasText(ctx, text, maxWidth) {
    if (!text) return [];
    const rawLines = text.split('\n');
    const resultLines = [];

    for (const line of rawLines) {
        const trimmed = line.trim();
        if (!trimmed) {
            resultLines.push('');
            continue;
        }

        const spaceTokens = trimmed.split(/\s+/);
        const words = [];

        for (const token of spaceTokens) {
            if (!token) continue;
            const parts = token.split(/([-–—])/);
            let subWord = '';
            for (let p = 0; p < parts.length; p++) {
                const part = parts[p];
                if (!part) continue;
                subWord += part;
                if (part === '-' || part === '–' || part === '—' || p === parts.length - 1) {
                    words.push(subWord);
                    subWord = '';
                }
            }
        }

        if (words.length === 0) continue;

        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const needsSpace = !currentLine.endsWith('-') && !currentLine.endsWith('–') && !currentLine.endsWith('—');
            const testLine = needsSpace ? currentLine + ' ' + word : currentLine + word;

            if (ctx.measureText(testLine).width <= maxWidth) {
                currentLine = testLine;
            } else {
                resultLines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) {
            resultLines.push(currentLine);
        }
    }
    return resultLines;
}

export function wrapCanvasVerticalText(text, maxHeight, fontSizePx) {
    if (!text) return [];
    const charStep = fontSizePx * 1.12;
    const maxCharsPerCol = Math.max(1, Math.floor(maxHeight / charStep));
    const paragraphs = text.split('\n');
    const columns = [];

    for (const para of paragraphs) {
        if (!para.trim()) {
            columns.push([]);
            continue;
        }

        const normPara = String(para.trim() || '').normalize('NFC');
        const chars = (typeof Intl !== 'undefined' && Intl.Segmenter)
            ? Array.from(new Intl.Segmenter().segment(normPara)).map(s => s.segment)
            : Array.from(normPara);
        let currentCol = [];

        for (const char of chars) {
            if (currentCol.length >= maxCharsPerCol) {
                columns.push(currentCol);
                currentCol = [];
            }
            currentCol.push(char);
        }
        if (currentCol.length > 0) {
            columns.push(currentCol);
        }
    }

    return columns;
}

export function balanceTextToDiamond(text, boxW, boxH) {
    const words = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
    if (words.length <= 3) return words.join(' ');

    const wordCount = words.length;
    let numLines = 3;

    if (boxW && boxH && boxH > 0) {
        const aspect = boxW / boxH;
        if (aspect < 0.7) {
            numLines = Math.min(wordCount, Math.max(3, Math.ceil(wordCount / 2.5)));
        } else if (aspect > 1.4) {
            numLines = Math.max(2, Math.min(4, Math.floor(wordCount / 4)));
        } else {
            numLines = wordCount <= 5 ? 3 : wordCount <= 10 ? 3 : 4;
        }
    } else {
        if (wordCount <= 5) numLines = 3;
        else if (wordCount <= 10) numLines = 3;
        else if (wordCount <= 16) numLines = 4;
        else numLines = 5;
    }
    numLines = Math.max(2, Math.min(wordCount, numLines));

    let weights = [];
    for (let i = 0; i < numLines; i++) {
        const y = -0.5 + (i + 0.5) / numLines;
        const widthFactor = Math.sqrt(Math.max(0.08, 1 - 4 * y * y));
        weights.push(widthFactor);
    }
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let lineCounts = weights.map(w => Math.max(1, Math.round((w / totalWeight) * wordCount)));
    let sum = lineCounts.reduce((a, b) => a + b, 0);

    while (sum < wordCount) {
        const mid = Math.floor(numLines / 2);
        lineCounts[mid]++;
        sum++;
    }
    while (sum > wordCount) {
        const maxIdx = lineCounts.indexOf(Math.max(...lineCounts));
        if (lineCounts[maxIdx] > 1) {
            lineCounts[maxIdx]--;
            sum--;
        } else {
            break;
        }
    }

    let resultLines = [];
    let wordIdx = 0;
    lineCounts.forEach(count => {
        const lineWords = words.slice(wordIdx, wordIdx + count);
        if (lineWords.length > 0) {
            resultLines.push(lineWords.join(' '));
        }
        wordIdx += count;
    });
    return resultLines.join('\n');
}

export function applyDiamondFormat() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page.blocks.find(b => b.id === globalState.selectedBlockId);
    if (block) {
        const formatted = balanceTextToDiamond(block.translated, block.box ? block.box.w : null, block.box ? block.box.h : null);
        block.translated = formatted;
        elements.editTranslatedText.value = formatted;

        import('./canvas-styling.js').then(m => m.syncActiveBlockTranslation(formatted));
        requestOverlayRender();
        showToast("Đã định dạng dòng cân đối hình kim cương bầu dục thành công!", "success");
    }
}

export function batchDiamondBalanceAllPages() {
    if (!globalState.pages.length) {
        showToast("Chưa có trang truyện nào để cân đối layout.", "warn");
        return;
    }

    pushStateToHistory();
    let totalBalanced = 0;

    globalState.pages.forEach(page => {
        (page.blocks || []).forEach(block => {
            if (block.translated && block.type !== 'sfx') {
                const balanced = balanceTextToDiamond(block.translated, block.box.w, block.box.h);
                if (balanced && balanced !== block.translated) {
                    block.translated = balanced;
                    block.autoFitCache = null;
                    if (globalState.autoFitEnabled) {
                        autoFitBlock(block);
                    }
                    totalBalanced++;
                }
            }
        });
        savePageToDB(page);
    });

    requestOverlayRender();
    uiUpdateActiveBlockEditor();
    showToast(`⚡ Đã tự động cân đối layout Diamond cho ${totalBalanced} ô thoại trên toàn chương!`, "success");
}

export function startInlineEditing(block, bubble, maskContent, innerTextDiv) {
    if (!block || block.type === 'image') return;
    if (block._isEditingInline) return;

    block._isEditingInline = true;
    uiSetRightTab('edit');

    maskContent.style.pointerEvents = 'auto';
    innerTextDiv.style.pointerEvents = 'auto';
    innerTextDiv.contentEditable = 'true';
    innerTextDiv.style.outline = '2px dashed #6366f1';
    innerTextDiv.style.outlineOffset = '2px';
    innerTextDiv.style.borderRadius = '4px';
    innerTextDiv.style.cursor = 'text';
    bubble.classList.add('editing-inline');

    innerTextDiv.focus();
    try {
        const range = document.createRange();
        range.selectNodeContents(innerTextDiv);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    } catch (err) { }

    let isComposing = false;

    function handleInput() {
        if (isComposing) return;
        let newText = innerTextDiv.innerText || innerTextDiv.textContent || '';
        newText = newText.replace(/\r\n/g, '\n');
        if (newText.endsWith('\n') && !(block.translated || '').endsWith('\n')) {
            newText = newText.slice(0, -1);
        }

        block.translated = newText;
        bubble.setAttribute('data-translated', newText);

        if (elements.editTranslatedText) {
            elements.editTranslatedText.value = newText;
        }

        if (globalState.autoFitEnabled) {
            const page = globalState.pages[globalState.activePageIndex];
            if (page) {
                const imgElement = elements.mangaBgImage;
                autoFitBlock(page, block, imgElement);
                const zoomScale = (globalState.zoom || 100) / 100;
                maskContent.style.fontSize = `${(block.style.fontSize || 16) * zoomScale}px`;
            }
        }
    }

    function stopInlineEditing() {
        if (!block._isEditingInline) return;
        block._isEditingInline = false;
        innerTextDiv.contentEditable = 'false';
        innerTextDiv.style.outline = 'none';
        innerTextDiv.style.cursor = '';
        maskContent.style.pointerEvents = 'none';
        innerTextDiv.style.pointerEvents = 'none';
        bubble.classList.remove('editing-inline');

        innerTextDiv.removeEventListener('input', handleInput);
        innerTextDiv.removeEventListener('blur', stopInlineEditing);
        innerTextDiv.removeEventListener('keydown', handleKeydown);

        const page = globalState.pages[globalState.activePageIndex];
        if (page) {
            savePageToDB(page);
        }
        requestOverlayRender();
    }

    function handleKeydown(e) {
        if (e.key === 'Escape' || (e.ctrlKey && e.key === 'Enter')) {
            e.preventDefault();
            e.stopPropagation();
            stopInlineEditing();
        }
    }

    innerTextDiv.addEventListener('compositionstart', () => { isComposing = true; });
    innerTextDiv.addEventListener('compositionend', () => {
        isComposing = false;
        handleInput();
    });
    innerTextDiv.addEventListener('input', handleInput);
    innerTextDiv.addEventListener('blur', stopInlineEditing);
    innerTextDiv.addEventListener('keydown', handleKeydown);
}

export function triggerInlineEditActiveBlock() {
    if (globalState.activePageIndex === -1 || globalState.selectedBlockId === null) return;
    const page = globalState.pages[globalState.activePageIndex];
    const block = page ? page.blocks.find(b => b.id === globalState.selectedBlockId) : null;
    if (!block || block.type === 'image') return;

    const bubble = document.getElementById(block.id);
    if (!bubble) return;
    const maskContent = bubble.firstElementChild;
    const innerTextDiv = maskContent ? maskContent.firstElementChild : null;
    if (maskContent && innerTextDiv) {
        startInlineEditing(block, bubble, maskContent, innerTextDiv);
    }
}

window.triggerInlineEditActiveBlock = triggerInlineEditActiveBlock;