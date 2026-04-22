function filterNeedFamilies() {
    const villageId = document.getElementById("needVillage")?.value || "";
    const query = (document.getElementById("needFamilySearch")?.value || "").trim().toLowerCase();
    const dropdown = document.getElementById("needFamilyDropdown");
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
            return `<div class="family-picker-option" onmousedown="selectNeedFamily(${f.id})">
                <strong>${escapeHtml(name)}</strong>
                ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
            </div>`;
        })
        .join("");
    dropdown.classList.remove("hidden");
}

function selectNeedFamily(familyId) {
    const family = (families || []).find((f) => Number(f.id) === Number(familyId));
    if (!family) return;
    selectedNeedFamily = family;

    const name = getFamilyDisplayName(family);
    const village = family.village_name ?? family.villageName ?? getVillageNameById(family.village_id ?? family.villageId ?? "");
    const phone = family.phone_number ?? family.phoneNumber ?? "";
    const people = family.people_count ?? family.peopleCount ?? 1;

    document.getElementById("needFamilyName").value = name;
    document.getElementById("needPhone").value = phone;
    document.getElementById("needPeopleCount").value = people;
    if (family.village_id) document.getElementById("needVillage").value = String(family.village_id);

    const metaParts = [village, phone, `${people} أفراد`].filter(Boolean);
    const nameEl = document.getElementById("needSelectedFamilyName");
    const metaEl = document.getElementById("needSelectedFamilyMeta");
    const card = document.getElementById("needSelectedFamilyCard");
    if (nameEl) nameEl.textContent = name;
    if (metaEl) metaEl.textContent = metaParts.join(" · ");
    if (card) card.classList.remove("hidden");

    const search = document.getElementById("needFamilySearch");
    if (search) search.value = "";
    const dropdown = document.getElementById("needFamilyDropdown");
    if (dropdown) { dropdown.classList.add("hidden"); dropdown.innerHTML = ""; }
}

function clearSelectedNeedFamily() {
    selectedNeedFamily = null;
    document.getElementById("needFamilyName").value = "";
    document.getElementById("needPhone").value = "";
    document.getElementById("needPeopleCount").value = "1";
    document.getElementById("needVillage").value = "";
    document.getElementById("needSelectedFamilyCard")?.classList.add("hidden");
    const search = document.getElementById("needFamilySearch");
    if (search) { search.value = ""; setTimeout(() => search.focus(), 0); }
}

function hideNeedFamilyDropdown() {
    setTimeout(() => {
        document.getElementById("needFamilyDropdown")?.classList.add("hidden");
    }, 150);
}

function addNeedItem() {
    const familyName = String(document.getElementById("needFamilyName").value).trim();
    const village = document.getElementById("needVillage").value;
    const priority = document.getElementById("needPriority").value;
    const itemId = document.getElementById("needItem").value;
    const qty = Number(document.getElementById("needQty").value);

    if (!familyName) return alert("اختر عائلة أولاً");
    if (!village) return alert("اختر القرية");
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

    container.innerHTML = currentNeedItems.map((item, index) => `
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
            </div>`).join("");
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
    const peopleCount = Number(document.getElementById("needPeopleCount").value) || 1;
    const priority = document.getElementById("needPriority").value;
    const notes = String(document.getElementById("needNotes").value ?? "").trim();

    if (!familyName) return alert("اختر عائلة أولاً");
    if (!villageId) return alert("اختر القرية");
    if (!priority) return alert("اختر الأولوية");

    const payload = {
        family_name: familyName,
        phone_number: phoneNumber,
        village_id: Number(villageId),
        people_count: peopleCount,
        priority,
        notes,
        items: currentNeedItems.map((item) => ({ id: item.id, name: item.name, qty: item.qty })),
        status: editingNeedId ? undefined : "pending",
        updated_at: new Date().toISOString(),
    };

    try {
        if (editingNeedId) {
            await api.updateNeed(editingNeedId, payload);
        } else {
            await api.createNeeds(payload);
        }

        alert(editingNeedId ? "تم تحديث الاحتياج بنجاح" : "تم حفظ الاحتياج بنجاح");
        cancelNeedEdit();
        await refreshNeedsHistoryViews();
    } catch (err) {
        console.error("Error saving need:", err);
        alert(err.message || "فشل حفظ احتياج العائلة");
    }
}

