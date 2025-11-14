// ===== GLOBAL VARIABLES =====
// FIX: Variable ka naam (API_BASE) aur URL (Ngrok) dono fix kar diye
const API_BASE = "https://ungregariously-unbangled-braxton.ngrok-free.dev/api"; // <--- YAHAN FIX KIYA!
let currentUser = null;
let authToken = localStorage.getItem('authToken'); // Token ko load kiya
let currentResources = [];

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
});

async function initializeApp() {
    // Email verification check
    const params = new URLSearchParams(window.location.search);
    const token = params.get('verify_token');
    
    if (token) {
        await verifyEmailToken(token); // Yeh function auth.js se aayega
        // Clean URL (token hata do)
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check authentication status (Refresh Fix)
    if (authToken) {
        await fetchUserProfile(); // Yeh function auth.js se aayega
    } else {
        updateNavForLoggedInUser(); // Yeh function auth.js se aayega
    }

    // Load initial data
    loadResources(); // Yeh function resources.js se aayega
    loadSubjects();  // Yeh function resources.js se aayega

    // Setup event listeners
    setupEventListeners();

    // Initialize scroll to top button
    initScrollToTop();
    
    // Naye dropdown ke liye listener setup karein
    setupDropdownListener();
}

function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.querySelector('.btn-search');
    
    searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            loadResources(); // Yeh function resources.js se aayega
        }
    });
    if (searchButton) {
        searchButton.addEventListener('click', function(e) {
            e.preventDefault();
            loadResources(); // Yeh function resources.js se aayega
        });
    }

    // Filters (yeh resources.js se 'loadResources' ko call karenge)
    document.getElementById('subjectFilter').addEventListener('change', loadResources);
    document.getElementById('typeFilter').addEventListener('change', loadResources);
    document.getElementById('yearFilter').addEventListener('change', loadResources);
    document.getElementById('semesterFilter').addEventListener('change', loadResources);

    // Modals (yeh auth.js aur resources.js se functions ko call karenge)
    setupModalEvents();

    // Smooth scroll
    setupSmoothScroll();
    
    // Contact Form
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', handleContactForm); // Yeh function auth.js se aayega
    }
}

// ===== MODAL FUNCTIONS (Core UI) =====
function setupModalEvents() {
    // Yeh functions auth.js aur resources.js mein hain
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('uploadForm').addEventListener('submit', handleUpload);
    document.getElementById('profileForm').addEventListener('submit', handleProfileUpdate);

    window.addEventListener('click', function (event) {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (event.target === modal) {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        });
    });
}

