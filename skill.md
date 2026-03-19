# 🎨 PanderX Frontend — SKILL.md
> AI ต้องอ่านไฟล์นี้ก่อนแก้ไขหรือสร้างไฟล์ใดๆ เสมอ

---

## 🚨 HARD RULES

### 1. HTML pages — self-contained CSS
- **topup.html, login.html, rent-website.html** → ใช้ Tailwind CDN + inline `<style>` ทุก component
- **ห้าม** reference `css/common.css` สำหรับหน้าเหล่านี้ เพราะ common.css ไม่มี styles ครบ
- **ยกเว้น** index.html, profile.html, orders.html, settings.html, homerent.html → ใช้ common.css ได้

### 2. style.display ไม่ใช่ classList.hidden (CRITICAL)
```javascript
el.style.display = 'flex'; // ✅
el.style.display = 'none';
el.classList.remove('hidden'); // ❌ Tailwind !important override
```

### 3. balance ?? 0 ไม่ใช่ || 0
```javascript
const bal = data.balance ?? 0; // ✅ (0 ก็ถูก)
const bal = data.balance || 0; // ❌ (balance=0 จะ bug)
```

### 4. Profile dropdown ทุกหน้า → class "active" (ไม่ใช่ "show")

---

## 📁 File Structure (สมบูรณ์)
```
/
├── index.html
├── login.html          ← self-contained (Tailwind CDN + inline CSS)
├── topup.html          ← self-contained (Tailwind CDN + inline CSS)
├── rent-website.html   ← self-contained (Tailwind CDN + inline CSS)
├── homerent.html
├── profile.html
├── orders.html
├── settings.html
├── admin.html          ← Admin Panel (2200+ lines)
│
├── css/
│   ├── common.css      ← SHARED: glass, navbar, sidebar, toast (index, profile, orders, settings, homerent เท่านั้น)
│   ├── admin.css
│   ├── index.css
│   ├── topup.css       ← มีไว้ แต่ topup.html ใช้ inline style เป็นหลัก
│   ├── login.css
│   ├── rent-website.css
│   ├── homerent.css
│   ├── profile.css
│   ├── settings.css
│   └── orders.css
│
└── js/
    ├── firebase-config.js          ← shared Firebase init, exports { app, auth, db }
    ├── frontend/
    │   ├── index.js
    │   ├── login.js                ← Security upgrade: rate limit, websiteId detect
    │   ├── topup.js                ← Slip + Fee display + Redeem code
    │   ├── rent-website.js         ← websiteId propagation
    │   ├── homerent.js
    │   ├── profile.js
    │   ├── settings.js
    │   └── orders.js
    └── backend/
        ├── dashboard.js
        ├── dashboard-stats.js
        └── modules/
            ├── auth.js             ← window.firestoreFns + Timestamp
            ├── navigation.js       ← switchTab + redeem-codes + topup fee auto-load
            ├── settings.js         ← siteName propagation
            ├── fake-stats.js       ← Fake display stats
            ├── redeem-codes.js     ← NEW: สร้าง/จัดการ redeem codes
            ├── topup.js            ← loadFeeSettings, saveFeeSettings, calcNetAmount
            ├── core.js, utils.js, users.js, roles.js
            ├── orders.js, currencies.js, payments.js
            ├── products.js, theme.js
```

---

## 🔥 Firestore Collections (ครบทุก collection)

| Collection | Fields หลัก |
|-----------|------------|
| `users` | balance, role, displayName, phone, **websiteId** (tenant isolation) |
| `products` | name, price, imageUrl, category, isActive, stock, createdAt |
| `orders` | userId, productId, totalAmount, durationDays, status, createdAt, **websiteId** |
| `websites` | subdomain, domain, **websiteId**, ownerId, status, expiresAt, packageId |
| `topup_requests` | userId, slipUrl, paymentMethodId, paymentMethodType, status, **feePercent**, note |
| `redeem_codes` | code, amount, isUsed, usedBy, usedByUid, usedAt, expiresAt, note |
| `transactions` | userId, type (credit/debit), amount, balanceAfter, description, **codeId**, **websiteId** |
| `bank_accounts` | bankName, accountNumber, accountName, isActive |
| `payment_methods` | type (truemoney), phoneNumber, isActive |
| `admin_notifications` | type, requestId, userId, read |
| `admin_panel_websites` | websiteId, subdomain, ownerId, status, adminReviewStatus |
| `activity_logs` | userId, action, page, data, timestamp |
| `logs` | userId, username, action, timestamp |
| `system/stats` | todayCount, weekCount, monthCount, yearCount, totalCount, launchDate, totalUsers, newUsers, userGrowth, activeUsers, totalRevenue, monthlyRevenue, topupToday/Week/Month/Year, revenueGrowth |
| `system/site_settings` | siteName, description, seoTitle, siteUrl, favicon, ogImage, line, facebook, discord, phone, email, tiktok, shopTypes, keywords |
| `system/theme` | primary, secondary, accent, bg, text, textMuted, headerBg, footerBg, fontFamily, fontSize |
| `system/topup_config` | **bankFee** (%), **trueMoneyFee** (%) |

