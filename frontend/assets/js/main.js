// ===== GLOBAL VARIABLES =====
const API_BASE = (window.API_BASE && window.API_BASE.trim())
  ? window.API_BASE.trim()
  : 'https://ungregariously-unbangled-braxton.ngrok-free.dev/api'; // ngrok backend
let currentUser = null;
let authToken = localStorage.getItem('authToken') || null;
let currentResources = [];

// ===== UTIL: Safe DOM getter =====
function $id(id) {
  return document.getElementById(id) || null;
}

// ===== 🚀 TOKEN REFRESH LOGIC (robust) 🚀 =====
async function refreshToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    console.log('No refresh token found; logging out.');
    logout();
    return false;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken })
    });

    if (!res.ok) {
      console.warn('Refresh token invalid or expired:', res.status);
      logout();
      return false;
    }

    const data = await res.json();
    // backend might return { access } or { authToken } sometimes, handle both
    const newAccess = data.access || data.token || data.authToken;
    if (newAccess) {
      localStorage.setItem('authToken', newAccess);
      authToken = newAccess;
      console.log('Token refreshed successfully.');
      return true;
    } else {
      console.warn('Refresh response did not contain access token.');
      logout();
      return false;
    }
  } catch (err) {
    console.error('Error refreshing token:', err);
    logout();
    return false;
  }
}

/**
 * fetchWithAuth:
 * - Automatically adds Authorization header if token present
 * - Retries once after refresh if 401
 * - Preserves FormData handling (don't set Content-Type)
 */
async function fetchWithAuth(url, options = {}) {
  options = { method: 'GET', headers: {}, ...options };

  // Do not override headers if provided
  options.headers = options.headers || {};

  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }

  // If body is FormData, do not set Content-Type header (browser will set multipart boundary)
  const isForm = options.body instanceof FormData;
  if (!isForm && !options.headers['Content-Type']) {
    options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
  }

  let response = await fetch(url, options);

  // If unauthorized, try refresh once
  if (response.status === 401 && localStorage.getItem('refreshToken')) {
    console.log('401 received, trying token refresh...');
    const refreshed = await refreshToken();
    if (refreshed) {
      // update header with new token and retry
      options.headers['Authorization'] = `Bearer ${authToken}`;
      response = await fetch(url, options);
    }
  }

  return response;
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function () {
  initializeApp();
});

async function initializeApp() {
  // Accept several token param names in URL: verify_token, token, vtoken
  const params = new URLSearchParams(window.location.search);
  const token = params.get('verify_token') || params.get('token') || params.get('vtoken');
  if (token) {
    await verifyEmailToken(token);
    // remove query param to avoid re-running on refresh
    try {
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (e) { /* ignore */ }
  }

  // If authToken present, set global var
  authToken = localStorage.getItem('authToken') || null;
  if (authToken) {
    await fetchUserProfile();
  } else {
    updateNavForLoggedInUser();
  }

  // Load page data
  await loadSubjects();
  await loadResources();

  // Setup event listeners (safe)
  setupEventListeners();

  // UI helpers
  initScrollToTop();
  setupDropdownListener();
}

// Setup event listeners - safe attach
function setupEventListeners() {
  const searchInput = $id('searchInput');
  const searchButton = document.querySelector('.btn-search');

  if (searchInput) {
    searchInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); loadResources(); }
    });
  }
  if (searchButton) {
    searchButton.addEventListener('click', function (e) { e.preventDefault(); loadResources(); });
  }

  const subjectFilter = $id('subjectFilter');
  const typeFilter = $id('typeFilter');
  const yearFilter = $id('yearFilter');
  const semesterFilter = $id('semesterFilter');
  if (subjectFilter) subjectFilter.addEventListener('change', loadResources);
  if (typeFilter) typeFilter.addEventListener('change', loadResources);
  if (yearFilter) yearFilter.addEventListener('change', loadResources);
  if (semesterFilter) semesterFilter.addEventListener('change', loadResources);

  // Modals - safe
  if ($id('loginForm')) $id('loginForm').addEventListener('submit', handleLogin);
  if ($id('registerForm')) $id('registerForm').addEventListener('submit', handleRegister);
  if ($id('uploadForm')) $id('uploadForm').addEventListener('submit', handleUpload);
  if ($id('profileForm')) $id('profileForm').addEventListener('submit', handleProfileUpdate);

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

