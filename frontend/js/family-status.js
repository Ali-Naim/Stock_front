// Public, unauthenticated family self-service status check-in.
// Talks only to the /public/* backend endpoints — never touches the
// families table directly; every submission goes into a review queue.

const FS_API_BASE = window.STOCK_API_BASE || "https://stockback-production-dfa8.up.railway.app/api";

// If this number is a placeholder, update it here.
const FS_CONTACT_PHONE = "03000000";

let fsPhone = "";
let fsFamilyId = null;
let fsVillages = [];

async function fsApiRequest(path, options = {}) {
    const response = await fetch(`${FS_API_BASE}${path}`, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options,
    });

    let payload = null;
    const text = await response.text();
    if (text) {
        try { payload = JSON.parse(text); } catch (_error) { payload = { error: text }; }
    }

    if (!response.ok) {
        throw new Error(payload?.error || `Request failed with status ${response.status}`);
    }
    return payload;
}

function fsShowStep(stepId) {
    document.querySelectorAll(".fs-step").forEach((el) => el.classList.remove("active"));
    document.getElementById(stepId)?.classList.add("active");
}

function fsSetError(elId, message) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (message) {
        el.textContent = message;
        el.classList.remove("hidden");
    } else {
        el.textContent = "";
        el.classList.add("hidden");
    }
}

function fsGoToPhoneStep() {
    fsPhone = "";
    fsFamilyId = null;
    fsSetError("fsPhoneError", "");
    document.getElementById("fsPhoneInput").value = "";
    fsShowStep("fsStepPhone");
}

function fsShowNotFound() {
    document.getElementById("fsContactPhone").textContent = FS_CONTACT_PHONE;
    fsShowStep("fsStepNotFound");
}

function fsFullName(person) {
    return [person.father_first_name, person.father_middle_name, person.father_last_name]
        .filter((part) => part && String(part).trim())
        .join(" ");
}

async function fsSubmitPhone() {
    const phone = document.getElementById("fsPhoneInput")?.value?.trim();
    fsSetError("fsPhoneError", "");
    if (!phone) return fsSetError("fsPhoneError", "الرجاء إدخال رقم الهاتف");

    try {
        const result = await fsApiRequest("/public/families/lookup", {
            method: "POST",
            body: JSON.stringify({ phone_number: phone }),
        });
        const matches = result?.matches || [];
        fsPhone = phone;

        if (!matches.length) return fsShowNotFound();

        if (matches.length === 1) {
            fsFamilyId = matches[0].id;
            document.getElementById("fsConfirmName").textContent = fsFullName(matches[0]);
            return fsShowStep("fsStepConfirm");
        }

        const list = document.getElementById("fsMatchList");
        list.innerHTML = "";
        matches.forEach((person) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = fsFullName(person);
            btn.onclick = () => {
                fsFamilyId = person.id;
                document.getElementById("fsConfirmName").textContent = fsFullName(person);
                fsShowStep("fsStepConfirm");
            };
            list.appendChild(btn);
        });
        fsShowStep("fsStepPick");
    } catch (error) {
        console.error(error);
        fsSetError("fsPhoneError", error.message || "حدث خطأ، الرجاء المحاولة لاحقًا");
    }
}

function fsToggleDisplacedFields(value) {
    const showExtras = value === "yes" || value === "unsure";
    document.getElementById("fsDisplacedVillageGroup").style.display = showExtras ? "" : "none";
    document.getElementById("fsStayReasonGroup").style.display = showExtras ? "" : "none";
    if (!showExtras) {
        document.getElementById("fsDisplacedVillage").value = "";
        document.getElementById("fsStayReason").value = "";
    }
}

function fsToggleDamageOther(value) {
    document.getElementById("fsDamageOtherGroup").style.display = value === "other" ? "" : "none";
    if (value !== "other") document.getElementById("fsDamageOther").value = "";
}

function fsFillVillageSelect(selectedId) {
    const select = document.getElementById("fsDisplacedVillage");
    const options = ['<option value="">اختر القرية</option>']
        .concat(fsVillages.map((v) => `<option value="${v.id}"${String(v.id) === String(selectedId || "") ? " selected" : ""}>${v.name}</option>`));
    select.innerHTML = options.join("");
}

async function fsConfirmIdentity(isCorrect) {
    if (!isCorrect) return fsShowNotFound();

    try {
        const result = await fsApiRequest(`/public/families/${fsFamilyId}/status/view`, {
            method: "POST",
            body: JSON.stringify({ phone_number: fsPhone }),
        });
        const family = result?.family || {};
        fsVillages = result?.villages || [];

        const stillDisplaced = ["yes", "no", "unsure"].includes(family.still_displaced) ? family.still_displaced : "";
        document.getElementById("fsStillDisplaced").value = stillDisplaced;
        fsFillVillageSelect(family.displaced_village_id);
        document.getElementById("fsStayReason").value = family.displacement_stay_reason || "";
        fsToggleDisplacedFields(stillDisplaced);

        document.getElementById("fsOriginalPlace").value = family.original_residence_place || "";
        document.getElementById("fsOriginalCondition").value = family.original_residence_condition || "";

        const damageType = family.damage_type || "";
        document.getElementById("fsDamageType").value = damageType;
        document.getElementById("fsDamageOther").value = family.damage_type_other || "";
        fsToggleDamageOther(damageType);

        fsSetError("fsFormError", "");
        fsShowStep("fsStepForm");
    } catch (error) {
        console.error(error);
        fsShowNotFound();
    }
}

async function fsSubmitStatus() {
    const stillDisplaced = document.getElementById("fsStillDisplaced").value || null;
    const showsExtras = stillDisplaced === "yes" || stillDisplaced === "unsure";
    const damageType = document.getElementById("fsDamageType").value || null;

    const payload = {
        phone_number: fsPhone,
        still_displaced: stillDisplaced,
        displaced_village_id: showsExtras ? (document.getElementById("fsDisplacedVillage").value || null) : null,
        displacement_stay_reason: showsExtras ? (document.getElementById("fsStayReason").value.trim() || null) : null,
        original_residence_place: document.getElementById("fsOriginalPlace").value.trim() || null,
        original_residence_condition: document.getElementById("fsOriginalCondition").value || null,
        damage_type: damageType,
        damage_type_other: damageType === "other" ? (document.getElementById("fsDamageOther").value.trim() || null) : null,
    };

    try {
        fsSetError("fsFormError", "");
        await fsApiRequest(`/public/families/${fsFamilyId}/status/submit`, {
            method: "POST",
            body: JSON.stringify(payload),
        });
        fsShowStep("fsStepThanks");
    } catch (error) {
        console.error(error);
        fsSetError("fsFormError", error.message || "فشل إرسال التحديث، الرجاء المحاولة لاحقًا");
    }
}
