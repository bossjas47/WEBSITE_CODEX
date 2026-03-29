// ============================================================
//  js/backend/modules/fee.js
//  ระบบค่าธรรมเนียมการเติมเงิน (Fee Management)
//  ⚠ NON-MODULE: ใช้ window.firestoreFns + global db
// ============================================================

(function () {
    // ── Cache ───────────────────────────────────────────────
    let feeCache = {
        bankFee:      0,
        trueMoneyFee: 0,
        lastUpdated:  0
    };

    function _getInputs() {
        return {
            bankInput: document.getElementById('fee_bank'),
            tmInput:   document.getElementById('fee_truemoney')
        };
    }

    // ── updateFeePreviews ────────────────────────────────────
    function updateFeePreviews() {
        const { bankInput, tmInput } = _getInputs();
        const bankPreview = document.getElementById('fee_bank_preview');
        const tmPreview   = document.getElementById('fee_truemoney_preview');

        if (bankInput && bankPreview) {
            const pct = parseFloat(bankInput.value) || 0;
            const net = Math.floor(1000 * (1 - pct / 100));
            bankPreview.textContent = '฿' + net.toLocaleString('th-TH');
        }
        if (tmInput && tmPreview) {
            const pct = parseFloat(tmInput.value) || 0;
            const net = Math.floor(1000 * (1 - pct / 100));
            tmPreview.textContent = '฿' + net.toLocaleString('th-TH');
        }
    }

    // ── loadFeeSettings ──────────────────────────────────────
    async function loadFeeSettings() {
        const { bankInput, tmInput } = _getInputs();
        const loadBtn = document.getElementById('feeLoadBtn');

        if (loadBtn) { loadBtn.disabled = true; loadBtn.innerHTML = '<i class="fa-solid fa-rotate fa-spin mr-1"></i>กำลังโหลด...'; }

        try {
            const { doc, getDoc } = window.firestoreFns;
            const snap = await getDoc(doc(db, 'system', 'topup_config'));

            if (snap.exists()) {
                const data = snap.data();
                feeCache.bankFee      = Number(data.bankFee)      || 0;
                feeCache.trueMoneyFee = Number(data.trueMoneyFee) || 0;
                feeCache.lastUpdated  = Date.now();
                // ✅ Fix: ตั้งค่า input ทั้งสองตัวให้ถูกต้อง
                if (bankInput) bankInput.value = feeCache.bankFee;
                if (tmInput)   tmInput.value   = feeCache.trueMoneyFee;
                updateFeePreviews();
                console.log('[Fee] Loaded:', feeCache);
            } else {
                if (bankInput) bankInput.value = 0;
                if (tmInput)   tmInput.value   = 0;
                updateFeePreviews();
                console.log('[Fee] No config found, using defaults');
            }
            return feeCache;
        } catch (error) {
            console.error('[Fee] Load error:', error);
            if (typeof showToast === 'function') showToast('โหลดค่าธรรมเนียมไม่สำเร็จ', 'error');
            return feeCache;
        } finally {
            if (loadBtn) { loadBtn.disabled = false; loadBtn.innerHTML = '<i class="fa-solid fa-rotate mr-1"></i>โหลด'; }
        }
    }

    // ── saveFeeSettings ──────────────────────────────────────
    async function saveFeeSettings() {
        const { bankInput, tmInput } = _getInputs();
        const saveBtn = document.getElementById('feeSaveBtn');

        const bankFee = parseFloat(bankInput?.value) || 0;
        const tmFee   = parseFloat(tmInput?.value)   || 0;

        if (bankFee < 0 || bankFee > 100 || tmFee < 0 || tmFee > 100) {
            if (typeof showToast === 'function') showToast('ค่าธรรมเนียมต้องอยู่ระหว่าง 0-100%', 'error');
            return false;
        }

        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1"></i>กำลังบันทึก...'; }

        try {
            const { doc, setDoc, serverTimestamp } = window.firestoreFns;
            await setDoc(doc(db, 'system', 'topup_config'), {
                bankFee:      bankFee,
                trueMoneyFee: tmFee,
                updatedAt:    serverTimestamp(),
                updatedBy:    (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : 'admin'
            }, { merge: true });

            feeCache.bankFee      = bankFee;
            feeCache.trueMoneyFee = tmFee;
            feeCache.lastUpdated  = Date.now();

            if (typeof showToast === 'function') showToast('บันทึกค่าธรรมเนียมสำเร็จ', 'success');
            updateFeePreviews();
            return true;

        } catch (error) {
            console.error('[Fee] Save error:', error);
            if (typeof showToast === 'function') showToast('บันทึกไม่สำเร็จ: ' + error.message, 'error');
            return false;
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i>บันทึก'; }
        }
    }

    // ── calculateNetAmount ───────────────────────────────────
    function calculateNetAmount(grossAmount, methodType) {
        const feePercent = methodType === 'truemoney' ? feeCache.trueMoneyFee : feeCache.bankFee;
        const feeAmount  = Math.floor((grossAmount * feePercent) / 100);
        return { grossAmount, feePercent, feeAmount, netAmount: grossAmount - feeAmount };
    }

    function getCurrentFees() { return { ...feeCache }; }

    // ── Attach real-time preview listeners ───────────────────
    function attachFeeListeners() {
        const { bankInput, tmInput } = _getInputs();
        if (bankInput && !bankInput.dataset.feeListener) {
            bankInput.addEventListener('input', updateFeePreviews);
            bankInput.dataset.feeListener = '1';
        }
        if (tmInput && !tmInput.dataset.feeListener) {
            tmInput.addEventListener('input', updateFeePreviews);
            tmInput.dataset.feeListener = '1';
        }
    }

    // ── Init ─────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        attachFeeListeners();
        if (document.getElementById('payments') || document.getElementById('topup')) {
            loadFeeSettings();
        }
    });

    // ── Exports ──────────────────────────────────────────────
    window.loadFeeSettings    = loadFeeSettings;
    window.saveFeeSettings    = saveFeeSettings;
    window.calculateNetAmount = calculateNetAmount;
    window.updateFeePreviews  = updateFeePreviews;
    window.getCurrentFees     = getCurrentFees;
    window.attachFeeListeners = attachFeeListeners;

})();
