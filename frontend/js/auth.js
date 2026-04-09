const AUTH_STORAGE_KEY = "stock_auth_session_v1";

const ROLE_TAB_ALLOWLIST = {
    admin: ["inventory", "orders", "needs", "families", "reports"],
    call_center: ["needs", "orders", "families"],
    data_entry: ["needs", "orders", "families"],
    stock: ["inventory", "orders", "families", "reports"],
};

function getApiBase() {
    return window.STOCK_API_BASE || "http://localhost:4001/api";
}

function readSession() {
    try {
        return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
    } catch (_error) {
        return null;
    }
}

function writeSession(session) {
    if (!session) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return;
    }
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function getAuthToken() {
    return readSession()?.token || "";
}

function getCurrentUser() {
    return readSession()?.user || null;
}

function getUserRoles() {
    const session = readSession();
    const roles =
        session?.roles ||
        session?.user?.roles ||
        session?.user?.role ||
        session?.user?.user_role ||
        [];
    if (Array.isArray(roles)) return roles.map((role) => String(role).trim()).filter(Boolean);
    return [String(roles).trim()].filter(Boolean);
}

function getExplicitAllowedTabs() {
    const session = readSession();
    const raw =
        session?.allowedTabs ||
        session?.allowed_pages ||
        session?.user?.allowedTabs ||
        session?.user?.allowed_pages ||
        null;
    if (!raw) return null;
    if (Array.isArray(raw)) return raw.map((tab) => String(tab).trim()).filter(Boolean);
    return String(raw)
        .split(",")
        .map((tab) => tab.trim())
        .filter(Boolean);
}

function getAllowedTabs() {
    const explicit = getExplicitAllowedTabs();
    if (explicit?.length) return new Set(explicit);

    const roles = getUserRoles();
    if (!roles.length) {
        return new Set(["inventory", "orders", "needs", "families", "reports"]);
    }

    const allowed = new Set();
    roles.forEach((role) => {
        const list = ROLE_TAB_ALLOWLIST[String(role).toLowerCase()];
        (list || []).forEach((tab) => allowed.add(tab));
    });

    if (!allowed.size) return new Set(["inventory", "orders", "needs", "families", "reports"]);
    return allowed;
}

function canAccessTab(tabName) {
    const allowed = getAllowedTabs();
    return allowed.has(tabName);
}

function setAuthOverlayVisible(visible) {
    const overlay = document.getElementById("loginOverlay");
    if (!overlay) return;
    overlay.classList.toggle("active", Boolean(visible));
    overlay.setAttribute("aria-hidden", visible ? "false" : "true");
    document.body.classList.toggle("auth-locked", Boolean(visible));
    document.body.style.overflow = visible ? "hidden" : "";
}

function setLoginError(message = "") {
    const element = document.getElementById("loginError");
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("hidden", !message);
}

function updateAuthBar() {
    const user = getCurrentUser();
    const roles = getUserRoles();
    const label = document.getElementById("authUserLabel");
    const logoutBtn = document.getElementById("logoutBtn");
    if (!label) return;

    if (!getAuthToken()) {
        label.textContent = "";
        logoutBtn?.classList.add("hidden");
        return;
    }

    const name = user?.username || user?.name || user?.email || "مستخدم";
    const rolesText = roles.length ? `(${roles.join(" / ")})` : "";
    label.textContent = `${name} ${rolesText}`.trim();
    logoutBtn?.classList.remove("hidden");
}

function applyRoleVisibility() {
    const allowed = getAllowedTabs();

    document.querySelectorAll("[data-tab-target]").forEach((button) => {
        const tab = button.dataset.tabTarget;
        const canView = allowed.has(tab);
        button.classList.toggle("hidden", !canView);
        button.setAttribute("aria-hidden", canView ? "false" : "true");
        button.tabIndex = canView ? 0 : -1;
    });

    document.querySelectorAll(".section").forEach((section) => {
        const canView = allowed.has(section.id);
        section.classList.toggle("hidden", !canView);
        section.setAttribute("aria-hidden", canView ? "false" : "true");
    });

    const currentActive = document.querySelector(".section.active")?.id;
    if (currentActive && !allowed.has(currentActive)) {
        const firstAllowed = Array.from(allowed)[0];
        if (firstAllowed && typeof switchTab === "function") {
            switchTab(firstAllowed);
        }
    }
}

async function login(username, password) {
    console.log(username, password);
    const response = await fetch(`${getApiBase()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
    });

    const text = await response.text();
    let payload = null;
    if (text) {
        try {
            payload = JSON.parse(text);
        } catch (_error) {
            payload = { error: text };
        }
    }

    if (!response.ok) {
        throw new Error(payload?.error || "Invalid credentials");
    }

    const token = payload?.token || payload?.access_token || payload?.jwt || "";
    const user = payload?.user || payload?.data?.user || payload?.account || null;
    const roles = payload?.roles || user?.roles || user?.role || null;
    const allowedTabs = payload?.allowedTabs || payload?.allowed_pages || user?.allowedTabs || user?.allowed_pages || null;

    if (!token) {
        throw new Error("Login response missing token");
    }

    writeSession({ token, user, roles, allowedTabs });
    updateAuthBar();
    applyRoleVisibility();
    window.dispatchEvent(new Event("auth:login"));
}

function logout() {
    writeSession(null);
    location.reload();
}

function setupAuthUi() {
    const form = document.getElementById("loginForm");
    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            setLoginError("");
            const username = document.getElementById("loginUsername")?.value?.trim();
            const password = document.getElementById("loginPassword")?.value ?? "";
            if (!username || !password) {
                setLoginError("أدخل اسم المستخدم وكلمة المرور.");
                return;
            }
            form.querySelector("button[type='submit']")?.setAttribute("disabled", "disabled");
            try {
                await login(username, password);
                setAuthOverlayVisible(false);
            } catch (error) {
                console.error(error);
                setLoginError("بيانات الدخول غير صحيحة أو حدث خطأ في الاتصال.");
            } finally {
                form.querySelector("button[type='submit']")?.removeAttribute("disabled");
            }
        });
    }

    document.getElementById("logoutBtn")?.addEventListener("click", logout);

    updateAuthBar();
    if (getAuthToken()) {
        setAuthOverlayVisible(false);
        applyRoleVisibility();
    } else {
        setAuthOverlayVisible(true);
        setTimeout(() => document.getElementById("loginUsername")?.focus(), 0);
    }
}

function requireAuth() {
    if (getAuthToken()) return Promise.resolve();

    return new Promise((resolve) => {
        window.addEventListener(
            "auth:login",
            () => {
                resolve();
            },
            { once: true },
        );
    });
}

window.getAuthToken = getAuthToken;
window.getCurrentUser = getCurrentUser;
window.getUserRoles = getUserRoles;
window.getAllowedTabs = getAllowedTabs;
window.canAccessTab = canAccessTab;
window.setupAuthUi = setupAuthUi;
window.requireAuth = requireAuth;
