/* resources.js
   Robust resources frontend module for AI Study Hub
   - Safe DOM guards
   - API_BASE fallback (uses global BASE_URL if present)
   - getAbsoluteUrl for media
   - fetchWithAuth fallback if not provided by main.js
   - Caches last-successful resources as fallback when network fails
   Usage: include with <script defer src=".../resources.js"></script>
*/

// ---------- CONFIG & HELPERS ----------
const API_BASE = (typeof API_BASE !== 'undefined' && API_BASE)
  ? API_BASE
  : (typeof BASE_URL !== 'undefined' && BASE_URL)
    ? BASE_URL
    : 'https://ungregariously-unbangled-braxton.ngrok-free.dev/api';

function log(...args) { console.log('[resources]', ...args); }
function warn(...args) { console.warn('[resources]', ...args); }
function err(...args) { console.error('[resources]', ...args); }

function getAbsoluteUrl(path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const host = API_BASE.replace(/\/api\/?$/, '');
    return host + (path.startsWith('/') ? path : '/' + path);
}

// Minimal fetchWithAuth fallback (uses global fetchWithAuth if present)
async function _fetchWithAuth(url, options = {}) {
    if (typeof fetchWithAuth === 'function') {
        return await fetchWithAuth(url, options);
    }
    // fallback simple bearer usage
    const token = localStorage.getItem('authToken');
    options.headers = options.headers || {};
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    return await fetch(url, options);
}

// Small utility
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe.replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;");
}

// ---------- NOTIFICATIONS / UI HELPERS ----------
function showNotification(message, type='info', ttl=4500) {
    try {
        const existing = document.querySelectorAll('.notification');
        existing.forEach(n=>n.remove());

        const n = document.createElement('div');
        n.className = `notification notification-${type}`;
        n.style.zIndex = 99999;
        n.innerHTML = `
            <div style="display:flex;gap:.6rem;align-items:center;">
                <div style="font-weight:700">${message}</div>
                <button onclick="this.parentElement.parentElement.remove()" style="margin-left:8px;background:none;border:none;cursor:pointer">✖</button>
            </div>
        `;
        document.body.appendChild(n);
        setTimeout(()=>{ n.remove(); }, ttl);
    } catch(e){ console.log('notif err', e); }
}

function showLoading(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        <div class="loading-state">
            <div class="loading-spinner" style="width:40px;height:40px;border:4px solid #ddd;border-top-color:#007bff;border-radius:50%;animation:spin 1s linear infinite;margin:1rem auto"></div>
            <p style="text-align:center;color:#666">Loading resources...</p>
        </div>
    `;
}

function showError(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        <div class="error-state" style="text-align:center;padding:2rem;color:#b00020">
            <div style="font-size:2rem;margin-bottom:.5rem">⚠</div>
            <h3>Something went wrong</h3>
            <p>${escapeHtml(message)}</p>
            <button class="btn-primary" style="margin-top:1rem;padding:.5rem 1rem" onclick="loadResources()">Try Again</button>
        </div>
    `;
}

// ---------- STATE ----------
let cachedResources = []; // last successful resources list
let authToken = localStorage.getItem('authToken') || null;

// ---------- API FUNCTIONS ----------
async function populateUploadFormSubjects() {
    const select = document.getElementById('uploadSubject');
    if (!select) {
        log('uploadSubject select not present on page - skipping populateUploadFormSubjects');
        return;
    }
    select.innerHTML = '<option value="">Loading subjects...</option>';
    try {
        const res = await fetch(`${API_BASE}/resources/subjects/`);
        log('subjects status', res.status);
        if (!res.ok) throw new Error('Failed to fetch subjects from server');
        const subjects = await res.json();
        if (!Array.isArray(subjects) || subjects.length === 0) {
            select.innerHTML = '<option value="">No subjects found (admin).</option>';
            return;
        }
        select.innerHTML = '<option value="">Select a subject...</option>' +
            subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}${s.semester ? ' - Sem ' + s.semester : ''}</option>`).join('');
    } catch (error) {
        err('populateUploadFormSubjects error', error);
        select.innerHTML = '<option value="">Could not load subjects</option>';
    }
}

async function loadSubjects() {
    try {
        const res = await fetch(`${API_BASE}/resources/subjects/`);
        log('/resources/subjects/ status', res.status);
        if (!res.ok) throw new Error('Failed to load subjects');
        const subjects = await res.json();
        populateSubjectFilter(subjects);
        // also fill upload subject dropdown (if present)
        const uploadSelect = document.getElementById('uploadSubject');
        if (uploadSelect) {
            uploadSelect.innerHTML = '<option value="">Select a subject...</option>' +
            subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}${s.semester ? ' - Sem ' + s.semester : ''}</option>`).join('');
        }
    } catch (error) {
        err('loadSubjects err', error);
    }
}

// ---------- RESOURCES ----------

