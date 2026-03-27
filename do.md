# do.md - Token-Based Website Rental System

## Token Economy
- 1 THB = 10 Tokens
- 1 Day Hosting = 33 Tokens (3.30 THB)
- 30 Days = 990 Tokens = 99 THB
- Slip Verification API = 2 Tokens (0.20 THB)/call
- Stock Check/Discord = Free

## Token Packages
monthly_saver: 990 Tokens, 99 THB, 30 days, badge: "ยอดนิยม", color: #10B981, icon: Calendar
starter: 100 Tokens, 10 THB, 3 days, color: #3B82F6, icon: Rocket
weekly: 231 Tokens, 23 THB, 7 days, color: #8B5CF6, icon: Coins
api_pack: 100 Tokens, 20 THB, 50 calls, color: #F59E0B, icon: Zap
enterprise: 10000 Tokens, 950 THB, ~303 days, bonus: 500, color: #EC4899, icon: Crown

## Database Schema

token_wallets/{userId}:
{
  userId: "firebase_auth_uid",
  balance: 990,
  reserved: 0,
  dailyRate: 33,
  lastDeduction: "timestamp",
  nextDeduction: "timestamp",
  allowedTenantIds: ["reo", "shop1"],
  apiQuota: { paidCallsToday: 0, lastReset: "timestamp" },
  metadata: { totalPurchased: 990, totalSpent: 0, createdAt: "timestamp" }
}

token_packages/{packageId}:
{
  packageId: "monthly_saver",
  name: "Monthly Saver",
  tokens: 990,
  price: 99,
  badge: "ยอดนิยม",
  color: "#10B981",
  icon: "Calendar",
  isActive: true,
  isVipOnly: false,
  sortOrder: 1,
  bonusTokens: 0,
  description: "30 days hosting",
  updatedAt: "timestamp",
  updatedBy: "admin_uid"
}

api_call_logs/{logId}:
{
  userId: "uid",
  tenantId: "reo",
  type: "slip_verification",
  cost: 2,
  balanceAfter: 988,
  status: "success",
  timestamp: "server_timestamp",
  payload: { slipUrl: "...", amount: 150, verified: true },
  ipAddress: "123.45.67.89"
}

pending_payments/{paymentId}:
{
  userId: "uid",
  packageId: "monthly_saver",
  tokensToAdd: 990,
  price: 99,
  paymentMethod: "slip",
  slipUrl: "https://storage...",
  slipVerified: false,
  status: "pending",
  reviewedBy: null,
  reviewedAt: null,
  createdAt: "timestamp",
  expiresAt: "timestamp"
}

websites/{websiteId}:
{
  websiteId: "reo",
  subdomain: "reo",
  domain: "reo.panderx.xyz",
  ownerId: "firebase_auth_uid",
  ownerEmail: "user@example.com",
  template: "ecommerce",
  status: "active",
  settings: { shopName: "REO Shop", theme: "dark", logoUrl: "...", favicon: "..." },
  features: { customDomain: false, sslEnabled: true, maxProducts: 100, maxStaff: 5 },
  walletUserId: "uid",
  isActive: true,
  suspendedAt: null,
  suspensionReason: null,
  createdAt: "timestamp",
  expiresAt: null
}

## Cloud Functions

