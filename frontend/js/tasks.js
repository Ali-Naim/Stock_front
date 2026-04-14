let tasks = [];
let taskUsers = [];
let taskRoles = [];
let tasksLoadedOnce = false;
let editingTaskId = null;
let addingSubtaskToParentId = null;
let pendingDoneChange = null; // { taskId, prev }
const expandedParentTasks = new Set();
const taskFilters = {
  search: "",
  status: "",
  roleId: "",
  userId: "",
  daily: "",
};

function isAdminUser() {
  const roles = typeof getUserRoles === "function" ? getUserRoles() : [];
  return roles.includes("admin");
}

function getTaskStatusLabel(status) {
  switch (String(status).trim()) {
    case "pending":     return "قيد التنفيذ";
    case "in_progress": return "قيد المتابعة";
    case "done":        return "مكتمل";
    default:            return String(status || "غير محدد");
  }
}

// ─── Filtering (main view = non-done tasks only) ──────────────────────────────

function getFilteredTasks() {
  const search = taskFilters.search.toLowerCase();
  return (tasks || []).filter((task) => {
    // Done tasks live in the completed section, not the main table
    if (task.status === "done") return false;

    if (taskFilters.status && String(task.status) !== String(taskFilters.status)) return false;
    if (taskFilters.roleId && String(task.assigned_role_id) !== String(taskFilters.roleId)) return false;
    if (taskFilters.userId && String(task.assigned_user_id) !== String(taskFilters.userId)) return false;
    if (taskFilters.daily === "daily"   && !task.is_daily) return false;
    if (taskFilters.daily === "regular" &&  task.is_daily) return false;

    if (!search) return true;
    const title        = String(task.title || "").toLowerCase();
    const description  = String(task.description || "").toLowerCase();
    const assignedName = String(task.assigned_user?.name || task.assigned_user?.username || task.assigned_role?.name || "").toLowerCase();
    const createdBy    = String(task.created_by?.username || "").toLowerCase();
    return title.includes(search) || description.includes(search) || assignedName.includes(search) || createdBy.includes(search);
  });
}

// ─── Hierarchy helpers ────────────────────────────────────────────────────────

function getTaskHierarchy() {
  const filtered   = getFilteredTasks();
  const parentMap  = new Map();
  const subtaskMap = new Map();
  const orphans    = [];

  for (const t of filtered) {
    if (!t.parent_task_id) {
      parentMap.set(t.id, t);
      if (!subtaskMap.has(t.id)) subtaskMap.set(t.id, []);
    }
  }

  // Fill subtaskMap from ALL non-done tasks so progress counts include
  // subtasks that were filtered out of the main list
  for (const t of tasks) {
    if (t.parent_task_id && t.status !== "done" && subtaskMap.has(t.parent_task_id)) {
      const list = subtaskMap.get(t.parent_task_id);
      if (!list.find((x) => x.id === t.id)) list.push(t);
    }
  }

  for (const t of filtered) {
    if (t.parent_task_id && !parentMap.has(t.parent_task_id)) orphans.push(t);
  }

  return { parents: [...parentMap.values()], subtaskMap, orphans };
}

function getTaskProgress(parentId, subtaskMap) {
  const subs = subtaskMap.get(parentId) || [];
  return { done: subs.filter((t) => t.status === "done").length, total: subs.length };
}

function renderProgressBar(done, total) {
  if (!total) return "";
  const pct   = Math.round((done / total) * 100);
  const color = pct === 100 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#94a3b8";
  return `<div class="task-progress" title="${done}/${total} مكتمل">
    <div class="task-progress-bar" style="width:${pct}%;background:${color}"></div>
    <span class="task-progress-label">${done}/${total}</span>
  </div>`;
}

// ─── Status select ────────────────────────────────────────────────────────────

function buildTaskStatusCell(task) {
  return `
    <select class="task-status-select task-status-${escapeHtml(task.status)}"
            onchange="changeTaskStatus(${task.id}, this.value)"
            aria-label="تغيير الحالة">
      <option value="pending"     ${task.status === "pending"     ? "selected" : ""}>⏳ قيد التنفيذ</option>
      <option value="in_progress" ${task.status === "in_progress" ? "selected" : ""}>🔄 قيد المتابعة</option>
      <option value="done"        ${task.status === "done"        ? "selected" : ""}>✅ مكتمل</option>
    </select>
  `;
}

