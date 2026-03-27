/**
 * Dashboard.js - หน้าแดชบอร์ดหลังสร้างเว็บไซต์เสร็จ
 * ตามมาตรฐาน SKILL.md
 */

import { auth, db } from '../../firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.7.1';
import { onAuthStateChanged, signOut } from `${FB}/firebase-auth.js`;
import { 
    doc, 
    getDoc, 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    getDocs,
    Timestamp,
    onSnapshot
} from `${FB}/firebase-firestore.js`;

// State
let currentUser = null;
let currentWebsiteId = null;
let unsubscribers = [];

// DOM Elements cache
const elements = {
    // Auth
    loginBtn: null,
    userProfile: null,
    // Profile dropdown
    displayName: null,
    userAvatar: null,
    dropdownName: null,
    dropdownAvatar: null,
    dropdownBalance: null,
    userBalance: null,
    sidebarBalance: null,
    sidebarUsername: null,
    sidebarAvatar: null,
    // Admin buttons
    adminPanelBtn: null,
    sidebarAdminBtn: null,
    // Dashboard specific
    welcomeBanner: null,
    siteStatus: null,
    siteDomain: null,
    sitePackage: null,
    siteExpiry: null,
    siteRemaining: null,
    statProducts: null,
    statOrdersToday: null,
    statRevenueToday: null,
    statCustomers: null,
    recentOrdersList: null
};

// Initialize
function init() {
    cacheElements();
    setupEventListeners();
    setupAuth();
    loadSiteIdentity();
}

function cacheElements() {
    elements.loginBtn = document.getElementById('loginBtn');
    elements.userProfile = document.getElementById('userProfile');
    elements.displayName = document.getElementById('displayName');
    elements.userAvatar = document.getElementById('userAvatar');
    elements.dropdownName = document.getElementById('dropdownName');
    elements.dropdownAvatar = document.getElementById('dropdownAvatar');
    elements.dropdownBalance = document.getElementById('dropdownBalance');
    elements.userBalance = document.getElementById('userBalance');
    elements.sidebarBalance = document.getElementById('sidebarBalance');
    elements.sidebarUsername = document.getElementById('sidebarUsername');
    elements.sidebarAvatar = document.getElementById('sidebarAvatar');
    elements.adminPanelBtn = document.getElementById('adminPanelBtn');
    elements.sidebarAdminBtn = document.getElementById('sidebarAdminBtn');
    
    // Dashboard elements
    elements.welcomeBanner = document.getElementById('welcomeBanner');
    elements.siteStatus = document.getElementById('siteStatus');
    elements.siteDomain = document.getElementById('siteDomain');
    elements.sitePackage = document.getElementById('sitePackage');
    elements.siteExpiry = document.getElementById('siteExpiry');
    elements.siteRemaining = document.getElementById('siteRemaining');
    elements.statProducts = document.getElementById('statProducts');
    elements.statOrdersToday = document.getElementById('statOrdersToday');
    elements.statRevenueToday = document.getElementById('statRevenueToday');
    elements.statCustomers = document.getElementById('statCustomers');
    elements.recentOrdersList = document.getElementById('recentOrdersList');
}

function setupEventListeners() {
    // Escape to close sidebar
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') window.closeSidebar();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const dd = document.getElementById('profileDropdown');
        const btn = document.getElementById('profileTrigger');
        if (dd && btn && !btn.contains(e.target) && !dd.contains(e.target)) {
            dd.classList.remove('active');
        }
    });
}

