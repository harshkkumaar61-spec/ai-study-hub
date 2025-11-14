/* main.js — FULL fixed version (paste into your project to replace existing main.js)
   - Uses API_BASE (ngrok or your configured backend)
   - Robust token refresh + fetchWithAuth
   - Safe JSON parsing
   - FormData handling
   - Modal open/close fixes & DOM null checks
   - Resources/subjects/histry/upload/download + notifications
*/

/* ================= GLOBALS ================= */
const API_BASE = (window.API_BASE && window.API_BASE.trim())
  ? window.API_BASE.trim()
  : 'https://ungregariously-unbangled-braxton.ngrok-free.dev/api'; // change to your backend
let currentUser = null;
let authToken = localStorage.getItem('authToken') || null;
let currentResources = [];

/* ===== Safe DOM getter ===== */
function $id(id) { return document.getElementById(id) || null; }

/* ===== TOKEN: refresh logic ===== */
async function refreshToken() {
  const refresh = localStorage.getItem('refreshToken');
  if (!refresh) {
    console.log('[Auth] No refresh token, logging out.');
    logout();
    return false;
  }
  try {
    const res = await fetch(`${API_BASE}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh })
    });
    if (!res.ok) {
      console.warn('[Auth] refresh failed with status', res.status);
      logout();
      return false;
    }
    const data = await safeJson(res);
    const newAccess = data.access || data.token || data.authToken || null;
    if (!newAccess) {
      console.warn('[Auth] refresh response missing token');
      logout();
      return false;
    }
    localStorage.setItem('authToken', newAccess);
    authToken = newAccess;
    console.log('[Auth] Token refreshed successfully');
    return true;
  } catch (err) {
    console.error('[Auth] refresh error', err);
    logout();
    return false;
  }
}

/* ===== Safe JSON parse helper ===== */
async function safeJson(response) {
  try {
    return await response.json();
  } catch (err) {
    return {};
  }
}

/* ===== fetchWithAuth: adds token and refresh-on-401 ===== */
async function fetchWithAuth(url, options = {}) {
  options = { method: 'GET', headers: {}, ...options };
  options.headers = options.headers || {};

  // if we have authToken, add Authorization header
  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }

  // If body is FormData, do not add Content-Type (browser will handle)
  const isForm = options.body instanceof FormData;
  if (!isForm && !options.headers['Content-Type']) {
    options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
  }

  let response = await fetch(url, options);

  if (response.status === 401 && localStorage.getItem('refreshToken')) {
    console.log('[Auth] 401 received, trying refresh...');
    const ok = await refreshToken();
    if (ok) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
      response = await fetch(url, options);
    }
  }

  return response;
}

/* ================= INITIALIZATION ================= */
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
  // If verify token in URL, call verification
  const params = new URLSearchParams(window.location.search);
  const token = params.get('verify_token') || params.get('token') || params.get('vtoken');
  if (token) {
    await verifyEmailToken(token);
    try { window.history.replaceState({}, document.title, window.location.pathname); } catch (e) { /* ignore */ }
  }

  authToken = localStorage.getItem('authToken') || null;
  if (authToken) {
    await fetchUserProfile();
  } else {
    updateNavForLoggedInUser();
  }

  await loadSubjects();
  await loadResources();

  setupEventListeners();
  initScrollToTop();
  setupDropdownListener();
}

/* ================= EVENT LISTENERS ================= */
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

  const cf = $id('subjectFilter'); if (cf) cf.addEventListener('change', loadResources);
  const tf = $id('typeFilter'); if (tf) tf.addEventListener('change', loadResources);
  const yf = $id('yearFilter'); if (yf) yf.addEventListener('change', loadResources);
  const sf = $id('semesterFilter'); if (sf) sf.addEventListener('change', loadResources);

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

/* ================= AUTH FUNCTIONS ================= */
async function verifyEmailToken(token) {
  try {
    const res = await fetch(`${API_BASE}/auth/verify/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await safeJson(res);
    if (res.ok) {
      showNotification(data.message || 'Email verified successfully.', 'success');
      openLoginModal();
    } else {
      showNotification(data.error || data.detail || 'Verification failed.', 'error');
    }
  } catch (err) {
    console.error('verifyEmailToken error', err);
    showNotification('Verification error. Try again.', 'error');
  }
}

async function fetchUserProfile() {
  if (!authToken) { updateNavForLoggedInUser(); return; }
  try {
    const res = await fetchWithAuth(`${API_BASE}/auth/profile/`);
    if (!res.ok) { console.warn('Profile fetch failed, logging out'); logout(); return; }
    const data = await safeJson(res);
    currentUser = data;
    updateNavForLoggedInUser();
  } catch (err) {
    console.error('fetchUserProfile error', err);
    logout();
  }
}

function updateNavForLoggedInUser() {
  const navAuth = document.querySelector('.nav-auth');
  if (!navAuth) return;
  if (currentUser) {
    const pic = currentUser.profile_pic || null;
    let profileElement = '';
    if (pic) profileElement = `<img src="${pic}?v=${new Date().getTime()}" alt="Profile Picture" class="nav-profile-pic">`;
    else {
      const fn = currentUser.first_name || 'User';
      profileElement = `<div class="nav-profile-initial">${fn.charAt(0).toUpperCase()}</div>`;
    }

    navAuth.innerHTML = `
      <button class="btn-primary" onclick="openUploadModal()"><i class="fas fa-upload"></i> Upload Resource</button>
      <div class="nav-user-profile" onclick="toggleProfileDropdown(event)">${profileElement}</div>
      <div class="profile-dropdown-menu" id="profileDropdown">
        <div class="dropdown-header">
          <div class="dropdown-profile-icon">${profileElement}</div>
          <div class="dropdown-profile-info">
            <strong>${escapeHtml(currentUser.first_name || 'User')} ${escapeHtml(currentUser.last_name || '')}</strong>
            <span>${escapeHtml(currentUser.email || '')}</span>
          </div>
        </div>
        <a href="#" class="dropdown-item" onclick="openProfileModal(event)"><i class="fas fa-cog"></i> Settings</a>
        <a href="#" class="dropdown-item" onclick="openHistoryModal(event)"><i class="fas fa-history"></i> History</a>
        <div class="dropdown-divider"></div>
        <a href="#" class="dropdown-item logout-btn" onclick="logout(event)"><i class="fas fa-sign-out-alt"></i> Logout</a>
      </div>`;
  } else {
    navAuth.innerHTML = `
      <button class="btn-login" onclick="openLoginModal()"><i class="fas fa-sign-in-alt"></i> Login</button>
      <button class="btn-register" onclick="openRegisterModal()"><i class="fas fa-user-plus"></i> Register</button>`;
  }
}

function logout(event) {
  if (event) event.preventDefault();
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  authToken = null;
  currentUser = null;
  updateNavForLoggedInUser();
  const drop = $id('profileDropdown'); if (drop) drop.classList.remove('active');
  showNotification('Logged out', 'info');
}

/* ================= MODALS ================= */
function openLoginModal() { const el = $id('loginModal'); if (!el) return; el.style.display = 'block'; document.body.style.overflow = 'hidden'; }
function closeLoginModal() { const el = $id('loginModal'); if (!el) return; el.style.display = 'none'; document.body.style.overflow = 'auto'; }
function openRegisterModal() { const r = $id('registerModal'); const l = $id('loginModal'); if (l) l.style.display = 'none'; if (r) { r.style.display = 'block'; document.body.style.overflow = 'hidden'; } }
function closeRegisterModal() { const r = $id('registerModal'); if (!r) return; r.style.display = 'none'; document.body.style.overflow = 'auto'; }
async function openUploadModal() { if (!authToken) { showNotification('Please login to upload', 'warning'); openLoginModal(); return; } await populateUploadFormSubjects(); const u = $id('uploadModal'); if (!u) return; u.style.display = 'block'; document.body.style.overflow = 'hidden'; }
function closeUploadModal() { const u = $id('uploadModal'); if (!u) return; u.style.display = 'none'; document.body.style.overflow = 'auto'; }
function openProfileModal(e) { if (e) e.preventDefault(); const drop = $id('profileDropdown'); if (drop) drop.classList.remove('active'); if (!currentUser) { showNotification('Please login', 'warning'); openLoginModal(); return; } if ($id('profileFirstName')) $id('profileFirstName').value = currentUser.first_name || ''; if ($id('profileLastName')) $id('profileLastName').value = currentUser.last_name || ''; if ($id('profileErrors')) $id('profileErrors').style.display = 'none'; const p = $id('profileModal'); if (!p) return; p.style.display = 'block'; document.body.style.overflow = 'hidden'; }
function closeProfileModal() { const p = $id('profileModal'); if (!p) return; p.style.display = 'none'; document.body.style.overflow = 'auto'; }
function openHistoryModal(e) { if (e) e.preventDefault(); const drop = $id('profileDropdown'); if (drop) drop.classList.remove('active'); const h = $id('historyModal'); if (!h) return; h.style.display = 'block'; document.body.style.overflow = 'hidden'; loadHistory(); }
function closeHistoryModal() { const h = $id('historyModal'); if (!h) return; h.style.display = 'none'; document.body.style.overflow = 'auto'; }

/* ================= DROPDOWN ================= */
function toggleProfileDropdown(event) { event.stopPropagation(); const d = $id('profileDropdown'); if (d) d.classList.toggle('active'); }
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

/* ================= FORM HANDLERS ================= */
async function handleLogin(e) {
  e.preventDefault();
  const email = $id('loginEmail') ? $id('loginEmail').value : '';
  const password = $id('loginPassword') ? $id('loginPassword').value : '';
  const submit = e.target.querySelector('button[type="submit"]');
  const orig = submit ? submit.innerHTML : '';
  if (submit) { submit.innerHTML = '<div class="loading"></div> Logging in...'; submit.disabled = true; }

  try {
    const res = await fetch(`${API_BASE}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await safeJson(res);
    if (res.ok) {
      const access = data.access || data.token || data.authToken || null;
      const refresh = data.refresh || data.refresh_token || null;
      if (access) { localStorage.setItem('authToken', access); authToken = access; }
      if (refresh) { localStorage.setItem('refreshToken', refresh); }
      if (!data.user) await fetchUserProfile(); else currentUser = data.user;
      updateNavForLoggedInUser();
      closeLoginModal();
      showNotification('Login successful', 'success');
      loadResources();
    } else {
      const err = data.detail || data.error || (data.non_field_errors && data.non_field_errors[0]) || 'Login failed';
      showNotification(err, 'error');
    }
  } catch (err) {
    console.error('handleLogin error', err);
    showNotification('Login error. Try again', 'error');
  } finally {
    if (submit) { submit.innerHTML = orig; submit.disabled = false; }
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const body = {
    first_name: $id('regFirstName') ? $id('regFirstName').value : '',
    last_name: $id('regLastName') ? $id('regLastName').value : '',
    email: $id('regEmail') ? $id('regEmail').value : '',
    password: $id('regPassword') ? $id('regPassword').value : '',
    role: $id('regRole') ? $id('regRole').value : ''
  };
  const submit = e.target.querySelector('button[type="submit"]');
  const orig = submit ? submit.innerHTML : '';
  if (submit) { submit.innerHTML = '<div class="loading"></div> Creating account...'; submit.disabled = true; }

  try {
    const res = await fetch(`${API_BASE}/auth/register/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await safeJson(res);
    if (res.status === 201 || res.ok) {
      showNotification(data.message || 'Account created. Check email for verification.', 'success');
      closeRegisterModal();
      if (e.target) e.target.reset();
    } else {
      const err = (data.email && data.email[0]) || (data.password && data.password[0]) || data.error || data.detail || 'Registration failed';
      showNotification(err, 'error');
    }
  } catch (err) {
    console.error('handleRegister error', err);
    showNotification('Registration error. Try again', 'error');
  } finally {
    if (submit) { submit.innerHTML = orig; submit.disabled = false; }
  }
}

/* Populate upload form subjects (public endpoint) */
async function populateUploadFormSubjects() {
  const sel = $id('uploadSubject');
  if (!sel) return;
  sel.innerHTML = '<option value="">Loading subjects...</option>';
  try {
    const res = await fetch(`${API_BASE}/resources/subjects/`);
    if (!res.ok) throw new Error('Subjects fetch failed');
    const subjects = await safeJson(res);
    if (!subjects || subjects.length === 0) {
      sel.innerHTML = '<option value="">No subjects found</option>';
      return;
    }
    sel.innerHTML = '<option value="">Select a subject...</option>' + subjects.map(s => `<option value="${s.id}">${s.name}${s.semester ? ' - Sem ' + s.semester : ''}</option>`).join('');
  } catch (err) {
    console.error('populateUploadFormSubjects error', err);
    sel.innerHTML = '<option value="">Could not load subjects</option>';
  }
}

/* Upload handler (FormData + fetchWithAuth) */
async function handleUpload(e) {
  e.preventDefault();
  const title = $id('uploadTitle') ? $id('uploadTitle').value : '';
  const subjectId = $id('uploadSubject') ? $id('uploadSubject').value : '';
  const type = $id('uploadType') ? $id('uploadType').value : '';
  const fileInput = $id('uploadFile'); 
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;
  const errors = $id('uploadErrors');
  const submit = e.target.querySelector('button[type="submit"]');
  const orig = submit ? submit.innerHTML : '';

  if (!file) { if (errors) { errors.textContent = 'Please select a PDF file.'; errors.style.display = 'block'; } return; }
  if (file.type !== 'application/pdf') { if (errors) { errors.textContent = 'Only PDF allowed.'; errors.style.display = 'block'; } return; }
  if (!subjectId) { if (errors) { errors.textContent = 'Select subject.'; errors.style.display = 'block'; } return; }

  if (submit) { submit.innerHTML = '<div class="loading"></div> Uploading...'; submit.disabled = true; }
  if (errors) { errors.style.display = 'none'; }

  const fd = new FormData();
  fd.append('title', title);
  fd.append('subject_id', subjectId); // backend expects subject_id per your serializer fix
  fd.append('resource_type', type);
  fd.append('pdf_file', file);

  try {
    const res = await fetchWithAuth(`${API_BASE}/resources/files/`, {
      method: 'POST',
      body: fd
    });
    const data = await safeJson(res);
    if (res.status === 201 || res.ok) {
      showNotification('Resource uploaded! It will show after admin approval.', 'success');
      closeUploadModal();
      if (e.target) e.target.reset();
      loadResources();
    } else {
      let msg = 'Upload failed';
      if (data.title) msg = data.title[0];
      else if (data.subject) msg = data.subject[0];
      else if (data.pdf_file) msg = data.pdf_file[0];
      else if (data.detail) msg = data.detail;
      if (errors) { errors.textContent = msg; errors.style.display = 'block'; } else showNotification(msg, 'error');
    }
  } catch (err) {
    console.error('handleUpload error', err);
    if (errors) { errors.textContent = 'An error occurred.'; errors.style.display = 'block'; }
  } finally {
    if (submit) { submit.innerHTML = orig; submit.disabled = false; }
  }
}

/* Profile update (FormData) */
async function handleProfileUpdate(e) {
  e.preventDefault();
  if (!authToken) { showNotification('Login first', 'warning'); openLoginModal(); return; }

  const firstName = $id('profileFirstName') ? $id('profileFirstName').value : '';
  const lastName = $id('profileLastName') ? $id('profileLastName').value : '';
  const file = $id('profilePic') && $id('profilePic').files ? $id('profilePic').files[0] : null;
  const errors = $id('profileErrors');
  const submit = e.target.querySelector('button[type="submit"]');
  const orig = submit ? submit.innerHTML : '';
  if (submit) { submit.innerHTML = '<div class="loading"></div> Saving...'; submit.disabled = true; }
  if (errors) errors.style.display = 'none';

  const fd = new FormData();
  fd.append('first_name', firstName);
  fd.append('last_name', lastName);
  if (file) {
    if (!['image/jpeg', 'image/png'].includes(file.type || '')) {
      if (errors) { errors.textContent = 'Only JPG/PNG allowed'; errors.style.display = 'block'; }
      if (submit) { submit.innerHTML = orig; submit.disabled = false; }
      return;
    }
    fd.append('profile_pic', file);
  }

  try {
    const res = await fetchWithAuth(`${API_BASE}/auth/profile/update/`, {
      method: 'PATCH',
      body: fd
    });
    const data = await safeJson(res);
    if (res.ok) {
      currentUser = data;
      updateNavForLoggedInUser();
      showNotification('Profile updated', 'success');
      closeProfileModal();
    } else {
      const msg = data.detail || data.error || 'Update failed';
      if (errors) { errors.textContent = msg; errors.style.display = 'block'; } else showNotification(msg, 'error');
    }
  } catch (err) {
    console.error('handleProfileUpdate error', err);
    if (errors) { errors.textContent = 'Error while updating'; errors.style.display = 'block'; }
  } finally {
    if (submit) { submit.innerHTML = orig; submit.disabled = false; }
  }
}

/* ================= RESOURCES (public) ================= */
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

    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 401 && localStorage.getItem('authToken')) {
        const authRes = await fetchWithAuth(url);
        if (!authRes.ok) throw new Error('Failed to fetch resources (auth fallback)');
        const resources = await safeJson(authRes);
        currentResources = resources;
        displayResources(resources);
        return;
      }
      throw new Error('Failed to fetch resources');
    }
    const resources = await safeJson(res);
    currentResources = resources;
    displayResources(resources);
  } catch (err) {
    console.error('loadResources error', err);
    showError('resourcesGrid', 'Failed to load resources. Please try again.');
  }
}

