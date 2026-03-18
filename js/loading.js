/**
 * PanderX Loading Manager
 * ใช้ได้ทุกหน้า โดย import เข้าไปในแต่ละหน้า
 */

export class LoadingManager {
    constructor() {
        this.loader = document.getElementById('appLoader');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.tagline = document.getElementById('loaderTagline');
        this.cancelBtn = document.getElementById('loaderCancelBtn');
        
        this.currentProgress = 0;
        this.targetProgress = 0;
        this.isCancelled = false;
        this.animationFrame = null;
        
        this.stepMessages = {
            auth: 'กำลังตรวจสอบสิทธิ์ผู้ใช้...',
            tenant: 'กำลังโหลดข้อมูลเว็บไซต์...',
            ready: 'กำลังเข้าสู่ระบบ...',
            error: 'เกิดข้อผิดพลาด กรุณาลองใหม่'
        };
        
        // Auto init ถ้ามี loader อยู่ในหน้า
        if (this.loader) {
            this.init();
        }
    }

    init() {
        this.start({ showCancel: true, timeout: 8000 });
        this.setStep('auth', 'active');
        this.updateProgress(10, 'กำลังเชื่อมต่อกับระบบ...');
    }

    start(options = {}) {
        this.isCancelled = false;
        this.currentProgress = 0;
        this.updateProgress(0);
        
        if (this.loader) {
            this.loader.classList.remove('hidden');
            this.loader.style.opacity = '1';
            this.loader.style.visibility = 'visible';
        }

        if (options.showCancel && this.cancelBtn) {
            setTimeout(() => {
                if (this.cancelBtn) this.cancelBtn.classList.add('visible');
            }, options.timeout || 5000);
        }

        this.animateProgress();
        return this;
    }

    updateProgress(percent, message = null) {
        if (percent !== null) {
            this.targetProgress = Math.min(100, Math.max(0, percent));
        }
        
        if (message && this.tagline) {
            this.tagline.style.opacity = '0';
            setTimeout(() => {
                if (this.tagline) {
                    this.tagline.textContent = message;
                    this.tagline.style.opacity = '1';
                }
            }, 150);
        }
    }

    animateProgress() {
        if (this.isCancelled) return;
        
        const diff = this.targetProgress - this.currentProgress;
        
        if (Math.abs(diff) > 0.1) {
            this.currentProgress += diff * 0.1;
            
            if (this.progressFill) {
                this.progressFill.style.width = `${this.currentProgress}%`;
            }
            if (this.progressText) {
                this.progressText.textContent = `${Math.round(this.currentProgress)}%`;
            }
        }
        
        this.animationFrame = requestAnimationFrame(() => this.animateProgress());
    }

    /**
     * แก้ไขบั๊ก: ใช้การเพิ่ม DOM element แทน ::after เพื่อให้ติ๊กถูกแสดงแน่นอน
     */
    setStep(step, status = 'active') {
        const stepEl = document.querySelector(`.loader-step[data-step="${step}"]`);
        if (!stepEl) return;

        const dot = stepEl.querySelector('.step-dot');

        if (status === 'active') {
            // ลบ active จากทุกตัวก่อน
            document.querySelectorAll('.loader-step').forEach(el => {
                el.classList.remove('active');
            });
            stepEl.classList.add('active');
            stepEl.classList.remove('completed');
            
            // ลบติ๊กถูกถ้ามี
            if (dot) {
                const check = dot.querySelector('.step-check');
                if (check) check.remove();
            }
        } else if (status === 'completed') {
            stepEl.classList.remove('active');
            stepEl.classList.add('completed');
            
            // เพิ่มติ๊กถูกเข้าไปใน step-dot แบบ DOM element
            if (dot && !dot.querySelector('.step-check')) {
                const check = document.createElement('span');
                check.className = 'step-check';
                check.innerHTML = '✓';
                check.style.cssText = `
                    color: white;
                    font-size: 0.75rem;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 100%;
                    position: absolute;
                    top: 0;
                    left: 0;
                    animation: checkPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                `;
                dot.style.position = 'relative'; // สำคัญ: ต้องมี relative สำหรับ absolute child
                dot.appendChild(check);
            }
            
            // ทำให้ connector เส้นต่อไปเป็นสีฟ้า (แก้ไขบั๊กตรงนี้)
            const nextConnector = stepEl.nextElementSibling;
            if (nextConnector && nextConnector.classList.contains('loader-connector')) {
                nextConnector.classList.add('completed');
                
                // Activate next step อัตโนมัติ
                const nextStep = nextConnector.nextElementSibling;
                if (nextStep?.classList.contains('loader-step') && !nextStep.classList.contains('completed')) {
                    setTimeout(() => {
                        nextStep.classList.add('active');
                    }, 300);
                }
            }
        }

        if (this.stepMessages[step] && status === 'active') {
            this.updateProgress(null, this.stepMessages[step]);
        }
    }

