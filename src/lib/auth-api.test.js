import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authApi,
  categoriesApi,
  customersApi,
  dashboardApi,
  productsApi,
  purchasesApi,
  rolesApi,
  salesApi,
  suppliersApi,
  usersApi,
  warehousesApi,
} from "./auth-api.js";

describe("rolesApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reads role permissions and submits an explicit reviewed update", async () => {
    const csrfToken = "r".repeat(64);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ csrfToken }))
      .mockResolvedValueOnce(Response.json({ changed: true }));
    vi.stubGlobal("fetch", fetch);
    await rolesApi.updatePermissions("seller", {
      expectedRevision: "revision-token-1234567890",
      configurablePermissionCodes: ["sales.read"],
      confirmChange: true,
    });
    expect(fetch.mock.calls.at(-1)[0]).toBe("/api/v1/roles/seller/permissions");
    expect(fetch.mock.calls.at(-1)[1]).toMatchObject({
      method: "PATCH",
      headers: expect.objectContaining({ "X-CSRF-Token": csrfToken }),
    });
  });
});

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

  it("requests recovery through the CSRF-protected endpoint without persisting account data", async () => {
    const csrfToken = "h".repeat(64);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ csrfToken }))
      .mockResolvedValueOnce(
        Response.json(
          {
            accepted: true,
            message:
              "Si la cuenta está activa, enviaremos instrucciones al correo registrado.",
          },
          { status: 202 },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await authApi.refreshCsrf();
    await expect(
      authApi.requestPasswordRecovery("ana@sigecom.co"),
    ).resolves.toMatchObject({ accepted: true });

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/auth/password-recovery",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": csrfToken }),
        body: JSON.stringify({ email: "ana@sigecom.co" }),
      }),
    );
    expect(setItem).not.toHaveBeenCalled();
  });

  it("submits a recovery token once and clears only the in-memory CSRF value after success", async () => {
    const csrfToken = "i".repeat(64);
    const token = "R".repeat(43);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ csrfToken }))
      .mockResolvedValueOnce(Response.json({ changed: true }))
      .mockResolvedValueOnce(Response.json({ csrfToken: "j".repeat(64) }))
      .mockResolvedValueOnce(
        Response.json({ accepted: true }, { status: 202 }),
      );
    vi.stubGlobal("fetch", fetch);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await authApi.refreshCsrf();
    await expect(
      authApi.completePasswordRecovery({
        token,
        newPassword: "Nueva-Clave-Segura-2026",
        confirmPassword: "Nueva-Clave-Segura-2026",
      }),
    ).resolves.toEqual({ changed: true });
    await authApi.requestPasswordRecovery("ana@sigecom.co");

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/auth/password-recovery/complete",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": csrfToken }),
        body: JSON.stringify({
          token,
          newPassword: "Nueva-Clave-Segura-2026",
          confirmPassword: "Nueva-Clave-Segura-2026",
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/auth/csrf",
      expect.objectContaining({ method: "GET" }),
    );
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("submits invitation acceptance and administrative password reset only with CSRF", async () => {
    const firstCsrf = "a".repeat(64);
    const secondCsrf = "b".repeat(64);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: firstCsrf }))
      .mockResolvedValueOnce(Response.json({ changed: true }))
      .mockResolvedValueOnce(Response.json({ csrfToken: secondCsrf }))
      .mockResolvedValueOnce(Response.json({ changed: true }))
      .mockResolvedValueOnce(Response.json({ csrfToken: "c".repeat(64) }))
      .mockResolvedValueOnce(Response.json({ user: {}, invitation: {} }));
    vi.stubGlobal("fetch", fetch);
    const credentialInput = {
      token: "I".repeat(43),
      newPassword: "Nueva-Clave-Segura-2026",
      confirmPassword: "Nueva-Clave-Segura-2026",
    };

    await authApi.refreshCsrf();
    await authApi.completeInvitation(credentialInput);
    await authApi.refreshCsrf();
    await authApi.completeAdminPasswordReset(credentialInput);
    await usersApi.resendInvitation("42", {
      expectedRevision: "revision-token-1234567890",
      confirmResend: true,
    });

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/auth/invitations/complete",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": firstCsrf }),
        body: JSON.stringify(credentialInput),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/v1/auth/admin-password-reset/complete",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": secondCsrf }),
      }),
    );
    expect(fetch.mock.calls.at(-1)[0]).toBe(
      "/api/v1/users/42/invitation/resend",
    );
    expect(fetch.mock.calls.at(-1)[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ "X-CSRF-Token": "c".repeat(64) }),
    });
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

  it("fetches dashboard summary without adding query parameters or caching credentials", async () => {
    const payload = {
      indicators: {
        activeProducts: { available: true, value: 0 },
        customers: { available: false, value: null },
        suppliers: { available: false, value: null },
        accessibleWarehouses: { available: true, value: 0 },
      },
      productsByCategory: { available: true, items: [] },
    };
    const fetch = vi.fn().mockResolvedValue(Response.json(payload));
    vi.stubGlobal("fetch", fetch);

    await expect(dashboardApi.get()).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/dashboard",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });
});

