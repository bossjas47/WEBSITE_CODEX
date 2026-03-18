// app.js
// Main Application Entry Point - Multi-Tenant Ready
// ใช้ร่วมกับ firebase-config.js (Multi-Tenant Version)

import { 
    setupTenantAuthListener, 
    getCurrentTenant,
    isTenantAdmin,
    isTenantStaff,
    logoutTenant,
    applyTheme,
    checkMaintenanceMode,
    COLLECTIONS
} from './firebase-config.js';

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL STATE
// ═══════════════════════════════════════════════════════════════════════════════
const AppState = {
    user: null,
    tenant: null,
    isLoading: true,
    error: null
};

// ═══════════════════════════════════════════════════════════════════════════════
// DOM ELEMENTS (ตัวอย่างสำหรับหน้าเว็บทั่วไป)
// ═══════════════════════════════════════════════════════════════════════════════
const elements = {
    appContainer: document.getElementById('app'),
    loadingScreen: document.getElementById('loading-screen'),
    loginScreen: document.getElementById('login-screen'),
    mainContent: document.getElementById('main-content'),
    adminNav: document.getElementById('admin-nav'),
    userNav: document.getElementById('user-nav'),
    errorMessage: document.getElementById('error-message'),
    tenantName: document.getElementById('tenant-name'),
    userDisplayName: document.getElementById('user-name'),
    logoutBtn: document.getElementById('logout-btn')
};

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALIZATION (เรียกครั้งเดียวตอนโหลดหน้า)
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 App Initializing...');
    
    // ตรวจสอบ Maintenance Mode ก่อน
    const isMaintenance = await checkMaintenanceMode();
    if (isMaintenance && !window.location.pathname.includes('maintenance')) {
        window.location.href = '/maintenance.html';
        return;
    }
    
    // เริ่มต้น Auth Listener (จะคอยดักจับ Login/Logout ตลอดเวลา)
    initAuth();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION & TENANT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════
