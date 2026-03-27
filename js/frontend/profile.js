/**
 * Profile Module - PanderX Frontend
 * 
 * RULES (from SKILL.md):
 * - Use ?? not || for balance (balance=0 must display 0)
 * - Use style.display, never classList.remove('hidden') 
 * - Dropdown uses class "active" not "show"
 * - Always escapeHtml before DOM insertion (XSS protection)
 * - Optimistic UI: show Auth data first, then update from Firestore
 * - All async functions must have try/catch with fallback UI
 */

import { auth, db } from '../firebase-config.js';
import {
    onAuthStateChanged, updateProfile, updatePassword, signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    doc, getDoc, setDoc, updateDoc, collection,
    query, where, getDocs, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ── Utility: Escape HTML (XSS Protection) ───────────────────────────────────
function escapeHtml(text) {
    if (typeof text !== 'string') return String(text ?? '');
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ── Utility: Format Balance ─────────────────────────────────────────────────
function formatBalance(val) {
    return Number(val ?? 0).toLocaleString('th-TH', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    });
}

// ── Global State ────────────────────────────────────────────────────────────
let _currentUser = null;
let _userUnsubscribe = null;
let _isInitialized = false;

// ── Auth Guard & Initialization ─────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // Redirect to login if not authenticated
        window.location.href = './login.html?redirect=' + encodeURIComponent(window.location.href);
        return;
    }

    // Prevent duplicate initialization
    if (_isInitialized && user.uid === _currentUser?.uid) return;
    _currentUser = user;
    _isInitialized = true;

    // Optimistic UI: Show Auth data immediately
    const displayName = user.displayName || user.email?.split('@')[0] || 'ผู้ใช้';
    const email = user.email || '';
    const initial = displayName.charAt(0).toUpperCase();

    // Update UI immediately (Optimistic)
    updateProfileUI({
        displayName,
        email,
        initial,
        balance: 0,
        role: 'user',
        phone: ''
    });

    // Setup real-time listener for Firestore data
    setupUserListener(user.uid);
    
    // Load stats
    loadUserStats(user.uid);
});

// ── Setup Real-time User Listener ───────────────────────────────────────────
function setupUserListener(uid) {
    // Cleanup previous listener if exists
    if (_userUnsubscribe) {
        _userUnsubscribe();
    }

    const userRef = doc(db, 'users', uid);
    
    _userUnsubscribe = onSnapshot(userRef, (snap) => {
        if (!snap.exists()) {
            // Ghost user repair: Create doc if missing
            createUserDoc(uid);
            return;
        }

        const data = snap.data();
        
        // CRITICAL: Use ?? not || for balance
        const balance = data.balance ?? 0;
        const displayName = data.displayName || _currentUser.displayName || _currentUser.email?.split('@')[0] || 'ผู้ใช้';
        const role = data.role || 'user';
        const phone = data.phone || '';
        const email = _currentUser.email || '';
        const initial = displayName.charAt(0).toUpperCase();

        // Update UI with Firestore data
        updateProfileUI({
            displayName,
            email,
            initial,
            balance,
            role,
            phone,
            createdAt: data.createdAt
        });

        // Update Admin menu visibility
        updateAdminVisibility(role);

    }, (error) => {
        console.error('[Profile] User listener error:', error);
        window.showToast('ไม่สามารถโหลดข้อมูลผู้ใช้ได้', 'error');
    });
}

