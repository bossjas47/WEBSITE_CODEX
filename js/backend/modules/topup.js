// ==================== TOPUP MANAGEMENT ====================

function setupTopupRealtime() {
    const { collection, query, where, onSnapshot } = window.firestoreFns;
    const q = query(collection(db, "topup_requests"), where("status", "==", "pending"));
    
    if (topupUnsubscribe) topupUnsubscribe();
    
    topupUnsubscribe = onSnapshot(q, (snapshot) => {
        const count = snapshot.size;
        const badge = document.getElementById('topupBadge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
        
        const topupSection = document.getElementById('topup');
        if (topupSection && topupSection.classList.contains('active')) {
            loadTopupRequests();
        }
    });
}

async function loadTopupRequests() {
    if (!checkAccess('manage_topup')) return;
    
    const status = document.getElementById('topupStatusFilter')?.value || 'pending';
    const tbody = document.getElementById('topupTableBody');
    const emptyState = document.getElementById('topupEmpty');
    
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8"><div class="w-8 h-8 border-4 border-sky-100 border-t-sky-400 rounded-full animate-spin mx-auto"></div></td></tr>';
    if (emptyState) emptyState.classList.add('hidden');
    
    try {
        const { collection, getDocs, query, orderBy, where } = window.firestoreFns;
        
        let q;
        if (status === 'all') {
            q = query(collection(db, 'topup_requests'), orderBy('createdAt', 'desc'));
        } else {
            q = query(collection(db, 'topup_requests'), where("status", "==", status), orderBy('createdAt', 'desc'));
        }
        
        const snap = await getDocs(q);
        const requests = [];
        snap.forEach(d => requests.push({ id: d.id, ...d.data() }));
        
        updateTopupStats(requests);
        
        const methodsSnap = await getDocs(collection(db, 'bank_accounts'));
        const activeMethods = methodsSnap.docs.filter(d => d.data().isActive).length;
        document.getElementById('activeMethodsCount').textContent = activeMethods;
        
        if (requests.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }
        
        const canApprove = hasPermission('approve_topup');
        
        tbody.innerHTML = requests.map(r => {
            const date = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('th-TH', { 
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' 
            }) : '-';
            
            const statusClasses = {
                pending: 'bg-amber-100 text-amber-700 border-amber-200',
                approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                rejected: 'bg-red-100 text-red-700 border-red-200'
            };
            
            const statusText = {
                pending: 'รอตรวจสอบ',
                approved: 'อนุมัติแล้ว',
                rejected: 'ปฏิเสธ'
            };

            const accountInfo = r.accountNumber || r.phoneNumber || '-';
            
            return `
                <tr class="hover:bg-slate-50/80 transition-colors">
                    <td class="py-4 px-6 text-sm text-slate-600 font-medium">${date}</td>
                    <td class="py-4 px-6">
                        <div class="font-bold text-slate-800 text-sm">${r.userName || 'ไม่ระบุ'}</div>
                        <div class="text-xs text-slate-500">${r.userEmail || '-'}</div>
                    </td>
                    <td class="py-4 px-6">
                        <div class="flex items-center gap-2">
                            <div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                                <i class="fa-solid ${r.paymentMethodType === 'truemoney' ? 'fa-wallet' : 'fa-building-columns'}"></i>
                            </div>
                            <span class="font-medium text-slate-700">${r.paymentMethodName || r.bankName || 'ไม่ระบุ'}</span>
                        </div>
                    </td>
                    <td class="py-4 px-6 text-sm font-mono text-slate-600">${accountInfo}</td>
                    <td class="py-4 px-6">
                        <img src="${r.slipUrl}" class="slip-thumbnail" onclick="viewSlip('${r.slipUrl}')" title="คลิกดูรูปใหญ่">
                    </td>
                    <td class="py-4 px-6">
                        <span class="px-3 py-1.5 rounded-full text-xs font-bold border ${statusClasses[r.status] || statusClasses.pending}">
                            ${statusText[r.status] || 'รอตรวจสอบ'}
                        </span>
                    </td>
                    <td class="py-4 px-6">
                        ${r.status === 'pending' && canApprove ? `
                            <button onclick="openTopupModal('${r.id}')" class="px-4 py-2 bg-sky-500 text-white rounded-lg font-semibold hover:bg-sky-600 transition text-sm">
                                ตรวจสอบ
                            </button>
                        ` : `
                            <button onclick="openTopupModal('${r.id}')" class="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg font-semibold hover:bg-slate-200 transition text-sm">
                                ดูรายละเอียด
                            </button>
                        `}
                    </td>
                </tr>
            `;
        }).join('');
        
    } catch (e) {
        console.error('Load topup error:', e);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-red-500">โหลดข้อมูลไม่สำเร็จ: ' + e.message + '</td></tr>';
    }
}

function updateTopupStats(requests) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const pending = requests.filter(r => r.status === 'pending').length;
    const approvedToday = requests.filter(r => {
        if (r.status !== 'approved') return false;
        const date = r.updatedAt?.toDate ? r.updatedAt.toDate() : null;
        return date && date >= today;
    }).length;
    
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('approvedTodayCount').textContent = approvedToday;
    document.getElementById('totalRequests').textContent = requests.length;
}

