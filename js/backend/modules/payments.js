// ==================== PAYMENT METHODS MANAGEMENT ====================

function switchPaymentTab(tab) {
    currentPaymentTab = tab;
    
    document.getElementById('tab-bank').className = tab === 'bank' ? 
        'px-6 py-3 font-semibold text-sky-600 border-b-2 border-sky-500 transition-colors' : 
        'px-6 py-3 font-semibold text-slate-500 hover:text-slate-700 transition-colors';
        
    document.getElementById('tab-truemoney').className = tab === 'truemoney' ? 
        'px-6 py-3 font-semibold text-sky-600 border-b-2 border-sky-500 transition-colors' : 
        'px-6 py-3 font-semibold text-slate-500 hover:text-slate-700 transition-colors';
    
    loadPaymentMethods();
}

async function loadPaymentMethods() {
    if (!checkAccess('manage_payments')) return;
    
    const container = document.getElementById('paymentList');
    container.innerHTML = '<div class="col-span-full text-center py-12 text-slate-400"><div class="animate-spin w-8 h-8 border-4 border-sky-100 border-t-sky-400 rounded-full mx-auto mb-4"></div><p>กำลังโหลดข้อมูล...</p></div>';
    
    try {
        const { collection, getDocs, query, where, orderBy } = window.firestoreFns;
        
        let methods = [];
        
        if (currentPaymentTab === 'bank') {
            const q = query(collection(db, 'bank_accounts'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            snap.forEach(d => methods.push({ id: d.id, ...d.data() }));
        } else {
            try {
                const q = query(collection(db, 'payment_methods'), where('type', '==', 'truemoney'), orderBy('createdAt', 'desc'));
                const snap = await getDocs(q);
                snap.forEach(d => methods.push({ id: d.id, ...d.data() }));
            } catch (indexError) {
                const q = query(collection(db, 'payment_methods'), where('type', '==', 'truemoney'));
                const snap = await getDocs(q);
                snap.forEach(d => methods.push({ id: d.id, ...d.data() }));
                methods.sort((a, b) => {
                    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                    return timeB - timeA;
                });
            }
        }
        
        if (methods.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                    <i class="fa-solid fa-credit-card text-4xl mb-4 text-slate-300"></i>
                    <p class="text-lg font-medium text-slate-600 mb-2">ยังไม่มี${currentPaymentTab === 'bank' ? 'บัญชีธนาคาร' : 'บัญชี TrueMoney'}</p>
                    <p class="text-sm mb-4">คลิกปุ่ม "เพิ่มช่องทางใหม่" เพื่อเพิ่มข้อมูล</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = methods.map(m => {
            const isActive = m.isActive !== false;
            const bankColors = {
                'กสิกรไทย': '#138f2e',
                'กรุงเทพ': '#1e459c',
                'กรุงไทย': '#f4d03f',
                'ไทยพาณิชย์': '#6f2c91',
                'กรุงศรี': '#ffd700',
                'ทหารไทย': '#1e4db3',
                'ซีไอเอ็มบี': '#e31e24',
                'ยูโอบี': '#630031',
                'ออมสิน': '#f57f20',
                'ธ.ก.ส.': '#1e4d2b'
            };
            
            if (currentPaymentTab === 'bank') {
                const color = bankColors[m.bankName] || '#64748b';
                return `
                    <div class="payment-method-card ${isActive ? 'active' : 'inactive'}">
                        <div class="flex justify-between items-start mb-4">
                            <div class="flex items-center gap-3">
                                <div class="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg" style="background: ${color}">
                                    ${m.bankName ? m.bankName.charAt(0) : 'B'}
                                </div>
                                <div>
                                    <h4 class="font-bold text-slate-800">${m.bankName}</h4>
                                    <p class="text-sm text-slate-500">${m.accountName}</p>
                                </div>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="editPaymentMethod('${m.id}')" class="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-sky-600 transition-colors">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                                <button onclick="deletePaymentMethod('${m.id}')" class="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div class="bg-slate-50 p-3 rounded-lg font-mono text-slate-700 mb-3">
                            ${m.accountNumber}
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-xs ${isActive ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 bg-slate-100'} px-3 py-1 rounded-full font-medium">
                                ${isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                            </span>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" ${isActive ? 'checked' : ''} onchange="togglePaymentStatus('${m.id}', this.checked)" class="sr-only peer">
                                <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
                            </label>
                        </div>
                    </div>
                `;
            } else {
                return `
                    <div class="payment-method-card ${isActive ? 'active' : 'inactive'}">
                        <div class="flex justify-between items-start mb-4">
                            <div class="flex items-center gap-3">
                                <div class="w-12 h-12 rounded-xl bg-[#0071BC] flex items-center justify-center text-white font-bold text-lg">
                                    T
                                </div>
                                <div>
                                    <h4 class="font-bold text-slate-800">TrueMoney Wallet</h4>
                                    <p class="text-sm text-slate-500">${m.name || m.accountName}</p>
                                </div>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="editPaymentMethod('${m.id}')" class="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-sky-600 transition-colors">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                                <button onclick="deletePaymentMethod('${m.id}')" class="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div class="bg-slate-50 p-3 rounded-lg font-mono text-slate-700 mb-3">
                            ${m.phoneNumber || m.accountNumber}
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-xs ${isActive ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 bg-slate-100'} px-3 py-1 rounded-full font-medium">
                                ${isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                            </span>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" ${isActive ? 'checked' : ''} onchange="togglePaymentStatus('${m.id}', this.checked)" class="sr-only peer">
                                <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
                            </label>
                        </div>
                    </div>
                `;
            }
        }).join('');
        
    } catch (e) {
        console.error('Error loading payment methods:', e);
        container.innerHTML = `<div class="col-span-full text-center py-12 text-red-400 bg-red-50 rounded-2xl border border-red-100"><i class="fa-solid fa-triangle-exclamation text-2xl mb-2"></i><p>เกิดข้อผิดพลาดในการโหลดข้อมูล</p><p class="text-xs mt-2 text-red-500">${e.message}</p></div>`;
    }
}

function openPaymentModal(editId = null) {
    if (!checkAccess('manage_payments')) return;
    
    const modal = document.getElementById('paymentModal');
    const form = document.getElementById('paymentForm');
    const title = document.getElementById('paymentModalTitle');
    
    form.reset();
    document.getElementById('paymentId').value = '';
    document.getElementById('paymentType').value = currentPaymentTab;
    
    if (currentPaymentTab === 'truemoney') {
        title.textContent = editId ? 'แก้ไขบัญชี TrueMoney' : 'เพิ่มบัญชี TrueMoney';
        document.getElementById('bankSelectGroup').classList.add('hidden');
        document.getElementById('numberLabel').textContent = 'เบอร์โทรศัพท์';
        document.getElementById('logoGroup').classList.add('hidden');
    } else {
        title.textContent = editId ? 'แก้ไขบัญชีธนาคาร' : 'เพิ่มบัญชีธนาคาร';
        document.getElementById('bankSelectGroup').classList.remove('hidden');
        document.getElementById('numberLabel').textContent = 'เลขบัญชี';
        document.getElementById('logoGroup').classList.remove('hidden');
    }
    
    if (editId) {
        loadPaymentData(editId);
    }
    
    modal.classList.add('active');
}

function closePaymentModal() {
    document.getElementById('paymentModal').classList.remove('active');
}

async function loadPaymentData(id) {
    try {
        const { doc, getDoc } = window.firestoreFns;
        const collectionName = currentPaymentTab === 'bank' ? 'bank_accounts' : 'payment_methods';
        const snap = await getDoc(doc(db, collectionName, id));
        
        if (snap.exists()) {
            const data = snap.data();
            document.getElementById('paymentId').value = id;
            document.getElementById('accountNameInput').value = data.accountName || data.name || '';
            document.getElementById('accountNumberInput').value = data.accountNumber || data.phoneNumber || '';
            document.getElementById('logoUrlInput').value = data.logoUrl || '';
            document.getElementById('isActiveInput').checked = data.isActive !== false;
            
            if (currentPaymentTab === 'bank') {
                document.getElementById('bankSelect').value = data.bankName || '';
            }
        }
    } catch (e) {
        console.error('Error loading payment data:', e);
    }
}

async function savePaymentMethod(event) {
    event.preventDefault();
    
    const id = document.getElementById('paymentId').value;
    const type = document.getElementById('paymentType').value;
    const accountName = document.getElementById('accountNameInput').value;
    const accountNumber = document.getElementById('accountNumberInput').value;
    const isActive = document.getElementById('isActiveInput').checked;
    
    try {
        const { doc, setDoc, updateDoc, serverTimestamp, collection } = window.firestoreFns;
        
        let data = {
            accountName: accountName,
            isActive: isActive,
            updatedAt: serverTimestamp()
        };
        
        if (type === 'bank') {
            const bankSelect = document.getElementById('bankSelect');
            const bankName = bankSelect.value;
            const logoUrl = document.getElementById('logoUrlInput').value;
            
            if (!bankName) {
                showToast('กรุณาเลือกธนาคาร', 'error');
                return;
            }
            
            data.bankName = bankName;
            data.accountNumber = accountNumber;
            data.logoUrl = logoUrl;
            data.type = 'bank';
            
            if (!id) data.createdAt = serverTimestamp();
            
            if (id) {
                await updateDoc(doc(db, 'bank_accounts', id), data);
            } else {
                await setDoc(doc(collection(db, 'bank_accounts')), data);
            }
        } else {
            data.name = accountName;
            data.phoneNumber = accountNumber;
            data.type = 'truemoney';
            
            if (!id) data.createdAt = serverTimestamp();
            
            if (id) {
                await updateDoc(doc(db, 'payment_methods', id), data);
            } else {
                await setDoc(doc(collection(db, 'payment_methods')), data);
            }
        }
        
        showToast('บันทึกสำเร็จ', 'success');
        closePaymentModal();
        loadPaymentMethods();
        
    } catch (e) {
        console.error('Error saving payment method:', e);
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

async function deletePaymentMethod(id) {
    if (!confirm('ยืนยันการลบช่องทางนี้?')) return;
    
    try {
        const { doc, deleteDoc } = window.firestoreFns;
        const collectionName = currentPaymentTab === 'bank' ? 'bank_accounts' : 'payment_methods';
        
        await deleteDoc(doc(db, collectionName, id));
        showToast('ลบสำเร็จ', 'success');
        loadPaymentMethods();
    } catch (e) {
        console.error('Error deleting:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function togglePaymentStatus(id, isActive) {
    try {
        const { doc, updateDoc } = window.firestoreFns;
        const collectionName = currentPaymentTab === 'bank' ? 'bank_accounts' : 'payment_methods';
        
        await updateDoc(doc(db, collectionName, id), { isActive: isActive });
        showToast(isActive ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว', 'success');
        loadPaymentMethods();
    } catch (e) {
        console.error('Error toggling status:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

