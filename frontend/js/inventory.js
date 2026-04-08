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

        const createItemBtn = document.getElementById("createItemBtn");
        if (createItemBtn) createItemBtn.classList.toggle("hidden", !isAdmin);

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
        const listInventory = isStockOnly ? inventory.filter((item) => Number(item.quantity) > 0) : inventory;

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

        listInventory.forEach((item) => {
            list.innerHTML += `
                <div class="card item">
                    <div class="item-meta">
                        <strong>${escapeHtml(item.name)}</strong>
                        <small>الكمية: ${item.quantity}</small>
                    </div>
                    <div class="stock-actions">
                        ${
                            canAdjustQty
                                ? `<div class="qty-stepper">
                            <button class="delete" onclick="adjustInventoryQty(${item.id}, -1)">-</button>
                            <span class="qty-value">${item.quantity}</span>
                            <button class="add" onclick="adjustInventoryQty(${item.id}, 1)">+</button>
                        </div>`
                                : ""
                        }
                        ${isAdmin ? `<button class="delete" onclick="deleteItem(${item.id})">حذف</button>` : ""}
                    </div>
                </div>`;
        });

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