describe("salesApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses separate draft and confirmed-sale reversal routes with CSRF and idempotency", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "s".repeat(64) }))
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(Response.json({ id: "4" }))
      .mockResolvedValueOnce(Response.json({ id: "4" }))
      .mockResolvedValueOnce(Response.json({ id: "4" }))
      .mockResolvedValueOnce(Response.json({ id: "4" }))
      .mockResolvedValueOnce(Response.json({ id: "4" }))
      .mockResolvedValueOnce(
        Response.json({ sale: { id: "4" }, reversal: { id: "9" } }),
      )
      .mockResolvedValueOnce(Response.json({ id: "9" }));
    vi.stubGlobal("fetch", fetch);

    await authApi.refreshCsrf();
    await salesApi.list({ page: 2, status: "draft", warehouseId: "8" });
    await salesApi.get("4");
    await salesApi.create({ customerId: "2" }, "sale-create-key");
    await salesApi.update("4", { expectedVersion: 1 }, "sale-update-key");
    await salesApi.cancel(
      "4",
      { expectedVersion: 2, reason: "Solicitud cliente" },
      "sale-cancel-key",
    );
    await salesApi.confirm("4", { expectedVersion: 2 }, "sale-confirm-key");
    const reversalInput = {
      expectedVersion: 3,
      reason: "No salió",
      reference: "ACTA-4",
      physicalObservation: "Conteo físico.",
      neverDispatched: true,
      allQuantitiesPresent: true,
      allProductsSaleable: true,
    };
    await salesApi.reverse("4", reversalInput, "sale-reversal-key");
    await salesApi.getReversal("4");
    expect(salesApi.reversalPdfUrl("4")).toBe("/api/v1/sales/4/reversal/pdf");

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/sales?page=2&status=draft&warehouseId=8",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/sales/4",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "/api/v1/sales/4",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          "Idempotency-Key": "sale-update-key",
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      6,
      "/api/v1/sales/4/cancellation",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "sale-cancel-key",
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      7,
      "/api/v1/sales/4/confirmation",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ expectedVersion: 2 }),
        headers: expect.objectContaining({
          "Idempotency-Key": "sale-confirm-key",
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      8,
      "/api/v1/sales/4/reversal",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(reversalInput),
        headers: expect.objectContaining({
          "X-CSRF-Token": "s".repeat(64),
          "Idempotency-Key": "sale-reversal-key",
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      9,
      "/api/v1/sales/4/reversal",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("posts and reads customer returns through the sale-scoped routes", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "r".repeat(64) }))
      .mockResolvedValueOnce(Response.json({ saleId: "4", items: [] }))
      .mockResolvedValueOnce(Response.json({ id: "17" }))
      .mockResolvedValueOnce(Response.json({ id: "17" }));
    vi.stubGlobal("fetch", fetch);
    await authApi.refreshCsrf();
    await salesApi.returns("4");
    const input = {
      expectedVersion: 8,
      reference: "DEV-17",
      reason: "Recepción e inspección",
      physicalObservation: "Conteo cotejado.",
      receivedPhysical: true,
      inspected: true,
      lines: [
        {
          saleLineId: "9",
          quantityReceived: 2,
          quantityRestocked: 1,
          nonRestockReason: "Empaque abierto",
        },
      ],
    };
    await salesApi.createReturn("4", input, "customer-return-key");
    await salesApi.returnDocument("4", "17");
    expect(salesApi.returnPdfUrl("4", "17")).toBe(
      "/api/v1/sales/4/returns/17/pdf",
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/sales/4/returns",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
        headers: expect.objectContaining({
          "X-CSRF-Token": "r".repeat(64),
          "Idempotency-Key": "customer-return-key",
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/v1/sales/4/returns/17",
      expect.objectContaining({ method: "GET" }),
    );
  });
});

describe("purchasesApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("serializes purchase-order filters and targets the order resource", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ items: [] }));
    vi.stubGlobal("fetch", fetch);

    await purchasesApi.list({ page: 2, q: "OC-15", status: "confirmed" });
    await purchasesApi.get("15");

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/purchase-orders?page=2&q=OC-15&status=confirmed",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/purchase-orders/15",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("closes purchase pending quantities through the CSRF and idempotency headers", async () => {
    const input = {
      expectedVersion: 4,
      reason: "Proveedor no entregará el saldo",
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ csrfToken: "k".repeat(64) }, { status: 200 }),
      )
      .mockResolvedValueOnce(Response.json({ id: "15", closure: {} }));
    vi.stubGlobal("fetch", fetch);

    await authApi.refreshCsrf();
    await purchasesApi.close("15", input, "closure-retry-key");

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/purchase-orders/15/closure",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          "X-CSRF-Token": "k".repeat(64),
          "Idempotency-Key": "closure-retry-key",
        }),
        body: JSON.stringify(input),
      }),
    );
  });

  it("creates a receipt-linked supplier return with its idempotency key", async () => {
    const input = {
      reference: "DEV-42",
      reason: "Empaque averiado",
      lines: [{ purchaseReceiptLineId: "31", quantity: 2 }],
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "r".repeat(64) }))
      .mockResolvedValueOnce(Response.json({ id: "55" }))
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(Response.json({ id: "55" }));
    vi.stubGlobal("fetch", fetch);

    await authApi.refreshCsrf();
    await purchasesApi.createReturn("15", "21", input, "return-key");
    await purchasesApi.returns("15");
    await purchasesApi.returnDocument("15", "55");

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/purchase-orders/15/receipts/21/returns",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Idempotency-Key": "return-key" }),
        body: JSON.stringify(input),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/purchase-orders/15/returns",
      expect.anything(),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/v1/purchase-orders/15/returns/55",
      expect.anything(),
    );
  });
});
