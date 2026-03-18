// ==================== SITE SETTINGS ====================

let _currentKeywords = [];
let _currentShopTypes = [];

async function loadSiteSettings() {
    try {
        const { doc, getDoc } = window.firestoreFns;
        const snap = await getDoc(doc(db, 'system', 'site_settings'));
        if (!snap.exists()) return;
        const d = snap.data();
        if (document.getElementById('ss_siteName')) document.getElementById('ss_siteName').value = d.siteName || '';
        if (document.getElementById('ss_description')) document.getElementById('ss_description').value = d.description || '';
        if (document.getElementById('ss_seoTitle')) document.getElementById('ss_seoTitle').value = d.seoTitle || '';
        if (document.getElementById('ss_siteUrl')) document.getElementById('ss_siteUrl').value = d.siteUrl || '';
        if (document.getElementById('ss_favicon')) document.getElementById('ss_favicon').value = d.favicon || '';
        if (document.getElementById('ss_ogImage')) document.getElementById('ss_ogImage').value = d.ogImage || '';
        if (document.getElementById('ss_line')) document.getElementById('ss_line').value = d.line || '';
        if (document.getElementById('ss_facebook')) document.getElementById('ss_facebook').value = d.facebook || '';
        if (document.getElementById('ss_discord')) document.getElementById('ss_discord').value = d.discord || '';
        if (document.getElementById('ss_phone')) document.getElementById('ss_phone').value = d.phone || '';
        if (document.getElementById('ss_email')) document.getElementById('ss_email').value = d.email || '';
        if (document.getElementById('ss_tiktok')) document.getElementById('ss_tiktok').value = d.tiktok || '';
        // Shop types
        _currentShopTypes = d.shopTypes || [];
        document.querySelectorAll('#shopTypeTags .seo-tag').forEach(tag => {
            const type = tag.getAttribute('data-type');
            tag.classList.toggle('selected', _currentShopTypes.includes(type));
        });
        // Keywords
        _currentKeywords = d.keywords || [];
        renderKeywordTags();
        // Update SEO preview
        updateSeoPreview();
        // Propagate to admin brand on load
        if (d.siteName) {
            const name   = d.siteName;
            const letter = name.charAt(0).toUpperCase();
            const adminName   = document.getElementById('adminSiteName');
            const adminLetter = document.getElementById('adminLogoLetter');
            if (adminName)   adminName.textContent   = name;
            if (adminLetter) adminLetter.textContent = letter;
            document.title = name + ' | Admin Panel';
        }
    } catch (e) {
        console.warn('Load site settings error:', e);
    }
}

async function saveSiteSettings() {
    if (!checkAccess('manage_settings')) return;
    try {
        const { doc, setDoc } = window.firestoreFns;
        const data = {
            siteName: document.getElementById('ss_siteName')?.value || '',
            description: document.getElementById('ss_description')?.value || '',
            seoTitle: document.getElementById('ss_seoTitle')?.value || '',
            siteUrl: document.getElementById('ss_siteUrl')?.value || '',
            favicon: document.getElementById('ss_favicon')?.value || '',
            ogImage: document.getElementById('ss_ogImage')?.value || '',
            line: document.getElementById('ss_line')?.value || '',
            facebook: document.getElementById('ss_facebook')?.value || '',
            discord: document.getElementById('ss_discord')?.value || '',
            phone: document.getElementById('ss_phone')?.value || '',
            email: document.getElementById('ss_email')?.value || '',
            tiktok: document.getElementById('ss_tiktok')?.value || '',
            shopTypes: _currentShopTypes,
            keywords: _currentKeywords,
            updatedAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'system', 'site_settings'), data, { merge: true });
        // ── Propagate site name across all admin UI elements ──
        if (data.siteName) {
            const name   = data.siteName;
            const letter = name.charAt(0).toUpperCase();
            // Sidebar brand
            const adminName = document.getElementById('adminSiteName');
            if (adminName) adminName.textContent = name;
            const adminLetter = document.getElementById('adminLogoLetter');
            if (adminLetter) adminLetter.textContent = letter;
            // Old pattern fallback
            const sidebarTitle = document.querySelector('#sidebar h1');
            if (sidebarTitle) sidebarTitle.textContent = name;
            // Page <title>
            document.title = name + ' | Admin Panel';
            // Footer / brand references on any page
            document.querySelectorAll('.site-name, .sidebar-site-name, #sidebarSiteName').forEach(el => {
                el.textContent = name;
            });
        }
        showToast('บันทึกการตั้งค่าสำเร็จ ✓  ชื่อเว็บอัปเดตทั่วทุกหน้าแล้ว', 'success');
    } catch (e) {
        console.error('Save site settings error:', e);
        showToast('บันทึกไม่สำเร็จ: ' + e.message, 'error');
    }
}

function toggleShopType(el, type) {
    el.classList.toggle('selected');
    if (el.classList.contains('selected')) {
        if (!_currentShopTypes.includes(type)) _currentShopTypes.push(type);
    } else {
        _currentShopTypes = _currentShopTypes.filter(t => t !== type);
    }
    document.getElementById('ss_shopTypes').value = _currentShopTypes.join(',');
}

function addKeyword(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const input = document.getElementById('ss_keywordInput');
    const kw = input.value.trim();
    if (!kw || _currentKeywords.includes(kw)) { input.value = ''; return; }
    _currentKeywords.push(kw);
    input.value = '';
    renderKeywordTags();
    document.getElementById('ss_keywords').value = _currentKeywords.join(',');
}

function removeKeyword(kw) {
    _currentKeywords = _currentKeywords.filter(k => k !== kw);
    renderKeywordTags();
}

function renderKeywordTags() {
    const container = document.getElementById('keywordTags');
    if (!container) return;
    container.innerHTML = _currentKeywords.map(kw => `
        <span class="seo-tag selected">
            ${kw}
            <span class="remove-tag" onclick="removeKeyword('${kw}')"><i class="fa-solid fa-xmark"></i></span>
        </span>
    `).join('');
}

function updateSeoPreview() {
    const title = document.getElementById('ss_seoTitle')?.value || document.getElementById('ss_siteName')?.value || 'ชื่อเว็บไซต์ของคุณ';
    const url = document.getElementById('ss_siteUrl')?.value || 'yourdomain.com';
    const desc = document.getElementById('ss_description')?.value || 'คำอธิบายเว็บไซต์จะปรากฏที่นี่...';
    const el1 = document.getElementById('seoTitlePreview');
    const el2 = document.getElementById('seoUrlPreview');
    const el3 = document.getElementById('seoDescPreview');
    if (el1) el1.textContent = title;
    if (el2) el2.textContent = 'https://' + url;
    if (el3) el3.textContent = desc;
}

// Description char counter
document.addEventListener('DOMContentLoaded', () => {
    const descEl = document.getElementById('ss_description');
    const seoTitleEl = document.getElementById('ss_seoTitle');
    const siteNameEl = document.getElementById('ss_siteName');
    if (descEl) {
        descEl.addEventListener('input', () => {
            const len = descEl.value.length;
            const counter = document.getElementById('descCharCount');
            if (counter) { counter.textContent = len + '/160'; counter.className = 'text-xs ' + (len > 160 ? 'text-red-500' : 'text-slate-400'); }
            updateSeoPreview();
        });
    }
    if (seoTitleEl) seoTitleEl.addEventListener('input', updateSeoPreview);
    if (siteNameEl) siteNameEl.addEventListener('input', updateSeoPreview);
});

