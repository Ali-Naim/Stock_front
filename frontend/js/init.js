async function initialize() {
    await Promise.all([loadVillages(), loadItems()]);
    fillVillageInputs();

    const today = getLocalDateString();
    document.getElementById("reportFrom").value = today;
    document.getElementById("reportTo").value = today;
    document.getElementById("needPriority").value = "normal";
    document.getElementById("needItem").addEventListener("change", updateNeedItemPreview);

    renderOrder();
    renderNeedItems();
    setActiveTabState("inventory");
    setTodayDateFilters();
    if (typeof canAccessTab === "function" && canAccessTab("needs")) {
        await loadNeedsHistory();
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    if (typeof setupAuthUi === "function") setupAuthUi();
    if (typeof getAuthToken === "function" && !getAuthToken() && typeof requireAuth === "function") {
        await requireAuth();
    }
    if (typeof getAuthToken === "function" && !getAuthToken()) return;
    await initialize();
});
