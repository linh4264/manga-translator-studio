/**
 * Manga Translator Studio - Pro Coming Soon Roadmap Modal UI
 * Displays upcoming high-end AI & Team Cloud roadmap while reassuring users that all core studio tools are 100% free.
 */

import { loginWithGoogle, isProUser, getUserProfile } from '../features/auth/auth-manager';
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
        <div class="bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border border-indigo-500/40 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100 relative">
            
            <!-- Glow Background Effect -->
            <div class="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
            <div class="absolute -bottom-24 -left-24 w-64 h-64 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none"></div>

            <!-- Top Header Bar -->
            <div class="px-6 py-4 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between shrink-0 relative z-10">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white font-black shadow-lg shadow-indigo-500/25 text-lg">
                        ✨
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h2 class="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-200 via-purple-300 to-pink-300 tracking-tight">
                                MANGA STUDIO PRO
                            </h2>
                            <span class="px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm flex items-center gap-1">
                                <i class="fa-solid fa-clock-rotate-left text-[8px] animate-pulse"></i> Sắp ra mắt • Coming Soon
                            </span>
                        </div>
                        <p class="text-xs text-slate-400">Lộ trình phát triển các tính năng AI & Team Cloud thế hệ mới</p>
                    </div>
                </div>

                <button id="btn-close-pro-modal" class="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer">
                    <i class="fa-solid fa-xmark text-sm"></i>
                </button>
            </div>

            <!-- Modal Body (Scrollable) -->
            <div class="flex-1 overflow-y-auto p-6 space-y-5 relative z-10 custom-scrollbar">

                <!-- Reassurance Info Box -->
                <div class="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border border-emerald-500/30 rounded-xl p-3.5 flex items-start gap-3 shadow-md">
                    <div class="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                        <i class="fa-solid fa-circle-check text-sm"></i>
                    </div>
                    <div class="text-xs leading-relaxed">
                        <span class="text-emerald-300 font-bold">Toàn bộ công cụ làm truyện hiện tại đang Mở Khóa Miễn Phí 100%!</span>
                        <p class="text-slate-300 text-[11px] mt-0.5">
                            Bạn có thể tự do sử dụng Auto-Pilot Chapter, Gậy ma thuật, Script Review, QC Linter, Typesetting Canvas và Xuất ZIP/PSD/PDF không giới hạn trên máy của bạn.
                        </p>
                    </div>
                </div>

                <!-- 6 Future Pro Features Teaser Grid -->
                <div>
                    <h3 class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                        <i class="fa-solid fa-sparkles text-indigo-400 text-[10px]"></i> Các tính năng Pro dự kiến sẽ ra mắt
                    </h3>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        
                        <div class="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 flex items-start gap-3 hover:border-indigo-500/40 transition-all group">
                            <div class="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0 font-bold group-hover:scale-110 transition-transform">
                                <i class="fa-solid fa-brain text-xs"></i>
                            </div>
                            <div>
                                <div class="flex items-center justify-between">
                                    <h4 class="text-xs font-bold text-slate-100">Multi-LLM Reasoning Hub</h4>
                                    <span class="text-[8px] font-bold px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">Q3</span>
                                </div>
                                <p class="text-[11px] text-slate-400 mt-1">Mở khóa chọn tự do Claude 3.5 Sonnet, GPT-4o, DeepSeek R1 & Endpoint riêng cho truyện chuyên sâu.</p>
                            </div>
                        </div>

                        <div class="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 flex items-start gap-3 hover:border-indigo-500/40 transition-all group">
                            <div class="w-8 h-8 rounded-lg bg-pink-500/15 text-pink-400 flex items-center justify-center shrink-0 font-bold group-hover:scale-110 transition-transform">
                                <i class="fa-solid fa-users text-xs"></i>
                            </div>
                            <div>
                                <div class="flex items-center justify-between">
                                    <h4 class="text-xs font-bold text-slate-100">Team Cloud Workspace</h4>
                                    <span class="text-[8px] font-bold px-1.5 py-0.2 rounded bg-pink-950 text-pink-300 border border-pink-800">Q3</span>
                                </div>
                                <p class="text-[11px] text-slate-400 mt-1">Làm việc nhóm thời gian thực — Dịch giả, Editor và Typesetter cùng xử lý chung 1 Chapter trên Cloud.</p>
                            </div>
                        </div>

                        <div class="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 flex items-start gap-3 hover:border-indigo-500/40 transition-all group">
                            <div class="w-8 h-8 rounded-lg bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0 font-bold group-hover:scale-110 transition-transform">
                                <i class="fa-solid fa-wand-magic-sparkles text-xs"></i>
                            </div>
                            <div>
                                <div class="flex items-center justify-between">
                                    <h4 class="text-xs font-bold text-slate-100">Generative AI Inpaint GPU</h4>
                                    <span class="text-[8px] font-bold px-1.5 py-0.2 rounded bg-teal-950 text-teal-300 border border-teal-800">Q4</span>
                                </div>
                                <p class="text-[11px] text-slate-400 mt-1">Tự động vẽ bù hoàn hảo vân tranh & chi tiết phức tạp khi xóa SFX đè lên mặt nhân vật.</p>
                            </div>
                        </div>

                        <div class="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 flex items-start gap-3 hover:border-indigo-500/40 transition-all group">
                            <div class="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0 font-bold group-hover:scale-110 transition-transform">
                                <i class="fa-solid fa-book-bookmark text-xs"></i>
                            </div>
                            <div>
                                <div class="flex items-center justify-between">
                                    <h4 class="text-xs font-bold text-slate-100">AI Story Memory Engine</h4>
                                    <span class="text-[8px] font-bold px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">Q4</span>
                                </div>
                                <p class="text-[11px] text-slate-400 mt-1">Ghi nhớ xuyên suốt cốt truyện hàng trăm chapter, tự động duy trì chuẩn danh xưng theo diễn biến tâm lý.</p>
                            </div>
                        </div>

                        <div class="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 flex items-start gap-3 hover:border-indigo-500/40 transition-all group">
                            <div class="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0 font-bold group-hover:scale-110 transition-transform">
                                <i class="fa-solid fa-graduation-cap text-xs"></i>
                            </div>
                            <div>
                                <div class="flex items-center justify-between">
                                    <h4 class="text-xs font-bold text-slate-100">Song Ngữ & Học Tập (JLPT/TOEIC)</h4>
                                    <span class="text-[8px] font-bold px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-800">Roadmap</span>
                                </div>
                                <p class="text-[11px] text-slate-400 mt-1">Bóc tách từ vựng, ngữ pháp & phân loại cấp độ khó trực tiếp theo từng khung thoại cho người học.</p>
                            </div>
                        </div>

                        <div class="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 flex items-start gap-3 hover:border-indigo-500/40 transition-all group">
                            <div class="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0 font-bold group-hover:scale-110 transition-transform">
                                <i class="fa-solid fa-cloud-arrow-up text-xs"></i>
                            </div>
                            <div>
                                <div class="flex items-center justify-between">
                                    <h4 class="text-xs font-bold text-slate-100">Auto Cloud Sync & Backup</h4>
                                    <span class="text-[8px] font-bold px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">Roadmap</span>
                                </div>
                                <p class="text-[11px] text-slate-400 mt-1">Tự động sao lưu tiến độ chapter lên Google Drive / Cloud Storage, chuyển đổi máy làm việc tức thì.</p>
                            </div>
                        </div>

                    </div>
                </div>

                <!-- Action Section -->
                <div class="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-5 text-center space-y-4">
                    <div>
                        <h3 class="text-sm font-extrabold text-white">Đăng ký Nhận Thông Báo Sớm</h3>
                        <p class="text-xs text-slate-400 mt-1">Đăng nhập với Google để lưu thiết lập cá nhân & nhận đặc quyền trải nghiệm Pro khi ra mắt</p>
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

                        <!-- Dismiss & Continue using Studio -->
                        <button id="btn-modal-continue-free"
                            class="w-full sm:w-auto px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border border-slate-700">
                            <i class="fa-solid fa-palette text-indigo-400"></i>
                            <span>Bắt đầu làm truyện ngay</span>
                        </button>
                    </div>
                </div>

            </div>

            <!-- Footer -->
            <div class="px-6 py-3 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 shrink-0 relative z-10">
                <span class="flex items-center gap-1.5"><i class="fa-solid fa-lock text-emerald-400"></i> Dữ liệu truyện lưu trữ 100% an toàn trên trình duyệt của bạn</span>
                <span>Manga Translator Studio Roadmap</span>
            </div>

        </div>
    `;

    // Event Bindings
    modal.querySelector('#btn-close-pro-modal')?.addEventListener('click', closeProUpgradeModal);
    modal.querySelector('#btn-modal-continue-free')?.addEventListener('click', closeProUpgradeModal);

    modal.querySelector('#btn-modal-google-login')?.addEventListener('click', () => {
        loginWithGoogle();
        handleProActivationSuccess();
    });

    return modal;
}

