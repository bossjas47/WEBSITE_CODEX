/**
 * PSL Esport — Multi-Tenant Firebase Config
 * รวมระบบ: Tenant Isolation + Theme Management + Admin System
 * 
 * การใช้งาน:
 * 1. เรียก setupTenantAuthListener() ใน App.js หลังโหลด
 * 2. ใช้ getTenantQuery() แทน query() ทุกครั้งที่ดึงข้อมูล
 * 3. ใช้ createTenantData() ก่อน addDoc() ทุกครั้ง
 */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc,
    onSnapshot,
    collection,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    getDocs,
    addDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, 
    browserLocalPersistence, 
    setPersistence,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. FIREBASE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════
const firebaseConfig = {
    apiKey:            "AIzaSyC450kePwL6FdVXUSVli0bEP3DdnQs0qzU",
    authDomain:        "psl-esport.firebaseapp.com",
    projectId:         "psl-esport",
    storageBucket:     "psl-esport.firebasestorage.app",
    messagingSenderId: "225108570173",
    appId:             "1:225108570173:web:b6483c02368908f3783a54"
};

const app  = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db   = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Force LOCAL persistence
setPersistence(auth, browserLocalPersistence).catch(() => {});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. TENANT STATE (เก็บสถานะปัจจุบัน)
// ═══════════════════════════════════════════════════════════════════════════════
let currentWebsiteId = null;    // 🔒 Tenant ID ปัจจุบัน
let currentUserRole = null;     // 🔒 Role: 'admin' | 'staff' | 'customer'
let currentUserId = null;
let isTenantInitialized = false;

// ═══════════════════════════════════════════════════════════════════════════════
// 3. CORE TENANT FUNCTIONS (ใหม่ - จำเป็นต้องใช้)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 🔥 เริ่มต้น Tenant Context - เรียกครั้งเดียวตอน Login
 * ดึง Custom Claims (websiteId, role) จาก Firebase Auth Token
 */
// [FIX] โดเมนที่ข้าม Tenant check (dev mode)
const EXCEPTION_DOMAINS = ['localhost', 'rent.panderx.xyz'];
const _isExceptionDomain = () => typeof window !== 'undefined' && EXCEPTION_DOMAINS.includes(window.location.hostname);

// [FIX] Email/displayName ของ SuperAdmin (เพิ่มที่นี่)
const SUPER_ADMIN_EMAILS = ['btest'];

export async function initTenant(user = null) {
    try {
        const targetUser = user || auth.currentUser;
        if (!targetUser) {
            clearTenantContext();
            throw new Error('No authenticated user');
        }

        currentUserId = targetUser.uid;

        // Force refresh token เพื่อดึง claims ล่าสุดจาก Cloud Function
        await targetUser.getIdToken(true);
        let tokenResult = await targetUser.getIdTokenResult();
        let claims = tokenResult.claims;

        // ถ้ายังไม่มี claims รอ Cloud Function 2 วินาทีแล้วลองใหม่
        if (!claims.websiteId) {
            console.log('⏳ รอ Cloud Function set claims... (attempt 1/3)');
            await new Promise(resolve => setTimeout(resolve, 2000));
            await targetUser.getIdToken(true);
            tokenResult = await targetUser.getIdTokenResult();
            claims = tokenResult.claims;

            if (!claims.websiteId) {
                console.log('⚠️ No claims found, checking user document...');

                // [FIX] ถ้าอยู่บน Exception Domain หรือเป็น SuperAdmin → ผ่านเลย
                const userEmail = targetUser.email || '';
                const userDisplay = targetUser.displayName || '';
                const isSuperAdminUser = SUPER_ADMIN_EMAILS.some(
                    e => userEmail.includes(e) || userDisplay.includes(e)
                );

                if (_isExceptionDomain() || isSuperAdminUser) {
                    currentWebsiteId = isSuperAdminUser ? 'super_admin' : 'localhost_dev';
                    currentUserRole = 'super_admin';
                    isTenantInitialized = true;
                    console.log('✅ Dev/SuperAdmin Mode:', currentWebsiteId, '| Role:', currentUserRole);
                    return { websiteId: currentWebsiteId, role: currentUserRole, userId: currentUserId };
                }

                // Firestore fallback: ดึงข้อมูล role จาก users/{uid}
                try {
                    const userDoc = await getDoc(doc(db, 'users', targetUser.uid));
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        if (userData.role === 'super_admin' || userData.superAdmin === true) {
                            currentWebsiteId = userData.websiteId || 'super_admin';
                            currentUserRole = 'super_admin';
                            isTenantInitialized = true;
                            console.log('✅ SuperAdmin via Firestore');
                            return { websiteId: currentWebsiteId, role: currentUserRole, userId: currentUserId };
                        }
                        if (userData.websiteId) {
                            currentWebsiteId = userData.websiteId;
                            currentUserRole = userData.role || 'customer';
                            isTenantInitialized = true;
                            console.log('✅ Tenant via Firestore:', currentWebsiteId);
                            return { websiteId: currentWebsiteId, role: currentUserRole, userId: currentUserId };
                        }
                    }
                } catch (e) {
                    console.warn('Firestore fallback failed:', e);
                }

                throw new Error('User not assigned to any tenant');
            }
        }

        currentWebsiteId = claims.websiteId;
        currentUserRole = claims.role || 'customer';
        isTenantInitialized = true;

        console.log('✅ Tenant Ready:', currentWebsiteId, '| Role:', currentUserRole);
        return { websiteId: currentWebsiteId, role: currentUserRole, userId: currentUserId };

    } catch (error) {
        console.error('❌ Tenant Init Failed:', error);
        clearTenantContext();
        throw error;
    }
}

