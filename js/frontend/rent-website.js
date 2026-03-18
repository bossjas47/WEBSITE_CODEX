// ============================================================
//  js/frontend/rent-website.js
//  Self-contained: hamburger sidebar, secure auth, XSS-safe
//  Firebase 10.7.1 | import จาก firebase-config.js เท่านั้น
// ============================================================

import { auth, db } from '../firebase-config.js';
import {
    onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    doc, getDoc, setDoc,
    collection, runTransaction, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ── State ──────────────────────────────────────────────────────
let currentUser      = null;
let currentUserData  = null;
let currentMode      = 'create';
let selectedDuration = 30;
let basePrice        = 139;
let discountPercent  = 0;
let isSubdomainOk    = false;
let debounceTimer    = null;
let _authInit        = false;

// ── Security: escapeHtml (ทุก string ที่ insert DOM) ───────────
function escapeHtml(text) {
    if (typeof text !== 'string') return String(text ?? '');
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

// ── Toast ──────────────────────────────────────────────────────
window.showToast = function (msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const icons  = { success:'fa-circle-check', error:'fa-circle-xmark', info:'fa-circle-info' };
    const colors = { success:'#10b981', error:'#ef4444', info:'#0ea5e9' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icon = document.createElement('i');
    icon.className = `fa-solid ${icons[type] || 'fa-circle-info'}`;
    icon.style.cssText = `color:${colors[type]||'#64748b'};font-size:1rem;flex-shrink:0;`;
    const span = document.createElement('span');
    span.textContent = msg;   // ✅ textContent ไม่ใช่ innerHTML
    span.style.cssText = 'font-weight:600;color:#1e293b;font-size:.875rem;';
    t.appendChild(icon); t.appendChild(span);
    c.appendChild(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3200);
};

// ── UI Helpers ─────────────────────────────────────────────────
function updateBalance(raw) {
    const fmt = Number(raw ?? 0).toLocaleString('th-TH', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });
    ['userBalance','dropdownBalance','sidebarBalance'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = fmt;
    });
}

function updateName(name) {
    const clean  = (name || 'ผู้ใช้').trim();
    const letter = clean.charAt(0).toUpperCase();
    ['displayName','dropdownName','sidebarUsername'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = clean;
    });
    ['userAvatar','dropdownAvatar','sidebarAvatar'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = letter;
    });
}

// ── Auth state ─────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (_authInit && user?.uid === currentUser?.uid) return;
    _authInit = true;

    const authLoading = document.getElementById('authLoading');
    const userProfile = document.getElementById('userProfile');
    const loginBtn    = document.getElementById('loginBtn');
    const strip       = document.getElementById('sidebarUserStrip');
    const authUser    = document.getElementById('sidebarAuthUser');
    const authGuest   = document.getElementById('sidebarAuthGuest');

    if (authLoading) authLoading.style.display = 'none';

    if (!user) {
        currentUser = null; currentUserData = null;
        if (userProfile) userProfile.style.display = 'none';
        if (loginBtn)    loginBtn.style.display     = 'flex';
        if (strip)       strip.style.display        = 'none';
        if (authUser)    authUser.style.display     = 'none';
        if (authGuest)   authGuest.style.display    = 'block';
        // ต้อง login ก่อน
        location.href = `./login.html?redirect=${encodeURIComponent(location.href)}`;
        return;
    }

    currentUser = user;
    if (userProfile) userProfile.style.display = 'block';
    if (loginBtn)    loginBtn.style.display     = 'none';
    if (strip)       strip.style.display        = 'flex';
    if (authUser)    authUser.style.display     = 'block';
    if (authGuest)   authGuest.style.display    = 'none';

    // Optimistic UI — ชื่อ/balance ก่อน Firestore
    updateName(user.displayName || user.email?.split('@')[0] || 'ผู้ใช้');
    updateBalance(0);

    await loadUserData();
});

async function loadUserData() {
    if (!currentUser) return;
    try {
        const userRef  = doc(db, 'users', currentUser.uid);
        const snap     = await getDoc(userRef);

        if (!snap.exists()) {
            // Ghost user repair
            const newData = {
                uid:         currentUser.uid,
                email:       currentUser.email || '',
                displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'ผู้ใช้',
                balance:     0,
                role:        'user',
                websiteId:   null,
                createdAt:   serverTimestamp()
            };
            await setDoc(userRef, newData);
            currentUserData = { ...newData, balance: 0 };
        } else {
            currentUserData = snap.data();
        }

        updateName(currentUserData.displayName || currentUser.displayName || 'ผู้ใช้');
        updateBalance(currentUserData.balance ?? 0);   // ✅ ?? ไม่ใช่ ||
        validateBalance();

    } catch (err) {
        console.error('[rent] loadUserData error:', err);
        // fallback — ต้องแสดงเสมอ ห้ามปล่อยว่าง
        currentUserData = { balance: 0 };
        updateBalance(0);
        showToast('โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้า', 'error');
    }
}