// ── Create User Doc (Ghost Repair) ────────────────────────────────────────────
async function createUserDoc(uid) {
    try {
        const user = auth.currentUser;
        if (!user) return;
        
        const displayName = user.displayName || user.email?.split('@')[0] || 'ผู้ใช้';
        const websiteId = detectWebsiteId();
        
        await setDoc(doc(db, 'users', uid), {
            uid: uid,
            email: user.email || '',
            displayName: displayName,
            balance: 0,
            role: 'user',
            websiteId: websiteId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        
        console.log('[Profile] Created missing user doc for:', uid);
    } catch (e) {
        console.error('[Profile] Failed to create user doc:', e);
    }
}

// ── Detect Website ID (Multi-tenant) ──────────────────────────────────────────
function detectWebsiteId() {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    // oke.panderx.xyz → 'oke'
    if (parts.length >= 3 && parts[parts.length-2] === 'panderx' && parts[parts.length-1] === 'xyz') {
        return parts[0];
    }
    return null;
}

// ── Update Profile UI ───────────────────────────────────────────────────────
function updateProfileUI(data) {
    const { displayName, email, initial, balance, role, phone, createdAt } = data;

    // Escape all values before insertion
    const safeName = escapeHtml(displayName);
    const safeEmail = escapeHtml(email);
    const safeInitial = escapeHtml(initial);
    const safeBalance = escapeHtml(formatBalance(balance));
    const safePhone = escapeHtml(phone || '');

    // Profile Card
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profileInitial = document.getElementById('profileInitial');
    const profileRoleBadge = document.getElementById('profileRoleBadge');
    const roleText = document.getElementById('roleText');
    const joinDateText = document.getElementById('joinDateText');

    if (profileName) profileName.textContent = safeName;
    if (profileEmail) profileEmail.textContent = safeEmail;
    if (profileInitial) profileInitial.textContent = safeInitial;

    // Role Badge
    if (profileRoleBadge && roleText) {
        const roleMap = { 
            super_admin: { text: '⭐ Super Admin', class: 'bg-purple-100 text-purple-700 border-purple-200' }, 
            admin: { text: '🛡 Admin', class: 'bg-indigo-100 text-indigo-700 border-indigo-200' }, 
            staff: { text: '💼 Staff', class: 'bg-sky-100 text-sky-700 border-sky-200' },
            user: { text: '👤 สมาชิก', class: 'bg-slate-100 text-slate-600 border-slate-200' }
        };
        const roleInfo = roleMap[role] || roleMap.user;
        roleText.textContent = roleInfo.text;
        profileRoleBadge.className = `profile-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${roleInfo.class}`;
    }

    // Join Date
    if (joinDateText && createdAt) {
        let date;
        if (createdAt.toDate) {
            date = createdAt.toDate();
        } else if (createdAt.seconds) {
            date = new Date(createdAt.seconds * 1000);
        } else {
            date = new Date(createdAt);
        }
        const thaiDate = date.toLocaleDateString('th-TH', { month: 'short', year: 'numeric' });
        joinDateText.textContent = `เข้าร่วม ${escapeHtml(thaiDate)}`;
    }

    // Update all avatars
    ['userAvatar', 'dropdownAvatar', 'sidebarAvatar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = safeInitial;
    });

    // Update names
    ['dropdownName', 'sidebarUsername'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = safeName;
    });

    // Update balances (CRITICAL: use ?? not ||)
    ['userBalance', 'dropdownBalance', 'sidebarBalance', 'statBalance'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = safeBalance;
    });

    // Update inputs
    const editName = document.getElementById('editDisplayName');
    const editEmail = document.getElementById('editEmail');
    const editPhone = document.getElementById('editPhone');

    if (editName && !editName.matches(':focus')) editName.value = displayName;
    if (editEmail) editEmail.value = email || '';
    if (editPhone && !editPhone.matches(':focus')) editPhone.value = phone || '';

    // Show content, hide loading
    const loadingEl = document.getElementById('profileLoading');
    const contentEl = document.getElementById('profileContent');
    
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) {
        contentEl.style.display = 'block';
        contentEl.style.opacity = '1';
    }

    // Update Sidebar visibility
    updateSidebarVisibility(true);
}

// ── Update Admin Menu Visibility ──────────────────────────────────────────────
function updateAdminVisibility(role) {
    const isAdmin = role === 'admin' || role === 'super_admin';
    
    // Dropdown Admin Panel
    const dropdownAdmin = document.getElementById('dropdownAdminPanel');
    if (dropdownAdmin) {
        dropdownAdmin.style.display = isAdmin ? 'flex' : 'none';
    }
    
    // Sidebar Admin Button
    const sidebarAdmin = document.getElementById('sidebarAdminBtn');
    if (sidebarAdmin) {
        sidebarAdmin.style.display = isAdmin ? 'flex' : 'none';
    }
}

// ── Update Sidebar Visibility ───────────────────────────────────────────────
function updateSidebarVisibility(isAuthenticated) {
    const guestSection = document.getElementById('sidebarAuthGuest');
    const userSection = document.getElementById('sidebarAuthUser');
    const userStrip = document.getElementById('sidebarUserStrip');
    const loginBtn = document.getElementById('loginBtn');
    const userProfile = document.getElementById('userProfile');

    if (isAuthenticated) {
        if (guestSection) guestSection.style.display = 'none';
        if (userSection) userSection.style.display = 'block';
        if (userStrip) userStrip.style.display = 'flex';
        if (loginBtn) loginBtn.style.display = 'none';
        if (userProfile) userProfile.style.display = 'block';
    } else {
        if (guestSection) guestSection.style.display = 'block';
        if (userSection) userSection.style.display = 'none';
        if (userStrip) userStrip.style.display = 'none';
        if (loginBtn) loginBtn.style.display = 'flex';
        if (userProfile) userProfile.style.display = 'none';
    }
}

