// Headless Canvas 2D Mock for Typesetting, Drawing & Export Tests

export function createMockCanvas2DContext(width = 1000, height = 1400) {
    const stateStack = [];
    let currentFillStyle = '#000000';
    let currentStrokeStyle = '#000000';
    let currentLineWidth = 1;
    let currentFont = '16px sans-serif';
    let currentTextAlign = 'left';
    let currentTextBaseline = 'alphabetic';
    let currentGlobalAlpha = 1.0;
    let currentGlobalCompositeOperation = 'source-over';

    const pixelBuffer = new Uint8ClampedArray(width * height * 4);
    pixelBuffer.fill(255);

    const ctx = {
        canvas: { width, height },

        get fillStyle() { return currentFillStyle; },
        set fillStyle(val) { currentFillStyle = val; },

        get strokeStyle() { return currentStrokeStyle; },
        set strokeStyle(val) { currentStrokeStyle = val; },

        get lineWidth() { return currentLineWidth; },
        set lineWidth(val) { currentLineWidth = val; },

        get font() { return currentFont; },
        set font(val) { currentFont = val; },

        get textAlign() { return currentTextAlign; },
        set textAlign(val) { currentTextAlign = val; },

        get textBaseline() { return currentTextBaseline; },
        set textBaseline(val) { currentTextBaseline = val; },

        get globalAlpha() { return currentGlobalAlpha; },
        set globalAlpha(val) { currentGlobalAlpha = val; },

        get globalCompositeOperation() { return currentGlobalCompositeOperation; },
        set globalCompositeOperation(val) { currentGlobalCompositeOperation = val; },

        shadowColor: '#000000',
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        lineCap: 'butt',
        lineJoin: 'miter',
        miterLimit: 10,

        save() {
            stateStack.push({
                fillStyle: currentFillStyle,
                strokeStyle: currentStrokeStyle,
                lineWidth: currentLineWidth,
                font: currentFont,
                textAlign: currentTextAlign,
                textBaseline: currentTextBaseline,
                globalAlpha: currentGlobalAlpha,
                globalCompositeOperation: currentGlobalCompositeOperation,
                shadowColor: ctx.shadowColor,
                shadowBlur: ctx.shadowBlur
            });
        },

        restore() {
            if (stateStack.length > 0) {
                const s = stateStack.pop();
                currentFillStyle = s.fillStyle;
                currentStrokeStyle = s.strokeStyle;
                currentLineWidth = s.lineWidth;
                currentFont = s.font;
                currentTextAlign = s.textAlign;
                currentTextBaseline = s.textBaseline;
                currentGlobalAlpha = s.globalAlpha;
                currentGlobalCompositeOperation = s.globalCompositeOperation;
                ctx.shadowColor = s.shadowColor;
                ctx.shadowBlur = s.shadowBlur;
            }
        },

        measureText(text) {
            const str = String(text || '');
            // Approximate width based on font size if parsed
            const match = String(currentFont).match(/(\d+(?:\.\d+)?)px/);
            const fontSize = match ? parseFloat(match[1]) : 16;
            const approxCharWidth = fontSize * 0.55;
            return {
                width: str.length * approxCharWidth,
                actualBoundingBoxAscent: fontSize * 0.8,
                actualBoundingBoxDescent: fontSize * 0.2,
                fontBoundingBoxAscent: fontSize * 0.85,
                fontBoundingBoxDescent: fontSize * 0.25
            };
        },

        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arc: () => {},
        ellipse: () => {},
        rect: () => {},
        roundRect: () => {},
        bezierCurveTo: () => {},
        quadraticCurveTo: () => {},
        stroke: () => {},
        fill: () => {},
        clip: () => {},
        setLineDash: () => {},
        getLineDash: () => [],

        fillRect: () => {},
        strokeRect: () => {},
        clearRect: () => {},

        fillText: () => {},
        strokeText: () => {},

        drawImage: () => {},

        getImageData(sx = 0, sy = 0, sw, sh) {
            const w = Math.max(1, Math.round(sw || width));
            const h = Math.max(1, Math.round(sh || height));
            const data = new Uint8ClampedArray(w * h * 4);
            for (let y = 0; y < h; y++) {
                const srcY = sy + y;
                if (srcY < 0 || srcY >= height) continue;
                for (let x = 0; x < w; x++) {
                    const srcX = sx + x;
                    if (srcX < 0 || srcX >= width) continue;
                    const srcIdx = (srcY * width + srcX) * 4;
                    const dstIdx = (y * w + x) * 4;
                    data[dstIdx] = pixelBuffer[srcIdx];
                    data[dstIdx + 1] = pixelBuffer[srcIdx + 1];
                    data[dstIdx + 2] = pixelBuffer[srcIdx + 2];
                    data[dstIdx + 3] = pixelBuffer[srcIdx + 3];
                }
            }
            return { width: w, height: h, data };
        },

        putImageData(imgData, dx = 0, dy = 0) {
            if (!imgData || !imgData.data) return;
            const w = imgData.width;
            const h = imgData.height;
            for (let y = 0; y < h; y++) {
                const dstY = dy + y;
                if (dstY < 0 || dstY >= height) continue;
                for (let x = 0; x < w; x++) {
                    const dstX = dx + x;
                    if (dstX < 0 || dstX >= width) continue;
                    const srcIdx = (y * w + x) * 4;
                    const dstIdx = (dstY * width + dstX) * 4;
                    pixelBuffer[dstIdx] = imgData.data[srcIdx];
                    pixelBuffer[dstIdx + 1] = imgData.data[srcIdx + 1];
                    pixelBuffer[dstIdx + 2] = imgData.data[srcIdx + 2];
                    pixelBuffer[dstIdx + 3] = imgData.data[srcIdx + 3];
                }
            }
        },
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),

        scale: () => {},
        rotate: () => {},
        translate: () => {},
        transform: () => {},
        setTransform: () => {},
        resetTransform: () => {},

        createLinearGradient: () => ({
            addColorStop: () => {}
        }),
        createRadialGradient: () => ({
            addColorStop: () => {}
        }),
        createPattern: (img, repetition) => ({ img, repetition, setTransform: () => {} }),
        isPointInPath: () => false
    };

    return ctx;
}

export function patchCanvasElement(canvasElement, width = 1000, height = 1400) {
    const ctx = createMockCanvas2DContext(width, height);
    canvasElement.width = width;
    canvasElement.height = height;
    canvasElement.getContext = (type) => {
        if (type === '2d') return ctx;
        return null;
    };
    canvasElement.toDataURL = (mimeType = 'image/png') => {
        return `data:${mimeType};base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`;
    };
    canvasElement.toBlob = (callback, mimeType = 'image/png') => {
        const dummyBlob = { size: 1024, type: mimeType };
        if (typeof callback === 'function') callback(dummyBlob);
        return Promise.resolve(dummyBlob);
    };
    return canvasElement;
}