function displayResources(resources) {
  const grid = $id('resourcesGrid');
  if (!grid) return;
  if (!resources || resources.length === 0) {
    grid.innerHTML = `<div class="no-resources"><i class="fas fa-inbox"></i><h3>No Resources Found</h3><p>Try adjusting your filters or ask admin to upload.</p><button class="btn-primary" onclick="clearFilters()">Clear All Filters</button></div>`;
    return;
  }

  grid.innerHTML = resources.map(resource => {
    const subjectName = resource.subject ? resource.subject.name : 'Unknown Subject';
    const uploaded = resource.uploaded_at ? new Date(resource.uploaded_at).getFullYear() : '';
    const uploader = resource.uploaded_by || 'Admin';
    const pdf = resource.pdf_file || resource.file || '';
    return `
      <div class="resource-card" data-id="${resource.id}">
        <div class="resource-type type-${resource.resource_type}"><i class="${getTypeIcon(resource.resource_type)}"></i> ${getTypeDisplayName(resource.resource_type)}</div>
        <h3 class="resource-title">${escapeHtml(resource.title)}</h3>
        <div class="resource-meta">
          <span class="meta-item"><i class="fas fa-book-open"></i> ${escapeHtml(subjectName)}</span>
          <span class="meta-item"><i class="fas fa-calendar"></i> ${escapeHtml(uploaded)}</span>
          <span class="meta-item"><i class="fas fa-user-graduate"></i> ${escapeHtml(uploader)}</span>
        </div>
        <p class="resource-description">${getResourceDescription(resource)}</p>
        <div class="resource-actions">
          <button class="download-btn" onclick="downloadResource(${resource.id}, '${pdf}')" ${!authToken ? 'disabled' : ''}><i class="fas fa-download"></i> ${authToken ? 'Download PDF' : 'Login to Download'}</button>
          <button class="preview-btn" onclick="previewResource('${pdf}')"><i class="fas fa-eye"></i> Preview</button>
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
  const subject = resource.subject ? resource.subject.name : 'this subject';
  return `Download this ${getTypeDisplayName(resource.resource_type).toLowerCase()} for ${subject}.`;
}

async function loadSubjects() {
  try {
    const res = await fetch(`${API_BASE}/resources/subjects/`);
    if (!res.ok) throw new Error('Subjects fetch failed');
    const subjects = await safeJson(res);
    populateSubjectFilter(subjects);
    populateUploadFormSubjects(subjects);
  } catch (err) {
    console.error('loadSubjects error', err);
  }
}

function populateSubjectFilter(subjects) {
  const s = $id('subjectFilter');
  if (!s || !subjects) return;
  s.innerHTML = '<option value="">All Subjects</option>' + subjects.map(x => `<option value="${x.id}">${x.name}${x.semester ? ' - Sem ' + x.semester : ''}</option>`).join('');
}

/* ================= DOWNLOAD / PREVIEW / HISTORY ================= */
async function downloadResource(resourceId, pdfUrl) {
  if (!authToken) { showNotification('Login to download', 'warning'); openLoginModal(); return; }
  try {
    await fetchWithAuth(`${API_BASE}/resources/files/${resourceId}/download/`, { method: 'POST' });
  } catch (err) {
    console.error('downloadResource (log) error', err);
  }
  if (!pdfUrl) { showNotification('File not available', 'error'); return; }
  const href = pdfUrl.startsWith('http') ? pdfUrl : (API_BASE.replace(/\/api\/?$/, '') + pdfUrl);
  window.open(href, '_blank');
}

function previewResource(pdfUrl) {
  if (!pdfUrl) { showNotification('No preview available', 'info'); return; }
  const href = pdfUrl.startsWith('http') ? pdfUrl : (API_BASE.replace(/\/api\/?$/, '') + pdfUrl);
  window.open(href, '_blank');
}

async function loadHistory() {
  const body = $id('historyModalBody'); if (!body) return;
  body.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Loading history...</p></div>`;
  try {
    const res = await fetchWithAuth(`${API_BASE}/resources/history/`);
    if (!res.ok) throw new Error('History fetch failed');
    const items = await safeJson(res);
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
    console.error('loadHistory error', err);
    body.innerHTML = `<div class="error-state"><p>Failed to load history. Try again later.</p></div>`;
  }
}

/* ================= NAV / UI ================= */
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
  const btn = $id('scrollToTop'); if (!btn) return;
  window.onscroll = () => {
    if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) btn.style.display = "block";
    else btn.style.display = "none";
  };
}
function toggleMobileMenu() { const nav = $id('navMenu'); if (nav) nav.classList.toggle('active'); }

