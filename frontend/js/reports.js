let _lastReportData = null;

async function generateRangeReport() {
    const reportFrom = document.getElementById("reportFrom").value;
    const reportTo = document.getElementById("reportTo").value;

    if (!reportFrom || !reportTo) return alert("اختر تاريخ البداية والنهاية");
    if (reportFrom > reportTo) return alert("يجب أن يكون تاريخ البداية قبل أو يساوي تاريخ النهاية");

    document.getElementById("downloadExcelBtn")?.classList.add("hidden");
    document.getElementById("includeAllFamiliesLabel")?.classList.add("hidden");
    _lastReportData = null;

    try {
        const rows = await api.getDistributionsDetail(reportFrom, reportTo);
        const distributions = Array.isArray(rows) ? rows : [];
        if (!distributions.length) {
            document.getElementById("reportContainer").innerHTML = renderEmptyState("لا توجد توزيعات ضمن هذه الفترة");
            return;
        }

        // Aggregate by village → item → total qty
        const reportData = {};
        const itemSet = new Set();
        distributions.forEach((dist) => {
            const village = dist.village || "غير محدد";
            if (!reportData[village]) reportData[village] = {};
            (Array.isArray(dist.items) ? dist.items : []).forEach((line) => {
                const name = String(line.item_name || "").trim();
                if (!name) return;
                itemSet.add(name);
                reportData[village][name] = (reportData[village][name] || 0) + Number(line.quantity || 0);
            });
        });

        const sortedItems = Array.from(itemSet).sort((a, b) => a.localeCompare(b, "ar"));
        const itemTotals = Object.fromEntries(sortedItems.map((item) => [item, 0]));

        let rowsHtml = "";
        Object.keys(reportData).sort((a, b) => a.localeCompare(b, "ar")).forEach((village) => {
            rowsHtml += `<tr><td><button class="village-link-btn" type="button" data-village="${escapeHtml(village)}" onclick="openVillageDistDetailDialog(this.dataset.village)">${escapeHtml(village)}</button></td>`;
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
                <div class="dt-wrap">
                    <table class="table table-hover table-sm align-middle">
                        <thead>
                            <tr>
                                <th>القرية</th>
                                ${sortedItems.map((itemName) => `<th class="text-center">${escapeHtml(itemName)}</th>`).join("")}
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </div>`;

        _lastReportData = { reportData, sortedItems, itemTotals, rangeLabel, reportFrom, reportTo, distributions };
        document.getElementById("downloadExcelBtn")?.classList.remove("hidden");
        document.getElementById("includeAllFamiliesLabel")?.classList.remove("hidden");
    } catch (err) {
        console.error("Error generating report:", err);
        document.getElementById("reportContainer").innerHTML = `<div class="card" style="background:#fff1f1">فشل إنشاء التقرير</div>`;
    }
}

function closeDistDetailModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("distDetailModal")?.classList.remove("active");
    document.body.style.overflow = "";
}

async function openVillageDistDetailDialog(villageName) {
    if (!_lastReportData) return;
    const { reportFrom, reportTo } = _lastReportData;

    const modal = document.getElementById("distDetailModal");
    const title = document.getElementById("distDetailModalTitle");
    const content = document.getElementById("distDetailContent");
    if (!modal || !content) return;

    if (title) title.textContent = `توزيعات قرية ${villageName} (${reportFrom} → ${reportTo})`;
    content.innerHTML = `<div class="card">جارٍ تحميل التوزيعات...</div>`;
    modal.classList.add("active");
    document.body.style.overflow = "hidden";

    try {
        const distributions = (_lastReportData.distributions || []).filter(
            (d) => (d.village || "غير محدد") === villageName,
        );

        if (!distributions.length) {
            content.innerHTML = renderEmptyState("لا توجد توزيعات لهذه القرية في هذه الفترة.");
            return;
        }

        const itemNames = Array.from(
            new Set(
                distributions.flatMap((d) => (Array.isArray(d.items) ? d.items : [])
                    .map((line) => String(line.item_name || "").trim())
                    .filter(Boolean),
                ),
            ),
        ).sort((a, b) => a.localeCompare(b, "ar"));

        const itemTotals = Object.fromEntries(itemNames.map((n) => [n, 0]));

        const linesHtml = distributions.map((dist) => {
            const rowMap = Object.fromEntries(itemNames.map((n) => [n, 0]));
            (Array.isArray(dist.items) ? dist.items : []).forEach((line) => {
                const n = String(line.item_name || "").trim();
                if (!n) return;
                const qty = Number(line.quantity || 0);
                rowMap[n] = (rowMap[n] || 0) + qty;
                itemTotals[n] = (itemTotals[n] || 0) + qty;
            });
            const itemCells = itemNames.map((n) => `<td style="text-align:center;">${rowMap[n] || 0}</td>`).join("");
            return `
                <tr>
                    <td class="needs-date-cell">${escapeHtml(dist.distributed_at ? formatDate(dist.distributed_at) : "-")}</td>
                    <td>${escapeHtml(dist.family_name || "-")}</td>
                    ${itemCells}
                </tr>`;
        }).join("");

        const totalsCells = itemNames.map((n) => `<td style="text-align:center;font-weight:800;">${itemTotals[n] || 0}</td>`).join("");

        content.innerHTML = `
            <div class="card">
                <div class="dt-wrap">
                    <table class="table table-hover table-sm align-middle">
                        <thead>
                            <tr>
                                <th>التاريخ</th>
                                <th>العائلة</th>
                                ${itemNames.map((n) => `<th class="text-center">${escapeHtml(n)}</th>`).join("")}
                            </tr>
                        </thead>
                        <tbody>${linesHtml}</tbody>
                        <tfoot>
                            <tr class="dt-tfoot-total">
                                <td>المجموع</td>
                                <td></td>
                                ${totalsCells}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>`;
    } catch (error) {
        console.error("Error loading village distribution detail:", error);
        content.innerHTML = `<div class="card" style="background:#fff1f1">فشل تحميل التوزيعات</div>`;
    }
}

async function openDistributionDetailDialog() {
    if (!_lastReportData) return;

    const { reportFrom, reportTo } = _lastReportData;
    const modal = document.getElementById("distDetailModal");
    const title = document.getElementById("distDetailModalTitle");
    const content = document.getElementById("distDetailContent");
    if (!modal || !content) return;

    if (title) title.textContent = `تفاصيل التوزيعات (${reportFrom} → ${reportTo})`;
    content.innerHTML = `<div class="card">جارٍ تحميل تفاصيل التوزيعات...</div>`;
    modal.classList.add("active");
    document.body.style.overflow = "hidden";

    try {
        const rows = await api.getDistributionsDetail(reportFrom, reportTo);
        const distributions = Array.isArray(rows) ? rows : [];
        if (!distributions.length) {
            content.innerHTML = renderEmptyState("لا توجد توزيعات ضمن هذه الفترة.");
            return;
        }

        const itemNames = Array.from(
            new Set(
                distributions.flatMap((dist) => (Array.isArray(dist.items) ? dist.items : [])
                    .map((line) => String(line.item_name || "").trim())
                    .filter(Boolean),
                ),
            ),
        ).sort((a, b) => a.localeCompare(b, "ar"));

        const itemTotals = Object.fromEntries(itemNames.map((name) => [name, 0]));
        let grandTotal = 0;

        const linesHtml = distributions.map((dist) => {
            const rowMap = {};
            itemNames.forEach((name) => { rowMap[name] = 0; });

            (Array.isArray(dist.items) ? dist.items : []).forEach((line) => {
                const itemName = String(line.item_name || "").trim();
                if (!itemName) return;
                const qty = Number(line.quantity || 0);
                rowMap[itemName] = (rowMap[itemName] || 0) + qty;
                itemTotals[itemName] = (itemTotals[itemName] || 0) + qty;
                grandTotal += qty;
            });

            const itemCells = itemNames
                .map((name) => `<td style="text-align:center;">${rowMap[name] || 0}</td>`)
                .join("");

            return `
            <tr>
                <td class="needs-date-cell">${escapeHtml(dist.distributed_at ? formatDate(dist.distributed_at) : "-")}</td>
                <td>${escapeHtml(dist.family_name || "-")}</td>
                <td>${escapeHtml(dist.village || "-")}</td>
                ${itemCells}
            </tr>
        `;
        }).join("");

        const totalsCells = itemNames
            .map((name) => `<td style="text-align:center;">${itemTotals[name] || 0}</td>`)
            .join("");

        content.innerHTML = `
            <div class="card">
                <div class="dt-wrap">
                    <table class="table table-hover table-sm align-middle">
                        <thead>
                            <tr>
                                <th>الوقت</th>
                                <th>العائلة</th>
                                <th>القرية</th>
                                ${itemNames.map((name) => `<th class="text-center">${escapeHtml(name)}</th>`).join("")}
                            </tr>
                        </thead>
                        <tbody>${linesHtml}</tbody>
                        <tfoot>
                            <tr class="dt-tfoot-total">
                                <td>المجموع</td>
                                <td></td>
                                <td></td>
                                ${totalsCells}
                            </tr>
                            <tr style="background:#f8fbff;font-weight:800;">
                                <td colspan="${3 + itemNames.length}" class="text-center">المجموع الكلي لكل الكميات: ${grandTotal}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        console.error("Error loading distribution detail:", error);
        content.innerHTML = `<div class="card" style="background:#fff1f1">فشل تحميل تفاصيل التوزيعات</div>`;
    }
}

function closeInvLogsModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("invLogsModal")?.classList.remove("active");
    document.body.style.overflow = "";
}

async function openInvLogsModal(itemId = "", itemName = "") {
    const modal = document.getElementById("invLogsModal");
    const title = document.getElementById("invLogsModalTitle");
    const content = document.getElementById("invLogsContent");
    if (!modal || !content) return;

    const label = String(itemName || "").trim();
    if (title) title.textContent = label ? `سجل حركة المخزون: ${label}` : "سجل حركة المخزون";

    content.innerHTML = `<div class="card">جارٍ تحميل السجل...</div>`;
    modal.classList.add("active");
    document.body.style.overflow = "hidden";

    try {
        const rows = await api.getInventoryLogs(itemId || "");
        const logs = Array.isArray(rows) ? rows : [];
        if (!logs.length) {
            content.innerHTML = renderEmptyState("لا توجد حركات مخزون.");
            return;
        }

        let totalIn = 0;
        let totalOut = 0;
        const linesHtml = logs.map((row) => {
            const delta = Number(row.delta || 0);
            if (delta >= 0) totalIn += delta;
            else totalOut += Math.abs(delta);
            const deltaColor = delta >= 0 ? "#166534" : "#b91c1c";
            return `
                <tr>
                    <td class="needs-date-cell">${escapeHtml(row.created_at ? formatDate(row.created_at) : "-")}</td>
                    <td>${escapeHtml(row.item_name || "-")}</td>
                    <td style="text-align:center;color:${deltaColor};font-weight:700;">${delta >= 0 ? "+" : ""}${delta}</td>
                    <td style="text-align:center;">${row.quantity_before ?? "-"}</td>
                    <td style="text-align:center;">${row.quantity_after ?? "-"}</td>
                    <td>${escapeHtml(row.reason || "-")}</td>
                    <td>${escapeHtml(row.reference_label || "-")}</td>
                </tr>
            `;
        }).join("");

        content.innerHTML = `
            <div class="card">
                <div class="dt-wrap">
                    <table class="table table-hover table-sm align-middle">
                        <thead>
                            <tr>
                                <th>الوقت</th>
                                <th>المادة</th>
                                <th class="text-center">التغير</th>
                                <th class="text-center">قبل</th>
                                <th class="text-center">بعد</th>
                                <th>السبب</th>
                                <th>مرجع</th>
                            </tr>
                        </thead>
                        <tbody>${linesHtml}</tbody>
                        <tfoot>
                            <tr class="dt-tfoot-total">
                                <td colspan="2">الإجماليات</td>
                                <td class="text-center">+${totalIn} / -${totalOut}</td>
                                <td colspan="4"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        console.error("Error loading inventory logs:", error);
        content.innerHTML = `<div class="card" style="background:#fff1f1">فشل تحميل سجل حركة المخزون</div>`;
    }
}

function downloadReportAsExcel() {
    if (!_lastReportData) return;
    const { sortedItems, reportFrom, reportTo, distributions } = _lastReportData;

    const includeAll = document.getElementById("includeAllFamiliesChk")?.checked ?? false;

    // Aggregate distributions per family
    const familyDataById = {};
    distributions.forEach((dist) => {
        const key = String(dist.family_id ?? dist.family_name);
        if (!familyDataById[key]) {
            familyDataById[key] = { id: dist.family_id, name: dist.family_name, village: dist.village, items: {} };
        }
        (dist.items || []).forEach((line) => {
            const name = String(line.item_name || "").trim();
            if (!name) return;
            familyDataById[key].items[name] = (familyDataById[key].items[name] || 0) + Number(line.quantity || 0);
        });
    });

    let rows;
    if (includeAll && typeof families !== "undefined" && Array.isArray(families) && families.length) {
        rows = families.map((family) => {
            const id = String(family.id);
            const name = getFamilyDisplayName(family);
            const village = getVillageNameById(String(family.village_id ?? ""));
            const famData = familyDataById[id] || { items: {} };
            return { name, village, items: famData.items };
        });
    } else {
        rows = Object.values(familyDataById).map((d) => ({ name: d.name, village: d.village, items: d.items }));
    }

    rows.sort((a, b) => a.name.localeCompare(b.name, "ar"));

    const headerRow = ["العائلة", "القرية", ...sortedItems];
    const dataRows = rows.map((row) => [row.name, row.village, ...sortedItems.map((item) => row.items[item] || 0)]);
    const totalsRow = ["المجموع", "", ...sortedItems.map((item) => rows.reduce((sum, row) => sum + (row.items[item] || 0), 0))];

    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows, totalsRow]);
    ws["!views"] = [{ rightToLeft: true }];
    ws["!cols"] = headerRow.map((_, ci) => {
        const vals = [headerRow[ci], ...dataRows.map((r) => r[ci]), totalsRow[ci]];
        return { wch: Math.max(...vals.map((v) => String(v ?? "").length)) + 2 };
    });

    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let C = range.s.c; C <= range.e.c; C++) {
        const hCell = XLSX.utils.encode_cell({ r: 0, c: C });
        const tCell = XLSX.utils.encode_cell({ r: range.e.r, c: C });
        if (ws[hCell]) ws[hCell].s = { font: { bold: true }, alignment: { horizontal: "center", readingOrder: 2 } };
        if (ws[tCell]) ws[tCell].s = { font: { bold: true }, alignment: { horizontal: "center", readingOrder: 2 } };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "التقرير");

    const fileName = reportFrom === reportTo
        ? `تقرير_${reportFrom}.xlsx`
        : `تقرير_${reportFrom}_${reportTo}.xlsx`;

    XLSX.writeFile(wb, fileName);
}

let _lastFamilyReportData = null;
let _familyDistItemTotalsByFamily = {};
let _familyDistItemNames = [];
let _familyDistFamiliesSnapshot = [];
let _lastFamilyGapReportData = null;

async function loadFamilyDistributionItemTotals(familyList = []) {
    _familyDistItemTotalsByFamily = {};
    _familyDistItemNames = [];
    _familyDistFamiliesSnapshot = Array.isArray(familyList) ? familyList.slice() : [];

    const stockItemNames = new Set((inventory || []).map((item) => String(item.name || "").trim()).filter(Boolean));
    const allItemNames = new Set(stockItemNames);
    const CHUNK = 8;

    for (let i = 0; i < _familyDistFamiliesSnapshot.length; i += CHUNK) {
        const chunk = _familyDistFamiliesSnapshot.slice(i, i + CHUNK);
        await Promise.all(chunk.map(async (family) => {
            const familyId = Number(family.id);
            if (!familyId) return;
            const key = String(familyId);
            const totals = {};
            try {
                const rows = await api.getFamilyDistributions(familyId);
                const distributions = Array.isArray(rows) ? rows : [];
                distributions.forEach((dist) => {
                    (Array.isArray(dist.items) ? dist.items : []).forEach((line) => {
                        const itemName = String(line.item_name || "").trim();
                        if (!itemName) return;
                        if (!stockItemNames.has(itemName)) return;
                        const qty = Number(line.quantity || 0);
                        totals[itemName] = (totals[itemName] || 0) + qty;
                    });
                });
            } catch (error) {
                console.warn("Failed to load family distributions for report:", familyId, error?.message || error);
            }
            _familyDistItemTotalsByFamily[key] = totals;
        }));
    }

    _familyDistItemNames = Array.from(allItemNames).sort((a, b) => a.localeCompare(b, "ar"));
}

async function renderFamilyDistributionGapReport() {
    const container = document.getElementById("familyGapResults");
    if (!container) return;

    const itemValue = String(document.getElementById("familyGapItem")?.value || "");
    const minQtyRaw = Number(document.getElementById("familyGapMinQty")?.value);
    const minQty = Number.isFinite(minQtyRaw) && minQtyRaw >= 0 ? minQtyRaw : 2;
    const downloadBtn = document.getElementById("downloadFamilyGapBtn");
    if (downloadBtn) downloadBtn.classList.add("hidden");

    if (!itemValue) {
        container.innerHTML = renderEmptyState("اختر المادة أولاً ثم اضغط عرض.");
        return;
    }

    container.innerHTML = `<div class="card">جارٍ تحميل نتائج التوزيعات...</div>`;
    await loadFamilyDistributionItemTotals(_familyDistFamiliesSnapshot);

    const rows = [];
    let peopleTotal = 0;
    let familiesTotal = 0;

    _familyDistFamiliesSnapshot.forEach((family) => {
        const familyId = String(family.id);
        const map = _familyDistItemTotalsByFamily[familyId] || {};
        const itemQty = Number(map[itemValue] || 0);
        const allQty = Object.values(map).reduce((sum, val) => sum + Number(val || 0), 0);
        const peopleCount = Number(family.people_count ?? 1) || 1;

        let include = false;
        if (itemValue === "__any__") {
            include = allQty <= 0;
        } else {
            include = itemQty < minQty;
        }
        if (!include) return;

        familiesTotal += 1;
        peopleTotal += peopleCount;
        rows.push({
            name: getFamilyDisplayName(family),
            phone: String(family.phone_number ?? family.phoneNumber ?? "-"),
            village: getVillageNameById(String(family.village_id ?? "")),
            people: peopleCount,
            qty: itemValue === "__any__" ? allQty : itemQty,
        });
    });

    rows.sort((a, b) => (a.qty - b.qty) || a.name.localeCompare(b.name, "ar"));

    if (!rows.length) {
        container.innerHTML = renderEmptyState("لا توجد عائلات مطابقة لهذا الشرط.");
        return;
    }

    const itemLabel = itemValue === "__any__" ? "أي توزيع" : itemValue;
    const bodyHtml = rows.map((row) => `
        <tr>
            <td>${escapeHtml(row.name)}</td>
            <td>${escapeHtml(row.phone || "-")}</td>
            <td>${escapeHtml(row.village)}</td>
            <td style="text-align:center;">${row.people}</td>
            <td style="text-align:center;">${row.qty}</td>
        </tr>
    `).join("");

    container.innerHTML = `
        <div class="card" style="margin-top:0.75rem;">
            <div style="margin-bottom:0.6rem;color:var(--muted);font-weight:700;">
                العائلات المطابقة: ${familiesTotal} • مجموع الأفراد: ${peopleTotal}
            </div>
            <div class="dt-wrap">
                <table class="table table-hover table-sm align-middle">
                    <thead>
                        <tr>
                            <th>اسم العائلة</th>
                            <th>رقم الهاتف</th>
                            <th>القرية</th>
                            <th class="text-center">عدد الأفراد</th>
                            <th class="text-center">المستلم من ${escapeHtml(itemLabel)}</th>
                        </tr>
                    </thead>
                    <tbody>${bodyHtml}</tbody>
                    <tfoot>
                        <tr class="dt-tfoot-total">
                            <td>المجموع</td>
                            <td></td>
                            <td class="text-center">${peopleTotal}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;

    _lastFamilyGapReportData = { rows, itemLabel, minQty, familiesTotal, peopleTotal };
    if (downloadBtn) downloadBtn.classList.remove("hidden");
}

function downloadFamilyGapExcel() {
    if (!_lastFamilyGapReportData || !window.XLSX) return;
    const { rows, itemLabel, minQty } = _lastFamilyGapReportData;

    const header = ["اسم العائلة", "رقم الهاتف", "القرية", "عدد الأفراد", `المستلم من ${itemLabel}`];
    const dataRows = rows.map((r) => [r.name, r.phone || "-", r.village, r.people, r.qty]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
    ws["!views"] = [{ rightToLeft: true }];
    ws["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 18 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "فجوة التوزيعات");
    XLSX.writeFile(wb, `فجوة_التوزيع_${itemLabel}_${minQty}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function generateFamilyReport() {
    const container = document.getElementById("familyReportContainer");
    const downloadBtn = document.getElementById("downloadFamilyReportBtn");
    _lastFamilyReportData = null;
    if (downloadBtn) downloadBtn.classList.add("hidden");

    // Fetch stock items only when the report is explicitly requested.
    try {
        const stockRows = await api.getInventory();
        inventory = Array.isArray(stockRows) ? stockRows : [];
    } catch (error) {
        console.warn("Could not refresh stock items for family report:", error?.message || error);
        inventory = Array.isArray(inventory) ? inventory : [];
    }

    if (typeof ensureFamiliesLoaded === "function") await ensureFamiliesLoaded();

    const all = families || [];
    if (!all.length) {
        if (container) container.innerHTML = renderEmptyState("لا توجد بيانات عائلات محملة.");
        return;
    }

    const pct = (n, d) => d ? Math.round((n / d) * 100) : 0;
    const hasFile = (f) => String(f.file_number ?? "").trim().length > 0;
    const hasFilled = (f) => Boolean(f.is_form_filled ?? false);
    const isMuni = (f) => Boolean(f.municipality_registered ?? false);
    const distCount = (f) => Number(f.distribution_count ?? familyStatsCache?.[String(f.id)]?.count ?? 0);

    const byVillage = {};
    all.forEach((f) => {
        const vid = String(f.village_id ?? "");
        if (!byVillage[vid]) byVillage[vid] = [];
        byVillage[vid].push(f);
    });

    const rows = Object.entries(byVillage)
        .map(([vid, fams]) => ({
            village: getVillageNameById(vid),
            count: fams.length,
            people: fams.reduce((s, f) => s + Number(f.people_count ?? 1), 0),
            filled: fams.filter(hasFilled).length,
            fileNo: fams.filter(hasFile).length,
            muni: fams.filter(isMuni).length,
            withDist: fams.filter((f) => distCount(f) > 0).length,
        }))
        .sort((a, b) => a.village.localeCompare(b.village, "ar"));

    const totals = rows.reduce(
        (acc, r) => ({
            count: acc.count + r.count,
            people: acc.people + r.people,
            filled: acc.filled + r.filled,
            fileNo: acc.fileNo + r.fileNo,
            muni: acc.muni + r.muni,
            withDist: acc.withDist + r.withDist,
        }),
        { count: 0, people: 0, filled: 0, fileNo: 0, muni: 0, withDist: 0 },
    );

    _lastFamilyReportData = { rows, totals };

    const rowsHtml = rows.map((r) => `
        <tr>
            <td>${escapeHtml(r.village)}</td>
            <td style="text-align:center;">${r.count}</td>
            <td style="text-align:center;">${r.people}</td>
            <td style="text-align:center;">${r.people ? (r.people / r.count).toFixed(1) : 0}</td>
            <td style="text-align:center;">${r.filled} (${pct(r.filled, r.count)}%)</td>
            <td style="text-align:center;">${r.muni} (${pct(r.muni, r.count)}%)</td>
            <td style="text-align:center;">${r.fileNo} (${pct(r.fileNo, r.count)}%)</td>
            <td style="text-align:center;">${r.withDist} (${pct(r.withDist, r.count)}%)</td>
        </tr>`).join("");

    const totRow = `
        <tr style="background:#f4f8fe;font-weight:800;">
            <td>المجموع</td>
            <td style="text-align:center;">${totals.count}</td>
            <td style="text-align:center;">${totals.people}</td>
            <td style="text-align:center;">${totals.count ? (totals.people / totals.count).toFixed(1) : 0}</td>
            <td style="text-align:center;">${totals.filled} (${pct(totals.filled, totals.count)}%)</td>
            <td style="text-align:center;">${totals.muni} (${pct(totals.muni, totals.count)}%)</td>
            <td style="text-align:center;">${totals.fileNo} (${pct(totals.fileNo, totals.count)}%)</td>
            <td style="text-align:center;">${totals.withDist} (${pct(totals.withDist, totals.count)}%)</td>
        </tr>`;

    if (container) {
        container.innerHTML = `
            <div class="card" style="margin-top:1rem;">
                <div class="dt-wrap">
                    <table class="table table-hover table-sm align-middle">
                        <thead>
                            <tr>
                                <th>القرية</th>
                                <th class="text-center">عائلات</th>
                                <th class="text-center">أفراد</th>
                                <th class="text-center">متوسط</th>
                                <th class="text-center">استمارة</th>
                                <th class="text-center">بلدية</th>
                                <th class="text-center">رقم ملف</th>
                                <th class="text-center">تلقوا توزيع</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}${totRow}</tbody>
                    </table>
                </div>
            </div>
            <div class="card" style="margin-top:1rem;">
                <h4 style="margin-bottom:0.8rem;">العائلات التي لم تستلم أو استلمت أقل من حد معين</h4>
                <div class="form-grid" style="grid-template-columns: 1fr 160px auto;">
                    <select id="familyGapItem"></select>
                    <input id="familyGapMinQty" type="number" min="0" step="1" value="2" placeholder="الحد الأدنى">
                    <button class="done" type="button" onclick="renderFamilyDistributionGapReport()" style="min-height:50px;">عرض</button>
                </div>
                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem;">
                    <button id="downloadFamilyGapBtn" class="done hidden" type="button" style="background:#1d7044;" onclick="downloadFamilyGapExcel()">
                        <i class="bi bi-file-earmark-excel"></i> تحميل Excel
                    </button>
                </div>
                <small style="color:var(--muted);display:block;margin-top:0.4rem;">
                    مثال: لاختيار "planket" وحد أدنى 2 سيظهر من استلم أقل من 2 (بما فيهم 0).
                </small>
                <div id="familyGapResults" style="margin-top:0.6rem;">
                    <div class="card">اختر المادة والحد الأدنى ثم اضغط عرض.</div>
                </div>
            </div>`;
    }

    _familyDistFamiliesSnapshot = Array.isArray(all) ? all.slice() : [];
    _lastFamilyGapReportData = null;
    const gapSelect = document.getElementById("familyGapItem");
    if (gapSelect) {
        gapSelect.innerHTML = [
            `<option value="">اختر المادة</option>`,
            `<option value="__any__">لم يستلموا أي توزيع</option>`,
            ..._familyDistItemNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`),
        ].join("");
    }
    if (gapSelect && _familyDistItemNames.length === 0) {
        // Item list must come from stock items, not distribution history.
        const stockNames = (inventory || []).map((it) => String(it.name || "").trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, "ar"));
        gapSelect.innerHTML = [
            `<option value="">اختر المادة</option>`,
            `<option value="__any__">لم يستلموا أي توزيع</option>`,
            ...stockNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`),
        ].join("");
    } else if (gapSelect) {
        const stockNames = (inventory || []).map((it) => String(it.name || "").trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, "ar"));
        gapSelect.innerHTML = [
            `<option value="">اختر المادة</option>`,
            `<option value="__any__">لم يستلموا أي توزيع</option>`,
            ...stockNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`),
        ].join("");
    }

    if (downloadBtn) downloadBtn.classList.remove("hidden");
}

