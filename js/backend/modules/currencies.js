// ==================== 🪙 SPECIAL CURRENCY MANAGEMENT with Font Awesome Icons ====================

async function loadSpecialCurrencies() {
    if (!checkAccess('manage_special_currencies')) return;
    
    const grid = document.getElementById('specialCurrenciesGrid');
    const emptyState = document.getElementById('specialCurrenciesEmpty');
    
    if (!grid) return;
    
    grid.innerHTML = '<div class="col-span-full text-center py-16"><div class="w-16 h-16 border-4 border-amber-100 border-t-amber-400 rounded-full animate-spin mx-auto mb-4"></div><p class="text-slate-500">กำลังโหลดข้อมูลสกุลเงิน...</p></div>';
    if (emptyState) emptyState.classList.add('hidden');
    
    try {
        const { collection, getDocs, query, orderBy } = window.firestoreFns;
        const q = query(collection(db, 'special_currencies'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        
        specialCurrencies = [];
        snap.forEach(d => specialCurrencies.push({ id: d.id, ...d.data() }));
        
        // Update stats
        const activeCount = specialCurrencies.filter(c => c.isActive !== false).length;
        const totalValue = specialCurrencies.reduce((sum, c) => sum + (c.totalValue || 0), 0);
        
        document.getElementById('activeCurrenciesCount').textContent = activeCount;
        document.getElementById('totalCurrenciesCount').textContent = specialCurrencies.length;
        document.getElementById('totalCurrencyValue').textContent = '฿' + totalValue.toLocaleString();
        
        renderSpecialCurrencies(specialCurrencies);
        
    } catch (e) {
        console.error('Load special currencies error:', e);
        grid.innerHTML = `<div class="col-span-full text-center py-16 text-red-500"><i class="fa-solid fa-triangle-exclamation text-4xl mb-4"></i><p>โหลดข้อมูลไม่สำเร็จ: ${e.message}</p></div>`;
    }
}

function renderSpecialCurrencies(currencies) {
    const grid = document.getElementById('specialCurrenciesGrid');
    const emptyState = document.getElementById('specialCurrenciesEmpty');
    
    if (!grid) return;
    
    const statusFilter = document.getElementById('currencyStatusFilter')?.value || 'all';
    const search = document.getElementById('currencySearch')?.value.toLowerCase() || '';
    
    let filtered = currencies.filter(c => {
        const matchStatus = statusFilter === 'all' || 
            (statusFilter === 'active' && c.isActive !== false) || 
            (statusFilter === 'inactive' && c.isActive === false);
        const matchSearch = !search || 
            (c.name || '').toLowerCase().includes(search) || 
            (c.code || '').toLowerCase().includes(search);
        return matchStatus && matchSearch;
    });
    
    if (filtered.length === 0) {
        grid.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }
    
    if (emptyState) emptyState.classList.add('hidden');
    
    grid.innerHTML = filtered.map(c => {
        const isActive = c.isActive !== false;
        const gradientColor = c.color || '#f59e0b';
        const iconClass = c.icon || 'fa-coins';
        const iconColor = c.iconColor || 'amber';
        
        // Get background color class based on icon color
        const bgClass = `bg-${iconColor}-100`;
        const textClass = `text-${iconColor}-600`;
        
        return `
            <div class="special-currency-card ${isActive ? '' : 'inactive'}">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex items-center gap-4">
                        <div class="currency-icon ${bgClass} ${textClass}" style="background: ${gradientColor}20; color: ${gradientColor}; border: 2px solid ${gradientColor}40;">
                            <i class="fa-solid ${iconClass}"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-slate-800 text-lg flex items-center gap-2">
                                ${c.name}
                                ${!isActive ? '<span class="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-full">ปิดใช้งาน</span>' : ''}
                            </h4>
                            <div class="currency-code text-slate-500">${c.code || 'CODE'}</div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="openSpecialCurrencyModal('${c.id}')" class="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-amber-600 transition-colors" title="แก้ไข">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button onclick="deleteSpecialCurrency('${c.id}')" class="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors" title="ลบ">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                
                <div class="space-y-3 mb-4">
                    <div class="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                        <span class="text-sm text-slate-500">อัตราแลกเปลี่ยน</span>
                        <span class="exchange-rate-badge">
                            <i class="fa-solid fa-arrow-right-arrow-left text-xs"></i>
                            1 บาท = ${c.exchangeRate || 1} ${c.code}
                        </span>
                    </div>
                    
                    <div class="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                        <span class="text-sm text-slate-500">ยอดในระบบ</span>
                        <span class="font-bold text-slate-800">${(c.totalAmount || 0).toLocaleString()} ${c.code}</span>
                    </div>
                </div>
                
                ${c.description ? `<p class="text-sm text-slate-600 mb-4 line-clamp-2">${c.description}</p>` : ''}
                
                <div class="flex justify-between items-center pt-4 border-t border-slate-100">
                    <span class="text-xs text-slate-400">สร้างเมื่อ ${c.createdAt?.toDate ? new Date(c.createdAt.toDate()).toLocaleDateString('th-TH') : '-'}</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" ${isActive ? 'checked' : ''} onchange="toggleSpecialCurrency('${c.id}', this.checked)" class="sr-only peer">
                        <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                </div>
            </div>
        `;
    }).join('');
}

function filterSpecialCurrencies() {
    renderSpecialCurrencies(specialCurrencies);
}

function openSpecialCurrencyModal(currencyId = null) {
    if (!checkAccess('manage_special_currencies')) return;
    
    const modal = document.getElementById('specialCurrencyModal');
    const form = document.getElementById('specialCurrencyForm');
    const title = document.getElementById('specialCurrencyModalTitle');
    
    form.reset();
    document.getElementById('specialCurrencyId').value = '';
    
    // Reset dropdown to default
    selectIcon('fa-coins', 'เหรียญ (Coins)', 'amber');
    selectColor('#f59e0b');
    
    if (currencyId) {
        const currency = specialCurrencies.find(c => c.id === currencyId);
        if (currency) {
            currentEditingCurrency = currency;
            title.innerHTML = `<i class="fa-solid fa-coins text-amber-500 mr-2"></i>แก้ไขสกุลเงิน ${currency.name}`;
            
            document.getElementById('specialCurrencyId').value = currencyId;
            document.getElementById('currencyName').value = currency.name || '';
            document.getElementById('currencyCode').value = currency.code || '';
            document.getElementById('currencyRate').value = currency.exchangeRate || '';
            document.getElementById('currencyDescription').value = currency.description || '';
            document.getElementById('currencyIsActive').checked = currency.isActive !== false;
            
            if (currency.icon) {
                // Find icon label
                const iconData = currencyIcons.find(i => i.value === currency.icon);
                selectIcon(currency.icon, iconData?.label || currency.icon, currency.iconColor || 'amber');
            }
            if (currency.color) selectColor(currency.color);
        }
    } else {
        currentEditingCurrency = null;
        title.innerHTML = '<i class="fa-solid fa-coins text-amber-500 mr-2"></i>เพิ่มสกุลเงินพิเศษ';
    }
    
    modal.classList.add('active');
}

function closeSpecialCurrencyModal() {
    document.getElementById('specialCurrencyModal').classList.remove('active');
    currentEditingCurrency = null;
    
    // Close dropdown if open
    const dropdownMenu = document.getElementById('iconDropdownMenu');
    const dropdownTrigger = document.querySelector('#iconDropdown .dropdown-trigger');
    if (dropdownMenu) dropdownMenu.classList.remove('show');
    if (dropdownTrigger) dropdownTrigger.classList.remove('active');
}

async function saveSpecialCurrency(event) {
    event.preventDefault();
    
    const id = document.getElementById('specialCurrencyId').value;
    const name = document.getElementById('currencyName').value.trim();
    const code = document.getElementById('currencyCode').value.trim().toUpperCase();
    const exchangeRate = parseFloat(document.getElementById('currencyRate').value) || 1;
    const icon = document.getElementById('currencyIcon').value;
    const iconColor = document.getElementById('currencyIconColor').value;
    const color = document.getElementById('currencyColor').value;
    const description = document.getElementById('currencyDescription').value.trim();
    const isActive = document.getElementById('currencyIsActive').checked;
    
    if (!name || !code) {
        showToast('กรุณากรอกชื่อและรหัสสกุลเงิน', 'error');
        return;
    }
    
    // Check duplicate code
    const existing = specialCurrencies.find(c => c.code === code && c.id !== id);
    if (existing) {
        showToast('รหัสสกุลเงินนี้มีอยู่แล้วในระบบ', 'error');
        return;
    }
    
    try {
        const { doc, setDoc, updateDoc, serverTimestamp, collection } = window.firestoreFns;
        
        const data = {
            name: name,
            code: code,
            exchangeRate: exchangeRate,
            icon: icon,
            iconColor: iconColor,
            color: color,
            description: description,
            isActive: isActive,
            updatedAt: serverTimestamp()
        };
        
        if (id) {
            await updateDoc(doc(db, 'special_currencies', id), data);
            showToast('อัพเดตสกุลเงินสำเร็จ', 'success');
        } else {
            data.createdAt = serverTimestamp();
            data.totalAmount = 0;
            data.totalValue = 0;
            await setDoc(doc(collection(db, 'special_currencies')), data);
            showToast('สร้างสกุลเงินสำเร็จ', 'success');
        }
        
        closeSpecialCurrencyModal();
        loadSpecialCurrencies();
        
    } catch (e) {
        console.error('Save currency error:', e);
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

async function deleteSpecialCurrency(currencyId) {
    if (!confirm('ยืนยันการลบสกุลเงินนี้? การกระทำนี้ไม่สามารถย้อนกลับได้')) return;
    
    // Check if currency is being used
    const currency = specialCurrencies.find(c => c.id === currencyId);
    if (currency && currency.totalAmount > 0) {
        if (!confirm(`⚠️ มี ${currency.totalAmount} ${currency.code} ในระบบ\nหากลบจะไม่สามารถใช้งานสกุลเงินนี้ได้อีก\n\nยืนยันการลบหรือไม่?`)) return;
    }
    
    try {
        const { doc, deleteDoc } = window.firestoreFns;
        await deleteDoc(doc(db, 'special_currencies', currencyId));
        showToast('ลบสกุลเงินสำเร็จ', 'success');
        loadSpecialCurrencies();
    } catch (e) {
        console.error('Delete currency error:', e);
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

async function toggleSpecialCurrency(currencyId, isActive) {
    try {
        const { doc, updateDoc, serverTimestamp } = window.firestoreFns;
        await updateDoc(doc(db, 'special_currencies', currencyId), {
            isActive: isActive,
            updatedAt: serverTimestamp()
        });
        showToast(isActive ? 'เปิดใช้งานสกุลเงินแล้ว' : 'ปิดใช้งานสกุลเงินแล้ว', 'success');
        loadSpecialCurrencies();
    } catch (e) {
        console.error('Toggle currency error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

// ==================== 🔽 CUSTOM DROPDOWN FUNCTIONS ====================

function initCustomDropdowns() {
    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.custom-dropdown')) {
            document.querySelectorAll('.dropdown-menu').forEach(menu => {
                menu.classList.remove('show');
            });
            document.querySelectorAll('.dropdown-trigger').forEach(trigger => {
                trigger.classList.remove('active');
            });
        }
    });
}

function toggleDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    const menu = dropdown.querySelector('.dropdown-menu');
    const trigger = dropdown.querySelector('.dropdown-trigger');
    
    // Close other dropdowns
    document.querySelectorAll('.dropdown-menu').forEach(m => {
        if (m !== menu) m.classList.remove('show');
    });
    document.querySelectorAll('.dropdown-trigger').forEach(t => {
        if (t !== trigger) t.classList.remove('active');
    });
    
    // Toggle current
    menu.classList.toggle('show');
    trigger.classList.toggle('active');
}

function selectIcon(icon, label, color) {
    document.getElementById('currencyIcon').value = icon;
    document.getElementById('currencyIconColor').value = color;
    
    // Map color to Tailwind classes
    const colorClasses = {
        amber: 'bg-amber-100 text-amber-600',
        purple: 'bg-purple-100 text-purple-600',
        yellow: 'bg-yellow-100 text-yellow-600',
        orange: 'bg-orange-100 text-orange-600',
        blue: 'bg-blue-100 text-blue-600',
        red: 'bg-red-100 text-red-600',
        pink: 'bg-pink-100 text-pink-600',
        emerald: 'bg-emerald-100 text-emerald-600',
        rose: 'bg-rose-100 text-rose-600'
    };
    
    const colorClass = colorClasses[color] || 'bg-amber-100 text-amber-600';
    
    document.getElementById('selectedIconDisplay').innerHTML = `
        <span class="w-8 h-8 rounded-lg ${colorClass} flex items-center justify-center">
            <i class="fa-solid ${icon}"></i>
        </span>
        <span>${label}</span>
    `;
    
    // Update UI
    document.querySelectorAll('#iconDropdownMenu .dropdown-item').forEach(item => {
        if (item.dataset.value === icon) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
    
    // Close dropdown
    const dropdownMenu = document.getElementById('iconDropdownMenu');
    const dropdownTrigger = document.querySelector('#iconDropdown .dropdown-trigger');
    if (dropdownMenu) dropdownMenu.classList.remove('show');
    if (dropdownTrigger) dropdownTrigger.classList.remove('active');
}

function filterDropdownItems(input, type) {
    const filter = input.value.toLowerCase();
    const items = input.closest('.dropdown-search').nextElementSibling.querySelectorAll('.dropdown-item');
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(filter)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function selectColor(color) {
    document.getElementById('currencyColor').value = color;
    
    // Update UI
    document.querySelectorAll('.color-option').forEach(option => {
        if (option.dataset.color === color) {
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }
    });
}
