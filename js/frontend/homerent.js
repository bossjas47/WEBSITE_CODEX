// ==========================================
// homerent.js — Dashboard (Fixed Filter/Columns UI)
// ==========================================

import { auth, db } from '../firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    doc, onSnapshot, getDoc, setDoc, serverTimestamp,
    collection, query, where, getDocs, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── Debug ────────────────────────────────────────────────────────────────────
const DEBUG = true;
const log = (...args) => DEBUG && console.log('[homerent]', ...args);

// ── State ─────────────────────────────────────────────────────────────────────
let currentUser = null;
let currentUserData = {};
let balanceUnsub = null;
let isDropdownOpen = false;
let lastToggleTime = 0;
let currentWebsiteId = null;
let dataLoaded = false;
let activePanel = null; // 'filter', 'column', or null

// Filter & Column State
let activeFilters = { status: 'all', package: 'all', dateRange: 'all' };
let visibleColumns = {
    status: true, name: true, package: true, 
    price: true, expiry: true, action: true 
};

let allWebsites = [];
let filteredWebsites = [];
const PAGE_SIZE = 10;
let currentPage = 1;
let searchDebounceTimer = null;

// ── Utility ──────────────────────────────────────────────────────────────────
function escapeHtml(text) {
    if (typeof text !== 'string') return String(text ?? '');
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function toMs(val) {
    if (!val) return 0;
    if (typeof val.toDate === 'function') return val.toDate().getTime();
    if (val instanceof Date) return val.getTime();
    if (typeof val === 'number') return val;
    return 0;
}

function getSiteStatus(site) {
    const ms = toMs(site.expiresAt);
    return (ms > Date.now() && site.status !== 'suspended') ? 'active' : 'expired';
}

function detectWebsiteId() {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === 'panderx.xyz') return null;
    const parts = hostname.split('.');
    if (parts.length >= 3 && parts[parts.length-2] === 'panderx') return parts[0];
    return null;
}

// ── Loading Control (FIXED) ──────────────────────────────────────────────────
function clearTable() {
    const tbody = document.getElementById('shopTableBody');
    if (tbody) tbody.innerHTML = '';
}

function showLoading() {
    clearTable();
    const tbody = document.getElementById('shopTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr><td colspan="6" style="text-align:center;padding:60px 20px;color:#64748b;">
                <div style="width:32px;height:32px;border:3px solid #e2e8f0;border-top-color:#38bdf8;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 12px;"></div>
                <p>กำลังโหลดข้อมูล...</p>
                <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
            </td></tr>`;
    }
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.style.display = 'none';
}

function showEmpty(msg = 'ยังไม่มีเว็บไซต์') {
    clearTable();
    const emptyState = document.getElementById('emptyState');
    if (emptyState) {
        emptyState.style.display = 'block';
        emptyState.innerHTML = `
            <i class="fa-solid fa-inbox" style="font-size:3rem;color:#cbd5e1;margin-bottom:16px;display:block;"></i>
            <p style="font-weight:600;color:#64748b;margin-bottom:8px;">${escapeHtml(msg)}</p>
            <button class="btn-action btn-black" onclick="location.href='./rent-website.html'" style="margin-top:16px;padding:12px 24px;border:none;border-radius:100px;background:linear-gradient(135deg,#38bdf8,#818cf8);color:white;font-family:Prompt;cursor:pointer;">
                <i class="fa-solid fa-plus"></i> สร้างเว็บไซต์
            </button>`;
    }
    updatePagination(0);
}

function showError(msg) {
    clearTable();
    const tbody = document.getElementById('shopTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr><td colspan="6" style="text-align:center;padding:40px;color:#ef4444;">
                <i class="fa-solid fa-circle-exclamation" style="font-size:2rem;margin-bottom:12px;display:block;"></i>
                <p style="font-weight:600;margin-bottom:12px;">${escapeHtml(msg)}</p>
                <button onclick="location.reload()" style="padding:10px 24px;background:#ef4444;color:white;border:none;border-radius:8px;cursor:pointer;font-family:Prompt;">
                    <i class="fa-solid fa-rotate-right"></i> โหลดใหม่
                </button>
            </td></tr>`;
    }
    showToast(msg, 'error');
}

