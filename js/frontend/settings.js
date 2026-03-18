// settings.js
import { auth, db } from '../firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = './login.html';
        return;
    }
    
    // Setup signOut function
    window._signOut = () => import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js')
        .then(m => m.signOut(auth));

    // Get display name with proper fallback (using ?? per SKILL.md)
    const email = user.email ?? 'user';
    const displayName = user.displayName ?? email.split('@')[0] ?? 'User';
    const initial = displayName.charAt(0).toUpperCase();

    // Navbar
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('userAvatar',   initial);
    set('dropdownAvatar', initial);
    set('dropdownName', displayName);
    const up = document.getElementById('userProfile'); if (up) up.style.display = 'flex';
    const lb = document.getElementById('loginBtn');   if (lb) lb.style.display = 'none';

    // Realtime balance
    try {
        onSnapshot(doc(db, 'users', user.uid), (snap) => {
            const data  = snap.exists() ? snap.data() : {};
            const bal   = data.balance ?? 0;
            const balFmt = Number(bal).toLocaleString('th-TH');
            set('userBalance',    balFmt);
            set('dropdownBalance', balFmt);
            set('sidebarBalance', balFmt);

            const desc = document.getElementById('settingsBalanceDesc');
            if (desc) desc.textContent = `ยอดคงเหลือ: ฿${balFmt}`;

            // Sidebar
            set('sidebarUsername', displayName);
            set('sidebarAvatar',   initial);
            const strip = document.getElementById('sidebarUserStrip'); if (strip) strip.style.display = 'flex';
            const ag = document.getElementById('sidebarAuthGuest');    if (ag) ag.style.display = 'none';
            const au = document.getElementById('sidebarAuthUser');     if (au) au.style.display = 'block';
        });
    } catch (e) { console.error(e); }
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
