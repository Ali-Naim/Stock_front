const SUPABASE_URL = "https://hrejmgfrcyiflhreokkl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyZWptZ2ZyY3lpZmxocmVva2tsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NDIyNDIsImV4cCI6MjA5MDAxODI0Mn0.RaIQfRKufKOfDcZxKmnjaKiZpOjIC6cZhVC1qJuSyr0";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const VILLAGES = [
    "البساتين",
    "البنية",
    "رمحالا - قبرشمون",
    "كفرمتى",
    "عبيه",
    "دقون",
    "دفون",
    "بعورته",
    "عين كسور",
];

let inventory = [];
let currentOrder = [];
let currentFilters = { name: "", village: "", status: "", saved: "", dateFrom: "", dateTo: "" };
let editingOrderId = null;
let inlineEditingOrderId = null;

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

function switchTabMobile(tabName) {
    switchTab(tabName);
}

function renderEmptyState(message) {
    return `<div class="card">${message}</div>`;
}

function getVillageOptions(selectedValue = "") {
    return [
        `<option value="">اختر القرية</option>`,
        ...VILLAGES.map((village) => `<option value="${village}" ${village === selectedValue ? "selected" : ""}>${village}</option>`),
    ].join("");
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

async function createItem() {
    const itemName = String(document.getElementById("newItemName").value).trim();
    if (!itemName) return alert("أدخل اسم المنتج");

    try {
        const existingItem = inventory.find((item) => item.name.trim().toLowerCase() === itemName.toLowerCase());
        if (existingItem) {
            document.getElementById("name").value = String(existingItem.id);
            closeItemModal();
            return alert("هذا المنتج موجود بالفعل وتم اختياره من القائمة");
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
        const nameSelect = document.getElementById("name");
        const orderSelect = document.getElementById("orderItem");

        list.innerHTML = "";
        nameSelect.innerHTML = `<option value="">اختر المنتج</option>`;
        orderSelect.innerHTML = `<option value="">اختر المنتج</option>`;

        if (inventory.length === 0) {
            list.innerHTML = renderEmptyState("لا توجد عناصر في المخزون");
            nameSelect.innerHTML = `<option value="">لا يوجد</option>`;
            orderSelect.innerHTML = `<option value="">لا يوجد</option>`;
            return;
        }

        inventory.forEach((item) => {
            list.innerHTML += `
                <div class="card item">
                    <div class="item-meta">
                        <strong>${item.name}</strong>
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

            nameSelect.innerHTML += `<option value="${item.id}">${item.name}</option>`;
            orderSelect.innerHTML += `<option value="${item.id}">${item.name} (متوفر: ${item.quantity})</option>`;
        });
    } catch (err) {
        console.error("Error loading inventory:", err);
        document.getElementById("inventoryList").innerHTML = `<div class="card" style="background:#fff1f1">فشل تحميل المخزون. تحقق من الاتصال والإعدادات.</div>`;
    }
}

async function adjustInventoryQty(itemId, delta) {
    try {
        const item = inventory.find((entry) => String(entry.id) === String(itemId));
        if (!item) return alert("المنتج غير موجود");

        const newQuantity = item.quantity + delta;
        if (newQuantity < 0) return alert("لا يمكن تقليل الكمية أقل من صفر");

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
        if (!item) return alert("المنتج غير موجود");

        const newQuantity = item.quantity + qtyToAdd;
        const { error } = await supabaseClient.from("inventory").update({ quantity: newQuantity }).eq("id", itemId);
        if (error) throw error;

        document.getElementById("name").value = "";
        document.getElementById("qty").value = "";
        await loadItems();
    } catch (err) {
        console.error("Error adding item:", err);
        alert("فشل تحديث المخزون. تحقق من الإعدادات.");
    }
}

async function deleteItem(id) {
    try {
        const { error } = await supabaseClient.from("inventory").delete().eq("id", id);
        if (error) throw error;
        await loadItems();
    } catch (err) {
        console.error("Error deleting item:", err);
        alert("فشل حذف العنصر.");
    }
}

function addToOrder() {
    const orderName = String(document.getElementById("orderName").value).trim();
    const village = document.getElementById("orderVillage").value;
    const itemId = document.getElementById("orderItem").value;
    const qty = Number(document.getElementById("orderQty").value);

    if (!orderName) return alert("أدخل اسم الطلب أو العميل");
    if (!village) return alert("اختر القرية");
    if (!itemId) return alert("اختر عنصرًا من القائمة");
    if (!qty || qty <= 0) return alert("أدخل كمية صالحة أكبر من صفر");

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
                    <span>${item.name}</span>
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
    if (currentOrder.length === 0) return alert("لا يوجد عناصر في الطلب");

    try {
        const orderName = String(document.getElementById("orderName").value).trim();
        const village = document.getElementById("orderVillage").value;
        if (!orderName) return alert("أدخل اسم الطلب أو العميل قبل تأكيد الطلب");
        if (!village) return alert("اختر القرية قبل تأكيد الطلب");

        const orderRecord = {
            order_name: orderName,
            village,
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

        alert(editingOrderId ? "تم تحديث الطلب بنجاح" : "تم تنفيذ الطلب وحفظه في السجل");
        cancelEdit();
        await loadItems();
        await loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.dateFrom, currentFilters.dateTo);
    } catch (err) {
        console.error("Error submitting order:", err);
        alert(err.message || "فشل تنفيذ الطلب. حاول لاحقًا.");
    }
}

async function setOrderStatus(orderId, status) {
    try {
        const { error } = await supabaseClient.from("orders").update({ status }).eq("id", orderId);
        if (error) throw error;
        await loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.dateFrom, currentFilters.dateTo);
    } catch (err) {
        console.error("Error updating order status:", err);
        alert("فشل تحديث حالة الطلب.");
    }
}

async function setOrderSaved(orderId, isSaved) {
    try {
        const { error } = await supabaseClient.from("orders").update({ is_saved: isSaved }).eq("id", orderId);
        if (error) throw error;
        await loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.dateFrom, currentFilters.dateTo);
    } catch (err) {
        console.error("Error updating saved flag:", err);
        alert("فشل تحديث حالة الحفظ.");
    }
}

function cancelEdit() {
    editingOrderId = null;
    currentOrder = [];
    document.getElementById("orderName").value = "";
    document.getElementById("orderVillage").value = "";
    document.getElementById("orderQty").value = "";
    renderOrder();
    document.querySelector("#orders .button-group .done").textContent = "✅ تأكيد الطلب";
    document.getElementById("cancelEditBtn").style.display = "none";
}

function startInlineEdit(orderId) {
    inlineEditingOrderId = orderId;
    loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.dateFrom, currentFilters.dateTo);
}

function cancelInlineEdit() {
    inlineEditingOrderId = null;
    loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.dateFrom, currentFilters.dateTo);
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
        await loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.dateFrom, currentFilters.dateTo);
    } catch (err) {
        console.error("Error saving inline edit:", err);
        alert(err.message || "فشل حفظ التعديلات");
    }
}

async function deleteOrder(orderId) {
    if (!confirm("هل تريد حذف هذا الطلب؟ سيتم إرجاع الكمية إلى المخزون.")) return;

    try {
        const { data: order, error: fetchErr } = await supabaseClient.from("orders").select("*").eq("id", orderId).single();
        if (fetchErr) throw fetchErr;

        await restoreInventoryForItems(order.items || []);

        const { error: deleteErr } = await supabaseClient.from("orders").delete().eq("id", orderId);
        if (deleteErr) throw deleteErr;

        if (editingOrderId === orderId) {
            cancelEdit();
        }
        if (inlineEditingOrderId === orderId) {
            inlineEditingOrderId = null;
        }

        await loadItems();
        await loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.dateFrom, currentFilters.dateTo);
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
                        ${inv.name} (متوفر: ${inv.quantity})
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

async function loadOrderHistory(nameFilter = "", villageFilter = "", statusFilter = "", savedFilter = "", dateFrom = "", dateTo = "") {
    try {
        let query = supabaseClient.from("orders").select("*").order("created_at", { ascending: false });

        if (nameFilter.trim()) query = query.ilike("order_name", `%${nameFilter.trim()}%`);
        if (villageFilter) query = query.eq("village", villageFilter);
        if (statusFilter) query = query.eq("status", statusFilter);
        if (savedFilter === "saved") query = query.eq("is_saved", true);
        if (savedFilter === "unsaved") query = query.eq("is_saved", false);
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

            const itemsHtml = isInlineEditing
                ? `
                    <input type="text" id="edit-order-name-${order.id}" value="${orderDisplayName}" placeholder="اسم الطلب">
                    <select id="edit-order-village-${order.id}" class="inline-village-select">${getVillageOptions(order.village || "")}</select>
                    <div id="inline-items-${order.id}" class="order-items">
                        ${(order.items || []).map((item, index) => buildInlineItemRow(order.id, index, item.id, item.qty)).join("")}
                    </div>
                    <button class="done" onclick="addInlineItem(${order.id})">+ إضافة عنصر</button>`
                : `
                    <div class="order-items">
                        ${(order.items || []).map((item) => `<div class="order-line">• ${item.name} - ${item.qty}</div>`).join("") || "لا توجد عناصر"}
                    </div>`;

            const actionsHtml = isInlineEditing
                ? `
                    <div class="inline-actions">
                        <button class="add" onclick="saveInlineEdit(${order.id})">حفظ سريع</button>
                        <button class="delete" onclick="cancelInlineEdit()">إلغاء</button>
                    </div>`
                : `
                    <div class="order-quick-actions">
                        <button class="done" onclick="startInlineEdit(${order.id})">تعديل</button>
                        <button class="delete" onclick="deleteOrder(${order.id})">حذف الطلب</button>
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
                            <strong>${orderDisplayName}</strong>
                            <small>${order.village ? `القرية: ${order.village} - ` : ""}${formatDate(order.created_at)}</small>
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
    const dateFrom = document.getElementById("dateFrom").value;
    const dateTo = document.getElementById("dateTo").value;

    currentFilters = { name: nameFilter, village: villageFilter, status: statusFilter, saved: savedFilter, dateFrom, dateTo };
    loadOrderHistory(nameFilter, villageFilter, statusFilter, savedFilter, dateFrom, dateTo);
}

function clearFilters() {
    document.getElementById("nameFilter").value = "";
    document.getElementById("villageFilter").value = "";
    document.getElementById("statusFilter").value = "";
    document.getElementById("savedFilter").value = "";
    document.getElementById("dateFrom").value = "";
    document.getElementById("dateTo").value = "";
    currentFilters = { name: "", village: "", status: "", saved: "", dateFrom: "", dateTo: "" };
    loadOrderHistory();
}

async function generateDailyReport() {
    const reportDate = document.getElementById("reportDate").value;
    if (!reportDate) return alert("اختر تاريخ التقرير");

    try {
        const startDate = `${reportDate}T00:00:00.000Z`;
        const endDate = `${reportDate}T23:59:59.999Z`;

        const { data, error } = await supabaseClient.from("orders").select("*").gte("created_at", startDate).lte("created_at", endDate);
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

        const sortedItems = Array.from(allItems).sort();
        const itemTotals = Object.fromEntries(sortedItems.map((item) => [item, 0]));

        let rowsHtml = "";
        Object.keys(reportData).sort().forEach((village) => {
            rowsHtml += `<tr><td>${village}</td>`;
            sortedItems.forEach((itemName) => {
                const qty = reportData[village][itemName] || 0;
                itemTotals[itemName] += qty;
                rowsHtml += `<td style="text-align:center;">${qty}</td>`;
            });
            rowsHtml += `</tr>`;
        });

        rowsHtml += `<tr style="background:#f4f8fe; font-weight:800;"><td>مجموع الكل</td>`;
        sortedItems.forEach((itemName) => {
            rowsHtml += `<td style="text-align:center;">${itemTotals[itemName] || 0}</td>`;
        });
        rowsHtml += `</tr>`;

        document.getElementById("reportContainer").innerHTML = `
            <div class="card">
                <h4>تقرير يوم ${new Date(reportDate).toLocaleDateString("ar-EG")}</h4>
                <div class="report-table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th style="text-align:right;">القرية</th>
                                ${sortedItems.map((itemName) => `<th style="text-align:center;">${itemName}</th>`).join("")}
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
    loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.dateFrom, currentFilters.dateTo);
}

async function initialize() {
    document.getElementById("orderVillage").innerHTML = getVillageOptions();

    const villageFilter = document.getElementById("villageFilter");
    villageFilter.innerHTML = `<option value="">جميع القرى</option>${VILLAGES.map((village) => `<option value="${village}">${village}</option>`).join("")}`;

    const today = getLocalDateString();
    document.getElementById("reportDate").value = today;
    await loadItems();
    renderOrder();
    setActiveTabState("inventory");
    setTodayDateFilters();
}

initialize();
