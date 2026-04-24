async function ensureAnalyticsLoaded() {
    if (typeof ensureFamiliesLoaded === "function") {
        await ensureFamiliesLoaded();
    }
    renderAnalytics();
}

function analyticsProgressBar(pct, type) {
    const color = type === "success" ? "#16a34a" : "var(--primary)";
    return `<div class="analytics-track"><div class="analytics-fill" style="width:${pct}%;background:${color}"></div></div>`;
}

function renderAnalytics() {
    const container = document.getElementById("analyticsContent");
    if (!container) return;

    const allFamilies = families || [];
    if (!allFamilies.length) {
        container.innerHTML = `<div class="card">لا توجد بيانات. افتح تبويب العائلات أولاً أو اضغط تحديث.</div>`;
        return;
    }

    const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
    const hasFile = (f) => String(f.file_number ?? f.fileNumber ?? "").trim().length > 0;
    const hasFilled = (f) => Boolean(f.is_form_filled ?? f.isFormFilled ?? false);

    const total = allFamilies.length;
    const totalFilled = allFamilies.filter(hasFilled).length;
    const totalFile = allFamilies.filter(hasFile).length;
    const filledPct = pct(totalFilled, total);
    const filePct = pct(totalFile, total);

    // Group by village
    const byVillage = {};
    allFamilies.forEach((f) => {
        const vid = String(f.village_id ?? f.villageId ?? "");
        if (!byVillage[vid]) byVillage[vid] = [];
        byVillage[vid].push(f);
    });

    const rows = Object.entries(byVillage)
        .map(([vid, fams]) => ({
            name: getVillageNameById(vid),
            count: fams.length,
            filled: fams.filter(hasFilled).length,
            fileNo: fams.filter(hasFile).length,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "ar"));

    container.innerHTML = `
        <div class="analytics-summary-grid">
            <div class="card analytics-summary-card">
                <div class="analytics-summary-value">${total}</div>
                <div class="analytics-summary-label">إجمالي العائلات</div>
            </div>
            <div class="card analytics-summary-card">
                <div class="analytics-summary-value">${totalFilled} <span class="analytics-pct-badge analytics-pct-success">${filledPct}%</span></div>
                <div class="analytics-summary-label">ملأوا الاستمارة</div>
                ${analyticsProgressBar(filledPct, "success")}
            </div>
            <div class="card analytics-summary-card">
                <div class="analytics-summary-value">${totalFile} <span class="analytics-pct-badge analytics-pct-primary">${filePct}%</span></div>
                <div class="analytics-summary-label">لديهم رقم ملف</div>
                ${analyticsProgressBar(filePct, "primary")}
            </div>
        </div>

        <div class="card" style="margin-top:1.25rem;">
            <h3 style="margin-bottom:1rem;">تفاصيل حسب القرية</h3>
            <div class="report-table-wrap">
                <table class="needs-table analytics-village-table">
                    <thead>
                        <tr>
                            <th>القرية</th>
                            <th>عدد العائلات</th>
                            <th>ملأوا الاستمارة</th>
                            <th>نسبة الاستمارة</th>
                            <th>لديهم رقم ملف</th>
                            <th>نسبة رقم الملف</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((r) => {
                            const fp = pct(r.filled, r.count);
                            const np = pct(r.fileNo, r.count);
                            return `
                                <tr>
                                    <td><strong>${escapeHtml(r.name)}</strong></td>
                                    <td class="analytics-num">${r.count}</td>
                                    <td class="analytics-num">${r.filled}</td>
                                    <td class="analytics-bar-cell">
                                        ${analyticsProgressBar(fp, "success")}
                                        <span class="analytics-bar-label">${fp}%</span>
                                    </td>
                                    <td class="analytics-num">${r.fileNo}</td>
                                    <td class="analytics-bar-cell">
                                        ${analyticsProgressBar(np, "primary")}
                                        <span class="analytics-bar-label">${np}%</span>
                                    </td>
                                </tr>`;
                        }).join("")}
                    </tbody>
                    <tfoot>
                        <tr class="analytics-total-row">
                            <td><strong>الإجمالي</strong></td>
                            <td class="analytics-num">${total}</td>
                            <td class="analytics-num">${totalFilled}</td>
                            <td class="analytics-bar-cell">
                                ${analyticsProgressBar(filledPct, "success")}
                                <span class="analytics-bar-label">${filledPct}%</span>
                            </td>
                            <td class="analytics-num">${totalFile}</td>
                            <td class="analytics-bar-cell">
                                ${analyticsProgressBar(filePct, "primary")}
                                <span class="analytics-bar-label">${filePct}%</span>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

window.ensureAnalyticsLoaded = ensureAnalyticsLoaded;
window.renderAnalytics = renderAnalytics;
