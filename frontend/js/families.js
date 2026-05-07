let familiesLoadedOnce = false;
let familyStatsCache = {};
let editingFamilyId = null;
let relationFamilyId = null;
let familyRelationsCache = {};
let familiesPage = 1;
const FAMILIES_PAGE_SIZE = 100;

function getFamilyDisplayName(family) {
    const first = family?.father_first_name ?? family?.fatherFirstName ?? family?.first_name ?? "";
    const last = family?.father_last_name ?? family?.fatherLastName ?? family?.last_name ?? "";
    return `${String(first).trim()} ${String(last).trim()}`.trim() || "-";
}

function normalizeDistributionType(value) {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "municipality" || raw === "baladiyeh" || raw === "بلدية") return "municipality";
    return "local";
}

function getDistributionTypeLabel(value) {
    const normalized = normalizeDistributionType(value);
    return normalized === "municipality" ? "بلدية" : "توزيع محلي";
}

function iconSvg(name) {
    if (name === "plus") {
        return `
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;
    }
    if (name === "list") {
        return `
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 7h14M6 12h14M6 17h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M4 7h.01M4 12h.01M4 17h.01" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
            </svg>
        `;
    }
    if (name === "edit") {
        return `
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 20h4l10.5-10.5a1.5 1.5 0 0 0 0-2.1L16.6 4.5a1.5 1.5 0 0 0-2.1 0L4 15v5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                <path d="M13.5 5.5l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;
    }
    if (name === "link") {
        return `
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M10 13a5 5 0 0 1 0-7l1.3-1.3a5 5 0 0 1 7 7L17 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M14 11a5 5 0 0 1 0 7l-1.3 1.3a5 5 0 0 1-7-7L7 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;
    }
    if (name === "trash") {
        return `
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 7h12M9 7V5h6v2M8 7l1 14h6l1-14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
    }
    return "";
}

function toggleCustomRelationType() {
    const select = document.getElementById("relationTypeSelect");
    const custom = document.getElementById("relationTypeCustom");
    if (!select || !custom) return;
    custom.classList.toggle("hidden", select.value !== "other");
    if (select.value === "other") setTimeout(() => custom.focus(), 0);
}

function filterRelationFamilies() {
    const query = String(document.getElementById("relationFamilySearch")?.value || "")
        .trim()
        .toLowerCase();
    const select = document.getElementById("relationFamilySelect");
    if (!select) return;

    const options = Array.from(select.options);
    options.forEach((opt) => {
        if (!opt.value) return;
        const text = String(opt.textContent || "").toLowerCase();
        opt.hidden = query ? !text.includes(query) : false;
    });

    if (select.selectedOptions?.[0]?.hidden) {
        const firstVisible = options.find((opt) => opt.value && !opt.hidden);
        if (firstVisible) select.value = firstVisible.value;
    }
}

function fillRelationFamilySelect(currentFamilyId) {
    const select = document.getElementById("relationFamilySelect");
    if (!select) return;

    const list = (families || [])
        .filter((row) => Number(row.id) && Number(row.id) !== Number(currentFamilyId))
        .slice()
        .sort((a, b) => getFamilyDisplayName(a).localeCompare(getFamilyDisplayName(b), "ar"));

    select.innerHTML = `<option value="">اختر عائلة</option>${list
        .map((row) => {
            const name = getFamilyDisplayName(row);
            const villageName = row.village_name ?? row.villageName ?? getVillageNameById(row.village_id ?? row.villageId ?? "");
            const phone = row.phone_number ?? row.phoneNumber ?? "";
            const extra = [villageName, phone].filter(Boolean).join(" · ");
            return `<option value="${row.id}">${escapeHtml(name)}${extra ? ` (${escapeHtml(extra)})` : ""}</option>`;
        })
        .join("")}`;
}

async function loadFamilyRelations(familyId, { force = false } = {}) {
    const key = String(familyId);
    if (!force && familyRelationsCache[key]) return familyRelationsCache[key];

    try {
        const data = await api.getFamilyRelations(familyId);
        familyRelationsCache[key] = Array.isArray(data) ? data : data?.data || [];
        return familyRelationsCache[key];
    } catch (error) {
        console.error("Error loading relations:", error);
        familyRelationsCache[key] = [];
        return [];
    }
}

function renderFamilyRelations(relations = []) {
    const container = document.getElementById("familyRelationsList");
    if (!container) return;

    if (!Array.isArray(relations) || !relations.length) {
        container.innerHTML = renderEmptyState("لا توجد علاقات بعد.");
        return;
    }

    container.innerHTML = relations
        .map((row) => {
            const related = row.related_family || null;
            const name = related ? getFamilyDisplayName(related) : `#${row.related_family_id}`;
            const villageName = related ? getVillageNameById(related.village_id ?? related.villageId ?? "") : "-";
            const phone = related?.phone_number || "-";
            const type = row.relation_type || "-";
            return `
                <div class="card relation-row">
                    <div class="relation-meta">
                        <strong>${escapeHtml(name)}</strong>
                        <small>${escapeHtml(type)} · ${escapeHtml(villageName)} · ${escapeHtml(phone)}</small>
                        ${row.notes ? `<div class="relation-notes">${escapeHtml(row.notes)}</div>` : ""}
                    </div>
                    <button class="icon-btn" type="button" onclick="deleteFamilyRelation(${escapeHtml(row.id)})" aria-label="حذف العلاقة">
                        ${iconSvg("trash")}
                    </button>
                </div>
            `;
        })
        .join("");
}

async function openFamilyRelationsModal(familyId) {
    const id = Number(familyId);
    if (!id) return;

    relationFamilyId = id;
    fillRelationFamilySelect(id);

    const search = document.getElementById("relationFamilySearch");
    if (search) search.value = "";

    const typeSelect = document.getElementById("relationTypeSelect");
    if (typeSelect) typeSelect.value = "brothers";
    const typeCustom = document.getElementById("relationTypeCustom");
    if (typeCustom) typeCustom.value = "";
    toggleCustomRelationType();

    const notes = document.getElementById("relationNotes");
    if (notes) notes.value = "";

    const family = (families || []).find((row) => Number(row.id) === id);
    const title = document.getElementById("familyRelationsModalTitle");
    if (title) title.textContent = `العلاقات: ${getFamilyDisplayName(family)}`;

    document.getElementById("familyRelationsModal")?.classList.add("active");
    document.body.style.overflow = "hidden";

    const list = await loadFamilyRelations(id);
    renderFamilyRelations(list);
    setTimeout(() => document.getElementById("relationFamilySelect")?.focus(), 0);
}

function closeFamilyRelationsModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("familyRelationsModal")?.classList.remove("active");
    document.body.style.overflow = "";
    relationFamilyId = null;
}