function initAuth() {
    // 🔥 ใช้ setupTenantAuthListener แทน onAuthStateChanged ธรรมดา
    // ฟังก์ชันนี้จะจัดการ initTenant ให้อัตโนมัติ
    const unsubscribe = setupTenantAuthListener(
        // ✅ Callback เมื่อสถานะพร้อม (มีข้อมูลครบทั้ง User และ Tenant)
        async ({ user, tenant }) => {
            AppState.user = user;
            AppState.tenant = tenant;
            AppState.isLoading = false;
            
            if (user) {
                console.log('✅ Auth Ready:', user.email);
                console.log('🏢 Tenant Ready:', tenant);
                
                // โหลดธีมและตั้งค่าเฉพาะ Tenant
                await loadTenantConfig();
                
                // แสดง UI ตามสิทธิ์
                renderApp();
            } else {
                console.log('👋 No user logged in');
                showLoginScreen();
            }
        },
        // ❌ Callback เมื่อเกิด Error (เช่น Claims ไม่พร้อม)
        (error) => {
            console.error('❌ Auth Error:', error);
            AppState.error = error.message;
            AppState.isLoading = false;
            showError(error.message);
        }
    );
    
    // Cleanup เมื่อปิดหน้า (ไม่จำเป็นในหน้าเว็บธรรมดา แต่ดีต่อ Best Practice)
    window.addEventListener('beforeunload', () => {
        unsubscribe();
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TENANT CONFIGURATION LOADING
// ═══════════════════════════════════════════════════════════════════════════════
async function loadTenantConfig() {
    try {
        // โหลดธีมของ Tenant นี้ (จะดึงจาก websites/{websiteId}/settings/theme)
        await applyTheme();
        
        // อัปเดตชื่อ Tenant ใน UI
        if (elements.tenantName && AppState.tenant.websiteId) {
            elements.tenantName.textContent = AppState.tenant.websiteId;
            // หรือถ้ามีชื่อเว็บจริงๆ ให้ดึงจาก Firestore เพิ่ม
        }
        
    } catch (error) {
        console.error('Error loading tenant config:', error);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER FUNCTIONS (แสดงผลตามสถานะ)
// ═══════════════════════════════════════════════════════════════════════════════
function renderApp() {
    hideLoading();
    
    if (!AppState.user) {
        showLoginScreen();
        return;
    }
    
    // ตรวจสอบสิทธิ์และแสดงผลตาม Role
    if (isTenantAdmin()) {
        renderAdminDashboard();
    } else if (isTenantStaff()) {
        renderStaffDashboard();
    } else {
        renderCustomerView();
    }
    
    // อัปเดตข้อมูลผู้ใช้ใน UI
    updateUserUI();
}

function renderAdminDashboard() {
    console.log('👑 Rendering Admin Dashboard');
    
    // ซ่อนหน้า Login
    if (elements.loginScreen) elements.loginScreen.style.display = 'none';
    if (elements.mainContent) elements.mainContent.style.display = 'block';
    
    // แสดงเมนู Admin
    if (elements.adminNav) elements.adminNav.style.display = 'block';
    if (elements.userNav) elements.userNav.style.display = 'none';
    
    // โหลดข้อมูลสถิติ (ตัวอย่าง)
    loadAdminStats();
    
    // เปลี่ยน URL ไปหน้า Admin (ถ้าต้องการ)
    if (!window.location.pathname.includes('admin')) {
        // history.pushState({}, '', '/admin/dashboard.html');
    }
}

function renderStaffDashboard() {
    console.log('👔 Rendering Staff Dashboard');
    
    if (elements.loginScreen) elements.loginScreen.style.display = 'none';
    if (elements.mainContent) elements.mainContent.style.display = 'block';
    
    // Staff เห็นเมนูจำกัด
    if (elements.adminNav) elements.adminNav.style.display = 'none';
    if (elements.userNav) elements.userNav.style.display = 'block';
    
    // โหลดข้อมูลออเดอร์ (ตัวอย่าง)
    loadOrdersList();
}

function renderCustomerView() {
    console.log('🛒 Rendering Customer View');
    
    if (elements.loginScreen) elements.loginScreen.style.display = 'none';
    if (elements.mainContent) elements.mainContent.style.display = 'block';
    
    // ลูกค้าไม่เห็นเมนูจัดการ
    if (elements.adminNav) elements.adminNav.style.display = 'none';
    if (elements.userNav) elements.userNav.style.display = 'block';
    
    // โหลดสินค้า (ตัวอย่าง)
    loadProducts();
}

function showLoginScreen() {
    console.log('🔐 Showing Login Screen');
    
    if (elements.loadingScreen) elements.loadingScreen.style.display = 'none';
    if (elements.mainContent) elements.mainContent.style.display = 'none';
    if (elements.loginScreen) {
        elements.loginScreen.style.display = 'flex';
        // หรือ 'block' ตาม CSS ที่ใช้
    }
}

function showLoading() {
    if (elements.loadingScreen) elements.loadingScreen.style.display = 'flex';
    if (elements.loginScreen) elements.loginScreen.style.display = 'none';
    if (elements.mainContent) elements.mainContent.style.display = 'none';
}

function hideLoading() {
    if (elements.loadingScreen) elements.loadingScreen.style.display = 'none';
}

function showError(message) {
    console.error('App Error:', message);
    if (elements.errorMessage) {
        elements.errorMessage.textContent = message;
        elements.errorMessage.style.display = 'block';
    }
    
    // ถ้าเป็นเรื่อง Claims ไม่พร้อม ให้แสดงปุ่ม Retry
    if (message.includes('tenant') || message.includes('Claims')) {
        showRetryButton();
    }
}

function showRetryButton() {
    const retryBtn = document.createElement('button');
    retryBtn.textContent = '🔄 ลองใหม่';
    retryBtn.onclick = () => location.reload();
    retryBtn.style.cssText = 'padding:10px 20px;margin-top:10px;cursor:pointer;';
    
    if (elements.errorMessage) {
        elements.errorMessage.appendChild(document.createElement('br'));
        elements.errorMessage.appendChild(retryBtn);
    }
}

function updateUserUI() {
    if (elements.userDisplayName && AppState.user) {
        elements.userDisplayName.textContent = AppState.user.displayName || AppState.user.email;
    }
    
    // ตั้งค่าปุ่ม Logout
    if (elements.logoutBtn) {
        elements.logoutBtn.onclick = handleLogout;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA LOADING FUNCTIONS (ตัวอย่างการใช้งานจริง)
// ═══════════════════════════════════════════════════════════════════════════════
import { 
    getTenantQuery, 
    getDashboardStats,
    subscribeOrders 
} from './firebase-config.js';
import { getDocs, onSnapshot, orderBy, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

async function loadAdminStats() {
    try {
        const stats = await getDashboardStats();
        console.log('📊 Stats:', stats);
        
        // อัปเดต UI ด้วยข้อมูลสถิติ
        document.getElementById('stat-users').textContent = stats.totalUsers;
        document.getElementById('stat-orders').textContent = stats.totalOrders;
        document.getElementById('stat-revenue').textContent = stats.totalRevenue.toLocaleString();
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

function loadOrdersList() {
    // 🔥 ใช้ getTenantQuery แทน query ธรรมดา
    const q = getTenantQuery(COLLECTIONS.ORDERS, orderBy('createdAt', 'desc'));
    
    // Real-time listener
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const orders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log('📦 Orders loaded:', orders.length);
        renderOrdersTable(orders);
    });
    
    // เก็บ unsubscribe ไว้ cleanup ถ้าต้องการ
    window.currentUnsubscribes = window.currentUnsubscribes || [];
    window.currentUnsubscribes.push(unsubscribe);
}

async function loadProducts() {
    try {
        const q = getTenantQuery(COLLECTIONS.PRODUCTS, where('status', '==', 'active'));
        const snapshot = await getDocs(q);
        const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        console.log('🛍️ Products:', products);
        renderProductGrid(products);
        
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════
async function handleLogout() {
    try {
        await logoutTenant();
        console.log('👋 Logged out successfully');
        
        // Redirect ไปหน้า Login (ถ้าต้องการ)
        // window.location.href = '/login.html';
        
    } catch (error) {
        console.error('Logout error:', error);
        alert('ไม่สามารถออกจากระบบได้ กรุณาลองใหม่');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (ตัวอย่างการ Render UI)
// ═══════════════════════════════════════════════════════════════════════════════
function renderOrdersTable(orders) {
    const container = document.getElementById('orders-table');
    if (!container) return;
    
    container.innerHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${orders.map(order => `
                    <tr>
                        <td>${order.id}</td>
                        <td>${order.customerName || 'N/A'}</td>
                        <td>${order.amount?.toLocaleString() || 0}</td>
                        <td><span class="badge badge-${order.status}">${order.status}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderProductGrid(products) {
    const container = document.getElementById('products-grid');
    if (!container) return;
    
    container.innerHTML = products.map(product => `
        <div class="product-card">
            <img src="${product.imageUrl || '/placeholder.jpg'}" alt="${product.name}">
            <h3>${product.name}</h3>
            <p class="price">฿${product.price?.toLocaleString()}</p>
            <button onclick="addToCart('${product.id}')">Add to Cart</button>
        </div>
    `).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING & RETRY LOGIC
// ═══════════════════════════════════════════════════════════════════════════════
window.addEventListener('error', (e) => {
    console.error('Global Error:', e.error);
    if (e.error && e.error.message && e.error.message.includes('permission-denied')) {
        showError('สิทธิ์การเข้าถึงถูกปฏิเสธ กรุณาเข้าสู่ระบบใหม่');
    }
});

// Export สำหรับใช้ในไฟล์อื่น (ถ้าต้องการ)
export { AppState, handleLogout };
