// ==========================================
// homerent.js — Dashboard Style with Full Functionality
// ==========================================

import { auth, db } from '../firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    doc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── State ─────────────────────────────────────────────────────────────────────
let currentUser     = null;
let currentUserData = {};
let balanceUnsub    = null;

// ── Toast ─────────────────────────────────────────────────────────────────────
window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const colors = { success: '#10b981', error: '#ef4444', info: '#38bdf8', warning: '#f59e0b' };
    const icons  = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'info');
    toast.innerHTML = `
        <span style="color:${colors[type]};font-weight:bold;font-size:18px;">${icons[type] || 'ℹ'}</span>
        <span style="font-weight:500;color:#1e293b;">${message}</span>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
};

// ── Auth & Navigation ─────────────────────────────────────────────────────────
window.handleLogout = async function() {
    try {
        await signOut(auth);
        window.showToast('ออกจากระบบสำเร็จ', 'success');
        setTimeout(() => window.location.reload(), 800);
    } catch { window.showToast('เกิดข้อผิดพลาด', 'error'); }
};

window.toggleSidebar = function(e) {
    if (e) e.stopPropagation();
    // common.css ใช้ class .open สำหรับ sidebar
    document.getElementById('sidebarDrawer')?.classList.toggle('open');
    document.getElementById('sidebarOverlay')?.classList.toggle('open');
    // hamburger ใช้ class .active เพื่อ animation
    document.getElementById('hamburgerBtn')?.classList.toggle('active');
};

window.closeSidebar = function() {
    document.getElementById('sidebarDrawer')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('open');
    document.getElementById('hamburgerBtn')?.classList.remove('active');
};

window.toggleProfileDropdown = function(e) {
    e?.stopPropagation();
    const dropdown = document.getElementById('profileDropdown');
    const arrow = document.getElementById('dropdownArrow');
    
    if (dropdown) {
        const isActive = dropdown.classList.toggle('active');
        if (arrow) arrow.style.transform = isActive ? 'rotate(180deg)' : '';
    }
};

window.handleMenuClick = function(page) {
    const routes = {
        profile: './profile.html',
        orders: './orders.html',
        topup: './topup.html',
        settings: './settings.html'
    };
    if (routes[page]) window.location.href = routes[page];
};

// ── Render User UI ────────────────────────────────────────────────────────────
function updateBalanceDisplay(balance) {
    const n = Number(balance) || 0;
    const fmt = n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    const userBalance = document.getElementById('userBalance');
    if (userBalance) userBalance.textContent = fmt;
    
    const dropdownBalance = document.getElementById('dropdownBalance');
    if (dropdownBalance) dropdownBalance.textContent = fmt + ' ฿';
    
    const sidebarBalance = document.getElementById('sidebarBalance');
    if (sidebarBalance) sidebarBalance.textContent = fmt;
}

function updateNameDisplay(name) {
    const cleanName = (name || 'ผู้ใช้').trim();
    const initial = cleanName.charAt(0).toUpperCase();
    
    const dropdownName = document.getElementById('dropdownName');
    if (dropdownName) dropdownName.textContent = cleanName;
    
    const sidebarUsername = document.getElementById('sidebarUsername');
    if (sidebarUsername) sidebarUsername.textContent = cleanName;
    
    const userAvatar = document.getElementById('userAvatar');
    if (userAvatar) userAvatar.textContent = initial;
    
    const dropdownAvatar = document.getElementById('dropdownAvatar');
    if (dropdownAvatar) dropdownAvatar.textContent = initial;
    
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    if (sidebarAvatar) sidebarAvatar.textContent = initial;
}

function showUserUI(user, userData) {
    const name = userData?.displayName || user?.displayName || user?.email?.split('@')[0] || 'ผู้ใช้';
    const balance = userData?.balance ?? 0;

    const loginBtn = document.getElementById('loginBtn');
    const userProfile = document.getElementById('userProfile');
    const sidebarGuest = document.getElementById('sidebarAuthGuest');
    const sidebarUser = document.getElementById('sidebarAuthUser');
    const sidebarStrip = document.getElementById('sidebarUserStrip');

    if(loginBtn) loginBtn.style.display = 'none';
    if(userProfile) userProfile.style.display = 'flex';
    if(sidebarGuest) sidebarGuest.style.display = 'none';
    if(sidebarUser) sidebarUser.style.display = 'block';
    if(sidebarStrip) sidebarStrip.style.display = 'flex';

    updateNameDisplay(name);
    updateBalanceDisplay(balance);
}

function showGuestUI() {
    const loginBtn = document.getElementById('loginBtn');
    const userProfile = document.getElementById('userProfile');
    const sidebarGuest = document.getElementById('sidebarAuthGuest');
    const sidebarUser = document.getElementById('sidebarAuthUser');
    const sidebarStrip = document.getElementById('sidebarUserStrip');

    if(loginBtn) loginBtn.style.display = 'flex';
    if(userProfile) userProfile.style.display = 'none';
    if(sidebarGuest) sidebarGuest.style.display = 'block';
    if(sidebarUser) sidebarUser.style.display = 'none';
    if(sidebarStrip) sidebarStrip.style.display = 'none';
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
    balanceUnsub = onSnapshot(doc(db, 'users', uid), (snap) => {
        if (!snap.exists()) return;
        currentUserData = snap.data();
        showUserUI(currentUser, currentUserData);
    });
}

// ── Mock Data for Dashboard Table ─────────────────────────────────────────────
function renderMockTable() {
    const tableBody = document.getElementById('shopTableBody');
    const emptyState = document.getElementById('emptyState');
    
    if (tableBody && emptyState) {
        tableBody.innerHTML = '';
        emptyState.style.display = 'block';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderMockTable();
    
    // Close dropdown when click outside
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('profileDropdown');
        const trigger = document.getElementById('profileTrigger');
        
        if (dropdown && trigger && 
            !trigger.contains(e.target) && 
            !dropdown.contains(e.target)) {
            dropdown.classList.remove('active');
            const arrow = document.getElementById('dropdownArrow');
            if (arrow) arrow.style.transform = '';
        }
    });
});
