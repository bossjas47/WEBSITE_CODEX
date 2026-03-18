/**
 * Stats Logic - แก้ไข Logic การแสดงผลสถิติให้สัมพันธ์กัน
 * ทำให้ค่าในแต่ละช่วงเวลามีความสัมพันธ์กัน (วันนี้ <= สัปดาห์ <= เดือน <= ทั้งหมด)
 */

if (!window.StatsLogic) {
    window.StatsLogic = class StatsLogic {
        constructor() {
            this.stats = {
                today: 0,
                week: 0,
                month: 0,
                total: 0
            };
            this.init();
        }

        init() {
            // ตรวจสอบว่ามี stats container หรือไม่
            const statsContainer = document.querySelector('.stats-grid');
            if (!statsContainer) return;

            // สร้างข้อมูลสถิติที่มีความสัมพันธ์กัน
            this.generateCoherentStats();
            
            // อัปเดต UI
            this.updateStatsUI();
            

        }

        generateCoherentStats() {
            // สร้างข้อมูลที่มีความสัมพันธ์กัน
            // ตัวอย่าง: วันนี้ 5 -> สัปดาห์ 28 -> เดือน 95 -> ทั้งหมด 342
            
            const today = Math.floor(Math.random() * 10) + 1; // 1-10
            const week = today + Math.floor(Math.random() * 20) + 15; // today + 15-35
            const month = week + Math.floor(Math.random() * 50) + 40; // week + 40-90
            const total = month + Math.floor(Math.random() * 200) + 150; // month + 150-350

            this.stats = {
                today: today,
                week: week,
                month: month,
                total: total
            };

            // บันทึกไปยัง sessionStorage เพื่อให้ค่าคงที่ตลอดเซสชัน
            try {
                sessionStorage.setItem('panderx-stats', JSON.stringify(this.stats));
            } catch (e) {
                console.warn('sessionStorage not available:', e);
            }
        }

        loadStatsFromStorage() {
            try {
                const stored = sessionStorage.getItem('panderx-stats');
                if (stored) {
                    this.stats = JSON.parse(stored);
                    return true;
                }
            } catch (e) {
                console.warn('sessionStorage not available:', e);
            }
            return false;
        }

        updateStatsUI() {
            // โหลดจาก storage ก่อน ถ้าไม่มี ให้สร้างใหม่
            if (!this.loadStatsFromStorage()) {
                this.generateCoherentStats();
            }

            // ค้นหา stat cards และอัปเดต
            const cards = document.querySelectorAll('.stat-card');
            const cardOrder = ['today', 'week', 'month', 'total'];

            cards.forEach((card, index) => {
                const key = cardOrder[index];
                if (key && this.stats[key] !== undefined) {
                    const valueEl = card.querySelector('.stat-card-value');
                    const changeEl = card.querySelector('.stat-card-change');
                    
                    if (valueEl) {
                        valueEl.textContent = this.stats[key].toLocaleString('th-TH');
                    }
                    
                    // อัปเดต change indicator (ตัวอย่างเท่านั้น)
                    if (changeEl) {
                        const isPositive = Math.random() > 0.3;
                        changeEl.classList.toggle('negative', !isPositive);
                        const changePercent = Math.floor(Math.random() * 30) + 5;
                        changeEl.innerHTML = `
                            <i class="fa-solid ${isPositive ? 'fa-arrow-up' : 'fa-arrow-down'}"></i>
                            <span>${changePercent}% จากเดือนที่แล้ว</span>
                        `;
                    }
                }
            });
        }

        // ฟังก์ชัน public สำหรับ refresh stats (ถ้าต้องการ)
        refreshStats() {
            this.generateCoherentStats();
            this.updateStatsUI();
        }

        // ฟังก์ชัน public สำหรับดึงค่า stats
        getStats() {
            return { ...this.stats };
        }
    }

    // Initialize stats logic เมื่อ DOM พร้อม
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (!window.statsLogic) window.statsLogic = new StatsLogic();
        });
    } else {
        if (!window.statsLogic) window.statsLogic = new StatsLogic();
    }
}
