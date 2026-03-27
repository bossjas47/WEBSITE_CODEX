// ============================================================
//  js/backend/modules/redeem-codes.js
//  Admin: ระบบสร้าง/จัดการ Redeem Codes
//  Firestore: redeem_codes/{code}
// ============================================================

// Import Firebase (ถ้าใช้ module)
const FB = 'https://www.gstatic.com/firebasejs/10.7.1';
import { doc, deleteDoc, updateDoc, getDoc } from `${FB}/firebase-firestore.js`;
import { getAuth } from `${FB}/firebase-auth.js`;

// ─── Generate random code ─────────────────────────────────────────────────────
function _generateCode(length = 12) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ตัดตัวที่สับสน (0/O, 1/I)
    let code = '';
    for (let i = 0; i < length; i++) {
        if (i > 0 && i % 4 === 0) code += '-';
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code; // format: XXXX-XXXX-XXXX
}

// ─── Get current admin name ───────────────────────────────────────────────────
function _getAdminName() {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
        return user.displayName || user.email || 'Admin';
    }
    // Fallback ถ้ายังไม่มี auth
    const adminNameEl = document.getElementById('adminName');
    return adminNameEl?.textContent?.trim() || 'ไม่ระบุ';
}

// ─── Create Custom Code (Single) ───────────────────────────────────────────────
window.createCustomCode = async function() {
    if (typeof checkAccess === 'function' && !checkAccess('manage_topup')) return;

    const codeInput    = document.getElementById('rc_customCode')?.value.trim().toUpperCase();
    const amount       = parseFloat(document.getElementById('rc_customAmount')?.value) || 0;
    const expiryDays   = parseInt(document.getElementById('rc_customExpiry')?.value) || null;
    const note         = document.getElementById('rc_customNote')?.value.trim() || '';
    const maxUses      = parseInt(document.getElementById('rc_customMaxUses')?.value) || 1;

    // Validation
    if (!codeInput) { showToast('กรุณาระบุรหัสโค้ด', 'error'); return; }
    if (!/^[A-Z0-9\-]+$/.test(codeInput)) { showToast('รหัสโค้ดต้องเป็นภาษาอังกฤษตัวพิมพ์ใหญ่ ตัวเลข หรือ - เท่านั้น', 'error'); return; }
    if (codeInput.length < 4) { showToast('รหัสโค้ดต้องมีอย่างน้อย 4 ตัวอักษร', 'error'); return; }
    if (amount <= 0) { showToast('กรุณากรอกมูลค่า', 'error'); return; }
    if (maxUses < 1) { showToast('จำนวนครั้งใช้งานต้องมากกว่า 0', 'error'); return; }

    const btn = document.querySelector('[onclick="window.createCustomCode()"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังสร้าง...'; }

    try {
        const { collection, addDoc, serverTimestamp, getDocs, query, where } = window.firestoreFns || window;
        
        // Check duplicate code
        const dupQuery = query(collection(db, 'redeem_codes'), where('code', '==', codeInput));
        const dupSnap = await getDocs(dupQuery);
        if (!dupSnap.empty) {
            showToast('รหัสโค้ดนี้มีอยู่แล้วในระบบ', 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plus mr-2"></i>สร้างโค้ดนี้'; }
            return;
        }

        const expiresAt = expiryDays
            ? new Date(Date.now() + expiryDays * 86400000).toISOString()
            : null;

        const docData = {
            code: codeInput,
            amount,
            isUsed: false,
            usedBy: null,
            usedAt: null,
            usedCount: 0,
            maxUses: maxUses,
            expiresAt,
            note,
            createdAt: serverTimestamp(),
            createdBy: _getAdminName()
        };

        const docRef = await addDoc(collection(db, 'redeem_codes'), docData);
        
        showToast(`สร้างโค้ด ${codeInput} สำเร็จ ✓`, 'success');
        console.log('[redeem-codes] Created:', docRef.id, docData);
        
        // Clear form
        document.getElementById('rc_customCode').value = '';
        document.getElementById('rc_customAmount').value = '100';
        document.getElementById('rc_customExpiry').value = '';
        document.getElementById('rc_customNote').value = '';
        document.getElementById('rc_customMaxUses').value = '1';
        
        // Copy to clipboard
        setTimeout(() => {
            if (confirm(`โค้ดที่สร้าง: ${codeInput}\nมูลค่า: ฿${amount}\n\nคัดลอกไป Clipboard?`)) {
                navigator.clipboard?.writeText(codeInput);
            }
        }, 300);

        loadRedeemCodes();

    } catch (e) {
        console.error('[redeem-codes] createCustomCode error:', e);
        showToast('สร้างโค้ดไม่สำเร็จ: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plus mr-2"></i>สร้างโค้ดนี้'; }
    }
};

// ─── Create batch codes ───────────────────────────────────────────────────────
window.createBatchCodes = async function() {
    if (typeof checkAccess === 'function' && !checkAccess('manage_topup')) return;

    const qty        = parseInt(document.getElementById('rc_batchQty')?.value)  || 1;
    const amount     = parseFloat(document.getElementById('rc_batchAmount')?.value) || 0;
    const expiryDays = parseInt(document.getElementById('rc_batchExpiry')?.value) || null;
    const note       = document.getElementById('rc_batchNote')?.value.trim() || '';

    if (amount <= 0) { showToast('กรุณากรอกมูลค่า', 'error'); return; }
    if (qty < 1 || qty > 100) { showToast('จำนวนโค้ด 1-100 ใบ', 'error'); return; }

    const btn = document.querySelector('[onclick="window.createBatchCodes()"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังสร้าง...'; }

    try {
        const { collection, addDoc, serverTimestamp, getDocs, query, where } = window.firestoreFns || window;
        const created = [];
        const adminName = _getAdminName();

        for (let i = 0; i < qty; i++) {
            let code = _generateCode();
            let attempts = 0;
            let isUnique = false;
            
            // Ensure unique code
            while (!isUnique && attempts < 5) {
                const dupCheck = await getDocs(query(collection(db, 'redeem_codes'), where('code', '==', code)));
                if (dupCheck.empty) {
                    isUnique = true;
                } else {
                    code = _generateCode();
                    attempts++;
                }
            }

            const expiresAt = expiryDays
                ? new Date(Date.now() + expiryDays * 86400000).toISOString()
                : null;

            const docData = {
                code,
                amount,
                isUsed: false,
                usedBy: null,
                usedAt: null,
                usedCount: 0,
                maxUses: 1,
                expiresAt,
                note,
                createdAt: serverTimestamp(),
                createdBy: adminName
            };

            const docRef = await addDoc(collection(db, 'redeem_codes'), docData);
            created.push({ id: docRef.id, code, amount });
            console.log(`[redeem-codes] Created batch ${i+1}/${qty}: ${code}`);
        }

        showToast(`สร้างโค้ดสำเร็จ ${qty} ใบ ✓`, 'success');
        console.log('[redeem-codes] Batch created:', created);

        if (qty <= 10) {
            setTimeout(() => {
                if (confirm(`โค้ดที่สร้างใหม่:\n${created.map(c => c.code).join('\n')}\n\nคัดลอกทั้งหมด?`)) {
                    navigator.clipboard?.writeText(created.map(c => c.code).join('\n'));
                }
            }, 300);
        }

        loadRedeemCodes();

    } catch (e) {
        console.error('[redeem-codes] createBatchCodes error:', e);
        showToast('สร้างโค้ดไม่สำเร็จ: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-2"></i>สร้างโค้ดอัตโนมัติ'; }
    }
};

// ─── Load codes table ─────────────────────────────────────────────────────────
window.loadRedeemCodes = async function() {
    try {
        const { collection, getDocs, query, orderBy } = window.firestoreFns || window;
        const snap = await getDocs(query(collection(db, 'redeem_codes'), orderBy('createdAt', 'desc')));

        const codes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Stats
        const total   = codes.length;
        const used    = codes.filter(c => c.isUsed || (c.usedCount >= c.maxUses)).length;
        const active  = codes.filter(c => !c.isUsed && (c.usedCount || 0) < (c.maxUses || 1) && (!c.expiresAt || new Date(c.expiresAt) > new Date())).length;
        const totalVal = codes.filter(c => !c.isUsed).reduce((s, c) => s + (c.amount || 0), 0);

        const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
        set('rc_totalCodes',  total);
        set('rc_activeCodes', active);
        set('rc_usedCodes',   used);
        set('rc_totalValue',  '฿' + totalVal.toLocaleString('th-TH'));

        // Table
        const tbody = document.getElementById('rc_tableBody');
        if (!tbody) return;

        if (codes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-10 text-slate-400">ยังไม่มีโค้ด</td></tr>';
            return;
        }

        tbody.innerHTML = codes.map(c => {
            const isExpired = c.expiresAt && new Date(c.expiresAt) < new Date();
            const isFullyUsed = (c.usedCount || 0) >= (c.maxUses || 1);
            
            let statusHtml;
            if (isFullyUsed || c.isUsed) {
                statusHtml = '<span class="px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-500 font-medium">ใช้แล้ว</span>';
            } else if (isExpired) {
                statusHtml = '<span class="px-2 py-1 text-xs rounded-full bg-red-100 text-red-600 font-medium">หมดอายุ</span>';
            } else {
                statusHtml = '<span class="px-2 py-1 text-xs rounded-full bg-emerald-100 text-emerald-700 font-medium">ใช้ได้</span>';
            }

            const expiryText = c.expiresAt
                ? new Date(c.expiresAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
                : '<span class="text-slate-400">ไม่มีวันหมดอายุ</span>';

            const usedText = c.isUsed
                ? `<span class="text-xs text-slate-600">${c.usedBy || '-'} (${c.usedCount || 1}/${c.maxUses || 1})</span>`
                : `<span class="text-slate-400">${c.usedCount || 0}/${c.maxUses || 1} ครั้ง</span>`;

            const canEdit = !isFullyUsed && !c.isUsed;
            
            return `<tr class="hover:bg-slate-50 transition-colors" data-code-id="${c.id}">
                <td class="py-3.5 px-5">
                    <div class="flex items-center gap-2">
                        <code class="font-mono text-sm font-bold text-orange-700 bg-orange-50 px-2 py-1 rounded-lg">${c.code}</code>
                        <button onclick="navigator.clipboard?.writeText('${c.code}').then(()=>showToast('คัดลอกแล้ว','info'))"
                            class="text-slate-300 hover:text-slate-500 transition-colors" title="คัดลอก">
                            <i class="fa-regular fa-copy text-xs"></i>
                        </button>
                    </div>
                </td>
                <td class="py-3.5 px-5 font-bold text-emerald-600">฿${(c.amount||0).toLocaleString('th-TH')}</td>
                <td class="py-3.5 px-5">${statusHtml}</td>
                <td class="py-3.5 px-5">${usedText}</td>
                <td class="py-3.5 px-5 text-sm text-slate-600">${expiryText}</td>
                <td class="py-3.5 px-5 text-sm text-slate-500">${c.note || '-'}</td>
                <td class="py-3.5 px-5 text-xs text-slate-400">${c.createdBy || '-'}</td>
                <td class="py-3.5 px-5">
                    <div class="flex gap-2">
                        ${canEdit ? `
                        <button onclick="window.openEditCodeModal('${c.id}')"
                            class="p-2 bg-sky-50 text-sky-500 hover:bg-sky-100 rounded-lg transition-colors" title="แก้ไข">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>` : ''}
                        <button onclick="window.deleteRedeemCode('${c.id}', '${c.code}')"
                            class="p-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition-colors" title="ลบ">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');

    } catch (e) {
        console.error('[redeem-codes] loadRedeemCodes error:', e);
        const tbody = document.getElementById('rc_tableBody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-red-400">โหลดไม่สำเร็จ: ${e.message}</td></tr>`;
    }
};

// ─── Edit Code Modal ──────────────────────────────────────────────────────────
window.openEditCodeModal = async function(docId) {
    try {
        const { doc, getDoc } = window.firestoreFns || window;
        const snap = await getDoc(doc(db, 'redeem_codes', docId));
        if (!snap.exists()) return;

        const data = snap.data();
        document.getElementById('editCodeId').value = docId;
        document.getElementById('editCodeInput').value = data.code;
        document.getElementById('editAmountInput').value = data.amount;
        document.getElementById('editMaxUsesInput').value = data.maxUses || 1;
        document.getElementById('editNoteInput').value = data.note || '';

        document.getElementById('editCodeModal').classList.add('active');
    } catch (e) {
        showToast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error');
    }
};

window.closeEditCodeModal = function() {
    document.getElementById('editCodeModal').classList.remove('active');
};

window.saveCodeEdit = async function() {
    const docId = document.getElementById('editCodeId').value;
    const code = document.getElementById('editCodeInput').value.trim().toUpperCase();
    const amount = parseFloat(document.getElementById('editAmountInput').value);
    const maxUses = parseInt(document.getElementById('editMaxUsesInput').value);
    const note = document.getElementById('editNoteInput').value.trim();

    if (!code || isNaN(amount) || amount <= 0) {
        showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error');
        return;
    }

    try {
        await updateDoc(doc(db, 'redeem_codes', docId), {
            code,
            amount,
            maxUses,
            note
        });

        showToast('แก้ไขข้อมูลสำเร็จ', 'success');
        window.closeEditCodeModal();
        loadRedeemCodes();
    } catch (e) {
        showToast('แก้ไขไม่สำเร็จ: ' + e.message, 'error');
    }
};

// ─── Delete code ──────────────────────────────────────────────────────────────
window.deleteRedeemCode = async function(docId, code) {
    if (typeof checkAccess === 'function' && !checkAccess('manage_topup')) return;
    if (!confirm(`ลบโค้ด "${code}" ?`)) return;

    try {
        await deleteDoc(doc(db, 'redeem_codes', docId));
        showToast('ลบโค้ดแล้ว', 'info');
        loadRedeemCodes();
    } catch (e) {
        showToast('ลบไม่สำเร็จ: ' + e.message, 'error');
    }
};

// ─── Patch navigation to load codes on tab switch ─────────────────────────────
window._redeemCodesLoaded = false;
