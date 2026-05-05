async function createItem() {
    const roles = typeof getUserRoles === "function" ? getUserRoles() : [];
    const isAdmin = roles.includes("admin");
    if (!isAdmin) return alert("هذه الصلاحية متاحة للمسؤول فقط");

    const itemName = String(document.getElementById("newItemName").value).trim();
    if (!itemName) return alert("أدخل اسم المنتج");

    const typeIdRaw = document.getElementById("newItemType")?.value;
    const typeId = typeIdRaw ? Number(typeIdRaw) : null;

    try {
        const existingItem = inventory.find((item) => item.name.trim().toLowerCase() === itemName.toLowerCase());
        if (existingItem) {
            document.getElementById("name").value = String(existingItem.id);
            closeItemModal();
            return alert("هذا المنتج موجود بالفعل وتم اختياره");
        }

        const payload = { name: itemName, quantity: 0 };
        if (typeId) payload.type_id = typeId;

        const data = await api.createInventoryItem(payload);

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

function _getTypeName(typeId) {
    if (!typeId) return null;
    return itemTypes.find((t) => String(t.id) === String(typeId))?.name || null;
}

function _groupInventoryByType(items) {
    const groups = new Map();
    const uncategorized = [];

    items.forEach((item) => {
        const typeId = item.type_id || null;
        const typeName = _getTypeName(typeId);
        if (typeId && typeName) {
            if (!groups.has(typeId)) groups.set(typeId, { id: typeId, name: typeName, items: [] });
            groups.get(typeId).items.push(item);
        } else {
            uncategorized.push(item);
        }
    });

    const sorted = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
    if (uncategorized.length > 0) sorted.push({ id: null, name: null, items: uncategorized });
    return sorted;
}

function _renderInventoryCard(item, canAdjustQty, isAdmin, reserved) {
    const reservedBadge = reserved > 0
        ? `<span class="inv-reserved"><i class="bi bi-clock"></i> ${reserved} محجوز</span>`
        : "";
    const qtyClass = item.quantity === 0 ? "inventory-readonly-qty qty-zero"
        : item.quantity <= 5 ? "inventory-readonly-qty qty-low"
        : "inventory-readonly-qty";

    if (canAdjustQty) {
        return `
        <div class="card inventory-readonly-card inventory-editable-card" data-inventory-item-id="${item.id}"
             onclick="openSetQtyModal(${item.id})" role="button" tabindex="0"
             onkeydown="if(event.key==='Enter'||event.key===' ') openSetQtyModal(${item.id})">
            ${isAdmin ? `<button class="inventory-delete-btn" type="button" title="حذف"
                onclick="event.stopPropagation(); deleteItem(${item.id})" aria-label="حذف">
                <i class="bi bi-trash"></i></button>` : ""}
            <button class="inventory-delete-btn" type="button" title="سجل الحركة"
                onclick="event.stopPropagation(); openInvLogsModal(${item.id}, '${escapeHtml(item.name)}')" aria-label="سجل الحركة"
                style="left:8px;right:auto;background:#0f3a79;">
                <i class="bi bi-clock-history"></i></button>
            <span class="${qtyClass}">${item.quantity}</span>
            <strong class="inventory-readonly-name">${escapeHtml(item.name)}</strong>
            ${reservedBadge}
        </div>`;
    }
    return `
    <div class="card inventory-readonly-card" data-inventory-item-id="${item.id}">
        <span class="${qtyClass}">${item.quantity}</span>
        <strong class="inventory-readonly-name">${escapeHtml(item.name)}</strong>
        ${reservedBadge}
    </div>`;
}

async function loadItems() {
    try {
        const roles = typeof getUserRoles === "function" ? getUserRoles() : [];
        const isAdmin = roles.includes("admin");
        const canAdjustQty = isAdmin || roles.includes("stock");

        let reservedByItemId = new Map();
        try {
            const pendingRes = await api.getOrders({ status: "pending", limit: 500 });
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

        const [data, typesData] = await Promise.all([
            api.getInventory(),
            api.getItemTypes().catch(() => []),
        ]);
        inventory = data || [];
        itemTypes = typesData || [];

        _refreshItemTypeSelects();
        renderItemTypesManager();

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

        const groups = _groupInventoryByType(listInventory);

        const renderGroup = (group) => {
            const cards = group.items.map((item) => {
                const reserved = reservedByItemId.get(String(item.id)) || 0;
                return _renderInventoryCard(item, canAdjustQty, isAdmin, reserved);
            }).join("");
            return `
                <div class="inventory-type-group">
                    <div class="inventory-type-header">
                        <span class="inventory-type-header-name">${escapeHtml(group.name || "بدون تصنيف")}</span>
                        <span class="inventory-type-count">${group.items.length} منتج</span>
                    </div>
                    <div class="inventory-type-body">
                        <div class="inventory-readonly-grid">${cards}</div>
                    </div>
                </div>`;
        };

        if (groups.length === 1 && groups[0].id === null) {
            list.innerHTML = `<div class="inventory-readonly-grid">${listInventory.map((item) => {
                const reserved = reservedByItemId.get(String(item.id)) || 0;
                return _renderInventoryCard(item, canAdjustQty, isAdmin, reserved);
            }).join("")}</div>`;
        } else {
            list.innerHTML = groups.map(renderGroup).join("");
        }

        updateNeedItemPreview();
    } catch (err) {
        console.error("Error loading inventory:", err);
        document.getElementById("inventoryList").innerHTML = `<div class="card" style="background:#fff1f1">فشل تحميل المخزون</div>`;
    }
}

function _refreshItemTypeSelects() {
    const newItemTypeSelect = document.getElementById("newItemType");
    if (newItemTypeSelect) {
        const current = newItemTypeSelect.value;
        newItemTypeSelect.innerHTML = `<option value="">بدون تصنيف</option>` +
            itemTypes.map((t) => `<option value="${t.id}" ${String(t.id) === String(current) ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("");
    }
}

function renderItemTypesManager() {
    const card = document.getElementById("itemTypesManagerCard");
    if (!card) return;

    const roles = typeof getUserRoles === "function" ? getUserRoles() : [];
    const isAdmin = roles.includes("admin");

    if (!isAdmin) {
        card.classList.add("hidden");
        return;
    }

    card.classList.remove("hidden");
    const countByType = {};
    inventory.forEach((item) => {
        if (item.type_id) countByType[item.type_id] = (countByType[item.type_id] || 0) + 1;
    });

    card.innerHTML = `
        <div class="item-type-manager-header">
            <h3>أنواع المنتجات</h3>
        </div>
        <div class="item-type-add-row">
            <input id="newTypeName" placeholder="اسم النوع الجديد"
                   onkeydown="if(event.key==='Enter') addItemType()">
            <button class="done" type="button" onclick="addItemType()">
                <i class="bi bi-plus-lg"></i> إضافة
            </button>
        </div>
        <div class="item-type-list">
            ${itemTypes.length === 0
                ? `<p class="muted-text">لا توجد أنواع بعد — أضف أول نوع لتنظيم المخزون</p>`
                : itemTypes.map((t) => `
                    <div class="item-type-row">
                        <div class="item-type-row-info">
                            <span class="item-type-name">${escapeHtml(t.name)}</span>
                            <span class="item-type-item-count">${countByType[t.id] || 0} منتج</span>
                        </div>
                        <div class="item-type-actions">
                            <button class="item-type-btn-edit" type="button" title="تعديل الاسم"
                                    onclick="renameItemType(${t.id}, '${escapeHtml(t.name)}')">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="item-type-btn-delete" type="button" title="حذف"
                                    onclick="deleteItemType(${t.id}, '${escapeHtml(t.name)}')">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>`).join("")}
        </div>`;
}

async function addItemType() {
    const input = document.getElementById("newTypeName");
    const name = input?.value.trim();
    if (!name) return alert("أدخل اسم النوع");

    try {
        await api.createItemType({ name });
        input.value = "";
        await loadItems();
    } catch (err) {
        console.error("Error creating item type:", err);
        alert("فشل إضافة النوع");
    }
}

async function renameItemType(id, currentName) {
    const newName = prompt("الاسم الجديد للنوع:", currentName);
    if (!newName || newName.trim() === currentName.trim()) return;

    try {
        await api.updateItemType(id, { name: newName.trim() });
        await loadItems();
    } catch (err) {
        console.error("Error renaming item type:", err);
        alert("فشل تعديل النوع");
    }
}

async function deleteItemType(id, name) {
    if (!confirm(`هل تريد حذف النوع "${name}"؟ ستفقد المنتجات المرتبطة به تصنيفها.`)) return;

    try {
        await api.deleteItemType(id);
        await loadItems();
    } catch (err) {
        console.error("Error deleting item type:", err);
        alert("فشل حذف النوع");
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
        alert(err.message || "فشل حذف العنصر");
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

    const roles = typeof getUserRoles === "function" ? getUserRoles() : [];
    const isAdmin = roles.includes("admin");

    const typeRow = document.getElementById("setQtyTypeRow");
    const typeSelect = document.getElementById("setQtyTypeSelect");
    const renameRow = document.getElementById("setQtyRenameRow");
    const nameInput = document.getElementById("setQtyNameInput");

    if (isAdmin && typeRow && typeSelect) {
        typeSelect.innerHTML = `<option value="">بدون تصنيف</option>` +
            itemTypes.map((t) => `<option value="${t.id}" ${String(t.id) === String(item.type_id ?? "") ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("");
        typeRow.classList.remove("hidden");
    } else if (typeRow) {
        typeRow.classList.add("hidden");
    }

    if (isAdmin && renameRow && nameInput) {
        nameInput.value = item.name;
        renameRow.classList.remove("hidden");
    } else if (renameRow) {
        renameRow.classList.add("hidden");
    }

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

    const roles = typeof getUserRoles === "function" ? getUserRoles() : [];
    const isAdmin = roles.includes("admin");

    const payload = { quantity: newQty };

    if (isAdmin) {
        const typeSelectEl = document.getElementById("setQtyTypeSelect");
        if (typeSelectEl) {
            payload.type_id = typeSelectEl.value ? Number(typeSelectEl.value) : null;
        }
        const nameInputEl = document.getElementById("setQtyNameInput");
        if (nameInputEl) {
            const newName = nameInputEl.value.trim();
            const item = inventory.find((e) => String(e.id) === String(_setQtyItemId));
            if (newName && newName !== item?.name) payload.name = newName;
        }
    }

    try {
        await api.updateInventoryItem(_setQtyItemId, payload);
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

    const rows = nonZero.map((item) => ({
        "النوع": _getTypeName(item.type_id) || "بدون تصنيف",
        "المنتج": item.name,
        "الكمية": item.quantity,
    }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: ["النوع", "المنتج", "الكمية"] });
    ws["!cols"] = [{ wch: 20 }, { wch: 30 }, { wch: 12 }];

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
window.addItemType = addItemType;
window.renameItemType = renameItemType;
window.deleteItemType = deleteItemType;
