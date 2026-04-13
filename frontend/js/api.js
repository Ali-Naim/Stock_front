const API_BASE = window.STOCK_API_BASE || "http://localhost:4001/api";

async function apiRequest(path, options = {}) {
    const token = typeof getAuthToken === "function" ? getAuthToken() : "";
    const response = await fetch(`${API_BASE}${path}`, {
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {}),
        },
        ...options,
    });

    if (response.status === 204) return null;

    let payload = null;
    const text = await response.text();
    if (text) {
        try {
            payload = JSON.parse(text);
        } catch (_error) {
            payload = { error: text };
        }
    }

    if (!response.ok) {
        throw new Error(payload?.error || `Request failed with status ${response.status}`);
    }

    return payload;
}

const api = {
    login: (payload) => apiRequest("/auth/login", { method: "POST", body: JSON.stringify(payload) }),

    getVillages: () => apiRequest("/villages"),
    getInventory: () => apiRequest("/inventory"),
    createInventoryItem: (payload) => apiRequest("/inventory", { method: "POST", body: JSON.stringify(payload) }),
    updateInventoryItem: (id, payload) => apiRequest(`/inventory/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteInventoryItem: (id) => apiRequest(`/inventory/${id}`, { method: "DELETE" }),

    getOrders: (params = {}) => apiRequest(`/orders${toQueryString({ limit: ORDER_PAGE_SIZE, ...params })}`),
    getOrderById: (id) => apiRequest(`/orders/${id}`),
    createOrder: (payload) => apiRequest("/orders", { method: "POST", body: JSON.stringify(payload) }),
    updateOrder: (id, payload) => apiRequest(`/orders/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteOrder: (id) => apiRequest(`/orders/${id}`, { method: "DELETE" }),

    getNeeds: (params = {}) => apiRequest(`/needs${toQueryString(params)}`),
    getNeedById: (id) => apiRequest(`/needs/${id}`),
    createNeeds: (payload) => apiRequest("/needs", { method: "POST", body: JSON.stringify(payload) }),
    updateNeed: (id, payload) => apiRequest(`/needs/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteNeed: (id) => apiRequest(`/needs/${id}`, { method: "DELETE" }),

    getFamilies: (params = {}) => apiRequest(`/families${toQueryString(params)}`),
    getFamilyById: (id) => apiRequest(`/families/${id}`),
    createFamily: (payload) => apiRequest("/families", { method: "POST", body: JSON.stringify(payload) }),
    updateFamily: (id, payload) => apiRequest(`/families/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteFamily: (id) => apiRequest(`/families/${id}`, { method: "DELETE" }),

    getFamilyDistributions: (familyId, params = {}) => apiRequest(`/families/${familyId}/distributions${toQueryString(params)}`),
    createFamilyDistribution: (familyId, payload) =>
        apiRequest(`/families/${familyId}/distributions`, { method: "POST", body: JSON.stringify(payload) }),

    getFamilyRelations: (familyId) => apiRequest(`/families/${familyId}/relations`),
    createFamilyRelation: (familyId, payload) => apiRequest(`/families/${familyId}/relations`, { method: "POST", body: JSON.stringify(payload) }),
    deleteFamilyRelation: (familyId, relationId) => apiRequest(`/families/${familyId}/relations/${relationId}`, { method: "DELETE" }),

    getTasks: () => apiRequest("/tasks"),
    getTaskRoles: () => apiRequest("/tasks/roles"),
    getTaskUsers: () => apiRequest("/tasks/users"),
    getTaskLogs: () => apiRequest("/tasks/logs"),
    createTask: (payload) => apiRequest("/tasks", { method: "POST", body: JSON.stringify(payload) }),
    updateTask: (id, payload) => apiRequest(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteTask: (id) => apiRequest(`/tasks/${id}`, { method: "DELETE" }),

    getRangeReport: (from, to) => apiRequest(`/reports/orders-by-range${toQueryString({ from, to })}`),
};
