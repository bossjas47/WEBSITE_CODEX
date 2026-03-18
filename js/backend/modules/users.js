// ==================== ENHANCED USER MANAGEMENT with Roles ====================

async function loadUsers() {
    if (!checkAccess('manage_users')) return;
    
    const grid = document.getElementById('usersGrid');
    const emptyState = document.getElementById('usersEmpty');
    const loadingState = document.getElementById('usersLoading');
    const errorState = document.getElementById('usersError');
    
    if (grid) grid.innerHTML = '';
    if (emptyState) emptyState.classList.add('hidden');
    if (errorState) errorState.classList.add('hidden');
    if (loadingState) loadingState.classList.remove('hidden');
    
    try {
        if (!db) throw new Error('Firebase ยังไม่พร้อมใช้งาน');
        
        // Load roles first
        await loadRoles();
        
        const { collection, getDocs, query, orderBy } = window.firestoreFns;
        let usersList = [];
        
        try {
            const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            snap.forEach(d => usersList.push({ id: d.id, ...d.data() }));
        } catch (indexError) {
            const snap = await getDocs(collection(db, 'users'));
            snap.forEach(d => usersList.push({ id: d.id, ...d.data() }));
            usersList.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        }
        
        allUsers = usersList;
        
        if (loadingState) loadingState.classList.add('hidden');
        
        if (allUsers.length === 0) {
            if (emptyState) emptyState.classList.remove('hidden');
        } else {
            renderUsers(allUsers);
        }
        
    } catch (e) {
        console.error('Load users error:', e);
        if (loadingState) loadingState.classList.add('hidden');
        if (errorState) {
            errorState.classList.remove('hidden');
            const errorMsg = document.getElementById('usersErrorMsg');
            if (errorMsg) errorMsg.textContent = e.message;
        }
        showToast('โหลดข้อมูลผู้ใช้ล้มเหลว: ' + e.message, 'error');
    }
}

