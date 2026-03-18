// ==================== DASHBOARD STATS & CHARTS ====================

async function loadDashboard() {
    if (!checkAccess('view_dashboard')) return;
    
    try {
        const { collection, getDocs } = window.firestoreFns;
        
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        
        // ── Users ──────────────────────────────────────────────────────────
        const usersSnap = await getDocs(collection(db, 'users'));
        const totalUsers = usersSnap.size;
        animateValue('statActiveUsers', 0, totalUsers, 1500);
        
        let newUsersThisMonth = 0;
        usersSnap.forEach(d => {
            const created = d.data().createdAt?.toDate?.() || null;
            if (created && created >= startOfMonth) newUsersThisMonth++;
        });
        const userGrowthEl = document.getElementById('userGrowth');
        if (userGrowthEl) userGrowthEl.textContent = '+' + newUsersThisMonth;
        
        // ── Orders ─────────────────────────────────────────────────────────
        const ordersSnap = await getDocs(collection(db, 'orders'));
        allOrders = [];
        let totalRevenue = 0;
        let monthlyRevenue = 0;
        let lastMonthRevenue = 0;
        let todayOrders = 0;
        const revenueByMonth = {};
        
        ordersSnap.forEach(d => {
            const data = d.data();
            // รองรับทั้ง totalAmount และ amount
            const amount = data.totalAmount || data.amount || 0;
            const orderDate = data.createdAt?.toDate?.() || null;
            allOrders.push({ id: d.id, ...data, amount });
            
            // รายได้รวม (ไม่กรองสถานะ เหมือนต้นฉบับ)
            if (amount) {
                totalRevenue += amount;
                if (orderDate && orderDate >= startOfMonth) monthlyRevenue += amount;
                if (orderDate && orderDate >= lastMonthStart && orderDate < startOfMonth) lastMonthRevenue += amount;
                if (orderDate) {
                    const key = orderDate.getFullYear() + '-' + (orderDate.getMonth() + 1);
                    revenueByMonth[key] = (revenueByMonth[key] || 0) + amount;
                }
            }
            if (orderDate && orderDate >= startOfToday) todayOrders++;
        });
        
        animateValue('statRevenueDisplay', 0, totalRevenue, 2000, '฿');
        animateValue('statMonthlyRevenue', 0, monthlyRevenue, 1800, '฿');
        animateValue('statTodayOrdersNew', 0, todayOrders, 1200);
        
        const revenueGrowthEl = document.getElementById('revenueGrowth');
        if (revenueGrowthEl) {
            if (lastMonthRevenue === 0) {
                revenueGrowthEl.textContent = monthlyRevenue > 0 ? '+100%' : '0%';
            } else {
                const pct = Math.round(((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100);
                revenueGrowthEl.textContent = (pct >= 0 ? '+' : '') + pct + '%';
            }
        }
        
        initCharts(revenueByMonth);
        updateCategoryChart(allOrders);
        
    } catch (e) {
        console.error('Load dashboard error:', e);
        showToast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error');
    }
}

function animateValue(id, start, end, duration, prefix = '', suffix = '') {
    const obj = document.getElementById(id);
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = prefix + Math.floor(progress * (end - start) + start).toLocaleString() + suffix;
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

function refreshDashboard() {
    showToast('กำลังรีเฟรชข้อมูล...', 'info');
    loadDashboard();
}

function initCharts(revenueByMonth = {}) {
    const canvasEl = document.getElementById('revenueChartNew');
    if (!canvasEl) return;
    if (mainChart) mainChart.destroy();
    
    const thNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const now = new Date();
    const labels = [],
        data = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(thNames[d.getMonth()]);
        data.push(revenueByMonth[d.getFullYear() + '-' + (d.getMonth() + 1)] || 0);
    }
    
    mainChart = new Chart(canvasEl.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'รายได้',
                data,
                borderColor: '#0ea5e9',
                backgroundColor: 'rgba(14, 165, 233, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

function updateCategoryChart(orders) {
    const canvasEl = document.getElementById('categoryChart');
    if (!canvasEl) return;
    if (categoryChart) categoryChart.destroy();
    
    const completed = orders.filter(o => o.status === 'completed').length;
    const pending = orders.filter(o => o.status === 'pending' || o.status === 'pending_review').length;
    const cancelled = orders.filter(o => o.status === 'cancelled').length;
    
    categoryChart = new Chart(canvasEl.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['สำเร็จ', 'รอดำเนินการ', 'ยกเลิก'],
            datasets: [{
                data: [completed || 0, pending || 0, cancelled || 0],
                backgroundColor: ['#34d399', '#fbbf24', '#f87171'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%'
        }
    });
}