let tasks = [];
let taskRoles = [];
let tasksLoadedOnce = false;
const taskFilters = {
  search: "",
  status: "",
  roleId: "",
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
    if (taskFilters.roleId && String(task.assigned_role_id) !== String(taskFilters.roleId)) return false;

    if (!search) return true;
    const title = String(task.title || "").toLowerCase();
    const description = String(task.description || "").toLowerCase();
    const roleName = String(task.assigned_role?.name || "").toLowerCase();
    const createdBy = String(task.created_by?.username || "").toLowerCase();

    return title.includes(search) || description.includes(search) || roleName.includes(search) || createdBy.includes(search);
  });
}

async function loadTaskRoles() {
  try {
    const data = await api.getTaskRoles();
    taskRoles = Array.isArray(data) ? data : data?.data || [];
    const dropdown = document.getElementById("taskAssignedRole");
    if (!dropdown) return;
    dropdown.innerHTML = [`
      <option value="">اختر الدور</option>
      ${taskRoles
        .map((role) => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.name)}</option>`)
        .join("")}
    `].join("");
  } catch (err) {
    console.error("Error loading task roles:", err);
  }
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
            <th>الدور</th>
            <th>المهمة</th>
            <th>الوصف</th>
            <th>الموعد النهائي</th>
            <th>الحالة</th>
            <th>أنشئ بواسطة</th>
            <th>تاريخ الإنشاء</th>
            ${isAdminUser() ? '<th>إجراءات</th>' : ""}
          </tr>
        </thead>
        <tbody>
          ${visibleTasks
            .map((task, index) => {
              const roleName = task.assigned_role?.name || "غير معروف";
              const createdBy = task.created_by?.username || "غير معروف";
              const dueDate = task.due_date ? String(task.due_date) : "-";
              const statusLabel = getTaskStatusLabel(task.status);
              const statusBadge = getTaskStatusBadge(task.status);
              const actions = isAdminUser()
                ? `
                    <div class="task-actions">
                      <button class="done" type="button" onclick="toggleTaskStatus(${task.id}, '${task.status}')">
                        ${task.status === "done" ? "إعادة فتح" : "وضع مكتمل"}
                      </button>
                      <button class="delete" type="button" onclick="deleteTask(${task.id})">حذف</button>
                    </div>
                  `
                : "";
              return `
                <tr>
                  <td>${index + 1}</td>
                  <td>${escapeHtml(roleName)}</td>
                  <td>${escapeHtml(task.title)}</td>
                  <td>${escapeHtml(task.description || "-")}</td>
                  <td>${escapeHtml(dueDate)}</td>
                  <td>${statusBadge} ${escapeHtml(statusLabel)}</td>
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
  taskFilters.roleId = String(document.getElementById("taskRoleFilter")?.value || "").trim();
  renderTasks();
}

async function refreshTasks() {
  try {
    const data = await api.getTasks();
    tasks = Array.isArray(data) ? data : data?.data || [];
    if (isAdminUser()) {
      await loadTaskRoles();
    }
    document.getElementById("tasksAdminCard")?.classList.toggle("hidden", !isAdminUser());
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
    const assignedRoleId = Number(document.getElementById("taskAssignedRole")?.value || 0);
    const status = String(document.getElementById("taskStatus")?.value || "pending").trim();
    const dueDate = String(document.getElementById("taskDueDate")?.value || "").trim() || undefined;

    if (!title) {
      return alert("الرجاء إدخال عنوان المهمة.");
    }
    if (!assignedRoleId) {
      return alert("الرجاء اختيار الدور المسؤول عن المهمة.");
    }

    await api.createTask({
      title,
      description,
      assigned_role_id: assignedRoleId,
      status,
      due_date: dueDate,
    });

    document.getElementById("taskTitle").value = "";
    document.getElementById("taskDescription").value = "";
    document.getElementById("taskAssignedRole").value = "";
    document.getElementById("taskStatus").value = "pending";
    document.getElementById("taskDueDate").value = "";

    await refreshTasks();
  } catch (err) {
    console.error("Error creating task:", err);
    alert(err.message || "فشل إنشاء المهمة.");
  }
}

async function toggleTaskStatus(taskId, currentStatus) {
  try {
    const nextStatus = currentStatus === "done" ? "pending" : "done";
    await api.updateTask(taskId, { status: nextStatus });
    await refreshTasks();
  } catch (err) {
    console.error("Error updating task status:", err);
    alert(err.message || "فشل تحديث حالة المهمة.");
  }
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

window.loadTasks = loadTasks;
window.applyTaskFilters = applyTaskFilters;
window.createTask = createTask;
window.toggleTaskStatus = toggleTaskStatus;
window.deleteTask = deleteTask;