// ── Toast ────────────────────────────────────────────────────────────────────
window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    while (container.children.length > 3) container.removeChild(container.firstChild);
    
    const colors = { success: '#10b981', error: '#ef4444', info: '#38bdf8', warning: '#f59e0b' };
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        background:white;padding:12px 20px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.15);
        display:flex;align-items:center;gap:10px;min-width:280px;
        transform:translateX(400px);opacity:0;transition:all 0.3s ease;
        border-left:4px solid ${colors[type]};margin-bottom:8px;z-index:9999;position:relative;
    `;
    toast.innerHTML = `
        <span style="color:${colors[type]};font-weight:bold;font-size:18px;">${icons[type]}</span>
        <span style="font-weight:500;color:#1e293b;">${escapeHtml(message)}</span>
    `;
    
    container.appendChild(toast);
    void toast.offsetWidth;
    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
    });
    setTimeout(() => {
        toast.style.transform = 'translateX(400px)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// ── Filter Panel (FIXED Z-INDEX & POSITION) ─────────────────────────────────
function createOverlay() {
    if (document.getElementById('panelOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'panelOverlay';
    overlay.style.cssText = `
        position:fixed;top:0;left:0;right:0;bottom:0;
        background:rgba(0,0,0,0.3);z-index:998;opacity:0;visibility:hidden;
        transition:all 0.3s ease;
    `;
    overlay.onclick = closeAllPanels;
    document.body.appendChild(overlay);
}

function showOverlay() {
    createOverlay();
    const overlay = document.getElementById('panelOverlay');
    overlay.style.opacity = '1';
    overlay.style.visibility = 'visible';
}

function hideOverlay() {
    const overlay = document.getElementById('panelOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.visibility = 'hidden';
    }
}

function closeAllPanels() {
    document.getElementById('filterPanel')?.classList.remove('active');
    document.getElementById('columnPanel')?.classList.remove('active');
    hideOverlay();
    activePanel = null;
}

window.toggleFilterPanel = function() {
    const panel = document.getElementById('filterPanel');
    
    if (activePanel === 'filter') {
        closeAllPanels();
        return;
    }
    
    closeAllPanels(); // Close others first
    
    if (!panel) {
        createFilterPanel();
        populateFilterOptions();
    }
    
    document.getElementById('filterPanel').classList.add('active');
    showOverlay();
    activePanel = 'filter';
};

function createFilterPanel() {
    const div = document.createElement('div');
    div.id = 'filterPanel';
    div.style.cssText = `
        position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.9);
        width:90%;max-width:320px;background:white;border-radius:20px;
        box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);z-index:999;
        opacity:0;visibility:hidden;transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
        max-height:80vh;overflow-y:auto;
    `;
    
    div.innerHTML = `
        <div style="padding:20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="margin:0;font-size:1.1rem;color:#1e293b;font-weight:600;">
                    <i class="fa-solid fa-filter" style="margin-right:8px;color:#38bdf8;"></i>ตัวกรอง
                </h3>
                <button onclick="window.toggleFilterPanel()" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:1.2rem;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
            
            <div style="margin-bottom:16px;">
                <label style="display:block;font-size:0.85rem;color:#64748b;margin-bottom:8px;font-weight:500;">สถานะ</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button onclick="window.setFilter('status','all')" id="f-status-all" style="flex:1;padding:8px 12px;border:2px solid #e2e8f0;background:white;border-radius:10px;font-family:Prompt;cursor:pointer;font-size:0.85rem;color:#475569;transition:all 0.2s;">ทั้งหมด</button>
                    <button onclick="window.setFilter('status','active')" id="f-status-active" style="flex:1;padding:8px 12px;border:2px solid #e2e8f0;background:white;border-radius:10px;font-family:Prompt;cursor:pointer;font-size:0.85rem;color:#475569;transition:all 0.2s;">ใช้งานอยู่</button>
                    <button onclick="window.setFilter('status','expired')" id="f-status-expired" style="flex:1;padding:8px 12px;border:2px solid #e2e8f0;background:white;border-radius:10px;font-family:Prompt;cursor:pointer;font-size:0.85rem;color:#475569;transition:all 0.2s;">หมดอายุ</button>
                </div>
            </div>
            
            <div style="margin-bottom:16px;">
                <label style="display:block;font-size:0.85rem;color:#64748b;margin-bottom:8px;font-weight:500;">แพ็คเกจ</label>
                <select id="filterPackageSelect" onchange="window.setFilter('package',this.value)" style="width:100%;padding:10px 12px;border:2px solid #e2e8f0;border-radius:10px;font-family:Prompt;background:white;font-size:0.9rem;color:#1e293b;outline:none;">
                    <option value="all">ทั้งหมด</option>
                </select>
            </div>
            
            <div style="margin-bottom:20px;">
                <label style="display:block;font-size:0.85rem;color:#64748b;margin-bottom:8px;font-weight:500;">วันหมดอายุ</label>
                <select id="filterDateSelect" onchange="window.setFilter('dateRange',this.value)" style="width:100%;padding:10px 12px;border:2px solid #e2e8f0;border-radius:10px;font-family:Prompt;background:white;font-size:0.9rem;color:#1e293b;outline:none;">
                    <option value="all">ทั้งหมด</option>
                    <option value="expiring7">จะหมดอายุใน 7 วัน</option>
                    <option value="expiring30">จะหมดอายุใน 30 วัน</option>
                    <option value="expired">หมดอายุแล้ว</option>
                </select>
            </div>
            
            <div style="display:flex;gap:12px;">
                <button onclick="window.clearFilters()" style="flex:1;padding:12px;border:2px solid #e2e8f0;background:#f8fafc;color:#64748b;border-radius:12px;cursor:pointer;font-family:Prompt;font-weight:600;transition:all 0.2s;">ล้าง</button>
                <button onclick="window.applyFilters()" style="flex:2;padding:12px;border:none;background:linear-gradient(135deg,#38bdf8,#818cf8);color:white;border-radius:12px;cursor:pointer;font-family:Prompt;font-weight:600;box-shadow:0 4px 15px rgba(56,189,248,0.3);transition:all 0.2s;">ใช้งาน (${allWebsites.length})</button>
            </div>
        </div>
    `;
    
    // Add active state style
    const style = document.createElement('style');
    style.textContent = `
        #filterPanel.active { transform:translate(-50%,-50%) scale(1) !important; opacity:1 !important; visibility:visible !important; }
        .filter-btn-active { border-color:#38bdf8 !important; background:#e0f2fe !important; color:#0284c7 !important; }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(div);
}