// verifySlip - API Gateway (2 Tokens)
exports.verifySlip = onRequest({ cors: ["https://*.panderx.xyz"], region: "asia-southeast1" }, async (req, res) => {
  const authHeader = req.headers.authorization;
  const tenantId = req.headers["x-tenant-id"];
  if (!authHeader || !tenantId) return res.status(401).json({ error: "Missing credentials" });
  
  try {
    const token = authHeader.replace("Bearer ", "");
    const decoded = await admin.auth().verifyIdToken(token);
    const userId = decoded.uid;
    
    const walletRef = admin.firestore().collection("token_wallets").doc(userId);
    const walletDoc = await walletRef.get();
    if (!walletDoc.exists) return res.status(404).json({ error: "Wallet not found" });
    
    const wallet = walletDoc.data();
    if (!wallet.allowedTenantIds.includes(tenantId)) return res.status(403).json({ error: "Tenant not authorized" });
    
    const COST = 2;
    if (wallet.balance < COST) return res.status(402).json({ error: "Insufficient tokens", required: COST, current: wallet.balance, topupUrl: "https://rent.panderx.xyz" });
    
    await walletRef.update({
      balance: admin.firestore.FieldValue.increment(-COST),
      "metadata.totalSpent": admin.firestore.FieldValue.increment(COST),
      "apiQuota.paidCallsToday": admin.firestore.FieldValue.increment(1)
    });
    
    const { slipImageUrl, expectedAmount } = req.body;
    const result = await verifyWithSlipApi(slipImageUrl, expectedAmount);
    
    await admin.firestore().collection("api_call_logs").add({
      userId, tenantId, type: "slip_verification", cost: COST, balanceAfter: wallet.balance - COST,
      status: result.verified ? "success" : "failed",
      payload: { slipUrl: slipImageUrl, amount: expectedAmount, verified: result.verified, ref: result.reference },
      timestamp: admin.firestore.FieldValue.serverTimestamp(), ipAddress: req.ip
    });
    
    return res.json({ success: true, verified: result.verified, tokensRemaining: wallet.balance - COST });
  } catch (error) {
    return res.status(500).json({ error: "Internal error" });
  }
});

// dailyTokenDeduction - Midnight daily
exports.dailyTokenDeduction = onSchedule({ schedule: "0 0 * * *", region: "asia-southeast1" }, async (event) => {
  const db = admin.firestore();
  const sites = await db.collection("websites").where("isActive", "==", true).get();
  
  for (const site of sites.docs) {
    const siteId = site.id;
    const ownerId = site.data().ownerId;
    const walletRef = db.collection("token_wallets").doc(ownerId);
    
    try {
      await db.runTransaction(async (t) => {
        const walletDoc = await t.get(walletRef);
        if (!walletDoc.exists) return;
        const wallet = walletDoc.data();
        const dailyRate = wallet.dailyRate || 33;
        
        if (wallet.balance >= dailyRate) {
          t.update(walletRef, { balance: admin.firestore.FieldValue.increment(-dailyRate), lastDeduction: admin.firestore.FieldValue.serverTimestamp() });
          t.set(db.collection("api_call_logs").doc(), { userId: ownerId, tenantId: siteId, type: "daily_hosting", cost: dailyRate, status: "success", timestamp: admin.firestore.FieldValue.serverTimestamp() });
        } else {
          const lastDed = wallet.lastDeduction?.toDate() || new Date(0);
          const daysSince = Math.floor((Date.now() - lastDed) / 86400000);
          if (daysSince > 3) {
            t.update(db.collection("websites").doc(siteId), { isActive: false, suspendedAt: admin.firestore.FieldValue.serverTimestamp(), suspensionReason: "insufficient_tokens" });
          }
        }
      });
    } catch (e) { console.error(`Error processing ${siteId}:`, e); }
  }
});

// subdomainRouter
exports.subdomainRouter = onRequest({ region: "asia-southeast1" }, async (req, res) => {
  const host = req.headers.host || req.hostname;
  const subdomain = host.split(".")[0];
  
  if (subdomain === "rent" || subdomain === "www") return res.redirect("https://rent.panderx.xyz");
  
  const siteDoc = await admin.firestore().collection("websites").doc(subdomain).get();
  if (!siteDoc.exists) return res.status(404).send("Website not found");
  
  const site = siteDoc.data();
  if (!site.isActive) return res.redirect(`https://rent.panderx.xyz/renew?site=${subdomain}`);
  
  const walletDoc = await admin.firestore().collection("token_wallets").doc(site.ownerId).get();
  const balance = walletDoc.data()?.balance || 0;
  const daysLeft = Math.floor(balance / 33);
  
  if (daysLeft < 3 && daysLeft > 0) res.set("X-Warning", `Token low: ${daysLeft} days remaining`);
  
  return serveWebsiteTemplate(subdomain, site.template);
});