function getRelationTypeValue() {
    const select = document.getElementById("relationTypeSelect");
    const custom = document.getElementById("relationTypeCustom");
    if (!select) return "";
    if (select.value === "other") return String(custom?.value || "").trim();
    return String(select.value || "").trim();
}

async function submitFamilyRelation() {
    if (!relationFamilyId) return;

    const relatedId = Number(document.getElementById("relationFamilySelect")?.value);
    const relationType = getRelationTypeValue();
    const notes = String(document.getElementById("relationNotes")?.value || "").trim();

    if (!relatedId) return alert("اختر العائلة المرتبطة");
    if (!relationType) return alert("أدخل نوع العلاقة");

    try {
        await api.createFamilyRelation(relationFamilyId, {
            related_family_id: relatedId,
            relation_type: relationType,
            notes: notes || null,
        });
        familyRelationsCache[String(relationFamilyId)] = null;
        const list = await loadFamilyRelations(relationFamilyId, { force: true });
        renderFamilyRelations(list);
    } catch (error) {
        console.error(error);
        alert("فشل إضافة العلاقة (قد تكون موجودة مسبقًا)");
    }
}

async function deleteFamilyRelation(relationId) {
    if (!relationFamilyId) return;
    const id = Number(relationId);
    if (!id) return;

    if (!confirm("حذف العلاقة؟")) return;

    try {
        await api.deleteFamilyRelation(relationFamilyId, id);
        familyRelationsCache[String(relationFamilyId)] = null;
        const list = await loadFamilyRelations(relationFamilyId, { force: true });
        renderFamilyRelations(list);
    } catch (error) {
        console.error(error);
        alert("فشل حذف العلاقة");
    }
}

function fillFamilyEditVillageSelect(selectedValue = "") {
    const select = document.getElementById("editFamilyVillage");
    if (!select) return;
    select.innerHTML = getVillageOptions(selectedValue);
}

function openFamilyEditModal(familyId) {
    const id = Number(familyId);
    if (!id) return;

    const family = (families || []).find((row) => Number(row.id) === id);
    if (!family) return alert("العائلة غير موجودة");

    editingFamilyId = id;

    const first = family.father_first_name ?? family.fatherFirstName ?? family.first_name ?? "";
    const last = family.father_last_name ?? family.fatherLastName ?? family.last_name ?? "";
    const phone = family.phone_number ?? family.phoneNumber ?? family.father_phone ?? family.fatherPhone ?? "";
    const people = family.people_count ?? family.peopleCount ?? family.members_count ?? family.membersCount ?? 1;
    const villageId = family.village_id ?? family.villageId ?? "";
    const fileNumber = family.file_number ?? family.fileNumber ?? "";
    const isFormFilled = family.is_form_filled ?? family.isFormFilled ?? false;
    const municipalityRegistered = family.municipality_registered ?? family.municipalityRegistered ?? false;
    const housingType = family.housing_type ?? family.housingType ?? "";
    const isBlocked = family.is_blocked ?? family.isBlocked ?? false;

    const title = document.getElementById("familyEditModalTitle");
    if (title) title.textContent = `تعديل: ${getFamilyDisplayName(family)}`;

    document.getElementById("editFatherFirstName").value = String(first ?? "");
    document.getElementById("editFatherLastName").value = String(last ?? "");
    document.getElementById("editFamilyPhone").value = String(phone ?? "");
    document.getElementById("editFamilyPeopleCount").value = String(people ?? "");
    fillFamilyEditVillageSelect(String(villageId ?? ""));
    const fileNumberEl = document.getElementById("editFamilyFileNumber");
    if (fileNumberEl) fileNumberEl.value = String(fileNumber ?? "");
    const formFilledEl = document.getElementById("editFamilyFormFilled");
    if (formFilledEl) formFilledEl.checked = Boolean(isFormFilled);
    const muniEl = document.getElementById("editFamilyMunicipalityRegistered");
    if (muniEl) muniEl.checked = Boolean(municipalityRegistered);
    const housingTypeEl = document.getElementById("editFamilyHousingType");
    if (housingTypeEl) housingTypeEl.value = housingType || "";
    const isBlockedEl = document.getElementById("editFamilyIsBlocked");
    if (isBlockedEl) isBlockedEl.checked = Boolean(isBlocked);

    document.getElementById("familyEditModal")?.classList.add("active");
    document.body.style.overflow = "hidden";
    setTimeout(() => document.getElementById("editFatherFirstName")?.focus(), 0);
}

function closeFamilyEditModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("familyEditModal")?.classList.remove("active");
    document.body.style.overflow = "";
    editingFamilyId = null;
}

async function submitFamilyEdit() {
    if (!editingFamilyId) return;

    const first = document.getElementById("editFatherFirstName")?.value?.trim() || "";
    const last = document.getElementById("editFatherLastName")?.value?.trim() || "";
    const phone = document.getElementById("editFamilyPhone")?.value?.trim() || "";
    const peopleCount = Number(document.getElementById("editFamilyPeopleCount")?.value);
    const villageId = document.getElementById("editFamilyVillage")?.value || "";
    const fileNumber = document.getElementById("editFamilyFileNumber")?.value?.trim() || null;
    const isFormFilled = document.getElementById("editFamilyFormFilled")?.checked ?? false;
    const municipalityRegistered = document.getElementById("editFamilyMunicipalityRegistered")?.checked ?? false;
    const housingType = document.getElementById("editFamilyHousingType")?.value || null;
    const isBlocked = document.getElementById("editFamilyIsBlocked")?.checked ?? false;

    if (!first) return alert("أدخل اسم الأب");
    if (!last) return alert("أدخل كنية الأب");
    if (!villageId) return alert("اختر القرية");
    if (!peopleCount || peopleCount <= 0) return alert("أدخل عدد أفراد صحيح");

    try {
        await api.updateFamily(editingFamilyId, {
            father_first_name: first,
            father_last_name: last,
            phone_number: phone || null,
            people_count: peopleCount,
            village_id: Number(villageId),
            file_number: fileNumber,
            is_form_filled: isFormFilled,
            municipality_registered: municipalityRegistered,
            housing_type: housingType,
            is_blocked: isBlocked,
        });
        closeFamilyEditModal();
        await refreshFamilies({ silent: true });
    } catch (error) {
        console.error(error);
        alert("فشل حفظ التعديل");
    }
}

function getDistributionPayload() {
    const type = normalizeDistributionType(document.getElementById("distributionType")?.value || "local");
    const at = document.getElementById("distributionAt")?.value || "";
    const notes = document.getElementById("distributionNotes")?.value || "";

    const items = (currentDistributionItems || [])
        .map((row) => ({
            item_id: row.item_id,
            quantity: row.quantity,
        }))
        .filter((row) => row.item_id != null && row.quantity != null);

    const payload = { type, items };
    if (String(at).trim()) payload.distributed_at = new Date(at).toISOString();
    if (String(notes).trim()) payload.notes = String(notes).trim();
    return payload;
}

