// ==========================================
// homerent.js — Dashboard (Fixed Dropdown Performance)
// ==========================================

import { auth, db } from '../firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    doc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── Security Constants ───────────────────────────────────────────────────────
const RL_KEY = 'panderx_logout_attempts';  // เปลี่ยนชื่อให้เฉพาะเจาะจง
const RL_MAX = 5;
const RL_WINDOW = 15 * 60 * 1000; // 15 minutes

// ── State ─────────────────────────────────────────────────────────────────────
let currentUser     = null;
let currentUserData = {};
let balanceUnsub    = null;
let isDropdownOpen  = false;
let lastToggleTime  = 0;  // ป้องกันการกดซ้ำเร็วเกินไป

// ── Security Functions ────────────────────────────────────────────────────────
function escapeHtml(text) {
    if (typeof text !== 'string') return String(text ?? '');
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Rate limit เฉพาะ logout เท่านั้น (ไม่ใช่ dropdown)
function checkLogoutRateLimit() {
    try {
        const raw = localStorage.getItem(RL_KEY);
        const data = raw ? JSON.parse(raw) : { attempts: 0, windowStart: Date.now() };

        if (Date.now() - data.windowStart > RL_WINDOW) {
            data.attempts = 0;
            data.windowStart = Date.now();
        }

        if (data.attempts >= RL_MAX) {
            const remaining = Math.ceil((RL_WINDOW - (Date.now() - data.windowStart)) / 60000);
            throw new Error(`คุณลองออกจากระบบมากเกินไป กรุณารอ ${remaining} นาที`);
        }

        data.attempts++;
        localStorage.setItem(RL_KEY, JSON.stringify(data));
        return true;
    } catch (e) {
        showToast(e.message, 'error');
        return false;
    }
}

function clearLogoutRateLimit() {
    localStorage.removeItem(RL_KEY);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const colors = { 
        success: '#10b981', 
        error: '#ef4444', 
        info: '#38bdf8', 
        warning: '#f59e0b' 
    };
    const icons  = { 
        success: '✓', 
        error: '✕', 
        info: 'ℹ', 
        warning: '⚠' 
    };

    const toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'info');

    toast.innerHTML = `
        <span style="color:${colors[type]};font-weight:bold;font-size:18px;">${icons[type]}</span>
        <span style="font-weight:500;color:#1e293b;">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    // Force reflow
    void toast.offsetWidth;

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// ── Auth & Navigation ─────────────────────────────────────────────────────────
window.handleLogout = async function() {
    // Rate limit เฉพาะ logout
    if (!checkLogoutRateLimit()) return;

    try {
        await signOut(auth);
        clearLogoutRateLimit();
        window.showToast('ออกจากระบบสำเร็จ', 'success');
        setTimeout(() => window.location.reload(), 800);
    } catch (err) {
        window.showToast('เกิดข้อผิดพลาดในการออกจากระบบ', 'error');
    }
};

window.toggleSidebar = function(e) {
    if (e) e.stopPropagation();

    const drawer = document.getElementById('sidebarDrawer');
    const overlay = document.getElementById('sidebarOverlay');
    const btn = document.getElementById('hamburgerBtn');

    if (!drawer) return;

    const isOpen = drawer.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open', isOpen);
    if (btn) {
        btn.classList.toggle('active', isOpen);
        btn.setAttribute('aria-expanded', String(isOpen));
    }

    document.body.style.overflow = isOpen ? 'hidden' : '';
};

window.closeSidebar = function() {
    const drawer = document.getElementById('sidebarDrawer');
    const overlay = document.getElementById('sidebarOverlay');
    const btn = document.getElementById('hamburgerBtn');

    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');

    if (btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-expanded', 'false');
    }
    document.body.style.overflow = '';
};

// Escape key handler
if (typeof document !== 'undefined') {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.closeSidebar();
            // ปิด dropdown ด้วย
            const dropdown = document.getElementById('profileDropdown');
            const arrow = document.getElementById('dropdownArrow');
            if (dropdown && dropdown.classList.contains('active')) {
                dropdown.classList.remove('active');
                if (arrow) arrow.style.transform = '';
                isDropdownOpen = false;
            }
        }
    });
}

// ── FIXED: toggleProfileDropdown (Optimized, No Rate Limit) ───────────────────
window.toggleProfileDropdown = function(e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }

    // Debounce: ป้องกันการกดซ้ำเร็วเกินไป (300ms)
    const now = Date.now();
    if (now - lastToggleTime < 300) return;
    lastToggleTime = now;

    const dropdown = document.getElementById('profileDropdown');
    const arrow = document.getElementById('dropdownArrow');

    if (!dropdown) return;

    // Toggle state
    isDropdownOpen = !isDropdownOpen;

    if (isDropdownOpen) {
        dropdown.classList.add('active');
        if (arrow) arrow.style.transform = 'rotate(180deg)';
    } else {
        dropdown.classList.remove('active');
        if (arrow) arrow.style.transform = '';
    }
};

// ── handleMenuClick ───────────────────────────────────────────────────────────
window.handleMenuClick = function(page) {
    const routes = {
        profile: './profile.html',
        orders: './orders.html',
        topup: './topup.html',
        settings: './settings.html'
    };

    const target = routes[page];
    if (target) {
        window.location.href = target;
    }
};

// ── Render User UI ────────────────────────────────────────────────────────────
function updateBalanceDisplay(balance) {
    const n = Number(balance ?? 0);
    const fmt = n.toLocaleString('th-TH', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    });

    const elements = {
        userBalance: document.getElementById('userBalance'),
        dropdownBalance: document.getElementById('dropdownBalance'),
        sidebarBalance: document.getElementById('sidebarBalance')
    };

    if (elements.userBalance) elements.userBalance.textContent = fmt;
    if (elements.dropdownBalance) elements.dropdownBalance.textContent = fmt + ' ฿';
    if (elements.sidebarBalance) elements.sidebarBalance.textContent = fmt;
}

function updateNameDisplay(name) {
    const cleanName = (name || 'ผู้ใช้').trim();
    const initial = cleanName.charAt(0).toUpperCase();

    const elements = {
        dropdownName: document.getElementById('dropdownName'),
        sidebarUsername: document.getElementById('sidebarUsername'),
        userAvatar: document.getElementById('userAvatar'),
        dropdownAvatar: document.getElementById('dropdownAvatar'),
        sidebarAvatar: document.getElementById('sidebarAvatar')
    };

    if (elements.dropdownName) elements.dropdownName.textContent = cleanName;
    if (elements.sidebarUsername) elements.sidebarUsername.textContent = cleanName;
    if (elements.userAvatar) elements.userAvatar.textContent = initial;
    if (elements.dropdownAvatar) elements.dropdownAvatar.textContent = initial;
    if (elements.sidebarAvatar) elements.sidebarAvatar.textContent = initial;
}

function checkAdminRole(role) {
    const lowerRole = String(role || '').toLowerCase();
    return lowerRole === 'admin' || lowerRole === 'super_admin' || lowerRole === 'owner';
}

function showUserUI(user, userData) {
    const name = userData?.displayName || user?.displayName || user?.email?.split('@')[0] || 'ผู้ใช้';
    const balance = userData?.balance ?? 0;
    const role = userData?.role || '';

    const elements = {
        loginBtn: document.getElementById('loginBtn'),
        userProfile: document.getElementById('userProfile'),
        sidebarGuest: document.getElementById('sidebarAuthGuest'),
        sidebarUser: document.getElementById('sidebarAuthUser'),
        sidebarStrip: document.getElementById('sidebarUserStrip')
    };

    if (elements.loginBtn) elements.loginBtn.style.display = 'none';
    if (elements.userProfile) elements.userProfile.style.display = 'flex';
    if (elements.sidebarGuest) elements.sidebarGuest.style.display = 'none';
    if (elements.sidebarUser) elements.sidebarUser.style.display = 'block';
    if (elements.sidebarStrip) elements.sidebarStrip.style.display = 'flex';

    updateNameDisplay(name);
    updateBalanceDisplay(balance);

    // Admin Panel visibility
    if (checkAdminRole(role)) {
        const adminBtn = document.getElementById('adminPanelBtn');
        if (adminBtn) adminBtn.classList.add('show');
    }
}

function showGuestUI() {
    const elements = {
        loginBtn: document.getElementById('loginBtn'),
        userProfile: document.getElementById('userProfile'),
        sidebarGuest: document.getElementById('sidebarAuthGuest'),
        sidebarUser: document.getElementById('sidebarAuthUser'),
        sidebarStrip: document.getElementById('sidebarUserStrip')
    };

    if (elements.loginBtn) elements.loginBtn.style.display = 'flex';
    if (elements.userProfile) elements.userProfile.style.display = 'none';
    if (elements.sidebarGuest) elements.sidebarGuest.style.display = 'block';
    if (elements.sidebarUser) elements.sidebarUser.style.display = 'none';
    if (elements.sidebarStrip) elements.sidebarStrip.style.display = 'none';
}

// ── Init ──────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        startBalanceListener(user.uid);
    } else {
        currentUser = null;
        if (balanceUnsub) balanceUnsub();
        showGuestUI();
    }
});

function startBalanceListener(uid) {
    if (balanceUnsub) balanceUnsub();

    try {
        balanceUnsub = onSnapshot(
            doc(db, 'users', uid), 
            (snap) => {
                if (!snap.exists()) {
                    showGuestUI();
                    return;
                }
                currentUserData = snap.data();
                showUserUI(currentUser, currentUserData);
            },
            (err) => {
                console.error('Balance listener error:', err);
            }
        );
    } catch (e) {
        console.error('Start listener error:', e);
    }
}

// ── Mock Data ─────────────────────────────────────────────────────────────────
function renderMockTable() {
    const tableBody = document.getElementById('shopTableBody');
    const emptyState = document.getElementById('emptyState');

    if (tableBody) tableBody.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
}

// ── Event Listeners ───────────────────────────────────────────────────────────
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        renderMockTable();

        // Click outside to close dropdown (Optimized)
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('profileDropdown');
            const trigger = document.getElementById('profileTrigger');

            if (!dropdown || !trigger) return;

            if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
                if (dropdown.classList.contains('active')) {
                    dropdown.classList.remove('active');
                    const arrow = document.getElementById('dropdownArrow');
                    if (arrow) arrow.style.transform = '';
                    isDropdownOpen = false;
                }
            }
        });

        // Prevent drag and drop
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length > 0) {
                showToast('ไม่อนุญาตให้ลากไฟล์เข้าหน้าเว็บ', 'warning');
            }
        });
    });
}
