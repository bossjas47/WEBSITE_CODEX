// ============================================================
//  js/backend/modules/fake-stats.js
//  ระบบจัดการข้อมูลแสดงผล (Fake Display Stats)
//  Firestore: system/stats
//  Functions: loadFakeStats(), saveFakeStats(), previewFakeStats()
// ============================================================

async function loadFakeStats() {
    try {
        const { doc, getDoc } = window.firestoreFns;
        const snap = await getDoc(doc(db, 'system', 'stats'));
        if (!snap.exists()) return;

        const d = snap.data();
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = (val ?? '');
        };

        // เว็บไซต์ที่เช่า
        setVal('fd_today',  d.todayCount  ?? d.today  ?? 0);
        setVal('fd_week',   d.weekCount   ?? d.week   ?? 0);
        setVal('fd_month',  d.monthCount  ?? d.month  ?? 0);
        setVal('fd_year',   d.yearCount   ?? d.year   ?? 0);
        setVal('fd_total',  d.totalCount  ?? d.total  ?? 0);

        // ผู้ใช้
        setVal('fd_totalUsers',  d.totalUsers  ?? 0);
        setVal('fd_newUsers',    d.newUsers    ?? 0);
        setVal('fd_activeUsers', d.activeUsers ?? 0);
        setVal('fd_userGrowth',  d.userGrowth  ?? 0);

        // การเติมเงิน
        setVal('fd_topupToday',     d.topupToday     ?? d.todayTopups  ?? 0);
        setVal('fd_topupWeek',      d.topupWeek      ?? 0);
        setVal('fd_topupMonth',     d.topupMonth     ?? 0);
        setVal('fd_topupYear',      d.topupYear      ?? 0);
        setVal('fd_totalRevenue',   d.totalRevenue   ?? 0);
        setVal('fd_monthlyRevenue', d.monthlyRevenue ?? 0);
        setVal('fd_revenueGrowth',  d.revenueGrowth  ?? 0);

        // วันเปิดบริการ
        if (d.launchDate) {
            try {
                const ld = d.launchDate?.toDate ? d.launchDate.toDate() : new Date(d.launchDate);
                const el = document.getElementById('fd_launchDate');
                if (el) el.value = ld.toISOString().split('T')[0];
            } catch (_) {}
        }

    } catch (e) {
        console.warn('[fake-stats] loadFakeStats error:', e);
        showToast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error');
    }
}

async function saveFakeStats() {
    if (!checkAccess('manage_settings')) return;

    const getN = id => {
        const val = document.getElementById(id)?.value;
        return (val !== '' && val != null) ? parseFloat(val) : 0;
    };

    try {
        const { doc, setDoc } = window.firestoreFns;
        const launchDateStr = document.getElementById('fd_launchDate')?.value;

        const data = {
            // เว็บไซต์ที่เช่า
            todayCount:  getN('fd_today'),
            weekCount:   getN('fd_week'),
            monthCount:  getN('fd_month'),
            yearCount:   getN('fd_year'),
            totalCount:  getN('fd_total'),

            // ผู้ใช้
            totalUsers:  getN('fd_totalUsers'),
            newUsers:    getN('fd_newUsers'),
            activeUsers: getN('fd_activeUsers'),
            userGrowth:  getN('fd_userGrowth'),

            // การเติมเงิน
            topupToday:     getN('fd_topupToday'),
            topupWeek:      getN('fd_topupWeek'),
            topupMonth:     getN('fd_topupMonth'),
            topupYear:      getN('fd_topupYear'),
            totalRevenue:   getN('fd_totalRevenue'),
            monthlyRevenue: getN('fd_monthlyRevenue'),
            revenueGrowth:  getN('fd_revenueGrowth'),

            updatedAt: new Date().toISOString()
        };

        // วันเปิดบริการ — เก็บเป็น ISO string (Firestore Timestamp ถ้า SDK ใหม่)
        if (launchDateStr) {
            try {
                const dateObj = new Date(launchDateStr);
                // ลองใช้ Timestamp ถ้า sdk expose ผ่าน firestoreFns
                const { Timestamp } = window.firestoreFns;
                data.launchDate = Timestamp?.fromDate
                    ? Timestamp.fromDate(dateObj)
                    : dateObj.toISOString();
            } catch (_) {
                data.launchDate = launchDateStr;
            }
        }

        await setDoc(doc(db, 'system', 'stats'), data, { merge: true });

        // อัปเดต Dashboard cards แบบ live
        _applyFakeStatsToDashboard(data);

        showToast('บันทึกข้อมูลสำเร็จ ✓  หน้าเว็บหลักจะอัปเดตอัตโนมัติ', 'success');

    } catch (e) {
        console.error('[fake-stats] saveFakeStats error:', e);
        showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error');
    }
}

function previewFakeStats() {
    // แสดงตัวอย่างบน Dashboard โดยไม่บันทึก
    const getN = id => parseFloat(document.getElementById(id)?.value) || 0;
    const data = {
        totalRevenue:   getN('fd_totalRevenue'),
        monthlyRevenue: getN('fd_monthlyRevenue'),
        topupToday:     getN('fd_topupToday'),
        totalUsers:     getN('fd_totalUsers'),
        revenueGrowth:  getN('fd_revenueGrowth'),
        userGrowth:     getN('fd_userGrowth'),
    };
    _applyFakeStatsToDashboard(data);

    // ไปหน้า Dashboard
    const dashNav = document.querySelector('[onclick*="switchTab(\'dashboard\'"]');
    if (dashNav) switchTab('dashboard', dashNav);

    showToast('แสดงตัวอย่างบน Dashboard แล้ว (ยังไม่ได้บันทึก)', 'info');
}

function _applyFakeStatsToDashboard(d) {
    const fmt    = n => Number(n || 0).toLocaleString('th-TH');
    const fmtBal = n => '฿' + Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtPct = n => Number(n || 0).toFixed(1) + '%';

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    set('statRevenueDisplay', fmtBal(d.totalRevenue));
    set('statMonthlyRevenue', fmtBal(d.monthlyRevenue));
    set('statTodayOrdersNew', fmt(d.topupToday));
    set('statActiveUsers',    fmt(d.totalUsers));
    set('revenueGrowth',      fmtPct(d.revenueGrowth));
    set('userGrowth',         fmtPct(d.userGrowth));
}
