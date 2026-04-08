async function generateRangeReport() {
    const reportFrom = document.getElementById("reportFrom").value;
    const reportTo = document.getElementById("reportTo").value;

    if (!reportFrom || !reportTo) return alert("اختر تاريخ البداية والنهاية");
    if (reportFrom > reportTo) return alert("يجب أن يكون تاريخ البداية قبل أو يساوي تاريخ النهاية");

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

