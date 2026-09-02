/**
 * Telemetry & Funnel Analytics for Manga Translator Studio
 * Client-side event tracking -> Cloudflare Worker -> Google Sheets
 */

// Thay bằng URL Cloudflare Worker của bạn sau khi deploy
export const TELEMETRY_WORKER_URL = 'https://manga-telemetry.linh18961.workers.dev';

export interface AnalyticsState {
    distinctId: string;
    sessionCount: number;
    completedChapters: number;
    firstSeenAt: number;
}

export interface AnalyticsEvent {
    distinct_id: string;
    event: string;
    session_count: number;
    chapter_number: number;
    page_count: number;
    is_new_user: boolean;
    timestamp: number;
    properties: Record<string, any>;
}

class TelemetryTracker {
    private state: AnalyticsState;
    private queue: AnalyticsEvent[] = [];
    private currentChapterPages = 0;
    private chapterStartTime = 0;
    private isFlushing = false;
    private endpointUrl = TELEMETRY_WORKER_URL;

    constructor() {
        this.state = this.initIdentity();
        this.restoreQueue();
        this.setupAutoSync();

        // Ghi nhận lần mở ứng dụng
        this.trackAppOpen();
    }

    public setEndpoint(url: string) {
        this.endpointUrl = url;
    }

    private initIdentity(): AnalyticsState {
        try {
            const raw = localStorage.getItem('__mts_analytics_identity');
            if (raw) {
                const parsed: AnalyticsState = JSON.parse(raw);
                parsed.sessionCount = (parsed.sessionCount || 1) + 1;
                this.persistIdentity(parsed);
                return parsed;
            }
        } catch (_) { }

        const fresh: AnalyticsState = {
            distinctId: crypto.randomUUID(),
            sessionCount: 1,
            completedChapters: 0,
            firstSeenAt: Date.now()
        };
        this.persistIdentity(fresh);
        return fresh;
    }

    private persistIdentity(state: AnalyticsState) {
        this.state = state;
        try {
            localStorage.setItem('__mts_analytics_identity', JSON.stringify(state));
        } catch (_) { }
    }

    private restoreQueue() {
        try {
            const raw = localStorage.getItem('__mts_analytics_queue');
            if (raw) this.queue = JSON.parse(raw);
        } catch (_) { }
    }

    private persistQueue() {
        try {
            localStorage.setItem('__mts_analytics_queue', JSON.stringify(this.queue.slice(-200)));
        } catch (_) { }
    }

    public track(eventName: string, properties: Record<string, any> = {}, explicitChapterNumber?: number) {
        const chapterNum = explicitChapterNumber !== undefined
            ? explicitChapterNumber
            : this.state.completedChapters + 1;

        const evt: AnalyticsEvent = {
            distinct_id: this.state.distinctId,
            event: eventName,
            session_count: this.state.sessionCount,
            chapter_number: chapterNum,
            page_count: properties.page_count || this.currentChapterPages || 0,
            is_new_user: this.state.sessionCount === 1 && this.state.completedChapters === 0,
            timestamp: Date.now(),
            properties: {
                ...properties,
                completed_chapters_total: this.state.completedChapters
            }
        };

        this.queue.push(evt);
        this.persistQueue();

        // Tự động flush nếu có >= 5 events trong hàng đợi
        if (this.queue.length >= 5) {
            this.flush();
        }
    }

    public async flush() {
        if (this.isFlushing || this.queue.length === 0 || !navigator.onLine) return;
        if (!this.endpointUrl || this.endpointUrl.includes('your-worker')) return;

        this.isFlushing = true;
        const batch = [...this.queue];

        try {
            const res = await fetch(this.endpointUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: batch }),
                keepalive: true
            });

            if (res.ok) {
                // Xoá các event đã gửi thành công
                this.queue = this.queue.slice(batch.length);
                this.persistQueue();
            }
        } catch (err) {
            // Không làm gián đoạn app khi mất mạng, giữ lại retry lần sau
        } finally {
            this.isFlushing = false;
        }
    }

    private setupAutoSync() {
        // Tự động flush mỗi 40s
        setInterval(() => this.flush(), 40_000);

        // Khi có mạng trở lại
        window.addEventListener('online', () => this.flush());

        // Khi người dùng tắt hoặc ẩn tab
        window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.flush();
        });
    }

    // --- CÁC PHƯƠNG THỨC GỌI TỪ UI / PIPELINE ---

    public trackAppOpen() {
        this.track('user_joined', {
            is_first_session: this.state.sessionCount === 1
        });
    }

    public trackUpload(pageCount: number) {
        this.currentChapterPages = pageCount;
        this.chapterStartTime = Date.now();
        this.track('page_uploaded', {
            page_count: pageCount,
            working_on_chapter: this.state.completedChapters + 1
        });
    }

    public trackOCR(mode: 'single' | 'batch') {
        this.track('ocr_executed', { mode });
    }

    public trackTranslate(mode: 'single' | 'all', pageCount: number = 1) {
        this.track('translate_executed', { mode, page_count: pageCount });
    }

    public trackExport(format: string = 'all') {
        this.track('export_executed', { format });

        // Đánh dấu HOÀN THÀNH chapter khi export
        const completedNumber = this.state.completedChapters + 1;
        this.state.completedChapters = completedNumber;
        this.persistIdentity(this.state);

        this.track('chapter_completed', {
            chapter_number: completedNumber,
            total_pages: this.currentChapterPages,
            duration_minutes: this.chapterStartTime ? Math.round((Date.now() - this.chapterStartTime) / 60000) : 0
        }, completedNumber);

        // Bắn ngay event hoàn thành
        this.flush();
    }

    public getState(): Readonly<AnalyticsState> {
        return { ...this.state };
    }
}

export const analytics = new TelemetryTracker();