function fillDistributionItemSelect() {
    const select = document.getElementById("distributionItem");
    if (!select) return;

    const items = Array.isArray(inventory) ? inventory : [];
    select.innerHTML = `<option value="">اختر المنتج</option>${items.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}`;
}

function renderDistributionItemsList() {
    const container = document.getElementById("distributionItemsList");
    if (!container) return;

    if (!currentDistributionItems.length) {
        container.innerHTML = `<div class="card distribution-empty">لم تتم إضافة مواد بعد.</div>`;
        return;
    }

    container.innerHTML = currentDistributionItems
        .map((row, idx) => {
            const item = (inventory || []).find((entry) => String(entry.id) === String(row.item_id));
            const name = item?.name || row.item_name || "-";
            return `
                <div class="card distribution-item-row">
                    <div>
                        <strong>${escapeHtml(name)}</strong>
                        <small>الكمية: ${escapeHtml(row.quantity)}</small>
                    </div>
                    <button class="delete" type="button" onclick="removeDistributionItem(${idx})">حذف</button>
                </div>
            `;
        })
        .join("");
}

function addDistributionItem() {
    const itemId = document.getElementById("distributionItem")?.value || "";
    const qty = Number(document.getElementById("distributionQty")?.value);

    if (!distributionFamilyId) return alert("اختر عائلة أولاً");
    if (!itemId) return alert("اختر المنتج");
    if (!qty || qty <= 0) return alert("أدخل كمية صحيحة أكبر من صفر");

    const existing = currentDistributionItems.find((row) => String(row.item_id) === String(itemId));
    if (existing) {
        existing.quantity += qty;
    } else {
        currentDistributionItems.push({ item_id: Number(itemId), quantity: qty });
    }

    document.getElementById("distributionItem").value = "";
    document.getElementById("distributionQty").value = "";
    renderDistributionItemsList();
}

function removeDistributionItem(index) {
    currentDistributionItems.splice(index, 1);
    renderDistributionItemsList();
}

function openDistributionModal(familyId) {
    distributionFamilyId = familyId;
    currentDistributionItems = [];

    fillDistributionItemSelect();
    renderDistributionItemsList();

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const input = document.getElementById("distributionAt");
    if (input) input.value = `${yyyy}-${mm}-${dd}T${hh}:${min}`;

    const notes = document.getElementById("distributionNotes");
    if (notes) notes.value = "";

    const family = (families || []).find((row) => String(row.id) === String(familyId));
    const title = document.getElementById("distributionModalTitle");
    if (title) title.textContent = `إضافة توزيع: ${getFamilyDisplayName(family)}`;

    document.getElementById("distributionModal")?.classList.add("active");
    document.body.style.overflow = "hidden";
    setTimeout(() => document.getElementById("distributionItem")?.focus(), 0);
}

function closeDistributionModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("distributionModal")?.classList.remove("active");
    document.body.style.overflow = "";
    distributionFamilyId = null;
    currentDistributionItems = [];
    const list = document.getElementById("distributionItemsList");
    if (list) list.innerHTML = "";
}

async function submitDistribution() {
    if (!distributionFamilyId) return alert("اختر عائلة أولاً");
    if (!currentDistributionItems.length) return alert("أضف مادة واحدة على الأقل");

    try {
        await api.createFamilyDistribution(distributionFamilyId, getDistributionPayload());
        familyDistributionsCache[String(distributionFamilyId)] = null;
        await loadFamilyDistributions(distributionFamilyId, { force: true });
        closeDistributionModal();
        await refreshFamilies({ silent: true });
    } catch (error) {
        console.error(error);
        alert("فشل حفظ التوزيع");
    }
}

function readFamilyFiltersFromUi() {
    return {
        name: document.getElementById("familyNameFilter")?.value?.trim() || "",
        fileNumberSearch: document.getElementById("familyFileNumberSearch")?.value?.trim() || "",
        village: document.getElementById("familyVillageFilter")?.value || "",
        formFilled: document.getElementById("familyFormFilledFilter")?.value || "",
        fileNumber: document.getElementById("familyFileNumberFilter")?.value || "",
        municipality: document.getElementById("familyMunicipalityFilter")?.value || "",
        housingType: document.getElementById("familyHousingTypeFilter")?.value || "",
        blocked: document.getElementById("familyBlockedFilter")?.value || "",
        duplicate: document.getElementById("familyDuplicateFilter")?.value || "",
        distMin: document.getElementById("familyDistMinFilter")?.value?.trim() || "",
        distMax: document.getElementById("familyDistMaxFilter")?.value?.trim() || "",
    };
}

function applyFamilyFilters() {
    currentFamilyFilters = readFamilyFiltersFromUi();
    familiesPage = 1;
    renderFamilies();
}

function clearFamilyFilters() {
    ["familyNameFilter", "familyFileNumberSearch", "familyVillageFilter", "familyFormFilledFilter",
     "familyFileNumberFilter", "familyMunicipalityFilter", "familyDuplicateFilter",
     "familyHousingTypeFilter", "familyBlockedFilter", "familyDistMinFilter", "familyDistMaxFilter"]
        .forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
    currentFamilyFilters = { name: "", fileNumberSearch: "", village: "", formFilled: "", fileNumber: "", municipality: "", duplicate: "", housingType: "", blocked: "", distMin: "", distMax: "" };
    familiesSortCol = "";
    familiesSortDir = "asc";
    renderFamilies();
}

function sortFamiliesBy(col) {
    if (familiesSortCol === col) {
        familiesSortDir = familiesSortDir === "asc" ? "desc" : "asc";
    } else {
        familiesSortCol = col;
        familiesSortDir = "asc";
    }
    familiesPage = 1;
    renderFamilies();
}

function _sortIcon(col) {
    if (familiesSortCol !== col) return `<span class="sort-icon">↕</span>`;
    return familiesSortDir === "asc" ? `<span class="sort-icon active">↑</span>` : `<span class="sort-icon active">↓</span>`;
}

