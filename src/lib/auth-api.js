export class ApiError extends Error {
  constructor({ code, message, status }) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

let csrfToken = "";

async function readResponse(response) {
  if (response.status === 204) return null;

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      code: payload?.error?.code || "API_ERROR",
      message:
        payload?.error?.message || "No fue posible completar la solicitud.",
    });
  }

  return payload;
}

async function getCsrfToken() {
  let response;
  try {
    response = await fetch("/api/v1/auth/csrf", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message:
        "No se pudo conectar con SIGECOM. Verifica la conexión e inténtalo de nuevo.",
    });
  }
  const payload = await readResponse(response);
  csrfToken = payload.csrfToken;
  return csrfToken;
}

async function post(path, body) {
  const token = csrfToken || (await getCsrfToken());
  let response;

  try {
    response = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message:
        "No se pudo conectar con SIGECOM. Verifica la conexión e inténtalo de nuevo.",
    });
  }

  return readResponse(response);
}

async function get(path) {
  let response;
  try {
    response = await fetch(path, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message:
        "No se pudo conectar con SIGECOM. Verifica la conexión e inténtalo de nuevo.",
    });
  }
  return readResponse(response);
}

async function patch(path, body) {
  const token = csrfToken || (await getCsrfToken());
  let response;
  try {
    response = await fetch(path, {
      method: "PATCH",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message:
        "No se pudo conectar con SIGECOM. Verifica la conexión e inténtalo de nuevo.",
    });
  }
  return readResponse(response);
}

export const authApi = {
  async login(credentials) {
    await getCsrfToken();
    const payload = await post("/api/v1/auth/login", credentials);
    csrfToken = payload.csrfToken;
    return payload.user;
  },
  async me() {
    const payload = await get("/api/v1/auth/me");
    return payload;
  },
  async changePassword(input) {
    try {
      return await post("/api/v1/auth/change-password", input);
    } finally {
      csrfToken = "";
    }
  },
  async getProfile() {
    return get("/api/v1/profile");
  },
  async updateProfile(input) {
    return patch("/api/v1/profile", input);
  },
  async logout() {
    try {
      return await post("/api/v1/auth/logout");
    } finally {
      csrfToken = "";
    }
  },
  async refreshCsrf() {
    return getCsrfToken();
  },
};

export const categoriesApi = {
  list(filters = {}) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== "") {
        search.set(key, String(value));
      }
    }
    const query = search.toString();
    return get(`/api/v1/categories${query ? `?${query}` : ""}`);
  },
  get(id) {
    return get(`/api/v1/categories/${encodeURIComponent(id)}`);
  },
  create(input) {
    return post("/api/v1/categories", input);
  },
  update(id, input) {
    return patch(`/api/v1/categories/${encodeURIComponent(id)}`, input);
  },
  setStatus(id, isActive) {
    return patch(`/api/v1/categories/${encodeURIComponent(id)}/status`, {
      isActive,
    });
  },
};

export const warehousesApi = {
  list(filters = {}) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== "") {
        search.set(key, String(value));
      }
    }
    const query = search.toString();
    return get(`/api/v1/warehouses${query ? `?${query}` : ""}`);
  },
  get(id) {
    return get(`/api/v1/warehouses/${encodeURIComponent(id)}`);
  },
  responsibles(query = "") {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    const suffix = search.toString();
    return get(`/api/v1/warehouses/responsibles${suffix ? `?${suffix}` : ""}`);
  },
  create(input) {
    return post("/api/v1/warehouses", input);
  },
  update(id, input) {
    return patch(`/api/v1/warehouses/${encodeURIComponent(id)}`, input);
  },
  setStatus(id, isActive) {
    return patch(`/api/v1/warehouses/${encodeURIComponent(id)}/status`, {
      isActive,
    });
  },
};

export const productsApi = {
  list(filters = {}) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== "") {
        search.set(key, String(value));
      }
    }
    const query = search.toString();
    return get(`/api/v1/products${query ? `?${query}` : ""}`);
  },
  get(id) {
    return get(`/api/v1/products/${encodeURIComponent(id)}`);
  },
  balances(id, warehouseId) {
    const search = new URLSearchParams();
    if (warehouseId) search.set("warehouseId", warehouseId);
    const query = search.toString();
    return get(
      `/api/v1/products/${encodeURIComponent(id)}/balances${query ? `?${query}` : ""}`,
    );
  },
  create(input) {
    return post("/api/v1/products", input);
  },
  update(id, input) {
    return patch(`/api/v1/products/${encodeURIComponent(id)}`, input);
  },
};

function createPartnerApi(resource) {
  return {
    list(filters = {}) {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== "") {
          search.set(key, String(value));
        }
      }
      const query = search.toString();
      return get(`/api/v1/${resource}${query ? `?${query}` : ""}`);
    },
    get(id) {
      return get(`/api/v1/${resource}/${encodeURIComponent(id)}`);
    },
    create(input) {
      return post(`/api/v1/${resource}`, input);
    },
    update(id, input) {
      return patch(`/api/v1/${resource}/${encodeURIComponent(id)}`, input);
    },
    setStatus(id, isActive) {
      return patch(`/api/v1/${resource}/${encodeURIComponent(id)}/status`, {
        isActive,
      });
    },
  };
}

export const customersApi = createPartnerApi("customers");
export const suppliersApi = createPartnerApi("suppliers");

export const dashboardApi = {
  get() {
    return get("/api/v1/dashboard");
  },
};

function queryString(filters) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const inventoryApi = {
  balances(filters = {}) {
    return get(`/api/v1/inventory/balances${queryString(filters)}`);
  },
  totals(filters = {}) {
    return get(`/api/v1/inventory/totals${queryString(filters)}`);
  },
  movements(filters = {}) {
    return get(`/api/v1/inventory/movements${queryString(filters)}`);
  },
  movement(id) {
    return get(`/api/v1/inventory/movements/${encodeURIComponent(id)}`);
  },
  operations(filters = {}) {
    return get(`/api/v1/inventory/operations${queryString(filters)}`);
  },
  operation(id) {
    return get(`/api/v1/inventory/operations/${encodeURIComponent(id)}`);
  },
  reconciliation(warehouseId) {
    return get(
      `/api/v1/inventory/reconciliation${queryString({ warehouseId })}`,
    );
  },
};
