### แก้ใน profile.html แก้ส่วน Profile Card (บรรทัด ~109)

```html
<!-- จาก -->
<div class="glass-panel-white overflow-hidden mb-5">
<!-- เป็น -->
<div class="glass-panel-white liquid-glass-card overflow-hidden mb-5">


```
### แก้ profile.html แก้ส่วน Avatar Wrap (บรรทัด ~110)
```html
<!-- จาก -->
<div id="profileAvatarWrap" class="profile-avatar-wrap">
<!-- เป็น -->
<div id="profileAvatarWrap" class="profile-avatar-wrap liquid-glass-avatar">


```
### profile.html แก้ส่วน badges ~118 และ 112~
```html
<!-- จาก -->
<div id="profileRoleBadge" class="profile-badge">
<!-- เป็น -->
<div id="profileRoleBadge" class="profile-badge liquid-glass-badge">

<!-- และ -->
<div id="profileJoinBadge" class="profile-badge">
<!-- เป็น -->
<div id="profileJoinBadge" class="profile-badge liquid-glass-badge">

```

### profile.html แก้ส่วน Stats Cards (บรรทัด ~129, ~133, ~137)

```html
<!-- จาก -->
<div class="stat-card">
<!-- เป็น -->
<div class="stat-card liquid-glass-stat">

```

### profile.html แก้ส่วน Form Cards (บรรทัด ~144 และ ~167)

```html
<!-- จาก -->
<div class="glass-panel-white p-5 mb-5">
<!-- เป็น -->
<div class="glass-panel-white liquid-glass-card p-5 mb-5">

<!-- และ -->
<div class="glass-panel-white p-5">
<!-- เป็น -->
<div class="glass-panel-white liquid-glass-card p-5">

```

### profile.html แก้ส่วน Input Fields (บรรทัด ~150, ~154, ~158, ~173, ~177)

```html
<!-- จาก -->
<input type="text" id="editDisplayName" class="form-input" placeholder="ชื่อของคุณ">
<!-- เป็น -->
<input type="text" id="editDisplayName" class="form-input liquid-glass-input" placeholder="ชื่อของคุณ">

<!-- ทำเหมือนกันกับ editEmail, editPhone, newPassword, confirmPassword -->
<input type="email" id="editEmail" class="form-input liquid-glass-input" disabled placeholder="อีเมล">
<input type="tel" id="editPhone" class="form-input liquid-glass-input" placeholder="08x-xxx-xxxx">
<input type="password" id="newPassword" class="form-input liquid-glass-input" placeholder="••••••••">
<input type="password" id="confirmPassword" class="form-input liquid-glass-input" placeholder="••••••••">
```

### profile.html แก้ส่วนปุ่มเปลี่ยนรหัสผ่าน (บรรทัด ~181)

```html
<!-- จาก -->
<button onclick="changePassword()" class="btn-outline w-full py-3 text-sm mt-1">
<!-- เป็น -->
<button onclick="changePassword()" class="liquid-glass-button liquid-glass-button-outline w-full py-3 text-sm mt-1">
```

### 2. profile.css (เพิ่มสไตล์ Liquid Glass ที่ขาด) เพิ่มต่อท้ายไฟล์ (หรือแทรกในส่วนที่เหมาะสม)

```css
/* ─── Liquid Glass Form Elements ─── */

/* Input Field */
.liquid-glass-input {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 12px;
    padding: 12px 16px;
    font-size: 0.95rem;
    color: #1e293b;
    transition: all 0.3s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
    width: 100%;
}

.liquid-glass-input:hover {
    background: rgba(255, 255, 255, 0.85);
    border-color: rgba(14, 165, 233, 0.3);
}

.liquid-glass-input:focus {
    outline: none;
    background: rgba(255, 255, 255, 0.95);
    border-color: rgba(14, 165, 233, 0.5);
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1), 0 4px 12px rgba(14, 165, 233, 0.1);
}

.liquid-glass-input:disabled {
    background: rgba(241, 245, 249, 0.6);
    color: #94a3b8;
    cursor: not-allowed;
}

/* Button Outline Variant */
.liquid-glass-button {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 12px;
    color: #475569;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
}

.liquid-glass-button:hover {
    background: rgba(255, 255, 255, 0.9);
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
}

.liquid-glass-button-outline {
    border: 1px solid rgba(14, 165, 233, 0.3);
    color: #0ea5e9;
    background: rgba(255, 255, 255, 0.5);
}

.liquid-glass-button-outline:hover {
    border-color: rgba(14, 165, 233, 0.6);
    color: #0284c7;
    background: rgba(255, 255, 255, 0.8);
    box-shadow: 0 4px 15px rgba(14, 165, 233, 0.15);
}

/* Form Label สำหรับ Liquid Glass */
.form-label {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    color: #475569;
    margin-bottom: 6px;
}

/* Form Group spacing */
.form-group {
    margin-bottom: 1rem;
}

/* Profile Specific Liquid Glass Enhancements */
.profile-cover {
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.3) 0%, rgba(129, 140, 248, 0.3) 100%);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.5);
}

/* Stat Card Base (ถ้ายังไม่มีใน liquid-glass-stat) */
.stat-card {
    background: rgba(255, 255, 255, 0.6);
    backdrop-filter: blur(15px);
    -webkit-backdrop-filter: blur(15px);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 16px;
    padding: 16px;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
    transition: all 0.3s ease;
}

.stat-card:hover {
    background: rgba(255, 255, 255, 0.8);
    transform: translateY(-3px);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.1);
}

.stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    background: linear-gradient(135deg, #38bdf8, #818cf8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 4px;
}

.stat-label {
    font-size: 0.75rem;
    color: #64748b;
    font-weight: 500;
}

/* Profile Body Enhancements */
.profile-body {
    padding: 60px 20px 24px;
    position: relative;
    text-align: center;
}

.profile-name {
    font-size: 1.25rem;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 4px;
}

.profile-email {
    font-size: 0.875rem;
    color: #64748b;
    margin-bottom: 12px;
}

/* Toast Warning Type (เพิ่มเติม) */
.toast-warning {
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
}
```