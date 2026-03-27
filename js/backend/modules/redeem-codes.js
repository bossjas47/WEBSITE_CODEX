// ============================================================
//  js/backend/modules/redeem-codes.js
//  Admin: ระบบสร้าง/จัดการ Redeem Codes (เวอร์ชัน Multi-Use)
//  Firestore: redeem_codes/{code}
//  - maxUses: number | null (null = ไม่จำกัด)
//  - usedCount: number (จำนวนที่ใช้ไปแล้ว)
//  - usedByUsers: array (เก็บรายชื่อ/ID คนที่ใช้ - optional)
// ============================================================

// ─── Get Admin Name ─────────────────────────────────────────────────────
function _getAdminName() {
    try {
        if (window.auth && window.auth.currentUser) {
            const user = window.auth.currentUser;
            const name = user.displayName || user.email || 'Admin';
            return String(name);
        }
        const adminNameEl = document.getElementById('adminName');
        if (adminNameEl) {
            const name = adminNameEl.value || adminNameEl.textContent || 'Admin';
            return String(name).trim();
        }
        return 'Admin';
    } catch (e) {
        return 'Admin';
    }
}

// ─── Sanitize ─────────────────────────────────────────────────────
function _sanitizeString(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    return String(value);
}

// ─── Validate Code ─────────────────────────────────────────────────────
function _validateCode(code) {
    const regex = /^[A-Z0-9\-]{8,20}$/i;
    return regex.test(code);
}

// ─── Normalize Code ─────────────────────────────────────────────────────
function _normalizeCode(code) {
    return code.trim().toUpperCase();
}

// ─── Check Duplicate ─────────────────────────────────────────────────────
async function _checkDuplicateCode(code, excludeId = null) {
    try {
        const { collection, query, where, getDocs } = window.firestoreFns;
        const normalizedCode = _normalizeCode(code);
        const q = query(collection(db, 'redeem_codes'), where('code', '==', normalizedCode));
        const snap = await getDocs(q);
        
        if (snap.empty) return false;
        if (excludeId) {
            return snap.docs.some(doc => doc.id !== excludeId);
        }
        return true;
    } catch (e) {
        console.error('Check duplicate error:', e);
        return true;
    }
}

// ─── Generate Code ─────────────────────────────────────────────────────
function _generateCode(length = 12) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        if (i > 0 && i % 4 === 0) code += '-';
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// ─── Parse Max Uses ─────────────────────────────────────────────────────
function _parseMaxUses(value) {
    // ถ้าว่าง, null, undefined, 0 = ไม่จำกัด (null)
    if (!value && value !== 0) return null;
    const num = parseInt(value);
    if (isNaN(num) || num <= 0) return null;
    return num;
}

