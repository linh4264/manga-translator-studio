// Central Declarative Event Delegation & Router for Manga Translator Studio
// Decouples HTML from global window scope and provides safe action routing.

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

/**
 * Register a handler function for an action name
 * @param {string} actionName 
 * @param {Function} handler 
 */
export function registerAction(actionName, handler) {
    if (typeof handler !== 'function') {
        console.error(`Can't register action "${actionName}": handler is not a function.`);
        return;
    }
    actionRegistry.set(actionName, handler);
}

/**
 * Initialize global event delegation on the document body
 */
export function initEventDelegation() {
    document.body.addEventListener('click', (event) => {
        // Find closest element with data-action attribute
        const target = event.target.closest('[data-action]');
        if (!target) return;

        const actionName = target.getAttribute('data-action');
        if (!actionName) return;

        const handler = actionRegistry.get(actionName);

        if (handler) {
            // Prevent default link and submit behavior
            if (target.tagName === 'A' || target.tagName === 'BUTTON' || (target.tagName === 'INPUT' && target.type === 'submit')) {
                event.preventDefault();
            }
            try {
                handler(target, event);
            } catch (err) {
                console.error(`Error executing action handler for "${actionName}":`, err);
            }
        } else {
            // Fallback for backward compatibility with window-bound functions
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
