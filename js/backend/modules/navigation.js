// ==================== Tab Switching ====================
function switchTab(tabName, element) {
    // Check permission for the tab
    const requiredPerm = element?.getAttribute('data-perm');
    if (requiredPerm && !hasPermission(requiredPerm)) {
        showToast('คุณไม่มีสิทธิ์เข้าถึงหน้านี้', 'error');
        return;
    }
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');
    
    document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
    
    const targetSection = document.getElementById(tabName);
    if (targetSection) targetSection.classList.add('active');
    
    const titles = {
        dashboard: 'ภาพรวมระบบ',
        users: 'จัดการผู้ใช้',
        orders: 'รายการคำสั่งซื้อ',
        topup: 'จัดการเติมเงิน',
        'special-currency': 'จัดการสกุลเงินพิเศษ',
        payments: 'ช่องทางชำระเงิน',
        products: 'จัดการสินค้า',
        roles: 'จัดการยศและสิทธิ์',

        'site-settings': 'จัดการทั่วไป & SEO',
        'fake-stats': 'ข้อมูล Fake / Display Stats',
        settings: 'ความปลอดภัย'
    };
    
    const icons = {
        dashboard: 'chart-pie',
        users: 'users',
        orders: 'shopping-cart',
        topup: 'money-bill-transfer',
        'special-currency': 'coins',
        payments: 'credit-card',
        products: 'box',
        roles: 'user-shield',

        'site-settings': 'globe',
        'fake-stats': 'wand-magic-sparkles',
        settings: 'lock'
    };
    
    const titleElement = document.getElementById('pageTitle');
    if (titleElement) {
        titleElement.innerHTML = `<i class="fa-solid ${icons[tabName]} mr-3"></i>${titles[tabName] || 'ไม่ระบุ'}`;
    }
    
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    document.getElementById('sidebarOverlay')?.classList.remove('active');
    
    if (tabName === 'dashboard') setTimeout(() => loadDashboard(), 100);
    if (tabName === 'users') setTimeout(() => loadUsers(), 100);
    if (tabName === 'orders') setTimeout(() => loadOrders(), 100);
    if (tabName === 'topup') setTimeout(() => loadTopupRequests(), 100);
    if (tabName === 'special-currency') setTimeout(() => loadSpecialCurrencies(), 100);
    if (tabName === 'payments') setTimeout(() => loadPaymentMethods(), 100);
    if (tabName === 'roles') setTimeout(() => renderRoles(), 100);
    if (tabName === 'products') setTimeout(() => loadProducts(), 100);
    if (tabName === 'site-settings')  setTimeout(() => loadSiteSettings(), 100);
    if (tabName === 'redeem-codes')   setTimeout(() => loadRedeemCodes(), 100);
    if (tabName === 'topup')          { setTimeout(() => loadTopupRequests(), 100); setTimeout(() => loadFeeSettings(), 200); }
    if (tabName === 'fake-stats') setTimeout(() => loadFakeStats(), 100);
}

// ==================== Nav Group Toggle ====================
function toggleNavGroup(groupId, headerEl) {
    const body = document.getElementById(groupId);
    if (!body) return;
    const isCollapsed = body.classList.contains('collapsed');
    body.classList.toggle('collapsed', !isCollapsed);
    headerEl.classList.toggle('collapsed', !isCollapsed);
}

// ==================== THEME SYSTEM ====================