// ── URL Params — textContent เท่านั้น ──────────────────────────
const urlParams    = new URLSearchParams(location.search);
const packageName  = (urlParams.get('package') || 'Singularity V1').slice(0, 80);
const packagePrice = Math.max(1, parseInt(urlParams.get('price')) || 139);
const packageId    = (urlParams.get('id') || 'singularity-v1').slice(0, 60)
                       .replace(/[^a-z0-9-]/gi, '');

const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
setTxt('packageName', packageName);
setTxt('basePrice',   '฿' + packagePrice.toLocaleString('th-TH'));
setTxt('sumPackage',  packageName);
basePrice = packagePrice;
updatePrices();

// ── Logout ──────────────────────────────────────────────────────
window.handleLogout = async function () {
    try { await signOut(auth); } catch (e) { console.error(e); }
    currentUser = null; currentUserData = null; _authInit = false;
    location.href = './index.html';
};

// ── Mode toggle ─────────────────────────────────────────────────
window.setMode = function (mode) {
    currentMode = mode;
    document.getElementById('btnCreate')?.classList.toggle('active', mode === 'create');
    document.getElementById('btnRenew')?.classList.toggle('active', mode === 'renew');
    setTxt('labelSubdomain', mode === 'create' ? 'ชื่อเว็บไซต์' : 'ชื่อเว็บไซต์ที่ต้องการต่ออายุ');
    const inp = document.getElementById('subdomainInput');
    if (inp) inp.placeholder = mode === 'create' ? 'yourname' : 'your-site';
    checkSubdomain(inp?.value || '');
};

// ── Subdomain input ─────────────────────────────────────────────
const subdomainInput = document.getElementById('subdomainInput');
if (subdomainInput) {
    subdomainInput.addEventListener('input', e => {
        clearTimeout(debounceTimer);
        const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (e.target.value !== cleaned) e.target.value = cleaned;
        debounceTimer = setTimeout(() => checkSubdomain(cleaned), 520);
    });
}

const RESERVED = new Set([
    'admin','test','demo','www','panderx','api','cdn','mail',
    'ftp','localhost','support','status','app','root','staging','dev'
]);

window.checkSubdomain = async function (value) {
    const statusDiv = document.getElementById('subdomainStatus');
    const btn       = document.getElementById('btnSubmit');
    isSubdomainOk   = false;
    if (!statusDiv) return;

    const sumDomain = document.getElementById('sumDomain');

    if (!value || value.length < 3) {
        statusDiv.innerHTML = '';
        if (sumDomain) sumDomain.textContent = '-';
        if (btn) btn.disabled = true;
        return;
    }

    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(value) || value.length > 30) {
        renderStatus(statusDiv, 'unavailable', 'ใช้ a-z, 0-9, ขีดกลาง (-) ได้ ห้ามขึ้นหรือลงด้วย -');
        if (btn) btn.disabled = true;
        return;
    }
    if (RESERVED.has(value)) {
        renderStatus(statusDiv, 'unavailable', 'ชื่อนี้สงวนไว้');
        if (btn) btn.disabled = true;
        return;
    }

    if (sumDomain) sumDomain.textContent = value + '.panderx.xyz';
    renderStatus(statusDiv, 'checking', 'กำลังตรวจสอบ...');

    try {
        const snap = await getDoc(doc(db, 'websites', value));
        const exists = snap.exists();

        if (currentMode === 'create') {
            if (exists) {
                renderStatus(statusDiv, 'unavailable', 'ชื่อนี้ถูกใช้แล้ว');
                if (btn) btn.disabled = true;
            } else {
                renderStatus(statusDiv, 'available', 'พร้อมใช้งาน!');
                isSubdomainOk = true;
                validateBalance();
            }
        } else {
            if (!exists) {
                renderStatus(statusDiv, 'unavailable', 'ไม่พบเว็บไซต์นี้ในระบบ');
                if (btn) btn.disabled = true;
            } else if (snap.data().ownerId !== currentUser?.uid) {
                renderStatus(statusDiv, 'unavailable', 'คุณไม่ใช่เจ้าของเว็บไซต์นี้');
                if (btn) btn.disabled = true;
            } else {
                renderStatus(statusDiv, 'available', 'พบเว็บไซต์ของคุณ — พร้อมต่ออายุ');
                isSubdomainOk = true;
                validateBalance();
            }
        }
    } catch (err) {
        console.error('[rent] checkSubdomain error:', err);
        renderStatus(statusDiv, 'unavailable', 'ตรวจสอบไม่สำเร็จ กรุณาลองใหม่');
        if (btn) btn.disabled = true;
    }
};

