async function ensureAnalyticsLoaded() {
    if (typeof ensureFamiliesLoaded === "function") {
        await ensureFamiliesLoaded();
    }
    renderAnalytics();
}

function analyticsProgressBar(pct, color) {
    const bg = color || "var(--primary)";
    return `<div class="analytics-track"><div class="analytics-fill" style="width:${pct}%;background:${bg}"></div></div>`;
}

function _pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
function _hasFile(f) { return String(f.file_number ?? f.fileNumber ?? "").trim().length > 0; }
function _hasFilled(f) { return Boolean(f.is_form_filled ?? f.isFormFilled ?? false); }
function _isMuni(f) { return Boolean(f.municipality_registered ?? f.municipalityRegistered ?? false); }
function _housingType(f) { return f.housing_type ?? f.housingType ?? null; }
function _distCount(f) {
    const fromApi = Number(f.distribution_count ?? f.distributions_count ?? NaN);
    if (Number.isFinite(fromApi)) return fromApi;
    return Number(familyStatsCache?.[String(f.id)]?.count ?? 0);
}

function renderAnalytics() {
    const container = document.getElementById("analyticsContent");
    if (!container) return;

    const all = families || [];
    if (!all.length) {
        container.innerHTML = `<div class="card">لا توجد بيانات. افتح تبويب العائلات أولاً أو اضغط تحديث.</div>`;
        return;
    }

    const total         = all.length;
    const totalPeople   = all.reduce((s, f) => s + Number(f.people_count ?? 1), 0);
    const avgPeople     = total ? (totalPeople / total).toFixed(1) : 0;
    const totalFilled   = all.filter(_hasFilled).length;
    const totalFile     = all.filter(_hasFile).length;
    const totalMuni     = all.filter(_isMuni).length;
    const totalWithDist = all.filter((f) => _distCount(f) > 0).length;
    const totalHouse    = all.filter((f) => _housingType(f) === "house").length;
    const totalShelter  = all.filter((f) => _housingType(f) === "shelter_center").length;

    const filledPct  = _pct(totalFilled, total);
    const filePct    = _pct(totalFile, total);
    const muniPct    = _pct(totalMuni, total);
    const distPct    = _pct(totalWithDist, total);
    const housePct   = _pct(totalHouse, total);
    const shelterPct = _pct(totalShelter, total);

    // Group by village
    const byVillage = {};
    all.forEach((f) => {
        const vid = String(f.village_id ?? f.villageId ?? "");
        if (!byVillage[vid]) byVillage[vid] = [];
        byVillage[vid].push(f);
    });

    const rows = Object.entries(byVillage)
        .map(([vid, fams]) => {
            const people     = fams.reduce((s, f) => s + Number(f.people_count ?? 1), 0);
            const filled     = fams.filter(_hasFilled).length;
            const fileNo     = fams.filter(_hasFile).length;
            const muni       = fams.filter(_isMuni).length;
            const withDist   = fams.filter((f) => _distCount(f) > 0).length;
            const house      = fams.filter((f) => _housingType(f) === "house").length;
            const shelter    = fams.filter((f) => _housingType(f) === "shelter_center").length;
            return {
                name: getVillageNameById(vid),
                count: fams.length,
                people,
                avg: fams.length ? (people / fams.length).toFixed(1) : 0,
                filled, fileNo, muni, withDist, house, shelter,
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "ar"));

    const maxPeople = Math.max(...rows.map((r) => r.people), 1);

    container.innerHTML = `
        <!-- Summary cards -->
        <div class="analytics-summary-grid">
            <div class="card analytics-summary-card">
                <div class="analytics-summary-value">${total}</div>
                <div class="analytics-summary-label">إجمالي العائلات</div>
            </div>
            <div class="card analytics-summary-card">
                <div class="analytics-summary-value">${totalPeople.toLocaleString("ar")}</div>
                <div class="analytics-summary-label">إجمالي الأفراد</div>
                <div style="font-size:0.8rem;color:var(--muted);margin-top:2px;">متوسط ${avgPeople} فرد/عائلة</div>
            </div>
            <div class="card analytics-summary-card">
                <div class="analytics-summary-value">${totalFilled} <span class="analytics-pct-badge analytics-pct-success">${filledPct}%</span></div>
                <div class="analytics-summary-label">ملأوا الاستمارة</div>
                ${analyticsProgressBar(filledPct, "#16a34a")}
            </div>
            <div class="card analytics-summary-card">
                <div class="analytics-summary-value">${totalMuni} <span class="analytics-pct-badge analytics-pct-primary">${muniPct}%</span></div>
                <div class="analytics-summary-label">مسجلون بالبلدية</div>
                ${analyticsProgressBar(muniPct)}
            </div>
            <div class="card analytics-summary-card">
                <div class="analytics-summary-value">${totalFile} <span class="analytics-pct-badge analytics-pct-primary">${filePct}%</span></div>
                <div class="analytics-summary-label">لديهم رقم ملف</div>
                ${analyticsProgressBar(filePct)}
            </div>
            <div class="card analytics-summary-card">
                <div class="analytics-summary-value">${totalWithDist} <span class="analytics-pct-badge analytics-pct-success">${distPct}%</span></div>
                <div class="analytics-summary-label">تلقوا توزيعاً</div>
                ${analyticsProgressBar(distPct, "#16a34a")}
            </div>
            <div class="card analytics-summary-card">
                <div class="analytics-summary-value">${totalHouse} <span class="analytics-pct-badge analytics-pct-primary">${housePct}%</span></div>
                <div class="analytics-summary-label">يسكنون في منزل</div>
                ${analyticsProgressBar(housePct, "#0369a1")}
            </div>
            <div class="card analytics-summary-card">
                <div class="analytics-summary-value">${totalShelter} <span class="analytics-pct-badge analytics-pct-primary">${shelterPct}%</span></div>
                <div class="analytics-summary-label">في مركز إيواء</div>
                ${analyticsProgressBar(shelterPct, "#7c3aed")}
            </div>
        </div>


        <!-- Detailed village table -->
        <div class="card" style="margin-top:1.25rem;">
            <h3 style="margin-bottom:1rem;">تفاصيل حسب القرية</h3>
            <div class="report-table-wrap">
                <table class="needs-table analytics-village-table">
                    <thead>
                        <tr>
                            <th>القرية</th>
                            <th>عائلات</th>
                            <th>أفراد</th>
                            <th>متوسط</th>
                            <th>استمارة %</th>
                            <th>بلدية %</th>
                            <th>رقم ملف %</th>
                            <th>توزيع %</th>
                            <th>منازل</th>
                            <th>مراكز إيواء</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((r) => {
                            const fp  = _pct(r.filled,   r.count);
                            const mp  = _pct(r.muni,     r.count);
                            const np  = _pct(r.fileNo,   r.count);
                            const dp  = _pct(r.withDist, r.count);
                            return `
                            <tr>
                                <td><strong>${escapeHtml(r.name)}</strong></td>
                                <td class="analytics-num">${r.count}</td>
                                <td class="analytics-num">${r.people}</td>
                                <td class="analytics-num">${r.avg}</td>
                                <td class="analytics-bar-cell">
                                    ${analyticsProgressBar(fp, "#16a34a")}
                                    <span class="analytics-bar-label">${fp}%</span>
                                </td>
                                <td class="analytics-bar-cell">
                                    ${analyticsProgressBar(mp)}
                                    <span class="analytics-bar-label">${mp}%</span>
                                </td>
                                <td class="analytics-bar-cell">
                                    ${analyticsProgressBar(np)}
                                    <span class="analytics-bar-label">${np}%</span>
                                </td>
                                <td class="analytics-bar-cell">
                                    ${analyticsProgressBar(dp, "#16a34a")}
                                    <span class="analytics-bar-label">${dp}%</span>
                                </td>
                                <td class="analytics-num">${r.house}</td>
                                <td class="analytics-num">${r.shelter}</td>
                            </tr>`;
                        }).join("")}
                    </tbody>
                    <tfoot>
                        <tr class="analytics-total-row">
                            <td><strong>الإجمالي</strong></td>
                            <td class="analytics-num">${total}</td>
                            <td class="analytics-num">${totalPeople}</td>
                            <td class="analytics-num">${avgPeople}</td>
                            <td class="analytics-bar-cell">
                                ${analyticsProgressBar(filledPct, "#16a34a")}
                                <span class="analytics-bar-label">${filledPct}%</span>
                            </td>
                            <td class="analytics-bar-cell">
                                ${analyticsProgressBar(muniPct)}
                                <span class="analytics-bar-label">${muniPct}%</span>
                            </td>
                            <td class="analytics-bar-cell">
                                ${analyticsProgressBar(filePct)}
                                <span class="analytics-bar-label">${filePct}%</span>
                            </td>
                            <td class="analytics-bar-cell">
                                ${analyticsProgressBar(distPct, "#16a34a")}
                                <span class="analytics-bar-label">${distPct}%</span>
                            </td>
                            <td class="analytics-num">${totalHouse}</td>
                            <td class="analytics-num">${totalShelter}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

window.ensureAnalyticsLoaded = ensureAnalyticsLoaded;
window.renderAnalytics = renderAnalytics;
