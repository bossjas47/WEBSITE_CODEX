// orders.js
import { auth, db } from '../firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    doc, collection, query, where, orderBy, onSnapshot as fsOnSnapshot
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = './login.html';
        return;
    }

    window._signOut = () => import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js')
        .then(m => m.signOut(auth));

    const displayName = user.displayName || user.email.split('@')[0] || 'User';
    const initial     = displayName.charAt(0).toUpperCase();

    // Navbar
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('userAvatar',   initial);
    set('dropdownAvatar', initial);
    set('dropdownName', displayName);
    const up = document.getElementById('userProfile'); if (up) up.style.display = 'flex';
    const lb = document.getElementById('loginBtn');   if (lb) lb.style.display = 'none';

    // Sidebar
    set('sidebarUsername', displayName);
    set('sidebarAvatar',   initial);
    const strip = document.getElementById('sidebarUserStrip'); if (strip) strip.style.display = 'flex';
    const ag = document.getElementById('sidebarAuthGuest');    if (ag) ag.style.display = 'none';
    const au = document.getElementById('sidebarAuthUser');     if (au) au.style.display = 'block';

    // Realtime balance
    fsOnSnapshot(doc(db, 'users', user.uid), (snap) => {
        const bal = snap.exists() ? (snap.data().balance ?? 0) : 0;
        const fmt = Number(bal).toLocaleString('th-TH');
        set('userBalance', fmt);
        set('dropdownBalance', fmt);
        set('sidebarBalance', fmt);
    });

    // Realtime orders
    try {
        const q = query(
            collection(db, 'orders'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc')
        );
        fsOnSnapshot(q, (snap) => {
            window.allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const count = document.getElementById('orderCount');
            if (count) count.textContent = `${window.allOrders.length} รายการ`;
            if (typeof window.renderOrders === 'function') window.renderOrders();
        });
    } catch (e) {
        // fallback without orderBy
        try {
            fsOnSnapshot(query(collection(db, 'orders'), where('userId', '==', user.uid)), (snap) => {
                window.allOrders = snap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => {
                        const ta = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
                        const tb = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
                        return tb - ta;
                    });
                if (typeof window.renderOrders === 'function') window.renderOrders();
            });
        } catch (_) {
            document.getElementById('ordersList').innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;">โหลดข้อมูลไม่สำเร็จ</div>';
        }
    }
});

window.handleLogout = async function () {
    try {
        const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        await signOut(auth);
        window.showToast('ออกจากระบบแล้ว', 'success');
        setTimeout(() => { window.location.href = './index.html'; }, 700);
    } catch (e) {
        window.showToast('เกิดข้อผิดพลาด', 'error');
    }
};
