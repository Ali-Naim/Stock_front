let _notes = [];
let _editingNoteId = null;
let _notesLoaded = false;

const NOTE_COLOR_MAP = {
    yellow:   { bg: "#fef9c3", border: "#fde047" },
    blue:     { bg: "#dbeafe", border: "#93c5fd" },
    green:    { bg: "#dcfce7", border: "#86efac" },
    pink:     { bg: "#fce7f3", border: "#f9a8d4" },
    orange:   { bg: "#ffedd5", border: "#fdba74" },
    lavender: { bg: "#ede9fe", border: "#c4b5fd" },
};

const TEXT_COLORS = [
    { label: "أسود",  value: "#111827" },
    { label: "أحمر",  value: "#dc2626" },
    { label: "أزرق",  value: "#1d4ed8" },
    { label: "أخضر",  value: "#15803d" },
    { label: "برتقالي", value: "#c2410c" },
    { label: "بنفسجي", value: "#7c3aed" },
];

async function loadNotes() {
    if (_notesLoaded) { renderNotes(_notes); return; }
    const container = document.getElementById("notesList");
    if (container) container.innerHTML = `<div class="notes-loading">جارٍ التحميل...</div>`;
    try {
        const data = await api.getNotes();
        _notes = Array.isArray(data) ? data : [];
        _notesLoaded = true;
        renderNotes(_notes);
    } catch (err) {
        console.error("Failed to load notes:", err);
        if (container) container.innerHTML = `<div class="card" style="background:#fff1f1">فشل تحميل الملاحظات</div>`;
    }
}

function renderNotes(notes) {
    const container = document.getElementById("notesList");
    if (!container) return;
    if (!notes.length) {
        container.innerHTML = `<div class="notes-empty"><i class="bi bi-sticky"></i><p>لا توجد ملاحظات بعد. أضف أول ملاحظة!</p></div>`;
        return;
    }
    container.innerHTML = notes.map((note) => renderNoteCard(note)).join("");
}

function renderNoteCard(note) {
    const colors = NOTE_COLOR_MAP[note.color] || NOTE_COLOR_MAP.yellow;
    const date = note.updated_at || note.created_at
        ? new Date(note.updated_at || note.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" })
        : "";
    const bodyPreview = String(note.body || "").replace(/<[^>]+>/g, " ").trim();
    return `
        <div class="note-card" style="background:${colors.bg};border-color:${colors.border};" onclick="openNoteModal(${note.id})">
            <div class="note-card-header">
                <strong class="note-card-title">${escapeHtml(note.title || "بدون عنوان")}</strong>
                <button class="note-card-delete" type="button" title="حذف" onclick="event.stopPropagation();deleteNote(${note.id})">
                    <i class="bi bi-trash3"></i>
                </button>
            </div>
            <div class="note-card-body">${note.body ? `<div class="note-card-html">${note.body}</div>` : `<span class="note-card-empty">فارغة</span>`}</div>
            <div class="note-card-footer">
                ${note.created_by ? `<span><i class="bi bi-person-fill"></i> ${escapeHtml(note.created_by)}</span>` : ""}
                ${date ? `<span><i class="bi bi-calendar3"></i> ${date}</span>` : ""}
            </div>
        </div>`;
}

function openNoteModal(noteId) {
    _editingNoteId = noteId || null;
    const note = noteId ? _notes.find((n) => Number(n.id) === Number(noteId)) : null;

    const titleEl = document.getElementById("noteModalHeading");
    if (titleEl) titleEl.textContent = note ? "تعديل الملاحظة" : "ملاحظة جديدة";

    const titleInput = document.getElementById("noteTitleInput");
    if (titleInput) titleInput.value = note?.title || "";

    const bodyEl = document.getElementById("noteBodyEditor");
    if (bodyEl) bodyEl.innerHTML = note?.body || "";

    const colorVal = note?.color || "yellow";
    document.querySelectorAll(".note-color-swatch").forEach((el) => {
        el.classList.toggle("active", el.dataset.color === colorVal);
    });
    _applyModalNoteColor(colorVal);

    document.getElementById("noteModal")?.classList.add("active");
    document.body.style.overflow = "hidden";
    setTimeout(() => titleInput?.focus(), 0);
}

function closeNoteModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("noteModal")?.classList.remove("active");
    document.body.style.overflow = "";
    _editingNoteId = null;
}

function _applyModalNoteColor(colorKey) {
    const colors = NOTE_COLOR_MAP[colorKey] || NOTE_COLOR_MAP.yellow;
    const card = document.querySelector(".note-modal-card");
    if (card) { card.style.background = colors.bg; card.style.borderColor = colors.border; }
}

function selectNoteColor(el, colorKey) {
    document.querySelectorAll(".note-color-swatch").forEach((s) => s.classList.remove("active"));
    el.classList.add("active");
    _applyModalNoteColor(colorKey);
}

function noteExecBold() {
    document.getElementById("noteBodyEditor")?.focus();
    document.execCommand("bold");
}

function noteExecColor(color) {
    document.getElementById("noteBodyEditor")?.focus();
    document.execCommand("foreColor", false, color);
}

async function saveNote() {
    const title = document.getElementById("noteTitleInput")?.value?.trim() || "";
    const body = document.getElementById("noteBodyEditor")?.innerHTML || "";
    const color = document.querySelector(".note-color-swatch.active")?.dataset.color || "yellow";

    if (!title && !body.trim()) return alert("أضف عنواناً أو محتوى للملاحظة");

    const saveBtn = document.getElementById("noteSaveBtn");
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "جارٍ الحفظ..."; }

    try {
        if (_editingNoteId) {
            const updated = await api.updateNote(_editingNoteId, { title, body, color });
            _notes = _notes.map((n) => Number(n.id) === Number(_editingNoteId) ? updated : n);
        } else {
            const created = await api.createNote({ title, body, color });
            _notes = [created, ..._notes];
        }
        renderNotes(_notes);
        closeNoteModal();
    } catch (err) {
        console.error("Failed to save note:", err);
        alert("فشل حفظ الملاحظة");
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "حفظ"; }
    }
}

async function deleteNote(id) {
    if (!confirm("هل تريد حذف هذه الملاحظة؟")) return;
    try {
        await api.deleteNote(id);
        _notes = _notes.filter((n) => Number(n.id) !== Number(id));
        renderNotes(_notes);
    } catch (err) {
        console.error("Failed to delete note:", err);
        alert("فشل حذف الملاحظة");
    }
}

window.loadNotes = loadNotes;
window.openNoteModal = openNoteModal;
window.closeNoteModal = closeNoteModal;
window.selectNoteColor = selectNoteColor;
window.noteExecBold = noteExecBold;
window.noteExecColor = noteExecColor;
window.saveNote = saveNote;
window.deleteNote = deleteNote;