    hide(delay = 500) {
        this.updateProgress(100, 'พร้อมใช้งาน!');
        this.setStep('ready', 'completed');

        setTimeout(() => {
            if (this.loader) {
                this.loader.classList.add('loader-fade-out');
                
                setTimeout(() => {
                    this.loader.classList.add('hidden');
                    this.loader.classList.remove('loader-fade-out');
                    this.reset();
                }, 500);
            }
        }, delay);
    }

    showError(message = 'เกิดข้อผิดพลาด') {
        this.updateProgress(100, message);
        if (this.tagline) {
            this.tagline.style.color = '#ef4444';
            this.tagline.textContent = message;
        }
        
        if (this.progressFill) {
            this.progressFill.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
        }
        
        if (this.cancelBtn) {
            this.cancelBtn.textContent = 'ลองใหม่';
            this.cancelBtn.classList.add('visible');
            this.cancelBtn.onclick = () => window.location.reload();
        }
    }

    cancel() {
        this.isCancelled = true;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        this.hide(0);
    }

    reset() {
        this.currentProgress = 0;
        this.targetProgress = 0;
        this.isCancelled = false;
        
        if (this.progressFill) {
            this.progressFill.style.width = '0%';
            this.progressFill.style.background = '';
        }
        if (this.progressText) this.progressText.textContent = '0%';
        if (this.tagline) {
            this.tagline.textContent = 'กำลังโหลดระบบ...';
            this.tagline.style.color = '';
        }
        
        // รีเซ็ตทุก steps
        document.querySelectorAll('.loader-step').forEach(el => {
            el.classList.remove('active', 'completed');
            const dot = el.querySelector('.step-dot');
            if (dot) {
                dot.style.background = '';
                dot.style.borderColor = '';
                const check = dot.querySelector('.step-check');
                if (check) check.remove();
            }
        });
        
        document.querySelectorAll('.loader-connector').forEach(el => {
            el.classList.remove('completed');
        });
        
        document.querySelector('.loader-step[data-step="auth"]')?.classList.add('active');
        
        if (this.cancelBtn) {
            this.cancelBtn.classList.remove('visible');
            this.cancelBtn.textContent = 'ยกเลิก';
            this.cancelBtn.onclick = () => this.cancel();
        }
    }
}

// ==========================================
// Utility Functions (Global ใช้ได้ทุกหน้า)
// ==========================================

export function cancelLoading() {
    const lm = window.globalLoadingManager;
    if (lm) lm.cancel();
}

export function updateLoadingProgress(percent, message) {
    const lm = window.globalLoadingManager;
    if (lm) lm.updateProgress(percent, message);
}

export function setLoadingStep(step, status) {
    const lm = window.globalLoadingManager;
    if (lm) lm.setStep(step, status);
}

export function hideLoading(delay) {
    const lm = window.globalLoadingManager;
    if (lm) lm.hide(delay);
}

export function showInlineLoader(containerId, text = 'กำลังโหลด...') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let loader = container.querySelector('.inline-loader');
    if (!loader) {
        loader = document.getElementById('inlineLoader')?.cloneNode(true);
        if (loader) {
            loader.id = '';
            loader.classList.remove('hidden');
            container.appendChild(loader);
        }
    }
    
    if (loader && text) {
        const textEl = loader.querySelector('.inline-loader-text');
        if (textEl) textEl.textContent = text;
    }
    
    return loader;
}

export function hideInlineLoader(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const loader = container.querySelector('.inline-loader');
    if (loader) loader.remove();
}

export function showSkeletonLoading(containerId, count = 4) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const template = document.getElementById('skeletonCardTemplate');
    if (!template) return;
    
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const clone = template.content.cloneNode(true);
        container.appendChild(clone);
    }
}

// ==========================================
// สำหรับหน้าที่ไม่ใช่ Module (ใช้ script tag ธรรมดา)
// ==========================================
if (typeof window !== 'undefined') {
    window.LoadingManager = LoadingManager;
    window.cancelLoading = cancelLoading;
    window.updateLoadingProgress = updateLoadingProgress;
    window.setLoadingStep = setLoadingStep;
    window.hideLoading = hideLoading;
    window.showInlineLoader = showInlineLoader;
    window.hideInlineLoader = hideInlineLoader;
    window.showSkeletonLoading = showSkeletonLoading;
}
