import { afterEach, describe, expect, it, vi } from "vitest";
import { authApi } from "./auth-api.js";

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
});
