/**
 * Manga Translator Studio - Global Event Bus & Declarative Action Router
 * 
 * Provides:
 * - EventEmitter (publish / subscribe)
 * - Declarative Event Delegation for [data-action] and [data-action-change]
 * - Direct action dispatcher to reduce reliance on window.* global bindings
 */

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
        this.listeners[event].forEach(callback => {
            try {
                callback(data);
            } catch (err) {
                console.error(`[EventEmitter] Error in subscriber for event "${event}":`, err);
            }
        });
    }
}

export const globalBus = new EventEmitter();

export type ActionHandler = (target: HTMLElement, event: Event) => void;

const clickActionRegistry = new Map<string, ActionHandler>();
const changeActionRegistry = new Map<string, ActionHandler>();

export function registerAction(actionName: string, handler: ActionHandler): void {
    if (typeof handler !== 'function') {
        console.error(`Can't register action "${actionName}": handler is not a function.`);
        return;
    }
    clickActionRegistry.set(actionName, handler);
}

export function registerChangeAction(actionName: string, handler: ActionHandler): void {
    if (typeof handler !== 'function') {
        console.error(`Can't register change action "${actionName}": handler is not a function.`);
        return;
    }
    changeActionRegistry.set(actionName, handler);
}

export function executeAction(actionName: string, target?: HTMLElement, event?: Event): boolean {
    const handler = clickActionRegistry.get(actionName);
    if (handler) {
        try {
            handler(target || (document.body as any), event || (new CustomEvent(actionName) as any));
            return true;
        } catch (err) {
            console.error(`[ActionRouter] Error executing action "${actionName}":`, err);
            return false;
        }
    }

    // Fallback to window function if available
    if (typeof window !== 'undefined' && typeof (window as any)[actionName] === 'function') {
        try {
            (window as any)[actionName](target, event);
            return true;
        } catch (err) {
            console.error(`[ActionRouter] Error executing window fallback for "${actionName}":`, err);
            return false;
        }
    }

    console.warn(`[ActionRouter] No action handler registered for: "${actionName}"`);
    return false;
}

let eventDelegationInitialized = false;

export function initEventDelegation(): void {
    if (eventDelegationInitialized || typeof document === 'undefined') return;
    eventDelegationInitialized = true;

    // 1. Click / Tap Action Delegation
    document.body.addEventListener('click', (event: MouseEvent) => {
        const target = (event.target as HTMLElement)?.closest('[data-action]') as HTMLElement | null;
        if (!target) return;

        const actionName = target.getAttribute('data-action');
        if (!actionName) return;

        if (target.tagName === 'A' || target.tagName === 'BUTTON' || (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'submit')) {
            event.preventDefault();
        }

        executeAction(actionName, target, event);
    });

    // 2. Change / Input Action Delegation
    document.body.addEventListener('change', (event: Event) => {
        const target = (event.target as HTMLElement)?.closest('[data-action-change]') as HTMLElement | null;
        if (!target) return;

        const actionName = target.getAttribute('data-action-change');
        if (!actionName) return;

        const changeHandler = changeActionRegistry.get(actionName);
        if (changeHandler) {
            try {
                changeHandler(target, event);
            } catch (err) {
                console.error(`[ActionRouter] Error executing change handler for "${actionName}":`, err);
            }
        } else {
            // Check click/general registry or window
            executeAction(actionName, target, event);
        }
    });
}
