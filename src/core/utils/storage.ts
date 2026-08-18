export function safeSetLocalStorage(key: string, value: any): void {
    try {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch (error) {
        console.warn(`Lỗi lưu localStorage cho key [${key}]:`, error);
    }
}
