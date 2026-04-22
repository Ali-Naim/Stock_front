function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function setActiveTabState(tabName) {
    document.querySelectorAll("[data-tab-target]").forEach((element) => {
        element.classList.toggle("active", element.dataset.tabTarget === tabName);
    });
}

function switchTab(tabName) {
    if (typeof canAccessTab === "function" && !canAccessTab(tabName)) {
        console.warn("Tab access denied:", tabName);
        return;
    }
    document.querySelectorAll(".section").forEach((section) => {
        section.classList.toggle("active", section.id === tabName);
    });

    setActiveTabState(tabName);

    if (tabName === "orders" && (!currentFilters.dateFrom && !currentFilters.dateTo)) {
        setTodayDateFilters();
    }

    if (tabName === "families" && typeof ensureFamiliesLoaded === "function") {
        ensureFamiliesLoaded();
    }
    if (tabName === "tasks" && typeof loadTasks === "function") {
        loadTasks();
    }
}

function renderEmptyState(message) {
    return `<div class="card">${message}</div>`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getVillageOptions(selectedValue = "", emptyLabel = "اختر القرية") {
    return [
        `<option value="">${emptyLabel}</option>`,
        ...villages.map((village) => `<option value="${village.id}" ${String(village.id) === String(selectedValue) ? "selected" : ""}>${escapeHtml(village.name)}</option>`),
    ].join("");
}

function getOrderVillageOptions(selectedValue = "", emptyLabel = "اختر القرية") {
    return [
        `<option value="">${emptyLabel}</option>`,
        ...villages.map((village) => `<option value="${escapeHtml(village.name)}" ${String(village.name) === String(selectedValue) ? "selected" : ""}>${escapeHtml(village.name)}</option>`),
    ].join("");
}

function getVillageNameById(villageId) {
    const village = villages.find((entry) => String(entry.id) === String(villageId));
    return village?.name || "-";
}

function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
}

function getLocalDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

async function loadVillages() {
    try {
        const data = await api.getVillages();
        villages = (data || [])
            .map((row) => ({
                id: row.id,
                name: String(row.name ?? row.village_name ?? row.title ?? "").trim(),
            }))
            .filter((row) => row.id != null && row.name)
            .sort((a, b) => a.name.localeCompare(b.name, "ar"));
    } catch (err) {
        console.error("Error loading villages:", err);
        villages = [];
    }
}

function fillVillageInputs() {
    const orderVillage = document.getElementById("orderVillage");
    if (orderVillage) orderVillage.innerHTML = getOrderVillageOptions();

    const orderVillageUI = document.getElementById("orderVillageUI");
    if (orderVillageUI) orderVillageUI.innerHTML = getVillageOptions("", "كل القرى");

    const needVillage = document.getElementById("needVillage");
    if (needVillage) needVillage.innerHTML = getVillageOptions();

    const villageFilter = document.getElementById("villageFilter");
    if (villageFilter) {
        villageFilter.innerHTML = `<option value="">كل القرى</option>${villages.map((village) => `<option value="${escapeHtml(village.name)}">${escapeHtml(village.name)}</option>`).join("")}`;
    }

    const needVillageFilter = document.getElementById("needVillageFilter");
    if (needVillageFilter) {
        needVillageFilter.innerHTML = `<option value="">كل القرى</option>${villages.map((village) => `<option value="${village.id}">${escapeHtml(village.name)}</option>`).join("")}`;
    }

    const familyVillage = document.getElementById("familyVillage");
    if (familyVillage) familyVillage.innerHTML = getVillageOptions();

    const familyVillageFilter = document.getElementById("familyVillageFilter");
    if (familyVillageFilter) {
        familyVillageFilter.innerHTML = `<option value="">كل القرى</option>${villages.map((village) => `<option value="${village.id}">${escapeHtml(village.name)}</option>`).join("")}`;
    }
}

function updateNeedItemPreview() {
    const itemId = document.getElementById("needItem").value;
    const preview = document.getElementById("needItemPreviewName");
    const item = inventory.find((entry) => String(entry.id) === String(itemId));
    preview.textContent = item ? item.name : "لم يتم اختيار مادة بعد";
}

function updateOrderSourceBadge() {
    const badge = document.getElementById("orderSourceBadge");
    badge.classList.toggle("hidden", !pendingOrderSourceNeedId);
}

function setNeedsImportResult(message, type = "") {
    const element = document.getElementById("needsImportResult");
    element.textContent = message;
    element.className = `needs-import-result ${type}`.trim();
    element.classList.remove("hidden");
}

function normalizeHeader(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function toQueryString(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || String(value).trim() === "") return;
        query.append(key, String(value));
    });
    const output = query.toString();
    return output ? `?${output}` : "";
}

function openItemModal() {
    document.getElementById("itemModal").classList.add("active");
    document.body.style.overflow = "hidden";
    setTimeout(() => document.getElementById("newItemName")?.focus(), 0);
}

function closeItemModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("itemModal").classList.remove("active");
    document.body.style.overflow = "";
    document.getElementById("newItemName").value = "";
}

function closeNeedToOrderModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("needToOrderModal").classList.remove("active");
    document.body.style.overflow = "";
    document.getElementById("needToOrderModalBody").innerHTML = "";
    needToOrderId = null;
}