function populateFilterOptions() {
    const select = document.getElementById('filterPackageSelect');
    if (!select || select.options.length > 1) return;
    
    const packages = [...new Set(allWebsites.map(w => w.packageName).filter(Boolean))];
    packages.forEach(pkg => {
        const opt = document.createElement('option');
        opt.value = pkg;
        opt.textContent = pkg;
        select.appendChild(opt);
    });
    
    // Set current values
    select.value = activeFilters.package;
    document.getElementById('filterDateSelect').value = activeFilters.dateRange;
    updateFilterButtons();
}

function updateFilterButtons() {
    ['all','active','expired'].forEach(status => {
        const btn = document.getElementById(`f-status-${status}`);
        if (btn) {
            if (activeFilters.status === status) {
                btn.classList.add('filter-btn-active');
                btn.style.borderColor = '#38bdf8';
                btn.style.background = '#e0f2fe';
                btn.style.color = '#0284c7';
            } else {
                btn.classList.remove('filter-btn-active');
                btn.style.borderColor = '#e2e8f0';
                btn.style.background = 'white';
                btn.style.color = '#475569';
            }
        }
    });
}

window.setFilter = function(type, value) {
    activeFilters[type] = value;
    if (type === 'status') updateFilterButtons();
};

window.applyFilters = function() {
    closeAllPanels();
    applySearchFilter();
    const count = filteredWebsites.length;
    showToast(`กรองข้อมูล: พบ ${count} รายการ`, 'info');
};

