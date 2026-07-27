let teamAdminTeams = [];
let teamAdminUsers = [];
let teamAdminRoles = [];

async function loadTeamAdmin() {
    if (typeof isSuperAdmin !== "function" || !isSuperAdmin()) return;
    try {
        const [teams, roles, users] = await Promise.all([api.getTeams(), api.getRoles(), api.getUsers()]);
        teamAdminTeams = teams || [];
        teamAdminRoles = roles || [];
        teamAdminUsers = users || [];
    } catch (err) {
        console.error("Failed to load team admin data:", err);
    }
    renderTeamAdmin();
}

function renderTeamAdmin() {
    renderTeamsCard();
    renderUsersCard();
}

function renderTeamsCard() {
    const card = document.getElementById("teamsManagerCard");
    if (!card) return;

    card.innerHTML = `
        <div class="item-type-manager-header">
            <h3>الفرق</h3>
        </div>
        <div class="item-type-add-row">
            <input id="newTeamName" placeholder="اسم الفريق الجديد" onkeydown="if(event.key==='Enter') createTeamAdmin()">
            <button class="done" type="button" onclick="createTeamAdmin()">
                <i class="bi bi-plus-lg"></i> إضافة
            </button>
        </div>
        <div class="item-type-list">
            ${teamAdminTeams.length === 0
                ? `<p class="muted-text">لا توجد فرق بعد — أضف أول فريق</p>`
                : teamAdminTeams.map((t) => `
                    <div class="item-type-row">
                        <div class="item-type-row-info">
                            <span class="item-type-name">${escapeHtml(t.name)}</span>
                            <span class="item-type-item-count">${t.is_active ? "نشط" : "معطل"}</span>
                        </div>
                        <div class="item-type-actions">
                            <button class="item-type-btn-edit" type="button" title="تعديل الاسم"
                                    onclick="renameTeamAdmin(${t.id}, '${escapeHtml(t.name)}')">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="item-type-btn-delete" type="button" title="${t.is_active ? "تعطيل" : "تفعيل"}"
                                    onclick="toggleTeamActiveAdmin(${t.id}, ${!t.is_active})">
                                <i class="bi ${t.is_active ? "bi-pause-circle" : "bi-play-circle"}"></i>
                            </button>
                        </div>
                    </div>`).join("")}
        </div>
    `;
}

async function createTeamAdmin() {
    const input = document.getElementById("newTeamName");
    const name = input?.value.trim();
    if (!name) return alert("أدخل اسم الفريق");

    try {
        await api.createTeam({ name });
        input.value = "";
        await loadTeamAdmin();
    } catch (err) {
        console.error("Error creating team:", err);
        alert(err?.message || "فشل إضافة الفريق");
    }
}

async function renameTeamAdmin(id, currentName) {
    const newName = prompt("الاسم الجديد للفريق:", currentName);
    if (!newName || newName.trim() === currentName.trim()) return;

    try {
        await api.updateTeam(id, { name: newName.trim() });
        await loadTeamAdmin();
    } catch (err) {
        console.error("Error renaming team:", err);
        alert(err?.message || "فشل تعديل الفريق");
    }
}

async function toggleTeamActiveAdmin(id, nextActive) {
    try {
        await api.updateTeam(id, { is_active: nextActive });
        await loadTeamAdmin();
    } catch (err) {
        console.error("Error updating team status:", err);
        alert("فشل تحديث حالة الفريق");
    }
}

