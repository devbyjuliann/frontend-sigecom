import { expect, test } from "@playwright/test";

const token = "V".repeat(43);
const password = "Nueva-Clave-Segura-2026";
const permissionCodes = [
  "dashboard.read",
  "categories.read",
  "warehouses.read",
  "products.read",
  "inventory.read",
  "customers.read",
  "suppliers.read",
  "purchases.read",
  "sales.read",
  "users.read",
  "users.manage",
  "roles.manage",
  "permissions.manage",
  "audit.read",
  "reports.read",
  "profile.read",
];
const adminSession = {
  user: {
    id: "5",
    email: "admin@example.invalid",
    displayName: "Administradora",
    role: "administrator",
    passwordChangeRequired: false,
  },
  permissions: permissionCodes,
  warehouseIds: ["3"],
};
const roles = [
  { code: "administrator", name: "Administrador" },
  { code: "seller", name: "Vendedor" },
  { code: "warehouse", name: "Bodega" },
  { code: "auditor", name: "Auditor" },
];
const warehouse = {
  id: "3",
  code: "CENTRAL",
  name: "Bodega Central",
  isActive: true,
};
const viewports = [
  { name: "escritorio", width: 1440, height: 900 },
  { name: "portatil", width: 1280, height: 720 },
  { name: "tableta", width: 768, height: 1024 },
  { name: "movil", width: 390, height: 844 },
];

function account({
  id,
  displayName,
  email,
  credentialState,
  passwordChangeRequired,
}) {
  return {
    id,
    displayName,
    email,
    roleCode: "seller",
    roleName: "Vendedor",
    isActive: true,
    passwordChangeRequired,
    credentialState,
    warehouseCount: 1,
    visibleWarehouseCount: 1,
    canManage: true,
    revision: `account-revision-${id}-0000000000000000`,
  };
}

async function mockApi(page) {
  const state = {
    users: [
      account({
        id: "42",
        displayName: "Lucía Gómez",
        email: "lucia@example.invalid",
        credentialState: "pending_invitation",
        passwordChangeRequired: true,
      }),
      account({
        id: "43",
        displayName: "Mateo Ruiz",
        email: "mateo@example.invalid",
        credentialState: "active",
        passwordChangeRequired: false,
      }),
      account({
        id: "44",
        displayName: "Sara Díaz",
        email: "sara@example.invalid",
        credentialState: "pending_admin_reset",
        passwordChangeRequired: true,
      }),
    ],
    createAttempts: 0,
    completions: [],
    unexpected: [],
  };

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const reply = (status, body) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (path === "/api/v1/auth/me" && method === "GET") {
      return reply(200, adminSession);
    }
    if (path === "/api/v1/auth/csrf" && method === "GET") {
      return reply(200, { csrfToken: "c".repeat(64) });
    }
    if (path === "/api/v1/users/roles" && method === "GET") {
      return reply(200, { items: roles });
    }
    if (path === "/api/v1/warehouses" && method === "GET") {
      return reply(200, {
        items: [warehouse],
        pagination: { page: 1, pageSize: 10, total: 1, pageCount: 1 },
      });
    }
    if (path === "/api/v1/users" && method === "GET") {
      return reply(200, {
        items: state.users,
        pagination: {
          page: Number(url.searchParams.get("page") || 1),
          pageSize: Number(url.searchParams.get("pageSize") || 10),
          total: state.users.length,
          pageCount: 1,
        },
      });
    }
    if (/^\/api\/v1\/users\/\d+$/.test(path) && method === "GET") {
      const user = state.users.find(
        (item) => item.id === path.split("/").at(-1),
      );
      if (!user) return reply(404, { error: { message: "No encontrada." } });
      return reply(200, {
        ...user,
        assignedWarehouses: [warehouse],
        hasOutOfScopeWarehouses: false,
      });
    }
    if (path === "/api/v1/users" && method === "POST") {
      state.createAttempts += 1;
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (state.createAttempts === 1) {
        return reply(503, {
          error: {
            code: "SIMULATED_DELIVERY_FAILURE",
            message: "No fue posible completar la solicitud simulada.",
          },
        });
      }
      const input = request.postDataJSON();
      const created = account({
        id: "45",
        displayName: input.displayName,
        email: input.email,
        credentialState: "pending_invitation",
        passwordChangeRequired: true,
      });
      state.users = [...state.users, created];
      return reply(201, {
        user: created,
        invitation: { deliveryStatus: "accepted" },
      });
    }
    if (path === "/api/v1/users/42/invitation/resend" && method === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return reply(200, {
        user: state.users.find((item) => item.id === "42"),
        invitation: { deliveryStatus: "accepted" },
      });
    }
    if (path === "/api/v1/users/43/password-reset" && method === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const user = state.users.find((item) => item.id === "43");
      user.credentialState = "pending_admin_reset";
      user.passwordChangeRequired = true;
      return reply(200, {
        user,
        deliveryStatus: "accepted",
        revokedSessions: 2,
      });
    }
    if (
      [
        "/api/v1/auth/invitations/complete",
        "/api/v1/auth/admin-password-reset/complete",
      ].includes(path) &&
      method === "POST"
    ) {
      state.completions.push({ path, body: request.postDataJSON() });
      await new Promise((resolve) => setTimeout(resolve, 700));
      return reply(200, { changed: true });
    }

    state.unexpected.push(`${method} ${path}`);
    return reply(501, {
      error: {
        code: "UNEXPECTED_SIMULATED_REQUEST",
        message: "Solicitud simulada no preparada.",
      },
    });
  });

  return state;
}

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(Math.max(metrics.document, metrics.body)).toBeLessThanOrEqual(
    metrics.viewport,
  );
}