function getDuplicateMap() {
    const nameVillageMap = {};
    const fileNumberMap = {};

    (families || []).forEach((f) => {
        const nameKey = `${getFamilyDisplayName(f).trim().toLowerCase()}__${String(f.village_id ?? f.villageId ?? "")}`;
        if (!nameVillageMap[nameKey]) nameVillageMap[nameKey] = [];
        nameVillageMap[nameKey].push(f.id);

        const fileNum = String(f.file_number ?? f.fileNumber ?? "").trim();
        if (fileNum) {
            if (!fileNumberMap[fileNum]) fileNumberMap[fileNum] = [];
            fileNumberMap[fileNum].push(f.id);
        }
    });

    // Map<String(id), Set<reason>>
    const result = new Map();
    const mark = (id, reason) => {
        const key = String(id);
        if (!result.has(key)) result.set(key, new Set());
        result.get(key).add(reason);
    };

    Object.values(nameVillageMap).forEach((group) => {
        if (group.length > 1) group.forEach((id) => mark(id, "name_village"));
    });
    Object.values(fileNumberMap).forEach((group) => {
        if (group.length > 1) group.forEach((id) => mark(id, "file_number"));
    });

    return result;
}

function getDuplicateFamilyIds() {
    return new Set(getDuplicateMap().keys());
}

function getFilteredFamilies() {
    const nameQuery = String(currentFamilyFilters?.name || "").toLowerCase();
    const fileNumberSearch = String(currentFamilyFilters?.fileNumberSearch || "").toLowerCase();
    const villageId = String(currentFamilyFilters?.village || "");
    const formFilledFilter = String(currentFamilyFilters?.formFilled || "");
    const fileNumberFilter = String(currentFamilyFilters?.fileNumber || "");
    const municipalityFilter = String(currentFamilyFilters?.municipality || "");
    const duplicateFilter = String(currentFamilyFilters?.duplicate || "");
    const housingTypeFilter = String(currentFamilyFilters?.housingType || "");
    const blockedFilter = String(currentFamilyFilters?.blocked || "");
    const duplicateIds = duplicateFilter === "yes" ? getDuplicateFamilyIds() : null;
    const distMin = currentFamilyFilters?.distMin !== "" ? Number(currentFamilyFilters.distMin) : null;
    const distMax = currentFamilyFilters?.distMax !== "" ? Number(currentFamilyFilters.distMax) : null;

    const filtered = (families || []).filter((family) => {
        if (villageId && String(family.village_id ?? family.villageId ?? "") !== villageId) return false;
        if (formFilledFilter === "yes" && !Boolean(family.is_form_filled ?? family.isFormFilled)) return false;
        if (formFilledFilter === "no" && Boolean(family.is_form_filled ?? family.isFormFilled)) return false;
        const muniReg = Boolean(family.municipality_registered ?? family.municipalityRegistered ?? false);
        if (municipalityFilter === "yes" && !muniReg) return false;
        if (municipalityFilter === "no" && muniReg) return false;
        const fileNum = String(family.file_number ?? family.fileNumber ?? "").trim();
        if (fileNumberFilter === "yes" && !fileNum) return false;
        if (fileNumberFilter === "no" && fileNum) return false;
        if (fileNumberSearch && !fileNum.toLowerCase().includes(fileNumberSearch)) return false;
        if (duplicateIds && !duplicateIds.has(String(family.id))) return false;
        const ht = family.housing_type ?? family.housingType ?? null;
        if (housingTypeFilter === "house" && ht !== "house") return false;
        if (housingTypeFilter === "shelter_center" && ht !== "shelter_center") return false;
        if (housingTypeFilter === "none" && ht) return false;
        const blocked = Boolean(family.is_blocked ?? family.isBlocked ?? false);
        if (blockedFilter === "yes" && !blocked) return false;
        if (blockedFilter === "no" && blocked) return false;
        if (distMin !== null || distMax !== null) {
            const cnt = Number(family.distribution_count ?? familyStatsCache[String(family.id)]?.count ?? 0);
            if (distMin !== null && cnt < distMin) return false;
            if (distMax !== null && cnt > distMax) return false;
        }
        if (!nameQuery) return true;
        const text = `${getFamilyDisplayName(family)} ${family?.phone_number ?? ""}`.toLowerCase();
        return text.includes(nameQuery);
    });

    if (!familiesSortCol) return filtered;
    return [...filtered].sort((a, b) => {
        let va, vb;
        switch (familiesSortCol) {
            case "name":
                va = getFamilyDisplayName(a).toLowerCase();
                vb = getFamilyDisplayName(b).toLowerCase();
                break;
            case "village":
                va = getVillageNameById(a.village_id ?? "").toLowerCase();
                vb = getVillageNameById(b.village_id ?? "").toLowerCase();
                break;
            case "people":
                va = Number(a.people_count ?? 0);
                vb = Number(b.people_count ?? 0);
                break;
            case "distributions":
                va = Number(a.distribution_count ?? familyStatsCache[String(a.id)]?.count ?? 0);
                vb = Number(b.distribution_count ?? familyStatsCache[String(b.id)]?.count ?? 0);
                break;
            default: return 0;
        }
        if (va < vb) return familiesSortDir === "asc" ? -1 : 1;
        if (va > vb) return familiesSortDir === "asc" ? 1 : -1;
        return 0;
    });
}

function renderFamilyDistributions(distributions = [], familyId = null) {
    if (!Array.isArray(distributions) || !distributions.length) {
        return `<div class="card distribution-empty">لا يوجد سجل توزيعات بعد.</div>`;
    }

    return `
        <div class="report-table-wrap distribution-table-wrap">
            <table class="needs-table distribution-table">
                <thead>
                    <tr>
                        <th>الوقت</th>
                        <th>النوع</th>
                        <th>المواد</th>
                        <th>ملاحظات</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${distributions
                        .map((dist) => {
                            const time = dist.distributed_at || dist.created_at || dist.time || dist.date || "";
                            const items = dist.items || dist.lines || dist.distribution_items || [];
                            const itemsText = Array.isArray(items)
                                ? items
                                      .map((row) => {
                                          const name = row.item_name || row.name || (inventory || []).find((i) => String(i.id) === String(row.item_id))?.name || "-";
                                          const qty = row.quantity ?? row.qty ?? row.amount ?? "";
                                          return `${escapeHtml(name)}: ${escapeHtml(qty)}`;
                                      })
                                      .join("<br>")
                                : "-";
                            const notes = dist.notes || dist.note || "";
                            const deleteBtn = familyId && dist.id
                                ? `<button class="delete dist-delete-btn" title="حذف التوزيع" onclick="deleteDistribution(${familyId}, ${dist.id}, this)">×</button>`
                                : "";
                            return `
                                <tr>
                                    <td class="needs-date-cell">${escapeHtml(time ? formatDate(time) : "-")}</td>
                                    <td>${escapeHtml(getDistributionTypeLabel(dist.type))}</td>
                                    <td class="need-items-cell">${itemsText || "-"}</td>
                                    <td class="need-notes-cell">${escapeHtml(notes || "-")}</td>
                                    <td style="text-align:center;">${deleteBtn}</td>
                                </tr>
                            `;
                        })
                        .join("")}
                </tbody>
            </table>
        </div>
    `;
}

