export class EventEmitter {
    constructor() {
        this.listeners = {};
    }

    subscribe(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    publish(event, data) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(callback => callback(data));
    }
}

export const globalBus = new EventEmitter();

const actionRegistry = new Map();

export function registerAction(actionName, handler) {
    if (typeof handler !== 'function') {
        console.error(`Can't register action "${actionName}": handler is not a function.`);
        return;
    }
    actionRegistry.set(actionName, handler);
}

export function initEventDelegation() {
    document.body.addEventListener('click', (event) => {
        const target = event.target.closest('[data-action]');
        if (!target) return;

        const actionName = target.getAttribute('data-action');
        if (!actionName) return;

        const handler = actionRegistry.get(actionName);

        if (handler) {
            if (target.tagName === 'A' || target.tagName === 'BUTTON' || (target.tagName === 'INPUT' && target.type === 'submit')) {
                event.preventDefault();
            }
            try {
                handler(target, event);
            } catch (err) {
                console.error(`Error executing action handler for "${actionName}":`, err);
            }
        } else {
            if (typeof window[actionName] === 'function') {
                if (target.tagName === 'A' || target.tagName === 'BUTTON') {
                    event.preventDefault();
                }
                try {
                    window[actionName](target, event);
                } catch (err) {
                    console.error(`Error executing window fallback handler for "${actionName}":`, err);
                }
            } else {
                console.warn(`No action handler registered for: "${actionName}"`);
            }
        }
    });
}
