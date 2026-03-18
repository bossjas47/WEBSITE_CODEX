// ==================== Role Management ====================

async function loadRoles() {
    try {
        const { collection, getDocs, query, orderBy } = window.firestoreFns;
        const q = query(collection(db, 'roles'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        
        allRoles = [];
        snap.forEach(d => {
            allRoles.push({ id: d.id, ...d.data() });
        });
        
        // Ensure we have default roles if empty
        if (allRoles.length === 0) {
            await createDefaultRoles();
            return loadRoles();
        }
        
        return allRoles;
    } catch (e) {
        console.error('Load roles error:', e);
        // Return default roles if error
        allRoles = [
            { id: 'super_admin', name: 'Super Admin', code: 'super_admin', permissions: availablePermissions.map(p => p.value) },
            { id: 'admin', name: 'ผู้ดูแลระบบ', code: 'admin', permissions: availablePermissions.map(p => p.value) },
            { id: 'user', name: 'ผู้ใช้ทั่วไป', code: 'user', permissions: [] },
            { id: 'agent', name: 'ตัวแทน', code: 'agent', permissions: ['view_dashboard', 'manage_orders'] }
        ];
        return allRoles;
    }
}

async function renderRoles() {
    if (!checkAccess('manage_roles')) {
        document.getElementById('rolesList').innerHTML = `
            <div class="col-span-full access-denied">
                <i class="fa-solid fa-shield-halved text-4xl mb-4 text-red-500"></i>
                <h3 class="text-xl font-bold mb-2">ไม่มีสิทธิ์เข้าถึง</h3>
                <p>คุณไม่มีสิทธิ์ในการจัดการยศและสิทธิ์</p>
            </div>
        `;
        return;
    }
    
    await loadRoles();
    
    const container = document.getElementById('rolesList');
    
    container.innerHTML = allRoles.map(role => {
        const isDefault = role.isDefault ? '<span class="ml-2 px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full">ค่าเริ่มต้น</span>' : '';
        const permCount = role.permissions?.length || 0;
        
        let icon = 'fa-user';
        let colorClass = 'from-slate-400 to-slate-600';
        
        if (role.code === 'super_admin') {
            icon = 'fa-crown';
            colorClass = 'from-amber-400 to-orange-600';
        } else if (role.code === 'admin') {
            icon = 'fa-shield-halved';
            colorClass = 'from-red-400 to-rose-600';
        } else if (role.code === 'agent') {
            icon = 'fa-handshake';
            colorClass = 'from-violet-400 to-purple-600';
        } else if (role.code === 'user') {
            icon = 'fa-user';
            colorClass = 'from-sky-400 to-blue-600';
        } else {
            icon = 'fa-id-badge';
            colorClass = 'from-emerald-400 to-teal-600';
        }
        
        // Super Admin สามารถลบหรือแก้ไขได้ทั้งหมด แต่ต้องระวังเป็นพิเศษ
        const canModify = currentUserRole === 'super_admin' || (role.code !== 'super_admin' && role.code !== 'admin');
        
        return `
            <div class="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-lg transition-all">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex items-center gap-4">
                        <div class="w-14 h-14 rounded-2xl bg-gradient-to-br ${colorClass} flex items-center justify-center text-white text-xl shadow-lg">
                            <i class="fa-solid ${icon}"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-slate-800 text-lg flex items-center">
                                ${role.name}
                                ${isDefault}
                                ${role.code === 'super_admin' ? '<span class="ml-2 text-amber-500">👑</span>' : ''}
                            </h4>
                            <p class="text-sm text-slate-500">รหัส: ${role.code}</p>
                            ${role.description ? `<p class="text-xs text-slate-400 mt-1">${role.description}</p>` : ''}
                        </div>
                    </div>
                    ${canModify ? `
                        <div class="flex gap-2">
                            <button onclick="editRole('${role.id}')" class="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors" title="แก้ไข">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button onclick="deleteRole('${role.id}')" class="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors" title="ลบ">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    ` : '<span class="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">ไม่สามารถแก้ไขได้</span>'}
                </div>
                
                <div class="border-t border-slate-100 pt-4">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-sm font-bold text-slate-700">สิทธิ์การใช้งาน (${permCount} รายการ)</span>
                        <button onclick="togglePermissions('${role.id}')" class="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                            <i class="fa-solid fa-eye mr-1"></i>ดูทั้งหมด
                        </button>
                    </div>
                    <div class="flex flex-wrap gap-1" id="perm-${role.id}">
                        ${(role.permissions || []).slice(0, 5).map(p => {
                            const permInfo = availablePermissions.find(ap => ap.value === p);
                            return `<span class="permission-tag">${permInfo?.label || p}</span>`;
                        }).join('')}
                        ${permCount > 5 ? `<span class="permission-tag">+${permCount - 5} อื่นๆ</span>` : ''}
                    </div>
                    <div id="perm-all-${role.id}" class="hidden mt-2 pt-2 border-t border-slate-100">
                        <div class="flex flex-wrap gap-1">
                            ${(role.permissions || []).map(p => {
                                const permInfo = availablePermissions.find(ap => ap.value === p);
                                return `<span class="permission-tag">${permInfo?.label || p}</span>`;
                            }).join('')}
                        </div>
                    </div>
                </div>
                
                <div class="mt-4 pt-4 border-t border-slate-100 flex justify-between text-sm text-slate-500">
                    <span>สมาชิก: ${role.userCount || 0} คน</span>
                    <span>อัพเดตล่าสุด: ${role.updatedAt?.toDate ? new Date(role.updatedAt.toDate()).toLocaleDateString('th-TH') : '-'}</span>
                </div>
            </div>
        `;
    }).join('');
}

function togglePermissions(roleId) {
    const permDiv = document.getElementById(`perm-${roleId}`);
    const allPermDiv = document.getElementById(`perm-all-${roleId}`);
    
    if (allPermDiv.classList.contains('hidden')) {
        allPermDiv.classList.remove('hidden');
        permDiv.classList.add('hidden');
    } else {
        allPermDiv.classList.add('hidden');
        permDiv.classList.remove('hidden');
    }
}

function openRoleModal(editId = null) {
    if (!checkAccess('manage_roles')) return;
    
    const modal = document.getElementById('roleModal');
    const form = document.getElementById('roleForm');
    const title = document.getElementById('roleModalTitle');
    
    form.reset();
    document.getElementById('roleId').value = '';
    
    // Uncheck all permissions
    document.querySelectorAll('input[name="permission"]').forEach(cb => cb.checked = false);
    
    if (editId) {
        const role = allRoles.find(r => r.id === editId);
        title.innerHTML = `<i class="fa-solid fa-user-shield text-indigo-500 mr-2"></i>แก้ไขยศ ${role?.name || ''}`;
        loadRoleData(editId);
    } else {
        title.innerHTML = '<i class="fa-solid fa-user-shield text-indigo-500 mr-2"></i>สร้างยศใหม่';
        // Check default basic permissions
        document.querySelector('input[value="view_dashboard"]').checked = true;
    }
    
    modal.classList.add('active');
}

function closeRoleModal() {
    document.getElementById('roleModal').classList.remove('active');
}

async function loadRoleData(roleId) {
    const role = allRoles.find(r => r.id === roleId);
    if (!role) return;
    
    document.getElementById('roleId').value = roleId;
    document.getElementById('roleName').value = role.name || '';
    document.getElementById('roleCode').value = role.code || '';
    document.getElementById('roleDescription').value = role.description || '';
    document.getElementById('isDefaultRole').checked = role.isDefault || false;
    
    // Check permissions
    document.querySelectorAll('input[name="permission"]').forEach(cb => {
        cb.checked = role.permissions?.includes(cb.value) || false;
    });
}

async function saveRole(event) {
    event.preventDefault();
    
    const id = document.getElementById('roleId').value;
    const name = document.getElementById('roleName').value.trim();
    const code = document.getElementById('roleCode').value.trim().toLowerCase();
    const description = document.getElementById('roleDescription').value.trim();
    const isDefault = document.getElementById('isDefaultRole').checked;
    
    // Get selected permissions
    const permissions = Array.from(document.querySelectorAll('input[name="permission"]:checked')).map(cb => cb.value);
    
    if (permissions.length === 0) {
        showToast('กรุณาเลือกอย่างน้อยหนึ่งสิทธิ์', 'error');
        return;
    }
    
    // ตรวจสอบว่าไม่ให้สร้างยศซ้ำชื่อกับ super_admin ถ้าไม่ใช่การแก้ไข
    if (!id && code === 'super_admin') {
        showToast('ไม่สามารถสร้างยศรหัส super_admin ได้ มีอยู่แล้วในระบบ', 'error');
        return;
    }
    
    try {
        const { doc, setDoc, updateDoc, serverTimestamp, collection, getDocs, query, where } = window.firestoreFns;
        
        // If setting as default, remove default from others
        if (isDefault) {
            const q = query(collection(db, 'roles'), where('isDefault', '==', true));
            const snap = await getDocs(q);
            snap.forEach(async (d) => {
                if (d.id !== id) {
                    await updateDoc(doc(db, 'roles', d.id), { isDefault: false });
                }
            });
        }
        
        const data = {
            name: name,
            code: code,
            description: description,
            permissions: permissions,
            isDefault: isDefault,
            updatedAt: serverTimestamp()
        };
        
        if (id) {
            await updateDoc(doc(db, 'roles', id), data);
            showToast('อัพเดตยศสำเร็จ', 'success');
        } else {
            data.createdAt = serverTimestamp();
            await setDoc(doc(collection(db, 'roles')), data);
            showToast('สร้างยศสำเร็จ', 'success');
        }
        
        closeRoleModal();
        renderRoles();
        
    } catch (e) {
        console.error('Save role error:', e);
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

async function editRole(roleId) {
    openRoleModal(roleId);
}

async function deleteRole(roleId) {
    const role = allRoles.find(r => r.id === roleId);
    
    // ถ้าเป็น Super Admin ต้องยืนยันเป็นพิเศษ
    if (role.code === 'super_admin') {
        if (!confirm('⚠️ คุณกำลังจะลบยศ Super Admin!\nผู้ใช้ที่มียศนี้จะถูกเปลี่ยนเป็นยศเริ่มต้น\n\nยืนยันการดำเนินการหรือไม่?')) return;
    } else {
        if (!confirm('ยืนยันการลบยศนี้? ผู้ใช้ที่มียศนี้จะถูกเปลี่ยนเป็นยศเริ่มต้น')) return;
    }
    
    try {
        const { doc, deleteDoc, updateDoc, collection, getDocs, query, where } = window.firestoreFns;
        
        // Find default role
        const q = query(collection(db, 'roles'), where('isDefault', '==', true));
        const snap = await getDocs(q);
        let defaultRoleCode = 'user';
        if (!snap.empty) {
            defaultRoleCode = snap.docs[0].data().code;
        }
        
        // Update users with this role to default
        if (role) {
            const userQ = query(collection(db, 'users'), where('role', '==', role.code));
            const userSnap = await getDocs(userQ);
            userSnap.forEach(async (u) => {
                await updateDoc(doc(db, 'users', u.id), { role: defaultRoleCode });
            });
        }
        
        await deleteDoc(doc(db, 'roles', roleId));
        showToast('ลบยศสำเร็จ', 'success');
        renderRoles();
        
    } catch (e) {
        console.error('Delete role error:', e);
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

