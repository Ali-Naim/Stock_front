
const SUPABASE_URL = "https://hrejmgfrcyiflhreokkl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyZWptZ2ZyY3lpZmxocmVva2tsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NDIyNDIsImV4cCI6MjA5MDAxODI0Mn0.RaIQfRKufKOfDcZxKmnjaKiZpOjIC6cZhVC1qJuSyr0";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let villages = [];
let inventory = [];
let currentOrder = [];
let currentNeedItems = [];
let currentFilters = { name: "", village: "", status: "", saved: "", registered: "", dateFrom: "", dateTo: "" };
let currentNeedFilters = { name: "", phone: "", village: "", status: "", priority: "" };
let editingOrderId = null;
let inlineEditingOrderId = null;
let editingNeedId = null;
let needToOrderId = null;
let pendingOrderSourceNeedId = null;

function setActiveTabState(tabName) {
    document.querySelectorAll("[data-tab-target]").forEach((element) => {
        element.classList.toggle("active", element.dataset.tabTarget === tabName);
    });
}

function switchTab(tabName) {
    document.querySelectorAll(".section").forEach((section) => {
        section.classList.toggle("active", section.id === tabName);
    });

    setActiveTabState(tabName);

    if (tabName === "orders" && (!currentFilters.dateFrom && !currentFilters.dateTo)) {
        setTodayDateFilters();
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
        const { data, error } = await supabaseClient.from("villages").select("*");
        if (error) throw error;
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
    document.getElementById("orderVillage").innerHTML = getOrderVillageOptions();
    document.getElementById("needVillage").innerHTML = getVillageOptions();
    document.getElementById("villageFilter").innerHTML = `<option value="">كل القرى</option>${villages.map((village) => `<option value="${escapeHtml(village.name)}">${escapeHtml(village.name)}</option>`).join("")}`;
    document.getElementById("needVillageFilter").innerHTML = `<option value="">كل القرى</option>${villages.map((village) => `<option value="${village.id}">${escapeHtml(village.name)}</option>`).join("")}`;
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

        const { data, error } = await supabaseClient
            .from("inventory")
            .insert([{ name: itemName, quantity: 0 }])
            .select()
            .single();

        if (error) throw error;

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
        const { data, error } = await supabaseClient.from("inventory").select("*").order("name");
        if (error) throw error;

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

        const { error } = await supabaseClient.from("inventory").update({ quantity: newQuantity }).eq("id", itemId);
        if (error) throw error;

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
        const { error } = await supabaseClient.from("inventory").update({ quantity: newQuantity }).eq("id", itemId);
        if (error) throw error;

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
        const { error } = await supabaseClient.from("inventory").delete().eq("id", id);
        if (error) throw error;
        await loadItems();
    } catch (err) {
        console.error("Error deleting item:", err);
        alert("فشل حذف العنصر");
    }
}

function addToOrder() {
    const orderName = String(document.getElementById("orderName").value).trim();
    const village = document.getElementById("orderVillage").value;
    const itemId = document.getElementById("orderItem").value;
    const qty = Number(document.getElementById("orderQty").value);

    if (!orderName) return alert("أدخل اسم الطلب أو العميل");
    if (!village) return alert("اختر القرية");
    if (!itemId) return alert("اختر المنتج");
    if (!qty || qty <= 0) return alert("أدخل كمية صحيحة أكبر من صفر");

    const item = inventory.find((entry) => String(entry.id) === String(itemId));
    if (!item) return alert("العنصر غير متوفر في المخزون");
    if (qty > item.quantity) return alert(`الكمية المطلوبة أكبر من المتوفر (${item.quantity})`);

    currentOrder.push({ id: item.id, name: item.name, qty });
    document.getElementById("orderQty").value = "";
    renderOrder();
}

function renderOrder() {
    const list = document.getElementById("orderList");
    list.innerHTML = "";

    if (currentOrder.length === 0) {
        list.innerHTML = renderEmptyState("لا توجد عناصر في الطلب الحالي");
        return;
    }

    currentOrder.forEach((item, index) => {
        list.innerHTML += `
            <div class="card item">
                <div class="item-meta">
                    <span>${escapeHtml(item.name)}</span>
                    <small>الكمية الحالية في الطلب</small>
                </div>
                <div class="qty-stepper">
                    <button class="delete" onclick="adjustQty(${index}, -1)">-</button>
                    <span class="qty-value">${item.qty}</span>
                    <button class="add" onclick="adjustQty(${index}, 1)">+</button>
                </div>
                <button class="delete" onclick="removeItem(${index})">حذف</button>
            </div>`;
    });
}

function removeItem(index) {
    currentOrder.splice(index, 1);
    renderOrder();
}

function adjustQty(index, delta) {
    const item = currentOrder[index];
    const newQty = item.qty + delta;

    if (newQty < 1) return;

    const stock = inventory.find((entry) => entry.id === item.id);
    if (!stock) return alert(`العنصر ${item.name} غير متوفر`);

    const availableQty = editingOrderId ? stock.quantity + (item.originalQty || 0) : stock.quantity;
    if (newQty > availableQty) {
        return alert(`الكمية المتاحة محدودة (${availableQty})`);
    }

    item.qty = newQty;
    renderOrder();
}

async function restoreInventoryForItems(items = []) {
    for (const item of items) {
        const stock = inventory.find((entry) => entry.id == item.id);
        if (!stock) continue;

        const restoredQty = stock.quantity + item.qty;
        const { error } = await supabaseClient.from("inventory").update({ quantity: restoredQty }).eq("id", item.id);
        if (error) throw error;

        stock.quantity = restoredQty;
    }
}