---

## 🔐 Multi-Tenant Architecture (websiteId)

### แนวคิดหลัก
- แต่ละเว็บไซต์ที่เช่ามี `websiteId` = subdomain (เช่น `oke`)
- ผู้ใช้ที่สมัครบน `oke.panderx.xyz` จะมี `websiteId: "oke"` ติดตัว
- ผู้ใช้บน `obnoxious.panderx.xyz` จะมี `websiteId: "obnoxious"`
- ดึงข้อมูลเฉพาะเว็บตัวเองด้วย `where("websiteId", "==", siteId)`

### websiteId Detection (login.js)
```javascript
function detectWebsiteId() {
    const hostname = window.location.hostname;
    // oke.panderx.xyz → 'oke'
    // panderx.xyz → null (main platform)
    const parts = hostname.split('.');
    if (parts.length >= 3 && parts[parts.length-2]==='panderx' && parts[parts.length-1]==='xyz') {
        return parts[0];
    }
    return null;
}
```

### websiteId ถูก save ใน
- `users/{uid}.websiteId` — ตอนสมัคร/login
- `websites/{subdomain}.websiteId` — ตอนเช่า
- `orders/{id}.websiteId` — ตอนสั่งซื้อ
- `transactions/{id}.websiteId` — ตอนหักเงิน/เติมเงิน

---

## 💰 ระบบ Topup

### Fee Settings
- Admin ตั้งค่าใน `system/topup_config`: `bankFee` (%), `trueMoneyFee` (%)
- Admin Panel → หน้า Topup → Fee Settings card (บันทึก/โหลด)
- topup.html แสดง Fee Notice เมื่อเลือก payment method
- สูตร: `netAmount = floor(grossAmount * (1 - fee/100))`

### Slip Upload Flow
1. ผู้ใช้เลือก payment method (bank/truemoney)
2. อัพโหลดสลิปไป Firebase Storage (`slips/{uid}/{timestamp}_{filename}`)
3. สร้าง `topup_requests` doc พร้อม `feePercent`, `slipUrl`, `status: pending`
4. Admin อนุมัติ → เพิ่มเงินเข้า `users/{uid}.balance`

### Redeem Code Flow
- Admin สร้าง batch codes ใน `redeem_codes` collection (format: `XXXX-XXXX-XXXX`)
- ผู้ใช้กรอกโค้ดในหน้า topup → Tab "แลกโค้ด"
- ระบบ validate (isUsed?, expiresAt?) แล้วใช้ Transaction
- Transaction: mark code used + เพิ่ม balance + บันทึก transactions log

---

## 🛡️ Security (login.js)

### Rate Limiting (localStorage)
```javascript
const RL_MAX = 5;          // max attempts
const RL_WINDOW = 15 * 60 * 1000; // 15 min
// Key: 'panderx_login_attempts'
// Fields: { attempts, windowStart }
```

### อื่นๆ
- Input sanitize: `replace(/[<>"'`]/g, ...)` ก่อน insert DOM
- Open redirect prevention: `new URL(redirect, origin).origin === origin`
- Rollback Auth user ถ้า Firestore save ไม่สำเร็จ (retry 3 ครั้ง)
- Ghost User repair: ถ้า login แล้วไม่เจอ doc ใน Firestore → สร้างให้อัตโนมัติ

---

## 🎟️ Admin Panel — Redeem Codes (redeem-codes.js)

### Functions
- `createBatchCodes()` — สร้างหลายโค้ดพร้อมกัน (qty 1-100, มีมูลค่า, วันหมดอายุ)
- `loadRedeemCodes()` — โหลดตาราง + stats (total, active, used, totalValue)
- `deleteRedeemCode(docId, code)` — ลบโค้ดที่ยังไม่ได้ใช้

### Code Format
```javascript
function _generateCode(length=12) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ตัดตัวสับสน 0/O, 1/I
    // Output: XXXX-XXXX-XXXX (dash ทุก 4 ตัว)
}
```

### Navigation Auto-load
```javascript
// navigation.js switchTab():
if (tabName === 'redeem-codes') setTimeout(() => loadRedeemCodes(), 100);
if (tabName === 'topup') { 
    setTimeout(() => loadTopupRequests(), 100); 
    setTimeout(() => loadFeeSettings(), 200); 
}
```

---

## 🎨 Design System (ใช้กับ self-contained pages)

### Navbar Pattern (topup, login, rent-website)
```html
<div class="nav-wrap" style="position:fixed;top:10px;left:12px;right:12px;z-index:100;">
    <nav class="navbar" style="background:rgba(255,255,255,.9);backdrop-filter:blur(20px);border-radius:16px;padding:8px 18px;display:flex;align-items:center;justify-content:space-between;">
        <a href="./index.html" class="navbar-brand" id="navbarBrand">PanderX</a>
        <!-- profile trigger + glass-dropdown -->
    </nav>
