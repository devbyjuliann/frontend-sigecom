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