async function applyInventoryForItems(items = []) {
    for (const item of items) {
        const stock = inventory.find((entry) => entry.id == item.id);
        if (!stock) throw new Error(`العنصر ${item.name} غير متوفر`);

        if (item.qty > stock.quantity) {
            throw new Error(`الكمية المطلوبة من ${item.name} أكبر من المتاح (${stock.quantity})`);
        }

        const newQty = stock.quantity - item.qty;
        const { error } = await supabaseClient.from("inventory").update({ quantity: newQty }).eq("id", item.id);
        if (error) throw error;

        stock.quantity = newQty;
    }
}

async function submitOrder() {
    if (currentOrder.length === 0) return alert("لا توجد عناصر في الطلب");

    try {
        const orderName = String(document.getElementById("orderName").value).trim();
        const phoneNumber = String(document.getElementById("orderPhone").value).trim();
        const village = document.getElementById("orderVillage").value;
        const isRegistered = document.getElementById("orderRegistered").value === "true";
        if (!orderName) return alert("أدخل اسم الطلب أو العميل قبل الحفظ");
        if (!phoneNumber) return alert("أدخل رقم الهاتف قبل الحفظ");
        if (!village) return alert("اختر القرية قبل الحفظ");

        const orderRecord = {
            order_name: orderName,
            phone_number: phoneNumber,
            village,
            is_registered: isRegistered,
            source_need_id: pendingOrderSourceNeedId || null,
            items: currentOrder.map((item) => ({ id: item.id, name: item.name, qty: item.qty })),
            is_saved: editingOrderId ? undefined : false,
            status: editingOrderId ? undefined : "pending",
        };

        if (editingOrderId) {
            const { data: oldOrder, error: fetchErr } = await supabaseClient.from("orders").select("*").eq("id", editingOrderId).single();
            if (fetchErr) throw fetchErr;

            await restoreInventoryForItems(oldOrder.items || []);
            await loadItems();
            await applyInventoryForItems(orderRecord.items);

            const { error } = await supabaseClient.from("orders").update(orderRecord).eq("id", editingOrderId);
            if (error) throw error;
        } else {
            await applyInventoryForItems(orderRecord.items);
            const { error } = await supabaseClient.from("orders").insert([orderRecord]);
            if (error) throw error;
        }

        alert(editingOrderId ? "تم تحديث الطلب بنجاح" : "تم حفظ الطلب بنجاح");
        cancelEdit();
        await loadItems();
        await loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.registered, currentFilters.dateFrom, currentFilters.dateTo);
    } catch (err) {
        console.error("Error submitting order:", err);
        alert(err.message || "فشل حفظ الطلب");
    }
}
async function setOrderStatus(orderId, status) {
    try {
        const { error } = await supabaseClient.from("orders").update({ status }).eq("id", orderId);
        if (error) throw error;
        await loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.registered, currentFilters.dateFrom, currentFilters.dateTo);
    } catch (err) {
        console.error("Error updating order status:", err);
        alert("فشل تحديث حالة الطلب");
    }
}

async function setOrderSaved(orderId, isSaved) {
    try {
        const { error } = await supabaseClient.from("orders").update({ is_saved: isSaved }).eq("id", orderId);
        if (error) throw error;
        await loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.registered, currentFilters.dateFrom, currentFilters.dateTo);
    } catch (err) {
        console.error("Error updating saved flag:", err);
        alert("فشل تحديث حالة الحفظ");
    }
}

function cancelEdit() {
    editingOrderId = null;
    pendingOrderSourceNeedId = null;
    currentOrder = [];
    document.getElementById("orderName").value = "";
    document.getElementById("orderPhone").value = "";
    document.getElementById("orderVillage").value = "";
    document.getElementById("orderRegistered").value = "false";
    document.getElementById("orderQty").value = "";
    updateOrderSourceBadge();
    renderOrder();
    document.querySelector("#orders .button-group .done").textContent = "تأكيد الطلب";
    document.getElementById("cancelEditBtn").style.display = "none";
}

function startInlineEdit(orderId) {
    inlineEditingOrderId = orderId;
    loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.registered, currentFilters.dateFrom, currentFilters.dateTo);
}

function cancelInlineEdit() {
    inlineEditingOrderId = null;
    loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.registered, currentFilters.dateFrom, currentFilters.dateTo);
}

async function saveInlineEdit(orderId) {
    const newName = document.getElementById(`edit-order-name-${orderId}`).value.trim();
    const newVillage = document.getElementById(`edit-order-village-${orderId}`).value;

    if (!newName) return alert("يجب إدخال اسم الطلب");
    if (!newVillage) return alert("اختر القرية");

    const updatedItems = [];
    let itemIndex = 0;
    while (document.getElementById(`item-type-${orderId}-${itemIndex}`)) {
        const itemType = document.getElementById(`item-type-${orderId}-${itemIndex}`).value;
        const itemQty = parseInt(document.getElementById(`item-qty-${orderId}-${itemIndex}`).textContent, 10);
        const item = inventory.find((entry) => entry.id == itemType);

        if (item) {
            updatedItems.push({ id: item.id, name: item.name, qty: itemQty });
        }
        itemIndex += 1;
    }

    if (updatedItems.length === 0) return alert("يجب أن يحتوي الطلب على عنصر واحد على الأقل");

    try {
        const { data: originalOrder, error: fetchErr } = await supabaseClient.from("orders").select("*").eq("id", orderId).single();
        if (fetchErr) throw fetchErr;

        await restoreInventoryForItems(originalOrder.items || []);
        await loadItems();
        await applyInventoryForItems(updatedItems);

        const { error: updateErr } = await supabaseClient
            .from("orders")
            .update({ order_name: newName, village: newVillage, items: updatedItems })
            .eq("id", orderId);

        if (updateErr) throw updateErr;

        alert("تم تحديث الطلب بنجاح");
        inlineEditingOrderId = null;
        await loadItems();
        await loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.registered, currentFilters.dateFrom, currentFilters.dateTo);
    } catch (err) {
        console.error("Error saving inline edit:", err);
        alert(err.message || "فشل حفظ التعديلات");
    }
}