/* UTILS */
function debounce(fn, wait){ let t; return function(...args){ clearTimeout(t); t = setTimeout(()=> fn(...args), wait); }; }
function escapeHtml(str){ if (typeof str !== 'string') return ''; return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }

/* Loading / error / notifications */
function showLoading(containerId) {
  const c = $id(containerId); if (!c) return;
  c.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Loading resources...</p></div>`;
}
function showError(containerId, message) {
  const c = $id(containerId); if (!c) return;
  c.innerHTML = `<div class="error-state"><i class="fas fa-exclamation-triangle"></i><h3>Something went wrong</h3><p>${escapeHtml(message)}</p><button class="btn-primary" onclick="loadResources()">Try Again</button></div>`;
}
function showNotification(message, type='info') {
  document.querySelectorAll('.notification').forEach(n => n.remove());
  const div = document.createElement('div');
  div.className = `notification notification-${type}`;
  div.innerHTML = `<div class="notification-content"><i class="fas ${getNotificationIcon(type)}"></i><span>${escapeHtml(message)}</span><button class="notification-close" onclick="this.parentElement.parentElement.remove()"><i class="fas fa-times"></i></button></div>`;
  document.body.appendChild(div);
  setTimeout(()=> { if (div.parentElement) div.remove(); }, 5000);
}
function getNotificationIcon(type) {
  const icons = { success:'fa-check-circle', error:'fa-exclamation-circle', warning:'fa-exclamation-triangle', info:'fa-info-circle' };
  return icons[type] || 'fa-info-circle';
}

/* CONTACT */
async function handleContactForm(e) {
  e.preventDefault();
  const form = e.target;
  const submit = form.querySelector('button[type="submit"]');
  const orig = submit ? submit.innerHTML : '';
  if (submit) { submit.innerHTML = '<div class="loading"></div> Sending...'; submit.disabled = true; }

  const body = {
    name: $id('contactName') ? $id('contactName').value : '',
    email: $id('contactEmail') ? $id('contactEmail').value : '',
    subject: $id('contactSubject') ? $id('contactSubject').value : '',
    message: $id('contactMessage') ? $id('contactMessage').value : '',
  };

  try {
    const res = await fetch(`${API_BASE}/auth/contact/`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    const data = await safeJson(res);
    if (res.ok) {
      showNotification(data.message || 'Message sent!', 'success');
      form.reset();
    } else {
      showNotification(data.error || data.detail || 'Failed to send message', 'error');
    }
  } catch (err) {
    console.error('handleContactForm error', err);
    showNotification('Contact error, try again', 'error');
  } finally {
    if (submit) { submit.innerHTML = orig; submit.disabled = false; }
  }
}

/* ================= DYNAMIC STYLES (if not already in ai-chat.css) ================= */
/* I included the main helpful rules here — if you already have ai-chat.css, you can remove this block */
const additionalStyles = `
.loading-state, .error-state, .no-resources { grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-gray); }
.loading-spinner { width: 40px; height: 40px; border: 4px solid var(--border-color); border-top-color: var(--primary-blue); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
.notification { position: fixed; top: 100px; right: 20px; background: white; padding: 1rem; border-radius: 12px; box-shadow: 0 10px 30px rgba(2,6,23,0.2); border-left: 4px solid #1976d2; z-index: 10000; max-width: 420px; animation: slideInRight 0.3s ease; }
.notification-success { border-left-color: #28a745; }
.notification-error { border-left-color: #dc3545; }
.notification-warning { border-left-color: #ff9800; }
.notification-info { border-left-color: #1976d2; }
.notification-content { display: flex; align-items: center; gap: 0.75rem; }
.notification-content i { font-size: 1.25rem; }
.notification-close { background: none; border: none; color: #333; cursor: pointer; padding: 0.25rem; margin-left: auto; }
@keyframes slideInRight { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
.resource-card .download-btn:disabled { opacity: 0.6; cursor: not-allowed; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.scroll-to-top { position: fixed; bottom: 30px; right: 100px; width: 50px; height: 50px; background: linear-gradient(90deg,#1565c0,#00bcd4); color: white; border: none; border-radius: 50%; display: none; align-items: center; justify-content: center; font-size: 1.25rem; cursor: pointer; box-shadow: 0 10px 30px rgba(2,6,23,0.15); z-index: 999; transition: all 0.3s ease; }
.scroll-to-top:hover { transform: translateY(-5px); }
@media (max-width: 768px) { .notification { top: 80px; left: 20px; right: 20px; max-width: none; } .scroll-to-top { width: 40px; height: 40px; font-size: 1rem; bottom: 20px; right: 80px; } }
`;

// append styles only if not present already
if (!document.getElementById('main-js-added-styles')) {
  const styleTag = document.createElement('style');
  styleTag.id = 'main-js-added-styles';
  styleTag.textContent = additionalStyles;
  document.head.appendChild(styleTag);
}

/* ====== Final small helpers ====== */
function clearFilters() {
  if ($id('subjectFilter')) $id('subjectFilter').value = '';
  if ($id('typeFilter')) $id('typeFilter').value = '';
  if ($id('yearFilter')) $id('yearFilter').value = '';
  if ($id('semesterFilter')) $id('semesterFilter').value = '';
  if ($id('searchInput')) $id('searchInput').value = '';
  loadResources();
}

/* ========== Attach contact form if present ========== */
if ($id('contactForm')) $id('contactForm').addEventListener('submit', handleContactForm);

/* End of file */
