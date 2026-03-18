// ============================================================
//  js/frontend/topup.js
//  แก้ไข: ไม่ใช้ Firebase Storage, ไม่ใช้ setupTenantAuthListener
//  ใช้ onAuthStateChanged มาตรฐาน + base64 slip image
//  Firebase 10.7.1 — import จาก firebase-config.js เท่านั้น
// ============================================================

import { auth, db } from '../firebase-config.js';
import {
    onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    collection, query, where, onSnapshot,
    getDocs, doc, getDoc, setDoc,
    updateDoc, addDoc, serverTimestamp,
    increment, orderBy, limit, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ── Expose ให้ admin functions ────────────────────────────────
window.firestoreFns = {
    collection, query, where, onSnapshot, getDocs, doc, getDoc,
    updateDoc, addDoc, serverTimestamp, setDoc, orderBy, limit
};
window.db = db;

// ── Derive websiteId จาก hostname (multi-tenant) ──────────────
const MAIN_DOMAINS = new Set(['panderx.xyz','localhost','127.0.0.1']);
const _hostname = location.hostname.replace(/^www\./, '');
const _parts    = _hostname.split('.');
const currentWebsiteId = (_parts.length >= 3 && !MAIN_DOMAINS.has(_hostname))
    ? _parts[0] : null;

// ── State ─────────────────────────────────────────────────────
let currentUser          = null;
let currentUserData      = null;
let selectedFile         = null;
let selectedPaymentMethod = null;
let topupUnsubscribe     = null;
let currentTopupRequest  = null;
let balanceUnsubscribe   = null;

// ── Security: escapeHtml ──────────────────────────────────────
function escapeHtml(text) {
    if (typeof text !== 'string') return String(text ?? '');
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

// ── Toast ─────────────────────────────────────────────────────
window.showToast = function (msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const icons  = { success:'fa-circle-check', error:'fa-circle-xmark', info:'fa-circle-info' };
    const colors = { success:'#10b981', error:'#ef4444', info:'#0ea5e9' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.style.cssText = 'padding:14px 18px;background:white;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.13);display:flex;align-items:center;gap:10px;border-left:4px solid;min-width:240px;max-width:320px;';
    t.style.borderLeftColor = colors[type] || '#64748b';
    const icon = document.createElement('i');
    icon.className = `fa-solid ${icons[type] || 'fa-circle-info'}`;
    icon.style.cssText = `color:${colors[type]};font-size:1rem;flex-shrink:0;`;
    const span = document.createElement('span');
    span.textContent = msg;   // ✅ textContent ไม่ใช่ innerHTML
    span.style.cssText = 'font-weight:600;color:#1e293b;font-size:.875rem;';
    t.appendChild(icon); t.appendChild(span);
    c.appendChild(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3200);
};

// ── UI helpers ─────────────────────────────────────────────────
function setTxt(id, v) {
    const el = document.getElementById(id); if (el) el.textContent = v;
}
function show(id)  { const el = document.getElementById(id); if (el) el.style.display = 'block'; }
function hide(id)  { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function showFlex(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }

function updateBalance(raw) {
    const fmt = Number(raw ?? 0).toLocaleString('th-TH', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });
    setTxt('currentBalance', '฿' + fmt);
    setTxt('userBalance',    fmt);
    setTxt('dropdownBalance', fmt);
}

// ── Auth Init ─────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    // ซ่อน auth loading ทันทีที่ Firebase ตอบกลับ
    hide('authLoading');

    if (!user) {
        hide('userProfile');
        // Redirect ไป login พร้อม redirect กลับ
        location.href = `./login.html?redirect=${encodeURIComponent(location.href)}`;
        return;
    }

    currentUser = user;
    show('userProfile');

    // Optimistic UI ก่อน Firestore
    const displayName = user.displayName || user.email?.split('@')[0] || 'ผู้ใช้';
    setTxt('displayName',   displayName);
    setTxt('dropdownName',  displayName);
    const initial = displayName.charAt(0).toUpperCase();
    setTxt('userAvatar',    initial);
    setTxt('dropdownAvatar', initial);
    updateBalance(0);

    await loadUserData();
    setupBalanceRealtime(user.uid);
    await loadPaymentMethods();
    await loadHistory();
    await loadRedeemHistory();
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
                balance:     0, role: 'user', websiteId: currentWebsiteId,
                createdAt:   serverTimestamp()
            };
            await setDoc(userRef, newData);
            currentUserData = { ...newData, balance: 0 };
        } else {
            currentUserData = snap.data();
        }
        updateBalance(currentUserData.balance ?? 0);   // ✅ ?? ไม่ใช่ ||
    } catch (err) {
        console.error('[topup] loadUserData:', err);
        currentUserData = { balance: 0 };
        updateBalance(0);
        showToast('โหลดข้อมูลผู้ใช้ไม่สำเร็จ', 'error');
    }
}

// ── Real-time Balance ──────────────────────────────────────────
function setupBalanceRealtime(uid) {
    if (balanceUnsubscribe) balanceUnsubscribe();
    balanceUnsubscribe = onSnapshot(doc(db, 'users', uid), (snap) => {
        if (!snap.exists()) return;
        const bal = snap.data().balance ?? 0;   // ✅ ??
        updateBalance(bal);
        if (currentUserData) currentUserData.balance = bal;
    }, (err) => {
        console.error('[topup] balance snapshot:', err);
    });
}

