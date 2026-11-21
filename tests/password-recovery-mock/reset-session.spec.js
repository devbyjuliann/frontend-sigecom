import { expect, test } from "@playwright/test";

const token = "R".repeat(43); // Synthetic token; never use a real recovery link here.
const password = "Nueva-Clave-Segura-2026";
const account = (id) => ({
  user: {
    id,
    name: `Cuenta ${id}`,
    email: `${id}@example.invalid`,
    role: "administrator",
    passwordChangeRequired: false,
  },
  permissions: ["dashboard.read"],
  warehouseIds: ["warehouse-A"],
});

async function mockApi(
  page,
  {
    currentAccount = account("A"),
    completeStatus = 200,
    expectedToken = token,
  } = {},
) {
  const calls = {
    completion: 0,
    login: 0,
    submittedExpectedToken: false,
    unexpected: [],
  };
  let session = currentAccount;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const reply = (status, body) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (path === "/api/v1/auth/me" && request.method() === "GET") {
      return session
        ? reply(200, session)
        : reply(401, {
            error: { code: "SESSION_INVALID", message: "Sesión vencida." },
          });
    }
    if (path === "/api/v1/auth/csrf" && request.method() === "GET") {
      return reply(200, { csrfToken: "c".repeat(64) });
    }
    if (
      path === "/api/v1/auth/password-recovery/complete" &&
      request.method() === "POST"
    ) {
      calls.completion += 1;
      calls.submittedExpectedToken =
        JSON.parse(request.postData()).token === expectedToken;
      if (completeStatus === 200) {
        session = null;
        return reply(200, { changed: true });
      }
      return reply(completeStatus, {
        error: {
          code:
            completeStatus === 410
              ? "PASSWORD_RECOVERY_LINK_INVALID"
              : "RECOVERY_UNAVAILABLE",
          message: "No fue posible actualizar la contraseña.",
        },
      });
    }
    if (path === "/api/v1/auth/login" && request.method() === "POST") {
      calls.login += 1;
      session = account("B");
      return reply(200, { user: session.user, csrfToken: "b".repeat(64) });
    }
    calls.unexpected.push(`${request.method()} ${path}`);
    return reply(501, {
      error: { code: "UNEXPECTED_REQUEST", message: "Unexpected request." },
    });
  });
  return calls;
}

