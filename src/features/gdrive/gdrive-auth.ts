/**
 * Manga Translator Studio - GDrive: OAuth & Access Token Authentication Manager
 * Handles Google GIS (Identity Services) Client, OAuth 2.0 flow, token storage, and UI status synchronization.
 */
import { showToast } from '../../core/utils';
import { safeSetLocalStorage } from '../../core/utils/storage';
import { loadGDriveFolders } from './gdrive-folder';
import { loadGDriveProjectList } from './gdrive-project-sync';

export let gdriveAccessToken: string = localStorage.getItem('gdrive_access_token') || '';
export let googleClientId: string = localStorage.getItem('gdrive_client_id') || '';
export let tokenClient: any = null;

export function setGDriveAccessToken(token: string): void {
    gdriveAccessToken = (token || '').trim();
    if (gdriveAccessToken) {
        safeSetLocalStorage('gdrive_access_token', gdriveAccessToken);
    } else {
        localStorage.removeItem('gdrive_access_token');
        const tokenInput = document.getElementById('gdrive-token-input') as HTMLInputElement | null;
        if (tokenInput) tokenInput.value = '';
    }
    syncGDriveAuthStatusUI();
}

export function getGDriveAccessToken(): string {
    const input = document.getElementById('gdrive-token-input') as HTMLInputElement | null;
    const inputVal = input ? input.value.trim() : '';
    if (inputVal) {
        gdriveAccessToken = inputVal;
        safeSetLocalStorage('gdrive_access_token', inputVal);
        return inputVal;
    }
    return gdriveAccessToken || localStorage.getItem('gdrive_access_token') || '';
}

export function getGDriveClientId(): string {
    const input = document.getElementById('gdrive-client-id-input') as HTMLInputElement | null;
    const inputVal = input ? input.value.trim() : '';
    if (inputVal) {
        googleClientId = inputVal;
        safeSetLocalStorage('gdrive_client_id', inputVal);
        return inputVal;
    }
    return googleClientId || localStorage.getItem('gdrive_client_id') || '';
}

export function saveGDriveClientIdFromUI(): void {
    const input = document.getElementById('gdrive-client-id-input') as HTMLInputElement | null;
    if (input) {
        const val = input.value.trim();
        googleClientId = val;
        if (val) {
            safeSetLocalStorage('gdrive_client_id', val);
            initGoogleGISClient(val);
            showToast("Đã lưu Google Client ID thành công!", "success");
        } else {
            localStorage.removeItem('gdrive_client_id');
            showToast("Đã xóa Google Client ID.", "info");
        }
        syncGDriveAuthStatusUI();
    }
}

export function logoutGDrive(): void {
    const tokenInput = document.getElementById('gdrive-token-input') as HTMLInputElement | null;
    if (tokenInput) tokenInput.value = '';
    setGDriveAccessToken('');
    showToast("Đã đăng xuất Google Drive.", "info");
}

export function syncGDriveAuthStatusUI(): void {
    const token = getGDriveAccessToken();
    const statusBadge = document.getElementById('gdrive-auth-status-badge');
    const btnLogout = document.getElementById('btn-gdrive-logout');
    const clientIdInput = document.getElementById('gdrive-client-id-input') as HTMLInputElement | null;
    const tokenInput = document.getElementById('gdrive-token-input') as HTMLInputElement | null;

    if (clientIdInput && !clientIdInput.value) {
        clientIdInput.value = googleClientId || localStorage.getItem('gdrive_client_id') || '';
    }
    if (tokenInput && !tokenInput.value) {
        tokenInput.value = token;
    }

    if (statusBadge) {
        if (token) {
            statusBadge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold";
            statusBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Đã kết nối Google Drive';
        } else {
            statusBadge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-400 text-[11px] font-semibold";
            statusBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-500"></span> Chưa kết nối';
        }
    }

    if (btnLogout) {
        if (token) btnLogout.classList.remove('hidden');
        else btnLogout.classList.add('hidden');
    }
}

export function initGoogleGISClient(customClientId: string = ''): boolean {
    const idToUse = customClientId || googleClientId || localStorage.getItem('gdrive_client_id') || '';
    if (!idToUse) return false;
    if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2) {
        try {
            googleClientId = idToUse;
            safeSetLocalStorage('gdrive_client_id', idToUse);
            tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
                client_id: idToUse,
                scope: 'https://www.googleapis.com/auth/drive.file',
                callback: (tokenResponse: any) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        setGDriveAccessToken(tokenResponse.access_token);
                        const tokenInput = document.getElementById('gdrive-token-input') as HTMLInputElement | null;
                        if (tokenInput) tokenInput.value = tokenResponse.access_token;
                        showToast("Đã kết nối Google Drive thành công!", "success");
                        loadGDriveFolders();
                        loadGDriveProjectList();
                    } else if (tokenResponse.error) {
                        showToast(`Lỗi đăng nhập Google: ${tokenResponse.error}`, "error");
                    }
                }
            });
            return true;
        } catch (e) {
            console.warn("GIS Client init error:", e);
        }
    }
    return false;
}

export function loginWithGoogleOAuth(): void {
    const clientId = getGDriveClientId();
    if (clientId) {
        const initialized = initGoogleGISClient(clientId);
        if (initialized && tokenClient) {
            tokenClient.requestAccessToken({ prompt: '' });
            return;
        }
    }

    const inputId = prompt(
        "Tự động Đăng nhập 1-Click:\nNhập Google OAuth Client ID của bạn (dạng: xxx.apps.googleusercontent.com):\n(Bấm Cancel nếu muốn mở trang tạo Client ID)",
        googleClientId
    );
    if (inputId && inputId.trim()) {
        googleClientId = inputId.trim();
        safeSetLocalStorage('gdrive_client_id', googleClientId);
        const initialized = initGoogleGISClient(googleClientId);
        if (initialized && tokenClient) {
            tokenClient.requestAccessToken({ prompt: '' });
            return;
        }
    }

    window.open('https://console.cloud.google.com/apis/credentials?hl=vi', '_blank');
    showToast("Đã mở Google Cloud Console. Hãy tạo OAuth Client ID và dán vào ô bên trên!", "info");
}

export function saveGDriveTokenFromUI(): void {
    const tokenInput = document.getElementById('gdrive-token-input') as HTMLInputElement | null;
    if (tokenInput) {
        const val = tokenInput.value.trim();
        setGDriveAccessToken(val);
        if (val) {
            showToast("Lưu Google Access Token thành công!", "success");
            loadGDriveFolders();
            loadGDriveProjectList();
        } else {
            showToast("Đã xóa Access Token.", "info");
        }
    }
}
