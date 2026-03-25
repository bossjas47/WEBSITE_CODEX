// ==================== DASHBOARD STATS & CHARTS - PRODUCTION READY ====================

// Expose to window immediately to prevent "is not defined" errors
window.allOrders = [];
window.allUsers = [];
window.mainChart = null;
window.categoryChart = null;

// Format utilities
window.formatNumber = (num) => {
    if (num === undefined || num === null || isNaN(num)) return '0';
    return num.toLocaleString('th-TH');
};

window.formatCurrency = (num) => {
    if (num === undefined || num === null || isNaN(num)) return '฿0';
    return '฿' + num.toLocaleString('th-TH');
};

// Animation function
window.animateValue = function(id, start, end, duration, prefix = '', suffix = '') {
    const obj = document.getElementById(id);
    if (!obj) {
        console.warn(`Element ${id} not found for animation`);
        return;
    }
    
    // Ensure end is a number
    end = parseFloat(end) || 0;
    start = parseFloat(start) || 0;
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        const current = Math.floor(start + (easeOutQuart * (end - start)));
        obj.innerHTML = prefix + window.formatNumber(current) + suffix;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = prefix + window.formatNumber(end) + suffix;
        }
    };
    window.requestAnimationFrame(step);
};

// Chart plugin for center text
const centerTextPlugin = {
    id: 'centerText',
    beforeDraw: function(chart) {
        if (chart.config.type !== 'doughnut') return;
        const { ctx, width, height } = chart;
        const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
        
        if (total === 0) return;
        
        ctx.save();
        ctx.font = 'bold 28px Prompt, sans-serif';
        ctx.fillStyle = '#1e293b';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(window.formatNumber(total), width / 2, height / 2 - 8);
        
        ctx.font = '500 13px Prompt, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('รายการ', width / 2, height / 2 + 18);
        ctx.restore();
    }
};

// Initialize Chart defaults
if (typeof Chart !== 'undefined') {
    Chart.register(centerTextPlugin);
    Chart.defaults.font.family = "'Prompt', 'Inter', sans-serif";
    Chart.defaults.color = '#64748b';
    Chart.defaults.scale.grid.color = '#f1f5f9';
} else {
    console.error('Chart.js not loaded yet!');
}

