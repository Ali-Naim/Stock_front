// WhatsApp Cloud API template management + bulk sending, admin/super_admin only.
// All Graph API calls are proxied through the backend (/whatsapp/*) — no
// tokens or Meta calls happen in the browser.

function whatsappCanManage() {
    const roles = (typeof getUserRoles === "function" ? getUserRoles() : []).map((r) => String(r).toLowerCase());
    return roles.includes("admin") || (typeof isSuperAdmin === "function" && isSuperAdmin());
}

function applyWhatsappVisibility() {
    const canManage = whatsappCanManage();
    document.getElementById("whatsappTemplatesBtn")?.classList.toggle("hidden", !canManage);
    document.getElementById("whatsappSendBtn")?.classList.toggle("hidden", !canManage);
}

document.addEventListener("DOMContentLoaded", applyWhatsappVisibility);
document.addEventListener("auth:login", applyWhatsappVisibility);

function whatsappStatusLabel(status) {
    const map = { APPROVED: "معتمد", PENDING: "قيد المراجعة", REJECTED: "مرفوض" };
    return map[status] || status;
}

function whatsappStatusStyle(status) {
    const styles = {
        APPROVED: "background:#dcfce7;color:#166534;",
        PENDING: "background:#fef3c7;color:#92400e;",
        REJECTED: "background:#fee2e2;color:#991b1b;",
    };
    return styles[status] || "";
}

let whatsappTemplatesCache = [];

function openWhatsappTemplatesModal() {
    document.getElementById("whatsappTemplatesModal")?.classList.add("active");
    document.body.style.overflow = "hidden";
    loadWhatsappTemplates();
}

function closeWhatsappTemplatesModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("whatsappTemplatesModal")?.classList.remove("active");
    document.body.style.overflow = "";
}

async function loadWhatsappTemplates() {
    const list = document.getElementById("whatsappTemplatesList");
    if (!list) return;
    list.innerHTML = `<p class="modal-copy">جارٍ التحميل...</p>`;
    try {
        whatsappTemplatesCache = await api.getWhatsappTemplates();
        if (!whatsappTemplatesCache?.length) {
            list.innerHTML = `<p class="modal-copy">لا توجد قوالب بعد.</p>`;
            return;
        }
        list.innerHTML = whatsappTemplatesCache.map((tpl) => `
            <div class="card" style="margin-bottom:8px;padding:12px 14px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
                    <strong>${escapeHtml(tpl.name)}</strong>
                    <span class="badge" style="${whatsappStatusStyle(tpl.status)}">${escapeHtml(whatsappStatusLabel(tpl.status))}</span>
                </div>
                <div style="font-size:0.82rem;color:var(--muted);margin-top:4px;">${escapeHtml(tpl.category)} — ${escapeHtml(tpl.language)}</div>
            </div>
        `).join("");
    } catch (error) {
        console.error("Failed to load WhatsApp templates:", error);
        list.innerHTML = `<p class="modal-copy">فشل تحميل القوالب: ${escapeHtml(error.message || "")}</p>`;
    }
}

async function createWhatsappTemplate() {
    const name = document.getElementById("whatsappTplName")?.value?.trim();
    const category = document.getElementById("whatsappTplCategory")?.value;
    const language = document.getElementById("whatsappTplLanguage")?.value;
    const headerText = document.getElementById("whatsappTplHeader")?.value?.trim();
    const bodyText = document.getElementById("whatsappTplBody")?.value?.trim();
    const footerText = document.getElementById("whatsappTplFooter")?.value?.trim();

    const resultEl = document.getElementById("whatsappTplResult");
    resultEl.classList.remove("hidden");

    if (!name || !bodyText) {
        resultEl.textContent = "اسم القالب ونص الرسالة مطلوبان";
        resultEl.className = "needs-import-result error";
        return;
    }

    resultEl.textContent = "جارٍ الإرسال إلى ميتا للمراجعة...";
    resultEl.className = "needs-import-result info";

    try {
        await api.createWhatsappTemplate({
            name,
            category,
            language,
            header_text: headerText || null,
            body_text: bodyText,
            footer_text: footerText || null,
        });
        resultEl.textContent = "تم إرسال القالب للمراجعة بنجاح.";
        resultEl.className = "needs-import-result success";
        ["whatsappTplName", "whatsappTplHeader", "whatsappTplBody", "whatsappTplFooter"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });
        await loadWhatsappTemplates();
    } catch (error) {
        console.error("Failed to create WhatsApp template:", error);
        resultEl.textContent = error.message || "فشل إنشاء القالب";
        resultEl.className = "needs-import-result error";
    }
}