window.clearFilters = function() {
    activeFilters = { status: 'all', package: 'all', dateRange: 'all' };
    document.getElementById('filterPackageSelect').value = 'all';
    document.getElementById('filterDateSelect').value = 'all';
    updateFilterButtons();
    applyFilters();
};

// ── Column Panel (FIXED) ───────────────────────────────────────────────────
window.toggleColumnPanel = function() {
    const panel = document.getElementById('columnPanel');
    
    if (activePanel === 'column') {
        closeAllPanels();
        return;
    }
    
    closeAllPanels();
    
    if (!panel) createColumnPanel();
    document.getElementById('columnPanel').classList.add('active');
    showOverlay();
    activePanel = 'column';
};

function createColumnPanel() {
    const div = document.createElement('div');
    div.id = 'columnPanel';
    div.style.cssText = `
        position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.9);
        width:90%;max-width:280px;background:white;border-radius:20px;
        box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);z-index:999;
        opacity:0;visibility:hidden;transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
    `;
    
    const cols = [
        { key: 'status', label: 'สถานะ', icon: 'fa-circle-check' },
        { key: 'name', label: 'ชื่อร้านค้า', icon: 'fa-store' },
        { key: 'package', label: 'แพ็คเกจ', icon: 'fa-box' },
        { key: 'price', label: 'ราคา', icon: 'fa-tag' },
        { key: 'expiry', label: 'วันหมดอายุ', icon: 'fa-calendar' },
        { key: 'action', label: 'จัดการ', icon: 'fa-gear' }
    ];
    
    div.innerHTML = `
        <div style="padding:20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="margin:0;font-size:1.1rem;color:#1e293b;font-weight:600;">
                    <i class="fa-solid fa-eye" style="margin-right:8px;color:#38bdf8;"></i>แสดงคอลัมน์
                </h3>
                <button onclick="window.toggleColumnPanel()" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:1.2rem;width:32px;height:32px;border-radius:8px;">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
            <div style="space-y:8px;">
                ${cols.map(col => `
                    <label style="display:flex;align-items:center;padding:12px;border:2px solid ${visibleColumns[col.key] ? '#38bdf8' : '#e2e8f0'};border-radius:12px;margin-bottom:8px;cursor:pointer;background:${visibleColumns[col.key] ? '#e0f2fe' : 'white'};transition:all 0.2s;">
                        <input type="checkbox" ${visibleColumns[col.key] ? 'checked' : ''} onchange="window.toggleColumn('${col.key}')" style="margin-right:12px;width:18px;height:18px;accent-color:#38bdf8;">
                        <i class="fa-solid ${col.icon}" style="color:${visibleColumns[col.key] ? '#0284c7' : '#94a3b8'};margin-right:10px;width:20px;"></i>
                        <span style="color:${visibleColumns[col.key] ? '#1e293b' : '#64748b'};font-weight:500;">${col.label}</span>
                        ${visibleColumns[col.key] ? '<i class="fa-solid fa-check" style="margin-left:auto;color:#38bdf8;"></i>' : ''}
                    </label>
                `).join('')}
            </div>
            <button onclick="window.resetColumns()" style="width:100%;margin-top:12px;padding:10px;border:2px solid #e2e8f0;background:#f8fafc;color:#64748b;border-radius:12px;cursor:pointer;font-family:Prompt;">
                <i class="fa-solid fa-rotate-left"></i> รีเซ็ตค่าเริ่มต้น
            </button>
        </div>
    `;
    
    const style = document.createElement('style');
    style.textContent = `#columnPanel.active { transform:translate(-50%,-50%) scale(1) !important; opacity:1 !important; visibility:visible !important; }`;
    document.head.appendChild(style);
    
    document.body.appendChild(div);
}

window.toggleColumn = function(col) {
    visibleColumns[col] = !visibleColumns[col];
    
    // Ensure at least one column
    if (!Object.values(visibleColumns).some(v => v)) {
        visibleColumns.name = true;
        showToast('ต้องมีอย่างน้อย 1 คอลัมน์', 'warning');
    }
    
    // Recreate panel to update UI
    const old = document.getElementById('columnPanel');
    if (old) old.remove();
    createColumnPanel();
    document.getElementById('columnPanel').classList.add('active');
    
    renderTable();
    updateTableHeaders();
};