// ─── Create Single Code ─────────────────────────────────────────────────────
window.createSingleCode = async function() {
    if (!checkAccess('manage_topup')) return;

    const codeInput = document.getElementById('rc_singleCode');
    const amountInput = document.getElementById('rc_singleAmount');
    const expiryInput = document.getElementById('rc_singleExpiry');
    const maxUsesInput = document.getElementById('rc_singleMaxUses'); // ใหม่
    const noteInput = document.getElementById('rc_singleNote');

    let code = _normalizeCode(codeInput?.value || '');
    const amount = parseFloat(amountInput?.value) || 0;
    const expiryDate = expiryInput?.value || null;
    const maxUses = _parseMaxUses(maxUsesInput?.value); // ใหม่
    const note = noteInput?.value.trim() || '';

    if (!code || !_validateCode(code)) {
        showToast('รหัสโค้ดไม่ถูกต้อง (A-Z, 0-9, -, 8-20 ตัว)', 'error');
        return;
    }

    if (amount <= 0) {
        showToast('กรุณากรอกมูลค่า', 'error');
        return;
    }

    const isDuplicate = await _checkDuplicateCode(code);
    if (isDuplicate) {
        showToast('รหัสโค้ดนี้มีอยู่ในระบบแล้ว', 'error');
        return;
    }

    let creatorName = _sanitizeString(_getAdminName());
    if (!creatorName || creatorName === 'undefined' || creatorName === 'null') {
        creatorName = 'Admin';
    }

    const btn = document.getElementById('btnCreateSingle');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังสร้าง...';
    }

    try {
        const { collection, addDoc, serverTimestamp } = window.firestoreFns;
        
        const expiresAt = expiryDate ? new Date(expiryDate + 'T23:59:59').toISOString() : null;

        const docData = {
            code: _normalizeCode(code),
            amount: Number(amount),
            isUsed: false,
            usedBy: null,
            usedAt: null,
            // ใหม่: ระบบจำกัดจำนวน
            maxUses: maxUses, // null = ไม่จำกัด, number = จำกัด
            usedCount: 0,
            usedByUsers: [], // เก็บ array ของคนที่ใช้ [{userId, userName, usedAt}]
            //
            expiresAt: expiresAt,
            note: _sanitizeString(note),
            createdAt: serverTimestamp(),
            createdBy: creatorName,
            updatedAt: serverTimestamp(),
            updatedBy: creatorName
        };

        console.log('Creating code:', docData);

        const docRef = await addDoc(collection(db, 'redeem_codes'), docData);
        
        const limitText = maxUses ? `(ใช้ได้ ${maxUses} คน)` : '(ไม่จำกัดจำนวน)';
        showToast(`สร้างโค้ด ${code} สำเร็จ ${limitText} ✓`, 'success');
        
        if (confirm(`คัดลอกรหัส ${code} ไปยังคลิปบอร์ด?`)) {
            navigator.clipboard?.writeText(code);
        }

        // Clear form
        if (codeInput) codeInput.value = '';
        if (amountInput) amountInput.value = '100';
        if (expiryInput) expiryInput.value = '';
        if (maxUsesInput) maxUsesInput.value = ''; // ใหม่
        if (noteInput) noteInput.value = '';

        loadRedeemCodes();

    } catch (e) {
        console.error('createSingleCode error:', e);
        showToast('สร้างโค้ดไม่สำเร็จ: ' + e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-plus mr-2"></i>สร้างโค้ด';
        }
    }
};

// ─── Create Batch Codes ───────────────────────────────────────────────────────
window.createBatchCodes = async function() {
    if (!checkAccess('manage_topup')) return;

    const qty = parseInt(document.getElementById('rc_batchQty')?.value) || 1;
    const amount = parseFloat(document.getElementById('rc_batchAmount')?.value) || 0;
    const expiryDays = parseInt(document.getElementById('rc_batchExpiry')?.value) || null;
    const maxUses = _parseMaxUses(document.getElementById('rc_batchMaxUses')?.value); // ใหม่
    const note = document.getElementById('rc_batchNote')?.value.trim() || '';

    if (amount <= 0) { showToast('กรุณากรอกมูลค่า', 'error'); return; }
    if (qty < 1 || qty > 100) { showToast('จำนวนโค้ด 1-100 ใบ', 'error'); return; }

    let creatorName = _sanitizeString(_getAdminName());
    if (!creatorName || creatorName === 'undefined' || creatorName === 'null') {
        creatorName = 'Admin';
    }

    const btn = document.querySelector('[onclick="createBatchCodes()"]');
    if (btn) { 
        btn.disabled = true; 
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังสร้าง...'; 
    }

    try {
        const { collection, addDoc, serverTimestamp } = window.firestoreFns;
        const created = [];
        let duplicates = 0;

        for (let i = 0; i < qty; i++) {
            let code;
            let isDuplicate;
            let attempts = 0;
            
            do {
                code = _generateCode();
                isDuplicate = await _checkDuplicateCode(code);
                attempts++;
            } while (isDuplicate && attempts < 10);
            
            if (isDuplicate) {
                duplicates++;
                continue;
            }

            const expiresAt = expiryDays
                ? new Date(Date.now() + expiryDays * 86400000).toISOString()
                : null;

            const docData = {
                code: String(code),
                amount: Number(amount),
                isUsed: false,
                usedBy: null,
                usedAt: null,
                // ใหม่
                maxUses: maxUses,
                usedCount: 0,
                usedByUsers: [],
                //
                expiresAt: expiresAt,
                note: _sanitizeString(note),
                createdAt: serverTimestamp(),
                createdBy: creatorName,
                updatedAt: serverTimestamp(),
                updatedBy: creatorName
            };

            await addDoc(collection(db, 'redeem_codes'), docData);
            created.push(code);
        }

        if (duplicates > 0) {
            showToast(`ข้ามรหัสที่ซ้ำ ${duplicates} ใบ`, 'warning');
        }

        if (created.length > 0) {
            const limitText = maxUses ? `(ใช้ได้ ${maxUses} คน/โค้ด)` : '(ไม่จำกัด)';
            showToast(`สร้างโค้ดสำเร็จ ${created.length} ใบ ${limitText} ✓`, 'success');
            
            if (created.length <= 10) {
                setTimeout(() => {
                    if (confirm(`โค้ดที่สร้างใหม่:\n${created.join('\n')}\n\nคัดลอกทั้งหมด?`)) {
                        navigator.clipboard?.writeText(created.join('\n'));
                    }
                }, 300);
            }
        }

        loadRedeemCodes();

    } catch (e) {
        console.error('createBatchCodes error:', e);
        showToast('สร้างโค้ดไม่สำเร็จ: ' + e.message, 'error');
    } finally {
        if (btn) { 
            btn.disabled = false; 
            btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-2"></i>สร้างโค้ด'; 
        }
    }
};