async function loadResources() {
    const gridEl = document.getElementById('resourcesGrid');
    if (!gridEl) { warn('resourcesGrid not in DOM; skipping loadResources'); return; }

    // Safely read filters
    const subjectFilterEl = document.getElementById('subjectFilter');
    const typeFilterEl = document.getElementById('typeFilter');
    const semesterFilterEl = document.getElementById('semesterFilter');
    const searchInputEl = document.getElementById('searchInput');

    const subjectFilter = subjectFilterEl ? subjectFilterEl.value : '';
    const typeFilter = typeFilterEl ? typeFilterEl.value : '';
    const semesterFilter = semesterFilterEl ? semesterFilterEl.value : '';
    const searchInput = searchInputEl ? searchInputEl.value : '';

    showLoading('resourcesGrid');

    try {
        let url = `${API_BASE}/resources/files/`;
        const params = new URLSearchParams();
        if (subjectFilter) params.append('subject', subjectFilter);
        if (typeFilter) params.append('type', typeFilter);
        if (semesterFilter) params.append('semester', semesterFilter);
        if (searchInput) params.append('search', searchInput);
        if (params.toString()) url += `?${params.toString()}`;

        log('fetching resources from', url);
        const res = await fetch(url, { method: 'GET' });
        log('/resources/files/ status', res.status);

        if (!res.ok) {
            // fallback: use cachedResources if available
            if (Array.isArray(cachedResources) && cachedResources.length > 0) {
                log('fetch failed but cached resources available - using cache');
                displayResources(cachedResources);
                showNotification('Using cached resources (offline)', 'warning', 3000);
                return;
            }
            throw new Error(`Server returned ${res.status}`);
        }

        const resources = await res.json();
        if (!Array.isArray(resources)) {
            throw new Error('Invalid resources response format');
        }
        cachedResources = resources;
        displayResources(resources);
    } catch (error) {
        err('loadResources error', error);
        // if we have cached resources, show them
        if (Array.isArray(cachedResources) && cachedResources.length > 0) {
            displayResources(cachedResources);
            showNotification('Offline: showing cached resources', 'info', 3000);
        } else {
            showError('resourcesGrid', 'Failed to load resources. Please try again later.');
        }
    }
}

function displayResources(resources) {
    const grid = document.getElementById('resourcesGrid');
    if (!grid) return;

    if (!Array.isArray(resources) || resources.length === 0) {
        grid.innerHTML = `
            <div class="no-resources" style="text-align:center;padding:2rem;color:#666">
                <div style="font-size:2rem;margin-bottom:.6rem">📭</div>
                <h3>No Resources Found</h3>
                <p>Try adjusting filters or ask admin to upload resources.</p>
                <button class="btn-primary" onclick="clearFilters()" style="margin-top:1rem;padding:.5rem 1rem">Clear Filters</button>
            </div>
        `;
        return;
    }

    grid.innerHTML = resources.map(r => {
        const subjectName = r.subject ? escapeHtml(r.subject.name) : 'Unknown Subject';
        const year = r.uploaded_at ? new Date(r.uploaded_at).getFullYear() : '';
        const uploaderName = r.uploaded_by || 'Admin';
        const pdfUrl = getAbsoluteUrl(r.pdf_file || '');

        // Description
        const desc = getResourceDescription(r);

        return `
        <div class="resource-card" data-id="${r.id}" style="border:1px solid #eee;padding:1rem;border-radius:8px;margin-bottom:1rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
                <div style="font-size:0.9rem;color:#555">
                    <i class="${getTypeIcon(r.resource_type)}"></i> ${getTypeDisplayName(r.resource_type)}
                </div>
                <div style="font-size:0.8rem;color:#888">${escapeHtml(subjectName)}</div>
            </div>
            <h3 style="margin:.25rem 0">${escapeHtml(r.title)}</h3>
            <p style="color:#555;margin:.25rem 0">${escapeHtml(desc)}</p>
            <div style="display:flex;gap:.6rem;margin-top:.6rem">
                <button class="btn-primary" onclick="downloadResource(${r.id}, '${pdfUrl}')" ${!authToken ? 'disabled' : ''} style="padding:.4rem .7rem">
                    <i class="fas fa-download"></i> ${authToken ? 'Download PDF' : 'Login to Download'}
                </button>
                <button class="btn-secondary" onclick="previewResource('${pdfUrl}')" style="padding:.4rem .7rem">
                    <i class="fas fa-eye"></i> Preview
                </button>
            </div>
            <div style="margin-top:.6rem;font-size:0.8rem;color:#999">
                Uploaded by ${escapeHtml(uploaderName)} ${year ? `• ${year}` : ''}
            </div>
        </div>
        `;
    }).join('');
}

function getTypeIcon(type) {
    const map = {
        'notes': 'fas fa-book',
        'question_paper': 'fas fa-file-pdf',
        'syllabus': 'fas fa-clipboard-list'
    };
    return map[type] || 'fas fa-file';
}

function getTypeDisplayName(type) {
    const map = {
        'notes': 'Handwritten Notes',
        'question_paper': 'Question Paper',
        'syllabus': 'Syllabus'
    };
    return map[type] || (type ? type.replace('_',' ') : 'Resource');
}

function getResourceDescription(r) {
    const subj = r.subject ? r.subject.name : 'this subject';
    return `Download this ${getTypeDisplayName(r.resource_type).toLowerCase()} for ${subj}.`;
}