// ─── Row actions ──────────────────────────────────────────────────────────────

function buildTaskRowActions(task, isSubtask) {
  if (!isAdminUser()) return "";
  let btns = `<div class="task-actions">`;
  if (!isSubtask) {
    btns += `<button class="icon-btn" type="button" onclick="openAddSubtaskModal(${task.id})" title="إضافة مهمة فرعية" aria-label="إضافة مهمة فرعية">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>`;
  }
  btns += `<button class="icon-btn" type="button" onclick="openTaskEditModal(${task.id})" aria-label="تعديل">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  </button>
  <button class="icon-btn icon-btn-danger" type="button" onclick="deleteTask(${task.id})" aria-label="حذف">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 7h12M9 7V5h6v2M8 7l1 14h6l1-14"/>
    </svg>
  </button>`;
  btns += `</div>`;
  return btns;
}

// ─── Render main tasks table ──────────────────────────────────────────────────

function renderTasks() {
  const container = document.getElementById("tasksList");
  if (!container) return;

  const { parents, subtaskMap, orphans } = getTaskHierarchy();
  const allItems = [...parents, ...orphans];

  if (!allItems.length) {
    container.innerHTML = renderEmptyState("لا توجد مهام نشطة في الوقت الحالي.");
    return;
  }

  const admin    = isAdminUser();
  const adminTh  = admin ? "<th>إجراءات</th>" : "";
  const colCount = admin ? 9 : 8;
  let rows = "";

  allItems.forEach((task, index) => {
    const subtasks   = subtaskMap.get(task.id) || [];
    const hasSubs    = subtasks.length > 0;
    const isOrphan   = Boolean(task.parent_task_id);
    const isExpanded = expandedParentTasks.has(task.id);

    const assignedName = task.assigned_user?.name || task.assigned_user?.username || task.assigned_role?.name || "غير معروف";
    const isTeamTask   = Boolean(task.assigned_role_id && !task.assigned_user_id);
    const assignedCell = isTeamTask
      ? `<span class="task-team-badge">${escapeHtml(task.assigned_role?.name || assignedName)}</span>`
      : escapeHtml(assignedName);

    const createdBy  = task.created_by?.username || "غير معروف";
    const dueDate    = task.due_date ? String(task.due_date) : "-";
    const dailyBadge = task.is_daily
      ? `<span class="task-daily-badge" title="مهمة يومية">🔁 يومي</span>`
      : "";

    let titleCell = `${dailyBadge}${escapeHtml(task.title)}`;
    if (hasSubs) {
      const { done, total } = getTaskProgress(task.id, subtaskMap);
      titleCell += ` <span class="task-subtask-count ${done === total && total > 0 ? "task-subtask-done" : ""}">${done}/${total} ✓</span>`;
    }
    if (task.achievement_note) {
      titleCell += ` <span class="task-achievement-badge" title="${escapeHtml(task.achievement_note)}">🏆</span>`;
    }

    let descCell = escapeHtml(task.description || "-");
    if (hasSubs) {
      const { done, total } = getTaskProgress(task.id, subtaskMap);
      descCell += renderProgressBar(done, total);
    }

    const expandBtn = hasSubs
      ? `<button class="task-expand-btn" type="button" onclick="toggleSubtaskRows(${task.id})">${isExpanded ? "▼" : "▶"}</button>`
      : "";

    const actions  = buildTaskRowActions(task, isOrphan);
    const rowClass = task.status === "done" ? "task-row-done" : "";

    rows += `
      <tr class="${rowClass}">
        <td>${expandBtn}${index + 1}</td>
        <td>${assignedCell}</td>
        <td>${titleCell}</td>
        <td>${descCell}</td>
        <td>${escapeHtml(dueDate)}</td>
        <td>${buildTaskStatusCell(task)}</td>
        <td>${escapeHtml(createdBy)}</td>
        <td>${escapeHtml(task.created_at ? new Date(task.created_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "-")}</td>
        ${admin ? `<td>${actions}</td>` : ""}
      </tr>
    `;

    if (hasSubs) {
      rows += `
        <tr class="task-subtasks-container${isExpanded ? "" : " hidden"}" data-parent-id="${task.id}">
          <td colspan="${colCount}">
            <div class="task-subtasks-inner">
              <table class="needs-table task-subtasks-table">
                <thead>
                  <tr>
                    <th>م</th><th>المكلف</th><th>المهمة الفرعية</th><th>الوصف</th><th>الموعد النهائي</th><th>الحالة</th>
                    ${admin ? "<th>إجراءات</th>" : ""}
                  </tr>
                </thead>
                <tbody>
                  ${subtasks.map((sub, si) => {
                    const subAssigned = sub.assigned_user?.name || sub.assigned_user?.username || "غير معروف";
                    const subDue      = sub.due_date ? String(sub.due_date) : "-";
                    const subAchieve  = sub.achievement_note
                      ? ` <span class="task-achievement-badge" title="${escapeHtml(sub.achievement_note)}">🏆</span>` : "";
                    return `
                      <tr class="${sub.status === "done" ? "task-row-done" : ""}">
                        <td>${si + 1}</td>
                        <td>${escapeHtml(subAssigned)}</td>
                        <td>${escapeHtml(sub.title)}${subAchieve}</td>
                        <td>${escapeHtml(sub.description || "-")}</td>
                        <td>${escapeHtml(subDue)}</td>
                        <td>${buildTaskStatusCell(sub)}</td>
                        ${admin ? `<td>${buildTaskRowActions(sub, true)}</td>` : ""}
                      </tr>`;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </td>
        </tr>`;
    }
  });

  container.innerHTML = `
    <div class="needs-table-wrap">
      <table class="needs-table">
        <thead>
          <tr>
            <th>م</th><th>المكلف / الفريق</th><th>المهمة</th><th>الوصف</th>
            <th>الموعد النهائي</th><th>الحالة</th><th>أنشئ بواسطة</th><th>تاريخ الإنشاء</th>
            ${adminTh}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function toggleSubtaskRows(parentId) {
  if (expandedParentTasks.has(parentId)) expandedParentTasks.delete(parentId);
  else expandedParentTasks.add(parentId);
  renderTasks();
}

// ─── Completed tasks section ──────────────────────────────────────────────────

function renderCompletedTasks() {
  const container = document.getElementById("taskLogsContainer");
  if (!container) return;

  const completed = (tasks || []).filter((t) => t.status === "done")
    .sort((a, b) => {
      const ta = a.completed_at || a.updated_at || "";
      const tb = b.completed_at || b.updated_at || "";
      return tb.localeCompare(ta);
    });

  if (!completed.length) {
    container.innerHTML = renderEmptyState("لا توجد مهام مكتملة.");
    return;
  }

  const admin = isAdminUser();

  container.innerHTML = `
    <div class="needs-table-wrap">
      <table class="needs-table">
        <thead>
          <tr>
            <th>م</th>
            <th>المهمة</th>
            <th>المكلف / الفريق</th>
            <th>ملاحظة الإنجاز</th>
            <th>اكتملت في</th>
            ${admin ? "<th>إجراءات</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${completed.map((task, i) => {
            const assigned = task.assigned_user?.name || task.assigned_user?.username || task.assigned_role?.name || "غير معروف";
            const isTeam   = Boolean(task.assigned_role_id && !task.assigned_user_id);
            const assignedCell = isTeam
              ? `<span class="task-team-badge">${escapeHtml(assigned)}</span>`
              : escapeHtml(assigned);
            const completedAt = (task.completed_at || task.updated_at)
              ? new Date(task.completed_at || task.updated_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })
              : "-";
            const isSubtask = Boolean(task.parent_task_id);
            const actions = admin ? `<div class="task-actions">
              <button class="icon-btn" type="button" onclick="openTaskEditModal(${task.id})" aria-label="تعديل">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="icon-btn" type="button" onclick="reopenTask(${task.id})" title="إعادة فتح المهمة" aria-label="إعادة فتح">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.49"/>
                </svg>
              </button>
            </div>` : "";
            return `
              <tr>
                <td>${i + 1}</td>
                <td>
                  ${escapeHtml(task.title)}
                  ${isSubtask ? `<small style="color:#6b7280;margin-inline-start:4px;">(فرعية)</small>` : ""}
                </td>
                <td>${assignedCell}</td>
                <td>${escapeHtml(task.achievement_note || "-")}</td>
                <td>${escapeHtml(completedAt)}</td>
                ${admin ? `<td>${actions}</td>` : ""}
              </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

function toggleTaskLogs() {
  const section = document.getElementById("taskLogsSection");
  if (!section) return;
  const hidden = section.classList.toggle("hidden");
  if (!hidden) renderCompletedTasks();
}

// ─── Reopen a completed task ──────────────────────────────────────────────────

async function reopenTask(taskId) {
  if (!confirm("إعادة فتح هذه المهمة وإرجاعها إلى قيد التنفيذ؟")) return;
  try {
    const updated = await api.updateTask(taskId, { status: "pending" });
    const idx = tasks.findIndex((t) => String(t.id) === String(taskId));
    if (idx !== -1) tasks[idx] = { ...tasks[idx], ...updated };
    renderTasks();
    renderCompletedTasks();
  } catch (err) {
    console.error("Error reopening task:", err);
    alert(err.message || "فشل إعادة فتح المهمة.");
  }
}

async function reopenTaskFromModal() {
  if (!editingTaskId) return;
  closeTaskEditModal();
  await reopenTask(editingTaskId);
}

// ─── Filters ──────────────────────────────────────────────────────────────────

function applyTaskFilters() {
  taskFilters.search = String(document.getElementById("taskSearch")?.value || "").trim();
  taskFilters.status = String(document.getElementById("taskStatusFilter")?.value || "").trim();
  taskFilters.roleId = String(document.getElementById("taskRoleFilter")?.value || "").trim();
  taskFilters.userId = String(document.getElementById("taskUserFilter")?.value || "").trim();
  taskFilters.daily  = String(document.getElementById("taskDailyFilter")?.value || "").trim();
  renderTasks();
}

// ─── Load users + roles ───────────────────────────────────────────────────────

async function loadTaskUsers() {
  try {
    const data = await api.getTaskUsers();
    taskUsers = Array.isArray(data) ? data : data?.data || [];

    const userOpts = `<option value="">اختر المستخدم</option>` +
      taskUsers.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name || u.username)}</option>`).join("");

    const dd = document.getElementById("taskAssignedUser");
    if (dd) dd.innerHTML = userOpts;

    const filterDd = document.getElementById("taskUserFilter");
    if (filterDd) filterDd.innerHTML = `<option value="">كل المستخدمين</option>` +
      taskUsers.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name || u.username)}</option>`).join("");
  } catch (err) {
    console.error("Error loading task users:", err);
  }
}

async function loadTaskRoles() {
  try {
    const data = await api.getTaskRoles();
    taskRoles = Array.isArray(data) ? data : [];

    const roleOpts = (placeholder) =>
      `<option value="">${placeholder}</option>` +
      taskRoles.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join("");

    const roleFilter = document.getElementById("taskRoleFilter");
    if (roleFilter) roleFilter.innerHTML = `<option value="">كل الفرق</option>` +
      taskRoles.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join("");

    const createRoleSel = document.getElementById("taskAssignedRole");
    if (createRoleSel) createRoleSel.innerHTML = roleOpts("اختر الفريق (الدور)");

    const editRoleSel = document.getElementById("editTaskAssignedRole");
    if (editRoleSel) editRoleSel.innerHTML = roleOpts("الفريق (اختياري)");
  } catch (err) {
    console.error("Error loading task roles:", err);
  }
}

// ─── Refresh / load ───────────────────────────────────────────────────────────

async function refreshTasks() {
  try {
    const data = await api.getTasks();
    tasks = Array.isArray(data) ? data : data?.data || [];
    const admin = isAdminUser();
    if (admin) await Promise.all([loadTaskUsers(), loadTaskRoles()]);
    document.getElementById("tasksAdminCard")?.classList.toggle("hidden", !admin);
    document.getElementById("taskLogsToggleBtn")?.classList.toggle("hidden", !admin);
    renderTasks();
    // Refresh completed section if it is open
    const logsSection = document.getElementById("taskLogsSection");
    if (logsSection && !logsSection.classList.contains("hidden")) {
      renderCompletedTasks();
    }
  } catch (err) {
    console.error("Error loading tasks:", err);
    const c = document.getElementById("tasksList");
    if (c) c.innerHTML = renderEmptyState("فشل تحميل المهام. حاول مرة أخرى.");
  }
}

async function loadTasks() {
  if (tasksLoadedOnce) return;
  await refreshTasks();
  tasksLoadedOnce = true;
}

// ─── Create task (with optional inline subtasks) ──────────────────────────────

function toggleSubtasksSection() {
  const checked = document.getElementById("taskHasSubtasks")?.checked;
  const section = document.getElementById("createSubtasksSection");
  if (section) section.style.display = checked ? "block" : "none";
  if (checked && document.getElementById("subtaskRowsContainer")?.children.length === 0) {
    addSubtaskRow();
  }
}

function addSubtaskRow() {
  const container = document.getElementById("subtaskRowsContainer");
  if (!container) return;
  const idx  = container.children.length;
  const opts = taskUsers.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name || u.username)}</option>`).join("");
  const row  = document.createElement("div");
  row.className = "subtask-row";
  row.innerHTML = `
    <input type="text" placeholder="عنوان المهمة الفرعية ${idx + 1}" class="subtask-title-input">
    <select class="subtask-user-select"><option value="">اختر المكلف</option>${opts}</select>
    <button type="button" class="subtask-remove-btn" onclick="removeSubtaskRow(this)">✕</button>`;
  container.appendChild(row);
}