function renderUsers(users) {
    const container = document.getElementById('usersGrid');
    const emptyState = document.getElementById('usersEmpty');
    
    if (!container) return;
    
    if (!users || users.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }
    
    if (emptyState) emptyState.classList.add('hidden');
    
    container.innerHTML = users.map(u => {
        const initials = (u.displayName || u.username || u.email || 'U')[0].toUpperCase();
        const isBanned = u.isBanned || false;
        const userRole = allRoles.find(r => r.code === u.role) || { name: 'ผู้ใช้', code: 'user' };
        
        let roleBadgeClass = 'role-badge user';
        if (userRole.code === 'super_admin') roleBadgeClass = 'role-badge super_admin';
        else if (userRole.code === 'admin') roleBadgeClass = 'role-badge admin';
        else if (userRole.code === 'agent') roleBadgeClass = 'role-badge agent';
        else if (userRole.code !== 'user') roleBadgeClass = 'role-badge custom';
        
        const canEditBalance = hasPermission('edit_user_balance');
        const canChangeRole = hasPermission('change_user_role');
        
        return `
            <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-lg transition-all ${isBanned ? 'border-l-4 border-l-red-500 opacity-75' : ''} group relative overflow-hidden">
                <div class="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                    <button onclick="openEditUserModal('${u.id}')" class="action-btn edit" title="แก้ไขข้อมูล">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button onclick="openUserDetailModal('${u.id}')" class="action-btn history" title="ดูประวัติ">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                    </button>
                    <button onclick="toggleBan('${u.id}', ${!isBanned})" class="action-btn ${isBanned ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-500' : 'ban'}" title="${isBanned ? 'ปลดแบน' : 'ระงับ'}">
                        <i class="fa-solid ${isBanned ? 'fa-check' : 'fa-ban'}"></i>
                    </button>
                </div>

                <div class="flex items-center gap-4 mb-4">
                    <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-white font-bold text-xl flex-shrink-0 shadow-lg shadow-sky-200 relative overflow-hidden">
                        ${initials}
                        <div class="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="font-bold text-slate-800 text-base truncate group-hover:text-sky-600 transition-colors">${u.displayName || u.username || 'ไม่ระบุชื่อ'}</div>
                        <div class="text-sm text-slate-500 truncate">${u.email || u.username || '-'}</div>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="${roleBadgeClass}">
                                <i class="fa-solid fa-shield-halved text-xs"></i>
                                ${userRole.name}
                            </span>
                            ${isBanned ? '<span class="text-xs text-red-500 font-bold">(ระงับ)</span>' : ''}
                        </div>
                        ${u.phone ? `<div class="text-xs text-slate-400 mt-0.5"><i class="fa-solid fa-phone mr-1"></i>${u.phone}</div>` : ''}
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-3 mb-4">
                    <div class="p-3 bg-slate-50 rounded-xl text-center">
                        <div class="text-xs text-slate-500 mb-1">ยอดเงิน</div>
                        <div class="font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-indigo-600">฿${(u.balance || 0).toLocaleString()}</div>
                    </div>
                    <div class="p-3 bg-slate-50 rounded-xl text-center">
                        <div class="text-xs text-slate-500 mb-1">สถานะ</div>
                        <div class="text-xs font-bold ${isBanned ? 'text-red-500' : 'text-emerald-500'}">
                            ${isBanned ? 'ระงับการใช้งาน' : 'ปกติ'}
                        </div>
                    </div>
                </div>

                <div class="flex gap-2">
                    <button onclick="openEditUserModal('${u.id}')" class="flex-1 py-2.5 bg-sky-50 text-sky-600 rounded-xl font-semibold hover:bg-sky-100 transition-colors text-sm flex items-center justify-center gap-2">
                        <i class="fa-solid fa-pen"></i> แก้ไข
                    </button>
                    <button onclick="openUserDetailModal('${u.id}')" class="flex-1 py-2.5 bg-violet-50 text-violet-600 rounded-xl font-semibold hover:bg-violet-100 transition-colors text-sm flex items-center justify-center gap-2">
                        <i class="fa-solid fa-list"></i> ประวัติ
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Edit User Functions with Role Support
async function openEditUserModal(userId) {
    if (!checkAccess('manage_users')) return;
    
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
        showToast('ไม่พบข้อมูลผู้ใช้', 'error');
        return;
    }
    
    currentEditingUser = user;
    
    // Load roles for dropdown
    await loadRoles();
    
    document.getElementById('editUserId').value = userId;
    document.getElementById('editDisplayName').value = user.displayName || '';
    document.getElementById('editEmail').value = user.email || user.username || '';
    document.getElementById('editBalance').value = user.balance || 0;
    document.getElementById('editPassword').value = '';
    
    // Populate role dropdown - รวมถึง Super Admin
    const roleSelect = document.getElementById('editUserRole');
    roleSelect.innerHTML = allRoles.map(r => 
        `<option value="${r.code}" ${user.role === r.code ? 'selected' : ''}>${r.name} ${r.code === 'super_admin' ? '👑' : ''}</option>`
    ).join('');
    
    if (!hasPermission('change_user_role')) {
        roleSelect.disabled = true;
        roleSelect.title = 'คุณไม่มีสิทธิ์เปลี่ยนยศผู้ใช้';
    } else {
        roleSelect.disabled = false;
        roleSelect.title = 'สามารถมอบยศ Super Admin ให้ผู้ใช้นี้ได้';
    }
    
    // Populate permissions override
    const permContainer = document.getElementById('editUserPermissions');
    const userPerms = user.permissions || [];
    
    permContainer.innerHTML = availablePermissions.map(p => `
        <label class="permission-item mb-2">
            <input type="checkbox" name="user_perm" value="${p.value}" ${userPerms.includes(p.value) ? 'checked' : ''}>
            <div class="flex-1">
                <div class="font-medium text-slate-800 text-sm">${p.label}</div>
            </div>
        </label>
    `).join('');
    
    document.getElementById('editUserModal').classList.add('active');
}

function closeEditUserModal() {
    document.getElementById('editUserModal').classList.remove('active');
    currentEditingUser = null;
}

async function saveUserEdit(event) {
    event.preventDefault();
    
    if (!currentEditingUser) return;
    if (!checkAccess('manage_users')) return;
    
    const userId = document.getElementById('editUserId').value;
    const displayName = document.getElementById('editDisplayName').value.trim();
    const balance = parseFloat(document.getElementById('editBalance').value) || 0;
    const password = document.getElementById('editPassword').value;
    const role = document.getElementById('editUserRole').value;
    
    // Get selected permissions
    const selectedPerms = Array.from(document.querySelectorAll('input[name="user_perm"]:checked')).map(cb => cb.value);
    
    try {
        const { doc, updateDoc, serverTimestamp } = window.firestoreFns;
        
        const updateData = {
            displayName: displayName,
            updatedAt: serverTimestamp()
        };
        
        if (hasPermission('edit_user_balance')) {
            updateData.balance = balance;
        }
        
        if (hasPermission('change_user_role')) {
            updateData.role = role;
            // ถ้าเป็น Super Admin ให้แจ้งเตือน
            if (role === 'super_admin') {
                showToast('มอบยศ Super Admin ให้ผู้ใช้สำเร็จ!', 'success');
            }
        }
        
        // Only update permissions if different from role default
        const roleData = allRoles.find(r => r.code === role);
        const defaultPerms = roleData?.permissions || [];
        const hasCustomPerms = JSON.stringify(selectedPerms.sort()) !== JSON.stringify(defaultPerms.sort());
        
        if (hasCustomPerms) {
            updateData.permissions = selectedPerms;
        } else {
            updateData.permissions = null; // Use role default
        }
        
        if (password && password.length >= 6) {
            updateData.password = password;
        }
        
        await updateDoc(doc(db, 'users', userId), updateData);
        
        showToast('บันทึกข้อมูลสำเร็จ', 'success');
        closeEditUserModal();
        loadUsers();
        
    } catch (e) {
        console.error('Save user error:', e);
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

// User Detail & History Functions
async function openUserDetailModal(userId) {
    if (!checkAccess('manage_users')) return;
    
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    currentDetailUser = user;
    
    const userRole = allRoles.find(r => r.code === user.role) || { name: 'ผู้ใช้', code: 'user' };
    
    // Update header info
    document.getElementById('detailUserAvatar').textContent = (user.displayName || user.username || 'U')[0].toUpperCase();
    document.getElementById('detailUserName').textContent = user.displayName || user.username || 'ไม่ระบุชื่อ';
    document.getElementById('detailUserEmail').textContent = user.email || user.username || '-';
    document.getElementById('detailUserBalance').textContent = '฿' + (user.balance || 0).toLocaleString();
    document.getElementById('detailUserRole').textContent = 'ยศ: ' + userRole.name + (userRole.code === 'super_admin' ? ' 👑' : '');
    
    const statusEl = document.getElementById('detailUserStatus');
    if (user.isBanned) {
        statusEl.innerHTML = 'สถานะ: <span class="text-red-500 font-bold">ระงับการใช้งาน</span>';
    } else {
        statusEl.innerHTML = 'สถานะ: <span class="text-emerald-500 font-bold">ปกติ</span>';
    }
    
    document.getElementById('userDetailModal').classList.add('active');
    
    // Load history
    await loadUserHistory(userId);
}

function closeUserDetailModal() {
    document.getElementById('userDetailModal').classList.remove('active');
    currentDetailUser = null;
}

function openEditFromDetail() {
    if (currentDetailUser) {
        closeUserDetailModal();
        setTimeout(() => openEditUserModal(currentDetailUser.id), 300);
    }
}

async function loadUserHistory(userId) {
    try {
        const { collection, getDocs, query, where, orderBy } = window.firestoreFns;
        
        // Load Orders
        let orders = [];
        try {
            const q = query(collection(db, 'orders'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            snap.forEach(d => orders.push({ id: d.id, ...d.data() }));
        } catch (e) {
            const q = query(collection(db, 'orders'), where('userId', '==', userId));
            const snap = await getDocs(q);
            snap.forEach(d => orders.push({ id: d.id, ...d.data() }));
            orders.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        }
        
        document.getElementById('orderCountBadge').textContent = orders.length;
        
        const ordersContainer = document.getElementById('historyContent-orders');
        if (orders.length === 0) {
            ordersContainer.innerHTML = `
                <div class="text-center py-8 text-slate-400">
                    <i class="fa-solid fa-inbox text-4xl mb-2 text-slate-300"></i>
                    <p>ไม่มีประวัติการสั่งซื้อ</p>
                </div>
            `;
        } else {
            ordersContainer.innerHTML = orders.map(o => {
                const date = o.createdAt ? new Date(o.createdAt.toDate()).toLocaleString('th-TH') : '-';
                const statusClass = o.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 
                                  o.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
                
                // Determine order type icon and label
                let typeIcon = 'fa-shopping-bag';
                let typeLabel = 'สินค้า';
                let typeClass = 'bg-sky-100 text-sky-700';
                
                if (o.orderType === 'rent') {
                    typeIcon = 'fa-globe';
                    typeLabel = 'เช่าเว็บ';
                    typeClass = 'bg-violet-100 text-violet-700';
                } else if (o.orderType === 'service') {
                    typeIcon = 'fa-concierge-bell';
                    typeLabel = 'บริการ';
                    typeClass = 'bg-emerald-100 text-emerald-700';
                }
                
                return `
                    <div class="timeline-item order p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <div class="font-bold text-slate-800 flex items-center gap-2">
                                    ออเดอร์ #${o.id.slice(-6)}
                                    <span class="text-xs px-2 py-0.5 rounded-full ${typeClass}">
                                        <i class="fa-solid ${typeIcon} mr-1"></i>${typeLabel}
                                    </span>
                                </div>
                                <div class="text-xs text-slate-500">${date}</div>
                            </div>
                            <span class="px-2 py-1 rounded-full text-xs font-bold ${statusClass}">
                                ${o.status === 'completed' ? 'สำเร็จ' : o.status === 'cancelled' ? 'ยกเลิก' : 'รอดำเนินการ'}
                            </span>
                        </div>
                        <div class="text-sm text-slate-600 mb-2">
                            ${o.orderType === 'rent' ? `
                                <div class="flex items-center gap-2 text-violet-600">
                                    <i class="fa-solid fa-globe"></i>
                                    <span class="font-medium">${o.websiteName || 'เว็บไซต์'}</span>
                                    <span class="text-xs bg-violet-100 px-2 py-0.5 rounded">${o.planName || ''}</span>
                                </div>
                            ` : `
                                สินค้า: ${o.packageName || 'ไม่ระบุ'}
                            `}
                        </div>
                        ${o.websiteUrl ? `<div class="text-xs text-slate-500 mb-2"><i class="fa-solid fa-link mr-1"></i>${o.websiteUrl}</div>` : ''}
                        <div class="text-right font-bold text-sky-600">฿${(o.amount || 0).toLocaleString()}</div>
                    </div>
                `;
            }).join('');
        }
        
        // Load Topups
        let topups = [];
        try {
            const q = query(collection(db, 'topup_requests'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            snap.forEach(d => topups.push({ id: d.id, ...d.data() }));
        } catch (e) {
            const q = query(collection(db, 'topup_requests'), where('userId', '==', userId));
            const snap = await getDocs(q);
            snap.forEach(d => topups.push({ id: d.id, ...d.data() }));
            topups.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        }
        
        document.getElementById('topupCountBadge').textContent = topups.length;
        
        const topupsContainer = document.getElementById('historyContent-topups');
        if (topups.length === 0) {
            topupsContainer.innerHTML = `
                <div class="text-center py-8 text-slate-400">
                    <i class="fa-solid fa-money-bill text-4xl mb-2 text-slate-300"></i>
                    <p>ไม่มีประวัติการเติมเงิน</p>
                </div>
            `;
        } else {
            topupsContainer.innerHTML = topups.map(t => {
                const date = t.createdAt ? new Date(t.createdAt.toDate()).toLocaleString('th-TH') : '-';
                const statusClass = t.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 
                                  t.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
                const statusText = t.status === 'approved' ? 'อนุมัติแล้ว' : t.status === 'rejected' ? 'ปฏิเสธ' : 'รอตรวจสอบ';
                return `
                    <div class="timeline-item topup p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <div class="font-bold text-slate-800">เติมเงิน ${t.paymentMethodName || t.bankName || 'ไม่ระบุ'}</div>
                                <div class="text-xs text-slate-500">${date}</div>
                            </div>
                            <span class="px-2 py-1 rounded-full text-xs font-bold ${statusClass}">
                                ${statusText}
                            </span>
                        </div>
                        <div class="text-sm text-slate-600 mb-2">ผ่าน: ${t.accountNumber || t.phoneNumber || '-'}</div>
                        ${t.rejectionReason ? `<div class="text-xs text-red-500 mb-2">เหตุผล: ${t.rejectionReason}</div>` : ''}
                        <div class="text-right font-bold text-emerald-600">+฿${(t.amount || 0).toLocaleString()}</div>
                    </div>
                `;
            }).join('');
        }
        
    } catch (e) {
        console.error('Load history error:', e);
        showToast('โหลดประวัติไม่สำเร็จ', 'error');
    }
}

function switchHistoryTab(tab) {
    document.getElementById('historyTab-orders').className = tab === 'orders' ? 
        'px-4 py-3 font-semibold text-sky-600 border-b-2 border-sky-500 transition-colors flex items-center gap-2' : 
        'px-4 py-3 font-semibold text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-2';
        
    document.getElementById('historyTab-topups').className = tab === 'topups' ? 
        'px-4 py-3 font-semibold text-sky-600 border-b-2 border-sky-500 transition-colors flex items-center gap-2' : 
        'px-4 py-3 font-semibold text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-2';
    
    document.getElementById('historyContent-orders').classList.toggle('hidden', tab !== 'orders');
    document.getElementById('historyContent-topups').classList.toggle('hidden', tab !== 'topups');
}

function filterUsers() {
    const search = document.getElementById('userSearch')?.value.toLowerCase() || '';
    const filter = document.getElementById('userFilter')?.value || 'all';
    
    let filtered = allUsers.filter(u => {
        const matchSearch = !search || 
            (u.username || '').toLowerCase().includes(search) || 
            (u.displayName || '').toLowerCase().includes(search) ||
            (u.email || '').toLowerCase().includes(search) ||
            (u.phone || '').includes(search);
        const matchFilter = filter === 'all' || (filter === 'active' && !u.isBanned) || (filter === 'banned' && u.isBanned);
        return matchSearch && matchFilter;
    });
    
    renderUsers(filtered);
}

async function toggleBan(userId, ban) {
    if (!checkAccess('manage_users')) return;
    if (!confirm(ban ? 'ระงับผู้ใช้นี้?' : 'ปลดแบนผู้ใช้นี้?')) return;
    
    try {
        const { doc, updateDoc, serverTimestamp } = window.firestoreFns;
        await updateDoc(doc(db, 'users', userId), {
            isBanned: ban,
            updatedAt: serverTimestamp()
        });
        showToast(ban ? 'ระงับผู้ใช้แล้ว' : 'ปลดแบนผู้ใช้แล้ว', 'success');
        loadUsers();
    } catch (e) {
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