// ── Refresh button ─────────────────────────────────────────────
window.refreshBalance = async function () {
    const icon = document.getElementById('refreshIcon');
    icon?.classList.add('fa-spin');
    try {
        if (!currentUser) return;
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        if (snap.exists()) updateBalance(snap.data().balance ?? 0);
        showToast('รีเฟรชยอดเงินแล้ว', 'success');
    } catch { showToast('รีเฟรชไม่สำเร็จ', 'error'); }
    finally  { setTimeout(() => icon?.classList.remove('fa-spin'), 1000); }
};

// ── Fee Settings ───────────────────────────────────────────────
async function loadFeeSettingsFrontend() {
    try {
        const snap = await getDoc(doc(db, 'system', 'topup_config'));
        if (snap.exists()) {
            const d = snap.data();
            window.feeSettings = {
                bankFee:       d.bankFee       ?? 0,
                trueMoneyFee:  d.trueMoneyFee  ?? 0
            };
        }
    } catch (e) { console.warn('[topup] loadFeeSettings:', e); }
}

// ── Payment Methods ────────────────────────────────────────────
async function loadPaymentMethods() {
    const container = document.getElementById('paymentMethodsList');
    const noConfig  = document.getElementById('noPaymentConfig');
    if (!container) return;

    // Loading skeleton
    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">
            ${[1,2].map(() => `
                <div style="height:72px;border-radius:18px;background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;"></div>
            `).join('')}
        </div>
    `;

    try {
        await loadFeeSettingsFrontend();

        // ลอง orderBy ก่อน fallback ถ้า index ยังไม่สร้าง
        let snap;
        try {
            const q = query(
                collection(db, 'bank_accounts'),
                where('isActive', '==', true),
                orderBy('order', 'asc')
            );
            snap = await getDocs(q);
        } catch {
            const q = query(
                collection(db, 'bank_accounts'),
                where('isActive', '==', true)
            );
            snap = await getDocs(q);
        }

        container.innerHTML = '';

        if (snap.empty) {
            if (noConfig) noConfig.style.display = 'block';
            return;
        }
        if (noConfig) noConfig.style.display = 'none';

        snap.forEach(docSnap => {
            container.appendChild(createPaymentCard(docSnap.id, docSnap.data()));
        });

    } catch (e) {
        console.error('[topup] loadPaymentMethods:', e);
        container.innerHTML = '';
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'text-align:center;padding:24px;color:#ef4444;';
        errDiv.textContent = 'โหลดข้อมูลไม่สำเร็จ';
        const retryBtn = document.createElement('button');
        retryBtn.textContent = 'ลองใหม่';
        retryBtn.style.cssText = 'display:block;margin:10px auto 0;padding:6px 16px;background:#fee2e2;border:none;border-radius:8px;color:#dc2626;cursor:pointer;font-family:Prompt;font-weight:600;';
        retryBtn.onclick = loadPaymentMethods;
        errDiv.appendChild(retryBtn);
        container.appendChild(errDiv);
    }
}

function createPaymentCard(id, method) {
    const div = document.createElement('div');
    div.className = 'payment-card';
    div.dataset.id      = id;
    div.dataset.type    = method.type     || 'bank';
    div.dataset.name    = method.name     || method.bankName     || 'ไม่ระบุ';
    div.dataset.account = method.accountNumber || method.phoneNumber || '-';
    div.dataset.fee     = method.fee      || 0;

    const isTM    = method.type === 'truemoney';
    const bgColor = isTM ? 'rgba(249,115,22,.10)' : 'rgba(14,165,233,.10)';
    const txtColor = isTM ? '#f97316' : '#0ea5e9';
    const icon    = isTM ? 'fa-wallet' : 'fa-building-columns';

    // สร้าง DOM แทน innerHTML เพื่อ XSS safety
    const inner = document.createElement('div');
    inner.style.cssText = 'display:flex;align-items:center;gap:14px;';

    const logoWrap = document.createElement('div');
    logoWrap.className = 'bank-logo';
    logoWrap.style.cssText = `background:${bgColor};color:${txtColor};display:flex;align-items:center;justify-content:center;border-radius:12px;width:48px;height:48px;flex-shrink:0;`;
    const logoIcon = document.createElement('i');
    logoIcon.className = `fa-solid ${icon}`;
    logoIcon.style.fontSize = '1.25rem';
    logoWrap.appendChild(logoIcon);

    const info = document.createElement('div');
    info.style.flex = '1';

    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-weight:700;color:#1e293b;';
    nameEl.textContent = method.name || method.bankName || 'ไม่ระบุ';

    const accEl = document.createElement('div');
    accEl.style.cssText = 'font-family:monospace;font-size:.9rem;color:#64748b;margin-top:2px;';
    accEl.textContent = method.accountNumber || method.phoneNumber || '-';

    info.appendChild(nameEl);
    info.appendChild(accEl);

    if (method.accountName) {
        const ownerEl = document.createElement('div');
        ownerEl.style.cssText = 'font-size:.8rem;color:#94a3b8;';
        ownerEl.textContent = method.accountName;
        info.appendChild(ownerEl);
    }

    const checkEl = document.createElement('i');
    checkEl.id = `check-${id}`;
    checkEl.className = 'fa-regular fa-circle-check';
    checkEl.style.cssText = `color:${txtColor};font-size:1.25rem;display:none;`;

    inner.appendChild(logoWrap);
    inner.appendChild(info);
    inner.appendChild(checkEl);
    div.appendChild(inner);

    div.onclick = () => selectPaymentMethod(id, div);
    return div;
}

function selectPaymentMethod(id, element) {
    document.querySelectorAll('.payment-card').forEach(el => {
        el.classList.remove('active');
        const chk = document.getElementById(`check-${el.dataset.id}`);
        if (chk) chk.style.display = 'none';
    });
    element.classList.add('active');
    const check = document.getElementById(`check-${id}`);
    if (check) check.style.display = 'block';

    selectedPaymentMethod = {
        id, type: element.dataset.type, name: element.dataset.name,
        account: element.dataset.account, fee: parseFloat(element.dataset.fee) || 0
    };
    validateForm();

    // Fee notice
    const feeNotice     = document.getElementById('feeNotice');
    const feeNoticeText = document.getElementById('feeNoticeText');
    if (feeNotice) {
        if (selectedPaymentMethod.fee > 0) {
            if (feeNoticeText) feeNoticeText.textContent = `ช่องทางนี้หักค่าธรรมเนียม ${selectedPaymentMethod.fee}%`;
            feeNotice.style.display = 'block';
        } else {
            feeNotice.style.display = 'none';
        }
    }
}

// ── Slip Image — base64 (ไม่ใช้ Firebase Storage) ─────────────
// compress ด้วย canvas ก่อนเพื่อลด size
function compressImage(file, maxPx = 900, quality = 0.75) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            let { width, height } = img;
            if (width > maxPx || height > maxPx) {
                const ratio = Math.min(maxPx / width, maxPx / height);
                width  = Math.round(width  * ratio);
                height = Math.round(height * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width  = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = url;
    });
}

window.handleFileSelect = function (event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showToast('กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น', 'error'); return;
    }
    if (file.size > 8 * 1024 * 1024) {
        showToast('ไฟล์ขนาดใหญ่เกิน 8MB', 'error'); return;
    }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = e => {
        const previewImg    = document.getElementById('previewImage');
        const placeholder   = document.getElementById('uploadPlaceholder');
        const preview       = document.getElementById('uploadPreview');
        const uploadArea    = document.getElementById('uploadArea');
        if (previewImg)  previewImg.src = e.target.result;
        if (placeholder) placeholder.style.display = 'none';
        if (preview)     preview.style.display     = 'block';
        if (uploadArea)  uploadArea.classList.add('has-file');
    };
    reader.readAsDataURL(file);
    validateForm();
};

window.clearFile = function () {
    selectedFile = null;
    const input       = document.getElementById('slipInput');
    const placeholder = document.getElementById('uploadPlaceholder');
    const preview     = document.getElementById('uploadPreview');
    const uploadArea  = document.getElementById('uploadArea');
    if (input)       input.value            = '';
    if (placeholder) placeholder.style.display = 'block';
    if (preview)     preview.style.display     = 'none';
    if (uploadArea)  uploadArea.classList.remove('has-file');
    validateForm();
};

function validateForm() {
    const btn = document.getElementById('submitBtn');
    if (btn) btn.disabled = !(selectedFile && selectedPaymentMethod && currentUser);
}

// ── Submit Topup (ไม่ใช้ Storage) ─────────────────────────────
window.submitTopup = async function (event) {
    event.preventDefault();
    if (!selectedFile || !selectedPaymentMethod || !currentUser) return;

    const btn      = document.getElementById('submitBtn');
    const btnText  = document.getElementById('btnText');

    btn.disabled = true;
    btn.classList.add('loading');
    if (btnText) { btnText.style.opacity = '0'; }

    try {
        // 1. Compress → base64 (ไม่ใช้ Firebase Storage)
        let slipBase64;
        try {
            slipBase64 = await compressImage(selectedFile);
        } catch {
            // fallback: FileReader
            slipBase64 = await new Promise((res, rej) => {
                const r = new FileReader();
                r.onload  = e => res(e.target.result);
                r.onerror = rej;
                r.readAsDataURL(selectedFile);
            });
        }

        // เช็ค size หลัง compress (Firestore 1MB limit)
        const sizeKB = Math.round(slipBase64.length * 0.75 / 1024);
        if (sizeKB > 900) {
            showToast('รูปภาพใหญ่เกินไป กรุณาลดขนาดรูปก่อน', 'error');
            btn.disabled = false; btn.classList.remove('loading');
            if (btnText) btnText.style.opacity = '1';
            return;
        }

        // 2. บันทึกลง Firestore
        await addDoc(collection(db, 'topup_requests'), {
            userId:            currentUser.uid,
            userEmail:         currentUser.email      || '',
            userName:          currentUser.displayName || currentUser.email?.split('@')[0] || 'ผู้ใช้',
            websiteId:         currentWebsiteId,
            paymentMethodId:   selectedPaymentMethod.id,
            paymentMethodType: selectedPaymentMethod.type,
            paymentMethodName: selectedPaymentMethod.name,
            accountNumber:     selectedPaymentMethod.account,
            feePercent:        selectedPaymentMethod.fee,
            slipBase64,                                  // ✅ base64 แทน Storage URL
            originalFileName:  selectedFile.name,
            status:            'pending',
            note:              document.getElementById('transferNote')?.value?.slice(0, 500) || '',
            amount:            0,
            createdAt:         serverTimestamp(),
            updatedAt:         serverTimestamp()
        });

        showToast('ส่งคำขอเติมเงินสำเร็จ รอการตรวจสอบ', 'success');
        clearFile();
        const noteEl = document.getElementById('transferNote');
        if (noteEl) noteEl.value = '';
        await loadHistory();

    } catch (e) {
        console.error('[topup] submitTopup:', e);
        showToast('ส่งไม่สำเร็จ กรุณาลองใหม่', 'error');
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
        if (btnText) btnText.style.opacity = '1';
    }
};

// ── History ────────────────────────────────────────────────────
window.loadHistory = async function () {
    const container = document.getElementById('historyList');
    if (!container || !currentUser) return;

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">
            ${[1,2,3].map(() => `
                <div style="height:80px;border-radius:14px;background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;"></div>
            `).join('')}
        </div>
    `;

    try {
        let snap;
        try {
            const q = query(
                collection(db, 'topup_requests'),
                where('userId', '==', currentUser.uid),
                orderBy('createdAt', 'desc'),
                limit(20)
            );
            snap = await getDocs(q);
        } catch {
            const q = query(
                collection(db, 'topup_requests'),
                where('userId', '==', currentUser.uid),
                limit(20)
            );
            snap = await getDocs(q);
        }

        container.innerHTML = '';

        if (snap.empty) {
            const empty = document.createElement('div');
            empty.style.cssText = 'text-align:center;padding:32px 20px;color:#94a3b8;';
            const iEl = document.createElement('i');
            iEl.className = 'fa-solid fa-receipt';
            iEl.style.cssText = 'font-size:2.2rem;color:#cbd5e1;display:block;margin-bottom:10px;';
            const p1 = document.createElement('p');
            p1.style.cssText = 'font-weight:600;color:#64748b;';
            p1.textContent = 'ไม่มีประวัติการเติมเงิน';
            const p2 = document.createElement('p');
            p2.style.cssText = 'font-size:.8rem;margin-top:4px;';
            p2.textContent = 'เริ่มต้นโดยการแจ้งโอนเงินครั้งแรก';
            empty.appendChild(iEl); empty.appendChild(p1); empty.appendChild(p2);
            container.appendChild(empty);
            return;
        }

        snap.forEach(docSnap => {
            container.appendChild(createHistoryItem(docSnap.data(), docSnap.id));
        });

    } catch (e) {
        console.error('[topup] loadHistory:', e);
        container.innerHTML = '';
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'text-align:center;padding:24px;color:#ef4444;';
        errDiv.textContent = 'โหลดประวัติไม่สำเร็จ';
        const retryBtn = document.createElement('button');
        retryBtn.textContent = 'ลองใหม่';
        retryBtn.style.cssText = 'display:block;margin:8px auto 0;padding:6px 14px;background:#fee2e2;border:none;border-radius:8px;color:#dc2626;cursor:pointer;font-family:Prompt;font-weight:600;';
        retryBtn.onclick = loadHistory;
        errDiv.appendChild(retryBtn);
        container.appendChild(errDiv);
    }
};

