// ===== GLOBAL VARIABLES =====
// FIX: Variable ka naam (API_BASE) aur URL (Ngrok) dono fix kar diye
const API_BASE = "https://ungregariously-unbangled-braxton.ngrok-free.dev/api"; // <--- YAHAN FIX KIYA!
let currentUser = null;
let authToken = localStorage.getItem('authToken'); // Token ko load kiya
let currentResources = [];

// ===== 🚀 NAYA TOKEN REFRESH LOGIC 🚀 =====

/**
 * Yeh function naya Access Token laane ki koshish karta hai.
 */
async function refreshToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
        console.log('No refresh token available. Logging out.');
        logout();
        return false;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/token/refresh/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 'refresh': refreshToken })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('authToken', data.access); // Naya token save kiya
            authToken = data.access; // Global variable update kiya
            console.log('Token refreshed successfully.');
            return true;
        } else {
            // Agar refresh token bhi expire ho gaya hai, toh logout
            console.log('Refresh token expired or invalid. Logging out.');
            logout();
            return false;
        }
    } catch (error) {
        console.error('Error refreshing token:', error);
        logout();
        return false;
    }
}

/**
 * Yeh naya fetch 'wrapper' hai.
 * Yeh har request ko token ke saath bhejta hai.
 * Agar 401 (Expired) error aata hai, toh yeh 'refreshToken()' ko call karta hai
 * aur request ko naye token ke saath dobara try karta hai.
 */
