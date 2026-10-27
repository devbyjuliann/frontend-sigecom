import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authApi,
  categoriesApi,
  customersApi,
  productsApi,
  suppliersApi,
  warehousesApi,
} from "./auth-api.js";

describe("authApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("gets a CSRF cookie before login and sends credentials with the token", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ csrfToken: "a".repeat(64) }, { status: 200 }),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            user: { id: "7", email: "seller@example.invalid", role: "seller" },
            csrfToken: "b".repeat(64),
          },
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetch);

    await authApi.login({
      email: "seller@example.invalid",
      password: "a private test password",
    });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/auth/csrf",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "a".repeat(64) }),
        body: JSON.stringify({
          email: "seller@example.invalid",
          password: "a private test password",
        }),
      }),
    );
  });

  it("uses the rotated CSRF token to log out and never stores credentials", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ csrfToken: "c".repeat(64) }, { status: 200 }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { user: { id: "7" }, csrfToken: "d".repeat(64) },
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await authApi.login({
      email: "seller@example.invalid",
      password: "private",
    });
    await authApi.logout();

    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/auth/logout",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "d".repeat(64) }),
      }),
    );
    expect(setItem).not.toHaveBeenCalled();
  });

  it("turns API errors into safe, user-facing authentication errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ csrfToken: "e".repeat(64) }, { status: 200 }),
        )
        .mockResolvedValueOnce(
          Response.json(
            {
              error: {
                code: "INVALID_CREDENTIALS",
                message: "Correo o contraseña incorrectos.",
              },
            },
            { status: 401 },
          ),
        ),
    );

    await expect(
      authApi.login({ email: "seller@example.invalid", password: "wrong" }),
    ).rejects.toMatchObject({ status: 401, code: "INVALID_CREDENTIALS" });
  });

  it("reports network failures without implying credentials were rejected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(
      authApi.login({ email: "seller@example.invalid", password: "private" }),
    ).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("posts password updates with CSRF and exposes only the safe result", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ csrfToken: "f".repeat(64) }, { status: 200 }),
      )
      .mockResolvedValueOnce(
        Response.json({ changed: true, revokedSessions: 2 }, { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);

    await authApi.refreshCsrf();
    await expect(
      authApi.changePassword({
        currentPassword: "old private password",
        newPassword: "New-Strong-Password-2026",
        confirmPassword: "New-Strong-Password-2026",
      }),
    ).resolves.toEqual({ changed: true, revokedSessions: 2 });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/auth/change-password",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "f".repeat(64) }),
      }),
    );
    expect(localStorage.length).toBe(0);
  });

  it("loads the own profile and patches only through the CSRF-protected API", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ csrfToken: "g".repeat(64) }, { status: 200 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "7",
          email: "seller@example.invalid",
          displayName: "Vendedor",
          role: "seller",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "7",
          email: "seller@example.invalid",
          displayName: "Nombre nuevo",
          role: "seller",
        }),
      );
    vi.stubGlobal("fetch", fetch);

    await authApi.refreshCsrf();
    await expect(authApi.getProfile()).resolves.toMatchObject({
      displayName: "Vendedor",
    });
    await expect(
      authApi.updateProfile({ displayName: "Nombre nuevo" }),
    ).resolves.toMatchObject({ displayName: "Nombre nuevo" });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/profile",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/profile",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "X-CSRF-Token": "g".repeat(64) }),
        body: JSON.stringify({ displayName: "Nombre nuevo" }),
      }),
    );
  });

  it("uses the authenticated API for category search and mutations", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ csrfToken: "h".repeat(64) }, { status: 200 }),
      )
      .mockResolvedValueOnce(
        Response.json({ items: [], pagination: { page: 1 } }),
      )
      .mockResolvedValueOnce(Response.json({ id: "1", name: "Aseo" }));
    vi.stubGlobal("fetch", fetch);

    await authApi.refreshCsrf();
    await categoriesApi.list({ q: "aseo", status: "active", page: 2 });
    await categoriesApi.create({ name: "Aseo", description: null });

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/categories?q=aseo&status=active&page=2",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/categories",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "h".repeat(64) }),
        body: JSON.stringify({ name: "Aseo", description: null }),
      }),
    );
  });

  it("uses the authenticated API for warehouse details, responsible users, and mutations", async () => {
    const csrfToken = "w".repeat(64);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ csrfToken }))
      .mockResolvedValueOnce(
        Response.json({ items: [], pagination: { page: 1 } }),
      )
      .mockResolvedValueOnce(Response.json({ id: "42", code: "BOD-42" }))
      .mockResolvedValueOnce(
        Response.json({ items: [{ id: "9", name: "Ana" }] }),
      )
      .mockResolvedValueOnce(Response.json({ id: "42", code: "BOD-42" }))
      .mockResolvedValueOnce(Response.json({ id: "42", code: "BOD-42" }))
      .mockResolvedValueOnce(Response.json({ id: "42", isActive: false }));
    vi.stubGlobal("fetch", fetch);

    await authApi.refreshCsrf();
    await warehousesApi.list({ q: "BOD", status: "active", page: 2 });
    await warehousesApi.get("42");
    await warehousesApi.responsibles("Ana");
    await warehousesApi.create({ code: "BOD-42", name: "Principal" });
    await warehousesApi.update("42", { code: "BOD-42", name: "Central" });
    await warehousesApi.setStatus("42", false);

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/warehouses?q=BOD&status=active&page=2",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/warehouses/42",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/v1/warehouses/responsibles?q=Ana",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "/api/v1/warehouses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": csrfToken }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      6,
      "/api/v1/warehouses/42",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      7,
      "/api/v1/warehouses/42/status",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ isActive: false }),
      }),
    );
  });

  it("uses authenticated product endpoints and scopes balance filters", async () => {
    const csrfToken = "p".repeat(64);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ csrfToken }))
      .mockResolvedValueOnce(Response.json({ items: [], pagination: {} }))
      .mockResolvedValueOnce(Response.json({ id: "51", sku: "SKU-51" }))
      .mockResolvedValueOnce(Response.json({ productId: "51", items: [] }))
      .mockResolvedValueOnce(Response.json({ id: "52", sku: "SKU-52" }))
      .mockResolvedValueOnce(Response.json({ id: "51", sku: "SKU-51" }));
    vi.stubGlobal("fetch", fetch);

    await authApi.refreshCsrf();
    await productsApi.list({ q: "SKU", categoryId: "8", page: 2 });
    await productsApi.get("51");
    await productsApi.balances("51", "12");
    await productsApi.create({ sku: "SKU-52" });
    await productsApi.update("51", { sku: "SKU-51" });

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/products?q=SKU&categoryId=8&page=2",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/products/51",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/v1/products/51/balances?warehouseId=12",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "/api/v1/products",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": csrfToken }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      6,
      "/api/v1/products/51",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("uses authenticated customer and supplier routes for CRUD and status", async () => {
    const csrfToken = "c".repeat(64);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ csrfToken }))
      .mockResolvedValueOnce(Response.json({ items: [], pagination: {} }))
      .mockResolvedValueOnce(Response.json({ id: "1" }))
      .mockResolvedValueOnce(Response.json({ id: "1" }))
      .mockResolvedValueOnce(Response.json({ id: "2" }))
      .mockResolvedValueOnce(Response.json({ id: "2" }))
      .mockResolvedValueOnce(Response.json({ id: "2" }));
    vi.stubGlobal("fetch", fetch);

    await authApi.refreshCsrf();
    await customersApi.list({ q: "123", status: "active", page: 2 });
    await customersApi.get("1");
    await customersApi.update("1", { name: "Cliente" });
    await suppliersApi.create({ businessName: "Proveedor" });
    await suppliersApi.update("2", { businessName: "Proveedor actualizado" });
    await suppliersApi.setStatus("2", false);

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/customers?q=123&status=active&page=2",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/customers/1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/v1/customers/1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "/api/v1/suppliers",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      6,
      "/api/v1/suppliers/2",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      7,
      "/api/v1/suppliers/2/status",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "X-CSRF-Token": csrfToken }),
      }),
    );
  });
});
