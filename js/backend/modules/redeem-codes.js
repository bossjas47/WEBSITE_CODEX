// ============================================================
//  js/backend/modules/redeem-codes.js
//  Admin: ระบบสร้าง/จัดการ Redeem Codes
//  Firestore: redeem_codes/{code}
// ============================================================

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

// ─── Create batch codes ───────────────────────────────────────────────────────
window.createBatchCodes = async function() {
    if (!checkAccess('manage_topup')) return;

    const qty        = parseInt(document.getElementById('rc_batchQty')?.value)  || 1;
    const amount     = parseFloat(document.getElementById('rc_batchAmount')?.value) || 0;
    const expiryDays = parseInt(document.getElementById('rc_batchExpiry')?.value) || null;
    const note       = document.getElementById('rc_batchNote')?.value.trim() || '';

    if (amount <= 0) { showToast('กรุณากรอกมูลค่า', 'error'); return; }
    if (qty < 1 || qty > 100) { showToast('จำนวนโค้ด 1-100 ใบ', 'error'); return; }

    const btn = document.querySelector('[onclick="createBatchCodes()"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังสร้าง...'; }

    try {
        const { collection, addDoc, serverTimestamp } = window.firestoreFns;
        const created = [];

        for (let i = 0; i < qty; i++) {
            const code = _generateCode();
            const expiresAt = expiryDays
                ? new Date(Date.now() + expiryDays * 86400000).toISOString()
                : null;

            const docData = {
                code,
                amount,
                isUsed: false,
                usedBy: null,
                usedAt: null,
                expiresAt,
                note,
                createdAt: serverTimestamp(),
                createdBy: document.getElementById('adminName')?.textContent || 'admin'
            };

            await addDoc(collection(db, 'redeem_codes'), docData);
            created.push(code);
        }

        showToast(`สร้างโค้ดสำเร็จ ${qty} ใบ ✓`, 'success');

        // แสดงโค้ดที่สร้างใหม่
        if (qty <= 10) {
            const codeList = created.map(c => `<code class="bg-orange-50 px-2 py-1 rounded text-orange-700 font-mono text-sm">${c}</code>`).join(' ');
            setTimeout(() => {
                if (confirm(`โค้ดที่สร้างใหม่:\n${created.join('\n')}\n\nคัดลอกทั้งหมด?`)) {
                    navigator.clipboard?.writeText(created.join('\n'));
                }
            }, 300);
        }

        loadRedeemCodes();

    } catch (e) {
        console.error('[redeem-codes] createBatchCodes error:', e);
        showToast('สร้างโค้ดไม่สำเร็จ: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-2"></i>สร้างโค้ด'; }
    }
};

// ─── Load codes table ─────────────────────────────────────────────────────────
window.loadRedeemCodes = async function() {
    try {
        const { collection, getDocs, query, orderBy } = window.firestoreFns;
        const snap = await getDocs(query(collection(db, 'redeem_codes'), orderBy('createdAt', 'desc')));

        const codes = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Stats
        const total   = codes.length;
        const used    = codes.filter(c => c.isUsed).length;
        const active  = codes.filter(c => !c.isUsed && (!c.expiresAt || new Date(c.expiresAt) > new Date())).length;
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
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-10 text-slate-400">ยังไม่มีโค้ด</td></tr>';
            return;
        }

        tbody.innerHTML = codes.map(c => {
            const isExpired = c.expiresAt && new Date(c.expiresAt) < new Date();
            const status = c.isUsed
                ? '<span class="px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-500 font-medium">ใช้แล้ว</span>'
                : isExpired
                    ? '<span class="px-2 py-1 text-xs rounded-full bg-red-100 text-red-600 font-medium">หมดอายุ</span>'
                    : '<span class="px-2 py-1 text-xs rounded-full bg-emerald-100 text-emerald-700 font-medium">ใช้ได้</span>';

            const expiryText = c.expiresAt
                ? new Date(c.expiresAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
                : '<span class="text-slate-400">ไม่มีวันหมดอายุ</span>';

            const usedByText = c.isUsed
                ? `<span class="text-xs text-slate-600">${c.usedBy || '-'}</span>`
                : '<span class="text-slate-300">-</span>';

            return `<tr class="hover:bg-slate-50 transition-colors">
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
                <td class="py-3.5 px-5">${status}</td>
                <td class="py-3.5 px-5">${usedByText}</td>
                <td class="py-3.5 px-5 text-sm text-slate-600">${expiryText}</td>
                <td class="py-3.5 px-5 text-sm text-slate-500">${c.note || '-'}</td>
                <td class="py-3.5 px-5">
                    ${!c.isUsed ? `
                    <button onclick="deleteRedeemCode('${c.id}', '${c.code}')"
                        class="px-3 py-1.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg text-xs font-medium transition-colors">
                        <i class="fa-solid fa-trash-can mr-1"></i>ลบ
                    </button>` : ''}
                </td>
            </tr>`;
        }).join('');

    } catch (e) {
        console.error('[redeem-codes] loadRedeemCodes error:', e);
        const tbody = document.getElementById('rc_tableBody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-400">โหลดไม่สำเร็จ: ${e.message}</td></tr>`;
    }
};

// ─── Delete code ──────────────────────────────────────────────────────────────
window.deleteRedeemCode = async function(docId, code) {
    if (!checkAccess('manage_topup')) return;
    if (!confirm(`ลบโค้ด "${code}" ?`)) return;

    try {
        const { doc, deleteDoc } = window.firestoreFns;
        await deleteDoc(doc(db, 'redeem_codes', docId));
        showToast('ลบโค้ดแล้ว', 'info');
        loadRedeemCodes();
    } catch (e) {
        showToast('ลบไม่สำเร็จ: ' + e.message, 'error');
    }
};

// ─── Patch navigation to load codes on tab switch ─────────────────────────────
// Called from switchTab in navigation.js
window._redeemCodesLoaded = false;