</div>
<main style="padding-top:88px;">...</main>
```

### Tab Switcher Pattern
```html
<div class="topup-tabs">
    <button id="tab1" onclick="switchTab('slip')" class="topup-tab active">...</button>
    <button id="tab2" onclick="switchTab('redeem')" class="topup-tab">...</button>
</div>
```
```javascript
function switchTab(t) {
    document.getElementById('panel1').style.display = t==='slip' ? 'block' : 'none';
    document.getElementById('panel2').style.display = t==='redeem' ? 'block' : 'none';
    document.getElementById('tab1').classList.toggle('active', t==='slip');
    document.getElementById('tab2').classList.toggle('active', t==='redeem');
}
```

### Balance Hero (gradient)
```css
.balance-hero {
    background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #8b5cf6 100%);
}
```

### Critical CSS Classes (self-contained pages)
```
.glass-card       → white card with hover lift
.payment-card     → border 2px, .active → border sky-400
.upload-zone      → dashed border, .has-file → border emerald
.btn-primary      → gradient sky→indigo, disabled opacity .55
.btn-redeem       → gradient orange→amber
.balance-pill     → sky tinted chip with diamond icon
.avatar-glass     → round gradient avatar
.glass-dropdown   → .active shows dropdown (RIGHT-ALIGNED: right: 0)
.topup-tab        → .active = white bg + sky text
.history-item     → white card, border-left 4px colored
.status-badge     → rounded pill: pending=amber, approved=emerald, rejected=red
.hamburger-btn    → 🆕 **MUST HAVE ANIMATION**: .active state transforms bars into X
.hamburger-bar    → 🆕 **MUST HAVE ANIMATION**: transition all 0.3s cubic-bezier(0.4, 0, 0.2, 1)
```

---

## 🎬 Hamburger UI Animation (Required for all pages)

### HTML Structure
```html
<button id="hamburgerBtn" class="hamburger-btn" onclick="window.toggleSidebar(event)">
    <span class="hamburger-bar"></span>
    <span class="hamburger-bar"></span>
    <span class="hamburger-bar"></span>
