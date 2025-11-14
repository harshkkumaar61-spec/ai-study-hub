// ===== FORM HANDLERS (RESOURCES) =====

async function populateUploadFormSubjects() {
    const select = document.getElementById('uploadSubject');
    select.innerHTML = '<option value="">Loading subjects...</option>';
    try {
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

        // FIX: PDF URL ko poora banaya
        const pdfUrl = resource.pdf_file;

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
                <button class="download-btn" onclick="downloadResource(${resource.id}, '${pdfUrl}')" ${!authToken ? 'disabled' : ''}>
                    <i class="fas fa-download"></i> 
                    ${authToken ? 'Download PDF' : 'Login to Download'}
                </button>
                <button class="preview-btn" onclick="previewResource('${pdfUrl}')">
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
        const response = await fetch(`${API_BASE}/resources/subjects/`);
        if (response.ok) {
            const subjects = await response.json();
            populateSubjectFilter(subjects);
            // Dono (filter aur upload form) ke dropdowns ko populate karo
            populateUploadFormSubjectsList(subjects); 
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

// Upload form ke subject dropdown ko bharne ke liye (renamed from duplicate)
function populateUploadFormSubjectsList(subjects) {
    const select = document.getElementById('uploadSubject');
    if (!select) return;
    
    if(subjects && subjects.length > 0) {
        select.innerHTML = '<option value="">Select a subject...</option>';
        select.innerHTML += subjects.map(subject => 
            `<option value="${subject.id}">${subject.name} ${subject.semester ? '- Sem ' + subject.semester : ''}</option>`
        ).join('');
    } else {
        select.innerHTML = '<option value="">Loading subjects...</option>';
        if(!subjects) {
             loadSubjects();
        }
    }
}


// ===== SEARCH AND FILTER =====
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
    loadResources(); // Simple reload, aap baad mein pagination add kar sakte hain
}

// ===== RESOURCE ACTIONS =====
async function downloadResource(resourceId, pdfUrl) {
    if (!authToken) {
        showNotification('Please login to download resources', 'warning');
        openLoginModal();
        return;
    }
    
    try {
        await fetchWithAuth(`${API_BASE}/resources/files/${resourceId}/download/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Error logging download:', error);
    }
    
    window.open(pdfUrl, '_blank');
}

function previewResource(pdfUrl) {
    window.open(pdfUrl, '_blank');
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
        const response = await fetchWithAuth(`${API_BASE}/resources/history/`);
        
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