function whatsappFamiliesWithPhone() {
    const rows = typeof getFilteredFamilies === "function" ? getFilteredFamilies() : [];
    return rows.filter((f) => (f.phone_number ?? f.phoneNumber ?? "").toString().trim());
}

async function openWhatsappSendModal() {
    const recipients = whatsappFamiliesWithPhone();
    document.getElementById("whatsappSendRecipientCount").textContent =
        `سيتم الإرسال إلى ${recipients.length} عائلة لديها رقم هاتف مسجّل.`;

    const select = document.getElementById("whatsappSendTemplateSelect");
    select.innerHTML = '<option value="">جارٍ تحميل القوالب...</option>';

    document.getElementById("whatsappSendResult")?.classList.add("hidden");
    document.getElementById("whatsappSendModal")?.classList.add("active");
    document.body.style.overflow = "hidden";

    try {
        const templates = await api.getWhatsappTemplates();
        const approved = (templates || []).filter((t) => t.status === "APPROVED");
        select.innerHTML = ['<option value="">اختر قالبًا معتمدًا</option>']
            .concat(approved.map((t) => `<option value="${escapeHtml(t.name)}" data-language="${escapeHtml(t.language)}">${escapeHtml(t.name)} (${escapeHtml(t.language)})</option>`))
            .join("");
        if (!approved.length) select.innerHTML = '<option value="">لا توجد قوالب معتمدة بعد</option>';
    } catch (error) {
        console.error("Failed to load WhatsApp templates:", error);
        select.innerHTML = '<option value="">فشل تحميل القوالب</option>';
    }
}

function closeWhatsappSendModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("whatsappSendModal")?.classList.remove("active");
    document.body.style.overflow = "";
}

async function sendWhatsappBulkMessage() {
    const select = document.getElementById("whatsappSendTemplateSelect");
    const templateName = select?.value;
    const language = select?.selectedOptions?.[0]?.dataset?.language || "ar";
    const resultEl = document.getElementById("whatsappSendResult");
    resultEl.classList.remove("hidden");

    if (!templateName) {
        resultEl.textContent = "الرجاء اختيار قالب";
        resultEl.className = "needs-import-result error";
        return;
    }

    const recipients = whatsappFamiliesWithPhone();
    if (!recipients.length) {
        resultEl.textContent = "لا توجد عائلات لديها رقم هاتف ضمن الفلاتر الحالية";
        resultEl.className = "needs-import-result error";
        return;
    }

    if (!confirm(`هل تريد إرسال الرسالة إلى ${recipients.length} عائلة؟`)) return;

    const btn = document.getElementById("whatsappSendConfirmBtn");
    if (btn) { btn.disabled = true; btn.textContent = "جارٍ الإرسال..."; }
    resultEl.textContent = "جارٍ الإرسال...";
    resultEl.className = "needs-import-result info";

    try {
        const result = await api.sendWhatsappMessages({
            template_name: templateName,
            language,
            family_ids: recipients.map((f) => f.id),
        });
        resultEl.textContent = `تم الإرسال إلى ${result.sent} عائلة${result.failed ? `، فشل الإرسال لـ ${result.failed}` : ""}.`;
        resultEl.className = result.failed ? "needs-import-result error" : "needs-import-result success";
    } catch (error) {
        console.error("Failed to send WhatsApp messages:", error);
        resultEl.textContent = error.message || "فشل إرسال الرسائل";
        resultEl.className = "needs-import-result error";
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "إرسال"; }
    }
}