function cancelNeedEdit() {
    editingNeedId = null;
    selectedNeedFamily = null;
    currentNeedItems = [];
    document.getElementById("needFamilyName").value = "";
    document.getElementById("needPhone").value = "";
    document.getElementById("needVillage").value = "";
    document.getElementById("needPeopleCount").value = "1";
    document.getElementById("needPriority").value = "normal";
    document.getElementById("needNotes").value = "";
    document.getElementById("needItem").value = "";
    document.getElementById("needQty").value = "";
    document.getElementById("needFamilySearch").value = "";
    document.getElementById("needFamilyDropdown")?.classList.add("hidden");
    document.getElementById("needSelectedFamilyCard")?.classList.add("hidden");
    document.getElementById("submitNeedBtn").textContent = "حفظ الاحتياج";
    document.getElementById("cancelNeedEditBtn").style.display = "none";
    updateNeedItemPreview();
    renderNeedItems();
}

async function editNeed(needId) {
    try {
        const data = await api.getNeedById(needId);

        editingNeedId = needId;
        document.getElementById("needFamilyName").value = data.family_name || "";
        document.getElementById("needPhone").value = data.phone_number || "";
        document.getElementById("needVillage").value = data.village_id || "";
        document.getElementById("needPeopleCount").value = data.people_count || "1";
        document.getElementById("needPriority").value = data.priority || "normal";
        document.getElementById("needNotes").value = data.notes || "";
        currentNeedItems = (data.items || []).map((item) => ({ id: item.id, name: item.name, qty: item.qty }));

        // Try to find and select the matching family from the registry
        const matchedFamily = (families || []).find(
            (f) =>
                String(f.village_id ?? f.villageId ?? "") === String(data.village_id ?? "") &&
                getFamilyDisplayName(f).trim().toLowerCase() === String(data.family_name ?? "").trim().toLowerCase(),
        );
        if (matchedFamily) {
            selectNeedFamily(matchedFamily.id);
        } else {
            // Show the stored data in the card even if no registry match
            selectedNeedFamily = null;
            const nameEl = document.getElementById("needSelectedFamilyName");
            const metaEl = document.getElementById("needSelectedFamilyMeta");
            const card = document.getElementById("needSelectedFamilyCard");
            if (nameEl) nameEl.textContent = data.family_name || "";
            const village = getVillageNameById(data.village_id ?? "");
            if (metaEl) metaEl.textContent = [village, data.phone_number].filter(Boolean).join(" · ");
            if (card) card.classList.remove("hidden");
        }

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
        await api.deleteNeed(needId);

        if (editingNeedId === needId) {
            cancelNeedEdit();
        }

        await refreshNeedsHistoryViews();
    } catch (err) {
        console.error("Error deleting need:", err);
        alert("فشل حذف الاحتياج");
    }
}

async function setNeedStatus(needId, status) {
    try {
        await api.updateNeed(needId, { status, updated_at: new Date().toISOString() });

        await refreshNeedsHistoryViews();
    } catch (err) {
        console.error("Error updating need status:", err);
        alert("فشل تحديث حالة الاحتياج");
    }
}