window.resetColumns = function() {
    visibleColumns = { status: true, name: true, package: true, price: true, expiry: true, action: true };
    const old = document.getElementById('columnPanel');
    if (old) old.remove();
    createColumnPanel();
    document.getElementById('columnPanel').classList.add('active');
    renderTable();
    updateTableHeaders();
    showToast('รีเซ็ตคอลัมน์แล้ว', 'success');
};

// ── Navigation & Auth ───────────────────────────────────────────────────────
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

window.toggleProfileDropdown = function(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    const now = Date.now();
    if (now - lastToggleTime < 150) return;
    lastToggleTime = now;

    const dropdown = document.getElementById('profileDropdown');
    if (!dropdown) return;

    isDropdownOpen = !isDropdownOpen;
    dropdown.classList.toggle('active', isDropdownOpen);
    
    if (isDropdownOpen) {
        dropdown.style.cssText = 'position:absolute;top:calc(100% + 10px);right:0;width:280px;background:white;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,0.15);z-index:200;transform:scale(1) translateY(0);opacity:1;visibility:visible;';
    } else {
        dropdown.style.cssText = 'position:absolute;top:calc(100% + 10px);right:0;width:280px;background:white;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,0.15);z-index:200;transform:scale(0.95) translateY(-10px);opacity:0;visibility:hidden;';
    }
};

window.handleLogout = async function() {
    try { await signOut(auth); showToast('ออกจากระบบสำเร็จ', 'success'); setTimeout(() => location.reload(), 800); }
    catch (err) { showToast('เกิดข้อผิดพลาด', 'error'); }
};

window.handleMenuClick = function(page) {
    const routes = { profile: './profile.html', orders: './orders.html', topup: './topup.html', settings: './settings.html' };
    if (routes[page]) window.location.href = routes[page];
};

function updateUserUI(user, data) {
    const name = data?.displayName || user?.displayName || user?.email?.split('@')[0] || 'ผู้ใช้';
    const balance = data?.balance ?? 0;
    const fmt = Number(balance).toLocaleString('th-TH', {minimumFractionDigits:2});
    
    document.getElementById('loginBtn') && (document.getElementById('loginBtn').style.display = 'none');
    document.getElementById('userProfile') && (document.getElementById('userProfile').style.display = 'flex');
    document.getElementById('sidebarGuest') && (document.getElementById('sidebarGuest').style.display = 'none');
    document.getElementById('sidebarUser') && (document.getElementById('sidebarUser').style.display = 'block');
    document.getElementById('sidebarUserStrip') && (document.getElementById('sidebarUserStrip').style.display = 'flex');
    
    const clean = name.trim();
    const initial = clean.charAt(0).toUpperCase();
    ['dropdownName','sidebarUsername'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = clean;
    });
    ['userAvatar','dropdownAvatar','sidebarAvatar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = initial;
    });
    ['userBalance','sidebarBalance'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = fmt;
    });
    const ddBal = document.getElementById('dropdownBalance');
    if (ddBal) ddBal.textContent = fmt + ' ฿';
    
    const role = String(data?.role || '').toLowerCase();
    if (['admin','super_admin','owner'].includes(role)) {
        const btn = document.getElementById('adminPanelBtn');
        if (btn) { btn.style.display = 'flex'; btn.classList.add('show'); }
    }
}

// ── Data Loading ─────────────────────────────────────────────────────────────
async function loadWebsites(uid) {
    log('Loading for:', uid);
    showLoading();
    
    const timeout = setTimeout(() => {
        if (!dataLoaded) showError('โหลดข้อมูลล้มเหลว (timeout)');
    }, 10000);
    
    try {
        const q = query(collection(db, 'websites'), where('ownerId', '==', uid), limit(100));
        const snap = await getDocs(q);
        clearTimeout(timeout);
        
        dataLoaded = true;
        allWebsites = snap.docs.map(d => ({id:d.id, ...d.data(), latestPrice: d.data().price}));
        
        allWebsites.sort((a,b) => {
            const now = Date.now();
            const expA = toMs(a.expiresAt);
            const expB = toMs(b.expiresAt);
            return (expB > now) - (expA > now) || expA - expB;
        });
        
        if (allWebsites.length === 0) {
            showEmpty();
        } else {
            clearTable();
            applySearchFilter();
        }
    } catch(err) {
        clearTimeout(timeout);
        showError('โหลดไม่สำเร็จ: ' + err.message);
    }
}

