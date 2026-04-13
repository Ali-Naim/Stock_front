let tasks = [];
let taskUsers = [];
let tasksLoadedOnce = false;
let taskLogs = [];
let editingTaskId = null;
const taskFilters = {
  search: "",
  status: "",
  userId: "",
  daily: "",
};

function isAdminUser() {
  const roles = typeof getUserRoles === "function" ? getUserRoles() : [];
  return roles.includes("admin");
}

function getTaskStatusLabel(status) {
  switch (String(status).trim()) {
    case "pending":
      return "قيد التنفيذ";
    case "in_progress":
      return "قيد المتابعة";
    case "done":
      return "مكتمل";
    default:
      return String(status || "غير محدد");
  }
}

function getTaskStatusBadge(status) {
  const normalized = String(status).trim();
  if (normalized === "done") return "✅";
  if (normalized === "in_progress") return "🔄";
  if (normalized === "pending") return "⏳";
  return "–";
}

function getFilteredTasks() {
  const search = taskFilters.search.toLowerCase();
  return (tasks || []).filter((task) => {
    if (taskFilters.status && String(task.status) !== String(taskFilters.status)) return false;
    if (taskFilters.userId && String(task.assigned_user_id) !== String(taskFilters.userId)) return false;
    if (taskFilters.daily === "daily" && !task.is_daily) return false;
    if (taskFilters.daily === "regular" && task.is_daily) return false;

    if (!search) return true;
    const title = String(task.title || "").toLowerCase();
    const description = String(task.description || "").toLowerCase();
    const assignedName = String(task.assigned_user?.name || task.assigned_user?.username || task.assigned_role?.name || "").toLowerCase();
    const createdBy = String(task.created_by?.username || "").toLowerCase();

    return title.includes(search) || description.includes(search) || assignedName.includes(search) || createdBy.includes(search);
  });
}

async function loadTaskUsers() {
  try {
    const data = await api.getTaskUsers();
    taskUsers = Array.isArray(data) ? data : data?.data || [];

    // Populate create-form dropdown
    const dropdown = document.getElementById("taskAssignedUser");
    if (dropdown) {
      dropdown.innerHTML = `<option value="">اختر المستخدم</option>` +
        taskUsers.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name || u.username)}</option>`).join("");
    }

    // Populate filter dropdown
    const filterDropdown = document.getElementById("taskUserFilter");
    if (filterDropdown) {
      filterDropdown.innerHTML = `<option value="">كل المستخدمين</option>` +
        taskUsers.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name || u.username)}</option>`).join("");
    }
  } catch (err) {
    console.error("Error loading task users:", err);
  }
}

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