async function deleteDistribution(familyId, distId, btn) {
    if (!confirm("هل تريد حذف هذا التوزيع؟")) return;
    if (btn) { btn.disabled = true; btn.textContent = "..."; }
    try {
        await api.deleteFamilyDistribution(familyId, distId);
        const key = String(familyId);
        familyDistributionsCache[key] = null;
        const distributions = await loadFamilyDistributions(familyId, { force: true });
        const container = document.getElementById("distributionsHistoryContent");
        if (container) container.innerHTML = renderFamilyDistributions(distributions, familyId);
        await refreshFamilies({ silent: true });
    } catch (err) {
        console.error("Failed to delete distribution:", err);
        alert("فشل حذف التوزيع");
        if (btn) { btn.disabled = false; btn.textContent = "×"; }
    }
}

async function loadFamilyDistributions(familyId, { force = false } = {}) {
    const key = String(familyId);
    if (!force && familyDistributionsCache[key]) return familyDistributionsCache[key];

    try {
        const data = await api.getFamilyDistributions(familyId);
        const list = Array.isArray(data) ? data : data?.data || data?.rows || [];
        familyDistributionsCache[key] = list;
        return list;
    } catch (error) {
        console.error("Error loading distributions:", error);
        familyDistributionsCache[key] = [];
        return [];
    }
}

async function openDistributionsHistoryModal(familyId) {
    const id = Number(familyId);
    if (!id) return;

    const family = (families || []).find((row) => Number(row.id) === id);
    const title = document.getElementById("distributionsHistoryModalTitle");
    if (title) title.textContent = `سجل التوزيعات: ${getFamilyDisplayName(family)}`;

    const container = document.getElementById("distributionsHistoryContent");
    if (container) container.innerHTML = `<div class="card distribution-empty">جارٍ التحميل...</div>`;

    document.getElementById("distributionsHistoryModal")?.classList.add("active");
    document.body.style.overflow = "hidden";

    const distributions = await loadFamilyDistributions(id);
    if (container) container.innerHTML = renderFamilyDistributions(distributions, id);

    const stats = {
        count: Array.isArray(distributions) ? distributions.length : 0,
        lastAt: Array.isArray(distributions) && distributions.length ? distributions[0]?.distributed_at || distributions[0]?.created_at : "",
    };
    familyStatsCache[String(id)] = stats;

    const countEl = document.getElementById(`familyDistCount_${id}`);
    if (countEl) countEl.textContent = String(stats.count ?? 0);
    const lastEl = document.getElementById(`familyLastDist_${id}`);
    if (lastEl) lastEl.textContent = stats.lastAt ? formatDate(stats.lastAt) : "-";
}

function closeDistributionsHistoryModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("distributionsHistoryModal")?.classList.remove("active");
    document.body.style.overflow = "";
}

async function hydrateFamilyStatsIfMissing() {
    const hasStatsFromApi = (families || []).some(
        (row) =>
            row?.distribution_count !== undefined ||
            row?.distributions_count !== undefined ||
            row?.last_distribution_at ||
            row?.last_distributed_at ||
            row?.lastDistributionAt,
    );

    if (hasStatsFromApi) return;

    const list = (families || []).map((row) => Number(row.id)).filter(Boolean);
    if (!list.length) return;

    // Avoid hammering the backend if the dataset is huge.
    const maxToHydrate = 60;
    const ids = list.slice(0, maxToHydrate);

    const BATCH_SIZE = 10;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (familyId) => {
            try {
                const summary = await api.getFamilyDistributions(familyId, { summary: 1 });
                const count = Number(summary?.distribution_count ?? summary?.count ?? 0);
                const lastAt = summary?.last_distribution_at ?? summary?.lastAt ?? "";
                familyStatsCache[String(familyId)] = {
                    count: Number.isFinite(count) ? count : 0,
                    lastAt: lastAt || "",
                };
                const countEl = document.getElementById(`familyDistCount_${familyId}`);
                if (countEl) countEl.textContent = String(familyStatsCache[String(familyId)].count ?? 0);
                const lastEl = document.getElementById(`familyLastDist_${familyId}`);
                if (lastEl) lastEl.textContent = familyStatsCache[String(familyId)].lastAt ? formatDate(familyStatsCache[String(familyId)].lastAt) : "-";
            } catch (error) {
                console.warn("Failed to hydrate family stats for", familyId, error?.message || error);
            }
        }));
    }
}

function renderFamiliesPagination(totalCount) {
    const totalPages = Math.ceil(totalCount / FAMILIES_PAGE_SIZE);
    if (totalPages <= 1) return "";
    const pageStart = (familiesPage - 1) * FAMILIES_PAGE_SIZE + 1;
    const pageEnd = Math.min(totalCount, familiesPage * FAMILIES_PAGE_SIZE);
    return `
        <div class="needs-pagination">
            <small class="needs-pagination-info">عرض ${pageStart}–${pageEnd} من أصل ${totalCount}</small>
            <div class="needs-pagination-actions">
                <button type="button" class="done" onclick="goToFamiliesPage(${familiesPage - 1})" ${familiesPage <= 1 ? "disabled" : ""}>السابق</button>
                <span class="needs-pagination-page">صفحة ${familiesPage} من ${totalPages}</span>
                <button type="button" class="done" onclick="goToFamiliesPage(${familiesPage + 1})" ${familiesPage >= totalPages ? "disabled" : ""}>التالي</button>
            </div>
        </div>`;
}