// ─── Edit Code ─────────────────────────────────────────────────────────
window.editRedeemCode = async function(docId) {
    if (!checkAccess('manage_topup')) return;
    
    try {
        const { doc, getDoc } = window.firestoreFns;
        const docRef = doc(db, 'redeem_codes', docId);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
            showToast('ไม่พบข้อมูลโค้ดนี้', 'error');
            return;
        }
        
        const data = docSnap.data();
        
        window._editingCodeId = docId;
        window._editingCodeOld = data.code;
        window._editingCodeData = data; // เก็บข้อมูลเต็มไว้ใช้ตอน save
        
        document.getElementById('editCodeId').value = docId;
        document.getElementById('editCodeValue').value = data.code;
        document.getElementById('editCodeAmount').value = data.amount;
        document.getElementById('editCodeNote').value = data.note || '';
        document.getElementById('editCodeStatus').value = data.isUsed ? 'used' : 'active';
        
        // ใหม่: ใส่ค่า maxUses (ถ้า null ให้ว่าง = ไม่จำกัด)
        const maxUsesEl = document.getElementById('editCodeMaxUses');
        if (maxUsesEl) {
            maxUsesEl.value = data.maxUses || '';
        }
        
        if (data.expiresAt) {
            const date = new Date(data.expiresAt);
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            document.getElementById('editCodeExpiry').value = `${yyyy}-${mm}-${dd}`;
        } else {
            document.getElementById('editCodeExpiry').value = '';
        }
        
        // แสดงสถิติการใช้งาน
        const usageStatsEl = document.getElementById('editCodeUsageStats');
        if (usageStatsEl) {
            if (data.maxUses) {
                const remaining = data.maxUses - (data.usedCount || 0);
                const percent = Math.round((data.usedCount / data.maxUses) * 100);
                usageStatsEl.innerHTML = `
                    <div class="flex justify-between text-sm mb-1">
                        <span class="text-slate-600">ใช้ไปแล้ว ${data.usedCount || 0} จาก ${data.maxUses} คน</span>
                        <span class="font-bold ${remaining > 0 ? 'text-emerald-600' : 'text-red-600'}">เหลือ ${remaining} คน</span>
                    </div>
                    <div class="w-full bg-slate-200 rounded-full h-2">
                        <div class="bg-sky-500 h-2 rounded-full transition-all" style="width: ${percent}%"></div>
                    </div>
                `;
            } else {
                const used = data.usedCount || 0;
                usageStatsEl.innerHTML = `
                    <div class="flex justify-between text-sm mb-1">
                        <span class="text-slate-600">ใช้ไปแล้ว ${used} คน</span>
                        <span class="font-bold text-emerald-600">ไม่จำกัดจำนวน</span>
                    </div>
                    <div class="w-full bg-slate-200 rounded-full h-2">
                        <div class="bg-emerald-500 h-2 rounded-full transition-all" style="width: ${Math.min(used * 10, 100)}%"></div>
                    </div>
                `;
            }
        }
        
        document.getElementById('editCodeModal').classList.add('active');
        
    } catch (e) {
        console.error('Edit code error:', e);
        showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    }
};