function downloadFamilyReportExcel() {
    if (!_lastFamilyReportData || !window.XLSX) return;
    const { rows, totals } = _lastFamilyReportData;
    const pct = (n, d) => d ? `${Math.round((n / d) * 100)}%` : "0%";

    const header = ["القرية", "عائلات", "أفراد", "متوسط أفراد", "استمارة", "نسبة الاستمارة", "بلدية", "نسبة البلدية", "رقم ملف", "نسبة رقم الملف", "تلقوا توزيع", "نسبة التوزيع"];
    const dataRows = rows.map((r) => [
        r.village, r.count, r.people,
        r.count ? +(r.people / r.count).toFixed(1) : 0,
        r.filled, pct(r.filled, r.count),
        r.muni, pct(r.muni, r.count),
        r.fileNo, pct(r.fileNo, r.count),
        r.withDist, pct(r.withDist, r.count),
    ]);
    const totRow = [
        "المجموع", totals.count, totals.people,
        totals.count ? +(totals.people / totals.count).toFixed(1) : 0,
        totals.filled, pct(totals.filled, totals.count),
        totals.muni, pct(totals.muni, totals.count),
        totals.fileNo, pct(totals.fileNo, totals.count),
        totals.withDist, pct(totals.withDist, totals.count),
    ];

    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows, totRow]);
    ws["!views"] = [{ rightToLeft: true }];
    ws["!cols"] = header.map((_, ci) => {
        const vals = [header[ci], ...dataRows.map((r) => r[ci]), totRow[ci]];
        return { wch: Math.max(...vals.map((v) => String(v ?? "").length)) + 3 };
    });

    const range = XLSX.utils.decode_range(ws["!ref"]);
    [0, range.e.r].forEach((ri) => {
        for (let C = range.s.c; C <= range.e.c; C++) {
            const cell = XLSX.utils.encode_cell({ r: ri, c: C });
            if (ws[cell]) ws[cell].s = { font: { bold: true } };
        }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقرير العائلات");
    XLSX.writeFile(wb, `تقرير_العائلات_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function setTodayDateFilters() {
    const today = getLocalDateString();
    document.getElementById("dateFrom").value = today;
    document.getElementById("dateTo").value = today;
    currentFilters = { name: "", village: "", status: "", saved: "", dateFrom: today, dateTo: today };
    loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.registered, currentFilters.dateFrom, currentFilters.dateTo);
}

window.openDistributionDetailDialog = openDistributionDetailDialog;
window.openVillageDistDetailDialog = openVillageDistDetailDialog;
window.closeDistDetailModal = closeDistDetailModal;
window.openInvLogsModal = openInvLogsModal;
window.closeInvLogsModal = closeInvLogsModal;
window.renderFamilyDistributionGapReport = renderFamilyDistributionGapReport;
window.downloadFamilyGapExcel = downloadFamilyGapExcel;

