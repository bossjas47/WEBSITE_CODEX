// ==================== Global Variables ====================
let db = null;
let currentUser = null;
let adminPin = null;
let allUsers = [];
let allOrders = [];
let mainChart = null;
let categoryChart = null;

// Topup & Payment variables
let currentTopupRequest = null;
let topupUnsubscribe = null;
let currentPaymentTab = 'bank';
let paymentUnsubscribe = null;

// User Management variables
let currentEditingUser = null;
let currentDetailUser = null;

// Role Management variables
let allRoles = [];
let currentUserRole = null;
let currentUserPermissions = [];

// 🪙 Special Currency Variables
let specialCurrencies = [];
let currentEditingCurrency = null;

const firebaseConfig = {
    apiKey: "AIzaSyC450kePwL6FdVXUSVli0bEP3DdnQs0qzU",
    authDomain: "psl-esport.firebaseapp.com",
    projectId: "psl-esport",
    storageBucket: "psl-esport.firebasestorage.app",
    messagingSenderId: "225108570173",
    appId: "1:225108570173:web:b6483c02368908f3783a54"
};

// Available permissions list for reference
const availablePermissions = [
    { value: 'view_dashboard', label: 'ดูภาพรวมระบบ', category: 'dashboard' },
    { value: 'view_reports', label: 'ดูรายงาน', category: 'dashboard' },
    { value: 'manage_users', label: 'จัดการผู้ใช้', category: 'users' },
    { value: 'edit_user_balance', label: 'แก้ไขยอดเงินผู้ใช้', category: 'users' },
    { value: 'change_user_role', label: 'เปลี่ยนยศผู้ใช้', category: 'users' },
    { value: 'manage_orders', label: 'จัดการคำสั่งซื้อ', category: 'orders' },
    { value: 'cancel_orders', label: 'ยกเลิกคำสั่งซื้อ', category: 'orders' },
    { value: 'manage_topup', label: 'ดูคำขอเติมเงิน', category: 'topup' },
    { value: 'approve_topup', label: 'อนุมัติ/ปฏิเสธการเติมเงิน', category: 'topup' },
    { value: 'manage_special_currencies', label: 'จัดการสกุลเงินพิเศษ', category: 'special_currency' },
    { value: 'manage_payments', label: 'จัดการช่องทางชำระเงิน', category: 'payments' },
    { value: 'manage_products', label: 'จัดการสินค้า', category: 'products' },
    { value: 'view_messages', label: 'ดูข้อความ', category: 'messages' },
    { value: 'send_messages', label: 'ส่งข้อความถึงผู้ใช้', category: 'messages' },
    { value: 'manage_settings', label: 'ตั้งค่าระบบ', category: 'settings' },
    { value: 'manage_roles', label: 'จัดการยศและสิทธิ์', category: 'settings' }
];

// Font Awesome Icons for Special Currencies
const currencyIcons = [
    { value: 'fa-coins', label: 'เหรียญ (Coins)', color: 'amber' },
    { value: 'fa-gem', label: 'เพชร (Gem)', color: 'purple' },
    { value: 'fa-trophy', label: 'ถ้วยรางวัล (Trophy)', color: 'yellow' },
    { value: 'fa-star', label: 'ดาว (Star)', color: 'orange' },
    { value: 'fa-certificate', label: 'ตรา (Badge)', color: 'blue' },
    { value: 'fa-envelope-open-text', label: 'อั่งเปา (Envelope)', color: 'red' },
    { value: 'fa-ticket', label: 'ตั๋ว (Ticket)', color: 'pink' },
    { value: 'fa-sack-dollar', label: 'ถุงเงิน (Money Bag)', color: 'emerald' },
    { value: 'fa-bolt', label: 'สายฟ้า (Bolt)', color: 'yellow' },
    { value: 'fa-heart', label: 'หัวใจ (Heart)', color: 'rose' },
    { value: 'fa-crown', label: 'มงกุฎ (Crown)', color: 'amber' },
    { value: 'fa-medal', label: 'เหรียญรางวัล (Medal)', color: 'orange' }
];



// Bank Colors
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
