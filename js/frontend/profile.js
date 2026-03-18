// profile.js
import { auth, db } from '../firebase-config.js';
import {
    onAuthStateChanged, updateProfile, updatePassword
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    doc, getDoc, setDoc, updateDoc, collection,
    query, where, getDocs, onSnapshot, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ── Auth guard ────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = './login.html';
        return;
    }
    window._signOut = () => import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js')
        .then(m => m.signOut(auth));

    await loadProfile(user);
    syncSidebar(user.displayName || user.email.split('@')[0], user.email.charAt(0).toUpperCase());
});

// ── Load profile ──────────────────────────────────────────────────────────────
async function loadProfile(user) {
    const displayName = user.displayName || user.email.split('@')[0] || 'User';
    const initial     = displayName.charAt(0).toUpperCase();

    // Update all avatars with initial
    ['userAvatar', 'dropdownAvatar', 'sidebarAvatar', 'profileInitial'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = initial;
    });

    // Update navbar
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('userAvatar',   initial);
    set('dropdownAvatar', initial);
    set('dropdownName', displayName);
    const up = document.getElementById('userProfile');
    if (up) up.style.display = 'flex';
    const lb = document.getElementById('loginBtn');
    if (lb) lb.style.display = 'none';

    // Profile card
    set('profileName',    displayName);
    set('profileEmail',   user.email || '');
    set('profileInitial', initial);

    // Input fields
    const editName = document.getElementById('editDisplayName');
    const editEmail = document.getElementById('editEmail');
    if (editName)  editName.value  = displayName;
    if (editEmail) editEmail.value = user.email || '';

    // Join date badge
    const joinEl = document.getElementById('profileJoinBadge');
    if (joinEl && user.metadata?.creationTime) {
        const d = new Date(user.metadata.creationTime);
        joinEl.innerHTML = joinEl.innerHTML.replace('—',
            d.toLocaleDateString('th-TH', { month: 'short', year: 'numeric' }));
    }

    // Load Firestore user doc
    try {
        const userRef = doc(db, 'users', user.uid);
        onSnapshot(userRef, async (snap) => {
            const data = snap.exists() ? snap.data() : {};

            // Balance - ใช้ ?? และบังคับทศนิยม 2 ตำแหน่ง
            const bal = data.balance ?? 0;
            const balFmt = Number(bal).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            set('userBalance',    balFmt);
            set('dropdownBalance', balFmt);
            set('sidebarBalance', balFmt);
            set('statBalance',    balFmt);

            // Role badge และ Admin menu
        const roleBadge = document.getElementById('profileRoleBadge');
        const adminMenuItem = document.getElementById('dropdownAdminPanel');

        if (roleBadge && data.role) {
            const roleMap = { super_admin: '⭐ Super Admin', admin: '🛡 Admin', user: '👤 สมาชิก', staff: '💼 Staff' };
            roleBadge.innerHTML = roleMap[data.role] || '👤 สมาชิก';

            // แสดง/ซ่อน Admin Panel menu
            if (adminMenuItem) {
                const isAdmin = data.role === 'admin' || data.role === 'super_admin';
                adminMenuItem.style.display = isAdmin ? 'flex' : 'none';
            }
        } else if (adminMenuItem) {
            adminMenuItem.style.display = 'none';
        }

        // Phone
        const editPhone = document.getElementById('editPhone');
        if (editPhone && data.phone) editPhone.value = data.phone;

            // Phone
            const editPhone = document.getElementById('editPhone');
            if (editPhone && data.phone) editPhone.value = data.phone;

            // Sidebar
            set('sidebarUsername', displayName);
            set('sidebarAvatar',   initial);
            const strip = document.getElementById('sidebarUserStrip');
            if (strip) strip.style.display = 'flex';
            const authGuest = document.getElementById('sidebarAuthGuest');
            if (authGuest) authGuest.style.display = 'none';
            const authUser = document.getElementById('sidebarAuthUser');
            if (authUser) authUser.style.display = 'block';
        });

        // Count orders
        try {
            const oSnap = await getDocs(query(collection(db, 'orders'), where('userId', '==', user.uid)));
            set('statOrders', oSnap.size);
            const approved = oSnap.docs.filter(d => d.data().status === 'approved').length;
            set('statWebsites', approved);
        } catch (_) {}

    } catch (e) {
        console.error('Profile load error:', e);
    }
}

function syncSidebar(name, initial) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('sidebarUsername', name);
    set('sidebarAvatar',   initial);
}

// ── Save profile ──────────────────────────────────────────────────────────────
window.saveProfile = async function () {
    const btn = document.getElementById('saveProfileBtn');
    const name  = document.getElementById('editDisplayName')?.value.trim();
    const phone = document.getElementById('editPhone')?.value.trim();

    if (!name) { window.showToast('กรุณากรอกชื่อแสดง', 'warning'); return; }

    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';

    try {
        const user = auth.currentUser;
        await updateProfile(user, { displayName: name });
        await setDoc(doc(db, 'users', user.uid), { displayName: name, phone: phone || '' }, { merge: true });

        document.getElementById('profileName').textContent = name;
        document.getElementById('dropdownName').textContent = name;
        document.getElementById('sidebarUsername').textContent = name;
        window.showToast('บันทึกข้อมูลเรียบร้อย', 'success');
    } catch (e) {
        console.error(e);
        window.showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'บันทึกข้อมูล';
    }
};

// ── Change password ───────────────────────────────────────────────────────────
window.changePassword = async function () {
    const np = document.getElementById('newPassword')?.value;
    const cp = document.getElementById('confirmPassword')?.value;

    if (!np || np.length < 6) { window.showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัว', 'warning'); return; }
    if (np !== cp) { window.showToast('รหัสผ่านไม่ตรงกัน', 'error'); return; }

    try {
        await updatePassword(auth.currentUser, np);
        window.showToast('เปลี่ยนรหัสผ่านเรียบร้อย', 'success');
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
    } catch (e) {
        window.showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
};

// ── Logout ────────────────────────────────────────────────────────────────────
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