async function fetchWithAuth(url, options = {}) {
    // 1. Agar authToken hai, toh use header mein daalo
    if (authToken) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${authToken}`
        };
    }

    // 2. Request ko try karo
    let response = await fetch(url, options);

    // 3. Check karo ki token expire toh nahi hua (401 Error)
    if (response.status === 401 && localStorage.getItem('refreshToken')) {
        console.log('Access token expired. Attempting to refresh...');
        
        // 4. Token refresh karne ki koshish karo
        const refreshSuccess = await refreshToken();

        if (refreshSuccess) {
            // 5. Agar token naya mil gaya, toh header update karke request dobara bhejo
            options.headers['Authorization'] = `Bearer ${authToken}`; // Naya token
            console.log('Retrying request with new token...');
            response = await fetch(url, options); // Retry
        } else {
            // 6. Agar refresh fail hua, toh logout() pehle hi ho chuka hai
            return response; // Original fail response bhej do
        }
    }

    return response;
}
// ===== 🚀 REFRESH LOGIC END 🚀 =====


// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
});

async function initializeApp() {
    // Email verification check
    const params = new URLSearchParams(window.location.search);
    const token = params.get('verify_token');
    
    if (token) {
        await verifyEmailToken(token);
        // Clean URL (token hata do)
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check authentication status (Refresh Fix)
    // Ab yeh logic aur bhi behtar kaam karega 'fetchWithAuth' ke saath
    if (authToken) {
        // Agar token hai, toh profile fetch karne ki koshish karo
        await fetchUserProfile(); 
    } else {
        // Agar token nahi hai, toh logged-out UI dikhao
        updateNavForLoggedInUser();
    }

    // Load initial data
    loadResources(); // <-- Ab yeh API se data layega
    loadSubjects();  // <-- Ab yeh API se data layega

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
            loadResources();
        }
    });
    if (searchButton) {
        searchButton.addEventListener('click', function(e) {
            e.preventDefault();
            loadResources();
        });
    }

    // Filters
    document.getElementById('subjectFilter').addEventListener('change', loadResources);
    document.getElementById('typeFilter').addEventListener('change', loadResources);
    document.getElementById('yearFilter').addEventListener('change', loadResources);
    document.getElementById('semesterFilter').addEventListener('change', loadResources);

    // Modals
    setupModalEvents();

    // Smooth scroll
    setupSmoothScroll();
    
    // Contact Form
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', handleContactForm);
    }
}

// ===== AUTHENTICATION FUNCTIONS =====
async function verifyEmailToken(token) {
    try {
        // Is request mein token nahi chahiye, toh normal fetch use karenge
        
        // --- YEH HAI FIX #2 ---
        const response = await fetch(`${API_BASE}/auth/verify-email/`, { // <-- YEH FIX HO GAYA
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ token: token })
        });
        // --- YAHAN TAK ---
        
        const data = await response.json();
        if (response.ok) {
            showNotification(data.message, 'success');
            openLoginModal(); // Success par login modal kholo
        } else {
            showNotification(data.error || 'Verification failed.', 'error');
        }
    } catch (error) {
        console.error('Verification error:', error);
        showNotification('An error occurred during verification.', 'error');
    }
}


async function fetchUserProfile() {
    // YEH FUNCTION AB PAGE REFRESH PAR LOGIN FIX KAREGA
    if (!authToken) {
        updateNavForLoggedInUser();
        return;
    }
    try {
        // === FIX ===
        // Ab 'fetchWithAuth' use karenge
        const response = await fetchWithAuth(`${API_BASE}/auth/profile/`);
        // === END FIX ===

        if (response.ok) {
            currentUser = await response.json();
            updateNavForLoggedInUser();
        } else {
            console.error('Token invalid, logging out.');
            // Agar token invalid/expired hai, toh fetchWithAuth 
            // ne pehle hi refreshToken() call kiya hoga.
            // Agar woh bhi fail hua, toh logout() ho chuka hoga.
            // Hum yahaan ek baar aur call kar lete hain, safe side ke liye.
            logout();
        }
    } catch (error) {
        console.error('Error fetching profile:', error);
        logout();
    }
}

function updateNavForLoggedInUser() {
    const navAuth = document.querySelector('.nav-auth');
    if (currentUser && navAuth) {
        const profilePicUrl = currentUser.profile_pic;
        let profileElement = '';
        if (profilePicUrl) {
            // Cache-busting parameter add kiya taaki nayi pic load ho
            profileElement = `<img src="${profilePicUrl}?v=${new Date().getTime()}" alt="Profile Picture" class="nav-profile-pic">`;
        } else {
            const firstName = currentUser.first_name || 'User';
            const initial = firstName.charAt(0).toUpperCase();
            profileElement = `<div class="nav-profile-initial">${initial}</div>`;
        }
        navAuth.innerHTML = `
            <button class="btn-primary" onclick="openUploadModal()">
                <i class="fas fa-upload"></i> Upload Resource
            </button>
            <div class="nav-user-profile" onclick="toggleProfileDropdown(event)">
                ${profileElement}
            </div>
            <div class="profile-dropdown-menu" id="profileDropdown">
                <div class="dropdown-header">
                    <div class="dropdown-profile-icon">${profileElement}</div>
                    <div class="dropdown-profile-info">
                        <strong>${currentUser.first_name || 'User'} ${currentUser.last_name || ''}</strong>
                        <span>${currentUser.email}</span>
                    </div>
                </div>
                <a href="#" class="dropdown-item" onclick="openProfileModal(event)">
                    <i class="fas fa-cog"></i> Settings
                </a>
                <a href="#" class="dropdown-item" onclick="openHistoryModal(event)">
                    <i class="fas fa-history"></i> History
                </a>
                <div class="dropdown-divider"></div>
                <a href="#" class="dropdown-item logout-btn" onclick="logout(event)">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </a>
            </div>
        `;
    } else if (navAuth) {
        navAuth.innerHTML = `
            <button class="btn-login" onclick="openLoginModal()">
                <i class="fas fa-sign-in-alt"></i> Login
            </button>
            <button class="btn-register" onclick="openRegisterModal()">
                <i class="fas fa-user-plus"></i> Register
            </button>
        `;
    }
}

function logout(event) {
    if(event) event.preventDefault();
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    currentUser = null;
    authToken = null;
    updateNavForLoggedInUser(); 
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) dropdown.classList.remove('active');
    showNotification('You have been logged out.', 'info');
}

// ===== MODAL FUNCTIONS =====
function setupModalEvents() {
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
    
    loadHistory();
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

// ===== NAYE DROPDOWN FUNCTIONS =====
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

// ===== FORM HANDLERS =====
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<div class="loading"></div> Logging in...';
    submitBtn.disabled = true;

    try {
        // Login request ko token nahi chahiye
        const response = await fetch(`${API_BASE}/auth/login/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('authToken', data.access);
            localStorage.setItem('refreshToken', data.refresh);
            authToken = data.access;
            currentUser = data.user;
            updateNavForLoggedInUser();
            closeLoginModal();
            showNotification('Login successful! Welcome back.', 'success');
            loadResources();
        } else {
            const errorMsg = data.detail || 'Login failed. Please check your credentials.';
            showNotification(errorMsg, 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('Login failed. Please try again.', 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const formData = {
        first_name: document.getElementById('regFirstName').value,
        last_name: document.getElementById('regLastName').value,
        email: document.getElementById('regEmail').value,
        password: document.getElementById('regPassword').value,
        role: document.getElementById('regRole').value
    };
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<div class="loading"></div> Creating account...';
    submitBtn.disabled = true;

    try {
        // Register request ko token nahi chahiye
        const response = await fetch(`${API_BASE}/auth/register/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(formData)
        });
        const data = await response.json();
        if (response.status === 201) {
            showNotification(data.message, 'success'); // "Please check your email"
            closeRegisterModal();
            e.target.reset();
        } else {
            const errorMsg = data.email ? data.email[0] :
                data.password ? data.password[0] :
                data.error ? data.error :
                'Registration failed. Please try again.';
            showNotification(errorMsg, 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showNotification('Registration failed. Please try again.', 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}


async function populateUploadFormSubjects() {
    const select = document.getElementById('uploadSubject');
    select.innerHTML = '<option value="">Loading subjects...</option>';
    try {
        // Yeh request public hai (AllowAny), toh normal fetch theek hai
        const response = await fetch(`${API_BASE}/resources/subjects/`);
        if (!response.ok) throw new Error('Failed to fetch subjects');
        
        const subjects = await response.json();
        
        if(subjects.length === 0) {
            select.innerHTML = '<option value="">No subjects found. Please add one in admin.</option>';
            return;
        }

        select.innerHTML = '<option value="">Select a subject...</option>';
        select.innerHTML += subjects.map(subject => 
            `<option value="${subject.id}">${subject.name} ${subject.semester ? '- Sem ' + subject.semester : ''}</option>`
        ).join('');
    } catch (error) {
        console.error('Error loading subjects for upload:', error);
        select.innerHTML = '<option value="">Could not load subjects</option>';
    }
}

async function handleUpload(e) {
    e.preventDefault();
    
    const title = document.getElementById('uploadTitle').value;
    const subjectId = document.getElementById('uploadSubject').value;
    const type = document.getElementById('uploadType').value;
    const file = document.getElementById('uploadFile').files[0];
    const errorDiv = document.getElementById('uploadErrors');
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    // Validation
    if (!file) {
        errorDiv.textContent = 'Please select a PDF file.';
        errorDiv.style.display = 'block';
        return;
    }
    if (file.type !== 'application/pdf') {
        errorDiv.textContent = 'Only PDF files are allowed.';
        errorDiv.style.display = 'block';
        return;
    }
    if (!subjectId) {
        errorDiv.textContent = 'Please select a subject.';
        errorDiv.style.display = 'block';
        return;
    }
    errorDiv.style.display = 'none';

    submitBtn.innerHTML = '<div class="loading"></div> Uploading...';
    submitBtn.disabled = true;

    const formData = new FormData();
    formData.append('title', title);
    // <-- IMPORTANT: use subject_id to match backend serializer
    formData.append('subject_id', subjectId);
    formData.append('resource_type', type);
    formData.append('pdf_file', file);

    try {
        const response = await fetchWithAuth(`${API_BASE}/resources/files/`, {
            method: 'POST',
            body: formData
        });

        if (response.status === 201) {
            showNotification('Resource uploaded! It will be visible after admin approval.', 'success');
            closeUploadModal();
            e.target.reset();
            loadResources();
        } else {
            const data = await response.json();
            let errorMsg = 'Upload failed. Please try again.';
            if (data.title) errorMsg = data.title[0];
            else if (data.subject) errorMsg = data.subject[0];
            else if (data.pdf_file) errorMsg = data.pdf_file[0];
            
            errorDiv.textContent = errorMsg;
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Upload error:', error);
        errorDiv.textContent = 'An error occurred. Please check your connection and try again.';
        errorDiv.style.display = 'block';
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}


async function handleProfileUpdate(e) {
    e.preventDefault();
    
    const firstName = document.getElementById('profileFirstName').value;
    const lastName = document.getElementById('profileLastName').value;
    const file = document.getElementById('profilePic').files[0];
    const errorDiv = document.getElementById('profileErrors');

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<div class="loading"></div> Saving...';
    submitBtn.disabled = true;
    errorDiv.style.display = 'none';

    const formData = new FormData();
    formData.append('first_name', firstName);
    formData.append('last_name', lastName);
    
    if (file) {
        if (!['image/jpeg', 'image/png'].includes(file.type)) {
             errorDiv.textContent = 'Only JPG or PNG files are allowed.';
             errorDiv.style.display = 'block';
             submitBtn.innerHTML = originalText;
             submitBtn.disabled = false;
             return;
        }
        formData.append('profile_pic', file);
    }

    try {
        // === FIX ===
        // 'fetchWithAuth' use karenge
        const response = await fetchWithAuth(`${API_BASE}/auth/profile/update/`, {
            method: 'PATCH',
            body: formData
        });
        // === END FIX ===

        if (response.ok) {
            const updatedUser = await response.json();
            currentUser = updatedUser; 
            updateNavForLoggedInUser();
            showNotification('Profile updated successfully!', 'success');
            closeProfileModal();
        } else {
            const data = await response.json();
            errorDiv.textContent = data.detail || 'Failed to update profile.';
            errorDiv.style.display = 'block';
        }

    } catch (error) {
        console.error('Profile update error:', error);
        errorDiv.textContent = 'An error occurred. Please try again.';
        errorDiv.style.display = 'block';
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}


// ===== RESOURCE MANAGEMENT (API se connected) =====
async function loadResources() {
    const subjectFilter = document.getElementById('subjectFilter').value;
    const typeFilter = document.getElementById('typeFilter').value;
    const semesterFilter = document.getElementById('semesterFilter').value;
    const searchInput = document.getElementById('searchInput').value;

    showLoading('resourcesGrid');

    try {
        let url = `${API_BASE}/resources/files/`;
        const params = new URLSearchParams();

        if (subjectFilter) params.append('subject', subjectFilter);
        if (typeFilter) params.append('type', typeFilter);
        if (semesterFilter) params.append('semester', semesterFilter);
        if (searchInput) params.append('search', searchInput); 

        if (params.toString()) {
            url += `?${params.toString()}`;
        }

        // Yeh request public hai (AllowAny), toh normal fetch theek hai
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch resources');
        }
        const resources = await response.json();
        currentResources = resources;
        displayResources(resources);

    } catch (error) {
        console.error('Error loading resources:', error);
        showError('resourcesGrid', 'Failed to load resources. Please try again.');
    }
}


function displayResources(resources) {
    const grid = document.getElementById('resourcesGrid');

    if (resources.length === 0) {
        grid.innerHTML = `
            <div class="no-resources">
                <i class="fas fa-inbox"></i>
                <h3>No Resources Found</h3>
                <p>Try adjusting your filters or search terms. (Ya admin panel se kuch upload karo)</p>
                <button class="btn-primary" onclick="clearFilters()">Clear All Filters</button>
            </div>
        `;
        return;
    }

    grid.innerHTML = resources.map(resource => {
        const subjectName = resource.subject ? resource.subject.name : 'Unknown Subject';
        const year = new Date(resource.uploaded_at).getFullYear();
        const uploaderName = resource.uploaded_by || 'Admin';

        return `
        <div class="resource-card" data-id="${resource.id}">
            <div class="resource-type type-${resource.resource_type}">
                <i class="${getTypeIcon(resource.resource_type)}"></i> 
                ${getTypeDisplayName(resource.resource_type)}
            </div>
            <h3 class="resource-title">${escapeHtml(resource.title)}</h3>
            <div class="resource-meta">
                <span class="meta-item">
                    <i class="fas fa-book-open"></i> ${subjectName}
                </span>
                <span class="meta-item">
                    <i class="fas fa-calendar"></i> ${year}
                </span>
                <span class="meta-item">
                    <i class="fas fa-user-graduate"></i> ${uploaderName}
                </span>
            </div>
            <p class="resource-description">
                ${getResourceDescription(resource)}
            </p>
            <div class="resource-actions">
                <button class="download-btn" onclick="downloadResource(${resource.id}, '${resource.pdf_file}')" ${!authToken ? 'disabled' : ''}>
                    <i class="fas fa-download"></i> 
                    ${authToken ? 'Download PDF' : 'Login to Download'}
                </button>
                <button class="preview-btn" onclick="previewResource('${resource.pdf_file}')">
                    <i class="fas fa-eye"></i> Preview
                </button>
            </div>
        </div>
    `}).join('');
}

function getTypeIcon(type) {
    const icons = {
        'notes': 'fas fa-book',
        'question_paper': 'fas fa-file-pdf',
        'syllabus': 'fas fa-clipboard-list'
    };
    return icons[type] || 'fas fa-file';
}

function getTypeDisplayName(type) {
    const typeMap = {
        'notes': 'Handwritten Notes',
        'question_paper': 'Question Paper',
        'syllabus': 'Syllabus'
    };
    return typeMap[type] || type.replace('_', ' ').toUpperCase();
}

function getResourceDescription(resource) {
    const subjectName = resource.subject ? resource.subject.name : 'this subject';
    const baseDescription = `Download this ${getTypeDisplayName(resource.resource_type).toLowerCase()} for ${subjectName}`;
    return `${baseDescription}.`;
}

async function loadSubjects() {
    try {
        // Yeh public hai, normal fetch
        const response = await fetch(`${API_BASE}/resources/subjects/`);
        if (response.ok) {
            const subjects = await response.json();
            populateSubjectFilter(subjects);
            populateUploadFormSubjects(subjects); // NAYA: Upload form ko bhi bharo
        }
    } catch (error) {
        console.error('Error loading subjects:', error);
    }
}

function populateSubjectFilter(subjects) {
    const subjectSelect = document.getElementById('subjectFilter');
    if (!subjectSelect) return;
    
    subjectSelect.innerHTML = '<option value="">All Subjects</option>' +
        subjects.map(subject =>
            `<option value="${subject.id}">${subject.name} ${subject.semester ? '- Sem ' + subject.semester : ''}</option>`
        ).join('');
}

// Upload form ke subject dropdown ko bharne ke liye
function populateUploadFormSubjects(subjects) {
    const select = document.getElementById('uploadSubject');
    if (!select) return;
    
    if(subjects && subjects.length > 0) {
        select.innerHTML = '<option value="">Select a subject...</option>';
        select.innerHTML += subjects.map(subject => 
            `<option value="${subject.id}">${subject.name} ${subject.semester ? '- Sem ' + subject.semester : ''}</option>`
        ).join('');
    } else {
        select.innerHTML = '<option value="">Loading subjects...</option>';
        // Agar subjects nahi hain, toh dobara fetch karo (fallback)
        if(!subjects) {
             loadSubjects();
        }
    }
}


// ===== SEARCH AND FILTER =====
function searchResources() {
    // Is function ki ab zaroorat nahi
}

function clearFilters() {
    document.getElementById('subjectFilter').value = '';
    document.getElementById('typeFilter').value = '';
    document.getElementById('yearFilter').value = '';
    document.getElementById('semesterFilter').value = '';
    document.getElementById('searchInput').value = '';
    loadResources();
}

function loadMoreResources() {
    showNotification('Loading more resources...', 'info');
    loadResources();
}

// ===== RESOURCE ACTIONS =====
async function downloadResource(resourceId, pdfUrl) {
    if (!authToken) {
        showNotification('Please login to download resources', 'warning');
        openLoginModal();
        return;
    }
    
    try {
        // === FIX ===
        // 'fetchWithAuth' use karenge
        await fetchWithAuth(`${API_BASE}/resources/files/${resourceId}/download/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        // === END FIX ===
    } catch (error) {
        console.error('Error logging download:', error);
    }
    
    window.open(pdfUrl, '_blank');
}

function previewResource(pdfUrl) {
    // Option A: open in new tab
    window.open(pdfUrl, '_blank');
  
    // Option B: show in modal using iframe (if you have modal)
    // document.getElementById('pdfPreviewFrame').src = pdfUrl;
    // open modal...
  }

async function loadHistory() {
    const body = document.getElementById('historyModalBody');
    body.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Loading history...</p>
        </div>
    `;

    try {
        // === FIX ===
        // 'fetchWithAuth' use karenge
        const response = await fetchWithAuth(`${API_BASE}/resources/history/`);
        // === END FIX ===
        
        if (!response.ok) {
            throw new Error('Failed to fetch history');
        }
        
        const historyItems = await response.json();
        
        if (historyItems.length === 0) {
            body.innerHTML = `
                <div class="no-resources" style="text-align: center; padding: 2rem; color: var(--text-gray);">
                    <i class="fas fa-history" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                    <h3>No Download History</h3>
                    <p>You haven't downloaded any resources yet.</p>
                </div>
            `;
            return;
        }

        body.innerHTML = historyItems.map(item => {
            const resource = item.resource;
            const downloadTime = new Date(item.downloaded_at).toLocaleString();
            
            return `
            <div class="history-item">
                <div class="history-item-icon">
                    <i class="${getTypeIcon(resource.resource_type)}"></i>
                </div>
                <div class="history-item-details">
                    <h4>${escapeHtml(resource.title)}</h4>
                    <p>${escapeHtml(resource.subject.name)} | Downloaded on: ${downloadTime}</p>
                </div>
                <div class="history-item-action">
                    <button class="btn-secondary" style="padding: 0.5rem 1rem;" onclick="downloadResource(${resource.id}, '${resource.pdf_file}')">
                        <i class="fas fa-redo"></i> Download Again
                    </button>
                </div>
            </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading history:', error);
        body.innerHTML = `
            <div class="error-state" style="text-align: center; padding: 2rem; color: var(--error);">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to load your history. Please try again.</p>
            </div>
        `;
    }
}


// ===== NAVIGATION AND UI =====
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

// ===== UTILITY FUNCTIONS =====
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

// ===== CONTACT FORM =====
async function handleContactForm(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<div class="loading"></div> Sending...';
    submitBtn.disabled = true;

    const formData = {
        name: document.getElementById('contactName').value,
        email: document.getElementById('contactEmail').value,
        subject: document.getElementById('contactSubject').value,
        message: document.getElementById('contactMessage').value,
    };

    try {
        // Yeh public hai, normal fetch
        const response = await fetch(`${API_BASE}/auth/contact/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (response.ok) {
            showNotification(data.message || 'Message sent successfully!', 'success');
            form.reset();
        } else {
            showNotification(data.error || 'Failed to send message.', 'error');
        }
    } catch (error) {
        console.error('Contact form error:', error);
        showNotification('An error occurred. Please try again.', 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
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
