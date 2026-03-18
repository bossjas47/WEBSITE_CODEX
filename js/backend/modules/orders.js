// ==================== Orders Management with Rent Website Support ====================

// Order data storage for filtering
let allOrdersData = [];
let currentWebsiteOrderId = null;

async function loadOrders() {
    if (!checkAccess('manage_orders')) return;
    
    const tbody = document.getElementById('ordersTableBody');
    const emptyState = document.getElementById('ordersEmpty');
    
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8"><div class="w-8 h-8 border-4 border-sky-100 border-t-sky-400 rounded-full animate-spin mx-auto"></div></td></tr>';
    if (emptyState) emptyState.classList.add('hidden');
    
    try {
        const { collection, getDocs, query, orderBy } = window.firestoreFns;
        let ordersList = [];
        
        // ── 1. โหลด orders ปกติ ──
        try {
            const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            snap.forEach(d => ordersList.push({ id: d.id, _source: 'orders', ...d.data() }));
        } catch (indexError) {
            const snap = await getDocs(collection(db, 'orders'));
            snap.forEach(d => ordersList.push({ id: d.id, _source: 'orders', ...d.data() }));
            ordersList.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        }

        // ── 2. โหลด admin_panel_websites (คำสั่งเช่าเว็บไซต์) ──
        let websiteOrders = [];
        try {
            const wq = query(collection(db, 'admin_panel_websites'), orderBy('createdAt', 'desc'));
            const wSnap = await getDocs(wq);
            wSnap.forEach(d => {
                const data = d.data();
                // Normalize ให้ตรงกับโครงสร้าง orders
                websiteOrders.push({
                    id: d.id,
                    _source: 'admin_panel_websites',
                    // Website fields
                    subdomain: data.subdomain || '',
                    domain: data.domain || '',
                    websiteName: data.subdomain ? `${data.subdomain}.${data.domain}` : (data.domain || 'ไม่ระบุ'),
                    // Duration & Expiry
                    durationDays: data.durationDays || data.selectedDuration || 0,
                    expiryDate: data.expiryDate || null,
                    // Owner Info
                    ownerId: data.ownerId || '',
                    ownerEmail: data.ownerEmail || '',
                    ownerDisplayName: data.ownerDisplayName || '',
                    customerName: data.ownerDisplayName || data.ownerEmail || 'ไม่ระบุ',
                    customerEmail: data.ownerEmail || '',
                    // Package
                    packageId: data.packageId || '',
                    packageName: data.packageName || '',
                    // Pricing
                    totalAmount: data.totalAmount || 0,
                    basePrice: data.basePrice || 0,
                    discountPercent: data.discountPercent || 0,
                    amount: data.totalAmount || 0,
                    // Order type & status
                    orderType: 'rent',
                    rentOrderType: data.orderType || 'create', // 'create' or 'renew'
                    adminReviewStatus: data.adminReviewStatus || 'pending_review',
                    status: data.adminReviewStatus === 'approved' ? 'completed' : 
                            data.adminReviewStatus === 'rejected' ? 'cancelled' : 'pending',
                    // User Agent
                    userAgent: data.userAgent || '',
                    // Timestamps
                    createdAt: data.createdAt || null,
                });
            });
        } catch (wErr) {
            // fallback without orderBy
            try {
                const wSnap = await getDocs(collection(db, 'admin_panel_websites'));
                wSnap.forEach(d => {
                    const data = d.data();
                    websiteOrders.push({
                        id: d.id,
                        _source: 'admin_panel_websites',
                        subdomain: data.subdomain || '',
                        domain: data.domain || '',
                        websiteName: data.subdomain ? `${data.subdomain}.${data.domain}` : (data.domain || 'ไม่ระบุ'),
                        durationDays: data.durationDays || data.selectedDuration || 0,
                        expiryDate: data.expiryDate || null,
                        ownerId: data.ownerId || '',
                        ownerEmail: data.ownerEmail || '',
                        ownerDisplayName: data.ownerDisplayName || '',
                        customerName: data.ownerDisplayName || data.ownerEmail || 'ไม่ระบุ',
                        customerEmail: data.ownerEmail || '',
                        packageId: data.packageId || '',
                        packageName: data.packageName || '',
                        totalAmount: data.totalAmount || 0,
                        basePrice: data.basePrice || 0,
                        discountPercent: data.discountPercent || 0,
                        amount: data.totalAmount || 0,
                        orderType: 'rent',
                        rentOrderType: data.orderType || 'create',
                        adminReviewStatus: data.adminReviewStatus || 'pending_review',
                        status: data.adminReviewStatus === 'approved' ? 'completed' : 
                                data.adminReviewStatus === 'rejected' ? 'cancelled' : 'pending',
                        userAgent: data.userAgent || '',
                        createdAt: data.createdAt || null,
                    });
                });
                websiteOrders.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
            } catch (e2) {
                console.warn('Cannot load admin_panel_websites:', e2);
            }
        }

        // ── 3. รวม & เรียงตามวันที่ ──
        const combined = [...websiteOrders, ...ordersList];
        combined.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        
        allOrdersData = combined;
        
        // ── 4. Update stats ──
        const totalOrders = combined.length;
        const rentOrders = combined.filter(o => o.orderType === 'rent').length;
        const productOrders = combined.filter(o => o.orderType === 'product' || !o.orderType).length;
        const pendingOrders = combined.filter(o => o.status === 'pending').length;
        const pendingReview = combined.filter(o => o.adminReviewStatus === 'pending_review').length;
        
        document.getElementById('totalOrdersCount').textContent = totalOrders;
        document.getElementById('rentOrdersCount').textContent = rentOrders;
        document.getElementById('productOrdersCount').textContent = productOrders;
        document.getElementById('pendingOrdersCount').textContent = pendingOrders;
        
        const prEl = document.getElementById('pendingReviewCount');
        if (prEl) prEl.textContent = pendingReview;
        
        // Orders badge
        const ordersBadge = document.getElementById('ordersBadge');
        if (ordersBadge) {
            const badgeCount = pendingOrders + pendingReview;
            if (badgeCount > 0) {
                ordersBadge.textContent = badgeCount;
                ordersBadge.classList.remove('hidden');
            } else {
                ordersBadge.classList.add('hidden');
            }
        }
        
        renderOrdersTable(combined);
        
    } catch (e) {
        console.error('Load orders error:', e);
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-red-500">โหลดข้อมูลไม่สำเร็จ: ' + e.message + '</td></tr>';
    }
}

