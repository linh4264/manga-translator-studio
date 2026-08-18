export type EventCallback<T = any> = (data: T) => void;

export class EventEmitter {
    private listeners: Record<string, EventCallback[]> = {};

    subscribe<T = any>(event: string, callback: EventCallback<T>): () => void {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
        return () => this.unsubscribe(event, callback);
    }

    unsubscribe<T = any>(event: string, callback: EventCallback<T>): void {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    publish<T = any>(event: string, data?: T): void {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(callback => callback(data));
    }
}

export const globalBus = new EventEmitter();

const actionRegistry = new Map<string, (target: HTMLElement, event: MouseEvent) => void>();

export function registerAction(actionName: string, handler: (target: HTMLElement, event: MouseEvent) => void): void {
    if (typeof handler !== 'function') {
        console.error(`Can't register action "${actionName}": handler is not a function.`);
        return;
    }
    actionRegistry.set(actionName, handler);
}

export function initEventDelegation(): void {
    document.body.addEventListener('click', (event: MouseEvent) => {
        const target = (event.target as HTMLElement)?.closest('[data-action]') as HTMLElement | null;
        if (!target) return;

        const actionName = target.getAttribute('data-action');
        if (!actionName) return;

        const handler = actionRegistry.get(actionName);

        if (handler) {
            if (target.tagName === 'A' || target.tagName === 'BUTTON' || (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'submit')) {
                event.preventDefault();
            }
            try {
                handler(target, event);
            } catch (err) {
                console.error(`Error executing action handler for "${actionName}":`, err);
            }
        } else {
            if (typeof (window as any)[actionName] === 'function') {
                if (target.tagName === 'A' || target.tagName === 'BUTTON') {
                    event.preventDefault();
                }
                try {
                    (window as any)[actionName](target, event);
                } catch (err) {
                    console.error(`Error executing window fallback handler for "${actionName}":`, err);
                }
            } else {
                console.warn(`No action handler registered for: "${actionName}"`);
            }
        }
    });
}