// ── Filter Logic ─────────────────────────────────────────────────────────────
function applySearchFilter() {
    const searchVal = (document.querySelector('.search-input')?.value || '').toLowerCase();
    const now = Date.now();
    
    filteredWebsites = allWebsites.filter(site => {
        const matchesSearch = !searchVal ||
            (site.subdomain || '').toLowerCase().includes(searchVal) ||
            (site.packageName || '').toLowerCase().includes(searchVal);
        
        const status = getSiteStatus(site);
        const matchesStatus = activeFilters.status === 'all' || activeFilters.status === status;
        const matchesPackage = activeFilters.package === 'all' || site.packageName === activeFilters.package;
        
        let matchesDate = true;
        const expMs = toMs(site.expiresAt);
        const daysLeft = Math.floor((expMs - now) / 86400000);
        
        if (activeFilters.dateRange === 'expiring7') matchesDate = daysLeft >= 0 && daysLeft <= 7;
        else if (activeFilters.dateRange === 'expiring30') matchesDate = daysLeft >= 0 && daysLeft <= 30;
        else if (activeFilters.dateRange === 'expired') matchesDate = daysLeft < 0;
        
        return matchesSearch && matchesStatus && matchesPackage && matchesDate;
    });
    
    currentPage = 1;
    renderTable();
}

// ── Rendering ────────────────────────────────────────────────────────────────
function updateTableHeaders() {
    const thead = document.querySelector('.data-table thead tr');
    if (!thead) return;
    
    const headers = [
        {key:'status', text:'สถานะ'}, {key:'name', text:'ชื่อร้านค้า'},
        {key:'package', text:'แพ็คเกจ'}, {key:'price', text:'ราคา'},
        {key:'expiry', text:'วันหมดอายุ'}, {key:'action', text:'จัดการ'}
    ];
    
    thead.innerHTML = headers.filter(h => visibleColumns[h.key]).map(h => 
        `<th style="padding:16px 20px;background:rgba(241,245,249,0.6);color:#64748b;font-weight:600;font-size:0.8125rem;border-bottom:1px solid rgba(226,232,240,0.6);">${h.text}</th>`
    ).join('');
}

