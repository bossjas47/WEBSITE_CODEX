/**
 * Settings Page UI Handlers
 * Handles all UI interactions and DOM manipulation for settings page
 */

// ============================================
// Utility Functions
// ============================================

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const colors = { success: '#10b981', error: '#ef4444', info: '#38bdf8', warning: '#f59e0b' };
    const color = colors[type] || colors.info;
    const icon = icons[type] || icons.info;
    
    toast.innerHTML = `<span style="color:${color};font-weight:bold;font-size:1.1rem;">${escapeHtml(icon)}</span><span style="color:#1e293b;font-weight:500;">${escapeHtml(msg)}</span>`;
    container.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// ============================================
// Sidebar Management
// ============================================

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
// Dropdown Management
// ============================================

window.toggleProfileDropdown = function(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('profileDropdown');
    if (!dropdown) return;
    dropdown.classList.toggle('active');
};

window.toggleDropdown = window.toggleProfileDropdown;

// ============================================
// Navigation Functions
// ============================================

window.goToLogin = function() {
    window.location.href = './login.html';
};

window.goToRegister = function() {
    window.location.href = './register.html';
};

window.promptChangePassword = function() {
    window.location.href = './profile.html#changepass';
};

window.handleMenuClick = function(action) {
    switch(action) {
        case 'profile':
            window.location.href = './profile.html';
            break;
        case 'orders':
            window.location.href = './orders.html';
            break;
        case 'topup':
            window.location.href = './topup.html';
            break;
        case 'settings':
            window.location.href = './settings.html';
            break;
    }
};

// ============================================
// Notification Preferences
// ============================================

window.saveNotifPref = function() {
    try {
        const prefs = {
            orders: document.getElementById('notifOrders')?.checked ?? false,
            promo: document.getElementById('notifPromo')?.checked ?? false
        };
        localStorage.setItem('px_notif', JSON.stringify(prefs));
        showToast('บันทึกการตั้งค่าแล้ว', 'success');
    } catch (e) {
        console.error('Error saving notification preferences:', e);
        showToast('ไม่สามารถบันทึกการตั้งค่าได้', 'error');
    }
};

function loadNotifPreferences() {
    try {
        const stored = localStorage.getItem('px_notif');
        if (!stored) return;
        
        const prefs = JSON.parse(stored);
        const ordersCheckbox = document.getElementById('notifOrders');
        const promoCheckbox = document.getElementById('notifPromo');
        
        if (ordersCheckbox && prefs.orders !== undefined) {
            ordersCheckbox.checked = prefs.orders;
        }
        if (promoCheckbox && prefs.promo !== undefined) {
            promoCheckbox.checked = prefs.promo;
        }
    } catch (e) {
        console.error('Error loading notification preferences:', e);
    }
}

// ============================================
// Event Listeners Setup
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Load saved notification preferences
    loadNotifPreferences();
    
    // Setup notification preference change listeners
    const notifOrders = document.getElementById('notifOrders');
    const notifPromo = document.getElementById('notifPromo');
    
    if (notifOrders) {
        notifOrders.addEventListener('change', saveNotifPref);
    }
    if (notifPromo) {
        notifPromo.addEventListener('change', saveNotifPref);
    }
    
    // Setup logout button listener
    const logoutRow = document.querySelector('.settings-row-logout');
    if (logoutRow) {
        logoutRow.addEventListener('click', window.handleLogout);
    }
    
    // Close dropdown when clicking outside
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
    
    // Close sidebar and dropdown on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSidebar();
            const dropdown = document.getElementById('profileDropdown');
            if (dropdown) dropdown.classList.remove('active');
        }
    });
});

// Make showToast globally available
window.showToast = showToast;