async function openReset(page) {
  await page.goto(`/restablecer-contrasena#token=${token}`);
  await expect(
    page.getByRole("heading", { name: "Establecer contraseña" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/restablecer-contrasena$/);
}

async function submitReset(page) {
  await page.getByLabel("Nueva contraseña", { exact: true }).fill(password);
  await page
    .getByLabel("Confirmar nueva contraseña", { exact: true })
    .fill(password);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
}

test("A/F: HTTP 200 with an authenticated session keeps the success screen through the scope change", async ({
  page,
}) => {
  const calls = await mockApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReset(page);
  const completion = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        "/api/v1/auth/password-recovery/complete" && response.status() === 200,
  );
  await submitReset(page);
  await completion;
  await expect(
    page.getByRole("heading", { name: "Contraseña actualizada" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Solicita un enlace nuevo" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Verificando sesión" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Volver a iniciar sesión" }),
  ).toHaveAttribute("href", "/ingresar");
  await page.screenshot({
    path: "test-results/password-recovery-mock/success-1440x900.png",
  });
  expect(calls.completion).toBe(1);
  expect(calls.unexpected).toEqual([]);
});

test("B: anonymous recovery also retains the success screen", async ({
  page,
}) => {
  const calls = await mockApi(page, { currentAccount: null });
  await openReset(page);
  await submitReset(page);
  await expect(
    page.getByRole("heading", { name: "Contraseña actualizada" }),
  ).toBeVisible();
  expect(calls.completion).toBe(1);
  expect(calls.unexpected).toEqual([]);
});

test("C/G/I/J: return to Login does not restore the old session or reveal the link, and a different identity can sign in", async ({
  page,
}) => {
  const calls = await mockApi(page);
  await openReset(page);
  await submitReset(page);
  await expect(
    page.getByRole("heading", { name: "Contraseña actualizada" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Volver a iniciar sesión" }).click();
  await expect(
    page.getByRole("heading", { name: "Iniciar sesión" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/ingresar$/);
  await expect(
    page.getByRole("heading", { name: "Contraseña actualizada" }),
  ).toHaveCount(0);
  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    hash: window.location.hash,
  }));
  expect(storage).toEqual({ local: [], session: [], hash: "" });
  await page.getByLabel("Correo electrónico").fill("B@example.invalid");
  await page.getByRole("textbox", { name: "Contraseña" }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  expect(calls.login).toBe(1);
});

for (const status of [400, 500]) {
  test(`D/H: HTTP ${status} never shows success and keeps the reset form available`, async ({
    page,
  }) => {
    const calls = await mockApi(page, { completeStatus: status });
    await openReset(page);
    await submitReset(page);
    await expect(page.getByRole("alert")).toHaveText(
      "No fue posible actualizar la contraseña.",
    );
    await expect(
      page.getByRole("heading", { name: "Contraseña actualizada" }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Nueva contraseña", { exact: true }),
    ).toBeVisible();
    expect(calls.completion).toBe(1);
  });
}

test("E: an invalid or consumed link returns only the safe expired-link state", async ({
  page,
}) => {
  const calls = await mockApi(page, { completeStatus: 410 });
  await openReset(page);
  await submitReset(page);
  await expect(
    page.getByRole("heading", { name: "Solicita un enlace nuevo" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Contraseña actualizada" }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Nueva contraseña", { exact: true }),
  ).toHaveCount(0);
  expect(calls.completion).toBe(1);
});

test("J: absent or malformed tokens cannot submit a password", async ({
  page,
}) => {
  const calls = await mockApi(page, { currentAccount: null });
  await page.goto("/restablecer-contrasena#token=invalid");
  await expect(
    page.getByRole("heading", { name: "Solicita un enlace nuevo" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/restablecer-contrasena$/);
  await expect(
    page.getByLabel("Nueva contraseña", { exact: true }),
  ).toHaveCount(0);
  expect(calls.completion).toBe(0);
});

test("J: navigating to another recovery link on the mounted route strips the new fragment", async ({
  page,
}) => {
  const nextToken = "S".repeat(43);
  const calls = await mockApi(page, { expectedToken: nextToken });
  await openReset(page);
  await page.evaluate((hash) => {
    const state = window.history.state || {};
    window.history.pushState(
      {
        ...state,
        key: "second-recovery-link",
        idx: (state.idx ?? 0) + 1,
      },
      "",
      `${window.location.pathname}${window.location.search}${hash}`,
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `#token=${nextToken}`);
  await expect(page).toHaveURL(/\/restablecer-contrasena$/);
  await expect(
    page.getByRole("heading", { name: "Establecer contraseña" }),
  ).toBeVisible();
  await submitReset(page);
  await expect(
    page.getByRole("heading", { name: "Contraseña actualizada" }),
  ).toBeVisible();
  expect(calls.completion).toBe(1);
  expect(calls.submittedExpectedToken).toBe(true);
});

test("J: back and forward do not resurrect either recovery token", async ({
  page,
}) => {
  const nextToken = "T".repeat(43);
  await mockApi(page);
  await page.goto("/ingresar");
  await openReset(page);
  await page.evaluate((hash) => {
    const state = window.history.state || {};
    window.history.pushState(
      {
        ...state,
        key: "second-recovery-link",
        idx: (state.idx ?? 0) + 1,
      },
      "",
      `${window.location.pathname}${window.location.search}${hash}`,
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `#token=${nextToken}`);
  await expect(page).toHaveURL(/\/restablecer-contrasena$/);
  await expect(
    page.getByRole("heading", { name: "Establecer contraseña" }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/restablecer-contrasena$/);
  await expect(
    page.getByRole("heading", { name: "Solicita un enlace nuevo" }),
  ).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/restablecer-contrasena$/);
  await expect(
    page.getByRole("heading", { name: "Solicita un enlace nuevo" }),
  ).toBeVisible();
  expect(await page.locator("#new-password").count()).toBe(0);
});

test("recovery layout has no horizontal overflow at the approved viewport sizes", async ({
  page,
}) => {
  await mockApi(page);
  await openReset(page);
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `test-results/password-recovery-mock/recovery-form-${width}x${height}.png`,
    });
  }
});