function createHistoryItem(data, _id) {
    const div = document.createElement('div');
    div.className = 'history-item';

    const date = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleString('th-TH', {
            day:'numeric', month:'short', year:'2-digit',
            hour:'2-digit', minute:'2-digit'
          })
        : '-';

    const statusCfg = {
        pending:  { color:'#f59e0b', bg:'#fffbeb', label:'รอตรวจสอบ', icon:'fa-clock'              },
        approved: { color:'#10b981', bg:'#ecfdf5', label:'สำเร็จ',     icon:'fa-circle-check'      },
        rejected: { color:'#ef4444', bg:'#fef2f2', label:'ปฏิเสธ',     icon:'fa-circle-xmark'      }
    };
    const st = statusCfg[data.status] || statusCfg.pending;

    // Header row
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;';

    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-weight:700;color:#1e293b;';
    nameEl.textContent = data.paymentMethodName || 'ไม่ระบุ';

    const badge = document.createElement('span');
    badge.style.cssText = `display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:20px;font-size:12px;font-weight:600;background:${st.bg};color:${st.color};`;
    const badgeIcon = document.createElement('i');
    badgeIcon.className = `fa-solid ${st.icon}`;
    const badgeLabel = document.createElement('span');
    badgeLabel.textContent = st.label;
    badge.appendChild(badgeIcon); badge.appendChild(badgeLabel);
    header.appendChild(nameEl); header.appendChild(badge);

    // Date row
    const dateEl = document.createElement('div');
    dateEl.style.cssText = 'font-size:.82rem;color:#64748b;';
    const dateIcon = document.createElement('i');
    dateIcon.className = 'fa-regular fa-calendar';
    dateIcon.style.marginRight = '5px';
    dateEl.appendChild(dateIcon);
    dateEl.appendChild(document.createTextNode(date));

    // Amount
    const amtEl = document.createElement('div');
    if (data.amount > 0) {
        amtEl.style.cssText = 'font-weight:800;color:#10b981;font-size:1.05rem;margin-top:6px;';
        amtEl.textContent = '+฿' + Number(data.amount).toLocaleString('th-TH');
    } else {
        amtEl.style.cssText = 'font-size:.8rem;color:#94a3b8;margin-top:4px;';
        amtEl.textContent = 'รอการระบุจำนวนเงิน';
    }

    div.appendChild(header);
    div.appendChild(dateEl);
    div.appendChild(amtEl);

    // Rejection reason
    if (data.rejectionReason) {
        const rejDiv = document.createElement('div');
        rejDiv.style.cssText = 'margin-top:8px;padding:8px 12px;background:#fef2f2;border-radius:8px;font-size:.8rem;color:#dc2626;border-left:3px solid #ef4444;display:flex;align-items:flex-start;gap:6px;';
        const rejIcon = document.createElement('i');
        rejIcon.className = 'fa-solid fa-triangle-exclamation';
        rejIcon.style.marginTop = '2px';
        const rejText = document.createElement('span');
        rejText.textContent = data.rejectionReason;
        rejDiv.appendChild(rejIcon); rejDiv.appendChild(rejText);
        div.appendChild(rejDiv);
    }

    // Note
    if (data.note) {
        const noteDiv = document.createElement('div');
        noteDiv.style.cssText = 'margin-top:5px;font-size:.8rem;color:#94a3b8;';
        const noteIcon = document.createElement('i');
        noteIcon.className = 'fa-regular fa-note-sticky';
        noteIcon.style.marginRight = '5px';
        noteDiv.appendChild(noteIcon);
        noteDiv.appendChild(document.createTextNode(data.note));
        div.appendChild(noteDiv);
    }

    return div;
}