/**
 * 🔄 Refresh Token เมื่อ Claims เปลี่ยน (เช่น โดน promote เป็น Admin)
 */
export async function refreshTenantToken() {
    const user = auth.currentUser;
    if (!user) throw new Error('No user');

    await user.getIdToken(true);
    const tokenResult = await user.getIdTokenResult();
    currentWebsiteId = tokenResult.claims.websiteId || null;
    currentUserRole = tokenResult.claims.role || null;

    return { websiteId: currentWebsiteId, role: currentUserRole };
}

/**
 * 🧹 เคลียร์ข้อมูลตอน Logout
 */
export function clearTenantContext() {
    currentWebsiteId = null;
    currentUserRole = null;
    currentUserId = null;
    isTenantInitialized = false;
    console.log('🧹 Tenant context cleared');
}

/**
 * 📋 ดึงข้อมูล Tenant ปัจจุบัน
 */
export function getCurrentTenant() {
    return {
        websiteId: currentWebsiteId,
        role: currentUserRole,
        userId: currentUserId,
        isInitialized: isTenantInitialized
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. FIRESTORE TENANT HELPERS (ใหม่ - ใช้แทน query ปกติ)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 🔍 ดึง Query ที่กรองตาม Tenant อัตโนมัติ (ใช้แทน query() ทุกครั้ง)
 * 
 * ตัวอย่าง:
 * const q = getTenantQuery('products', orderBy('createdAt', 'desc'));
 * const snapshot = await getDocs(q);
 */
export function getTenantQuery(collectionName, ...constraints) {
    if (!isTenantInitialized || !currentWebsiteId) {
        throw new Error('Tenant not initialized. Call initTenant() or wait for auth ready.');
    }

    return query(
        collection(db, collectionName),
        where('websiteId', '==', currentWebsiteId),  // 🔒 กรองเฉพาะเว็บตัวเอง
        ...constraints
    );
}

/**
 * ➕ สร้างข้อมูลใหม่พร้อมใส่ Tenant ID (ใช้ก่อน addDoc ทุกครั้ง)
 * 
 * ตัวอย่าง:
 * const data = createTenantData('products', { name: 'iPhone', price: 30000 });
 * await addDoc(collection(db, 'products'), data);
 */
export function createTenantData(collectionName, data) {
    if (!currentWebsiteId) throw new Error('No tenant context');

    return {
        ...data,
        websiteId: currentWebsiteId,        // 🔒 ผูกกับเว็บนี้
        createdBy: currentUserId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // Default values ตามประเภท
        ...(collectionName === 'orders' && { status: 'pending', paymentStatus: 'unpaid' }),
        ...(collectionName === 'products' && { status: 'active', stock: 0 }),
        ...(collectionName === 'users' && { status: 'active' })
    };
}

/**
 * ✏️ เตรียมข้อมูลอัปเดตพร้อมเช็คสิทธิ์
 */
export function prepareTenantUpdate(data, existingWebsiteId) {
    if (existingWebsiteId !== currentWebsiteId) {
        throw new Error('Access Denied: Cannot modify other tenant data');
    }

    return {
        ...data,
        updatedAt: serverTimestamp(),
        updatedBy: currentUserId
    };
}

/**
 * 🔐 เช็คก่อนลบ/แก้ไขว่าเอกสารเป็นของเว็บตัวเอง
 */
export async function verifyTenantOwnership(collectionName, docId) {
    const docRef = doc(db, collectionName, docId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) throw new Error('Document not found');

    const data = docSnap.data();
    if (data.websiteId !== currentWebsiteId) {
        throw new Error('Ownership verification failed');
    }

    return { ref: docRef, data, id: docId };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. STORAGE TENANT HELPERS (ใหม่)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 📤 อัปโหลดไฟล์ไปโฟลเดอร์ Tenant (websites/{websiteId}/{folder}/)
 */
export async function uploadTenantFile(file, folder = 'uploads', metadata = {}) {
    if (!currentWebsiteId) throw new Error('Tenant not initialized');

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}_${safeName}`;
    const path = `websites/${currentWebsiteId}/${folder}/${filename}`;

    const storageRef = ref(storage, path);

    await uploadBytes(storageRef, file, {
        contentType: file.type,
        customMetadata: {
            ...metadata,
            uploadedBy: currentUserId,
            websiteId: currentWebsiteId
        }
    });

    const downloadURL = await getDownloadURL(storageRef);
    return { path, downloadURL, filename: file.name };
}

/**
 * 🗑️ ลบไฟล์ (เช็คก่อนว่าเป็นไฟล์ของตัวเอง)
 */
export async function deleteTenantFile(filePath) {
    if (!filePath.includes(`websites/${currentWebsiteId}/`)) {
        throw new Error('Cannot delete file outside tenant folder');
    }
    const fileRef = ref(storage, filePath);
    await deleteObject(fileRef);
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. ROLE & PERMISSION HELPERS (ใหม่)
// ═══════════════════════════════════════════════════════════════════════════════

// [FIX] super_admin ถือว่าเป็น admin ด้วย
export const isTenantAdmin = () => ['admin', 'super_admin'].includes(currentUserRole);
export const isTenantStaff = () => ['admin', 'staff', 'super_admin'].includes(currentUserRole);
export const isTenantCustomer = () => currentUserRole === 'customer';

/**
 * เช็คว่ามีสิทธิ์ตามที่ต้องการไหม
 * hasRole(['admin', 'staff']) → true ถ้าเป็น admin หรือ staff
 */
export function hasRole(allowedRoles) {
    if (!Array.isArray(allowedRoles)) allowedRoles = [allowedRoles];
    return allowedRoles.includes(currentUserRole);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. AUTH STATE MANAGEMENT (ใหม่ - ใช้แทน onAuthStateChanged ธรรมดา)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 🎧 ตั้งค่า Auth State Listener แบบมี Tenant
 * 
 * ใช้ใน App.js:
 * useEffect(() => {
 *   const unsubscribe = setupTenantAuthListener(
 *     ({ user, tenant }) => {
 *       if (user) router.push('/dashboard');
 *       else router.push('/login');
 *     }
 *   );
 *   return () => unsubscribe();
 * }, []);
 */
export function setupTenantAuthListener(onReady = null, onError = null) {
    return onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                await initTenant(user);
                if (onReady) onReady({ user, tenant: getCurrentTenant() });
            } catch (error) {
                clearTenantContext();
                if (onError) onError(error);
            }
        } else {
            clearTenantContext();
            if (onReady) onReady({ user: null, tenant: null });
        }
    });
}

/**
 * 🚪 Logout พร้อมเคลียร์ Tenant
 */
export async function logoutTenant() {
    clearTenantContext();
    await signOut(auth);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. ระบบเดิมที่มีอยู่ (เก็บไว้ใช้ได้เหมือนเดิม)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Config Cache ─────────────────────────────────────────────────────────────
let _siteConfig = null, _siteTs = 0;
let _appConfig  = null, _appTs  = 0;
let _themeConfig = null, _themeTs = 0;
const TTL = 5 * 60 * 1000;

// ─── Site Config (เดิม) ───────────────────────────────────────────────────────
export async function getSiteConfig() {
    if (_siteConfig && Date.now() - _siteTs < TTL) return _siteConfig;
    try {
        const s = await getDoc(doc(db, "system", "settings"));
        _siteConfig = s.exists() ? s.data() : {};
        _siteTs = Date.now();
    } catch { _siteConfig = _siteConfig || {}; }
    return _siteConfig;
}

export async function getAppConfig() {
    if (_appConfig && Date.now() - _appTs < TTL) return _appConfig;
    try {
        const s = await getDoc(doc(db, "system", "config"));
        _appConfig = s.exists() ? s.data() : {};
        _appTs = Date.now();
    } catch { _appConfig = _appConfig || {}; }
    return _appConfig;
}

export async function getEasySlipKey() {
    return (await getAppConfig()).easyslipApiKey || null;
}

export async function initDiscordLink(id = "discordLink") {
    try {
        const cfg = await getSiteConfig();
        const el  = document.getElementById(id);
        if (el && cfg.discordLink) el.href = cfg.discordLink;
    } catch {}
}



// ─── Admin Authorization (เดิม ปรับให้ใช้ Tenant Role) ────────────────────────
/**
 * ⚠️ DEPRECATED: ใช้ isTenantAdmin() แทน
 * ฟังก์ชันนี้เก็บไว้เพื่อ backward compatibility
 */
export async function isAdmin(user = null) {
    // ถ้ามี Tenant System ให้ใช้ Tenant Role
    if (isTenantInitialized) {
        return isTenantAdmin();
    }

    // Fallback สำหรับระบบเก่า (ไม่มี Tenant)
    const currentUser = user || auth.currentUser;
    if (!currentUser) return false;

    try {
        const snap = await getDoc(doc(db, "users", currentUser.uid));
        return snap.exists() && snap.data().isAdmin === true;
    } catch {
        return false;
    }
}

export async function requireAdmin(redirectUrl = './index.html') {
    // ใช้ Tenant Admin ถ้ามี Tenant ไม่งั้น fallback ไปเช็คแบบเก่า
    const hasAdmin = isTenantInitialized ? isTenantAdmin() : await isAdmin();

    if (!hasAdmin) {
        window.location.href = redirectUrl;
        return false;
    }
    return true;
}

// ─── System Management (เดิม) ─────────────────────────────────────────────────
export async function getSystemConfig() {
    try {
        const [config, theme] = await Promise.all([
            getDoc(doc(db, "system", "config")),
            getDoc(doc(db, "system", "theme"))
        ]);

        return {
            ...(config.exists() ? config.data() : {}),
            theme: theme.exists() ? theme.data() : {}
        };
    } catch (error) {
        console.error("Error fetching system config:", error);
        return {};
    }
}

export async function checkMaintenanceMode() {
    try {
        const snap = await getDoc(doc(db, "system", "config"));
        if (snap.exists() && snap.data().maintenanceMode) {
            // Admin ของ Tenant หรือ Admin เก่า ผ่านได้เสมอ
            if (isTenantAdmin() || await isAdmin()) return false;
            return true;
        }
    } catch {}
    return false;
}

export async function saveSystemConfig(data) {
    try {
        await setDoc(doc(db, "system", "config"), {
            ...data,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.uid
        }, { merge: true });
        return true;
    } catch (error) {
        console.error("Error saving system config:", error);
        throw error;
    }
}

// ─── Database Management (ปรับให้รองรับ Tenant) ──────────────────────────────
/**
 * 🔍 ดึงรายชื่อผู้ใช้ใน Tenant นี้ (Admin only)
 */
export async function getTenantUsers(limitCount = 50) {
    if (!isTenantInitialized) throw new Error('Tenant not initialized');

    const q = query(
        collection(db, "users"), 
        where("websiteId", "==", currentWebsiteId),  // 🔒 กรอง Tenant
        orderBy("createdAt", "desc"), 
        limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * ⚠️ DEPRECATED: ใช้ getTenantUsers แทน
 */
export async function getAllUsers(limitCount = 50) {
    if (isTenantInitialized) {
        return getTenantUsers(limitCount);
    }
    // Fallback เก่า
    const q = query(
        collection(db, "users"), 
        orderBy("createdAt", "desc"), 
        limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * อัพเดตสถานะผู้ใช้ใน Tenant
 */
export async function updateUserStatus(userId, { isBanned, balance, displayName }) {
    // เช็คก่อนว่า user ที่จะแก้เป็นของ Tenant เราจริงๆ
    const userDoc = await verifyTenantOwnership('users', userId);

    const updateData = { updatedAt: serverTimestamp() };
    if (typeof isBanned !== 'undefined') updateData.isBanned = isBanned;
    if (typeof balance !== 'undefined') updateData.balance = balance;
    if (displayName) updateData.displayName = displayName;

    await updateDoc(userDoc.ref, updateData);
    return true;
}

/**
 * Subscribe คำสั่งซื้อใน Tenant แบบ Real-time
 */
export function subscribeOrders(callback, limitCount = 20) {
    if (!isTenantInitialized) throw new Error('Tenant not initialized');

    const q = query(
        collection(db, "orders"),
        where("websiteId", "==", currentWebsiteId),  // 🔒 กรอง Tenant
        orderBy("createdAt", "desc"),
        limit(limitCount)
    );

    return onSnapshot(q, (snap) => {
        const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(orders);
    });
}

// ─── Utility Functions ─────────────────────────────────────────────────────────
function adjustBrightness(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255))
        .toString(16).slice(1);
}

/**
 * ดึงข้อมูลสถิติของ Tenant (Admin Dashboard)
 */
export async function getDashboardStats() {
    if (!isTenantInitialized) throw new Error('Tenant not initialized');

    try {
        const [usersSnap, ordersSnap] = await Promise.all([
            getDocs(query(collection(db, "users"), where("websiteId", "==", currentWebsiteId))),
            getDocs(query(collection(db, "orders"), where("websiteId", "==", currentWebsiteId)))
        ]);

        let totalRevenue = 0;
        ordersSnap.forEach(doc => {
            const data = doc.data();
            if (data.amount) totalRevenue += data.amount;
        });

        return {
            totalUsers: usersSnap.size,
            totalRevenue,
            totalOrders: ordersSnap.size,
            websiteId: currentWebsiteId,
            timestamp: new Date()
        };
    } catch (error) {
        console.error("Error getting stats:", error);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. CONSTANTS & EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const COLLECTIONS = {
    WEBSITES: 'websites',
    USERS: 'users',
    PRODUCTS: 'products',
    ORDERS: 'orders',
    TOPUP_REQUESTS: 'topup_requests',
    CATEGORIES: 'categories',
    BANNERS: 'banners'
};

export const ROLES = {
    ADMIN: 'admin',
    STAFF: 'staff',
    CUSTOMER: 'customer'
};

export default {
    app, db, auth, storage,
    // Tenant
    initTenant, refreshTenantToken, getCurrentTenant, clearTenantContext,
    getTenantQuery, createTenantData, prepareTenantUpdate, verifyTenantOwnership,
    uploadTenantFile, deleteTenantFile,
    isTenantAdmin, isTenantStaff, isTenantCustomer, hasRole,
    setupTenantAuthListener, logoutTenant,
    // Legacy
    getSiteConfig, getAppConfig, getEasySlipKey, initDiscordLink,

    isAdmin, requireAdmin, getSystemConfig, checkMaintenanceMode, saveSystemConfig,
    getAllUsers, getTenantUsers, updateUserStatus, subscribeOrders, getDashboardStats,
    COLLECTIONS, ROLES
};

// ═══════════════════════════════════════════════════════════════════════════════
// 10. AUTO-INITIALIZE (ตอนโหลดหน้า)
// ═══════════════════════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', async () => {
        const path = window.location.pathname;

        // ตรวจสอบ Maintenance
        if (!path.includes('admin') && !path.includes('login')) {
            const isMaintenance = await checkMaintenanceMode();
            if (isMaintenance && !path.includes('maintenance')) {
                window.location.href = '/maintenance.html';
                return;
            }
        }


    });
}