async function screenshot(page, testInfo, name) {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

for (const viewport of viewports) {
  test(`access workflows render and remain usable at ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    page.setDefaultTimeout(15_000);
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    const state = await mockApi(page);

    await page.goto("/usuarios");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#users-title")).toHaveText("Usuarios");
    await expect(page.getByRole("row", { name: /Lucía Gómez/ })).toBeVisible();
    await expect(page.getByText("Invitación pendiente")).toBeVisible();
    await expect(page.getByText("Restablecimiento pendiente")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(
      page,
      testInfo,
      `${viewport.name}-users-credential-states`,
    );

    const createButton = page.getByRole("button", { name: "Nuevo usuario" });
    await createButton.click();
    const createDialog = page.getByRole("dialog", { name: "Nuevo usuario" });
    await expect(createDialog).toBeVisible();
    await expect(page.getByLabel("Nombre completo")).toBeVisible();
    await expect(page.getByLabel("Correo electrónico")).toBeVisible();
    await expect(page.getByLabel("Rol asignado")).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /Bodega Central/ }),
    ).toBeVisible();
    const createBounds = await createDialog.boundingBox();
    expect(createBounds.x).toBeGreaterThanOrEqual(0);
    expect(createBounds.x + createBounds.width).toBeLessThanOrEqual(
      viewport.width,
    );
    await expectNoHorizontalOverflow(page);
    await screenshot(page, testInfo, `${viewport.name}-invitation-create-form`);

    await page.getByLabel("Nombre completo").fill("Nicolás Torres");
    await page.getByLabel("Correo electrónico").fill("nicolas@example.invalid");
    await page.getByRole("checkbox", { name: /Bodega Central/ }).check();
    await page.getByRole("button", { name: "Crear usuario" }).click();
    await expect(
      page.getByRole("alert").filter({
        hasText: "No fue posible completar la solicitud simulada.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Nuevo usuario" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Crear usuario" }).click();
    await expect(
      page.getByRole("button", { name: "Guardando…" }),
    ).toBeDisabled();
    await expect(page.getByRole("status")).toHaveText(
      "Cuenta creada. Invitación enviada al correo registrado.",
    );
    await expectNoHorizontalOverflow(page);
    await screenshot(page, testInfo, `${viewport.name}-invitation-created`);

    await page
      .getByRole("button", { name: "Reenviar invitación a Lucía Gómez" })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "Invitación enviada por correo.",
    );

    await page
      .getByRole("button", {
        name: "Restablecer contraseña de Mateo Ruiz",
      })
      .click();
    const resetDialog = page.getByRole("dialog", {
      name: "Restablecer contraseña",
    });
    await expect(resetDialog).toBeVisible();
    await expect(resetDialog).toContainText("El enlace vence en 30 minutos.");
    const resetBounds = await resetDialog.boundingBox();
    expect(resetBounds.x).toBeGreaterThanOrEqual(0);
    expect(resetBounds.x + resetBounds.width).toBeLessThanOrEqual(
      viewport.width,
    );
    await expectNoHorizontalOverflow(page);
    await screenshot(page, testInfo, `${viewport.name}-admin-reset-confirm`);
    await page
      .getByRole("button", { name: "Confirmar restablecimiento" })
      .click();
    await expect(
      page.getByRole("button", { name: "Restableciendo…" }),
    ).toBeDisabled();
    await expect(page.getByRole("status")).toHaveText(
      "Enlace de restablecimiento enviado al correo registrado.",
    );
    await expect(page.getByRole("row", { name: /Mateo Ruiz/ })).toContainText(
      "Restablecimiento pendiente",
    );
    await expectNoHorizontalOverflow(page);
    await screenshot(page, testInfo, `${viewport.name}-admin-reset-sent`);

    await page.goto(`/aceptar-invitacion#token=${token}`);
    await expect(
      page.getByRole("heading", { name: "Activa tu cuenta" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/aceptar-invitacion$/);
    await expect(
      page.getByLabel("Nueva contraseña", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Confirmar nueva contraseña", { exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(
      page,
      testInfo,
      `${viewport.name}-invitation-password-form`,
    );
    await page.getByLabel("Nueva contraseña", { exact: true }).fill("corta");
    await page
      .getByLabel("Confirmar nueva contraseña", { exact: true })
      .fill("distinta");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByText("Usa al menos 12 caracteres.")).toBeVisible();
    await expect(
      page.getByText("La confirmación no coincide con la nueva contraseña."),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(
      page,
      testInfo,
      `${viewport.name}-invitation-validation-errors`,
    );

    await page.goto(
      `/restablecer-contrasena?modo=administrativo#token=${token}`,
    );
    await expect(
      page.getByRole("heading", { name: "Establecer contraseña" }),
    ).toBeVisible();
    await expect(
      page.getByText("Restablecimiento administrativo"),
    ).toBeVisible();
    await expect(
      page.getByLabel("Nueva contraseña", { exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await screenshot(page, testInfo, `${viewport.name}-admin-password-form`);

    expect(state.createAttempts).toBe(2);
    expect(state.completions).toEqual([]);
    expect(state.unexpected).toEqual([]);
  });
}

for (const flow of [
  {
    name: "invitation",
    path: `/aceptar-invitacion#token=${token}`,
    endpoint: "/api/v1/auth/invitations/complete",
    heading: "Cuenta activada",
  },
  {
    name: "administrative reset",
    path: `/restablecer-contrasena?modo=administrativo#token=${token}`,
    endpoint: "/api/v1/auth/admin-password-reset/complete",
    heading: "Acceso restablecido",
  },
]) {
  test(`${flow.name} completion submits and confirms at 1280×720`, async ({
    page,
  }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(flow.path);
    await expect(
      page.getByLabel("Nueva contraseña", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Nueva contraseña", { exact: true }).fill(password);
    await page
      .getByLabel("Confirmar nueva contraseña", { exact: true })
      .fill(password);
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(
      page.getByRole("heading", { name: flow.heading }),
    ).toBeVisible();
    expect(state.completions.map(({ path }) => path)).toEqual([flow.endpoint]);
    expect(state.unexpected).toEqual([]);
  });
}