// ── Redeem Code ────────────────────────────────────────────────
window.redeemCode = async function () {
    const input = document.getElementById('redeemCodeInput');
    const code  = input?.value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code || code.length < 6) {
        showToast('กรุณากรอกโค้ดให้ถูกต้อง', 'error'); return;
    }
    const btn     = document.getElementById('redeemBtn');
    const btnText = document.getElementById('redeemBtnText');
    const origContent = btnText?.innerHTML;
    btn.disabled = true;
    if (btnText) {
        btnText.innerHTML = '';
        const spinIcon = document.createElement('i');
        spinIcon.className = 'fa-solid fa-circle-notch fa-spin';
        spinIcon.style.marginRight = '8px';
        btnText.appendChild(spinIcon);
        btnText.appendChild(document.createTextNode('กำลังตรวจสอบ...'));
    }

    try {
        const q = query(
            collection(db, 'redeem_codes'),
            where('code',   '==', code),
            where('isUsed', '==', false),
            limit(1)
        );
        const snap = await getDocs(q);

        if (snap.empty) {
            showToast('โค้ดไม่ถูกต้องหรือถูกใช้แล้ว', 'error'); return;
        }

        const codeDoc  = snap.docs[0];
        const codeData = codeDoc.data();

        if (codeData.expiresAt && codeData.expiresAt.toDate() < new Date()) {
            showToast('โค้ดหมดอายุแล้ว', 'error'); return;
        }
        if (codeData.websiteId && codeData.websiteId !== currentWebsiteId) {
            showToast('โค้ดนี้ไม่สามารถใช้กับเว็บไซต์นี้ได้', 'error'); return;
        }

        // Transaction: mark used + credit balance
        const batch  = writeBatch(db);
        batch.update(doc(db, 'redeem_codes', codeDoc.id), {
            isUsed:        true,
            usedBy:        currentUser.uid,
            usedByUid:     currentUser.uid,
            usedAt:        serverTimestamp(),
            usedWebsiteId: currentWebsiteId
        });
        batch.update(doc(db, 'users', currentUser.uid), {
            balance:   increment(codeData.amount || 0),
            updatedAt: serverTimestamp()
        });
        await batch.commit();

        // Transaction log
        await addDoc(collection(db, 'transactions'), {
            userId:      currentUser.uid,
            websiteId:   currentWebsiteId,
            type:        'credit',
            amount:      codeData.amount,
            description: `แลกโค้ด ${code}`,
            codeId:      codeDoc.id,
            createdAt:   serverTimestamp()
        });

        showToast(`แลกโค้ดสำเร็จ! ได้รับ ฿${Number(codeData.amount).toLocaleString('th-TH')}`, 'success');
        if (input) input.value = '';
        await loadRedeemHistory();

    } catch (e) {
        console.error('[topup] redeemCode:', e);
        showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
    } finally {
        btn.disabled = false;
        if (btnText && origContent !== undefined) btnText.innerHTML = origContent;
    }
};