// DOM-safe status render (ไม่ใช้ innerHTML กับ user data)
function renderStatus(container, type, text) {
    const cfg = {
        available:   { icon: 'fa-circle-check',    color: '#10b981', cls: 'status-available'   },
        unavailable: { icon: 'fa-circle-xmark',    color: '#ef4444', cls: 'status-unavailable' },
        checking:    { icon: 'fa-circle-notch fa-spin', color: '#f59e0b', cls: 'status-checking'},
    };
    const { icon, color, cls } = cfg[type] || cfg.checking;
    container.innerHTML = ''; // clear
    const wrap = document.createElement('div');
    wrap.className = cls;
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:8px;font-size:.82rem;font-weight:600;';
    const i = document.createElement('i');
    i.className = `fa-solid ${icon}`;
    i.style.color = color;
    const span = document.createElement('span');
    span.textContent = text;   // ✅ textContent
    span.style.color = color;
    wrap.appendChild(i); wrap.appendChild(span);
    container.appendChild(wrap);
}

// ── Duration & Price ────────────────────────────────────────────
window.selectDuration = function (days, discount) {
    selectedDuration = days;
    discountPercent  = discount;
    [30, 90, 365].forEach(d =>
        document.getElementById('dur' + d)?.classList.toggle('selected', d === days)
    );
    setTxt('sumDuration', days === 365 ? '1 ปี' : days + ' วัน');
    calculateTotal();
    validateBalance();
};

function calculateTotal() {
    const mul      = selectedDuration / 30;
    const subtotal = basePrice * mul;
    const discount = subtotal * (discountPercent / 100);
    const total    = Math.floor(subtotal - discount);

    setTxt('totalPrice', '฿' + total.toLocaleString('th-TH'));

    const row = document.getElementById('discountRow');
    const amt = document.getElementById('discountAmount');
    if (row) row.style.display = discount > 0 ? 'flex' : 'none';
    if (amt) amt.textContent   = '-฿' + Math.floor(discount).toLocaleString('th-TH');

    return total;
}

function updatePrices() {
    const p30  = basePrice;
    const p90  = Math.floor(basePrice * 3 * 0.9);
    const p365 = Math.floor(basePrice * 12 * 0.8);
    setTxt('price30',  '฿' + p30.toLocaleString('th-TH'));
    setTxt('price90',  '฿' + p90.toLocaleString('th-TH'));
    setTxt('price365', '฿' + p365.toLocaleString('th-TH'));
    setTxt('orig90',   '฿' + Math.floor(basePrice * 3).toLocaleString('th-TH'));
    setTxt('orig365',  '฿' + Math.floor(basePrice * 12).toLocaleString('th-TH'));
    calculateTotal();
}

function validateBalance() {
    const btn   = document.getElementById('btnSubmit');
    const insuf = document.getElementById('insufficientBalance');
    const total = calculateTotal();
    const bal   = currentUserData?.balance ?? 0;

    if (!isSubdomainOk) { if (btn) btn.disabled = true; return; }

    if (bal < total) {
        if (insuf) insuf.classList.add('show');
        if (btn)   btn.disabled = true;
    } else {
        if (insuf) insuf.classList.remove('show');
        if (btn)   btn.disabled = false;
    }
}

