// ============================================================
//  js/frontend/orders.js
//  Firebase 10.7.1 | import จาก firebase-config.js เท่านั้น
//  XSS-safe: ใช้ textContent + createElement ทุกจุด
//  balance ?? 0 | style.display ไม่ใช่ classList.hidden
// ============================================================

import { auth, db } from '../firebase-config.js';
import {
    onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    doc, collection, query, where,
    orderBy, onSnapshot, getDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ── State ─────────────────────────────────────────────────────
let currentUser       = null;
let balanceUnsub      = null;
let ordersUnsub       = null;

// ── escapeHtml (ใช้กับ innerHTML เท่านั้น ซึ่งเราพยายามหลีกเลี่ยง) ──
function escapeHtml(str) {
    if (typeof str !== 'string') return String(str ?? '');
    const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
}

// helper
const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
const show   = (id)    => { const el = document.getElementById(id); if (el) el.style.display = 'block'; };
const showFl = (id)    => { const el = document.getElementById(id); if (el) el.style.display = 'flex'; };
const hide   = (id)    => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };

// ── Format helpers ─────────────────────────────────────────────
function fmtBalance(raw) {
    return Number(raw ?? 0).toLocaleString('th-TH', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });
}
function fmtAmount(raw) {
    return Number(raw ?? 0).toLocaleString('th-TH');
}
function fmtDate(ts) {
    const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : new Date();
    return d.toLocaleDateString('th-TH', {
        day: 'numeric', month: 'short', year: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
}

// ── Auth state ─────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    hide('authLoading');

    if (!user) {
        hide('userProfile');
        location.href = `./login.html?redirect=${encodeURIComponent(location.href)}`;
        return;
    }

    currentUser = user;
    showFl('userProfile');
    hide('loginBtn');

    // Optimistic name
    const displayName = user.displayName || user.email?.split('@')[0] || 'ผู้ใช้';
    const initial     = displayName.charAt(0).toUpperCase();
    ['displayName','dropdownName','sidebarUsername'].forEach(id => setTxt(id, displayName));
    ['userAvatar','dropdownAvatar','sidebarAvatar'].forEach(id => setTxt(id, initial));

    // Sidebar show user
    show('sidebarUserStrip');
    show('sidebarAuthUser');
    hide('sidebarAuthGuest');

    // Start listeners
    startBalanceListener(user.uid);
    startOrdersListener(user.uid);

    // Site identity
    loadSiteIdentity();
});

// ── Balance real-time ──────────────────────────────────────────
function startBalanceListener(uid) {
    if (balanceUnsub) balanceUnsub();
    balanceUnsub = onSnapshot(doc(db, 'users', uid), (snap) => {
        const bal = snap.exists() ? (snap.data().balance ?? 0) : 0;   // ✅ ??
        const fmt = fmtBalance(bal);
        setTxt('userBalance',     fmt);
        setTxt('dropdownBalance', fmt);
        setTxt('sidebarBalance',  fmt);
    }, err => console.error('[orders] balance snapshot:', err));
}

// ── Orders real-time ───────────────────────────────────────────
function startOrdersListener(uid) {
    if (ordersUnsub) ordersUnsub();

    // ลอง with orderBy (ต้องการ Firestore composite index)
    let q;
    try {
        q = query(
            collection(db, 'orders'),
            where('userId', '==', uid),
            orderBy('createdAt', 'desc')
        );
    } catch {
        q = query(collection(db, 'orders'), where('userId', '==', uid));
    }

    ordersUnsub = onSnapshot(q, (snap) => {
        let orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // client-sort fallback ถ้าไม่มี orderBy
        orders.sort((a, b) => {
            const ta = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
            const tb = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
            return tb - ta;
        });

        window.allOrders = orders;

        // อัปเดต stats bar + badges
        updateStats(orders);

        // แสดง stats bar + filter ครั้งแรก
        const statsBar  = document.getElementById('statsBar');
        const filterRow = document.getElementById('filterRow');
        if (statsBar)  statsBar.style.display  = 'grid';
        if (filterRow) filterRow.style.display = 'flex';

        // อัปเดต count badge
        const countBadge = document.getElementById('orderCount');
        if (countBadge) {
            countBadge.style.display = 'inline-flex';
            setTxt('orderCountNum', orders.length);
        }

        renderOrders();

    }, (err) => {
        console.error('[orders] orders snapshot error:', err);

        // Fallback: query ไม่มี orderBy
        if (err.code === 'failed-precondition') {
            const qFallback = query(
                collection(db, 'orders'),
                where('userId', '==', uid)
            );
            ordersUnsub = onSnapshot(qFallback, (snap2) => {
                window.allOrders = snap2.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => {
                        const ta = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
                        const tb = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
                        return tb - ta;
                    });
                updateStats(window.allOrders);
                renderOrders();
            }, () => showErrorState());
        } else {
            showErrorState();
        }
    });
}

