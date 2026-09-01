/**
 * Manga Translator Studio - User Profile & Header Auth Status UI Component
 * Renders Pro Upgrade CTA when Basic, or User Avatar + Dropdown Menu when Pro.
 */

import { globalBus } from '../core/events';
import {
    getUserProfile,
    getUserTier,
    isProUser,
    isExpertMode,
    setExpertMode,
    logoutUser,
    loginWithGoogle
} from '../features/auth/auth-manager';
import { openProUpgradeModal } from './pro-modal-ui';
import { escapeHTML } from '../core/utils';

export function initUserProfileUI(): void {
    renderUserProfileHeader();

    globalBus.subscribe('auth:state-changed', () => renderUserProfileHeader());
    globalBus.subscribe('auth:tier-changed', () => renderUserProfileHeader());
}

export function renderUserProfileHeader(): void {
    const container = document.getElementById('header-user-profile-container');
    if (!container) return;

    const isPro = isProUser();
    const profile = getUserProfile();

    if (!isPro || !profile) {
        // BASIC TIER: Render "Pro (Sắp ra mắt)" Button + Google Login
        container.innerHTML = `
            <div class="flex items-center gap-1.5">
                <button id="header-btn-upgrade-pro" type="button"
                    class="h-7 px-2.5 sm:px-3 rounded-lg bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-400 hover:to-pink-400 text-white font-extrabold text-[11px] flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all cursor-pointer hover:scale-[1.02]">
                    <span class="text-[10px]">✨</span>
                    <span class="tracking-tight">Pro (Sắp ra mắt)</span>
                </button>

                <button id="header-btn-quick-login" type="button"
                    class="h-7 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer"
                    title="Đăng nhập tài khoản Google">
                    <i class="fa-solid fa-arrow-right-to-bracket text-[10px] text-indigo-400"></i>
                    <span class="hidden sm:inline">Đăng nhập</span>
                </button>
            </div>
        `;

        container.querySelector('#header-btn-upgrade-pro')?.addEventListener('click', () => openProUpgradeModal());
        container.querySelector('#header-btn-quick-login')?.addEventListener('click', () => openProUpgradeModal());
        return;
    }


    // PRO TIER: Render Avatar + PRO Badge + Dropdown
    const avatarContent = profile.picture
        ? `<img src="${escapeHTML(profile.picture)}" class="w-5 h-5 rounded-full object-cover border border-amber-400/50" alt="${escapeHTML(profile.name)}">`
        : `<div class="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold flex items-center justify-center">👑</div>`;

    const expert = isExpertMode();

    container.innerHTML = `
        <div class="relative">
            <button id="header-btn-user-menu" type="button"
                class="h-7 pl-1.5 pr-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-500/40 hover:border-amber-400 text-slate-200 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm">
                ${avatarContent}
                <span class="px-1 py-0.2 rounded text-[8.5px] font-black uppercase tracking-wider bg-amber-500/25 text-amber-300 border border-amber-500/50">PRO</span>
                <span class="max-w-[70px] sm:max-w-[100px] truncate text-[11px] font-medium text-slate-300 hidden sm:inline">${escapeHTML(profile.name || 'Pro User')}</span>
                <i class="fa-solid fa-chevron-down text-[7px] text-slate-400 ml-0.5"></i>
            </button>

            <!-- User Menu Popover Dropdown -->
            <div id="header-user-dropdown" class="hidden absolute right-0 top-8.5 z-50 w-64 bg-slate-950/98 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-2xl p-2.5 flex flex-col gap-2 animate-fade-in text-slate-200">
                
                <!-- Profile Header Card -->
                <div class="p-2.5 bg-gradient-to-r from-amber-950/40 via-slate-900 to-indigo-950/40 rounded-xl border border-amber-500/25 flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 flex items-center justify-center font-black text-sm shrink-0">
                        👑
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5">
                            <span class="font-extrabold text-xs text-white truncate">${escapeHTML(profile.name || 'Pro Member')}</span>
                            <span class="px-1 py-0.2 rounded text-[8px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">VIP</span>
                        </div>
                        <p class="text-[10px] text-slate-400 truncate mt-0.5">${escapeHTML(profile.email || '')}</p>
                    </div>
                </div>

                <!-- Expert Mode Switcher Toggle -->
                <div class="px-2.5 py-2 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
                    <div>
                        <div class="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                            <i class="fa-solid fa-sliders text-indigo-400 text-[10px]"></i>
                            <span>Studio Chuyên Sâu</span>
                        </div>
                        <p class="text-[9.5px] text-slate-400">Hiển thị đầy đủ mọi công cụ nâng cao</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="chk-expert-mode-toggle" class="sr-only peer" ${expert ? 'checked' : ''}>
                        <div class="w-8 h-4.5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                </div>

                <!-- Menu Items -->
                <div class="space-y-0.5">
                    <button id="btn-menu-gdrive-sync" class="w-full px-2.5 py-1.5 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg flex items-center gap-2 transition-colors cursor-pointer">
                        <i class="fa-brands fa-google-drive text-sky-400 text-xs w-4 text-center"></i>
                        <span>Đồng bộ Google Drive</span>
                    </button>
                    <button id="btn-menu-lorebook" class="w-full px-2.5 py-1.5 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg flex items-center gap-2 transition-colors cursor-pointer">
                        <i class="fa-solid fa-address-card text-emerald-400 text-xs w-4 text-center"></i>
                        <span>Lorebook & Nhân vật</span>
                    </button>
                    <button id="btn-menu-qc" class="w-full px-2.5 py-1.5 text-left text-xs text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg flex items-center gap-2 transition-colors cursor-pointer">
                        <i class="fa-solid fa-shield-halved text-amber-400 text-xs w-4 text-center"></i>
                        <span>Kiểm duyệt QC</span>
                    </button>
                </div>

                <div class="h-px bg-slate-800 my-0.5"></div>

                <!-- Logout Button -->
                <button id="btn-menu-logout" class="w-full px-2.5 py-1.5 text-left text-xs text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded-lg flex items-center gap-2 transition-colors cursor-pointer font-semibold">
                    <i class="fa-solid fa-arrow-right-from-bracket text-xs w-4 text-center"></i>
                    <span>Đăng xuất</span>
                </button>
            </div>
        </div>
    `;

    // Dropdown toggle logic
    const btn = container.querySelector('#header-btn-user-menu');
    const dropdown = container.querySelector('#header-user-dropdown');

    if (btn && dropdown) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.classList.contains('hidden') && !dropdown.contains(e.target as Node) && e.target !== btn) {
                dropdown.classList.add('hidden');
            }
        });
    }

    // Toggle Expert Mode
    const expertToggle = container.querySelector('#chk-expert-mode-toggle') as HTMLInputElement | null;
    expertToggle?.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        setExpertMode(checked);
    });

    // Sub-menu actions
    container.querySelector('#btn-menu-gdrive-sync')?.addEventListener('click', () => {
        dropdown?.classList.add('hidden');
        import('../features/gdrive/gdrive-modal').then(m => m.openGDriveModal());
    });

    container.querySelector('#btn-menu-lorebook')?.addEventListener('click', () => {
        dropdown?.classList.add('hidden');
        import('./lorebook-ui').then(m => m.openLorebookModal());
    });

    container.querySelector('#btn-menu-qc')?.addEventListener('click', () => {
        dropdown?.classList.add('hidden');
        import('./qc-ui').then(m => m.openQcModal());
    });

    container.querySelector('#btn-menu-logout')?.addEventListener('click', () => {
        dropdown?.classList.add('hidden');
        logoutUser();
    });
}
