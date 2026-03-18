// js/frontend/login.js
// Security: rate limiting, websiteId tenant detection, input sanitization
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    deleteUser,
    browserLocalPersistence,
    browserSessionPersistence,
    setPersistence,
    onAuthStateChanged,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore,
    doc, setDoc, getDoc, updateDoc, collection, addDoc,
    serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── Firebase init ──────────────────────────────────────────────────────────────
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

// ── WebsiteId Detection ────────────────────────────────────────────────────────
// If running on oke.panderx.xyz → websiteId = 'oke'
// If running on panderx.xyz, localhost, rent.panderx.xyz → websiteId = null (main platform)
const MAIN_DOMAINS = ['panderx.xyz', 'rent.panderx.xyz', 'localhost', '127.0.0.1'];

function detectWebsiteId() {
    const hostname = window.location.hostname;
    if (MAIN_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d) && hostname.split('.').length === 2)) {
        return null; // main platform
    }
    // Sub-subdomain: oke.panderx.xyz → 'oke'
    const parts = hostname.split('.');
    if (parts.length >= 3 && parts[parts.length - 2] === 'panderx' && parts[parts.length - 1] === 'xyz') {
        return parts[0]; // e.g. 'oke'
    }
    return null;
}

const websiteId = detectWebsiteId();
const isSubsite = websiteId !== null;

// Apply sub-site branding if on sub-domain
if (isSubsite) {
    document.title = `เข้าสู่ระบบ | ${websiteId}.panderx.xyz`;
    // Load site settings for this subdomain
    (async () => {
        try {
            const snap = await getDoc(doc(db, 'websites', websiteId));
            if (snap.exists()) {
                const data = snap.data();
                if (data.settings?.siteName) {
                    document.title = `เข้าสู่ระบบ | ${data.settings.siteName}`;
                    document.querySelectorAll('.site-brand, h1').forEach(el => {
                        if (el.textContent === 'PanderX') el.textContent = data.settings.siteName;
                    });
                }
            }
        } catch (_) {}
    })();
}

// ── Rate Limiting (localStorage) ──────────────────────────────────────────────
const RL_KEY    = 'panderx_login_attempts';
const RL_MAX    = 5;     // max attempts
const RL_WINDOW = 15 * 60 * 1000; // 15 min window

function getRLState() {
    try {
        const raw = localStorage.getItem(RL_KEY);
        if (!raw) return { attempts: 0, windowStart: Date.now() };
        const state = JSON.parse(raw);
        if (Date.now() - state.windowStart > RL_WINDOW) {
            // Window expired → reset
            const fresh = { attempts: 0, windowStart: Date.now() };
            localStorage.setItem(RL_KEY, JSON.stringify(fresh));
            return fresh;
        }
        return state;
    } catch (_) { return { attempts: 0, windowStart: Date.now() }; }
}

function incrementRL() {
    const s = getRLState();
    s.attempts++;
    localStorage.setItem(RL_KEY, JSON.stringify(s));
    return s.attempts;
}

function resetRL() {
    localStorage.removeItem(RL_KEY);
}

function isRateLimited() {
    const s = getRLState();
    return s.attempts >= RL_MAX;
}

function getWaitMinutes() {
    const s = getRLState();
    const remaining = RL_WINDOW - (Date.now() - s.windowStart);
    return Math.ceil(remaining / 60000);
}

