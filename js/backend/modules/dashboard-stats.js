// ==================== DASHBOARD STATS & CHARTS ====================

async function loadDashboard() {
    if (!checkAccess('view_dashboard')) return;

    try {
        const { collection, getDocs, query, where } = window.firestoreFns;

        const usersSnap = await getDocs(collection(db, 'users'));
        const totalUsers = usersSnap.size;

        animateValue('statActiveUsers', 0, totalUsers, 1500);

        const ordersSnap = await getDocs(collection(db, 'orders'));
        allOrders = [];
        let totalRevenue = 0;

        ordersSnap.forEach(d => {
            const data = d.data();
            allOrders.push({ id: d.id, ...data });
            if (data.amount) totalRevenue += data.amount;
        });

        animateValue('statRevenueDisplay', 0, totalRevenue, 2000, '฿');

        initCharts();
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
        const value = Math.floor(progress * (end - start) + start);
        obj.innerHTML = prefix + value.toLocaleString() + suffix;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function refreshDashboard() {
    showToast('กำลังรีเฟรชข้อมูล...', 'info');
    loadDashboard();
}

function initCharts() {
    const ctx = document.getElementById('revenueChartNew').getContext('2d');

    if (mainChart) mainChart.destroy();

    mainChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.'],
            datasets: [{
                label: 'รายได้',
                data: [45000, 52000, 48000, 61000, 58000, 72000],
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
    const ctx2 = document.getElementById('categoryChart').getContext('2d');
    if (categoryChart) categoryChart.destroy();

    categoryChart = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: ['สำเร็จ', 'รอดำเนินการ', 'ยกเลิก'],
            datasets: [{
                data: [60, 30, 10],
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