</button>
```

### CSS Animation (CRITICAL)
```css
.hamburger-btn {
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: 32px;
    height: 32px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    transition: all 0.3s ease;
}
.hamburger-bar {
    width: 100%;
    height: 2.5px;
    background: #1e293b;
    border-radius: 2px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    transform-origin: center;
}
/* Transform to X shape when active */
.hamburger-btn.active .hamburger-bar:nth-child(1) {
    transform: rotate(45deg) translateY(12px);
}
.hamburger-btn.active .hamburger-bar:nth-child(2) {
    opacity: 0;
    transform: translateX(-10px);
}
.hamburger-btn.active .hamburger-bar:nth-child(3) {
    transform: rotate(-45deg) translateY(-12px);
}
```

### JavaScript Logic (MUST ADD)
```javascript
window.toggleSidebar = function(e) {
    if (e) e.stopPropagation();
    document.getElementById('sidebarDrawer')?.classList.toggle('active');
    document.getElementById('sidebarOverlay')?.classList.toggle('active');
    document.getElementById('hamburgerBtn')?.classList.toggle('active'); // ← CRITICAL!
};
```

### Profile Dropdown — RIGHT ALIGNED
- **Position**: `position: absolute; right: 0;` (NOT left)
- **Transform**: `scale(0.95) translateY(-10px)` → `scale(1) translateY(0)` on .active
- **Container**: `.profile-dropdown-container { position: relative; }`

---

## 🏗️ Admin Panel — Sections

| Tab ID | ชื่อ | Module |
|--------|------|--------|
| `dashboard` | หน้าหลัก | core.js |
| `topup` | จัดการเติมเงิน + **Fee Settings** | topup.js |
| `redeem-codes` | 🆕 ระบบโค้ดเติมเงิน | redeem-codes.js |
| `users` | รายชื่อผู้ใช้ | users.js |
| `roles` | จัดการยศ | roles.js |
| `orders` | คำสั่งซื้อ | orders.js |
| `products` | สินค้า | products.js |
| `special-currency` | สกุลเงินพิเศษ | currencies.js |
| `payments` | ช่องทางชำระเงิน | payments.js |
| `site-settings` | ตั้งค่าทั่วไป | settings.js |
| `theme` | ธีม | theme.js |
| `security` | ความปลอดภัย | - |
| `fake-stats` | Fake Display Stats | fake-stats.js |

### Admin script tags (admin.html)
```html
<script src="js/backend/modules/auth.js"></script>
<script src="js/backend/modules/navigation.js"></script>
<script src="js/backend/modules/core.js"></script>
<!-- ... อื่นๆ ... -->
<script src="js/backend/modules/fake-stats.js"></script>
<script src="js/backend/modules/redeem-codes.js"></script>
```

---

## ⚠️ Common Bugs & Fixes

| Bug | สาเหตุ | Fix |
|-----|--------|-----|
| Layout พัง (topup/login) | reference css/common.css ที่ไม่มี styles ครบ | ใช้ inline `<style>` self-contained |
| balance แสดง 0 เสมอ | ใช้ `\|\|` กับ balance ที่เป็น 0 | เปลี่ยนเป็น `??` |
| dropdown ไม่เปิด/ปิด | ใช้ class "show" | เปลี่ยนเป็น class "active" |
| sidebar element ไม่ซ่อน | classList.hidden override ไม่ได้ | ใช้ style.display |
| Redeem code ไม่ work | query ไม่มี `where('code','==',codeRaw)` | ต้องมี Firestore index บน `code` field |

---

## ✅ Checklist ก่อน deploy

- [ ] HTML self-contained pages ไม่ reference css/common.css
- [ ] balance `??` ทุก JS file
- [ ] websiteId detect + save ใน login.js
- [ ] websiteId ฝังใน websites/, orders/, transactions/ ตอนเช่า
- [ ] Rate limit ใน login.js (5 ครั้ง/15 นาที)
- [ ] Fee config โหลดจาก system/topup_config
- [ ] Redeem code: Firestore index บน field `code` (ASC)
- [ ] Dropdown ใช้ class "active"
- [ ] style.display บน sidebar state elements
- [ ] Admin script tags ครบ รวม redeem-codes.js

---

## 🧠 Core Functions (copy-paste ได้เลย)

### toggleSidebar / closeSidebar
```javascript
window.toggleSidebar = function (e) {
    if (e) e.stopPropagation();
    const drawer  = document.getElementById('sidebarDrawer');
    const overlay = document.getElementById('sidebarOverlay');
    const btn     = document.getElementById('hamburgerBtn');
    const isOpen  = drawer.classList.toggle('open');
    overlay.classList.toggle('open', isOpen);
    btn.classList.toggle('active', isOpen);
    btn.setAttribute('aria-expanded', String(isOpen));
    document.body.style.overflow = isOpen ? 'hidden' : '';
};

window.closeSidebar = function () {
    document.getElementById('sidebarDrawer')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('open');
    const btn = document.getElementById('hamburgerBtn');
    if (btn) { btn.classList.remove('active'); btn.setAttribute('aria-expanded', 'false'); }
    document.body.style.overflow = '';
};

// ปิดด้วย Escape
document.addEventListener('keydown', e => { if (e.key === 'Escape') window.closeSidebar(); });
```

### HTML: Hamburger Button (ซ้ายบนทุกหน้า)
```html
<button id="hamburgerBtn" class="hamburger-btn"
    onclick="toggleSidebar(event)" aria-label="เปิดเมนู" aria-expanded="false">
    <span class="hamburger-bar"></span>
    <span class="hamburger-bar"></span>
    <span class="hamburger-bar"></span>
</button>
```

### CSS: Hamburger + Sidebar
```css
/* Hamburger */
.hamburger-btn {
    width: 40px; height: 40px;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 5px;
    background: rgba(255,255,255,0.6);
    border: 1px solid rgba(255,255,255,0.8);
    border-radius: 10px; cursor: pointer; transition: all .3s;
}
.hamburger-bar {
    width: 18px; height: 2px;
    background: #475569; border-radius: 2px;
    transition: all .3s cubic-bezier(.4,0,.2,1);
}
/* X animation */
.hamburger-btn.active .hamburger-bar:nth-child(1) { transform: translateY(7px) rotate(45deg); }
.hamburger-btn.active .hamburger-bar:nth-child(2) { opacity: 0; transform: scaleX(0); }
.hamburger-btn.active .hamburger-bar:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

