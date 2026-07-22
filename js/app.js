const API_URL = "http://localhost:8000";

// --- Global Fetch Interceptor to Handle Session Expiration ---
const originalFetch = window.fetch;
window.fetch = async function (...args) {
    try {
        const response = await originalFetch(...args);
        if (response.status === 401) {
            const path = window.location.pathname;
            if (!path.endsWith("index.html") && path !== "/" && !path.endsWith("login.html")) {
                localStorage.removeItem("token");
                localStorage.removeItem("role_id");
                localStorage.removeItem("full_name");
                localStorage.removeItem("must_change_password");
                window.location.href = "index.html";
            }
        }
        return response;
    } catch (error) {
        throw error;
    }
};

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
    localStorage.removeItem("full_name");
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
            localStorage.setItem("full_name", payload.full_name || "");
            localStorage.setItem("must_change_password", payload.must_change_password || false);

            // Route to specific HTML files based on role
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

// --- Display User Name in Nav ---
async function displayUserName() {
    const token = localStorage.getItem("token");
    if (!token) return;

    let fullName = localStorage.getItem("full_name") || "";

    // Try decoding from JWT payload if not in localStorage
    if (!fullName) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.full_name) {
                fullName = payload.full_name;
            }
        } catch (e) {}
    }

    const greetingEl = document.getElementById("navUserGreeting");
    if (greetingEl && fullName && !fullName.includes('@')) {
        greetingEl.innerHTML = `Welcome, <strong>${fullName}</strong>`;
    }

    // Fetch user profile from /users/me to guarantee name display even for existing sessions
    try {
        const userProfile = await apiGet("/users/me");
        if (userProfile && userProfile.full_name) {
            fullName = userProfile.full_name;
            localStorage.setItem("full_name", fullName);
            if (greetingEl) {
                greetingEl.innerHTML = `Welcome, <strong>${fullName}</strong>`;
            }
        }
    } catch (err) {
        console.error("Failed to fetch user profile:", err);
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

// --- Request Details Modal ---
let cachedRequestsMap = {};

function cacheRequestsData(requests) {
    if (!Array.isArray(requests)) return;
    requests.forEach(r => {
        cachedRequestsMap[r.id] = r;
    });
}

async function openRequestDetailsModal(requestId) {
    let req = cachedRequestsMap[requestId];
    if (!req) {
        try {
            req = await apiGet(`/requests/${requestId}`);
        } catch (e) {
            console.error("Failed to fetch request details:", e);
        }
    }
    if (!req) {
        showAlert("Request details not found.", false);
        return;
    }

    const existing = document.getElementById("requestDetailsModal");
    if (existing) existing.remove();

    const categoryMap = { 1: 'Electricity', 2: 'Furniture', 3: 'Plumbing', 4: 'Internet/IT' };
    const categoryName = req.category ? req.category.name : (categoryMap[req.category_id] || `Category #${req.category_id}`);
    const assignedTo = req.assigned_to_name ? req.assigned_to_name : "Not Assigned Yet";
    const requesterName = req.requester_name ? req.requester_name : `User #${req.requester_id}`;
    const statusCls = req.status ? req.status.toLowerCase().replace(/ /g, '-') : 'pending';
    const createdDate = req.created_at ? new Date(req.created_at).toLocaleString() : 'N/A';
    const priority = req.priority || 'Medium';

    const pClassMap = {
        'High': 'badge-priority-high',
        'Medium': 'badge-priority-medium',
        'Low': 'badge-priority-low'
    };
    const priorityCls = pClassMap[priority] || 'badge-priority-medium';

    let logsHtml = '<p style="color:#9ca3af; font-size:0.85rem; font-style:italic;">No status updates logged yet.</p>';
    if (req.logs && req.logs.length > 0) {
        logsHtml = req.logs.map(log => {
            const updater = log.updater_name || `User #${log.updated_by}`;
            const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleString() : '';
            const commentStr = log.comments ? `<div style="margin-top:0.35rem; padding:0.5rem; background:#f9fafb; border-left:3px solid #3b82f6; border-radius:4px; font-size:0.85rem; color:#374151;">"${log.comments}"</div>` : '';
            return `
                <div style="padding:0.6rem 0; border-bottom:1px solid #f3f4f6;">
                    <div style="display:flex; justify-content:space-between; font-size:0.82rem; color:#4b5563; font-weight:600;">
                        <span>Status updated to <strong style="color:#1e3a8a;">${log.new_status}</strong> by ${updater}</span>
                        <span style="color:#9ca3af; font-weight:normal;">${timeStr}</span>
                    </div>
                    ${commentStr}
                </div>
            `;
        }).join('');
    }

    const modal = document.createElement("div");
    modal.id = "requestDetailsModal";
    modal.className = "modal";
    modal.style.display = "flex";
    modal.style.zIndex = "99999";
    modal.innerHTML = `
        <div class="modal-content" style="width: 580px; max-width: 92%; max-height: 90vh; overflow-y: auto; padding: 1.8rem; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.25);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.2rem; border-bottom: 2px solid #f3f4f6; padding-bottom: 0.8rem;">
                <div>
                    <span style="font-size:0.8rem; font-weight:700; color:#6b7280; text-transform:uppercase; letter-spacing:0.5px;">Service Request #${req.id}</span>
                    <h2 style="font-size: 1.25rem; color: #1e3a8a; margin-top: 0.2rem; font-weight: 700;">${req.title}</h2>
                </div>
                <button onclick="document.getElementById('requestDetailsModal').remove()" style="background:none; border:none; font-size:1.5rem; color:#9ca3af; cursor:pointer; padding:0 0.5rem; line-height:1;">&times;</button>
            </div>

            <!-- Details Grid -->
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; background: #f8fafc; padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 1.2rem;">
                <div>
                    <div style="font-size: 0.75rem; color: #6b7280; text-transform: uppercase; font-weight: 600;">Status</div>
                    <div style="margin-top: 0.25rem;"><span class="badge badge-${statusCls}">${req.status}</span></div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: #6b7280; text-transform: uppercase; font-weight: 600;">Priority</div>
                    <div style="margin-top: 0.25rem;"><span class="badge ${priorityCls}">${priority}</span></div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: #6b7280; text-transform: uppercase; font-weight: 600;">Category</div>
                    <div style="margin-top: 0.25rem;"><span class="badge badge-category">${categoryName}</span></div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: #6b7280; text-transform: uppercase; font-weight: 600;">Assigned To</div>
                    <div style="margin-top: 0.25rem; font-weight: 600; color: #1e3a8a; font-size: 0.9rem;">${assignedTo}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: #6b7280; text-transform: uppercase; font-weight: 600;">Submitted By</div>
                    <div style="margin-top: 0.25rem; font-weight: 600; color: #374151; font-size: 0.85rem;">${requesterName}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: #6b7280; text-transform: uppercase; font-weight: 600;">Date Submitted</div>
                    <div style="margin-top: 0.25rem; color: #4b5563; font-size: 0.85rem;">${createdDate}</div>
                </div>
            </div>

            <!-- Description -->
            <div style="margin-bottom: 1.2rem;">
                <h4 style="font-size: 0.88rem; color: #374151; margin-bottom: 0.4rem; font-weight: 700;">Description</h4>
                <div style="background: #ffffff; padding: 0.85rem; border-radius: 8px; border: 1px solid #e5e7eb; font-size: 0.9rem; color: #1f2937; line-height: 1.5; white-space: pre-wrap;">${req.description || 'No description provided.'}</div>
            </div>

            <!-- Activity & Audit Log -->
            <div>
                <h4 style="font-size: 0.88rem; color: #374151; margin-bottom: 0.4rem; font-weight: 700;">Activity & Audit Log</h4>
                <div style="background: #ffffff; padding: 0.85rem; border-radius: 8px; border: 1px solid #e5e7eb; max-height: 180px; overflow-y: auto;">
                    ${logsHtml}
                </div>
            </div>

            <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem;">
                <button class="btn-secondary" onclick="document.getElementById('requestDetailsModal').remove()">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}