// ── Stats bar update ───────────────────────────────────────────
function updateStats(orders) {
    const total   = orders.length;
    const done    = orders.filter(o => o.status === 'completed' || o.status === 'approved').length;
    const pending = orders.filter(o => o.status === 'pending').length;
    setTxt('statTotal',   total);
    setTxt('statDone',    done);
    setTxt('statPending', pending);
}

// ── Render orders list ─────────────────────────────────────────
window.renderOrders = function () {
    const list     = document.getElementById('ordersList');
    if (!list) return;

    const f        = window.currentFilter || 'all';
    const orders   = window.allOrders || [];
    const filtered = f === 'all' ? orders : orders.filter(o => o.status === f);

    list.innerHTML = '';

    if (filtered.length === 0) {
        list.appendChild(buildEmptyState(f));
        return;
    }

    filtered.forEach((order, idx) => {
        const card = buildOrderCard(order);
        card.style.animationDelay = (idx * 0.04) + 's';
        card.classList.add('anim');
        list.appendChild(card);
    });
};

// ── Build order card (DOM — XSS safe) ─────────────────────────
function buildOrderCard(order) {
    const statusCfg = {
        completed: { label:'สำเร็จ',        icon:'fa-circle-check',  color:'#059669' },
        approved:  { label:'อนุมัติแล้ว',   icon:'fa-circle-check',  color:'#059669' },
        pending:   { label:'รอดำเนินการ',   icon:'fa-clock',         color:'#d97706' },
        rejected:  { label:'ถูกปฏิเสธ',    icon:'fa-circle-xmark',  color:'#dc2626' },
        cancelled: { label:'ยกเลิก',        icon:'fa-ban',           color:'#dc2626' },
    };
    const st = statusCfg[order.status] || statusCfg.pending;

    // Determine order type
    const isWebsite = !!(order.subdomain || order.websiteId || order.type === 'create' || order.type === 'renew');
    const isTopup   = order.type === 'topup';

    // Card element
    const card = document.createElement('div');
    card.className = `order-card ${order.status || 'pending'} ${isWebsite ? 'website' : ''}`;

    // ── Icon wrap ─────────────────────────────────────────────
    const iconWrap = document.createElement('div');
    iconWrap.className = `order-icon-wrap ${isWebsite ? 'type-website' : isTopup ? 'type-topup' : 'type-product'}`;
    const iconEl = document.createElement('i');
    iconEl.className = isWebsite ? 'fa-solid fa-globe' : isTopup ? 'fa-solid fa-wallet' : 'fa-solid fa-box';
    iconEl.style.cssText = `color:${isWebsite ? '#0ea5e9' : isTopup ? '#f59e0b' : '#10b981'};font-size:1.3rem;`;
    iconWrap.appendChild(iconEl);

    // ── Body ──────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'order-body';

    // Top row: name + status badge
    const topRow = document.createElement('div');
    topRow.className = 'order-top-row';

    const nameEl = document.createElement('div');
    nameEl.className = 'order-name';
    nameEl.textContent = order.productName || order.packageName || order.subdomain
        ? (order.productName || order.packageName || (order.subdomain ? `เว็บไซต์: ${order.subdomain}` : 'คำสั่งซื้อ'))
        : 'คำสั่งซื้อ';

    const badge = document.createElement('span');
    badge.className = `status-badge ${order.status || 'pending'}`;
    const dotEl = document.createElement('span');
    dotEl.className = 'status-dot';
    dotEl.style.color = st.color;
    const badgeTxt = document.createElement('span');
    badgeTxt.textContent = st.label;
    badge.appendChild(dotEl); badge.appendChild(badgeTxt);
    badge.style.color = st.color;

    topRow.appendChild(nameEl); topRow.appendChild(badge);

    // Meta row
    const meta = document.createElement('div');
    meta.className = 'order-meta';

    const addMeta = (iconClass, text) => {
        const item = document.createElement('span');
        item.className = 'order-meta-item';
        const i = document.createElement('i');
        i.className = iconClass;
        const t = document.createElement('span');
        t.textContent = text;
        item.appendChild(i); item.appendChild(t);
        meta.appendChild(item);
    };

    addMeta('fa-regular fa-calendar fa-fw', fmtDate(order.createdAt));
    if (order.durationDays) addMeta('fa-regular fa-clock fa-fw', `${order.durationDays} วัน`);
    if (order.type === 'renew') addMeta('fa-solid fa-rotate fa-fw', 'ต่ออายุ');
    if (order.type === 'create') addMeta('fa-solid fa-plus fa-fw', 'สร้างใหม่');

    // Footer row: domain + amount
    const footer = document.createElement('div');
    footer.className = 'order-footer';

    const domainEl = document.createElement('div');
    if (order.domain || order.subdomain) {
        domainEl.className = 'order-domain';
        const globeI = document.createElement('i');
        globeI.className = 'fa-solid fa-globe';
        globeI.style.cssText = 'font-size:.72rem;flex-shrink:0;';
        const domTxt = document.createElement('span');
        domTxt.textContent = order.domain || `${order.subdomain}.panderx.xyz`;
        domainEl.appendChild(globeI); domainEl.appendChild(domTxt);
    } else if (order.orderId) {
        domainEl.style.cssText = 'font-size:.75rem;color:#94a3b8;font-family:monospace;';
        domainEl.textContent = `#${order.orderId || order.id}`.slice(0, 18);
    }

    const amtEl = document.createElement('div');
    amtEl.className = 'order-amount';
    amtEl.textContent = '฿' + fmtAmount(order.totalAmount);

    footer.appendChild(domainEl); footer.appendChild(amtEl);

    body.appendChild(topRow);
    body.appendChild(meta);
    body.appendChild(footer);

    // ── Inner layout ─────────────────────────────────────────
    const inner = document.createElement('div');
    inner.className = 'order-card-inner';
    inner.appendChild(iconWrap);
    inner.appendChild(body);
    card.appendChild(inner);

    return card;
}

