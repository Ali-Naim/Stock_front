// Super-admin review queue for public family status submissions
// (frontend/family-status.html). Approving here is the only thing that
// actually writes the proposed values onto the families table.

function fsrStillDisplacedLabel(val) {
    const map = { yes: "نعم", no: "لا", unsure: "متردد" };
    return map[val] || "غير محدد";
}

function fsrOriginalConditionLabel(val) {
    const map = { not_habitable: "غير صالح للسكن كليًا", needs_repair: "يحتاج إلى تصليح", good: "بحالة جيدة" };
    return map[val] || "غير محدد";
}

function fsrDamageTypeLabel(val, other) {
    const map = {
        structural: "أضرار هيكلية",
        roof: "أضرار في السقف",
        glass_windows: "كسر الزجاج والنوافذ",
        facilities: "أضرار في المرافق",
        fire: "حريق",
        multiple: "أضرار متعددة",
        other: other ? `أخرى: ${other}` : "أخرى",
    };
    return map[val] || "غير محدد";
}

function fsrFamilyName(family) {
    if (!family) return "عائلة محذوفة";
    return [family.father_first_name, family.father_middle_name, family.father_last_name]
        .filter((part) => part && String(part).trim())
        .join(" ");
}

function fsrDiffRow(label, oldValue, newValue) {
    const changed = String(oldValue ?? "") !== String(newValue ?? "");
    return `
        <div class="fsr-diff-row${changed ? " fsr-diff-changed" : ""}">
            <span class="fsr-diff-label">${escapeHtml(label)}</span>
            <span class="fsr-diff-old">${escapeHtml(oldValue ?? "—")}</span>
            <span class="fsr-diff-arrow">←</span>
            <span class="fsr-diff-new">${escapeHtml(newValue ?? "—")}</span>
        </div>`;
}

function fsrStatusBadge(status) {
    const map = {
        pending: { text: "قيد المراجعة", style: "background:#fef3c7;color:#92400e;" },
        approved: { text: "تم الاعتماد", style: "background:#dcfce7;color:#166534;" },
        rejected: { text: "تم الرفض", style: "background:#fee2e2;color:#991b1b;" },
    };
    const info = map[status] || { text: status, style: "" };
    return `<span class="badge" style="${info.style}">${escapeHtml(info.text)}</span>`;
}

function fsrRenderCard(submission) {
    const prev = submission.previous_snapshot || {};
    const familyName = fsrFamilyName(submission.family);
    const fileNumber = submission.family?.file_number ? ` — رقم الملف: ${escapeHtml(submission.family.file_number)}` : "";

    const rows = [
        fsrDiffRow("ما زال في النزوح؟", fsrStillDisplacedLabel(prev.still_displaced), fsrStillDisplacedLabel(submission.still_displaced)),
        fsrDiffRow("قرية النزوح", submission.previous_displaced_village_name, submission.displaced_village_name),
        fsrDiffRow("سبب البقاء في النزوح", prev.displacement_stay_reason, submission.displacement_stay_reason),
        fsrDiffRow("مكان السكن الأصلي", prev.original_residence_place, submission.original_residence_place),
        fsrDiffRow("حالة السكن الأصلي", fsrOriginalConditionLabel(prev.original_residence_condition), fsrOriginalConditionLabel(submission.original_residence_condition)),
        fsrDiffRow("نوع الأضرار", fsrDamageTypeLabel(prev.damage_type, prev.damage_type_other), fsrDamageTypeLabel(submission.damage_type, submission.damage_type_other)),
    ].join("");

    const actions = submission.status === "pending"
        ? `
            <div class="fs-actions" style="margin-top:12px;">
                <button class="done" type="button" onclick="approveFamilyStatusSubmission(${submission.id})">اعتماد</button>
                <button class="delete" type="button" onclick="rejectFamilyStatusSubmission(${submission.id})">رفض</button>
            </div>`
        : "";

    return `
        <div class="card fsr-card" data-submission-id="${submission.id}">
            <div class="fsr-card-header">
                <div>
                    <h3 style="margin:0;">${escapeHtml(familyName)}${fileNumber}</h3>
                    <span class="fsr-card-date">${escapeHtml(new Date(submission.created_at).toLocaleString("ar"))}</span>
                </div>
                ${fsrStatusBadge(submission.status)}
            </div>
            <div class="fsr-diff-table">${rows}</div>
            ${actions}
        </div>`;
}

async function loadFamilyStatusSubmissions() {
    const container = document.getElementById("familyStatusReviewList");
    if (!container) return;
    const status = document.getElementById("familyStatusReviewFilter")?.value || "pending";

    container.innerHTML = `<p class="modal-copy">جارٍ التحميل...</p>`;
    try {
        const submissions = await api.getFamilyStatusSubmissions({ status });
        if (!submissions?.length) {
            container.innerHTML = `<p class="modal-copy">لا توجد ردود لعرضها.</p>`;
            return;
        }
        container.innerHTML = submissions.map(fsrRenderCard).join("");
    } catch (error) {
        console.error("Failed to load family status submissions:", error);
        container.innerHTML = `<p class="modal-copy">فشل تحميل الردود.</p>`;
    }
}

async function approveFamilyStatusSubmission(id) {
    if (!confirm("هل تريد اعتماد هذا الرد وتطبيقه على بيانات العائلة؟")) return;
    try {
        await api.approveFamilyStatusSubmission(id);
        await loadFamilyStatusSubmissions();
    } catch (error) {
        console.error("Failed to approve submission:", error);
        alert(error.message || "فشل اعتماد الرد");
    }
}

async function rejectFamilyStatusSubmission(id) {
    if (!confirm("هل تريد رفض هذا الرد؟")) return;
    try {
        await api.rejectFamilyStatusSubmission(id);
        await loadFamilyStatusSubmissions();
    } catch (error) {
        console.error("Failed to reject submission:", error);
        alert(error.message || "فشل رفض الرد");
    }
}

document.addEventListener("auth:login", () => {
    if (typeof isSuperAdmin === "function" && isSuperAdmin()) loadFamilyStatusSubmissions();
});