window.pasteCode = async function () {
    try {
        const text = await navigator.clipboard.readText();
        const input = document.getElementById('redeemCodeInput');
        if (input) { input.value = text.toUpperCase().replace(/[^A-Z0-9-]/g,''); input.focus(); }
    } catch { showToast('ไม่สามารถอ่านคลิปบอร์ดได้', 'error'); }
};

window.loadRedeemHistory = async function () {
    const container = document.getElementById('redeemHistoryList');
    if (!container || !currentUser) return;
    try {
        let snap;
        try {
            const q = query(
                collection(db, 'transactions'),
                where('userId', '==', currentUser.uid),
                where('type',   '==', 'credit'),
                orderBy('createdAt', 'desc'),
                limit(10)
            );
            snap = await getDocs(q);
        } catch {
            const q = query(
                collection(db, 'transactions'),
                where('userId', '==', currentUser.uid),
                where('type',   '==', 'credit'),
                limit(10)
            );
            snap = await getDocs(q);
        }

        container.innerHTML = '';
        if (snap.empty) {
            const p = document.createElement('div');
            p.style.cssText = 'text-align:center;color:#94a3b8;padding:16px;font-size:.85rem;';
            p.textContent = 'ยังไม่มีประวัติการแลกโค้ด';
            container.appendChild(p);
            return;
        }

        snap.forEach(docSnap => {
            const d    = docSnap.data();
            if (!d.codeId) return; // กรองเฉพาะ redeem
            const date = d.createdAt?.toDate
                ? d.createdAt.toDate().toLocaleDateString('th-TH') : '-';
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#f8fafc;border-radius:10px;';
            const left = document.createElement('div');
            const codeEl = document.createElement('div');
            codeEl.style.cssText = 'font-weight:700;color:#475569;font-family:monospace;font-size:.9rem;';
            codeEl.textContent = d.description || '-';
            const dateEl2 = document.createElement('div');
            dateEl2.style.cssText = 'font-size:.75rem;color:#94a3b8;';
            dateEl2.textContent = date;
            left.appendChild(codeEl); left.appendChild(dateEl2);
            const amtEl2 = document.createElement('div');
            amtEl2.style.cssText = 'font-weight:800;color:#10b981;';
            amtEl2.textContent = '+฿' + Number(d.amount || 0).toLocaleString('th-TH');
            row.appendChild(left); row.appendChild(amtEl2);
            container.appendChild(row);
        });

    } catch (e) { console.error('[topup] loadRedeemHistory:', e); }
};