// ─── Save Edited Code ─────────────────────────────────────────────────────────
window.saveEditCode = async function() {
    if (!checkAccess('manage_topup')) return;
    
    const docId = window._editingCodeId;
    if (!docId) return;
    
    const codeInput = document.getElementById('editCodeValue');
    const amountInput = document.getElementById('editCodeAmount');
    const expiryInput = document.getElementById('editCodeExpiry');
    const maxUsesInput = document.getElementById('editCodeMaxUses'); // ใหม่
    const noteInput = document.getElementById('editCodeNote');
    const statusInput = document.getElementById('editCodeStatus');
    
    let code = _normalizeCode(codeInput.value);
    const amount = parseFloat(amountInput.value) || 0;
    const expiryDate = expiryInput.value || null;
    const maxUses = _parseMaxUses(maxUsesInput?.value); // ใหม่
    const note = noteInput.value.trim();
    const status = statusInput.value;
    
    if (!code || !_validateCode(code)) {
        showToast('รหัสโค้ดไม่ถูกต้อง', 'error');
        return;
    }
    
    if (amount <= 0) {
        showToast('กรุณากรอกมูลค่า', 'error');
        return;
    }
    
    // ตรวจสอบว่าไม่ให้ตั้งจำนวนคนน้อยกว่าที่ใช้ไปแล้ว
    const currentData = window._editingCodeData || {};
    const currentUsed = currentData.usedCount || 0;
    if (maxUses !== null && maxUses < currentUsed) {
        showToast(`ไม่สามารถตั้งจำนวนคนน้อยกว่าที่ใช้ไปแล้ว (${currentUsed} คน)`, 'error');
        return;
    }
    
    if (code !== window._editingCodeOld) {
        const isDuplicate = await _checkDuplicateCode(code, docId);
        if (isDuplicate) {
            showToast('รหัสโค้ดนี้มีอยู่ในระบบแล้ว', 'error');
            return;
        }
    }
    
    let updaterName = _sanitizeString(_getAdminName());
    if (!updaterName || updaterName === 'undefined' || updaterName === 'null') {
        updaterName = 'Admin';
    }
    
    const btn = document.getElementById('btnSaveEditCode');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังบันทึก...';
    }
    
    try {
        const { doc, updateDoc, serverTimestamp } = window.firestoreFns;
        const docRef = doc(db, 'redeem_codes', docId);
        
        const updateData = {
            code: String(code),
            amount: Number(amount),
            note: _sanitizeString(note),
            maxUses: maxUses, // ใหม่
            isUsed: status === 'used' || (currentUsed >= maxUses && maxUses !== null),
            updatedAt: serverTimestamp(),
            updatedBy: updaterName
        };
        
        if (expiryDate) {
            updateData.expiresAt = new Date(expiryDate + 'T23:59:59').toISOString();
        } else {
            updateData.expiresAt = null;
        }
        
        // ถ้าเปลี่ยนสถานะเป็นใช้ได้อีกครั้ง แต่ยังไม่ครบจำนวน
        if (status === 'active' && currentData.isUsed && maxUses && currentUsed < maxUses) {
            updateData.isUsed = false;
        }
        
        await updateDoc(docRef, updateData);
        
        showToast('แก้ไขโค้ดสำเร็จ', 'success');
        closeEditCodeModal();
        loadRedeemCodes();
        
    } catch (e) {
        console.error('Save edit error:', e);
        showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-save mr-2"></i>บันทึกการแก้ไข';
        }
    }
};

