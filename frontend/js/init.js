async function initialize() {
    await loadVillages();
    fillVillageInputs();

    const today = getLocalDateString();
    document.getElementById("reportFrom").value = today;
    document.getElementById("reportTo").value = today;
    document.getElementById("needPriority").value = "normal";
    document.getElementById("needItem").addEventListener("change", updateNeedItemPreview);

    await loadItems();
    renderOrder();
    renderNeedItems();
    setActiveTabState("inventory");
    setTodayDateFilters();
    await loadNeedsHistory();
}

initialize();