/* Sidebar Drawer */
.sidebar-drawer {
    position: fixed; top: 0; left: 0; height: 100vh; width: 280px;
    background: white; z-index: 150;
    transform: translateX(-100%); transition: transform .3s cubic-bezier(.4,0,.2,1);
    overflow-y: auto; box-shadow: 4px 0 24px rgba(0,0,0,.08);
    display: flex; flex-direction: column;
}
.sidebar-drawer.open { transform: translateX(0); }

.sidebar-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.35);
    z-index: 140; opacity: 0; pointer-events: none;
    transition: opacity .3s;
}
.sidebar-overlay.open { opacity: 1; pointer-events: all; }
```

### updateBalance / updateName
```javascript
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
```

### showToast
```javascript
function showToast(msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3200);
}
window.showToast = showToast;
// type: 'info' | 'success' | 'error'
```

### onAuthStateChanged — Pattern มาตรฐาน
```javascript
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let _lastUid = null, _authInit = false;

onAuthStateChanged(auth, async (user) => {
    if (_authInit && user?.uid === _lastUid) return;
    _lastUid = user ? user.uid : null;
    _authInit = true;

    const loginBtn    = document.getElementById('loginBtn');
    const userProfile = document.getElementById('userProfile');
    const strip       = document.getElementById('sidebarUserStrip');
    const guest       = document.getElementById('sidebarAuthGuest');
    const userSec     = document.getElementById('sidebarAuthUser');

    if (!user) {
        if (loginBtn)    loginBtn.style.display    = 'flex';
        if (userProfile) userProfile.style.display = 'none';
        if (strip)       strip.style.display       = 'none';
        if (guest)       guest.style.display       = 'block';
        if (userSec)     userSec.style.display     = 'none';
        return;
    }

    if (loginBtn)    loginBtn.style.display    = 'none';
    if (userProfile) userProfile.style.display = 'flex';
    if (strip)       strip.style.display       = 'flex';
    if (guest)       guest.style.display       = 'none';
    if (userSec)     userSec.style.display     = 'block';

    // Optimistic — ชื่อจาก Auth ก่อน
    updateName(user.displayName || user.email?.split('@')[0] || 'ผู้ใช้');

    try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
            const data = snap.data();
            updateName(data.displayName || user.displayName || 'ผู้ใช้');
            updateBalance(data.balance ?? 0);
            const role = String(data.role || '').toLowerCase();
            if (role === 'admin' || role === 'super_admin') {
                ['adminPanelBtn','sidebarAdminBtn'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'flex';
                });
            }
        }
    } catch (err) {
        console.error('User load error:', err);
        updateBalance(0);
    }
});

window.handleLogout = async function () {
    try { await signOut(auth); } catch(e) {}
    _lastUid = null; _authInit = false;
    location.href = './login.html';
};
```

### Profile Dropdown Toggle
```javascript
window.toggleProfileDropdown = function (e) {
    e?.stopPropagation();
    document.getElementById('profileDropdown')?.classList.toggle('active');
};
document.addEventListener('click', e => {
    const dd  = document.getElementById('profileDropdown');
    const btn = document.getElementById('profileTrigger');
    if (dd && btn && !btn.contains(e.target) && !dd.contains(e.target))
        dd.classList.remove('active');
});
// HTML trigger: <button id="profileTrigger" onclick="toggleProfileDropdown(event)">
// Dropdown:    <div id="profileDropdown" class="glass-dropdown"> ... </div>
// CSS:         .glass-dropdown { opacity:0; visibility:hidden; ... }
//              .glass-dropdown.active { opacity:1; visibility:visible; }
```

### loadSiteIdentity (ชื่อเว็บจาก Firestore)
```javascript
async function loadSiteIdentity() {
    try {
        const snap = await getDoc(doc(db, 'system', 'site_settings'));
        if (!snap.exists()) return;
        const name   = snap.data().siteName || 'PanderX';
        const letter = name.charAt(0).toUpperCase();

        ['navbarBrand','navbarSiteName'].forEach(id => {
            const el = document.getElementById(id); if (el) el.textContent = name;
        });
        const sn = document.getElementById('sidebarSiteName'); if (sn) sn.textContent = name;
        const si = document.getElementById('sidebarLogoIcon'); if (si) si.textContent = letter;

        document.title = `${name} | หน้าเติมเงิน`; // ปรับ suffix ตามหน้า
        const ft = document.getElementById('siteFooterText');
        if (ft) ft.textContent = `© ${new Date().getFullYear()} ${name}`;
    } catch (e) { /* ใช้ default text */ }
}
```

### loadStats (index.html — ดึงจาก system/stats)
```javascript
async function loadStats() {
    const snap = await getDoc(doc(db, 'system', 'stats'));
    const data = snap.exists() ? snap.data() : {};

    // stat IDs: statToday, statWeek, statMonth, statTotal
    // keys:     todayCount, weekCount, monthCount, totalCount
    const STATS = [
        { id:'statToday',  key:'todayCount'  },
        { id:'statWeek',   key:'weekCount'   },
        { id:'statMonth',  key:'monthCount'  },
        { id:'statTotal',  key:'totalCount'  },
    ];
    STATS.forEach(s => {
        const el = document.getElementById(s.id);
        if (el) animateNumber(el, data[s.key] ?? 0);
    });
}