async function deleteOrder(orderId) {
    if (!confirm("هل تريد حذف هذا الطلب وإرجاع الكميات إلى المخزون؟")) return;

    try {
        const { data: order, error: fetchErr } = await supabaseClient.from("orders").select("*").eq("id", orderId).single();
        if (fetchErr) throw fetchErr;

        await restoreInventoryForItems(order.items || []);

        const { error: deleteErr } = await supabaseClient.from("orders").delete().eq("id", orderId);
        if (deleteErr) throw deleteErr;

        if (editingOrderId === orderId) cancelEdit();
        if (inlineEditingOrderId === orderId) inlineEditingOrderId = null;

        await loadItems();
        await loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.registered, currentFilters.dateFrom, currentFilters.dateTo);
    } catch (err) {
        console.error("Error deleting order:", err);
        alert("فشل حذف الطلب");
    }
}

function adjustInlineQty(orderId, itemIndex, delta) {
    const qtyElement = document.getElementById(`item-qty-${orderId}-${itemIndex}`);
    const typeElement = document.getElementById(`item-type-${orderId}-${itemIndex}`);
    const currentQty = parseInt(qtyElement.textContent, 10);
    const newQty = currentQty + delta;

    if (newQty < 1) return;

    const itemId = typeElement.value;
    const stock = inventory.find((entry) => entry.id == itemId);
    if (!stock) return;

    if (newQty > stock.quantity + 10) {
        alert("الكمية المتاحة محدودة");
        return;
    }

    qtyElement.textContent = newQty;
}

function removeInlineItem(orderId, itemIndex) {
    const row = document.querySelector(`#item-type-${orderId}-${itemIndex}`)?.closest(".inline-edit-row");
    if (!row) return;
    row.remove();

    document.querySelectorAll(`[id^="item-type-${orderId}-"]`).forEach((selectElement, index) => {
        selectElement.id = `item-type-${orderId}-${index}`;

        const rowElement = selectElement.closest(".inline-edit-row");
        const stepper = rowElement.querySelector(".qty-stepper");
        const valueSpan = stepper.querySelector(".qty-value");
        valueSpan.id = `item-qty-${orderId}-${index}`;

        const [minusButton, plusButton] = stepper.querySelectorAll("button");
        minusButton.setAttribute("onclick", `adjustInlineQty(${orderId}, ${index}, -1)`);
        plusButton.setAttribute("onclick", `adjustInlineQty(${orderId}, ${index}, 1)`);

        rowElement.querySelector(".delete").setAttribute("onclick", `removeInlineItem(${orderId}, ${index})`);
    });
}

function buildInlineItemRow(orderId, index, itemId = "", qty = 1) {
    return `
        <div class="inline-edit-row">
            <select id="item-type-${orderId}-${index}">
                ${inventory.map((inv) => `
                    <option value="${inv.id}" ${String(inv.id) === String(itemId) ? "selected" : ""}>
                        ${escapeHtml(inv.name)} (متوفر: ${inv.quantity})
                    </option>`).join("")}
            </select>
            <div class="qty-stepper">
                <button class="delete" onclick="adjustInlineQty(${orderId}, ${index}, -1)">-</button>
                <span id="item-qty-${orderId}-${index}" class="qty-value">${qty}</span>
                <button class="add" onclick="adjustInlineQty(${orderId}, ${index}, 1)">+</button>
            </div>
            <button class="delete" onclick="removeInlineItem(${orderId}, ${index})">حذف</button>
        </div>`;
}

