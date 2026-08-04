export function safeSetLocalStorage(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (error) {
        console.warn(`Lỗi lưu localStorage cho key [${key}]:`, error);
    }
}
