async function createItem() {
    const roles = typeof getUserRoles === "function" ? getUserRoles() : [];
    const isAdmin = roles.includes("admin");
    if (!isAdmin) return alert("هذه الصلاحية متاحة للمسؤول فقط");

    const itemName = String(document.getElementById("newItemName").value).trim();
    if (!itemName) return alert("أدخل اسم المنتج");

    try {
        const existingItem = inventory.find((item) => item.name.trim().toLowerCase() === itemName.toLowerCase());
        if (existingItem) {
            document.getElementById("name").value = String(existingItem.id);
            closeItemModal();
            return alert("هذا المنتج موجود بالفعل وتم اختياره");
        }

        const data = await api.createInventoryItem({ name: itemName, quantity: 0 });

        await loadItems();
        closeItemModal();

        if (data?.id) {
            document.getElementById("name").value = String(data.id);
        }
    } catch (err) {
        console.error("Error creating item:", err);
        alert("فشل إضافة المنتج");
    }
}

async function loadItems() {
    try {
        const roles = typeof getUserRoles === "function" ? getUserRoles() : [];
        const isAdmin = roles.includes("admin");
        const canAdjustQty = isAdmin || roles.includes("stock");

        let reservedByItemId = new Map();
        try {
            const pendingRes = await api.getOrders({ status: "pending", limit: 500 });
            // getOrders returns a paginated { data, total } object, not a plain array
            const pendingOrders = Array.isArray(pendingRes) ? pendingRes : (pendingRes?.data || []);
            pendingOrders.forEach((order) => {
                (order?.items || []).forEach((item) => {
                    const id = String(item?.id ?? "").trim();
                    if (!id) return;
                    const qty = Number(item?.qty ?? 0);
                    if (!qty || qty <= 0) return;
                    reservedByItemId.set(id, (reservedByItemId.get(id) || 0) + qty);
                });
            });
        } catch (error) {
            console.warn("Could not load pending orders for reservations:", error);
        }

        const isReadOnly = !canAdjustQty;

        const createItemBtn = document.getElementById("createItemBtn");
        if (createItemBtn) createItemBtn.classList.toggle("hidden", !isAdmin);

        const exportInventoryBtn = document.getElementById("exportInventoryBtn");
        if (exportInventoryBtn) exportInventoryBtn.classList.toggle("hidden", !isAdmin);

        const formCard = document.getElementById("inventoryFormCard");
        if (formCard) formCard.classList.toggle("hidden", isReadOnly);

        const stockSelect = document.getElementById("name");
        const qtyInput = document.getElementById("qty");
        const addQtyBtn = document.querySelector("#inventory .card .add");
        stockSelect?.toggleAttribute?.("disabled", !canAdjustQty);
        qtyInput?.toggleAttribute?.("disabled", !canAdjustQty);
        addQtyBtn?.toggleAttribute?.("disabled", !canAdjustQty);

        const data = await api.getInventory();
        inventory = data || [];

        const list = document.getElementById("inventoryList");
        const orderSelect = document.getElementById("orderItem");
        const needSelect = document.getElementById("needItem");

        list.innerHTML = "";
        stockSelect.innerHTML = `<option value="">اختر المنتج</option>`;
        orderSelect.innerHTML = `<option value="">اختر المنتج</option>`;
        needSelect.innerHTML = `<option value="">اختر المنتج</option>`;

        const isStockOnly = roles.includes("stock") && !isAdmin;
        const listInventory = isAdmin
            ? inventory
            : isStockOnly
                ? inventory.filter((item) => Number(item.quantity) > 0 || (reservedByItemId.get(String(item.id)) || 0) > 0)
                : inventory.filter((item) => Number(item.quantity) > 0);

        if (inventory.length === 0) {
            list.innerHTML = renderEmptyState("لا توجد عناصر في المخزون");
            stockSelect.innerHTML = `<option value="">لا يوجد</option>`;
            orderSelect.innerHTML = `<option value="">لا يوجد</option>`;
            needSelect.innerHTML = `<option value="">لا يوجد</option>`;
            return;
        }

        // Keep stock + needs selects filled with all items.
        // For orders, show only currently-available items (quantity > 0).
        const availableForOrders = inventory.filter((item) => Number(item.quantity) > 0);

        inventory.forEach((item) => {
            stockSelect.innerHTML += `<option value="${item.id}">${escapeHtml(item.name)}</option>`;
            needSelect.innerHTML += `<option value="${item.id}">${escapeHtml(item.name)}</option>`;
        });

        if (availableForOrders.length === 0) {
            orderSelect.innerHTML = `<option value="">لا يوجد متوفر</option>`;
        } else {
            availableForOrders.forEach((item) => {
                orderSelect.innerHTML += `<option value="${item.id}">${escapeHtml(item.name)} (متوفر: ${item.quantity})</option>`;
            });
        }

        if (listInventory.length === 0) {
            list.innerHTML = renderEmptyState("لا توجد عناصر بكمية متوفرة");
            updateNeedItemPreview();
            return;
        }

        list.innerHTML = `<div class="inventory-readonly-grid">${listInventory.map((item) => {
            const reserved = reservedByItemId.get(String(item.id)) || 0;
            const reservedBadge = reserved > 0 ? `<small class="inv-reserved">(${reserved} محجوز)</small>` : "";
            if (canAdjustQty) {
                return `
                <div class="card inventory-readonly-card inventory-editable-card" data-inventory-item-id="${item.id}"
                     onclick="openSetQtyModal(${item.id})" role="button" tabindex="0"
                     onkeydown="if(event.key==='Enter'||event.key===' ') openSetQtyModal(${item.id})">
                    ${isAdmin ? `<button class="inventory-delete-btn" type="button" title="حذف"
                        onclick="event.stopPropagation(); deleteItem(${item.id})" aria-label="حذف">×</button>` : ""}
                    <strong class="inventory-readonly-name">${escapeHtml(item.name)}</strong>
                    <span class="inventory-readonly-qty">${item.quantity}</span>
                    ${reservedBadge}
                    <small class="inv-edit-hint">اضغط للتعديل</small>
                </div>`;
            }
            return `
                <div class="card inventory-readonly-card" data-inventory-item-id="${item.id}">
                    <strong class="inventory-readonly-name">${escapeHtml(item.name)}</strong>
                    <span class="inventory-readonly-qty">${item.quantity}</span>
                    ${reservedBadge}
                </div>`;
        }).join("")}</div>`;

        updateNeedItemPreview();
    } catch (err) {
        console.error("Error loading inventory:", err);
        document.getElementById("inventoryList").innerHTML = `<div class="card" style="background:#fff1f1">فشل تحميل المخزون</div>`;
    }
}