function addInlineItem(orderId) {
    const container = document.querySelector(`#inline-items-${orderId}`);
    if (!container) return;

    const existingItems = container.querySelectorAll('[id^="item-type-"]').length;
    container.insertAdjacentHTML("beforeend", buildInlineItemRow(orderId, existingItems));
}
async function loadOrderHistory(nameFilter = "", villageFilter = "", statusFilter = "", savedFilter = "", registeredFilter = "", dateFrom = "", dateTo = "") {
    try {
        let query = supabaseClient.from("orders").select("*").order("created_at", { ascending: false });

        if (nameFilter.trim()) query = query.ilike("order_name", `%${nameFilter.trim()}%`);
        if (villageFilter) query = query.eq("village", villageFilter);
        if (statusFilter) query = query.eq("status", statusFilter);
        if (savedFilter === "saved") query = query.eq("is_saved", true);
        if (savedFilter === "unsaved") query = query.eq("is_saved", false);
        if (registeredFilter === "registered") query = query.eq("is_registered", true);
        if (registeredFilter === "not_registered") query = query.eq("is_registered", false);
        if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00.000Z`);
        if (dateTo) {
            const endDate = new Date(dateTo);
            endDate.setDate(endDate.getDate() + 1);
            query = query.lt("created_at", `${endDate.toISOString().split("T")[0]}T00:00:00.000Z`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const history = data || [];
        const container = document.getElementById("orderHistory");
        container.innerHTML = "";

        if (history.length === 0) {
            container.innerHTML = renderEmptyState("لا توجد سجلات طلبات بعد");
            return;
        }

        history.forEach((order) => {
            const isInlineEditing = inlineEditingOrderId === order.id;
            const done = order.status === "done";
            const saved = Boolean(order.is_saved);
            const orderDisplayName = order.order_name || `الطلب #${order.id || ""}`;
            const sourceNeedBadge = order.source_need_id ? `<span class="order-origin-chip">من الاحتياجات</span>` : "";

            const itemsHtml = isInlineEditing
                ? `
                    <input type="text" id="edit-order-name-${order.id}" value="${escapeHtml(orderDisplayName)}" placeholder="اسم الطلب">
                    <select id="edit-order-village-${order.id}" class="inline-village-select">${getOrderVillageOptions(order.village || "")}</select>
                    <div id="inline-items-${order.id}" class="order-items">
                        ${(order.items || []).map((item, index) => buildInlineItemRow(order.id, index, item.id, item.qty)).join("")}
                    </div>
                    <button class="done" onclick="addInlineItem(${order.id})">+ إضافة عنصر</button>`
                : `
                    <div class="order-items">
                        ${(order.items || []).map((item) => `<div class="order-line">• ${escapeHtml(item.name)} - ${item.qty}</div>`).join("") || "لا توجد عناصر"}
                    </div>`;

            const actionsHtml = isInlineEditing
                ? `
                    <div class="inline-actions">
                        <button class="add" onclick="saveInlineEdit(${order.id})">حفظ</button>
                        <button class="delete" onclick="cancelInlineEdit()">إلغاء</button>
                    </div>`
                : `
                    <div class="order-quick-actions">
                        <button class="done" onclick="startInlineEdit(${order.id})">تعديل</button>
                        <button class="delete" onclick="deleteOrder(${order.id})">حذف</button>
                    </div>
                    <div class="order-toggle-list">
                        <label class="toggle-chip">
                            <input type="checkbox" ${done ? "checked" : ""} onchange="setOrderStatus(${order.id}, this.checked ? 'done' : 'pending')">
                            <span>مكتمل</span>
                        </label>
                        <label class="toggle-chip saved">
                            <input type="checkbox" ${saved ? "checked" : ""} onchange="setOrderSaved(${order.id}, this.checked)">
                            <span>محفوظ</span>
                        </label>
                    </div>`;

            container.innerHTML += `
                <div class="order-history-item ${done ? "done" : "pending"} ${saved ? "saved" : ""}">
                    <div class="order-header">
                        <div class="order-title-wrap">
                            <strong>${escapeHtml(orderDisplayName)} ${sourceNeedBadge}</strong>
                            <small>${order.phone_number ? `الهاتف: ${escapeHtml(order.phone_number)} - ` : ""}${order.village ? `القرية: ${escapeHtml(order.village)} - ` : ""}${formatDate(order.created_at)}</small>
                            <small>${order.is_registered ? "العميل مسجل سابقًا" : "العميل غير مسجل سابقًا"}</small>
                        </div>
                        <div class="order-actions">
                            ${actionsHtml}
                        </div>
                    </div>
                    ${itemsHtml}
                    <div class="status-label"><small>الحالة: ${done ? "مكتمل" : "قيد التنفيذ"}${saved ? " - محفوظ" : " - غير محفوظ"}</small></div>
                </div>`;
        });
    } catch (err) {
        console.error("Error loading order history:", err);
        document.getElementById("orderHistory").innerHTML = `<div class="card" style="background:#fff1f1">فشل تحميل سجل الطلبات</div>`;
    }
}

function applyFilters() {
    const nameFilter = document.getElementById("nameFilter").value;
    const villageFilter = document.getElementById("villageFilter").value;
    const statusFilter = document.getElementById("statusFilter").value;
    const savedFilter = document.getElementById("savedFilter").value;
    const registeredFilter = document.getElementById("registeredFilter").value;
    const dateFrom = document.getElementById("dateFrom").value;
    const dateTo = document.getElementById("dateTo").value;

    currentFilters = { name: nameFilter, village: villageFilter, status: statusFilter, saved: savedFilter, registered: registeredFilter, dateFrom, dateTo };
    loadOrderHistory(nameFilter, villageFilter, statusFilter, savedFilter, registeredFilter, dateFrom, dateTo);
}

function clearFilters() {
    document.getElementById("nameFilter").value = "";
    document.getElementById("villageFilter").value = "";
    document.getElementById("statusFilter").value = "";
    document.getElementById("savedFilter").value = "";
    document.getElementById("registeredFilter").value = "";
    document.getElementById("dateFrom").value = "";
    document.getElementById("dateTo").value = "";
    currentFilters = { name: "", village: "", status: "", saved: "", registered: "", dateFrom: "", dateTo: "" };
    loadOrderHistory();
}

function addNeedItem() {
    const familyName = String(document.getElementById("needFamilyName").value).trim();
    const phoneNumber = String(document.getElementById("needPhone").value).trim();
    const village = document.getElementById("needVillage").value;
    const peopleCount = Number(document.getElementById("needPeopleCount").value);
    const priority = document.getElementById("needPriority").value;
    const itemId = document.getElementById("needItem").value;
    const qty = Number(document.getElementById("needQty").value);

    if (!familyName) return alert("أدخل اسم العائلة");
    if (!phoneNumber) return alert("أدخل رقم الهاتف");
    if (!village) return alert("اختر القرية");
    if (!peopleCount || peopleCount <= 0) return alert("أدخل عدد الأفراد");
    if (!priority) return alert("اختر الأولوية");
    if (!itemId) return alert("اختر المنتج");
    if (!qty || qty <= 0) return alert("أدخل الكمية المطلوبة");

    const item = inventory.find((entry) => String(entry.id) === String(itemId));
    if (!item) return alert("العنصر غير موجود");

    currentNeedItems.push({ id: item.id, name: item.name, qty });
    document.getElementById("needQty").value = "";
    renderNeedItems();
}