function removeSubtaskRow(btn) {
  btn.closest(".subtask-row")?.remove();
}

async function createTask() {
  try {
    const title       = String(document.getElementById("taskTitle")?.value || "").trim();
    const description = String(document.getElementById("taskDescription")?.value || "").trim();
    const status      = String(document.getElementById("taskStatus")?.value || "pending").trim();
    const dueDate     = String(document.getElementById("taskDueDate")?.value || "").trim() || undefined;
    const isDaily     = document.getElementById("taskIsDaily")?.checked === true;
    const hasSubtasks = document.getElementById("taskHasSubtasks")?.checked === true;

    const assignedUserId = Number(document.getElementById("taskAssignedUser")?.value || 0);
    const assignedRoleId = Number(document.getElementById("taskAssignedRole")?.value || 0);

    if (!title) return alert("الرجاء إدخال عنوان المهمة.");
    if (!assignedUserId && !assignedRoleId) return alert("الرجاء اختيار المكلف أو الفريق (أو كليهما).");

    const parentTask = await api.createTask({
      title, description,
      assigned_user_id: assignedUserId || null,
      assigned_role_id: assignedRoleId || null,
      status, due_date: dueDate, is_daily: isDaily,
    });

    // Create any inline subtasks
    if (hasSubtasks) {
      const rows = document.querySelectorAll("#subtaskRowsContainer .subtask-row");
      for (const row of rows) {
        const subTitle  = String(row.querySelector(".subtask-title-input")?.value || "").trim();
        const subUserId = Number(row.querySelector(".subtask-user-select")?.value || 0);
        if (!subTitle || !subUserId) continue;
        await api.createTask({
          title: subTitle,
          assigned_user_id: subUserId,
          status: "pending",
          parent_task_id: parentTask.id,
          is_daily: false,
        });
      }
    }

    // Reset form
    ["taskTitle", "taskDescription", "taskDueDate"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    document.getElementById("taskAssignedUser").value  = "";
    const taskRoleSel = document.getElementById("taskAssignedRole");
    if (taskRoleSel) taskRoleSel.value = "";
    document.getElementById("taskStatus").value        = "pending";
    document.getElementById("taskIsDaily").checked     = false;
    const hasSubEl = document.getElementById("taskHasSubtasks");
    if (hasSubEl) hasSubEl.checked = false;
    const subSection = document.getElementById("createSubtasksSection");
    if (subSection) subSection.style.display = "none";
    const subContainer = document.getElementById("subtaskRowsContainer");
    if (subContainer) subContainer.innerHTML = "";

    await refreshTasks();

    if (hasSubtasks && parentTask?.id) {
      expandedParentTasks.add(parentTask.id);
      renderTasks();
    }
  } catch (err) {
    console.error("Error creating task:", err);
    alert(err.message || "فشل إنشاء المهمة.");
  }
}

// ─── Status change (with achievement note intercept for done) ─────────────────

async function changeTaskStatus(taskId, newStatus) {
  const task = (tasks || []).find((t) => String(t.id) === String(taskId));
  if (!task) return;
  const prev = task.status;
  if (prev === newStatus) return;

  if (newStatus === "done") {
    pendingDoneChange = { taskId, prev };
    const nameEl = document.getElementById("achievementTaskName");
    if (nameEl) nameEl.textContent = task.title;
    const noteEl = document.getElementById("achievementNote");
    if (noteEl) noteEl.value = task.achievement_note || "";
    document.getElementById("achievementModal")?.classList.add("active");
    return;
  }

  await _applyStatusChange(taskId, newStatus, prev, null);
}

async function _applyStatusChange(taskId, newStatus, prev, achievementNote) {
  const task = (tasks || []).find((t) => String(t.id) === String(taskId));
  if (!task) return;

  task.status = newStatus;
  if (achievementNote !== null && achievementNote !== undefined) task.achievement_note = achievementNote;
  renderTasks();

  // Immediately show in completed section if open
  if (newStatus === "done") {
    const logsSection = document.getElementById("taskLogsSection");
    if (logsSection && !logsSection.classList.contains("hidden")) renderCompletedTasks();
  }

  try {
    const payload = { status: newStatus };
    if (achievementNote !== null && achievementNote !== undefined) payload.achievement_note = achievementNote;
    const updated = await api.updateTask(taskId, payload);
    task.status          = updated.status          || newStatus;
    task.completed_at    = updated.completed_at    ?? task.completed_at;
    task.achievement_note = updated.achievement_note ?? task.achievement_note;
    renderTasks();
    if (newStatus === "done") {
      const logsSection = document.getElementById("taskLogsSection");
      if (logsSection && !logsSection.classList.contains("hidden")) renderCompletedTasks();
    }
  } catch (err) {
    console.error("Error updating task status:", err);
    task.status = prev;
    renderTasks();
    alert(err.message || "فشل تحديث حالة المهمة.");
  }
}

async function confirmAchievement() {
  if (!pendingDoneChange) return;
  const { taskId, prev } = pendingDoneChange;
  const note = String(document.getElementById("achievementNote")?.value || "").trim() || null;
  pendingDoneChange = null;
  document.getElementById("achievementModal")?.classList.remove("active");
  await _applyStatusChange(taskId, "done", prev, note);
}

function cancelAchievement() {
  pendingDoneChange = null;
  document.getElementById("achievementModal")?.classList.remove("active");
  renderTasks();
}

async function toggleTaskStatus(taskId, currentStatus) {
  await changeTaskStatus(taskId, currentStatus === "done" ? "pending" : "done");
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function deleteTask(taskId) {
  if (!confirm("هل أنت متأكد من حذف هذه المهمة؟")) return;
  try {
    await api.deleteTask(taskId);
    expandedParentTasks.delete(taskId);
    await refreshTasks();
  } catch (err) {
    console.error("Error deleting task:", err);
    alert(err.message || "فشل حذف المهمة.");
  }
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function openTaskEditModal(taskId) {
  const task = (tasks || []).find((t) => String(t.id) === String(taskId));
  if (!task) return;
  editingTaskId = taskId;

  document.getElementById("editTaskTitle").value           = task.title        || "";
  document.getElementById("editTaskDescription").value     = task.description  || "";
  document.getElementById("editTaskDueDate").value         = task.due_date     || "";
  document.getElementById("editTaskIsDaily").checked       = Boolean(task.is_daily);
  document.getElementById("editTaskAchievementNote").value = task.achievement_note || "";

  // Show/hide reopen button based on status
  const reopenBtn = document.getElementById("editTaskReopenBtn");
  if (reopenBtn) reopenBtn.style.display = task.status === "done" ? "inline-flex" : "none";

  // Populate user dropdown
  const userSelect = document.getElementById("editTaskAssignedUser");
  userSelect.innerHTML = `<option value="">المكلف (فرد) - اختياري</option>` +
    taskUsers.map((u) => `<option value="${escapeHtml(u.id)}" ${String(u.id) === String(task.assigned_user_id) ? "selected" : ""}>${escapeHtml(u.name || u.username)}</option>`).join("");

  // Populate role dropdown
  const roleSelect = document.getElementById("editTaskAssignedRole");
  if (roleSelect) {
    roleSelect.innerHTML = `<option value="">الفريق (اختياري)</option>` +
      taskRoles.map((r) => `<option value="${escapeHtml(r.id)}" ${String(r.id) === String(task.assigned_role_id) ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("");
  }

  document.getElementById("taskEditModal")?.classList.add("active");
}

function closeTaskEditModal() {
  editingTaskId = null;
  document.getElementById("taskEditModal")?.classList.remove("active");
}

async function saveTaskEdit() {
  if (!editingTaskId) return;

  const title           = String(document.getElementById("editTaskTitle").value || "").trim();
  const description     = String(document.getElementById("editTaskDescription").value || "").trim();
  const assignedUserId  = Number(document.getElementById("editTaskAssignedUser").value || 0) || null;
  const assignedRoleId  = Number(document.getElementById("editTaskAssignedRole")?.value || 0) || null;
  const dueDate         = String(document.getElementById("editTaskDueDate").value || "").trim() || null;
  const isDaily         = document.getElementById("editTaskIsDaily").checked;
  const achievementNote = String(document.getElementById("editTaskAchievementNote").value || "").trim() || null;

  if (!title) return alert("الرجاء إدخال عنوان المهمة.");

  try {
    const updated = await api.updateTask(editingTaskId, {
      title, description,
      assigned_user_id: assignedUserId,
      assigned_role_id: assignedRoleId,
      due_date: dueDate,
      is_daily: isDaily,
      achievement_note: achievementNote,
    });

    const idx = tasks.findIndex((t) => String(t.id) === String(editingTaskId));
    if (idx !== -1) tasks[idx] = { ...tasks[idx], ...updated };

    closeTaskEditModal();
    renderTasks();
    const logsSection = document.getElementById("taskLogsSection");
    if (logsSection && !logsSection.classList.contains("hidden")) renderCompletedTasks();
  } catch (err) {
    console.error("Error saving task edit:", err);
    alert(err.message || "فشل حفظ التعديلات.");
  }
}

// ─── Add subtask modal ────────────────────────────────────────────────────────

function openAddSubtaskModal(parentId) {
  addingSubtaskToParentId = parentId;
  const parent = tasks.find((t) => String(t.id) === String(parentId));

  const titleEl = document.getElementById("addSubtaskParentTitle");
  if (titleEl) titleEl.textContent = parent?.title || "";

  document.getElementById("addSubtaskTitle").value       = "";
  document.getElementById("addSubtaskDescription").value = "";
  document.getElementById("addSubtaskDueDate").value     = "";

  const userSelect = document.getElementById("addSubtaskAssignedUser");
  userSelect.innerHTML = `<option value="">اختر المكلف</option>` +
    taskUsers.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name || u.username)}</option>`).join("");

  document.getElementById("addSubtaskModal")?.classList.add("active");
  expandedParentTasks.add(parentId);
}

function closeAddSubtaskModal() {
  addingSubtaskToParentId = null;
  document.getElementById("addSubtaskModal")?.classList.remove("active");
}

async function saveNewSubtask() {
  if (!addingSubtaskToParentId) return;

  const title          = String(document.getElementById("addSubtaskTitle")?.value || "").trim();
  const description    = String(document.getElementById("addSubtaskDescription")?.value || "").trim();
  const assignedUserId = Number(document.getElementById("addSubtaskAssignedUser")?.value || 0);
  const dueDate        = String(document.getElementById("addSubtaskDueDate")?.value || "").trim() || undefined;

  if (!title)          return alert("الرجاء إدخال عنوان المهمة الفرعية.");
  if (!assignedUserId) return alert("الرجاء اختيار المكلف بالمهمة الفرعية.");

  try {
    await api.createTask({
      title, description,
      assigned_user_id: assignedUserId,
      status: "pending",
      due_date: dueDate,
      parent_task_id: addingSubtaskToParentId,
      is_daily: false,
    });
    closeAddSubtaskModal();
    await refreshTasks();
  } catch (err) {
    console.error("Error creating subtask:", err);
    alert(err.message || "فشل إنشاء المهمة الفرعية.");
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

window.loadTasks             = loadTasks;
window.applyTaskFilters      = applyTaskFilters;
window.createTask            = createTask;
window.changeTaskStatus      = changeTaskStatus;
window.toggleTaskStatus      = toggleTaskStatus;
window.deleteTask            = deleteTask;
window.toggleTaskLogs        = toggleTaskLogs;
window.openTaskEditModal     = openTaskEditModal;
window.closeTaskEditModal    = closeTaskEditModal;
window.saveTaskEdit          = saveTaskEdit;
window.toggleSubtaskRows     = toggleSubtaskRows;
window.toggleSubtasksSection = toggleSubtasksSection;
window.addSubtaskRow         = addSubtaskRow;
window.removeSubtaskRow      = removeSubtaskRow;
window.openAddSubtaskModal   = openAddSubtaskModal;
window.closeAddSubtaskModal  = closeAddSubtaskModal;
window.saveNewSubtask        = saveNewSubtask;
window.confirmAchievement    = confirmAchievement;
window.cancelAchievement     = cancelAchievement;
window.reopenTask            = reopenTask;
window.reopenTaskFromModal   = reopenTaskFromModal;