async function adjustInventoryQty(itemId, delta) {
    try {
        const roles = typeof getUserRoles === "function" ? getUserRoles() : [];
        const canAdjustQty = roles.includes("admin") || roles.includes("stock");
        if (!canAdjustQty) return alert("ليست لديك صلاحية تعديل الكميات");

        const item = inventory.find((entry) => String(entry.id) === String(itemId));
        if (!item) return alert("العنصر غير موجود");

        const newQuantity = item.quantity + delta;
        if (newQuantity < 0) return alert("لا يمكن أن تكون الكمية أقل من صفر");

        await api.updateInventoryItem(itemId, { quantity: newQuantity });

        await loadItems();
    } catch (err) {
        console.error("Error adjusting inventory quantity:", err);
        alert("فشل تحديث الكمية");
    }
}

async function addItem() {
    const roles = typeof getUserRoles === "function" ? getUserRoles() : [];
    const canAdjustQty = roles.includes("admin") || roles.includes("stock");
    if (!canAdjustQty) return alert("ليست لديك صلاحية تعديل الكميات");

    const itemId = document.getElementById("name").value;
    const qtyToAdd = Number(document.getElementById("qty").value);

    if (!itemId) return alert("اختر المنتج");
    if (!qtyToAdd || qtyToAdd <= 0) return alert("أدخل كمية صحيحة أكبر من صفر");

    try {
        const item = inventory.find((entry) => String(entry.id) === String(itemId));
        if (!item) return alert("العنصر غير موجود");

        const newQuantity = item.quantity + qtyToAdd;
        await api.updateInventoryItem(itemId, { quantity: newQuantity });

        document.getElementById("name").value = "";
        document.getElementById("qty").value = "";
        await loadItems();
    } catch (err) {
        console.error("Error adding item:", err);
        alert("فشل تحديث المخزون");
    }
}

async function deleteItem(id) {
    try {
        const roles = typeof getUserRoles === "function" ? getUserRoles() : [];
        const isAdmin = roles.includes("admin");
        if (!isAdmin) return alert("هذه الصلاحية متاحة للمسؤول فقط");

        await api.deleteInventoryItem(id);
        await loadItems();
    } catch (err) {
        console.error("Error deleting item:", err);
        alert("فشل حذف العنصر");
    }
}

let _setQtyItemId = null;

function openSetQtyModal(itemId) {
    const item = inventory.find((entry) => String(entry.id) === String(itemId));
    if (!item) return;

    _setQtyItemId = itemId;
    document.getElementById("setQtyModalTitle").textContent = escapeHtml(item.name);
    document.getElementById("setQtyModalCurrent").textContent = `الكمية الحالية: ${item.quantity}`;

    const input = document.getElementById("setQtyInput");
    input.value = item.quantity;

    document.getElementById("setQtyModal").classList.add("active");
    document.body.style.overflow = "hidden";
    setTimeout(() => { input.focus(); input.select(); }, 0);
}

function stepSetQty(delta) {
    const input = document.getElementById("setQtyInput");
    const current = Number(input.value) || 0;
    const next = current + delta;
    if (next < 0) return;
    input.value = next;
}

function closeSetQtyModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("setQtyModal").classList.remove("active");
    document.body.style.overflow = "";
    _setQtyItemId = null;
}

async function confirmSetQty() {
    if (_setQtyItemId === null) return;

    const newQty = Number(document.getElementById("setQtyInput").value);
    if (!Number.isFinite(newQty) || newQty < 0) return alert("أدخل كمية صحيحة (صفر أو أكثر)");

    try {
        await api.updateInventoryItem(_setQtyItemId, { quantity: newQty });
        document.getElementById("setQtyModal").classList.remove("active");
        document.body.style.overflow = "";
        _setQtyItemId = null;
        await loadItems();
    } catch (err) {
        console.error("Error setting quantity:", err);
        alert("فشل تحديث الكمية");
    }
}

function exportInventoryExcel() {
    if (!window.XLSX) return alert("مكتبة Excel غير محملة");

    const nonZero = inventory.filter((item) => Number(item.quantity) > 0);
    if (nonZero.length === 0) return alert("لا توجد منتجات بكمية متوفرة للتصدير");

    const rows = nonZero.map((item) => ({ "المنتج": item.name, "الكمية": item.quantity }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: ["المنتج", "الكمية"] });
    ws["!cols"] = [{ wch: 30 }, { wch: 12 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "المخزون");

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `مخزون_${date}.xlsx`);
}

window.exportInventoryExcel = exportInventoryExcel;
window.openSetQtyModal = openSetQtyModal;
window.closeSetQtyModal = closeSetQtyModal;
window.confirmSetQty = confirmSetQty;
window.stepSetQty = stepSetQty;