function renderTasks() {
  const container = document.getElementById("tasksList");
  if (!container) return;

  const visibleTasks = getFilteredTasks();
  if (!visibleTasks.length) {
    container.innerHTML = renderEmptyState("لا توجد مهام في الوقت الحالي.");
    return;
  }

  container.innerHTML = `
    <div class="needs-table-wrap">
      <table class="needs-table">
        <thead>
          <tr>
            <th>م</th>
            <th>المكلف</th>
            <th>المهمة</th>
            <th>الوصف</th>
            <th>الموعد النهائي</th>
            <th>الحالة</th>
            <th>أنشئ بواسطة</th>
            <th>تاريخ الإنشاء</th>
            ${isAdminUser() ? "<th>إجراءات</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${visibleTasks
            .map((task, index) => {
              const assignedName = task.assigned_user?.name || task.assigned_user?.username || task.assigned_role?.name || "غير معروف";
              const createdBy = task.created_by?.username || "غير معروف";
              const dueDate = task.due_date ? String(task.due_date) : "-";
              const actions = isAdminUser()
                ? `<div class="task-actions">
                     <button class="icon-btn" type="button" onclick="openTaskEditModal(${task.id})" aria-label="تعديل المهمة">
                       <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                         <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                         <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                       </svg>
                     </button>
                     <button class="icon-btn icon-btn-danger" type="button" onclick="deleteTask(${task.id})" aria-label="حذف المهمة">
                       <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                         <path d="M6 7h12M9 7V5h6v2M8 7l1 14h6l1-14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                       </svg>
                     </button>
                   </div>`
                : "";
              const dailyBadge = task.is_daily
                ? `<span class="task-daily-badge" title="مهمة يومية تُعاد تلقائياً">🔁 يومي</span>`
                : "";
              return `
                <tr class="${task.status === "done" ? "task-row-done" : ""}">
                  <td>${index + 1}</td>
                  <td>${escapeHtml(assignedName)}</td>
                  <td>${dailyBadge}${escapeHtml(task.title)}</td>
                  <td>${escapeHtml(task.description || "-")}</td>
                  <td>${escapeHtml(dueDate)}</td>
                  <td>${buildTaskStatusCell(task)}</td>
                  <td>${escapeHtml(createdBy)}</td>
                  <td>${escapeHtml(task.created_at ? new Date(task.created_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "-")}</td>
                  ${isAdminUser() ? `<td>${actions}</td>` : ""}
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function applyTaskFilters() {
  taskFilters.search = String(document.getElementById("taskSearch")?.value || "").trim();
  taskFilters.status = String(document.getElementById("taskStatusFilter")?.value || "").trim();
  taskFilters.userId = String(document.getElementById("taskUserFilter")?.value || "").trim();
  taskFilters.daily = String(document.getElementById("taskDailyFilter")?.value || "").trim();
  renderTasks();
}

async function refreshTasks() {
  try {
    const data = await api.getTasks();
    tasks = Array.isArray(data) ? data : data?.data || [];
    const admin = isAdminUser();
    if (admin) {
      await loadTaskUsers();
    }
    document.getElementById("tasksAdminCard")?.classList.toggle("hidden", !admin);
    document.getElementById("taskLogsToggleBtn")?.classList.toggle("hidden", !admin);
    renderTasks();
  } catch (err) {
    console.error("Error loading tasks:", err);
    const container = document.getElementById("tasksList");
    if (container) container.innerHTML = renderEmptyState("فشل تحميل المهام. حاول مرة أخرى.");
  }
}

async function loadTasks() {
  if (tasksLoadedOnce) return;
  await refreshTasks();
  tasksLoadedOnce = true;
}

async function createTask() {
  try {
    const title = String(document.getElementById("taskTitle")?.value || "").trim();
    const description = String(document.getElementById("taskDescription")?.value || "").trim();
    const assignedUserId = Number(document.getElementById("taskAssignedUser")?.value || 0);
    const status = String(document.getElementById("taskStatus")?.value || "pending").trim();
    const dueDate = String(document.getElementById("taskDueDate")?.value || "").trim() || undefined;
    const isDaily = document.getElementById("taskIsDaily")?.checked === true;

    if (!title) return alert("الرجاء إدخال عنوان المهمة.");
    if (!assignedUserId) return alert("الرجاء اختيار المستخدم المسؤول عن المهمة.");

    await api.createTask({
      title,
      description,
      assigned_user_id: assignedUserId,
      status,
      due_date: dueDate,
      is_daily: isDaily,
    });

    document.getElementById("taskTitle").value = "";
    document.getElementById("taskDescription").value = "";
    document.getElementById("taskAssignedUser").value = "";
    document.getElementById("taskStatus").value = "pending";
    document.getElementById("taskDueDate").value = "";
    document.getElementById("taskIsDaily").checked = false;

    await refreshTasks();
  } catch (err) {
    console.error("Error creating task:", err);
    alert(err.message || "فشل إنشاء المهمة.");
  }
}

async function changeTaskStatus(taskId, newStatus) {
  const task = (tasks || []).find((t) => String(t.id) === String(taskId));
  if (!task) return;
  const prev = task.status;
  if (prev === newStatus) return;

  // Optimistic update
  task.status = newStatus;
  renderTasks();

  try {
    const updated = await api.updateTask(taskId, { status: newStatus });
    task.status = updated.status || newStatus;
    renderTasks();
    // Refresh logs if task was just completed
    if (newStatus === "done" && isAdminUser()) {
      loadTaskLogs();
    }
  } catch (err) {
    console.error("Error updating task status:", err);
    task.status = prev;
    renderTasks();
    alert(err.message || "فشل تحديث حالة المهمة.");
  }
}

async function toggleTaskStatus(taskId, currentStatus) {
  const nextStatus = currentStatus === "done" ? "pending" : "done";
  await changeTaskStatus(taskId, nextStatus);
}

async function loadTaskLogs() {
  const container = document.getElementById("taskLogsContainer");
  if (!container) return;
  container.innerHTML = `<div class="card distribution-empty">جارٍ تحميل السجل...</div>`;
  try {
    const data = await api.getTaskLogs();
    taskLogs = Array.isArray(data) ? data : [];
    renderTaskLogs();
  } catch (err) {
    console.error("Error loading task logs:", err);
    container.innerHTML = `<div class="card" style="background:#fff1f1">فشل تحميل سجل الإنجاز</div>`;
  }
}

function renderTaskLogs() {
  const container = document.getElementById("taskLogsContainer");
  if (!container) return;

  if (!taskLogs.length) {
    container.innerHTML = renderEmptyState("لا يوجد سجل إنجاز بعد.");
    return;
  }

  container.innerHTML = `
    <div class="needs-table-wrap">
      <table class="needs-table">
        <thead>
          <tr>
            <th>م</th>
            <th>المهمة</th>
            <th>الدور</th>
            <th>أُنجزت بواسطة</th>
            <th>وقت الإنجاز</th>
          </tr>
        </thead>
        <tbody>
          ${taskLogs
            .map((log, index) => {
              const roleName = log.assigned_role?.name || "-";
              const completedBy = log.completed_by?.username || "-";
              const completedAt = log.completed_at
                ? new Date(log.completed_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })
                : "-";
              return `
                <tr>
                  <td>${index + 1}</td>
                  <td>${escapeHtml(log.task_title || "-")}</td>
                  <td>${escapeHtml(roleName)}</td>
                  <td>${escapeHtml(completedBy)}</td>
                  <td>${escapeHtml(completedAt)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function toggleTaskLogs() {
  const section = document.getElementById("taskLogsSection");
  if (!section) return;
  const hidden = section.classList.toggle("hidden");
  if (!hidden) loadTaskLogs();
}

async function deleteTask(taskId) {
  try {
    if (!confirm("هل أنت متأكد من حذف هذه المهمة؟")) return;
    await api.deleteTask(taskId);
    await refreshTasks();
  } catch (err) {
    console.error("Error deleting task:", err);
    alert(err.message || "فشل حذف المهمة.");
  }
}

function openTaskEditModal(taskId) {
  const task = (tasks || []).find((t) => String(t.id) === String(taskId));
  if (!task) return;
  editingTaskId = taskId;

  document.getElementById("editTaskTitle").value = task.title || "";
  document.getElementById("editTaskDescription").value = task.description || "";
  document.getElementById("editTaskDueDate").value = task.due_date || "";
  document.getElementById("editTaskIsDaily").checked = Boolean(task.is_daily);

  // Populate user dropdown
  const userSelect = document.getElementById("editTaskAssignedUser");
  userSelect.innerHTML = `<option value="">اختر المستخدم</option>` +
    taskUsers.map((u) => `<option value="${escapeHtml(u.id)}" ${String(u.id) === String(task.assigned_user_id) ? "selected" : ""}>${escapeHtml(u.name || u.username)}</option>`).join("");

  document.getElementById("taskEditModal").classList.add("active");
}

function closeTaskEditModal() {
  editingTaskId = null;
  document.getElementById("taskEditModal").classList.remove("active");
}

async function saveTaskEdit() {
  if (!editingTaskId) return;

  const title = String(document.getElementById("editTaskTitle").value || "").trim();
  const description = String(document.getElementById("editTaskDescription").value || "").trim();
  const assignedUserId = Number(document.getElementById("editTaskAssignedUser").value || 0) || null;
  const dueDate = String(document.getElementById("editTaskDueDate").value || "").trim() || null;
  const isDaily = document.getElementById("editTaskIsDaily").checked;

  if (!title) return alert("الرجاء إدخال عنوان المهمة.");

  try {
    const updated = await api.updateTask(editingTaskId, {
      title,
      description,
      assigned_user_id: assignedUserId,
      due_date: dueDate,
      is_daily: isDaily,
    });

    // Update local state
    const idx = tasks.findIndex((t) => String(t.id) === String(editingTaskId));
    if (idx !== -1) tasks[idx] = { ...tasks[idx], ...updated };

    closeTaskEditModal();
    renderTasks();
  } catch (err) {
    console.error("Error saving task edit:", err);
    alert(err.message || "فشل حفظ التعديلات.");
  }
}

window.loadTasks = loadTasks;
window.applyTaskFilters = applyTaskFilters;
window.createTask = createTask;
window.changeTaskStatus = changeTaskStatus;
window.toggleTaskStatus = toggleTaskStatus;
window.deleteTask = deleteTask;
window.toggleTaskLogs = toggleTaskLogs;
window.loadTaskLogs = loadTaskLogs;
window.openTaskEditModal = openTaskEditModal;
window.closeTaskEditModal = closeTaskEditModal;
window.saveTaskEdit = saveTaskEdit;