function goToFamiliesPage(page) {
    const total = getFilteredFamilies().length;
    const totalPages = Math.max(1, Math.ceil(total / FAMILIES_PAGE_SIZE));
    familiesPage = Math.max(1, Math.min(Number(page), totalPages));
    renderFamilies();
    document.getElementById("familiesList")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderFamilies() {
    const container = document.getElementById("familiesList");
    if (!container) return;

    const allFiltered = getFilteredFamilies();
    if (!allFiltered.length) {
        container.innerHTML = renderEmptyState("لا توجد عائلات مطابقة للبحث.");
        return;
    }

    const totalPages = Math.max(1, Math.ceil(allFiltered.length / FAMILIES_PAGE_SIZE));
    if (familiesPage > totalPages) familiesPage = totalPages;

    const offset = (familiesPage - 1) * FAMILIES_PAGE_SIZE;
    const list = allFiltered.slice(offset, offset + FAMILIES_PAGE_SIZE);
    const duplicateMap = getDuplicateMap();

    container.innerHTML = `
        <div class="needs-table-wrap families-table-wrap">
            <table class="needs-table families-table">
                <thead>
                    <tr>
                        <th class="sortable-th" onclick="sortFamiliesBy('name')">الأب ${_sortIcon('name')}</th>
                        <th>رقم الهاتف</th>
                        <th class="sortable-th" onclick="sortFamiliesBy('people')">الأفراد ${_sortIcon('people')}</th>
                        <th class="sortable-th" onclick="sortFamiliesBy('village')">القرية ${_sortIcon('village')}</th>
                        <th>رقم الملف</th>
                        <th>استمارة</th>
                        <th>البلدية</th>
                        <th>السكن</th>
                        <th>آخر توزيع</th>
                        <th class="sortable-th" onclick="sortFamiliesBy('distributions')">توزيعات ${_sortIcon('distributions')}</th>
                        <th>إجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    ${list
                        .map((family) => {
                            const people = family.people_count ?? family.peopleCount ?? family.members_count ?? family.membersCount ?? "-";
                            const villageName =
                                family.village_name ?? family.villageName ?? getVillageNameById(family.village_id ?? family.villageId ?? "");
                            const id = Number(family.id);
                            const phone = family.phone_number ?? family.phoneNumber ?? family.father_phone ?? family.fatherPhone ?? "-";
                            const apiCount = Number(family.distribution_count ?? family.distributions_count ?? family.distributionCount ?? NaN);
                            const apiLast = family.last_distribution_at ?? family.last_distributed_at ?? family.lastDistributionAt ?? "";

                            if (Number.isFinite(apiCount) || apiLast) {
                                familyStatsCache[String(id)] = {
                                    count: Number.isFinite(apiCount) ? apiCount : familyStatsCache[String(id)]?.count || 0,
                                    lastAt: apiLast || familyStatsCache[String(id)]?.lastAt || "",
                                };
                            }

                            const stats = familyStatsCache[String(id)] || {};
                            const last = stats.lastAt ? formatDate(stats.lastAt) : "-";
                            const count = Number.isFinite(stats.count) && stats.count > 0 ? String(stats.count) : "0";

                            const fileNumber = family.file_number ?? family.fileNumber ?? "";
                            const isFormFilled = family.is_form_filled ?? family.isFormFilled ?? false;
                            const isMuniReg = family.municipality_registered ?? family.municipalityRegistered ?? false;
                            const isBlocked = family.is_blocked ?? family.isBlocked ?? false;

                            const dupReasons = duplicateMap.get(String(id));
                            const isDuplicate = Boolean(dupReasons?.size);
                            const dupBadges = isDuplicate ? [...dupReasons].map((r) =>
                                r === "file_number"
                                    ? '<span class="badge badge-warning">مكرر: رقم الملف</span>'
                                    : '<span class="badge badge-warning">مكرر: اسم + قرية</span>'
                            ).join(" ") : "";
                            const blockedBadge = isBlocked ? '<span class="badge" style="background:#fee2e2;color:#991b1b;">محظور</span>' : "";

                            return `
                                <tr class="family-row${isDuplicate ? " family-row-duplicate" : ""}${isBlocked ? " family-row-blocked" : ""}">
                                    <td>
                                        <strong>${escapeHtml(getFamilyDisplayName(family))}</strong>
                                        ${dupBadges}
                                        ${blockedBadge}
                                    </td>
                                    <td class="families-phone-cell">${escapeHtml(phone || "-")}</td>
                                    <td class="families-people-cell">${escapeHtml(people)}</td>
                                    <td>${escapeHtml(villageName)}</td>
                                    <td class="families-file-cell">${escapeHtml(fileNumber || "-")}</td>
                                    <td class="families-form-cell">${isFormFilled ? '<span class="badge badge-success">نعم</span>' : '<span class="badge badge-neutral">لا</span>'}</td>
                                    <td class="families-muni-cell">${isMuniReg ? '<span class="badge badge-success">نعم</span>' : '<span class="badge badge-neutral">لا</span>'}</td>
                                    <td>${
                                        (family.housing_type ?? family.housingType) === "house"
                                            ? '<span class="badge badge-neutral">منزل</span>'
                                            : (family.housing_type ?? family.housingType) === "shelter_center"
                                                ? '<span class="badge" style="background:#ede9fe;color:#5b21b6;">مركز إيواء</span>'
                                                : '<span style="color:var(--muted);font-size:0.8rem;">—</span>'
                                    }</td>
                                    <td class="needs-date-cell" id="familyLastDist_${id}">${escapeHtml(last)}</td>
                                    <td class="families-count-cell" id="familyDistCount_${id}">${escapeHtml(count)}</td>
                                    <td class="families-actions-cell">
                                        <div class="families-actions">
                                            <button class="icon-btn icon-btn-primary" type="button" onclick="openDistributionModal(${id})" aria-label="إضافة توزيع">
                                                ${iconSvg("plus")}
                                            </button>
                                            <button class="icon-btn" type="button" onclick="openFamilyRelationsModal(${id})" aria-label="إدارة العلاقات">
                                                ${iconSvg("link")}
                                            </button>
                                            <button class="icon-btn" type="button" onclick="openFamilyEditModal(${id})" aria-label="تعديل بيانات العائلة">
                                                ${iconSvg("edit")}
                                            </button>
                                            <button class="icon-btn" type="button" onclick="openDistributionsHistoryModal(${id})" aria-label="عرض السجل">
                                                ${iconSvg("list")}
                                            </button>
                                            <button class="icon-btn icon-btn-danger" type="button" onclick="deleteFamily(${id})" aria-label="حذف العائلة">
                                                ${iconSvg("trash")}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        })
                        .join("")}
                </tbody>
            </table>
        </div>
        ${renderFamiliesPagination(allFiltered.length)}
    `;
}

async function refreshFamilies({ silent = false } = {}) {
    const container = document.getElementById("familiesList");
    if (container && !silent) container.innerHTML = `<div class="card distribution-empty">جارٍ تحميل العائلات...</div>`;

    try {
        const data = await api.getFamilies();
        families = Array.isArray(data) ? data : data?.data || data?.rows || [];
    } catch (error) {
        console.error("Error loading families:", error);
        families = [];
        if (container) container.innerHTML = `<div class="card" style="background:#fff1f1">فشل تحميل العائلات</div>`;
        return;
    }

    renderFamilies();
    await hydrateFamilyStatsIfMissing();
}

async function createFamily() {
    const first = document.getElementById("fatherFirstName")?.value?.trim() || "";
    const last = document.getElementById("fatherLastName")?.value?.trim() || "";
    const phone = document.getElementById("familyPhone")?.value?.trim() || "";
    const peopleCount = Number(document.getElementById("familyPeopleCount")?.value);
    const villageId = document.getElementById("familyVillage")?.value || "";
    const fileNumber = document.getElementById("familyFileNumber")?.value?.trim() || null;
    const isFormFilled = document.getElementById("familyFormFilled")?.checked ?? false;
    const municipalityRegistered = document.getElementById("familyMunicipalityRegistered")?.checked ?? false;
    const housingType = document.getElementById("familyHousingType")?.value || null;
    const isBlocked = document.getElementById("familyIsBlocked")?.checked ?? false;

    if (!first) return alert("أدخل اسم الأب");
    if (!last) return alert("أدخل كنية الأب");
    if (!villageId) return alert("اختر القرية");
    if (!peopleCount || peopleCount <= 0) return alert("أدخل عدد أفراد صحيح");

    try {
        await api.createFamily({
            father_first_name: first,
            father_last_name: last,
            phone_number: phone || null,
            people_count: peopleCount,
            village_id: Number(villageId),
            file_number: fileNumber,
            is_form_filled: isFormFilled,
            municipality_registered: municipalityRegistered,
            housing_type: housingType,
            is_blocked: isBlocked,
        });

        document.getElementById("fatherFirstName").value = "";
        document.getElementById("fatherLastName").value = "";
        document.getElementById("familyPhone").value = "";
        document.getElementById("familyPeopleCount").value = "";
        document.getElementById("familyVillage").value = "";
        const fileNumberEl = document.getElementById("familyFileNumber");
        if (fileNumberEl) fileNumberEl.value = "";
        const formFilledEl = document.getElementById("familyFormFilled");
        if (formFilledEl) formFilledEl.checked = false;
        const muniEl = document.getElementById("familyMunicipalityRegistered");
        if (muniEl) muniEl.checked = false;
        const housingTypeEl = document.getElementById("familyHousingType");
        if (housingTypeEl) housingTypeEl.value = "";
        const isBlockedEl = document.getElementById("familyIsBlocked");
        if (isBlockedEl) isBlockedEl.checked = false;

        await refreshFamilies({ silent: true });
    } catch (error) {
        console.error(error);
        alert("فشل حفظ العائلة");
    }
}

async function deleteFamily(familyId) {
    const id = Number(familyId);
    if (!id) return;

    const family = (families || []).find((row) => Number(row.id) === id);
    const name = family ? getFamilyDisplayName(family) : `#${id}`;
    if (!confirm(`حذف العائلة "${name}"؟ سيتم حذف جميع التوزيعات والعلاقات المرتبطة بها.`)) return;

    try {
        await api.deleteFamily(id);
        families = (families || []).filter((row) => Number(row.id) !== id);
        delete familyStatsCache[String(id)];
        delete familyDistributionsCache[String(id)];
        delete familyRelationsCache[String(id)];
        renderFamilies();
    } catch (error) {
        console.error(error);
        alert("فشل حذف العائلة");
    }
}