function renderNeedItems() {
    const container = document.getElementById("needItemsList");
    container.innerHTML = "";

    if (currentNeedItems.length === 0) {
        container.innerHTML = renderEmptyState("لا توجد مواد مضافة لهذا الاحتياج");
        return;
    }

    currentNeedItems.forEach((item, index) => {
        container.innerHTML += `
            <div class="card item need-item-card">
                <div class="item-meta">
                    <span>${escapeHtml(item.name)}</span>
                    <small>الكمية المطلوبة</small>
                </div>
                <div class="qty-stepper">
                    <button class="delete" onclick="adjustNeedQty(${index}, -1)">-</button>
                    <span class="qty-value">${item.qty}</span>
                    <button class="add" onclick="adjustNeedQty(${index}, 1)">+</button>
                </div>
                <button class="delete" onclick="removeNeedItem(${index})">حذف</button>
            </div>`;
    });
}

function adjustNeedQty(index, delta) {
    const item = currentNeedItems[index];
    const newQty = item.qty + delta;
    if (newQty < 1) return;
    item.qty = newQty;
    renderNeedItems();
}

function removeNeedItem(index) {
    currentNeedItems.splice(index, 1);
    renderNeedItems();
}
async function submitNeed() {
    if (currentNeedItems.length === 0) return alert("أضف مادة واحدة على الأقل");

    const familyName = String(document.getElementById("needFamilyName").value).trim();
    const phoneNumber = String(document.getElementById("needPhone").value).trim();
    const villageId = document.getElementById("needVillage").value;
    const peopleCount = Number(document.getElementById("needPeopleCount").value);
    const priority = document.getElementById("needPriority").value;

    if (!familyName) return alert("أدخل اسم العائلة");
    if (!phoneNumber) return alert("أدخل رقم الهاتف");
    if (!villageId) return alert("اختر القرية");
    if (!peopleCount || peopleCount <= 0) return alert("أدخل عدد أفراد صحيح");
    if (!priority) return alert("اختر الأولوية");

    const payload = {
        family_name: familyName,
        phone_number: phoneNumber,
        village_id: Number(villageId),
        people_count: peopleCount,
        priority,
        items: currentNeedItems.map((item) => ({ id: item.id, name: item.name, qty: item.qty })),
        status: editingNeedId ? undefined : "pending",
        updated_at: new Date().toISOString(),
    };

    try {
        if (editingNeedId) {
            const { error } = await supabaseClient.from("family_needs").update(payload).eq("id", editingNeedId);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient.from("family_needs").insert([payload]);
            if (error) throw error;
        }

        alert(editingNeedId ? "تم تحديث الاحتياج بنجاح" : "تم حفظ الاحتياج بنجاح");
        cancelNeedEdit();
        await loadNeedsHistory(currentNeedFilters.name, currentNeedFilters.phone, currentNeedFilters.village, currentNeedFilters.status, currentNeedFilters.priority);
    } catch (err) {
        console.error("Error saving need:", err);
        alert(err.message || "فشل حفظ احتياج العائلة");
    }
}

function cancelNeedEdit() {
    editingNeedId = null;
    currentNeedItems = [];
    document.getElementById("needFamilyName").value = "";
    document.getElementById("needPhone").value = "";
    document.getElementById("needVillage").value = "";
    document.getElementById("needPeopleCount").value = "";
    document.getElementById("needPriority").value = "normal";
    document.getElementById("needItem").value = "";
    document.getElementById("needQty").value = "";
    document.getElementById("submitNeedBtn").textContent = "حفظ الاحتياج";
    document.getElementById("cancelNeedEditBtn").style.display = "none";
    updateNeedItemPreview();
    renderNeedItems();
}

async function editNeed(needId) {
    try {
        const { data, error } = await supabaseClient.from("family_needs").select("*").eq("id", needId).single();
        if (error) throw error;

        editingNeedId = needId;
        document.getElementById("needFamilyName").value = data.family_name || "";
        document.getElementById("needPhone").value = data.phone_number || "";
        document.getElementById("needVillage").value = data.village_id || "";
        document.getElementById("needPeopleCount").value = data.people_count || "";
        document.getElementById("needPriority").value = data.priority || "normal";
        currentNeedItems = (data.items || []).map((item) => ({ id: item.id, name: item.name, qty: item.qty }));
        document.getElementById("submitNeedBtn").textContent = "تحديث الاحتياج";
        document.getElementById("cancelNeedEditBtn").style.display = "inline-flex";
        updateNeedItemPreview();
        renderNeedItems();
        switchTab("needs");
        window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
        console.error("Error loading need for edit:", err);
        alert("فشل تحميل الاحتياج");
    }
}

async function deleteNeed(needId) {
    if (!confirm("هل تريد حذف هذا الاحتياج؟")) return;

    try {
        const { error } = await supabaseClient.from("family_needs").delete().eq("id", needId);
        if (error) throw error;

        if (editingNeedId === needId) {
            cancelNeedEdit();
        }

        await loadNeedsHistory(currentNeedFilters.name, currentNeedFilters.phone, currentNeedFilters.village, currentNeedFilters.status, currentNeedFilters.priority);
    } catch (err) {
        console.error("Error deleting need:", err);
        alert("فشل حذف الاحتياج");
    }
}