function renderTable() {
    const tbody = document.getElementById('shopTableBody');
    if (!tbody) return;
    
    const total = filteredWebsites.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const items = filteredWebsites.slice(start, start + PAGE_SIZE);
    
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.style.display = total === 0 ? 'block' : 'none';
    
    const pageInfo = document.getElementById('paginationInfo');
    if (pageInfo) pageInfo.textContent = `หน้า ${currentPage} ของ ${totalPages} (${total} รายการ)`;
    
    document.getElementById('btnPrev') && (document.getElementById('btnPrev').disabled = currentPage <= 1);
    document.getElementById('btnNext') && (document.getElementById('btnNext').disabled = currentPage >= totalPages);
    
    if (items.length === 0) { tbody.innerHTML = ''; return; }
    
    tbody.innerHTML = items.map(site => {
        const cells = [];
        const ms = toMs(site.expiresAt);
        const isActive = ms > Date.now();
        
        if (visibleColumns.status) {
            cells.push(`<td>${isActive ? 
                '<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:0.72rem;font-weight:600;background:rgba(16,185,129,0.1);color:#059669;border:1px solid rgba(16,185,129,0.2);"><span style="width:6px;height:6px;border-radius:50%;background:currentColor;animation:pulse 1.5s infinite;"></span>Active</span>' : 
                '<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:0.72rem;font-weight:600;background:rgba(239,68,68,0.1);color:#dc2626;border:1px solid rgba(239,68,68,0.2);"><i class="fa-solid fa-circle-xmark fa-xs"></i>หมดอายุ</span>'}</td>`);
        }
        
        if (visibleColumns.name) {
            const domain = escapeHtml(site.domain || `${site.subdomain}.panderx.xyz`);
            cells.push(`<td style="padding:16px 20px;color:#334155;font-size:0.9375rem;">
                <div style="font-weight:600;">${escapeHtml(site.subdomain)}</div>
                <div style="font-family:monospace;font-size:0.8rem;color:#0ea5e9;background:rgba(14,165,233,0.08);padding:2px 8px;border-radius:6px;display:inline-block;margin-top:4px;">${domain}</div>
            </td>`);
        }
        
        if (visibleColumns.package) {
            cells.push(`<td style="padding:16px 20px;color:#334155;font-size:0.9375rem;">${escapeHtml(site.packageName || '-')}</td>`);
        }
        
        if (visibleColumns.price) {
            const price = site.latestPrice ? '฿' + Number(site.latestPrice).toLocaleString('th-TH') : '—';
            const style = !site.latestPrice ? 'color:#94a3b8;' : 'font-weight:700;color:#334155;';
            cells.push(`<td style="padding:16px 20px;font-size:0.9375rem;${style}">${price}</td>`);
        }
        
        if (visibleColumns.expiry) {
            const days = Math.floor((ms - Date.now()) / 86400000);
            let html = '<span style="color:#94a3b8;">—</span>';
            if (ms) {
                const date = new Date(ms).toLocaleDateString('th-TH');
                if (days < 0) html = `<span style="color:#dc2626;font-weight:600;"><i class="fa-solid fa-circle-xmark" style="margin-right:4px;"></i>${date}</span>`;
                else if (days <= 7) html = `<span style="color:#d97706;font-weight:600;"><i class="fa-solid fa-triangle-exclamation" style="margin-right:4px;"></i>${date} (${days} วัน)</span>`;
                else html = `<span>${date}</span>`;
            }
            cells.push(`<td style="padding:16px 20px;font-size:0.9375rem;">${html}</td>`);
        }
        
        if (visibleColumns.action) {
            cells.push(`<td style="padding:16px 20px;">
                <button onclick="location.href='./rent-website.html?mode=renew&sub=${encodeURIComponent(site.subdomain)}'" style="padding:6px 14px;border-radius:8px;font-size:0.8125rem;font-weight:600;border:none;cursor:pointer;background:linear-gradient(135deg,#38bdf8,#818cf8);color:white;font-family:Prompt;">ต่ออายุ</button>
            </td>`);
        }
        
        return `<tr style="border-bottom:1px solid rgba(226,232,240,0.4);">${cells.join('')}</tr>`;
    }).join('');
}

window.goPrev = function() { if (currentPage > 1) { currentPage--; renderTable(); } };
window.goNext = function() { if (currentPage < Math.ceil(filteredWebsites.length / PAGE_SIZE)) { currentPage++; renderTable(); } };

// ── Auth Init ───────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        dataLoaded = true;
        document.getElementById('loginBtn') && (document.getElementById('loginBtn').style.display = 'flex');
        document.getElementById('userProfile') && (document.getElementById('userProfile').style.display = 'none');
        showError('กรุณาเข้าสู่ระบบ');
        return;
    }
    
    currentUser = user;
    
    if (balanceUnsub) balanceUnsub();
    balanceUnsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
        if (snap.exists()) {
            currentUserData = snap.data();
            updateUserUI(user, currentUserData);
        }
    });
    
    // Repair ghost user
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) {
        await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid, email: user.email || '',
            displayName: user.displayName || user.email?.split('@')[0] || 'ผู้ใช้',
            balance: 0, role: 'user', websiteId: detectWebsiteId(),
            createdAt: serverTimestamp(), isActive: true
        });
    }
    
    await loadWebsites(user.uid);
});

// ── DOM Ready ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.search-input')?.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(applySearchFilter, 200);
    });
    
    document.getElementById('btnPrev')?.addEventListener('click', window.goPrev);
    document.getElementById('btnNext')?.addEventListener('click', window.goNext);
    
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => e.preventDefault());
    
    // Close panels on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllPanels();
    });
});