// ── XSS-safe sanitize ─────────────────────────────────────────────────────────
function sanitize(str) {
    return String(str).replace(/[<>"'`]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;','`':'&#x60;'}[c]));
}

// ── Constants ──────────────────────────────────────────────────────────────────
const USERNAME_DOMAIN = '@panderx.user';
const usernameToEmail = u => u.toLowerCase() + USERNAME_DOMAIN;
const emailToUsername = e => e.replace(USERNAME_DOMAIN, '');

// ── State ──────────────────────────────────────────────────────────────────────
let isLogin = true;

// ── Elements ───────────────────────────────────────────────────────────────────
const form         = document.getElementById('authForm');
const usernameEl   = document.getElementById('username');
const passwordEl   = document.getElementById('password');
const confirmEl    = document.getElementById('confirmPassword');
const confirmGroup = document.getElementById('confirmGroup');
const loginOptions = document.getElementById('loginOptions');
const submitBtn    = document.getElementById('submitBtn');
const btnText      = document.getElementById('btnText');
const toggleMode   = document.getElementById('toggleMode');
const toggleText   = document.getElementById('toggleText');
const subtitleEl   = document.getElementById('subtitle');

// ── Auth state → redirect if already logged in ────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    try {
        const userRef  = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            // Ghost user repair
            const username = user.displayName || emailToUsername(user.email);
            await setDoc(userRef, {
                uid:         user.uid,
                username,
                email:       user.email,
                displayName: username,
                role:        'user',
                isAdmin:     false,
                isBanned:    false,
                status:      'online',
                balance:     0,
                websiteId:   websiteId,        // ← Tenant isolation
                createdAt:   serverTimestamp(),
                lastLogin:   serverTimestamp(),
                loginCount:  1,
                provider:    'password',
                ghostFixed:  true
            });
        } else {
            // Update last seen — but NOT overwrite websiteId if already set
            const existingData = userSnap.data();
            const updatePayload = {
                lastSeen:   serverTimestamp(),
                status:     'online',
                loginCount: increment(1)
            };
            // Only set websiteId if on a sub-site AND user has no websiteId yet
            if (isSubsite && !existingData.websiteId) {
                updatePayload.websiteId = websiteId;
            }
            await updateDoc(userRef, updatePayload);
        }

        resetRL();
        showToast('เข้าสู่ระบบสำเร็จ!', 'success');

        const redirect = new URLSearchParams(location.search).get('redirect');
        setTimeout(() => {
            location.href = redirect && isValidRedirect(redirect) ? redirect : './index.html';
        }, 800);

    } catch (e) {
        console.error('Auth state handler error:', e);
        showToast('มีปัญหาในการซิงค์ข้อมูล กรุณาลองใหม่', 'error');
    }
});

// Prevent open redirects
function isValidRedirect(url) {
    try {
        const u = new URL(url, location.origin);
        return u.origin === location.origin;
    } catch (_) { return false; }
}

// ── Toggle login/register ──────────────────────────────────────────────────────
toggleMode.addEventListener('click', () => {
    isLogin = !isLogin;
    subtitleEl.textContent  = isLogin ? 'เข้าสู่ระบบด้วยชื่อผู้ใช้' : 'สร้างบัญชีใหม่';
    toggleText.textContent  = isLogin ? 'ยังไม่มีบัญชี?' : 'มีบัญชีอยู่แล้ว?';
    toggleMode.textContent  = isLogin ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
    btnText.textContent     = isLogin ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก';
    confirmGroup.classList.toggle('hidden', isLogin);
    loginOptions.classList.toggle('hidden', !isLogin);
    document.querySelectorAll('.error-message').forEach(el => el.classList.remove('show'));
    document.querySelectorAll('.input-field').forEach(el => el.classList.remove('error'));
});

document.getElementById('togglePassword')?.addEventListener('click', () => {
    const t = passwordEl.type === 'password' ? 'text' : 'password';
    passwordEl.type = t;
});

// ── Get IP ─────────────────────────────────────────────────────────────────────
async function getIP() {
    try {
        const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
        return (await r.json()).ip || 'unknown';
    } catch (_) { return 'unknown'; }
}

// ── Save user to Firestore with retry + rollback ───────────────────────────────
async function saveUserToFirestore(user, username) {
    const userRef = doc(db, 'users', user.uid);

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const ip = await getIP();
            await setDoc(userRef, {
                uid:         user.uid,
                username,
                email:       user.email,
                displayName: username,
                role:        'user',
                isAdmin:     false,
                isBanned:    false,
                status:      'online',
                balance:     0,
                websiteId:   websiteId,    // ← CRITICAL: Tenant isolation
                createdAt:   serverTimestamp(),
                lastLogin:   serverTimestamp(),
                loginCount:  1,
                provider:    'password',
                ipAddress:   ip,
                userAgent:   navigator.userAgent
            });

            // Verify write
            await new Promise(r => setTimeout(r, 500));
            const verify = await getDoc(userRef);
            if (verify.exists()) return { success: true };
            throw new Error('VERIFY_FAILED');

        } catch (e) {
            if (attempt >= 3) {
                // Rollback Auth user
                try { await deleteUser(user); } catch (_) {}
                throw new Error(
                    e.code === 'permission-denied'
                    ? 'ไม่มีสิทธิ์บันทึกข้อมูล - บัญชีถูกยกเลิก'
                    : 'บันทึกข้อมูลไม่สำเร็จ - บัญชีถูกยกเลิก'
                );
            }
            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
}

