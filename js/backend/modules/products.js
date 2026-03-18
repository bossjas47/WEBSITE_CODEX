// ==================== PRODUCTS MANAGEMENT ====================

let allProducts = [];

async function loadProducts() {
    if (!checkAccess('manage_products')) return;
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="col-span-full text-center py-12"><div class="animate-spin w-8 h-8 border-4 border-sky-100 border-t-sky-400 rounded-full mx-auto mb-3"></div><p class="text-slate-400">กำลังโหลด...</p></div>';
    try {
        const { collection, getDocs, query, orderBy } = window.firestoreFns;
        let products = [];
        try {
            const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            snap.forEach(d => products.push({ id: d.id, ...d.data() }));
        } catch {
            const snap = await getDocs(collection(db, 'products'));
            snap.forEach(d => products.push({ id: d.id, ...d.data() }));
        }
        allProducts = products;
        if (products.length === 0) {
            grid.innerHTML = `<div class="col-span-full text-center py-16 text-slate-400"><div class="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fa-solid fa-box-open text-4xl"></i></div><p class="font-medium">ไม่มีสินค้าในระบบ</p><button onclick="addProduct()" class="mt-4 btn-modern text-sm px-6 py-2.5"><i class="fa-solid fa-plus mr-2"></i>เพิ่มสินค้าแรก</button></div>`;
            return;
        }
        grid.innerHTML = products.map(p => `
            <div class="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden hover:border-sky-300 hover:shadow-lg transition-all group">
                ${p.imageUrl ? `<div class="h-40 bg-slate-50 overflow-hidden"><img src="${p.imageUrl}" class="w-full h-full object-cover group-hover:scale-105 transition-transform" onerror="this.parentElement.innerHTML='<div class=\\'h-full flex items-center justify-center text-slate-300\\'><i class=\\'fa-solid fa-image text-4xl\\'></i></div>'"></div>` : '<div class="h-40 bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center"><i class="fa-solid fa-box text-4xl text-slate-300"></i></div>'}
                <div class="p-5">
                    <div class="flex items-start justify-between mb-2">
                        <h3 class="font-bold text-slate-800 text-base leading-tight">${p.name || 'ไม่มีชื่อ'}</h3>
                        <span class="text-xs px-2 py-1 rounded-full font-semibold ${p.isActive !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'} ml-2 shrink-0">${p.isActive !== false ? 'เปิดขาย' : 'ปิด'}</span>
                    </div>
                    <p class="text-sm text-slate-500 mb-3 line-clamp-2">${p.description || '-'}</p>
                    <div class="flex items-center justify-between">
                        <div class="font-bold text-lg text-emerald-600">฿${Number(p.price || 0).toLocaleString()}</div>
                        <div class="flex gap-2">
                            <button onclick="editProduct('${p.id}')" class="action-btn edit" title="แก้ไข"><i class="fa-solid fa-pen text-sm"></i></button>
                            <button onclick="deleteProduct('${p.id}')" class="action-btn ban" title="ลบ"><i class="fa-solid fa-trash text-sm"></i></button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        grid.innerHTML = `<div class="col-span-full text-center py-8 text-red-500">โหลดสินค้าไม่สำเร็จ: ${e.message}</div>`;
    }
}

function addProduct() {
    if (!checkAccess('manage_products')) return;
    openProductModal(null);
}

function editProduct(id) {
    openProductModal(id);
}

function openProductModal(id) {
    const existing = id ? allProducts.find(p => p.id === id) : null;
    const modal = document.createElement('div');
    modal.id = 'productModalDynamic';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
        <div class="modal-content p-6">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold text-slate-800"><i class="fa-solid fa-box text-sky-500 mr-2"></i>${id ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h3>
                <button onclick="document.getElementById('productModalDynamic').remove()" class="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><i class="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <div class="space-y-4">
                <div><label class="block text-sm font-bold text-slate-700 mb-1">ชื่อสินค้า *</label>
                <input type="text" id="prd_name" value="${existing?.name || ''}" placeholder="ชื่อสินค้า..." class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-400"></div>
                <div><label class="block text-sm font-bold text-slate-700 mb-1">คำอธิบาย</label>
                <textarea id="prd_desc" rows="3" placeholder="รายละเอียดสินค้า..." class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-400 resize-none">${existing?.description || ''}</textarea></div>
                <div class="grid grid-cols-2 gap-4">
                    <div><label class="block text-sm font-bold text-slate-700 mb-1">ราคา (บาท) *</label>
                    <input type="number" id="prd_price" value="${existing?.price || ''}" placeholder="0.00" min="0" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-400"></div>
                    <div><label class="block text-sm font-bold text-slate-700 mb-1">Stock (ชิ้น)</label>
                    <input type="number" id="prd_stock" value="${existing?.stock ?? ''}" placeholder="ไม่จำกัด" min="0" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-400"></div>
                </div>
                <div><label class="block text-sm font-bold text-slate-700 mb-1">รูปภาพ URL</label>
                <input type="text" id="prd_image" value="${existing?.imageUrl || ''}" placeholder="https://..." class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-400"></div>
                <div><label class="block text-sm font-bold text-slate-700 mb-1">หมวดหมู่</label>
                <input type="text" id="prd_cat" value="${existing?.category || ''}" placeholder="เช่น เกม, ของสะสม..." class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-400"></div>
                <div class="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <input type="checkbox" id="prd_active" ${existing?.isActive !== false ? 'checked' : ''} class="w-5 h-5 rounded">
                    <label for="prd_active" class="font-semibold text-slate-700">เปิดขายทันที</label>
                </div>
            </div>
            <div class="flex gap-3 mt-6">
                <button onclick="document.getElementById('productModalDynamic').remove()" class="flex-1 btn-secondary">ยกเลิก</button>
                <button onclick="saveProduct('${id || ''}')" class="flex-1 btn-modern">บันทึก</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function saveProduct(id) {
    try {
        const { collection, doc, setDoc, updateDoc, serverTimestamp } = window.firestoreFns;
        const name = document.getElementById('prd_name')?.value?.trim();
        if (!name) { showToast('กรุณาใส่ชื่อสินค้า', 'error'); return; }
        const price = parseFloat(document.getElementById('prd_price')?.value) || 0;
        const data = {
            name,
            description: document.getElementById('prd_desc')?.value || '',
            price,
            stock: document.getElementById('prd_stock')?.value !== '' ? parseInt(document.getElementById('prd_stock').value) : null,
            imageUrl: document.getElementById('prd_image')?.value || '',
            category: document.getElementById('prd_cat')?.value || '',
            isActive: document.getElementById('prd_active')?.checked !== false,
            updatedAt: serverTimestamp()
        };
        if (id) {
            await updateDoc(doc(db, 'products', id), data);
        } else {
            data.createdAt = serverTimestamp();
            await setDoc(doc(collection(db, 'products')), data);
        }
        document.getElementById('productModalDynamic')?.remove();
        showToast(id ? 'แก้ไขสินค้าสำเร็จ' : 'เพิ่มสินค้าสำเร็จ', 'success');
        loadProducts();
    } catch (e) {
        showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error');
    }
}

async function deleteProduct(id) {
    if (!confirm('ยืนยันการลบสินค้านี้?')) return;
    try {
        const { doc, deleteDoc } = window.firestoreFns;
        await deleteDoc(doc(db, 'products', id));
        showToast('ลบสินค้าแล้ว', 'success');
        loadProducts();
    } catch (e) {
        showToast('ลบไม่สำเร็จ: ' + e.message, 'error');
    }
}

