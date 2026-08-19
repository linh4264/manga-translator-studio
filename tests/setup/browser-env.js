// Comprehensive Browser Environment Mock for Node.js Testing
// Provides DOM, Storage, Events, AnimationFrames, and Element mocks.

export function setupBrowserEnvironment() {
    if (typeof globalThis.window === 'undefined') {
        globalThis.window = globalThis;
    }

    if (typeof globalThis.window.addEventListener === 'undefined') {
        const windowListeners = new Map();
        globalThis.window.addEventListener = (event, handler) => {
            if (!windowListeners.has(event)) windowListeners.set(event, []);
            windowListeners.get(event).push(handler);
        };
        globalThis.window.removeEventListener = (event, handler) => {
            if (windowListeners.has(event)) {
                const arr = windowListeners.get(event).filter(h => h !== handler);
                windowListeners.set(event, arr);
            }
        };
        globalThis.window.dispatchEvent = (evt) => {
            const type = evt?.type || evt;
            if (windowListeners.has(type)) {
                windowListeners.get(type).forEach(h => h(evt));
                return true;
            }
            return false;
        };
    }

    if (typeof globalThis.localStorage === 'undefined') {
        const store = new Map();
        globalThis.localStorage = {
            getItem: (k) => store.has(k) ? store.get(k) : null,
            setItem: (k, v) => store.set(k, String(v)),
            removeItem: (k) => store.delete(k),
            clear: () => store.clear(),
            get length() { return store.size; },
            key: (i) => Array.from(store.keys())[i] || null
        };
    }

    if (typeof globalThis.sessionStorage === 'undefined') {
        const sessionStore = new Map();
        globalThis.sessionStorage = {
            getItem: (k) => sessionStore.has(k) ? sessionStore.get(k) : null,
            setItem: (k, v) => sessionStore.set(k, String(v)),
            removeItem: (k) => sessionStore.delete(k),
            clear: () => sessionStore.clear()
        };
    }

    if (typeof globalThis.requestAnimationFrame === 'undefined') {
        globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
        globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
    }

    // Element factory
    function createMockElement(tag = 'div') {
        const tagName = String(tag).toUpperCase();
        const attributes = new Map();
        const listeners = new Map();
        const classes = new Set();
        const children = [];

        let explicitTextContent = '';

        const element = {
            tagName,
            nodeType: 1,
            style: {},
            children,
            dataset: {},
            get textContent() {
                if (children.length === 0) return explicitTextContent;
                return children.map(c => c.nodeType === 3 ? (c.textContent || '') : (c.textContent || '')).join('');
            },
            set textContent(val) {
                children.length = 0;
                explicitTextContent = String(val ?? '');
            },
            value: '',
            checked: false,
            disabled: false,
            naturalWidth: 1000,
            naturalHeight: 1400,
            width: 1000,
            height: 1400,
            clientWidth: 1000,
            clientHeight: 1400,
            offsetWidth: 1000,
            offsetHeight: 1400,
            scrollWidth: 1000,
            scrollHeight: 1400,
            get firstChild() { return children[0] || null; },
            get lastChild() { return children[children.length - 1] || null; },
            get firstElementChild() { return children.find(c => c.nodeType === 1) || null; },
            get lastElementChild() { return [...children].reverse().find(c => c.nodeType === 1) || null; },
            get innerHTML() {
                if (children.length === 0) return explicitTextContent;
                return children.map(c => c.innerHTML !== undefined ? c.innerHTML : (c.textContent || '')).join('');
            },
            set innerHTML(val) {
                children.length = 0;
                explicitTextContent = String(val ?? '');
            },
            parentElement: null,
            parentNode: null,

            classList: {
                add: (...cls) => cls.forEach(c => classes.add(c)),
                remove: (...cls) => cls.forEach(c => classes.delete(c)),
                toggle: (c, force) => {
                    if (force !== undefined) {
                        if (force) classes.add(c); else classes.delete(c);
                        return force;
                    }
                    if (classes.has(c)) { classes.delete(c); return false; }
                    classes.add(c); return true;
                },
                contains: (c) => classes.has(c)
            },

            get className() {
                return Array.from(classes).join(' ');
            },
            set className(val) {
                classes.clear();
                String(val || '').split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
            },

            setAttribute: (k, v) => attributes.set(k, String(v)),
            getAttribute: (k) => attributes.has(k) ? attributes.get(k) : null,
            hasAttribute: (k) => attributes.has(k),
            removeAttribute: (k) => attributes.delete(k),

            appendChild: (child) => {
                if (child) {
                    child.parentElement = element;
                    child.parentNode = element;
                    children.push(child);
                }
                return child;
            },
            removeChild: (child) => {
                const idx = children.indexOf(child);
                if (idx !== -1) {
                    children.splice(idx, 1);
                    child.parentElement = null;
                    child.parentNode = null;
                }
                return child;
            },
            replaceChildren: (...newChildren) => {
                children.length = 0;
                newChildren.forEach(child => element.appendChild(child));
            },

            addEventListener: (event, handler) => {
                if (!listeners.has(event)) listeners.set(event, []);
                listeners.get(event).push(handler);
            },
            removeEventListener: (event, handler) => {
                if (listeners.has(event)) {
                    const arr = listeners.get(event).filter(h => h !== handler);
                    listeners.set(event, arr);
                }
            },
            dispatchEvent: (evt) => {
                const type = evt?.type || evt;
                if (listeners.has(type)) {
                    listeners.get(type).forEach(h => h(evt));
                    return true;
                }
                return false;
            },

            click: () => element.dispatchEvent({ type: 'click', target: element }),
            focus: () => {},
            blur: () => {},
            getContext: () => null,
            getBoundingClientRect: () => ({
                top: 0, left: 0, right: 1000, bottom: 1400,
                width: 1000, height: 1400, x: 0, y: 0
            }),
            querySelector: () => null,
            querySelectorAll: () => []
        };

        return element;
    }

    if (typeof globalThis.document === 'undefined') {
        const domRegistry = new Map();

        globalThis.document = {
            createElement: (tag) => {
                const el = createMockElement(tag);
                if (String(tag).toLowerCase() === 'canvas') {
                    const ctx = {
                        canvas: el,
                        fillStyle: '#000000',
                        strokeStyle: '#000000',
                        lineWidth: 1,
                        globalAlpha: 1.0,
                        globalCompositeOperation: 'source-over',
                        filter: 'none',
                        drawImage: () => {},
                        fillRect: () => {},
                        strokeRect: () => {},
                        clearRect: () => {},
                        beginPath: () => {},
                        closePath: () => {},
                        moveTo: () => {},
                        lineTo: () => {},
                        arc: () => {},
                        ellipse: () => {},
                        rect: () => {},
                        translate: () => {},
                        scale: () => {},
                        rotate: () => {},
                        fill: () => {},
                        stroke: () => {},
                        clip: () => {},
                        save: () => {},
                        restore: () => {},
                        createPattern: (img, rep) => ({ img, rep, setTransform: () => {} }),
                        getImageData: (sx, sy, sw, sh) => ({
                            width: sw || el.width || 100,
                            height: sh || el.height || 100,
                            data: new Uint8ClampedArray((sw || el.width || 100) * (sh || el.height || 100) * 4)
                        }),
                        font: '16px sans-serif',
                        textAlign: 'left',
                        textBaseline: 'top',
                        measureText: function(str) {
                            const text = String(str || '');
                            let fontSize = 16;
                            const match = String(this.font || '').match(/(\d+)px/);
                            if (match) fontSize = parseInt(match[1], 10);
                            return { width: text.length * (fontSize * 0.55) };
                        },
                        putImageData: () => {},
                        createImageData: (w, h) => ({
                            width: w,
                            height: h,
                            data: new Uint8ClampedArray(w * h * 4)
                        })
                    };
                    el.getContext = (type) => (type === '2d' ? ctx : null);
                    el.toDataURL = () => 'data:image/png;base64,';
                    el.toBlob = (cb) => { if (cb) cb(new Blob()); return Promise.resolve(new Blob()); };
                }
                return el;
            },
            createTextNode: (text) => ({ nodeType: 3, textContent: String(text || '') }),
            createDocumentFragment: () => {
                const frag = createMockElement('fragment');
                frag.nodeType = 11;
                return frag;
            },
            getElementById: (id) => {
                if (!domRegistry.has(id)) {
                    const el = createMockElement('div');
                    el.id = id;
                    domRegistry.set(id, el);
                }
                return domRegistry.get(id);
            },
            querySelector: (sel) => {
                if (sel.startsWith('#')) {
                    return globalThis.document.getElementById(sel.slice(1));
                }
                return createMockElement('div');
            },
            querySelectorAll: () => [],
            addEventListener: () => {},
            removeEventListener: () => {},
            body: createMockElement('body'),
            documentElement: createMockElement('html')
        };
    }

    if (typeof globalThis.CustomEvent === 'undefined') {
        globalThis.CustomEvent = class CustomEvent {
            constructor(type, eventInitDict = {}) {
                this.type = type;
                this.detail = eventInitDict.detail || null;
                this.bubbles = !!eventInitDict.bubbles;
                this.cancelable = !!eventInitDict.cancelable;
            }
        };
    }

    if (typeof globalThis.ImageData === 'undefined') {
        globalThis.ImageData = class ImageData {
            constructor(width, height) {
                this.width = width;
                this.height = height;
                this.data = new Uint8ClampedArray(width * height * 4);
            }
        };
    }

    if (typeof globalThis.Image === 'undefined') {
        globalThis.Image = class Image {
            constructor() {
                this.width = 100;
                this.height = 100;
                this.naturalWidth = 100;
                this.naturalHeight = 100;
                this._src = '';
                this.onload = null;
                this.onerror = null;
            }
            get src() {
                return this._src;
            }
            set src(val) {
                this._src = val;
                setTimeout(() => {
                    if (this.onload) this.onload();
                }, 0);
            }
        };
        globalThis.window.Image = globalThis.Image;
    }

    if (typeof globalThis.URL.createObjectURL === 'undefined') {
        globalThis.URL.createObjectURL = (blob) => 'blob:http://localhost/mock-blob-' + Math.random().toString(36).slice(2);
        globalThis.URL.revokeObjectURL = () => {};
    }

    if (typeof globalThis.FormData === 'undefined') {
        globalThis.FormData = class FormData {
            constructor() {
                this._data = new Map();
            }
            append(key, val) {
                this._data.set(key, val);
            }
            get(key) {
                return this._data.get(key);
            }
        };
        globalThis.window.FormData = globalThis.FormData;
    }
}

// Auto-run on import
setupBrowserEnvironment();
