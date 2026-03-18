/**
 * Announcement Bar - แถบประกาศเลื่อนที่ด้านบนของหน้า
 * ใช้ Firebase Firestore เพื่อดึงข้อมูลประกาศจาก Admin Panel
 */

import { db } from '../firebase-config.js';
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

class AnnouncementBar {
    constructor() {
        this.container = null;
        this.marqueeText = null;
        this.isActive = false;
        this.currentAnnouncement = null;
    }

    /**
     * Initialize the announcement bar
     */
    init() {
        // Create bar HTML
        const html = `
            <div id="announcementBar" class="announcement-bar hidden">
                <div class="announcement-content">
                    <div class="announcement-icon">
                        <i class="fa-solid fa-bell"></i>
                    </div>
                    <div class="announcement-marquee">
                        <div class="marquee-text" id="marqueeText">
                            กำลังโหลดประกาศ...
                        </div>
                    </div>
                    <button class="announcement-close" onclick="announcementBar.close()">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
        `;

        // Insert at the beginning of body
        document.body.insertAdjacentHTML('afterbegin', html);

        this.container = document.getElementById('announcementBar');
        this.marqueeText = document.getElementById('marqueeText');

        // Add CSS if not already present
        this.injectStyles();

        // Subscribe to announcements
        this.subscribeToAnnouncements();

        // Make methods available globally
        window.announcementBar = this;
    }

    /**
     * Inject CSS styles for announcement bar
     */
    injectStyles() {
        if (document.getElementById('announcement-bar-styles')) return;

        const style = document.createElement('style');
        style.id = 'announcement-bar-styles';
        style.textContent = `
            .announcement-bar {
                background: linear-gradient(135deg, var(--primary, #0ea5e9) 0%, var(--secondary, #6366f1) 100%);
                color: white;
                padding: 12px 16px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                position: sticky;
                top: 0;
                z-index: 100;
                animation: slideDown 0.3s ease-out;
            }

            @keyframes slideDown {
                from {
                    transform: translateY(-100%);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }

            .announcement-bar.hidden {
                display: none;
            }

            .announcement-content {
                display: flex;
                align-items: center;
                gap: 12px;
                max-width: 1200px;
                margin: 0 auto;
                font-size: 14px;
                font-weight: 500;
            }

            .announcement-icon {
                flex-shrink: 0;
                font-size: 18px;
                animation: bounce 2s infinite;
            }

            @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-3px); }
            }

            .announcement-marquee {
                flex: 1;
                overflow: hidden;
                min-height: 24px;
                display: flex;
                align-items: center;
            }

            .marquee-text {
                display: inline-block;
                white-space: nowrap;
                animation: marquee 20s linear infinite;
                padding-left: 100%;
            }

            @keyframes marquee {
                0% {
                    transform: translateX(0);
                }
                100% {
                    transform: translateX(-100%);
                }
            }

            .marquee-text:hover {
                animation-play-state: paused;
            }

            .announcement-close {
                flex-shrink: 0;
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: white;
                width: 32px;
                height: 32px;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                font-size: 16px;
            }

            .announcement-close:hover {
                background: rgba(255, 255, 255, 0.3);
                transform: scale(1.1);
            }

            @media (max-width: 640px) {
                .announcement-content {
                    font-size: 13px;
                    gap: 8px;
                }

                .announcement-icon {
                    font-size: 16px;
                }

                .announcement-close {
                    width: 28px;
                    height: 28px;
                    font-size: 14px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Subscribe to announcements from Firestore
     */
    subscribeToAnnouncements() {
        try {
            onSnapshot(doc(db, 'system', 'announcement'), (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.enabled && data.text) {
                        this.show(data);
                    } else {
                        this.hide();
                    }
                }
            });
        } catch (e) {
            console.warn('Failed to subscribe to announcements:', e);
        }
    }

    /**
     * Show announcement
     */
    show(data) {
        this.currentAnnouncement = data;
        this.isActive = true;

        if (this.marqueeText) {
            this.marqueeText.textContent = data.text || 'ประกาศจากระบบ';
        }

        if (this.container) {
            this.container.classList.remove('hidden');

            // Apply custom background if provided
            if (data.backgroundColor) {
                this.container.style.background = data.backgroundColor;
            } else {
                this.container.style.background = 'linear-gradient(135deg, var(--primary, #0ea5e9) 0%, var(--secondary, #6366f1) 100%)';
            }

            // Apply custom text color if provided
            if (data.textColor) {
                this.container.style.color = data.textColor;
            }
        }
    }

    /**
     * Hide announcement
     */
    hide() {
        this.isActive = false;
        if (this.container) {
            this.container.classList.add('hidden');
        }
    }

    /**
     * Close announcement (user action)
     */
    close() {
        this.hide();
        // Store in localStorage to not show again for 24 hours
        const key = `announcement_closed_${this.currentAnnouncement?.id || 'default'}`;
        localStorage.setItem(key, Date.now().toString());
    }

    /**
     * Update announcement text
     */
    updateText(text) {
        if (this.marqueeText) {
            this.marqueeText.textContent = text;
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.announcementBar = new AnnouncementBar();
        window.announcementBar.init();
    });
} else {
    window.announcementBar = new AnnouncementBar();
    window.announcementBar.init();
}

export { AnnouncementBar };