// Main load function - EXPOSED TO WINDOW
window.loadDashboard = async function() {
    console.log('=== Loading Dashboard Data ===');
    
    try {
        // Check Firebase availability with multiple fallbacks
        let dbInstance = null;
        let firestoreFns = null;
        
        if (typeof window.db !== 'undefined' && window.db) {
            dbInstance = window.db;
            console.log('Using window.db');
        } else if (typeof db !== 'undefined' && db) {
            dbInstance = db;
            console.log('Using global db');
        } else {
            console.error('Firebase DB not found. Retrying in 1s...');
            setTimeout(window.loadDashboard, 1000);
            return;
        }
        
        // Get Firestore functions
        if (window.firestoreFns && window.firestoreFns.collection) {
            firestoreFns = window.firestoreFns;
        } else if (typeof collection !== 'undefined') {
            firestoreFns = { collection, getDocs, query, orderBy, limit, where };
        } else {
            console.error('Firestore functions not available');
            return;
        }
        
        const { collection, getDocs } = firestoreFns;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        
        // ── Load Users ─────────────────────────────────────────────────────
        console.log('Fetching users from Firestore...');
        let totalUsers = 0;
        let newUsersThisMonth = 0;
        
        try {
            const usersCol = collection(dbInstance, 'users');
            const usersSnapshot = await getDocs(usersCol);
            
            window.allUsers = [];
            usersSnapshot.forEach((doc) => {
                totalUsers++;
                const data = doc.data();
                window.allUsers.push({ id: doc.id, ...data });
                
                // Check created date
                let created = data.createdAt;
                if (created && typeof created.toDate === 'function') {
                    created = created.toDate();
                }
                if (created instanceof Date && created >= startOfMonth) {
                    newUsersThisMonth++;
                }
            });
            
            console.log(`✓ Found ${totalUsers} users`);
        } catch (userErr) {
            console.error('Error loading users:', userErr);
        }
        
        // Update UI - Users
        const userCountEl = document.getElementById('statActiveUsers');
        if (userCountEl) {
            window.animateValue('statActiveUsers', 0, totalUsers, 1500);
        }
        
        const userGrowthEl = document.getElementById('userGrowth');
        if (userGrowthEl) userGrowthEl.textContent = '+' + newUsersThisMonth;
        
        // ── Load Orders ────────────────────────────────────────────────────
        console.log('Fetching orders from Firestore...');
        let totalRevenue = 0;
        let monthlyRevenue = 0;
        let lastMonthRevenue = 0;
        let todayOrders = 0;
        const revenueByMonth = {};
        
        try {
            const ordersCol = collection(dbInstance, 'orders');
            const ordersSnapshot = await getDocs(ordersCol);
            
            window.allOrders = [];
            ordersSnapshot.forEach((doc) => {
                const data = doc.data();
                const amount = parseFloat(data.totalAmount || data.amount || 0);
                
                let orderDate = data.createdAt;
                if (orderDate && typeof orderDate.toDate === 'function') {
                    orderDate = orderDate.toDate();
                } else if (orderDate && !(orderDate instanceof Date)) {
                    orderDate = new Date(orderDate);
                }
                
                window.allOrders.push({ 
                    id: doc.id, 
                    ...data, 
                    amount: amount,
                    orderDate: orderDate
                });
                
                if (amount > 0) {
                    totalRevenue += amount;
                    
                    if (orderDate instanceof Date && !isNaN(orderDate)) {
                        if (orderDate >= startOfMonth) {
                            monthlyRevenue += amount;
                        }
                        if (orderDate >= lastMonthStart && orderDate <= lastMonthEnd) {
                            lastMonthRevenue += amount;
                        }
                        
                        const key = `${orderDate.getFullYear()}-${orderDate.getMonth() + 1}`;
                        revenueByMonth[key] = (revenueByMonth[key] || 0) + amount;
                    }
                }
                
                if (orderDate instanceof Date && !isNaN(orderDate) && orderDate >= startOfToday) {
                    todayOrders++;
                }
            });
            
            console.log(`✓ Found ${window.allOrders.length} orders, Total Revenue: ${totalRevenue}`);
        } catch (orderErr) {
            console.error('Error loading orders:', orderErr);
        }
        
        // Update UI - Revenue
        const revenueEl = document.getElementById('statRevenueDisplay');
        if (revenueEl) window.animateValue('statRevenueDisplay', 0, totalRevenue, 2000, '฿');
        
        const monthlyEl = document.getElementById('statMonthlyRevenue');
        if (monthlyEl) window.animateValue('statMonthlyRevenue', 0, monthlyRevenue, 1800, '฿');
        
        const todayOrdersEl = document.getElementById('statTodayOrdersNew');
        if (todayOrdersEl) window.animateValue('statTodayOrdersNew', 0, todayOrders, 1200);
        
        // Growth calculation
        const growthEl = document.getElementById('revenueGrowth');
        if (growthEl) {
            let growthText = '0%';
            if (lastMonthRevenue > 0) {
                const pct = Math.round(((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100);
                growthText = (pct >= 0 ? '+' : '') + pct + '%';
            } else if (monthlyRevenue > 0) {
                growthText = '+100%';
            }
            growthEl.textContent = growthText;
        }
        
        // Render Charts
        console.log('Rendering charts...');
        window.renderRevenueChart(revenueByMonth);
        window.renderStatusChart(window.allOrders);
        
        console.log('=== Dashboard Load Complete ===');
        
        // Dispatch event for other scripts
        window.dispatchEvent(new CustomEvent('dashboardLoaded', { 
            detail: { users: totalUsers, orders: window.allOrders.length, revenue: totalRevenue } 
        }));
        
    } catch (error) {
        console.error('Critical Dashboard Error:', error);
        // Try to show toast if available
        if (typeof showToast === 'function') {
            showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + error.message, 'error');
        }
    }
};

// Render Revenue Chart - EXPOSED TO WINDOW
window.renderRevenueChart = function(revenueByMonth) {
    const canvas = document.getElementById('revenueChartNew');
    if (!canvas) {
        console.warn('Canvas revenueChartNew not found');
        return;
    }
    
    if (typeof Chart === 'undefined') {
        console.error('Chart.js not loaded');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Cannot get canvas context');
        return;
    }
    
    // Destroy old chart
    if (window.mainChart) {
        window.mainChart.destroy();
    }
    
    // Prepare data
    const thNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const now = new Date();
    const labels = [];
    const data = [];
    
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(thNames[d.getMonth()]);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        data.push(revenueByMonth[key] || 0);
    }
    
    // Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(14, 165, 233, 0.3)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');
    
    window.mainChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'รายได้',
                data: data,
                borderColor: '#0ea5e9',
                backgroundColor: gradient,
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#0ea5e9',
                pointBorderWidth: 3,
                pointRadius: 6,
                pointHoverRadius: 8,
                pointHoverBackgroundColor: '#0ea5e9',
                pointHoverBorderColor: '#ffffff',
                pointHoverBorderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#1e293b',
                    bodyColor: '#0ea5e9',
                    titleFont: { size: 14, weight: '600', family: 'Prompt' },
                    bodyFont: { size: 16, weight: '700', family: 'Prompt' },
                    padding: 16,
                    cornerRadius: 12,
                    displayColors: false,
                    borderColor: 'rgba(14, 165, 233, 0.2)',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            return '฿' + (context.parsed.y || 0).toLocaleString('th-TH');
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 12, weight: '500' }, color: '#64748b' }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: '#f1f5f9', borderDash: [5, 5], drawBorder: false },
                    ticks: { font: { size: 11 }, color: '#94a3b8', callback: v => v >= 1000 ? (v/1000) + 'k' : v }
                }
            },
            animation: { y: { duration: 2000, easing: 'easeOutQuart' } }
        }
    });
};

