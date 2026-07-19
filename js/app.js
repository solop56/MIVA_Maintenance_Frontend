const API_URL = "http://localhost:8000";

// --- Notifications ---
function showAlert(msg, isSuccess = true) {
    const box = document.getElementById("alertBox");
    box.innerText = msg;
    box.className = `alert ${isSuccess ? 'alert-success' : 'alert-error'}`;
    box.style.display = 'block';
    setTimeout(() => box.style.display = 'none', 5000);
}

// --- Session & Routing ---
function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role_id");
    localStorage.removeItem("must_change_password");
    window.location.href = "index.html";
}

function verifyAccess(requiredRole) {
    const token = localStorage.getItem("token");
    const roleId = parseInt(localStorage.getItem("role_id"));
    if (!token || roleId !== requiredRole) {
        window.location.href = "index.html";
    }
}

// --- Auth Handling ---
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;

    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);

    try {
        const res = await fetch(`${API_URL}/users/login`, { method: "POST", body: formData });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem("token", data.access_token);
            const payload = JSON.parse(atob(data.access_token.split('.')[1]));
            localStorage.setItem("role_id", payload.role_id);
            localStorage.setItem("must_change_password", payload.must_change_password || false);

            // Route to specific HTML files based on role[cite: 1]
            if (payload.role_id === 1) window.location.href = "admin.html";
            else if (payload.role_id === 2) window.location.href = "maintenance.html";
            else window.location.href = "student.html";
        } else {
            showAlert(data.detail || "Login failed.", false);
        }
    } catch (err) {
        showAlert("Unable to connect to server. Please try again.", false);
    }
}

// --- Modals ---
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// --- API Fetch Functions ---
async function apiGet(endpoint) {
    const res = await fetch(`${API_URL}${endpoint}`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    });
    return res.json();
}

// --- Force Change Password ---
// Checks if the current user must change their password and shows a non-dismissable modal
function checkForceChangePassword() {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.must_change_password === true) {
            showForceChangePasswordModal();
        }
    } catch (e) {
        console.error("Failed to decode token:", e);
    }
}

function showForceChangePasswordModal() {
    // Remove any existing one first
    const existing = document.getElementById("forceChangeOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "forceChangeOverlay";
    overlay.className = "force-change-overlay";
    overlay.innerHTML = `
        <div class="force-change-card">
            <div class="lock-icon">🔒</div>
            <h3>Password Change Required</h3>
            <p class="subtitle">For security reasons, you must set a new password before continuing.</p>
            
            <div id="forceChangeAlert" class="alert" style="display: none;"></div>
            
            <form onsubmit="handleForceChangePassword(event)">
                <div class="form-group">
                    <label for="forceCurrentPwd">Current Password</label>
                    <input type="password" id="forceCurrentPwd" class="form-control" 
                           placeholder="Enter the password you received" required>
                </div>
                <div class="form-group">
                    <label for="forceNewPwd">New Password</label>
                    <input type="password" id="forceNewPwd" class="form-control" 
                           placeholder="Choose a new password" required minlength="6">
                </div>
                <div class="form-group">
                    <label for="forceConfirmPwd">Confirm New Password</label>
                    <input type="password" id="forceConfirmPwd" class="form-control" 
                           placeholder="Confirm your new password" required minlength="6">
                </div>
                <button type="submit" class="btn-primary" id="btnForceChange">Update Password</button>
            </form>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function handleForceChangePassword(e) {
    e.preventDefault();
    
    const alertBox = document.getElementById("forceChangeAlert");
    const currentPwd = document.getElementById("forceCurrentPwd").value;
    const newPwd = document.getElementById("forceNewPwd").value;
    const confirmPwd = document.getElementById("forceConfirmPwd").value;
    const btn = document.getElementById("btnForceChange");

    // Validate passwords match
    if (newPwd !== confirmPwd) {
        alertBox.innerText = "New passwords do not match.";
        alertBox.className = "alert alert-error";
        alertBox.style.display = "block";
        return;
    }

    if (newPwd === currentPwd) {
        alertBox.innerText = "New password must be different from current password.";
        alertBox.className = "alert alert-error";
        alertBox.style.display = "block";
        return;
    }

    btn.disabled = true;
    btn.textContent = "Updating...";

    try {
        const res = await fetch(`${API_URL}/users/change-password`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify({
                current_password: currentPwd,
                new_password: newPwd
            })
        });

        const data = await res.json();

        if (res.ok) {
            // Update the token with the new one (must_change_password = false)
            localStorage.setItem("token", data.access_token);
            localStorage.setItem("must_change_password", "false");
            
            // Remove the modal
            const overlay = document.getElementById("forceChangeOverlay");
            if (overlay) overlay.remove();

            showAlert("Password updated successfully! Welcome to the portal.");
        } else {
            alertBox.innerText = data.detail || "Failed to change password.";
            alertBox.className = "alert alert-error";
            alertBox.style.display = "block";
        }
    } catch (err) {
        alertBox.innerText = "Network error. Please try again.";
        alertBox.className = "alert alert-error";
        alertBox.style.display = "block";
    } finally {
        btn.disabled = false;
        btn.textContent = "Update Password";
    }
}