// ── Form submit ────────────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Rate limit check
    if (isRateLimited()) {
        showToast(`⛔ พยายามหลายครั้งเกินไป กรุณารอ ${getWaitMinutes()} นาที`, 'error');
        return;
    }

    const username = sanitize(usernameEl.value.trim().toLowerCase());
    const password = passwordEl.value;
    const confirm  = confirmEl.value;

    // Validate
    document.querySelectorAll('.error-message').forEach(el => el.classList.remove('show'));
    document.querySelectorAll('.input-field').forEach(el => el.classList.remove('error'));
    let err = false;

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        document.getElementById('usernameError').classList.add('show');
        usernameEl.classList.add('error');
        err = true;
    }
    if (password.length < 6) {
        document.getElementById('passwordError').classList.add('show');
        passwordEl.classList.add('error');
        err = true;
    }
    if (!isLogin && password !== confirm) {
        document.getElementById('confirmError').classList.add('show');
        confirmEl.classList.add('error');
        err = true;
    }
    if (err) return;

    submitBtn.disabled = true;
    submitBtn.classList.add('loading');
    btnText.textContent = isLogin ? 'กำลังเข้าสู่ระบบ...' : 'กำลังสมัคร...';

    try {
        const fakeEmail  = usernameToEmail(username);
        const rememberMe = document.getElementById('rememberMe')?.checked;

        if (isLogin) {
            await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
            await signInWithEmailAndPassword(auth, fakeEmail, password);
            // onAuthStateChanged handles redirect

        } else {
            const cred = await createUserWithEmailAndPassword(auth, fakeEmail, password);
            await updateProfile(cred.user, { displayName: username });
            await saveUserToFirestore(cred.user, username);
            // Log registration
            addDoc(collection(db, 'logs'), {
                userId: cred.user.uid, username,
                action: 'register',
                websiteId,
                timestamp: serverTimestamp()
            }).catch(() => {});
        }

    } catch (error) {
        incrementRL(); // Count failed attempt

        const errorMap = {
            'auth/user-not-found':       'ไม่พบชื่อผู้ใช้นี้',
            'auth/wrong-password':       'รหัสผ่านไม่ถูกต้อง',
            'auth/invalid-credential':   'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
            'auth/email-already-in-use': 'ชื่อผู้ใช้นี้ถูกใช้แล้ว',
            'auth/weak-password':        'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
            'auth/too-many-requests':    'ถูกล็อกชั่วคราว กรุณารอสักครู่',
            'auth/network-request-failed': 'ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้'
        };

        const remaining = RL_MAX - getRLState().attempts;
        const msg = errorMap[error.code] || error.message || 'เกิดข้อผิดพลาด';
        showToast(msg + (remaining > 0 && isLogin ? ` (เหลือ ${remaining} ครั้ง)` : ''), 'error');

        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
        btnText.textContent = isLogin ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก';
    }
});

// ── Forgot password ────────────────────────────────────────────────────────────
window.forgotPassword = async () => {
    const username = prompt('กรุณากรอกชื่อผู้ใช้:');
    if (!username) return;
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) { showToast('ชื่อผู้ใช้ไม่ถูกต้อง', 'error'); return; }
    try {
        await sendPasswordResetEmail(auth, usernameToEmail(username.trim().toLowerCase()));
        showToast('ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว', 'success');
    } catch (_) { showToast('ไม่พบบัญชีนี้', 'error'); }
};

// ── Toast ──────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const colors = { success: 'text-emerald-500', error: 'text-red-500', warning: 'text-amber-500' };
    const paths  = {
        success: 'M5 13l4 4L19 7',
        error:   'M6 18L18 6M6 6l12 12',
        warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
    };
    toast.innerHTML = `<svg class="w-5 h-5 ${colors[type]||colors.error}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${paths[type]||paths.error}"/></svg>
        <span class="text-sm font-medium text-slate-700">${sanitize(msg)}</span>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, type === 'error' ? 5000 : 3000);
}
window.showToast = showToast;
