let _lastReportData = null;

async function generateRangeReport() {
    const reportFrom = document.getElementById("reportFrom").value;
    const reportTo = document.getElementById("reportTo").value;

    if (!reportFrom || !reportTo) return alert("اختر تاريخ البداية والنهاية");
    if (reportFrom > reportTo) return alert("يجب أن يكون تاريخ البداية قبل أو يساوي تاريخ النهاية");

    document.getElementById("downloadExcelBtn").style.display = "none";
    _lastReportData = null;

    try {
        const report = await api.getRangeReport(reportFrom, reportTo);
        const reportData = report?.villages || {};
        const sortedItems = report?.items || [];
        if (sortedItems.length === 0) {
            document.getElementById("reportContainer").innerHTML = renderEmptyState("لا توجد طلبات مكتملة ضمن هذه الفترة");
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

        _lastReportData = { reportData, sortedItems, itemTotals, rangeLabel, reportFrom, reportTo };
        document.getElementById("downloadExcelBtn").style.display = "";
    } catch (err) {
        console.error("Error generating report:", err);
        document.getElementById("reportContainer").innerHTML = `<div class="card" style="background:#fff1f1">فشل إنشاء التقرير</div>`;
    }
}

function downloadReportAsExcel() {
    if (!_lastReportData) return;
    const { reportData, sortedItems, itemTotals, rangeLabel, reportFrom, reportTo } = _lastReportData;

    const wb = XLSX.utils.book_new();

    // Build rows array: header + villages + totals
    const headerRow = ["القرية", ...sortedItems];
    const dataRows = Object.keys(reportData)
        .sort((a, b) => a.localeCompare(b, "ar"))
        .map((village) => [village, ...sortedItems.map((item) => reportData[village][item] || 0)]);
    const totalsRow = ["المجموع", ...sortedItems.map((item) => itemTotals[item] || 0)];

    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows, totalsRow]);

    // RTL worksheet view
    ws["!views"] = [{ rightToLeft: true }];

    // Auto column widths
    const colWidths = headerRow.map((_, ci) => {
        const allVals = [headerRow[ci], ...dataRows.map((r) => r[ci]), totalsRow[ci]];
        const max = Math.max(...allVals.map((v) => String(v ?? "").length));
        return { wch: Math.max(max + 2, 8) };
    });
    ws["!cols"] = colWidths;

    // Style header row and totals row bold (requires sheet data cell references)
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let C = range.s.c; C <= range.e.c; C++) {
        const headerCell = XLSX.utils.encode_cell({ r: 0, c: C });
        const totalsCell = XLSX.utils.encode_cell({ r: range.e.r, c: C });
        if (!ws[headerCell]) ws[headerCell] = { v: headerRow[C], t: "s" };
        if (!ws[totalsCell]) ws[totalsCell] = { v: totalsRow[C], t: typeof totalsRow[C] === "number" ? "n" : "s" };
        ws[headerCell].s = { font: { bold: true }, alignment: { horizontal: "center", readingOrder: 2 } };
        ws[totalsCell].s = { font: { bold: true }, alignment: { horizontal: "center", readingOrder: 2 } };
    }

    XLSX.utils.book_append_sheet(wb, ws, "التقرير");

    const fileName = reportFrom === reportTo
        ? `تقرير_${reportFrom}.xlsx`
        : `تقرير_${reportFrom}_${reportTo}.xlsx`;

    XLSX.writeFile(wb, fileName);
}

function setTodayDateFilters() {
    const today = getLocalDateString();
    document.getElementById("dateFrom").value = today;
    document.getElementById("dateTo").value = today;
    currentFilters = { name: "", village: "", status: "", saved: "", dateFrom: today, dateTo: today };
    loadOrderHistory(currentFilters.name, currentFilters.village, currentFilters.status, currentFilters.saved, currentFilters.registered, currentFilters.dateFrom, currentFilters.dateTo);
}

