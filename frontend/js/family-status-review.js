// Super-admin review queue for public family status submissions
// (frontend/family-status.html). Approving here is the only thing that
// actually writes the proposed values onto the families table.
//
// Statuses: pending (incoming) -> approved | rejected | to_investigate
// (to_investigate is a holding state for follow-up before a final call;
// from there it can still move to approved or rejected).

let fsrAllSubmissions = [];
let fsrActiveStatus = "pending";

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

function fsrRelativeTime(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return "الآن";
    if (diffMin < 60) return `منذ ${diffMin} د`;
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `منذ ${diffHours} س`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 30) return `منذ ${diffDays} يوم`;
    return date.toLocaleDateString("ar");
}

const FSR_STATUS_META = {
    pending: { text: "قيد المراجعة", style: "background:#fef3c7;color:#92400e;", border: "#f5b942" },
    to_investigate: { text: "بحاجة للتحقق", style: "background:#e0e7ff;color:#3730a3;", border: "#6366f1" },
    approved: { text: "تم الاعتماد", style: "background:#dcfce7;color:#166534;", border: "#22c55e" },
    rejected: { text: "تم الرفض", style: "background:#fee2e2;color:#991b1b;", border: "#ef4444" },
};

function fsrStatusMeta(status) {
    return FSR_STATUS_META[status] || { text: status, style: "", border: "#cbd5e1" };
}

function fsrDiffRow(label, oldValue, newValue) {
    const changed = String(oldValue ?? "") !== String(newValue ?? "");
    if (!changed) return "";
    return `
        <div class="fsr-diff-row fsr-diff-changed">
            <span class="fsr-diff-label">${escapeHtml(label)}</span>
            <span class="fsr-diff-old">${escapeHtml(oldValue ?? "—")}</span>
            <span class="fsr-diff-arrow">←</span>
            <span class="fsr-diff-new">${escapeHtml(newValue ?? "—")}</span>
        </div>`;
}

function fsrRenderCard(submission) {
    const prev = submission.previous_snapshot || {};
    const familyName = fsrFamilyName(submission.family);
    const fileNumber = submission.family?.file_number ? ` — رقم الملف: ${escapeHtml(submission.family.file_number)}` : "";
    const phone = submission.family?.phone_number || submission.phone_number_used;
    const meta = fsrStatusMeta(submission.status);

    const rows = [
        fsrDiffRow("ما زال في النزوح؟", fsrStillDisplacedLabel(prev.still_displaced), fsrStillDisplacedLabel(submission.still_displaced)),
        fsrDiffRow("قرية النزوح", submission.previous_displaced_village_name, submission.displaced_village_name),
        fsrDiffRow("سبب البقاء في النزوح", prev.displacement_stay_reason, submission.displacement_stay_reason),
        fsrDiffRow("مكان السكن الأصلي", prev.original_residence_place, submission.original_residence_place),
        fsrDiffRow("حالة السكن الأصلي", fsrOriginalConditionLabel(prev.original_residence_condition), fsrOriginalConditionLabel(submission.original_residence_condition)),
        fsrDiffRow("نوع الأضرار", fsrDamageTypeLabel(prev.damage_type, prev.damage_type_other), fsrDamageTypeLabel(submission.damage_type, submission.damage_type_other)),
    ].filter(Boolean).join("");

    const diffSection = rows || `<p class="fsr-no-changes">لم يتغيّر أي حقل عن البيانات الحالية.</p>`;

    const isActionable = submission.status === "pending" || submission.status === "to_investigate";
    const actions = isActionable
        ? `
            <div class="fs-actions" style="margin-top:12px;">
                <button class="done" type="button" onclick="approveFamilyStatusSubmission(${submission.id})"><i class="bi bi-check-lg me-1"></i>اعتماد</button>
                ${submission.status === "pending" ? `<button class="fsr-investigate-btn" type="button" onclick="investigateFamilyStatusSubmission(${submission.id})"><i class="bi bi-search me-1"></i>بحاجة لتحقق</button>` : ""}
                <button class="delete" type="button" onclick="rejectFamilyStatusSubmission(${submission.id})"><i class="bi bi-x-lg me-1"></i>رفض</button>
            </div>`
        : "";

    const reviewInfo = submission.reviewed_at
        ? `<div class="fsr-review-info">
                ${escapeHtml(meta.text)} بواسطة ${escapeHtml(submission.reviewer_name || "غير معروف")} — ${escapeHtml(fsrRelativeTime(submission.reviewed_at))}
                ${submission.decision_note ? `<br>ملاحظة: ${escapeHtml(submission.decision_note)}` : ""}
           </div>`
        : "";

    return `
        <div class="card fsr-card" style="border-inline-start:4px solid ${meta.border};" data-submission-id="${submission.id}">
            <div class="fsr-card-header">
                <div>
                    <h3 style="margin:0;">${escapeHtml(familyName)}${fileNumber}</h3>
                    <span class="fsr-card-date">
                        ${phone ? `<i class="bi bi-telephone me-1"></i>${escapeHtml(phone)} — ` : ""}أُرسل ${escapeHtml(fsrRelativeTime(submission.created_at))}
                    </span>
                </div>
                <span class="badge" style="${meta.style}">${escapeHtml(meta.text)}</span>
            </div>
            <div class="fsr-diff-table">${diffSection}</div>
            ${reviewInfo}
            ${actions}
        </div>`;
}