// ── Logout ─────────────────────────────────────────────────────
window.handleLogout = async function () {
    try { await signOut(auth); } catch (e) { console.error(e); }
    location.href = './index.html';
};

// ── shimmer keyframes ─────────────────────────────────────────
if (!document.getElementById('topupShimmerStyle')) {
    const s = document.createElement('style');
    s.id = 'topupShimmerStyle';
    s.textContent = `@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`;
    document.head.appendChild(s);
}

// ────────────────────────────────────────────────────────────────
// ADMIN FUNCTIONS (ไม่แก้ไข logic — ปรับแค่ hidden → style.display)
// ────────────────────────────────────────────────────────────────

function setupTopupRealtime() {
    const q = query(collection(db, 'topup_requests'), where('status', '==', 'pending'));
    if (topupUnsubscribe) topupUnsubscribe();
    topupUnsubscribe = onSnapshot(q, (snapshot) => {
        const count = snapshot.size;
        const badge = document.getElementById('topupBadge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        }
        const topupSection = document.getElementById('topup');
        if (topupSection?.classList.contains('active')) loadTopupRequests();
    });
}

async function loadTopupRequests() {
    if (typeof checkAccess === 'function' && !checkAccess('manage_topup')) return;
    const status    = document.getElementById('topupStatusFilter')?.value || 'pending';
    const tbody     = document.getElementById('topupTableBody');
    const emptyState = document.getElementById('topupEmpty');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;"><div style="width:32px;height:32px;border:3px solid #e0f2fe;border-top-color:#38bdf8;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto;"></div></td></tr>';
    if (emptyState) emptyState.style.display = 'none';

    try {
        let q;
        if (status === 'all') {
            q = query(collection(db, 'topup_requests'), orderBy('createdAt', 'desc'));
        } else {
            q = query(collection(db, 'topup_requests'), where('status', '==', status), orderBy('createdAt', 'desc'));
        }
        const snap = await getDocs(q);
        const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        updateTopupStats(requests);
        try {
            const methodsSnap  = await getDocs(collection(db, 'bank_accounts'));
            const activeMethods = methodsSnap.docs.filter(d => d.data().isActive).length;
            setTxt('activeMethodsCount', activeMethods);
        } catch {}

        if (requests.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }
        const canApprove = typeof hasPermission === 'function' ? hasPermission('approve_topup') : true;
        const statusClasses = {
            pending:  'bg-amber-100 text-amber-700',
            approved: 'bg-emerald-100 text-emerald-700',
            rejected: 'bg-red-100 text-red-700'
        };
        const statusText = { pending:'รอตรวจสอบ', approved:'อนุมัติแล้ว', rejected:'ปฏิเสธ' };

        tbody.innerHTML = requests.map(r => {
            const date = r.createdAt?.toDate
                ? r.createdAt.toDate().toLocaleDateString('th-TH', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
                : '-';
            const accountInfo = escapeHtml(r.accountNumber || r.phoneNumber || '-');
            const slipSrc = r.slipBase64 || r.slipUrl || '';
            const slipHtml = slipSrc
                ? `<img src="${escapeHtml(slipSrc)}" class="slip-thumbnail" onclick="viewSlip('${escapeHtml(slipSrc)}')" title="คลิกดูรูปใหญ่" style="width:52px;height:52px;object-fit:cover;border-radius:8px;cursor:zoom-in;">`
                : '<span style="color:#94a3b8;font-size:.8rem;">ไม่มีรูป</span>';

            return `
                <tr class="hover:bg-slate-50/80 transition-colors">
                    <td class="py-4 px-6 text-sm text-slate-600 font-medium">${escapeHtml(date)}</td>
                    <td class="py-4 px-6">
                        <div class="font-bold text-slate-800 text-sm">${escapeHtml(r.userName || 'ไม่ระบุ')}</div>
                        <div class="text-xs text-slate-500">${escapeHtml(r.userEmail || '-')}</div>
                    </td>
                    <td class="py-4 px-6">
                        <div class="flex items-center gap-2">
                            <i class="fa-solid ${r.paymentMethodType === 'truemoney' ? 'fa-wallet text-orange-500' : 'fa-building-columns text-slate-500'}"></i>
                            <span class="font-medium text-slate-700">${escapeHtml(r.paymentMethodName || 'ไม่ระบุ')}</span>
                        </div>
                    </td>
                    <td class="py-4 px-6 text-sm font-mono text-slate-600">${accountInfo}</td>
                    <td class="py-4 px-6">${slipHtml}</td>
                    <td class="py-4 px-6">
                        <span class="px-3 py-1.5 rounded-full text-xs font-bold ${statusClasses[r.status] || statusClasses.pending}">
                            ${escapeHtml(statusText[r.status] || 'รอตรวจสอบ')}
                        </span>
                    </td>
                    <td class="py-4 px-6">
                        <button onclick="openTopupModal('${escapeHtml(r.id)}')" class="px-4 py-2 ${r.status === 'pending' && canApprove ? 'bg-sky-500 text-white hover:bg-sky-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} rounded-lg font-semibold transition text-sm">
                            ${r.status === 'pending' && canApprove ? 'ตรวจสอบ' : 'ดูรายละเอียด'}
                        </button>
                    </td>
                </tr>`;
        }).join('');

    } catch (e) {
        console.error('[topup] loadTopupRequests:', e);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:28px;color:#ef4444;">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(e.message)}</td></tr>`;
    }
}

function updateTopupStats(requests) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const pending       = requests.filter(r => r.status === 'pending').length;
    const approvedToday = requests.filter(r =>
        r.status === 'approved' && r.updatedAt?.toDate?.() >= today
    ).length;
    setTxt('pendingCount',      pending);
    setTxt('approvedTodayCount', approvedToday);
    setTxt('totalRequests',     requests.length);
}

async function openTopupModal(requestId) {
    try {
        const snap = await getDoc(doc(db, 'topup_requests', requestId));
        if (!snap.exists()) { showToast('ไม่พบข้อมูล', 'error'); return; }
        currentTopupRequest = { id: snap.id, ...snap.data() };
        const r = currentTopupRequest;
        const content = document.getElementById('topupModalContent');
        const actions  = document.getElementById('topupActions');
        const rejectForm = document.getElementById('rejectForm');

        if (content) {
            const date    = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('th-TH') : '-';
            const slipSrc = r.slipBase64 || r.slipUrl || '';
            content.innerHTML = `
                <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding:16px;background:#f8fafc;border-radius:16px;">
                    <div style="width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#38bdf8,#818cf8);display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:1.4rem;">
                        ${escapeHtml((r.userName || 'U')[0].toUpperCase())}
                    </div>
                    <div>
                        <div style="font-weight:700;font-size:1rem;color:#1e293b;">${escapeHtml(r.userName || 'ไม่ระบุชื่อ')}</div>
                        <div style="color:#64748b;font-size:.875rem;">${escapeHtml(r.userEmail || '')}</div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
                    <div style="padding:14px;background:#f8fafc;border-radius:12px;">
                        <div style="font-size:.8rem;color:#94a3b8;margin-bottom:4px;">ช่องทาง</div>
                        <div style="font-weight:700;color:#1e293b;">${escapeHtml(r.paymentMethodName || 'ไม่ระบุ')}</div>
                    </div>
                    <div style="padding:14px;background:#f8fafc;border-radius:12px;">
                        <div style="font-size:.8rem;color:#94a3b8;margin-bottom:4px;">เวลา</div>
                        <div style="font-weight:700;color:#1e293b;font-size:.85rem;">${escapeHtml(date)}</div>
                    </div>
                </div>
                ${slipSrc ? `
                <div style="margin-bottom:16px;">
                    <div style="font-size:.85rem;color:#94a3b8;margin-bottom:8px;">สลิปโอนเงิน</div>
                    <img src="${escapeHtml(slipSrc)}" style="width:100%;border-radius:12px;border:2px solid #e2e8f0;cursor:zoom-in;" onclick="window.open('${escapeHtml(slipSrc)}', '_blank')">
                </div>` : ''}
                ${r.note ? `<div style="padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;font-size:.85rem;color:#92400e;margin-bottom:12px;">${escapeHtml(r.note)}</div>` : ''}
                ${r.rejectionReason ? `<div style="padding:12px;background:#fef2f2;border:1px solid #fecdd3;border-radius:12px;font-size:.85rem;color:#dc2626;"><b>เหตุผล:</b> ${escapeHtml(r.rejectionReason)}</div>` : ''}
            `;
        }
        const canApprove = typeof hasPermission === 'function' ? hasPermission('approve_topup') : false;
        if (actions)    actions.style.display    = (r.status === 'pending' && canApprove) ? 'flex' : 'none';
        if (rejectForm) rejectForm.style.display = 'none';

        const modal = document.getElementById('topupDetailModal');
        if (modal) modal.style.display = 'flex';
    } catch (e) {
        console.error('[topup] openModal:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

function closeTopupModal() {
    const modal = document.getElementById('topupDetailModal');
    if (modal) modal.style.display = 'none';
    currentTopupRequest = null;
}

function viewSlip(src) { if (src) window.open(src, '_blank'); }

function showRejectForm() {
    const actions = document.getElementById('topupActions');
    const rf = document.getElementById('rejectForm');
    if (actions) actions.style.display = 'none';
    if (rf) rf.style.display = 'block';
}
function hideRejectForm() {
    const actions = document.getElementById('topupActions');
    const rf = document.getElementById('rejectForm');
    if (rf) rf.style.display = 'none';
    if (actions) actions.style.display = 'flex';
}

async function approveTopup() {
    if (typeof checkAccess === 'function' && !checkAccess('approve_topup')) return;
    if (!currentTopupRequest) return;
    try {
        const amountInput = document.getElementById('approveAmount');
        const amount = parseFloat(amountInput?.value) || currentTopupRequest.amount || 0;

        await updateDoc(doc(db, 'topup_requests', currentTopupRequest.id), {
            status: 'approved', amount,
            verifiedAt: serverTimestamp(), verifiedBy: 'admin', updatedAt: serverTimestamp()
        });
        const userRef  = doc(db, 'users', currentTopupRequest.userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const curr = userSnap.data().balance ?? 0;
            await updateDoc(userRef, {
                balance: curr + amount, updatedAt: serverTimestamp()
            });
        }
        await addDoc(collection(db, 'transactions'), {
            userId: currentTopupRequest.userId,
            websiteId: currentTopupRequest.websiteId || null,
            type: 'credit', amount,
            description: 'เติมเงินผ่าน ' + (currentTopupRequest.paymentMethodName || 'โอนเงิน'),
            orderId: currentTopupRequest.id,
            createdAt: serverTimestamp()
        });
        showToast('อนุมัติรายการสำเร็จ', 'success');
        closeTopupModal();
        loadTopupRequests();
    } catch (e) {
        console.error('[topup] approveTopup:', e);
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

async function rejectTopup() {
    if (typeof checkAccess === 'function' && !checkAccess('approve_topup')) return;
    if (!currentTopupRequest) return;
    const reason = document.getElementById('rejectReason')?.value?.trim();
    if (!reason) { showToast('กรุณาระบุเหตุผล', 'error'); return; }
    try {
        await updateDoc(doc(db, 'topup_requests', currentTopupRequest.id), {
            status: 'rejected', rejectionReason: reason,
            verifiedAt: serverTimestamp(), verifiedBy: 'admin', updatedAt: serverTimestamp()
        });
        showToast('ปฏิเสธรายการแล้ว', 'success');
        closeTopupModal();
        loadTopupRequests();
    } catch (e) {
        console.error('[topup] rejectTopup:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function loadFeeSettings() {
    try {
        const snap = await getDoc(doc(db, 'system', 'topup_config'));
        if (!snap.exists()) return;
        const d = snap.data();
        const bankEl = document.getElementById('fee_bank');
        const tmEl   = document.getElementById('fee_truemoney');
        if (bankEl) { bankEl.value = d.bankFee ?? 0;      bankEl.dispatchEvent(new Event('input')); }
        if (tmEl)   { tmEl.value   = d.trueMoneyFee ?? 0; tmEl.dispatchEvent(new Event('input'));   }
        showToast('โหลดค่าธรรมเนียมแล้ว', 'info');
    } catch (e) { console.warn('[topup] loadFeeSettings:', e); }
}

async function saveFeeSettings() {
    if (typeof checkAccess === 'function' && !checkAccess('manage_settings')) return;
    try {
        const bankFee      = parseFloat(document.getElementById('fee_bank')?.value)       || 0;
        const trueMoneyFee = parseFloat(document.getElementById('fee_truemoney')?.value)  || 0;
        await setDoc(doc(db, 'system', 'topup_config'), {
            bankFee, trueMoneyFee, updatedAt: serverTimestamp()
        }, { merge: true });
        showToast(`บันทึกค่าธรรมเนียมสำเร็จ (ธนาคาร: ${bankFee}%, TrueMoney: ${trueMoneyFee}%)`, 'success');
    } catch (e) { showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error'); }
}

function calcNetAmount(grossAmount, paymentType = 'bank') {
    const pct = paymentType === 'truemoney'
        ? parseFloat(document.getElementById('fee_truemoney')?.value || 0)
        : parseFloat(document.getElementById('fee_bank')?.value     || 0);
    return Math.floor(grossAmount * (1 - pct / 100));
}

// ── Exports ───────────────────────────────────────────────────
window.setupTopupRealtime    = setupTopupRealtime;
window.loadTopupRequests     = loadTopupRequests;
window.updateTopupStats      = updateTopupStats;
window.openTopupModal        = openTopupModal;
window.closeTopupModal       = closeTopupModal;
window.viewSlip              = viewSlip;
window.showRejectForm        = showRejectForm;
window.hideRejectForm        = hideRejectForm;
window.approveTopup          = approveTopup;
window.rejectTopup           = rejectTopup;
window.loadFeeSettings       = loadFeeSettings;
window.saveFeeSettings       = saveFeeSettings;
window.calcNetAmount         = calcNetAmount;