function animateNumber(el, target) {
    const t = Number(target) || 0;
    if (!t) { el.textContent = '0'; return; }
    const start = performance.now(), dur = 900;
    function step(now) {
        const p = Math.min((now - start) / dur, 1);
        const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
        el.textContent = Math.round(t * e).toLocaleString('th-TH');
        if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}
```

### escapeHtml (XSS safe)
```javascript
function escapeHtml(text) {
    if (typeof text !== 'string') return String(text ?? '');
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}
```

### Firebase Import (ทุก JS frontend)
```javascript
import { auth, db } from '../firebase-config.js'; // หรือ '../../firebase-config.js'
// firebase-config.js export: { app, auth, db }
// Firebase version: 10.7.1
const FB = 'https://www.gstatic.com/firebasejs/10.7.1';
import { onAuthStateChanged, signOut }           from `${FB}/firebase-auth.js`;
import { doc, getDoc, collection, getDocs,
         query, where, orderBy, limit,
         addDoc, updateDoc, deleteDoc,
         runTransaction, serverTimestamp }        from `${FB}/firebase-firestore.js`;
import { getStorage, ref, uploadBytes,
         getDownloadURL }                        from `${FB}/firebase-storage.js`;
```

---

## 🔒 Security — บังคับใช้ทุกไฟล์

### กฎเหล็ก (ห้ามข้าม)
- **XSS**: ทุก string ที่ insert ลง DOM ต้อง `escapeHtml()` ก่อนเสมอ
- **Input sanitize**: ทุก user input ต้อง `.trim()` และ escapeHtml ก่อนบันทึก Firestore
- **Open redirect**: ตรวจ `new URL(redirect, location.origin).origin === location.origin` ก่อน redirect
- **Rate limiting**: login/register ใช้ localStorage key `panderx_login_attempts` max 5 ครั้ง/15 นาที
- **Rollback**: ถ้า Firestore save ล้มเหลวหลัง Auth สร้าง user → `deleteUser()` ทันที (retry 3 ครั้ง)
- **Ghost user repair**: `onAuthStateChanged` → ถ้า Auth มี user แต่ Firestore doc ไม่มี → สร้าง doc ให้อัตโนมัติ
- **ห้าม** expose Firebase config ใน client-side JS โดยไม่มี Firestore Security Rules กำกับ
- **ห้าม** ใช้ `innerHTML` โดยตรงกับ user input เด็ดขาด ใช้ `textContent` หรือ escapeHtml เท่านั้น

### Rate Limit Pattern
```javascript
const RL_KEY    = 'panderx_login_attempts';
const RL_MAX    = 5;
const RL_WINDOW = 15 * 60 * 1000; // 15 นาที

function checkRateLimit() {
    const raw  = localStorage.getItem(RL_KEY);
    const data = raw ? JSON.parse(raw) : { attempts: 0, windowStart: Date.now() };
    if (Date.now() - data.windowStart > RL_WINDOW) {
        data.attempts = 0; data.windowStart = Date.now();
    }
    if (data.attempts >= RL_MAX) {
        const remaining = Math.ceil((RL_WINDOW - (Date.now() - data.windowStart)) / 60000);
        throw new Error(`ลองใหม่ในอีก ${remaining} นาที`);
    }
    data.attempts++;
    localStorage.setItem(RL_KEY, JSON.stringify(data));
}

function clearRateLimit() {
    localStorage.removeItem(RL_KEY);
}
```

### escapeHtml (ใช้ทุกที่)
```javascript
function escapeHtml(text) {
    if (typeof text !== 'string') return String(text ?? '');
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}
```

---

## 🔌 Firebase Connection — กฎเหล็ก

### ทุกไฟล์ JS ต้อง import จาก firebase-config.js เสมอ
```javascript
// ✅ ถูก — import จาก shared config
import { auth, db } from '../firebase-config.js';         // frontend js
import { auth, db } from '../../firebase-config.js';      // ถ้า nested
// ❌ ผิด — ห้าม initializeApp ซ้ำในไฟล์อื่น
```

### firebase-config.js (canonical — ห้ามแก้)
```javascript
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth }                 from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore }            from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
    apiKey:            "AIzaSyC450kePwL6FdVXUSVli0bEP3DdnQs0qzU",
    authDomain:        "psl-esport.firebaseapp.com",
    projectId:         "psl-esport",
    storageBucket:     "psl-esport.firebasestorage.app",
    messagingSenderId: "225108570173",
    appId:             "1:225108570173:web:b6483c02368908f3783a54"
};