async function setNeedStatus(needId, status) {
    try {
        const { error } = await supabaseClient
            .from("family_needs")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", needId);
        if (error) throw error;

        await loadNeedsHistory(currentNeedFilters.name, currentNeedFilters.phone, currentNeedFilters.village, currentNeedFilters.status, currentNeedFilters.priority);
    } catch (err) {
        console.error("Error updating need status:", err);
        alert("فشل تحديث حالة الاحتياج");
    }
}

async function importNeedsExcel() {
    try {
        const input = document.getElementById("needsExcelFile");
        const file = input.files?.[0];

        if (!file) {
            return setNeedsImportResult("اختر ملف Excel أولًا", "error");
        }

        if (!window.XLSX) {
            return setNeedsImportResult("مكتبة قراءة Excel غير متوفرة", "error");
        }

        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (!rows.length) {
            return setNeedsImportResult("الملف فارغ أو لا يحتوي على بيانات", "error");
        }

        const firstRow = rows[0];
        const headers = Object.keys(firstRow);
        const normalizedHeaders = headers.map(normalizeHeader);

        const requiredHeaders = ["family_name", "phone_number", "village", "people_count"];
        const missingHeaders = requiredHeaders.filter((header) => !normalizedHeaders.includes(header));
        if (missingHeaders.length) {
            return setNeedsImportResult(`الأعمدة الأساسية مفقودة: ${missingHeaders.join(", ")}`, "error");
        }

        const headerMap = Object.fromEntries(headers.map((header) => [normalizeHeader(header), header]));
        const itemHeaders = headers.filter((header) => !requiredHeaders.includes(normalizeHeader(header)));
        const inventoryMap = new Map(inventory.map((item) => [item.name.trim().toLowerCase(), item]));
        const villageMap = new Map(villages.map((village) => [village.name.trim().toLowerCase(), village]));

        const payload = [];
        const errors = [];

        rows.forEach((row, rowIndex) => {
            const familyName = String(row[headerMap.family_name] ?? "").trim();
            const phoneNumber = String(row[headerMap.phone_number] ?? "").trim();
            const villageName = String(row[headerMap.village] ?? "").trim();
            const peopleCount = Number(row[headerMap.people_count]);

            if (!familyName || !phoneNumber || !villageName || !peopleCount || peopleCount <= 0) {
                errors.push(`السطر ${rowIndex + 2}: بيانات أساسية غير مكتملة`);
                return;
            }

            const matchedVillage = villageMap.get(villageName.toLowerCase());
            if (!matchedVillage) {
                errors.push(`السطر ${rowIndex + 2}: القرية غير موجودة (${villageName})`);
                return;
            }

            const items = [];
            itemHeaders.forEach((header) => {
                const qty = Number(row[header]);
                if (!qty || qty <= 0) return;

                const matchedItem = inventoryMap.get(String(header).trim().toLowerCase());
                if (!matchedItem) {
                    errors.push(`السطر ${rowIndex + 2}: المادة غير موجودة في المخزون (${header})`);
                    return;
                }

                items.push({
                    id: matchedItem.id,
                    name: matchedItem.name,
                    qty,
                });
            });

            if (!items.length) {
                errors.push(`السطر ${rowIndex + 2}: لا توجد مواد بكميات أكبر من صفر`);
                return;
            }

            payload.push({
                family_name: familyName,
                phone_number: phoneNumber,
                village_id: matchedVillage.id,
                people_count: peopleCount,
                priority: "normal",
                status: "pending",
                items,
            });
        });

        if (errors.length) {
            return setNeedsImportResult(errors.slice(0, 8).join(" | "), "error");
        }

        const { error } = await supabaseClient.from("family_needs").insert(payload);
        if (error) throw error;

        input.value = "";
        setNeedsImportResult(`تم استيراد ${payload.length} احتياج بنجاح`, "success");
        await loadNeedsHistory(currentNeedFilters.name, currentNeedFilters.phone, currentNeedFilters.village, currentNeedFilters.status, currentNeedFilters.priority);
    } catch (err) {
        console.error("Error importing needs Excel:", err);
        setNeedsImportResult(err.message || "فشل استيراد ملف Excel", "error");
    }
}

async function openNeedToOrderModal(needId) {
    try {
        const { data, error } = await supabaseClient.from("family_needs").select("*").eq("id", needId).single();
        if (error) throw error;

        if (!data.items || data.items.length === 0) {
            return alert("لا توجد مواد متبقية في هذا الاحتياج");
        }

        needToOrderId = needId;
        const villageName = getVillageNameById(data.village_id);
        const rows = (data.items || []).map((item, index) => `
            <label class="need-order-row">
                <input type="checkbox" id="need-order-check-${index}" checked>
                <div class="need-order-row-copy">
                    <strong>${escapeHtml(item.name)}</strong>
                    <small>الكمية المتبقية: ${item.qty}</small>
                </div>
                <input id="need-order-qty-${index}" type="number" min="1" max="${item.qty}" value="${item.qty}">
            </label>
        `).join("");

        document.getElementById("needToOrderModalBody").innerHTML = `
            <div class="need-order-summary">
                <strong>${escapeHtml(data.family_name)}</strong>
                <small>القرية: ${escapeHtml(villageName)}</small>
            </div>
            <div id="needToOrderRows" data-family-name="${escapeHtml(data.family_name)}" data-village-id="${data.village_id}">
                ${rows}
            </div>
        `;

        document.getElementById("needToOrderModal").classList.add("active");
        document.body.style.overflow = "hidden";
    } catch (err) {
        console.error("Error opening need-to-order modal:", err);
        alert("فشل تحميل مواد الاحتياج");
    }
}

