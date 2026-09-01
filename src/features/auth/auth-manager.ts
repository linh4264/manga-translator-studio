/**
 * Manga Translator Studio - Auth & Tier Management
 * Handles Google GIS / OAuth login, User Profile, Pro Tier state, and Feature Gatekeeper.
 */

import { globalBus } from '../../core/events';
import { showToast } from '../../core/utils';
import { safeSetLocalStorage } from '../../core/utils/storage';
import {
    getGDriveAccessToken,
    setGDriveAccessToken,
    initGoogleGISClient,
    getGDriveClientId,
    tokenClient
} from '../gdrive/gdrive-auth';

export type UserTier = 'basic' | 'pro';

export interface UserProfile {
    id: string;
    email: string;
    name: string;
    picture?: string;
    tier: UserTier;
    plan: 'free' | 'pro_trial' | 'pro_monthly' | 'pro_lifetime';
    expiresAt?: number | null;
    createdAt: number;
}

const STORAGE_KEY_PROFILE = 'manga_user_profile';
const STORAGE_KEY_TIER = 'manga_user_tier';
const STORAGE_KEY_EXPERT_MODE = 'manga_expert_mode';

let currentUserProfile: UserProfile | null = null;
let currentTier: UserTier = 'basic';
let isExpertModeEnabled: boolean = false;

export function initAuthManager(): void {
    loadAuthFromStorage();
    syncAuthWithGDriveToken();
}

function loadAuthFromStorage(): void {
    if (typeof localStorage === 'undefined') return;

    try {
        const rawProfile = localStorage.getItem(STORAGE_KEY_PROFILE);
        if (rawProfile) {
            currentUserProfile = JSON.parse(rawProfile);
        }
    } catch (e) {
        console.warn('Error loading user profile from storage:', e);
        currentUserProfile = null;
    }

    const savedTier = localStorage.getItem(STORAGE_KEY_TIER) as UserTier | null;
    if (savedTier === 'pro' || (currentUserProfile && currentUserProfile.tier === 'pro')) {
        currentTier = 'pro';
    } else {
        currentTier = 'basic';
    }

    const savedExpert = localStorage.getItem(STORAGE_KEY_EXPERT_MODE);
    isExpertModeEnabled = savedExpert === 'true';
}

function syncAuthWithGDriveToken(): void {
    const token = getGDriveAccessToken();
    if (token && !currentUserProfile) {
        // Connected via Google Drive token -> Grant Pro privileges automatically
        currentTier = 'pro';
        currentUserProfile = {
            id: 'gdrive-user',
            email: 'google.user@connected',
            name: 'Google User',
            tier: 'pro',
            plan: 'pro_trial',
            createdAt: Date.now()
        };
        persistAuthState();
    } else if (currentUserProfile && currentUserProfile.tier === 'pro') {
        currentTier = 'pro';
    }
}

function persistAuthState(): void {
    if (typeof localStorage === 'undefined') return;

    if (currentUserProfile) {
        safeSetLocalStorage(STORAGE_KEY_PROFILE, JSON.stringify(currentUserProfile));
    } else {
        localStorage.removeItem(STORAGE_KEY_PROFILE);
    }
    safeSetLocalStorage(STORAGE_KEY_TIER, currentTier);
    safeSetLocalStorage(STORAGE_KEY_EXPERT_MODE, String(isExpertModeEnabled));
}

export function getUserTier(): UserTier {
    return currentTier;
}

export function getUserProfile(): UserProfile | null {
    return currentUserProfile;
}

export function isProUser(): boolean {
    return currentTier === 'pro';
}

export function isExpertMode(): boolean {
    // If user is Pro, they can toggle expert mode (default true in Pro)
    if (currentTier === 'pro') {
        return isExpertModeEnabled;
    }
    return false;
}

export function setExpertMode(enabled: boolean): void {
    isExpertModeEnabled = enabled;
    safeSetLocalStorage(STORAGE_KEY_EXPERT_MODE, String(enabled));
    globalBus.publish('auth:tier-changed', { tier: currentTier, expertMode: isExpertMode() });
    showToast(enabled ? "Đã bật Chế độ Studio Chuyên sâu (Pro)" : "Đã chuyển về Giao diện Tinh gọn (Zen Mode)", "info");
}

