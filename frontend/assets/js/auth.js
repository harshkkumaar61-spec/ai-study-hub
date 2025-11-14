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
        
        const refreshSuccess = await refreshToken();

        if (refreshSuccess) {
            options.headers['Authorization'] = `Bearer ${authToken}`; // Naya token
            console.log('Retrying request with new token...');
            response = await fetch(url, options); // Retry
        } else {
            return response;
        }
    }
    return response;
}
// ===== 🚀 REFRESH LOGIC END 🚀 =====


// ===== AUTHENTICATION FUNCTIONS =====
async function verifyEmailToken(token) {
    try {
        // FIX: URL ko verify-email kiya
        const response = await fetch(`${API_BASE}/auth/verify-email/`, { 
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ token: token })
        });
        const data = await response.json();
        if (response.ok) {
            showNotification(data.message, 'success');
            openLoginModal();
        } else {
            showNotification(data.error || 'Verification failed.', 'error');
        }
    } catch (error) {
        console.error('Verification error:', error);
        showNotification('An error occurred during verification.', 'error');
    }
}


async function fetchUserProfile() {
    if (!authToken) {
        updateNavForLoggedInUser();
        return;
    }
    try {
        const response = await fetchWithAuth(`${API_BASE}/auth/profile/`);
        if (response.ok) {
            currentUser = await response.json();
            updateNavForLoggedInUser();
        } else {
            console.error('Token invalid, logging out.');
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

// ===== FORM HANDLERS (AUTH) =====
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<div class="loading"></div> Logging in...';
    submitBtn.disabled = true;

    try {
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
            loadResources(); // Refresh resources after login
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
        const response = await fetch(`${API_BASE}/auth/register/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(formData)
        });
        const data = await response.json();
        if (response.status === 201) {
            showNotification(data.message, 'success');
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
        const response = await fetchWithAuth(`${API_BASE}/auth/profile/update/`, {
            method: 'PATCH',
            body: formData
        });
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