async function setNeedPriority(needId, priority) {
    try {
        await api.updateNeed(needId, { priority, updated_at: new Date().toISOString() });

        await refreshNeedsHistoryViews();
    } catch (err) {
        console.error("Error updating need priority:", err);
        alert("فشل تحديث أولوية الاحتياج");
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

        const requiredHeaders = ["family_name", "phone_number"];
        const missingHeaders = requiredHeaders.filter((header) => !normalizedHeaders.includes(header));
        if (missingHeaders.length) {
            return setNeedsImportResult(`الأعمدة الأساسية مفقودة: ${missingHeaders.join(", ")}`, "error");
        }

        const headerMap = Object.fromEntries(headers.map((header) => [normalizeHeader(header), header]));
        const optionalCoreHeaders = ["village", "people_count", "notes"];
        const itemHeaders = headers.filter((header) => {
            const normalized = normalizeHeader(header);
            return !requiredHeaders.includes(normalized) && !optionalCoreHeaders.includes(normalized);
        });
        const inventoryMap = new Map(inventory.map((item) => [item.name.trim().toLowerCase(), item]));
        const villageMap = new Map(villages.map((village) => [village.name.trim().toLowerCase(), village]));

        const payload = [];
        const errors = [];

        rows.forEach((row, rowIndex) => {
            const familyName = String(row[headerMap.family_name] ?? "").trim();
            const phoneNumber = String(row[headerMap.phone_number] ?? "").trim();
            const villageName = String(row[headerMap.village] ?? "").trim();
            const peopleCountRaw = row[headerMap.people_count];
            const peopleCountParsed = Number(peopleCountRaw);
            const peopleCount = String(peopleCountRaw ?? "").trim() === "" ? 1 : peopleCountParsed;
            const notes = String(row[headerMap.notes] ?? "").trim();

            if (!familyName || !phoneNumber) {
                errors.push(`السطر ${rowIndex + 2}: بيانات أساسية غير مكتملة`);
                return;
            }

            if (!Number.isFinite(peopleCount) || peopleCount <= 0) {
                errors.push(`السطر ${rowIndex + 2}: عدد الأفراد يجب أن يكون رقمًا أكبر من صفر`);
                return;
            }

            let matchedVillage = null;
            if (villageName) {
                matchedVillage = villageMap.get(villageName.toLowerCase());
            }
            if (villageName && !matchedVillage) {
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

            if (!items.length && !notes) {
                errors.push(`السطر ${rowIndex + 2}: لا توجد مواد بكميات أكبر من صفر ولا توجد ملاحظات`);
                return;
            }

            payload.push({
                family_name: familyName,
                phone_number: phoneNumber,
                village_id: matchedVillage?.id ?? null,
                people_count: peopleCount,
                notes,
                priority: "normal",
                status: "pending",
                items,
            });
        });

        if (errors.length) {
            return setNeedsImportResult(errors.slice(0, 8).join(" | "), "error");
        }

        await api.createNeeds(payload);

        input.value = "";
        setNeedsImportResult(`تم استيراد ${payload.length} احتياج بنجاح`, "success");
        await refreshNeedsHistoryViews();
    } catch (err) {
        console.error("Error importing needs Excel:", err);
        setNeedsImportResult(err.message || "فشل استيراد ملف Excel", "error");
    }
}

async function openNeedToOrderModal(needId) {
    try {
        const data = await api.getNeedById(needId);

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
        const need = await api.getNeedById(needToOrderId);

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
        await api.updateNeed(needToOrderId, {
            items: remainingItems,
            status: nextStatus,
            updated_at: new Date().toISOString(),
        });

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
        await refreshNeedsHistoryViews();
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

function getNextNeedPriority(priority) {
    if (priority === "normal") return "medium";
    if (priority === "medium") return "urgent";
    return "normal";
}

function renderNeedsPagination(totalCount, currentPage, pageSize, onClickFnName = "goToNeedsPage") {
    const totalPages = Math.ceil(totalCount / pageSize);
    if (totalPages <= 1) return "";

    const pageStart = (currentPage - 1) * pageSize + 1;
    const pageEnd = Math.min(totalCount, currentPage * pageSize);

    return `
        <div class="needs-pagination">
            <small class="needs-pagination-info">عرض ${pageStart}-${pageEnd} من أصل ${totalCount}</small>
            <div class="needs-pagination-actions">
                <button type="button" class="done" onclick="${onClickFnName}(${currentPage - 1})" ${currentPage <= 1 ? "disabled" : ""}>السابق</button>
                <span class="needs-pagination-page">صفحة ${currentPage} من ${totalPages}</span>
                <button type="button" class="done" onclick="${onClickFnName}(${currentPage + 1})" ${currentPage >= totalPages ? "disabled" : ""}>التالي</button>
            </div>
        </div>`;
}

function compareNeedsByCreatedAtDesc(a, b) {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function renderNeedsHistoryTable(containerId, needs, totalCount, currentPage, pageSize, paginationFnName, emptyZeroMessage = "لا توجد احتياجات محفوظة بعد") {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    if (!needs || needs.length === 0) {
        const emptyMessage = totalCount === 0
            ? emptyZeroMessage
            : "لا توجد نتائج مطابقة في هذه الصفحة";
        container.innerHTML = `${renderEmptyState(emptyMessage)}${renderNeedsPagination(totalCount, currentPage, pageSize, paginationFnName)}`;
        return;
    }

    const rows = needs.map((need) => {
        const villageName = getVillageNameById(need.village_id);
        const itemsText = (need.items || []).map((item) => `${escapeHtml(item.name)} (${item.qty})`).join("، ") || "-";
        const priorityClass = getNeedPriorityClass(need.priority);
        const notesText = String(need.notes || "").trim();

        return `
            <tr class="needs-row needs-row-${priorityClass}">
                <td class="needs-priority-cell">
                    <button
                        type="button"
                        class="priority-dot-button"
                        onclick="setNeedPriority(${need.id}, '${getNextNeedPriority(need.priority)}')"
                        title="الأولوية: ${getNeedPriorityLabel(need.priority)}"
                        aria-label="تغيير الأولوية الحالية: ${getNeedPriorityLabel(need.priority)}">
                        <span class="priority-dot ${priorityClass}"></span>
                    </button>
                </td>
                <td class="needs-date-cell">${formatDate(need.created_at)}</td>
                <td>${escapeHtml(need.family_name)}</td>
                <td>${escapeHtml(need.phone_number || "-")}</td>
                <td>${escapeHtml(villageName)}</td>
                <td>${need.people_count || 0}</td>
                <td class="need-items-cell" title="${itemsText}">${itemsText}</td>
                <td class="need-notes-cell" title="${escapeHtml(notesText || "-")}">${escapeHtml(notesText || "-")}</td>
                <td class="needs-status-cell">
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
                        <th class="needs-priority-cell">الأولوية</th>
                        <th>تاريخ الإنشاء</th>
                        <th>اسم العائلة</th>
                        <th>الهاتف</th>
                        <th>القرية</th>
                        <th>عدد الأفراد</th>
                        <th>المواد المطلوبة</th>
                        <th>ملاحظات</th>
                        <th class="needs-status-cell">الحالة</th>
                        <th>الإجراءات</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        ${renderNeedsPagination(totalCount, currentPage, pageSize, paginationFnName)}`;
}

function goToNeedsPage(page) {
    const totalPages = Math.max(1, Math.ceil(currentNeedsTotalCount / NEEDS_PAGE_SIZE));
    const nextPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
    if (nextPage === currentNeedsPage) return;

    currentNeedsPage = nextPage;
    loadNeedsHistory(
        currentNeedFilters.name,
        currentNeedFilters.phone,
        currentNeedFilters.item,
        currentNeedFilters.village,
        currentNeedFilters.status,
        currentNeedFilters.priority,
        currentNeedFilters.notes,
        currentNeedsPage
    );
}

function goToCompletedNeedsPage(page) {
    const totalPages = Math.max(1, Math.ceil(completedNeedsTotalCount / COMPLETED_NEEDS_PAGE_SIZE));
    const nextPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
    if (nextPage === completedNeedsPage) return;

    completedNeedsPage = nextPage;
    loadCompletedNeedsHistory(
        completedNeedsDialogName,
        currentNeedFilters.phone,
        currentNeedFilters.item,
        currentNeedFilters.village,
        currentNeedFilters.priority,
        currentNeedFilters.notes,
        completedNeedsPage
    );
}

async function loadActiveNeedsHistory(nameFilter = "", phoneFilter = "", itemFilter = "", villageFilter = "", priorityFilter = "", notesFilter = "", page = currentNeedsPage) {
    try {
        currentNeedsPage = Math.max(1, Number(page) || 1);
        const offset = (currentNeedsPage - 1) * NEEDS_PAGE_SIZE;
        const desiredCount = Math.max(NEEDS_PAGE_SIZE, Math.min((currentNeedsPage * NEEDS_PAGE_SIZE), 1000));

        const [pendingResponse, inProgressResponse] = await Promise.all([
            api.getNeeds({
                name: nameFilter.trim() || undefined,
                phone: phoneFilter.trim() || undefined,
                item: itemFilter.trim() || undefined,
                village: villageFilter || undefined,
                status: "pending",
                priority: priorityFilter || undefined,
                notes: notesFilter.trim() || undefined,
                page: 1,
                pageSize: desiredCount,
            }),
            api.getNeeds({
                name: nameFilter.trim() || undefined,
                phone: phoneFilter.trim() || undefined,
                item: itemFilter.trim() || undefined,
                village: villageFilter || undefined,
                status: "in_progress",
                priority: priorityFilter || undefined,
                notes: notesFilter.trim() || undefined,
                page: 1,
                pageSize: desiredCount,
            }),
        ]);

        const pendingData = pendingResponse?.data || [];
        const inProgressData = inProgressResponse?.data || [];
        const pendingTotal = Number(pendingResponse?.total || 0);
        const inProgressTotal = Number(inProgressResponse?.total || 0);
        currentNeedsTotalCount = pendingTotal + inProgressTotal;

        const totalPages = Math.max(1, Math.ceil(currentNeedsTotalCount / NEEDS_PAGE_SIZE));
        if (currentNeedsTotalCount > 0 && currentNeedsPage > totalPages) {
            currentNeedsPage = totalPages;
            return loadActiveNeedsHistory(nameFilter, phoneFilter, itemFilter, villageFilter, priorityFilter, notesFilter, currentNeedsPage);
        }

        const merged = [...pendingData, ...inProgressData].sort(compareNeedsByCreatedAtDesc);
        const pageData = merged.slice(offset, offset + NEEDS_PAGE_SIZE);
        renderNeedsHistoryTable("needsHistoryTable", pageData, currentNeedsTotalCount, currentNeedsPage, NEEDS_PAGE_SIZE, "goToNeedsPage");
    } catch (err) {
        console.error("Error loading active needs history:", err);
        document.getElementById("needsHistoryTable").innerHTML = `<div class="card" style="background:#fff1f1">فشل تحميل الاحتياجات</div>`;
    }
}

async function loadCompletedNeedsHistory(nameFilter = "", phoneFilter = "", itemFilter = "", villageFilter = "", priorityFilter = "", notesFilter = "", page = completedNeedsPage) {
    try {
        completedNeedsPage = Math.max(1, Number(page) || 1);
        const response = await api.getNeeds({
            name: nameFilter.trim() || undefined,
            phone: phoneFilter.trim() || undefined,
            item: itemFilter.trim() || undefined,
            village: villageFilter || undefined,
            status: "done",
            priority: priorityFilter || undefined,
            notes: notesFilter.trim() || undefined,
            page: completedNeedsPage,
            pageSize: COMPLETED_NEEDS_PAGE_SIZE,
        });

        const data = response?.data || [];
        completedNeedsTotalCount = Number(response?.total || 0);

        const totalPages = Math.max(1, Math.ceil(completedNeedsTotalCount / COMPLETED_NEEDS_PAGE_SIZE));
        if (completedNeedsTotalCount > 0 && completedNeedsPage > totalPages) {
            completedNeedsPage = totalPages;
            return loadCompletedNeedsHistory(nameFilter, phoneFilter, itemFilter, villageFilter, priorityFilter, notesFilter, completedNeedsPage);
        }

        renderNeedsHistoryTable(
            "completedNeedsHistoryTable",
            data,
            completedNeedsTotalCount,
            completedNeedsPage,
            COMPLETED_NEEDS_PAGE_SIZE,
            "goToCompletedNeedsPage",
            "لا توجد احتياجات مكتملة بعد"
        );
    } catch (err) {
        console.error("Error loading completed needs history:", err);
        document.getElementById("completedNeedsHistoryTable").innerHTML = `<div class="card" style="background:#fff1f1">فشل تحميل الاحتياجات المكتملة</div>`;
    }
}

async function loadNeedsHistory(nameFilter = "", phoneFilter = "", itemFilter = "", villageFilter = "", statusFilter = "", priorityFilter = "", notesFilter = "", page = currentNeedsPage) {
    try {
        if (!statusFilter) {
            return loadActiveNeedsHistory(nameFilter, phoneFilter, itemFilter, villageFilter, priorityFilter, notesFilter, page);
        }

        currentNeedsPage = Math.max(1, Number(page) || 1);
        const response = await api.getNeeds({
            name: nameFilter.trim() || undefined,
            phone: phoneFilter.trim() || undefined,
            item: itemFilter.trim() || undefined,
            village: villageFilter || undefined,
            status: statusFilter || undefined,
            priority: priorityFilter || undefined,
            notes: notesFilter.trim() || undefined,
            page: currentNeedsPage,
            pageSize: NEEDS_PAGE_SIZE,
        });

        const data = response?.data || [];
        currentNeedsTotalCount = Number(response?.total || 0);

        const totalPages = Math.max(1, Math.ceil(currentNeedsTotalCount / NEEDS_PAGE_SIZE));
        if (currentNeedsTotalCount > 0 && currentNeedsPage > totalPages) {
            currentNeedsPage = totalPages;
            return loadNeedsHistory(nameFilter, phoneFilter, itemFilter, villageFilter, statusFilter, priorityFilter, notesFilter, currentNeedsPage);
        }

        renderNeedsHistoryTable("needsHistoryTable", data, currentNeedsTotalCount, currentNeedsPage, NEEDS_PAGE_SIZE, "goToNeedsPage");
    } catch (err) {
        console.error("Error loading needs history:", err);
        document.getElementById("needsHistoryTable").innerHTML = `<div class="card" style="background:#fff1f1">فشل تحميل الاحتياجات</div>`;
    }
}

let completedNeedsDialogName = "";

function applyCompletedNeedsSearch() {
    completedNeedsDialogName = String(document.getElementById("completedNeedsSearch")?.value || "").trim();
    completedNeedsPage = 1;
    loadCompletedNeedsHistory(
        completedNeedsDialogName,
        currentNeedFilters.phone,
        currentNeedFilters.item,
        currentNeedFilters.village,
        currentNeedFilters.priority,
        currentNeedFilters.notes,
        completedNeedsPage
    );
}

function openCompletedNeedsModal() {
    completedNeedsPage = 1;
    completedNeedsDialogName = "";
    const searchInput = document.getElementById("completedNeedsSearch");
    if (searchInput) searchInput.value = "";
    document.getElementById("completedNeedsModal").classList.add("active");
    document.body.style.overflow = "hidden";
    loadCompletedNeedsHistory(
        completedNeedsDialogName,
        currentNeedFilters.phone,
        currentNeedFilters.item,
        currentNeedFilters.village,
        currentNeedFilters.priority,
        currentNeedFilters.notes,
        completedNeedsPage
    );
    setTimeout(() => document.getElementById("completedNeedsSearch")?.focus(), 0);
}

function closeCompletedNeedsModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("completedNeedsModal").classList.remove("active");
    document.body.style.overflow = "";
    document.getElementById("completedNeedsHistoryTable").innerHTML = "";
}

function openNeedsExcelImportModal() {
    const result = document.getElementById("needsImportResult");
    result.className = "needs-import-result hidden";
    result.textContent = "";
    const fileInput = document.getElementById("needsExcelFile");
    if (fileInput) fileInput.value = "";

    document.getElementById("needsExcelImportModal").classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeNeedsExcelImportModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("needsExcelImportModal").classList.remove("active");
    document.body.style.overflow = "";

    const fileInput = document.getElementById("needsExcelFile");
    if (fileInput) fileInput.value = "";
    const result = document.getElementById("needsImportResult");
    result.className = "needs-import-result hidden";
    result.textContent = "";
}

async function refreshNeedsHistoryViews() {
    await loadNeedsHistory(
        currentNeedFilters.name,
        currentNeedFilters.phone,
        currentNeedFilters.item,
        currentNeedFilters.village,
        currentNeedFilters.status,
        currentNeedFilters.priority,
        currentNeedFilters.notes,
        currentNeedsPage
    );

    const modal = document.getElementById("completedNeedsModal");
    if (!modal || !modal.classList.contains("active")) return;

    await loadCompletedNeedsHistory(
        completedNeedsDialogName,
        currentNeedFilters.phone,
        currentNeedFilters.item,
        currentNeedFilters.village,
        currentNeedFilters.priority,
        currentNeedFilters.notes,
        completedNeedsPage
    );
}

function applyNeedFilters() {
    const name = document.getElementById("needNameFilter").value;
    const phone = document.getElementById("needPhoneFilter").value;
    const item = document.getElementById("needItemFilter").value;
    const village = document.getElementById("needVillageFilter").value;
    const status = document.getElementById("needStatusFilter").value;
    const priority = document.getElementById("needPriorityFilter").value;
    const notes = document.getElementById("needNotesFilter").value;

    currentNeedFilters = { name, phone, item, village, status, priority, notes };
    currentNeedsPage = 1;
    completedNeedsPage = 1;
    refreshNeedsHistoryViews();
}

function clearNeedFilters() {
    document.getElementById("needNameFilter").value = "";
    document.getElementById("needPhoneFilter").value = "";
    document.getElementById("needItemFilter").value = "";
    document.getElementById("needVillageFilter").value = "";
    document.getElementById("needStatusFilter").value = "";
    document.getElementById("needPriorityFilter").value = "";
    document.getElementById("needNotesFilter").value = "";
    currentNeedFilters = { name: "", phone: "", item: "", village: "", status: "", priority: "", notes: "" };
    currentNeedsPage = 1;
    completedNeedsPage = 1;
    refreshNeedsHistoryViews();
}

// Debounce text-input searches so we don't fire an API call on every keystroke
window.applyNeedFilters = debounce(applyNeedFilters, 350);
window.applyCompletedNeedsSearch = debounce(applyCompletedNeedsSearch, 350);
window.filterNeedFamilies = filterNeedFamilies;
window.selectNeedFamily = selectNeedFamily;
window.clearSelectedNeedFamily = clearSelectedNeedFamily;
window.hideNeedFamilyDropdown = hideNeedFamilyDropdown;
