const API_BASE = "http://localhost:4001/api";

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
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
    getVillages: () => apiRequest("/villages"),
    getInventory: () => apiRequest("/inventory"),
    createInventoryItem: (payload) => apiRequest("/inventory", { method: "POST", body: JSON.stringify(payload) }),
    updateInventoryItem: (id, payload) => apiRequest(`/inventory/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteInventoryItem: (id) => apiRequest(`/inventory/${id}`, { method: "DELETE" }),

    getOrders: (params = {}) => apiRequest(`/orders${toQueryString(params)}`),
    getOrderById: (id) => apiRequest(`/orders/${id}`),
    createOrder: (payload) => apiRequest("/orders", { method: "POST", body: JSON.stringify(payload) }),
    updateOrder: (id, payload) => apiRequest(`/orders/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteOrder: (id) => apiRequest(`/orders/${id}`, { method: "DELETE" }),

    getNeeds: (params = {}) => apiRequest(`/needs${toQueryString(params)}`),
    getNeedById: (id) => apiRequest(`/needs/${id}`),
    createNeeds: (payload) => apiRequest("/needs", { method: "POST", body: JSON.stringify(payload) }),
    updateNeed: (id, payload) => apiRequest(`/needs/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteNeed: (id) => apiRequest(`/needs/${id}`, { method: "DELETE" }),

    getRangeReport: (from, to) => apiRequest(`/reports/orders-by-range${toQueryString({ from, to })}`),
};

