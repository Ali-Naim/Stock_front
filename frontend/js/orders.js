function filterOrderFamilies() {
    const villageId = document.getElementById("orderVillageUI")?.value || "";
    const query = (document.getElementById("orderFamilySearch")?.value || "").trim().toLowerCase();
    const dropdown = document.getElementById("orderFamilyDropdown");
    if (!dropdown) return;

    if (!query) {
        dropdown.classList.add("hidden");
        dropdown.innerHTML = "";
        return;
    }

    const filtered = (families || [])
        .filter((f) => {
            if (villageId && String(f.village_id ?? f.villageId ?? "") !== villageId) return false;
            return getFamilyDisplayName(f).toLowerCase().includes(query);
        })
        .slice(0, 12);

    if (!filtered.length) {
        dropdown.innerHTML = `<div class="family-picker-empty">لا توجد نتائج</div>`;
        dropdown.classList.remove("hidden");
        return;
    }

    dropdown.innerHTML = filtered
        .map((f) => {
            const name = getFamilyDisplayName(f);
            const village = f.village_name ?? f.villageName ?? getVillageNameById(f.village_id ?? f.villageId ?? "");
            const phone = f.phone_number ?? f.phoneNumber ?? "";
            const meta = [village, phone].filter(Boolean).join(" · ");
            return `<div class="family-picker-option" onmousedown="selectOrderFamily(${f.id})">
                <strong>${escapeHtml(name)}</strong>
                ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
            </div>`;
        })
        .join("");
    dropdown.classList.remove("hidden");
}

function selectOrderFamily(familyId) {
    const family = (families || []).find((f) => Number(f.id) === Number(familyId));
    if (!family) return;
    selectedOrderFamily = family;

    const name = getFamilyDisplayName(family);
    const villageName = family.village_name ?? family.villageName ?? getVillageNameById(family.village_id ?? family.villageId ?? "");
    const phone = family.phone_number ?? family.phoneNumber ?? "";
    const people = family.people_count ?? family.peopleCount ?? "";

    document.getElementById("orderName").value = name;
    document.getElementById("orderPhone").value = phone;
    document.getElementById("orderVillage").value = villageName;

    const metaParts = [villageName, phone, people ? `${people} أفراد` : ""].filter(Boolean);
    document.getElementById("orderSelectedFamilyName").textContent = name;
    document.getElementById("orderSelectedFamilyMeta").textContent = metaParts.join(" · ");
    document.getElementById("orderSelectedFamilyCard")?.classList.remove("hidden");

    document.getElementById("orderFamilySearch").value = "";
    const dropdown = document.getElementById("orderFamilyDropdown");
    if (dropdown) { dropdown.classList.add("hidden"); dropdown.innerHTML = ""; }
}

function clearSelectedOrderFamily() {
    selectedOrderFamily = null;
    document.getElementById("orderName").value = "";
    document.getElementById("orderPhone").value = "";
    document.getElementById("orderVillage").value = "";
    document.getElementById("orderSelectedFamilyCard")?.classList.add("hidden");
    const search = document.getElementById("orderFamilySearch");
    if (search) { search.value = ""; setTimeout(() => search.focus(), 0); }
}

function hideOrderFamilyDropdown() {
    setTimeout(() => {
        document.getElementById("orderFamilyDropdown")?.classList.add("hidden");
    }, 150);
}