async function submitNeedToOrder() {
    if (!needToOrderId) return;

    try {
        const { data: need, error } = await supabaseClient.from("family_needs").select("*").eq("id", needToOrderId).single();
        if (error) throw error;

        const selectedItems = [];
        (need.items || []).forEach((item, index) => {
            const checked = document.getElementById(`need-order-check-${index}`)?.checked;
            const qty = Number(document.getElementById(`need-order-qty-${index}`)?.value);

            if (!checked) return;
            if (!qty || qty <= 0 || qty > item.qty) return;

            selectedItems.push({ id: item.id, name: item.name, qty });
        });

        if (selectedItems.length === 0) return alert("اختر مادة واحدة على الأقل");

        if (currentOrder.length > 0 && !confirm("يوجد طلب حالي غير محفوظ. هل تريد استبداله بمواد هذا الاحتياج؟")) {
            return;
        }

        const remainingItems = (need.items || [])
            .map((item) => {
                const selected = selectedItems.find((entry) => String(entry.id) === String(item.id) && entry.name === item.name);
                if (!selected) return item;
                const remainingQty = item.qty - selected.qty;
                return remainingQty > 0 ? { ...item, qty: remainingQty } : null;
            })
            .filter(Boolean);

        const nextStatus = remainingItems.length === 0 ? "done" : "in_progress";
        const { error: updateError } = await supabaseClient
            .from("family_needs")
            .update({
                items: remainingItems,
                status: nextStatus,
                updated_at: new Date().toISOString(),
            })
            .eq("id", needToOrderId);

        if (updateError) throw updateError;

        currentOrder = selectedItems.map((item) => ({ id: item.id, name: item.name, qty: item.qty }));
        pendingOrderSourceNeedId = need.id;
        document.getElementById("orderName").value = need.family_name || "";
        document.getElementById("orderPhone").value = need.phone_number || "";
        document.getElementById("orderVillage").value = getVillageNameById(need.village_id);
        document.getElementById("orderRegistered").value = "true";
        document.getElementById("orderQty").value = "";
        updateOrderSourceBadge();
        renderOrder();
        closeNeedToOrderModal();
        switchTab("orders");
        await loadNeedsHistory(currentNeedFilters.name, currentNeedFilters.phone, currentNeedFilters.village, currentNeedFilters.status, currentNeedFilters.priority);
    } catch (err) {
        console.error("Error converting need to order:", err);
        alert(err.message || "فشل تحويل الاحتياج إلى طلب");
    }
}

function getNeedPriorityLabel(priority) {
    if (priority === "urgent") return "عاجل";
    if (priority === "medium") return "متوسط";
    return "عادي";
}

function getNeedPriorityClass(priority) {
    if (priority === "urgent") return "urgent";
    if (priority === "medium") return "medium";
    return "normal";
}