const app  = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db   = getFirestore(app);
export { app, auth, db };
```

### HTML script tag — ต้องเป็น module เสมอ
```html
<!-- ✅ ถูก -->
<script type="module" src="js/frontend/topup.js"></script>
<!-- ❌ ผิด — ไม่มี type="module" จะทำให้ import ไม่ทำงาน -->
<script src="js/frontend/topup.js"></script>
```

### Firebase version: 10.7.1 (ห้ามผสมหลาย version)
```javascript
const FB = 'https://www.gstatic.com/firebasejs/10.7.1';
// Auth
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword,
         signInWithEmailAndPassword, updateProfile, deleteUser }
    from `${FB}/firebase-auth.js`;
// Firestore
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc,
         collection, getDocs, query, where, orderBy, limit,
         runTransaction, serverTimestamp, Timestamp }
    from `${FB}/firebase-firestore.js`;
// Storage
import { getStorage, ref, uploadBytes, getDownloadURL }
    from `${FB}/firebase-storage.js`;
```

---

## 🚫 ห้ามทำ Skeleton / ข้อมูลหาย — บังคับทุกหน้า

### กฎหลัก
1. **ห้ามใช้ skeleton loading** ที่ทำให้ข้อมูลหายถาวร — ถ้าโหลดช้าให้แสดง spinner แทน
2. **ห้าม** replace innerHTML ด้วย skeleton แล้วไม่ replace กลับเมื่อโหลดเสร็จ
3. **ทุก async function ต้องมี try/catch** และต้องแสดงข้อมูล fallback เสมอ
4. **Optimistic UI** — แสดงชื่อจาก Auth ก่อน แล้ว update จาก Firestore ทีหลัง ห้ามปล่อยว่าง
5. **balance** ต้องแสดง `0.00` เสมอ ห้ามว่าง แม้ Firestore error

### Spinner Pattern (แทน skeleton)
```javascript
// แสดง spinner ระหว่างโหลด
function showSpinner(containerId) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;padding:32px;color:#94a3b8;gap:10px;">
            <div style="width:22px;height:22px;border:2px solid #bae6fd;border-top-color:#0ea5e9;
                        border-radius:50%;animation:spin .8s linear infinite;"></div>
            กำลังโหลด...
        </div>`;
}

// แสดงข้อความเมื่อไม่มีข้อมูล
function showEmpty(containerId, msg = 'ไม่มีข้อมูล') {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:#94a3b8;">
            <i class="fa-solid fa-inbox" style="font-size:2rem;color:#cbd5e1;margin-bottom:10px;display:block;"></i>
            <p style="font-weight:600;color:#64748b;">${escapeHtml(msg)}</p>
        </div>`;
}

