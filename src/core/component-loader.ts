export function loadUIComponents(): Promise<void> {
    return Promise.resolve();
}

export function ensureModalElement(modalId: string): HTMLElement | null {
    return document.getElementById(modalId);
}