function addToOrder() {
    const orderName = String(document.getElementById("orderName").value).trim();
    const village = document.getElementById("orderVillage").value;
    const itemId = document.getElementById("orderItem").value;
    const qty = Number(document.getElementById("orderQty").value);

    if (!orderName) return alert("اختر عائلة أولاً");
    if (!village) return alert("اختر عائلة أولاً");
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

    list.innerHTML = currentOrder.map((item, index) => `
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
            </div>`).join("");
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
        await api.updateInventoryItem(item.id, { quantity: restoredQty });

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
        await api.updateInventoryItem(item.id, { quantity: newQty });

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
        if (!orderName) return alert("اختر عائلة أولاً");
        if (!village) return alert("اختر عائلة أولاً");

        const orderRecord = {
            order_name: orderName,
            phone_number: phoneNumber || null,
            village,
            is_registered: isRegistered,
            family_id: selectedOrderFamily ? Number(selectedOrderFamily.id) : null,
            source_need_id: pendingOrderSourceNeedId || null,
            items: currentOrder.map((item) => ({ id: item.id, name: item.name, qty: item.qty })),
            is_saved: editingOrderId ? undefined : false,
            status: editingOrderId ? undefined : "pending",
        };

        if (editingOrderId) {
            const oldOrder = await api.getOrderById(editingOrderId);

            await restoreInventoryForItems(oldOrder.items || []);
            await loadItems();
            await applyInventoryForItems(orderRecord.items);

            await api.updateOrder(editingOrderId, orderRecord);
        } else {
            await applyInventoryForItems(orderRecord.items);
            await api.createOrder(orderRecord);
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
    const order = currentOrdersData.find(o => String(o.id) === String(orderId));
    if (!order) return;
    const prev = order.status;
    order.status = status;
    replaceOrderCard(orderId);
    try {
        await api.updateOrder(orderId, { status });

        if (status === "done" && order.family_id) {
            try {
                await api.createFamilyDistribution(order.family_id, {
                    type: "local",
                    items: (order.items || []).map((item) => ({ item_id: item.id, quantity: item.qty })),
                    distributed_at: new Date().toISOString(),
                });
                if (typeof familyDistributionsCache !== "undefined") {
                    familyDistributionsCache[String(order.family_id)] = null;
                }
                if (typeof familyStatsCache !== "undefined") {
                    familyStatsCache[String(order.family_id)] = null;
                }
            } catch (distErr) {
                console.error("Failed to auto-create distribution:", distErr);
            }
        }
    } catch (err) {
        console.error("Error updating order status:", err);
        order.status = prev;
        replaceOrderCard(orderId);
        alert("فشل تحديث حالة الطلب");
    }
}

async function setOrderSaved(orderId, isSaved) {
    const order = currentOrdersData.find(o => String(o.id) === String(orderId));
    if (!order) return;
    const prev = order.is_saved;
    order.is_saved = isSaved;
    replaceOrderCard(orderId);
    try {
        await api.updateOrder(orderId, { is_saved: isSaved });
    } catch (err) {
        console.error("Error updating saved flag:", err);
        order.is_saved = prev;
        replaceOrderCard(orderId);
        alert("فشل تحديث حالة الحفظ");
    }
}

async function setOrderDateToToday(orderId) {
    const order = currentOrdersData.find(o => String(o.id) === String(orderId));
    if (!order) return;
    const today = new Date().toISOString();
    const prev = order.created_at;
    order.created_at = today;
    replaceOrderCard(orderId);
    try {
        await api.updateOrder(orderId, { created_at: today });
    } catch (err) {
        console.error("Error updating order date:", err);
        order.created_at = prev;
        replaceOrderCard(orderId);
        alert("فشل تحديث تاريخ الطلب");
    }
}

function cancelEdit() {
    editingOrderId = null;
    pendingOrderSourceNeedId = null;
    selectedOrderFamily = null;
    currentOrder = [];
    document.getElementById("orderName").value = "";
    document.getElementById("orderPhone").value = "";
    document.getElementById("orderVillage").value = "";
    document.getElementById("orderRegistered").value = "true";
    document.getElementById("orderQty").value = "";
    document.getElementById("orderFamilySearch").value = "";
    document.getElementById("orderVillageUI").value = "";
    document.getElementById("orderFamilyDropdown")?.classList.add("hidden");
    document.getElementById("orderSelectedFamilyCard")?.classList.add("hidden");
    updateOrderSourceBadge();
    renderOrder();
    document.querySelector("#orders .button-group .done").textContent = "تأكيد الطلب";
    document.getElementById("cancelEditBtn").style.display = "none";
}

function startInlineEdit(orderId) {
    const prev = inlineEditingOrderId;
    inlineEditingOrderId = orderId;
    if (prev != null && prev !== orderId) replaceOrderCard(prev);
    replaceOrderCard(orderId);
}

function cancelInlineEdit() {
    const orderId = inlineEditingOrderId;
    inlineEditingOrderId = null;
    if (orderId != null) replaceOrderCard(orderId);
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
        const originalOrder = await api.getOrderById(orderId);

        await restoreInventoryForItems(originalOrder.items || []);
        await loadItems();
        await applyInventoryForItems(updatedItems);

        await api.updateOrder(orderId, { order_name: newName, village: newVillage, items: updatedItems });

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

    const idx = currentOrdersData.findIndex(o => String(o.id) === String(orderId));
    const order = currentOrdersData[idx];
    const card = document.querySelector(`[data-order-id="${orderId}"]`);

    // Optimistic removal
    if (idx !== -1) currentOrdersData.splice(idx, 1);
    if (card) card.remove();
    if (editingOrderId === orderId) cancelEdit();
    if (inlineEditingOrderId === orderId) inlineEditingOrderId = null;

    try {
        await restoreInventoryForItems(order?.items || []);
        await api.deleteOrder(orderId);
        await loadItems();
    } catch (err) {
        console.error("Error deleting order:", err);
        // Rollback
        if (idx !== -1 && order) {
            currentOrdersData.splice(idx, 0, order);
            const container = document.getElementById("orderHistory");
            const ref = container.children[idx] || null;
            container.insertAdjacentHTML(ref ? "beforebegin" : "beforeend",
                buildOrderCardHtml(order));
        }
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
function buildOrderCardHtml(order) {
    const isInlineEditing = inlineEditingOrderId === order.id;
    const done = order.status === "done";
    const saved = Boolean(order.is_saved);
    const orderDisplayName = order.order_name || `الطلب #${order.id || ""}`;
    const sourceNeedBadge = order.source_need_id ? `<span class="order-origin-chip">من الاحتياجات</span>` : "";
    const refreshDateButton = order.source_need_id
        ? `<button class="add" onclick="setOrderDateToToday(${order.id})">تاريخ اليوم</button>`
        : "";

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
                ${refreshDateButton}
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

    const creatorName = order.created_by?.name || order.created_by?.username || null;
    return `
        <div class="order-history-item ${done ? "done" : "pending"} ${saved ? "saved" : ""}" data-order-id="${order.id}">
            <div class="order-header">
                <div class="order-title-wrap">
                    <strong>${escapeHtml(orderDisplayName)} ${sourceNeedBadge}</strong>
                    <small>${order.phone_number ? `الهاتف: ${escapeHtml(order.phone_number)} - ` : ""}${order.village ? `القرية: ${escapeHtml(order.village)} - ` : ""}${formatDate(order.created_at)}</small>
                    <small>${order.is_registered ? "العميل مسجل سابقًا" : "العميل غير مسجل سابقًا"}</small>
                    ${creatorName ? `<span class="order-creator-chip">👤 ${escapeHtml(creatorName)}</span>` : ""}
                </div>
                <div class="order-actions">
                    ${actionsHtml}
                </div>
            </div>
            ${itemsHtml}
            <div class="status-label"><small>الحالة: ${done ? "مكتمل" : "قيد التنفيذ"}${saved ? " - محفوظ" : " - غير محفوظ"}</small></div>
        </div>`;
}

function replaceOrderCard(orderId) {
    const card = document.querySelector(`[data-order-id="${orderId}"]`);
    const order = currentOrdersData.find(o => String(o.id) === String(orderId));
    if (!card || !order) return;
    card.insertAdjacentHTML("afterend", buildOrderCardHtml(order));
    card.remove();
}

async function loadOrderHistory(nameFilter = "", villageFilter = "", statusFilter = "", savedFilter = "", registeredFilter = "", dateFrom = "", dateTo = "") {
    try {
        const result = await api.getOrders({
            name: nameFilter.trim() || undefined,
            village: villageFilter || undefined,
            status: statusFilter || undefined,
            saved: savedFilter === "saved" ? "true" : savedFilter === "unsaved" ? "false" : undefined,
            registered: registeredFilter === "registered" ? "true" : registeredFilter === "not_registered" ? "false" : undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            page: ordersPage,
        });

        const history = result.data || [];
        ordersTotalCount = result.total ?? 0;
        currentOrdersData = history;

        updateOrderCountLabel();

        const container = document.getElementById("orderHistory");
        if (history.length === 0) {
            container.innerHTML = renderEmptyState("لا توجد سجلات طلبات بعد");
            renderOrderPagination();
            return;
        }
        container.innerHTML = history.map(buildOrderCardHtml).join("");
        renderOrderPagination();
    } catch (err) {
        console.error("Error loading order history:", err);
        document.getElementById("orderHistory").innerHTML = `<div class="card" style="background:#fff1f1">فشل تحميل سجل الطلبات</div>`;
    }
}

function updateOrderCountLabel() {
    const label = document.getElementById("orderCountLabel");
    if (!label) return;
    if (ordersTotalCount === 0) {
        label.textContent = "لا توجد طلبات";
        return;
    }
    const from = (ordersPage - 1) * ORDER_PAGE_SIZE + 1;
    const to = Math.min(ordersPage * ORDER_PAGE_SIZE, ordersTotalCount);
    label.textContent = `${from}–${to} من أصل ${ordersTotalCount} طلب`;
}

function renderOrderPagination() {
    const container = document.getElementById("orderPagination");
    if (!container) return;
    const totalPages = Math.ceil(ordersTotalCount / ORDER_PAGE_SIZE);
    if (totalPages <= 1) {
        container.innerHTML = "";
        return;
    }
    container.innerHTML = `
        <div class="pagination">
            <button class="pagination-btn" onclick="goToOrdersPage(${ordersPage - 1})" ${ordersPage <= 1 ? "disabled" : ""}>→</button>
            <span class="pagination-info">صفحة ${ordersPage} من ${totalPages}</span>
            <button class="pagination-btn" onclick="goToOrdersPage(${ordersPage + 1})" ${ordersPage >= totalPages ? "disabled" : ""}>←</button>
        </div>
    `;
}

function goToOrdersPage(page) {
    const totalPages = Math.ceil(ordersTotalCount / ORDER_PAGE_SIZE);
    if (page < 1 || page > totalPages) return;
    ordersPage = page;
    loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.registered, currentFilters.dateFrom, currentFilters.dateTo);
}

window.goToOrdersPage = goToOrdersPage;
window.filterOrderFamilies = filterOrderFamilies;
window.selectOrderFamily = selectOrderFamily;
window.clearSelectedOrderFamily = clearSelectedOrderFamily;
window.hideOrderFamilyDropdown = hideOrderFamilyDropdown;

function applyFilters() {
    const nameFilter = document.getElementById("nameFilter").value;
    const villageFilter = document.getElementById("villageFilter").value;
    const statusFilter = document.getElementById("statusFilter").value;
    const savedFilter = document.getElementById("savedFilter").value;
    const registeredFilter = document.getElementById("registeredFilter").value;
    const dateFrom = document.getElementById("dateFrom").value;
    const dateTo = document.getElementById("dateTo").value;

    ordersPage = 1;
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
    ordersPage = 1;
    currentFilters = { name: "", village: "", status: "", saved: "", registered: "", dateFrom: "", dateTo: "" };
    loadOrderHistory();
}

// Debounce text-input searches so we don't fire an API call on every keystroke
window.applyFilters = debounce(applyFilters, 350);
