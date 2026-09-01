/**
 * Manga Translator Studio - Pro Upgrade & Feature Gatekeeper Modal UI
 * Glassmorphism modal explaining Pro perks, tier comparison, 1-click Google Sign-in & redeem code.
 */

import { loginWithGoogle, activateInstantProTrial, redeemProCode, isProUser, getUserProfile } from '../features/auth/auth-manager';
import { showToast } from '../core/utils';

let activePendingCallback: (() => void) | null = null;

export function openProUpgradeModal(featureName: string = '', onGranted?: () => void): void {
    if (onGranted) {
        activePendingCallback = onGranted;
    }

    let modal = document.getElementById('pro-upgrade-modal');
    if (!modal) {
        modal = createProUpgradeModalDOM();
        document.body.appendChild(modal);
    }

    const featureBanner = modal.querySelector('#pro-modal-feature-banner');
    const featureNameEl = modal.querySelector('#pro-modal-feature-name');
    if (featureBanner && featureNameEl) {
        if (featureName) {
            featureBanner.classList.remove('hidden');
            featureNameEl.textContent = featureName;
        } else {
            featureBanner.classList.add('hidden');
        }
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

export function closeProUpgradeModal(): void {
    const modal = document.getElementById('pro-upgrade-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    document.body.style.overflow = '';
}

function handleProActivationSuccess(): void {
    closeProUpgradeModal();
    if (activePendingCallback) {
        const cb = activePendingCallback;
        activePendingCallback = null;
        try {
            cb();
        } catch (e) {
            console.warn("Error running pending Pro callback:", e);
        }
    }
}

function createProUpgradeModalDOM(): HTMLElement {
    const modal = document.createElement('div');
    modal.id = 'pro-upgrade-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-5 animate-fade-in select-none';

    modal.innerHTML = `
        <div class="bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border border-amber-500/40 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100 relative">
            
            <!-- Glow Background Effect -->
            <div class="absolute -top-24 -right-24 w-64 h-64 bg-amber-500/15 rounded-full blur-3xl pointer-events-none"></div>
            <div class="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>

            <!-- Top Header Bar -->
            <div class="px-6 py-4 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between shrink-0 relative z-10">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20 text-lg">
                        👑
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h2 class="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 tracking-tight">
                                MANGA STUDIO PRO
                            </h2>
                            <span class="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                Power Suite
                            </span>
                        </div>
                        <p class="text-xs text-slate-400">Bộ công cụ chuyên nghiệp cho Dịch giả & Nhóm dịch Manga</p>
                    </div>
                </div>

                <button id="btn-close-pro-modal" class="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer">
                    <i class="fa-solid fa-xmark text-sm"></i>
                </button>
            </div>

            <!-- Modal Body (Scrollable) -->
            <div class="flex-1 overflow-y-auto p-6 space-y-5 relative z-10 custom-scrollbar">

                <!-- Feature Trigger Banner (Dynamic) -->
                <div id="pro-modal-feature-banner" class="hidden bg-gradient-to-r from-amber-950/50 to-indigo-950/50 border border-amber-500/40 rounded-xl p-3.5 flex items-center gap-3 shadow-md">
                    <div class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                        <i class="fa-solid fa-lock text-sm"></i>
                    </div>
                    <div class="text-xs">
                        <span class="text-slate-300">Tính năng <strong id="pro-modal-feature-name" class="text-amber-300"></strong> là đặc quyền của gói Pro.</span>
                        <p class="text-[11px] text-slate-400 mt-0.5">Đăng nhập bằng Google để mở khóa toàn bộ sức mạnh hoàn toàn miễn phí!</p>
                    </div>
                </div>

                <!-- 6 Major Pro Features Grid -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    
                    <div class="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex items-start gap-3 hover:border-amber-500/30 transition-all">
                        <div class="w-8 h-8 rounded-lg bg-pink-500/15 text-pink-400 flex items-center justify-center shrink-0 font-bold">
                            <i class="fa-solid fa-bolt text-xs"></i>
                        </div>
                        <div>
                            <h4 class="text-xs font-bold text-slate-100">Auto-Pilot Chapter</h4>
                            <p class="text-[11px] text-slate-400 mt-0.5">Tự động hóa 100% OCR ➔ Dịch ➔ Xóa nền ➔ Gắn chữ 50+ trang cùng lúc.</p>
                        </div>
                    </div>

                    <div class="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex items-start gap-3 hover:border-amber-500/30 transition-all">
                        <div class="w-8 h-8 rounded-lg bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0 font-bold">
                            <i class="fa-solid fa-wand-magic-sparkles text-xs"></i>
                        </div>
                        <div>
                            <h4 class="text-xs font-bold text-slate-100">AI Eraser & Screentone</h4>
                            <p class="text-[11px] text-slate-400 mt-0.5">PatchMatch, LaMa, Mảng vá vân tranh & Tô họa tiết chấm Halftone Manga.</p>
                        </div>
                    </div>

                    <div class="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex items-start gap-3 hover:border-amber-500/30 transition-all">
                        <div class="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0 font-bold">
                            <i class="fa-solid fa-shield-halved text-xs"></i>
                        </div>
                        <div>
                            <h4 class="text-xs font-bold text-slate-100">QC Linter & Script Studio</h4>
                            <p class="text-[11px] text-slate-400 mt-0.5">Tự động phát hiện chữ tràn khung, biên tập kịch bản toàn tập & Regex Find/Replace.</p>
                        </div>
                    </div>

                    <div class="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex items-start gap-3 hover:border-amber-500/30 transition-all">
                        <div class="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0 font-bold">
                            <i class="fa-solid fa-file-export text-xs"></i>
                        </div>
                        <div>
                            <h4 class="text-xs font-bold text-slate-100">Xuất PSD Tách Lớp</h4>
                            <p class="text-[11px] text-slate-400 mt-0.5">Xuất file PSD đa layer cho Photoshop, PDF Ultra HD, CBZ & Lưu thẳng ổ cứng.</p>
                        </div>
                    </div>

                    <div class="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex items-start gap-3 hover:border-amber-500/30 transition-all">
                        <div class="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0 font-bold">
                            <i class="fa-brands fa-google-drive text-xs"></i>
                        </div>
                        <div>
                            <h4 class="text-xs font-bold text-slate-100">Google Drive Auto-Sync</h4>
                            <p class="text-[11px] text-slate-400 mt-0.5">Đồng bộ 2 chiều đám mây, tự động lưu trữ dự án an toàn, mở lại mọi nơi.</p>
                        </div>
                    </div>

                    <div class="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex items-start gap-3 hover:border-amber-500/30 transition-all">
                        <div class="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 font-bold">
                            <i class="fa-solid fa-address-card text-xs"></i>
                        </div>
                        <div>
                            <h4 class="text-xs font-bold text-slate-100">Lorebook & Typography Pro</h4>
                            <p class="text-[11px] text-slate-400 mt-0.5">Hồ sơ danh xưng nhân vật, Arc Text uốn cong, D-pad 4 hướng & Custom Fonts.</p>
                        </div>
                    </div>

                </div>

                <!-- Primary CTA Section -->
                <div class="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-5 text-center space-y-4">
                    <div>
                        <h3 class="text-sm font-extrabold text-white">Bắt đầu Trải nghiệm Pro Ngay Hôm Nay</h3>
                        <p class="text-xs text-slate-400 mt-1">Đăng nhập tài khoản Google để kích hoạt đầy đủ tính năng Pro (Miễn phí 100%)</p>
                    </div>

                    <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <!-- Google 1-Click Sign-in Button -->
                        <button id="btn-modal-google-login"
                            class="w-full sm:w-auto px-6 py-3 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-xs flex items-center justify-center gap-2.5 transition-all shadow-lg hover:shadow-white/20 cursor-pointer">
                            <svg class="w-4 h-4" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                            </svg>
                            <span>Đăng nhập với Google</span>
                        </button>

                        <!-- Instant Trial Button -->
                        <button id="btn-modal-instant-trial"
                            class="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/25 cursor-pointer">
                            <i class="fa-solid fa-play"></i>
                            <span>Dùng Thử Pro Ngay</span>
                        </button>
                    </div>

                    <!-- Promo / Redeem Code Input -->
                    <div class="pt-3 border-t border-slate-800/80 max-w-sm mx-auto flex items-center gap-2">
                        <input type="text" id="input-pro-redeem-code" placeholder="Nhập mã kích hoạt Pro..."
                            class="flex-1 bg-slate-950 border border-slate-800 focus:border-amber-500/60 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none uppercase font-mono transition-colors">
                        <button id="btn-pro-redeem-code"
                            class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs transition-colors cursor-pointer">
                            Kích hoạt
                        </button>
                    </div>
                </div>

            </div>

            <!-- Footer -->
            <div class="px-6 py-3 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 shrink-0 relative z-10">
                <span class="flex items-center gap-1.5"><i class="fa-solid fa-lock text-emerald-400"></i> Dữ liệu bảo mật 100% trên thiết bị của bạn</span>
                <span>Manga Translator Studio v2026</span>
            </div>

        </div>
    `;

    // Event Bindings
    modal.querySelector('#btn-close-pro-modal')?.addEventListener('click', closeProUpgradeModal);

    modal.querySelector('#btn-modal-google-login')?.addEventListener('click', () => {
        loginWithGoogle();
        handleProActivationSuccess();
    });

    modal.querySelector('#btn-modal-instant-trial')?.addEventListener('click', () => {
        activateInstantProTrial();
        handleProActivationSuccess();
    });

    modal.querySelector('#btn-pro-redeem-code')?.addEventListener('click', () => {
        const input = modal.querySelector('#input-pro-redeem-code') as HTMLInputElement | null;
        if (input && input.value) {
            const success = redeemProCode(input.value);
            if (success) {
                handleProActivationSuccess();
            }
        } else {
            showToast("Vui lòng nhập mã kích hoạt Pro.", "warn");
        }
    });

    return modal;
}