// Render Status Chart - EXPOSED TO WINDOW
window.renderStatusChart = function(orders) {
    const canvas = document.getElementById('categoryChart');
    if (!canvas) {
        console.warn('Canvas categoryChart not found');
        return;
    }
    
    if (typeof Chart === 'undefined') {
        console.error('Chart.js not loaded');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if (window.categoryChart) window.categoryChart.destroy();
    
    const completed = orders.filter(o => o.status === 'completed').length;
    const pending = orders.filter(o => o.status === 'pending' || o.status === 'pending_review').length;
    const cancelled = orders.filter(o => o.status === 'cancelled').length;
    
    window.categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['สำเร็จ', 'รอดำเนินการ', 'ยกเลิก'],
            datasets: [{
                data: [completed, pending, cancelled],
                backgroundColor: ['#34d399', '#fbbf24', '#f87171'],
                hoverBackgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 8,
                borderRadius: 8,
                spacing: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { usePointStyle: true, pointStyle: 'circle', padding: 20, font: { size: 12, weight: '500' }, color: '#64748b' }
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    bodyColor: '#64748b',
                    bodyFont: { size: 14, weight: '600', family: 'Prompt' },
                    padding: 16,
                    cornerRadius: 12,
                    callbacks: {
                        label: function(context) {
                            const val = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                            return ` ${context.label}: ${val} (${pct}%)`;
                        }
                    }
                }
            },
            animation: { animateRotate: true, animateScale: true, duration: 1500, easing: 'easeOutQuart' }
        }
    });
};

// Refresh function - EXPOSED TO WINDOW
window.refreshDashboard = function() {
    if (typeof showToast === 'function') showToast('กำลังรีเฟรชข้อมูล...', 'info');
    window.loadDashboard();
};

// Auto-load on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}

function initDashboard() {
    console.log('Dashboard JS Initialized');
    
    // Set canvas sizes
    const c1 = document.getElementById('revenueChartNew');
    const c2 = document.getElementById('categoryChart');
    if (c1) { c1.style.width = '100%'; c1.style.height = '320px'; }
    if (c2) { c2.style.width = '100%'; c2.style.height = '260px'; }
    
    // Delay load to ensure Firebase is ready
    setTimeout(() => {
        if (document.getElementById('dashboard')?.classList.contains('active')) {
            window.loadDashboard();
        }
    }, 1000);
}

// Also expose init function
window.initDashboard = initDashboard;

console.log('Dashboard.js loaded and functions exposed to window');
