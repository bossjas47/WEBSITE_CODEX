// ==================== Utilities ====================

function showElement(id) {
    document.getElementById(id).classList.remove('hidden');
}

function hideElement(id) {
    document.getElementById(id).classList.add('hidden');
}

function showError(msg) {
    hideElement('bootLoader');
    showElement('errorScreen');
    document.getElementById('errorMessage').textContent = msg;
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: 'fa-check-circle text-emerald-500',
        error: 'fa-xmark-circle text-red-500',
        warning: 'fa-exclamation-circle text-amber-500',
        info: 'fa-info-circle text-sky-500'
    };

    toast.innerHTML = `
        <i class="fa-solid ${icons[type]} text-xl"></i>
        <span class="text-sm font-semibold text-slate-700">${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeWebsiteOrderModal();
        closeTopupModal();
        closePaymentModal();
        closeEditUserModal();
        closeUserDetailModal();
        closeRoleModal();
        closeSpecialCurrencyModal();
    }
});