function renderUsersCard() {
    const card = document.getElementById("usersManagerCard");
    if (!card) return;

    const teamOptions = teamAdminTeams.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
    const roleCheckboxes = teamAdminRoles.map((r) => `
        <label class="checkbox-label" style="margin-inline-end:12px;">
            <input type="checkbox" class="newUserRoleChk" value="${escapeHtml(r.name)}"> ${escapeHtml(r.name)}
        </label>`).join("");

    card.innerHTML = `
        <div class="item-type-manager-header">
            <h3>المستخدمون</h3>
        </div>
        <div class="form-grid">
            <input id="newUserUsername" placeholder="اسم المستخدم">
            <input id="newUserPassword" type="password" placeholder="كلمة المرور">
            <input id="newUserName" placeholder="الاسم الكامل (اختياري)">
            <select id="newUserTeam">
                <option value="">اختر الفريق</option>
                ${teamOptions}
            </select>
        </div>
        <div style="margin:0.75rem 0;">${roleCheckboxes || '<p class="muted-text">لا توجد أدوار متاحة</p>'}</div>
        <div class="button-group">
            <button class="done" type="button" onclick="createUserAdmin()">
                <i class="bi bi-plus-lg"></i> إضافة مستخدم
            </button>
        </div>

        <div class="item-type-list" style="margin-top:1rem;">
            ${teamAdminUsers.length === 0
                ? `<p class="muted-text">لا يوجد مستخدمون بعد</p>`
                : teamAdminUsers.map((u) => `
                    <div class="item-type-row">
                        <div class="item-type-row-info">
                            <span class="item-type-name">${escapeHtml(u.name || u.username)} (${escapeHtml(u.username)})</span>
                            <span class="item-type-item-count">${escapeHtml(u.team_name || "-")} · ${escapeHtml((u.roles || []).join("، "))}${u.is_active ? "" : " · معطل"}</span>
                        </div>
                        <div class="item-type-actions">
                            <button class="item-type-btn-edit" type="button" title="تعديل الأدوار"
                                    onclick="editUserRolesAdmin(${u.id}, '${escapeHtml((u.roles || []).join(","))}')">
                                <i class="bi bi-person-gear"></i>
                            </button>
                            <button class="item-type-btn-edit" type="button" title="إعادة تعيين كلمة المرور"
                                    onclick="resetUserPasswordAdmin(${u.id})">
                                <i class="bi bi-key"></i>
                            </button>
                            <button class="item-type-btn-delete" type="button" title="${u.is_active ? "تعطيل" : "تفعيل"}"
                                    onclick="toggleUserActiveAdmin(${u.id}, ${!u.is_active})">
                                <i class="bi ${u.is_active ? "bi-pause-circle" : "bi-play-circle"}"></i>
                            </button>
                        </div>
                    </div>`).join("")}
        </div>
    `;
}

async function createUserAdmin() {
    const username = document.getElementById("newUserUsername")?.value?.trim();
    const password = document.getElementById("newUserPassword")?.value || "";
    const name = document.getElementById("newUserName")?.value?.trim() || null;
    const teamId = document.getElementById("newUserTeam")?.value;
    const roleNames = Array.from(document.querySelectorAll(".newUserRoleChk:checked")).map((el) => el.value);

    if (!username) return alert("أدخل اسم المستخدم");
    if (!password || password.length < 4) return alert("كلمة المرور يجب أن تكون 4 أحرف على الأقل");
    if (!teamId) return alert("اختر الفريق");
    if (!roleNames.length) return alert("اختر دوراً واحداً على الأقل");

    try {
        await api.createUser({ username, password, name, team_id: Number(teamId), role_names: roleNames });
        document.getElementById("newUserUsername").value = "";
        document.getElementById("newUserPassword").value = "";
        document.getElementById("newUserName").value = "";
        await loadTeamAdmin();
    } catch (err) {
        console.error("Error creating user:", err);
        alert(err?.message || "فشل إضافة المستخدم");
    }
}

async function toggleUserActiveAdmin(id, nextActive) {
    try {
        await api.updateUser(id, { is_active: nextActive });
        await loadTeamAdmin();
    } catch (err) {
        console.error("Error updating user status:", err);
        alert("فشل تحديث حالة المستخدم");
    }
}

async function editUserRolesAdmin(id, currentRolesCsv) {
    const available = teamAdminRoles.map((r) => r.name).join("، ");
    const input = prompt(`أدخل الأدوار مفصولة بفاصلة (المتاحة: ${available})`, currentRolesCsv);
    if (input === null) return;
    const roleNames = input.split(",").map((r) => r.trim()).filter(Boolean);
    if (!roleNames.length) return alert("أدخل دوراً واحداً على الأقل");

    try {
        await api.updateUser(id, { role_names: roleNames });
        await loadTeamAdmin();
    } catch (err) {
        console.error("Error updating user roles:", err);
        alert(err?.message || "فشل تعديل الأدوار");
    }
}

async function resetUserPasswordAdmin(id) {
    const newPassword = prompt("كلمة المرور الجديدة (4 أحرف على الأقل):");
    if (!newPassword) return;
    if (newPassword.length < 4) return alert("كلمة المرور يجب أن تكون 4 أحرف على الأقل");

    try {
        await api.resetUserPassword(id, newPassword);
        alert("تم تحديث كلمة المرور");
    } catch (err) {
        console.error("Error resetting password:", err);
        alert(err?.message || "فشل إعادة تعيين كلمة المرور");
    }
}

window.loadTeamAdmin = loadTeamAdmin;
window.createTeamAdmin = createTeamAdmin;
window.renameTeamAdmin = renameTeamAdmin;
window.toggleTeamActiveAdmin = toggleTeamActiveAdmin;
window.createUserAdmin = createUserAdmin;
window.toggleUserActiveAdmin = toggleUserActiveAdmin;
window.editUserRolesAdmin = editUserRolesAdmin;
window.resetUserPasswordAdmin = resetUserPasswordAdmin;