// ===== AUTHENTICATION FUNCTIONS =====
async function verifyEmailToken(token) {
  try {
    // Some backends expect GET, some POST. Prefer POST as implemented in your backend.
    const res = await fetch(`${API_BASE}/auth/verify/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    // try parse JSON safely
    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }

    if (res.ok) {
      showNotification(data.message || 'Email verified successfully.', 'success');
      openLoginModal();
    } else {
      showNotification(data.error || data.detail || 'Verification failed.', 'error');
    }
  } catch (err) {
    console.error('Verification error:', err);
    showNotification('An error occurred during verification.', 'error');
  }
}

async function fetchUserProfile() {
  if (!authToken) { updateNavForLoggedInUser(); return; }
  try {
    const res = await fetchWithAuth(`${API_BASE}/auth/profile/`);
    if (res.ok) {
      const data = await res.json();
      currentUser = data;
      updateNavForLoggedInUser();
    } else {
      console.warn('Profile fetch failed, logging out.');
      logout();
    }
  } catch (err) {
    console.error('Error fetching profile:', err);
    logout();
  }
}

function updateNavForLoggedInUser() {
  const navAuth = document.querySelector('.nav-auth');
  if (!navAuth) return;

  if (currentUser) {
    const profilePicUrl = currentUser.profile_pic || null;
    let profileElement = '';
    if (profilePicUrl) {
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
            <strong>${escapeHtml(currentUser.first_name || 'User')} ${escapeHtml(currentUser.last_name || '')}</strong>
            <span>${escapeHtml(currentUser.email || '')}</span>
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
  } else {
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
  if (event) event.preventDefault();
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  currentUser = null;
  authToken = null;
  updateNavForLoggedInUser();
  const dropdown = $id('profileDropdown');
  if (dropdown) dropdown.classList.remove('active');
  showNotification('You have been logged out.', 'info');
}

// ===== MODAL HELPERS =====
function openLoginModal() {
  const el = $id('loginModal');
  if (!el) return;
  el.style.display = 'block';
  document.body.style.overflow = 'hidden';
}
function closeLoginModal() { const el = $id('loginModal'); if (!el) return; el.style.display = 'none'; document.body.style.overflow = 'auto'; }
function openRegisterModal() { const r = $id('registerModal'); const l = $id('loginModal'); if (l) l.style.display = 'none'; if (r) { r.style.display = 'block'; document.body.style.overflow = 'hidden'; } }
function closeRegisterModal() { const el = $id('registerModal'); if (!el) return; el.style.display = 'none'; document.body.style.overflow = 'auto'; }

async function openUploadModal() {
  if (!authToken) {
    showNotification('Please login to upload resources', 'warning');
    openLoginModal();
    return;
  }
  await populateUploadFormSubjects(); 
  const el = $id('uploadModal'); if (!el) return;
  el.style.display = 'block'; document.body.style.overflow = 'hidden';
}
function closeUploadModal() { const el = $id('uploadModal'); if (!el) return; el.style.display = 'none'; document.body.style.overflow = 'auto'; }

function openProfileModal(event) {
  if (event) event.preventDefault();
  const dropdown = $id('profileDropdown'); if (dropdown) dropdown.classList.remove('active');
  if (!currentUser) { showNotification('Please login first', 'warning'); openLoginModal(); return; }
  $id('profileFirstName') && ($id('profileFirstName').value = currentUser.first_name || '');
  $id('profileLastName') && ($id('profileLastName').value = currentUser.last_name || '');
  $id('profileErrors') && ($id('profileErrors').style.display = 'none');
  $id('profilePic') && ($id('profilePic').value = null);
  const el = $id('profileModal'); if (!el) return;
  el.style.display = 'block'; document.body.style.overflow = 'hidden';
}
function closeProfileModal() { const el = $id('profileModal'); if (!el) return; el.style.display = 'none'; document.body.style.overflow = 'auto'; }

function openHistoryModal(event) { if (event) event.preventDefault(); const dropdown = $id('profileDropdown'); if (dropdown) dropdown.classList.remove('active'); const el = $id('historyModal'); if(!el) return; el.style.display = 'block'; document.body.style.overflow='hidden'; loadHistory(); }
function closeHistoryModal() { const el = $id('historyModal'); if (!el) return; el.style.display = 'none'; document.body.style.overflow = 'auto'; }

// ===== DROPDOWN =====
function toggleProfileDropdown(event) {
  event.stopPropagation();
  const dropdown = $id('profileDropdown');
  if (dropdown) dropdown.classList.toggle('active');
}
function setupDropdownListener() {
  document.addEventListener('click', function (event) {
    const dropdown = $id('profileDropdown');
    const profileIcon = document.querySelector('.nav-user-profile');
    if (!dropdown || !profileIcon) return;
    if (dropdown.classList.contains('active')) {
      if (!dropdown.contains(event.target) && !profileIcon.contains(event.target)) {
        dropdown.classList.remove('active');
      }
    }
  });
}

// ===== FORM HANDLERS =====
async function handleLogin(e) {
  e.preventDefault();
  const email = $id('loginEmail') ? $id('loginEmail').value : '';
  const password = $id('loginPassword') ? $id('loginPassword').value : '';
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) { var originalText = submitBtn.innerHTML; submitBtn.innerHTML = '<div class="loading"></div> Logging in...'; submitBtn.disabled = true; }

  try {
    const res = await fetch(`${API_BASE}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    // parse safely
    let data = {};
    try { data = await res.json(); } catch (err) { data = {}; }

    if (res.ok) {
      // Accept multiple naming conventions
      const access = data.access || data.token || data.authToken;
      const refresh = data.refresh || data.refresh_token;

      if (access) {
        localStorage.setItem('authToken', access);
        authToken = access;
      }
      if (refresh) {
        localStorage.setItem('refreshToken', refresh);
      }

      // If backend returned user in response, use it
      if (data.user) currentUser = data.user;

      // If not, fetch profile
      if (!currentUser) await fetchUserProfile();

      updateNavForLoggedInUser();
      closeLoginModal();
      showNotification('Login successful! Welcome back.', 'success');
      loadResources();
    } else {
      const errMsg = data.detail || data.error || (data.non_field_errors && data.non_field_errors[0]) || 'Login failed. Check your credentials or verify your email.';
      showNotification(errMsg, 'error');
      // If backend requested verification, help user
      if (data.detail && data.detail.toLowerCase().includes('verify')) {
        openLoginModal();
      }
    }
  } catch (err) {
    console.error('Login error:', err);
    showNotification('Login failed. Please try again.', 'error');
  } finally {
    if (submitBtn) { submitBtn.innerHTML = originalText; submitBtn.disabled = false; }
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const formData = {
    first_name: $id('regFirstName') ? $id('regFirstName').value : '',
    last_name: $id('regLastName') ? $id('regLastName').value : '',
    email: $id('regEmail') ? $id('regEmail').value : '',
    password: $id('regPassword') ? $id('regPassword').value : '',
    role: $id('regRole') ? $id('regRole').value : ''
  };

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) { var originalText = submitBtn.innerHTML; submitBtn.innerHTML = '<div class="loading"></div> Creating account...'; submitBtn.disabled = true; }

  try {
    const res = await fetch(`${API_BASE}/auth/register/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }

    if (res.status === 201 || res.ok) {
      showNotification(data.message || 'Account created! Check your email for verification.', 'success');
      closeRegisterModal();
      if (e.target) e.target.reset();
    } else {
      const errorMsg = (data.email && data.email[0]) || (data.password && data.password[0]) || data.error || data.detail || 'Registration failed.';
      showNotification(errorMsg, 'error');
    }
  } catch (err) {
    console.error('Registration error:', err);
    showNotification('Registration failed. Please try again.', 'error');
  } finally {
    if (submitBtn) { submitBtn.innerHTML = originalText; submitBtn.disabled = false; }
  }
}

// Upload subjects/populate safely
async function populateUploadFormSubjects() {
  const select = $id('uploadSubject');
  if (!select) return;
  select.innerHTML = '<option value="">Loading subjects...</option>';
  try {
    // Using public endpoint (no auth required)
    const res = await fetch(`${API_BASE}/resources/subjects/`);
    if (!res.ok) throw new Error('Failed to fetch subjects');
    const subjects = await res.json();
    if (!subjects || subjects.length === 0) {
      select.innerHTML = '<option value="">No subjects found.</option>';
      return;
    }
    select.innerHTML = '<option value="">Select a subject...</option>' + subjects.map(s => `<option value="${s.id}">${s.name}${s.semester ? ' - Sem ' + s.semester : ''}</option>`).join('');
  } catch (err) {
    console.error('Error loading subjects for upload:', err);
    select.innerHTML = '<option value="">Could not load subjects</option>';
  }
}

// Upload handler (uses fetchWithAuth to send FormData)
async function handleUpload(e) {
  e.preventDefault();
  const title = $id('uploadTitle') ? $id('uploadTitle').value : '';
  const subjectId = $id('uploadSubject') ? $id('uploadSubject').value : '';
  const type = $id('uploadType') ? $id('uploadType').value : '';
  const fileInput = $id('uploadFile');
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;
  const errorDiv = $id('uploadErrors');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerHTML : '';

  if (!file) {
    if (errorDiv) { errorDiv.textContent = 'Please select a PDF file.'; errorDiv.style.display = 'block'; }
    return;
  }
  if (file.type !== 'application/pdf') {
    if (errorDiv) { errorDiv.textContent = 'Only PDF files are allowed.'; errorDiv.style.display = 'block'; }
    return;
  }
  if (!subjectId) {
    if (errorDiv) { errorDiv.textContent = 'Please select a subject.'; errorDiv.style.display = 'block'; }
    return;
  }
  if (submitBtn) { submitBtn.innerHTML = '<div class="loading"></div> Uploading...'; submitBtn.disabled = true; }

  const form = new FormData();
  form.append('title', title);
  // some backends expect `subject` or `subject_id`. Try subject_id first
  form.append('subject_id', subjectId);
  form.append('resource_type', type);
  form.append('pdf_file', file);

  try {
    const res = await fetchWithAuth(`${API_BASE}/resources/files/`, {
      method: 'POST',
      body: form
    });

    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }

    if (res.status === 201 || res.ok) {
      showNotification('Resource uploaded! It will be visible after admin approval.', 'success');
      closeUploadModal();
      if (e.target) e.target.reset();
      loadResources();
    } else {
      let msg = 'Upload failed. Please try again.';
      if (data.title) msg = data.title[0];
      else if (data.subject) msg = data.subject[0];
      else if (data.pdf_file) msg = data.pdf_file[0];
      else if (data.detail) msg = data.detail;
      if (errorDiv) { errorDiv.textContent = msg; errorDiv.style.display = 'block'; }
    }
  } catch (err) {
    console.error('Upload error:', err);
    if (errorDiv) { errorDiv.textContent = 'An error occurred. Please try again.'; errorDiv.style.display = 'block'; }
  } finally {
    if (submitBtn) { submitBtn.innerHTML = originalText; submitBtn.disabled = false; }
  }
}

async function handleProfileUpdate(e) {
  e.preventDefault();
  if (!authToken) { showNotification('Please login first', 'warning'); openLoginModal(); return; }

  const firstName = $id('profileFirstName') ? $id('profileFirstName').value : '';
  const lastName = $id('profileLastName') ? $id('profileLastName').value : '';
  const file = $id('profilePic') && $id('profilePic').files ? $id('profilePic').files[0] : null;
  const errorDiv = $id('profileErrors');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerHTML : '';

  if (submitBtn) { submitBtn.innerHTML = '<div class="loading"></div> Saving...'; submitBtn.disabled = true; }
  if (errorDiv) { errorDiv.style.display = 'none'; }

  const fd = new FormData();
  fd.append('first_name', firstName);
  fd.append('last_name', lastName);
  if (file) {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      if (errorDiv) { errorDiv.textContent = 'Only JPG or PNG allowed'; errorDiv.style.display = 'block'; }
      if (submitBtn) { submitBtn.innerHTML = originalText; submitBtn.disabled = false; }
      return;
    }
    fd.append('profile_pic', file);
  }

  try {
    const res = await fetchWithAuth(`${API_BASE}/auth/profile/update/`, {
      method: 'PATCH',
      body: fd
    });

    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }

    if (res.ok) {
      currentUser = data;
      updateNavForLoggedInUser();
      showNotification('Profile updated successfully!', 'success');
      closeProfileModal();
    } else {
      const msg = data.detail || data.error || 'Failed to update profile.';
      if (errorDiv) { errorDiv.textContent = msg; errorDiv.style.display = 'block'; }
    }
  } catch (err) {
    console.error('Profile update error:', err);
    if (errorDiv) { errorDiv.textContent = 'An error occurred. Please try again.'; errorDiv.style.display = 'block'; }
  } finally {
    if (submitBtn) { submitBtn.innerHTML = originalText; submitBtn.disabled = false; }
  }
}

// ===== RESOURCES =====
async function loadResources() {
  const subjectFilter = $id('subjectFilter') ? $id('subjectFilter').value : '';
  const typeFilter = $id('typeFilter') ? $id('typeFilter').value : '';
  const semesterFilter = $id('semesterFilter') ? $id('semesterFilter').value : '';
  const searchInput = $id('searchInput') ? $id('searchInput').value : '';

  showLoading('resourcesGrid');

  try {
    let url = `${API_BASE}/resources/files/`;
    const params = new URLSearchParams();
    if (subjectFilter) params.append('subject', subjectFilter);
    if (typeFilter) params.append('type', typeFilter);
    if (semesterFilter) params.append('semester', semesterFilter);
    if (searchInput) params.append('search', searchInput);
    if (params.toString()) url += `?${params.toString()}`;

    // If your resources endpoint is public, plain fetch is OK.
    // If it requires auth, replace with fetchWithAuth.
    const response = await fetch(url);
    if (!response.ok) {
      // try auth version if unauthenticated
      if (response.status === 401 && localStorage.getItem('authToken')) {
        const authResp = await fetchWithAuth(url);
        if (!authResp.ok) throw new Error('Failed to fetch resources (auth).');
        const resources = await authResp.json();
        currentResources = resources;
        displayResources(resources);
        return;
      }
      throw new Error('Failed to fetch resources');
    }
    const resources = await response.json();
    currentResources = resources;
    displayResources(resources);
  } catch (err) {
    console.error('Error loading resources:', err);
    showError('resourcesGrid', 'Failed to load resources. Please try again.');
  }
}

function displayResources(resources) {
  const grid = $id('resourcesGrid');
  if (!grid) return;

  if (!resources || resources.length === 0) {
    grid.innerHTML = `<div class="no-resources">
      <i class="fas fa-inbox"></i>
      <h3>No Resources Found</h3>
      <p>Try adjusting your filters or ask admin to upload.</p>
      <button class="btn-primary" onclick="clearFilters()">Clear All Filters</button>
    </div>`;
    return;
  }

  grid.innerHTML = resources.map(resource => {
    const subjectName = resource.subject ? resource.subject.name : 'Unknown Subject';
    const uploadedAt = resource.uploaded_at ? new Date(resource.uploaded_at) : null;
    const year = uploadedAt ? uploadedAt.getFullYear() : '';
    const uploaderName = resource.uploaded_by || 'Admin';
    const pdfFile = resource.pdf_file || resource.file || '';

    return `
      <div class="resource-card" data-id="${resource.id}">
        <div class="resource-type type-${resource.resource_type}">
          <i class="${getTypeIcon(resource.resource_type)}"></i> ${getTypeDisplayName(resource.resource_type)}
        </div>
        <h3 class="resource-title">${escapeHtml(resource.title)}</h3>
        <div class="resource-meta">
          <span class="meta-item"><i class="fas fa-book-open"></i> ${escapeHtml(subjectName)}</span>
          <span class="meta-item"><i class="fas fa-calendar"></i> ${escapeHtml(year)}</span>
          <span class="meta-item"><i class="fas fa-user-graduate"></i> ${escapeHtml(uploaderName)}</span>
        </div>
        <p class="resource-description">${getResourceDescription(resource)}</p>
        <div class="resource-actions">
          <button class="download-btn" onclick="downloadResource(${resource.id}, '${pdfFile}')" ${!authToken ? 'disabled' : ''}>
            <i class="fas fa-download"></i> ${authToken ? 'Download PDF' : 'Login to Download'}
          </button>
          <button class="preview-btn" onclick="previewResource('${pdfFile}')"><i class="fas fa-eye"></i> Preview</button>
        </div>
      </div>`;
  }).join('');
}

function getTypeIcon(type) {
  const icons = { notes: 'fas fa-book', question_paper: 'fas fa-file-pdf', syllabus: 'fas fa-clipboard-list' };
  return icons[type] || 'fas fa-file';
}
function getTypeDisplayName(type) {
  const map = { notes: 'Handwritten Notes', question_paper: 'Question Paper', syllabus: 'Syllabus' };
  return map[type] || (type || '').replace('_', ' ').toUpperCase();
}
function getResourceDescription(resource) {
  const subjectName = resource.subject ? resource.subject.name : 'this subject';
  return `Download this ${getTypeDisplayName(resource.resource_type).toLowerCase()} for ${subjectName}.`;
}

async function loadSubjects() {
  try {
    const res = await fetch(`${API_BASE}/resources/subjects/`);
    if (!res.ok) throw new Error('Failed to fetch subjects');
    const subjects = await res.json();
    populateSubjectFilter(subjects);
    populateUploadFormSubjects(subjects);
  } catch (err) {
    console.error('Error loading subjects:', err);
  }
}

function populateSubjectFilter(subjects) {
  const subjectSelect = $id('subjectFilter');
  if (!subjectSelect || !subjects) return;
  subjectSelect.innerHTML = '<option value="">All Subjects</option>' + subjects.map(s => `<option value="${s.id}">${s.name}${s.semester ? ' - Sem ' + s.semester : ''}</option>`).join('');
}
function populateUploadFormSubjects(subjects) {
  const select = $id('uploadSubject');
  if (!select) return;
  if (subjects && subjects.length) {
    select.innerHTML = '<option value="">Select a subject...</option>' + subjects.map(s => `<option value="${s.id}">${s.name}${s.semester ? ' - Sem ' + s.semester : ''}</option>`).join('');
  } else {
    select.innerHTML = '<option value="">No subjects available</option>';
  }
}

// ===== DOWNLOAD / PREVIEW / HISTORY =====
async function downloadResource(resourceId, pdfUrl) {
  if (!authToken) {
    showNotification('Please login to download resources', 'warning');
    openLoginModal();
    return;
  }

  try {
    await fetchWithAuth(`${API_BASE}/resources/files/${resourceId}/download/`, { method: 'POST' });
  } catch (err) {
    console.error('Error logging download:', err);
  }

  if (pdfUrl) {
    // If pdfUrl is relative, prefix API_BASE (attempt)
    const finalUrl = pdfUrl.startsWith('http') ? pdfUrl : (API_BASE.replace(/\/api\/?$/, '') + pdfUrl);
    window.open(finalUrl, '_blank');
  } else {
    showNotification('No file URL available.', 'error');
  }
}

function previewResource(pdfUrl) {
  if (!pdfUrl) { showNotification('No preview available', 'info'); return; }
  const finalUrl = pdfUrl.startsWith('http') ? pdfUrl : (API_BASE.replace(/\/api\/?$/, '') + pdfUrl);
  window.open(finalUrl, '_blank');
}

async function loadHistory() {
  const body = $id('historyModalBody');
  if (!body) return;
  body.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Loading history...</p></div>`;
  try {
    const res = await fetchWithAuth(`${API_BASE}/resources/history/`);
    if (!res.ok) throw new Error('Failed to fetch history');
    const items = await res.json();
    if (!items || items.length === 0) {
      body.innerHTML = `<div class="no-resources" style="text-align:center"><i class="fas fa-history" style="font-size:2rem"></i><h3>No Download History</h3></div>`;
      return;
    }
    body.innerHTML = items.map(item => {
      const resource = item.resource || {};
      const downloadedAt = item.downloaded_at ? new Date(item.downloaded_at).toLocaleString() : '';
      return `<div class="history-item"><div class="history-item-icon"><i class="${getTypeIcon(resource.resource_type)}"></i></div><div class="history-item-details"><h4>${escapeHtml(resource.title)}</h4><p>${escapeHtml(resource.subject ? resource.subject.name : '')} | Downloaded on: ${escapeHtml(downloadedAt)}</p></div><div class="history-item-action"><button class="btn-secondary" onclick="downloadResource(${resource.id}, '${resource.pdf_file}')"><i class="fas fa-redo"></i> Download Again</button></div></div>`;
    }).join('');
  } catch (err) {
    console.error('Error loading history:', err);
    body.innerHTML = `<div class="error-state"><p>Failed to load history. Try again later.</p></div>`;
  }
}

// ===== UI / HELPERS =====
function setupSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}
function scrollToResources() { const el = $id('resources'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

function initScrollToTop() {
  const scrollBtn = $id('scrollToTop');
  if (!scrollBtn) return;
  window.onscroll = () => {
    if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) scrollBtn.style.display = "block";
    else scrollBtn.style.display = "none";
  };
}

function toggleMobileMenu() { const navMenu = $id('navMenu'); if (navMenu) navMenu.classList.toggle('active'); }

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => { clearTimeout(timeout); func(...args); };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function showLoading(containerId) {
  const container = $id(containerId);
  if (!container) return;
  container.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Loading resources...</p></div>`;
}

function showError(containerId, message) {
  const container = $id(containerId);
  if (!container) return;
  container.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-triangle"></i><h3>Something went wrong</h3><p>${escapeHtml(message)}</p><button class="btn-primary" onclick="loadResources()">Try Again</button></div>`;
}

function showNotification(message, type = 'info') {
  document.querySelectorAll('.notification').forEach(n => n.remove());
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `<div class="notification-content"><i class="fas ${getNotificationIcon(type)}"></i><span>${escapeHtml(message)}</span><button class="notification-close" onclick="this.parentElement.parentElement.remove()"><i class="fas fa-times"></i></button></div>`;
  document.body.appendChild(notification);
  setTimeout(() => { if (notification.parentElement) notification.remove(); }, 5000);
}
function getNotificationIcon(type) { const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' }; return icons[type] || 'fa-info-circle'; }

// ===== CONTACT FORM =====
async function handleContactForm(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) { submitBtn.innerHTML = '<div class="loading"></div> Sending...'; submitBtn.disabled = true; }

  const formData = {
    name: $id('contactName') ? $id('contactName').value : '',
    email: $id('contactEmail') ? $id('contactEmail').value : '',
    subject: $id('contactSubject') ? $id('contactSubject').value : '',
    message: $id('contactMessage') ? $id('contactMessage').value : ''
  };

  try {
    const res = await fetch(`${API_BASE}/auth/contact/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }
    if (res.ok) {
      showNotification(data.message || 'Message sent successfully!', 'success');
      form.reset();
    } else {
      showNotification(data.error || data.detail || 'Failed to send message.', 'error');
    }
  } catch (err) {
    console.error('Contact form error:', err);
    showNotification('An error occurred. Please try again.', 'error');
  } finally {
    if (submitBtn) { submitBtn.innerHTML = originalText; submitBtn.disabled = false; }
  }
}

// DYNAMIC INJECTED STYLES (keep as-is or remove if you already include css)
const additionalStyles = `...`; // keep your existing style string or move to css file
// note: to keep file short here we don't re-insert styles text - your original was appended already