// ---------- ACTIONS ----------
async function downloadResource(resourceId, pdfUrl) {
    if (!localStorage.getItem('authToken')) {
        showNotification('Please login to download resources', 'warning', 3000);
        if (typeof openLoginModal === 'function') openLoginModal();
        return;
    }
    try {
        // log download (best-effort)
        await _fetchWithAuth(`${API_BASE}/resources/files/${resourceId}/download/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        // non-blocking
        warn('download log error', e);
    }
    const finalUrl = getAbsoluteUrl(pdfUrl || '');
    if (!finalUrl) { showNotification('Resource URL invalid', 'error'); return; }
    window.open(finalUrl, '_blank');
}

function previewResource(pdfUrl) {
    const finalUrl = getAbsoluteUrl(pdfUrl || '');
    if (!finalUrl) { showNotification('Resource URL invalid', 'error'); return; }
    window.open(finalUrl, '_blank');
}

// History
async function loadHistory() {
    const body = document.getElementById('historyModalBody');
    if (!body) { warn('historyModalBody not found'); return; }
    body.innerHTML = `<div style="text-align:center;padding:2rem"><div class="loading-spinner" style="width:40px;height:40px;border:4px solid #ddd;border-top-color:#007bff;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto"></div><p>Loading history...</p></div>`;
    try {
        const res = await _fetchWithAuth(`${API_BASE}/resources/history/`);
        if (!res.ok) throw new Error('Failed to fetch history');
        const items = await res.json();
        if (!Array.isArray(items) || items.length === 0) {
            body.innerHTML = `<div style="text-align:center;padding:2rem;color:#666">No download history.</div>`;
            return;
        }
        body.innerHTML = items.map(it => {
            const resource = it.resource || {};
            const time = it.downloaded_at ? new Date(it.downloaded_at).toLocaleString() : '';
            return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:.6rem;border-bottom:1px solid #eee">
                    <div>
                        <strong>${escapeHtml(resource.title || 'Resource')}</strong>
                        <div style="font-size:0.85rem;color:#666">${escapeHtml(resource.subject?.name || '')} • ${time}</div>
                    </div>
                    <div>
                        <button onclick="downloadResource(${resource.id}, '${getAbsoluteUrl(resource.pdf_file||'')}')" style="padding:.35rem .6rem">Download again</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        err('loadHistory err', e);
        body.innerHTML = `<div style="text-align:center;padding:2rem;color:#b00020">Failed to load history.</div>`;
    }
}

// ---------- FILTERS / UTIL ----------
function clearFilters() {
    const subject = document.getElementById('subjectFilter');
    const type = document.getElementById('typeFilter');
    const year = document.getElementById('yearFilter');
    const sem = document.getElementById('semesterFilter');
    const search = document.getElementById('searchInput');
    if (subject) subject.value = '';
    if (type) type.value = '';
    if (year) year.value = '';
    if (sem) sem.value = '';
    if (search) search.value = '';
    loadResources();
}

// ---------- INIT & EVENT LISTENERS ----------
function setupResourceEventListeners() {
    // Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                loadResources();
            }
        });
    }
    const searchBtn = document.querySelector('.btn-search');
    if (searchBtn) searchBtn.addEventListener('click', (e)=>{ e.preventDefault(); loadResources(); });

    // Filters (guard)
    const filters = ['subjectFilter','typeFilter','yearFilter','semesterFilter'];
    filters.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', loadResources);
    });

    // Upload modal trigger (if present)
    const uploadBtn = document.querySelector('.btn-upload');
    if (uploadBtn) uploadBtn.addEventListener('click', async (e) => {
        if (!localStorage.getItem('authToken')) {
            showNotification('Please login to upload resources', 'warning');
            if (typeof openLoginModal === 'function') openLoginModal();
            return;
        }
        await populateUploadFormSubjects();
        if (typeof openUploadModal === 'function') openUploadModal();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // only initialize if resourcesGrid exists OR filters exist (so script is safe on pages without resources)
    const hasResources = !!document.getElementById('resourcesGrid');
    const hasFilters = !!document.getElementById('subjectFilter') || !!document.getElementById('typeFilter');
    if (!hasResources && !hasFilters) {
        log('No resource-related DOM found — skipping initialization');
        return;
    }

    // Update authToken from storage
    authToken = localStorage.getItem('authToken') || null;

    setupResourceEventListeners();
    loadSubjects();
    loadResources();
});

// ---------- small CSS helper for spinner animation (inject once) ----------
(function injectStyles(){
    if (document.getElementById('resources-js-styles')) return;
    const s = document.createElement('style');
    s.id = 'resources-js-styles';
    s.textContent = `
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .btn-primary { background:#007bff;color:#fff;border:0;border-radius:6px;cursor:pointer }
        .btn-secondary { background:#f1f1f1;color:#111;border:0;border-radius:6px;cursor:pointer }
    `;
    document.head.appendChild(s);
})();

// ---------- EXPORTS for debug (optional) ----------
window._RS = {
    loadResources, loadSubjects, populateUploadFormSubjects, cachedResources, getAbsoluteUrl
};