// Auth Setup
function setupAuth() {
    let lastUid = null;
    let authInit = false;

    onAuthStateChanged(auth, async (user) => {
        if (authInit && user?.uid === lastUid) return;
        lastUid = user ? user.uid : null;
        authInit = true;

        if (!user) {
            showGuestUI();
            // Redirect to login if not authenticated (dashboard requires login)
            const currentPath = encodeURIComponent(location.pathname + location.search);
            location.href = `./login.html?redirect=${currentPath}`;
            return;
        }

        currentUser = user;
        showUserUI(user);
        
        // Optimistic update
        updateName(user.displayName || user.email?.split('@')[0] || 'ผู้ใช้');
        updateBalance(0);

        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                updateName(data.displayName || user.displayName || 'ผู้ใช้');
                updateBalance(data.balance ?? 0); // ใช้ ?? ตาม SKILL.md
                
                // Check role
                const role = String(data.role || '').toLowerCase();
                if (role === 'admin' || role === 'super_admin') {
                    if (elements.adminPanelBtn) elements.adminPanelBtn.style.display = 'flex';
                    if (elements.sidebarAdminBtn) elements.sidebarAdminBtn.style.display = 'flex';
                }

                // Get websiteId (Multi-Tenant)
                currentWebsiteId = data.websiteId || null;
                
                // ถ้ามี websiteId ให้โหลดข้อมูล dashboard
                if (currentWebsiteId) {
                    loadDashboardData(currentWebsiteId);
                } else {
                    // ยังไม่มีเว็บไซต์ แสดงข้อความแนะนำให้สร้าง
                    showNoWebsiteState();
                }
            } else {
                // Ghost user repair (สร้าง doc ใหม่ตาม SKILL.md)
                await createUserDoc(user);
            }
        } catch (err) {
            console.error('[Dashboard] Auth error:', err);
            showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
        }
    });
}

async function createUserDoc(user) {
    try {
        const { setDoc, doc, serverTimestamp } = await import(`${FB}/firebase-firestore.js`);
        const websiteId = detectWebsiteId();
        
        await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || user.email?.split('@')[0] || 'ผู้ใช้',
            balance: 0,
            role: 'user',
            websiteId: websiteId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        
        showToast('สร้างโปรไฟล์ผู้ใช้สำเร็จ', 'success');
    } catch (err) {
        console.error('[Dashboard] Create user doc error:', err);
    }
}

function detectWebsiteId() {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    if (parts.length >= 3 && parts[parts.length-2] === 'panderx' && parts[parts.length-1] === 'xyz') {
        return parts[0];
    }
    return null;
}

// UI Functions
function showGuestUI() {
    if (elements.loginBtn) elements.loginBtn.style.display = 'flex';
    if (elements.userProfile) elements.userProfile.style.display = 'none';
    
    const strip = document.getElementById('sidebarUserStrip');
    const guest = document.getElementById('sidebarAuthGuest');
    const userSec = document.getElementById('sidebarAuthUser');
    
    if (strip) strip.style.display = 'none';
    if (guest) guest.style.display = 'block';
    if (userSec) userSec.style.display = 'none';
}

function showUserUI(user) {
    if (elements.loginBtn) elements.loginBtn.style.display = 'none';
    if (elements.userProfile) elements.userProfile.style.display = 'flex';
    
    const strip = document.getElementById('sidebarUserStrip');
    const guest = document.getElementById('sidebarAuthGuest');
    const userSec = document.getElementById('sidebarAuthUser');
    
    if (strip) strip.style.display = 'flex';
    if (guest) guest.style.display = 'none';
    if (userSec) userSec.style.display = 'block';
}