async function openTopupModal(requestId) {
    try {
        const { doc, getDoc } = window.firestoreFns;
        const snap = await getDoc(doc(db, 'topup_requests', requestId));
        
        if (!snap.exists()) {
            showToast('ไม่พบข้อมูล', 'error');
            return;
        }
        
        currentTopupRequest = { id: snap.id, ...snap.data() };
        const r = currentTopupRequest;
        
        const content = document.getElementById('topupModalContent');
        const actions = document.getElementById('topupActions');
        const rejectForm = document.getElementById('rejectForm');
        
        const date = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('th-TH') : '-';
        const accountInfo = r.accountNumber || r.phoneNumber || '-';
        
        content.innerHTML = `
            <div class="flex items-center gap-4 mb-6 p-4 bg-slate-50 rounded-2xl">
                <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-white font-bold text-2xl">
                    ${(r.userName || 'U')[0].toUpperCase()}
                </div>
                <div class="flex-1">
                    <div class="font-bold text-slate-800 text-lg">${r.userName || 'ไม่ระบุชื่อ'}</div>
                    <div class="text-slate-500">${r.userEmail}</div>
                    <div class="text-xs text-slate-400 mt-1">User ID: ${r.userId}</div>
                </div>
            </div>
            
            <div class="space-y-4 mb-6">
                <div class="grid grid-cols-2 gap-4">
                    <div class="p-4 bg-slate-50 rounded-xl">
                        <div class="text-sm text-slate-500 mb-1">ช่องทาง</div>
                        <div class="font-bold text-slate-800 flex items-center gap-2">
                            <i class="fa-solid ${r.paymentMethodType === 'truemoney' ? 'fa-wallet text-blue-500' : 'fa-building-columns text-slate-600'}"></i>
                            ${r.paymentMethodName || r.bankName || 'ไม่ระบุ'}
                        </div>
                    </div>
                    <div class="p-4 bg-slate-50 rounded-xl">
                        <div class="text-sm text-slate-500 mb-1">ข้อมูลบัญชี</div>
                        <div class="font-bold text-slate-800 font-mono">${accountInfo}</div>
                    </div>
                </div>
                
                <div class="p-4 bg-slate-50 rounded-xl">
                    <div class="text-sm text-slate-500 mb-1">เวลาที่แจ้ง</div>
                    <div class="font-bold text-slate-800">${date}</div>
                </div>
            </div>
            
            ${r.note ? `
                <div class="mb-6">
                    <div class="text-sm text-slate-500 mb-2">หมายเหตุจากผู้ใช้</div>
                    <div class="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">${r.note}</div>
                </div>
            ` : ''}
            
            <div class="mb-6">
                <div class="text-sm text-slate-500 mb-2">สลิปโอนเงิน</div>
                <img src="${r.slipUrl}" class="w-full rounded-xl border-2 border-slate-200 cursor-zoom-in hover:border-sky-400 transition" onclick="window.open('${r.slipUrl}', '_blank')">
            </div>
            
            ${r.rejectionReason ? `
                <div class="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800">
                    <div class="font-bold mb-1">เหตุผลที่ปฏิเสธ:</div>
                    ${r.rejectionReason}
                </div>
            ` : ''}
        `;
        
        const canApprove = hasPermission('approve_topup');
        
        if (r.status === 'pending' && canApprove) {
            actions.classList.remove('hidden');
            rejectForm.classList.add('hidden');
        } else {
            actions.classList.add('hidden');
            rejectForm.classList.add('hidden');
        }
        
        document.getElementById('topupDetailModal').classList.remove('hidden');
        
    } catch (e) {
        console.error('Error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

function closeTopupModal() {
    document.getElementById('topupDetailModal').classList.add('hidden');
    currentTopupRequest = null;
}

function viewSlip(url) {
    window.open(url, '_blank');
}

function showRejectForm() {
    document.getElementById('topupActions').classList.add('hidden');
    document.getElementById('rejectForm').classList.remove('hidden');
}

function hideRejectForm() {
    document.getElementById('rejectForm').classList.add('hidden');
    document.getElementById('topupActions').classList.remove('hidden');
}

async function approveTopup() {
    if (!checkAccess('approve_topup')) return;
    if (!currentTopupRequest) return;
    
    try {
        const { doc, updateDoc, serverTimestamp, collection, addDoc } = window.firestoreFns;
        
        await updateDoc(doc(db, 'topup_requests', currentTopupRequest.id), {
            status: 'approved',
            verifiedAt: serverTimestamp(),
            verifiedBy: 'admin',
            updatedAt: serverTimestamp()
        });
        
        // Update user balance
        const userRef = doc(db, 'users', currentTopupRequest.userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const currentBalance = userSnap.data().balance || 0;
            await updateDoc(userRef, {
                balance: currentBalance + (currentTopupRequest.amount || 0),
                updatedAt: serverTimestamp()
            });
        }
        
        // Create notification
        await addDoc(collection(db, "notifications"), {
            userId: currentTopupRequest.userId,
            type: 'topup_approved',
            title: 'เติมเงินสำเร็จ',
            message: `คำขอเติมเงินของคุณได้รับการอนุมัติแล้ว จำนวน ฿${(currentTopupRequest.amount || 0).toLocaleString()}`,
            read: false,
            createdAt: serverTimestamp()
        });
        
        showToast('อนุมัติรายการสำเร็จ', 'success');
        closeTopupModal();
        loadTopupRequests();
        
    } catch (e) {
        console.error('Approve error:', e);
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

async function rejectTopup() {
    if (!checkAccess('approve_topup')) return;
    if (!currentTopupRequest) return;
    
    const reason = document.getElementById('rejectReason')?.value.trim();
    if (!reason) {
        showToast('กรุณาระบุเหตุผล', 'error');
        return;
    }
    
    try {
        const { doc, updateDoc, serverTimestamp, collection, addDoc } = window.firestoreFns;
        
        await updateDoc(doc(db, 'topup_requests', currentTopupRequest.id), {
            status: 'rejected',
            rejectionReason: reason,
            verifiedAt: serverTimestamp(),
            verifiedBy: 'admin',
            updatedAt: serverTimestamp()
        });
        
        await addDoc(collection(db, "notifications"), {
            userId: currentTopupRequest.userId,
            type: 'topup_rejected',
            title: 'เติมเงินไม่สำเร็จ',
            message: `คำขอเติมเงินถูกปฏิเสธ: ${reason}`,
            read: false,
            createdAt: serverTimestamp()
        });
        
        showToast('ปฏิเสธรายการแล้ว', 'success');
        closeTopupModal();
        loadTopupRequests();
        
    } catch (e) {
        console.error('Reject error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