async function ensureFamiliesLoaded() {
    if (familiesLoadedOnce) return;
    familiesLoadedOnce = true;
    await refreshFamilies({ silent: true });
}

function setFamiliesImportResult(msg, type = "info") {
    const el = document.getElementById("familiesImportResult");
    if (!el) return;
    el.textContent = msg;
    el.className = `needs-import-result${type === "error" ? " error" : type === "success" ? " success" : ""}`;
    el.classList.remove("hidden");
}

function openFamiliesExcelImportModal() {
    const result = document.getElementById("familiesImportResult");
    if (result) { result.textContent = ""; result.classList.add("hidden"); }
    const input = document.getElementById("familiesExcelFile");
    if (input) input.value = "";
    document.getElementById("familiesExcelImportModal")?.classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeFamiliesExcelImportModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("familiesExcelImportModal")?.classList.remove("active");
    document.body.style.overflow = "";
}

async function importFamiliesExcel() {
    try {
        const input = document.getElementById("familiesExcelFile");
        const file = input?.files?.[0];
        if (!file) return setFamiliesImportResult("اختر ملف Excel أولًا", "error");
        if (!window.XLSX) return setFamiliesImportResult("مكتبة قراءة Excel غير متوفرة", "error");

        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (!rows.length) return setFamiliesImportResult("الملف فارغ أو لا يحتوي على بيانات", "error");

        const headers = Object.keys(rows[0]);
        const normalizedHeaders = headers.map(normalizeHeader);

        const requiredHeaders = ["first_name", "last_name", "village"];
        const missingHeaders = requiredHeaders.filter((h) => !normalizedHeaders.includes(h));
        if (missingHeaders.length) {
            return setFamiliesImportResult(`الأعمدة الأساسية مفقودة: ${missingHeaders.join(", ")}`, "error");
        }

        const headerMap = Object.fromEntries(headers.map((h) => [normalizeHeader(h), h]));
        const coreHeaders = new Set(["first_name", "last_name", "phone_number", "village", "people_count", "notes", "distribution_type"]);
        const itemHeaders = headers.filter((h) => !coreHeaders.has(normalizeHeader(h)));

        const villageMap = new Map((villages || []).map((v) => [v.name.trim().toLowerCase(), v]));
        const inventoryMap = new Map((inventory || []).map((item) => [item.name.trim().toLowerCase(), item]));

        const validatedRows = [];
        const errors = [];

        rows.forEach((row, idx) => {
            const firstName = String(row[headerMap.first_name] ?? "").trim();
            const lastName = String(row[headerMap.last_name] ?? "").trim();
            const phone = String(row[headerMap.phone_number] ?? "").trim();
            const villageName = String(row[headerMap.village] ?? "").trim();
            const peopleRaw = row[headerMap.people_count];
            const people = String(peopleRaw ?? "").trim() === "" ? 1 : Number(peopleRaw);
            const notes = String(row[headerMap.notes] ?? "").trim();
            const distType = normalizeDistributionType(row[headerMap.distribution_type] ?? "local");

            if (!firstName || !lastName) {
                errors.push(`السطر ${idx + 2}: الاسم والكنية مطلوبان`);
                return;
            }
            if (!Number.isFinite(people) || people <= 0) {
                errors.push(`السطر ${idx + 2}: عدد الأفراد يجب أن يكون رقمًا أكبر من صفر`);
                return;
            }

            const village = villageMap.get(villageName.toLowerCase());
            if (!village) {
                errors.push(`السطر ${idx + 2}: القرية غير موجودة (${villageName})`);
                return;
            }

            const items = [];
            let itemError = false;
            for (const header of itemHeaders) {
                const qty = Number(row[header]);
                if (!qty || qty <= 0) continue;
                const item = inventoryMap.get(String(header).trim().toLowerCase());
                if (!item) {
                    errors.push(`السطر ${idx + 2}: المادة غير موجودة في المخزون (${header})`);
                    itemError = true;
                    break;
                }
                items.push({ item_id: item.id, quantity: qty });
            }
            if (itemError) return;

            validatedRows.push({ firstName, lastName, phone, village, people, notes, distType, items });
        });

        if (errors.length) return setFamiliesImportResult(errors.slice(0, 8).join(" | "), "error");

        setFamiliesImportResult(`جارٍ الاستيراد (0 / ${validatedRows.length})...`, "info");

        let done = 0;
        let failed = 0;
        for (const r of validatedRows) {
            try {
                const created = await api.createFamily({
                    father_first_name: r.firstName,
                    father_last_name: r.lastName,
                    phone_number: r.phone || null,
                    people_count: r.people,
                    village_id: Number(r.village.id),
                });
                const familyId = created?.id ?? created?.data?.[0]?.id;
                if (familyId && r.items.length) {
                    const distPayload = { type: r.distType, items: r.items };
                    if (r.notes) distPayload.notes = r.notes;
                    await api.createFamilyDistribution(familyId, distPayload);
                }
                done++;
            } catch (e) {
                console.error("Row import failed:", e);
                failed++;
            }
            setFamiliesImportResult(`جارٍ الاستيراد (${done + failed} / ${validatedRows.length})...`, "info");
        }

        if (input) input.value = "";
        const msg = failed
            ? `تم استيراد ${done} عائلة بنجاح، فشل ${failed}`
            : `تم استيراد ${done} عائلة بنجاح`;
        setFamiliesImportResult(msg, failed ? "error" : "success");
        await refreshFamilies({ silent: true });
    } catch (err) {
        console.error("Error importing families Excel:", err);
        setFamiliesImportResult(err.message || "فشل استيراد ملف Excel", "error");
    }
}