function showNoWebsiteState() {
    if (elements.siteStatus) {
        elements.siteStatus.className = 'status-badge status-pending';
        elements.siteStatus.innerHTML = '<span style="width: 6px; height: 6px; background: #f59e0b; border-radius: 50%;"></span> ยังไม่มีเว็บไซต์';
    }
    if (elements.siteDomain) elements.siteDomain.textContent = 'กรุณาสร้างเว็บไซต์';
    if (elements.sitePackage) elements.sitePackage.textContent = '-';
    if (elements.siteExpiry) elements.siteExpiry.textContent = '-';
    
    // แสดงปุ่มสร้างเว็บไซต์
    if (elements.recentOrdersList) {
        elements.recentOrdersList.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                <i class="fa-solid fa-store" style="font-size: 3rem; margin-bottom: 16px; display: block; color: #cbd5e1;"></i>
                <p style="font-weight: 600; color: #64748b; margin-bottom: 8px;">คุณยังไม่มีเว็บไซต์</p>
                <p style="font-size: 0.9rem; margin-bottom: 20px;">สร้างเว็บไซต์เพื่อเริ่มต้นขายสินค้า</p>
                <a href="./homerent.html" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #0ea5e9, #6366f1); color: white; text-decoration: none; border-radius: 12px; font-weight: 500;">
                    <i class="fa-solid fa-plus" style="margin-right: 8px;"></i>
                    สร้างเว็บไซต์
                </a>
            </div>
        `;
    }
}

// Load Dashboard Data (Multi-Tenant)
async function loadDashboardData(websiteId) {
    try {
        // แสดง Welcome Banner ถ้าเพิ่งสร้าง (check URL param ?new=true)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('new') === 'true' && elements.welcomeBanner) {
            elements.welcomeBanner.style.display = 'block';
            // ลบ param ออกจาก URL โดยไม่ reload
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        // Load Website Info
        loadWebsiteInfo(websiteId);
        
        // Load Stats (Realtime)
        loadStatsRealtime(websiteId);
        
        // Load Recent Orders
        loadRecentOrders(websiteId);
        
    } catch (err) {
        console.error('[Dashboard] Load data error:', err);
        showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    }
}

async function loadWebsiteInfo(websiteId) {
    try {
        const websiteDoc = await getDoc(doc(db, 'websites', websiteId));
        if (!websiteDoc.exists()) {
            showNoWebsiteState();
            return;
        }

        const data = websiteDoc.data();
        
        // Update UI
        if (elements.siteDomain) {
            const domain = data.subdomain ? `${data.subdomain}.panderx.xyz` : (data.domain || '-');
            elements.siteDomain.textContent = domain;
        }
        
        if (elements.sitePackage) {
            const packageNames = {
                'singularity_v1': 'Singularity V1',
                'singularity_v1_extended': 'Singularity V1 Extended'
            };
            elements.sitePackage.textContent = packageNames[data.plan] || data.plan || '-';
        }
        
        if (elements.siteExpiry && data.expiresAt) {
            const expiry = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
            elements.siteExpiry.textContent = expiry.toLocaleDateString('th-TH');
            
            // Calculate remaining days
            const now = new Date();
            const diff = expiry - now;
            const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
            
            if (elements.siteRemaining) {
                if (days > 0) {
                    elements.siteRemaining.textContent = `${days} วัน`;
                    elements.siteRemaining.style.color = days < 7 ? '#f59e0b' : '#1e293b';
                } else {
                    elements.siteRemaining.textContent = 'หมดอายุแล้ว';
                    elements.siteRemaining.style.color = '#ef4444';
                }
            }
        }
        
        // Status
        if (elements.siteStatus) {
            const status = data.status || 'active';
            const now = new Date();
            const isExpired = data.expiresAt && (data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt)) < now;
            
            if (isExpired) {
                elements.siteStatus.className = 'status-badge status-expired';
                elements.siteStatus.innerHTML = '<span style="width: 6px; height: 6px; background: #ef4444; border-radius: 50%;"></span> หมดอายุ';
            } else if (status === 'active') {
                elements.siteStatus.className = 'status-badge status-active';
                elements.siteStatus.innerHTML = '<span style="width: 6px; height: 6px; background: #22c55e; border-radius: 50%;"></span> ใช้งานได้';
            } else if (status === 'pending') {
                elements.siteStatus.className = 'status-badge status-pending';
                elements.siteStatus.innerHTML = '<span style="width: 6px; height: 6px; background: #f59e0b; border-radius: 50%;"></span> รออนุมัติ';
            } else {
                elements.siteStatus.className = 'status-badge status-suspended';
                elements.siteStatus.innerHTML = '<span style="width: 6px; height: 6px; background: #6b7280; border-radius: 50%;"></span> ระงับ';
            }
        }
        
    } catch (err) {
        console.error('[Dashboard] Website info error:', err);
    }
}

function loadStatsRealtime(websiteId) {
    // Products Count (Realtime)
    const productsQuery = query(
        collection(db, 'products'),
        where('websiteId', '==', websiteId)
    );
    
    const unsubProducts = onSnapshot(productsQuery, (snapshot) => {
        const count = snapshot.size;
        animateNumber(elements.statProducts, count);
    }, (err) => {
        console.error('[Dashboard] Products snapshot error:', err);
    });
    
    unsubscribers.push(unsubProducts);
    
    // Today's Orders & Revenue
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);
    
    const ordersQuery = query(
        collection(db, 'orders'),
        where('websiteId', '==', websiteId),
        where('createdAt', '>=', todayTimestamp)
    );
    
    const unsubOrders = onSnapshot(ordersQuery, (snapshot) => {
        let count = 0;
        let revenue = 0;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            count++;
            revenue += data.totalAmount ?? 0;
        });
        
        animateNumber(elements.statOrdersToday, count);
        animateNumber(elements.statRevenueToday, revenue, true); // true = format as currency
    }, (err) => {
        console.error('[Dashboard] Orders snapshot error:', err);
    });
    
    unsubscribers.push(unsubOrders);
    
    // Unique Customers (simplified - count unique userIds from orders)
    const customersQuery = query(
        collection(db, 'orders'),
        where('websiteId', '==', websiteId)
    );
    
    const unsubCustomers = onSnapshot(customersQuery, (snapshot) => {
        const uniqueUsers = new Set();
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.userId) uniqueUsers.add(data.userId);
        });
        animateNumber(elements.statCustomers, uniqueUsers.size);
    }, (err) => {
        console.error('[Dashboard] Customers snapshot error:', err);
    });
    
    unsubscribers.push(unsubCustomers);
}

async function loadRecentOrders(websiteId) {
    try {
        const q = query(
            collection(db, 'orders'),
            where('websiteId', '==', websiteId),
            orderBy('createdAt', 'desc'),
            limit(5)
        );
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            if (elements.recentOrdersList) {
                elements.recentOrdersList.innerHTML = `
                    <div class="empty-state">
                        <i class="fa-solid fa-inbox" style="font-size: 2rem; color: #cbd5e1; margin-bottom: 10px; display: block;"></i>
                        <p style="font-weight: 600; color: #64748b;">ยังไม่มีคำสั่งซื้อ</p>
                        <p style="font-size: 0.85rem;">ออเดอร์จะปรากฏที่นี่เมื่อมีลูกค้าสั่งซื้อ</p>
                    </div>
                `;
            }
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const date = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            const dateStr = date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
            
            const status = data.status || 'pending';
            const statusClass = {
                'completed': 'status-completed',
                'pending': 'status-pending',
                'processing': 'status-processing'
            }[status] || 'status-pending';
            
            const statusText = {
                'completed': 'สำเร็จ',
                'pending': 'รอดำเนินการ',
                'processing': 'กำลังดำเนินการ'
            }[status] || status;
            
            html += `
                <div class="order-item ${statusClass}">
                    <div class="order-info">
                        <div class="order-icon">
                            <i class="fa-solid fa-bag-shopping"></i>
                        </div>
                        <div class="order-details">
                            <h4>${escapeHtml(data.productName || 'สินค้า')}</h4>
                            <p>${escapeHtml(data.customerName || 'ลูกค้า')} • ${dateStr} • <span style="color: ${status === 'completed' ? '#10b981' : '#f59e0b'}">${statusText}</span></p>
                        </div>
                    </div>
                    <div class="order-amount">${Number(data.totalAmount ?? 0).toLocaleString('th-TH')} ฿</div>
                </div>
            `;
        });
        
        if (elements.recentOrdersList) {
            elements.recentOrdersList.innerHTML = html;
        }
        
    } catch (err) {
        console.error('[Dashboard] Recent orders error:', err);
        if (elements.recentOrdersList) {
            elements.recentOrdersList.innerHTML = `
                <div class="empty-state" style="color: #ef4444;">
                    <i class="fa-solid fa-circle-exclamation" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                    <p>เกิดข้อผิดพลาดในการโหลดออเดอร์</p>
                </div>
            `;
        }
    }
}

// Helper Functions
function updateName(name) {
    const clean = (name || 'ผู้ใช้').trim();
    const letter = clean.charAt(0).toUpperCase();
    
    ['displayName', 'dropdownName', 'sidebarUsername'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = clean;
    });
    
    ['userAvatar', 'dropdownAvatar', 'sidebarAvatar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = letter;
    });
}

function updateBalance(raw) {
    const fmt = Number(raw ?? 0).toLocaleString('th-TH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    ['userBalance', 'dropdownBalance', 'sidebarBalance'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = fmt;
    });
}

function animateNumber(element, target, isCurrency = false) {
    if (!element) return;
    const t = Number(target) || 0;
    if (!t) {
        element.textContent = isCurrency ? '0.00' : '0';
        return;
    }
    
    const start = performance.now();
    const duration = 900;
    const startVal = 0;
    
    function step(now) {
        const p = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - p, 3); // ease-out cubic
        const current = Math.round(startVal + (t - startVal) * ease);
        
        if (isCurrency) {
            element.textContent = current.toLocaleString('th-TH', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        } else {
            element.textContent = current.toLocaleString('th-TH');
        }
        
        if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function escapeHtml(text) {
    if (typeof text !== 'string') return String(text ?? '');
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function showToast(msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    t.style.cssText = `
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#0ea5e9'};
        color: white;
        padding: 12px 20px;
        border-radius: 10px;
        margin-bottom: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 0.9rem;
        opacity: 0;
        transform: translateY(-10px);
        transition: all 0.3s ease;
    `;
    
    c.appendChild(t);
    requestAnimationFrame(() => {
        t.style.opacity = '1';
        t.style.transform = 'translateY(0)';
    });
    
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateY(-10px)';
        setTimeout(() => t.remove(), 300);
    }, 3200);
}

async function loadSiteIdentity() {
    try {
        const snap = await getDoc(doc(db, 'system', 'site_settings'));
        if (!snap.exists()) return;
        
        const data = snap.data();
        const name = data.siteName || 'PanderX';
        const letter = name.charAt(0).toUpperCase();
        
        ['navbarBrand', 'sidebarSiteName'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = name;
        });
        
        const si = document.getElementById('sidebarLogoIcon');
        if (si) si.textContent = letter;
        
        const ft = document.getElementById('siteFooterText');
        if (ft) ft.textContent = `© ${new Date().getFullYear()} ${name}`;
        
        document.title = `แดชบอร์ด | ${name}`;
    } catch (e) {
        console.error('[Dashboard] Site identity error:', e);
    }
}

// Global Functions (สำหรับ onclick)
window.toggleSidebar = function(e) {
    if (e) e.stopPropagation();
    const drawer = document.getElementById('sidebarDrawer');
    const overlay = document.getElementById('sidebarOverlay');
    const btn = document.getElementById('hamburgerBtn');
    
    const isOpen = drawer?.classList.toggle('open');
    overlay?.classList.toggle('open', isOpen);
    btn?.classList.toggle('active', isOpen);
    btn?.setAttribute('aria-expanded', String(isOpen));
    document.body.style.overflow = isOpen ? 'hidden' : '';
};

window.closeSidebar = function() {
    const drawer = document.getElementById('sidebarDrawer');
    const overlay = document.getElementById('sidebarOverlay');
    const btn = document.getElementById('hamburgerBtn');
    
    drawer?.classList.remove('open');
    overlay?.classList.remove('open');
    btn?.classList.remove('active');
    btn?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
};

window.toggleProfileDropdown = function(e) {
    e?.stopPropagation();
    const dd = document.getElementById('profileDropdown');
    dd?.classList.toggle('active');
};

window.handleLogout = async function() {
    try {
        // Cleanup subscriptions
        unsubscribers.forEach(unsub => unsub());
        unsubscribers = [];
        await signOut(auth);
    } catch (e) {
        console.error('[Dashboard] Logout error:', e);
    }
    location.href = './login.html';
};

window.handleMenuClick = function(page) {
    if (page === 'admin') {
        location.href = './admin.html';
    }
};

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    unsubscribers.forEach(unsub => unsub());
});

// Start
init();