// ── Load User Stats ───────────────────────────────────────────────────────────
async function loadUserStats(uid) {
    try {
        // Count orders
        const ordersQuery = query(
            collection(db, 'orders'), 
            where('userId', '==', uid)
        );
        const ordersSnap = await getDocs(ordersQuery);
        const orderCount = ordersSnap.size;
        
        // Count approved orders (websites)
        const approvedCount = ordersSnap.docs.filter(d => d.data().status === 'approved').length;

        // Update stats (with animation)
        animateValue('statOrders', 0, orderCount, 800);
        animateValue('statWebsites', 0, approvedCount, 800);

    } catch (error) {
        console.error('[Profile] Load stats error:', error);
        // Fallback to 0
        const statOrders = document.getElementById('statOrders');
        const statWebsites = document.getElementById('statWebsites');
        if (statOrders) statOrders.textContent = '0';
        if (statWebsites) statWebsites.textContent = '0';
    }
}

// ── Animate Number ────────────────────────────────────────────────────────────
function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;
    
    if (end === 0) {
        obj.textContent = '0';
        return;
    }
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        const current = Math.floor(start + (end - start) * easeOut);
        obj.textContent = current.toLocaleString('th-TH');
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// ── Save Profile ──────────────────────────────────────────────────────────────
window.saveProfile = async function() {
    const btn = document.getElementById('saveProfileBtn');
    const nameInput = document.getElementById('editDisplayName');
    const phoneInput = document.getElementById('editPhone');
    
    const name = nameInput?.value?.trim();
    const phone = phoneInput?.value?.trim() || '';

    if (!name) {
        window.showToast('กรุณากรอกชื่อแสดง', 'warning');
        return;
    }

    // XSS Sanitize
    const sanitizedName = name.replace(/[<>\"']/g, '');
    const sanitizedPhone = phone.replace(/[<>\"']/g, '');

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'กำลังบันทึก...';
    }

    try {
        const user = auth.currentUser;
        if (!user) throw new Error('ไม่พบผู้ใช้');

        // Update Auth profile
        await updateProfile(user, { displayName: sanitizedName });
        
        // Update Firestore
        await updateDoc(doc(db, 'users', user.uid), {
            displayName: sanitizedName,
            phone: sanitizedPhone,
            updatedAt: serverTimestamp()
        });

        // Update UI immediately (Optimistic)
        updateProfileUI({
            displayName: sanitizedName,
            email: user.email,
            initial: sanitizedName.charAt(0).toUpperCase(),
            balance: 0, // Will be updated by listener
            role: 'user',
            phone: sanitizedPhone
        });

        window.showToast('บันทึกข้อมูลเรียบร้อย', 'success');
    } catch (e) {
        console.error('[Profile] Save error:', e);
        window.showToast('เกิดข้อผิดพลาด: ' + escapeHtml(e.message), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'บันทึกข้อมูล';
        }
    }
};

// ── Change Password ───────────────────────────────────────────────────────────
window.changePassword = async function() {
    const newPass = document.getElementById('newPassword')?.value;
    const confirmPass = document.getElementById('confirmPassword')?.value;

    if (!newPass || newPass.length < 6) {
        window.showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัว', 'warning');
        return;
    }
    
    if (newPass !== confirmPass) {
        window.showToast('รหัสผ่านไม่ตรงกัน', 'error');
        return;
    }

    try {
        const user = auth.currentUser;
        if (!user) throw new Error('ไม่พบผู้ใช้');

        await updatePassword(user, newPass);
        
        // Clear inputs
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        
        window.showToast('เปลี่ยนรหัสผ่านเรียบร้อย', 'success');
    } catch (e) {
        console.error('[Profile] Password change error:', e);
        let msg = e.message;
        if (e.code === 'auth/requires-recent-login') {
            msg = 'กรุณาเข้าสู่ระบบใหม่อีกครั้งก่อนเปลี่ยนรหัสผ่าน';
        }
        window.showToast('เกิดข้อผิดพลาด: ' + escapeHtml(msg), 'error');
    }
};

// ── Logout ───────────────────────────────────────────────────────────────────
window.handleLogout = async function() {
    try {
        // Cleanup listener
        if (_userUnsubscribe) {
            _userUnsubscribe();
            _userUnsubscribe = null;
        }
        
        await signOut(auth);
        window.showToast('ออกจากระบบแล้ว', 'success');
        
        setTimeout(() => {
            window.location.href = './index.html';
        }, 700);
    } catch (e) {
        console.error('[Profile] Logout error:', e);
        window.showToast('เกิดข้อผิดพลาดในการออกจากระบบ', 'error');
    }
};

// ── Cleanup on page unload ────────────────────────────────────────────────────
window.addEventListener('beforeunload', () => {
    if (_userUnsubscribe) {
        _userUnsubscribe();
    }
});