// purchaseTokens
exports.purchaseTokens = onCall({ region: "asia-southeast1" }, async (data, context) => {
  if (!context.auth) throw new Error("Unauthenticated");
  const { packageId, method, slipUrl } = data;
  const db = admin.firestore();
  
  const pkg = await db.collection("token_packages").doc(packageId).get();
  if (!pkg.exists) throw new Error("Invalid package");
  const pkgData = pkg.data();
  
  if (method === "slip") {
    await db.collection("pending_payments").add({
      userId: context.auth.uid, packageId, tokensToAdd: pkgData.tokens, price: pkgData.price,
      slipUrl, status: "pending", createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 86400000)
    });
    return { status: "pending" };
  }
  
  await db.collection("token_wallets").doc(context.auth.uid).update({
    balance: admin.firestore.FieldValue.increment(pkgData.tokens),
    allowedTenantIds: admin.firestore.FieldValue.arrayUnion(data.tenantId || "new")
  });
  return { status: "success", tokens: pkgData.tokens };
});

// createWebsite
exports.createWebsite = onCall({ region: "asia-southeast1" }, async (data, context) => {
  if (!context.auth) throw new Error("Unauthenticated");
  const { subdomain, template } = data;
  const db = admin.firestore();
  
  const exists = await db.collection("websites").doc(subdomain).get();
  if (exists.exists) throw new Error("Subdomain taken");
  
  const batch = db.batch();
  batch.set(db.collection("websites").doc(subdomain), {
    websiteId: subdomain, subdomain, domain: `${subdomain}.panderx.xyz`,
    ownerId: context.auth.uid, ownerEmail: context.auth.token.email,
    template: template || "default", status: "active", isActive: true,
    walletUserId: context.auth.uid, createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  batch.set(db.collection("tenant_settings").doc(subdomain), {
    websiteId: subdomain, discordWebhook: "", autoSlipVerify: false, notifyOnOrder: true
  });
  await batch.commit();
  
  await db.collection("token_wallets").doc(context.auth.uid).update({
    allowedTenantIds: admin.firestore.FieldValue.arrayUnion(subdomain)
  });
  return { success: true, url: `https://${subdomain}.panderx.xyz` };
});

## Firestore Rules

rules_version = "2";
service cloud.firestore {
  match /databases/{database}/documents {
    match /token_wallets/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false;
    }
    match /api_call_logs/{logId} {
      allow read: if request.auth != null && (request.auth.uid == resource.data.userId || isAdmin());
      allow write: if false;
    }
    match /token_packages/{id} {
      allow read: if true;
      allow write: if isAdmin();
    }
    match /pending_payments/{id} {
      allow read: if request.auth != null && (request.auth.uid == resource.data.userId || isAdmin());
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
      allow update: if isAdmin();
    }
    match /websites/{siteId} {
      allow read: if request.auth != null && (resource.data.ownerId == request.auth.uid || request.auth.token.tenantId == siteId);
      allow write: if request.auth != null && resource.data.ownerId == request.auth.uid;
    }
    match /website_pages/{pageId} {
      allow read: if request.auth.token.tenantId == resource.data.websiteId || resource.data.isPublished;
      allow write: if request.auth.token.tenantId == resource.data.websiteId;
    }
    match /tenant_settings/{siteId} {
      allow read: if request.auth.token.tenantId == siteId;
      allow write: if request.auth.token.tenantId == siteId && request.auth.token.role == "admin";
    }
    function isAdmin() {
      return exists(/databases/$(database)/documents/admin_users/$(request.auth.uid));
    }
  }
}

## Admin Panel UI

Dashboard:
- Total tokens circulation, Today's revenue, API calls today, Low balance alerts (<50), 7/30 day charts

Token Packages:
- Form: packageId (unique), name, tokens (min 33), price, badge, color (picker), icon (select), isActive (toggle), isVipOnly (toggle), sortOrder (number), bonusTokens, description
- Calculator: days=tokens/33, price/day, profit margin
- Validation: tokens<33 warning, duplicate ID check
- Preview card, Drag-drop reordering, Soft delete

Pending Payments:
- Table: slip thumbnail, email, package, amount, timestamp, OCR data
- Actions: Approve (adds tokens), Reject (with reason), Bulk approve
- Filters: pending, approved, rejected

API Logs:
- Filter by type, tenantId, date, status, Export CSV

## Rent Website UI

Token Store:
- Hero "เติม Token ใช้งานเว็บไซต์"
- Grid 3 columns (1 mobile)
- Card: icon (48px) + color bg, badge, name, tokens number, price, calculation (~X days, X THB/day), features, CTA button
- Calculation: Math.floor(tokens/33), (price/days).toFixed(2)

Payment Flow:
1. Select package → Modal
2. QR PromptPay + Bank details + Slip upload
3. Confirm → Storage → pending_payment → "รอตรวจสอบ 24 ชม."
4. Email notification on approval

Customer Dashboard:
- Balance card: large number, progress bar (balance%33), "เหลือ X วัน", next deduction
- Quick actions: [เติม Token] [สร้างเว็บ] [จัดการเว็บ]
- Tabs: เติมเงิน (pending_payments), ใช้งาน (api_call_logs)
- Website list: subdomain, status, days remaining, จัดการ button

Create Website:
- Input: subdomain (real-time check), template select
- Check: wallet exists (can create with 0, suspends in 3 days)
- Call createWebsite → Redirect to subdomain

## Implementation Checklist

Phase 1:
[ ] Firebase Blaze Plan
[ ] Firestore Collections
[ ] Storage bucket
[ ] 3 Service Accounts
[ ] Deploy 5 Functions
[ ] Security Rules
[ ] Hosting setup

Phase 2:
[ ] Admin login
[ ] Dashboard
[ ] Token Packages CRUD
[ ] Pending Payments
[ ] API Logs

Phase 3:
[ ] Landing page
[ ] Auth
[ ] Payment modal
[ ] Slip upload
[ ] Customer dashboard

Phase 4:
[ ] Tenant template
[ ] Low token warning
[ ] API integration
[ ] Page editor
[ ] Settings

Phase 5:
[ ] CORS test
[ ] Service Account isolation
[ ] Grace period test
[ ] Auto-suspend test
[ ] Load test

## Environment Variables

DAILY_RATE=33
SLIP_VERIFY_COST=2
SLIP_API_KEY=xxx
ENCRYPTION_KEY=xxx
DISCORD_WEBHOOK_SECRET=xxx

## Indexes

token_wallets: userId ASC
api_call_logs: userId ASC, timestamp DESC
api_call_logs: tenantId ASC, timestamp DESC
pending_payments: userId ASC, status ASC
websites: ownerId ASC, isActive ASC



<div id="editCodeModal" class="modal-overlay">
    <div class="modal-content p-6" style="max-width: 500px;">
        <!-- ... header ... -->
        
        <form onsubmit="event.preventDefault(); saveEditCode();" class="space-y-4">
            <!-- ... รหัสโค้ด, มูลค่า, สถานะ ... -->
            
            <!-- ใหม่: แสดงสถิติการใช้งาน -->
            <div id="editCodeUsageStats" class="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <!-- จะถูกใส่ค่าด้วย JS -->
            </div>

            <!-- ใหม่: แก้ไขจำนวนคน -->
            <div>
                <label class="block text-sm font-bold text-slate-700 mb-2">จำกัดจำนวนคน (ว่าง = ไม่จำกัด)</label>
                <input type="number" id="editCodeMaxUses" placeholder="ไม่จำกัด" min="1"
                    class="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100">
                <p class="text-xs text-slate-400 mt-1">ใส่ตัวเลขเช่น 5 = ใช้ได้ 5 คน, เว้นว่าง = ใช้ได้ทุกคน</p>
            </div>

            <!-- ... วันหมดอายุ, หมายเหตุ, ปุ่ม ... -->
        </form>
    </div>
</div>
