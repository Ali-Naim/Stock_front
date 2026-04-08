async function createItem() {
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
        const data = await api.getInventory();
        inventory = data || [];

        const list = document.getElementById("inventoryList");
        const stockSelect = document.getElementById("name");
        const orderSelect = document.getElementById("orderItem");
        const needSelect = document.getElementById("needItem");

        list.innerHTML = "";
        stockSelect.innerHTML = `<option value="">اختر المنتج</option>`;
        orderSelect.innerHTML = `<option value="">اختر المنتج</option>`;
        needSelect.innerHTML = `<option value="">اختر المنتج</option>`;

        if (inventory.length === 0) {
            list.innerHTML = renderEmptyState("لا توجد عناصر في المخزون");
            stockSelect.innerHTML = `<option value="">لا يوجد</option>`;
            orderSelect.innerHTML = `<option value="">لا يوجد</option>`;
            needSelect.innerHTML = `<option value="">لا يوجد</option>`;
            return;
        }

        inventory.forEach((item) => {
            list.innerHTML += `
                <div class="card item">
                    <div class="item-meta">
                        <strong>${escapeHtml(item.name)}</strong>
                        <small>الكمية: ${item.quantity}</small>
                    </div>
                    <div class="stock-actions">
                        <div class="qty-stepper">
                            <button class="delete" onclick="adjustInventoryQty(${item.id}, -1)">-</button>
                            <span class="qty-value">${item.quantity}</span>
                            <button class="add" onclick="adjustInventoryQty(${item.id}, 1)">+</button>
                        </div>
                        <button class="delete" onclick="deleteItem(${item.id})">حذف</button>
                    </div>
                </div>`;

            stockSelect.innerHTML += `<option value="${item.id}">${escapeHtml(item.name)}</option>`;
            orderSelect.innerHTML += `<option value="${item.id}">${escapeHtml(item.name)} (متوفر: ${item.quantity})</option>`;
            needSelect.innerHTML += `<option value="${item.id}">${escapeHtml(item.name)}</option>`;
        });

        updateNeedItemPreview();
    } catch (err) {
        console.error("Error loading inventory:", err);
        document.getElementById("inventoryList").innerHTML = `<div class="card" style="background:#fff1f1">فشل تحميل المخزون</div>`;
    }
}
async function adjustInventoryQty(itemId, delta) {
    try {
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
        await api.deleteInventoryItem(id);
        await loadItems();
    } catch (err) {
        console.error("Error deleting item:", err);
        alert("فشل حذف العنصر");
    }
}
