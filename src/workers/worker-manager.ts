/**
 * Manga Translator Studio - Unified Web Worker Infrastructure
 * 
 * Provides:
 * - Typed Promise-based WorkerBridge with correlation IDs
 * - Timeout handling & Progress callbacks
 * - Graceful fallback to main-thread execution for tests / SSR / restricted contexts
 * - Centralized worker lifecycle management
 */

export interface WorkerMessage<T = any> {
    id?: string;
    type: string;
    payload?: T;
    [key: string]: any;
}

export interface WorkerResponse<T = any> {
    id?: string;
    type: string;
    data?: T;
    result?: T;
    error?: string;
    message?: string;
    progress?: number;
    [key: string]: any;
}

export interface WorkerBridgeOptions<TReq, TRes> {
    workerUrl?: string | URL;
    workerFactory?: () => Worker;
    fallbackHandler?: (request: TReq, onProgress?: (p: any) => void) => Promise<TRes>;
    defaultTimeoutMs?: number;
}

export class WorkerBridge<TReq = any, TRes = any> {
    private worker: Worker | null = null;
    private options: WorkerBridgeOptions<TReq, TRes>;
    private pendingRequests = new Map<string, {
        resolve: (val: TRes) => void;
        reject: (err: any) => void;
        onProgress?: (p: any) => void;
        timer?: any;
    }>();
    private isWorkerAvailable: boolean;

    constructor(options: WorkerBridgeOptions<TReq, TRes>) {
        this.options = {
            defaultTimeoutMs: 60000,
            ...options
        };
        this.isWorkerAvailable = typeof Worker !== 'undefined';
    }

    private getOrCreateWorker(): Worker | null {
        if (!this.isWorkerAvailable) return null;
        if (this.worker) return this.worker;

        try {
            if (this.options.workerFactory) {
                this.worker = this.options.workerFactory();
            } else if (this.options.workerUrl) {
                this.worker = new Worker(this.options.workerUrl, { type: 'module' });
            }

            if (this.worker) {
                this.worker.onmessage = this.handleWorkerMessage.bind(this);
                this.worker.onerror = this.handleWorkerError.bind(this);
            }
            return this.worker;
        } catch (err) {
            console.warn('[WorkerBridge] Worker initialization failed, falling back to main thread:', err);
            this.isWorkerAvailable = false;
            return null;
        }
    }

    private handleWorkerMessage(e: MessageEvent): void {
        const data = e.data || {};
        const id = data.id;

        // 1. Progress event
        if (data.type === 'PROGRESS') {
            if (id && this.pendingRequests.has(id)) {
                this.pendingRequests.get(id)?.onProgress?.(data);
            }
            return;
        }

        // 2. Correlated response
        if (id && this.pendingRequests.has(id)) {
            const req = this.pendingRequests.get(id)!;
            this.pendingRequests.delete(id);
            if (req.timer) clearTimeout(req.timer);

            if (data.type === 'ERROR' || data.error) {
                req.reject(new Error(data.error || data.message || 'Worker task failed'));
            } else {
                const result = data.result !== undefined ? data.result : (data.zipBlob || data.data || data);
                req.resolve(result as TRes);
            }
            return;
        }

        // 3. Uncorrelated message (first pending request)
        if (this.pendingRequests.size > 0) {
            const firstKey = this.pendingRequests.keys().next().value;
            if (firstKey) {
                const req = this.pendingRequests.get(firstKey)!;
                this.pendingRequests.delete(firstKey);
                if (req.timer) clearTimeout(req.timer);

                if (data.type === 'ERROR' || data.error) {
                    req.reject(new Error(data.error || data.message || 'Worker task failed'));
                } else {
                    const result = data.result !== undefined ? data.result : (data.zipBlob || data.data || data);
                    req.resolve(result as TRes);
                }
            }
        }
    }

    private handleWorkerError(e: ErrorEvent): void {
        console.error('[WorkerBridge] Worker runtime error:', e.message);
        this.pendingRequests.forEach((req) => {
            if (req.timer) clearTimeout(req.timer);
            req.reject(new Error(e.message || 'Worker runtime error'));
        });
        this.pendingRequests.clear();
        this.terminate();
    }

    public async execute(
        request: TReq,
        onProgress?: (progress: any) => void,
        timeoutMs?: number
    ): Promise<TRes> {
        const worker = this.getOrCreateWorker();

        // If worker is unavailable or disabled, use fallback handler
        if (!worker) {
            if (this.options.fallbackHandler) {
                return this.options.fallbackHandler(request, onProgress);
            }
            throw new Error('[WorkerBridge] Web Worker is not supported in this environment and no fallback is provided.');
        }

        const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const timeout = timeoutMs || this.options.defaultTimeoutMs || 60000;

        return new Promise<TRes>((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`[WorkerBridge] Request timed out after ${timeout}ms`));
                }
            }, timeout);

            this.pendingRequests.set(id, { resolve, reject, onProgress, timer });

            try {
                if (typeof request === 'object' && request !== null) {
                    worker.postMessage({ id, ...(request as any) });
                } else {
                    worker.postMessage({ id, payload: request });
                }
            } catch (postErr) {
                clearTimeout(timer);
                this.pendingRequests.delete(id);
                // Try fallback if posting fails (e.g. unclonable object)
                if (this.options.fallbackHandler) {
                    this.options.fallbackHandler(request, onProgress).then(resolve).catch(reject);
                } else {
                    reject(postErr);
                }
            }
        });
    }

    public terminate(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.pendingRequests.forEach(req => {
            if (req.timer) clearTimeout(req.timer);
            req.reject(new Error('[WorkerBridge] Worker was terminated'));
        });
        this.pendingRequests.clear();
    }
}