function renderOrdersTable(orders) {
    const tbody = document.getElementById('ordersTableBody');
    const emptyState = document.getElementById('ordersEmpty');
    
    if (!tbody) return;
    
    const statusFilter = document.getElementById('orderStatusFilter')?.value || 'all';
    const typeFilter = document.getElementById('orderTypeFilter')?.value || 'all';
    const search = document.getElementById('orderSearch')?.value.toLowerCase() || '';
    
    // Filter orders
    let filtered = orders.filter(o => {
        // Status filter - support pending_review
        let matchStatus = statusFilter === 'all';
        if (!matchStatus) {
            if (statusFilter === 'pending_review') {
                matchStatus = o.adminReviewStatus === 'pending_review';
            } else {
                matchStatus = o.status === statusFilter;
            }
        }

        // Type filter
        let matchType = typeFilter === 'all';
        if (!matchType) {
            if (typeFilter === 'create') matchType = o.rentOrderType === 'create';
            else if (typeFilter === 'renew') matchType = o.rentOrderType === 'renew';
            else if (typeFilter === 'rent') matchType = o.orderType === 'rent';
            else if (typeFilter === 'product') matchType = (!o.orderType || o.orderType === 'product');
            else matchType = o.orderType === typeFilter;
        }

        const matchSearch = !search || 
            (o.id || '').toLowerCase().includes(search) || 
            (o.customerName || '').toLowerCase().includes(search) ||
            (o.customerEmail || '').toLowerCase().includes(search) ||
            (o.ownerEmail || '').toLowerCase().includes(search) ||
            (o.ownerDisplayName || '').toLowerCase().includes(search) ||
            (o.websiteName || '').toLowerCase().includes(search) ||
            (o.subdomain || '').toLowerCase().includes(search) ||
            (o.domain || '').toLowerCase().includes(search) ||
            (o.packageName || '').toLowerCase().includes(search);
        return matchStatus && matchType && matchSearch;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }
    
    if (emptyState) emptyState.classList.add('hidden');
    
    const canCancel = hasPermission('cancel_orders');
    const canManage = hasPermission('manage_orders');
    
    tbody.innerHTML = filtered.map(o => {
        const date = o.createdAt ? new Date(o.createdAt.toDate()).toLocaleDateString('th-TH', { 
            day: 'numeric', month: 'short', year: '2-digit'
        }) : '-';
        
        // ── Order Type Badges ──
        let typeBadge = '';
        let detailInfo = '';
        
        if (o.orderType === 'rent') {
            // Main type badge
            typeBadge = `<span class="order-type-badge rent"><i class="fa-solid fa-globe mr-1"></i>เช่าเว็บ</span>`;
            
            // Sub-type badge (create / renew)
            if (o.rentOrderType === 'renew') {
                typeBadge += `<br><span class="order-type-badge renew mt-1" style="font-size:0.65rem;padding:2px 8px;"><i class="fa-solid fa-rotate-right mr-1"></i>ต่ออายุ</span>`;
            } else {
                typeBadge += `<br><span class="order-type-badge create mt-1" style="font-size:0.65rem;padding:2px 8px;"><i class="fa-solid fa-plus mr-1"></i>สร้างใหม่</span>`;
            }

            // Website detail info
            const fullUrl = o.subdomain && o.domain ? `${o.subdomain}.${o.domain}` : (o.websiteName || '-');
            detailInfo = `
                <div class="flex flex-col gap-0.5">
                    <span class="font-bold text-violet-700 text-sm">${fullUrl}</span>
                    ${o.packageName ? `<span class="text-xs text-slate-500"><i class="fa-solid fa-box mr-1"></i>${o.packageName}</span>` : ''}
                    ${o.durationDays ? `<span class="text-xs text-slate-400"><i class="fa-solid fa-calendar-days mr-1"></i>${o.durationDays} วัน</span>` : ''}
                </div>
            `;
        } else if (o.orderType === 'service') {
            typeBadge = `<span class="order-type-badge service"><i class="fa-solid fa-concierge-bell mr-1"></i>บริการ</span>`;
            detailInfo = `<span class="text-slate-600 text-sm">${o.serviceName || o.packageName || 'บริการ'}</span>`;
        } else {
            typeBadge = `<span class="order-type-badge product"><i class="fa-solid fa-shopping-bag mr-1"></i>สินค้า</span>`;
            detailInfo = `<span class="text-slate-600 text-sm">${o.packageName || 'สินค้า'}</span>`;
        }
        
        // ── Status Badges ──
        const statusClasses = {
            completed: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
            cancelled: 'bg-rose-100 text-rose-700 border border-rose-200',
            pending: 'bg-amber-100 text-amber-700 border border-amber-200'
        };
        const statusTexts = {
            completed: '<i class="fa-solid fa-check-circle mr-1"></i>สำเร็จ',
            cancelled: '<i class="fa-solid fa-xmark-circle mr-1"></i>ยกเลิก',
            pending: '<i class="fa-solid fa-clock mr-1"></i>รอดำเนินการ'
        };
        
        // Admin Review Status badge
        let adminReviewBadge = '';
        if (o._source === 'admin_panel_websites') {
            const reviewColors = {
                pending_review: 'review-badge pending_review',
                approved: 'review-badge approved',
                rejected: 'review-badge rejected'
            };
            const reviewTexts = {
                pending_review: '<i class="fa-solid fa-hourglass-half mr-1"></i>รอตรวจสอบ',
                approved: '<i class="fa-solid fa-check mr-1"></i>อนุมัติแล้ว',
                rejected: '<i class="fa-solid fa-ban mr-1"></i>ปฏิเสธ'
            };
            const rs = o.adminReviewStatus || 'pending_review';
            adminReviewBadge = `<br><span class="${reviewColors[rs] || reviewColors.pending_review}" style="margin-top:4px;display:inline-flex;">${reviewTexts[rs] || reviewTexts.pending_review}</span>`;
        }
        
        // ── Expiry Date ──
        let expiryCell = '<span class="text-slate-400 text-xs">-</span>';
        if (o.expiryDate) {
            let expiryDateObj;
            if (o.expiryDate?.toDate) expiryDateObj = o.expiryDate.toDate();
            else if (typeof o.expiryDate === 'string') expiryDateObj = new Date(o.expiryDate);
            else if (o.expiryDate?.seconds) expiryDateObj = new Date(o.expiryDate.seconds * 1000);
            
            if (expiryDateObj) {
                const now = new Date();
                const diffDays = Math.ceil((expiryDateObj - now) / (1000 * 60 * 60 * 24));
                const dateStr = expiryDateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
                if (diffDays < 0) {
                    expiryCell = `<div class="expiry-warning text-xs"><i class="fa-solid fa-triangle-exclamation mr-1"></i>${dateStr}<br><span class="text-red-400 font-normal">หมดอายุแล้ว</span></div>`;
                } else if (diffDays <= 7) {
                    expiryCell = `<div class="expiry-soon text-xs"><i class="fa-solid fa-exclamation-circle mr-1"></i>${dateStr}<br><span class="text-amber-400 font-normal">เหลือ ${diffDays} วัน</span></div>`;
                } else {
                    expiryCell = `<div class="expiry-ok text-xs"><i class="fa-solid fa-calendar-check mr-1"></i>${dateStr}<br><span class="text-emerald-400 font-normal">เหลือ ${diffDays} วัน</span></div>`;
                }
            }
        }
        
        // ── Customer/Owner Info ──
        const customerName = o.ownerDisplayName || o.customerName || o.userName || 'ไม่ระบุ';
        const customerEmail = o.ownerEmail || o.customerEmail || o.userEmail || '';
        
        // ── Pricing ──
        let priceInfo = '';
        if (o._source === 'admin_panel_websites') {
            const base = o.basePrice ? `฿${Number(o.basePrice).toLocaleString()}` : '';
            const disc = o.discountPercent ? `<span class="text-rose-500 text-xs">-${o.discountPercent}%</span>` : '';
            priceInfo = `
                <div class="flex flex-col">
                    <span class="font-bold text-slate-800 text-sm">฿${Number(o.totalAmount || 0).toLocaleString()}</span>
                    ${base || disc ? `<span class="text-xs text-slate-400">${base} ${disc}</span>` : ''}
                </div>
            `;
        } else {
            priceInfo = `<span class="font-bold text-slate-800 text-sm">฿${(o.amount || 0).toLocaleString()}</span>`;
        }
        
        // ── Action Buttons ──
        let actionButtons = '';
        if (o._source === 'admin_panel_websites') {
            actionButtons = `
                <button onclick="openWebsiteOrderModal('${o.id}')" class="px-3 py-1.5 bg-violet-50 text-violet-700 rounded-lg font-semibold hover:bg-violet-100 transition text-xs flex items-center gap-1">
                    <i class="fa-solid fa-eye"></i> ดูรายละเอียด
                </button>
            `;
        } else if (o.status === 'pending' && canCancel) {
            actionButtons = `
                <button onclick="cancelOrder('${o.id}')" class="text-red-500 hover:text-red-700 font-medium text-xs px-3 py-1.5 bg-red-50 rounded-lg hover:bg-red-100 transition">
                    <i class="fa-solid fa-xmark mr-1"></i>ยกเลิก
                </button>
            `;
        } else {
            actionButtons = '<span class="text-slate-300 text-xs">-</span>';
        }
        
        return `
            <tr class="hover:bg-slate-50/80 transition-colors ${o._source === 'admin_panel_websites' && o.adminReviewStatus === 'pending_review' ? 'border-l-4 border-amber-400 bg-amber-50/20' : ''}">
                <td class="py-3 px-4">
                    <div class="text-xs font-bold text-slate-800">#${o.id.slice(-6)}</div>
                    ${o._source === 'admin_panel_websites' ? '<div class="text-xs text-violet-500 font-medium mt-0.5"><i class="fa-solid fa-globe mr-1"></i>Website</div>' : ''}
                </td>
                <td class="py-3 px-4">${typeBadge}</td>
                <td class="py-3 px-4 text-xs text-slate-600 font-medium">${date}</td>
                <td class="py-3 px-4 text-sm">${detailInfo}</td>
                <td class="py-3 px-4">
                    <div class="text-sm text-slate-800 font-semibold">${customerName}</div>
                    <div class="text-xs text-slate-400">${customerEmail}</div>
                    ${o.ownerId ? `<div class="text-xs text-slate-300 font-mono mt-0.5 truncate max-w-[120px]">${o.ownerId.slice(0,12)}...</div>` : ''}
                </td>
                <td class="py-3 px-4">${priceInfo}</td>
                <td class="py-3 px-4">${expiryCell}</td>
                <td class="py-3 px-4">
                    <span class="px-2.5 py-1 rounded-full text-xs font-bold ${statusClasses[o.status] || statusClasses.pending}">
                        ${statusTexts[o.status] || statusTexts.pending}
                    </span>
                    ${adminReviewBadge}
                </td>
                <td class="py-3 px-4">
                    <div class="flex flex-col gap-1.5">${actionButtons}</div>
                </td>
            </tr>
        `;
    }).join('');
}

function filterOrders() {
    renderOrdersTable(allOrdersData);
}

// ── Website Order Modal ──
async function openWebsiteOrderModal(docId) {
    try {
        const { doc, getDoc } = window.firestoreFns;
        const snap = await getDoc(doc(db, 'admin_panel_websites', docId));
        if (!snap.exists()) {
            showToast('ไม่พบข้อมูล', 'error');
            return;
        }
        const data = snap.data();
        currentWebsiteOrderId = docId;

        // Set modal fields
        document.getElementById('websiteOrderModalId').textContent = `ID: ${docId}`;
        
        const sub = data.subdomain || '';
        const dom = data.domain || '';
        document.getElementById('wom_subdomain').textContent = sub || '-';
        document.getElementById('wom_domain').textContent = dom || '-';
        document.getElementById('wom_fullUrl').textContent = sub && dom ? `https://${sub}.${dom}` : (dom ? `https://${dom}` : '-');

        const ot = data.orderType || 'create';
        document.getElementById('wom_orderType').innerHTML = ot === 'renew' ? 
            '<span class="order-type-badge renew"><i class="fa-solid fa-rotate-right mr-1"></i>ต่ออายุ (renew)</span>' :
            '<span class="order-type-badge create"><i class="fa-solid fa-plus mr-1"></i>สร้างใหม่ (create)</span>';

        document.getElementById('wom_durationDays').textContent = `${data.durationDays || data.selectedDuration || 0} วัน`;
        
        // Created At
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString('th-TH') : '-';
        document.getElementById('wom_createdAt').textContent = createdAt;

        // Expiry Date
        let expiryStr = '-';
        if (data.expiryDate) {
            let ed;
            if (data.expiryDate?.toDate) ed = data.expiryDate.toDate();
            else if (typeof data.expiryDate === 'string') ed = new Date(data.expiryDate);
            else if (data.expiryDate?.seconds) ed = new Date(data.expiryDate.seconds * 1000);
            if (ed) expiryStr = ed.toLocaleString('th-TH');
        }
        document.getElementById('wom_expiryDate').textContent = expiryStr;

        // Owner
        document.getElementById('wom_ownerDisplayName').textContent = data.ownerDisplayName || '-';
        document.getElementById('wom_ownerEmail').textContent = data.ownerEmail || '-';
        document.getElementById('wom_ownerId').textContent = data.ownerId || '-';

        // Package & Pricing
        document.getElementById('wom_packageId').textContent = data.packageId || '-';
        document.getElementById('wom_packageName').textContent = data.packageName || '-';
        document.getElementById('wom_basePrice').textContent = data.basePrice ? `฿${Number(data.basePrice).toLocaleString()}` : '-';
        document.getElementById('wom_discountPercent').textContent = data.discountPercent ? `${data.discountPercent}%` : '0%';
        document.getElementById('wom_totalAmount').textContent = data.totalAmount ? `฿${Number(data.totalAmount).toLocaleString()}` : '-';

        // User Agent
        document.getElementById('wom_userAgent').textContent = data.userAgent || 'ไม่มีข้อมูล User Agent';

        document.getElementById('websiteOrderModal').classList.add('active');
    } catch (e) {
        console.error('Open website order modal error:', e);
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

function closeWebsiteOrderModal() {
    document.getElementById('websiteOrderModal').classList.remove('active');
    currentWebsiteOrderId = null;
}

// Stub kept for backward compatibility with any existing onclick refs
function approveWebsiteOrder() { showToast('ระบบอนุมัติถูกนำออกแล้ว', 'info'); }
function rejectWebsiteOrder() { showToast('ระบบปฏิเสธถูกนำออกแล้ว', 'info'); }
function quickApproveWebsite() { showToast('ระบบอนุมัติถูกนำออกแล้ว', 'info'); }

async function cancelOrder(orderId) {
    if (!checkAccess('cancel_orders')) return;
    if (!confirm('ยืนยันการยกเลิกคำสั่งซื้อนี้?')) return;
    
    try {
        const { doc, updateDoc, serverTimestamp } = window.firestoreFns;
        await updateDoc(doc(db, 'orders', orderId), {
            status: 'cancelled',
            updatedAt: serverTimestamp(),
            cancelledBy: 'admin',
            cancelledAt: serverTimestamp()
        });
        showToast('ยกเลิกคำสั่งซื้อแล้ว', 'success');
        loadOrders();
    } catch (e) {
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