// ── Submit Order ────────────────────────────────────────────────
window.submitOrder = async function () {
    const btn      = document.getElementById('btnSubmit');
    const btnText  = document.getElementById('btnText');
    const subdomain = (subdomainInput?.value || '').toLowerCase().trim();
    const total    = calculateTotal();

    if (!subdomain || !currentUser || !isSubdomainOk || btn?.disabled) return;

    // Client-side final check
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(subdomain) || RESERVED.has(subdomain)) {
        showToast('ชื่อเว็บไซต์ไม่ถูกต้อง', 'error'); return;
    }

    if (btn)     { btn.disabled = true; btn.classList.add('loading'); }
    if (btnText) { btnText.style.opacity = '0'; }

    try {
        const orderId   = `ORD${Date.now()}${Math.random().toString(36).slice(2,7).toUpperCase()}`;
        const now       = new Date();
        const expiresAt = new Date(now.getTime() + selectedDuration * 86400000);
        const dispName  = currentUserData?.displayName
                       || currentUser.displayName
                       || currentUser.email?.split('@')[0]
                       || 'ผู้ใช้';

        await runTransaction(db, async (tx) => {

            // 1. ตรวจ balance จาก Firestore
            const userRef  = doc(db, 'users', currentUser.uid);
            const userSnap = await tx.get(userRef);
            if (!userSnap.exists()) throw new Error('USER_NOT_FOUND');
            const bal = userSnap.data().balance ?? 0;
            if (bal < total) throw new Error('INSUFFICIENT_BALANCE');

            // 2. ตรวจ subdomain
            const websiteRef  = doc(db, 'websites', subdomain);
            const websiteSnap = await tx.get(websiteRef);
            if (currentMode === 'create' && websiteSnap.exists())          throw new Error('SUBDOMAIN_TAKEN');
            if (currentMode === 'renew'  && !websiteSnap.exists())         throw new Error('WEBSITE_NOT_FOUND');
            if (currentMode === 'renew'  && websiteSnap.data()?.ownerId !== currentUser.uid) throw new Error('NOT_OWNER');

            // 3. หักเงิน
            tx.update(userRef, { balance: bal - total, updatedAt: serverTimestamp() });

            // 4. สร้าง/ต่ออายุ
            if (currentMode === 'create') {
                tx.set(websiteRef, {
                    subdomain,
                    domain:           `${subdomain}.panderx.xyz`,
                    websiteId:        subdomain,
                    packageId,
                    packageName,
                    ownerId:          currentUser.uid,
                    ownerEmail:       currentUser.email || '',
                    ownerDisplayName: dispName,
                    status:           'active',
                    sslEnabled:       true,
                    createdAt:        serverTimestamp(),
                    expiresAt,
                    lastRenewal:      serverTimestamp(),
                    settings:         { theme:'default', language:'th', siteName: subdomain },
                    totalUsers:       0,
                    totalOrders:      0
                });
            } else {
                const currExp  = websiteSnap.data().expiresAt?.toDate() || now;
                const newExpiry = new Date(
                    Math.max(currExp.getTime(), now.getTime()) + selectedDuration * 86400000
                );
                tx.update(websiteRef, {
                    expiresAt: newExpiry, lastRenewal: serverTimestamp(),
                    status: 'active', updatedAt: serverTimestamp()
                });
            }

            // 5. Order
            tx.set(doc(db, 'orders', orderId), {
                orderId, userId: currentUser.uid, userEmail: currentUser.email || '',
                websiteId: subdomain, type: currentMode, subdomain,
                domain: `${subdomain}.panderx.xyz`, packageId, packageName,
                duration: selectedDuration, basePrice, discountPercent,
                totalAmount: total, status: 'completed',
                createdAt: serverTimestamp(), completedAt: serverTimestamp()
            });

            // 6. Transaction log
            tx.set(doc(collection(db, 'transactions')), {
                userId: currentUser.uid, websiteId: subdomain,
                type: 'debit', amount: total, balanceAfter: bal - total,
                description: `${currentMode === 'create' ? 'เช่า' : 'ต่ออายุ'}เว็บไซต์ ${subdomain}`,
                orderId, createdAt: serverTimestamp()
            });
        });

        // อัปเดต local
        if (currentUserData) currentUserData.balance = (currentUserData.balance ?? 0) - total;
        updateBalance(currentUserData?.balance ?? 0);

        showToast(currentMode === 'create' ? 'สร้างเว็บไซต์สำเร็จ!' : 'ต่ออายุสำเร็จ!', 'success');
        setTimeout(() => { location.href = `./orders.html?new=${encodeURIComponent(orderId)}`; }, 1600);

    } catch (err) {
        console.error('[rent] transaction error:', err);
        const map = {
            INSUFFICIENT_BALANCE: 'ยอดเงินไม่เพียงพอ กรุณาเติมเงินก่อน',
            SUBDOMAIN_TAKEN:      'ชื่อเว็บไซต์ถูกใช้แล้ว กรุณาเลือกชื่ออื่น',
            WEBSITE_NOT_FOUND:    'ไม่พบเว็บไซต์นี้ในระบบ',
            NOT_OWNER:            'คุณไม่ใช่เจ้าของเว็บไซต์นี้',
            USER_NOT_FOUND:       'ไม่พบข้อมูลบัญชี กรุณาเข้าสู่ระบบใหม่',
        };
        showToast(map[err.message] || 'เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
        if (err.message === 'INSUFFICIENT_BALANCE') validateBalance();
        if (err.message === 'SUBDOMAIN_TAKEN') window.checkSubdomain(subdomainInput?.value || '');
        if (btn)     { btn.disabled = false; btn.classList.remove('loading'); }
        if (btnText) { btnText.style.opacity = '1'; }
    }
};

// ── Site Identity ───────────────────────────────────────────────
(async () => {
    try {
        const snap = await getDoc(doc(db, 'system', 'site_settings'));
        if (!snap.exists()) return;
        const name   = snap.data().siteName || 'PanderX';
        const letter = name.charAt(0).toUpperCase();
        setTxt('navbarBrand',     name);
        setTxt('sidebarSiteName', name);
        setTxt('sidebarLogoIcon', letter);
        setTxt('siteFooterText',  `© ${new Date().getFullYear()} ${name} | ระบบเช่าเว็บไซต์`);
        document.title = `เช่าเว็บไซต์ | ${name}`;
    } catch (e) { /* ใช้ default text */ }
})();