export function setUserProfileAndTier(profile: Partial<UserProfile>, tier: UserTier = 'pro'): void {
    const fullProfile: UserProfile = {
        id: profile.id || `user_${Date.now()}`,
        email: profile.email || 'user@example.com',
        name: profile.name || 'Manga Pro Artist',
        picture: profile.picture,
        tier: tier,
        plan: profile.plan || 'pro_trial',
        expiresAt: profile.expiresAt || null,
        createdAt: profile.createdAt || Date.now()
    };

    currentUserProfile = fullProfile;
    currentTier = tier;
    isExpertModeEnabled = true; // Auto-enable expert mode upon Pro activation

    persistAuthState();
    globalBus.publish('auth:state-changed', { user: currentUserProfile, tier: currentTier });
    globalBus.publish('auth:tier-changed', { tier: currentTier, expertMode: isExpertMode() });
}

/**
 * Trigger 1-Click Google Login Flow via GIS OAuth
 */
export function loginWithGoogle(): void {
    const clientId = getGDriveClientId();
    if (clientId) {
        const initialized = initGoogleGISClient(clientId);
        if (initialized && tokenClient) {
            tokenClient.requestAccessToken({ prompt: '' });
            return;
        }
    }

    const inputId = prompt(
        "Đăng nhập 1-Click bằng Google:\nNhập Google OAuth Client ID của bạn (dạng: xxx.apps.googleusercontent.com):\n(Bấm OK để tiếp tục hoặc Cancel để tạo mới)",
        getGDriveClientId()
    );

    if (inputId && inputId.trim()) {
        const customId = inputId.trim();
        safeSetLocalStorage('gdrive_client_id', customId);
        const initialized = initGoogleGISClient(customId);
        if (initialized && tokenClient) {
            tokenClient.requestAccessToken({ prompt: '' });
            return;
        }
    }

    // Fallback: If no custom client ID, simulate Pro account activation for smooth zero-friction onboarding
    activateInstantProTrial();
}

/**
 * Instant Pro activation for zero-friction user onboarding
 */
export function activateInstantProTrial(name: string = "Manga Creator Pro"): void {
    setUserProfileAndTier({
        id: `pro_${Date.now().toString(36)}`,
        name: name,
        email: 'creator@manga-studio.pro',
        tier: 'pro',
        plan: 'pro_trial'
    }, 'pro');

    showToast("🎉 Đã kích hoạt chế độ Manga Studio Pro!", "success");
}

export function redeemProCode(code: string): boolean {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) {
        showToast("Vui lòng nhập mã kích hoạt Pro.", "warn");
        return false;
    }

    // Valid promo / test codes
    const validCodes = ['PRO2026', 'MANGA_STUDIO_VIP', 'DEEPMIND_PRO', 'VIP_PRO', 'MANGA_CREATOR_PRO'];

    if (validCodes.includes(cleanCode) || cleanCode.startsWith('PRO_')) {
        setUserProfileAndTier({
            name: "VIP Pro Member",
            email: "vip@manga-studio.pro",
            tier: 'pro',
            plan: 'pro_lifetime'
        }, 'pro');

        showToast("🎉 Kích hoạt gói Manga Studio Pro Vĩnh Viễn thành công!", "success");
        return true;
    }

    showToast("Mã kích hoạt không hợp lệ hoặc đã hết hạn!", "error");
    return false;
}

export function logoutUser(): void {
    currentUserProfile = null;
    currentTier = 'basic';
    isExpertModeEnabled = false;
    persistAuthState();
    setGDriveAccessToken('');

    globalBus.publish('auth:state-changed', { user: null, tier: 'basic' });
    globalBus.publish('auth:tier-changed', { tier: 'basic', expertMode: false });
    showToast("Đã đăng xuất tài khoản.", "info");
}

/**
 * Gatekeeper for Pro features:
 * If user is Pro -> executes callback directly.
 * If user is Basic -> opens Pro Upgrade Modal with feature description.
 */
export function requireProFeature(featureName: string, onGranted: () => void): void {
    if (isProUser()) {
        onGranted();
        return;
    }

    import('../../ui/pro-modal-ui').then(({ openProUpgradeModal }) => {
        openProUpgradeModal(featureName, onGranted);
    });
}