async function exportFamiliesExcel() {
    const btn = document.getElementById("exportFamiliesBtn");
    const allFiltered = getFilteredFamilies();
    if (!allFiltered.length) return alert("لا توجد عائلات للتصدير");
    const offset = (familiesPage - 1) * FAMILIES_PAGE_SIZE;
    const filtered = allFiltered.slice(offset, offset + FAMILIES_PAGE_SIZE);

    if (btn) { btn.disabled = true; btn.textContent = "جارٍ التصدير..."; }

    try {
        // Fetch distributions for families not yet cached
        await Promise.all(filtered.map(async (f) => {
            const key = String(f.id);
            if (!familyDistributionsCache[key]) {
                try {
                    const data = await api.getFamilyDistributions(f.id);
                    familyDistributionsCache[key] = Array.isArray(data) ? data : data?.data || [];
                } catch (_) {
                    familyDistributionsCache[key] = [];
                }
            }
        }));

        // Collect all unique item names across all distributions
        const allItemNames = new Set();
        filtered.forEach((f) => {
            (familyDistributionsCache[String(f.id)] || []).forEach((dist) => {
                (dist.items || []).forEach((item) => {
                    if (item.item_name) allItemNames.add(item.item_name);
                });
            });
        });
        const itemNames = Array.from(allItemNames).sort((a, b) => a.localeCompare(b, "ar"));

        const header = [
            "رقم الملف", "الاسم", "الكنية", "رقم الهاتف",
            "القرية", "عدد الأفراد", "نوع التوزيع",
            ...itemNames,
        ];

        const dataRows = filtered.map((f) => {
            const dists = familyDistributionsCache[String(f.id)] || [];

            // Aggregate item totals
            const itemTotals = {};
            dists.forEach((dist) => {
                (dist.items || []).forEach((item) => {
                    if (item.item_name) {
                        itemTotals[item.item_name] = (itemTotals[item.item_name] || 0) + (item.quantity || 0);
                    }
                });
            });

            // Most recent distribution type
            const lastType = dists.length ? getDistributionTypeLabel(dists[0].type) : "";

            return [
                f.file_number ?? f.fileNumber ?? "",
                f.father_first_name ?? f.fatherFirstName ?? "",
                f.father_last_name ?? f.fatherLastName ?? "",
                f.phone_number ?? f.phoneNumber ?? "",
                getVillageNameById(f.village_id ?? f.villageId ?? ""),
                f.people_count ?? f.peopleCount ?? "",
                lastType,
                ...itemNames.map((name) => itemTotals[name] || 0),
            ];
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
        ws["!views"] = [{ rightToLeft: true }];

        const colWidths = header.map((_, ci) => {
            const vals = [header[ci], ...dataRows.map((r) => r[ci])];
            const max = Math.max(...vals.map((v) => String(v ?? "").length));
            return { wch: Math.max(max + 2, 10) };
        });
        ws["!cols"] = colWidths;

        // Bold header row
        const range = XLSX.utils.decode_range(ws["!ref"]);
        for (let C = range.s.c; C <= range.e.c; C++) {
            const cell = XLSX.utils.encode_cell({ r: 0, c: C });
            if (ws[cell]) ws[cell].s = { font: { bold: true } };
        }

        XLSX.utils.book_append_sheet(wb, ws, "العائلات");
        XLSX.writeFile(wb, `عائلات_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
        console.error("Export failed:", err);
        alert("فشل التصدير");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "تصدير Excel"; }
    }
}

window.sortFamiliesBy = sortFamiliesBy;
window.goToFamiliesPage = goToFamiliesPage;
window.createFamily = createFamily;
window.applyFamilyFilters = applyFamilyFilters;
window.clearFamilyFilters = clearFamilyFilters;
window.refreshFamilies = refreshFamilies;
window.ensureFamiliesLoaded = ensureFamiliesLoaded;
window.openDistributionModal = openDistributionModal;
window.closeDistributionModal = closeDistributionModal;
window.addDistributionItem = addDistributionItem;
window.removeDistributionItem = removeDistributionItem;
window.submitDistribution = submitDistribution;
window.deleteDistribution = deleteDistribution;
window.openDistributionsHistoryModal = openDistributionsHistoryModal;
window.closeDistributionsHistoryModal = closeDistributionsHistoryModal;
window.exportFamiliesExcel = exportFamiliesExcel;
window.openFamiliesExcelImportModal = openFamiliesExcelImportModal;
window.closeFamiliesExcelImportModal = closeFamiliesExcelImportModal;
window.importFamiliesExcel = importFamiliesExcel;
window.openFamilyEditModal = openFamilyEditModal;
window.closeFamilyEditModal = closeFamilyEditModal;
window.submitFamilyEdit = submitFamilyEdit;
window.openFamilyRelationsModal = openFamilyRelationsModal;
window.closeFamilyRelationsModal = closeFamilyRelationsModal;
window.submitFamilyRelation = submitFamilyRelation;
window.deleteFamilyRelation = deleteFamilyRelation;
window.filterRelationFamilies = filterRelationFamilies;
window.toggleCustomRelationType = toggleCustomRelationType;
window.deleteFamily = deleteFamily;
