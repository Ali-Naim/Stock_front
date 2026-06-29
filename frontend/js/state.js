let villages = [];
let inventory = [];
let itemTypes = [];
let currentOrder = [];
let currentNeedItems = [];
let currentFilters = { name: "", village: "", status: "", saved: "", registered: "", dateFrom: "", dateTo: "" };
let currentNeedFilters = { name: "", phone: "", item: "", village: "", status: "", priority: "", notes: "" };
let families = [];
let currentFamilyFilters = { name: "", village: "", gift: "", livingCondition: "" };
let familiesSortCol = "";
let familiesSortDir = "asc";
let currentDistributionItems = [];
let distributionFamilyId = null;
let editingDistributionId = null;

const FAMILY_COLUMNS = [
    { key: "phone",        label: "رقم الهاتف" },
    { key: "people",       label: "الأفراد" },
    { key: "village",      label: "القرية" },
    { key: "file_number",  label: "رقم الملف" },
    { key: "form",         label: "استمارة" },
    { key: "municipality", label: "البلدية" },
    { key: "housing",      label: "السكن" },
    { key: "last_dist",    label: "آخر توزيع" },
    { key: "dist_count",   label: "توزيعات" },
    { key: "created_at",   label: "تاريخ الإضافة" },
    { key: "gift",         label: "الهدية" },
    { key: "living_cond",  label: "الوضع المعيشي" },
];

function loadFamilyColumnVisibility() {
    try {
        const saved = localStorage.getItem("familyColumnVisibility");
        return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
}
function saveFamilyColumnVisibility() {
    try { localStorage.setItem("familyColumnVisibility", JSON.stringify(familyColumnVisibility)); } catch {}
}
let familyColumnVisibility = loadFamilyColumnVisibility();
let familyDistributionsCache = {};
const NEEDS_PAGE_SIZE = 20;
let currentNeedsPage = 1;
let currentNeedsTotalCount = 0;
const COMPLETED_NEEDS_PAGE_SIZE = 20;
let completedNeedsPage = 1;
let completedNeedsTotalCount = 0;
let editingOrderId = null;
let inlineEditingOrderId = null;
let currentOrdersData = [];
let ordersPage = 1;
let ordersTotalCount = 0;
const ORDER_PAGE_SIZE = 20;
let editingNeedId = null;
let selectedNeedFamily = null;
let selectedOrderFamily = null;
let needToOrderId = null;
let pendingOrderSourceNeedId = null;