function fsrUpdateTabCounts() {
    const counts = { pending: 0, to_investigate: 0, approved: 0, rejected: 0 };
    fsrAllSubmissions.forEach((s) => { if (counts[s.status] !== undefined) counts[s.status]++; });
    Object.keys(counts).forEach((key) => {
        const el = document.getElementById(`fsrCount-${key}`);
        if (el) el.textContent = counts[key];
    });
    const allEl = document.getElementById("fsrCount-all");
    if (allEl) allEl.textContent = fsrAllSubmissions.length;
}

function fsrRenderActiveTab() {
    const container = document.getElementById("familyStatusReviewList");
    if (!container) return;

    document.querySelectorAll(".fsr-tab").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.status === fsrActiveStatus);
    });

    const rows = fsrActiveStatus === "all"
        ? fsrAllSubmissions
        : fsrAllSubmissions.filter((s) => s.status === fsrActiveStatus);

    if (!rows.length) {
        container.innerHTML = `<p class="modal-copy">لا توجد ردود لعرضها في هذا القسم.</p>`;
        return;
    }

    const sorted = [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    container.innerHTML = sorted.map(fsrRenderCard).join("");
}

function setFamilyStatusReviewFilter(status) {
    fsrActiveStatus = status;
    fsrRenderActiveTab();
}

async function loadFamilyStatusSubmissions() {
    const container = document.getElementById("familyStatusReviewList");
    if (!container) return;

    container.innerHTML = `<p class="modal-copy">جارٍ التحميل...</p>`;
    try {
        fsrAllSubmissions = await api.getFamilyStatusSubmissions({ status: "all" });
        fsrUpdateTabCounts();
        fsrRenderActiveTab();
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
    const note = prompt("سبب الرفض (اختياري):") || "";
    try {
        await api.rejectFamilyStatusSubmission(id, note.trim() || null);
        await loadFamilyStatusSubmissions();
    } catch (error) {
        console.error("Failed to reject submission:", error);
        alert(error.message || "فشل رفض الرد");
    }
}

async function investigateFamilyStatusSubmission(id) {
    const note = prompt("سبب طلب التحقق (اختياري):") || "";
    try {
        await api.investigateFamilyStatusSubmission(id, note.trim() || null);
        await loadFamilyStatusSubmissions();
    } catch (error) {
        console.error("Failed to flag submission for investigation:", error);
        alert(error.message || "فشل تحديث حالة الرد");
    }
}

document.addEventListener("auth:login", () => {
    if (typeof isSuperAdmin === "function" && isSuperAdmin()) loadFamilyStatusSubmissions();
});