async function loadNeedsHistory(nameFilter = "", phoneFilter = "", villageFilter = "", statusFilter = "", priorityFilter = "") {
    try {
        let query = supabaseClient.from("family_needs").select("*").order("created_at", { ascending: false });

        if (nameFilter.trim()) query = query.ilike("family_name", `%${nameFilter.trim()}%`);
        if (phoneFilter.trim()) query = query.ilike("phone_number", `%${phoneFilter.trim()}%`);
        if (villageFilter) query = query.eq("village_id", villageFilter);
        if (statusFilter) query = query.eq("status", statusFilter);
        if (priorityFilter) query = query.eq("priority", priorityFilter);

        const { data, error } = await query;
        if (error) throw error;

        const container = document.getElementById("needsHistoryTable");
        container.innerHTML = "";

        if (!data || data.length === 0) {
            container.innerHTML = renderEmptyState("لا توجد احتياجات محفوظة بعد");
            return;
        }

        const rows = data.map((need) => {
            const villageName = getVillageNameById(need.village_id);
            const itemsText = (need.items || []).map((item) => `${escapeHtml(item.name)} (${item.qty})`).join("، ") || "-";
            const priorityClass = getNeedPriorityClass(need.priority);

            return `
                <tr>
                    <td class="needs-date-cell">${formatDate(need.created_at)}</td>
                    <td>${escapeHtml(need.family_name)}</td>
                    <td>${escapeHtml(need.phone_number || "-")}</td>
                    <td>${escapeHtml(villageName)}</td>
                    <td>${need.people_count || 0}</td>
                    <td class="need-items-cell" title="${itemsText}">${itemsText}</td>
                    <td><span class="priority-badge ${priorityClass}">${getNeedPriorityLabel(need.priority)}</span></td>
                    <td>
                        <select onchange="setNeedStatus(${need.id}, this.value)">
                            <option value="pending" ${need.status === "pending" ? "selected" : ""}>قيد الانتظار</option>
                            <option value="in_progress" ${need.status === "in_progress" ? "selected" : ""}>قيد المتابعة</option>
                            <option value="done" ${need.status === "done" ? "selected" : ""}>مكتمل</option>
                        </select>
                    </td>
                    <td class="needs-actions-cell">
                        <button class="icon-action add" onclick="openNeedToOrderModal(${need.id})" title="إضافة كطلب" aria-label="إضافة كطلب">🛒</button>
                        <button class="icon-action done" onclick="editNeed(${need.id})" title="تعديل" aria-label="تعديل">✎</button>
                        <button class="icon-action delete" onclick="deleteNeed(${need.id})" title="حذف" aria-label="حذف">🗑</button>
                    </td>
                </tr>`;
        }).join("");

        container.innerHTML = `
            <div class="needs-table-wrap">
                <table class="needs-table">
                    <thead>
                        <tr>
                            <th>تاريخ الإنشاء</th>
                            <th>اسم العائلة</th>
                            <th>الهاتف</th>
                            <th>القرية</th>
                            <th>عدد الأفراد</th>
                            <th>المواد المطلوبة</th>
                            <th>الأولوية</th>
                            <th>الحالة</th>
                            <th>الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    } catch (err) {
        console.error("Error loading needs history:", err);
        document.getElementById("needsHistoryTable").innerHTML = `<div class="card" style="background:#fff1f1">فشل تحميل الاحتياجات</div>`;
    }
}

function applyNeedFilters() {
    const name = document.getElementById("needNameFilter").value;
    const phone = document.getElementById("needPhoneFilter").value;
    const village = document.getElementById("needVillageFilter").value;
    const status = document.getElementById("needStatusFilter").value;
    const priority = document.getElementById("needPriorityFilter").value;

    currentNeedFilters = { name, phone, village, status, priority };
    loadNeedsHistory(name, phone, village, status, priority);
}

function clearNeedFilters() {
    document.getElementById("needNameFilter").value = "";
    document.getElementById("needPhoneFilter").value = "";
    document.getElementById("needVillageFilter").value = "";
    document.getElementById("needStatusFilter").value = "";
    document.getElementById("needPriorityFilter").value = "";
    currentNeedFilters = { name: "", phone: "", village: "", status: "", priority: "" };
    loadNeedsHistory();
}
async function generateRangeReport() {
    const reportFrom = document.getElementById("reportFrom").value;
    const reportTo = document.getElementById("reportTo").value;

    if (!reportFrom || !reportTo) return alert("اختر تاريخ البداية والنهاية");
    if (reportFrom > reportTo) return alert("يجب أن يكون تاريخ البداية قبل أو يساوي تاريخ النهاية");

    try {
        const startDate = `${reportFrom}T00:00:00.000Z`;
        const endDateObj = new Date(reportTo);
        endDateObj.setDate(endDateObj.getDate() + 1);
        const endDateExclusive = `${endDateObj.toISOString().split("T")[0]}T00:00:00.000Z`;

        const { data, error } = await supabaseClient
            .from("orders")
            .select("*")
            .gte("created_at", startDate)
            .lt("created_at", endDateExclusive);
        if (error) throw error;

        const reportData = {};
        const allItems = new Set();

        data.forEach((order) => {
            const village = order.village || "غير محدد";
            if (!reportData[village]) reportData[village] = {};

            (order.items || []).forEach((item) => {
                allItems.add(item.name);
                reportData[village][item.name] = (reportData[village][item.name] || 0) + item.qty;
            });
        });

        const sortedItems = Array.from(allItems).sort((a, b) => a.localeCompare(b, "ar"));
        if (sortedItems.length === 0) {
            document.getElementById("reportContainer").innerHTML = renderEmptyState("لا توجد بيانات طلبات ضمن هذه الفترة");
            return;
        }

        const itemTotals = Object.fromEntries(sortedItems.map((item) => [item, 0]));

        let rowsHtml = "";
        Object.keys(reportData).sort((a, b) => a.localeCompare(b, "ar")).forEach((village) => {
            rowsHtml += `<tr><td>${escapeHtml(village)}</td>`;
            sortedItems.forEach((itemName) => {
                const qty = reportData[village][itemName] || 0;
                itemTotals[itemName] += qty;
                rowsHtml += `<td style="text-align:center;">${qty}</td>`;
            });
            rowsHtml += `</tr>`;
        });

        rowsHtml += `<tr style="background:#f4f8fe; font-weight:800;"><td>المجموع</td>`;
        sortedItems.forEach((itemName) => {
            rowsHtml += `<td style="text-align:center;">${itemTotals[itemName] || 0}</td>`;
        });
        rowsHtml += `</tr>`;

        const rangeLabel = reportFrom === reportTo
            ? `تقرير يوم ${new Date(reportFrom).toLocaleDateString("ar-EG")}`
            : `تقرير من ${new Date(reportFrom).toLocaleDateString("ar-EG")} إلى ${new Date(reportTo).toLocaleDateString("ar-EG")}`;

        document.getElementById("reportContainer").innerHTML = `
            <div class="card">
                <h4>${rangeLabel}</h4>
                <div class="report-table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th style="text-align:right;">القرية</th>
                                ${sortedItems.map((itemName) => `<th style="text-align:center;">${escapeHtml(itemName)}</th>`).join("")}
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </div>`;
    } catch (err) {
        console.error("Error generating report:", err);
        document.getElementById("reportContainer").innerHTML = `<div class="card" style="background:#fff1f1">فشل إنشاء التقرير</div>`;
    }
}

function setTodayDateFilters() {
    const today = getLocalDateString();
    document.getElementById("dateFrom").value = today;
    document.getElementById("dateTo").value = today;
    currentFilters = { name: "", village: "", status: "", saved: "", dateFrom: today, dateTo: today };
    loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.registered, currentFilters.dateFrom, currentFilters.dateTo);
}

async function initialize() {
    await loadVillages();
    fillVillageInputs();

    const today = getLocalDateString();
    document.getElementById("reportFrom").value = today;
    document.getElementById("reportTo").value = today;
    document.getElementById("needPriority").value = "normal";
    document.getElementById("needItem").addEventListener("change", updateNeedItemPreview);

    await loadItems();
    renderOrder();
    renderNeedItems();
    setActiveTabState("inventory");
    setTodayDateFilters();
    await loadNeedsHistory();
}

initialize();
