const AUTH_STORAGE_KEY = "stock_auth_session_v1";
const ACTING_TEAM_KEY = "stock_acting_team_v1";

const ROLE_TAB_ALLOWLIST = {
    admin:       ["inventory", "orders", "needs", "families", "reports", "tasks", "analytics", "notes"],
    call_center: ["inventory", "needs", "orders", "families", "tasks", "analytics", "notes"],
    data_entry:  ["inventory", "needs", "orders", "families", "tasks", "analytics", "notes"],
    stock:       ["inventory", "orders", "families", "reports", "tasks", "analytics", "notes"],
    interaction: ["inventory", "orders", "families", "tasks", "analytics", "notes"],
    super_admin: ["inventory", "orders", "needs", "families", "reports", "tasks", "analytics", "notes", "teamAdmin"],
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

function isSuperAdmin() {
    return Boolean(readSession()?.is_super_admin);
}

function getCurrentTeamId() {
    return readSession()?.team_id ?? null;
}

function getCurrentTeamName() {
    return readSession()?.team_name || "";
}

function getActingTeamId() {
    return localStorage.getItem(ACTING_TEAM_KEY) || "";
}

function setActingTeamId(id) {
    if (id) localStorage.setItem(ACTING_TEAM_KEY, String(id));
    else localStorage.removeItem(ACTING_TEAM_KEY);
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

    if (!allowed.size) return new Set(["inventory", "orders", "needs", "families", "reports", "tasks"]);
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

function updateOrderCreatorLabel() {
    const user = getCurrentUser();
    const label = document.getElementById("orderCreatorLabel");
    if (!label) return;
    const name = user?.name || user?.username;
    label.textContent = name ? `منشئ الطلب: ${name}` : "";
}

function updateAuthBar() {
    const user = getCurrentUser();
    const roles = getUserRoles();
    const label = document.getElementById("authUserLabel");
    const logoutBtn = document.getElementById("logoutBtn");
    const teamSwitcherWrap = document.getElementById("teamSwitcherWrap");
    if (!label) return;

    if (!getAuthToken()) {
        label.textContent = "";
        logoutBtn?.classList.add("hidden");
        teamSwitcherWrap?.classList.add("hidden");
        return;
    }

    const name = user?.name || user?.username || user?.email || "مستخدم";
    const rolesText = roles.length ? `(${roles.join(" / ")})` : "";
    const teamName = getCurrentTeamName();
    const teamText = teamName ? ` — ${teamName}` : "";
    label.textContent = `${name} ${rolesText}${teamText}`.trim();
    logoutBtn?.classList.remove("hidden");
    updateOrderCreatorLabel();

    if (teamSwitcherWrap) {
        teamSwitcherWrap.classList.toggle("hidden", !isSuperAdmin());
        if (isSuperAdmin()) loadTeamSwitcher();
    }
}

async function loadTeamSwitcher() {
    const select = document.getElementById("teamSwitcher");
    if (!select || typeof api === "undefined" || typeof api.getTeams !== "function") return;
    try {
        const teams = await api.getTeams();
        const acting = getActingTeamId();
        select.innerHTML = (teams || [])
            .map((t) => `<option value="${t.id}" ${String(t.id) === String(acting) ? "selected" : ""}>${escapeHtml(t.name)}</option>`)
            .join("");
        if (!acting && teams?.length) {
            setActingTeamId(teams[0].id);
            select.value = String(teams[0].id);
        }
    } catch (error) {
        console.error("Failed to load teams for switcher:", error);
    }
}

function onTeamSwitcherChange(value) {
    setActingTeamId(value);
    location.reload();
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
    const teamId = payload?.team_id ?? null;
    const teamName = payload?.team_name || "";
    const isSuperAdminFlag = Boolean(payload?.is_super_admin);

    if (!token) {
        throw new Error("Login response missing token");
    }

    writeSession({ token, user, roles, allowedTabs, team_id: teamId, team_name: teamName, is_super_admin: isSuperAdminFlag });
    if (!isSuperAdminFlag) setActingTeamId("");
    updateAuthBar();
    applyRoleVisibility();
    window.dispatchEvent(new Event("auth:login"));
}

function logout() {
    writeSession(null);
    setActingTeamId("");
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
window.isSuperAdmin = isSuperAdmin;
window.getCurrentTeamId = getCurrentTeamId;
window.getCurrentTeamName = getCurrentTeamName;
window.getActingTeamId = getActingTeamId;
window.setActingTeamId = setActingTeamId;
window.onTeamSwitcherChange = onTeamSwitcherChange;