// แสดง error
function showError(containerId, msg = 'เกิดข้อผิดพลาด กรุณาลองใหม่') {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:#ef4444;">
            <i class="fa-solid fa-circle-exclamation" style="font-size:2rem;margin-bottom:10px;display:block;"></i>
            <p style="font-weight:600;">${escapeHtml(msg)}</p>
            <button onclick="location.reload()" style="margin-top:12px;padding:8px 20px;background:#ef4444;color:white;border:none;border-radius:8px;cursor:pointer;font-family:Prompt;">
                โหลดใหม่
            </button>
        </div>`;
}
```

### Try/Catch Pattern มาตรฐาน
```javascript
async function loadData() {
    showSpinner('containerId'); // แสดง spinner ก่อน
    try {
        const snap = await getDoc(doc(db, 'collection', 'id'));
        if (!snap.exists()) {
            showEmpty('containerId', 'ไม่มีข้อมูล');
            return;
        }
        const data = snap.data();
        // render data...
        document.getElementById('containerId').innerHTML = renderHTML(data);
    } catch (err) {
        console.error('[loadData] error:', err);
        showError('containerId');   // ✅ ต้องแสดง error เสมอ
        showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    }
}
```

### onAuthStateChanged — ห้ามปล่อยว่าง
```javascript
// ✅ ถูก — แสดง fallback ทุกกรณี
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        updateBalance(0);
        updateName('ผู้ใช้');
        // redirect ถ้า page ต้อง login
        if (requireAuth) location.href = './login.html?redirect=' + encodeURIComponent(location.href);
        return;
    }
    updateName(user.displayName || user.email?.split('@')[0] || 'ผู้ใช้'); // optimistic
    updateBalance(0); // optimistic
    try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
            const d = snap.data();
            updateName(d.displayName || user.displayName || 'ผู้ใช้');
            updateBalance(d.balance ?? 0);
        }
    } catch (e) {
        // ❌ ห้าม silent fail — ต้องแสดง fallback
        updateBalance(0);
        console.error('User load error:', e);
    }
});
```

---

## 🐛 Bug Fixes — แก้เพื่อความเสถียร

### Bug 1: balance แสดง 0 ทั้งที่มีเงิน
```javascript
// ❌ Bug: balance = 0 จะ falsy
const bal = data.balance || 0;

// ✅ Fix: ใช้ ?? เสมอ
const bal = data.balance ?? 0;
```

### Bug 2: Dropdown ไม่ปิด / ปิดไม่ได้
```javascript
// ❌ Bug: ใช้ class 'show' (ไม่มีใน CSS)
dropdown.classList.toggle('show');

// ✅ Fix: ใช้ class 'active'
dropdown.classList.toggle('active');
// CSS: .glass-dropdown { opacity:0; visibility:hidden; }
//      .glass-dropdown.active { opacity:1; visibility:visible; }
```

### Bug 3: Sidebar ซ่อนไม่ได้
```javascript
// ❌ Bug: classList.hidden ถูก !important override
el.classList.remove('hidden');
el.classList.add('hidden');

// ✅ Fix: ใช้ style.display
el.style.display = 'flex';  // หรือ 'block'
el.style.display = 'none';
```

### Bug 4: Import ไม่ทำงาน (module error)
```html
<!-- ❌ Bug: ขาด type="module" -->
<script src="js/frontend/topup.js"></script>

<!-- ✅ Fix -->
<script type="module" src="js/frontend/topup.js"></script>
```

### Bug 5: Layout พังบน self-contained pages
```html
<!-- ❌ Bug: reference css/common.css ที่ไม่มี styles ครบ -->
<link rel="stylesheet" href="css/common.css">

<!-- ✅ Fix: ใช้ inline <style> self-contained + Tailwind CDN -->
<script src="https://cdn.tailwindcss.com"></script>
<style>/* ทุก component style อยู่ในนี้ */</style>
```

### Bug 6: Firestore query ล้มเหลวเพราะขาด index
```javascript
// ❌ Bug: query หลาย field โดยไม่มี composite index
query(collection(db, 'orders'),
    where('userId', '==', uid),
    where('status', '==', 'approved'),
    orderBy('createdAt', 'desc')  // ← ต้องสร้าง index ใน Firestore Console
)

// ✅ Fix: มี fallback ถ้า index ยังไม่ครบ
try {
    snap = await getDocs(query(col, where(...), where(...), orderBy(...)));
} catch {
    // fallback ไม่มี orderBy
    snap = await getDocs(query(col, where(...), where(...)));
}
```

### Bug 7: Firebase duplicate app error
```javascript
// ❌ Bug: initializeApp เรียกซ้ำ
const app = initializeApp(firebaseConfig);

// ✅ Fix: ตรวจก่อนเสมอ (อยู่ใน firebase-config.js แล้ว)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
```

### Bug 8: Redeem code — ต้องสร้าง Firestore index
- Collection: `redeem_codes`
- Index: field `code` ASC (single field)
- ถ้าไม่มี → query `where('code','==',input)` จะ error

### Bug 9: ghostUser — Auth มี user แต่ Firestore ไม่มี doc
```javascript
// ✅ Fix ใน onAuthStateChanged
const snap = await getDoc(doc(db, 'users', user.uid));
if (!snap.exists()) {
    // สร้าง doc ให้อัตโนมัติ
    await setDoc(doc(db, 'users', user.uid), {
        uid:         user.uid,
        email:       user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || 'ผู้ใช้',
        balance:     0,
        role:        'user',
        websiteId:   detectWebsiteId(), // null หรือ subdomain
        createdAt:   serverTimestamp()
    });
}
```

### Bug 10: Storage upload ไม่ได้ถ้า CORS ไม่ถูกตั้ง
- Firebase Storage bucket ต้องตั้ง CORS ใน Google Cloud Console
- หรือใช้ `gsutil cors set cors.json gs://psl-esport.firebasestorage.app`
- cors.json: `[{"origin":["*"],"method":["GET","POST","PUT"],"maxAgeSeconds":3600}]`

### ทุกครั้งที่มีการสั่งงานต้องแยกไฟล์ css js html ตลอด และจดบันทึกลง message.md ทุกครั้ง และย้ำว่าในไฟล์มีการนำทางของไฟล์ที่ถูกอยู่แล้ว อย่าแก้นอกจากผู้ใช้สั่ง