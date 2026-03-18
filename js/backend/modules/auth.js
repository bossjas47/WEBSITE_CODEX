// ==================== Initialization ====================
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js");
        const { getFirestore, collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, where, onSnapshot, runTransaction, addDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        
        window.firestoreFns = { collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, where, onSnapshot, runTransaction, addDoc };
        // Expose Timestamp for fake-stats.js (date fields)
        try {
            const _m = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            if (_m.Timestamp) window.firestoreFns.Timestamp = _m.Timestamp;
        } catch (_e) {}
        
        console.log('Firebase initialized');
        await initSystem();
        setupTopupRealtime();
        initCustomDropdowns();

    } catch (error) {
        console.error('Firebase Error:', error);
        showError('ไม่สามารถโหลด Firebase: ' + error.message);
    }
});

async function initSystem() {
    try {
        const { doc, getDoc } = window.firestoreFns;
        const settingsSnap = await getDoc(doc(db, 'system', 'settings'));
        
        hideElement('bootLoader');
        
        if (!settingsSnap.exists() || !settingsSnap.data().adminPin) {
            showElement('setupScreen');
        } else {
            adminPin = settingsSnap.data().adminPin;
            showElement('lockScreen');
            initPinInputs();
        }
    } catch (e) {
        console.error('Init error:', e);
        hideElement('bootLoader');
        showElement('setupScreen');
    }
}

function showElement(id) {
    document.getElementById(id).classList.remove('hidden');
}

function hideElement(id) {
    document.getElementById(id).classList.add('hidden');
}

function showError(msg) {
    hideElement('bootLoader');
    showElement('errorScreen');
    document.getElementById('errorMessage').textContent = msg;
}

function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('active');
}

function initPinInputs() {
    const inputs = document.querySelectorAll('.pin-input');
    inputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            if (e.target.value.length === 1 && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
            if (index === inputs.length - 1 && e.target.value) {
                setTimeout(verifyPin, 100);
            }
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && index > 0) {
                inputs[index - 1].focus();
            }
        });
    });
}

async function verifyPin() {
    const inputs = document.querySelectorAll('.pin-input');
    const pin = Array.from(inputs).map(i => i.value).join('');
    
    if (pin.length !== 6) return;
    
    if (pin === adminPin) {
        // ผู้ที่เข้าด้วย PIN ถูกต้องจะเป็น Super Admin เสมอ และสามารถจัดการยศได้ทั้งหมด
        currentUserRole = 'super_admin';
        currentUserPermissions = availablePermissions.map(p => p.value);
        
        hideElement('lockScreen');
        showElement('adminWrapper');
        updateUIBasedOnPermissions();
        loadDashboard();
    } else {
        document.getElementById('pinError').classList.remove('hidden');
        inputs.forEach(i => i.value = '');
        inputs[0].focus();
    }
}

async function submitFirstSetup() {
    const pin = document.getElementById('setupPin').value.trim();
    if (pin.length !== 6) {
        showToast('PIN ต้องมี 6 หลัก', 'error');
        return;
    }
    
    try {
        const { doc, setDoc, collection, addDoc, serverTimestamp } = window.firestoreFns;
        
        // Save admin pin and mark as super admin setup completed
        await setDoc(doc(db, 'system', 'settings'), {
            adminPin: pin,
            superAdminSetup: true,
            createdAt: new Date().toISOString()
        });
        
        // Create default roles including super_admin
        await createDefaultRoles();
        
        adminPin = pin;
        // คนแรกที่ตั้งค่าจะเป็น Super Admin
        currentUserRole = 'super_admin';
        currentUserPermissions = availablePermissions.map(p => p.value);
        
        hideElement('setupScreen');
        showElement('adminWrapper');
        showToast('ตั้งค่า Super Admin สำเร็จ คุณมีสิทธิ์เต็มรูปแบบในการจัดการยศ', 'success');
        updateUIBasedOnPermissions();
        loadDashboard();
    } catch (e) {
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

async function createDefaultRoles() {
    const { doc, setDoc, serverTimestamp } = window.firestoreFns;
    
    const defaultRoles = [
        {
            id: 'super_admin',
            name: 'Super Admin',
            code: 'super_admin',
            description: 'ผู้ดูแลระบบสูงสุด มีสิทธิ์ทั้งหมดรวมถึงการจัดการยศและผู้ดูแลอื่น',
            permissions: availablePermissions.map(p => p.value),
            isDefault: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        },
        {
            id: 'admin',
            name: 'ผู้ดูแลระบบ',
            code: 'admin',
            description: 'มีสิทธิ์จัดการทุกอย่างในระบบ',
            permissions: availablePermissions.map(p => p.value),
            isDefault: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        },
        {
            id: 'user',
            name: 'ผู้ใช้ทั่วไป',
            code: 'user',
            description: 'ผู้ใช้งานทั่วไป ไม่มีสิทธิ์เข้าถึงระบบหลังบ้าน',
            permissions: [],
            isDefault: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        },
        {
            id: 'agent',
            name: 'ตัวแทน',
            code: 'agent',
            description: 'ตัวแทนจำหน่าย ดูยอดขายและจัดการคำสั่งซื้อได้',
            permissions: ['view_dashboard', 'view_reports', 'manage_orders', 'view_messages'],
            isDefault: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }
    ];
    
    for (const role of defaultRoles) {
        const { id, ...data } = role;
        await setDoc(doc(db, 'roles', id), data);
    }
}

function lockSession() {
    hideElement('adminWrapper');
    showElement('lockScreen');
    document.querySelectorAll('.pin-input').forEach(i => i.value = '');
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('sidebarOverlay').classList.remove('active');
}

// ==================== Permission System ====================

function hasPermission(permission) {
    return currentUserPermissions.includes(permission);
}

function updateUIBasedOnPermissions() {
    // Update admin display for Super Admin
    const roleDisplay = document.getElementById('adminRoleDisplay');
    const adminName = document.getElementById('adminName');
    const adminAvatar = document.getElementById('adminAvatar');
    const sidebarIcon = document.getElementById('sidebarIcon');
    
    if (currentUserRole === 'super_admin') {
        if (roleDisplay) {
            roleDisplay.innerHTML = `
                <span class="relative flex h-2 w-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                Super Admin
            `;
        }
        if (adminName) adminName.textContent = 'Super Admin';
        if (adminAvatar) {
            adminAvatar.innerHTML = '<i class="fa-solid fa-crown"></i>';
            adminAvatar.className = 'w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-lg shadow-md';
        }
        if (sidebarIcon) sidebarIcon.className = 'fa-solid fa-crown';
    } else {
        if (roleDisplay) {
            const roleName = allRoles.find(r => r.code === currentUserRole)?.name || currentUserRole;
            roleDisplay.innerHTML = `
                <span class="relative flex h-2 w-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                ${roleName}
            `;
        }
    }
    
    // Update sidebar menu items based on permissions
    document.querySelectorAll('.nav-item[data-perm]').forEach(item => {
        const requiredPerm = item.getAttribute('data-perm');
        if (!hasPermission(requiredPerm)) {
            item.classList.add('disabled');
            item.style.display = 'none';
        } else {
            item.classList.remove('disabled');
            item.style.display = 'flex';
        }
    });
}

function checkAccess(permission) {
    if (!hasPermission(permission)) {
        showToast('คุณไม่มีสิทธิ์เข้าถึงส่วนนี้', 'error');
        switchTab('dashboard');
        return false;
    }
    return true;
}

