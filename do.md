# Technical Specification: Token-Based Game ID Rental System
**Version:** 1.0  
**Date:** 2026-03-25  
**Project:** PanderX Multi-Tenant Game ID Marketplace

---

## 1. ภาพรวมระบบ (System Overview)

### 1.1 โครงสร้างหลัก
- ** rent.panderx.xyz**: ศูนย์กลางการเงิน + ซื้อ Token + Admin Panel
- ** {subdomain}.panderx.xyz**: ร้านค้าลูกค้า (ไม่มีข้อมูลการเงิน)
- ** API Gateway**: คั่นกลางความปลอดภัย คิดเงินบริการ API

### 1.2 หลักการคิดราคา Token
**1 บาท (THB) = 10 Tokens**  
**1 วัน Hosting = 33 Tokens (3.30 บาท)**  
**30 วัน = 990 Tokens = 99 บาทพอดี**

| บริการ | ค่าใช้จ่าย (Tokens) | ค่าใช้จ่าย (บาท) | หมายเหตุ |
|--------|---------------------|------------------|----------|
| Hosting 1 วัน | 33 | 3.30 | คิดทุกวันเที่ยงคืน |
| ตรวจสอบสลิป (Slip Verify) | 2 | 0.20 | ต่อครั้งที่เรียก API |
| เช็คสต็อกสินค้า | 0 | ฟรี | ไม่จำกัดจำนวนครั้ง |
| ส่งแจ้งเตือน Discord | 0 | ฟรี | ผ่าน Webhook |
| เก็บข้อมูล Game ID | 0 | ฟรี | Storage รวมใน Hosting |

---

## 2. Database Schema รายละเอียด

### 2.1 Financial Database (rent.panderx.xyz)
**Collection: `token_wallets`**
```javascript
{
  userId: "firebase_auth_uid",
  balance: 990,                    // ยอดคงเหลือ (Tokens)
  reserved: 0,                     // Token ที่จองไว้สำหรับ Transaction ที่กำลังดำเนินการ
  
  // การตั้งค่า
  dailyRate: 33,                   // ค่าใช้จ่ายต่อวัน (สามารถปรับลดได้ถ้ามีโปรโมชั่น)
  lastDeduction: timestamp,
  nextDeduction: timestamp,
  
  // API Quota
  apiQuota: {
    freeCalls: 0,                  // เก็บสถิติการใช้งาน
    paidCallsToday: 0,
    lastReset: timestamp           // Reset ทุกเที่ยงคืน
  },
  
  // ความปลอดภัย
  allowedTenantIds: ["reo", "shop2"],  // ร้านค้าที่อนุญาตให้ใช้ Token นี้
  ipWhitelist: [],                 // จำกัด IP (optional)
  
  metadata: {
    totalPurchased: 990,
    totalSpent: 0,
    totalApiCalls: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}
```

### 3.2 Token Package Management (จัดการแพ็คเกจ Token)

**Path:** `/admin/token-packages`  
**Permission:** Super Admin / Admin (manage_packages)

#### 3.2.1 UI Layout

#### 3.2.2 ฟอร์มเพิ่ม/แก้ไขแพ็คเกจ (Modal)

**ฟิลด์ข้อมูล:**
```javascript
{
  // ข้อมูลพื้นฐาน
  packageId: {
    label: "รหัสแพ็คเกจ (ID)",
    type: "text",
    placeholder: "monthly_saver",
    validation: "unique, lowercase, no spaces",
    disabled: "true ถ้าเป็นการแก้ไข (แก้ไข ID ไม่ได้)"
  },
  
  name: {
    label: "ชื่อแพ็คเกจ",
    type: "text",
    placeholder: "Monthly Saver",
    required: true
  },
  
  tokens: {
    label: "จำนวน Tokens",
    type: "number",
    placeholder: "990",
    min: 10,
    required: true,
    helpText: "1 บาท = 10 Tokens (คำนวณอัตโนมัติ)"
  },
  
  price: {
    label: "ราคา (บาท)",
    type: "number",
    placeholder: "99",
    min: 1,
    required: true
  },
  
  // การคำนวณอัตโนมัติ (Real-time Preview)
  calculation: {
    type: "display",
    formula: {
      daysCovered: "tokens / 33",        // 990 / 33 = 30 วัน
      pricePerDay: "price / daysCovered", // 99 / 30 = 3.30 บาท/วัน
      pricePerToken: "price * 10 / tokens", // 99 * 10 / 990 = 1.00 บาทต่อ Token (เทียบอัตราแลกเปลี่ยน)
      profitMargin: "((price - (daysCovered * 2.5)) / price * 100)" // สมมติต้นทุน 2.5 บาท/วัน
    },
    display: "ใช้ได้ ~30 วัน (3.30 บาท/วัน) | กำไร ~62%"
  },
  
  // การแสดงผล
  badge: {
    label: "ป้ายแนะนำ",
    type: "text",
    placeholder: "ยอดนิยม, ประหยัดที่สุด, แนะนำ",
    optional: true
  },
  
  color: {
    label: "สีประจำแพ็คเกจ",
    type: "color-picker",
    default: "#3B82F6", // blue-500
    presets: ["#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"]
  },
  
  icon: {
    label: "ไอคอน",
    type: "select",
    options: ["Coins", "Calendar", "Rocket", "Crown", "Star", "Zap"],
    default: "Coins"
  },
  
  // สถานะและเงื่อนไข
  isActive: {
    label: "เปิดใช้งาน",
    type: "toggle-switch",
    default: true
  },
  
  isVipOnly: {
    label: "เฉพาะลูกค้า VIP",
    type: "toggle-switch",
    default: false,
    helpText: "แสดงเฉพาะลูกค้าที่มี tag VIP เท่านั้น"
  },
  
  sortOrder: {
    label: "ลำดับการแสดงผล",
    type: "number",
    default: 99,
    helpText: "เลขน้อย = แสดงก่อน (1, 2, 3...)"
  },
  
  description: {
    label: "รายละเอียดเพิ่มเติม",
    type: "textarea",
    placeholder: "เหมาะสำหรับร้านค้าที่เริ่มต้นธุรกิจ...",
    rows: 3
  },
  
  // โบนัส (ถ้ามี)
  bonusTokens: {
    label: "Tokens แถมฟรี",
    type: "number",
    default: 0,
    placeholder: "เช่น ซื้อ 990 แถม 100",
    helpText: "ลูกค้าจะได้รับ Tokens เพิ่มจากที่ซื้อ (โปรโมชั่น)"
  }
}
