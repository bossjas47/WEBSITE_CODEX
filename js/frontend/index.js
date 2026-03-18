/**
 * PanderX Index Page - Frontend Module
 * Path: js/frontend/index.js
 * Connects to: js/firebase-config.js (parent directory)
 */

// แก้ path จาก ./firebase-config.js เป็น ../firebase-config.js
import { auth, db } from '../firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ============================================
// Utility Functions (Security & Safety)
// ============================================

function escapeHtml(text) {
    if (typeof text !== 'string') return String(text ?? '');
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatBalance(num) {
    const n = Number(num);
    if (isNaN(n)) return '0.00';
    return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ใช้ ?? ไม่ใช่ || (ตาม skill.md - Critical)
function safeBalance(val) {
    return val ?? 0;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${escapeHtml(type)}`;
    toast.textContent = escapeHtml(message);
    container.appendChild(toast);
    
    requestAnimationFrame(() => toast.classList.add('show'));
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Expose สำหรับใช้จากภายนอก (globals)
window.showToast = showToast;

// ============================================
// Admin Role Check
// ============================================

function checkIsAdmin(role) {
    if (!role) return false;
    const r = String(role).toLowerCase().trim();
    return r === 'admin' || r === 'super_admin';
}

function showAdminUI() {
    const dropdownBtn = document.getElementById('adminPanelBtn');
    const sidebarBtn = document.getElementById('sidebarAdminBtn');
    
    if (dropdownBtn) dropdownBtn.style.display = 'flex';
    if (sidebarBtn) sidebarBtn.style.display = 'flex';
    
    console.log('[Admin] Admin UI activated');
}

// ============================================
// UI Updates (ใช้ style.display เท่านั้น - ไม่ใช้ classList.hidden)
// ============================================

function updateBalanceDisplay(balance) {
    const fmt = formatBalance(balance);
    
    // User balance (navbar)
    const userBalance = document.getElementById('userBalance');
    if (userBalance) userBalance.textContent = fmt;
    
    // Dropdown balance
    const dropdownBalance = document.getElementById('dropdownBalance');
    if (dropdownBalance) dropdownBalance.textContent = fmt + ' ฿';
    
    // Sidebar balance
    const sidebarBalance = document.getElementById('sidebarBalance');
    if (sidebarBalance) sidebarBalance.textContent = fmt;
}

function updateNameDisplay(name) {
    const cleanName = escapeHtml((name || 'ผู้ใช้').trim());
    const initial = cleanName.charAt(0).toUpperCase();
    
    // Display names
    const dropdownName = document.getElementById('dropdownName');
    if (dropdownName) dropdownName.textContent = cleanName;
    
    const sidebarUsername = document.getElementById('sidebarUsername');
    if (sidebarUsername) sidebarUsername.textContent = cleanName;
    
    // Avatars
    const userAvatar = document.getElementById('userAvatar');
    if (userAvatar) userAvatar.textContent = initial;
    
    const dropdownAvatar = document.getElementById('dropdownAvatar');
    if (dropdownAvatar) dropdownAvatar.textContent = initial;
    
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    if (sidebarAvatar) sidebarAvatar.textContent = initial;
}

// ============================================
// Auth Management
// ============================================

let _authInitialized = false;
let _lastUser = null;

async function initAuth() {
    onAuthStateChanged(auth, async (user) => {
        // Prevent duplicate processing
        if (_authInitialized && user?.uid === _lastUser) return;
        _lastUser = user ? user.uid : null;
        _authInitialized = true;

        // Elements
        const loginBtn = document.getElementById('loginBtn');
        const userProfile = document.getElementById('userProfile');
        const sidebarUserStrip = document.getElementById('sidebarUserStrip');
        const sidebarAuthGuest = document.getElementById('sidebarAuthGuest');
        const sidebarAuthUser = document.getElementById('sidebarAuthUser');
        const heroLoginBtn = document.getElementById('heroLoginBtn');

        if (!user) {
            // Guest mode - ใช้ style.display เท่านั้น
            if (loginBtn) loginBtn.style.display = 'flex';
            if (userProfile) userProfile.style.display = 'none';
            if (sidebarUserStrip) sidebarUserStrip.style.display = 'none';
            if (sidebarAuthGuest) sidebarAuthGuest.style.display = 'block';
            if (sidebarAuthUser) sidebarAuthUser.style.display = 'none';
            if (heroLoginBtn) heroLoginBtn.style.display = 'block';
            return;
        }

        // Logged in
        if (loginBtn) loginBtn.style.display = 'none';
        if (userProfile) userProfile.style.display = 'flex';
        if (sidebarUserStrip) sidebarUserStrip.style.display = 'flex';
        if (sidebarAuthGuest) sidebarAuthGuest.style.display = 'none';
        if (sidebarAuthUser) sidebarAuthUser.style.display = 'block';
        if (heroLoginBtn) heroLoginBtn.style.display = 'none';

        // Optimistic UI - แสดงชื่อจาก Auth ก่อน
        const authName = user.displayName || user.email?.split('@')[0] || 'ผู้ใช้';
        updateNameDisplay(authName);
        updateBalanceDisplay(0);

        // Load from Firestore
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            
            if (userDoc.exists()) {
                const data = userDoc.data();
                
                // Update name
                const displayName = data.displayName?.trim() || authName;
                updateNameDisplay(displayName);
                
                // Update balance (ใช้ ?? ไม่ใช่ ||)
                const balance = safeBalance(data.balance);
                updateBalanceDisplay(balance);
                
                // Check role
                if (checkIsAdmin(data.role)) {
                    showAdminUI();
                }
            } else {
                // Ghost user repair - สร้าง doc ให้อัตโนมัติ
                console.log('[Auth] Creating missing user doc for:', user.uid);
                await setDoc(doc(db, 'users', user.uid), {
                    uid: user.uid,
                    email: user.email || '',
                    displayName: user.displayName || user.email?.split('@')[0] || 'ผู้ใช้',
                    balance: 0,
                    role: 'user',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
                updateBalanceDisplay(0);
            }
        } catch (err) {
            console.error('[Auth] Error:', err);
            // Fallback - ไม่ทิ้งว่าง
            updateBalanceDisplay(0);
        }
    });
}

// ============================================
// Data Loading
// ============================================

async function loadStats() {
    const ageEl = document.getElementById('serviceAge');
    const todayEl = document.getElementById('statToday');
    const weekEl = document.getElementById('statWeek');
    const monthEl = document.getElementById('statMonth');
    const totalEl = document.getElementById('statTotal');
    
    try {
        const snap = await getDoc(doc(db, 'system', 'stats'));
        const data = snap.exists() ? snap.data() : {};

        // Service age
        if (ageEl && data.launchDate?.toDate) {
            const days = Math.floor((Date.now() - data.launchDate.toDate()) / 86400000);
            ageEl.textContent = `ให้บริการมาแล้ว ${days.toLocaleString('th-TH')} วัน`;
        } else if (ageEl) {
            ageEl.textContent = 'บริการเว็บไซต์สำเร็จรูปคุณภาพสูง';
        }

        // Stats (ใช้ ?? ไม่ใช่ ||)
        const stats = {
            today: data.todayCount ?? 0,
            week: data.weekCount ?? 0,
            month: data.monthCount ?? 0,
            total: data.totalCount ?? 0
        };

        if (todayEl) animateNumber(todayEl, stats.today);
        if (weekEl) animateNumber(weekEl, stats.week);
        if (monthEl) animateNumber(monthEl, stats.month);
        if (totalEl) animateNumber(totalEl, stats.total);
        
    } catch (err) {
        console.error('[Stats] Error:', err);
        if (ageEl) ageEl.textContent = 'บริการเว็บไซต์สำเร็จรูปคุณภาพสูง';
        // แสดง 0 เมื่อ error
        if (todayEl) todayEl.textContent = '0';
        if (weekEl) weekEl.textContent = '0';
        if (monthEl) monthEl.textContent = '0';
        if (totalEl) totalEl.textContent = '0';
    }
}

function animateNumber(el, target) {
    const t = Number(target) || 0;
    if (!t) {
        el.textContent = '0';
        return;
    }
    
    const start = performance.now();
    const duration = 800;
    
    function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(t * ease);
        el.textContent = current.toLocaleString('th-TH');
        
        if (progress < 1) requestAnimationFrame(step);
    }
    
    requestAnimationFrame(step);
}

async function loadProducts() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    // Loading state (spinner ไม่ใช่ skeleton)
    grid.innerHTML = `
        <div class="col-span-full flex items-center justify-center py-12 text-slate-400 gap-3">
            <div class="w-6 h-6 border-2 border-slate-200 border-t-sky-500 rounded-full animate-spin"></div>
            <span>กำลังโหลดสินค้า...</span>
        </div>
    `;

    try {
        const q = query(
            collection(db, 'products'),
            where('isActive', '==', true),
            orderBy('createdAt', 'desc'),
            limit(8)
        );
        
        const snap = await getDocs(q);
        
        if (snap.empty) {
            grid.innerHTML = `
                <div class="col-span-full text-center py-12 text-slate-400">
                    <i class="fa-solid fa-box-open text-4xl mb-3 block"></i>
                    <p>ยังไม่มีสินค้า</p>
                </div>
            `;
            return;
        }

        let html = '';
        snap.forEach((docSnap) => {
            const p = docSnap.data();
            const name = escapeHtml(p.name || 'ไม่มีชื่อ');
            const price = Number(p.price || 0).toLocaleString('th-TH');
            const img = p.imageUrl ? escapeHtml(p.imageUrl) : null;
            const category = escapeHtml(p.category || 'ทั่วไป');
            
            html += `
                <div class="product-card" data-id="${escapeHtml(docSnap.id)}">
                    <div class="product-image-wrap">
                        ${img ? `
                            <img src="${img}" class="product-img" loading="lazy" alt="${name}"
                                 onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\'flex items-center justify-center h-full text-slate-400 text-xs\'>ไม่มีรูปภาพ</div>'">
                        ` : `
                            <div class="flex items-center justify-center h-full text-slate-400 text-xs">
                                ไม่มีรูปภาพ
                            </div>
                        `}
                    </div>
                    <div class="product-info">
                        <div class="product-name">${name}</div>
                        <div class="text-xs text-slate-500 mt-0.5">${category}</div>
                    </div>
                    <div class="product-footer">
                        <div>
                            <div class="product-price">${price}</div>
                            <div class="product-price-unit">บาท</div>
                        </div>
                        <button onclick="event.stopPropagation(); window.location.href='./homerent.html'" 
                                class="bg-gradient-to-r from-sky-400 to-indigo-400 text-white text-xs px-3 py-1.5 rounded-full hover:shadow-md transition-all">
                            เช่า
                        </button>
                    </div>
                </div>
            `;
        });
        
        grid.innerHTML = html;
        
        // Click handlers
        grid.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', () => {
                window.location.href = './homerent.html';
            });
        });
        
    } catch (err) {
        console.error('[Products] Error:', err);
        grid.innerHTML = `
            <div class="col-span-full text-center py-12 text-red-500">
                <i class="fa-solid fa-circle-exclamation text-4xl mb-3 block"></i>
                <p class="font-medium">ไม่สามารถโหลดสินค้าได้</p>
                <button onclick="window.location.reload()" class="mt-3 px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition-colors">
                    ลองใหม่
                </button>
            </div>
        `;
    }
}

// ============================================
// Event Handlers (Expose ทั้งหมดไว้ที่ window)
// ============================================

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

window.handleLogout = async function() {
    try {
        await signOut(auth);
        showToast('ออกจากระบบสำเร็จ', 'success');
        setTimeout(() => window.location.href = './login.html', 500);
    } catch (err) {
        showToast('ออกจากระบบไม่สำเร็จ', 'error');
    }
};

window.goToLogin = function() {
    window.location.href = './login.html';
};

window.goToRegister = function() {
    window.location.href = './register.html';
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
        btn.setAttribute('aria-expanded', isOpen);
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

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    
    // Load data
    setTimeout(() => {
        loadStats();
        // loadProducts(); // ลบออก
    }, 100);
    
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
    
    // Close sidebar with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.closeSidebar();
        }
    });
});

// Expose auth สำหรับ scripts อื่นที่ไม่ใช่ module (เช่น stats-logic.js)
window.auth = auth;
window.db = db;