function openLoginModal() {
    document.getElementById('loginModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}
function closeLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}
function openRegisterModal() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('registerModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}
function closeRegisterModal() {
    document.getElementById('registerModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

async function openUploadModal() {
    if (!authToken) {
        showNotification('Please login to upload resources', 'warning');
        openLoginModal();
        return;
    }
    // Yeh function ab resources.js mein hai
    await populateUploadFormSubjects(); 
    document.getElementById('uploadModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeUploadModal() {
    document.getElementById('uploadModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function openProfileModal(event) {
    if(event) event.preventDefault();
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) dropdown.classList.remove('active');
    
    document.getElementById('profileFirstName').value = currentUser.first_name || '';
    document.getElementById('profileLastName').value = currentUser.last_name || '';
    document.getElementById('profileErrors').style.display = 'none';
    document.getElementById('profilePic').value = null;
    
    document.getElementById('profileModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeProfileModal() {
    document.getElementById('profileModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function openHistoryModal(event) {
    if(event) event.preventDefault();
    
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) dropdown.classList.remove('active');

    document.getElementById('historyModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    loadHistory(); // Yeh function resources.js mein hai
}

function closeHistoryModal() {
    document.getElementById('historyModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function switchToRegister() {
    closeLoginModal();
    openRegisterModal();
}
function switchToLogin() {
    closeRegisterModal();
    openLoginModal();
}

// ===== NAVIGATION AND UI (Core UI) =====
function toggleProfileDropdown(event) {
    event.stopPropagation();
    document.getElementById('profileDropdown').classList.toggle('active');
}
function setupDropdownListener() {
    document.addEventListener('click', function(event) {
        const dropdown = document.getElementById('profileDropdown');
        const profileIcon = document.querySelector('.nav-user-profile');
        if (dropdown && dropdown.classList.contains('active')) {
            if (!dropdown.contains(event.target) && !profileIcon.contains(event.target)) {
                dropdown.classList.remove('active');
            }
        }
    });
}

function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

function scrollToResources() {
    document.getElementById('resources').scrollIntoView({ behavior: 'smooth' });
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initScrollToTop() {
    const scrollBtn = document.getElementById('scrollToTop');
    if (!scrollBtn) return; 

    window.onscroll = () => {
        if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) {
            scrollBtn.style.display = "block";
        } else {
            scrollBtn.style.display = "none";
        }
    };
}

function toggleMobileMenu() {
    const navMenu = document.getElementById('navMenu');
    navMenu.classList.toggle('active');
}

// ===== UTILITY FUNCTIONS (Core UI) =====
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function showLoading(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading resources...</p>
        </div>
    `;
}

function showError(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        <div class="error-state">
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Something went wrong</h3>
            <p>${message}</p>
            <button class="btn-primary" onclick="loadResources()">Try Again</button>
        </div>
    `;
}

function showNotification(message, type = 'info') {
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${getNotificationIcon(type)}"></i>
            <span>${message}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    document.body.appendChild(notification);
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

function getNotificationIcon(type) {
    const icons = {'success': 'fa-check-circle', 'error': 'fa-exclamation-circle', 'warning': 'fa-exclamation-triangle', 'info': 'fa-info-circle'};
    return icons[type] || 'fa-info-circle';
}

// ===== DYNAMICALLY INJECTED STYLES =====
const additionalStyles = `
    .loading-state, .error-state, .no-resources { grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-gray); }
    .loading-spinner { width: 40px; height: 40px; border: 4px solid var(--border-color); border-top-color: var(--primary-blue); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
    .notification { position: fixed; top: 100px; right: 20px; background: white; padding: 1rem; border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); border-left: 4px solid var(--primary-blue); z-index: 10000; max-width: 400px; animation: slideInRight 0.3s ease; }
    .notification-success { border-left-color: var(--success); }
    .notification-error { border-left-color: var(--error); }
    .notification-warning { border-left-color: var(--warning); }
    .notification-info { border-left-color: var(--info); }
    .notification-content { display: flex; align-items: center; gap: 0.75rem; }
    .notification-content i { font-size: 1.25rem; }
    .notification-success i { color: var(--success); }
    .notification-error i { color: var(--error); }
    .notification-warning i { color: var(--warning); }
    .notification-info i { color: var(--info); }
    .notification-close { background: none; border: none; color: var(--text-light); cursor: pointer; padding: 0.25rem; margin-left: auto; }
    @keyframes slideInRight { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
    .resource-card .download-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    
    /* --- YEH BUTTON FIX HAI --- */
    .scroll-to-top { 
        position: fixed; 
        bottom: 30px; 
        right: 100px; /* AI icon (right: 30px) se alag kiya */
        width: 50px; 
        height: 50px; 
        background: var(--gradient-primary); 
        color: white; 
        border: none; 
        border-radius: 50%; 
        display: none; 
        align-items: center; 
        justify-content: center; 
        font-size: 1.25rem; 
        cursor: pointer; 
        box-shadow: var(--shadow-lg); 
        z-index: 999; 
        transition: all 0.3s ease; 
    }
    .scroll-to-top:hover { transform: translateY(-5px); }
    
    @media (max-width: 768px) {
        .notification { top: 80px; left: 20px; right: 20px; max-width: none; }
        .scroll-to-top { 
            width: 40px; 
            height: 40px; 
            font-size: 1rem; 
            bottom: 20px; 
            right: 80px; /* Mobile par bhi AI icon se alag kiya */
        }
    }
`;
const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);
