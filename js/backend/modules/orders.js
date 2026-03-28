// ==================== Orders Management ====================

let allOrdersData = [];

async function loadOrders() {
    if (!checkAccess('manage_orders')) return;
    
    const tbody = document.getElementById('ordersTableBody');
    const emptyState = document.getElementById('ordersEmpty');
    
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8"><div class="w-8 h-8 border-4 border-sky-100 border-t-sky-400 rounded-full animate-spin mx-auto"></div></td></tr>';
    if (emptyState) emptyState.classList.add('hidden');
    
    try {
        const { collection, getDocs, query, orderBy, doc, getDoc } = window.firestoreFns;
        let ordersList = [];
        
        // ── 1. โหลด orders ทั้งหมด ──
        try {
            const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            
            for (const d of snap.docs) {
                const data = d.data();
                
                // ดึงข้อมูลผู้ใช้ถ้ามี userId แต่ไม่มีชื่อ
                let userData = {};
                if (data.userId && !data.userName) {
                    try {
                        const userSnap = await getDoc(doc(db, 'users', data.userId));
                        if (userSnap.exists()) {
                            userData = userSnap.data();
                        }
                    } catch (e) {}
                }
                
                ordersList.push({ 
                    id: d.id, 
                    _source: 'orders',
                    // แก้การ map ข้อมูลผู้ใช้
                    customerName: data.userName || data.ownerDisplayName || userData.displayName || 'ไม่ระบุ',
                    customerEmail: data.userEmail || data.ownerEmail || userData.email || '',
                    ownerId: data.userId || data.ownerId || '',
                    // ตรวจสอบประเภท: ถ้ามี subdomain หรือ websiteId = เช่าเว็บ
                    orderType: (data.subdomain || data.websiteId || data.type === 'create' || data.type === 'renew') ? 'rent' : 'product',
                    rentOrderType: data.type === 'renew' ? 'renew' : (data.type === 'create' ? 'create' : null),
                    // ข้อมูลเว็บไซต์
                    subdomain: data.subdomain || data.websiteId || '',
                    domain: data.domain || 'panderx.xyz',
                    websiteName: data.subdomain ? `${data.subdomain}.panderx.xyz` : (data.websiteId || ''),
                    packageName: data.packageName || '',
                    durationDays: data.duration || 30,
                    // ราคา (แก้ปัญหา ฿0)
                    totalAmount: Number(data.totalAmount) || Number(data.amount) || Number(data.basePrice) || 0,
                    basePrice: Number(data.basePrice) || Number(data.totalAmount) || 0,
                    discountPercent: data.discountPercent || 0,
                    // วันหมดอายุ (จาก order หรือต้องไปดึงจาก websites)
                    expiryDate: data.expiresAt || null,
                    // สถานะ
                    status: data.status || 'pending',
                    adminReviewStatus: data.adminReviewStatus || (data.status === 'completed' ? 'approved' : 'pending_review'),
                    createdAt: data.createdAt || null,
                    ...data
                });
            }
        } catch (indexError) {
            console.warn('Index error, loading without orderBy:', indexError);
            const snap = await getDocs(collection(db, 'orders'));
            snap.forEach(d => {
                const data = d.data();
                ordersList.push({ 
                    id: d.id, 
                    _source: 'orders',
                    orderType: (data.subdomain || data.websiteId) ? 'rent' : 'product',
                    customerName: data.userName || data.ownerDisplayName || 'ไม่ระบุ',
                    totalAmount: Number(data.totalAmount) || 0,
                    ...data 
                });
            });
        }

        // ── 2. โหลดข้อมูล websites สำหรับเติมวันหมดอายุ (ถ้าไม่มีใน order) ──
        const websiteDataMap = {};
        try {
            const wSnap = await getDocs(collection(db, 'websites'));
            wSnap.forEach(d => {
                websiteDataMap[d.id] = d.data();
            });
        } catch (e) {
            console.warn('Cannot load websites:', e);
        }

        // เติมข้อมูลวันหมดอายุจาก websites ถ้า order ไม่มี
        ordersList.forEach(o => {
            if (!o.expiryDate && o.subdomain && websiteDataMap[o.subdomain]) {
                o.expiryDate = websiteDataMap[o.subdomain].expiresAt || null;
            }
            // ถ้าเป็น rent แต่ไม่มี subdomain ให้ลองหาจาก websiteId
            if (o.orderType === 'rent' && !o.subdomain && o.websiteId && websiteDataMap[o.websiteId]) {
                o.subdomain = o.websiteId;
                o.domain = 'panderx.xyz';
                o.websiteName = `${o.websiteId}.panderx.xyz`;
                if (!o.expiryDate) o.expiryDate = websiteDataMap[o.websiteId].expiresAt;
            }
        });

        // ── 3. เรียงตามวันที่ ──
        ordersList.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        
        allOrdersData = ordersList;
        
        // ── 4. Update stats ──
        const totalOrders = ordersList.length;
        const rentOrders = ordersList.filter(o => o.orderType === 'rent').length;
        const productOrders = ordersList.filter(o => o.orderType === 'product').length;
        const pendingOrders = ordersList.filter(o => o.status === 'pending').length;
        
        const totalEl = document.getElementById('totalOrdersCount');
        const rentEl = document.getElementById('rentOrdersCount');
        const prodEl = document.getElementById('productOrdersCount');
        const pendEl = document.getElementById('pendingOrdersCount');
        
        if (totalEl) totalEl.textContent = totalOrders;
        if (rentEl) rentEl.textContent = rentOrders;
        if (prodEl) prodEl.textContent = productOrders;
        if (pendEl) pendEl.textContent = pendingOrders;
        
        renderOrdersTable(ordersList);
        
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
        let matchStatus = statusFilter === 'all';
        if (!matchStatus) {
            if (statusFilter === 'pending_review') {
                matchStatus = o.adminReviewStatus === 'pending_review' || (o.status === 'pending' && o.orderType === 'rent');
            } else {
                matchStatus = o.status === statusFilter;
            }
        }

        let matchType = typeFilter === 'all';
        if (!matchType) {
            if (typeFilter === 'create') matchType = o.rentOrderType === 'create';
            else if (typeFilter === 'renew') matchType = o.rentOrderType === 'renew';
            else if (typeFilter === 'rent') matchType = o.orderType === 'rent';
            else if (typeFilter === 'product') matchType = o.orderType === 'product';
        }

        const matchSearch = !search || 
            (o.id || '').toLowerCase().includes(search) || 
            (o.customerName || '').toLowerCase().includes(search) ||
            (o.customerEmail || '').toLowerCase().includes(search) ||
            (o.websiteName || '').toLowerCase().includes(search) ||
            (o.subdomain || '').toLowerCase().includes(search) ||
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
    
    tbody.innerHTML = filtered.map(o => {
        const date = o.createdAt ? new Date(o.createdAt.toDate()).toLocaleDateString('th-TH', { 
            day: 'numeric', month: 'short', year: '2-digit'
        }) : '-';
        
        // ── Order Type Badges ──
        let typeBadge = '';
        let detailInfo = '';
        
        if (o.orderType === 'rent') {
            typeBadge = `<span class="order-type-badge rent"><i class="fa-solid fa-globe mr-1"></i>เช่าเว็บ</span>`;
            
            if (o.rentOrderType === 'renew') {
                typeBadge += `<br><span class="order-type-badge renew mt-1" style="font-size:0.65rem;padding:2px 8px;"><i class="fa-solid fa-rotate-right mr-1"></i>ต่ออายุ</span>`;
            } else {
                typeBadge += `<br><span class="order-type-badge create mt-1" style="font-size:0.65rem;padding:2px 8px;"><i class="fa-solid fa-plus mr-1"></i>สร้างใหม่</span>`;
            }

            const fullUrl = o.websiteName || (o.subdomain ? `${o.subdomain}.${o.domain}` : '-');
            detailInfo = `
                <div class="flex flex-col gap-0.5">
                    <span class="font-bold text-violet-700 text-sm">${fullUrl}</span>
                    ${o.packageName ? `<span class="text-xs text-slate-500"><i class="fa-solid fa-box mr-1"></i>${o.packageName}</span>` : ''}
                    ${o.durationDays ? `<span class="text-xs text-slate-400"><i class="fa-solid fa-calendar-days mr-1"></i>${o.durationDays} วัน</span>` : ''}
                </div>
            `;
        } else {
            typeBadge = `<span class="order-type-badge product"><i class="fa-solid fa-shopping-bag mr-1"></i>สินค้า</span>`;
            detailInfo = `<span class="text-slate-600 text-sm">${o.packageName || o.productName || 'สินค้า'}</span>`;
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
        
        const statusClass = statusClasses[o.status] || statusClasses.pending;
        const statusText = statusTexts[o.status] || statusTexts.pending;
        
        // ── Expiry Date ──
        let expiryCell = '<span class="text-slate-400 text-xs">-</span>';
        if (o.expiryDate) {
            let expiryDateObj;
            if (o.expiryDate?.toDate) expiryDateObj = o.expiryDate.toDate();
            else if (typeof o.expiryDate === 'string') expiryDateObj = new Date(o.expiryDate);
            else if (o.expiryDate?.seconds) expiryDateObj = new Date(o.expiryDate.seconds * 1000);
            
            if (expiryDateObj && !isNaN(expiryDateObj)) {
                const now = new Date();
                const diffDays = Math.ceil((expiryDateObj - now) / (1000 * 60 * 60 * 24));
                const dateStr = expiryDateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
                
                if (diffDays < 0) {
                    expiryCell = `<div class="text-xs text-red-500"><i class="fa-solid fa-triangle-exclamation mr-1"></i>${dateStr}<br><span class="text-red-400">หมดอายุแล้ว</span></div>`;
                } else if (diffDays <= 7) {
                    expiryCell = `<div class="text-xs text-amber-600"><i class="fa-solid fa-exclamation-circle mr-1"></i>${dateStr}<br><span class="text-amber-500">เหลือ ${diffDays} วัน</span></div>`;
                } else {
                    expiryCell = `<div class="text-xs text-emerald-600"><i class="fa-solid fa-calendar-check mr-1"></i>${dateStr}<br><span class="text-emerald-500">เหลือ ${diffDays} วัน</span></div>`;
                }
            }
        }
        
        // ── Pricing (แก้ปัญหา ฿0) ──
        let priceDisplay = '฿0';
        const priceVal = Number(o.totalAmount) || Number(o.amount) || Number(o.basePrice) || 0;
        if (priceVal > 0) {
            priceDisplay = `฿${priceVal.toLocaleString('th-TH')}`;
        }
        
        // ── Action Buttons ──
        let actionButtons = '';
        if (o.status === 'pending' && canCancel) {
            actionButtons = `
                <button onclick="cancelOrder('${o.id}')" class="text-red-500 hover:text-red-700 font-medium text-xs px-3 py-1.5 bg-red-50 rounded-lg hover:bg-red-100 transition">
                    <i class="fa-solid fa-xmark mr-1"></i>ยกเลิก
                </button>
            `;
        } else {
            actionButtons = '<span class="text-slate-300 text-xs">-</span>';
        }
        
        return `
            <tr class="hover:bg-slate-50/80 transition-colors ${o.orderType === 'rent' ? 'border-l-4 border-violet-400' : ''}">
                <td class="py-3 px-4">
                    <div class="text-xs font-bold text-slate-800">#${o.id.slice(-6)}</div>
                    ${o.orderType === 'rent' ? '<div class="text-xs text-violet-500 font-medium mt-0.5"><i class="fa-solid fa-globe mr-1"></i>Website</div>' : ''}
                </td>
                <td class="py-3 px-4">${typeBadge}</td>
                <td class="py-3 px-4 text-xs text-slate-600 font-medium">${date}</td>
                <td class="py-3 px-4 text-sm">${detailInfo}</td>
                <td class="py-3 px-4">
                    <div class="text-sm text-slate-800 font-semibold">${o.customerName || 'ไม่ระบุ'}</div>
                    <div class="text-xs text-slate-400">${o.customerEmail || ''}</div>
                    ${o.ownerId ? `<div class="text-xs text-slate-300 font-mono mt-0.5 truncate max-w-[120px]">${o.ownerId.slice(0,12)}...</div>` : ''}
                </td>
                <td class="py-3 px-4 font-bold text-slate-800 text-sm">${priceDisplay}</td>
                <td class="py-3 px-4">${expiryCell}</td>
                <td class="py-3 px-4">
                    <span class="px-2.5 py-1 rounded-full text-xs font-bold ${statusClass}">
                        ${statusText}
                    </span>
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