// ── Empty state ────────────────────────────────────────────────
function buildEmptyState(filter) {
    const msgMap = {
        all:       { icon:'fa-box-open',     title:'ไม่มีรายการ',          sub:'ยังไม่มีประวัติการสั่งซื้อ' },
        pending:   { icon:'fa-clock',        title:'ไม่มีรายการรอดำเนินการ', sub:'คำสั่งซื้อที่รอดำเนินการจะปรากฏที่นี่' },
        completed: { icon:'fa-circle-check', title:'ไม่มีรายการสำเร็จ',    sub:'คำสั่งซื้อที่สำเร็จแล้วจะปรากฏที่นี่' },
        approved:  { icon:'fa-circle-check', title:'ไม่มีรายการอนุมัติ',   sub:'' },
        rejected:  { icon:'fa-circle-xmark', title:'ไม่มีรายการปฏิเสธ',   sub:'' },
    };
    const cfg = msgMap[filter] || msgMap.all;

    const wrap = document.createElement('div');
    wrap.className = 'empty-wrap anim';

    const iconBg = document.createElement('div');
    iconBg.className = 'empty-icon-bg';
    const iconEl = document.createElement('i');
    iconEl.className = `fa-solid ${cfg.icon}`;
    iconEl.style.cssText = 'color:#94a3b8;';
    iconBg.appendChild(iconEl);

    const title = document.createElement('p');
    title.className = 'empty-title';
    title.textContent = cfg.title;

    const sub = document.createElement('p');
    sub.className = 'empty-sub';
    sub.textContent = cfg.sub;

    wrap.appendChild(iconBg);
    wrap.appendChild(title);
    if (cfg.sub) wrap.appendChild(sub);

    if (filter === 'all') {
        const link = document.createElement('a');
        link.href = './homerent.html';
        link.className = 'btn-cta';
        const linkIcon = document.createElement('i');
        linkIcon.className = 'fa-solid fa-globe';
        const linkTxt = document.createTextNode('เช่าเว็บไซต์เลย');
        link.appendChild(linkIcon); link.appendChild(linkTxt);
        wrap.appendChild(link);
    }

    return wrap;
}

// ── Error state ────────────────────────────────────────────────
function showErrorState() {
    const list = document.getElementById('ordersList');
    if (!list) return;
    list.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'empty-wrap';
    const iconBg = document.createElement('div');
    iconBg.className = 'empty-icon-bg';
    const iconEl = document.createElement('i');
    iconEl.className = 'fa-solid fa-wifi';
    iconEl.style.color = '#ef4444';
    iconBg.appendChild(iconEl);
    const title = document.createElement('p');
    title.className = 'empty-title';
    title.textContent = 'โหลดข้อมูลไม่สำเร็จ';
    const sub = document.createElement('p');
    sub.className = 'empty-sub';
    sub.textContent = 'กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่';
    const btn = document.createElement('button');
    btn.textContent = 'ลองใหม่';
    btn.style.cssText = 'padding:10px 22px;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:white;border:none;border-radius:10px;font-weight:700;font-size:.875rem;cursor:pointer;font-family:Prompt;margin-top:16px;';
    btn.onclick = () => location.reload();
    wrap.appendChild(iconBg); wrap.appendChild(title); wrap.appendChild(sub); wrap.appendChild(btn);
    list.appendChild(wrap);
}

// ── Logout ─────────────────────────────────────────────────────
window.handleLogout = async function () {
    try { await signOut(auth); } catch (e) { console.error(e); }
    if (balanceUnsub) balanceUnsub();
    if (ordersUnsub)  ordersUnsub();
    location.href = './index.html';
};

// ── Site identity ──────────────────────────────────────────────
async function loadSiteIdentity() {
    try {
        const snap = await getDoc(doc(db, 'system', 'site_settings'));
        if (!snap.exists()) return;
        const name = snap.data().siteName || 'PanderX';
        setTxt('navbarBrand',     name);
        setTxt('sidebarSiteName', name);
        setTxt('sidebarLogoIcon', name.charAt(0).toUpperCase());
        setTxt('siteFooterText',  `© ${new Date().getFullYear()} ${name}`);
        document.title = `ประวัติการสั่งซื้อ | ${name}`;
    } catch (e) { /* ใช้ default */ }
}