// ─── Close Edit Modal ─────────────────────────────────────────────────────────
window.closeEditCodeModal = function() {
    document.getElementById('editCodeModal').classList.remove('active');
    window._editingCodeId = null;
    window._editingCodeOld = null;
    window._editingCodeData = null;
};

// ─── Delete from Edit Modal ─────────────────────────────────────────────────────────
window.deleteFromEditModal = async function() {
    const docId = window._editingCodeId;
    const code = window._editingCodeOld || 'นี้';
    if (docId) {
        await deleteRedeemCode(docId, code);
        closeEditCodeModal();
    }
};

// ─── Load codes table ─────────────────────────────────────────────────────────
window.loadRedeemCodes = async function() {
    try {
        const { collection, getDocs, query, orderBy } = window.firestoreFns;
        const snap = await getDocs(query(collection(db, 'redeem_codes'), orderBy('createdAt', 'desc')));

        const codes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Stats
        const total = codes.length;
        const used = codes.filter(c => c.isUsed || (c.usedCount >= c.maxUses && c.maxUses)).length;
        const active = codes.filter(c => {
            const notExpired = !c.expiresAt || new Date(c.expiresAt) > new Date();
            const notFull = !c.maxUses || c.usedCount < c.maxUses;
            return !c.isUsed && notExpired && notFull;
        }).length;
        const expired = codes.filter(c => !c.isUsed && c.expiresAt && new Date(c.expiresAt) <= new Date()).length;
        const totalVal = codes.filter(c => !c.isUsed && (!c.maxUses || c.usedCount < c.maxUses))
                             .reduce((s, c) => s + (c.amount || 0), 0);

        const set = (id, v) => { 
            const el = document.getElementById(id); 
            if(el) el.textContent = v; 
        };
        set('rc_totalCodes', total);
        set('rc_activeCodes', active);
        set('rc_usedCodes', used);
        set('rc_expiredCodes', expired);
        set('rc_totalValue', '฿' + totalVal.toLocaleString('th-TH'));

        const tbody = document.getElementById('rc_tableBody');
        if (!tbody) return;

        if (codes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-10 text-slate-400">ยังไม่มีโค้ด</td></tr>';
            return;
        }

        tbody.innerHTML = codes.map(c => {
            const isExpired = c.expiresAt && new Date(c.expiresAt) < new Date();
            const isFull = c.maxUses && c.usedCount >= c.maxUses;
            const daysLeft = c.expiresAt ? Math.ceil((new Date(c.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)) : null;
            
            let statusHtml;
            if (c.isUsed || isFull) {
                statusHtml = '<span class="px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-500 font-medium">ใช้ครบแล้ว</span>';
            } else if (isExpired) {
                statusHtml = '<span class="px-2 py-1 text-xs rounded-full bg-red-100 text-red-600 font-medium">หมดอายุ</span>';
            } else {
                statusHtml = '<span class="px-2 py-1 text-xs rounded-full bg-emerald-100 text-emerald-700 font-medium">ใช้ได้</span>';
            }

            const expiryText = c.expiresAt
                ? `<div class="text-sm ${isExpired ? 'text-red-500' : 'text-slate-600'}">
                     ${new Date(c.expiresAt).toLocaleDateString('th-TH')}
                   </div>`
                : '<span class="text-slate-400 text-sm">-</span>';

            // ใหม่: แสดงจำนวนคนที่ใช้ได้
            let usageText;
            if (c.maxUses) {
                const remaining = c.maxUses - (c.usedCount || 0);
                const percent = Math.round(((c.usedCount || 0) / c.maxUses) * 100);
                usageText = `
                    <div class="text-sm">
                        <div class="font-medium ${remaining > 0 ? 'text-sky-600' : 'text-red-500'}">
                            ${c.usedCount || 0}/${c.maxUses} คน
                        </div>
                        <div class="w-16 bg-slate-200 rounded-full h-1.5 mt-1">
                            <div class="${remaining > 0 ? 'bg-sky-500' : 'bg-red-500'} h-1.5 rounded-full" style="width: ${percent}%"></div>
                        </div>
                    </div>
                `;
            } else {
                usageText = `<span class="text-emerald-600 text-sm font-medium"><i class="fa-solid fa-infinity mr-1"></i>ไม่จำกัด</span>`;
            }

            const usedByText = (c.usedCount > 0)
                ? `<div class="text-xs text-slate-600">${c.usedCount} คน</div>`
                : '<span class="text-slate-300">-</span>';

            const creatorText = typeof c.createdBy === 'string' ? c.createdBy : 'Admin';

            return `<tr class="hover:bg-slate-50 transition-colors cursor-pointer group" ondblclick="editRedeemCode('${c.id}')">
                <td class="py-3.5 px-4">
                    <div class="flex items-center gap-2">
                        <code class="font-mono text-sm font-bold text-orange-700 bg-orange-50 px-2 py-1 rounded-lg">${c.code}</code>
                        <button onclick="event.stopPropagation(); navigator.clipboard?.writeText('${c.code}').then(()=>showToast('คัดลอกแล้ว','info'))"
                            class="text-slate-300 hover:text-slate-500 transition-colors" title="คัดลอก">
                            <i class="fa-regular fa-copy text-xs"></i>
                        </button>
                    </div>
                </td>
                <td class="py-3.5 px-4 font-bold text-emerald-600">฿${(c.amount||0).toLocaleString('th-TH')}</td>
                <td class="py-3.5 px-4">${statusHtml}</td>
                <td class="py-3.5 px-4">${usageText}</td> <!-- ใหม่: คอลัมน์จำนวนคน -->
                <td class="py-3.5 px-4">${usedByText}</td>
                <td class="py-3.5 px-4">${expiryText}</td>
                <td class="py-3.5 px-4 text-sm text-slate-500">
                    <div>${c.note || '-'}</div>
                    <div class="text-xs text-slate-400 mt-1">โดย: ${creatorText}</div>
                </td>
                <td class="py-3.5 px-4">
                    <div class="flex gap-2">
                        <button onclick="event.stopPropagation(); editRedeemCode('${c.id}')" 
                            class="px-3 py-1.5 bg-sky-50 text-sky-600 hover:bg-sky-100 rounded-lg text-xs font-medium transition-colors">
                            <i class="fa-solid fa-pen mr-1"></i>แก้ไข
                        </button>
                        ${(!isFull && !c.isUsed) ? `
                        <button onclick="event.stopPropagation(); deleteRedeemCode('${c.id}', '${c.code}')"
                            class="px-3 py-1.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg text-xs font-medium transition-colors">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');

    } catch (e) {
        console.error('loadRedeemCodes error:', e);
        const tbody = document.getElementById('rc_tableBody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-red-400">โหลดไม่สำเร็จ: ${e.message}</td></tr>`;
    }
};

// ─── Delete code ──────────────────────────────────────────────────────────────
window.deleteRedeemCode = async function(docId, code) {
    if (!checkAccess('manage_topup')) return;
    if (!confirm(`ลบโค้ด "${code}" ?\n\nการลบจะไม่สามารถกู้คืนได้`)) return;

    try {
        const { doc, deleteDoc } = window.firestoreFns;
        await deleteDoc(doc(db, 'redeem_codes', docId));
        showToast('ลบโค้ดแล้ว', 'success');
        loadRedeemCodes();
    } catch (e) {
        showToast('ลบไม่สำเร็จ: ' + e.message, 'error');
    }
};

window._redeemCodesLoaded = false;
